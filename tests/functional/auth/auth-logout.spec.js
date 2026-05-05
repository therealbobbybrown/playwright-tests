// @ts-check
/**
 * UI тесты: Logout и защита страниц
 *
 * Покрытие:
 * - Logout и редирект на страницу логина
 * - Доступ к защищённой странице без авторизации
 */
import { test as base, expect } from "@playwright/test";
import { test as authTest } from "../../fixtures/auth.js";
import { LoginPage } from "../../../pages/LoginPage.js";
import { AccountSettingsPage } from "../../../pages/AccountSettingsPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { TIMEOUTS } from "../../utils/constants.js";

// Тесты с авторизацией используют authTest
authTest.describe("Logout", { tag: ["@auth", "@regression", "@ui"] }, () => {
  authTest.beforeEach(async () => {
    markAsUITest(MODULES.AUTH);
  });

  authTest(
    "C3829: Logout редиректит на страницу логина",
    { tag: ["@high"] },
    async ({ adminAuth: page }, testInfo) => {
      setSeverity("critical");
      const accountSettings = new AccountSettingsPage(page, testInfo);

      await authTest.step("Открыть настройки аккаунта", async () => {
        await accountSettings.openFromHeader();
      });

      await authTest.step('Нажать "Выйти"', async () => {
        await accountSettings.logoutItemTitle.scrollIntoViewIfNeeded();
        await accountSettings.logoutItemTitle.click({ force: true });
      });

      await authTest.step("Проверить редирект на страницу логина", async () => {
        await expect(page).toHaveURL(/\/login/i, { timeout: TIMEOUTS.ELEMENT_VISIBLE });

        // Проверяем что форма логина видна
        const loginPage = new LoginPage(page, testInfo);
        await expect(loginPage.emailInput).toBeVisible({ timeout: TIMEOUTS.MEDIUM });
      });
    },
  );
});

// Тесты без авторизации используют base
base.describe(
  "Защита страниц",
  { tag: ["@auth", "@regression", "@ui"] },
  () => {
    base.beforeEach(async () => {
      markAsUITest(MODULES.AUTH);
    });

    base(
      "C4302: Доступ к защищённой странице без авторизации редиректит на логин",
      { tag: ["@high"] },
      async ({ page, context }, testInfo) => {
        setSeverity("critical");
        const loginPage = new LoginPage(page, testInfo);

        // Очищаем cookies чтобы быть точно не авторизованными
        await context.clearCookies();

        // Получаем базовый URL без /ru/login/
        const envUrl = process.env.BASE_URL;
        const origin = new URL(envUrl).origin;

        // Защищённые страницы для проверки
        const protectedUrls = [
          "/ru/dashboard/",
          "/ru/profile/",
          "/ru/objectives/",
        ];

        for (const protectedPath of protectedUrls) {
          await base.step(
            `Попытка доступа к ${protectedPath} без авторизации`,
            async () => {
              await page.goto(`${origin}${protectedPath}`, {
                waitUntil: "domcontentloaded",
                timeout: TIMEOUTS.LONG,
              });

              // Без авторизации должен показать 404 или редирект на логин
              const is404 = await page
                .getByText(/404|Страница не найдена/i)
                .first()
                .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
                .then(() => true)
                .catch(() => false);
              const isLogin = page.url().includes("/login");

              expect(
                is404 || isLogin,
                "Без авторизации должен показать 404 или редирект на логин",
              ).toBe(true);
            },
          );
        }
      },
    );
  },
);
