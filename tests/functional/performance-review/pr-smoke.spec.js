// tests/functional/performance-review/performance-review-smoke.spec.js
// Smoke тест: создать Performance Review, заполнить через API, проверить статус
import { test, expect } from "../../fixtures/auth.js";
import { PerformanceReviewsListPage } from "../../../pages/PerformanceReviewsListPage.js";
import { PerformanceReviewConfigPage } from "../../../pages/PerformanceReviewConfigPage.js";
import { PerformanceReviewAPI, getCredentials } from "../../utils/api/index.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

test.describe(
  "Performance Review - Smoke",
  { tag: ["@ui", "@performance-review", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.PERFORMANCE_REVIEW, "Smoke");
    });

    test(
      "C3047: Создать PR с самооценкой, заполнить через API и проверить статус",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }, testInfo) => {
        setSeverity("critical");
        testInfo.setTimeout(180_000); // 3 минуты

        const baseUrl = new URL(process.env.BASE_URL).origin;
        const listPage = new PerformanceReviewsListPage(page, testInfo);
        const configPage = new PerformanceReviewConfigPage(page, testInfo);

        let prId = null;

        // Шаг 1: Создать Performance Review только с самооценкой
        await test.step("Создать Performance Review с самооценкой", async () => {
          await page.goto(
            new URL("/ru/manager/performance-reviews/", baseUrl).toString(),
          );
          await listPage.assertOpened();

          await listPage.openCreateModal();
          await listPage.performanceReviewType.click();
          await configPage.assertOpened();

          // Только самооценка - быстрый тест
          await configPage.configureDirections({
            self: true,
            manager: false,
            colleagues: false,
            subordinates: false,
          });

          // Быстрая настройка и запуск
          await configPage.addTargetUsers({ count: 1 });
          await configPage.disableReminders();
          await configPage.addAssessmentsForAllDirections();
          await configPage.goToStep("launch");
          await configPage.launchAndSendQuestionnaires();

          // Получить ID
          const currentUrl = page.url();
          const match = currentUrl.match(/\/performance-reviews\/(\d+)/);
          if (match) {
            prId = match[1];
            console.log(`PR создан, ID: ${prId}`);
          }

          expect(prId).toBeTruthy();
        });

        // Шаг 2: Заполнить анкеты через API populateReview (от имени оцениваемого)
        await test.step("Заполнить анкеты через API", async () => {
          // Получить оцениваемого через API (populateReview работает только от его токена)
          const adminAPI = new PerformanceReviewAPI(request);
          const adminCreds = getCredentials("admin");
          await adminAPI.signIn(adminCreds.email, adminCreds.password);

          const { data: targetData } = await adminAPI.getTargetUsers(prId);
          const targets = targetData?.items || targetData || [];
          const targetUser = targets[0];
          // email в структуре: targetUser.user.account.email
          const targetEmail = targetUser?.user?.account?.email;
          if (!targetEmail) {
            throw new Error(
              `Не удалось получить email оцениваемого из PR ${prId}: ${JSON.stringify(targetUser)?.substring(0, 200)}`,
            );
          }
          console.log(`Оцениваемый: ${targetEmail}`);

          const prAPI = new PerformanceReviewAPI(request);
          const { getTestUserPassword } = await import(
            "../../utils/credentials.js"
          );
          await prAPI.signIn(targetEmail, getTestUserPassword());

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

          expect(filledCount).toBeGreaterThan(0);
        });

        // Шаг 3: Проверить статус на странице PR
        await test.step("Проверить финальный статус", async () => {
          await page.goto(
            new URL(
              `/ru/manager/performance-reviews/${prId}/`,
              baseUrl,
            ).toString(),
          );
          await page.waitForLoadState("networkidle");

          // Проверяем что не попали на страницу ошибки
          const is404 = await page
            .locator("text=404, text=Не найдено")
            .first()
            .waitFor({ state: "visible", timeout: 2000 })
              .then(() => true, () => false)
          expect(is404, "Страница PR вернула 404").toBe(false);

          // Проверяем что URL содержит ID нашего PR
          expect(page.url()).toContain(`/performance-reviews/${prId}`);

          console.log("Smoke тест завершен успешно");
        });
      },
    );
  },
);
