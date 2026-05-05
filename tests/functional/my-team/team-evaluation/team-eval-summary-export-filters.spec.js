// tests/functional/my-team/team-evaluation/team-eval-summary-export-filters.spec.js
import { test, expect } from "../../../fixtures/auth.js";
import { SideMenu } from "../../../../pages/SideMenu.js";
import { MyTeamPage } from "../../../../pages/MyTeamPage.js";
import { PerformanceReviewAPI } from "../../../utils/api/PerformanceReviewAPI.js";
import { getCredentials } from "../../../utils/credentials.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";
import { saveDownload } from "../../../utils/xlsx-helpers.js";
import { PPTXParser } from "../../../utils/report-parsers/PPTXParser.js";
import { PerformanceReviewSeedHelper } from "../../../utils/seed/PerformanceReviewSeedHelper.js";

const pptxParser = new PPTXParser();

/** ID PR созданного seed'ом в beforeAll — для приоритизации при поиске */
let seededPrId = null;

/** Кешированные данные для тестов C7377/C7474 */
let cachedPRData = null;

/**
 * Ищет PR с данными: >1 слайд в PPTX и >1 target users.
 * Приоритизирует seededPrId (если задан).
 * Возвращает { pr, pptxResult, targetUsers, myTeamPage } или null.
 */
async function findPRWithData(page, request, testInfo) {
  if (cachedPRData) return cachedPRData;

  const prAPI = new PerformanceReviewAPI(request);
  const { email, password } = getCredentials("admin");
  await prAPI.signIn(email, password);

  const { data: prs } = await prAPI.getDashboardFiltersPerformanceReviews();
  let prList = Array.isArray(prs) ? prs : prs?.items || prs?.results || [];

  if (prList.length === 0) return null;

  // Приоритизируем seeded PR — ставим его первым в списке
  if (seededPrId) {
    const seededIdx = prList.findIndex((p) => p.id === seededPrId || String(p.id) === String(seededPrId));
    if (seededIdx > 0) {
      const [seededPR] = prList.splice(seededIdx, 1);
      prList = [seededPR, ...prList];
      console.log(`[findPRWithData] Seeded PR (id=${seededPrId}) поставлен первым`);
    } else if (seededIdx === -1) {
      console.log(`[findPRWithData] Seeded PR (id=${seededPrId}) не найден в списке dashboard filters`);
    }
  }

  const sideMenu = new SideMenu(page, testInfo);
  const myTeamPage = new MyTeamPage(page, testInfo);

  await sideMenu.openMyTeam();
  await myTeamPage.assertOpened();

  const maxPRsToTry = Math.min(prList.length, 5);
  for (let i = 0; i < maxPRsToTry; i++) {
    const pr = prList[i];
    const prTitle = pr.title || pr.name || "";

    if (i > 0) {
      await myTeamPage.selectPRFromModal(prTitle);
    }

    // Проверяем target users
    const { data: users } = await prAPI.getDashboardFiltersTargetUsers(
      pr.id,
      { limit: 100 },
    );
    const userList =
      users?.items || users?.results || (Array.isArray(users) ? users : []);
    if (userList.length <= 1) {
      console.log(
        `PR[${i}]: "${prTitle}" → ${userList.length} target users, пропускаем`,
      );
      continue;
    }

    // Скачиваем PPTX
    let result;
    try {
      const download = await myTeamPage.downloadSummaryReport();
      const filePath = await saveDownload(download, `filter_search_${i}`);
      result = await pptxParser.parse(filePath);
    } catch (e) {
      console.log(
        `PR[${i}]: "${prTitle}" → ошибка скачивания: ${e.message}`,
      );
      continue;
    }

    console.log(
      `PR[${i}]: "${prTitle}" → ${result.total} слайдов, ${userList.length} target users`,
    );

    if (result.total > 1) {
      console.log(
        `Выбран PR: "${prTitle}" (ID=${pr.id}), ${userList.length} target users, ${result.total} слайдов`,
      );
      cachedPRData = { pr, pptxResult: result, targetUsers: userList, prAPI, myTeamPage, sideMenu };
      return cachedPRData;
    }
  }

  return null;
}

