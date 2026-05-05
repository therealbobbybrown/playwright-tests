import { BasePage } from "./BasePage.js";
import { TIMEOUTS } from "../tests/utils/constants.js";
import { URL_PATTERNS } from "../tests/utils/urls.js";
// pages/SurveysTemplatesPage.js

export class SurveysTemplatesPage extends BasePage {
  /** @param {import('@playwright/test').Page} page
      @param {import('@playwright/test').TestInfo} [testInfo] */
  constructor(page, testInfo) {
    super(page, testInfo);

    // Заголовок "Создать опрос"
    this.titleSpan = this.page
      .locator("span", { hasText: "Создать опрос" })
      .first();

    // Все кнопки шаблонов
    this.templateButtons = this.page.locator(
      'button[class*="SurveyTemplate_link__"]',
    );
  }

  async assertOpened() {
    await this._step('Страница "Создать опрос" (шаблоны) открыта', async () => {
      await this.page.waitForURL(URL_PATTERNS.SURVEY_TEMPLATES, {
        timeout: TIMEOUTS.ELEMENT_VISIBLE,
      });

      await this.titleSpan.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
    });
  }

  async assertTitleIsCorrect() {
    await this._step('Проверить заголовок "Создать опрос"', async () => {
      const text = (await this.titleSpan.innerText()).trim();
      if (text !== "Создать опрос") {
        throw new Error(`Ожидали "Создать опрос", получили "${text}"`);
      }
    });
  }

  /** Проверить, что список шаблонов не пустой */
  async assertHasTemplates() {
    await this._step("Проверить, что есть шаблоны опросов", async () => {
      // Ждём появления хотя бы одной кнопки шаблона
      await this.templateButtons.first().waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });

      const count = await this.templateButtons.count();
      if (count === 0) {
        throw new Error("Список шаблонов пуст");
      }
    });
  }

  /** Открыть первый шаблон (если где-то ещё нужно) */
  async openFirstTemplate() {
    await this._step("Открыть первый шаблон опроса", async () => {
      await this.templateButtons.first().waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
      await this.templateButtons.first().click();
    });
  }

  /** Открыть случайный шаблон опроса */
  async openRandomTemplate() {
    await this._step("Открыть случайный шаблон опроса", async () => {
      // Убедимся, что хотя бы один шаблон появился
      await this.templateButtons.first().waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });

      const count = await this.templateButtons.count();
      if (!count) {
        throw new Error("Не найдено ни одного шаблона опроса");
      }

      const index = Math.floor(Math.random() * count);
      const button = this.templateButtons.nth(index);

      await button.scrollIntoViewIfNeeded();
      await button.click();
    });
  }
}
