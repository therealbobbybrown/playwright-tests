// pages/NineBoxSettingsPage.js
// Page Object для страницы настроек матрицы потенциала 9-box
// URL: /ru/manager/ninebox/settings

import { BasePage } from "./BasePage.js";
import { TIMEOUTS } from "../tests/utils/constants.js";

/**
 * Page Object для настройки NineBox (Матрица потенциала 9-box)
 *
 * Страница содержит 3 секции:
 * 1. Настройка осей — выбор компетенций для Y (Потенциал) и X (Производительность)
 * 2. Настройка категорий — редактирование названий ячеек 3x3
 * 3. Включение матрицы потенциала — toggle enable/disable
 *
 * @example
 * const settingsPage = new NineBoxSettingsPage(page, testInfo);
 * await settingsPage.goto();
 * await settingsPage.assertOpened();
 * const titles = await settingsPage.getAllCellTitles();
 */
export class NineBoxSettingsPage extends BasePage {
  constructor(page, testInfo) {
    super(page, testInfo);

    // ==================== Заголовок страницы ====================
    this.heading = this.page.getByRole("heading", {
      name: "Настройка матрицы потенциала 9-box",
      level: 1,
    });

    // ==================== Секция: Настройка осей ====================
    this.axesSectionHeading = this.page.getByRole("heading", {
      name: "Настройка осей",
      level: 2,
    });

    // Лейблы осей
    this.yAxisLabel = this.page.getByText("Потенциал (ось Y)", {
      exact: true,
    });
    this.xAxisLabel = this.page.getByText("Производительность (ось X)", {
      exact: true,
    });

    // Контейнеры осей (родитель лейбла)
    this.yAxisContainer = this.yAxisLabel.locator("..");
    this.xAxisContainer = this.xAxisLabel.locator("..");

    // Кнопки "Выбрать компетенции"
    this.yAxisSelectBtn = this.yAxisContainer
      .locator("..")
      .getByRole("button", { name: "Выбрать компетенции" });
    this.xAxisSelectBtn = this.xAxisContainer
      .locator("..")
      .getByRole("button", { name: "Выбрать компетенции" });

    // ==================== Секция: Настройка категорий ====================
    this.categoriesSectionHeading = this.page.getByRole("heading", {
      name: "Настройка категорий",
      level: 2,
    });

    // Подписи осей в сетке категорий
    this.categoriesYLabel = this.categoriesSectionHeading
      .locator("..")
      .locator("text=Потенциал")
      .first();
    this.categoriesXLabel = this.categoriesSectionHeading
      .locator("..")
      .locator("text=Производительность")
      .first();

    // ==================== Секция: Включение матрицы ====================
    this.enableSectionHeading = this.page.getByRole("heading", {
      name: "Включение матрицы потенциала",
      level: 2,
    });

    this.enableButton = this.page.getByRole("button", {
      name: "Включить матрицу потенциала",
    });
    this.disableButton = this.page.getByRole("button", {
      name: "Выключить матрицу потенциала",
    });

    // ==================== Индикатор сохранения ====================
    this.savedIndicator = this.page.locator("text=Сохранено");
  }

  // ==================== Навигация ====================

  /**
   * Перейти на страницу настроек NineBox
   */
  async goto() {
    await this._step(
      'Перейти на страницу "Настройка матрицы потенциала 9-box"',
      async () => {
        await this.page.goto("/ru/manager/ninebox/settings");
        await this.assertOpened();
      },
    );
  }

  /**
   * Проверить что страница открыта
   */
  async assertOpened() {
    await this._step(
      'Проверка страницы "Настройка матрицы потенциала 9-box"',
      async () => {
        await this.page
          .waitForLoadState("domcontentloaded", {
            timeout: TIMEOUTS.ELEMENT_VISIBLE,
          })
          .catch(() => {});
        await this.page
          .waitForLoadState("networkidle", { timeout: TIMEOUTS.SHORT })
          .catch(() => {});
        await this.heading.waitFor({
          state: "visible",
          timeout: TIMEOUTS.ELEMENT_VISIBLE,
        });
      },
    );
  }

