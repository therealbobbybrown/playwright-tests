// @ts-check
/**
 * UI тесты: Альтернативные методы входа и ссылки
 *
 * Покрытие:
 * - Кнопка "Войти через Google"
 * - Ссылка "Войти через SSO"
 * - Ссылка "Политика конфиденциальности"
 * - Ссылка "Условия обслуживания"
 */
import { test as base, expect } from "@playwright/test";
import { LoginPage } from "../../../pages/LoginPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

const test = base;

test.describe(
  "Логин: альтернативные методы входа",
  { tag: ["@auth", "@regression", "@ui"] },
  () => {
    test.beforeEach(async () => {
      markAsUITest(MODULES.AUTH);
    });

    test(
      'C3825: Кнопка "Войти через Google" видна и кликабельна',
      { tag: ["@medium"] },
      async ({ page }, testInfo) => {
        setSeverity("normal");
        const loginPage = new LoginPage(page, testInfo);

        await test.step("Открыть страницу логина", async () => {
          await loginPage.goto();
        });

        await test.step("Проверить наличие кнопки Google", async () => {
          await expect(loginPage.googleAuthButton).toBeVisible();
          await expect(loginPage.googleAuthButton).toBeEnabled();
        });

        await test.step("Нажать кнопку Google и проверить редирект", async () => {
          // Ждём либо новое окно/popup, либо редирект на accounts.google.com
          const [popup] = await Promise.all([
            page.waitForEvent("popup", { timeout: 5000 }).catch(() => null),
            loginPage.clickGoogleAuth(),
          ]);

          if (popup) {
            // Открылся popup — проверяем URL
            await popup.waitForLoadState("domcontentloaded");
            expect(popup.url()).toContain("google.com");
            await popup.close();
          } else {
            // Редирект в том же окне
            await page.waitForURL(/google\.com|accounts\.google/, {
              timeout: 10000,
            });
          }
        });
      },
    );

    test(
      'C3826: Ссылка "Войти через SSO" видна и кликабельна',
      { tag: ["@medium"] },
      async ({ page }, testInfo) => {
        setSeverity("normal");
        const loginPage = new LoginPage(page, testInfo);

        await test.step("Открыть страницу логина", async () => {
          await loginPage.goto();
        });

        await test.step("Проверить наличие ссылки SSO", async () => {
          await expect(loginPage.ssoLink).toBeVisible();
        });

        await test.step("Нажать ссылку SSO и проверить переход на форму SSO", async () => {
          await loginPage.clickSSO();
          await loginPage.assertSSOFormVisible();
        });
      },
    );
  },
);

test.describe(
  "Логин: ссылки на политики",
  { tag: ["@auth", "@regression", "@ui"] },
  () => {
    test.beforeEach(async () => {
      markAsUITest(MODULES.AUTH);
    });

    test(
      'C3827: Ссылка "Политика конфиденциальности" ведёт на нужную страницу',
      { tag: ["@low"] },
      async ({ page }, testInfo) => {
        setSeverity("minor");
        const loginPage = new LoginPage(page, testInfo);

        await test.step("Открыть страницу логина", async () => {
          await loginPage.goto();
        });

        await test.step("Проверить наличие ссылки", async () => {
          await expect(loginPage.privacyPolicyLink).toBeVisible();
        });

        await test.step("Проверить href ссылки", async () => {
          const href = await loginPage.privacyPolicyLink.getAttribute("href");
          expect(href).toContain("policies");
          expect(href).toMatch(/personal-data|privacy|конфиденциальности/i);
        });
      },
    );

    test(
      'C3828: Ссылка "Условия обслуживания" ведёт на нужную страницу',
      { tag: ["@low"] },
      async ({ page }, testInfo) => {
        setSeverity("minor");
        const loginPage = new LoginPage(page, testInfo);

        await test.step("Открыть страницу логина", async () => {
          await loginPage.goto();
        });

        await test.step("Проверить наличие ссылки", async () => {
          await expect(loginPage.termsLink).toBeVisible();
        });

        await test.step("Проверить href ссылки", async () => {
          const href = await loginPage.termsLink.getAttribute("href");
          expect(href).toContain("policies");
          expect(href).toMatch(/terms|условия|обслуживания/i);
        });
      },
    );
  },
);
