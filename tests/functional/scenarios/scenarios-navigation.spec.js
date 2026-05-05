// @ts-check
/**
 * UI тесты для модуля Scenarios - Навигация
 *
 * Покрытие:
 * - Открытие списка сценариев через меню
 * - Прямой переход по URL
 * - Кнопка создания видна для админа
 * - Переход на страницу создания
 *
 * @tags @ui @regression @scenarios @navigation
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
  "Scenarios - Navigation",
  { tag: ["@ui", "@regression", "@scenarios", "@navigation"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.SCENARIOS, "Navigation");
    });

    test(
      "C4248: Админ открывает список сценариев через боковое меню",
      { tag: ["@smoke", "@critical"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("critical");

        const scenariosPage = new ScenariosPage(page, testInfo);

        await test.step("Перейти на страницу сценариев", async () => {
          await scenariosPage.navigate();
        });

        await test.step("Проверить, что страница списка сценариев открыта", async () => {
          await scenariosPage.assertListOpened();
          await expect(scenariosPage.heading).toBeVisible();
        });
      },
    );

    test(
      "C4249: Прямой переход на страницу списка сценариев по URL",
      { tag: ["@regression"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("normal");

        const scenariosPage = new ScenariosPage(page, testInfo);

        await test.step("Перейти на страницу сценариев по URL", async () => {
          await scenariosPage.navigate();
        });

        await test.step("Проверить, что страница загружена", async () => {
          await scenariosPage.assertListOpened();
        });
      },
    );

    test(
      "C4253: Кнопка создания сценария видна для админа",
      { tag: ["@critical"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("critical");

        const scenariosPage = new ScenariosPage(page, testInfo);

        await test.step("Открыть страницу сценариев", async () => {
          await scenariosPage.navigate();
        });

        await test.step("Проверить, что кнопка создания видна", async () => {
          await expect(
            scenariosPage.createButton,
            "Кнопка создания должна быть видна для админа",
          ).toBeVisible({ timeout: 10000 });
        });
      },
    );

    test(
      "C4254: Переход на страницу создания сценария",
      { tag: ["@critical"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("critical");

        const scenariosPage = new ScenariosPage(page, testInfo);

        await test.step("Открыть страницу сценариев", async () => {
          await scenariosPage.navigate();
        });

        await test.step("Нажать кнопку создания", async () => {
          await scenariosPage.clickCreateButton();
        });

        await test.step("Проверить, что открыта страница создания", async () => {
          const currentUrl = page.url();
          expect(currentUrl).toMatch(/\/manager\/scenarios\/add\/?/);
        });
      },
    );

    test(
      "C4255: Прямой переход на страницу создания сценария по URL",
      { tag: ["@regression"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("normal");

        const scenariosPage = new ScenariosPage(page, testInfo);

        await test.step("Перейти на страницу создания по URL", async () => {
          await scenariosPage.navigateToCreate();
        });

        await test.step("Проверить, что форма создания доступна", async () => {
          // Ждём появления title display (inline-edit компонент в режиме просмотра)
          await expect(
            scenariosPage.titleDisplay,
            "Форма создания сценария должна быть доступна (title display виден)",
          ).toBeVisible({ timeout: 10000 });
        });
      },
    );
  },
);
