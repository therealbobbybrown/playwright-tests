// pages/menu/BaseMenuHelper.js
// Базовый класс для хелперов бокового меню
import { TIMEOUTS } from "../../tests/utils/constants.js";
import { SELECTORS } from "../../tests/utils/selectors.js";

/**
 * Базовый хелпер для работы с боковым меню.
 * Содержит общую логику для всех секций меню.
 */
export class BaseMenuHelper {
  /**
   * @param {import('@playwright/test').Page} page
   * @param {import('@playwright/test').TestInfo} [testInfo]
   */
  constructor(page, testInfo) {
    this.page = page;
    this.testInfo = testInfo;
  }

  /**
   * Обёртка для test.step (если testInfo доступен)
   * @param {string} name - название шага
   * @param {Function} fn - функция для выполнения
   */
  async _step(name, fn) {
    if (this.testInfo?.step) {
      return this.testInfo.step(name, fn);
    }
    return fn();
  }

  /**
   * Закрыть любые открытые модалки/шторки (SheetModal, диалоги),
   * которые могут перехватывать клики по сайдбар-меню.
   * @returns {boolean} true если модалка была обнаружена (даже если закрыта не полностью)
   */
  async _dismissOpenModals() {
    const hasModal = await this.page
      .locator(".react-modal-sheet-container")
      .first()
      .isVisible()
      .catch(() => false);
    if (!hasModal) return false;

    // Убираем SheetModal из DOM (Escape/backdrop ненадёжны)
    await this.page
      .evaluate(() => {
        document
          .querySelectorAll(
            ".react-modal-sheet-container, .react-modal-sheet-backdrop",
          )
          .forEach((el) => el.remove());
      })
      .catch(() => {});

    return true;
  }

  /**
   * Увести курсор в правую часть экрана, чтобы шторка свернулась
   */
  async _moveCursorToContent() {
    const viewport = this.page.viewportSize();
    const x = viewport ? viewport.width - 10 : 1200;
    const y = 100;

    await this.page.mouse.move(x, y);
    // Используем waitForLoadState вместо waitForTimeout
    await this.page.waitForLoadState("domcontentloaded").catch(() => null);
  }

  /**
   * Открыть пункт подменю через hover/click по родительскому пункту
   * @param {import('@playwright/test').Locator} menuItem - родительский пункт меню
   * @param {import('@playwright/test').Locator} linkLocator - ссылка в подменю
   * @param {RegExp} targetUrlRe - паттерн целевого URL
   * @param {Object} opts - дополнительные опции
   */
  async _openFromMenu(menuItem, linkLocator, targetUrlRe, opts = {}) {
    const { afterClickWait = "domcontentloaded" } = opts;

    if (targetUrlRe.test(this.page.url())) return;

    await menuItem.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
    await menuItem.hover();

    // если hover не открыл подменю — пробуем клик и повторное ожидание
    try {
      await linkLocator.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MODAL_CLOSE,
      });
    } catch {
      await menuItem.click().catch(() => null);
      await menuItem.hover().catch(() => null);
      await linkLocator.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
    }

    await Promise.all([
      this.page.waitForURL(targetUrlRe, { timeout: TIMEOUTS.URL_CHANGE }),
      linkLocator.click(),
    ]);

    await this.page
      .waitForLoadState(afterClickWait, { timeout: TIMEOUTS.URL_CHANGE })
      .catch(() => null);
    await this._moveCursorToContent();
  }

  /**
   * Создать локатор для пункта главного меню
   * @param {string} menuTitle - текст пункта меню
   */
  _createMenuItemLocator(menuTitle) {
    return this.page.locator(
      `li:has(span${SELECTORS.MENU_ITEM_TITLE}:has-text("${menuTitle}"))`,
    );
  }

  /**
   * Создать локатор для пункта меню (li или a)
   * @param {string} menuTitle - текст пункта меню
   */
  _createMenuItemOrLinkLocator(menuTitle) {
    return this.page
      .locator(
        `li:has(span${SELECTORS.MENU_ITEM_TITLE}:has-text("${menuTitle}")), ` +
          `a:has(span${SELECTORS.MENU_ITEM_TITLE}:has-text("${menuTitle}"))`,
      )
      .first();
  }
}
