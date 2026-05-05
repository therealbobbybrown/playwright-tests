// tests/functional/settings/settings-development-plans.spec.js
import { expect } from "@playwright/test";
import { test } from "../../fixtures/auth.js";
import { SideMenu } from "../../../pages/SideMenu.js";
import { DevelopmentPlansSettingsPage } from "../../../pages/DevelopmentPlansSettingsPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

test.describe(
  "Настройки планов развития",
  { tag: ["@ui", "@regression"] },
  () => {
    // Начальное состояние фиксируется до теста и восстанавливается в afterEach,
    // чтобы стенд не оставался в изменённом состоянии даже при падении теста.
    let initialState = null;
    let _page = null;
    let _testInfo = null;

    test.beforeEach(({ page }, testInfo) => {
      markAsUITest(MODULES.SETTINGS);
      _page = page;
      _testInfo = testInfo;
    });

    test.afterEach(async () => {
      if (initialState === null || _page === null) return;

      try {
        const developmentPlansSettingsPage = new DevelopmentPlansSettingsPage(
          _page,
          _testInfo,
        );
        const current = await developmentPlansSettingsPage.getPlansState();
        if (current === initialState) return;

        if (initialState === "enabled") {
          await developmentPlansSettingsPage.clickEnable();
          await developmentPlansSettingsPage.waitForEnabled();
        } else {
          await developmentPlansSettingsPage.clickDisable();
          await developmentPlansSettingsPage.waitForDisabled();
        }
      } catch {
        // Restore best-effort: не ломаем отчёт если стенд в плохом состоянии
      } finally {
        initialState = null;
        _page = null;
        _testInfo = null;
      }
    });

    test('C4260: Переключатель планов развития корректно влияет на пункты меню "Развитие"', async ({
      adminAuth,
      page,
    }, testInfo) => {
      setSeverity("normal");
      const sideMenu = new SideMenu(page, testInfo);
      const developmentPlansSettingsPage = new DevelopmentPlansSettingsPage(
        page,
        testInfo,
      );

      await test.step('Открыть страницу "Настроить планы развития"', async () => {
        await sideMenu.openDevelopmentPlansSettings();
        await developmentPlansSettingsPage.assertOpened();
      });

      // Запоминаем начальное состояние — будет восстановлено в afterEach
      initialState = await developmentPlansSettingsPage.getPlansState();

      // Ожидаемый состав меню при ВЫКЛЮЧЕННЫХ планах развития (первый скрин)
      const disabledMenu = [
        "Библиотека компетенций",
        "Шкалы оценки компетенций",
        "Настроить планы развития",
      ];

      // Ожидаемый состав меню при ВКЛЮЧЕННЫХ планах развития (второй скрин)
      const enabledMenu = [
        "Библиотека компетенций",
        "Шкалы оценки компетенций",
        "Планы развития",
        "Развивающие действия",
        "Шаблоны планов развития",
        "Настроить планы развития",
        "Создать план развития",
      ];

      // 1. Привести в состояние "выключено" и проверить меню
      await test.step('Привести планы развития в состояние "выключено" и проверить меню "Развитие"', async () => {
        if ((await developmentPlansSettingsPage.getPlansState()) === "enabled") {
          await developmentPlansSettingsPage.clickDisable();
          await developmentPlansSettingsPage.waitForDisabled();
        }

        await expect
          .poll(() => developmentPlansSettingsPage.getPlansState())
          .toBe("disabled");

        const items = await sideMenu.getDevelopmentMenuItems();
        await expect(items).toEqual(disabledMenu);
      });

      // 2. Привести в состояние "включено" и проверить меню
      await test.step('Привести планы развития в состояние "включено" и проверить меню "Развитие"', async () => {
        if (
          (await developmentPlansSettingsPage.getPlansState()) === "disabled"
        ) {
          await developmentPlansSettingsPage.clickEnable();
          await developmentPlansSettingsPage.waitForEnabled();
        }

        await expect
          .poll(() => developmentPlansSettingsPage.getPlansState())
          .toBe("enabled");

        const items = await sideMenu.getDevelopmentMenuItems();
        await expect(items).toEqual(enabledMenu);
      });
    });
  },
);
