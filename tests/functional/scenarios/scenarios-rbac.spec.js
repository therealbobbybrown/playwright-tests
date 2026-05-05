// @ts-check
/**
 * UI тесты для модуля Scenarios - RBAC проверки навигации
 *
 * Покрытие:
 * - User без прав не видит кнопку создания
 * - User без прав не может открыть страницу создания
 *
 * @tags @ui @regression @scenarios @rbac
 * @module Scenarios
 */

import { test } from "../../fixtures/auth.js";
import { expect } from "@playwright/test";
import { ScenariosPage } from "../../../pages/ScenariosPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

test.describe(
  "Scenarios - RBAC Navigation",
  { tag: ["@ui", "@regression", "@scenarios", "@rbac"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.SCENARIOS, "RBAC Navigation");
    });

    test(
      "C4258: User без прав не видит кнопку создания",
      { tag: ["@critical", "@security"] },
      async ({ userAuth: page }, testInfo) => {
        setSeverity("critical");

        const scenariosPage = new ScenariosPage(page, testInfo);
        const baseUrl = process.env.BASE_URL;

        await test.step("User пытается открыть страницу сценариев", async () => {
          const url = new URL("/ru/manager/scenarios/", baseUrl).toString();
          await page.goto(url, {
            waitUntil: "domcontentloaded",
            timeout: 30000,
          });
          await page
            .waitForLoadState("networkidle", { timeout: 5000 })
            .catch(() => {});
        });

        await test.step("Проверить доступ", async () => {
          const currentUrl = page.url();

          if (currentUrl.includes("/manager/scenarios")) {
            // Если страница загрузилась - кнопка создания не должна быть видна
            const isCreateVisible = await scenariosPage.isCreateButtonVisible();
            expect(
              isCreateVisible,
              "Кнопка создания не должна быть видна для User без ManageScenario",
            ).toBe(false);
          } else {
            // Редирект — доступ ограничен, это корректное поведение
            expect(currentUrl).not.toContain("/manager/scenarios");
          }
        });
      },
    );

    test(
      "C4259: User без прав не может открыть страницу создания",
      { tag: ["@critical", "@security"] },
      async ({ userAuth: page }, testInfo) => {
        setSeverity("critical");

        const scenariosPage = new ScenariosPage(page, testInfo);
        const baseUrl = process.env.BASE_URL;

        await test.step("User пытается открыть страницу создания напрямую", async () => {
          const url = new URL("/ru/manager/scenarios/add/", baseUrl).toString();
          await page.goto(url, {
            waitUntil: "domcontentloaded",
            timeout: 30000,
          });
          await page
            .waitForLoadState("networkidle", { timeout: 5000 })
            .catch(() => {});
        });

        await test.step("Проверить, что доступ запрещён", async () => {
          const currentUrl = page.url();
          const isOnCreatePage = currentUrl.includes("/manager/scenarios/add");

          if (isOnCreatePage) {
            // Если на странице — форма создания не должна быть доступна
            const isFormVisible = await scenariosPage.titleInput.isVisible();
            expect(
              isFormVisible,
              "Форма создания не должна быть доступна для User без ManageScenario",
            ).toBe(false);
          } else {
            // Редирект — доступ запрещён, корректное поведение
            expect(currentUrl).not.toContain("/manager/scenarios/add");
          }
        });
      },
    );
  },
);
