// pages/menu/SurveysMenuHelper.js
// Хелпер для работы с меню "Опросы"
import { BaseMenuHelper } from "./BaseMenuHelper.js";
import { TIMEOUTS } from "../../tests/utils/constants.js";
import { URL_PATTERNS } from "../../tests/utils/urls.js";

/**
 * Хелпер для работы с пунктом меню "Опросы"
 */
export class SurveysMenuHelper extends BaseMenuHelper {
  constructor(page, testInfo) {
    super(page, testInfo);

    // Локаторы для подменю "Опросы"
    this.surveysMenuItem = this._createMenuItemLocator("Опросы");
    this.surveysCreateLink = this.page.getByRole("link", {
      name: "Создать опрос",
    });
    this.surveysListLink = this.page.getByRole("link", { name: /^Опросы$/ });
  }

  /** Открыть "Создать опрос" через меню "Опросы" */
  async openSurveysCreate() {
    await this._step('Открыть "Создать опрос" через боковое меню', async () => {
      await this._dismissOpenModals();

      // в некоторых сборках "Создать опрос" лежит в подменю, поэтому делаем hover по пункту меню
      await this.surveysMenuItem.first().hover();

      const link = this.page
        .getByRole("link", { name: "Создать опрос" })
        .first();
      await link.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

      await Promise.all([
        this.page.waitForURL(URL_PATTERNS.SURVEY_TEMPLATES, {
          timeout: TIMEOUTS.PAGE_LOAD,
        }),
        link.click(),
      ]);

      await this.page.waitForLoadState("domcontentloaded", {
        timeout: TIMEOUTS.PAGE_LOAD,
      });
      await this._moveCursorToContent();
    });
  }

  /** Открыть список "Опросы" через меню "Опросы" */
  async openSurveysList() {
    await this._step('Открыть "Опросы" через боковое меню', async () => {
      const targetUrl = /\/manager\/company\/surveys\/?($|\?)/;

      if (targetUrl.test(this.page.url())) return;

      await this._dismissOpenModals();

      const menuItem = this.surveysMenuItem.first();
      await menuItem.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

      // иногда пункт кликабельный сам по себе
      await menuItem.click();

      // если URL не поменялся — открылась шторка/лендинг, ищем ссылку в оверлее
      try {
        await this.page.waitForURL(targetUrl, { timeout: TIMEOUTS.SHORT });
      } catch {
        const overlayLink = this.page
          .locator('a[href*="/manager/company/surveys/"]')
          .filter({ hasText: /Опросы|Все опросы/i })
          .first();

        if (await overlayLink.isVisible().catch(() => false)) {
          await Promise.all([
            this.page.waitForURL(targetUrl, { timeout: TIMEOUTS.NAVIGATION }),
            overlayLink.click(),
          ]);
        } else {
          // fallback: прямой переход
          const base = process.env.BASE_URL;
          const url = new URL("/ru/manager/company/surveys/", base).toString();
          await this.page.goto(url, { waitUntil: "domcontentloaded" });
        }
      }

      await this.page.waitForLoadState("domcontentloaded", {
        timeout: TIMEOUTS.PAGE_LOAD,
      });
      await this._moveCursorToContent();
    });
  }
}
