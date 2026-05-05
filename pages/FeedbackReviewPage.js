import { BasePage } from "./BasePage.js";
import { TIMEOUTS } from "../tests/utils/constants.js";
// pages/FeedbackReviewPage.js
import { expect } from "@playwright/test";

export class FeedbackReviewPage extends BasePage {
  /**
   * @param {import('@playwright/test').Page} page
   * @param {import('@playwright/test').TestInfo} [testInfo]
   */
  constructor(page, testInfo) {
    super(page, testInfo);

    this.urlRe = /\/manager\/feedbacks\/?($|\?)/;

    this.h1 = this.page
      .getByRole("heading", { level: 1, name: /Просмотр фидбека/i })
      .first();

    this.exportBtn = this.page
      .getByRole("button", { name: /Экспорт/i })
      .first();
  }

  async assertOpened() {
    await this._step('Открыта страница "Просмотр фидбека"', async () => {
      await expect
        .poll(() => this.page.url(), { timeout: 25_000 })
        .toMatch(this.urlRe);
      await this.h1.waitFor({ state: "visible", timeout: TIMEOUTS.PAGE_LOAD });
    });
  }

  async assertUi() {
    await this._step("UI: фильтры и заголовки таблицы", async () => {
      // Фильтры (данные не трогаем)
      await this._filter("Период").waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
      await this._filter("От кого").waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
      await this._filter("Кому").waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
      await this._filter("Автор запроса").waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
      await this._filter("Тип фидбека").waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });

      // Экспорт (кнопка)
      await this.exportBtn.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });

      // Заголовки таблицы (строго элементы, не строки данных)
      await this._tableHeader("Дата").waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
      await this._tableHeader("От кого").waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
      await this._tableHeader("Кому").waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
      await this._tableHeader("Тип").waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
      await this._tableHeader("Текст фидбека").waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
      await this._tableHeader("Видимость").waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
      await this._tableHeader("Автор запроса").waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
    });
  }

  // ---------------- helpers ----------------

  _filter(label) {
    // На этом экране фильтры выглядят как “поля/кнопки” с текстом внутри.
    // Делаем устойчиво: ищем среди button/div/input по видимому тексту/placeholder.
    const esc = this._cssEsc(label);
    return (
      this.page
        .locator(
          [
            `button:has-text("${esc}")`,
            `div:has-text("${esc}")`,
            `input[placeholder*="${esc}"]`,
          ].join(", "),
        )
        // отсекаем “мусор” — берём самый верхний матч (в фильтрах он выше таблицы)
        .first()
    );
  }

  _tableHeader(text) {
    // если таблица семантическая — отлично; если div-таблица — всё равно найдём по тексту
    const re = new RegExp(`^\\s*${this._reEsc(text)}\\s*$`, "i");
    return this.page
      .locator('th, [role="columnheader"], div')
      .filter({ hasText: re })
      .first();
  }

  _cssEsc(s) {
    return String(s).replace(/"/g, '\\"');
  }

  _reEsc(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
}
