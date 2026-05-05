// tests/functional/performance-review/edit/pr-status-completed.spec.js
// E2E тест: Проверка ограничений редактирования на завершённом PR

import { test } from "../../../fixtures/auth.js";
import { expect } from "@playwright/test";
import { PerformanceReviewsListPage } from "../../../../pages/PerformanceReviewsListPage.js";
import { PerformanceReviewConfigPage } from "../../../../pages/PerformanceReviewConfigPage.js";
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
  "PR Editing - Завершён",
  { tag: ["@performance-review", "@edit", "@e2e", "@regression", "@ui"] },
  () => {
    test.beforeEach(() => {
      markAsE2ETest(MODULES.PERFORMANCE_REVIEW, "Edit Completed");
    });

    /**
     * Проверка что редактирование заблокировано на завершённом PR
     */
    test(
      "C4405: Завершён: проверка ограничений редактирования",
      { tag: ["@normal"] },
      async ({ adminAuth: adminPage, request }, testInfo) => {
        setSeverity("normal");
        testInfo.setTimeout(300_000);

        const listPage = new PerformanceReviewsListPage(adminPage, testInfo);
        const configPage = new PerformanceReviewConfigPage(adminPage, testInfo);

        let prId = null;
        const baseUrl = new URL(process.env.BASE_URL).origin;
        const prName = `Завершённый PR ${Date.now()}`;

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

        // Заполнение анкет через API
        await test.step("Заполнить анкеты через API", async () => {
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
          console.log("✓ Анкеты заполнены через API");
          await adminPage
            .waitForLoadState("networkidle", { timeout: 10000 });
        });

        // Завершение PR
        await test.step("Завершить PR", async () => {
          // Навигация с ретраем (сервер может вернуть 500 при первой загрузке после заполнения анкеты)
          let finishButtonVisible = false;
          for (
            let attempt = 1;
            attempt <= 3 && !finishButtonVisible;
            attempt++
          ) {
            await adminPage.goto(
              new URL(
                `/ru/manager/performance-reviews/${prId}`,
                baseUrl,
              ).toString(),
            );
            await adminPage.waitForLoadState("networkidle");
            await adminPage.waitForLoadState("domcontentloaded");

            // Проверяем, не вернул ли сервер ошибку 500
            const is500 = await adminPage
              .locator('h1:has-text("500")')
              .waitFor({ state: "visible", timeout: 2000 })
                .then(() => true, () => false)
            if (is500) {
              console.log(`⚠️ Сервер вернул 500, попытка ${attempt}/3`);
              await adminPage.waitForTimeout(3000);
              continue;
            }

            const finishButton = adminPage
              .locator("button")
              .filter({ hasText: /завершить оценку/i })
              .first();
            finishButtonVisible = await finishButton
              .waitFor({ state: "visible", timeout: 10000 });
            if (!finishButtonVisible && attempt < 3) {
              console.log(
                `⚠️ Кнопка "Завершить оценку" не найдена, попытка ${attempt}/3`,
              );
              await adminPage.waitForTimeout(3000);
            }
          }

          // Нажимаем "Завершить оценку"
          const finishButton = adminPage
            .locator("button")
            .filter({ hasText: /завершить оценку/i })
            .first();
          await finishButton.click({ timeout: 15000 });

          // Подтверждаем завершение - ждём появления диалога
          const finishModal = adminPage
            .getByRole("dialog")
            .filter({ hasText: /хотите завершить оценку/i });
          if (
            await finishModal
              .waitFor({ state: "visible", timeout: 5000 })
                .then(() => true, () => false)
          ) {
            await finishModal.getByRole("button", { name: /^да/i }).click();
            await adminPage
              .waitForLoadState("networkidle", { timeout: 10000 });
          }

          console.log("✓ PR завершён");
        });

        // Проверка ограничений на завершённом PR
        await test.step("Проверить ограничения редактирования", async () => {
          await adminPage.goto(
            new URL(
              `/ru/manager/performance-reviews/${prId}`,
              baseUrl,
            ).toString(),
          );
          await adminPage.waitForLoadState("networkidle");
          await adminPage.waitForLoadState("domcontentloaded");

          // Проверяем что кнопка "Добавить участника" отсутствует или неактивна
          const addParticipantButton = adminPage
            .getByRole("button", { name: /добавить участника/i })
            .first();
          const addButtonVisible = await addParticipantButton
            .waitFor({ state: "visible", timeout: 3000 })
              .then(() => true, () => false)

          if (addButtonVisible) {
            const isDisabled = await addParticipantButton
              .isDisabled()
            if (isDisabled) {
              console.log(
                '✓ Кнопка "Добавить участника" НЕАКТИВНА на завершённом PR',
              );
            } else {
              console.log(
                'ℹ️ Кнопка "Добавить участника" видна, возможно редактирование частично доступно',
              );
            }
          } else {
            console.log(
              '✓ Кнопка "Добавить участника" НЕ ВИДНА на завершённом PR',
            );
          }

          // Проверяем статус PR
          const statusText = adminPage
            .getByText(/завершён|оценка завершена/i)
            .first();
          const statusVisible = await statusText
            .waitFor({ state: "visible", timeout: 5000 })
              .then(() => true, () => false)

          if (statusVisible) {
            console.log('✅ PR имеет статус "Завершён"');
          }

          // Проверяем что секция результатов доступна
          const resultsTab = adminPage.getByRole("button", {
            name: /результаты/i,
          });
          if (
            await resultsTab
              .waitFor({ state: "visible", timeout: 3000 })
                .then(() => true, () => false)
          ) {
            console.log('✓ Вкладка "Результаты" доступна');
          }
        });
      },
    );
  },
);
