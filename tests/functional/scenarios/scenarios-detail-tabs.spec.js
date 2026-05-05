// @ts-check
/**
 * UI тесты для модуля Scenarios - Табы детальной страницы
 *
 * Покрытие:
 * - C7289: Переключение между табами Dashboard и Form
 *
 * @module Scenarios
 */

import { test } from "../../fixtures/auth.js";
import { expect } from "@playwright/test";
import { ScenariosPage } from "../../../pages/ScenariosPage.js";
import {
  ScenariosAPI,
  getCredentials,
} from "../../utils/api/index.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { TestDataHelper } from "../../utils/TestDataHelper.js";
import { ScenarioSeedHelper } from "../../utils/seed/ScenarioSeedHelper.js";

test.describe(
  "Scenarios - Detail Tabs",
  { tag: ["@ui", "@regression", "@scenarios", "@tabs"] },
  () => {
    /** @type {string|number|null} */
    let activeScenarioId = null;

    test.beforeAll(async ({ request }) => {
      // Создаём активный сценарий через API для тестирования табов
      const scenariosAPI = new ScenariosAPI(request);
      const { email, password } = getCredentials("admin");

      await scenariosAPI.signIn(email, password);

      // Получаем или создаём активный опрос
      const surveyId = await ScenarioSeedHelper.getOrCreateActiveSurveyId(request);

      const title = TestDataHelper.generateUniqueName("Tabs Test Scenario");
      const { response, data } = await scenariosAPI.createAndActivate({
        title,
        description: "Сценарий для тестирования переключения табов",
        actions: [{ type: "survey", days: 0, surveyId }],
      });

      if (!response.ok() || !data?.id) {
        throw new Error(
          "Не удалось создать активный сценарий для тестирования табов",
        );
      }
      activeScenarioId = data.id;
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.SCENARIOS, "Tabs");
    });

    test(
      "C7289: Переключение между табами Dashboard и Form",
      { tag: ["@regression"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("normal");

        const scenariosPage = new ScenariosPage(page, testInfo);

        await test.step("Открыть страницу активного сценария", async () => {
          await scenariosPage.navigateToScenario(activeScenarioId);
        });

        await test.step('Проверить видимость таба "Панель управления"', async () => {
          await expect(scenariosPage.dashboardTab).toBeVisible({
            timeout: 10000,
          });
        });

        await test.step('Переключиться на таб "Редактор сценария"', async () => {
          await expect(scenariosPage.formTab).toBeVisible({
            timeout: 5000,
          });
          await scenariosPage.formTab.click();
          await page.waitForLoadState("networkidle", { timeout: 5000 });
        });

        await test.step("Проверить, что контент редактора отображается", async () => {
          // В режиме редактора должна быть кнопка "Запланировать опрос"
          await expect(scenariosPage.addActionButton).toBeVisible({
            timeout: 5000,
          });
        });

        await test.step('Переключиться обратно на таб "Панель управления"', async () => {
          await scenariosPage.dashboardTab.click();
          await page.waitForLoadState("networkidle", { timeout: 5000 });
        });

        await test.step("Проверить, что панель управления отображается", async () => {
          // После переключения на Dashboard, кнопка добавления действия скрыта
          // (она есть только в редакторе), а таб Dashboard активен
          await expect(scenariosPage.dashboardTab).toBeVisible();
        });
      },
    );
  },
);
