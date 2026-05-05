// tests/functional/performance-review/filling/pr-admin-approve-colleagues.spec.js
// Тест: Админ утверждает предложенных коллег на вкладке "Заполнение анкет"
//
// Баг: кнопка "Утвердить" задизейблена для админа на асинхронном ревью.
// Ожидание: админ должен иметь возможность утвердить коллег, предложенных оцениваемым.
import { test } from "../../../fixtures/auth.js";
import { expect } from "@playwright/test";
import { PerformanceReviewsListPage } from "../../../../pages/PerformanceReviewsListPage.js";
import { PerformanceReviewConfigPage } from "../../../../pages/PerformanceReviewConfigPage.js";
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
import {
  PerformanceReviewAPI,
  DashboardTeamAPI,
  getCredentials,
  getTestUserPassword,
} from "../../../utils/api/index.js";

test.describe(
  "Performance Review - Админ утверждает коллег на вкладке заполнения",
  {
    tag: [
      "@performance-review",
      "@filling",
      "@e2e",
      "@ui",
      "@regression",
    ],
  },
  () => {
    test.beforeEach(() => {
      markAsE2ETest(MODULES.PERFORMANCE_REVIEW, "Admin Approve Colleagues");
    });

    test(
      "Админ утверждает предложенных коллег — кнопка Утвердить активна",
      { tag: ["@critical"] },
      async ({ adminAuth: adminPage, browser, request }, testInfo) => {
        setSeverity("critical");
        test.slow();
        testInfo.setTimeout(600_000);

        const listPage = new PerformanceReviewsListPage(adminPage, testInfo);
        const configPage = new PerformanceReviewConfigPage(adminPage, testInfo);
        const orgHelper = new OrgStructureHelper(adminPage, testInfo);
        const userSession = createUserSession(browser, testInfo);

        let users = [];
        let colleagues = [];
        let managerUser = null;
        let prId = null;
        let revisionId = null;
        const baseUrl = new URL(process.env.BASE_URL).origin;
        const prName = `Admin_ApproveColleagues_${Date.now()}`;

        // ── Шаг 1: Получение пользователей ──
        await test.step("Получить список активных пользователей", async () => {
          await adminPage.goto(baseUrl, { waitUntil: "domcontentloaded" });

          users = await orgHelper.getUsersList(11);
          users = await filterValidUsers(users);

          if (users.length < 5) {
            throw new Error(
              "Недостаточно пользователей для теста (нужно минимум 5)",
            );
          }

          managerUser = users[1];
          colleagues = users.slice(2, 5);

          console.log(`Оцениваемый: ${users[0]?.name}`);
          console.log(`Руководитель: ${managerUser.name}`);
          console.log(
            `Потенциальные коллеги: ${colleagues.map((u) => u.name).join(", ")}`,
          );
        });

        // ── Шаг 2: Создание PR с утверждением коллег ──
        await test.step("Создать PR с ручным выбором и утверждением коллег", async () => {
          await adminPage.goto(
            new URL("/ru/manager/performance-reviews/", baseUrl).toString(),
          );
          await listPage.assertOpened();

          await listPage.openCreateModal();
          await listPage.performanceReviewType.click();
          await configPage.assertOpened();

          await configPage.fillTitle(prName);

          await configPage.configureDirections({
            self: true,
            manager: true,
            colleagues: true,
            subordinates: true,
          });

          await configPage.configureColleaguesSelection({
            askEmployees: true,
            minColleagues: 1,
            maxColleagues: 3,
            managerApproval: true,
            earlyAccess: true,
          });

          console.log("✓ PR настроен: ручной выбор + утверждение руководителем");
        });

        // ── Шаг 3: Добавление участников и запуск ──
        await test.step("Добавить участников и запустить PR", async () => {
          await configPage.addTargetUsers({ count: 1 });
          await configPage.editRespondentsTable({ managers: [managerUser] });
          await configPage.disableReminders();
          await configPage.addAssessmentsForAllDirections();
          await configPage.goToStep("launch");
          await configPage.launchAndSendQuestionnaires();

          const currentUrl = adminPage.url();
          const match = currentUrl.match(/\/performance-reviews\/(\d+)/);
          if (!match) {
            throw new Error(`Не удалось извлечь PR ID из URL: ${currentUrl}`);
          }
          prId = match[1];
          console.log(`✓ PR запущен, ID: ${prId}`);

          const prAPI = new PerformanceReviewAPI(request);
          const { email, password } = getCredentials("admin");
          await prAPI.signIn(email, password);
          const { data: revision } = await prAPI.getLastRevision(prId);
          revisionId = revision?.id;
          console.log(`✓ Revision ID: ${revisionId}`);
        });

        // ── Шаг 4: Оцениваемый предлагает коллег через API ──
        await test.step("Оцениваемый предлагает коллег через API", async () => {
          const prAPI = new PerformanceReviewAPI(request);
          const { email: adminEmail, password: adminPass } =
            getCredentials("admin");
          await prAPI.signIn(adminEmail, adminPass);

          // Получаем nomination
          const { data: nominationData } = await prAPI.get(
            `/manager/performance-reviews/${prId}/nominations/of-revision/${revisionId}/`,
          );
          if (!nominationData?.id) {
            throw new Error("Nomination не найдена для данной ревизии");
          }
          const nominationId = nominationData.id;

          // Получаем target user ID
          const { data: targetUsersData } = await prAPI.getTargetUsers(prId);
          const targetUsers = targetUsersData?.items || targetUsersData || [];
          if (targetUsers.length === 0) {
            throw new Error("Target users не найдены в PR");
          }
          const targetUserId = targetUsers[0].id;

          // Получаем NominationTargetUser ID
          const { data: nomTargetData } = await prAPI.post(
            `/manager/performance-reviews/${prId}/nominations/${nominationId}/target-users/get`,
            { targetUsersIds: [targetUserId] },
          );
          const nomTargetUsers = nomTargetData?.items || nomTargetData || [];
          if (nomTargetUsers.length === 0) {
            throw new Error("NominationTargetUser не найден");
          }
          const nominationTargetUserId = nomTargetUsers[0].id;

          // Извлекаем реальные userId коллег из seed-имён
          const colleagueUserIds = [];
          for (const colleague of colleagues.slice(0, 2)) {
            const idMatch = colleague.name.match(/\b(\d{4,6})\b/);
            if (idMatch) {
              colleagueUserIds.push(parseInt(idMatch[1], 10));
            }
          }
          if (colleagueUserIds.length < 1) {
            throw new Error("Не удалось извлечь userId из имён коллег");
          }

          // Авторизуемся как оцениваемый и предлагаем коллег
          const userAPI = new DashboardTeamAPI(request);
          await userAPI.signIn(users[0].email, getTestUserPassword());

          const { response: suggestResp } = await userAPI.suggestReceivers(
            prId,
            nominationId,
            {
              targetUserId: nominationTargetUserId,
              receiversIds: colleagueUserIds,
            },
          );
          if (!suggestResp.ok()) {
            throw new Error(
              `suggestReceivers failed: HTTP ${suggestResp.status()}`,
            );
          }

          // Подтверждаем номинацию
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
          console.log("✓ Коллеги предложены и номинация отправлена");

          // Ждём обработки
          await new Promise((r) => setTimeout(r, 3000));
        });

        // ── Шаг 5: Проверка — кнопка "Утвердить" активна для админа ──
        await test.step('Проверить что кнопка "Утвердить" активна для админа', async () => {
          await adminPage.goto(
            new URL(
              `/ru/manager/performance-reviews/${prId}/`,
              baseUrl,
            ).toString(),
          );
          await adminPage.waitForLoadState("networkidle");

          // Переходим на вкладку "Заполнение анкет"
          const fillTab = adminPage
            .locator('button, [role="tab"]')
            .filter({ hasText: /^заполнение анкет$/i })
            .first();
          await fillTab.waitFor({ state: "visible", timeout: 10_000 });
          await fillTab.click();
          await adminPage.waitForLoadState("networkidle");

          // Находим ячейку со статусом "Коллеги еще не утверждены"
          const colleaguesCell = adminPage
            .locator("td, cell")
            .filter({ hasText: /коллеги еще не утверждены/i })
            .first();
          await colleaguesCell.waitFor({ state: "visible", timeout: 15_000 });
          console.log('✓ Найдена ячейка "Коллеги еще не утверждены"');

          // Находим кнопку "Утвердить" внутри этой ячейки
          const approveButton = colleaguesCell
            .locator("button")
            .filter({ hasText: /^Утвердить$/i });
          await approveButton.waitFor({ state: "visible", timeout: 5_000 });

          // КРИТИЧЕСКАЯ ПРОВЕРКА 1: кнопка НЕ должна быть disabled
          const isDisabled = await approveButton.isDisabled();
          expect(
            isDisabled,
            'Кнопка "Утвердить" должна быть активна для админа, но она задизейблена (баг)',
          ).toBe(false);

          // КРИТИЧЕСКАЯ ПРОВЕРКА 2: aria-disabled тоже не должен быть true
          const ariaDisabled = await approveButton.getAttribute("aria-disabled");
          expect(
            ariaDisabled,
            'Кнопка "Утвердить" имеет aria-disabled="true" (баг)',
          ).not.toBe("true");

          // ПРОВЕРКА 3: в ячейке видны предложенные коллеги (а не просто статус)
          const colleagueNames = colleaguesCell.locator(
            'button[class*="User"], button[class*="Avatar"], [class*="UserOption"]',
          );
          const colleagueCount = await colleagueNames.count();
          expect(
            colleagueCount,
            "В ячейке должны отображаться предложенные коллеги (минимум 1)",
          ).toBeGreaterThanOrEqual(1);

          // КРИТИЧЕСКАЯ ПРОВЕРКА 4: кнопка кликабельна — клик должен инициировать API-запрос
          let approveResponse = null;
          try {
            [approveResponse] = await Promise.all([
              adminPage.waitForResponse(
                (resp) =>
                  resp.url().includes("/performance-reviews/") &&
                  resp.request().method() === "POST",
                { timeout: 10_000 },
              ),
              approveButton.click({ timeout: 5_000 }),
            ]);
          } catch {}

          expect(
            approveResponse,
            'Клик по "Утвердить" должен вызвать API-запрос, но запрос не был отправлен',
          ).not.toBeNull();

          await adminPage.waitForLoadState("networkidle");

          // Подтверждаем в модалке если появилась
          const confirmButton = adminPage
            .locator('[role="dialog"] button, .modal button')
            .filter({ hasText: /утвердить|подтвердить|да/i })
            .first();
          let modalVisible = false;
          try {
            await confirmButton
            .waitFor({ state: "visible", timeout: 3_000 })
            modalVisible = true;
          } catch {}
          if (modalVisible) {
            await confirmButton.click();
            await adminPage.waitForLoadState("networkidle");
          }

          // ПРОВЕРКА 5: после утверждения текст "Коллеги еще не утверждены" исчез
          await expect(
            adminPage.getByText(/коллеги еще не утверждены/i).first(),
          ).not.toBeVisible({ timeout: 10_000 });
        });
      },
    );
  },
);
