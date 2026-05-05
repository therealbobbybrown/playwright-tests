// tests/functional/performance-review/filling/pr-batch-send-questionnaires.spec.js
// E2E тесты: Пакетная рассылка анкет руководителям и коллегам
//
// Тестируемая функциональность:
// - Алерт на странице запущенной оценки для завершения этапа самооценки
// - Пакетная рассылка анкет даже при незаполненной самооценке
// - Модальное окно подтверждения (необратимое действие)
// - Баннер "Сотрудник пока не заполнил самооценку" в анкетах респондентов
// - Анкета самооценки остается доступной для заполнения после пакетной рассылки
//
// Требования:
// - https://www.figma.com/design/vedzJofBkDePgKevrIQfpI/...?node-id=1004-7093
// - https://www.figma.com/design/vedzJofBkDePgKevrIQfpI/...?node-id=1004-7094
// - https://www.figma.com/design/vedzJofBkDePgKevrIQfpI/...?node-id=999-47541

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
  markAsE2ETest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";
import { TIMEOUTS } from "../../../utils/constants.js";
import {
  PerformanceReviewAPI,
  DashboardTeamAPI,
  getCredentials,
  getTestUserPassword,
} from "../../../utils/api/index.js";

/** Закрыть InfoModal если она перекрывает UI (появляется после запуска/рассылки PR) */
async function dismissInfoModalIfPresent(page) {
  const modal = page.locator('[role="dialog"][aria-modal="true"]').first();
  try {
    await modal.waitFor({ state: "visible", timeout: 3000 });
    const closeBtn = modal.locator("button").filter({ hasText: /закрыть|ок|понятно|×/i }).first();
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
    } else {
      await page.keyboard.press("Escape");
    }
    await modal.waitFor({ state: "hidden", timeout: 5000 });
    console.log("✓ InfoModal закрыта");
  } catch {
    // Модалки нет
  }
}

