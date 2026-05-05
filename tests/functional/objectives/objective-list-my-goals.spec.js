// tests/functional/objectives/objective-list-my-goals.spec.js
// TestRail: C2667 - Список целей "Мои цели", C2669 - Список целей "Все цели"
import { expect } from "@playwright/test";
import { test } from "../../fixtures/auth.js";
import { SideMenu } from "../../../pages/SideMenu.js";
import { ObjectivesSettingsPage } from "../../../pages/ObjectivesSettingsPage.js";
import { ObjectivesAllPage } from "../../../pages/ObjectivesAllPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { TIMEOUTS } from "../../utils/constants.js";

test.describe("Списки целей (OKR)", { tag: ["@ui", "@regression"] }, () => {
  test.beforeEach(() => {
    markAsUITest(MODULES.OBJECTIVES);
  });

  test(
    'C2667: проверка страницы "Мои цели" с фильтрами и поиском',
    async ({ adminAuth, page }, testInfo) => {
      setSeverity("normal");
      const sideMenu = new SideMenu(page, testInfo);
      const objectivesSettingsPage = new ObjectivesSettingsPage(page, testInfo);
      const objectivesAllPage = new ObjectivesAllPage(page, testInfo);

      await test.step('Включить OKR и перейти к "Все цели"', async () => {
        const hasCreateItem = await sideMenu.hasObjectivesCreateItem();
        if (!hasCreateItem) {
          await sideMenu.openObjectivesSettings();
          await objectivesSettingsPage.assertOpened();
          await objectivesSettingsPage.enableOkrIfDisabled();
        }
        await sideMenu.openObjectivesAll();
        await objectivesAllPage.assertOpened();
      });

      await test.step('Переключиться на вкладку "Мои цели"', async () => {
        await objectivesAllPage.switchToTab("mine");
        await objectivesAllPage.assertTabActive("mine");
      });

      await test.step('Проверить наличие поля поиска на вкладке "Мои цели"', async () => {
        const searchInput = page.getByRole("textbox", { name: "Найти цель" });
        await searchInput.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        await expect(
          searchInput,
          'Поле поиска "Найти цель" должно быть видимо',
        ).toBeVisible();
      });

      await test.step("Проверить наличие ссылки добавления цели", async () => {
        const addLink = page.getByRole("link", {
          name: /Добавить цель/i,
        });
        await expect(
          addLink,
          'Ссылка "Добавить цель" должна быть видима',
        ).toBeVisible();
      });

      await test.step("Проверить порядок вкладок", async () => {
        await objectivesAllPage.assertTabOrder();
      });
    },
  );

  test(
    'C2669: проверка страницы "Все цели"',
    async ({ adminAuth, page }, testInfo) => {
      setSeverity("normal");
      const sideMenu = new SideMenu(page, testInfo);
      const objectivesSettingsPage = new ObjectivesSettingsPage(page, testInfo);
      const objectivesAllPage = new ObjectivesAllPage(page, testInfo);

      await test.step('Включить OKR и перейти к "Все цели"', async () => {
        const hasCreateItem = await sideMenu.hasObjectivesCreateItem();
        if (!hasCreateItem) {
          await sideMenu.openObjectivesSettings();
          await objectivesSettingsPage.assertOpened();
          await objectivesSettingsPage.enableOkrIfDisabled();
        }
        await sideMenu.openObjectivesAll();
        await objectivesAllPage.assertOpened();
      });

      await test.step('Проверить что вкладка "Все цели" активна по умолчанию', async () => {
        await objectivesAllPage.assertDefaultTabIsAll();
      });

      await test.step("Проверить порядок вкладок", async () => {
        await objectivesAllPage.assertTabOrder();
      });

      await test.step('Проверить что старые фильтры Год/Квартал отсутствуют (DEVAPR-11585)', async () => {
        await objectivesAllPage.assertOldDropdownsRemoved();
      });

      await test.step("Проверить наличие поля поиска и фильтра периода", async () => {
        const searchInput = page.getByRole("textbox", { name: "Найти цель" });
        await expect(
          searchInput,
          "Поле поиска должно быть видимо",
        ).toBeVisible();

        // Датапикер периода присутствует
        await expect(
          objectivesAllPage.periodFilter.anchor,
          "Фильтр периода (датапикер) должен быть видим",
        ).toBeVisible();
      });

      await test.step("Проверить переключение между вкладками", async () => {
        // Переключиться на "Мои цели"
        await objectivesAllPage.switchToTab("mine");
        await objectivesAllPage.assertTabActive("mine");

        // Вернуться на "Все цели"
        await objectivesAllPage.switchToTab("all");
        await objectivesAllPage.assertTabActive("all");
      });
    },
  );
});
