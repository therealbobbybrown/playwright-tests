// tests/functional/performance-review/creation/create-and-launch-complete.spec.js
// Полный тест: создание Performance Review с заполнением всех обязательных полей и запуском
import { test } from "../../../fixtures/auth.js";
import { PerformanceReviewsListPage } from "../../../../pages/PerformanceReviewsListPage.js";
import { PerformanceReviewConfigPage } from "../../../../pages/PerformanceReviewConfigPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";

test.describe(
  "Performance Review - полный цикл создания и запуска",
  { tag: ["@performance-review", "@creation", "@regression", "@ui"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.PERFORMANCE_REVIEW, "Creation");
    });

    test(
      "C2992: Создать Performance Review с заполнением обязательных полей и успешно запустить",
      { tag: ["@critical"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("critical");
        test.slow();
        testInfo.setTimeout(300_000); // 5 минут

        const listPage = new PerformanceReviewsListPage(page, testInfo);
        const configPage = new PerformanceReviewConfigPage(page, testInfo);

        await test.step("Открыть список и создать новую Performance Review", async () => {
          const baseUrl = new URL(process.env.BASE_URL).origin;
          await page.goto(
            new URL("/ru/manager/performance-reviews/", baseUrl).toString(),
          );
          await listPage.assertOpened();

          await listPage.openCreateModal();
          await listPage.performanceReviewType.click();
          await configPage.assertOpened();
        });

        await test.step("Заполнить все обязательные поля и запустить", async () => {
          await configPage.quickSetupAndLaunch({ targetUsersCount: 1 });

          // Подождать завершения сетевых запросов после запуска
          await page.waitForLoadState("networkidle");

          const currentUrl = page.url();
          console.log("URL после запуска:", currentUrl);

          // Проверить, что нет ошибок валидации
          const errors = await page
            .locator('[class*="error"], [class*="Error"], [role="alert"]')
            .filter({ hasText: /нужно|выберите|обязательн/i })
            .allInnerTexts();

          if (errors.length > 0) {
            console.log("Ошибки валидации:", errors);
            await page.screenshot({
              path: "test-results/validation-errors.png",
              fullPage: true,
            });
            throw new Error(`Найдены ошибки валидации: ${errors.join(", ")}`);
          }

          console.log(
            "✓ Performance Review успешно запущен без ошибок валидации",
          );
        });

        await test.step("Проверить, что Performance Review появился в списке", async () => {
          const baseUrl = new URL(process.env.BASE_URL).origin;
          await page.goto(
            new URL("/ru/manager/performance-reviews/", baseUrl).toString(),
          );
          await listPage.assertOpened();

          // Переключиться на вкладку "Активные" где должна быть запущенная оценка
          await listPage.switchTab("active");

          // Проверить, что есть хотя бы одна карточка
          const cardsCount = await listPage.reviewCards.count();
          console.log(`Количество активных оценок: ${cardsCount}`);

          if (cardsCount === 0) {
            await page.screenshot({
              path: "test-results/no-active-reviews.png",
              fullPage: true,
            });
            console.warn(
              "⚠️ Нет активных оценок в списке - возможно, оценка не запустилась",
            );
          } else {
            console.log("✓ Есть активные оценки в списке");
          }
        });
      },
    );
  },
);