test.describe(
  "Оценка команды — влияние фильтров на сводный отчёт",
  { tag: ["@ui", "@my-team", "@regression"] },
  () => {

    test.beforeAll(async ({ request }) => {
      test.setTimeout(180_000);
      // Сбрасываем кеш между запусками
      seededPrId = null;
      cachedPRData = null;

      const seed = new PerformanceReviewSeedHelper(request);
      await seed.init("admin");

      // Тесты фильтров требуют PR с >1 target users и заполненными анкетами
      // forceCreate=true — существующие seed PR могут быть без анкет
      const found = await seed.findOrCreatePRWithMultipleTargetUsers(2, { forceCreate: true });
      console.log(
        `[beforeAll] PR для фильтров: id=${found.prId}, targetUsers=${found.targetUsersCount}`,
      );

      // Заполняем анкеты и останавливаем
      const filled = await seed.fillQuestionnaires(found.prId);
      console.log(`[beforeAll] Заполнено анкет: ${filled}`);
      const { response } = await seed.prAPI.stop(found.prId);
      if (!response.ok()) {
        console.warn("[beforeAll] Не удалось остановить PR:", await response.text());
      }

      // Сохраняем ID для приоритизации в findPRWithData
      seededPrId = found.prId;
      console.log(`[beforeAll] seededPrId=${seededPrId} (будет приоритизирован в тестах)`);
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.MY_TEAM);
    });

    test(
      "C7376: Смена PR в фильтре меняет содержимое PPTX",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }, testInfo) => {
        setSeverity("critical");

        const sideMenu = new SideMenu(page, testInfo);
        const myTeamPage = new MyTeamPage(page, testInfo);

        const prAPI = new PerformanceReviewAPI(request);
        const { email, password } = getCredentials("admin");
        await prAPI.signIn(email, password);
        const { data: prs } =
          await prAPI.getDashboardFiltersPerformanceReviews();
        const prList =
          prs?.items || prs?.results || (Array.isArray(prs) ? prs : []);

        if (prList.length < 2) {
          throw new Error(
            `Нужно минимум 2 PR для теста, найдено: ${prList.length}`,
          );
        }

        await test.step("Открыть «Моя команда»", async () => {
          await sideMenu.openMyTeam();
          await myTeamPage.assertOpened();
        });

        let pptx1Text = "";
        let pptx1FileName = "";

        await test.step("Скачать отчёт с первым PR (по умолчанию)", async () => {
          const download = await myTeamPage.downloadSummaryReport();
          pptx1FileName = download.suggestedFilename();
          const filePath = await saveDownload(download, "filter_pr1");
          const result = await pptxParser.parse(filePath);
          pptx1Text = result.text;
          console.log(
            `✓ PR1: файл="${pptx1FileName}", ${result.total} слайдов`,
          );
        });

        await test.step("Переключить на другой PR", async () => {
          // Используем второй PR из списка
          const secondPR = prList[1];
          const prTitle = secondPR.title || secondPR.name || "";
          console.log(
            `✓ Переключаемся на PR: "${prTitle}" (ID=${secondPR.id})`,
          );
          await myTeamPage.selectPRFromModal(prTitle);
        });

        let pptx2Text = "";
        let pptx2FileName = "";

        await test.step("Скачать отчёт со вторым PR", async () => {
          const download = await myTeamPage.downloadSummaryReport();
          pptx2FileName = download.suggestedFilename();
          const filePath = await saveDownload(download, "filter_pr2");
          const result = await pptxParser.parse(filePath);
          pptx2Text = result.text;
          console.log(
            `✓ PR2: файл="${pptx2FileName}", ${result.total} слайдов`,
          );
        });

        await test.step("Проверить, что файлы отличаются", async () => {
          // Имена файлов должны отличаться (содержат название PR)
          expect(
            pptx1FileName,
            "Имена файлов для разных PR должны отличаться",
          ).not.toBe(pptx2FileName);

          // Тексты должны отличаться (разные PR → разное содержимое)
          const textsMatch =
            pptx1Text.replace(/\s+/g, "") === pptx2Text.replace(/\s+/g, "");
          expect(
            textsMatch,
            `Тексты PPTX для разных PR должны отличаться.\nPR1: "${pptx1Text.substring(0, 100)}"\nPR2: "${pptx2Text.substring(0, 100)}"`,
          ).toBeFalsy();
        });
      },
    );

    test(
      "C7377: Фильтр «Результаты для» влияет на содержимое PPTX",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }, testInfo) => {
        test.slow();
        setSeverity("critical");

        let myTeamPage;
        let pptxAllText = "";
        let pptxAllSlides = 0;

        await test.step("Найти PR с данными (>1 слайд, >1 target users)", async () => {
          const found = await findPRWithData(page, request, testInfo);
          if (!found) {
            throw new Error(
              "Не найден PR с заполненными анкетами (>1 слайд PPTX) и >1 target users — beforeAll должен был создать seed",
            );
          }
          myTeamPage = found.myTeamPage;
          pptxAllText = found.pptxResult.text;
          pptxAllSlides = found.pptxResult.total;
          console.log(
            `Все: ${pptxAllSlides} слайдов, ${pptxAllText.length} символов`,
          );
        });

        const count = await myTeamPage.getEmployeesCount();
        console.log(`Сотрудников в UI: ${count}`);
        if (count < 2) {
          throw new Error(
            `В UI таблице ${count} сотрудников — seed должен был обеспечить 2+ target users`,
          );
        }

        const employeeName = await myTeamPage.getEmployeeNameByIndex(0);
        console.log(`Фильтруем по: "${employeeName}"`);

        await test.step(`Отфильтровать по «${employeeName}»`, async () => {
          await myTeamPage.openResultsForModal();
          await myTeamPage.selectItemInResultsForModal(employeeName);
          await myTeamPage.applyResultsForFilter();
        });

        let pptxFilteredText = "";
        let pptxFilteredSlides = 0;

        await test.step("Скачать отчёт для одного сотрудника", async () => {
          const download = await myTeamPage.downloadSummaryReport();
          const filePath = await saveDownload(download, "filter_one");
          const result = await pptxParser.parse(filePath);
          pptxFilteredText = result.text;
          pptxFilteredSlides = result.total;
          console.log(
            `Фильтр: ${result.total} слайдов, ${result.text.length} символов`,
          );
        });

        await test.step("Проверить, что отчёты отличаются", async () => {
          const allCompact = pptxAllText.replace(/\s+/g, "");
          const filteredCompact = pptxFilteredText.replace(/\s+/g, "");

          console.log(
            `Все: ${pptxAllSlides} слайдов, ${allCompact.length} символов`,
          );
          console.log(
            `Фильтр: ${pptxFilteredSlides} слайдов, ${filteredCompact.length} символов`,
          );

          expect(
            allCompact === filteredCompact,
            `Отчёт для «${employeeName}» (${pptxFilteredSlides} сл.) должен отличаться от отчёта для всех (${pptxAllSlides} сл.)`,
          ).toBeFalsy();
        });
      },
    );

    test(
      "C7474: Сброс фильтра «Результаты для» возвращает исходный PPTX",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }, testInfo) => {
        test.slow();
        setSeverity("critical");

        let myTeamPage;
        let pptxOriginalText = "";
        let pptxOriginalSlides = 0;

        await test.step("Найти PR с данными (>1 слайд, >1 target users)", async () => {
          const found = await findPRWithData(page, request, testInfo);
          if (!found) {
            throw new Error(
              "Не найден PR с заполненными анкетами (>1 слайд PPTX) и >1 target users — beforeAll должен был создать seed",
            );
          }
          myTeamPage = found.myTeamPage;
          pptxOriginalText = found.pptxResult.text;
          pptxOriginalSlides = found.pptxResult.total;
          console.log(
            `Исходный: ${pptxOriginalSlides} слайдов, ${pptxOriginalText.length} символов`,
          );
        });

        const count = await myTeamPage.getEmployeesCount();
        if (count < 2) {
          throw new Error(
            `В UI таблице ${count} сотрудников — seed должен был обеспечить 2+ target users`,
          );
        }

        const employeeName = await myTeamPage.getEmployeeNameByIndex(0);

        await test.step(`Применить фильтр по «${employeeName}»`, async () => {
          await myTeamPage.openResultsForModal();
          await myTeamPage.selectItemInResultsForModal(employeeName);
          await myTeamPage.applyResultsForFilter();
        });

        await test.step(`Сбросить фильтр — снять выделение с «${employeeName}»`, async () => {
          await myTeamPage.openResultsForModal();
          await myTeamPage.selectItemInResultsForModal(employeeName);
          await myTeamPage.applyResultsForFilter();
          const modal = myTeamPage.getResultsForModal();
          const stillVisible = await modal.isVisible();
          if (stillVisible) {
            await myTeamPage.closeResultsForModal();
          }
        });

        let pptxAfterResetSlides = 0;
        let pptxAfterResetText = "";

        await test.step("Скачать отчёт после сброса", async () => {
          const download = await myTeamPage.downloadSummaryReport();
          const filePath = await saveDownload(download, "reset_after");
          const result = await pptxParser.parse(filePath);
          pptxAfterResetSlides = result.total;
          pptxAfterResetText = result.text;
          console.log(
            `После сброса: ${result.total} слайдов, ${result.text.length} символов`,
          );
        });

        await test.step("Проверить, что отчёт вернулся к исходному", async () => {
          expect(
            pptxAfterResetSlides,
            `Количество слайдов после сброса (${pptxAfterResetSlides}) должно совпадать с исходным (${pptxOriginalSlides})`,
          ).toBe(pptxOriginalSlides);

          const originalLen = pptxOriginalText.replace(/\s+/g, "").length;
          const afterLen = pptxAfterResetText.replace(/\s+/g, "").length;
          const diff = Math.abs(originalLen - afterLen);
          const tolerance = Math.max(originalLen, afterLen) * 0.1;

          console.log(
            `Длина текста: исходный=${originalLen}, после сброса=${afterLen}, разница=${diff}, допуск=${Math.round(tolerance)}`,
          );

          expect(
            diff,
            `Длина текста после сброса (${afterLen}) должна быть близка к исходной (${originalLen}), разница ${diff} > допуск ${Math.round(tolerance)}`,
          ).toBeLessThanOrEqual(tolerance);
        });
      },
    );
  },
);
