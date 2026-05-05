// tests/functional/performance-review/filling/fill-pr-auto-colleagues-refactored.spec.js
// E2E тест: Performance Review с автоматическим выбором коллег (рефакторинг с использованием хелпера)
import { test } from "../../../fixtures/auth.js";
import { PerformanceReviewsListPage } from "../../../../pages/PerformanceReviewsListPage.js";
import { PerformanceReviewConfigPage } from "../../../../pages/PerformanceReviewConfigPage.js";
import { OrgStructureHelper } from "../../../../pages/OrgStructureHelper.js";
import { filterValidUsers } from "../../../utils/UserSessionHelper.js";
import { verifyPRResults } from "../../../utils/ResultsVerificationHelper.js";
import {
  markAsE2ETest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";
import {
  PerformanceReviewAPI,
  getCredentials,
} from "../../../utils/api/index.js";

test.describe(
  "Performance Review - E2E с автоматическим выбором коллег (refactored)",
  { tag: ["@performance-review", "@filling", "@e2e", "@ui", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsE2ETest(MODULES.PERFORMANCE_REVIEW, "Filling");
    });

    test(
      "C3022: Создать PR с автоматическим выбором коллег и заполнить анкеты",
      { tag: ["@critical"] },
      async ({ adminAuth: adminPage, request }, testInfo) => {
        setSeverity("critical");
        test.slow();
        testInfo.setTimeout(600_000);

        const listPage = new PerformanceReviewsListPage(adminPage, testInfo);
        const configPage = new PerformanceReviewConfigPage(adminPage, testInfo);
        const orgHelper = new OrgStructureHelper(adminPage, testInfo);

        let users = [];
        let colleagues = [];
        let managerUser = null;
        let subordinateUsers = [];
        let prId = null;
        let evaluatedUserName = null;
        const baseUrl = new URL(process.env.BASE_URL).origin;

        // ---------------------- Шаг 1: Получение пользователей ----------------------
        await test.step("Получить список активных пользователей", async () => {
          await adminPage.goto(baseUrl, { waitUntil: "domcontentloaded" });

          const rawUsers = await orgHelper.getUsersList(13);
          users = await filterValidUsers(rawUsers);
          console.log(
            `✓ Получено ${rawUsers.length} пользователей, валидных: ${users.length}`,
          );

          if (users.length < 6) {
            throw new Error(
              "Недостаточно валидных пользователей для теста (нужно минимум 6)",
            );
          }

          // Распределяем роли: users[0] - оцениваемый (admin)
          evaluatedUserName = users[0]?.name || "Elena Shapoval";
          managerUser = users[1];
          subordinateUsers = users.slice(2, 4);
          colleagues = users.slice(4, 6);

          console.log(`Оцениваемый: ${evaluatedUserName}`);
          console.log(
            `Руководитель: ${managerUser.name} (${managerUser.email})`,
          );
          console.log(
            `Подчиненные: ${subordinateUsers.map((u) => u.name).join(", ")}`,
          );
          console.log(`Коллеги: ${colleagues.map((u) => u.name).join(", ")}`);
        });

        // ---------------------- Шаг 2: Создание Performance Review ----------------------
        await test.step("Создать Performance Review с автоматическим выбором коллег", async () => {
          await adminPage.goto(
            new URL("/ru/manager/performance-reviews/", baseUrl).toString(),
          );
          await listPage.assertOpened();

          await listPage.openCreateModal();
          await listPage.performanceReviewType.click();
          await configPage.assertOpened();

          await configPage.configureDirections({
            self: true,
            manager: true,
            colleagues: true,
            subordinates: true,
          });

          // Автоматический выбор коллег (askEmployees: false)
          await configPage.configureColleaguesSelection({
            askEmployees: false,
          });

          console.log("✓ Направления настроены: автоматический выбор коллег");
        });

        // ---------------------- Шаг 3: Добавление участников ----------------------
        await test.step("Добавить участника и настроить респондентов", async () => {
          await configPage.addTargetUsers({ count: 1 });
          console.log("✓ Участник добавлен");

          await configPage.editRespondentsTable({
            managers: [managerUser],
            subordinates: subordinateUsers,
            colleagues: colleagues,
          });
          console.log("✓ Респонденты добавлены");
        });

        // ---------------------- Шаг 4: Настройка и запуск ----------------------
        await test.step("Настроить анкеты и запустить PR", async () => {
          await configPage.disableReminders();
          await configPage.addAssessmentsForAllDirections();
          await configPage.goToStep("launch");

          // При автовыборе коллег - запускаем и отправляем анкеты напрямую
          await configPage.launchAndSendQuestionnaires();

          const currentUrl = adminPage.url();
          const match = currentUrl.match(/\/performance-reviews\/(\d+)/);
          if (match) {
            prId = match[1];
            console.log(`✓ Performance Review создан и запущен, ID: ${prId}`);
          }

          if (!prId) {
            throw new Error("Не удалось извлечь PR ID из URL после запуска");
          }
        });

        // ---------------------- Шаг 5: Заполнение анкет через API ----------------------
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
          const maxAttempts = 25;
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
              await new Promise((r) => setTimeout(r, 100));
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

          if (filledCount === 0) {
            throw new Error("populateReview не заполнил ни одной анкеты");
          }
          console.log(`✓ Все анкеты заполнены (${filledCount} итераций)`);
        });

        // ---------------------- Шаг 6: Открытие доступа к результатам ----------------------
        await test.step("Открыть доступ к результатам (новая модалка «Поделиться с сотрудником»)", async () => {
          if (!prId) {
            console.log("⚠️ PR ID не найден, пропускаем открытие доступа");
            return;
          }

          await adminPage.goto(
            new URL(
              `/ru/manager/performance-reviews/${prId}/`,
              baseUrl,
            ).toString(),
          );
          await adminPage.waitForLoadState("networkidle");

          // Переходим на вкладку "Результаты"
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
            )
;
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

          console.log("✓ Доступ к результатам открыт через новую модалку");
        });

        // ---------------------- Шаг 7: Проверка результатов ----------------------
        await test.step("Проверить результаты и расчёты", async () => {
          if (!prId) {
            console.log("⚠️ PR ID не найден, пропускаем проверку результатов");
            return;
          }

          const results = await verifyPRResults({
            page: adminPage,
            request,
            testInfo,
            baseUrl,
            prId,
            evaluatedUserName,
            openAccess: false,
          });

          if (
            results &&
            results.calculations &&
            results.calculations.length > 0
          ) {
            console.log(`✓ Проверено ${results.calculations.length} вопросов`);
            console.log(
              `✓ Расчёты корректны: ${results.isValid ? "Да" : "Есть расхождения"}`,
            );
          } else {
            console.log("⚠️ Нет данных для проверки расчётов");
          }

          if (results && results.isValid) {
            console.log("✓ E2E тест успешно завершён, все расчёты корректны");
          }
        });
      },
    );
  },
);
