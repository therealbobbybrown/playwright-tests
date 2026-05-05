import { test, expect } from "../../../fixtures/auth.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";

test.describe(
  "Review Admin — Доступ к настройкам assigned PR",
  { tag: ["@ui", "@my-team", "@regression", "@review-admin"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.MY_TEAM, "Review Admin PR Settings Access");
    });

    test(
      "C8070: Review admin может открыть страницу настроек assigned PR",
      { tag: ["@critical"] },
      async ({ reviewAdminAuth: page }) => {
        setSeverity("critical");

        const setup = page._reviewAdminSetup;

        expect(setup, "reviewAdminSetup должен быть доступен").toBeTruthy();
        expect(setup.prId, "prId должен быть в setup").toBeTruthy();

        const prId = setup.prId;

        await test.step(
          "Перейти на страницу настроек assigned PR",
          async () => {
            const origin = new URL(page.url()).origin;
            await page.goto(
              `${origin}/ru/performance-reviews/${prId}/`,
            );
            await page.waitForLoadState("domcontentloaded");
          },
        );

        await test.step(
          "Проверить, что страница загрузилась без ошибки 403",
          async () => {
            // Убеждаемся, что не редиректнуло на страницу ошибки или логин
            const url = page.url();
            expect(url).toContain(`/performance-reviews/${prId}`);

            // Проверяем отсутствие текста ошибки доступа
            const errorText = page.locator(
              'text=/403|Доступ запрещён|Access denied|Forbidden/i',
            );
            await expect(errorText).not.toBeVisible({ timeout: 5000 });
          },
        );

        await test.step(
          "Проверить, что видны элементы страницы PR",
          async () => {
            // На странице PR должен быть заголовок или карточка с информацией
            const prPageContent = page.locator(
              '[class*="PerformanceReview"], [class*="performance-review"]',
            );
            const heading = page
              .getByRole("heading")
              .first();

            // Хотя бы один из элементов должен быть виден
            const hasContent =
              await prPageContent
                .first()
                .waitFor({ state: "visible", timeout: 5000 })
                .then(() => true)
                .catch(() => false) ||
              await heading
                .waitFor({ state: "visible", timeout: 5000 })
                .then(() => true)
                .catch(() => false);

            expect(
              hasContent,
              "Страница PR должна содержать контент (не пустая и не ошибка)",
            ).toBeTruthy();

            console.log(
              `[AT-59/64] Страница PR ${prId} успешно загружена для review_admin`,
            );
          },
        );
      },
    );
  },
);
