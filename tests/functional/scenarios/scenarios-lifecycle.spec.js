// @ts-check
/**
 * UI тесты для модуля Scenarios - Activation (lifecycle states)
 *
 * Покрытие:
 * - Кнопка активации для draft сценария
 * - Невозможность активации без действий
 * - Dashboard для активированного сценария
 * - Исчезновение кнопки активации после запуска
 *
 * @tags @ui @regression @scenarios @lifecycle
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
  "Scenarios - Activation",
  { tag: ["@ui", "@regression", "@scenarios", "@lifecycle"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.SCENARIOS, "Lifecycle - Activation");
    });

    test(
      "C4245: Кнопка активации видна для draft сценария",
      { tag: ["@regression"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("normal");

        const scenariosPage = new ScenariosPage(page, testInfo);

        await test.step("Перейти на страницу создания сценария", async () => {
          await scenariosPage.navigateToCreate();
        });

        await test.step("Проверить, что кнопка активации видна", async () => {
          await expect(scenariosPage.activateButton).toBeVisible({
            timeout: 10000,
          });
        });

        await test.step("Проверить, что сценарий в статусе draft", async () => {
          const isActive = await scenariosPage.isScenarioActive();
          expect(isActive, "Новый сценарий должен быть в статусе draft").toBe(
            false,
          );
        });
      },
    );

    test(
      "C4246: Нельзя активировать сценарий без действий",
      { tag: ["@validation", "@critical"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("critical");

        const scenariosPage = new ScenariosPage(page, testInfo);

        await test.step("Перейти на страницу создания сценария без действий", async () => {
          await scenariosPage.navigateToCreate();
        });

        await test.step("Попытаться активировать", async () => {
          await expect(scenariosPage.activateButton).toBeVisible();
          await scenariosPage.activateButton.click();
          await page
            .waitForLoadState("networkidle", { timeout: 5000 })
            .catch(() => {});
        });

        await test.step("Проверить, что сценарий НЕ активировался", async () => {
          // Сценарий должен остаться в draft — кнопка активации всё ещё видна
          await expect(
            scenariosPage.activateButton,
            "Кнопка активации должна остаться видимой — сценарий без действий не активируется",
          ).toBeVisible({ timeout: 5000 });

          // Дополнительно: нет действий
          const actionsCount = await scenariosPage.getActionsCount();
          expect(actionsCount, "Сценарий не должен содержать действий").toBe(0);
        });
      },
    );

    test(
      "C7290: Активированный сценарий отображает Dashboard с участниками",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }, testInfo) => {
        setSeverity("critical");
        test.slow();

        const scenariosPage = new ScenariosPage(page, testInfo);

        // Получаем или создаём активный опрос
        const surveyId = await ScenarioSeedHelper.getOrCreateActiveSurveyId(request);

        // Создаём и активируем сценарий через API
        const api = new ScenariosAPI(request);
        const { email, password } = getCredentials("admin");
        await api.signIn(email, password);

        const scenarioTitle =
          TestDataHelper.generateUniqueName("Activated scenario");
        const { data: scenario } = await api.createAndActivate({
          title: scenarioTitle,
          actions: [{ type: "survey", days: 1, surveyId }],
        });

        if (!scenario?.id) {
          throw new Error(
            "Failed to create and activate scenario via API — check ScenariosAPI.createAndActivate",
          );
        }

        await test.step("Открыть активированный сценарий в UI", async () => {
          await scenariosPage.navigateToScenario(scenario.id);
        });

        await test.step("Проверить, что отображается Dashboard", async () => {
          await expect(scenariosPage.dashboardTab).toBeVisible({
            timeout: 10000,
          });
        });

        await test.step("Проверить наличие кнопки добавления сотрудников", async () => {
          await expect(scenariosPage.addPerformerButton).toBeVisible({
            timeout: 5000,
          });
        });

        await test.step('Проверить, что таб "Редактор" тоже доступен', async () => {
          await expect(scenariosPage.formTab).toBeVisible({ timeout: 5000 });
        });
      },
    );

    test(
      "C7291: После активации кнопка запуска исчезает",
      { tag: ["@regression"] },
      async ({ adminAuth: page, request }, testInfo) => {
        setSeverity("normal");

        const scenariosPage = new ScenariosPage(page, testInfo);

        // Создаём активный сценарий через API, чтобы не зависеть от данных
        const surveyId = await ScenarioSeedHelper.getOrCreateActiveSurveyId(request);

        const api = new ScenariosAPI(request);
        const { email, password } = getCredentials("admin");
        await api.signIn(email, password);

        const { data: scenario } = await api.createAndActivate({
          title: TestDataHelper.generateUniqueName("Active no-activate-btn"),
          actions: [{ type: "survey", days: 1, surveyId }],
        });

        if (!scenario?.id) {
          throw new Error("Failed to create active scenario via API for C7291");
        }

        await test.step("Открыть активный сценарий", async () => {
          await scenariosPage.navigateToScenario(scenario.id);
        });

        await test.step("Проверить, что кнопка активации НЕ видна", async () => {
          await expect(
            scenariosPage.activateButton,
            "Кнопка активации не должна быть видна для активного сценария",
          ).not.toBeVisible();
        });

        await test.step('Проверить наличие таба "Панель управления"', async () => {
          await expect(scenariosPage.dashboardTab).toBeVisible({
            timeout: 5000,
          });
        });
      },
    );
  },
);
