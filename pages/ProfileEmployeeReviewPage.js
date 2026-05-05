import { BasePage } from "./BasePage.js";
import { TIMEOUTS } from "../tests/utils/constants.js";

/**
 * Page Object для вкладки "Оценка сотрудника" в профиле.
 * URL: /ru/profile/{id}/?tab=review
 */
export class ProfileEmployeeReviewPage extends BasePage {
  /**
   * @param {import('@playwright/test').Page} page
   * @param {import('@playwright/test').TestInfo} [testInfo]
   */
  constructor(page, testInfo) {
    super(page, testInfo);

    // -------- Заголовок вкладки --------
    this.cyclesTitle = this.page
      .getByRole("heading", { name: /^Циклы оценок сотрудника$/i })
      .first();

    // -------- Фильтры по статусам --------
    this.filterAllStatuses = this.page
      .getByRole("button", { name: /^Все статусы$/i })
      .first();
    this.filterActive = this.page
      .getByRole("button", { name: /^Активные$/i })
      .first();
    this.filterCompleted = this.page
      .getByRole("button", { name: /^Завершенные$/i })
      .first();

    // -------- Сортировка --------
    this.sortDropdown = this.page
      .locator('select, [class*="Select_"], [class*="Dropdown_"]')
      .filter({ hasText: /сначала новые|сортировка/i })
      .first();
    this.sortNewestFirst = this.page.getByText(/^Сначала новые$/i).first();

    // -------- Таблица циклов оценок --------
    // Таблица может иметь разные классы, пробуем несколько вариантов
    this.historyTable = this.page
      .locator('table[class*="HistoryTable_"], table[class*="Table_table__"]')
      .first();
    this.tableHeaderDate = this.page.getByText(/^Дата$/i).first();
    this.tableHeaderName = this.page.getByText(/^Название$/i).first();
    this.tableHeaderStatus = this.page.getByText(/^Статус$/i).first();

    // Строки таблицы (относительно найденной таблицы)
    this.tableRows = this.historyTable.locator("tbody tr");

    // Ссылки "Результаты" в строках (это <a>, не <button>)
    this.resultsButtons = this.page
      .locator('a[class*="BorderedButton"]')
      .filter({ hasText: /Результаты/i });

    // Статусы в таблице
    this.statusActive = this.page.getByText(/Активно/i);
    this.statusCompleted = this.page.getByText(/Завершен/i);

    // -------- Блок "Кто видит эту информацию" --------
    this.whoSeesBlock = this.page
      .getByRole("heading", { name: /^Кто видит эту информацию$/i })
      .first();
    this.whoSeesEmployee = this.page.getByText(/^Сам сотрудник$/i).first();
    this.whoSeesManagers = this.page.getByText(/^Руководители$/i).first();
  }

  async assertOpened() {
    await this._step("Оценка сотрудника: вкладка открыта", async () => {
      await this.page.waitForLoadState("domcontentloaded");
      await this.cyclesTitle.waitFor({
        state: "visible",
        timeout: TIMEOUTS.PAGE_LOAD,
      });
    });
  }

  // -------- Фильтры --------

  async assertFiltersVisible() {
    await this._step("Оценка сотрудника: фильтры видны", async () => {
      await this.filterAllStatuses.waitFor({
        state: "visible",
        timeout: TIMEOUTS.PAGE_LOAD,
      });
      await this.filterActive.waitFor({
        state: "visible",
        timeout: TIMEOUTS.PAGE_LOAD,
      });
      await this.filterCompleted.waitFor({
        state: "visible",
        timeout: TIMEOUTS.PAGE_LOAD,
      });
    });
  }

  async clickFilterAllStatuses() {
    await this._step('Оценка сотрудника: нажать "Все статусы"', async () => {
      await this.filterAllStatuses.click();
      await this.page.waitForLoadState("domcontentloaded").catch(() => null);
    });
  }

  async clickFilterActive() {
    await this._step('Оценка сотрудника: нажать "Активные"', async () => {
      await this.filterActive.click();
      await this.page.waitForLoadState("domcontentloaded").catch(() => null);
    });
  }

