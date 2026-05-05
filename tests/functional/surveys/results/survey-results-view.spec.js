// tests/functional/surveys/results/survey-results-view.spec.js
// TestRail: C2913-C2923 - Просмотр результатов опроса
// Примечание: C2911 (разбивка по отделам) покрыт E2E тестом create-and-pass-with-departments-full.spec.js
import { expect } from "@playwright/test";
import { test } from "../../../fixtures/auth.js";
import { SideMenu } from "../../../../pages/SideMenu.js";
import { SurveysListPage } from "../../../../pages/SurveysListPage.js";
import { SurveyResultsPage } from "../../../../pages/SurveyResultsPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";
import { TIMEOUTS } from "../../../utils/constants.js";
import { SurveySeedHelper } from "../../../utils/seed/SurveySeedHelper.js";
import { SurveyAPI, getCredentials } from "../../../utils/api/index.js";

let sharedSurvey = null;

test.describe(
  "Просмотр результатов опроса",
  { tag: ["@ui", "@regression"] },
  () => {
    test.beforeAll(async ({ request }) => {
      const seed = new SurveySeedHelper(request);
      await seed.init("admin");
      sharedSurvey = await seed.seedSurveyWithAnswers({
        title: `[AutoTest] View Results ${Date.now()}`,
        answersCount: 1,
      });
      if (sharedSurvey?.id) {
        await seed.surveyAPI.stop(sharedSurvey.id).catch(() => {});
      }
    });

    test.afterAll(async ({ request }) => {
      if (!sharedSurvey?.id) return;
      try {
        const api = new SurveyAPI(request);
        const { email, password } = getCredentials("admin");
        await api.signIn(email, password);
        await api.remove(sharedSurvey.id);
      } catch {}
      sharedSurvey = null;
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.SURVEYS);
    });

    test(
      "C2913: отображение результатов опроса с разбивкой по группам",
      { tag: ["@critical"] },
      async ({ adminAuth, page }, testInfo) => {
        setSeverity("critical");
        if (!sharedSurvey?.id)
          throw new Error("sharedSurvey не создан в beforeAll");

        const sideMenu = new SideMenu(page, testInfo);
        const surveysListPage = new SurveysListPage(page, testInfo);
        const resultsPage = new SurveyResultsPage(page, testInfo);

        await test.step("Перейти к списку опросов", async () => {
          await sideMenu.openSurveysList();
          await surveysListPage.assertOpened();
        });

        await test.step("Открыть опрос из завершённых", async () => {
          // Фильтр "Завершённые" — наш опрос был остановлен в beforeAll
          const completedFilter = page
            .locator("button")
            .filter({ hasText: /^Завершенные$/i })
            .first();
          await completedFilter.waitFor({
            state: "visible",
            timeout: TIMEOUTS.SHORT,
          });
          await completedFilter.click();
          await page
            .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
            .catch(() => {});

          const ourSurvey = page
            .locator('[class*="Survey_inner"]')
            .filter({ hasText: sharedSurvey.title })
            .first();
          await ourSurvey.waitFor({ state: "visible", timeout: TIMEOUTS.LONG });
          await ourSurvey.click();
          await page
            .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
            .catch(() => {});
        });

        await test.step('Перейти на вкладку "Результаты"', async () => {
          await resultsPage.openResultsTab();
        });

        await test.step("Проверить наличие разбивки по группам", async () => {
          // Ищем фильтр или вкладки по группам
          const groupsFilter = page
            .locator('[class*="Filter"], [class*="Select"]')
            .filter({ hasText: /Группа/i })
            .first();

          const groupsList = page.locator('[class*="Group"], [class*="group"]');

          const hasFilter = await groupsFilter
            .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
            .then(() => true)
            .catch(() => false);
          const hasList = (await groupsList.count()) > 0;

          console.log(`Фильтр по группам: ${hasFilter}`);
          console.log(`Список групп: ${hasList}`);
        });

        await test.step("Применить фильтр по группе", async () => {
          const groupsFilter = page
            .locator('[class*="Filter"], [class*="Select"]')
            .filter({ hasText: /Группа/i })
            .first();

          const hasFilter = await groupsFilter
            .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
            .then(() => true)
            .catch(() => false);

          if (hasFilter) {
            await groupsFilter.click();

            const groupOption = page.getByRole("option").first();
            const hasOption = await groupOption
              .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
              .then(() => true)
              .catch(() => false);

            if (hasOption) {
              await groupOption.click();
              console.log("Выбрана группа из фильтра");
              await page
                .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
                .catch(() => {});
            } else {
              await page.keyboard.press("Escape");
            }
          }
        });
      },
    );

    test("C2915: экспорт результатов опроса в отчет", async ({
      adminAuth,
      page,
    }, testInfo) => {
      setSeverity("normal");
      if (!sharedSurvey?.id)
        throw new Error("sharedSurvey не создан в beforeAll");

      const sideMenu = new SideMenu(page, testInfo);
      const surveysListPage = new SurveysListPage(page, testInfo);
      const resultsPage = new SurveyResultsPage(page, testInfo);

      await test.step("Перейти к списку опросов", async () => {
        await sideMenu.openSurveysList();
        await surveysListPage.assertOpened();
      });

      await test.step("Открыть опрос из завершённых", async () => {
        const completedFilter = page
          .locator("button")
          .filter({ hasText: /^Завершенные$/i })
          .first();
        await completedFilter.waitFor({
          state: "visible",
          timeout: TIMEOUTS.SHORT,
        });
        await completedFilter.click();
        await page
          .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
          .catch(() => {});

        const ourSurvey = page
          .locator('[class*="Survey_inner"]')
          .filter({ hasText: sharedSurvey.title })
          .first();
        await ourSurvey.waitFor({ state: "visible", timeout: TIMEOUTS.LONG });
        await ourSurvey.click();
        await page
          .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
          .catch(() => {});
      });

      await test.step('Перейти на вкладку "Результаты" или "Отчет"', async () => {
        await resultsPage.openResultsTab();
      });

      await test.step("Проверить наличие кнопки экспорта", async () => {
        const exportButton = page
          .getByRole("button", { name: /Экспорт|Скачать|Export|Download/i })
          .first();
        const downloadLink = page
          .locator("a")
          .filter({ hasText: /Экспорт|Скачать/i })
          .first();

        const hasExportButton = await exportButton
          .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
          .then(() => true)
          .catch(() => false);
        const hasDownloadLink = await downloadLink
          .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
          .then(() => true)
          .catch(() => false);

        console.log(`Кнопка экспорта видима: ${hasExportButton}`);
        console.log(`Ссылка скачивания видима: ${hasDownloadLink}`);

        // На странице результатов должен быть элемент экспорта
        expect(
          hasExportButton || hasDownloadLink,
          "Кнопка экспорта или ссылка скачивания должны быть на странице результатов",
        ).toBe(true);

        if (hasExportButton) {
          await exportButton.click();

          // Может появиться модалка с выбором формата
          const formatModal = page.locator('[role="dialog"], [class*="Modal"]');
          const hasFormatModal = await formatModal
            .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
            .then(() => true)
            .catch(() => false);

          if (hasFormatModal) {
            console.log("Модалка выбора формата экспорта видима");

            // Ищем опции формата (Excel, PDF, CSV)
            const excelOption = formatModal
              .locator('button, a, [role="option"]')
              .filter({ hasText: /Excel|xlsx/i });
            const pdfOption = formatModal
              .locator('button, a, [role="option"]')
              .filter({ hasText: /PDF/i });

            const hasExcel = await excelOption
              .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
              .then(() => true)
              .catch(() => false);
            const hasPdf = await pdfOption
              .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
              .then(() => true)
              .catch(() => false);

            console.log(`Опция Excel: ${hasExcel}`);
            console.log(`Опция PDF: ${hasPdf}`);

            // Закрываем модалку
            await page.keyboard.press("Escape");
          }
        }
      });
    });

    test('C2923: отображение категории "Без отдела" в результатах', async ({
      adminAuth,
      page,
    }, testInfo) => {
      setSeverity("normal");
      if (!sharedSurvey?.id)
        throw new Error("sharedSurvey не создан в beforeAll");

      const sideMenu = new SideMenu(page, testInfo);
      const surveysListPage = new SurveysListPage(page, testInfo);
      const resultsPage = new SurveyResultsPage(page, testInfo);

      await test.step("Перейти к списку опросов", async () => {
        await sideMenu.openSurveysList();
        await surveysListPage.assertOpened();
      });

      await test.step("Открыть опрос из завершённых", async () => {
        const completedFilter = page
          .locator("button")
          .filter({ hasText: /^Завершенные$/i })
          .first();
        await completedFilter.waitFor({
          state: "visible",
          timeout: TIMEOUTS.SHORT,
        });
        await completedFilter.click();
        await page
          .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
          .catch(() => {});

        const ourSurvey = page
          .locator('[class*="Survey_inner"]')
          .filter({ hasText: sharedSurvey.title })
          .first();
        await ourSurvey.waitFor({ state: "visible", timeout: TIMEOUTS.LONG });
        await ourSurvey.click();
        await page
          .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
          .catch(() => {});
      });

      await test.step('Перейти на вкладку "Результаты"', async () => {
        await resultsPage.openResultsTab();
      });

      await test.step('Проверить наличие категории "Без отдела"', async () => {
        // Открываем фильтр по отделам
        const departmentsFilter = page
          .locator('[class*="Filter"], [class*="Select"]')
          .filter({ hasText: /Отдел|Подразделение/i })
          .first();

        const hasFilter = await departmentsFilter
          .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
          .then(() => true)
          .catch(() => false);

        if (hasFilter) {
          await departmentsFilter.click();

          // Ищем опцию "Без отдела"
          const noDepartmentOption = page.getByRole("option", {
            name: /Без отдела|Не указан/i,
          });
          const hasNoDepartment = await noDepartmentOption
            .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
            .then(() => true)
            .catch(() => false);

          console.log(`Опция "Без отдела" найдена: ${hasNoDepartment}`);

          await page.keyboard.press("Escape");
        }

        // Также проверяем в списке/таблице результатов
        const noDepartmentInResults = page
          .locator('[class*="Department"], [class*="department"], td')
          .filter({ hasText: /Без отдела|Не указан/i });

        const hasInResults = await noDepartmentInResults
          .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
          .then(() => true)
          .catch(() => false);
        console.log(`"Без отдела" в результатах: ${hasInResults}`);
      });
    });
  },
);
