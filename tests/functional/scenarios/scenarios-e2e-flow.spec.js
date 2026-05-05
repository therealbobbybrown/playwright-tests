// @ts-check
/**
 * UI тесты для модуля Scenarios - E2E Flow
 *
 * Покрытие:
 * - Полный цикл: создание -> добавление действия -> активация -> Dashboard
 *
 * @tags @ui @e2e @scenarios
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
  "Scenarios - E2E Flow",
  { tag: ["@ui", "@e2e", "@scenarios"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.SCENARIOS, "E2E Flow");
    });

    test(
      "C7296: Полный цикл: создание -> действие -> активация -> Dashboard",
      { tag: ["@critical", "@regression"] },
      async ({ adminAuth: page, request }, testInfo) => {
        setSeverity("critical");
        test.slow();
        testInfo.setTimeout(120000);

        const scenariosPage = new ScenariosPage(page, testInfo);

        // Получаем или создаём активный опрос
        const surveyId = await ScenarioSeedHelper.getOrCreateActiveSurveyId(request);

        // Создаём сценарий с действием через API (надёжно)
        const api = new ScenariosAPI(request);
        const { email, password } = getCredentials("admin");
        await api.signIn(email, password);

        const scenarioTitle = TestDataHelper.generateUniqueName("E2E Scenario");
        const { data: scenario } = await api.createWithActions({
          title: scenarioTitle,
          description: "E2E тест полного цикла",
          actions: [{ type: "survey", days: 1, surveyId }],
        });

        if (!scenario?.id) {
          throw new Error(
            "Failed to create scenario with actions via API for E2E test",
          );
        }

        const scenarioId = scenario.id;

        await test.step("1. Открыть сценарий в UI", async () => {
          await scenariosPage.navigateToScenario(scenarioId);
        });

        await test.step("2. Проверить, что сценарий в draft (видны действия)", async () => {
          // Draft сценарий показывает редактор с действиями
          // Если таб "Редактор" виден — переключаемся на него
          const isFormTabVisible = await scenariosPage.formTab.isVisible();
          if (isFormTabVisible) {
            await scenariosPage.formTab.click();
            await page.waitForLoadState("networkidle");
          }

          // Кнопка добавления действий должна быть видна в draft
          await expect(scenariosPage.addActionButton).toBeVisible({
            timeout: 5000,
          });
        });

        await test.step("3. Активировать сценарий через API", async () => {
          const { response } = await api.activate(scenarioId);
          expect(
            response.ok(),
            "Активация через API должна быть успешной",
          ).toBe(true);
        });

        await test.step("4. Проверить, что сценарий активирован в UI", async () => {
          await page.reload();
          await page.waitForLoadState("networkidle");

          // Dashboard с кнопкой "Добавить сотрудников" означает успешную активацию
          await expect(
            scenariosPage.dashboardTab,
            "Таб Dashboard должен появиться после активации сценария",
          ).toBeVisible({ timeout: 10000 });

          await expect(
            scenariosPage.addPerformerButton,
            "Кнопка добавления сотрудников должна быть видна на активном сценарии",
          ).toBeVisible({ timeout: 5000 });
        });
      },
    );
  },
);
