// pages/BasePage.js
import { allure } from "allure-playwright";
import { TIMEOUTS } from "../tests/utils/constants.js";

/**
 * Базовый класс для всех Page Objects.
 * Содержит общую логику (step-обёртку, etc.).
 */
export class BasePage {
  /**
   * @param {import('@playwright/test').Page} page
   * @param {import('@playwright/test').TestInfo} [testInfo]
   */
  constructor(page, testInfo) {
    this.page = page;
    this.testInfo = testInfo;
  }

  /**
   * Обёртка для шагов теста.
   * Использует testInfo.step если доступен, иначе allure.step, иначе просто выполняет функцию.
   * @param {string} title - Название шага
   * @param {() => Promise<T>} fn - Функция для выполнения
   * @returns {Promise<T>}
   * @template T
   */
  async _step(title, fn) {
    if (this.testInfo?.step) {
      return this.testInfo.step(title, fn);
    }
    if (allure && typeof allure.step === "function") {
      return allure.step(title, fn);
    }
    return fn();
  }

  /**
   * Увести курсор в область контента, чтобы свернуть боковое меню.
   * Полезно для предотвращения наложения меню на элементы.
   */
  async _moveCursorToContent() {
    const viewport = this.page.viewportSize();
    const x = viewport ? viewport.width - 10 : 1200;
    const y = 100;

    await this.page.mouse.move(x, y);
    // Ждём завершения анимации сворачивания бокового меню
    await this.page
      .waitForLoadState("domcontentloaded", { timeout: TIMEOUTS.SHORT })
      .catch(() => {});
  }

  /**
   * Проверить наличие оверлея BuildReloadMessage (появляется при деплое).
   * Если оверлей виден - перезагрузить страницу.
   * @returns {Promise<boolean>} true если страница была перезагружена
   */
  async _handleBuildReloadMessage() {
    const buildReloadMsg = this.page
      .locator('[class*="BuildReloadMessage"]')
      .first();
    const isVisible = await buildReloadMsg
      .waitFor({ state: "visible", timeout: 500 })
      .then(() => true)
      .catch(() => false);

    if (isVisible) {
      await this.page.reload();
      await this.page.waitForLoadState("networkidle");
      return true;
    }
    return false;
  }
}
