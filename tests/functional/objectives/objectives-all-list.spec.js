// tests/objectives-all.spec.js
import { test } from "../../fixtures/auth.js";
import { SideMenu } from "../../../pages/SideMenu.js";
import { ObjectivesSettingsPage } from "../../../pages/ObjectivesSettingsPage.js";
import { ObjectivesAllPage } from "../../../pages/ObjectivesAllPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

test.describe('Страница "Все цели"', { tag: ["@ui", "@regression"] }, () => {
  test.beforeEach(() => {
    markAsUITest(MODULES.OBJECTIVES);
  });

  test(
    'C4007: Админ переходит на "Все цели" (при необходимости включает OKR)',
    { tag: ["@smoke"] },
    async ({ adminAuth, page }, testInfo) => {
      setSeverity("critical");
      const sideMenu = new SideMenu(page, testInfo);
      const objectivesSettingsPage = new ObjectivesSettingsPage(page, testInfo);
      const objectivesAllPage = new ObjectivesAllPage(page, testInfo);

      await test.step('Открыть "Все цели" через меню, включая OKR при необходимости', async () => {
        // Проверяем, есть ли пункт "Все цели" в подменю "Цели"
        const hasAllItem = await sideMenu.hasObjectivesAllItem();

        if (!hasAllItem) {
          // Пункта нет → включаем OKR на странице настроек целей
          await sideMenu.openObjectivesSettings();
          await objectivesSettingsPage.assertOpened();
          await objectivesSettingsPage.enableOkrIfDisabled();
        }

        // Теперь пункт "Все цели" должен быть и мы кликаем по нему
        await sideMenu.openObjectivesAll();
      });

      await test.step('Проверить содержимое страницы "Все цели"', async () => {
        await objectivesAllPage.assertOpened();
      });
    },
  );
});
