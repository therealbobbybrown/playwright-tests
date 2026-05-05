import { expect } from "@playwright/test";
import { BasePage } from "./BasePage.js";
import { TIMEOUTS } from "../tests/utils/constants.js";
import { URL_PATTERNS } from "../tests/utils/urls.js";
// pages/GiftShopSettingsPage.js

export class GiftShopSettingsPage extends BasePage {
  /** @param {import('@playwright/test').Page} page
      @param {import('@playwright/test').TestInfo} [testInfo] */
  constructor(page, testInfo) {
    super(page, testInfo);

    this.heading = page
      .getByRole("heading", { name: "Настройки магазина подарков" })
      .first();

    // основная кнопка "Добавить подарок" на странице
    this.addGiftButton = page
      .getByRole("button", { name: "Добавить подарок" })
      .first();

    // кнопка/ссылка "Перейти в магазин" в шапке
    this.goToShopLink = page
      .getByRole("link", { name: "Перейти в магазин" })
      .first();

    // правый сайдбар "Создание подарка"
    this.modal = page.locator('[class*="RightSheetModal_container"]');
    this.modalTitle = this.modal.getByText("Создание подарка");

    this.titleInput = this.modal.locator("#title");
    this.priceInput = this.modal.locator("#price");
    this.descriptionInput = this.modal.locator("#description");

    this.fileInput = this.modal.locator(
      '[class*="ImageUploader_dropzone__"] input[type="file"]',
    );

    this.createGiftButton = this.modal.getByRole("button", {
      name: "Создать подарок",
    });
  }

  /** Проверить, что открыта страница "Настройки магазина подарков" */
  async assertOpened() {
    await this._step(
      'Открыта страница "Настройки магазина подарков"',
      async () => {
        await this.page.waitForURL(URL_PATTERNS.GIFT_SHOP_SETTINGS, {
          timeout: TIMEOUTS.ELEMENT_VISIBLE,
        });

        await this.heading.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
      },
    );
  }

  /** Кнопка "Перейти в магазин" отображается в настройках магазина подарков */
  async assertGoToShopLinkVisible() {
    await this._step(
      'Кнопка "Перейти в магазин" отображается в настройках магазина подарков',
      async () => {
        const link = this.goToShopLink.first();

        await link.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });

        await expect(link).toHaveAttribute("href", /^\/ru\/gift-shop/);
      },
    );
  }

  /** Кнопка "Перейти в магазин" скрыта в настройках магазина подарков */
  async assertGoToShopLinkNotVisible() {
    await this._step(
      'Кнопка "Перейти в магазин" скрыта в настройках магазина подарков',
      async () => {
        await expect(this.goToShopLink).toHaveCount(0);
      },
    );
  }

  /** Открыть форму создания подарка */
  async openCreateGiftModal() {
    await this._step('Открыть форму "Создание подарка"', async () => {
      await this.addGiftButton.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });

      await this.addGiftButton.click();

      await this.modalTitle.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
    });
  }

  /**
   * Создать подарок
   * @param {{ title: string, price: number, description: string, imagePath: string }} data
   */
  async createGift({ title, price, description, imagePath }) {
    await this._step(`Создать подарок "${title}"`, async () => {
      await this.openCreateGiftModal();

      await this.titleInput.fill(title);
      await this.priceInput.fill(String(price));
      await this.descriptionInput.fill(description);

      // Загружаем файл
      await this.fileInput.setInputFiles(imagePath);

      // Возможный модал кропа с кнопкой "Сохранить"
      const saveButton = this.page
        .getByRole("button", { name: "Сохранить" })
        .first();

      try {
        await saveButton.waitFor({
          state: "visible",
          timeout: 2_000,
        });
        await saveButton.click();
      } catch (e) {
        console.warn("Модалка кропа не появилась, пропускаем:", e.message);
      }

      // Отправляем форму
      await Promise.all([
        this.modal.waitFor({
          state: "detached",
          timeout: TIMEOUTS.ELEMENT_VISIBLE,
        }),
        this.createGiftButton.click(),
      ]);

      // Проверяем, что подарок появился с нужным названием и ценой
      await this.assertGiftPresent({ title, price });
    });
  }

  /**
   * Перейти в основной магазин подарков по кнопке "Перейти в магазин"
   * на странице настроек
   */
  async openGiftShopFromSettings() {
    await this._step(
      "Перейти в основной магазин подарков из настроек",
      async () => {
        await this.goToShopLink.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });

        await Promise.all([
          this.page.waitForURL(URL_PATTERNS.GIFT_SHOP, {
            timeout: TIMEOUTS.ELEMENT_VISIBLE,
          }),
          this.goToShopLink.click(),
        ]);
      },
    );
  }

  /**
   * Проверить, что подарок с нужным названием и ценой появился в каталоге
   * настроек магазина
   * @param {{ title: string, price: number }} data
   */
  async assertGiftPresent({ title, price }) {
    await this._step(
      `Подарок "${title}" за ${price} появился в каталоге (страница настроек)`,
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

        const priceText = (
          await card
            .locator('[class*="GiftCard_price"] span')
            .first()
            .innerText()
        ).trim();

        const actualPrice = Number(priceText.replace(/\s/g, ""));

        expect(titleText).toBe(title);
        expect(actualPrice).toBe(price);
      },
    );
  }
}
