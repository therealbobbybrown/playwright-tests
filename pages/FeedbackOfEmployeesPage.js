import { BasePage } from "./BasePage.js";
import { expect } from "@playwright/test";
import { TIMEOUTS } from "../tests/utils/constants.js";

export class FeedbackOfEmployeesPage extends BasePage {
  /**
   * @param {import('@playwright/test').Page} page
   * @param {import('@playwright/test').TestInfo} [testInfo]
   */
  constructor(page, testInfo) {
    super(page, testInfo);

    this.urlRe = /\/feedbacks\/feed\/of-employees\/?($|\?)/;

    // <h1>Фидбек на моих сотрудников</h1>
    this.h1 = this.page
      .getByRole("heading", { level: 1 })
      .filter({ hasText: /фидбек/i })
      .first();

    // Пресеты (кнопки "Все" + иконки)
    this.presetButtons = this.page.locator(
      'button[class*="FilterButton_button__"]',
    );
    this.presetAllButton = this.presetButtons
      .filter({
        has: this.page.locator('span[class*="FilterButton_text__"]', {
          hasText: /Все/i,
        }),
      })
      .first();

    // В DOM может быть 2 кнопки (mobile hidden + desktop visible) — берём только видимую
    this.filterOpenerButtonVisible = this.page
      .locator('button[class*="FilterOpener_button__"]:visible')
      .first();

    // Список / элементы (могут быть пустыми)
    this.list = this.page.locator('div[class*="FeedbacksFeed_list__"]').first();
    this.items = this.page.locator('div[class*="FeedbacksFeed_item__"]');

    // Пустое состояние ("Не найдено")
    this.emptyResult = this.page
      .locator('div[class*="EmptyResult_empty__"]')
      .filter({ hasText: /Не найдено/i })
      .first();

    // ВАЖНО: filter-tags на этой странице может быть в DOM, но hidden — не требуем visible
    this.filterTags = this.page
      .locator('div[class*="FeedbacksFeed_filter-tags__"]')
      .first();
  }

  async assertOpened() {
    await this._step(
      'Открыта страница "Фидбек на моих сотрудников"',
      async () => {
        await expect
          .poll(() => this.page.url(), { timeout: 25_000 })
          .toMatch(this.urlRe);
        await expect(this.h1).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD });
      },
    );
  }

  async assertBaseElementsWithoutData() {
    await this._step("Базовые элементы (без привязки к данным)", async () => {
      await expect(this.h1).toBeVisible({ timeout: TIMEOUTS.MEDIUM });

      // Пресеты: дождаться загрузки, затем проверить кнопку "Все"
      await expect(this.presetAllButton).toBeVisible({
        timeout: TIMEOUTS.MEDIUM,
      });
      const presetsCount = await this.presetButtons.count();
      expect(presetsCount).toBeGreaterThanOrEqual(2); // "Все" + минимум 1 тип фидбека

      // Кнопка фильтров (desktop)
      await expect(this.filterOpenerButtonVisible).toBeVisible({
        timeout: TIMEOUTS.MEDIUM,
      });

      // Данные: либо список фидбеков, либо пустое состояние
      const hasItems = await this.items
        .first()
        .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
        .then(() => true)
        .catch(() => false);
      if (hasItems) {
        await expect(this.items.first()).toBeVisible();
      } else {
        await expect(this.emptyResult).toBeVisible({
          timeout: TIMEOUTS.MEDIUM,
        });
      }

      // Скриншот здесь НЕ делаем — он уже снимается автоматически в конце теста конфигом.
    });
  }
}
