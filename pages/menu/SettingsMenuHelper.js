// pages/menu/SettingsMenuHelper.js
// Хелпер для работы с меню "Настройки" и связанными пунктами
import { BaseMenuHelper } from "./BaseMenuHelper.js";
import { TIMEOUTS } from "../../tests/utils/constants.js";
import { URL_PATTERNS } from "../../tests/utils/urls.js";
import { SELECTORS } from "../../tests/utils/selectors.js";

/**
 * Хелпер для работы с пунктом меню "Настройки" и "Магазин подарков"
 */
export class SettingsMenuHelper extends BaseMenuHelper {
  constructor(page, testInfo) {
    super(page, testInfo);

    // Главные пункты меню
    this.settingsMenuItem = this._createMenuItemLocator("Настройки");
    this.giftShopMainMenuItem = this._createMenuItemLocator("Магазин подарков");

    // Ссылки в подменю "Настройки"
    this.brandSettingsLink = this.page
      .locator('a[href*="/manager/company/brand/"]')
      .filter({ hasText: /Внешний вид/i });
  }

  /** Открыть страницу "Настройка виртуальной валюты" через меню "Настройки" */
  async openVirtualCurrencySettings() {
    await this._step(
      'Открыть "Настройка виртуальной валюты" через боковое меню',
      async () => {
        const item = this.settingsMenuItem.first();
        await item.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
        await item.hover();

        const link = this.page
          .getByRole("link", { name: "Настройка виртуальной валюты" })
          .first();

        try {
          await link.waitFor({
            state: "visible",
            timeout: TIMEOUTS.MODAL_CLOSE,
          });
        } catch {
          await item.click().catch(() => null);
          await link.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
        }

        await link.click();
        await this.page
          .waitForLoadState("domcontentloaded", { timeout: TIMEOUTS.PAGE_LOAD })
          .catch(() => null);
        await this._moveCursorToContent();
      },
    );
  }

  /** Есть ли пункт "Магазин подарков" в основном левом меню (реально видимый) */
  async hasGiftShopMainItem() {
    return this._step(
      'Проверить наличие пункта "Магазин подарков" в левом меню',
      async () => {
        const item = this.giftShopMainMenuItem.first();
        const count = await item.count();
        if (count === 0) return false;
        return item.isVisible().catch(() => false);
      },
    );
  }

  /** Есть ли пункт "Магазин подарков" в подменю "Настройки" */
  async hasGiftShopSettingsItem() {
    return this._step(
      'Проверить наличие пункта "Магазин подарков" в меню "Настройки"',
      async () => {
        await this.settingsMenuItem.first().hover();

        const giftLink = this.page
          .locator('a[href*="/manager/gift-shop/settings/"]')
          .first();

        const count = await giftLink.count();
        if (!count) {
          await this._moveCursorToContent();
          return false;
        }

        const visible = await giftLink.isVisible().catch(() => false);
        await this._moveCursorToContent();
        return visible;
      },
    );
  }

  /** Открыть основной "Магазин подарков" через левое меню */
  async openGiftShopMain() {
    await this._step(
      'Открыть основной "Магазин подарков" через левое меню',
      async () => {
        const item = this.giftShopMainMenuItem.first();
        await item.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

        await Promise.all([
          this.page.waitForURL(URL_PATTERNS.GIFT_SHOP, {
            timeout: TIMEOUTS.PAGE_LOAD,
          }),
          item.click(),
        ]);
      },
    );
  }

  /** Открыть страницу "Настройки магазина подарков" через меню "Настройки" */
  async openGiftShopSettingsFromSettings() {
    await this._step(
      'Открыть "Настройки магазина подарков" через подменю "Настройки"',
      async () => {
        const item = this.settingsMenuItem.first();
        await item.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
        await item.hover();

        const giftLink = this.page
          .locator('a[href*="/manager/gift-shop/settings/"]')
          .first();

        try {
          await giftLink.waitFor({
            state: "visible",
            timeout: TIMEOUTS.MODAL_CLOSE,
          });
        } catch {
          await item.click().catch(() => null);
          await giftLink.waitFor({
            state: "visible",
            timeout: TIMEOUTS.MEDIUM,
          });
        }

        await Promise.all([
          this.page.waitForURL(URL_PATTERNS.GIFT_SHOP_SETTINGS, {
            timeout: TIMEOUTS.PAGE_LOAD,
          }),
          giftLink.click(),
        ]);

        await this._moveCursorToContent();
      },
    );
  }

  /** Открыть страницу "История операций" через меню "Настройки" */
  async openOperationsHistory() {
    await this._step(
      'Открыть "История операций" через боковое меню',
      async () => {
        const item = this.settingsMenuItem.first();
        await item.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
        await item.hover();

        const historyLink = this.page
          .locator('a[href*="/manager/karma/transactions"]')
          .first();

        try {
          await historyLink.waitFor({
            state: "visible",
            timeout: TIMEOUTS.MODAL_CLOSE,
          });
        } catch {
          await item.click().catch(() => null);
          await historyLink.waitFor({
            state: "visible",
            timeout: TIMEOUTS.MEDIUM,
          });
        }

        await Promise.all([
          this.page.waitForURL(URL_PATTERNS.OPERATIONS_HISTORY, {
            timeout: TIMEOUTS.PAGE_LOAD,
          }),
          historyLink.click(),
        ]);

        await this._moveCursorToContent();
      },
    );
  }

  /** Открыть страницу "Внешний вид" через меню "Настройки" */
  async openBrandSettings() {
    await this._step('Открыть "Внешний вид" через боковое меню', async () => {
      const item = this.settingsMenuItem.first();
      await item.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
      await item.hover();

      const brandLink = this.brandSettingsLink.first();

      try {
        await brandLink.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MODAL_CLOSE,
        });
      } catch {
        await item.click().catch(() => null);
        await brandLink.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
      }

      await Promise.all([
        this.page.waitForURL(URL_PATTERNS.BRAND_SETTINGS, {
          timeout: TIMEOUTS.PAGE_LOAD,
        }),
        brandLink.click(),
      ]);

      await this.page
        .waitForLoadState("domcontentloaded", { timeout: TIMEOUTS.PAGE_LOAD })
        .catch(() => null);
      await this._moveCursorToContent();
    });
  }
}
