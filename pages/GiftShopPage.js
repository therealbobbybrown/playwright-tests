import { expect } from "@playwright/test";
import { BasePage } from "./BasePage.js";
import { TIMEOUTS } from "../tests/utils/constants.js";
import { URL_PATTERNS } from "../tests/utils/urls.js";
// pages/GiftShopPage.js

export class GiftShopPage extends BasePage {
  /** @param {import('@playwright/test').Page} page
      @param {import('@playwright/test').TestInfo} [testInfo] */
  constructor(page, testInfo) {
    super(page, testInfo);

    // Заголовок "Магазин подарков"
    this.heading = page
      .locator('[class^="Header_title__"]')
      .filter({ hasText: "Магазин подарков" })
      .first();

    // Любая карточка подарка
    this.anyGiftCard = page.locator('[class*="GiftCard_inner"]').first();

    // Баланс кошелька пользователя — <div class="Wallet_textLeftBalance__gNbJ6">25 💎</div>
    this.walletBalance = page
      .locator('[class^="Wallet_textLeftBalance__"]')
      .first();

    // Все карточки подарков в основном магазине
    this.giftCards = page.locator('[class*="GiftCard_inner"]');

    // Правая шторка с деталями выбранного подарка
    this.rightSheet = page
      .locator('[class^="RightSheetModal_container__"]')
      .first();

    // Экран оформления заказа (CreateOrderScreen)
    this.createOrderRoot = page
      .locator('[class*="CreateOrderScreen_header__"]')
      .first()
      .locator("..");

    this.createOrderSubmitButton = page
      .locator('[class*="CreateOrderScreen_buttons__"]')
      .getByRole("button", { name: "Заказать" });

    // Экран успешного заказа (SuccessScreen)
    this.successWrapper = page
      .locator('[class*="SuccessScreen_wrapper__"]')
      .first();

    this.successTitle = this.successWrapper
      .locator('[class*="SuccessScreen_title__"]')
      .first();

    this.successText = this.successWrapper
      .locator('[class*="SuccessScreen_text__"]')
      .first();

    this.successReturnButton = this.successWrapper.getByRole("button", {
      name: "Вернуться в каталог",
    });
  }

  /** Проверить, что открыт основной "Магазин подарков" */
  async assertOpened() {
    await this._step('Открыт основной "Магазин подарков"', async () => {
      await this.page.waitForURL(URL_PATTERNS.GIFT_SHOP, {
        timeout: TIMEOUTS.ELEMENT_VISIBLE,
      });

      await this.heading.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });

      await this.anyGiftCard.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
    });
  }

  /**
   * Проверить, что подарок с нужным названием и ценой есть в основном магазине
   * @param {{ title: string, price: number }} data
   */
  async assertGiftPresent({ title, price }) {
    await this._step(
      `Подарок "${title}" за ${price} есть в основном магазине`,
      async () => {
        const card = this.page
          .locator('[class*="GiftCard_inner"]')
          .filter({
            has: this.page
              .locator('[class^="GiftCard_title__"]')
              .filter({ hasText: title }),
          })
          .first();

        await card.waitFor({
          state: "visible",
          timeout: TIMEOUTS.ELEMENT_VISIBLE,
        });

        const titleText = (
          await card.locator('[class^="GiftCard_title__"]').innerText()
        ).trim();

        const rawPriceText = await card
          .locator('[class*="GiftCard_price"]')
          .innerText();
        const actualPrice = Number(rawPriceText.replace(/[^\d]/g, ""));

        expect(titleText).toBe(title);
        expect(actualPrice).toBe(price);
      },
    );
  }

  /**
   * Считать баланс кошелька пользователя (число без иконки 💎)
   * @returns {Promise<number>}
   */
  async getWalletBalance() {
    return this._step("Считать баланс кошелька пользователя", async () => {
      await this.walletBalance.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });

      const rawText = await this.walletBalance.innerText();
      const numericText = rawText.replace(/[^\d]/g, "");
      const balance = Number(numericText);

      if (!Number.isFinite(balance)) {
        throw new Error(
          `Не удалось распарсить баланс кошелька из текста: "${rawText}"`,
        );
      }

      return balance;
    });
  }

  /**
   * Найти подарок с ценой <= maxPrice и нажать на нём "Посмотреть"
   * @param {number} maxPrice
   * @returns {Promise<{ price: number }>}
   */
  async openFirstAffordableGift(maxPrice) {
    return this._step(
      `Открыть карточку подарка с ценой ≤ ${maxPrice}`,
      async () => {
        const count = await this.giftCards.count();

        if (count === 0) {
          throw new Error("В магазине нет ни одной карточки подарка");
        }

        let pickedIndex = -1;
        let pickedPrice = NaN;

        for (let i = 0; i < count; i += 1) {
          const card = this.giftCards.nth(i);

          await card.waitFor({
            state: "visible",
            timeout: TIMEOUTS.MEDIUM,
          });

          const rawPriceText = await card
            .locator('[class*="GiftCard_price"]')
            .innerText();

          const price = Number(rawPriceText.replace(/[^\d]/g, ""));

          if (!Number.isFinite(price)) {
            continue;
          }

          if (price <= maxPrice) {
            pickedIndex = i;
            pickedPrice = price;
            break;
          }
        }

        if (pickedIndex === -1) {
          throw new Error(
            `Не найден ни один подарок с ценой <= балансу (${maxPrice})`,
          );
        }

        const targetCard = this.giftCards.nth(pickedIndex);

        await targetCard.getByRole("button", { name: "Посмотреть" }).click();

        return { price: pickedPrice };
      },
    );
  }

  /**
   * В правой шторке нажать кнопку "Заказать"
   */
  async orderGiftFromSheet() {
    return this._step('В правой шторке нажать "Заказать"', async () => {
      await this.rightSheet.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });

      await this.rightSheet.getByRole("button", { name: "Заказать" }).click();
    });
  }

  /**
   * На экране оформления заказа нажать "Заказать"
   */
  async submitOrderOnCreateScreen() {
    return this._step('На экране оформления нажать "Заказать"', async () => {
      await this.createOrderRoot.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });

      await this.createOrderSubmitButton.click();
    });
  }

  /**
   * Проверить, что показан экран "Ваш заказ отправлен"
   */
  async assertOrderSuccessScreen() {
    return this._step('Экран "Ваш заказ отправлен" показан', async () => {
      await this.successWrapper.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });

      await this.successTitle.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });

      await expect(this.successTitle).toContainText("Ваш заказ отправлен");

      await this.successText.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
    });
  }
}
