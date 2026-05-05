// tests/functional/performance-review/edit/pr-edit-case1-add-participant.spec.js
// E2E тест: Добавление нового участника в запущенный PR

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

test.describe(
  "PR Edit - Добавление участника",
  { tag: ["@performance-review", "@edit", "@e2e", "@regression", "@ui"] },
  () => {
    test.beforeEach(() => {
      markAsE2ETest(
        MODULES.PERFORMANCE_REVIEW,
        "Edit Running PR - Add Participant",
      );
    });

    /**
     * Кейс 1: Добавление нового участника (оцениваемого) в запущенный PR
     *
     * Шаги:
     * 1. Админ создаёт PR с 1 участником
     * 2. Админ запускает PR
     * 3. Админ добавляет ещё одного участника
     * 4. Новый участник видит анкету на главной
     */
    test(
      "C3010: Добавление нового участника в запущенный PR",
      { tag: ["@critical"] },
      async ({ adminAuth: adminPage, browser }, testInfo) => {
        setSeverity("critical");
        test.slow();
        testInfo.setTimeout(600_000);

        const listPage = new PerformanceReviewsListPage(adminPage, testInfo);
        const configPage = new PerformanceReviewConfigPage(adminPage, testInfo);
        const orgHelper = new OrgStructureHelper(adminPage, testInfo);
        const userSession = createUserSession(browser, testInfo);

        let users = [];
        let newParticipant = null;
        let prId = null;
        const baseUrl = new URL(process.env.BASE_URL).origin;
        const prName = `Добавление участника ${Date.now()}`;

        // Получение пользователей
        await test.step("Получить пользователей", async () => {
          await adminPage.goto(baseUrl, { waitUntil: "domcontentloaded" });
          users = await orgHelper.getUsersList(8);
          users = await filterValidUsers(users);

          if (users.length < 3) {
            throw new Error("Недостаточно пользователей для теста");
          }

          newParticipant = users[2];
          console.log(`Новый участник: ${newParticipant.name}`);
        });

        // Создание и запуск PR
        await test.step("Создать и запустить PR с 1 участником", async () => {
          await adminPage.goto(
            new URL("/ru/manager/performance-reviews/", baseUrl).toString(),
          );
          await listPage.assertOpened();

          await listPage.openCreateModal();
          await listPage.performanceReviewType.click();
          await configPage.assertOpened();

          await configPage.fillTitle(prName);
          console.log(`✓ PR название: "${prName}"`);

          await configPage.configureDirections({
            self: true,
            manager: false,
            colleagues: false,
            subordinates: false,
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
        });

        // Проверка: новый участник НЕ видит анкету
        await test.step("Проверить что новый участник НЕ видит анкету", async () => {
          await userSession.runAs(newParticipant, async (page) => {
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

            await expect(prBlock).not.toBeVisible({ timeout: 5000 });
            console.log(
              `✓ ${newParticipant.name} НЕ видит анкету до добавления`,
            );
          });
        });

        // Админ добавляет нового участника
        await test.step("Админ добавляет нового участника", async () => {
          await adminPage.goto(
            new URL(
              `/ru/manager/performance-reviews/${prId}`,
              baseUrl,
            ).toString(),
          );
          await adminPage.waitForLoadState("networkidle");
          await adminPage.waitForLoadState("domcontentloaded");

          const addButton = adminPage
            .getByRole("button", { name: /добавить участника/i })
            .first();
          await addButton.waitFor({ state: "visible", timeout: 10000 });
          await addButton.click();

          const modal = adminPage
            .locator('[class*="Modal"]')
            .filter({ hasText: /добавить|участник|оцени/i })
            .first();
          await modal.waitFor({ state: "visible", timeout: 10000 });

          const searchInput = modal.locator("input").first();
          if (
            await searchInput
              .waitFor({ state: "visible", timeout: 3000 })
                .then(() => true, () => false)
          ) {
            await searchInput.fill(newParticipant.name);
            // Ждём появления результатов поиска
            await modal
              .locator('[class*="Option_option-item"]')
              .first()
              .waitFor({ state: "visible", timeout: 3000 });
          }

          const userCard = modal
            .locator('[class*="Option_option-item"]')
            .filter({ hasText: newParticipant.name })
            .first();

          if (
            await userCard
              .waitFor({ state: "visible", timeout: 5000 })
                .then(() => true, () => false)
          ) {
            await userCard.click();
            // Ждём обновления UI после выбора
            await modal
              .locator("button")
              .filter({ hasText: /подтвердить/i })
              .first()
              .waitFor({ state: "visible", timeout: 3000 });
            console.log(`✓ Выбран новый участник: ${newParticipant.name}`);
          } else {
            const userText = modal
              .getByText(newParticipant.name, { exact: false })
              .first();
            if (
              await userText
                .waitFor({ state: "visible", timeout: 3000 })
                  .then(() => true, () => false)
            ) {
              await userText.click();
              console.log(
                `✓ Выбран участник по тексту: ${newParticipant.name}`,
              );
            }
          }

          const confirmButton = modal
            .locator("button")
            .filter({ hasText: /подтвердить/i })
            .first();
          if (
            await confirmButton
              .waitFor({ state: "visible", timeout: 3000 })
                .then(() => true, () => false)
          ) {
            await confirmButton.click();
            // Ждём закрытия модала выбора
            await modal
              .waitFor({ state: "hidden", timeout: 5000 });
            console.log("✓ Участник выбран в модальном окне");
          }

          const saveButton = adminPage
            .locator("button")
            .filter({ hasText: /^сохранить$/i })
            .first();
          await saveButton.waitFor({ state: "visible", timeout: 10000 });
          await saveButton.click();
          console.log('✓ Кнопка "Сохранить" нажата');

          const confirmChangesButton = adminPage
            .locator("button")
            .filter({ hasText: /подтвердить изменения/i })
            .first();
          await confirmChangesButton.waitFor({
            state: "visible",
            timeout: 10000,
          });
          await confirmChangesButton.click();
          console.log("✓ Изменения подтверждены");

          // Ждём завершения сохранения
          await adminPage
            .waitForLoadState("networkidle", { timeout: 10000 });
          console.log("✓ Участник добавлен");
        });

        // Проверка: новый участник ТЕПЕРЬ видит анкету
        await test.step("Проверить что новый участник ВИДИТ анкету", async () => {
          await userSession.runAs(newParticipant, async (page) => {
            // Небольшая задержка для распространения изменений в системе
            await page.waitForTimeout(5000);
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

            await expect(prBlock).toBeVisible({ timeout: 30000 });
            console.log(
              `✓ ${newParticipant.name} ВИДИТ анкету после добавления`,
            );
          });
        });

        console.log(
          "✅ Тест завершён: новый участник успешно добавлен в запущенный PR",
        );
      },
    );
  },
);
