// tests/virtual-currency-settings.spec.js
// ВАЖНО: этот тест меняет глобальное состояние (вкл/выкл VC).
// Запускать модуль virtual-currency только с --workers=1 (см. npm run test:functional:virtual-currency)
import { expect } from "@playwright/test";
import { test } from "../../fixtures/auth.js";
import { SideMenu } from "../../../pages/SideMenu.js";
import { VirtualCurrencySettingsPage } from "../../../pages/VirtualCurrencySettingsPage.js";
import { GiftShopSettingsPage } from "../../../pages/GiftShopSettingsPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

test.describe(
  "Виртуальная валюта — влияние на магазин подарков",
  { tag: ["@ui", "@regression"] },
  () => {
    /** @type {'enabled' | 'disabled' | undefined} */
    let initialState;

    test.beforeEach(() => {
      markAsUITest(MODULES.VIRTUAL_CURRENCY);
    });

    test.afterEach(async ({ page }, testInfo) => {
      if (!initialState) return;
      try {
        const sideMenu = new SideMenu(page, testInfo);
        const vcSettingsPage = new VirtualCurrencySettingsPage(page, testInfo);
        await sideMenu.openVirtualCurrencySettings();
        await vcSettingsPage.assertOpened();
        const currentState = await vcSettingsPage.getCurrencyState();
        if (currentState !== initialState) {
          if (initialState === "enabled") {
            await vcSettingsPage.clickEnable();
            await vcSettingsPage.waitForEnabled();
          } else {
            await vcSettingsPage.clickDisable();
            await vcSettingsPage.waitForDisabled();
          }
        }
      } catch (e) {
        console.warn("[afterEach] Failed to restore VC state:", e.message);
      }
    });

    test("C7511: Отключение и включение виртуальной валюты скрывает/показывает магазин подарков", async ({
      adminAuth,
      page,
    }, testInfo) => {
      setSeverity("normal");
      const sideMenu = new SideMenu(page, testInfo);
      const vcSettingsPage = new VirtualCurrencySettingsPage(page, testInfo);
      const giftShopSettingsPage = new GiftShopSettingsPage(page, testInfo);

      // 1. Открыть страницу настроек виртуальной валюты и запомнить исходное состояние
      await test.step('Открыть страницу "Настройка виртуальной валюты" и запомнить состояние', async () => {
        await sideMenu.openVirtualCurrencySettings();
        await vcSettingsPage.assertOpened();

        initialState = await vcSettingsPage.getCurrencyState();
      });

      // 2. Выключить валюту, проверить, что:
      //    - валюта в состоянии disabled
      //    - основной пункт "Магазин подарков" в левом меню скрыт
      //    - в настройках магазина подарков НЕТ кнопки "Перейти в магазин"
      await test.step('При выключенной валюте магазин скрыт и нет кнопки "Перейти в магазин"', async () => {
        await vcSettingsPage.clickDisable();
        await vcSettingsPage.waitForDisabled();

        await expect
          .poll(() => vcSettingsPage.getCurrencyState())
          .toBe("disabled");

        await expect.poll(() => sideMenu.hasGiftShopMainItem()).toBe(false);

        // Переходим в "Настройки магазина подарков" через меню "Настройки"
        await sideMenu.openGiftShopSettingsFromSettings();
        await giftShopSettingsPage.assertOpened();

        // Кнопка "Перейти в магазин" должна быть скрыта
        await giftShopSettingsPage.assertGoToShopLinkNotVisible();
      });

      // 3. Включить валюту, проверить, что:
      //    - валюта в состоянии enabled
      //    - основной пункт "Магазин подарков" в левом меню появился
      //    - в настройках магазина подарков ЕСТЬ кнопка "Перейти в магазин"
      await test.step('При включённой валюте магазин виден и есть кнопка "Перейти в магазин"', async () => {
        // Возвращаемся на страницу "Виртуальная валюта"
        await sideMenu.openVirtualCurrencySettings();
        await vcSettingsPage.assertOpened();

        await vcSettingsPage.clickEnable();
        await vcSettingsPage.waitForEnabled();

        await expect
          .poll(() => vcSettingsPage.getCurrencyState())
          .toBe("enabled");

        await expect.poll(() => sideMenu.hasGiftShopMainItem()).toBe(true);

        await sideMenu.openGiftShopSettingsFromSettings();
        await giftShopSettingsPage.assertOpened();

        await giftShopSettingsPage.assertGoToShopLinkVisible();
      });
    });
  },
);
