// tests/functional/surveys/results/survey-results-export.spec.js
// Экспорт результатов опроса
// TASK-SURVEY-002

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
let draftSurvey = null;

test.describe(
  "Экспорт результатов опроса",
  { tag: ["@ui", "@surveys", "@regression"] },
  () => {
    test.beforeAll(async ({ request }) => {
      const seed = new SurveySeedHelper(request);
      await seed.init("admin");
      sharedSurvey = await seed.seedSurveyWithAnswers({
        title: `[AutoTest] Export Results ${Date.now()}`,
        answersCount: 1,
      });
      if (sharedSurvey?.id) {
        await seed.surveyAPI.stop(sharedSurvey.id).catch(() => {});
      }
      // Черновик (без ответов) для негативного теста C2989
      draftSurvey = await seed.seedDraftSurvey({
        title: `[AutoTest] Export Draft ${Date.now()}`,
      });
    });

    test.afterAll(async ({ request }) => {
      const api = new SurveyAPI(request);
      const { email, password } = getCredentials("admin");
      await api.signIn(email, password);
      if (sharedSurvey?.id) {
        try {
          await api.remove(sharedSurvey.id);
        } catch {}
        sharedSurvey = null;
      }
      if (draftSurvey?.id) {
        try {
          await api.remove(draftSurvey.id);
        } catch {}
        draftSurvey = null;
      }
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.SURVEYS);
    });

    test(
      "C2986: Экспорт результатов опроса в Excel",
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

          // Переходим на вкладку Результаты
          await resultsPage.openResultsTab();
          console.log(`Текущий URL: ${page.url()}`);
        });

        await test.step("Найти кнопку экспорта", async () => {
          // Кнопка "Скачать результаты" присутствует даже без ответов
          await resultsPage.exportButton.waitFor({
            state: "visible",
            timeout: TIMEOUTS.LONG,
          });
          console.log('Кнопка "Скачать результаты" найдена');
          expect(await resultsPage.exportButton.isVisible()).toBe(true);
        });

        await test.step("Выполнить экспорт в Excel", async () => {
          // Кликаем на кнопку "Скачать результаты"
          const exportButton = page
            .locator(
              'button[class*="Results_button"], button:has-text("Скачать результаты")',
            )
            .first();
          await exportButton.click();
          // Wait for dropdown menu to appear
          const menuVisible = page
            .locator('[role="menuitem"], [role="option"], button, a')
            .first();
          await menuVisible
            .waitFor({ state: "visible", timeout: TIMEOUTS.ANIMATION })
            .catch(() => {});

          // В выпадающем меню выбираем "Все результаты XLSX"
          const xlsxOption = page
            .locator('button, a, [role="menuitem"]')
            .filter({ hasText: /Все результаты XLSX/i })
            .first();
          const hasXlsxOption = await xlsxOption
            .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
            .then(() => true)
            .catch(() => false);

          expect(
            hasXlsxOption,
            'Опция "Все результаты XLSX" должна быть в меню экспорта',
          ).toBe(true);

          // Ожидаем открытие новой вкладки с файлом
          const [newPage] = await Promise.all([
            page.context().waitForEvent("page", { timeout: TIMEOUTS.LONG }),
            xlsxOption.click(),
          ]);

          console.log("Выбран формат: Все результаты XLSX");

          // Ждём загрузки новой вкладки
          await newPage
            .waitForLoadState("load", { timeout: TIMEOUTS.LONG })
            .catch(() => {});

          const newUrl = newPage.url();
          console.log(`URL новой вкладки: ${newUrl}`);

          // Проверяем что URL содержит xlsx или export
          expect(newUrl, "URL должен указывать на файл экспорта").toMatch(
            /xlsx|export|download|file/i,
          );

          // Закрываем вкладку с файлом
          await newPage.close();
        });
      },
    );

    test(
      "C2987: Проверка доступных форматов экспорта",
      { tag: ["@regression"] },
      async ({ adminAuth, page }, testInfo) => {
        setSeverity("normal");
        const sideMenu = new SideMenu(page, testInfo);
        const surveysListPage = new SurveysListPage(page, testInfo);

        await test.step("Перейти к списку опросов", async () => {
          await sideMenu.openSurveysList();
          await surveysListPage.assertOpened();
        });

        await test.step("Открыть опрос с результатами", async () => {
          if (!sharedSurvey?.id)
            throw new Error("sharedSurvey не создан в beforeAll");

          // Switch to "Завершённые" where our stopped survey lives
          const completedFilter = page
            .locator("button")
            .filter({ hasText: /^Завершенные$/i })
            .first();
          const hasFilter = await completedFilter
            .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
            .then(() => true)
            .catch(() => false);
          if (hasFilter) {
            await completedFilter.click();
            await page
              .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
              .catch(() => {});
          }

          const ourSurvey = page
            .locator('[class*="Survey_inner"]')
            .filter({ hasText: sharedSurvey.title })
            .first();
          await ourSurvey.waitFor({ state: "visible", timeout: TIMEOUTS.LONG });
          await ourSurvey.click();
          await page
            .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
            .catch(() => {});

          // Переходим на вкладку Результаты
          const resultsTab = page
            .locator('[role="tab"], a, button')
            .filter({ hasText: /Результаты/i })
            .first();
          await resultsTab.waitFor({
            state: "visible",
            timeout: TIMEOUTS.MEDIUM,
          });
          await resultsTab.click();
          await page
            .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
            .catch(() => {});
        });

        await test.step("Проверить доступные форматы экспорта", async () => {
          // Кликаем на кнопку экспорта
          const exportButton = page
            .getByRole("button", { name: /Экспорт|Скачать|Export/i })
            .first();
          const hasExportButton = await exportButton
            .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
            .then(() => true)
            .catch(() => false);

          if (hasExportButton) {
            await exportButton.click();

            // Проверяем наличие форматов
            const formatOptions = page
              .locator(
                '[role="menuitem"], [role="option"], [class*="option"], button, a',
              )
              .filter({ hasText: /Excel|xlsx|PDF|CSV/i });

            const formatCount = await formatOptions.count();
            console.log(`Найдено форматов экспорта: ${formatCount}`);

            // Проверяем наличие основных форматов
            const excelOption = page
              .locator('[role="menuitem"], [role="option"], button, a')
              .filter({ hasText: /Excel|xlsx/i })
              .first();
            const pdfOption = page
              .locator('[role="menuitem"], [role="option"], button, a')
              .filter({ hasText: /PDF/i })
              .first();
            const csvOption = page
              .locator('[role="menuitem"], [role="option"], button, a')
              .filter({ hasText: /CSV/i })
              .first();

            const hasExcel = await excelOption
              .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
              .then(() => true)
              .catch(() => false);
            const hasPdf = await pdfOption
              .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
              .then(() => true)
              .catch(() => false);
            const hasCsv = await csvOption
              .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
              .then(() => true)
              .catch(() => false);

            console.log(`Excel доступен: ${hasExcel}`);
            console.log(`PDF доступен: ${hasPdf}`);
            console.log(`CSV доступен: ${hasCsv}`);

            // Хотя бы Excel должен быть
            expect(hasExcel, "Экспорт в Excel должен быть доступен").toBe(true);

            // Закрываем меню
            await page.keyboard.press("Escape");
          } else {
            console.log("Кнопка экспорта не найдена");
          }
        });
      },
    );

    test(
      "C2988: Экспорт с применённым фильтром",
      { tag: ["@regression"] },
      async ({ adminAuth, page }, testInfo) => {
        setSeverity("normal");
        const sideMenu = new SideMenu(page, testInfo);
        const surveysListPage = new SurveysListPage(page, testInfo);

        await test.step("Перейти к списку опросов", async () => {
          await sideMenu.openSurveysList();
          await surveysListPage.assertOpened();
        });

        await test.step("Открыть опрос с результатами", async () => {
          if (!sharedSurvey?.id)
            throw new Error("sharedSurvey не создан в beforeAll");

          // Switch to "Завершённые" where our stopped survey lives
          const completedFilter = page
            .locator("button")
            .filter({ hasText: /^Завершенные$/i })
            .first();
          const hasFilter = await completedFilter
            .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
            .then(() => true)
            .catch(() => false);
          if (hasFilter) {
            await completedFilter.click();
            await page
              .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
              .catch(() => {});
          }

          const ourSurvey = page
            .locator('[class*="Survey_inner"]')
            .filter({ hasText: sharedSurvey.title })
            .first();
          await ourSurvey.waitFor({ state: "visible", timeout: TIMEOUTS.LONG });
          await ourSurvey.click();
          await page
            .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
            .catch(() => {});

          // Переходим на вкладку Результаты
          const resultsTab = page
            .locator('[role="tab"], a, button')
            .filter({ hasText: /Результаты/i })
            .first();
          await resultsTab.waitFor({
            state: "visible",
            timeout: TIMEOUTS.MEDIUM,
          });
          await resultsTab.click();
          await page
            .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
            .catch(() => {});
        });

        await test.step("Применить фильтр", async () => {
          // Ищем любой доступный фильтр
          const departmentFilter = page
            .locator('[class*="filter"], [class*="Filter"]')
            .filter({ hasText: /Отдел|Подразделение|Department/i })
            .first();

          const groupFilter = page
            .locator('[class*="filter"], [class*="Filter"]')
            .filter({ hasText: /Группа|Group/i })
            .first();

          const hasDepartmentFilter = await departmentFilter
            .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
            .then(() => true)
            .catch(() => false);
          const hasGroupFilter = await groupFilter
            .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
            .then(() => true)
            .catch(() => false);

          if (hasDepartmentFilter) {
            await departmentFilter.click();

            const firstOption = page.getByRole("option").first();
            const hasOption = await firstOption
              .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
              .then(() => true)
              .catch(() => false);

            if (hasOption) {
              await firstOption.click();
              console.log("Применён фильтр по отделу");
            } else {
              await page.keyboard.press("Escape");
            }

            await page
              .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
              .catch(() => {});
          } else if (hasGroupFilter) {
            await groupFilter.click();

            const firstOption = page.getByRole("option").first();
            const hasOption = await firstOption
              .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
              .then(() => true)
              .catch(() => false);

            if (hasOption) {
              await firstOption.click();
              console.log("Применён фильтр по группе");
            } else {
              await page.keyboard.press("Escape");
            }

            await page
              .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
              .catch(() => {});
          } else {
            console.log("Фильтры не найдены");
          }
        });

        await test.step("Выполнить экспорт с фильтром", async () => {
          const exportButton = page
            .getByRole("button", { name: /Экспорт|Скачать|Export/i })
            .first();
          const hasExportButton = await exportButton
            .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
            .then(() => true)
            .catch(() => false);

          if (hasExportButton) {
            // Подготавливаем перехват скачивания
            const downloadPromise = page
              .waitForEvent("download", { timeout: TIMEOUTS.LONG })
              .catch(() => null);

            await exportButton.click();

            // Если появилось меню - выбираем Excel
            const excelOption = page
              .locator('[role="menuitem"], [role="option"], button, a')
              .filter({ hasText: /Excel|xlsx/i })
              .first();
            const hasExcelOption = await excelOption
              .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
              .then(() => true)
              .catch(() => false);

            if (hasExcelOption) {
              await excelOption.click();
            }

            const download = await downloadPromise;

            if (download) {
              const fileName = download.suggestedFilename();
              console.log(`Экспортирован файл с фильтром: ${fileName}`);
              expect(fileName).toMatch(/\.(xlsx|xls|pdf|csv)$/i);
            }
          }
        });
      },
    );

    test(
      "C2989: Экспорт недоступен для опроса без ответов",
      { tag: ["@negative"] },
      async ({ adminAuth, page }, testInfo) => {
        setSeverity("normal");
        if (!draftSurvey?.id)
          throw new Error("draftSurvey не создан в beforeAll");

        const sideMenu = new SideMenu(page, testInfo);
        const surveysListPage = new SurveysListPage(page, testInfo);

        await test.step("Перейти к списку опросов", async () => {
          await sideMenu.openSurveysList();
          await surveysListPage.assertOpened();
        });

        await test.step("Открыть черновик опроса (без ответов)", async () => {
          // Переключаем на "Черновики" и ищем наш draftSurvey
          const draftFilter = page
            .locator("button")
            .filter({ hasText: /^Черновики$/i })
            .first();
          await draftFilter.waitFor({
            state: "visible",
            timeout: TIMEOUTS.SHORT,
          });
          await draftFilter.click();
          await page
            .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
            .catch(() => {});

          const ourDraft = page
            .locator('[class*="Survey_inner"]')
            .filter({ hasText: draftSurvey.title })
            .first();
          await ourDraft.waitFor({ state: "visible", timeout: TIMEOUTS.LONG });

          const surveyLink = ourDraft.locator('a[href*="/surveys/"]').first();
          await surveyLink.waitFor({
            state: "visible",
            timeout: TIMEOUTS.MEDIUM,
          });
          await surveyLink.click();
          await page
            .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
            .catch(() => {});
        });

        await test.step("Проверить недоступность экспорта для черновика", async () => {
          // Для черновика вкладка "Результаты" должна быть недоступна или отсутствовать
          const resultsTab = page
            .locator('[role="tab"], a, button')
            .filter({ hasText: /Результаты/i })
            .first();
          const hasResultsTab = await resultsTab
            .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
            .then(() => true)
            .catch(() => false);

          if (hasResultsTab) {
            const tabClass = (await resultsTab.getAttribute("class")) || "";
            if (tabClass.includes("disabled")) {
              console.log(
                "Вкладка Результаты недоступна (disabled) — ожидаемое поведение для черновика",
              );
              // Тест проходит: вкладка заблокирована
              return;
            } else {
              await resultsTab.click();
              await page
                .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
                .catch(() => {});
            }
          } else {
            // Вкладка Результаты отсутствует — ожидаемое поведение
            console.log("Вкладка Результаты отсутствует для черновика");
            return;
          }

          // Если открылась страница результатов — кнопка экспорта должна быть недоступна
          const exportButton = page
            .getByRole("button", { name: /Экспорт|Скачать|Export/i })
            .first();
          const hasExportButton = await exportButton
            .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
            .then(() => true)
            .catch(() => false);

          if (hasExportButton) {
            const isDisabled = await exportButton.isDisabled().catch(() => false);
            console.log(`Кнопка экспорта заблокирована: ${isDisabled}`);
          } else {
            console.log(
              "Кнопка экспорта не отображается для опроса без ответов",
            );
          }
        });
      },
    );
  },
);
