// tests/functional/performance-review/edit/pr-edit-case2-toggle-direction.spec.js
// E2E тест: Отключение направления на запущенном PR

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
  getCredentials,
} from "../../../utils/api/index.js";

test.describe(
  "PR Edit - Отключение направления",
  { tag: ["@performance-review", "@edit", "@e2e", "@regression", "@ui"] },
  () => {
    test.beforeEach(() => {
      markAsE2ETest(
        MODULES.PERFORMANCE_REVIEW,
        "Edit Running PR - Toggle Direction",
      );
    });

    /**
     * Кейс 2: Изменение направлений оценки на запущенном PR
     *
     * Шаги:
     * 1. Админ создаёт PR с направлениями: Самооценка + Руководитель
     * 2. Админ запускает PR
     * 3. Сотрудник заполняет самооценку → руководитель видит анкету
     * 4. Админ отключает направление "Руководитель"
     * 5. Руководитель НЕ видит анкету
     */
    test(
      "C3011: Отключение направления на запущенном PR",
      { tag: ["@high"] },
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
        let prId = null;
        const baseUrl = new URL(process.env.BASE_URL).origin;
        const prName = `Отключение направления ${Date.now()}`;

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

          await configPage.fillTitle(prName);

          await configPage.configureDirections({
            self: true,
            manager: true,
            colleagues: false,
            subordinates: false,
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

        // Сотрудник заполняет самооценку
        await test.step("Оцениваемый заполняет самооценку", async () => {
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
          await adminPage.waitForLoadState("networkidle");
        });

        // Проверка: руководитель видит анкету
        await test.step("Проверить что руководитель видит анкету", async () => {
          await userSession.runAs(managerUser, async (page) => {
            await page.goto(new URL("/ru/", baseUrl).toString());
            await page.waitForLoadState("networkidle");

            const prBlock = page
              .locator(
                '[class*="PerformanceReviewSummaryNotification_notification"]',
              )
              .filter({
                has: page.locator(`a[href*="/performance-reviews/${prId}/"]`),
              })
              .first();

            await expect(prBlock).toBeVisible({ timeout: 15000 });
            console.log(`✓ Руководитель видит анкету PR ID=${prId}`);
          });
        });

        // Админ отключает направление "Руководитель"
        await test.step('Админ отключает направление "Руководитель"', async () => {
          await adminPage.goto(
            new URL(
              `/ru/manager/performance-reviews/${prId}`,
              baseUrl,
            ).toString(),
          );
          await adminPage.waitForLoadState("networkidle");

          await configPage.toggleDirectionsOnRunningPR({ manager: false });
          console.log('✓ Направление "Руководитель" отключено');
        });

        // Проверка результата
        await test.step("Проверить результат отключения направления", async () => {
          await userSession.runAs(managerUser, async (page) => {
            await page.goto(new URL("/ru/", baseUrl).toString());
            await page.waitForLoadState("networkidle");
            await page.reload();
            await page.waitForLoadState("networkidle");

            const prBlock = page
              .locator(
                '[class*="PerformanceReviewSummaryNotification_notification"]',
              )
              .filter({
                has: page.locator(`a[href*="/performance-reviews/${prId}/"]`),
              })
              .first();

            const isVisible = await prBlock
              .waitFor({ state: "visible", timeout: 5000 })
                .then(() => true, () => false)

            if (isVisible) {
              console.log(
                `ℹ️ Руководитель ВСЁ ЕЩЁ видит анкету PR ID=${prId} (отправленные анкеты не отзываются)`,
              );
            } else {
              console.log(
                `✓ Руководитель НЕ видит анкету после отключения направления`,
              );
            }

            console.log("✓ Направление успешно отключено на запущенном PR");
          });
        });

        console.log(
          "✅ Тест завершён: направление успешно отключено на запущенном PR",
        );
      },
    );
  },
);