  // ==================== Оси: Чтение ====================

  /**
   * Получить названия чипов компетенций на оси Y (Потенциал)
   * @returns {Promise<string[]>}
   */
  async getYAxisCompetencies() {
    return this._step(
      "Получить компетенции на оси Y (Потенциал)",
      async () => {
        // Раскрыть все чипы если есть кнопка "Ещё N"
        await this._expandChips(this.yAxisContainer);
        return this._getChipNames(this.yAxisContainer);
      },
    );
  }

  /**
   * Получить названия чипов компетенций на оси X (Производительность)
   * @returns {Promise<string[]>}
   */
  async getXAxisCompetencies() {
    return this._step(
      "Получить компетенции на оси X (Производительность)",
      async () => {
        await this._expandChips(this.xAxisContainer);
        return this._getChipNames(this.xAxisContainer);
      },
    );
  }

  // ==================== Оси: Действия ====================

  /**
   * Нажать "Выбрать компетенции" на оси Y
   */
  async clickSelectYCompetencies() {
    await this._step('Нажать "Выбрать компетенции" на оси Y', async () => {
      await this.yAxisSelectBtn.click();
    });
  }

  /**
   * Нажать "Выбрать компетенции" на оси X
   */
  async clickSelectXCompetencies() {
    await this._step('Нажать "Выбрать компетенции" на оси X', async () => {
      await this.xAxisSelectBtn.click();
    });
  }

  /**
   * Удалить чип компетенции по названию
   * @param {string} competencyName — название компетенции
   */
  async removeCompetencyChip(competencyName) {
    await this._step(
      `Удалить компетенцию "${competencyName}"`,
      async () => {
        const chip = this.page.getByRole("button", { name: competencyName });
        // Крестик закрытия — последний дочерний элемент с img/svg внутри чипа
        const closeBtn = chip.locator("img, svg").last();
        await closeBtn.click();
      },
    );
  }

  /**
   * Раскрыть скрытые чипы, если есть кнопка "Ещё N"
   * @param {import('@playwright/test').Locator} container
   * @private
   */
  async _expandChips(container) {
    const moreBtn = container.getByRole("button", { name: /^Ещё \d+$/ });
    const isMoreVisible = await moreBtn.isVisible().catch(() => false);
    if (isMoreVisible) {
      await moreBtn.click();
      // Подождать пока все чипы отобразятся
      await this.page.waitForTimeout(300);
    }
  }

  /**
   * Извлечь названия компетенций из чипов внутри контейнера оси.
   * Чипы — <div role="button">, а не <button>.
   * Фильтрует реальные <button> элементы (Ещё, Свернуть, Выбрать компетенции).
   * @param {import('@playwright/test').Locator} container — контейнер оси
   * @returns {Promise<string[]>}
   * @private
   */
  async _getChipNames(container) {
    // Контейнер тегов — div с CSS-классом *_tags_*
    const tagsContainer = container.locator('[class*="tags"]');
    // Чипы — div[role="button"], исключаем реальные <button> (Ещё, Свернуть)
    const chips = tagsContainer.locator('[role="button"]:not(button)');
    const count = await chips.count();
    const names = [];
    for (let i = 0; i < count; i++) {
      const text = await chips.nth(i).innerText();
      // Убираем возможный крестик из текста
      names.push(text.replace(/\s*×?\s*$/, "").trim());
    }
    return names;
  }

  // ==================== Категории (ячейки 3x3) ====================

