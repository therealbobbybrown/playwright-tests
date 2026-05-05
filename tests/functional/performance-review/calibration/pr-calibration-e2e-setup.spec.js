// tests/functional/performance-review/calibration/pr-calibration-e2e-setup.spec.js
// E2E тест: создание PR с анкетой с компетенциями, заполнение всеми направлениями, настройка калибровки

import { test, expect } from "../../../fixtures/auth.js";
import { PerformanceReviewsListPage } from "../../../../pages/PerformanceReviewsListPage.js";
import { PerformanceReviewConfigPage } from "../../../../pages/PerformanceReviewConfigPage.js";
import { PerformanceReviewFillPage } from "../../../../pages/PerformanceReviewFillPage.js";
import { OrgStructureHelper } from "../../../../pages/OrgStructureHelper.js";
import {
  PerformanceReviewAPI,
  getCredentials,
} from "../../../utils/api/index.js";
import {
  markAsE2ETest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";
import { buildPRUrl } from "../../../utils/pr-urls.js";

/**
 * E2E тест для подготовки данных калибровки
 *
 * Сценарий:
 * 1. Создать PR со всеми направлениями (самооценка, руководитель, коллеги, подчиненные)
 * 2. Использовать анкету с компетенциями и группами компетенций
 * 3. Добавить участников с известными пользователями
 * 4. Запустить PR и заполнить все анкеты
 * 5. Включить калибровку в настройках статистики
 * 6. Готово для тестирования калибровки
 *
 * ВАЖНО: Для этого теста нужна анкета с компетенциями!
 * Анкета должна содержать:
 * - Вопросы, размеченные компетенциями
 * - Группы компетенций (опционально)
 */
test.describe(
  "PR Calibration E2E Setup",
  {
    tag: ["@performance-review", "@calibration", "@e2e", "@regression", "@ui"],
  },
  () => {
    test.beforeEach(() => {
      markAsE2ETest(MODULES.PERFORMANCE_REVIEW, "Calibration Setup");
    });

    // Название анкеты с компетенциями (нужно указать существующую или создать)
    // Варианты: "Анкета с компетенциями", "Competence Assessment", или часть названия
    const ASSESSMENT_WITH_COMPETENCIES =
      process.env.COMPETENCY_ASSESSMENT_NAME || "компетенц";

    test(
      "C4099: Полный E2E: создать PR с компетенциями, заполнить все направления, настроить калибровку",
      { tag: ["@critical", "@slow"] },
      async ({ adminAuth: adminPage, request }, testInfo) => {
        setSeverity("critical");
        test.slow();
        testInfo.setTimeout(900_000); // 15 минут

        const listPage = new PerformanceReviewsListPage(adminPage, testInfo);
        const configPage = new PerformanceReviewConfigPage(adminPage, testInfo);
        const adminFillPage = new PerformanceReviewFillPage(
          adminPage,
          testInfo,
        );
        const orgHelper = new OrgStructureHelper(adminPage, testInfo);
        const baseUrl = new URL(process.env.BASE_URL).origin;

        let users = [];
        let colleagues = [];
        let managerUser = null;
        let subordinateUsers = [];
        let prId = null;
        let evaluatedUserName = null;

        // ===== ШАГ 1: Получение пользователей =====
        await test.step("Получить список активных пользователей с нужными ролями", async () => {
          await adminPage.goto(baseUrl, { waitUntil: "domcontentloaded" });

          users = await orgHelper.getUsersList(10);
          console.log(`✓ Получено ${users.length} активных пользователей`);

          if (users.length < 6) {
            console.log(
              "⚠️ Недостаточно пользователей, используем тех что есть",
            );
          }

          // Распределение ролей:
          // users[0] - админ (оцениваемый)
          // users[1] - руководитель
          // users[2-3] - подчиненные
          // users[4+] - коллеги
          evaluatedUserName = users[0]?.name || "Admin User";
          managerUser = users[1] || users[0];
          subordinateUsers = users.slice(2, 4);
          colleagues = users.slice(4);

          console.log(`📋 Распределение ролей:`);
          console.log(`   Оцениваемый: ${evaluatedUserName}`);
          console.log(`   Руководитель: ${managerUser?.name}`);
          console.log(`   Подчиненные: ${subordinateUsers.length}`);
          console.log(`   Коллеги: ${colleagues.length}`);
        });

        // ===== ШАГ 2: Создание PR со всеми направлениями =====
        await test.step("Создать Performance Review со всеми направлениями оценки", async () => {
          await adminPage.goto(
            new URL("/ru/manager/performance-reviews/", baseUrl).toString(),
          );
          await listPage.assertOpened();

          await listPage.openCreateModal();
          await listPage.performanceReviewType.click();
          await configPage.assertOpened();

          // Установить название с меткой калибровки
          const prTitle = `Calibration_E2E_${Date.now()}`;
          await configPage.fillTitle(prTitle);

          // Включить ВСЕ направления
          await configPage.configureDirections({
            self: true,
            manager: true,
            colleagues: true,
            subordinates: true,
          });

          // Настройка подбора коллег (автоматически, без утверждения)
          await configPage.configureColleaguesSelection({
            askEmployees: true,
            minColleagues: 1,
            maxColleagues: 2,
            managerApproval: false,
            earlyAccess: false,
          });

          console.log("✓ PR создан со всеми направлениями");
        });

        // ===== ШАГ 3: Добавление участников =====
        await test.step("Добавить участников и настроить респондентов", async () => {
          await configPage.addTargetUsers({ count: 1 });
          console.log("✓ Оцениваемый добавлен");

          // Настроить руководителя и подчиненных
          if (managerUser && subordinateUsers.length > 0) {
            await configPage.editRespondentsTable({
              managers: [managerUser],
              subordinates: subordinateUsers,
            });
            console.log("✓ Руководитель и подчиненные настроены");
          }
        });

        // ===== ШАГ 4: Добавление анкеты с компетенциями =====
        await test.step("Добавить анкету с компетенциями для всех направлений", async () => {
          await configPage.disableReminders();

          // ВАЖНО: Ищем анкету с компетенциями
          // Метод addAssessmentsForAllDirections принимает targetAssessment для поиска по названию
          await configPage.addAssessmentsForAllDirections(
            ASSESSMENT_WITH_COMPETENCIES,
          );

          console.log(
            `✓ Анкеты добавлены (поиск: "${ASSESSMENT_WITH_COMPETENCIES}")`,
          );
        });

        // ===== ШАГ 5: Запуск PR =====
        await test.step("Запустить PR и отправить на этап подбора коллег", async () => {
          await configPage.goToStep("launch");

          // Если есть этап подбора коллег
          try {
            await configPage.sendForColleagueSelection();
            console.log("✓ PR отправлен на этап подбора коллег");
          } catch (e) {
            // Если нет этапа подбора - сразу запускаем
            await configPage.launchAndSendQuestionnaires();
            console.log("✓ PR запущен и анкеты отправлены");
          }

          // Получить ID PR
          const currentUrl = adminPage.url();
          const match = currentUrl.match(/\/performance-reviews\/(\d+)/);
          if (match) {
            prId = match[1];
            console.log(`✓ PR ID: ${prId}`);
          }
        });

        // ===== ШАГ 6: Завершить этап подбора коллег и отправить анкеты =====
        await test.step("Завершить этап подбора коллег и отправить анкеты", async () => {
          // Переходим на admin-страницу PR для управления этапом
          await adminPage.goto(
            new URL(
              `/ru/manager/performance-reviews/${prId}/`,
              baseUrl,
            ).toString(),
          );
          await adminPage.waitForLoadState("networkidle");

          // Пробуем завершить текущий этап (подбор коллег) и отправить анкеты
          try {
            await configPage.completeCurrentStage();
            console.log("✓ Этап подбора коллег завершён");
          } catch (e) {
            console.log(
              `⚠️ completeCurrentStage не удался (${e.message?.slice(0, 80)}), пробуем отправить анкеты напрямую...`,
            );
          }

          try {
            await configPage.sendQuestionnaires();
            console.log("✓ Анкеты отправлены");
          } catch (e) {
            console.log(
              `⚠️ sendQuestionnaires не удался (${e.message?.slice(0, 80)}), пробуем launchAndSendQuestionnaires...`,
            );
            // Fallback: на некоторых этапах кнопка "Отправить" имеет другой текст
            try {
              await configPage.launchAndSendQuestionnaires();
              console.log(
                "✓ Анкеты отправлены через launchAndSendQuestionnaires",
              );
            } catch (e2) {
              console.log(
                `⚠️ Не удалось отправить анкеты (${e2.message?.slice(0, 80)})`,
              );
            }
          }
        });

        // ===== ШАГ 7: Заполнение ВСЕХ анкет через API =====
        await test.step("Заполнить все анкеты через populateReview API", async () => {
          const prAPI = new PerformanceReviewAPI(request);
          const { email, password } = getCredentials("admin");
          await prAPI.signIn(email, password);

          const populateSettings = {
            skipChance: 0,
            commentChance: 0,
            customChance: 0,
            lowerLimit: 60,
            upperLimit: 100,
          };
          // populateReview заполняет одну незаполненную анкету за вызов — цикл до исчерпания
          const maxAttempts = 20;
          let filledCount = 0;
          for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            const { response } = await prAPI.populateReview(
              prId,
              populateSettings,
              { timeout: 120000 },
            );
            if (response.ok()) {
              filledCount++;
              console.log(`populateReview #${filledCount} OK`);
              await new Promise((r) => setTimeout(r, 200));
            } else if (response.status() === 500) {
              console.log(
                `populateReview: все анкеты заполнены (${filledCount} итераций)`,
              );
              break;
            } else {
              console.log(
                `populateReview: статус ${response.status()}, прерываем`,
              );
              break;
            }
          }
          if (filledCount === 0)
            throw new Error("populateReview не заполнил ни одной анкеты");
          console.log(`✓ Заполнено ${filledCount} анкет через populateReview`);
        });

        // ===== ШАГ 8: Включение калибровки в настройках статистики =====
        await test.step("Включить калибровку в настройках статистики", async () => {
          // Используем API для настройки, т.к. вкладка "Результаты" может быть
          // недоступна (disabled) если PR ещё не дошёл до этапа результатов
          // (например, populateReview не заполнил анкеты).
          const prAPI = new PerformanceReviewAPI(request);
          const { email, password } = getCredentials("admin");
          await prAPI.signIn(email, password);

          const featureUrl = `/manager/performance-reviews/${prId}/statistics/settings/?feature=statisticsSettings`;
          const { data: settings } = await prAPI.get(featureUrl);
          const { response: updateResp } = await prAPI.post(featureUrl, {
            ...settings,
            settings: {
              ...(settings?.settings || {}),
              useOnlyHeadReceiver: true,
              enableCompetenceWeights: true,
              enableCalibration: true,
              enableResponsesOverwriting: true,
              displayCompetenceWeightsForOverwriting: true,
              enableCustomCharacteristics: true,
            },
            characteristicSettings: [
              { threshold: 33, title: "Низко", category: "negative" },
              { threshold: 66, title: "Средне", category: "neutral" },
              { threshold: 100, title: "Высоко", category: "positive" },
            ],
          });

          if (updateResp.ok()) {
            console.log("✓ Калибровка включена через API");
          } else {
            console.log(
              `⚠️ Не удалось включить калибровку: ${updateResp.status()} ${await updateResp.text().catch(() => "")}`,
            );
          }
        });

        // ===== ШАГ 9: Финальная проверка =====
        await test.step("Проверить готовность к калибровке", async () => {
          // Перезагрузить страницу — после сохранения настроек UI должен показать столбцы калибровки
          await adminPage.goto(buildPRUrl(prId, { statisticsSettings: true }));
          await adminPage.waitForLoadState("networkidle");

          // Нажать вкладку "Результаты"
          const resultsTab = adminPage
            .locator('button[class*="Tabs_button"]')
            .filter({ hasText: /результаты/i });
          await resultsTab.click({ force: true });
          await adminPage.waitForLoadState("networkidle", { timeout: 3000 });

          // Проверить наличие столбцов калибровки в заголовке таблицы
          const preCalColumn = adminPage
            .locator("th")
            .filter({ hasText: /до калибровки/i });
          const postCalColumn = adminPage
            .locator("th")
            .filter({ hasText: /после калибровки/i });

          const preVisible = await preCalColumn
            .waitFor({ state: "visible", timeout: 5000 })
            .then(() => true)
            .catch(() => false);
          const postVisible = await postCalColumn
            .waitFor({ state: "visible", timeout: 3000 })
            .then(() => true)
            .catch(() => false);

          // Проверить наличие карандаша калибровки (OverwriteButton)
          // Локатор 1: CSS-класс OverwriteButton
          const pencilByClass = adminPage
            .locator(
              '[class*="OverwriteButton"] button, button[class*="OverwriteButton"]',
            )
            .first();
          // Локатор 2: иконка-кнопка в строке калибровочной таблицы (таблица с "до калибровки")
          const calibrationTable = adminPage
            .locator("table")
            .filter({ has: adminPage.locator('th:has-text("до калибровки")') })
            .first();
          const iconButtons = calibrationTable
            .locator(
              'tbody tr td:last-child button:not(:has-text("Результаты"))',
            )
            .first();

          let hasPencil = await pencilByClass
            .waitFor({ state: "visible", timeout: 5000 })
            .then(() => true)
            .catch(() => false);
          if (!hasPencil) {
            // Fallback: ищем иконку-кнопку в последней ячейке (без текста)
            hasPencil = await iconButtons
              .waitFor({ state: "visible", timeout: 3000 })
              .then(() => true)
              .catch(() => false);
            if (hasPencil) {
              console.log(
                "   Иконка найдена через fallback-локатор (icon button в последней ячейке)",
              );
            }
          }

          console.log("\n📊 Результат E2E setup:");
          console.log(`   PR ID: ${prId}`);
          console.log(`   Столбец "До калибровки": ${preVisible ? "✓" : "✗"}`);
          console.log(
            `   Столбец "После калибровки": ${postVisible ? "✓" : "✗"}`,
          );
          console.log(
            `   Иконка калибровки (карандаш): ${hasPencil ? "✓" : "✗"}`,
          );

          // Скриншот готового PR
          await adminPage.screenshot({
            path: "test-results/pr-calibration-e2e-ready.png",
            fullPage: true,
          });

          // Сохранить ID для последующих тестов
          console.log(
            `\n🔑 Для тестов калибровки используйте: TEST_PR_ID=${prId}`,
          );

          // Ассерты: оба столбца калибровки должны быть видны по отдельности
          expect(
            preVisible,
            'Столбец "До калибровки" должен быть виден в заголовке таблицы',
          ).toBe(true);
          expect(
            postVisible,
            'Столбец "После калибровки" должен быть виден в заголовке таблицы',
          ).toBe(true);
          expect(
            hasPencil,
            "Иконка калибровки (карандаш OverwriteButton) должна быть видна",
          ).toBe(true);
        });
      },
    );

    test(
      "C4100: Быстрый setup: использовать существующий PR с компетенциями",
      { tag: [] },
      async ({ adminAuth: page, request }, testInfo) => {
        setSeverity("normal");

        let prId = null;

        await test.step("Найти активный PR с компетенциями через API", async () => {
          const prAPI = new PerformanceReviewAPI(request);
          const { email, password } = getCredentials("admin");
          await prAPI.signIn(email, password);

          const { data } = await prAPI.getList();
          const items = data?.items || data || [];
          const activePr = items.find((p) => p.status === "active");

          if (!activePr) {
            throw new Error(
              "Активный PR не найден — запустите полный E2E setup (C4099) или seed",
            );
          }

          prId = activePr.id;
          console.log(
            `✓ Найден активный PR: ${prId} (${activePr.title || ""})`,
          );
        });

        await test.step("Проверить наличие компетенций на странице результатов", async () => {
          // Прогрев: открыть PR без feature flag во избежание SSR 500
          await page.goto(buildPRUrl(prId));
          await page.waitForLoadState("networkidle");

          // Перейти на страницу статистики с feature flag
          await page.goto(buildPRUrl(prId, { statisticsSettings: true }));
          await page.waitForLoadState("networkidle");

          // Переключиться на вкладку «Результаты»
          const resultsTab = page
            .locator('button[class*="Tabs_button"]')
            .filter({ hasText: /результаты/i });
          await resultsTab.click({ force: true });
          await page.waitForLoadState("networkidle", { timeout: 5000 });

          // Проверить наличие данных по компетенциям.
          // На странице результатов с компетенциями отображаются кнопки «Карта компетенций»
          // и «Радар компетенций», а также переключатель «Группы» / «Компетенции».
          const competenciesSection = page
            .getByRole("button", { name: /карта компетенций/i })
            .first();
          const hasCompetencies = await competenciesSection
            .waitFor({ state: "visible", timeout: 8000 })
            .then(() => true)
            .catch(() => false);

          console.log(
            `Компетенции в PR: ${hasCompetencies ? "✓ есть" : "✗ нет"}`,
          );
          expect(
            hasCompetencies,
            "PR должен содержать компетенции — нужна анкета с размеченными компетенциями",
          ).toBe(true);

          await page.screenshot({
            path: "test-results/pr-quick-check.png",
            fullPage: false,
          });
        });
      },
    );
  },
);