  async clickFilterCompleted() {
    await this._step('Оценка сотрудника: нажать "Завершенные"', async () => {
      await this.filterCompleted.click();
      await this.page.waitForLoadState("domcontentloaded").catch(() => null);
    });
  }

  async isFilterActive(filterName) {
    return this._step(
      `Оценка сотрудника: проверить активность фильтра "${filterName}"`,
      async () => {
        const filterMap = {
          "Все статусы": this.filterAllStatuses,
          Активные: this.filterActive,
          Завершенные: this.filterCompleted,
        };
        const filter = filterMap[filterName];
        if (!filter) return false;

        const classes = await filter.getAttribute("class");
        return (
          classes?.includes("active") ||
          classes?.includes("selected") ||
          classes?.includes("--active")
        );
      },
    );
  }

  // -------- Таблица --------

  async assertTableVisible() {
    await this._step("Оценка сотрудника: таблица видна", async () => {
      // Дожидаемся загрузки данных (таблица рендерится асинхронно после заголовка)
      // Используем увеличенный таймаут — после тяжёлых операций сервер может отвечать дольше
      await this.historyTable.waitFor({
        state: "visible",
        timeout: 40_000,
      });
    });
  }

  async assertTableHeadersVisible() {
    await this._step("Оценка сотрудника: заголовки таблицы видны", async () => {
      await this.tableHeaderDate.waitFor({
        state: "visible",
        timeout: TIMEOUTS.PAGE_LOAD,
      });
      await this.tableHeaderName.waitFor({
        state: "visible",
        timeout: TIMEOUTS.PAGE_LOAD,
      });
      await this.tableHeaderStatus.waitFor({
        state: "visible",
        timeout: TIMEOUTS.PAGE_LOAD,
      });
    });
  }

  async getRowsCount() {
    return this._step(
      "Оценка сотрудника: получить количество строк",
      async () => {
        // Ждём появления таблицы
        await this.historyTable
          .waitFor({ state: "visible", timeout: TIMEOUTS.PAGE_LOAD })
          .catch(() => null);

        // Wait for table rows to load
        await this.page
          .waitForLoadState("domcontentloaded", { timeout: TIMEOUTS.SHORT })
          .catch(() => {});

        return this.tableRows.count();
      },
    );
  }

  async assertHasRows() {
    await this._step("Оценка сотрудника: таблица содержит строки", async () => {
      const count = await this.tableRows.count();
      if (count === 0) {
        throw new Error("Таблица не содержит строк");
      }
    });
  }

  async assertResultsButtonsVisible() {
    await this._step(
      'Оценка сотрудника: кнопки "Результаты" видны',
      async () => {
        const count = await this.resultsButtons.count();
        if (count === 0) {
          throw new Error('Кнопки "Результаты" не найдены');
        }
        await this.resultsButtons
          .first()
          .waitFor({ state: "visible", timeout: TIMEOUTS.PAGE_LOAD });
      },
    );
  }

  async clickFirstResultsButton() {
    await this._step(
      'Оценка сотрудника: нажать первую кнопку "Результаты"',
      async () => {
        await this.resultsButtons
          .first()
          .waitFor({ state: "visible", timeout: TIMEOUTS.PAGE_LOAD });
        await this.resultsButtons.first().click();
      },
    );
  }

  async getRowByIndex(index) {
    return this._step(
      `Оценка сотрудника: получить строку #${index + 1}`,
      async () => {
        return this.tableRows.nth(index);
      },
    );
  }

  async getRowStatus(row) {
    return this._step("Оценка сотрудника: получить статус строки", async () => {
      const statusCell = row
        .locator("td")
        .last()
        .or(row.locator('[class*="status"]'));
      return statusCell.textContent();
    });
  }

  // -------- Блок "Кто видит" --------

