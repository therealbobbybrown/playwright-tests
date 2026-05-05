// @ts-check
/**
 * UI тесты: Двухэтапная форма логина и восстановление пароля
 *
 * Покрытие:
 * - Переход email → пароль
 * - Возврат к вводу email (если есть кнопка)
 * - Ссылка "Забыли пароль?" на шаге с паролем
 * - Переход на страницу восстановления пароля
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
  "Логин: двухэтапная форма",
  { tag: ["@auth", "@regression", "@ui"] },
  () => {
    test.beforeEach(async () => {
      markAsUITest(MODULES.AUTH);
    });

    test(
      "C3814: Ввод email и переход к шагу с паролем",
      { tag: ["@medium"] },
      async ({ page }, testInfo) => {
        setSeverity("normal");
        const loginPage = new LoginPage(page, testInfo);
        const { email } = getCredentials("admin");

        await test.step("Открыть страницу логина", async () => {
          await loginPage.goto();
        });

        await test.step("Проверить что поле email видимо", async () => {
          await expect(loginPage.emailInput).toBeVisible();
          await expect(loginPage.emailSubmit).toBeVisible();
        });

        await test.step('Ввести email и нажать "Продолжить"', async () => {
          await loginPage.submitEmail(email);
        });

        await test.step("Проверить отображение шага с паролем", async () => {
          await loginPage.assertPasswordStepVisible();
        });
      },
    );

    test(
      'C3822: Возврат к вводу email через кнопку "Назад"',
      { tag: ["@low"] },
      async ({ page }, testInfo) => {
        setSeverity("minor");
        const loginPage = new LoginPage(page, testInfo);
        const { email } = getCredentials("admin");

        await test.step("Открыть страницу логина и перейти к паролю", async () => {
          await loginPage.goto();
          await loginPage.submitEmail(email);
          await loginPage.assertPasswordStepVisible();
        });

        await test.step('Нажать ссылку "Назад"', async () => {
          await loginPage.clickBack();
        });

        await test.step("Проверить возврат к полю email", async () => {
          await expect(loginPage.emailInput).toBeVisible();
          await expect(loginPage.passwordInput).not.toBeVisible();
        });
      },
    );
  },
);

test.describe(
  "Логин: восстановление пароля",
  { tag: ["@auth", "@regression", "@ui"] },
  () => {
    test.beforeEach(async () => {
      markAsUITest(MODULES.AUTH);
    });

    test(
      'C3823: Ссылка "Забыли пароль?" видна на шаге с паролем',
      { tag: ["@medium"] },
      async ({ page }, testInfo) => {
        setSeverity("normal");
        const loginPage = new LoginPage(page, testInfo);
        const { email } = getCredentials("admin");

        await test.step("Открыть страницу логина", async () => {
          await loginPage.goto();
        });

        await test.step("Перейти к шагу с паролем", async () => {
          await loginPage.submitEmail(email);
          await loginPage.assertPasswordStepVisible();
        });

        await test.step('Проверить наличие ссылки "Забыли пароль?"', async () => {
          await expect(loginPage.forgotPasswordLink).toBeVisible();
        });
      },
    );

    test(
      'C3824: Клик по "Забыли пароль?" ведёт на страницу восстановления',
      { tag: ["@medium"] },
      async ({ page }, testInfo) => {
        setSeverity("normal");
        const loginPage = new LoginPage(page, testInfo);
        const { email } = getCredentials("admin");

        await test.step("Открыть страницу логина и перейти к паролю", async () => {
          await loginPage.goto();
          await loginPage.submitEmail(email);
          await loginPage.assertPasswordStepVisible();
        });

        await test.step('Нажать "Забыли пароль?"', async () => {
          await loginPage.clickForgotPassword();
        });

        await test.step("Проверить отображение формы восстановления", async () => {
          await loginPage.assertPasswordRecoveryVisible();
        });
      },
    );
  },
);
