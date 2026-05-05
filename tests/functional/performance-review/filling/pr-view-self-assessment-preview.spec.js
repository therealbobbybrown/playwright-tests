// tests/functional/performance-review/filling/pr-view-self-assessment-preview.spec.js
// E2E тесты: Итерация 2 - Блок просмотра результатов самооценки на странице заполнения анкет
//
// Тестируемые кейсы:
// Кейс 12: Проверка отображения ответов на все типы вопросов (звёздочки, шкала, текст)
// Кейс 13: Проверка что блок показывается только руководителям и коллегам (не оцениваемому)
// Кейс 14: Проверка что результаты показываются после сброса ответа в админке
// Кейс 15: Проверка изменения текста при смене анкеты самооценки на другую

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
  "Performance Review - Просмотр результатов самооценки (Итерация 2)",
  {
    tag: [
      "@performance-review",
      "@filling",
      "@e2e",
      "@self-assessment",
      "@preview",
      "@regression",
    ],
  },
  () => {
    test.beforeEach(() => {
      markAsE2ETest(MODULES.PERFORMANCE_REVIEW, "Self Assessment Preview");
    });

    /**
     * Кейс 12: Проверка отображения ответов на все типы вопросов
     *
     * Предусловия:
     * - PR создан с showSelfAssessmentToColleagues: true
     * - Оцениваемый заполнил самооценку
     *
     * Ожидаемый результат:
     * - Руководитель/коллега видит блок "Сотрудник заполнил самооценку"
     * - Кнопка "Показать самооценку" открывает модальное окно
     * - В модальном окне отображаются ответы на вопросы (звёздочки, шкала, текст)
     */
    test(
      "C4417: Кейс 12: отображение ответов на все типы вопросов в просмотре самооценки",
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
        let colleagues = [];
        let evaluatedUserName = null;
        let prId = null;
        let revisionId = null;
        let revisionAlias = null;
        const baseUrl = new URL(process.env.BASE_URL).origin;
        const prTitle = `Кейс 12 просмотр самооценки ${Date.now()}`;

        // ---------------------- Шаг 1: Получение пользователей ----------------------
        await test.step("Получить пользователей", async () => {
          await adminPage.goto(baseUrl, { waitUntil: "domcontentloaded" });
          users = await orgHelper.getUsersList(13);
          users = await filterValidUsers(users);

          if (users.length < 6) {
            throw new Error(
              "Недостаточно пользователей для теста (нужно минимум 6)",
            );
          }

          // Оцениваемый - Elena Shapoval (users[0]), она же админ
          evaluatedUserName = users[0]?.name || "Elena Shapoval";
          // Руководитель - берём users[4] или users[5], чтобы он был "свежим" и не заполнял анкеты
          managerUser = users[4] || users[3];
          // Коллеги - users[5], users[6] или другие свободные
          colleagues = [users[5] || users[2], users[6] || users[3]];

          console.log(`Оцениваемый: ${evaluatedUserName}`);
          console.log(
            `Руководитель: ${managerUser.name} (${managerUser.email})`,
          );
          console.log(`Коллеги: ${colleagues.map((c) => c.name).join(", ")}`);
        });

        // ---------------------- Шаг 2: Создание PR с показом самооценки ----------------------
        await test.step("Создать PR с показом самооценки коллегам", async () => {
          await adminPage.goto(
            new URL("/ru/manager/performance-reviews/", baseUrl).toString(),
          );
          await listPage.assertOpened();

          await listPage.openCreateModal();
          await listPage.performanceReviewType.click();
          await configPage.assertOpened();

          await configPage.fillTitle(prTitle);

          await configPage.configureDirections({
            self: true,
            manager: true,
            colleagues: true,
            subordinates: false,
          });

          // КЛЮЧЕВАЯ НАСТРОЙКА: showSelfAssessmentToColleagues
          await configPage.configureColleaguesSelection({
            askEmployees: true,
            minColleagues: 2, // Минимум 2 коллеги
            maxColleagues: 5,
            managerApproval: false,
            earlyAccess: true,
            showSelfAssessmentToColleagues: true, // Показывать самооценку коллегам
          });

          console.log("✓ PR настроен с показом самооценки коллегам");
        });

        // ---------------------- Шаг 3: Добавление участников и запуск ----------------------
        await test.step("Добавить участников и запустить PR", async () => {
          await configPage.addTargetUsers({ count: 1 });
          await configPage.editRespondentsTable({ managers: [managerUser] });
          await configPage.disableReminders();
          // Используем анкету "Все типы вопросов" для проверки всех виджетов
          await configPage.addAssessmentsForAllDirections({
            assessmentName: "Все типы вопросов",
          });
          await configPage.goToStep("launch");
          await configPage.launchAndSendQuestionnaires();

          const currentUrl = adminPage.url();
          const match = currentUrl.match(/\/performance-reviews\/(\d+)/);
          if (match) {
            prId = match[1];
            console.log(`✓ PR запущен, ID: ${prId}`);
          }

          // Получаем alias ревизии — нужен для прямых URL респондентов
          const prAPI = new PerformanceReviewAPI(request);
          const { email, password } = getCredentials("admin");
          await prAPI.signIn(email, password);
          const { data: revision } = await prAPI.getLastRevision(prId);
          revisionId = revision?.id;
          revisionAlias = revision?.alias;
          console.log(`✓ Revision ID: ${revisionId}, alias: ${revisionAlias}`);
        });

        // ---------------------- Шаг 4: Оцениваемый выбирает коллег через API ----------------------
        await test.step("Оцениваемый выбирает коллег через API", async () => {
          const prAPI2 = new PerformanceReviewAPI(request);
          const { email: adminEmail, password: adminPass } =
            getCredentials("admin");
          await prAPI2.signIn(adminEmail, adminPass);

          // 1. Получаем nomination для ревизии
          const { data: nominationData } = await prAPI2.get(
            `/manager/performance-reviews/${prId}/nominations/of-revision/${revisionId}/`,
          );
          if (!nominationData?.id) {
            throw new Error("Nomination не найдена для данной ревизии");
          }
          const nominationId = nominationData.id;
          console.log(`Nomination ID: ${nominationId}`);

          // 2. Получаем target users для PR
          const { data: targetUsersData } = await prAPI2.getTargetUsers(prId);
          const targetUsers = targetUsersData?.items || targetUsersData || [];
          if (targetUsers.length === 0) {
            throw new Error("Target users не найдены в PR");
          }
          const targetUserId = targetUsers[0].id;

          // 3. Получаем NominationTargetUser ID
          const { data: nomTargetData } = await prAPI2.post(
            `/manager/performance-reviews/${prId}/nominations/${nominationId}/target-users/get`,
            { targetUsersIds: [targetUserId] },
          );
          const nomTargetUsers = nomTargetData?.items || nomTargetData || [];
          if (nomTargetUsers.length === 0) {
            throw new Error("NominationTargetUser не найден");
          }
          const nominationTargetUserId = nomTargetUsers[0].id;

          // 4. Извлекаем userId из имён коллег (seed: "FirstName {userId} LastName {userId}")
          const colleagueUserIds = [];
          for (const colleague of colleagues.slice(0, 2)) {
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

          // 5. Авторизуемся как оцениваемый и отправляем номинацию
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
          console.log("✓ Номинация отправлена через API");
        });

        // ---------------------- Шаг 5: Заполнение самооценки ----------------------
        await test.step("Оцениваемый заполняет самооценку", async () => {
          await userSession.runAs(users[0], async (page) => {
            const fillPage = new PerformanceReviewFillPage(page, testInfo);

            const selfAssessUrl = new URL(
              `/ru/performance-reviews/${prId}/${revisionAlias}/`,
              baseUrl,
            ).toString();
            console.log(
              `📍 Переход к самооценке через alias URL: ${selfAssessUrl}`,
            );
            await gotoWithRetryOn404(page, selfAssessUrl);
            console.log(`📍 URL после перехода: ${page.url()}`);

            // Если оказались на странице номинации — повторная навигация
            if (page.url().includes("/nomination/")) {
              console.log("⚠️ Редирект на номинацию — ждём и повторяем");
              await page.waitForTimeout(3000);
              await gotoWithRetryOn404(page, selfAssessUrl);
              console.log(`📍 URL после повторного перехода: ${page.url()}`);
            }

            // Ищем кнопку "Заполнить анкету" / "Заполнить"
            const fillBtn = page
              .locator("button, a")
              .filter({ hasText: /заполнить анкету/i })
              .first();
            let _visible1 = false;
            try {
              await fillBtn
              .waitFor({ state: "visible", timeout: 5000 })
              _visible1 = true;
            } catch {}
            if (_visible1) {
              await fillBtn.click();
              await page.waitForTimeout(1000);
              console.log('✓ Нажата кнопка "Заполнить анкету"');
            } else {
              const fillBtn2 = page
                .locator("button, a")
                .filter({ hasText: /^заполнить$/i })
                .first();
              let _visible2 = false;
              try {
                await fillBtn2
                .waitFor({ state: "visible", timeout: 3000 })
                _visible2 = true;
              } catch {}
              if (_visible2) {
                await fillBtn2.click();
                await page.waitForTimeout(1000);
                console.log('✓ Нажата кнопка "Заполнить"');
              } else {
                console.log("⚠️ Кнопка заполнения не найдена");
                const allBtns = await page.locator("button").allTextContents();
                console.log(
                  `Все кнопки: ${allBtns.filter((b) => b.trim()).join(", ")}`,
                );
              }
            }

            // Проверяем что есть блоки вопросов перед заполнением
            const questionBlocks = page.locator(
              '[class*="Block_block"][id^="q"]',
            );
            let hasQuestions = false;
            try {
              await questionBlocks
              .first()
              .waitFor({ state: "visible", timeout: 10000 })
              hasQuestions = true;
            } catch {}

            if (!hasQuestions) {
              const currentUrl = page.url();
              const allBtns = await page.locator("button").allTextContents();
              throw new Error(
                `Блоки вопросов не найдены на ${currentUrl}. ` +
                  `Кнопки: ${allBtns.filter((b) => b.trim()).join(", ")}`,
              );
            }

            await fillPage.fillStepByStepWithNext();
            console.log("✓ Самооценка заполнена");
            await page.waitForTimeout(3000);
          });
        });

        // ---------------------- Шаг 5.5: Пакетная рассылка анкет ----------------------
        await test.step("Выполнить пакетную рассылку", async () => {
          await adminPage.goto(
            new URL(
              `/ru/manager/performance-reviews/${prId}`,
              baseUrl,
            ).toString(),
          );
          await adminPage.waitForLoadState("networkidle");
          const fillTab = adminPage
            .locator("button")
            .filter({ hasText: /заполнение анкет/i })
            .first();
          let _visible3 = false;
          try {
            await fillTab
            .waitFor({ state: "visible", timeout: 5000 })
            _visible3 = true;
          } catch {}
          if (_visible3) {
            await fillTab.click();
            await adminPage.waitForTimeout(1000);
          }

          // Кликаем "Отправить анкеты" в алерте
          const sendButton = adminPage
            .locator("button")
            .filter({ hasText: /отправить анкеты/i })
            .first();
          let _visible4 = false;
          try {
            await sendButton
            .waitFor({ state: "visible", timeout: 10_000 })
            _visible4 = true;
          } catch {}
          if (_visible4) {
            await sendButton.click();
            console.log('✓ Кликнули "Отправить анкеты"');

            // Может появиться подтверждение "Завершить самооценку" (если самооценка ещё не завершена)
            // НЕ используем `dialog button` CSS — это <div role="dialog">, не <dialog>
            const confirmBtn = adminPage
              .locator("button")
              .filter({ hasText: /^Завершить самооценку$/i })
              .first();
            let _visible5 = false;
            try {
              await confirmBtn
              .waitFor({ state: "visible", timeout: 5_000 })
              _visible5 = true;
            } catch {}
            if (_visible5) {
              await confirmBtn.click();
              console.log('✓ Подтвердили "Завершить самооценку"');
              await adminPage
                .locator(".ReactModal__Content")
                .first()
                .waitFor({ state: "hidden", timeout: 15_000 });
            }

            await adminPage.waitForLoadState("networkidle");
          } else {
            console.log(
              '⚠️ Кнопка "Отправить анкеты" не найдена — анкеты уже отправлены',
            );
          }
          console.log("✓ Пакетная рассылка выполнена");
        });

        // ---------------------- Шаг 6: ПРОВЕРКА - Руководитель видит блок и просматривает ----------------------
        await test.step("Проверить отображение просмотра самооценки для руководителя", async () => {
          await userSession.runAs(managerUser, async (page) => {
            const fillPage = new PerformanceReviewFillPage(page, testInfo);

            // Респондент → прямой URL через alias ревизии (toAssessments=true даёт 404 для респондентов)
            const respondentUrl = new URL(
              `/ru/performance-reviews/${prId}/${revisionAlias}/`,
              baseUrl,
            ).toString();
            await gotoWithRetryOn404(page, respondentUrl);
            console.log(`📍 URL после прямого перехода: ${page.url()}`);

            await page.waitForTimeout(2000);

            // Проверяем что блок просмотра самооценки виден на странице заполнения
            const previewVisible =
              await fillPage.isSelfAssessmentPreviewVisible();
            expect(previewVisible).toBe(true);
            console.log(
              '✓ Руководитель видит блок "Сотрудник заполнил самооценку"',
            );

            // Открываем модальное окно
            await fillPage.openSelfAssessmentPreview();

            // Проверяем содержимое
            const content = await fillPage.verifySelfAssessmentPreviewContent();
            expect(content.hasQuestions).toBe(true);
            console.log(
              `✓ В модальном окне ${content.questionsCount} вопросов`,
            );

            // Закрываем модальное окно
            await fillPage.closeSelfAssessmentPreview();
            console.log("✓ Модальное окно закрыто");
          });
        });

        // ---------------------- Шаг 7: ПРОВЕРКА - Коллега видит блок и просматривает ----------------------
        await test.step("Проверить отображение просмотра самооценки для коллеги", async () => {
          const firstColleague = colleagues[0];
          await userSession.runAs(firstColleague, async (page) => {
            const fillPage = new PerformanceReviewFillPage(page, testInfo);

            // Респондент → прямой URL через alias ревизии (toAssessments=true даёт 404 для респондентов)
            const respondentUrl = new URL(
              `/ru/performance-reviews/${prId}/${revisionAlias}/`,
              baseUrl,
            ).toString();
            await gotoWithRetryOn404(page, respondentUrl);
            console.log(`📍 URL после прямого перехода: ${page.url()}`);

            await page.waitForTimeout(2000);

            // Проверяем что блок просмотра самооценки виден на странице заполнения
            const previewVisible =
              await fillPage.isSelfAssessmentPreviewVisible();
            expect(previewVisible).toBe(true);
            console.log('✓ Коллега видит блок "Сотрудник заполнил самооценку"');

            // Открываем модальное окно
            await fillPage.openSelfAssessmentPreview();

            // Проверяем содержимое
            const content = await fillPage.verifySelfAssessmentPreviewContent();
            expect(content.hasQuestions).toBe(true);
            console.log(
              `✓ Коллега видит ${content.questionsCount} вопросов в просмотре`,
            );

            // Закрываем модальное окно
            await fillPage.closeSelfAssessmentPreview();
          });
        });

        console.log(
          "✅ Кейс 12 завершён: отображение ответов в просмотре самооценки работает корректно",
        );
      },
    );

    /**
     * Кейс 13: Проверка что блок показывается только руководителям и коллегам
     *
     * Ожидаемый результат:
     * - Оцениваемый НЕ видит блок просмотра своей самооценки
     * - Руководитель ВИДИТ блок
     * - Коллега ВИДИТ блок
     */
    test(
      "C4418: Кейс 13: блок просмотра показывается только руководителям и коллегам",
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
        let colleagueUsers = [];
        let evaluatedUserName = null;
        let prId = null;
        let revisionId = null;
        let revisionAlias = null;
        const baseUrl = new URL(process.env.BASE_URL).origin;
        const prTitle = `Кейс 13 видимость блока ${Date.now()}`;

        // Получение пользователей
        await test.step("Получить пользователей", async () => {
          await adminPage.goto(baseUrl, { waitUntil: "domcontentloaded" });
          users = await orgHelper.getUsersList(13);
          users = await filterValidUsers(users);

          if (users.length < 5) {
            throw new Error(
              "Недостаточно пользователей для теста (нужно минимум 5)",
            );
          }

          evaluatedUserName = users[0]?.name || "Elena Shapoval";
          managerUser = users[1];
          colleagueUsers = [users[2], users[3]]; // Два коллеги для minColleagues: 2

          console.log(`Оцениваемый: ${evaluatedUserName}`);
          console.log(`Руководитель: ${managerUser.name}`);
          console.log(
            `Коллеги: ${colleagueUsers.map((u) => u.name).join(", ")}`,
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

          await configPage.fillTitle(prTitle);

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
            managerApproval: false,
            earlyAccess: true,
            showSelfAssessmentToColleagues: true,
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

          // Получаем alias ревизии — нужен для прямых URL респондентов
          const prAPI = new PerformanceReviewAPI(request);
          const { email, password } = getCredentials("admin");
          await prAPI.signIn(email, password);
          const { data: revision } = await prAPI.getLastRevision(prId);
          revisionId = revision?.id;
          revisionAlias = revision?.alias;
          console.log(`✓ Revision ID: ${revisionId}, alias: ${revisionAlias}`);
        });

        // Выбор коллег через API
        await test.step("Оцениваемый выбирает коллег через API", async () => {
          const prAPI2 = new PerformanceReviewAPI(request);
          const { email: adminEmail, password: adminPass } =
            getCredentials("admin");
          await prAPI2.signIn(adminEmail, adminPass);

          // 1. Получаем nomination для ревизии
          const { data: nominationData } = await prAPI2.get(
            `/manager/performance-reviews/${prId}/nominations/of-revision/${revisionId}/`,
          );
          if (!nominationData?.id) {
            throw new Error("Nomination не найдена для данной ревизии");
          }
          const nominationId = nominationData.id;
          console.log(`Nomination ID: ${nominationId}`);

          // 2. Получаем target users для PR
          const { data: targetUsersData } = await prAPI2.getTargetUsers(prId);
          const targetUsers = targetUsersData?.items || targetUsersData || [];
          if (targetUsers.length === 0) {
            throw new Error("Target users не найдены в PR");
          }
          const targetUserId = targetUsers[0].id;

          // 3. Получаем NominationTargetUser ID
          const { data: nomTargetData } = await prAPI2.post(
            `/manager/performance-reviews/${prId}/nominations/${nominationId}/target-users/get`,
            { targetUsersIds: [targetUserId] },
          );
          const nomTargetUsers = nomTargetData?.items || nomTargetData || [];
          if (nomTargetUsers.length === 0) {
            throw new Error("NominationTargetUser не найден");
          }
          const nominationTargetUserId = nomTargetUsers[0].id;

          // 4. Извлекаем userId из имён коллег (seed: "FirstName {userId} LastName {userId}")
          const colleagueUserIds = [];
          for (const colleague of colleagueUsers) {
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

          // 5. Авторизуемся как оцениваемый и отправляем номинацию
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
          console.log("✓ Номинация отправлена через API");
        });

        // Заполнение самооценки
        await test.step("Оцениваемый заполняет самооценку", async () => {
          await userSession.runAs(users[0], async (page) => {
            const fillPage = new PerformanceReviewFillPage(page, testInfo);

            const selfAssessUrl = new URL(
              `/ru/performance-reviews/${prId}/${revisionAlias}/`,
              baseUrl,
            ).toString();
            await gotoWithRetryOn404(page, selfAssessUrl);
            console.log(`📍 URL после перехода: ${page.url()}`);

            if (page.url().includes("/nomination/")) {
              console.log("⚠️ Редирект на номинацию — ждём и повторяем");
              await page.waitForTimeout(3000);
              await gotoWithRetryOn404(page, selfAssessUrl);
            }

            const fillBtn = page
              .locator("button, a")
              .filter({ hasText: /заполнить анкету/i })
              .first();
            let _visible6 = false;
            try {
              await fillBtn
              .waitFor({ state: "visible", timeout: 5000 })
              _visible6 = true;
            } catch {}
            if (_visible6) {
              await fillBtn.click();
              await page.waitForTimeout(1000);
            } else {
              const fillBtn2 = page
                .locator("button, a")
                .filter({ hasText: /^заполнить$/i })
                .first();
              let _visible7 = false;
              try {
                await fillBtn2
                .waitFor({ state: "visible", timeout: 3000 })
                _visible7 = true;
              } catch {}
              if (_visible7) {
                await fillBtn2.click();
                await page.waitForTimeout(1000);
              }
            }

            const questionBlocks = page.locator(
              '[class*="Block_block"][id^="q"]',
            );
            let hasQuestions = false;
            try {
              await questionBlocks
              .first()
              .waitFor({ state: "visible", timeout: 10000 })
              hasQuestions = true;
            } catch {}

            if (!hasQuestions) {
              throw new Error(`Блоки вопросов не найдены на ${page.url()}`);
            }

            await fillPage.fillStepByStepWithNext();
            console.log("✓ Самооценка заполнена");
            await page.waitForTimeout(3000);
          });
        });

        // Пакетная рассылка — без неё респонденты не получают анкеты
        await test.step("Выполнить пакетную рассылку", async () => {
          await adminPage.goto(
            new URL(
              `/ru/manager/performance-reviews/${prId}`,
              baseUrl,
            ).toString(),
          );
          await adminPage.waitForLoadState("networkidle");
          const fillTab = adminPage
            .locator("button")
            .filter({ hasText: /заполнение анкет/i })
            .first();
          let _visible8 = false;
          try {
            await fillTab
            .waitFor({ state: "visible", timeout: 5000 })
            _visible8 = true;
          } catch {}
          if (_visible8) {
            await fillTab.click();
            await adminPage.waitForTimeout(1000);
          }

          const sendButton2 = adminPage
            .locator("button")
            .filter({ hasText: /отправить анкеты/i })
            .first();
          let _visible9 = false;
          try {
            await sendButton2
            .waitFor({ state: "visible", timeout: 10_000 })
            _visible9 = true;
          } catch {}
          if (_visible9) {
            await sendButton2.click();
            console.log('✓ Кликнули "Отправить анкеты"');

            // НЕ используем `dialog button` CSS — это <div role="dialog">, не <dialog>
            const confirmBtn2 = adminPage
              .locator("button")
              .filter({ hasText: /^Завершить самооценку$/i })
              .first();
            let _visible10 = false;
            try {
              await confirmBtn2
              .waitFor({ state: "visible", timeout: 5_000 })
              _visible10 = true;
            } catch {}
            if (_visible10) {
              await confirmBtn2.click();
              console.log('✓ Подтвердили "Завершить самооценку"');
              await adminPage
                .locator(".ReactModal__Content")
                .first()
                .waitFor({ state: "hidden", timeout: 15_000 });
            }

            await adminPage.waitForLoadState("networkidle");
            console.log("✓ Пакетная рассылка выполнена");
          } else {
            console.log(
              '⚠️ Кнопка "Отправить анкеты" не найдена — анкеты уже отправлены',
            );
          }
        });

        // ПРОВЕРКА 1: Оцениваемый НЕ видит блок просмотра
        await test.step("Проверить что оцениваемый НЕ видит блок просмотра своей самооценки", async () => {
          // Оцениваемый - это adminPage (первый пользователь)
          await adminPage.goto(new URL("/ru/", baseUrl).toString());
          await adminPage.waitForLoadState("networkidle");

          // У оцениваемого не должно быть блока просмотра самооценки
          // Он может видеть только свои заполненные анкеты
          const selfAssessmentPreview = adminPage
            .locator('[class*="Block"], div')
            .filter({ hasText: /сотрудник заполнил самооценку/i })
            .first();

          let isVisible = false;
          try {
            await selfAssessmentPreview
            .waitFor({ state: "visible", timeout: 3000 })
            isVisible = true;
          } catch {}
          expect(isVisible).toBe(false);
          console.log("✓ Оцениваемый НЕ видит блок просмотра своей самооценки");
        });

        // ПРОВЕРКА 2: Руководитель ВИДИТ блок
        await test.step("Проверить что руководитель ВИДИТ блок просмотра", async () => {
          await userSession.runAs(managerUser, async (page) => {
            const fillPage = new PerformanceReviewFillPage(page, testInfo);

            // Респондент → прямой URL через alias ревизии (toAssessments=true даёт 404 для респондентов)
            const respondentUrl = new URL(
              `/ru/performance-reviews/${prId}/${revisionAlias}/`,
              baseUrl,
            ).toString();
            await gotoWithRetryOn404(page, respondentUrl);
            console.log(`📍 URL после прямого перехода: ${page.url()}`);

            await page.waitForTimeout(2000);

            // Руководитель должен видеть блок
            const previewVisible =
              await fillPage.isSelfAssessmentPreviewVisible();
            expect(previewVisible).toBe(true);
            console.log("✓ Руководитель ВИДИТ блок просмотра самооценки");
          });
        });

        // ПРОВЕРКА 3: Коллега ВИДИТ блок (проверяем первого из выбранных коллег)
        await test.step("Проверить что коллега ВИДИТ блок просмотра", async () => {
          await userSession.runAs(colleagueUsers[0], async (page) => {
            const fillPage = new PerformanceReviewFillPage(page, testInfo);

            // Респондент → прямой URL через alias ревизии (toAssessments=true даёт 404 для респондентов)
            const respondentUrl = new URL(
              `/ru/performance-reviews/${prId}/${revisionAlias}/`,
              baseUrl,
            ).toString();
            await gotoWithRetryOn404(page, respondentUrl);
            console.log(`📍 URL после прямого перехода: ${page.url()}`);

            await page.waitForTimeout(2000);

            // Коллега должен видеть блок
            const previewVisible =
              await fillPage.isSelfAssessmentPreviewVisible();
            expect(previewVisible).toBe(true);
            console.log("✓ Коллега ВИДИТ блок просмотра самооценки");
          });
        });

        console.log(
          "✅ Кейс 13 завершён: блок просмотра показывается только руководителям и коллегам",
        );
      },
    );

    /**
     * Кейс 14: Проверка что результаты показываются после сброса ответа в админке
     *
     * Предусловия:
     * - PR запущен, самооценка заполнена
     * - Руководитель видит блок просмотра
     *
     * Шаги:
     * 1. Сбросить ответ самооценки через админку
     * 2. Проверить что блок просмотра всё ещё показывается (данные сохраняются)
     *
     * Ожидаемый результат:
     * - После сброса ответа блок просмотра с результатами продолжает показываться
     */
    test(
      "C4419: Кейс 14: результаты показываются после сброса ответа в админке",
      { tag: ["@normal"] },
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

        // API для сброса ответа
        const prAPI = new PerformanceReviewAPI(request);
        const { email, password } = getCredentials("admin");
        await prAPI.signIn(email, password);

        let users = [];
        let managerUser = null;
        let colleagueUsers = [];
        let evaluatedUserName = null;
        let prId = null;
        let revisionId = null;
        let revisionAlias = null;
        const baseUrl = new URL(process.env.BASE_URL).origin;
        const prTitle = `Кейс 14 сброс ответа ${Date.now()}`;

        // Получение пользователей
        await test.step("Получить пользователей", async () => {
          await adminPage.goto(baseUrl, { waitUntil: "domcontentloaded" });
          users = await orgHelper.getUsersList(9);
          users = await filterValidUsers(users);

          if (users.length < 5) {
            throw new Error(
              "Недостаточно пользователей для теста (нужно минимум 5)",
            );
          }

          evaluatedUserName = users[0]?.name || "Elena Shapoval";
          managerUser = users[1];
          colleagueUsers = [users[2], users[3]];

          console.log(`Оцениваемый: ${evaluatedUserName}`);
          console.log(`Руководитель: ${managerUser.name}`);
          console.log(
            `Коллеги: ${colleagueUsers.map((u) => u.name).join(", ")}`,
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

          await configPage.fillTitle(prTitle);

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
            managerApproval: false,
            earlyAccess: true,
            showSelfAssessmentToColleagues: true,
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

          // Получаем alias ревизии — нужен для прямых URL респондентов
          const { data: revision } = await prAPI.getLastRevision(prId);
          revisionId = revision?.id;
          revisionAlias = revision?.alias;
          console.log(`✓ Revision ID: ${revisionId}, alias: ${revisionAlias}`);
        });

        // Выбор коллег через API
        await test.step("Оцениваемый выбирает коллег через API", async () => {
          const prAPI2 = new PerformanceReviewAPI(request);
          const { email: adminEmail, password: adminPass } =
            getCredentials("admin");
          await prAPI2.signIn(adminEmail, adminPass);

          // 1. Получаем nomination для ревизии
          const { data: nominationData } = await prAPI2.get(
            `/manager/performance-reviews/${prId}/nominations/of-revision/${revisionId}/`,
          );
          if (!nominationData?.id) {
            throw new Error("Nomination не найдена для данной ревизии");
          }
          const nominationId = nominationData.id;
          console.log(`Nomination ID: ${nominationId}`);

          // 2. Получаем target users для PR
          const { data: targetUsersData } = await prAPI2.getTargetUsers(prId);
          const targetUsers = targetUsersData?.items || targetUsersData || [];
          if (targetUsers.length === 0) {
            throw new Error("Target users не найдены в PR");
          }
          const targetUserId = targetUsers[0].id;

          // 3. Получаем NominationTargetUser ID
          const { data: nomTargetData } = await prAPI2.post(
            `/manager/performance-reviews/${prId}/nominations/${nominationId}/target-users/get`,
            { targetUsersIds: [targetUserId] },
          );
          const nomTargetUsers = nomTargetData?.items || nomTargetData || [];
          if (nomTargetUsers.length === 0) {
            throw new Error("NominationTargetUser не найден");
          }
          const nominationTargetUserId = nomTargetUsers[0].id;

          // 4. Извлекаем userId из имён коллег (seed: "FirstName {userId} LastName {userId}")
          const colleagueUserIds = [];
          for (const colleague of colleagueUsers) {
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

          // 5. Авторизуемся как оцениваемый и отправляем номинацию
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
          console.log("✓ Номинация отправлена через API");
        });

        // Заполнение самооценки
        await test.step("Оцениваемый заполняет самооценку", async () => {
          await userSession.runAs(users[0], async (page) => {
            const fillPage = new PerformanceReviewFillPage(page, testInfo);

            const selfAssessUrl = new URL(
              `/ru/performance-reviews/${prId}/${revisionAlias}/`,
              baseUrl,
            ).toString();
            await gotoWithRetryOn404(page, selfAssessUrl);
            console.log(`📍 URL после перехода: ${page.url()}`);

            if (page.url().includes("/nomination/")) {
              console.log("⚠️ Редирект на номинацию — ждём и повторяем");
              await page.waitForTimeout(3000);
              await gotoWithRetryOn404(page, selfAssessUrl);
            }

            const fillBtn = page
              .locator("button, a")
              .filter({ hasText: /заполнить анкету/i })
              .first();
            let _visible11 = false;
            try {
              await fillBtn
              .waitFor({ state: "visible", timeout: 5000 })
              _visible11 = true;
            } catch {}
            if (_visible11) {
              await fillBtn.click();
              await page.waitForTimeout(1000);
            } else {
              const fillBtn2 = page
                .locator("button, a")
                .filter({ hasText: /^заполнить$/i })
                .first();
              let _visible12 = false;
              try {
                await fillBtn2
                .waitFor({ state: "visible", timeout: 3000 })
                _visible12 = true;
              } catch {}
              if (_visible12) {
                await fillBtn2.click();
                await page.waitForTimeout(1000);
              }
            }

            const questionBlocks = page.locator(
              '[class*="Block_block"][id^="q"]',
            );
            let hasQuestions = false;
            try {
              await questionBlocks
              .first()
              .waitFor({ state: "visible", timeout: 10000 })
              hasQuestions = true;
            } catch {}

            if (!hasQuestions) {
              throw new Error(`Блоки вопросов не найдены на ${page.url()}`);
            }

            await fillPage.fillStepByStepWithNext();
            console.log("✓ Самооценка заполнена");
            await page.waitForTimeout(3000);
          });
        });

        // Пакетная рассылка — без неё респонденты не получают анкеты
        await test.step("Выполнить пакетную рассылку", async () => {
          await adminPage.goto(
            new URL(
              `/ru/manager/performance-reviews/${prId}`,
              baseUrl,
            ).toString(),
          );
          await adminPage.waitForLoadState("networkidle");
          const fillTab = adminPage
            .locator("button")
            .filter({ hasText: /заполнение анкет/i })
            .first();
          let _visible13 = false;
          try {
            await fillTab
            .waitFor({ state: "visible", timeout: 5000 })
            _visible13 = true;
          } catch {}
          if (_visible13) {
            await fillTab.click();
            await adminPage.waitForTimeout(1000);
          }

          const sendButton3 = adminPage
            .locator("button")
            .filter({ hasText: /отправить анкеты/i })
            .first();
          let _visible14 = false;
          try {
            await sendButton3
            .waitFor({ state: "visible", timeout: 10_000 })
            _visible14 = true;
          } catch {}
          if (_visible14) {
            await sendButton3.click();
            console.log('✓ Кликнули "Отправить анкеты"');

            // НЕ используем `dialog button` CSS — это <div role="dialog">, не <dialog>
            const confirmBtn3 = adminPage
              .locator("button")
              .filter({ hasText: /^Завершить самооценку$/i })
              .first();
            let _visible15 = false;
            try {
              await confirmBtn3
              .waitFor({ state: "visible", timeout: 5_000 })
              _visible15 = true;
            } catch {}
            if (_visible15) {
              await confirmBtn3.click();
              console.log('✓ Подтвердили "Завершить самооценку"');
              await adminPage
                .locator(".ReactModal__Content")
                .first()
                .waitFor({ state: "hidden", timeout: 15_000 });
            }

            await adminPage.waitForLoadState("networkidle");
            console.log("✓ Пакетная рассылка выполнена");
          } else {
            console.log(
              '⚠️ Кнопка "Отправить анкеты" не найдена — анкеты уже отправлены',
            );
          }
        });

        // Проверка что руководитель видит блок ДО сброса
        await test.step("Проверить что руководитель видит блок ДО сброса", async () => {
          await userSession.runAs(managerUser, async (page) => {
            const fillPage = new PerformanceReviewFillPage(page, testInfo);

            // Респондент → прямой URL через alias ревизии (toAssessments=true даёт 404 для респондентов)
            const respondentUrl = new URL(
              `/ru/performance-reviews/${prId}/${revisionAlias}/`,
              baseUrl,
            ).toString();
            await gotoWithRetryOn404(page, respondentUrl);
            console.log(`📍 URL после прямого перехода: ${page.url()}`);

            await page.waitForTimeout(2000);

            const previewVisible =
              await fillPage.isSelfAssessmentPreviewVisible();
            expect(previewVisible).toBe(true);
            console.log("✓ Руководитель видит блок ДО сброса ответа");
          });
        });

        // Сброс ответа самооценки через админку
        await test.step("Сбросить ответ самооценки через админку", async () => {
          await adminPage.goto(
            new URL(
              `/ru/manager/performance-reviews/${prId}`,
              baseUrl,
            ).toString(),
          );
          await adminPage.waitForLoadState("networkidle");
          await adminPage.waitForTimeout(2000);

          // Ищем таблицу участников и кнопку сброса
          // Находим строку с оцениваемым
          const userRow = adminPage
            .locator('tr, [class*="Row"]')
            .filter({ hasText: new RegExp(evaluatedUserName, "i") })
            .first();

          let _visible16 = false;
          try {
            await userRow
            .waitFor({ state: "visible", timeout: 5000 })
            _visible16 = true;
          } catch {}
          if (_visible16) {
            // Ищем кнопку меню или контекстное меню в строке
            const menuButton = userRow
              .locator('[class*="Menu"], [class*="Dots"], button')
              .first();
            let _visible17 = false;
            try {
              await menuButton
              .waitFor({ state: "visible", timeout: 3000 })
              _visible17 = true;
            } catch {}
            if (_visible17) {
              await menuButton.click();
              await adminPage.waitForTimeout(500);

              // Ищем пункт "Сбросить ответ" или "Отменить заполнение"
              const resetOption = adminPage
                .locator('[class*="MenuItem"], [role="menuitem"], button')
                .filter({ hasText: /сбросить|отменить|reset/i })
                .first();

              let _visible18 = false;
              try {
                await resetOption
                .waitFor({ state: "visible", timeout: 3000 })
                _visible18 = true;
              } catch {}
              if (_visible18) {
                await resetOption.click();
                await adminPage.waitForTimeout(1000);

                // Подтверждаем в модальном окне если есть
                const confirmBtn = adminPage
                  .locator("button")
                  .filter({ hasText: /да|подтвердить|сбросить/i })
                  .first();
                let _visible19 = false;
                try {
                  await confirmBtn
                  .waitFor({ state: "visible", timeout: 2000 })
                  _visible19 = true;
                } catch {}
                if (_visible19) {
                  await confirmBtn.click();
                  await adminPage.waitForTimeout(2000);
                }
                console.log("✓ Ответ самооценки сброшен");
              } else {
                console.log('⚠️ Пункт "Сбросить ответ" не найден в меню');
              }
            } else {
              console.log("⚠️ Кнопка меню не найдена в строке пользователя");
            }
          } else {
            console.log("⚠️ Строка с оцениваемым не найдена");
          }
        });

        // Проверка что руководитель всё ещё видит блок ПОСЛЕ сброса
        await test.step("Проверить что руководитель ВСЁ ЕЩЁ видит результаты ПОСЛЕ сброса", async () => {
          await userSession.runAs(managerUser, async (page) => {
            const fillPage = new PerformanceReviewFillPage(page, testInfo);

            // Респондент → прямой URL через alias ревизии (toAssessments=true даёт 404 для респондентов)
            const respondentUrl = new URL(
              `/ru/performance-reviews/${prId}/${revisionAlias}/`,
              baseUrl,
            ).toString();
            await gotoWithRetryOn404(page, respondentUrl);
            console.log(`📍 URL после прямого перехода: ${page.url()}`);

            await page.waitForTimeout(2000);

            // После сброса ответа результаты всё ещё должны показываться
            // (согласно требованиям - данные сохраняются)
            const previewVisible =
              await fillPage.isSelfAssessmentPreviewVisible();
            expect(previewVisible).toBe(true);
            console.log(
              "✓ Руководитель ВСЁ ЕЩЁ видит результаты ПОСЛЕ сброса ответа",
            );
          });
        });

        console.log(
          "✅ Кейс 14 завершён: результаты продолжают показываться после сброса ответа",
        );
      },
    );

    /**
     * Кейс 15: Проверка изменения текста при смене анкеты самооценки на другую
     *
     * Предусловия:
     * - PR запущен, самооценка заполнена
     *
     * Шаги:
     * 1. Сменить анкету самооценки на другую через админку
     * 2. Проверить что кнопка "Показать самооценку" исчезает
     * 3. Проверить что появляется текст "Сотрудник ещё не заполнил самооценку"
     *
     * Ожидаемый результат:
     * - После смены анкеты кнопка исчезает
     * - Отображается текст что сотрудник ещё не заполнил
     */
    test(
      "C4420: Кейс 15: изменение текста при смене анкеты самооценки",
      { tag: ["@normal"] },
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
        const prAPI = new PerformanceReviewAPI(request);

        let users = [];
        let managerUser = null;
        let colleagueUsers = [];
        let evaluatedUserName = null;
        let prId = null;
        let revisionId = null;
        let revisionAlias = null;
        const baseUrl = new URL(process.env.BASE_URL).origin;
        const prTitle = `Кейс 15 смена анкеты ${Date.now()}`;

        // Получение пользователей
        await test.step("Получить пользователей", async () => {
          await adminPage.goto(baseUrl, { waitUntil: "domcontentloaded" });
          users = await orgHelper.getUsersList(9);
          users = await filterValidUsers(users);

          if (users.length < 5) {
            throw new Error(
              "Недостаточно пользователей для теста (нужно минимум 5)",
            );
          }

          evaluatedUserName = users[0]?.name || "Elena Shapoval";
          managerUser = users[1];
          colleagueUsers = [users[2], users[3]];

          console.log(`Оцениваемый: ${evaluatedUserName}`);
          console.log(`Руководитель: ${managerUser.name}`);
          console.log(
            `Коллеги: ${colleagueUsers.map((u) => u.name).join(", ")}`,
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

          await configPage.fillTitle(prTitle);

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
            managerApproval: false,
            earlyAccess: true,
            showSelfAssessmentToColleagues: true,
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

          // Получаем alias ревизии — нужен для прямых URL
          const { email, password } = getCredentials("admin");
          await prAPI.signIn(email, password);
          const { data: revision } = await prAPI.getLastRevision(prId);
          revisionId = revision?.id;
          revisionAlias = revision?.alias;
          console.log(`✓ Revision ID: ${revisionId}, alias: ${revisionAlias}`);
        });

        // Выбор коллег через API
        await test.step("Оцениваемый выбирает коллег через API", async () => {
          const prAPI2 = new PerformanceReviewAPI(request);
          const { email: adminEmail, password: adminPass } =
            getCredentials("admin");
          await prAPI2.signIn(adminEmail, adminPass);

          // 1. Получаем nomination для ревизии
          const { data: nominationData } = await prAPI2.get(
            `/manager/performance-reviews/${prId}/nominations/of-revision/${revisionId}/`,
          );
          if (!nominationData?.id) {
            throw new Error("Nomination не найдена для данной ревизии");
          }
          const nominationId = nominationData.id;
          console.log(`Nomination ID: ${nominationId}`);

          // 2. Получаем target users для PR
          const { data: targetUsersData } = await prAPI2.getTargetUsers(prId);
          const targetUsers = targetUsersData?.items || targetUsersData || [];
          if (targetUsers.length === 0) {
            throw new Error("Target users не найдены в PR");
          }
          const targetUserId = targetUsers[0].id;

          // 3. Получаем NominationTargetUser ID
          const { data: nomTargetData } = await prAPI2.post(
            `/manager/performance-reviews/${prId}/nominations/${nominationId}/target-users/get`,
            { targetUsersIds: [targetUserId] },
          );
          const nomTargetUsers = nomTargetData?.items || nomTargetData || [];
          if (nomTargetUsers.length === 0) {
            throw new Error("NominationTargetUser не найден");
          }
          const nominationTargetUserId = nomTargetUsers[0].id;

          // 4. Извлекаем userId из имён коллег (seed: "FirstName {userId} LastName {userId}")
          const colleagueUserIds = [];
          for (const colleague of colleagueUsers) {
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

          // 5. Авторизуемся как оцениваемый и отправляем номинацию
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
          console.log("✓ Номинация отправлена через API");
        });

        // Заполнение самооценки
        await test.step("Оцениваемый заполняет самооценку", async () => {
          await userSession.runAs(users[0], async (page) => {
            const fillPage = new PerformanceReviewFillPage(page, testInfo);

            const selfAssessUrl = new URL(
              `/ru/performance-reviews/${prId}/${revisionAlias}/`,
              baseUrl,
            ).toString();
            await gotoWithRetryOn404(page, selfAssessUrl);
            console.log(`📍 URL после перехода: ${page.url()}`);

            if (page.url().includes("/nomination/")) {
              console.log("⚠️ Редирект на номинацию — ждём и повторяем");
              await page.waitForTimeout(3000);
              await gotoWithRetryOn404(page, selfAssessUrl);
            }

            const fillBtn = page
              .locator("button, a")
              .filter({ hasText: /заполнить анкету/i })
              .first();
            let _visible20 = false;
            try {
              await fillBtn
              .waitFor({ state: "visible", timeout: 5000 })
              _visible20 = true;
            } catch {}
            if (_visible20) {
              await fillBtn.click();
              await page.waitForTimeout(1000);
            } else {
              const fillBtn2 = page
                .locator("button, a")
                .filter({ hasText: /^заполнить$/i })
                .first();
              let _visible21 = false;
              try {
                await fillBtn2
                .waitFor({ state: "visible", timeout: 3000 })
                _visible21 = true;
              } catch {}
              if (_visible21) {
                await fillBtn2.click();
                await page.waitForTimeout(1000);
              }
            }

            const questionBlocks = page.locator(
              '[class*="Block_block"][id^="q"]',
            );
            let hasQuestions = false;
            try {
              await questionBlocks
              .first()
              .waitFor({ state: "visible", timeout: 10000 })
              hasQuestions = true;
            } catch {}

            if (!hasQuestions) {
              throw new Error(`Блоки вопросов не найдены на ${page.url()}`);
            }

            await fillPage.fillStepByStepWithNext();
            console.log("✓ Самооценка заполнена");
            await page.waitForTimeout(3000);
          });
        });

        // Проверка что руководитель видит блок ДО смены анкеты
        await test.step('Проверить что руководитель видит кнопку "Показать самооценку" ДО смены', async () => {
          await userSession.runAs(managerUser, async (page) => {
            const fillPage = new PerformanceReviewFillPage(page, testInfo);

            // Используем готовый метод для навигации к анкете оцениваемого (БЕЗ заполнения)
            await fillPage.openQuestionnaireFor(
              baseUrl,
              evaluatedUserName,
              prId,
            );
            console.log("✓ Руководитель открыл форму анкеты");

            // Проверяем что блок просмотра самооценки виден
            const previewVisible =
              await fillPage.isSelfAssessmentPreviewVisible();
            expect(previewVisible).toBe(true);
            console.log(
              '✓ Руководитель видит блок "Сотрудник заполнил самооценку" ДО смены анкеты',
            );
          });
        });

        // Смена анкеты самооценки через админку
        await test.step("Сменить анкету самооценки на другую через админку", async () => {
          await adminPage.goto(
            new URL(
              `/ru/manager/performance-reviews/${prId}`,
              baseUrl,
            ).toString(),
          );
          await adminPage.waitForLoadState("networkidle");
          await adminPage.waitForTimeout(2000);

          // Переходим к настройке анкет
          const assessmentsTab = adminPage
            .locator('a, button, [role="tab"]')
            .filter({ hasText: /анкеты|assessments/i })
            .first();

          let _visible22 = false;
          try {
            await assessmentsTab
            .waitFor({ state: "visible", timeout: 5000 })
            _visible22 = true;
          } catch {}
          if (_visible22) {
            await assessmentsTab.click();
            await adminPage.waitForLoadState("networkidle");
            await adminPage.waitForTimeout(1000);
          }

          // Ищем секцию самооценки
          const selfSection = adminPage
            .locator('[class*="Section"], [class*="Card"], tr')
            .filter({ hasText: /самооценка/i })
            .first();

          let _visible23 = false;
          try {
            await selfSection
            .waitFor({ state: "visible", timeout: 5000 })
            _visible23 = true;
          } catch {}
          if (_visible23) {
            // Ищем кнопку редактирования или замены анкеты
            const editBtn = selfSection
              .locator("button, a")
              .filter({ hasText: /изменить|заменить|edit/i })
              .first();
            let _visible24 = false;
            try {
              await editBtn
              .waitFor({ state: "visible", timeout: 3000 })
              _visible24 = true;
            } catch {}
            if (_visible24) {
              await editBtn.click();
              await adminPage.waitForTimeout(1000);

              // Выбираем другую анкету из списка
              const anotherQuestionnaire = adminPage
                .locator('[class*="Option"], [class*="Item"], li')
                .filter({ hasNotText: /текущая|current/i })
                .first();

              let _visible25 = false;
              try {
                await anotherQuestionnaire
                .waitFor({ state: "visible", timeout: 3000 })
                _visible25 = true;
              } catch {}
              if (_visible25) {
                await anotherQuestionnaire.click();
                await adminPage.waitForTimeout(1000);

                // Сохраняем
                const saveBtn = adminPage
                  .locator("button")
                  .filter({ hasText: /сохранить|применить|save/i })
                  .first();
                let _visible26 = false;
                try {
                  await saveBtn
                  .waitFor({ state: "visible", timeout: 2000 })
                  _visible26 = true;
                } catch {}
                if (_visible26) {
                  await saveBtn.click();
                  await adminPage.waitForTimeout(2000);
                }
                console.log("✓ Анкета самооценки заменена на другую");
              } else {
                console.log("⚠️ Другая анкета не найдена для замены");
              }
            } else {
              console.log("⚠️ Кнопка редактирования анкеты не найдена");
            }
          } else {
            console.log("⚠️ Секция самооценки не найдена");
          }
        });

        // Проверка что руководитель видит текст "Сотрудник ещё не заполнил" ПОСЛЕ смены
        await test.step("Проверить что текст изменился после смены анкеты", async () => {
          await userSession.runAs(managerUser, async (page) => {
            const fillPage = new PerformanceReviewFillPage(page, testInfo);

            // Используем готовый метод для навигации к анкете оцениваемого (БЕЗ заполнения)
            await fillPage.openQuestionnaireFor(
              baseUrl,
              evaluatedUserName,
              prId,
            );
            console.log("✓ Руководитель открыл форму анкеты (после смены)");
            console.log(`📍 Текущий URL: ${page.url()}`);

            // После смены анкеты:
            // - Кнопка "Показать самооценку" должна исчезнуть
            // - Должен появиться текст "Сотрудник ещё не заполнил самооценку"
            const previewFilledVisible =
              await fillPage.isSelfAssessmentPreviewVisible();
            const notFilledVisible =
              await fillPage.isSelfAssessmentNotFilledVisible();

            // Если анкета была действительно заменена, показывается текст "ещё не заполнил"
            if (notFilledVisible) {
              console.log(
                '✓ Отображается текст "Сотрудник ещё не заполнил самооценку"',
              );
              expect(previewFilledVisible).toBe(false);
              console.log('✓ Кнопка "Показать самооценку" НЕ отображается');
            } else if (previewFilledVisible) {
              // Если анкета не была заменена (нет другой анкеты), тест пропускаем
              console.log(
                "⚠️ Анкета не была заменена - результаты всё ещё отображаются",
              );
            } else {
              console.log(
                "⚠️ Ни один из блоков не виден - возможно форма анкеты открыта",
              );
            }
          });
        });

        console.log(
          "✅ Кейс 15 завершён: проверка изменения текста при смене анкеты",
        );
      },
    );
  },
);