  async assertWhoSeesBlockVisible() {
    await this._step('Оценка сотрудника: блок "Кто видит" виден', async () => {
      await this.whoSeesBlock.waitFor({
        state: "visible",
        timeout: TIMEOUTS.PAGE_LOAD,
      });
    });
  }

  async assertWhoSeesDetailsVisible() {
    await this._step(
      'Оценка сотрудника: детали "Кто видит" видны',
      async () => {
        await this.whoSeesEmployee.waitFor({
          state: "visible",
          timeout: TIMEOUTS.PAGE_LOAD,
        });
        await this.whoSeesManagers.waitFor({
          state: "visible",
          timeout: TIMEOUTS.PAGE_LOAD,
        });
      },
    );
  }

  // -------- ScoreOnly: итоговая оценка в профиле --------

  /**
   * Найти строку таблицы по названию PR.
   * @param {string} prName - Название PR
   * @returns {import('@playwright/test').Locator}
   */
  getRowByPRName(prName) {
    return this.historyTable.locator("tbody tr").filter({ hasText: prName });
  }

  /**
   * Получить итоговую оценку (число) из строки PR.
   * Ячейка оценки содержит: "3.6 Высоко" или просто "3.6".
   * Парсим textContent — надёжнее, чем обход вложенных div.
   * @param {string} prName
   * @returns {Promise<string|null>} - Число оценки или null
   */
  async getFinalScoreValue(prName) {
    return this._step(`Получить итоговую оценку для "${prName}"`, async () => {
      const row = this.getRowByPRName(prName);
      await row.waitFor({ state: "visible", timeout: TIMEOUTS.PAGE_LOAD });
      const lastCell = row.locator("td").last();
      const text = (await lastCell.textContent())?.trim();
      // Извлекаем число из начала: "3.6 Высоко" → "3.6", "4.2" → "4.2"
      const match = text?.match(/^(\d+(?:[.,]\d+)?)/);
      return match ? match[1] : null;
    });
  }

  /**
   * Получить текстовую характеристику из строки PR.
   * Ячейка: "3.6 Высоко" → парсим текст после числа.
   * @param {string} prName
   * @returns {Promise<string|null>} - Текст характеристики или null
   */
  async getFinalScoreLabel(prName) {
    return this._step(`Получить характеристику для "${prName}"`, async () => {
      const row = this.getRowByPRName(prName);
      await row.waitFor({ state: "visible", timeout: TIMEOUTS.PAGE_LOAD });
      const lastCell = row.locator("td").last();
      const text = (await lastCell.textContent())?.trim();
      // Убираем число из начала: "3.6 Высоко" → "Высоко"
      const withoutScore = text?.replace(/^\d+(?:[.,]\d+)?/, "").trim();
      return withoutScore || null;
    });
  }

  /**
   * Проверить, что для PR отображается scoreOnly: число + характеристика, БЕЗ кнопки "Результаты".
   * @param {string} prName
   * @param {Object} expected
   * @param {string} [expected.score] - Ожидаемая числовая оценка (напр. "3.6")
   * @param {string} [expected.label] - Ожидаемая характеристика (напр. "Высоко")
   */
  async assertScoreOnlyDisplayed(prName, { score, label } = {}) {
    await this._step(
      `ScoreOnly для "${prName}": оценка видна, "Результаты" нет`,
      async () => {
        const row = this.getRowByPRName(prName);
        await row.waitFor({ state: "visible", timeout: TIMEOUTS.PAGE_LOAD });

        // Кнопка/ссылка "Результаты" НЕ должна существовать в строке
        const resultsLink = row.locator("a").filter({ hasText: /результаты/i });
        const resultsCount = await resultsLink.count();
        if (resultsCount > 0) {
          throw new Error(
            `Ожидалось scoreOnly, но найдена ссылка "Результаты" для "${prName}"`,
          );
        }

        // Должно быть число оценки
        const scoreValue = await this.getFinalScoreValue(prName);
        if (!scoreValue) {
          throw new Error(
            `ScoreOnly: числовая оценка не найдена для "${prName}"`,
          );
        }
        if (score && scoreValue !== score) {
          throw new Error(
            `ScoreOnly: ожидалась оценка "${score}", получено "${scoreValue}"`,
          );
        }

        // Должна быть текстовая характеристика (если ожидается)
        if (label) {
          const scoreLabel = await this.getFinalScoreLabel(prName);
          if (scoreLabel !== label) {
            throw new Error(
              `ScoreOnly: ожидалась характеристика "${label}", получено "${scoreLabel}"`,
            );
          }
        }
      },
    );
  }

