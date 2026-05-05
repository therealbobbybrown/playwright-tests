// @ts-check
/**
 * UI тесты для модуля Scenarios - Переключение табов
 *
 * Покрытие:
 * - Переключение между табами "Все сценарии" и "Мои сценарии"
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
  "Scenarios - Tabs",
  { tag: ["@ui", "@regression", "@scenarios", "@navigation"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.SCENARIOS, "Tabs");
    });

    test(
      'C7297: Переключение на таб "Мои сценарии"',
      { tag: ["@regression"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("normal");

        const scenariosPage = new ScenariosPage(page, testInfo);

        await test.step("Открыть страницу сценариев", async () => {
          await scenariosPage.navigate();
        });

        await test.step('Проверить наличие табов "Все сценарии" и "Мои сценарии"', async () => {
          await expect(
            scenariosPage.allScenariosTab,
            'Таб "Все сценарии" должен быть виден',
          ).toBeVisible({ timeout: 5000 });
          await expect(
            scenariosPage.myScenariosTab,
            'Таб "Мои сценарии" должен быть виден',
          ).toBeVisible({ timeout: 5000 });
        });

        await test.step('Переключиться на "Мои сценарии"', async () => {
          await scenariosPage.myScenariosTab.click();
          await page.waitForURL(/own=true/, { timeout: 5000 });
        });

        await test.step("Проверить, что URL обновился с own=true", async () => {
          expect(page.url()).toContain("own=true");
        });

        await test.step('Переключиться обратно на "Все сценарии"', async () => {
          await scenariosPage.allScenariosTab.click();
          await page
            .waitForLoadState("networkidle", { timeout: 5000 })
            .catch(() => {});

          const url = page.url();
          expect(
            url.includes("own=true"),
            'После переключения на "Все сценарии" own=true не должен быть в URL',
          ).toBe(false);
        });
      },
    );
  },
);