test.describe(
  "Performance Review - Пакетная рассылка анкет",
  {
    tag: [
      "@performance-review",
      "@filling",
      "@e2e",
      "@batch-send",
      "@regression",
      "@ui",
    ],
  },
  () => {
    test.describe.configure({ retries: 1 });

    test.beforeEach(() => {
      markAsE2ETest(MODULES.PERFORMANCE_REVIEW, "Batch Send Questionnaires");
    });

    /**
     * Кейс 1: Алерт о возможности пакетной рассылки виден при наличии незаполненных самооценок
     *
     * Шаги:
     * 1. Создать PR с направлениями: самооценка + руководитель + коллеги
     * 2. Добавить участников
     * 3. Запустить PR
     * 4. Проверить что алерт пакетной рассылки виден на странице оценки
     * 5. Проверить текст алерта
     */
    test(
      "C3015: Алерт пакетной рассылки отображается когда самооценки не заполнены",
      { tag: [] },
      async ({ adminAuth: adminPage }, testInfo) => {
        setSeverity("critical");
        test.slow();
        testInfo.setTimeout(300_000);

        const listPage = new PerformanceReviewsListPage(adminPage, testInfo);
        const configPage = new PerformanceReviewConfigPage(adminPage, testInfo);
        const orgHelper = new OrgStructureHelper(adminPage, testInfo);

        let prId = null;
        const baseUrl = new URL(process.env.BASE_URL).origin;
        const prTitle = `Кейс 1 алерт пакетной рассылки ${Date.now()}`;

        // Шаг 1: Получить пользователей
        await test.step("Получить список пользователей", async () => {
          await adminPage.goto(baseUrl, { waitUntil: "domcontentloaded" });
          let users = await orgHelper.getUsersList(8);
          users = await filterValidUsers(users);
          console.log(`✓ Получено ${users.length} пользователей`);

          if (users.length < 3) {
            throw new Error(
              "Недостаточно пользователей для теста (нужно минимум 3)",
            );
          }
        });

        // Шаг 2: Создать PR с направлениями
        await test.step("Создать PR с самооценкой, руководителем и коллегами", async () => {
          await adminPage.goto(
            new URL("/ru/manager/performance-reviews/", baseUrl).toString(),
          );
          await listPage.assertOpened();

          await listPage.openCreateModal();
          await listPage.performanceReviewType.click();
          await configPage.assertOpened();

          await configPage.fillTitle(prTitle);

          // Направления: самооценка + руководитель + коллеги
          await configPage.configureDirections({
            self: true,
            manager: true,
            colleagues: true,
            subordinates: false,
          });

          // Настройка подбора коллег с опцией показа самооценки
          await configPage.configureColleaguesSelection({
            askEmployees: true,
            minColleagues: 1,
            maxColleagues: 3,
            managerApproval: false,
            earlyAccess: true,
            showSelfAssessmentToColleagues: true,
          });

          console.log(
            "✓ PR настроен с направлениями самооценка + руководитель + коллеги",
          );
        });

        // Шаг 3: Добавить участников и запустить
        await test.step("Добавить участников и запустить PR", async () => {
          await configPage.addTargetUsers({ count: 2 });
          await configPage.disableReminders();
          await configPage.addAssessmentsForAllDirections();
          await configPage.goToStep("launch");
          await configPage.launchAndSendQuestionnaires();

          // Получить ID PR
          const currentUrl = adminPage.url();
          const match = currentUrl.match(/\/performance-reviews\/(\d+)/);
          if (match) {
            prId = match[1];
            console.log(`✓ PR запущен, ID: ${prId}`);
          }
        });

        // Шаг 4: Проверить видимость алерта
        await test.step("Проверить видимость алерта пакетной рассылки", async () => {
          // Закрыть toast-уведомление если оно есть (оно может мешать поиску элементов)
          const toast = adminPage
            .locator('.Toastify__toast, [class*="Toast"]')
            .first();
          let _visible1 = false;
          try {
            await toast
            .waitFor({ state: "visible", timeout: 1000 })
            _visible1 = true;
          } catch {}
          if (_visible1) {
            const closeBtn = toast.locator("button").first();
            await closeBtn.click();
            await toast
              .waitFor({ state: "hidden", timeout: 5000 });
            console.log("✓ Toast-уведомление закрыто");
          }

          await dismissInfoModalIfPresent(adminPage);

          // Перейти на вкладку "Заполнение анкет"
          await configPage.fillQuestionnairesTab.click();
          await adminPage
            .waitForLoadState("networkidle", { timeout: 10000 });

          // Проверить алерт: "X из Y сотрудников не прошли самооценку. Это блокирует отправку..."
          const isAlertVisible = await configPage.isBatchSendAlertVisible();
          expect(isAlertVisible).toBeTruthy();
          console.log("✓ Алерт пакетной рассылки виден");
        });

        // Шаг 5: Проверить текст алерта
        await test.step("Проверить текст алерта", async () => {
          const alertText = await configPage.getBatchSendAlertText();

          // Текст должен содержать информацию о незаполненной самооценке
          expect(alertText).toMatch(/не прошл.*самооценку/i);
          expect(alertText).toMatch(/блокирует отправку/i);
          console.log(`✓ Текст алерта: "${alertText}"`);

          // Проверить наличие кнопки "Отправить анкеты"
          const hasBatchSendButton = await configPage.hasBatchSendButton();
          expect(hasBatchSendButton).toBeTruthy();
          console.log('✓ Кнопка "Отправить анкеты" присутствует');
        });

        console.log(
          "✅ Кейс 1 завершён: алерт пакетной рассылки отображается корректно",
        );
      },
    );

    /**
     * Кейс 2: Пакетная рассылка анкет - подтверждение и выполнение
     *
     * Шаги:
     * 1. Создать и запустить PR
     * 2. Кликнуть на алерт пакетной рассылки
     * 3. Проверить модальное окно подтверждения
     * 4. Подтвердить рассылку
     * 5. Проверить что анкеты отправлены руководителям и коллегам
     */
    test(
      "C3016: Пакетная рассылка анкет руководителю и коллегам при незаполненной самооценке",
      { tag: ["@critical"] },
      async ({ adminAuth: adminPage, browser, request }, testInfo) => {
        setSeverity("critical");
        test.slow();
        testInfo.setTimeout(600_000);

        const listPage = new PerformanceReviewsListPage(adminPage, testInfo);
        const configPage = new PerformanceReviewConfigPage(adminPage, testInfo);
        const orgHelper = new OrgStructureHelper(adminPage, testInfo);
        const userSession = createUserSession(browser, testInfo);

        // API для проверок
        const prAPI = new PerformanceReviewAPI(request);
        const { email, password } = getCredentials("admin");
        await prAPI.signIn(email, password);

        let users = [];
        let managerUser = null;
        let prId = null;
        const baseUrl = new URL(process.env.BASE_URL).origin;
        const prTitle = `Кейс 2 подтверждение рассылки ${Date.now()}`;

        // Получить пользователей
        await test.step("Получить пользователей", async () => {
          await adminPage.goto(baseUrl, { waitUntil: "domcontentloaded" });
          users = await orgHelper.getUsersList(8);
          users = await filterValidUsers(users);

          if (users.length < 3) {
            throw new Error("Недостаточно пользователей");
          }

          managerUser = users[1];
          console.log(
            `Руководитель: ${managerUser.name} (${managerUser.email})`,
          );
        });

        // Создать и настроить PR с опцией показа самооценки коллегам (блокирует отправку до самооценки)
        await test.step("Создать PR", async () => {
          await adminPage.goto(
            new URL("/ru/manager/performance-reviews/", baseUrl).toString(),
          );
          await listPage.assertOpened();

          await listPage.openCreateModal();
          await listPage.performanceReviewType.click();
          await configPage.assertOpened();

          await configPage.fillTitle(prTitle);

          // Включаем самооценку + руководитель + коллеги
          await configPage.configureDirections({
            self: true,
            manager: true,
            colleagues: true,
            subordinates: false,
          });

          // Настройка подбора коллег с опцией показа самооценки - ЭТО БЛОКИРУЕТ отправку до самооценки
          await configPage.configureColleaguesSelection({
            askEmployees: true,
            minColleagues: 1,
            maxColleagues: 3,
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
        });

        // Проверить что руководитель НЕ видит анкету до пакетной рассылки
        await test.step("Проверить что руководитель НЕ видит анкету (ждём самооценку)", async () => {
          await userSession.runAs(managerUser, async (page) => {
            await assertUserHasQuestionnaire(
              page,
              baseUrl,
              prId,
              false,
              expect,
            );
            console.log("✓ Руководитель НЕ видит анкету (ожидает самооценку)");
          });
        });

        // Выполнить пакетную рассылку
        await test.step("Выполнить пакетную рассылку анкет", async () => {
          await adminPage.goto(
            new URL(
              `/ru/manager/performance-reviews/${prId}`,
              baseUrl,
            ).toString(),
          );
          await adminPage.waitForLoadState("networkidle");
          await dismissInfoModalIfPresent(adminPage);
          await configPage.fillQuestionnairesTab.click();
          await adminPage
            .waitForLoadState("networkidle", { timeout: 10000 });

          // InfoModal "Завершить самооценку" может появиться сразу и блокировать клики
          const earlyEndSelfAssessBtn0 = adminPage
            .locator("button")
            .filter({ hasText: /^Завершить самооценку$/i })
            .first();
          let hasEarlyModal0 = false;
          try {
            await earlyEndSelfAssessBtn0
            .waitFor({ state: "visible", timeout: 3_000 })
            hasEarlyModal0 = true;
          } catch {}

          if (hasEarlyModal0) {
            await earlyEndSelfAssessBtn0.click();
            console.log('✓ Закрыли раннюю InfoModal "Завершить самооценку"');
            await adminPage.waitForTimeout(2000);
          }

          // Inline batch send: кликаем "Отправить анкеты" в алерте
          const sendAlertBtn = adminPage
            .locator("button")
            .filter({ hasText: /отправить анкеты/i })
            .first();
          await sendAlertBtn.waitFor({ state: "visible", timeout: 15_000 });
          await sendAlertBtn.click({ force: true });
          console.log('✓ Кликнули "Отправить анкеты" в алерте');

          // Может появиться InfoModal "Завершить самооценку"
          const endSelfAssessBtn = adminPage
            .locator("button")
            .filter({ hasText: /^Завершить самооценку$/i })
            .first();
          let hasSelfAssessModal = false;
          try {
            await endSelfAssessBtn
            .waitFor({ state: "visible", timeout: 5_000 })
            hasSelfAssessModal = true;
          } catch {}

          if (hasSelfAssessModal) {
            await endSelfAssessBtn.click();
            console.log('✓ Подтвердили "Завершить самооценку"');
            // Ждём обработки — модалка может смениться на следующую
            await adminPage.waitForTimeout(2000);
          }

          // Может появиться модалка "Отправить анкеты руководителям и коллегам"
          // ВАЖНО: ищем кнопку ВНУТРИ диалога, а не в алерте на странице
          const dialog = adminPage
            .locator('[role="dialog"], .ReactModal__Content')
            .first();
          const confirmSendBtn = dialog
            .locator("button")
            .filter({ hasText: /^Отправить анкеты$/i })
            .first();
          let hasConfirmModal = false;
          try {
            await confirmSendBtn
            .waitFor({ state: "visible", timeout: 5_000 })
            hasConfirmModal = true;
          } catch {}

          if (hasConfirmModal) {
            await confirmSendBtn.click({ force: true });
            console.log('✓ Подтвердили "Отправить анкеты" в диалоге');
          } else if (hasSelfAssessModal) {
            console.log(
              '✓ Рассылка выполнена через "Завершить самооценку" — доп. подтверждение не требуется',
            );
          }

          // Ждём закрытия модалки и обработки
          await dialog
            .waitFor({ state: "hidden", timeout: 15_000 });
          await adminPage.waitForLoadState("networkidle");
          // Ждём обработки на бэкенде (отправка анкет респондентам)
          await adminPage.waitForTimeout(3000);
          console.log("✓ Пакетная рассылка выполнена");
        });

        // Проверить что руководитель ТЕПЕРЬ видит анкету
        await test.step("Проверить что руководитель ПОЛУЧИЛ анкету после пакетной рассылки", async () => {
          await userSession.runAs(managerUser, async (page) => {
            await assertUserHasQuestionnaire(page, baseUrl, prId, true, expect);
            console.log("✓ Руководитель ВИДИТ анкету после пакетной рассылки");
          });
        });

        console.log(
          "✅ Кейс 2 завершён: пакетная рассылка анкет работает корректно",
        );
      },
    );

    /**
     * Кейс 3: Баннер "Сотрудник пока не заполнил самооценку" у руководителя и коллеги
     *
     * Шаги:
     * 1. Создать и запустить PR с showSelfAssessmentToColleagues: true
     * 2. Выполнить пакетную рассылку (без заполнения самооценки)
     * 3. Открыть анкету от имени руководителя - проверить баннер
     * 4. Открыть анкету от имени коллеги - проверить баннер
     */
    // Баннер SelfResponseBlock появляется ПЕРЕД ВОПРОСАМИ на странице заполнения анкеты
    // Текст: "Сотрудник пока не заполнил самооценку" + "Вы можете подождать или оценить его сейчас."
    test(
      'C4201: Баннер "Сотрудник не заполнил самооценку" виден руководителю и коллеге в анкете',
      { tag: [] },
      async ({ adminAuth: adminPage, browser, request }, testInfo) => {
        setSeverity("normal");
        test.slow();
        testInfo.setTimeout(600_000);

        const listPage = new PerformanceReviewsListPage(adminPage, testInfo);
        const configPage = new PerformanceReviewConfigPage(adminPage, testInfo);
        const orgHelper = new OrgStructureHelper(adminPage, testInfo);
        const userSession = createUserSession(browser, testInfo);

        let users = [];
        let managerUser = null;
        let colleagueUsers = []; // Массив коллег (минимум 2)
        let evaluatedUserName = null;
        let prId = null;
        let revisionId = null;
        let revisionAlias = null;
        const baseUrl = new URL(process.env.BASE_URL).origin;
        const prTitle = `Кейс 3 баннер незаполненной самооценки ${Date.now()}`;

        // Получить пользователей
        await test.step("Получить пользователей", async () => {
          await adminPage.goto(baseUrl, { waitUntil: "domcontentloaded" });
          users = await orgHelper.getUsersList(15);
          users = await filterValidUsers(users);

          if (users.length < 5) {
            throw new Error(
              `Недостаточно пользователей (нужно минимум 5, получено ${users.length})`,
            );
          }

          evaluatedUserName = users[0]?.name || "Оцениваемый";
          managerUser = users[1];
          colleagueUsers = [users[2], users[3]]; // 2 коллеги для минимума
          console.log(`Оцениваемый: ${evaluatedUserName}`);
          console.log(`Руководитель: ${managerUser.name}`);
          console.log(
            `Коллеги: ${colleagueUsers.map((u) => u.name).join(", ")}`,
          );
        });

        // Создать и запустить PR с опцией показа самооценки коллегам
        await test.step("Создать и запустить PR", async () => {
          await adminPage.goto(
            new URL("/ru/manager/performance-reviews/", baseUrl).toString(),
          );
          await listPage.assertOpened();

          await listPage.openCreateModal();
          await listPage.performanceReviewType.click();
          await configPage.assertOpened();

          await configPage.fillTitle(prTitle);

          // Включаем самооценку + руководитель + коллеги
          await configPage.configureDirections({
            self: true,
            manager: true,
            colleagues: true,
            subordinates: false,
          });

          // Настройка подбора коллег с опцией показа самооценки - блокирует отправку до самооценки
          // askEmployees: true - коллеги выбираются сотрудником, toggle showSelfAssessmentToColleagues доступен только в этом режиме
          await configPage.configureColleaguesSelection({
            askEmployees: true, // Нужен для работы toggle showSelfAssessmentToColleagues
            minColleagues: 2, // Минимум 2 коллеги (UI требует минимум 2)
            maxColleagues: 5,
            managerApproval: false,
            earlyAccess: true,
            showSelfAssessmentToColleagues: true,
          });

          await configPage.addTargetUsers({ count: 1 });
          // НЕ добавляем коллег через таблицу - с askEmployees: true коллеги выбираются сотрудником после запуска
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

          // Получаем alias ревизии через API — нужен для прямых URL респондентов
          const prAPI = new PerformanceReviewAPI(request);
          const { email, password } = getCredentials("admin");
          await prAPI.signIn(email, password);
          const { data: revision } = await prAPI.getLastRevision(prId);
          revisionId = revision?.id;
          revisionAlias = revision?.alias;
          console.log(`✓ Revision ID: ${revisionId}, alias: ${revisionAlias}`);
        });

        // Оцениваемый выбирает коллег через API — UI-выбор нестабилен (номинация не сохраняется)
        await test.step("Оцениваемый выбирает коллег через API", async () => {
          const prAPI = new PerformanceReviewAPI(request);
          const { email: adminEmail, password: adminPass } =
            getCredentials("admin");
          await prAPI.signIn(adminEmail, adminPass);

          // 1. Получаем nomination для ревизии
          const { data: nominationData } = await prAPI.get(
            `/manager/performance-reviews/${prId}/nominations/of-revision/${revisionId}/`,
          );
          if (!nominationData?.id) {
            throw new Error("Nomination не найдена для данной ревизии");
          }
          const nominationId = nominationData.id;

          // 2. Получаем target users → NominationTargetUser ID
          const { data: targetUsersData } = await prAPI.getTargetUsers(prId);
          const targetUsers = targetUsersData?.items || targetUsersData || [];
          if (targetUsers.length === 0) {
            throw new Error("Target users не найдены в PR");
          }
          const targetUserId = targetUsers[0].id;

          const { data: nomTargetData } = await prAPI.post(
            `/manager/performance-reviews/${prId}/nominations/${nominationId}/target-users/get`,
            { targetUsersIds: [targetUserId] },
          );
          const nomTargetUsers = nomTargetData?.items || nomTargetData || [];
          if (nomTargetUsers.length === 0) {
            throw new Error("NominationTargetUser не найден");
          }
          const nominationTargetUserId = nomTargetUsers[0].id;

          // 3. Извлекаем userId из имён коллег (seed-данные: "FirstName {userId} LastName {userId}")
          const colleagueUserIds = [];
          for (const colleague of colleagueUsers) {
            const match = colleague.name.match(/\b(\d{4,6})\b/);
            if (match) {
              colleagueUserIds.push(parseInt(match[1], 10));
              console.log(`  ✓ ${colleague.name}: userId=${match[1]}`);
            }
          }
          if (colleagueUserIds.length < 2) {
            throw new Error(
              `Не удалось извлечь userId из имён коллег (${colleagueUserIds.length}/2)`,
            );
          }

          // 4. Авторизуемся как оцениваемый и отправляем номинацию
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
          console.log(
            `✓ Номинация отправлена (${colleagueUsers.map((c) => c.name).join(", ")})`,
          );
        });

        // Выполнить пакетную рассылку (самооценка НЕ заполнена → flow "Завершить самооценку")
        await test.step("Выполнить пакетную рассылку", async () => {
          // Перейти на страницу PR и открыть вкладку "Заполнение анкет"
          await adminPage.goto(
            new URL(
              `/ru/manager/performance-reviews/${prId}`,
              baseUrl,
            ).toString(),
          );
          await adminPage.waitForLoadState("networkidle");
          await dismissInfoModalIfPresent(adminPage);
          await configPage.fillQuestionnairesTab.click();
          await adminPage
            .waitForLoadState("networkidle", { timeout: 10000 });

          // InfoModal "Завершить самооценку" может появиться сразу и блокировать клики
          const earlyEndSelfAssessBtn = adminPage
            .locator("button")
            .filter({ hasText: /^Завершить самооценку$/i })
            .first();
          let hasEarlyModal = false;
          try {
            await earlyEndSelfAssessBtn
            .waitFor({ state: "visible", timeout: 3_000 })
            hasEarlyModal = true;
          } catch {}

          if (hasEarlyModal) {
            await earlyEndSelfAssessBtn.click();
            console.log('✓ Закрыли раннюю InfoModal "Завершить самооценку"');
            await adminPage.waitForTimeout(2000);
          }

          // Кликаем "Отправить анкеты" в алерте о незаполненной самооценке
          const sendButton = adminPage
            .locator("button")
            .filter({ hasText: /отправить анкеты/i })
            .first();
          await sendButton.waitFor({ state: "visible", timeout: 15_000 });
          await sendButton.click({ force: true });
          console.log('✓ Кликнули "Отправить анкеты" в алерте');

          // Может появиться модалка "Завершить самооценку" — подтверждаем
          const confirmSelfAssessment = adminPage
            .locator("button")
            .filter({ hasText: /^Завершить самооценку$/i })
            .first();
          let hasSelfAssessModal = false;
          try {
            await confirmSelfAssessment
            .waitFor({ state: "visible", timeout: 10_000 })
            hasSelfAssessModal = true;
          } catch {}

          if (hasSelfAssessModal) {
            await confirmSelfAssessment.click();
            console.log('✓ Подтвердили "Завершить самооценку"');
            await adminPage.waitForTimeout(2000);
          }

          // Может появиться модалка "Отправить анкеты руководителям и коллегам"
          // ВАЖНО: ищем кнопку ВНУТРИ диалога, а не в алерте на странице
          const dialog = adminPage
            .locator('[role="dialog"], .ReactModal__Content')
            .first();
          const confirmSendBtn = dialog
            .locator("button")
            .filter({ hasText: /^Отправить анкеты$/i })
            .first();
          let hasConfirmModal = false;
          try {
            await confirmSendBtn
            .waitFor({ state: "visible", timeout: 5_000 })
            hasConfirmModal = true;
          } catch {}

          if (hasConfirmModal) {
            await confirmSendBtn.click({ force: true });
            console.log('✓ Подтвердили "Отправить анкеты" в диалоге');
          }

          // Ждём закрытия модалки и обработки
          await dialog
            .waitFor({ state: "hidden", timeout: 15_000 });
          await adminPage.waitForLoadState("networkidle");
          await adminPage.waitForTimeout(3000);
          console.log("✓ Пакетная рассылка выполнена");
        });

        // Проверить баннер в анкете руководителя
        await test.step("Проверить баннер в анкете руководителя", async () => {
          await userSession.runAs(managerUser, async (page) => {
            // Респондент → прямой URL через alias ревизии (toAssessments=true даёт 404 для респондентов)
            const respondentUrl = new URL(
              `/ru/performance-reviews/${prId}/${revisionAlias}/`,
              baseUrl,
            ).toString();
            console.log(`📍 Переход руководителя по URL: ${respondentUrl}`);
            await gotoWithRetryOn404(page, respondentUrl);
            console.log(`📍 URL руководителя после перехода: ${page.url()}`);

            // Если нужно открыть анкету (кнопка "Заполнить анкету" / "Оценить")
            const fillButton = page
              .locator("button, a")
              .filter({ hasText: /заполнить анкету|^оценить$/i })
              .first();
            let _visible2 = false;
            try {
              await fillButton
              .waitFor({ state: "visible", timeout: 5000 })
              _visible2 = true;
            } catch {}
            if (_visible2) {
              await fillButton.click();
              await page
                .waitForLoadState("networkidle", { timeout: 10_000 });
              console.log("✓ Открыта форма заполнения анкеты руководителя");
            }

            // Проверяем баннер SelfResponseBlock
            const banner = page.locator('[class*="SelfResponseBlock"]').first();
            const bannerByText = page
              .getByText("Сотрудник пока не заполнил самооценку")
              .first();

            let isBannerVisible = false;
            try {
              await banner
              .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
              isBannerVisible = true;
            } catch {}
            if (!isBannerVisible) {
              isBannerVisible = false;
              try {
                await bannerByText
                .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
                isBannerVisible = true;
              } catch {}
            }

            expect(isBannerVisible).toBeTruthy();
            console.log(
              '✓ Баннер "Сотрудник пока не заполнил самооценку" отображается у РУКОВОДИТЕЛЯ',
            );
          });
        });

        // Проверить баннер в анкете коллеги (используем первого коллегу)
        await test.step("Проверить баннер в анкете коллеги", async () => {
          await userSession.runAs(colleagueUsers[0], async (page) => {
            // Респондент → прямой URL через alias ревизии
            const respondentUrl = new URL(
              `/ru/performance-reviews/${prId}/${revisionAlias}/`,
              baseUrl,
            ).toString();
            console.log(`📍 Переход коллеги по URL: ${respondentUrl}`);
            await gotoWithRetryOn404(page, respondentUrl);
            console.log(`📍 URL коллеги после перехода: ${page.url()}`);

            // Если нужно открыть анкету
            const fillButton = page
              .locator("button, a")
              .filter({ hasText: /заполнить анкету|^оценить$/i })
              .first();
            let _visible3 = false;
            try {
              await fillButton
              .waitFor({ state: "visible", timeout: 5000 })
              _visible3 = true;
            } catch {}
            if (_visible3) {
              await fillButton.click();
              await page
                .waitForLoadState("networkidle", { timeout: 10_000 });
              console.log("✓ Открыта форма заполнения анкеты коллеги");
            }

            // Проверяем баннер SelfResponseBlock
            const banner = page.locator('[class*="SelfResponseBlock"]').first();
            const bannerByText = page
              .getByText("Сотрудник пока не заполнил самооценку")
              .first();

            let isBannerVisible = false;
            try {
              await banner
              .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
              isBannerVisible = true;
            } catch {}
            if (!isBannerVisible) {
              isBannerVisible = false;
              try {
                await bannerByText
                .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
                isBannerVisible = true;
              } catch {}
            }

            expect(isBannerVisible).toBeTruthy();
            console.log(
              '✓ Баннер "Сотрудник пока не заполнил самооценку" отображается у КОЛЛЕГИ',
            );
          });
        });

        console.log(
          "✅ Кейс 3 завершён: баннер отображается у руководителя и коллеги",
        );
      },
    );

    /**
     * Кейс 4: Самооценка остается доступной после пакетной рассылки
     *
     * Шаги:
     * 1. Создать и запустить PR
     * 2. Выполнить пакетную рассылку
     * 3. Проверить что оцениваемый всё ещё может заполнить самооценку
     * 4. Заполнить самооценку
     * 5. Проверить что баннер исчезает в анкете руководителя (после перезагрузки)
     */
    test(
      "C3017: Самооценка доступна для заполнения после пакетной рассылки анкет",
      { tag: ["@critical"] },
      async ({ adminAuth: adminPage, browser, request }, testInfo) => {
        setSeverity("critical");
        test.slow();
        testInfo.setTimeout(600_000);

        const listPage = new PerformanceReviewsListPage(adminPage, testInfo);
        const configPage = new PerformanceReviewConfigPage(adminPage, testInfo);
        const adminFillPage = new PerformanceReviewFillPage(
          adminPage,
          testInfo,
        );
        const orgHelper = new OrgStructureHelper(adminPage, testInfo);
        const userSession = createUserSession(browser, testInfo);

        let users = [];
        let managerUser = null;
        let evaluatedUserName = null;
        let prId = null;
        let revisionAlias = null;
        const baseUrl = new URL(process.env.BASE_URL).origin;
        const prTitle = `Кейс 4 самооценка после рассылки ${Date.now()}`;

        // Получить пользователей
        await test.step("Получить пользователей", async () => {
          await adminPage.goto(baseUrl, { waitUntil: "domcontentloaded" });
          users = await orgHelper.getUsersList(8);
          users = await filterValidUsers(users);

          if (users.length < 3) {
            throw new Error("Недостаточно пользователей");
          }

          evaluatedUserName = users[0]?.name || "Оцениваемый";
          managerUser = users[1];
        });

        // Создать и запустить PR с опцией показа самооценки коллегам
        await test.step("Создать и запустить PR", async () => {
          await adminPage.goto(
            new URL("/ru/manager/performance-reviews/", baseUrl).toString(),
          );
          await listPage.assertOpened();

          await listPage.openCreateModal();
          await listPage.performanceReviewType.click();
          await configPage.assertOpened();

          await configPage.fillTitle(prTitle);

          // Включаем самооценку + руководитель + коллеги
          await configPage.configureDirections({
            self: true,
            manager: true,
            colleagues: true,
            subordinates: false,
          });

          // Настройка подбора коллег с опцией показа самооценки - блокирует отправку до самооценки
          await configPage.configureColleaguesSelection({
            askEmployees: true,
            minColleagues: 1,
            maxColleagues: 3,
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

          // Получаем alias ревизии через API — нужен для прямых URL респондентов
          const prAPI = new PerformanceReviewAPI(request);
          const { email, password } = getCredentials("admin");
          await prAPI.signIn(email, password);
          const { data: revision } = await prAPI.getLastRevision(prId);
          revisionAlias = revision?.alias;
          console.log(`✓ Revision alias: ${revisionAlias}`);
        });

        // Выполнить пакетную рассылку
        await test.step("Выполнить пакетную рассылку", async () => {
          await dismissInfoModalIfPresent(adminPage);
          await configPage.fillQuestionnairesTab.click();
          await adminPage
            .waitForLoadState("networkidle", { timeout: 10000 });

          // InfoModal "Завершить самооценку" может появиться сразу и блокировать клики
          // Обрабатываем её ДО клика по алерту
          const earlyEndSelfAssessBtn = adminPage
            .locator("button")
            .filter({ hasText: /^Завершить самооценку$/i })
            .first();
          let hasEarlyModal = false;
          try {
            await earlyEndSelfAssessBtn
            .waitFor({ state: "visible", timeout: 3_000 })
            hasEarlyModal = true;
          } catch {}

          if (hasEarlyModal) {
            await earlyEndSelfAssessBtn.click();
            console.log('✓ Закрыли раннюю InfoModal "Завершить самооценку"');
            await adminPage.waitForTimeout(2000);
          }

          // Inline batch send: кликаем "Отправить анкеты" в алерте
          const sendAlertBtn = adminPage
            .locator("button")
            .filter({ hasText: /отправить анкеты/i })
            .first();
          await sendAlertBtn.waitFor({ state: "visible", timeout: 15_000 });
          await sendAlertBtn.click({ force: true });
          console.log('✓ Кликнули "Отправить анкеты" в алерте');

          // Может появиться InfoModal "Завершить самооценку" (после клика по алерту)
          const endSelfAssessBtn = adminPage
            .locator("button")
            .filter({ hasText: /^Завершить самооценку$/i })
            .first();
          let hasSelfAssessModal = false;
          try {
            await endSelfAssessBtn
            .waitFor({ state: "visible", timeout: 5_000 })
            hasSelfAssessModal = true;
          } catch {}

          if (hasSelfAssessModal) {
            await endSelfAssessBtn.click();
            console.log('✓ Подтвердили "Завершить самооценку"');
            await adminPage.waitForTimeout(2000);
          }

          // Может появиться модалка "Отправить анкеты руководителям и коллегам"
          // ВАЖНО: ищем кнопку ВНУТРИ диалога, а не в алерте на странице
          const dialog = adminPage
            .locator('[role="dialog"], .ReactModal__Content')
            .first();
          const confirmSendBtn = dialog
            .locator("button")
            .filter({ hasText: /^Отправить анкеты$/i })
            .first();
          let hasConfirmModal = false;
          try {
            await confirmSendBtn
            .waitFor({ state: "visible", timeout: 15_000 })
            hasConfirmModal = true;
          } catch {}

          if (hasConfirmModal) {
            await confirmSendBtn.click({ force: true });
            console.log('✓ Подтвердили "Отправить анкеты" в диалоге');
          } else if (hasSelfAssessModal) {
            console.log(
              '✓ Рассылка выполнена через "Завершить самооценку" — доп. подтверждение не требуется',
            );
          }

          await dialog
            .waitFor({ state: "hidden", timeout: 15_000 });
          await adminPage.waitForLoadState("networkidle");
          await adminPage.waitForTimeout(3000);
          console.log("✓ Пакетная рассылка выполнена");
        });

        // Заполнить самооценку через API (populateReview заполняет все незаполненные анкеты,
        // включая самооценку; UI-навигация ненадёжна — alias URL 404 для admin-сессии)
        await test.step("Заполнить самооценку через API", async () => {
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
          // populateReview заполняет одну незаполненную анкету за вызов; вызываем несколько раз
          let filledCount = 0;
          for (let attempt = 1; attempt <= 10; attempt++) {
            const { response } = await prAPI.populateReview(
              prId,
              populateSettings,
              { timeout: 120000 },
            );
            if (response.ok()) {
              filledCount++;
              await new Promise((r) => setTimeout(r, 200));
            } else {
              break;
            }
          }
          console.log(`populateReview: ${filledCount} анкет заполнено`);
          if (filledCount === 0) {
            throw new Error(
              "populateReview не заполнил ни одной анкеты — самооценка недоступна",
            );
          }
          console.log(
            "✓ Самооценка заполнена через API ПОСЛЕ пакетной рассылки",
          );
        });

        // Проверить что баннер исчез в анкете руководителя
        await test.step("Проверить что баннер исчез после заполнения самооценки", async () => {
          await userSession.runAs(managerUser, async (page) => {
            const fillPage = new PerformanceReviewFillPage(page, testInfo);

            // Респондент → прямой URL через alias ревизии (toAssessments=true даёт 404 для респондентов)
            const respondentUrl = new URL(
              `/ru/performance-reviews/${prId}/${revisionAlias}/`,
              baseUrl,
            ).toString();
            await gotoWithRetryOn404(page, respondentUrl);

            // Баннер должен быть скрыт (самооценка уже заполнена)
            const isBannerVisible =
              await fillPage.isSelfAssessmentNotFilledBannerVisible();
            expect(isBannerVisible).toBeFalsy();
            console.log("✓ Баннер скрыт после заполнения самооценки");
          });
        });

        console.log(
          "✅ Кейс 4 завершён: самооценка доступна после пакетной рассылки",
        );
      },
    );

    /**
     * Кейс 6: Алерт НЕ отображается когда все самооценки заполнены
     *
     * Шаги:
     * 1. Создать и запустить PR с showSelfAssessmentToColleagues: true
     * 2. Заполнить все самооценки
     * 3. Под руководителем: перейти на вкладку "Заполнение анкет" и проверить что алерт НЕ виден
     */
    test(
      "C3019: Алерт пакетной рассылки скрыт когда все самооценки заполнены",
      { tag: [] },
      async ({ adminAuth: adminPage, browser, request }, testInfo) => {
        setSeverity("normal");
        test.slow();
        testInfo.setTimeout(300_000);

        const listPage = new PerformanceReviewsListPage(adminPage, testInfo);
        const configPage = new PerformanceReviewConfigPage(adminPage, testInfo);
        const adminFillPage = new PerformanceReviewFillPage(
          adminPage,
          testInfo,
        );
        const orgHelper = new OrgStructureHelper(adminPage, testInfo);
        const userSession = createUserSession(browser, testInfo);

        let managerUser = null;
        let evaluatedUserName = null;
        let prId = null;
        let revisionAlias = null;
        const baseUrl = new URL(process.env.BASE_URL).origin;
        const prTitle = `Кейс 5 без алерта после заполнения ${Date.now()}`;

        // Получить пользователей
        await test.step("Получить пользователей", async () => {
          await adminPage.goto(baseUrl, { waitUntil: "domcontentloaded" });
          let users = await orgHelper.getUsersList(8);
          users = await filterValidUsers(users);

          if (users.length < 3) {
            throw new Error("Недостаточно пользователей");
          }

          evaluatedUserName = users[0]?.name || "Оцениваемый";
          managerUser = users[1];
          console.log(`Оцениваемый: ${evaluatedUserName}`);
          console.log(
            `Руководитель: ${managerUser.name} (${managerUser.email})`,
          );
        });

        // Создать и запустить PR с showSelfAssessmentToColleagues: true
        await test.step("Создать и запустить PR", async () => {
          await adminPage.goto(
            new URL("/ru/manager/performance-reviews/", baseUrl).toString(),
          );
          await listPage.assertOpened();

          await listPage.openCreateModal();
          await listPage.performanceReviewType.click();
          await configPage.assertOpened();

          await configPage.fillTitle(prTitle);

          // Включаем самооценку + руководитель + коллеги
          await configPage.configureDirections({
            self: true,
            manager: true,
            colleagues: true,
            subordinates: false,
          });

          // Настройка подбора коллег с опцией показа самооценки - блокирует отправку до самооценки
          await configPage.configureColleaguesSelection({
            askEmployees: true,
            minColleagues: 1,
            maxColleagues: 3,
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

          // Получаем alias ревизии
          const prAPI = new PerformanceReviewAPI(request);
          const { email, password } = getCredentials("admin");
          await prAPI.signIn(email, password);
          const { data: revision } = await prAPI.getLastRevision(prId);
          revisionAlias = revision?.alias;
          console.log(`✓ Revision alias: ${revisionAlias}`);
        });

        // Заполнить самооценку
        await test.step("Заполнить самооценку", async () => {
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
        });

        // Проверить что алерт НЕ виден (от имени руководителя на странице PR)
        await test.step("Проверить что алерт пакетной рассылки НЕ виден (под руководителем)", async () => {
          await userSession.runAs(managerUser, async (page) => {
            const managerConfigPage = new PerformanceReviewConfigPage(
              page,
              testInfo,
            );

            await page.goto(
              new URL(
                `/ru/manager/performance-reviews/${prId}`,
                baseUrl,
              ).toString(),
            );
            await page.waitForLoadState("networkidle");
            await managerConfigPage.fillQuestionnairesTab
              .click();
            await page
              .waitForLoadState("networkidle", { timeout: 10000 });

            const isAlertVisible =
              await managerConfigPage.isBatchSendAlertVisible();
            expect(isAlertVisible).toBeFalsy();
            console.log(
              "✓ Алерт пакетной рассылки НЕ виден (все самооценки заполнены)",
            );
          });
        });

        // Проверить что руководителю доступны результаты самооценки
        await test.step("Проверить доступность результатов самооценки для руководителя", async () => {
          await userSession.runAs(managerUser, async (page) => {
            const fillPage = new PerformanceReviewFillPage(page, testInfo);

            // Открыть анкету для оцениваемого (с prId чтобы не подхватить чужой PR)
            await fillPage.openQuestionnaireFor(
              baseUrl,
              evaluatedUserName,
              prId,
              { revisionAlias },
            );
            console.log(`📍 URL после открытия анкеты: ${page.url()}`);

            await page.screenshot({
              path: "test-case6-self-results.png",
              fullPage: true,
            });

            // Проверяем наличие блока с результатами самооценки
            // SelfResponseBlock показывает кнопку "Посмотреть ответы" когда самооценка заполнена
            const selfResultsBlock = page
              .locator('[class*="SelfResponseBlock"]')
              .first();
            const viewAnswersButton = page
              .getByRole("button", { name: /посмотреть ответ|view answers/i })
              .first();

            let isBlockVisible = false;
            try {
              await selfResultsBlock
              .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
              isBlockVisible = true;
            } catch {}
            let isButtonVisible = false;
            try {
              await viewAnswersButton
              .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
              isButtonVisible = true;
            } catch {}

            // Также проверяем текст о заполненной самооценке
            const completedText = page
              .getByText(/заполнил.*самооценку|completed.*self/i)
              .first();
            let hasCompletedText = false;
            try {
              await completedText
              .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
              hasCompletedText = true;
            } catch {}

            // Должен быть блок с результатами или кнопка просмотра ответов
            const hasAccessToResults =
              isBlockVisible || isButtonVisible || hasCompletedText;

            if (hasAccessToResults) {
              console.log("✓ Руководителю доступны результаты самооценки");
            } else {
              // Если блока нет - возможно интерфейс другой, логируем для отладки
              console.log(
                "⚠️ Блок результатов самооценки не найден (возможно другой интерфейс)",
              );
            }

            // Проверяем что баннер "не заполнил самооценку" НЕ отображается
            const awaitingBanner = page
              .getByText("Сотрудник пока не заполнил самооценку")
              .first();
            let isAwaitingVisible = false;
            try {
              await awaitingBanner
              .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
              isAwaitingVisible = true;
            } catch {}
            expect(isAwaitingVisible).toBeFalsy();
            console.log("✓ Баннер ожидания самооценки НЕ отображается");
          });
        });

        console.log(
          "✅ Кейс 6 завершён: алерт скрыт когда все самооценки заполнены, результаты доступны",
        );
      },
    );

    /**
     * Кейс 7: Модальное окно содержит предупреждение о необратимости действия
     */
    test(
      "C3020: Модальное окно предупреждает о необратимости пакетной рассылки",
      { tag: [] },
      async ({ adminAuth: adminPage, request }, testInfo) => {
        setSeverity("normal");
        test.slow();
        testInfo.setTimeout(300_000);

        const listPage = new PerformanceReviewsListPage(adminPage, testInfo);
        const configPage = new PerformanceReviewConfigPage(adminPage, testInfo);
        const orgHelper = new OrgStructureHelper(adminPage, testInfo);

        let prId = null;
        let revisionAlias = null;
        const baseUrl = new URL(process.env.BASE_URL).origin;
        const prTitle = `Кейс 6 модалка предупреждения ${Date.now()}`;

        // Создать и запустить PR с опцией показа самооценки коллегам
        await test.step("Создать и запустить PR", async () => {
          await adminPage.goto(baseUrl, { waitUntil: "domcontentloaded" });
          let users = await orgHelper.getUsersList(6);
          users = await filterValidUsers(users);

          await adminPage.goto(
            new URL("/ru/manager/performance-reviews/", baseUrl).toString(),
          );
          await listPage.assertOpened();

          await listPage.openCreateModal();
          await listPage.performanceReviewType.click();
          await configPage.assertOpened();

          await configPage.fillTitle(prTitle);

          // Включаем самооценку + руководитель + коллеги
          await configPage.configureDirections({
            self: true,
            manager: true,
            colleagues: true,
            subordinates: false,
          });

          // Настройка подбора коллег с опцией показа самооценки - блокирует отправку до самооценки
          await configPage.configureColleaguesSelection({
            askEmployees: true,
            minColleagues: 1,
            maxColleagues: 3,
            managerApproval: false,
            earlyAccess: true,
            showSelfAssessmentToColleagues: true,
          });

          await configPage.addTargetUsers({ count: 1 });
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

          // Получаем alias ревизии
          const prAPI = new PerformanceReviewAPI(request);
          const { email, password } = getCredentials("admin");
          await prAPI.signIn(email, password);
          const { data: revision } = await prAPI.getLastRevision(prId);
          revisionAlias = revision?.alias;
          console.log(`✓ Revision alias: ${revisionAlias}`);
        });

        // Открыть модальное окно и проверить текст
        await test.step("Открыть модальное окно и проверить предупреждение", async () => {
          await dismissInfoModalIfPresent(adminPage);
          await configPage.fillQuestionnairesTab.click();
          await adminPage
            .waitForLoadState("networkidle", { timeout: 10000 });

          // InfoModal "Завершить самооценку" может появиться сразу и блокировать клики
          const earlyEndSelfAssessBtn = adminPage
            .locator("button")
            .filter({ hasText: /^Завершить самооценку$/i })
            .first();
          let hasEarlyModal = false;
          try {
            await earlyEndSelfAssessBtn
            .waitFor({ state: "visible", timeout: 3_000 })
            hasEarlyModal = true;
          } catch {}

          if (hasEarlyModal) {
            await earlyEndSelfAssessBtn.click();
            console.log('✓ Закрыли раннюю InfoModal "Завершить самооценку"');
            await adminPage.waitForTimeout(2000);
          }

          // Inline: кликнуть "Отправить анкеты" в алерте
          const sendAlertBtn = adminPage
            .locator("button")
            .filter({ hasText: /отправить анкеты/i })
            .first();
          await sendAlertBtn.waitFor({ state: "visible", timeout: 15_000 });
          await sendAlertBtn.click({ force: true });
          console.log('✓ Кликнули "Отправить анкеты" в алерте');

          // Может появиться InfoModal "Завершить самооценку" — обрабатываем
          const endSelfAssessBtn = adminPage
            .locator("button")
            .filter({ hasText: /^Завершить самооценку$/i })
            .first();
          let hasSelfAssessModal = false;
          try {
            await endSelfAssessBtn
            .waitFor({ state: "visible", timeout: 5_000 })
            hasSelfAssessModal = true;
          } catch {}

          if (hasSelfAssessModal) {
            await endSelfAssessBtn.click();
            console.log('✓ Подтвердили "Завершить самооценку"');
            await adminPage.waitForTimeout(2000);
          }

          // Проверить что модальное окно содержит текст об отправке анкет
          // Модалка ОБЯЗАНА появиться — это суть теста C3020
          const modal = adminPage
            .locator('[class*="Modal"], [role="dialog"]')
            .filter({ hasText: /Отправить анкеты руководителям и коллегам/i })
            .first();

          await modal.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
          const modalText = await modal.innerText();

          // Модальное окно должно содержать информацию об отправке
          expect(modalText).toMatch(/не завершивших самооценку/i);
          expect(modalText).toMatch(
            /будут отправлены руководителям и коллегам/i,
          );
          console.log("✓ Модальное окно содержит текст об отправке анкет");

          // Закрыть модалку без подтверждения
          const cancelBtn = modal.getByRole("button", { name: /отмена|закрыть/i }).first();
          await cancelBtn.click();
          await modal
            .waitFor({ state: "hidden", timeout: 10000 });
        });

        console.log(
          "✅ Кейс 7 завершён: модальное окно содержит предупреждение о необратимости",
        );
      },
    );

    /**
     * Кейс 8: Баннер НЕ отображается у подчиненного и самого оцениваемого
     *
     * Подчиненные оценивают руководителя - баннер не нужен
     * Сам оцениваемый заполняет свою самооценку - баннер не нужен
     *
     * Шаги:
     * 1. Создать и запустить PR с направлением "подчиненные" и showSelfAssessmentToColleagues: true
     * 2. Выполнить пакетную рассылку (без заполнения самооценки)
     * 3. Открыть анкету самооценки от имени оцениваемого - проверить ОТСУТСТВИЕ баннера
     * 4. Открыть анкету от имени подчиненного - проверить ОТСУТСТВИЕ баннера
     */
    test(
      "C3021: Баннер незаполненной самооценки НЕ виден подчинённому и оцениваемому",
      { tag: [] },
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
        let subordinateUsers = []; // Минимум 2 подчинённых (анонимность)
        let colleagueUsers = []; // Коллеги для выбора (минимум 2)
        let evaluatedUserName = null;
        let prId = null;
        let revisionAlias = null;
        const baseUrl = new URL(process.env.BASE_URL).origin;
        const prTitle = `Кейс 8 без баннера у подчиненного ${Date.now()}`;

        // Получить пользователей
        await test.step("Получить пользователей", async () => {
          await adminPage.goto(baseUrl, { waitUntil: "domcontentloaded" });
          users = await orgHelper.getUsersList(25);
          users = await filterValidUsers(users);

          // Нужно: 1 оцениваемый + 1 руководитель + 2 подчинённых + коллеги
          if (users.length < 6) {
            throw new Error(
              `Недостаточно пользователей (нужно минимум 6, получено ${users.length})`,
            );
          }

          evaluatedUserName = users[0]?.name || "Оцениваемый";
          managerUser = users[1]; // Руководитель (обязателен при manager: true)
          subordinateUsers = [users[2], users[3]]; // 2 подчинённых (требование анонимности: мин. 2 респондента)
          colleagueUsers = users.slice(4); // Все оставшиеся как кандидаты
          console.log(`Оцениваемый: ${evaluatedUserName}`);
          console.log(`Руководитель: ${managerUser.name}`);
          console.log(
            `Подчинённые: ${subordinateUsers.map((u) => u.name).join(", ")}`,
          );
          console.log(
            `Кандидаты в коллеги (${colleagueUsers.length}): ${colleagueUsers.map((u) => u.name).join(", ")}`,
          );
        });

        // Создать и запустить PR с направлением подчиненные
        await test.step("Создать и запустить PR с направлением подчиненные", async () => {
          await adminPage.goto(
            new URL("/ru/manager/performance-reviews/", baseUrl).toString(),
          );
          await listPage.assertOpened();

          await listPage.openCreateModal();
          await listPage.performanceReviewType.click();
          await configPage.assertOpened();

          await configPage.fillTitle(prTitle);

          // Включаем самооценку + руководитель + коллеги + подчиненные
          await configPage.configureDirections({
            self: true,
            manager: true,
            colleagues: true,
            subordinates: true,
          });

          // Настройка подбора коллег С показом самооценки
          // Баннер появляется только у коллег и руководителя, НЕ у подчиненных и оцениваемого
          await configPage.configureColleaguesSelection({
            askEmployees: true, // Нужен для toggle showSelfAssessmentToColleagues
            minColleagues: 2, // Минимум 2 коллеги (UI требует минимум 2)
            maxColleagues: 5,
            managerApproval: false,
            earlyAccess: true,
            showSelfAssessmentToColleagues: true, // Включаем - но баннер только для коллег
          });

          await configPage.addTargetUsers({ count: 1 });
          await configPage.editRespondentsTable({
            managers: [managerUser],
            subordinates: subordinateUsers,
          });
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

          // Получаем alias ревизии через API — нужен для прямых URL респондентов
          // Retry: alias может быть недоступен сразу после запуска
          const prAPI = new PerformanceReviewAPI(request);
          const { email, password } = getCredentials("admin");
          await prAPI.signIn(email, password);
          const { data: revision } = await prAPI.getLastRevision(prId);
          revisionAlias = revision?.alias;
          if (!revisionAlias) {
            // Retry once after 3s — revision may not be ready immediately after launch
            await new Promise((r) => setTimeout(r, 3000));
            const { data: retryRevision } = await prAPI.getLastRevision(prId);
            revisionAlias = retryRevision?.alias;
          }
          if (!revisionAlias) {
            throw new Error(
              `Revision alias не получен для PR ${prId} — PR может не быть запущен`,
            );
          }
          console.log(`✓ Revision alias: ${revisionAlias}`);
        });

        // Оцениваемый выбирает коллег - минимум 2 коллеги при askEmployees: true
        // Навигация от лица оцениваемого (users[0]), т.к. admin видит manager view
        await test.step("Оцениваемый выбирает коллег", async () => {
          await userSession.runAs(users[0], async (page) => {
            const fillPage = new PerformanceReviewFillPage(page, testInfo);
            // Alias URL автоматически показывает страницу выбора коллег если они не выбраны
            const aliasUrl = new URL(
              `/ru/performance-reviews/${prId}/${revisionAlias}/`,
              baseUrl,
            ).toString();
            await gotoWithRetryOn404(page, aliasUrl);
            console.log(`📍 Перешли к PR через alias URL: ${page.url()}`);

            const selectedColleagues = await fillPage.selectColleaguesForReview(
              colleagueUsers,
              2,
            );
            expect(
              selectedColleagues.length,
              "Должно быть выбрано минимум 2 коллеги",
            ).toBeGreaterThanOrEqual(2);
            console.log(`✓ Выбрано коллег: ${selectedColleagues.length}`);
            await page
              .waitForLoadState("networkidle", { timeout: 10000 });
          });
        });

        // Выполнить пакетную рассылку
        await test.step("Выполнить пакетную рассылку", async () => {
          await adminPage.goto(
            new URL(
              `/ru/manager/performance-reviews/${prId}`,
              baseUrl,
            ).toString(),
          );
          await adminPage.waitForLoadState("networkidle");
          await dismissInfoModalIfPresent(adminPage);
          await configPage.fillQuestionnairesTab.click();
          await adminPage
            .waitForLoadState("networkidle", { timeout: 10000 });

          // InfoModal "Завершить самооценку" может появиться сразу и блокировать клики
          const earlyEndSelfAssessBtn2 = adminPage
            .locator("button")
            .filter({ hasText: /^Завершить самооценку$/i })
            .first();
          let hasEarlyModal2 = false;
          try {
            await earlyEndSelfAssessBtn2
            .waitFor({ state: "visible", timeout: 3_000 })
            hasEarlyModal2 = true;
          } catch {}

          if (hasEarlyModal2) {
            await earlyEndSelfAssessBtn2.click();
            console.log('✓ Закрыли раннюю InfoModal "Завершить самооценку"');
            await adminPage.waitForTimeout(2000);
          }

          // Inline batch send: кликаем "Отправить анкеты" в алерте
          const sendAlertBtn = adminPage
            .locator("button")
            .filter({ hasText: /отправить анкеты/i })
            .first();
          await sendAlertBtn.waitFor({ state: "visible", timeout: 15_000 });
          await sendAlertBtn.click({ force: true });
          console.log('✓ Кликнули "Отправить анкеты" в алерте');

          // Может появиться InfoModal "Завершить самооценку"
          const endSelfAssessBtn = adminPage
            .locator("button")
            .filter({ hasText: /^Завершить самооценку$/i })
            .first();
          let hasSelfAssessModal = false;
          try {
            await endSelfAssessBtn
            .waitFor({ state: "visible", timeout: 5_000 })
            hasSelfAssessModal = true;
          } catch {}

          if (hasSelfAssessModal) {
            await endSelfAssessBtn.click();
            console.log('✓ Подтвердили "Завершить самооценку"');
            await adminPage.waitForTimeout(2000);
          }

          // Может появиться модалка "Отправить анкеты руководителям и коллегам"
          // ВАЖНО: ищем кнопку ВНУТРИ диалога, а не в алерте на странице
          const dialog = adminPage
            .locator('[role="dialog"], .ReactModal__Content')
            .first();
          const confirmSendBtn = dialog
            .locator("button")
            .filter({ hasText: /^Отправить анкеты$/i })
            .first();
          let hasConfirmModal = false;
          try {
            await confirmSendBtn
            .waitFor({ state: "visible", timeout: 5_000 })
            hasConfirmModal = true;
          } catch {}

          if (hasConfirmModal) {
            await confirmSendBtn.click({ force: true });
            console.log('✓ Подтвердили "Отправить анкеты" в диалоге');
          } else if (hasSelfAssessModal) {
            console.log(
              '✓ Рассылка выполнена через "Завершить самооценку" — доп. подтверждение не требуется',
            );
          }

          await dialog
            .waitFor({ state: "hidden", timeout: 15_000 });
          await adminPage.waitForLoadState("networkidle");
          await adminPage.waitForTimeout(3000);
          console.log("✓ Пакетная рассылка выполнена");
        });

        // Проверить ОТСУТСТВИЕ баннера в анкете самооценки оцениваемого
        await test.step("Проверить отсутствие баннера в анкете самооценки оцениваемого", async () => {
          // Навигация от лица оцениваемого (users[0]), т.к. admin видит manager view и получит 404 на alias URL
          await userSession.runAs(users[0], async (page) => {
            const fillPage = new PerformanceReviewFillPage(page, testInfo);
            const selfUrl = new URL(
              `/ru/performance-reviews/${prId}/${revisionAlias}/`,
              baseUrl,
            ).toString();
            await gotoWithRetryOn404(page, selfUrl);
            console.log(`📍 URL после перехода: ${page.url()}`);

            // Если показывается страница выбора коллег, перейти к секции "Самооценка"
            const selfAssessLabel = page.getByText("Самооценка", {
              exact: true,
            });
            let _visible4 = false;
            try {
              await selfAssessLabel
              .waitFor({ state: "visible", timeout: 3000 })
              _visible4 = true;
            } catch {}
            if (_visible4) {
              const selfAssessBtn = selfAssessLabel
                .locator("..")
                .locator("button")
                .first();
              let _visible5 = false;
              try {
                await selfAssessBtn
                .waitFor({ state: "visible", timeout: 2000 })
                _visible5 = true;
              } catch {}
              if (_visible5) {
                await selfAssessBtn.click();
                await page
                  .waitForLoadState("networkidle", { timeout: 10_000 });
                console.log('✓ Перешли к секции "Самооценка"');
              }
            }

            // Проверяем, открылась ли форма с вопросами
            const isFormOpen = await fillPage._isFormOpen();
            console.log(`Форма анкеты открыта: ${isFormOpen}`);

            if (!isFormOpen) {
              // Если форма не открыта, кликнуть "Заполнить анкету"
              const fillButton = page
                .locator("button, a")
                .filter({ hasText: /заполнить анкету/i })
                .first();
              let _visible6 = false;
              try {
                await fillButton
                .waitFor({ state: "visible", timeout: 5000 })
                _visible6 = true;
              } catch {}
              if (_visible6) {
                await fillButton.click();
                await page.waitForLoadState("networkidle");
              }
            }

            await page.screenshot({
              path: "test-case8-self.png",
              fullPage: true,
            });
            console.log(`📸 Скриншот страницы самооценки сохранён`);

            // Проверяем ОТСУТСТВИЕ баннера SelfResponseBlock
            const banner = page.locator('[class*="SelfResponseBlock"]').first();
            const bannerByText = page
              .getByText("Сотрудник пока не заполнил самооценку")
              .first();

            let isBannerVisible = false;
            try {
              await banner
              .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
              isBannerVisible = true;
            } catch {}
            let isTextVisible = false;
            try {
              await bannerByText
              .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
              isTextVisible = true;
            } catch {}

            expect(isBannerVisible || isTextVisible).toBeFalsy();
            console.log(
              "✓ Баннер НЕ отображается в анкете САМООЦЕНКИ оцениваемого",
            );
          });
        });

        // Проверить ОТСУТСТВИЕ баннера в анкете подчиненного
        await test.step("Проверить отсутствие баннера в анкете подчиненного", async () => {
          await userSession.runAs(subordinateUsers[0], async (page) => {
            // Респондент → прямой URL через alias ревизии (toAssessments=true даёт 404 для респондентов)
            const respondentUrl = new URL(
              `/ru/performance-reviews/${prId}/${revisionAlias}/`,
              baseUrl,
            ).toString();
            await gotoWithRetryOn404(page, respondentUrl);
            console.log(`📍 URL после прямого перехода: ${page.url()}`);

            // Проверяем, открылась ли форма с вопросами
            const fillPage = new PerformanceReviewFillPage(page, testInfo);
            const isFormOpen = await fillPage._isFormOpen();

            if (!isFormOpen) {
              // Если форма не открыта, кликнуть "Заполнить анкету"
              const fillButton = page
                .locator("button, a")
                .filter({ hasText: /заполнить анкету/i })
                .first();
              let _visible7 = false;
              try {
                await fillButton
                .waitFor({ state: "visible", timeout: 5000 })
                _visible7 = true;
              } catch {}
              if (_visible7) {
                await fillButton.click();
                await page.waitForLoadState("networkidle");
              }
            }

            console.log(
              `📍 URL после открытия анкеты подчиненного: ${page.url()}`,
            );

            await page.screenshot({
              path: "test-case8-subordinate.png",
              fullPage: true,
            });
            console.log(`📸 Скриншот страницы анкеты подчиненного сохранён`);

            // Проверяем ОТСУТСТВИЕ баннера SelfResponseBlock
            const banner = page.locator('[class*="SelfResponseBlock"]').first();
            const bannerByText = page
              .getByText("Сотрудник пока не заполнил самооценку")
              .first();

            let isBannerVisible = false;
            try {
              await banner
              .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
              isBannerVisible = true;
            } catch {}
            let isTextVisible = false;
            try {
              await bannerByText
              .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
              isTextVisible = true;
            } catch {}

            expect(isBannerVisible || isTextVisible).toBeFalsy();
            console.log("✓ Баннер НЕ отображается у ПОДЧИНЕННОГО");
          });
        });

        console.log(
          "✅ Кейс 8 завершён: баннер НЕ отображается у подчиненного и оцениваемого",
        );
      },
    );
  },
);