  /**
   * Проверить, что для PR отображается полный доступ: есть ссылка "Результаты".
   * @param {string} prName
   */
  async assertFullResultsDisplayed(prName) {
    await this._step(
      `Full access для "${prName}": ссылка "Результаты" видна`,
      async () => {
        const row = this.getRowByPRName(prName);
        await row.waitFor({ state: "visible", timeout: TIMEOUTS.PAGE_LOAD });
        const resultsLink = row.locator("a").filter({ hasText: /результаты/i });
        await resultsLink.waitFor({
          state: "visible",
          timeout: TIMEOUTS.SHORT,
        });
      },
    );
  }

  /**
   * Проверить, что для PR НЕТ ни оценки, ни кнопки "Результаты" (none access).
   * @param {string} prName
   */
  async assertNoAccessDisplayed(prName) {
    await this._step(
      `No access для "${prName}": ни оценки, ни "Результаты"`,
      async () => {
        const row = this.getRowByPRName(prName);
        const rowCount = await row.count();

        // При none доступе строка PR может полностью исчезнуть из таблицы
        if (rowCount === 0) {
          return; // Строки нет в DOM — корректное поведение для none access
        }

        // Если строка есть — проверяем что нет ни ссылки, ни оценки
        const resultsLink = row.locator("a").filter({ hasText: /результаты/i });
        const resultsCount = await resultsLink.count();
        if (resultsCount > 0) {
          throw new Error(
            `Ожидалось no access, но найдена ссылка "Результаты" для "${prName}"`,
          );
        }

        const scoreValue = await this.getFinalScoreValue(prName);
        if (scoreValue) {
          throw new Error(
            `Ожидалось no access, но найдена оценка "${scoreValue}" для "${prName}"`,
          );
        }
      },
    );
  }

  /**
   * Проверить, что ссылка "Результаты" отсутствует в строке PR (нет в DOM).
   * @param {string} prName
   */
  async assertResultsButtonHidden(prName) {
    await this._step(
      `Ссылка "Результаты" отсутствует для "${prName}"`,
      async () => {
        const row = this.getRowByPRName(prName);
        await row.waitFor({ state: "visible", timeout: TIMEOUTS.PAGE_LOAD });
        const resultsLink = row.locator("a").filter({ hasText: /результаты/i });
        const count = await resultsLink.count();
        if (count > 0) {
          throw new Error(
            `Ссылка "Результаты" найдена в DOM для "${prName}", ожидалось отсутствие`,
          );
        }
      },
    );
  }

  // -------- Сортировка --------

  async assertSortVisible() {
    await this._step("Оценка сотрудника: сортировка видна", async () => {
      await this.sortNewestFirst.waitFor({
        state: "visible",
        timeout: TIMEOUTS.PAGE_LOAD,
      });
    });
  }

  // -------- Страница результатов --------

  /**
   * Проверить, что страница результатов загружена после перехода по ссылке "Результаты".
   * Страница результатов имеет URL вида /performance-reviews/{id}/results/ или /staff/performance-reviews/
   */
  async assertResultsPageLoaded() {
    await this._step(
      "Страница результатов: контент загружен",
      async () => {
        const { expect } = await import("@playwright/test");
        await this.page.waitForLoadState("domcontentloaded");
        await this.page.waitForURL(/performance-reviews/, {
          timeout: TIMEOUTS.PAGE_LOAD,
        });
        const url = this.page.url();
        expect(url, "URL должен содержать /performance-reviews/").toMatch(
          /performance-reviews/,
        );
      },
    );
  }
}