  /**
   * Получить все названия ячеек матрицы
   * @returns {Promise<string[][]>} 3x3 массив названий (row-major: [row][col])
   */
  async getAllCellTitles() {
    return this._step("Получить названия всех ячеек матрицы", async () => {
      // Секция "Настройка категорий" — от заголовка поднимаемся к родителю
      const section = this.categoriesSectionHeading.locator("..");
      // Контейнер сетки — div с CSS-классом Matrix_grid (содержит ровно 9 ячеек)
      const grid = section.locator('[class*="grid"]');
      const cells = grid.locator("> div");
      const count = await cells.count();

      // Собираем тексты всех ячеек
      const titles = [];
      for (let i = 0; i < count; i++) {
        const text = await cells.nth(i).innerText();
        titles.push(text.trim());
      }

      // Формируем 3x3 матрицу (row-major)
      const matrix = [];
      const size = Math.sqrt(count) || 3;
      for (let row = 0; row < size; row++) {
        const rowTitles = [];
        for (let col = 0; col < size; col++) {
          rowTitles.push(titles[row * size + col] || "");
        }
        matrix.push(rowTitles);
      }
      return matrix;
    });
  }

  /**
   * Получить название конкретной ячейки
   * @param {number} row — строка (0-2, 0=низ)
   * @param {number} col — столбец (0-2, 0=лево)
   * @returns {Promise<string>}
   */
  async getCellTitle(row, col) {
    return this._step(
      `Получить название ячейки [${row},${col}]`,
      async () => {
        const titles = await this.getAllCellTitles();
        return titles[row]?.[col] || "";
      },
    );
  }

  /**
   * Кликнуть на ячейку матрицы для редактирования
   * @param {number} row
   * @param {number} col
   */
  async clickCell(row, col) {
    await this._step(`Кликнуть на ячейку [${row},${col}]`, async () => {
      const section = this.categoriesSectionHeading.locator("..");
      const grid = section.locator('[class*="grid"]');
      const cells = grid.locator("> div");
      const index = row * 3 + col;
      await cells.nth(index).click();
    });
  }

  // ==================== Включение/отключение ====================

  /**
   * Включить матрицу потенциала
   */
  async enableNineBox() {
    await this._step("Включить матрицу потенциала", async () => {
      await this.enableButton.click();
      // Ожидаем что кнопка изменится на "Выключить"
      await this.disableButton.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
    });
  }

  /**
   * Отключить матрицу потенциала
   */
  async disableNineBox() {
    await this._step("Отключить матрицу потенциала", async () => {
      await this.disableButton.click();
      // Ожидаем что кнопка изменится на "Включить"
      await this.enableButton.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
    });
  }

  /**
   * Проверить, включён ли NineBox (видна кнопка "Выключить")
   * @returns {Promise<boolean>}
   */
  async isEnabled() {
    return this._step("Проверить состояние NineBox", async () => {
      return this.disableButton.isVisible().catch(() => false);
    });
  }

  // ==================== Ассерты ====================

  /**
   * Проверить что все 3 секции видимы
   */
  async assertAllSectionsVisible() {
    await this._step("Проверить видимость всех секций", async () => {
      await this.axesSectionHeading.waitFor({
        state: "visible",
        timeout: TIMEOUTS.ELEMENT_VISIBLE,
      });
      await this.categoriesSectionHeading.waitFor({
        state: "visible",
        timeout: TIMEOUTS.ELEMENT_VISIBLE,
      });
      await this.enableSectionHeading.waitFor({
        state: "visible",
        timeout: TIMEOUTS.ELEMENT_VISIBLE,
      });
    });
  }

  /**
   * Проверить что подписи осей в секции категорий видимы
   */
  async assertAxisLabelsVisible() {
    await this._step("Проверить подписи осей в сетке категорий", async () => {
      await this.categoriesYLabel.waitFor({
        state: "visible",
        timeout: TIMEOUTS.ELEMENT_VISIBLE,
      });
      await this.categoriesXLabel.waitFor({
        state: "visible",
        timeout: TIMEOUTS.ELEMENT_VISIBLE,
      });
    });
  }

  /**
   * Дождаться индикатора "Сохранено"
   */
  async waitForSaved() {
    await this._step('Дождаться индикатора "Сохранено"', async () => {
      await this.savedIndicator.waitFor({
        state: "visible",
        timeout: TIMEOUTS.AUTOSAVE,
      });
    });
  }
}
