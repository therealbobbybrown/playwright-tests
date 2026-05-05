// @ts-check
/**
 * UI тесты для модуля Scenarios - Draft Restrictions
 *
 * Покрытие:
 * - Невозможность добавить участника в draft сценарий
 * - Редактирование draft сценария
 *
 * @tags @ui @regression @scenarios @validation
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
  "Scenarios - Draft Restrictions",
  { tag: ["@ui", "@regression", "@scenarios", "@validation"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.SCENARIOS, "Draft Restrictions");
    });

    test(
      "C4247: Нельзя добавить участника в draft сценарий через UI",
      { tag: ["@regression"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("normal");

        const scenariosPage = new ScenariosPage(page, testInfo);

        await test.step("Перейти на страницу создания draft сценария", async () => {
          await scenariosPage.navigateToCreate();
        });

        await test.step("Проверить, что кнопки добавления участника нет", async () => {
          // Для draft сценария кнопка добавления участников не должна быть видна,
          // потому что участников можно добавлять только в активный сценарий
          await expect(
            scenariosPage.addPerformerButton,
            "Кнопка добавления участников не должна быть видна в draft сценарии",
          ).not.toBeVisible();
        });
      },
    );

    test(
      "C7295: Draft сценарий можно редактировать",
      { tag: ["@regression"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("normal");
        test.slow();

        const scenariosPage = new ScenariosPage(page, testInfo);

        await test.step("Создать draft сценарий", async () => {
          await scenariosPage.navigateToCreate();
          await scenariosPage.titleDisplay.waitFor({
            state: "visible",
            timeout: 10000,
          });
        });

        await test.step("Редактировать название через inline-edit", async () => {
          const newTitle = TestDataHelper.generateUniqueName("Modified draft");
          await scenariosPage.updateTitle(newTitle);

          // Проверяем — кликаем обратно на display, читаем input value
          await scenariosPage.titleDisplay.click();
          await scenariosPage.titleInput.waitFor({
            state: "visible",
            timeout: 3000,
          });
          const savedTitle = await scenariosPage.titleInput.inputValue();
          expect(
            savedTitle,
            "Сохранённое название должно совпадать с введённым",
          ).toBe(newTitle);
        });

        await test.step("Проверить, что кнопка добавления действия доступна", async () => {
          await expect(scenariosPage.addActionButton).toBeVisible();
        });
      },
    );
  },
);
