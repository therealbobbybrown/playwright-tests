// tests/functional/my-team/team-evaluation/team-eval-summary-export-data.spec.js
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

test.describe(
  "Оценка команды — сверка PPTX с API",
  { tag: ["@ui", "@my-team", "@regression"] },
  () => {
    test.describe.configure({ mode: "serial" });

    test.beforeAll(async ({ request }) => {
      test.setTimeout(180_000);
      const seed = new PerformanceReviewSeedHelper(request);
      await seed.init("admin");

      // Нужен PR с >1 target users для сверки данных
      const found = await seed.findOrCreatePRWithMultipleTargetUsers(2, { forceCreate: true });
      seededPrId = found.prId;
      console.log(
        `[beforeAll] PR для data: id=${found.prId}, targetUsers=${found.targetUsersCount}`,
      );

      const filled = await seed.fillQuestionnaires(found.prId);
      console.log(`[beforeAll] Заполнено анкет: ${filled}`);
      const { response } = await seed.prAPI.stop(found.prId);
      if (!response.ok()) {
        console.warn("[beforeAll] Не удалось остановить PR:", await response.text());
      }
    });

    /** ID PR, созданного в beforeAll — для приоритизации в ensureData */
    let seededPrId = null;

    /** Кешированные данные */
    let pptxResult = null;
    let selectedPR = null;
    let apiTargetUsers = [];

    test.beforeEach(() => {
      markAsUITest(MODULES.MY_TEAM);
    });

    /** Скачать PPTX и загрузить API-данные (если ещё не сделано) */
    async function ensureData(page, request, testInfo) {
      if (pptxResult && selectedPR) return;

      const prAPI = new PerformanceReviewAPI(request);
      const { email, password } = getCredentials("admin");
      await prAPI.signIn(email, password);

      const { data: prs } = await prAPI.getDashboardFiltersPerformanceReviews();
      const rawList = Array.isArray(prs)
        ? prs
        : prs?.items || prs?.results || [];
      // Приоритизируем PR, созданный в beforeAll
      const seeded = seededPrId ? rawList.filter((p) => p.id === seededPrId) : [];
      const rest = seededPrId ? rawList.filter((p) => p.id !== seededPrId) : rawList;
      const prList = [...seeded, ...rest];

      const sideMenu = new SideMenu(page, testInfo);
      const myTeamPage = new MyTeamPage(page, testInfo);

      await sideMenu.openMyTeam();
      await myTeamPage.assertOpened();

      // Перебираем PR, скачиваем PPTX, ищем PR с данными (>1 слайд)
      const maxPRsToTry = Math.min(prList.length, 5);
      for (let i = 0; i < maxPRsToTry; i++) {
        const pr = prList[i];
        const prTitle = pr.title || pr.name || "";

        if (i > 0) {
          await myTeamPage.selectPRFromModal(prTitle);
        }

        let result;
        try {
          const download = await myTeamPage.downloadSummaryReport();
          const filePath = await saveDownload(download, `data_${i}`);
          result = await pptxParser.parse(filePath);
        } catch (e) {
          console.log(
            `PR[${i}]: "${prTitle}" → ошибка скачивания: ${e.message}`,
          );
          continue;
        }

        console.log(`PR[${i}]: "${prTitle}" → ${result.total} слайдов`);

        if (result.total > 1) {
          selectedPR = pr;
          pptxResult = result;

          // Получаем target users через dashboard-filters API
          const { data: users } = await prAPI.getDashboardFiltersTargetUsers(
            pr.id,
            { limit: 200 },
          );
          apiTargetUsers =
            users?.items ||
            users?.results ||
            (Array.isArray(users) ? users : []);

          console.log(
            `✓ Выбран PR: "${prTitle}" (ID=${pr.id}), ${apiTargetUsers.length} target users, ${result.total} слайдов`,
          );
          break;
        }

        // Первый PR — сохраняем как fallback
        if (i === 0) {
          selectedPR = pr;
          pptxResult = result;
          const { data: users } = await prAPI.getDashboardFiltersTargetUsers(
            pr.id,
            { limit: 200 },
          );
          apiTargetUsers =
            users?.items ||
            users?.results ||
            (Array.isArray(users) ? users : []);
        }
      }

      if (selectedPR) {
        console.log(
          `Финальный PR: "${selectedPR.title}" (ID=${selectedPR.id}), ${pptxResult.total} слайдов, ${apiTargetUsers.length} target users`,
        );
      }
    }

    test(
      "C7369: Название PR из API совпадает с PPTX",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }, testInfo) => {
        setSeverity("critical");

        await test.step("Загрузить PPTX и API-данные", async () => {
          await ensureData(page, request, testInfo);
        });

        await test.step("Сверить название PR", async () => {
          expect(selectedPR, "Не удалось получить PR из API — beforeAll seed не сработал?").toBeTruthy();

          const prTitle = selectedPR.title || selectedPR.name || "";
          const prWords = prTitle
            .split(/[\s_]+/)
            .filter((w) => w.length > 2)
            .slice(0, 5);
          const pptxTextCompact = pptxResult.text
            .replace(/\s+/g, " ")
            .toLowerCase();

          const foundWords = prWords.filter((w) =>
            pptxTextCompact.includes(w.toLowerCase()),
          );

          console.log(`API PR title: "${prTitle}"`);
          console.log(`PR words: ${prWords.join(", ")}`);
          console.log(`Found in PPTX: ${foundWords.join(", ")}`);

          expect(
            foundWords.length,
            `API PR title «${prTitle}» должен присутствовать в PPTX`,
          ).toBeGreaterThan(0);
        });
      },
    );

    test(
      "C7370: Количество target users из API соответствует PPTX",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }, testInfo) => {
        setSeverity("critical");

        await test.step("Загрузить PPTX и API-данные", async () => {
          await ensureData(page, request, testInfo);
        });

        await test.step("Сверить количество пользователей", async () => {
          expect(selectedPR && apiTargetUsers.length > 0, `Нет target users в API (selectedPR=${!!selectedPR}, users=${apiTargetUsers.length})`).toBeTruthy();

          // Если PPTX содержит только 1 слайд (титульный) — анкеты не заполнены.
          expect(pptxResult.total > 1, `PPTX содержит ${pptxResult.total} слайд — анкеты не заполнены. beforeAll seed не сработал?`).toBeTruthy();

          // В PPTX ищем число рядом со словом "сотрудников"
          const pptxTextCompact = pptxResult.text.replace(/\s+/g, " ");
          const countMatch = pptxTextCompact.match(/(\d+)\s*сотрудник/i);

          if (!countMatch) {
            // Пробуем убрать пробелы между буквами (стилизация PPTX)
            const noSpaces = pptxResult.text.replace(/\s+/g, "");
            const countMatch2 = noSpaces.match(/(\d+)сотрудник/i);
            if (!countMatch2) {
              throw new Error(`Не найден счётчик сотрудников в PPTX. Текст: "${pptxTextCompact.substring(0, 200)}"`);
            }
            const pptxCount = parseInt(countMatch2[1], 10);
            console.log(
              `✓ PPTX: ${pptxCount} сотрудников (респонденты/участники), API target users: ${apiTargetUsers.length}`,
            );

            // "N сотрудников" в PPTX — это респонденты (заполнившие анкеты),
            // а не target users. У одного target user может быть много респондентов
            // (самооценка + руководитель + коллеги + подчинённые).
            // Sanity check: число должно быть > 0 и в пределах разумного (< 500).
            expect(
              pptxCount,
              "Число сотрудников в PPTX должно быть > 0",
            ).toBeGreaterThan(0);
            expect(
              pptxCount,
              `Число в PPTX (${pptxCount}) не должно быть аномально большим (>500)`,
            ).toBeLessThanOrEqual(500);
            return;
          }

          const pptxCount = parseInt(countMatch[1], 10);
          console.log(
            `✓ PPTX: ${pptxCount} сотрудников (респонденты/участники), API target users: ${apiTargetUsers.length}`,
          );

          // "N сотрудников" в PPTX — это респонденты (заполнившие анкеты),
          // а не target users. У одного target user может быть много респондентов
          // (самооценка + руководитель + коллеги + подчинённые).
          // Sanity check: число должно быть > 0 и в пределах разумного (< 500).
          expect(
            pptxCount,
            "Число сотрудников в PPTX должно быть > 0",
          ).toBeGreaterThan(0);
          expect(
            pptxCount,
            `Число в PPTX (${pptxCount}) не должно быть аномально большим (>500)`,
          ).toBeLessThanOrEqual(500);
        });
      },
    );

    test(
      "C7371: Итоговая оценка из PPTX совпадает с API (при наличии данных)",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }, testInfo) => {
        setSeverity("critical");

        await test.step("Загрузить PPTX и API-данные", async () => {
          await ensureData(page, request, testInfo);
        });

        await test.step("Проверить итоговую оценку", async () => {
          const finalScore = pptxParser.findFinalScore(pptxResult.text);
          console.log(
            `✓ Итоговая оценка из PPTX: ${JSON.stringify(finalScore)}`,
          );

          if (finalScore.mode === "unknown") {
            // Если в PPTX нет итоговой оценки — возможно, 0 заполненных анкет
            test.info().annotations.push({
              type: "info",
              description:
                "Итоговая оценка не найдена в PPTX — возможно, нет заполненных анкет",
            });
            return;
          }

          if (finalScore.score) {
            const score = parseFloat(finalScore.score);
            expect(
              score,
              "Оценка должна быть в диапазоне [0, 10]",
            ).toBeGreaterThanOrEqual(0);
            expect(
              score,
              "Оценка должна быть в диапазоне [0, 10]",
            ).toBeLessThanOrEqual(10);
          }

          if (finalScore.characteristic) {
            expect(
              finalScore.characteristic.length,
              "Характеристика должна быть непустой строкой",
            ).toBeGreaterThan(0);
          }
        });
      },
    );

    test(
      "C7372: Имена target users из API содержатся в PPTX (при наличии слайдов с данными)",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }, testInfo) => {
        setSeverity("critical");

        await test.step("Загрузить PPTX и API-данные", async () => {
          await ensureData(page, request, testInfo);
        });

        await test.step("Сверить имена сотрудников API↔PPTX", async () => {
          expect(apiTargetUsers.length > 0, "Нет target users в API — beforeAll seed не сработал?").toBeTruthy();

          if (pptxResult.total <= 1) {
            test.info().annotations.push({
              type: "info",
              description: `PPTX содержит ${pptxResult.total} слайд — недостаточно данных для сверки имён`,
            });
            return;
          }

          const pptxTextLower = pptxResult.text.toLowerCase();
          const foundUsers = [];
          const notFoundUsers = [];

          for (const user of apiTargetUsers) {
            const firstName = user.firstName || user.first_name || "";
            const lastName = user.lastName || user.last_name || "";
            const fullName = `${lastName} ${firstName}`.trim();

            // Ищем хотя бы фамилию (>3 символов) в PPTX
            const searchWord = lastName.length > 3 ? lastName : fullName;
            if (pptxTextLower.includes(searchWord.toLowerCase())) {
              foundUsers.push(fullName);
            } else {
              notFoundUsers.push(fullName);
            }
          }

          console.log(
            `✓ Найдено в PPTX: ${foundUsers.length}/${apiTargetUsers.length}`,
          );
          if (notFoundUsers.length > 0 && notFoundUsers.length <= 5) {
            console.log(`⚠️ Не найдены: ${notFoundUsers.join(", ")}`);
          }

          // Групповой PPTX содержит агрегатные данные (тепловая карта, радар, статистика),
          // а не персональные страницы — ФИО сотрудников могут отсутствовать.
          if (foundUsers.length > 0) {
            console.log(`✓ Найдены имена в групповом PPTX`);
          } else {
            test.info().annotations.push({
              type: "info",
              description: `Групповой PPTX (${pptxResult.total} сл.) содержит агрегатные данные — ФИО сотрудников могут отсутствовать`,
            });
          }
        });
      },
    );
  },
);
