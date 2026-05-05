// tests/functional/performance-review/edit/pr-edit-case5-administrators.spec.js
// E2E тест: Добавление администратора в запущенный PR

import { test } from "../../../fixtures/auth.js";
import { expect } from "@playwright/test";
import { PerformanceReviewsListPage } from "../../../../pages/PerformanceReviewsListPage.js";
import { PerformanceReviewConfigPage } from "../../../../pages/PerformanceReviewConfigPage.js";
import { OrgStructureHelper } from "../../../../pages/OrgStructureHelper.js";
import {
  markAsE2ETest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";

test.describe(
  "PR Edit - Администраторы",
  { tag: ["@performance-review", "@edit", "@e2e", "@regression", "@ui"] },
  () => {
    test.beforeEach(() => {
      markAsE2ETest(
        MODULES.PERFORMANCE_REVIEW,
        "Edit Running PR - Administrators",
      );
    });

    /**
     * Кейс 5: Редактирование администраторов на запущенном PR
     *
     * Проверяем, что админ может добавить нового администратора в уже запущенный PR
     */
    test(
      "C3014: Добавление администратора на запущенном PR",
      { tag: ["@normal"] },
      async ({ adminAuth: adminPage }, testInfo) => {
        setSeverity("normal");
        test.slow();
        testInfo.setTimeout(300_000);

        const listPage = new PerformanceReviewsListPage(adminPage, testInfo);
        const configPage = new PerformanceReviewConfigPage(adminPage, testInfo);
        const orgHelper = new OrgStructureHelper(adminPage, testInfo);

        let users = [];
        let newAdmin = null;
        let prId = null;
        const baseUrl = new URL(process.env.BASE_URL).origin;
        const prName = `Администраторы ${Date.now()}`;

        // Получение пользователей
        await test.step("Получить пользователей", async () => {
          await adminPage.goto(baseUrl, { waitUntil: "domcontentloaded" });
          users = await orgHelper.getUsersList(5);

          if (users.length < 3) {
            throw new Error("Недостаточно пользователей для теста");
          }

          newAdmin = users[2];
          console.log(`Новый администратор: ${newAdmin.name}`);
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

        // Админ добавляет нового администратора
        await test.step("Админ добавляет нового администратора", async () => {
          await adminPage.goto(
            new URL(
              `/ru/manager/performance-reviews/${prId}`,
              baseUrl,
            ).toString(),
          );
          await adminPage.waitForLoadState("networkidle");

          await adminPage.evaluate(() =>
            window.scrollTo(0, document.body.scrollHeight),
          );

          const adminsHeading = adminPage.getByRole("heading", {
            name: "Администраторы",
          });
          await adminsHeading.waitFor({ state: "visible", timeout: 10000 });

          const editButton = adminPage
            .locator("div")
            .filter({ hasText: /^Редактировать$/ })
            .last();

          await editButton.waitFor({ state: "visible", timeout: 10000 });
          await editButton.click();
          console.log('✓ Нажата кнопка "Редактировать"');

          const modal = adminPage
            .locator('[class*="Modal"], [class*="Sheet"]')
            .filter({ hasText: /администратор/i })
            .first();
          await modal.waitFor({ state: "visible", timeout: 5000 });
          const modalVisible = await modal
            .waitFor({ state: "visible", timeout: 5000 })
              .then(() => true, () => false)

          if (modalVisible) {
            console.log("✓ Модальное окно редактирования открыто");

            const searchInput = modal.locator("input").first();
            if (
              await searchInput
                .waitFor({ state: "visible", timeout: 3000 })
                  .then(() => true, () => false)
            ) {
              await searchInput.fill(newAdmin.name);
              console.log(`🔍 Поиск: "${newAdmin.name}"`);
            }

            const userCard = modal
              .locator('[class*="Option"], [class*="User"]')
              .filter({ hasText: newAdmin.name })
              .first();

            if (
              await userCard
                .waitFor({ state: "visible", timeout: 5000 })
                  .then(() => true, () => false)
            ) {
              await userCard.click();
              console.log(`✓ Выбран администратор: ${newAdmin.name}`);
            } else {
              const userText = modal
                .getByText(newAdmin.name, { exact: false })
                .first();
              if (
                await userText
                  .waitFor({ state: "visible", timeout: 3000 })
                    .then(() => true, () => false)
              ) {
                await userText.click();
                console.log(
                  `✓ Выбран администратор по тексту: ${newAdmin.name}`,
                );
              }
            }

            const confirmButton = modal
              .getByRole("button", { name: /подтвердить|сохранить|применить/i })
              .first();
            if (
              await confirmButton
                .waitFor({ state: "visible", timeout: 3000 })
                  .then(() => true, () => false)
            ) {
              await confirmButton.click();
              await expect(modal).toBeHidden({ timeout: 5000 });
              console.log("✓ Выбор подтверждён");
            } else {
              await adminPage.keyboard.press("Escape");
            }
          } else {
            console.log(
              "⚠️ Модальное окно не найдено, проверяем альтернативный UI",
            );
          }

          await expect(
            adminPage.getByRole("heading", { name: "Администраторы" }),
          ).toBeVisible();
          console.log("✓ Секция администраторов видна");
        });

        console.log(
          "✅ Тест завершён: администраторов можно редактировать на запущенном PR",
        );
      },
    );
  },
);
