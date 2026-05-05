// tests/objectives-settings.spec.js
import { expect } from "@playwright/test";
import { test } from "../../fixtures/auth.js";
import { SideMenu } from "../../../pages/SideMenu.js";
import { ObjectivesSettingsPage } from "../../../pages/ObjectivesSettingsPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

test.describe("Настройки целей", { tag: ["@ui", "@regression"] }, () => {
  test.beforeEach(() => {
    markAsUITest(MODULES.OBJECTIVES);
  });

  test('C4016: Переключатель OKR корректно влияет на пункты меню "Цели"', async ({
    adminAuth,
    page,
  }, testInfo) => {
    setSeverity("normal");
    const sideMenu = new SideMenu(page, testInfo);
    const objectivesSettingsPage = new ObjectivesSettingsPage(page, testInfo);

    await test.step('Открыть страницу "Настройки целей"', async () => {
      await sideMenu.openObjectivesSettings();
      await objectivesSettingsPage.assertOpened();
    });

    // Запоминаем начальное состояние, чтобы в конце вернуть его
    const initialState = await objectivesSettingsPage.getOkrState();

    // 1. Приводим к состоянию "выключено" и проверяем меню
    await test.step('Привести OKR в состояние "выключено" и проверить меню', async () => {
      let state = await objectivesSettingsPage.getOkrState();
      if (state === "enabled") {
        await objectivesSettingsPage.clickDisable();
        await objectivesSettingsPage.waitForDisabled();
        state = await objectivesSettingsPage.getOkrState();
      }
      await expect
        .poll(() => objectivesSettingsPage.getOkrState())
        .toBe("disabled");
      await sideMenu.assertObjectivesMenuHasOnlySettings();
    });

    // 2. Приводим к состоянию "включено" и проверяем меню
    await test.step('Привести OKR в состояние "включено" и проверить меню', async () => {
      let state = await objectivesSettingsPage.getOkrState();
      if (state === "disabled") {
        await objectivesSettingsPage.clickEnable();
        await objectivesSettingsPage.waitForEnabled();
        state = await objectivesSettingsPage.getOkrState();
      }
      await expect
        .poll(() => objectivesSettingsPage.getOkrState())
        .toBe("enabled");
      await sideMenu.assertObjectivesMenuHasFullSet();
    });

    // 3. Восстановить исходное состояние (чтобы не оставлять систему в другом режиме)
    await test.step("Вернуть OKR в исходное состояние", async () => {
      const current = await objectivesSettingsPage.getOkrState();
      if (current === initialState) return;

      if (initialState === "enabled") {
        await objectivesSettingsPage.clickEnable();
        await objectivesSettingsPage.waitForEnabled();
      } else {
        await objectivesSettingsPage.clickDisable();
        await objectivesSettingsPage.waitForDisabled();
      }
    });
  });
});
