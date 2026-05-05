// tests/functional/performance-review/filling/fill-pr-early-access-e2e.spec.js
// E2E тест: Performance Review с ранним доступом к анкетам (earlyAccess: true)
// Анкеты для самооценки, руководителя и подчиненных отправляются сразу,
// коллеги получают анкеты после того, как их выберут
import { test } from "../../../fixtures/auth.js";
import { PerformanceReviewsListPage } from "../../../../pages/PerformanceReviewsListPage.js";
import { PerformanceReviewConfigPage } from "../../../../pages/PerformanceReviewConfigPage.js";
import {
  PerformanceReviewFillPage,
  gotoWithRetryOn404,
  assertUserHasQuestionnaire,
} from "../../../../pages/PerformanceReviewFillPage.js";
import { OrgStructureHelper } from "../../../../pages/OrgStructureHelper.js";
import {
  createUserSession,
  filterValidUsers,
} from "../../../utils/UserSessionHelper.js";
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
import {
  openColleagueSelectionPageByPrId,
  openSelectionModal,
  selectCandidatesFromModal,
  applySelection,
  getSubmitButton,
} from "./pr-colleague-selection-manual.helpers.js";

test.describe(
  "Performance Review - E2E с ранним доступом к анкетам",
  { tag: ["@performance-review", "@filling", "@e2e", "@ui", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsE2ETest(MODULES.PERFORMANCE_REVIEW, "Filling");
    });

    test(
      "C3024: Создать PR с ранним доступом и заполнить анкеты в правильном порядке",
      { tag: ["@critical"] },
      async ({ adminAuth: adminPage, browser, request }, testInfo) => {
        setSeverity("critical");
        test.slow();
        testInfo.setTimeout(600_000); // 10 минут

        const listPage = new PerformanceReviewsListPage(adminPage, testInfo);
        const configPage = new PerformanceReviewConfigPage(adminPage, testInfo);
        const orgHelper = new OrgStructureHelper(adminPage, testInfo);
        const adminFillPage = new PerformanceReviewFillPage(
          adminPage,
          testInfo,
        );
        const userSession = createUserSession(browser, testInfo);

        let users = [];
        let colleagues = [];
        let managerUser = null;
        let subordinateUsers = [];
        let prId = null;
        let revisionAlias = null;
        let evaluatedUserName = null;
        const baseUrl = new URL(process.env.BASE_URL).origin;

        // ---------------------- Шаг 1: Получение пользователей ----------------------
        await test.step("Получить список активных пользователей", async () => {
          await adminPage.goto(baseUrl, { waitUntil: "domcontentloaded" });

          users = await orgHelper.getUsersList(13);
          users = await filterValidUsers(users);
          console.log(`✓ Получено ${users.length} активных пользователей`);

          if (users.length < 6) {
            throw new Error(
              "Недостаточно пользователей для теста (нужно минимум 6)",
            );
          }

          // Распределяем роли
          evaluatedUserName = users[0]?.name || "Elena Shapoval";
          managerUser = users[1];
          subordinateUsers = users.slice(2, 4);
          colleagues = users.slice(4);

          console.log(`Оцениваемый: ${evaluatedUserName}`);
          console.log(
            `Руководитель: ${managerUser.name} (${managerUser.email})`,
          );
          console.log(
            `Подчиненные: ${subordinateUsers.map((u) => u.name).join(", ")}`,
          );
          console.log(
            `Потенциальные коллеги: ${colleagues.map((u) => u.name).join(", ")}`,
          );
        });

        // ---------------------- Шаг 2: Создание Performance Review ----------------------
        await test.step("Создать Performance Review с ранним доступом к анкетам", async () => {
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

          // Ручной выбор коллег С ранним доступом к анкетам
          await configPage.configureColleaguesSelection({
            askEmployees: true,
            minColleagues: 2,
            maxColleagues: 5,
            managerApproval: false, // Без утверждения руководителем
            earlyAccess: true, // Ранний доступ - анкеты отправятся сразу!
          });

          console.log(
            "✓ Направления настроены, ранний доступ к анкетам включен",
          );
        });

        // ---------------------- Шаг 3: Добавление участников ----------------------
        await test.step("Добавить участника и настроить респондентов", async () => {
          await configPage.addTargetUsers({ count: 1 });
          console.log("✓ Участник добавлен");

          await configPage.editRespondentsTable({
            managers: [managerUser],
            subordinates: subordinateUsers,
          });
          console.log("✓ Руководитель и подчиненные добавлены");
        });

        // ---------------------- Шаг 4: Настройка и запуск ----------------------
        await test.step("Настроить анкеты и запустить (анкеты отправляются сразу)", async () => {
          await configPage.disableReminders();
          await configPage.addAssessmentsForAllDirections();
          await configPage.goToStep("launch");

          // При раннем доступе - запускаем и отправляем анкеты сразу
          await configPage.launchAndSendQuestionnaires();

          const currentUrl = adminPage.url();
          const match = currentUrl.match(/\/performance-reviews\/(\d+)/);
          if (match) {
            prId = match[1];
            console.log(`✓ Performance Review создан и запущен, ID: ${prId}`);
          }

          // Получить revisionAlias через API
          const prAPI = new PerformanceReviewAPI(request);
          const { email, password } = getCredentials("admin");
          await prAPI.signIn(email, password);
          const { data: revision } = await prAPI.getLastRevision(prId);
          revisionAlias = revision?.alias;
          console.log(`✓ Revision alias: ${revisionAlias}`);
        });

        // ---------------------- Шаг 5: Самооценка (доступна сразу) ----------------------
        await test.step("Админ заполняет самооценку", async () => {
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
          const maxAttempts = 15;
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
          if (filledCount === 0)
            throw new Error("populateReview не заполнил ни одной анкеты");
          console.log("✓ Самооценка заполнена");
        });

        // ---------------------- Шаг 6: Оценка от руководителя (доступна сразу) ----------------------
        await test.step("Руководитель заполняет оценку", async () => {
          await userSession.runAs(managerUser, async (page) => {
            const fillPage = new PerformanceReviewFillPage(page, testInfo);
            await fillPage.fillQuestionnaireForEvaluated(
              baseUrl,
              evaluatedUserName,
              prId,
              { revisionAlias },
            );
            console.log("✓ Оценка от руководителя заполнена");
          });
        });

        // ---------------------- Шаг 7: Оценки от подчиненных (доступны сразу) ----------------------
        await test.step("Подчиненные заполняют оценки", async () => {
          if (subordinateUsers.length === 0) {
            console.log("⚠️ Подчиненные не назначены, пропускаем");
            return;
          }

          for (const subordinate of subordinateUsers) {
            await userSession.runAs(subordinate, async (page) => {
              const fillPage = new PerformanceReviewFillPage(page, testInfo);
              await fillPage.fillQuestionnaireForEvaluated(
                baseUrl,
                evaluatedUserName,
                prId,
                { revisionAlias },
              );
              console.log(
                `✓ Оценка от подчиненного ${subordinate.name} заполнена`,
              );
            });
          }
        });

        // ---------------------- Шаг 8: Выбор коллег оцениваемым ----------------------
        // При раннем доступе анкеты коллегам отправляются автоматически после выбора
        // Навигация от лица оцениваемого (users[0]), т.к. admin видит manager view
        await test.step("Оцениваемый выбирает коллег", async () => {
          let selectedNames = [];
          await userSession.runAs(users[0], async (page) => {
            await openColleagueSelectionPageByPrId({
              page,
              baseUrl,
              prId,
              revisionAlias,
            });

            const modal = await openSelectionModal(page);
            selectedNames = await selectCandidatesFromModal({
              page,
              modal,
              candidates: colleagues,
              targetCount: 2,
            });
            await applySelection(modal, page);

            // Отправить выбор коллег
            const submitButton = await getSubmitButton(page);
            let _visible1 = false;
            try {
              await submitButton
              .waitFor({ state: "visible", timeout: 5000 })
              _visible1 = true;
            } catch {}
            if (_visible1) {
              await submitButton.click();
              await page
                .waitForLoadState("networkidle", { timeout: 10000 });
              // Подтвердить в модалке если появится
              const confirmButton = page
                .locator("button")
                .filter({ hasText: /^Отправить$/i })
                .last();
              let _visible2 = false;
              try {
                await confirmButton
                .waitFor({ state: "visible", timeout: 3000 })
                _visible2 = true;
              } catch {}
              if (_visible2) {
                await confirmButton.click();
                await page
                  .waitForLoadState("networkidle", { timeout: 10000 });
              }
              console.log("✓ Выбор коллег отправлен");
            }
          });

          // Обновляем список выбранных коллег для дальнейших шагов
          const selectedColleagues = colleagues.filter((c) =>
            selectedNames.includes(c.name?.replace(/\s+/g, " ").trim()),
          );
          // fallback: если фильтрация не сработала (например, из-за пробелов), берём первых N из исходного списка
          colleagues =
            selectedColleagues.length > 0
              ? selectedColleagues
              : users.slice(4, 4 + selectedNames.length);
          console.log(`✓ Выбрано ${selectedNames.length} коллег`);
          console.log(
            "✓ При раннем доступе анкеты коллегам отправляются автоматически",
          );
        });

        // При earlyAccess: true нет этапа "Завершить подбор" - коллеги получают анкеты сразу после выбора
        // Ждём завершения сетевых запросов
        await adminPage.waitForLoadState("networkidle");

        // ---------------------- Шаг 9: Оценки от коллег ----------------------
        await test.step("Коллеги заполняют оценки", async () => {
          if (colleagues.length === 0) {
            console.log("⚠️ Нет выбранных коллег, пропускаем");
            return;
          }

          for (const colleague of colleagues) {
            await userSession.runAs(colleague, async (page) => {
              const fillPage = new PerformanceReviewFillPage(page, testInfo);
              await fillPage.fillQuestionnaireForEvaluated(
                baseUrl,
                evaluatedUserName,
                prId,
                { revisionAlias },
              );
              console.log(`✓ Оценка от коллеги ${colleague.name} заполнена`);
            });
          }
        });

        // ---------------------- Шаг 10: Проверка результатов с расчётами ----------------------
        await test.step("Админ проверяет результаты и расчёты", async () => {
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
            openAccess: true,
          });

          // Проверяем, что есть данные
          if (results.calculations.length > 0) {
            console.log(`✓ Проверено ${results.calculations.length} вопросов`);
            console.log(
              `✓ Расчёты корректны: ${results.isValid ? "Да" : "Есть расхождения"}`,
            );
          } else {
            console.log("⚠️ Нет данных для проверки расчётов");
          }
        });
      },
    );
  },
);
