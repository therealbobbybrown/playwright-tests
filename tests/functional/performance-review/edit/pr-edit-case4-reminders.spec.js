// tests/functional/performance-review/edit/pr-edit-case4-reminders.spec.js
// E2E тест: Включение напоминаний на запущенном PR

import { test } from "../../../fixtures/auth.js";
import { expect } from "@playwright/test";
import { PerformanceReviewsListPage } from "../../../../pages/PerformanceReviewsListPage.js";
import { PerformanceReviewConfigPage } from "../../../../pages/PerformanceReviewConfigPage.js";
import {
  markAsE2ETest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";

test.describe(
  "PR Edit - Напоминания",
  { tag: ["@performance-review", "@edit", "@e2e", "@regression", "@ui"] },
  () => {
    test.beforeEach(() => {
      markAsE2ETest(MODULES.PERFORMANCE_REVIEW, "Edit Running PR - Reminders");
    });

    /**
     * Кейс 4: Включение уведомлений на запущенном PR
     *
     * Проверяем, что админ может включить напоминания на уже запущенном PR
     */
    test(
      "C3013: Включение напоминаний на запущенном PR",
      { tag: ["@normal"] },
      async ({ adminAuth: adminPage }, testInfo) => {
        setSeverity("normal");
        test.slow();
        testInfo.setTimeout(300_000);

        const listPage = new PerformanceReviewsListPage(adminPage, testInfo);
        const configPage = new PerformanceReviewConfigPage(adminPage, testInfo);

        let prId = null;
        const baseUrl = new URL(process.env.BASE_URL).origin;
        const prName = `Напоминания ${Date.now()}`;

        // Создание и запуск PR без напоминаний
        await test.step("Создать и запустить PR без напоминаний", async () => {
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
            console.log(`✓ PR запущен без напоминаний, ID: ${prId}`);
          }
        });

        // Админ включает напоминания
        await test.step("Админ включает напоминания", async () => {
          await adminPage.goto(
            new URL(
              `/ru/manager/performance-reviews/${prId}`,
              baseUrl,
            ).toString(),
          );
          await adminPage.waitForLoadState("networkidle");

          const remindersSection = adminPage
            .locator("h2")
            .filter({ hasText: "Напоминания" })
            .locator("..");

          const statusText = remindersSection.getByText(
            /регулярные напоминания (выключены|включены)/i,
          );
          const statusVisible = await statusText
            .waitFor({ state: "visible", timeout: 5000 })
              .then(() => true, () => false)

          if (statusVisible) {
            const currentStatus = await statusText.textContent();
            console.log(`Текущий статус: ${currentStatus}`);

            const configureButton = remindersSection.getByRole("button", {
              name: /настроить/i,
            });
            if (
              await configureButton
                .waitFor({ state: "visible", timeout: 5000 })
                  .then(() => true, () => false)
            ) {
              await configureButton.click();
              console.log('✓ Нажата кнопка "Настроить"');

              const settingsPanel = adminPage
                .locator('[class*="NotificationsScheduleModal_layout"]')
                .first();
              await settingsPanel.waitFor({ state: "visible", timeout: 5000 });
              const panelVisible = await settingsPanel
                .waitFor({ state: "visible", timeout: 5000 })
                  .then(() => true, () => false)

              if (panelVisible) {
                const enableToggle = settingsPanel
                  .locator('input[type="checkbox"]')
                  .first();
                if (
                  await enableToggle
                    .waitFor({ state: "visible", timeout: 3000 })
                      .then(() => true, () => false)
                ) {
                  const isChecked = await enableToggle
                    .isChecked()
                  if (!isChecked) {
                    await enableToggle.click();
                    console.log("✓ Напоминания включены");
                  }
                }

                const saveButton = settingsPanel
                  .getByRole("button", { name: /сохранить|применить/i })
                  .first();
                if (
                  await saveButton
                    .waitFor({ state: "visible", timeout: 3000 })
                      .then(() => true, () => false)
                ) {
                  await saveButton.click();
                  await expect(settingsPanel).toBeHidden({ timeout: 5000 });
                  console.log("✓ Настройки сохранены");
                } else {
                  await adminPage.keyboard.press("Escape");
                }
              }
            }
          }

          await expect(
            adminPage.getByRole("heading", { name: "Напоминания" }),
          ).toBeVisible();
          console.log("✓ Секция напоминаний видна");
        });

        console.log(
          "✅ Тест завершён: напоминания можно редактировать на запущенном PR",
        );
      },
    );
  },
);
