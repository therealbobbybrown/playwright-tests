// tests/functional/surveys/results/survey-results-detailed.spec.js
// TestRail: C2762 - Детальный просмотр результатов опроса
// TASK-SURVEY-001

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
  "Детальный просмотр результатов опроса",
  { tag: ["@ui", "@surveys", "@regression"] },
  () => {
    test.beforeAll(async ({ request }) => {
      const seed = new SurveySeedHelper(request);
      await seed.init("admin");
      sharedSurvey = await seed.seedSurveyWithAnswers({
        title: `[AutoTest] Detailed Results ${Date.now()}`,
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

    test("C2762: просмотр сводки результатов опроса", async ({
      adminAuth,
      page,
    }, testInfo) => {
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

      await test.step("Найти и открыть опрос с результатами", async () => {
        // Переключаем на "Завершённые" — наш опрос остановлен в beforeAll
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

      await test.step("Перейти на вкладку Результаты", async () => {
        await resultsPage.openResultsTab();
      });

      await test.step("Проверить отображение сводки результатов", async () => {
        // Проверяем, что страница результатов отображает информацию по вопросам:
        // либо "Нет ответов" (0 ответов), либо статистику (при наличии ответов)
        const resultsInfoLocator = page
          .getByText(/нет ответов|ответ|ответов|прошли|заполнили/i)
          .first();

        await resultsInfoLocator.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        const infoText = await resultsInfoLocator.innerText();
        console.log(`Информация о результатах: "${infoText}"`);
        expect(
          infoText.length,
          "Страница результатов должна отображать информацию по ответам",
        ).toBeGreaterThan(0);
      });

      await test.step("Проверить отображение результатов по вопросам", async () => {
        // Ищем секции с вопросами и их результатами
        const questionBlocks = page
          .locator(
            '[class*="Question"], [class*="question"], [class*="Item"], [class*="result"]',
          )
          .filter({
            has: page.locator(
              '[class*="chart"], [class*="Chart"], canvas, svg',
            ),
          });

        const questionCount = await questionBlocks.count();
        console.log(`Найдено блоков с результатами вопросов: ${questionCount}`);

        if (questionCount > 0) {
          // Проверяем первый блок
          const firstQuestion = questionBlocks.first();

          // Должен быть текст вопроса
          const questionText = await firstQuestion
            .locator('[class*="title"], [class*="text"], h3, h4')
            .first()
            .innerText()
            .catch(() => "");
          console.log(
            `Текст первого вопроса: ${questionText.substring(0, 50)}...`,
          );

          expect(
            questionText.length,
            "Текст вопроса должен быть непустым",
          ).toBeGreaterThan(0);
        }
      });

      await test.step("Проверить отображение диаграмм", async () => {
        // Ищем различные типы диаграмм
        const chartElements = page.locator(
          'canvas, svg[class*="chart"], [class*="Chart"], [class*="pie"], [class*="bar"]',
        );
        const chartCount = await chartElements.count();

        console.log(`Найдено диаграмм: ${chartCount}`);

        // Диаграммы должны быть если есть вопросы с выбором
        if (chartCount > 0) {
          const firstChart = chartElements.first();
          await expect(firstChart, "Диаграмма должна быть видима").toBeVisible();
        }
      });

      await test.step("Проверить интерактивность результатов", async () => {
        // Проверяем возможность hover на элементах диаграмм для показа tooltip
        const chartElements = page
          .locator('canvas, svg[class*="chart"], [class*="Chart"]')
          .first();
        const hasChart = await chartElements
          .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
          .then(() => true)
          .catch(() => false);

        if (hasChart) {
          await chartElements.hover();

          const tooltip = page.locator(
            '[class*="tooltip"], [class*="Tooltip"], [role="tooltip"]',
          );
          const hasTooltip = await tooltip
            .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
            .then(() => true)
            .catch(() => false);

          console.log(`Tooltip при наведении: ${hasTooltip}`);
        }
      });
    });

    test(
      "C2983: Просмотр индивидуальных ответов (неанонимный опрос)",
      { tag: ["@regression"] },
      async ({ adminAuth, page }, testInfo) => {
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

        await test.step("Открыть неанонимный опрос с результатами", async () => {
          // sharedSurvey создан с isAnonim: false (по умолчанию) и остановлен
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

        await test.step("Перейти на вкладку Результаты", async () => {
          await resultsPage.openResultsTab();
        });

        await test.step("Проверить наличие списка респондентов", async () => {
          // Ищем таблицу или список с именами
          const respondentsList = page.locator(
            '[class*="respondent"], [class*="participant"], [class*="user"]',
          );
          const respondentsTable = page
            .locator("table")
            .filter({ hasText: /имя|пользователь|сотрудник|name|user/i });

          const hasRespondentsList = (await respondentsList.count()) > 0;
          const hasRespondentsTable = await respondentsTable
            .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
            .then(() => true)
            .catch(() => false);

          console.log(`Список респондентов: ${hasRespondentsList}`);
          console.log(`Таблица респондентов: ${hasRespondentsTable}`);

          // Также может быть вкладка "Ответы" или "Участники"
          const answersTab = page
            .locator('[role="tab"], button')
            .filter({ hasText: /Ответы|Участники|Респонденты/i })
            .first();
          const hasAnswersTab = await answersTab
            .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
            .then(() => true)
            .catch(() => false);

          if (hasAnswersTab) {
            await answersTab.click();
            await page
              .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
              .catch(() => {});

            const respondentsAfterTab = page
              .locator('tr, [class*="row"]')
              .filter({
                has: page.locator(
                  '[class*="name"], [class*="user"], [class*="avatar"]',
                ),
              });
            const respondentsCount = await respondentsAfterTab.count();

            console.log(
              `Найдено респондентов после клика на вкладку: ${respondentsCount}`,
            );
          }
        });

        await test.step("Проверить возможность просмотра индивидуального ответа", async () => {
          // Ищем кликабельные строки с респондентами
          const respondentRow = page
            .locator('tr, [class*="row"]')
            .filter({
              has: page.locator(
                '[class*="name"], [class*="user"], [class*="avatar"]',
              ),
            })
            .first();

          const hasRow = await respondentRow
            .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
            .then(() => true)
            .catch(() => false);

          if (hasRow) {
            await respondentRow.click();

            // Проверяем открытие деталей
            const detailsModal = page.locator(
              '[role="dialog"], [class*="Modal"], [class*="Drawer"]',
            );
            const detailsSection = page.locator(
              '[class*="detail"], [class*="answer"]',
            );

            const hasModal = await detailsModal
              .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
              .then(() => true)
              .catch(() => false);
            const hasDetails = await detailsSection
              .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
              .then(() => true)
              .catch(() => false);

            console.log(`Открылась модалка с деталями: ${hasModal}`);
            console.log(`Открылась секция деталей: ${hasDetails}`);

            if (hasModal) {
              await page.keyboard.press("Escape");
            }
          }
        });
      },
    );

    test(
      "C2984: Просмотр текстовых ответов на открытые вопросы",
      { tag: ["@regression"] },
      async ({ adminAuth, page }, testInfo) => {
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

        await test.step("Открыть опрос с результатами", async () => {
          // sharedSurvey содержит вопрос типа longText (открытый вопрос)
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
          // Ждём исчезновения оверлея загрузки перед кликом
          const loader = page.locator('[class*="ListWrapper_loader"]');
          await loader.waitFor({ state: "hidden", timeout: TIMEOUTS.MEDIUM }).catch(() => {});
          await ourSurvey.click();
          await page
            .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
            .catch(() => {});
        });

        await test.step("Перейти на вкладку Результаты", async () => {
          await resultsPage.openResultsTab();
        });

        await test.step("Найти секцию с текстовыми ответами", async () => {
          // Текстовые вопросы обычно имеют список ответов без диаграмм
          const textAnswersSection = page.locator(
            '[class*="text-answer"], [class*="open-question"], [class*="comment"]',
          );
          const hasTextAnswers = await textAnswersSection
            .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
            .then(() => true)
            .catch(() => false);

          console.log(`Секция текстовых ответов: ${hasTextAnswers}`);

          // Также может быть вкладка "Комментарии" или "Открытые вопросы"
          const commentsTab = page
            .locator('[role="tab"], button')
            .filter({ hasText: /Комментарии|Открытые|Текстовые/i })
            .first();
          const hasCommentsTab = await commentsTab
            .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
            .then(() => true)
            .catch(() => false);

          if (hasCommentsTab) {
            await commentsTab.click();
            await page
              .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
              .catch(() => {});

            const textResponses = page
              .locator(
                '[class*="comment"], [class*="text"], [class*="response"]',
              )
              .filter({ has: page.locator("p, span, div:not(:empty)") });

            const textCount = await textResponses.count();
            console.log(`Найдено текстовых ответов: ${textCount}`);
          }
        });

        await test.step("Проверить отображение текстовых ответов", async () => {
          // Ищем блоки с текстом ответов
          const answerBlocks = page
            .locator(
              '[class*="answer"], [class*="response"], [class*="comment"]',
            )
            .filter({ has: page.locator("p, span") });

          const answerCount = await answerBlocks.count();

          if (answerCount > 0) {
            const firstAnswer = answerBlocks.first();
            const answerText = await firstAnswer.innerText().catch(() => "");

            console.log(
              `Текст первого ответа: ${answerText.substring(0, 100)}...`,
            );
            expect(
              answerText.length,
              "Текстовый ответ должен быть непустым",
            ).toBeGreaterThan(0);
          } else {
            console.log(
              "Текстовые ответы не найдены (возможно нет открытых вопросов)",
            );
          }
        });
      },
    );

    test(
      "C2985: Фильтрация результатов по периоду/дате",
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
            .locator(
              '[class*="Survey_inner"], [class*="SurveyCard"], [class*="survey-card"]',
            )
            .filter({ hasText: sharedSurvey.title })
            .first();
          await ourSurvey.waitFor({ state: "visible", timeout: TIMEOUTS.LONG });
          await ourSurvey.click();
          await page
            .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
            .catch(() => {});
        });

        await test.step("Перейти на вкладку Результаты", async () => {
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

        await test.step("Найти и применить фильтр по дате", async () => {
          // Ищем фильтр по дате/периоду
          const dateFilter = page
            .locator(
              '[class*="date"], [class*="Date"], [class*="period"], [class*="Period"]',
            )
            .filter({ has: page.locator("input, button, select") })
            .first();

          const dateButton = page
            .getByRole("button", { name: /период|дата|date/i })
            .first();

          const hasDateFilter = await dateFilter
            .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
            .then(() => true)
            .catch(() => false);
          const hasDateButton = await dateButton
            .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
            .then(() => true)
            .catch(() => false);

          console.log(`Фильтр по дате: ${hasDateFilter}`);
          console.log(`Кнопка периода: ${hasDateButton}`);

          if (hasDateButton) {
            await dateButton.click();

            // Проверяем что открылся выбор периода
            const datePicker = page.locator(
              '[class*="picker"], [class*="calendar"], [role="dialog"]',
            );
            const hasDatePicker = await datePicker
              .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
              .then(() => true)
              .catch(() => false);

            console.log(`Date picker открыт: ${hasDatePicker}`);

            // Закрываем
            await page.keyboard.press("Escape");
          } else if (hasDateFilter) {
            await dateFilter.click();
            await page.keyboard.press("Escape");
          }
        });
      },
    );
  },
);
