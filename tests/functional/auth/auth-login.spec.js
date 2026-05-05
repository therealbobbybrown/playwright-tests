// tests/auth.spec.js (ESM)
import { expect } from "@playwright/test";
import { test } from "../../fixtures/auth.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

test.describe(
  "Login под разными ролями",
  { tag: ["@auth", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.AUTH);
    });

    test(
      'C3819: Администратор видит "Список дел"',
      { tag: ["@smoke", "@critical", "@ui"] },
      async ({ adminAuth, page }) => {
        setSeverity("critical");
        await test.step("Авторизоваться как администратор и открыть главную страницу", async () => {
          // adminAuth fixture handles login
        });
        await test.step('Проверить наличие заголовка "Список дел"', async () => {
          await expect(
            page.getByRole("heading", { level: 1, name: /Список дел/i }),
          ).toBeVisible({ timeout: 20_000 });
        });
      },
    );

    test(
      'C3820: Пользователь видит "Список дел"',
      { tag: ["@critical", "@ui"] },
      async ({ userAuth, page }) => {
        setSeverity("critical");
        await test.step("Авторизоваться как пользователь и открыть главную страницу", async () => {
          // userAuth fixture handles login
        });
        await test.step('Проверить наличие заголовка "Список дел"', async () => {
          await expect(
            page.getByRole("heading", { level: 1, name: /Список дел/i }),
          ).toBeVisible({ timeout: 20_000 });
        });
      },
    );

    test(
      'C3821: Руководитель видит "Список дел"',
      { tag: ["@critical", "@ui"] },
      async ({ managerAuth, page }) => {
        setSeverity("critical");
        await test.step("Авторизоваться как руководитель и открыть главную страницу", async () => {
          // managerAuth fixture handles login
        });
        await test.step('Проверить наличие заголовка "Список дел"', async () => {
          await expect(
            page.getByRole("heading", { level: 1, name: /Список дел/i }),
          ).toBeVisible({ timeout: 20_000 });
        });
      },
    );

    test(
      'C7502: Техподдержка (частичный профиль) видит "Список дел"',
      { tag: ["@ui"] },
      async ({ supportAuth, page }) => {
        setSeverity("normal");
        await test.step("Авторизоваться как техподдержка и открыть главную страницу", async () => {
          // supportAuth fixture handles login
        });
        await test.step('Проверить наличие заголовка "Список дел"', async () => {
          await expect(
            page.getByRole("heading", { level: 1, name: /Список дел/i }),
          ).toBeVisible({ timeout: 20_000 });
        });
      },
    );
  },
);
