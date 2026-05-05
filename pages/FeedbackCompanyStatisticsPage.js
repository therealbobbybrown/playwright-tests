import { BasePage } from "./BasePage.js";
import { expect } from "@playwright/test";
import { TIMEOUTS } from "../tests/utils/constants.js";

export class FeedbackCompanyStatisticsPage extends BasePage {
  /**
   * @param {import('@playwright/test').Page} page
   * @param {import('@playwright/test').TestInfo} [testInfo]
   */
  constructor(page, testInfo) {
    super(page, testInfo);

    // URL может иметь дополнительные сегменты/параметры — не режем до конца.
    this.urlRe =
      /\/manager\/statistics\/(feedbacks|feedback-requests)\/?($|\?)/;

    this.h1 = this.page
      .getByRole("heading", { level: 1, name: /Статистика компании/i })
      .first();

    // Контейнер табов (важно: иначе ловим "По дням" и т.п.)
    this.tabsBar = this.page
      .locator('div[class*="FilterPresetButtons_buttons__"]')
      .first();
    this.tabButtons = this.tabsBar.locator(
      'button[class*="FilterButton_button__"]',
    );

    // Заголовки блоков на вкладках
    this.feedbackStatsTitle = this.page
      .locator("h2")
      .filter({ hasText: /^\s*Статистика\s+фидбека\s*$/i })
      .first();

    this.requestsStatsTitle = this.page
      .locator("h2")
      // там перенос строки, поэтому \s+
      .filter({ hasText: /Статистика\s+запросов\s+фидбека/i })
      .first();

    // Лейблы фильтров (у "Период" и у инпутов разные суффиксы, но общий префикс один)
    this.inputLabels = this.page.locator('*[class*="Input_label__"]');

    // Toastify контейнер (может отсутствовать)
    this.toastify = this.page
      .locator('section.Toastify[aria-label*="Notifications"]')
      .first();
  }

  // ---------------- Public API ----------------

  async assertOpened() {
    await this._step('Открыта страница "Статистика компании"', async () => {
      // waitForURL может зависнуть на SPA/доп.сегментах — делаем мягко через poll.
      await expect
        .poll(() => this.page.url(), { timeout: TIMEOUTS.PAGE_LOAD })
        .toMatch(this.urlRe);

      await this.h1.waitFor({ state: "visible", timeout: TIMEOUTS.PAGE_LOAD });

      // Ровно 2 таба в верхнем переключателе
      await expect(this.tabButtons).toHaveCount(2, {
        timeout: TIMEOUTS.MEDIUM,
      });
      await this._tab("Фидбек").waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
      await this._tab("Запросы фидбека").waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
    });
  }

  async goToFeedbackTab() {
    await this.goToTab("Фидбек");
  }

  async goToRequestsTab() {
    await this.goToTab("Запросы фидбека");
  }

  async goToTab(title) {
    await this._step(`Перейти на вкладку "${title}"`, async () => {
      const btn = this._tab(title);
      await btn.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
      await btn.scrollIntoViewIfNeeded();

      // Кликать только если сейчас не активна
      const cls = (await btn.getAttribute("class")) || "";
      if (!/button--active__/i.test(cls)) {
        await btn.click();
      }

      // Активность у вас: FilterButton_button--active__XXXX
      await expect(btn).toHaveClass(/button--active__/i, {
        timeout: TIMEOUTS.MEDIUM,
      });

      // Маркер контента вкладки
      if (/запрос/i.test(title)) {
        await this.requestsStatsTitle.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
      } else {
        await this.feedbackStatsTitle.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
      }
    });
  }

  async assertFeedbackTabFields() {
    await this._step('Вкладка "Фидбек": состав полей', async () => {
      // На всякий случай — гарантируем вкладку
      await this.goToFeedbackTab();

      await this.feedbackStatsTitle.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });

      await this._label("Период").waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
      await this._label("От кого").waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
      await this._label("На кого").waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });

      // В этой вкладке не должно быть "Кто запросил"
      await expect(this._labels("Кто запросил")).toHaveCount(0, {
        timeout: 2_000,
      });
    });
  }

  async assertRequestsTabFields() {
    await this._step('Вкладка "Запросы фидбека": состав полей', async () => {
      await this.goToRequestsTab();

      await this.requestsStatsTitle.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });

      await this._label("Период").waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
      await this._label("Кто запросил").waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
      await this._label("На кого").waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });

      // В этой вкладке не должно быть "От кого"
      await expect(this._labels("От кого")).toHaveCount(0, { timeout: 2_000 });
    });
  }

  async clickToastifyIfPresent() {
    await this._step("Toastify: кликнуть (если есть)", async () => {
      if ((await this.toastify.count()) === 0) return;
      await this.toastify.click({ force: true }).catch(() => null);
      // Ждём скрытия тоста
      await this.toastify
        .waitFor({ state: "hidden", timeout: TIMEOUTS.SHORT })
        .catch(() => {});
    });
  }

  // ---------------- Internal helpers ----------------

  _tab(title) {
    const re = new RegExp(`^\\s*${this._escapeRe(title)}\\s*$`, "i");
    return this.tabButtons
      .filter({
        has: this.page
          .locator('span[class*="FilterButton_text__"]')
          .filter({ hasText: re }),
      })
      .first();
  }

  _label(text) {
    const re = new RegExp(`^\\s*${this._escapeRe(text)}\\s*$`, "i");
    return this.inputLabels.filter({ hasText: re }).first();
  }

  _labels(text) {
    const re = new RegExp(`^\\s*${this._escapeRe(text)}\\s*$`, "i");
    return this.inputLabels.filter({ hasText: re });
  }

  _escapeRe(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
}
