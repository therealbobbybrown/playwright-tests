// @ts-check
/**
 * UI тест: Вход через SSO (Auth0 / OpenID Connect)
 *
 * Покрытие:
 * - Клик "Войти через SSO" → экран ввода SSO email
 * - Ввод SSO email → редирект на Auth0
 * - Ввод пароля на Auth0 → редирект обратно в приложение
 * - Пользователь видит "Список дел"
 */
import { test as base, expect } from "@playwright/test";
import { LoginPage } from "../../../pages/LoginPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { getCredentials } from "../../utils/credentials.js";

const test = base;

test.describe(
  "Логин: SSO через Auth0",
  { tag: ["@auth", "@regression", "@ui"] },
  () => {
    test.beforeEach(async () => {
      markAsUITest(MODULES.AUTH);
    });

    test(
      "C7503: Вход через SSO с корректными учётными данными",
      { tag: ["@smoke", "@critical"] },
      async ({ page }, testInfo) => {
        setSeverity("critical");
        const loginPage = new LoginPage(page, testInfo);
        const { email, password } = getCredentials("sso");

        await test.step("Открыть страницу логина", async () => {
          await loginPage.goto();
        });

        await test.step('Нажать "Войти через SSO"', async () => {
          await loginPage.clickSSO();
        });

        await test.step("Проверить отображение SSO-экрана (ввод корпоративного email)", async () => {
          await loginPage.assertSSOScreenVisible();
        });

        await test.step("Ввести SSO email и дождаться редиректа на Auth0", async () => {
          await loginPage.submitEmail(email);
          await page.waitForURL(/auth0\.com/, { timeout: 15_000 });
        });

        await test.step("Пройти аутентификацию на Auth0", async () => {
          // Auth0 Universal Login: email может быть предзаполнен через login_hint.
          // Если видно поле email — нажать Continue (exact), чтобы перейти к паролю.
          // Используем exact:true т.к. на странице также есть "Continue with Google".
          const emailField = page.getByLabel("Email address");
          const continueBtn = page.getByRole("button", {
            name: "Continue",
            exact: true,
          });

          const hasEmailStep = await emailField
            .waitFor({ state: "visible", timeout: 5_000 })
            .then(() => true)
            .catch(() => false);

          if (hasEmailStep) {
            await continueBtn.click();
          }

          // Ввести пароль (используем #password т.к. getByLabel('Password') неоднозначен —
          // на странице Auth0 есть ещё кнопка-переключатель "Show password")
          const passwordField = page.locator("#password");
          await passwordField.waitFor({ state: "visible", timeout: 10_000 });
          await passwordField.fill(password);
          await continueBtn.click();
        });

        await test.step("Проверить успешный вход и наличие заголовка «Список дел»", async () => {
          // Ждём возврата в приложение (через callback → редирект на главную)
          await page.waitForURL(
            /\/(ru\/)?(todos|profile|dashboard|objectives|surveys|feedback|$)/,
            { timeout: 30_000 },
          );
          await expect(
            page.getByRole("heading", { level: 1, name: /Список дел/i }),
          ).toBeVisible({ timeout: 20_000 });
        });
      },
    );
  },
);
