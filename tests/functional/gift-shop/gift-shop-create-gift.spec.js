// tests/gift-shop-create-gift.spec.js
import path from "path";
import { fileURLToPath } from "url";
import { expect } from "@playwright/test";
import { test } from "../../fixtures/auth.js";
import { SideMenu } from "../../../pages/SideMenu.js";
import { GiftShopSettingsPage } from "../../../pages/GiftShopSettingsPage.js";
import { GiftShopPage } from "../../../pages/GiftShopPage.js";
import { VirtualCurrencySettingsPage } from "../../../pages/VirtualCurrencySettingsPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe("Магазин подарков", { tag: ["@ui", "@regression"] }, () => {
  /** @type {'enabled' | 'disabled' | undefined} */
  let initialCurrencyState;

  test.beforeEach(() => {
    markAsUITest(MODULES.GIFT_SHOP);
  });

  test.afterEach(async ({ page }, testInfo) => {
    // Вернуть состояние виртуальной валюты, если мы его меняли
    if (!initialCurrencyState || initialCurrencyState === "enabled") return;
    try {
      const sideMenu = new SideMenu(page, testInfo);
      const vcSettingsPage = new VirtualCurrencySettingsPage(page, testInfo);
      await sideMenu.openVirtualCurrencySettings();
      await vcSettingsPage.assertOpened();
      const currentState = await vcSettingsPage.getCurrencyState();
      if (currentState !== initialCurrencyState) {
        await vcSettingsPage.clickDisable();
        await vcSettingsPage.waitForDisabled();
      }
    } catch (e) {
      console.warn("[afterEach] Failed to restore currency state:", e.message);
    }
  });

  test(
    "C3656: Админ может создать новый подарок и увидеть его в основном магазине",
    { tag: ["@critical"] },
    async ({ adminAuth, page }, testInfo) => {
      setSeverity("critical");
      const sideMenu = new SideMenu(page, testInfo);
      const giftShopSettingsPage = new GiftShopSettingsPage(page, testInfo);
      const giftShopPage = new GiftShopPage(page, testInfo);
      const vcSettingsPage = new VirtualCurrencySettingsPage(page, testInfo);

      // 0. Убедиться, что виртуальная валюта включена
      await test.step("Убедиться, что виртуальная валюта включена", async () => {
        await sideMenu.openVirtualCurrencySettings();
        await vcSettingsPage.assertOpened();

        initialCurrencyState = await vcSettingsPage.getCurrencyState();

        if (initialCurrencyState !== "enabled") {
          await vcSettingsPage.clickEnable();
          await vcSettingsPage.waitForEnabled();
        }

        await expect
          .poll(() => vcSettingsPage.getCurrencyState())
          .toBe("enabled");
      });

      // 1. Открыть настройки магазина подарков
      await test.step("Открыть настройки магазина подарков", async () => {
        await sideMenu.openGiftShopSettingsFromSettings();
        await giftShopSettingsPage.assertOpened();
      });

      const suffix = Math.floor(Math.random() * 10_000) + 1;
      const title = `Подарок ${suffix}`;
      const price = Math.floor(Math.random() * 100) + 1;
      const description =
        "Краткое автосгенерированное описание подарка для теста.";

      // Файл лежит в: playwright-tests/fixtures/gift-stitch.jpg
      const imagePath = path.join(
        __dirname,
        "..",
        "..",
        "..",
        "fixtures",
        "gift-stitch.jpg",
      );

      await test.step("Создать новый подарок", async () => {
        await giftShopSettingsPage.createGift({
          title,
          price,
          description,
          imagePath,
        });
      });

      await test.step("Подарок отображается в настройках с верным названием и ценой", async () => {
        await giftShopSettingsPage.assertGiftPresent({ title, price });
      });

      await test.step('Перейти в основной магазин подарков по кнопке "Перейти в магазин"', async () => {
        await giftShopSettingsPage.openGiftShopFromSettings();
        await giftShopPage.assertOpened();
      });

      await test.step("Подарок отображается в основном магазине с верным названием и ценой", async () => {
        await giftShopPage.assertGiftPresent({ title, price });
      });
    },
  );
});
