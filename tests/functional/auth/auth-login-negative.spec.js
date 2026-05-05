// @ts-check
/**
 * UI тесты: Негативные сценарии логина
 *
 * Покрытие:
 * - Несуществующий email
 * - Неверный пароль
 * - Пустой email
 * - Невалидный формат email
 */
import { test as base, expect } from "@playwright/test";
import { LoginPage } from "../../../pages/LoginPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { getCredentials } from "../../utils/credentials.js";
import { TIMEOUTS } from "../../utils/constants.js";

const test = base;

test.describe(
  "Логин: негативные сценарии",
  { tag: ["@auth", "@negative", "@ui", "@regression"] },
  () => {
    test.beforeEach(async () => {
      markAsUITest(MODULES.AUTH);
    });

    test(
      "C3815: Несуществующий email показывает ошибку",
      { tag: ["@high"] },
      async ({ page }, testInfo) => {
        setSeverity("critical");
        const loginPage = new LoginPage(page, testInfo);
        const fakeEmail = `nonexistent_${Date.now()}@test.com`;

        await test.step("Открыть страницу логина", async () => {
          await loginPage.goto();
        });

        await test.step('Ввести несуществующий email и нажать "Продолжить"', async () => {
          await loginPage.submitEmail(fakeEmail);
        });

        await test.step("Проверить отображение ошибки", async () => {
          await loginPage.assertErrorVisible();
          await loginPage.assertStillOnLoginPage();
        });
      },
    );

    test(
      "C3816: Неверный пароль показывает ошибку",
      { tag: ["@high"] },
      async ({ page }, testInfo) => {
        setSeverity("critical");
        const loginPage = new LoginPage(page, testInfo);
        const { email } = getCredentials("admin");
        const wrongPassword = "wrong_password_12345";

        await test.step("Открыть страницу логина", async () => {
          await loginPage.goto();
        });

        await test.step("Ввести email и перейти к паролю", async () => {
          await loginPage.submitEmail(email);
          await loginPage.assertPasswordStepVisible();
        });

        await test.step("Ввести неверный пароль и отправить", async () => {
          await loginPage.passwordInput.fill(wrongPassword);
          await loginPage.passwordSubmit.click();
        });

        await test.step("Проверить отображение ошибки", async () => {
          await loginPage.assertErrorVisible();
          await loginPage.assertStillOnLoginPage();
        });
      },
    );

    test(
      "C3817: Пустой email не проходит валидацию",
      { tag: ["@medium"] },
      async ({ page }, testInfo) => {
        setSeverity("normal");
        const loginPage = new LoginPage(page, testInfo);

        await test.step("Открыть страницу логина", async () => {
          await loginPage.goto();
        });

        await test.step('Нажать "Продолжить" без ввода email', async () => {
          await loginPage.emailSubmit.click();
        });

        await test.step("Проверить что остались на странице логина", async () => {
          // Либо кнопка disabled, либо показывается ошибка валидации
          await expect(loginPage.emailInput, "Поле email должно быть видимым").toBeVisible();
          await loginPage.assertStillOnLoginPage();
        });
      },
    );

    test(
      "C3818: Невалидный формат email не проходит валидацию",
      { tag: ["@medium"] },
      async ({ page }, testInfo) => {
        setSeverity("normal");
        const loginPage = new LoginPage(page, testInfo);
        const invalidEmail = "not-an-email";

        await test.step("Открыть страницу логина", async () => {
          await loginPage.goto();
        });

        await test.step('Ввести невалидный email и нажать "Продолжить"', async () => {
          await loginPage.submitEmail(invalidEmail);
        });

        await test.step("Проверить что не перешли к паролю", async () => {
          // Должна быть ошибка валидации или остаёмся на шаге email
          const passwordVisible = await loginPage.passwordInput
            .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
            .then(() => true)
            .catch(() => false);
          expect(
            passwordVisible,
            "Не должны перейти к паролю с невалидным email",
          ).toBe(false);
          await loginPage.assertStillOnLoginPage();
        });
      },
    );
  },
);
