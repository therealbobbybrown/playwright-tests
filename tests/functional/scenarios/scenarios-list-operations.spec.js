// @ts-check
/**
 * UI тесты для модуля Scenarios - Операции со списком
 *
 * Покрытие:
 * - Открытие существующего сценария из списка
 * - Пустое состояние списка
 *
 * @tags @ui @regression @scenarios @list
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
  "Scenarios - List Operations",
  { tag: ["@ui", "@regression", "@scenarios", "@list"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.SCENARIOS, "List Operations");
    });

    test(
      "C4256: Открытие существующего сценария из списка",
      { tag: ["@regression"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("normal");

        const scenariosPage = new ScenariosPage(page, testInfo);

        await test.step("Открыть страницу сценариев", async () => {
          await scenariosPage.navigate();
        });

        let count = 0;
        await test.step("Проверить наличие сценариев", async () => {
          count = await scenariosPage.getScenariosCount();
          expect(
            count,
            "В списке должен быть хотя бы один сценарий для открытия. Создайте сценарий через seed или UI.",
          ).toBeGreaterThan(0);
        });

        await test.step("Открыть первый сценарий из списка", async () => {
          await scenariosPage.openFirstScenario();
        });

        await test.step("Проверить, что страница сценария открыта", async () => {
          const currentUrl = page.url();
          expect(currentUrl).toMatch(/\/manager\/scenarios\/\d+/);
        });
      },
    );

    test(
      "C4257: Состояние списка сценариев отображается корректно",
      { tag: ["@regression"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("minor");

        const scenariosPage = new ScenariosPage(page, testInfo);

        await test.step("Открыть страницу сценариев", async () => {
          await scenariosPage.navigate();
        });

        await test.step("Проверить состояние списка: карточки сценариев видны", async () => {
          // Список должен содержать хотя бы один сценарий (данные созданы seed'ом)
          const count = await scenariosPage.getScenariosCount();
          expect(
            count,
            "Список сценариев не должен быть пустым. Создайте данные через seed.",
          ).toBeGreaterThan(0);
          // Первая карточка сценария должна быть видна
          const firstCard = scenariosPage.scenarioCards.first();
          await expect(
            firstCard,
            "Первая карточка сценария должна быть видна",
          ).toBeVisible();
        });
      },
    );
  },
);
