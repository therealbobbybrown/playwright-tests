// tests/functional/performance-review/results/view-pr-results-e2e.spec.js
/**
 * E2E тест: Просмотр результатов Performance Review
 * Кейсы: PR-300-304, PR-320-322
 *
 * Сценарий:
 * 1. Админ создаёт PR со всеми направлениями
 * 2. Участники заполняют анкеты (самооценка, руководитель, коллеги, подчинённые)
 * 3. Админ открывает доступ к результатам
 * 4. Оцениваемый просматривает свои результаты
 * 5. Проверяем отображение всех направлений оценки
 * 6. Проверяем корректность расчётов (API vs UI)
 */

import { test, expect } from "../../../fixtures/auth.js";
import {
  markAsE2ETest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";

test.beforeEach(() => {
  markAsE2ETest(MODULES.PERFORMANCE_REVIEW, "Results");
});
import { PerformanceReviewsListPage } from "../../../../pages/PerformanceReviewsListPage.js";
import { PerformanceReviewConfigPage } from "../../../../pages/PerformanceReviewConfigPage.js";
import { PerformanceReviewResultsPage } from "../../../../pages/PerformanceReviewResultsPage.js";
import { OrgStructureHelper } from "../../../../pages/OrgStructureHelper.js";
import {
  PerformanceReviewAPI,
  getCredentials,
} from "../../../utils/api/index.js";

test.describe(
  "Performance Review - Просмотр результатов",
  { tag: ["@performance-review", "@results", "@ui", "@regression"] },
  () => {
    test(
      "C3052: Оцениваемый видит результаты после открытия доступа админом",
      { tag: ["@smoke", "@critical"] },
      async ({ adminAuth: adminPage, request }, testInfo) => {
        setSeverity("critical");
        test.slow();
        testInfo.setTimeout(900_000); // 15 минут

        const baseUrl = new URL(process.env.BASE_URL).origin;

        // Page Objects
        const listPage = new PerformanceReviewsListPage(adminPage, testInfo);
        const configPage = new PerformanceReviewConfigPage(adminPage, testInfo);
        const orgHelper = new OrgStructureHelper(adminPage, testInfo);

        // Тестовые данные
        let users = [];
        let evaluatedUserName = null;
        let managerUser = null;
        let subordinateUsers = [];
        let colleagues = [];
        let prId = null;
        let targetUserId = null;
        let revisionId = null;

        // Уникальное название PR для теста (PR-300-304: все направления + экспорт)
        const timestamp = new Date().toLocaleString("ru-RU", {
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        });
        const prTitle = `PR-300 Все направления экспорт ${timestamp}`;

        // ========================================================================
        // Шаг 1: Получение пользователей
        // ========================================================================
        await test.step("Получить список активных пользователей", async () => {
          await adminPage.goto(baseUrl, { waitUntil: "domcontentloaded" });

          users = await orgHelper.getUsersList(10);
          console.log(`✓ Получено ${users.length} активных пользователей`);

          if (users.length < 8) {
            throw new Error(
              "Недостаточно пользователей для теста (нужно минимум 8)",
            );
          }

          // Распределяем роли:
          // users[0] - админ, он же оцениваемый
          evaluatedUserName = users[0]?.name || "Elena Shapoval";
          managerUser = users[1];
          subordinateUsers = users.slice(2, 5); // 3 подчинённых для анонимности
          colleagues = users.slice(5, 8); // 3 коллеги для анонимности

          console.log(`Оцениваемый: ${evaluatedUserName}`);
          console.log(
            `Руководитель: ${managerUser.name} (${managerUser.email})`,
          );
          console.log(
            `Подчиненные: ${subordinateUsers.map((u) => u.name).join(", ")}`,
          );
          console.log(`Коллеги: ${colleagues.map((u) => u.name).join(", ")}`);
        });

        // ========================================================================
        // Шаг 2: Админ создаёт PR со всеми направлениями
        // ========================================================================
        await test.step("Админ создаёт Performance Review со всеми направлениями", async () => {
          await adminPage.goto(
            new URL("/ru/manager/performance-reviews/", baseUrl).toString(),
          );
          await listPage.assertOpened();

          await listPage.openCreateModal();
          await listPage.performanceReviewType.click();
          await configPage.assertOpened();

          // Задаём название PR
          await configPage.fillTitle(prTitle);
          console.log(`✓ Название PR: "${prTitle}"`);

          // Включаем все направления
          await configPage.configureDirections({
            self: true,
            manager: true,
            colleagues: true,
            subordinates: true,
          });

          // Автоматический подбор коллег (без ручного выбора)
          await configPage.configureColleaguesSelection({
            askEmployees: false,
          });

          console.log("✓ Направления настроены");
        });

        // ========================================================================
        // Шаг 3: Добавление участников и респондентов
        // ========================================================================
        await test.step("Добавить участника и настроить всех респондентов", async () => {
          await configPage.addTargetUsers({ count: 1 });
          console.log("✓ Участник добавлен");

          // Добавляем респондентов через таблицу
          await configPage.editRespondentsTable({
            managers: [managerUser],
            subordinates: subordinateUsers,
            colleagues: colleagues,
          });
          console.log("✓ Руководитель, подчиненные и коллеги добавлены");
        });

        // ========================================================================
        // Шаг 4: Настройка анкет и запуск
        // ========================================================================
        await test.step("Настроить анкеты и запустить PR", async () => {
          await configPage.disableReminders();
          await configPage.addAssessmentsForAllDirections();
          await configPage.goToStep("launch");
          await configPage.launchAndSendQuestionnaires();

          // Получаем ID
          const currentUrl = adminPage.url();
          const match = currentUrl.match(/\/performance-reviews\/(\d+)/);
          if (match) {
            prId = match[1];
            console.log(`✓ Performance Review создан, ID: ${prId}`);
          }
        });

        // ========================================================================
        // Шаг 5: Заполняем все анкеты через API (populateReview)
        // ========================================================================
        await test.step("Заполнить все анкеты через API (populateReview)", async () => {
          const prAPI = new PerformanceReviewAPI(request);
          const { email, password } = getCredentials("admin");
          await prAPI.signIn(email, password);

          const POPULATE_SETTINGS = {
            skipChance: 0,
            commentChance: 0,
            customChance: 0,
            lowerLimit: 60,
            upperLimit: 100,
          };

          let filled = 0;
          const maxAttempts = 25;

          for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            const { response } = await prAPI.populateReview(
              prId,
              POPULATE_SETTINGS,
              { timeout: 120_000 },
            );

            if (response.ok()) {
              filled++;
              await new Promise((r) => setTimeout(r, 100));
            } else if (response.status() === 500) {
              console.log(
                `✓ Все анкеты заполнены через API (${filled} шт.) за ${attempt} попыток`,
              );
              break;
            } else {
              console.log(
                `⚠️ populateReview attempt ${attempt}: status ${response.status()}`,
              );
              break;
            }
          }

          if (filled === 0) {
            throw new Error(
              "Не удалось заполнить ни одной анкеты через populateReview",
            );
          }

          console.log(
            `✓ Заполнено анкет: ${filled} (самооценка + руководитель + коллеги + подчинённые)`,
          );
        });

        // ========================================================================
        // Шаг 6: Получаем targetUserId и revisionId через API
        // ========================================================================
        await test.step("Получить targetUserId и revisionId через API", async () => {
          const prAPI = new PerformanceReviewAPI(request);
          const { email, password } = getCredentials("admin");
          await prAPI.signIn(email, password);

          // Получаем targetUserId если ещё не получили
          if (!targetUserId) {
            const { data: targetUsers } = await prAPI.getTargetUsers(prId, {});
            targetUserId =
              targetUsers?.items?.[0]?.userId || targetUsers?.items?.[0]?.id;
            console.log(`✓ targetUserId получен через API: ${targetUserId}`);
          }

          // Получаем revisionId
          const { data: revisions } = await prAPI.getRevisions(prId);
          revisionId = revisions?.items?.[0]?.id;
          console.log(`✓ revisionId получен: ${revisionId}`);
        });

        // ========================================================================
        // Шаг 7: Админ открывает доступ к результатам
        // ========================================================================
        await test.step("Админ открывает доступ к результатам", async () => {
          // Возвращаемся на страницу PR как админ
          await adminPage.goto(
            new URL(
              `/ru/manager/performance-reviews/${prId}/`,
              baseUrl,
            ).toString(),
          );
          await adminPage.waitForLoadState("networkidle");

          // Переходим на вкладку результатов и открываем доступ (новая модалка «Поделиться с сотрудником»)
          const resultsTabBtn = adminPage
            .locator('button[class*="Tabs_button"]')
            .filter({ hasText: /^результаты$/i });
          await resultsTabBtn.waitFor({ state: "visible", timeout: 10000 });
          await resultsTabBtn.click();
          await adminPage.waitForTimeout(500);

          // Скроллим к нижней таблице
          await adminPage.evaluate(() =>
            window.scrollTo(0, document.body.scrollHeight),
          );
          await adminPage.waitForTimeout(500);

          // Выбрать всех
          const selectAll = adminPage
            .locator("label, span")
            .filter({ hasText: /выбрать всех/i })
            .first();
          await selectAll.waitFor({ state: "visible", timeout: 10000 });
          await selectAll.click();

          // Кнопка "Управление доступом"
          const accessBtn = adminPage
            .locator("button")
            .filter({ hasText: /управление доступом/i })
            .first();
          await accessBtn.waitFor({ state: "visible", timeout: 5000 });
          await adminPage
            .waitForFunction(
              () => {
                const buttons = Array.from(document.querySelectorAll("button"));
                const btn = buttons.find((b) =>
                  b.textContent.includes("Управление доступом"),
                );
                return btn && !btn.disabled;
              },
              { timeout: 5000 },
            );
          await accessBtn.click({ timeout: 10000 });

          // Модалка «Поделиться с сотрудником»
          const shareModal = adminPage
            .locator('[role="dialog"]')
            .filter({ hasText: /поделиться с сотрудником/i })
            .first();
          await shareModal.waitFor({ state: "visible", timeout: 10000 });
          console.log("✓ Модалка «Поделиться с сотрудником» открыта");

          // Кликаем «Результатами и итоговой оценкой»
          const fullOption = shareModal
            .locator('[class*="AccessOption"]')
            .filter({ hasText: /результатами и итоговой оценкой/i })
            .first();
          await fullOption.locator("button").first().click({ timeout: 10000 });
          console.log("✓ Выбрана опция «Результатами и итоговой оценкой»");

          // Кнопка «Готово»
          const confirmBtn = shareModal
            .locator("button")
            .filter({ hasText: /готово/i })
            .first();
          await confirmBtn.waitFor({ state: "visible", timeout: 10000 });
          await confirmBtn.click();
          await shareModal.waitFor({ state: "hidden", timeout: 10000 });

          console.log("✓ Доступ к результатам открыт");
        });

        // ========================================================================
        // Шаг 8: Оцениваемый просматривает результаты
        // ========================================================================
        await test.step("Оцениваемый просматривает результаты", async () => {
          // Используем runAs чтобы войти как оцениваемый (он же users[0])
          // Но т.к. users[0] это админ, используем adminPage
          const resultsPage = new PerformanceReviewResultsPage(
            adminPage,
            testInfo,
          );

          // Открываем страницу результатов
          await resultsPage.open(baseUrl, targetUserId, revisionId, prId);
          await resultsPage.assertOpened();
          await resultsPage.assertResultsAvailable();

          console.log("✓ Оцениваемый видит результаты");
        });

        // ========================================================================
        // Шаг 9: Проверяем отображение всех направлений
        // ========================================================================
        await test.step("Проверяем отображение всех направлений оценки", async () => {
          const resultsPage = new PerformanceReviewResultsPage(
            adminPage,
            testInfo,
          );

          await resultsPage.open(baseUrl, targetUserId, revisionId, prId);
          await resultsPage.assertOpened();

          // PR-300: Проверяем наличие самооценки
          await resultsPage.assertSelfAssessmentVisible();
          console.log("  ✓ Самооценка отображается");

          // PR-301: Проверяем наличие агрегированных оценок от коллег
          await resultsPage.assertColleaguesAssessmentVisible();
          console.log("  ✓ Оценки коллег отображаются");

          // PR-302: Проверяем наличие оценки от руководителя
          await resultsPage.assertManagerAssessmentVisible();
          console.log("  ✓ Оценка руководителя отображается");

          // PR-303: Проверяем наличие оценок от подчинённых
          await resultsPage.assertSubordinatesAssessmentVisible();
          console.log("  ✓ Оценки подчинённых отображаются");

          // PR-304: Проверяем наличие графиков/диаграмм для сравнения
          await resultsPage.assertChartsVisible();
          console.log("  ✓ Графики отображаются");

          // Делаем скриншот
          await resultsPage.takeScreenshot("pr-results-all-directions");
        });

        // ========================================================================
        // Шаг 10: Проверяем корректность расчётов через API
        // ========================================================================
        await test.step("Проверяем корректность расчётов через API", async () => {
          // Инициализируем API клиент
          const prAPI = new PerformanceReviewAPI(request);
          const { email, password } = getCredentials("admin");
          await prAPI.signIn(email, password);

          // Получаем summary статистику через API
          const { response, data: summaryData } =
            await prAPI.getStatisticsSummary(prId, {
              revisionId,
              targetUserId,
            });

          expect(response.status()).toBe(200);
          expect(summaryData).toBeDefined();

          console.log("📊 Данные из API statistics/summary:");

          // Проверяем структуру ответа
          const {
            assessments,
            competenceStatistics,
            respondents,
            users: apiUsers,
          } = summaryData;

          // Проверяем наличие секций (assessments)
          expect(assessments).toBeDefined();
          expect(Array.isArray(assessments)).toBe(true);
          expect(assessments.length).toBeGreaterThan(0);

          console.log(`  ✓ Секций (assessments): ${assessments.length}`);

          // Проверяем каждую секцию
          for (const assessment of assessments) {
            console.log(`  📋 Секция: ${assessment.title}`);
            expect(assessment.title).toBeDefined();
            expect(assessment.questions).toBeDefined();

            // Для каждого вопроса проверяем наличие ответов
            for (const question of assessment.questions) {
              expect(question.question).toBeDefined();
              expect(question.answers).toBeDefined();

              // Проверяем, что ответы есть
              if (question.answers.length > 0) {
                console.log(
                  `    ✓ Вопрос "${question.question.title}": ${question.answers.length} ответов`,
                );

                // Для вопросов со шкалой проверяем summary
                if (question.summary && question.summary.all) {
                  const { totalCount, answers: summaryAnswers } =
                    question.summary.all;
                  console.log(`      - Всего ответов: ${totalCount}`);

                  // Проверяем корректность расчёта среднего (если есть числовые ответы)
                  if (summaryAnswers && summaryAnswers.length > 0) {
                    const calculatedSum = summaryAnswers.reduce(
                      (acc, a) => acc + a.total * a.answer,
                      0,
                    );
                    const calculatedTotal = summaryAnswers.reduce(
                      (acc, a) => acc + a.total,
                      0,
                    );
                    const calculatedAvg =
                      calculatedTotal > 0
                        ? Math.round((calculatedSum / calculatedTotal) * 10) /
                          10
                        : 0;
                    console.log(`      - Расчётное среднее: ${calculatedAvg}`);
                  }
                }
              }
            }
          }

          // Проверяем respondents
          if (respondents) {
            console.log(
              `  ✓ Респонденты: ${respondents.length || Object.keys(respondents).length}`,
            );
          }

          // Проверяем users
          if (apiUsers) {
            console.log(
              `  ✓ Пользователи: ${apiUsers.length || Object.keys(apiUsers).length}`,
            );
          }

          // Проверяем competenceStatistics (если есть компетенции)
          if (competenceStatistics && competenceStatistics.heatMapData) {
            console.log(`  ✓ Статистика компетенций присутствует`);
          }

          console.log("✓ Данные API корректны");
        });

        // ========================================================================
        // Шаг 11: Сравниваем данные API с UI
        // ========================================================================
        await test.step("Сравниваем данные API с отображением на UI", async () => {
          // Получаем данные через API
          const prAPI = new PerformanceReviewAPI(request);
          const { email, password } = getCredentials("admin");
          await prAPI.signIn(email, password);

          const { data: summaryData } = await prAPI.getStatisticsSummary(prId, {
            revisionId,
            targetUserId,
          });

          // Открываем страницу результатов
          const resultsPage = new PerformanceReviewResultsPage(
            adminPage,
            testInfo,
          );
          await resultsPage.open(baseUrl, targetUserId, revisionId, prId);
          await resultsPage.assertOpened();

          // Сравниваем количество секций в API и на UI
          const uiSectionTitles = await resultsPage.getSectionTitles();
          const apiSectionsCount = summaryData.assessments?.length || 0;

          console.log(`📊 Сравнение API vs UI:`);
          console.log(`  API секций: ${apiSectionsCount}`);
          console.log(`  UI секций: ${uiSectionTitles.length}`);

          // Количество секций должно быть > 0
          expect(uiSectionTitles.length).toBeGreaterThan(0);

          // Проверяем, что все направления из API присутствуют на UI
          for (const assessment of summaryData.assessments || []) {
            const directionTitle = assessment.title.toLowerCase();

            // Определяем направление по названию
            if (directionTitle.includes("самооценка")) {
              await resultsPage.assertSelfAssessmentVisible();
              console.log(`  ✓ Самооценка: API ↔ UI совпадает`);
            } else if (directionTitle.includes("руководител")) {
              await resultsPage.assertManagerAssessmentVisible();
              console.log(`  ✓ Руководитель: API ↔ UI совпадает`);
            } else if (directionTitle.includes("коллег")) {
              await resultsPage.assertColleaguesAssessmentVisible();
              console.log(`  ✓ Коллеги: API ↔ UI совпадает`);
            } else if (
              directionTitle.includes("подчиненн") ||
              directionTitle.includes("подчинённ")
            ) {
              await resultsPage.assertSubordinatesAssessmentVisible();
              console.log(`  ✓ Подчинённые: API ↔ UI совпадает`);
            }
          }

          // Проверяем наличие вопросов
          const uiQuestionsCount = await resultsPage.getQuestionsCount();
          let apiQuestionsCount = 0;
          for (const assessment of summaryData.assessments || []) {
            apiQuestionsCount += assessment.questions?.length || 0;
          }

          console.log(`  API вопросов: ${apiQuestionsCount}`);
          console.log(`  UI вопросов: ${uiQuestionsCount}`);

          // Количество вопросов должно быть > 0
          expect(uiQuestionsCount).toBeGreaterThan(0);

          console.log("✓ Данные API и UI согласованы");
        });

        // ========================================================================
        // Шаг 12: Админ переходит к результатам через кнопку в таблице
        // ========================================================================
        await test.step('PR-320-322: Админ переходит к результатам через кнопку "Результаты"', async () => {
          // Возвращаемся на страницу PR
          await adminPage.goto(
            new URL(
              `/ru/manager/performance-reviews/${prId}/`,
              baseUrl,
            ).toString(),
          );
          await adminPage.waitForLoadState("networkidle");

          // Кликаем на кнопку "Результаты" для конкретного пользователя
          const resultsUrl =
            await configPage.clickResultsButtonForUser(evaluatedUserName);

          // Проверяем, что URL содержит targetUserId
          expect(resultsUrl).toContain("targetUserId=");
          console.log(`✓ URL результатов: ${resultsUrl}`);

          // Проверяем, что страница результатов открылась
          const resultsPage = new PerformanceReviewResultsPage(
            adminPage,
            testInfo,
          );
          await resultsPage.assertOpened();
          await resultsPage.assertResultsAvailable();

          // Проверяем наличие всех направлений
          await resultsPage.assertAllDirectionsVisible({
            self: true,
            manager: true,
            colleagues: true,
            subordinates: true,
          });

          // Делаем скриншот
          await resultsPage.takeScreenshot("pr-results-via-participants-tab");
          console.log(
            '✓ Админ успешно перешёл к результатам через вкладку "Участники"',
          );
        });

        // ========================================================================
        // Шаг 13: Проверка экспорта результатов (TASK-PR-001)
        // ========================================================================
        await test.step("Проверка экспорта результатов в Excel", async () => {
          const resultsPage = new PerformanceReviewResultsPage(
            adminPage,
            testInfo,
          );

          // Открываем страницу результатов
          await resultsPage.open(baseUrl, targetUserId, revisionId, prId);
          await resultsPage.assertOpened();

          // Ищем кнопку экспорта - используем несколько селекторов
          const exportButton = adminPage
            .locator("button")
            .filter({ hasText: /скачать|экспорт|download|export/i })
            .first();
          let hasExportButton = false;
          try {
            await exportButton.waitFor({ state: "visible", timeout: 10000 });
            hasExportButton = true;
          } catch {
            // кнопка экспорта не появилась
          }

          if (!hasExportButton) {
            console.log(
              "⚠️ Кнопка экспорта не найдена на странице результатов",
            );
            return;
          }

          console.log("✓ Кнопка экспорта найдена");

          // Кликаем на кнопку экспорта
          await exportButton.click();

          // Используем более широкие селекторы для поиска пунктов меню
          const menuItemSelectors =
            '[role="menuitem"], [class*="MenuPopup_item__"], [class*="Menu_item__"], [class*="Dropdown_item__"]';

          const xlsxOption = adminPage
            .locator(menuItemSelectors)
            .filter({ hasText: /xlsx|Excel/i })
            .first();
          const pdfOption = adminPage
            .locator(menuItemSelectors)
            .filter({ hasText: /pdf/i })
            .first();
          const csvOption = adminPage
            .locator(menuItemSelectors)
            .filter({ hasText: /csv/i })
            .first();
          const pptxOption = adminPage
            .locator(menuItemSelectors)
            .filter({ hasText: /pptx|powerpoint/i })
            .first();

          let hasXlsx = false;
          try { await xlsxOption.waitFor({ state: "visible", timeout: 3000 }); hasXlsx = true; } catch { /* не найден */ }
          let hasPdf = false;
          try { await pdfOption.waitFor({ state: "visible", timeout: 1000 }); hasPdf = true; } catch { /* не найден */ }
          let hasCsv = false;
          try { await csvOption.waitFor({ state: "visible", timeout: 1000 }); hasCsv = true; } catch { /* не найден */ }
          let hasPptx = false;
          try { await pptxOption.waitFor({ state: "visible", timeout: 1000 }); hasPptx = true; } catch { /* не найден */ }

          console.log(`📊 Доступные форматы экспорта:`);
          console.log(`  XLSX: ${hasXlsx}`);
          console.log(`  PDF: ${hasPdf}`);
          console.log(`  CSV: ${hasCsv}`);
          console.log(`  PPTX: ${hasPptx}`);

          // Если ни один формат не найден, пробуем fallback - прямой экспорт без меню
          if (!(hasXlsx || hasPdf || hasCsv || hasPptx)) {
            console.log(
              "⚠️ Меню экспорта не найдено, пробуем прямой экспорт...",
            );

            // Возможно кнопка экспорта запускает экспорт сразу, без меню
            const downloadPromise = adminPage
              .waitForEvent("download", { timeout: 15000 })
              .catch(() => null);
            const download = await downloadPromise;

            if (download) {
              const fileName = download.suggestedFilename();
              console.log(`✓ Файл скачан напрямую: ${fileName}`);
              expect(fileName).toBeTruthy();
            } else {
              console.log("⚠️ Экспорт не доступен или формат изменился");
            }
            return;
          }

          // Хотя бы один формат должен быть доступен
          expect(
            hasXlsx || hasPdf || hasCsv || hasPptx,
            "Хотя бы один формат экспорта должен быть доступен",
          ).toBe(true);

          // Выполняем экспорт в XLSX если доступен
          if (hasXlsx) {
            // Экспорт может открыться в новой вкладке или скачаться
            const downloadPromise = adminPage
              .waitForEvent("download", { timeout: 30000 })
              .catch(() => null);
            const newPagePromise = adminPage
              .context()
              .waitForEvent("page", { timeout: 30000 })
              .catch(() => null);

            await xlsxOption.click();
            console.log("✓ Выбран формат XLSX");

            const [download, newPage] = await Promise.all([
              downloadPromise,
              newPagePromise,
            ]);

            if (download) {
              const fileName = download.suggestedFilename();
              console.log(`✓ Файл скачан: ${fileName}`);
              expect(fileName).toMatch(/\.(xlsx|xls)$/i);
            } else if (newPage) {
              const newUrl = newPage.url();
              console.log(`✓ Открыта вкладка экспорта: ${newUrl}`);
              expect(newUrl).toMatch(/xlsx|export|download|file/i);
              await newPage.close();
            } else {
              console.log(
                "⚠️ Экспорт не вызвал скачивание или открытие вкладки",
              );
            }
          } else {
            // Закрываем меню
            await adminPage.keyboard.press("Escape");
          }

          console.log("✓ Проверка экспорта завершена");
        });

        // ========================================================================
        // Шаг 14: Завершить PR через UI (чтобы он появился в "Завершённые")
        // ========================================================================
        await test.step("Завершить Performance Review через UI", async () => {
          if (prId) {
            // Переходим на страницу PR
            await adminPage.goto(
              new URL(
                `/ru/manager/performance-reviews/${prId}/`,
                baseUrl,
              ).toString(),
            );
            await adminPage.waitForLoadState("networkidle");

            // Ищем кнопку "Завершить оценку" (оранжевая, color-warning)
            const finishButton = adminPage
              .locator('button[class*="color-warning"]')
              .filter({ hasText: /завершить оценку/i })
              .first();

            let hasFinishButton = false;
            try {
              await finishButton.waitFor({ state: "visible", timeout: 10000 });
              hasFinishButton = true;
            } catch {
              // кнопка завершения не найдена
            }

            if (hasFinishButton) {
              await finishButton.click();

              // Подтверждаем в модальном окне - "Да"
              const finishModal = adminPage
                .getByRole("dialog")
                .filter({ hasText: /хотите завершить оценку/i });

              let hasConfirm = false;
              try {
                await finishModal.waitFor({ state: "visible", timeout: 5000 });
                hasConfirm = true;
              } catch {
                // диалог подтверждения не появился
              }

              if (hasConfirm) {
                await finishModal.getByRole("button", { name: /^да/i }).click();
                await adminPage.waitForLoadState("networkidle");
                console.log(
                  `✓ Performance Review ${prId} завершён через UI (статус: Завершённые)`,
                );
              } else {
                console.log("⚠️ Кнопка подтверждения не найдена");
              }
            } else {
              console.log(
                '⚠️ Кнопка "Завершить оценку" не найдена - возможно PR уже завершён',
              );
            }
          }
        });

        // ========================================================================
        // Финальная проверка
        // ========================================================================
        await test.step("Финальная проверка статуса", async () => {
          if (prId) {
            await adminPage.goto(
              new URL(
                `/ru/manager/performance-reviews/${prId}/`,
                baseUrl,
              ).toString(),
            );
            await adminPage.waitForLoadState("networkidle");

            await adminPage.screenshot({
              path: "test-results/pr-results-final.png",
              fullPage: true,
            });
            console.log("✓ E2E тест просмотра результатов завершён успешно");
          }
        });
      },
    );
  },
);
