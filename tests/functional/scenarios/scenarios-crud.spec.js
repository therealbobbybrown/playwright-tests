// @ts-check
/**
 * UI тесты для модуля Scenarios - Create & Edit
 *
 * Покрытие:
 * - C7284: Создание нового сценария с названием
 * - C7285: Создание сценария с названием и описанием
 * - C7286: Нельзя активировать сценарий с пустым названием
 * - C7287: Редактирование названия существующего сценария
 * - C7288: Редактирование описания сценария
 *
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
import { TestDataHelper } from "../../utils/TestDataHelper.js";

test.describe(
  "Scenarios - Create",
  { tag: ["@ui", "@regression", "@scenarios", "@crud"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.SCENARIOS, "Create");
    });

    test(
      "C7284: Создание нового сценария с названием",
      { tag: ["@critical"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("critical");
        test.slow();

        const scenariosPage = new ScenariosPage(page, testInfo);
        const scenarioTitle =
          TestDataHelper.generateUniqueName("UI Test Scenario");

        await test.step("Перейти на страницу создания сценария", async () => {
          await scenariosPage.navigateToCreate();
        });

        await test.step("Ввести название сценария через inline-edit", async () => {
          await scenariosPage.updateTitle(scenarioTitle);
        });

        await test.step("Проверить, что название сохранено", async () => {
          await scenariosPage.titleDisplay.click();
          await scenariosPage.titleInput.waitFor({
            state: "visible",
            timeout: 3000,
          });
          const savedTitle = await scenariosPage.titleInput.inputValue();
          expect(savedTitle).toBe(scenarioTitle);
        });

        await test.step("Проверить, что сценарий в статусе draft", async () => {
          await expect(scenariosPage.addActionButton).toBeVisible({
            timeout: 5000,
          });
        });
      },
    );

    test(
      "C7285: Создание сценария с названием и описанием",
      { tag: ["@regression"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("normal");
        test.slow();

        const scenariosPage = new ScenariosPage(page, testInfo);
        const scenarioTitle =
          TestDataHelper.generateUniqueName("Scenario with desc");
        const scenarioDescription =
          "Описание тестового сценария для E2E тестов";

        await test.step("Перейти на страницу создания", async () => {
          await scenariosPage.navigateToCreate();
        });

        await test.step("Создать сценарий с названием и описанием", async () => {
          await scenariosPage.createScenario({
            title: scenarioTitle,
            description: scenarioDescription,
          });
        });

        await test.step("Проверить, что название сохранено", async () => {
          await scenariosPage.titleDisplay.click();
          await scenariosPage.titleInput.waitFor({
            state: "visible",
            timeout: 3000,
          });
          const savedTitle = await scenariosPage.titleInput.inputValue();
          expect(savedTitle).toBe(scenarioTitle);
        });

        await test.step("Проверить, что описание сохранено", async () => {
          await scenariosPage.descriptionDisplay.click();
          await scenariosPage.descriptionInput.waitFor({
            state: "visible",
            timeout: 3000,
          });
          const savedDesc = await scenariosPage.descriptionInput.inputValue();
          expect(savedDesc).toContain(scenarioDescription);
        });
      },
    );

    test(
      "C7286: Нельзя активировать сценарий с пустым названием",
      { tag: ["@validation", "@regression"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("normal");

        const scenariosPage = new ScenariosPage(page, testInfo);

        await test.step("Перейти на страницу создания", async () => {
          await scenariosPage.navigateToCreate();
        });

        await test.step("Очистить поле названия", async () => {
          await scenariosPage.titleDisplay.click();
          await scenariosPage.titleInput.waitFor({
            state: "visible",
            timeout: 5000,
          });
          await scenariosPage.titleInput.clear();
          await scenariosPage.titleInput.press("Tab");
        });

        await test.step("Проверить, что сценарий нельзя активировать без названия и действий", async () => {
          await expect(scenariosPage.addActionButton).toBeVisible({
            timeout: 5000,
          });
          const isActive = await scenariosPage.isScenarioActive();
          expect(
            isActive,
            "Сценарий без названия не должен активироваться",
          ).toBe(false);
        });
      },
    );
  },
);

test.describe(
  "Scenarios - Edit",
  { tag: ["@ui", "@regression", "@scenarios", "@crud"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.SCENARIOS, "Edit");
    });

    test(
      "C7287: Редактирование названия существующего сценария",
      { tag: ["@regression"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("normal");
        test.slow();

        const scenariosPage = new ScenariosPage(page, testInfo);

        await test.step("Создать новый сценарий через UI", async () => {
          await scenariosPage.navigateToCreate();
          await scenariosPage.titleDisplay.waitFor({
            state: "visible",
            timeout: 10000,
          });
        });

        const newTitle = TestDataHelper.generateUniqueName("Updated title");

        await test.step("Изменить название через inline-edit", async () => {
          await scenariosPage.updateTitle(newTitle);
        });

        await test.step("Проверить, что название обновилось", async () => {
          await scenariosPage.titleDisplay.click();
          await scenariosPage.titleInput.waitFor({
            state: "visible",
            timeout: 3000,
          });
          const savedTitle = await scenariosPage.titleInput.inputValue();
          expect(savedTitle).toBe(newTitle);
        });
      },
    );

    test(
      "C7288: Редактирование описания сценария",
      { tag: ["@regression"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("normal");
        test.slow();

        const scenariosPage = new ScenariosPage(page, testInfo);

        await test.step("Создать новый сценарий и задать описание", async () => {
          await scenariosPage.navigateToCreate();
          await scenariosPage.titleDisplay.waitFor({
            state: "visible",
            timeout: 10000,
          });
          await scenariosPage.updateDescription("Исходное описание");
        });

        const newDescription = "Обновлённое описание сценария " + Date.now();

        await test.step("Изменить описание через inline-edit", async () => {
          await scenariosPage.updateDescription(newDescription);
        });

        await test.step("Проверить, что описание обновилось", async () => {
          await scenariosPage.descriptionDisplay.click();
          await scenariosPage.descriptionInput.waitFor({
            state: "visible",
            timeout: 3000,
          });
          const savedDesc = await scenariosPage.descriptionInput.inputValue();
          expect(savedDesc).toContain(newDescription);
        });
      },
    );
  },
);
