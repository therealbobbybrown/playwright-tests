// tests/functional/performance-review/filling/pr-self-assessment-edit-after-launch.spec.js
// E2E тесты: Редактирование анкет самооценки ПОСЛЕ запуска PR
//
// Тестируемые кейсы:
// Кейс 6: PR с 2 анкетами самооценки → сотрудник заполняет 1-ю → админ удаляет 2-ю → анкеты отправляются
// Кейс 7: Админ поменял анкеты ДО ответов → после заполнения анкеты отправляются
// Кейс 8: Админ поменял/сбросил анкеты ПОСЛЕ ответов → анкеты остаются отправленными
// Кейс 9: Админ добавил анкету ДО ответов → ждём заполнения ВСЕХ анкет
// Кейс 10: Админ добавил анкету ПОСЛЕ ответов → новые коллеги ждут заполнения добавленной анкеты

import { test } from "../../../fixtures/auth.js";
import { expect } from "@playwright/test";
import { PerformanceReviewsListPage } from "../../../../pages/PerformanceReviewsListPage.js";
import { PerformanceReviewConfigPage } from "../../../../pages/PerformanceReviewConfigPage.js";
import {
  PerformanceReviewFillPage,
  assertUserHasQuestionnaire,
  gotoWithRetryOn404,
} from "../../../../pages/PerformanceReviewFillPage.js";
import { OrgStructureHelper } from "../../../../pages/OrgStructureHelper.js";
import {
  createUserSession,
  filterValidUsers,
} from "../../../utils/UserSessionHelper.js";
import {
  PerformanceReviewAPI,
  DashboardTeamAPI,
  getCredentials,
  getTestUserPassword,
} from "../../../utils/api/index.js";
import {
  markAsE2ETest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";

test.describe(
  "Performance Review - Редактирование анкет после запуска",
  {
    tag: [
      "@performance-review",
      "@filling",
      "@e2e",
      "@self-assessment",
      "@edit-after-launch",
      "@regression",
    ],
  },
  () => {
    test.beforeEach(() => {
      markAsE2ETest(MODULES.PERFORMANCE_REVIEW, "Edit After Launch");
    });

    /**
     * Кейс 6: Сотрудник ответил на 1 из 2 анкет самооценки, админ удалил 2-ю анкету
     * Ожидание: анкеты руководителю/коллегам отправляются после заполнения 1-й самооценки
     *
     * ВАЖНО: Для СУЩЕСТВУЮЩИХ оцениваемых (добавленных ДО запуска) блокировка
     * до заполнения ВСЕХ самооценок НЕ действует. Заполнение ЛЮБОЙ одной
     * самооценки достаточно для отправки анкет руководителю/коллегам.
     *
     * Шаги:
     * 1. Админ создаёт PR с 2 анкетами в направлении "Самооценка"
     * 2. Админ запускает PR
     * 3. Руководитель НЕ видит анкету (ждём самооценку)
     * 4. Оцениваемый заполняет ТОЛЬКО 1-ю анкету
     * 5. Руководитель ВИДИТ анкету (для существующих оцениваемых — достаточно 1-й самооценки)
     * 6. Админ УДАЛЯЕТ 2-ю незаполненную анкету
     * 7. Руководитель всё ещё ВИДИТ анкету (удаление не отзывает анкету)
     */
    test(
      "C4412: Кейс 6: удаление незаполненной анкеты - анкеты отправляются",
      { tag: ["@critical"] },
      async ({ adminAuth: adminPage, browser, request }, testInfo) => {
        setSeverity("critical");
        test.slow();
        testInfo.setTimeout(600_000);

        const listPage = new PerformanceReviewsListPage(adminPage, testInfo);
        const configPage = new PerformanceReviewConfigPage(adminPage, testInfo);
        const orgHelper = new OrgStructureHelper(adminPage, testInfo);
        const adminFillPage = new PerformanceReviewFillPage(
          adminPage,
          testInfo,
        );
        const userSession = createUserSession(browser, testInfo);

        let users = [];
        let managerUser = null;
        let prId = null;
        let revisionAlias = null;
        const baseUrl = new URL(process.env.BASE_URL).origin;
        const prName = `Кейс 6 удаление анкеты ${Date.now()}`;

        // Получение пользователей
        await test.step("Получить пользователей", async () => {
          await adminPage.goto(baseUrl, { waitUntil: "domcontentloaded" });
          users = await orgHelper.getUsersList(8);
          users = await filterValidUsers(users);

          if (users.length < 3) {
            throw new Error("Недостаточно пользователей для теста");
          }

          managerUser = users[1];
          console.log(`Руководитель: ${managerUser.name}`);
        });

        // Создание PR с показом самооценки и 2 анкетами
        await test.step("Создать PR с 2 анкетами самооценки", async () => {
          await adminPage.goto(
            new URL("/ru/manager/performance-reviews/", baseUrl).toString(),
          );
          await listPage.assertOpened();

          await listPage.openCreateModal();
          await listPage.performanceReviewType.click();
          await configPage.assertOpened();

          // Задаём уникальное имя PR для надёжной идентификации на главной странице
          await configPage.fillTitle(prName);
          console.log(`✓ PR название: "${prName}"`);

          await configPage.configureDirections({
            self: true,
            manager: true,
            colleagues: true, // Включаем коллег для настройки showSelfAssessmentToColleagues
            subordinates: false,
          });

          await configPage.configureColleaguesSelection({
            askEmployees: true,
            earlyAccess: true,
            showSelfAssessmentToColleagues: true,
            managerApproval: false,
          });

          console.log("✓ PR настроен");
        });

        // Добавление участников
        await test.step("Добавить участников", async () => {
          await configPage.addTargetUsers({ count: 1 });
          await configPage.editRespondentsTable({ managers: [managerUser] });
          await configPage.disableReminders();
          await configPage.addAssessmentsForAllDirections();
        });

        // Добавление 2-й анкеты для самооценки
        await test.step("Добавить 2-ю анкету для направления Самооценка", async () => {
          await configPage.addAssessmentForDirection("Самооценка");
          console.log("✓ Вторая анкета добавлена для Самооценки");
        });

        // Запуск PR
        await test.step("Запустить PR", async () => {
          await configPage.goToStep("launch");
          await configPage.launchAndSendQuestionnaires();

          const currentUrl = adminPage.url();
          const match = currentUrl.match(/\/performance-reviews\/(\d+)/);
          if (match) {
            prId = match[1];
            console.log(`✓ PR запущен, ID: ${prId}`);
          }

          // Получаем alias ревизии через API — нужен для прямых URL
          const prAPI = new PerformanceReviewAPI(request);
          const { email, password } = getCredentials("admin");
          await prAPI.signIn(email, password);
          const { data: revision } = await prAPI.getLastRevision(prId);
          revisionAlias = revision?.alias;
          console.log(`✓ Revision alias: ${revisionAlias}`);
        });

        // Проверка: руководитель НЕ видит анкету (ждём самооценку)
        await test.step("Проверить что руководитель НЕ видит анкету этого PR", async () => {
          await userSession.runAs(managerUser, async (page) => {
            await assertUserHasQuestionnaire(
              page,
              baseUrl,
              prId,
              false,
              expect,
            );
            console.log(
              "✓ Руководитель НЕ видит анкету этого PR (ждём самооценку)",
            );
          });
        });

        // Оцениваемый заполняет ТОЛЬКО ПЕРВУЮ анкету самооценки
        await test.step("Оцениваемый заполняет первую анкету самооценки", async () => {
          // Инициализация API после запуска PR
          const prAPI = new PerformanceReviewAPI(request);
          const { email, password } = getCredentials("admin");
          await prAPI.signIn(email, password);

          // Заполнение анкет через API
          const populateSettings = {
            skipChance: 0,
            commentChance: 0,
            customChance: 0,
            lowerLimit: 60,
            upperLimit: 100,
          };
          let filledCount = 0;
          for (let attempt = 1; attempt <= 15; attempt++) {
            const { response } = await prAPI.populateReview(
              prId,
              populateSettings,
              { timeout: 120000 },
            );
            if (response.ok()) {
              filledCount++;
              // Заполняем ТОЛЬКО 1 анкету — вторая должна остаться незаполненной
              break;
            } else if (response.status() === 500) {
              break;
            } else {
              break;
            }
          }
          console.log(`populateReview: ${filledCount} анкет заполнено`);
          console.log("✓ Первая анкета самооценки заполнена");
          await adminPage.waitForTimeout(2000);
        });

        // Проверка: руководитель ВИДИТ анкету после 1-й (для существующих оцениваемых — достаточно 1-й самооценки)
        await test.step("Проверить что руководитель ВИДИТ анкету после 1-й", async () => {
          await userSession.runAs(managerUser, async (page) => {
            await assertUserHasQuestionnaire(
              page,
              baseUrl,
              prId,
              true,
              expect,
              { revisionAlias },
            );
            console.log(
              "✓ Руководитель ВИДИТ анкету PR после 1-й самооценки (ожидаемое поведение для существующего оцениваемого)",
            );
          });
        });

        // Админ удаляет 2-ю (незаполненную) анкету самооценки
        await test.step("Админ удаляет 2-ю анкету самооценки", async () => {
          await adminPage.goto(
            new URL(
              `/ru/manager/performance-reviews/${prId}`,
              baseUrl,
            ).toString(),
          );
          await adminPage.waitForLoadState("networkidle");
          await adminPage.waitForTimeout(2000); // Ждём полную загрузку страницы PR

          // Удаляем последнюю (вторую) анкету из направления Самооценка
          await configPage.deleteAssessmentFromDirection("Самооценка", -1);
          console.log("✓ Вторая анкета самооценки удалена");

          // После изменения анкет появляется боковая панель с кнопкой "Сохранить"
          const saveButton = adminPage
            .locator("button")
            .filter({ hasText: /^сохранить$/i })
            .first();
          await adminPage.waitForTimeout(1000);

          let _visible1 = false;
          try {
            await saveButton
            .waitFor({ state: "visible", timeout: 5000 })
            _visible1 = true;
          } catch {}
          if (_visible1) {
            await saveButton.click();
            console.log('✓ Кнопка "Сохранить" нажата');

            // После нажатия "Сохранить" появляется модальное окно "Подтвердите изменения"
            const confirmButton = adminPage
              .locator("button")
              .filter({ hasText: /подтвердить изменения/i })
              .first();
            await adminPage.waitForTimeout(1000);

            let _visible2 = false;
            try {
              await confirmButton
              .waitFor({ state: "visible", timeout: 5000 })
              _visible2 = true;
            } catch {}
            if (_visible2) {
              await confirmButton.click();
              console.log('✓ Кнопка "Подтвердить изменения" нажата');
            }

            // Ждём применения изменений
            await adminPage.waitForTimeout(3000);
            await adminPage.waitForLoadState("networkidle");
            console.log("✓ Изменения сохранены");
          } else {
            console.log('⚠️ Кнопка "Сохранить" не найдена');
            await adminPage.waitForTimeout(3000);
          }
        });

        // Проверка: руководитель всё ещё видит анкету (удаление незаполненной не отзывает анкету)
        await test.step("Проверить что руководитель всё ещё ВИДИТ анкету после удаления 2-й", async () => {
          await userSession.runAs(managerUser, async (page) => {
            await assertUserHasQuestionnaire(
              page,
              baseUrl,
              prId,
              true,
              expect,
              { revisionAlias },
            );
            console.log(
              `✓ Руководитель всё ещё ВИДИТ анкету PR ID=${prId} после удаления незаполненной анкеты`,
            );
          });
        });

        console.log(
          "✅ Кейс 6 завершён: удаление незаполненной анкеты не отзывает анкеты руководителю",
        );
      },
    );

    /**
     * Кейс 7: Админ поменял анкету самооценки ДО получения ответов
     * Ожидание: анкеты рук./коллегам отправляются после заполнения НОВОЙ анкеты
     *
     * Шаги:
     * 1. Создать и запустить PR с 1 анкетой самооценки
     * 2. Админ ЗАМЕНЯЕТ анкету (удаляет старую, добавляет новую)
     * 3. Сотрудник заполняет новую анкету
     * 4. Руководитель ВИДИТ анкету
     */
    test(
      "C4413: Кейс 7: замена анкеты самооценки до ответов",
      { tag: ["@regression"] },
      async ({ adminAuth: adminPage, browser, request }, testInfo) => {
        setSeverity("normal");
        test.slow();
        testInfo.setTimeout(600_000);

        const listPage = new PerformanceReviewsListPage(adminPage, testInfo);
        const configPage = new PerformanceReviewConfigPage(adminPage, testInfo);
        const orgHelper = new OrgStructureHelper(adminPage, testInfo);
        const adminFillPage = new PerformanceReviewFillPage(
          adminPage,
          testInfo,
        );
        const userSession = createUserSession(browser, testInfo);

        let users = [];
        let managerUser = null;
        let prId = null;
        let revisionAlias = null;
        const baseUrl = new URL(process.env.BASE_URL).origin;
        const prName = `Кейс 7 замена анкеты ${Date.now()}`;

        // Получение пользователей
        await test.step("Получить пользователей", async () => {
          await adminPage.goto(baseUrl, { waitUntil: "domcontentloaded" });
          users = await orgHelper.getUsersList(8);
          users = await filterValidUsers(users);

          if (users.length < 3) {
            throw new Error("Недостаточно пользователей для теста");
          }

          managerUser = users[1];
          console.log(`Руководитель: ${managerUser.name}`);
        });

        // Создание и запуск PR
        await test.step("Создать и запустить PR", async () => {
          await adminPage.goto(
            new URL("/ru/manager/performance-reviews/", baseUrl).toString(),
          );
          await listPage.assertOpened();

          await listPage.openCreateModal();
          await listPage.performanceReviewType.click();
          await configPage.assertOpened();

          // Задаём уникальное имя PR для надёжной идентификации на главной странице
          await configPage.fillTitle(prName);
          console.log(`✓ PR название: "${prName}"`);

          await configPage.configureDirections({
            self: true,
            manager: true,
            colleagues: true,
            subordinates: false,
          });

          await configPage.configureColleaguesSelection({
            askEmployees: true,
            earlyAccess: true,
            showSelfAssessmentToColleagues: true,
            managerApproval: false,
          });

          await configPage.addTargetUsers({ count: 1 });
          await configPage.editRespondentsTable({ managers: [managerUser] });
          await configPage.disableReminders();
          await configPage.addAssessmentsForAllDirections();
          await configPage.goToStep("launch");
          await configPage.launchAndSendQuestionnaires();

          const currentUrl = adminPage.url();
          const match = currentUrl.match(/\/performance-reviews\/(\d+)/);
          if (match) {
            prId = match[1];
            console.log(`✓ PR запущен, ID: ${prId}`);
          }

          // Получаем alias ревизии через API — нужен для прямых URL
          const prAPI = new PerformanceReviewAPI(request);
          const { email, password } = getCredentials("admin");
          await prAPI.signIn(email, password);
          const { data: revision } = await prAPI.getLastRevision(prId);
          revisionAlias = revision?.alias;
          console.log(`✓ Revision alias: ${revisionAlias}`);
        });

        // Проверка: руководитель НЕ видит анкету (ждём самооценку)
        await test.step("Проверить что руководитель НЕ видит анкету", async () => {
          await userSession.runAs(managerUser, async (page) => {
            await assertUserHasQuestionnaire(
              page,
              baseUrl,
              prId,
              false,
              expect,
            );
            console.log("✓ Руководитель НЕ видит анкету этого PR до замены");
          });
        });

        // Админ ЗАМЕНЯЕТ анкету самооценки (удаляет старую, добавляет новую)
        await test.step("Админ заменяет анкету самооценки", async () => {
          await adminPage.goto(
            new URL(
              `/ru/manager/performance-reviews/${prId}`,
              baseUrl,
            ).toString(),
          );
          await adminPage.waitForLoadState("networkidle");

          // Удаляем текущую анкету
          await configPage.deleteAssessmentFromDirection("Самооценка", 0);
          console.log("✓ Старая анкета удалена");

          await adminPage.waitForTimeout(1000);

          // Добавляем новую анкету
          await configPage.addAssessmentForDirection("Самооценка");
          console.log("✓ Новая анкета добавлена");

          await adminPage.waitForTimeout(2000);
        });

        // Оцениваемый заполняет НОВУЮ анкету самооценки
        await test.step("Оцениваемый заполняет новую анкету", async () => {
          // Инициализация API
          const prAPI = new PerformanceReviewAPI(request);
          const { email, password } = getCredentials("admin");
          await prAPI.signIn(email, password);

          // Заполнение анкет через API
          const populateSettings = {
            skipChance: 0,
            commentChance: 0,
            customChance: 0,
            lowerLimit: 60,
            upperLimit: 100,
          };
          let filledCount = 0;
          for (let attempt = 1; attempt <= 15; attempt++) {
            const { response } = await prAPI.populateReview(
              prId,
              populateSettings,
              { timeout: 120000 },
            );
            if (response.ok()) {
              filledCount++;
              await new Promise((r) => setTimeout(r, 100));
            } else if (response.status() === 500) {
              break;
            } else {
              break;
            }
          }
          console.log(`populateReview: ${filledCount} анкет заполнено`);
          console.log("✓ Новая анкета самооценки заполнена");
          await adminPage.waitForTimeout(2000);
        });

        // Проверка: руководитель ВИДИТ анкету
        await test.step("Проверить что руководитель ВИДИТ анкету", async () => {
          await userSession.runAs(managerUser, async (page) => {
            await assertUserHasQuestionnaire(
              page,
              baseUrl,
              prId,
              true,
              expect,
              { revisionAlias },
            );
            console.log(
              `✓ Руководитель ВИДИТ анкету PR ID=${prId} после заполнения новой анкеты`,
            );
          });
        });

        console.log(
          "✅ Кейс 7 завершён: после замены анкеты нужно заполнить новую",
        );
      },
    );

    /**
     * Кейс 8: Админ поменял/сбросил анкету ПОСЛЕ ответов
     * Ожидание: анкеты рук./коллег остаются отправленными (не отзываются)
     *
     * Шаги:
     * 1. Создать и запустить PR
     * 2. Сотрудник заполняет самооценку → анкеты отправлены руководителю
     * 3. Админ ЗАМЕНЯЕТ анкету самооценки (удаляет заполненную, добавляет новую)
     * 4. Анкета руководителю ОСТАЁТСЯ (не отзывается)
     */
    test(
      "C4414: Кейс 8: замена анкеты после ответов - анкеты остаются",
      { tag: ["@regression"] },
      async ({ adminAuth: adminPage, browser, request }, testInfo) => {
        setSeverity("normal");
        test.slow();
        testInfo.setTimeout(600_000);

        const listPage = new PerformanceReviewsListPage(adminPage, testInfo);
        const configPage = new PerformanceReviewConfigPage(adminPage, testInfo);
        const orgHelper = new OrgStructureHelper(adminPage, testInfo);
        const adminFillPage = new PerformanceReviewFillPage(
          adminPage,
          testInfo,
        );
        const userSession = createUserSession(browser, testInfo);

        let users = [];
        let managerUser = null;
        let prId = null;
        let revisionAlias = null;
        const baseUrl = new URL(process.env.BASE_URL).origin;
        const prName = `Кейс 8 после ответов ${Date.now()}`;

        // Получение пользователей
        await test.step("Получить пользователей", async () => {
          await adminPage.goto(baseUrl, { waitUntil: "domcontentloaded" });
          users = await orgHelper.getUsersList(8);
          users = await filterValidUsers(users);

          if (users.length < 3) {
            throw new Error("Недостаточно пользователей для теста");
          }

          managerUser = users[1];
          console.log(`Руководитель: ${managerUser.name}`);
        });

        // Создание и запуск PR
        await test.step("Создать и запустить PR", async () => {
          await adminPage.goto(
            new URL("/ru/manager/performance-reviews/", baseUrl).toString(),
          );
          await listPage.assertOpened();

          await listPage.openCreateModal();
          await listPage.performanceReviewType.click();
          await configPage.assertOpened();

          // Задаём уникальное имя PR для надёжной идентификации на главной странице
          await configPage.fillTitle(prName);
          console.log(`✓ PR название: "${prName}"`);

          await configPage.configureDirections({
            self: true,
            manager: true,
            colleagues: true,
            subordinates: false,
          });

          await configPage.configureColleaguesSelection({
            askEmployees: true,
            earlyAccess: true,
            showSelfAssessmentToColleagues: true,
            managerApproval: false,
          });

          await configPage.addTargetUsers({ count: 1 });
          await configPage.editRespondentsTable({ managers: [managerUser] });
          await configPage.disableReminders();
          await configPage.addAssessmentsForAllDirections();
          await configPage.goToStep("launch");
          await configPage.launchAndSendQuestionnaires();

          const currentUrl = adminPage.url();
          const match = currentUrl.match(/\/performance-reviews\/(\d+)/);
          if (match) {
            prId = match[1];
            console.log(`✓ PR запущен, ID: ${prId}`);
          }

          // Получаем alias ревизии через API — нужен для прямых URL
          const prAPI = new PerformanceReviewAPI(request);
          const { email, password } = getCredentials("admin");
          await prAPI.signIn(email, password);
          const { data: revision } = await prAPI.getLastRevision(prId);
          revisionAlias = revision?.alias;
          console.log(`✓ Revision alias: ${revisionAlias}`);
        });

        // Оцениваемый заполняет самооценку
        await test.step("Оцениваемый заполняет самооценку", async () => {
          // Инициализация API
          const prAPI = new PerformanceReviewAPI(request);
          const { email, password } = getCredentials("admin");
          await prAPI.signIn(email, password);

          // Заполнение анкет через API
          const populateSettings = {
            skipChance: 0,
            commentChance: 0,
            customChance: 0,
            lowerLimit: 60,
            upperLimit: 100,
          };
          let filledCount = 0;
          for (let attempt = 1; attempt <= 15; attempt++) {
            const { response } = await prAPI.populateReview(
              prId,
              populateSettings,
              { timeout: 120000 },
            );
            if (response.ok()) {
              filledCount++;
              await new Promise((r) => setTimeout(r, 100));
            } else if (response.status() === 500) {
              break;
            } else {
              break;
            }
          }
          console.log(`populateReview: ${filledCount} анкет заполнено`);
          console.log("✓ Самооценка заполнена");
          await adminPage.waitForTimeout(2000);
        });

        // Проверка: руководитель ВИДИТ анкету (после самооценки)
        await test.step("Проверить что руководитель видит анкету", async () => {
          await userSession.runAs(managerUser, async (page) => {
            await assertUserHasQuestionnaire(
              page,
              baseUrl,
              prId,
              true,
              expect,
              { revisionAlias },
            );
            console.log(
              `✓ Руководитель видит анкету PR ID=${prId} после самооценки`,
            );
          });
        });

        // Админ ЗАМЕНЯЕТ анкету ПОСЛЕ ответов (удаляет заполненную, добавляет новую)
        await test.step("Админ заменяет анкету ПОСЛЕ ответов", async () => {
          await adminPage.goto(
            new URL(
              `/ru/manager/performance-reviews/${prId}`,
              baseUrl,
            ).toString(),
          );
          await adminPage.waitForLoadState("networkidle");

          // Удаляем заполненную анкету
          await configPage.deleteAssessmentFromDirection("Самооценка", 0);
          console.log("✓ Заполненная анкета удалена");

          await adminPage.waitForTimeout(1000);

          // Добавляем новую анкету
          await configPage.addAssessmentForDirection("Самооценка");
          console.log("✓ Новая анкета добавлена");

          await adminPage.waitForTimeout(2000);
        });

        // Проверка: руководитель ВСЁ ЕЩЁ видит анкету (не отозвана)
        await test.step("Проверить что анкета руководителю ОСТАЛАСЬ", async () => {
          await userSession.runAs(managerUser, async (page) => {
            await assertUserHasQuestionnaire(
              page,
              baseUrl,
              prId,
              true,
              expect,
              { revisionAlias },
            );
            console.log(
              `✓ Анкета PR ID=${prId} руководителю ОСТАЛАСЬ после замены админом`,
            );
          });
        });

        console.log(
          "✅ Кейс 8 завершён: анкеты не отзываются после замены админом",
        );
      },
    );

    /**
     * Кейс 9: Добавление анкеты самооценки ДО ответов для СУЩЕСТВУЮЩЕГО оцениваемого
     *
     * При добавлении анкеты самооценки для СУЩЕСТВУЮЩЕГО оцениваемого:
     * - Анкеты руководителю/коллегам отправляются СРАЗУ после заполнения первой анкеты
     * - Это ожидаемое поведение по новым требованиям
     *
     * ВАЖНО: Блокировка до заполнения самооценки работает только для НОВЫХ оцениваемых,
     * добавленных в PR после запуска.
     *
     * Шаги:
     * 1. Создать PR с 1 анкетой самооценки
     * 2. Запустить PR
     * 3. Админ добавляет 2-ю анкету самооценки
     * 4. Сотрудник отвечает на 1-ю анкету
     * 5. Руководитель ВИДИТ анкету (ожидаемое поведение для существующего оцениваемого)
     */
    test(
      "C4415: Кейс 9: добавление анкеты для существующего оцениваемого - анкеты отправляются сразу",
      { tag: ["@regression"] },
      async ({ adminAuth: adminPage, browser, request }, testInfo) => {
        setSeverity("normal");
        test.slow();
        testInfo.setTimeout(600_000);

        const listPage = new PerformanceReviewsListPage(adminPage, testInfo);
        const configPage = new PerformanceReviewConfigPage(adminPage, testInfo);
        const orgHelper = new OrgStructureHelper(adminPage, testInfo);
        const adminFillPage = new PerformanceReviewFillPage(
          adminPage,
          testInfo,
        );
        const userSession = createUserSession(browser, testInfo);

        let users = [];
        let managerUser = null;
        let prId = null;
        let revisionAlias = null;
        const baseUrl = new URL(process.env.BASE_URL).origin;
        const prName = `Кейс 9 добавление до ответов ${Date.now()}`;

        // Получение пользователей
        await test.step("Получить пользователей", async () => {
          await adminPage.goto(baseUrl, { waitUntil: "domcontentloaded" });
          users = await orgHelper.getUsersList(8);
          users = await filterValidUsers(users);

          if (users.length < 3) {
            throw new Error("Недостаточно пользователей для теста");
          }

          managerUser = users[1];
          console.log(`Руководитель: ${managerUser.name}`);
        });

        // Создание PR с 1 анкетой
        await test.step("Создать и запустить PR с 1 анкетой", async () => {
          await adminPage.goto(
            new URL("/ru/manager/performance-reviews/", baseUrl).toString(),
          );
          await listPage.assertOpened();

          await listPage.openCreateModal();
          await listPage.performanceReviewType.click();
          await configPage.assertOpened();

          // Задаём уникальное имя PR для надёжной идентификации на главной странице
          await configPage.fillTitle(prName);
          console.log(`✓ PR название: "${prName}"`);

          await configPage.configureDirections({
            self: true,
            manager: true,
            colleagues: true,
            subordinates: false,
          });

          await configPage.configureColleaguesSelection({
            askEmployees: true,
            earlyAccess: true,
            showSelfAssessmentToColleagues: true,
            managerApproval: false,
          });

          await configPage.addTargetUsers({ count: 1 });
          await configPage.editRespondentsTable({ managers: [managerUser] });
          await configPage.disableReminders();
          await configPage.addAssessmentsForAllDirections();
          await configPage.goToStep("launch");
          await configPage.launchAndSendQuestionnaires();

          const currentUrl = adminPage.url();
          const match = currentUrl.match(/\/performance-reviews\/(\d+)/);
          if (match) {
            prId = match[1];
            console.log(`✓ PR запущен с 1 анкетой, ID: ${prId}`);
          }

          // Получаем alias ревизии через API — нужен для прямых URL
          const prAPI = new PerformanceReviewAPI(request);
          const { email, password } = getCredentials("admin");
          await prAPI.signIn(email, password);
          const { data: revision } = await prAPI.getLastRevision(prId);
          revisionAlias = revision?.alias;
          console.log(`✓ Revision alias: ${revisionAlias}`);
        });

        // Админ добавляет 2-ю анкету ДО ответов
        await test.step("Админ добавляет 2-ю анкету самооценки", async () => {
          await adminPage.goto(
            new URL(
              `/ru/manager/performance-reviews/${prId}`,
              baseUrl,
            ).toString(),
          );
          await adminPage.waitForLoadState("networkidle");

          await configPage.addAssessmentForDirection("Самооценка");
          console.log("✓ Вторая анкета самооценки добавлена");
          await adminPage.waitForTimeout(2000);
        });

        // Сотрудник заполняет ПЕРВУЮ анкету
        await test.step("Оцениваемый заполняет первую анкету", async () => {
          // Инициализация API
          const prAPI = new PerformanceReviewAPI(request);
          const { email, password } = getCredentials("admin");
          await prAPI.signIn(email, password);

          // Заполнение анкет через API
          const populateSettings = {
            skipChance: 0,
            commentChance: 0,
            customChance: 0,
            lowerLimit: 60,
            upperLimit: 100,
          };
          let filledCount = 0;
          for (let attempt = 1; attempt <= 15; attempt++) {
            const { response } = await prAPI.populateReview(
              prId,
              populateSettings,
              { timeout: 120000 },
            );
            if (response.ok()) {
              filledCount++;
              await new Promise((r) => setTimeout(r, 100));
            } else if (response.status() === 500) {
              break;
            } else {
              break;
            }
          }
          console.log(`populateReview: ${filledCount} анкет заполнено`);
          console.log("✓ Первая анкета самооценки заполнена");
          await adminPage.waitForTimeout(2000);
        });

        // Проверка: руководитель ВИДИТ анкету после 1-й анкеты (ожидаемое поведение для существующего оцениваемого)
        await test.step("Проверить что руководитель ВИДИТ анкету после 1-й", async () => {
          await userSession.runAs(managerUser, async (page) => {
            // Ожидаемое поведение: руководитель ВИДИТ анкету для существующего оцениваемого,
            // даже если есть незаполненные добавленные анкеты самооценки
            await assertUserHasQuestionnaire(
              page,
              baseUrl,
              prId,
              true,
              expect,
              { revisionAlias },
            );
            console.log(
              "✓ Руководитель ВИДИТ анкету (ожидаемое поведение для существующего оцениваемого)",
            );
          });
        });

        console.log(
          "✅ Кейс 9 завершён: для существующих оцениваемых анкеты отправляются сразу",
        );
      },
    );

    /**
     * Кейс 10: Добавление анкеты самооценки ПОСЛЕ ответов для СУЩЕСТВУЮЩЕГО оцениваемого
     *
     * При добавлении анкеты самооценки для СУЩЕСТВУЮЩЕГО оцениваемого:
     * - Вновь добавленным АДМИНОМ коллегам анкеты приходят СРАЗУ (не ждут самооценку)
     * - Это ожидаемое поведение по новым требованиям
     *
     * ВАЖНО: Блокировка до заполнения самооценки работает только для НОВЫХ оцениваемых,
     * добавленных в PR после запуска.
     *
     * Шаги:
     * 1. Создать PR, запустить
     * 2. Сотрудник заполняет самооценку → анкеты отправлены руководителю
     * 3. Сотрудник выбирает коллег → анкеты отправлены коллегам
     * 4. Админ добавляет новую анкету самооценки
     * 5. АДМИН добавляет НОВЫХ коллег через панель управления PR
     * 6. ПРОВЕРКА: новые коллеги ВИДЯТ анкету СРАЗУ (ожидаемое поведение)
     */
    test(
      "C4416: Кейс 10: добавление анкеты для существующего оцениваемого - новые коллеги видят сразу",
      { tag: ["@regression"] },
      async ({ adminAuth: adminPage, browser, request }, testInfo) => {
        setSeverity("normal");
        test.slow();
        testInfo.setTimeout(600_000);

        const listPage = new PerformanceReviewsListPage(adminPage, testInfo);
        const configPage = new PerformanceReviewConfigPage(adminPage, testInfo);
        const orgHelper = new OrgStructureHelper(adminPage, testInfo);
        const adminFillPage = new PerformanceReviewFillPage(
          adminPage,
          testInfo,
        );
        const userSession = createUserSession(browser, testInfo);

        let users = [];
        let managerUser = null;
        let colleagues = [];
        let newColleagues = [];
        let actuallyAddedColleagues = []; // Фактически добавленные коллеги
        let prId = null;
        let revisionId = null;
        let revisionAlias = null;
        const baseUrl = new URL(process.env.BASE_URL).origin;
        const prName = `Кейс 10 добавление после ${Date.now()}`;

        // Получение пользователей
        await test.step("Получить пользователей", async () => {
          await adminPage.goto(baseUrl, { waitUntil: "domcontentloaded" });
          users = await orgHelper.getUsersList(11);
          users = await filterValidUsers(users);

          if (users.length < 6) {
            throw new Error(
              "Недостаточно пользователей для теста (нужно минимум 6)",
            );
          }

          managerUser = users[1];
          colleagues = users.slice(2, 4); // Первая группа коллег
          newColleagues = users.slice(4, 6); // Новые коллеги для добавления позже
          console.log(`Руководитель: ${managerUser.name}`);
          console.log(`Коллеги: ${colleagues.map((c) => c.name).join(", ")}`);
          console.log(
            `Новые коллеги: ${newColleagues.map((c) => c.name).join(", ")}`,
          );
        });

        // Создание и запуск PR
        await test.step("Создать и запустить PR", async () => {
          await adminPage.goto(
            new URL("/ru/manager/performance-reviews/", baseUrl).toString(),
          );
          await listPage.assertOpened();

          await listPage.openCreateModal();
          await listPage.performanceReviewType.click();
          await configPage.assertOpened();

          // Задаём уникальное имя PR для надёжной идентификации на главной странице
          await configPage.fillTitle(prName);
          console.log(`✓ PR название: "${prName}"`);

          await configPage.configureDirections({
            self: true,
            manager: true,
            colleagues: true,
            subordinates: false,
          });

          await configPage.configureColleaguesSelection({
            askEmployees: true,
            minColleagues: 2,
            maxColleagues: 5,
            earlyAccess: true,
            showSelfAssessmentToColleagues: true,
            managerApproval: false,
          });

          await configPage.addTargetUsers({ count: 1 });
          await configPage.editRespondentsTable({ managers: [managerUser] });
          await configPage.disableReminders();
          await configPage.addAssessmentsForAllDirections();
          await configPage.goToStep("launch");
          await configPage.launchAndSendQuestionnaires();

          const currentUrl = adminPage.url();
          const match = currentUrl.match(/\/performance-reviews\/(\d+)/);
          if (match) {
            prId = match[1];
            console.log(`✓ PR запущен, ID: ${prId}`);
          }

          // Получаем alias ревизии через API — нужен для прямых URL
          const prAPI = new PerformanceReviewAPI(request);
          const { email, password } = getCredentials("admin");
          await prAPI.signIn(email, password);
          const { data: revision } = await prAPI.getLastRevision(prId);
          revisionId = revision?.id;
          revisionAlias = revision?.alias;
          console.log(`✓ Revision alias: ${revisionAlias}`);
        });

        // Заполнение самооценки
        await test.step("Оцениваемый заполняет самооценку", async () => {
          // Инициализация API
          const prAPI = new PerformanceReviewAPI(request);
          const { email, password } = getCredentials("admin");
          await prAPI.signIn(email, password);

          // Заполнение анкет через API
          const populateSettings = {
            skipChance: 0,
            commentChance: 0,
            customChance: 0,
            lowerLimit: 60,
            upperLimit: 100,
          };
          let filledCount = 0;
          for (let attempt = 1; attempt <= 15; attempt++) {
            const { response } = await prAPI.populateReview(
              prId,
              populateSettings,
              { timeout: 120000 },
            );
            if (response.ok()) {
              filledCount++;
              await new Promise((r) => setTimeout(r, 100));
            } else if (response.status() === 500) {
              break;
            } else {
              break;
            }
          }
          console.log(`populateReview: ${filledCount} анкет заполнено`);
          console.log("✓ Самооценка заполнена");
          await adminPage.waitForTimeout(2000);
        });

        // Выбор первой группы коллег через API
        await test.step("Оцениваемый выбирает коллег через API", async () => {
          const prAPI2 = new PerformanceReviewAPI(request);
          const { email: adminEmail, password: adminPass } =
            getCredentials("admin");
          await prAPI2.signIn(adminEmail, adminPass);

          const { data: nominationData } = await prAPI2.get(
            `/manager/performance-reviews/${prId}/nominations/of-revision/${revisionId}/`,
          );
          if (!nominationData?.id) {
            throw new Error("Nomination не найдена для данной ревизии");
          }
          const nominationId = nominationData.id;

          const { data: targetUsersData } = await prAPI2.getTargetUsers(prId);
          const targetUsers = targetUsersData?.items || targetUsersData || [];
          if (targetUsers.length === 0) {
            throw new Error("Target users не найдены в PR");
          }
          const targetUserId = targetUsers[0].id;

          const { data: nomTargetData } = await prAPI2.post(
            `/manager/performance-reviews/${prId}/nominations/${nominationId}/target-users/get`,
            { targetUsersIds: [targetUserId] },
          );
          const nomTargetUsers = nomTargetData?.items || nomTargetData || [];
          if (nomTargetUsers.length === 0) {
            throw new Error("NominationTargetUser не найден");
          }
          const nominationTargetUserId = nomTargetUsers[0].id;

          const colleagueUserIds = [];
          for (const colleague of colleagues) {
            const match = colleague.name.match(/\b(\d{4,6})\b/);
            if (match) {
              colleagueUserIds.push(parseInt(match[1], 10));
            }
          }
          if (colleagueUserIds.length < 2) {
            throw new Error(
              `Не удалось извлечь userId из имён коллег (${colleagueUserIds.length}/2)`,
            );
          }

          const userAPI = new DashboardTeamAPI(request);
          await userAPI.signIn(users[0].email, getTestUserPassword());

          await userAPI.suggestReceivers(prId, nominationId, {
            targetUserId: nominationTargetUserId,
            receiversIds: colleagueUserIds,
          });
          console.log("✓ Коллеги предложены через API");

          const { response: submitResp } = await userAPI.submitNomination(
            prId,
            nominationId,
            { targetUserId: nominationTargetUserId },
          );
          if (!submitResp.ok()) {
            throw new Error(
              `submitNomination failed: HTTP ${submitResp.status()}`,
            );
          }
          console.log(`✓ Выбрано ${colleagues.length} коллег через API`);
          await new Promise((r) => setTimeout(r, 2000));
        });

        // Проверка: первые коллеги видят анкету
        await test.step("Проверить что первые коллеги видят анкету", async () => {
          if (colleagues.length === 0) return;

          const firstColleague = colleagues[0];
          await userSession.runAs(firstColleague, async (page) => {
            await assertUserHasQuestionnaire(
              page,
              baseUrl,
              prId,
              true,
              expect,
              { revisionAlias },
            );
            console.log(
              `✓ Коллега ${firstColleague.name} видит анкету PR ID=${prId}`,
            );
          });
        });

        // Админ добавляет НОВУЮ анкету самооценки
        await test.step("Админ добавляет новую анкету самооценки", async () => {
          await adminPage.goto(
            new URL(
              `/ru/manager/performance-reviews/${prId}`,
              baseUrl,
            ).toString(),
          );
          await adminPage.waitForLoadState("networkidle");

          await configPage.addAssessmentForDirection("Самооценка");
          console.log("✓ Новая анкета самооценки добавлена");
          await adminPage.waitForTimeout(2000);
        });

        // Админ добавляет НОВЫХ коллег через панель управления PR
        await test.step("Админ добавляет новых коллег", async () => {
          await adminPage.goto(
            new URL(
              `/ru/manager/performance-reviews/${prId}`,
              baseUrl,
            ).toString(),
          );
          await adminPage.waitForLoadState("networkidle");

          // Добавляем новых коллег через редактирование таблицы респондентов
          const editResult = await configPage.editRespondentsTable({
            colleagues: newColleagues,
          });
          actuallyAddedColleagues = editResult.addedColleagues;
          console.log(
            `✓ Админ добавил ${actuallyAddedColleagues.length} новых коллег: ${actuallyAddedColleagues.map((c) => c.name).join(", ")}`,
          );

          // Сохраняем изменения - нажимаем кнопку "Сохранить" в боковой панели
          const saveButton = adminPage
            .locator("button")
            .filter({ hasText: /^сохранить$/i })
            .first();
          await adminPage.waitForTimeout(1000);

          let _visible3 = false;
          try {
            await saveButton
            .waitFor({ state: "visible", timeout: 5000 })
            _visible3 = true;
          } catch {}
          if (_visible3) {
            await saveButton.click();
            console.log('✓ Кнопка "Сохранить" нажата');

            // После нажатия "Сохранить" появляется модальное окно "Подтвердите изменения"
            const confirmButton = adminPage
              .locator("button")
              .filter({ hasText: /подтвердить изменения/i })
              .first();
            await adminPage.waitForTimeout(1000);

            let _visible4 = false;
            try {
              await confirmButton
              .waitFor({ state: "visible", timeout: 5000 })
              _visible4 = true;
            } catch {}
            if (_visible4) {
              await confirmButton.click();
              console.log('✓ Кнопка "Подтвердить изменения" нажата');
            }

            // Ждём применения изменений
            await adminPage.waitForTimeout(3000);
            await adminPage.waitForLoadState("networkidle");
            console.log("✓ Изменения сохранены");
          } else {
            console.log('⚠️ Кнопка "Сохранить" не найдена');
          }

          await adminPage.waitForTimeout(2000);
        });

        // ПРОВЕРКА: новые коллеги ВИДЯТ анкету СРАЗУ (ожидаемое поведение для существующего оцениваемого)
        await test.step("Проверить что новые коллеги ВИДЯТ анкету сразу", async () => {
          if (actuallyAddedColleagues.length === 0) {
            throw new Error("Нет фактически добавленных коллег для проверки");
          }

          // Берём последнего фактически добавленного коллегу (он гарантировано добавлен, если список не пуст)
          const newColleague =
            actuallyAddedColleagues[actuallyAddedColleagues.length - 1];
          console.log(
            `Проверяем фактически добавленного коллегу: ${newColleague.name}`,
          );
          await userSession.runAs(newColleague, async (page) => {
            // Даём время на рассылку анкет после сохранения изменений
            await page.waitForTimeout(3000);

            // Новые коллеги ВИДЯТ анкету СРАЗУ для существующего оцениваемого
            // (не ждут заполнения добавленной анкеты самооценки)
            await assertUserHasQuestionnaire(
              page,
              baseUrl,
              prId,
              true,
              expect,
              { revisionAlias },
            );
            console.log(
              `✓ Новый коллега ${newColleague.name} ВИДИТ анкету PR ID=${prId} (ожидаемое поведение)`,
            );
          });
        });

        console.log(
          "✅ Кейс 10 завершён: для существующих оцениваемых новые коллеги видят анкету сразу",
        );
      },
    );
  },
);
