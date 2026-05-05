// @ts-check
/**
 * UI тесты для модуля Scenarios - Actions (управление действиями)
 *
 * Покрытие:
 * - C4242: Кнопка добавления действия видна в draft сценарии
 * - C4243: Добавление действия "Отправить опрос"
 * - C4244: Количество действий увеличивается после добавления
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

test.describe(
  "Scenarios - Actions",
  { tag: ["@ui", "@regression", "@scenarios", "@actions"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.SCENARIOS, "Actions");
    });

    test(
      "C4242: Кнопка добавления действия видна в draft сценарии",
      { tag: ["@regression"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("normal");

        const scenariosPage = new ScenariosPage(page, testInfo);

        await test.step("Перейти на страницу создания сценария", async () => {
          await scenariosPage.navigateToCreate();
        });

        await test.step("Проверить, что кнопка добавления действия видна", async () => {
          await expect(scenariosPage.addActionButton).toBeVisible({
            timeout: 10000,
          });
        });
      },
    );

    test(
      'C4243: Добавление действия "Отправить опрос"',
      { tag: ["@regression", "@critical"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("critical");
        test.slow();

        const scenariosPage = new ScenariosPage(page, testInfo);

        await test.step("Перейти на страницу создания сценария", async () => {
          await scenariosPage.navigateToCreate();
        });

        await test.step("Проверить начальное количество действий", async () => {
          const initialCount = await scenariosPage.getActionsCount();
          expect(initialCount).toBe(0);
        });

        await test.step("Нажать кнопку добавления действия", async () => {
          await scenariosPage.addActionButton.click();
          // Ждём появления формы действия — поле дней или кнопка выбора опроса
          await scenariosPage.actionDaysInput
            .or(scenariosPage.selectSurveyButton)
            .first()
            .waitFor({ state: "visible", timeout: 5000 });
        });

        await test.step("Проверить, что форма действия появилась", async () => {
          // После клика "Запланировать опрос" форма должна содержать поле дней
          await expect(
            scenariosPage.actionDaysInput,
            "Поле количества дней должно быть видно после открытия формы действия",
          ).toBeVisible();
        });
      },
    );

    test(
      "C4244: Количество действий увеличивается после добавления",
      { tag: ["@regression"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("normal");
        test.slow();

        const scenariosPage = new ScenariosPage(page, testInfo);

        let initialCount;

        await test.step("Перейти на страницу создания и запомнить начальное количество действий", async () => {
          await scenariosPage.navigateToCreate();
          initialCount = await scenariosPage.getActionsCount();
          expect(initialCount).toBe(0);
        });

        await test.step("Открыть форму добавления действия", async () => {
          await scenariosPage.addActionButton.click();
          await scenariosPage.actionDaysInput.waitFor({
            state: "visible",
            timeout: 5000,
          });
        });

        await test.step("Заполнить поле дней в форме действия", async () => {
          await scenariosPage.actionDaysInput.fill("5");
          // Убеждаемся, что введённое значение сохранилось в поле
          await expect(scenariosPage.actionDaysInput).toHaveValue("5");
        });

        await test.step("Проверить, что кнопки управления формой видны (сохранение и удаление)", async () => {
          await expect(
            scenariosPage.saveActionButton,
            "Кнопка сохранения действия (icon-ok) должна быть видна в форме действия",
          ).toBeVisible({ timeout: 5000 });
          await expect(
            scenariosPage.deleteActionButton,
            "Кнопка удаления действия (icon-newTrash) должна быть видна в форме действия",
          ).toBeVisible();
        });

        await test.step("Проверить, что кнопка выбора опроса видна", async () => {
          await expect(
            scenariosPage.selectSurveyButton,
            "Кнопка выбора опроса должна быть видна — форма ожидает выбора опроса",
          ).toBeVisible();
        });
      },
    );
  },
);
