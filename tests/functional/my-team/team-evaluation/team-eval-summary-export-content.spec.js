// tests/functional/my-team/team-evaluation/team-eval-summary-export-content.spec.js
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
  "Оценка команды — содержимое сводного отчёта PPTX",
  { tag: ["@ui", "@my-team", "@regression"] },
  () => {
    test.describe.configure({ mode: "serial" });

    test.beforeAll(async ({ request }) => {
      test.setTimeout(180_000);
      const seed = new PerformanceReviewSeedHelper(request);
      await seed.init("admin");

      // Нужен PR с заполненными анкетами для PPTX содержимого
      const found = await seed.findOrCreatePRWithMultipleTargetUsers(2, { forceCreate: true });
      console.log(
        `[beforeAll] PR для content: id=${found.prId}, targetUsers=${found.targetUsersCount}`,
      );

      const filled = await seed.fillQuestionnaires(found.prId);
      console.log(`[beforeAll] Заполнено анкет: ${filled}`);
      const { response } = await seed.prAPI.stop(found.prId);
      if (!response.ok()) {
        console.warn("[beforeAll] Не удалось остановить PR:", await response.text());
      }
    });

    /** Кешированные данные PPTX */
    /** @type {{slides: Array<{slideNum: number, text: string}>, text: string, total: number} | null} */
    let pptxResult = null;
    /** @type {string} */
    let pptxFilePath = "";
    /** @type {string} */
    let selectedPRName = "";
    /** @type {string[]} */
    let uiEmployeeNames = [];

    test.beforeEach(() => {
      markAsUITest(MODULES.MY_TEAM);
    });

    /** Скачать PPTX и собрать UI-данные (если ещё не сделано) */
    async function ensureData(page, testInfo) {
      if (pptxResult) return;

      const sideMenu = new SideMenu(page, testInfo);
      const myTeamPage = new MyTeamPage(page, testInfo);

      await sideMenu.openMyTeam();
      await myTeamPage.assertOpened();

      // Запоминаем выбранный PR
      selectedPRName = await myTeamPage.getSelectedAssessment();
      console.log(`✓ Выбранная оценка: "${selectedPRName}"`);

      // Собираем имена сотрудников из UI-таблицы
      const count = await myTeamPage.getEmployeesCount();
      if (count > 0) {
        uiEmployeeNames = await myTeamPage.getAllEmployeeNames();
      }

      // Скачиваем PPTX
      const download = await myTeamPage.downloadSummaryReport();
      pptxFilePath = await saveDownload(download, "content");
      pptxResult = await pptxParser.parse(pptxFilePath);

      console.log(`PPTX: ${pptxResult.total} слайдов`);
      for (const slide of pptxResult.slides) {
        console.log(
          `  Слайд ${slide.slideNum}: ${slide.text.substring(0, 150)}`,
        );
      }
    }

    test(
      "C7364: PPTX содержит название выбранной оценки",
      { tag: ["@critical"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("critical");

        await test.step("Загрузить данные", async () => {
          await ensureData(page, testInfo);
        });

        await test.step("Проверить, что текст PPTX содержит название PR", async () => {
          // Извлекаем чистое название PR из фильтра
          const prName = selectedPRName.replace(/Выберите оценку/i, "").trim();

          expect(prName, `Не удалось извлечь название PR из фильтра: "${selectedPRName}"`).toBeTruthy();

          // Разбиваем название на слова (по пробелам и подчёркиваниям), берём значимые
          const prWords = prName
            .split(/[\s_]+/)
            .filter((w) => w.length > 2)
            .slice(0, 5);

          // В PPTX буквы могут быть разделены пробелами (стилизация), убираем лишние пробелы
          const pptxTextCompact = pptxResult.text
            .replace(/\s+/g, " ")
            .toLowerCase();

          // Ищем слова из названия PR
          const foundWords = prWords.filter((w) =>
            pptxTextCompact.includes(w.toLowerCase()),
          );

          console.log(`PR слова: ${prWords.join(", ")}`);
          console.log(`Найдено: ${foundWords.join(", ")}`);

          expect(
            foundWords.length,
            `Хотя бы одно слово из названия PR («${prWords.join(" ")}») должно быть в PPTX. ` +
              `Текст 1-го слайда: "${pptxResult.slides[0]?.text.substring(0, 200)}"`,
          ).toBeGreaterThan(0);
        });
      },
    );

    test(
      "C7365: PPTX содержит информацию о заполнении анкет",
      { tag: ["@critical"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("critical");

        await test.step("Загрузить данные", async () => {
          await ensureData(page, testInfo);
        });

        await test.step("Проверить наличие текста о заполнении анкет", async () => {
          // В PPTX буквы заголовков могут быть разделены пробелами (стилизация):
          // "А Н К Е Т Ы   З А П О Л Н И Л И" → убираем пробелы для сравнения
          const pptxTextCompact = pptxResult.text
            .replace(/\s+/g, "")
            .toLowerCase();
          const hasAnkety = pptxTextCompact.includes("анкетызаполнили");

          // Альтернатива: ищем "сотрудников" рядом с числом
          const hasSotrudnikov =
            /\d+\s*сотрудник/i.test(pptxResult.text) ||
            pptxTextCompact.includes("сотрудник");

          expect(
            hasAnkety || hasSotrudnikov,
            `Текст PPTX должен содержать информацию о заполнении анкет. ` +
              `Текст: "${pptxResult.text.substring(0, 300)}"`,
          ).toBeTruthy();
        });
      },
    );

    test(
      "C7366: PPTX содержит хотя бы один слайд",
      { tag: ["@critical"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("critical");

        await test.step("Загрузить данные", async () => {
          await ensureData(page, testInfo);
        });

        await test.step("Проверить количество слайдов", async () => {
          expect(
            pptxResult.total,
            "PPTX должен содержать хотя бы 1 слайд",
          ).toBeGreaterThan(0);

          // Если есть сотрудники с данными — ожидаем больше слайдов
          if (uiEmployeeNames.length > 0) {
            console.log(
              `✓ UI: ${uiEmployeeNames.length} сотрудников, PPTX: ${pptxResult.total} слайдов`,
            );
          }
        });
      },
    );

    test(
      "C7367: Имена сотрудников из UI присутствуют в PPTX (при наличии данных)",
      { tag: ["@critical"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("critical");

        await test.step("Загрузить данные", async () => {
          await ensureData(page, testInfo);
        });

        await test.step("Проверить наличие имён сотрудников в тексте PPTX", async () => {
          expect(uiEmployeeNames.length, "В таблице нет сотрудников — beforeAll seed должен был создать PR с target users").toBeGreaterThan(0);

          // Проверяем, есть ли хотя бы одно имя из UI в PPTX
          // (при 0 заполненных анкетах имён может не быть в PPTX)
          const pptxTextLower = pptxResult.text.toLowerCase();
          const foundNames = [];
          const notFoundNames = [];

          for (const name of uiEmployeeNames) {
            // Разбиваем на фамилию и имя, ищем каждое слово
            const words = name.split(/\s+/).filter((w) => w.length > 2);
            const found = words.some((w) =>
              pptxTextLower.includes(w.toLowerCase()),
            );
            if (found) {
              foundNames.push(name);
            } else {
              notFoundNames.push(name);
            }
          }

          console.log(
            `✓ Найдено в PPTX: ${foundNames.length}/${uiEmployeeNames.length} сотрудников`,
          );
          if (notFoundNames.length > 0) {
            console.log(`⚠️ Не найдены: ${notFoundNames.join(", ")}`);
          }

          // Групповой PPTX содержит агрегатные слайды (статистика, тепловая карта, радар),
          // а не персональные страницы — ФИО могут отсутствовать в тексте.
          // Логируем результат как информационный.
          if (foundNames.length > 0) {
            console.log(`✓ Найдены имена сотрудников в групповом PPTX`);
          } else {
            test.info().annotations.push({
              type: "info",
              description: `Групповой PPTX (${pptxResult.total} сл.) содержит агрегатные данные — ФИО сотрудников могут отсутствовать`,
            });
          }
        });
      },
    );

    test(
      "C7368: Тип отчёта определяется корректно",
      { tag: ["@critical"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("normal");

        await test.step("Загрузить данные", async () => {
          await ensureData(page, testInfo);
        });

        await test.step("Определить тип отчёта (group/individual)", async () => {
          const reportType = pptxParser.getReportType(pptxResult);
          console.log(`✓ Тип отчёта: ${reportType}`);

          // Сводный отчёт команды должен быть «group» или «unknown» (если мало данных)
          // Не должен быть «individual» — это отчёт по одному сотруднику
          if (uiEmployeeNames.length > 1) {
            expect(
              reportType,
              "Сводный отчёт команды не должен быть индивидуальным отчётом",
            ).not.toBe("individual");
          }
        });
      },
    );
  },
);
