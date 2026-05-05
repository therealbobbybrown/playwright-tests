// pages/ManagerDashboardPage.js
// Page Object для дашборда руководителя "Моя команда" (прогресс PR подчинённых)

import { expect } from "@playwright/test";
import { BasePage } from "./BasePage.js";
import { TIMEOUTS } from "../tests/utils/constants.js";
import { SELECTORS } from "../tests/utils/selectors.js";
import { buildDashboardTeamUrl, PR_ROUTES } from "../tests/utils/pr-urls.js";

/**
 * Статусы прохождения оценки для подчинённых
 */
export const SUBORDINATE_STATUSES = {
  /** Коллеги не предложены (красный) */
  COLLEAGUES_NOT_PROPOSED: "colleagues_not_proposed",
  /** Коллеги предложены, но не утверждены (оранжевый) */
  COLLEAGUES_NOT_APPROVED: "colleagues_not_approved",
  /** Оценка в процессе (жёлтый) */
  IN_PROGRESS: "in_progress",
  /** Оценка пройдена (зелёный) */
  COMPLETED: "completed",
  /** Оценка не пройдена / не начата (серый) */
  NOT_COMPLETED: "not_completed",
};

/**
 * Направления оценки
 */
export const ASSESSMENT_DIRECTIONS = {
  SELF: "self",
  MANAGER: "manager",
  COLLEAGUES: "colleagues",
  SUBORDINATES: "subordinates",
};

/**
 * Page Object для дашборда руководителя.
 * Отображает прогресс прохождения PR для подчинённых.
 */
export class ManagerDashboardPage extends BasePage {
  /**
   * @param {import('@playwright/test').Page} page
   * @param {import('@playwright/test').TestInfo} [testInfo]
   */
  constructor(page, testInfo) {
    super(page, testInfo);

    // ========================
    // URL PATTERNS
    // ========================
    this.urlRe = /\/performance-reviews\/dashboard-team\/?($|\?)/;

    // ========================
    // ЗАГОЛОВОК И БАЗОВЫЕ ЭЛЕМЕНТЫ
    // ========================
    this.heading = this.page.getByRole("heading", { level: 1 }).first();
    this.pageTitle = this.page.locator('h1, [class*="Title"]').first();

    // ========================
    // ФИЛЬТРЫ
    // ========================
    /** Выбор Performance Review */
    this.prSelect = this.page
      .getByRole("button", { name: /выберите оценку|performance review/i })
      .first();

    /** Фильтр по статусу */
    this.statusFilter = this.page
      .getByRole("button", { name: /статус/i })
      .first();

    /** Поле поиска сотрудника */
    this.searchInput = this.page.getByPlaceholder(/найти|поиск/i).first();

    // ========================
    // ТАБЛИЦА ПОДЧИНЁННЫХ
    // ========================
    this.table = this.page.locator('table[class*="Table"]').first();
    this.tableHeaders = this.table.locator("thead th");
    this.tableRows = this.table.locator("tbody tr");

    // ========================
    // КНОПКИ ДЕЙСТВИЙ
    // ========================
    /** Кнопки "Результаты" в строках */
    this.resultsButtons = this.tableRows.getByRole("button", {
      name: /результаты/i,
    });

    /** Кнопки "Утвердить" в строках */
    this.approveButtons = this.tableRows.getByRole("button", {
      name: /утвердить/i,
    });

    /** Кнопка скачивания отчёта */
    this.downloadButton = this.page
      .getByRole("button", { name: /скачать|экспорт/i })
      .first();

    // ========================
    // EXPAND/COLLAPSE
    // ========================
    /** Стрелки раскрытия строк */
    this.expandToggles = this.tableRows.locator(
      '[class*="arrow"], [class*="toggle"], [class*="expand"]',
    );

    // ========================
    // МОДАЛЬНЫЕ ОКНА
    // ========================
    /** Модалка утверждения коллег */
    this.approveModal = this.page
      .locator('[class*="Modal"], [role="dialog"]')
      .first();

    // ========================
    // ПАГИНАЦИЯ
    // ========================
    this.pagination = this.page.locator('[class*="Pagination"]').first();
    this.nextPageButton = this.pagination
      .getByRole("button", { name: /next|следующ|>/i })
      .first();
    this.prevPageButton = this.pagination
      .getByRole("button", { name: /prev|предыдущ|</i })
      .first();
  }

  // ═══════════════════════════════════════════════════════════════════════
  // НАВИГАЦИЯ
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Перейти на дашборд руководителя
   * @param {Object} [options] - Опции навигации
   * @param {number|string} [options.prId] - ID Performance Review
   * @param {string} [options.status] - Фильтр по статусу
   */
  async goto(options = {}) {
    await this._step("Открыть дашборд руководителя", async () => {
      const url = buildDashboardTeamUrl(options);
      await this.page.goto(url);
      await this.page.waitForLoadState("networkidle");
    });
  }

  /**
   * Убедиться, что страница дашборда открыта
   */
  async assertOpened() {
    await this._step("Проверить, что дашборд открыт", async () => {
      await expect
        .poll(() => this.page.url(), { timeout: TIMEOUTS.PAGE_LOAD })
        .toMatch(this.urlRe);
    });
  }

  /**
   * Проверить базовую структуру страницы
   */
  async assertBaseLayout() {
    await this._step("Проверить базовые элементы дашборда", async () => {
      await this.assertOpened();
      await expect(this.table).toBeVisible({ timeout: TIMEOUTS.MEDIUM });
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // РАБОТА С ТАБЛИЦЕЙ
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Получить количество подчинённых в таблице
   * @returns {Promise<number>}
   */
  async getSubordinatesCount() {
    return this._step("Получить количество подчинённых", async () => {
      const count = await this.tableRows.count();
      console.log(`✓ Найдено подчинённых: ${count}`);
      return count;
    });
  }

  /**
   * Получить строку таблицы по имени сотрудника
   * @param {string} name - Имя сотрудника
   * @returns {import('@playwright/test').Locator}
   */
  getRowByName(name) {
    return this.tableRows
      .filter({
        has: this.page.locator("td").first().filter({ hasText: name }),
      })
      .first();
  }

  /**
   * Получить строку таблицы по индексу
   * @param {number} index - Индекс строки (0-based)
   * @returns {import('@playwright/test').Locator}
   */
  getRowByIndex(index) {
    return this.tableRows.nth(index);
  }

  /**
   * Получить имя сотрудника из строки
   * @param {number} index - Индекс строки
   * @returns {Promise<string>}
   */
  async getNameByIndex(index) {
    return this._step(`Получить имя сотрудника #${index + 1}`, async () => {
      const row = this.tableRows.nth(index);
      const nameCell = row.locator("td").first();
      const text = await nameCell.innerText();
      return text.split("\n")[0].trim();
    });
  }

  /**
   * Получить список всех имён подчинённых
   * @returns {Promise<string[]>}
   */
  async getAllNames() {
    return this._step("Получить список всех подчинённых", async () => {
      const count = await this.tableRows.count();
      const names = [];
      for (let i = 0; i < count; i++) {
        const name = await this.getNameByIndex(i);
        names.push(name);
      }
      console.log(`✓ Подчинённые: ${names.join(", ")}`);
      return names;
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // СТАТУСЫ
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Получить ячейку статуса для направления
   * @param {string} name - Имя сотрудника
   * @param {string} direction - Направление оценки (self, manager, colleagues, subordinates)
   * @returns {import('@playwright/test').Locator}
   */
  getStatusCell(name, direction) {
    const row = this.getRowByName(name);
    // Колонки: Имя | Самооценка | Руководитель | Коллеги | Подчинённые | Действия
    const columnIndexMap = {
      [ASSESSMENT_DIRECTIONS.SELF]: 1,
      [ASSESSMENT_DIRECTIONS.MANAGER]: 2,
      [ASSESSMENT_DIRECTIONS.COLLEAGUES]: 3,
      [ASSESSMENT_DIRECTIONS.SUBORDINATES]: 4,
    };
    const colIndex = columnIndexMap[direction] || 1;
    return row.locator("td").nth(colIndex);
  }

  /**
   * Получить текст статуса для направления
   * @param {string} name - Имя сотрудника
   * @param {string} direction - Направление оценки
   * @returns {Promise<string>}
   */
  async getStatusText(name, direction) {
    return this._step(
      `Получить статус "${direction}" для "${name}"`,
      async () => {
        const cell = this.getStatusCell(name, direction);
        const text = await cell.innerText();
        return text.trim();
      },
    );
  }

  /**
   * Получить CSS класс статуса (для проверки цвета)
   * @param {string} name - Имя сотрудника
   * @param {string} direction - Направление оценки
   * @returns {Promise<string>}
   */
  async getStatusClassName(name, direction) {
    return this._step(
      `Получить класс статуса "${direction}" для "${name}"`,
      async () => {
        const cell = this.getStatusCell(name, direction);
        const badge = cell
          .locator(
            '[class*="badge"], [class*="Badge"], [class*="status"], [class*="Status"]',
          )
          .first();
        const className = await badge.getAttribute("class");
        return className || "";
      },
    );
  }

  /**
   * Проверить, что статус имеет определённый цвет
   * @param {string} name - Имя сотрудника
   * @param {string} direction - Направление оценки
   * @param {string} expectedColor - Ожидаемый цвет (red, orange, yellow, green, gray)
   * @returns {Promise<boolean>}
   */
  async hasStatusColor(name, direction, expectedColor) {
    const className = await this.getStatusClassName(name, direction);
    const colorPatterns = {
      red: /red|error|danger|critical/i,
      orange: /orange|warning|pending/i,
      yellow: /yellow|progress|active/i,
      green: /green|success|complete/i,
      gray: /gray|grey|inactive|disabled/i,
    };
    const pattern = colorPatterns[expectedColor];
    return pattern ? pattern.test(className) : false;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // КНОПКИ ДЕЙСТВИЙ
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Нажать кнопку "Результаты" для сотрудника
   * @param {string} name - Имя сотрудника
   */
  async clickResults(name) {
    await this._step(`Нажать "Результаты" для "${name}"`, async () => {
      const row = this.getRowByName(name);
      await row.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
      const button = row.getByRole("button", { name: /результаты/i }).first();
      await button.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
      await button.click();
    });
  }

  /**
   * Нажать кнопку "Утвердить" для сотрудника
   * @param {string} name - Имя сотрудника
   */
  async clickApprove(name) {
    await this._step(`Нажать "Утвердить" для "${name}"`, async () => {
      const row = this.getRowByName(name);
      await row.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
      const button = row.getByRole("button", { name: /утвердить/i }).first();
      await button.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
      await button.click();
    });
  }

  /**
   * Проверить, видна ли кнопка "Утвердить" для сотрудника
   * @param {string} name - Имя сотрудника
   * @returns {Promise<boolean>}
   */
  async isApproveButtonVisible(name) {
    return this._step(
      `Проверить кнопку "Утвердить" для "${name}"`,
      async () => {
        const row = this.getRowByName(name);
        const button = row.getByRole("button", { name: /утвердить/i }).first();
        return button
          .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
          .then(() => true)
          .catch(() => false);
      },
    );
  }

  /**
   * Подтвердить утверждение коллег в модальном окне
   */
  async confirmApproval() {
    await this._step("Подтвердить утверждение коллег", async () => {
      await this.approveModal.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MODAL_OPEN,
      });
      const confirmButton = this.approveModal
        .getByRole("button", { name: /утвердить|да|подтвердить|ок/i })
        .first();
      await confirmButton.click();
      await this.approveModal.waitFor({
        state: "hidden",
        timeout: TIMEOUTS.MODAL_CLOSE,
      });
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // EXPAND/COLLAPSE СТРОК
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Раскрыть строку сотрудника для просмотра деталей
   * @param {string} name - Имя сотрудника
   */
  async expandRow(name) {
    await this._step(`Раскрыть детали для "${name}"`, async () => {
      const row = this.getRowByName(name);
      const toggle = row
        .locator(
          '[class*="arrow"], [class*="toggle"], [class*="expand"], [class*="chevron"]',
        )
        .first();

      if (await toggle.isVisible()) {
        await toggle.click();
      } else {
        // Если нет специальной кнопки, кликаем на строку
        await row.click();
      }
      // Ждём появления раскрытого контента
      const expandedContent = row
        .locator('+ tr[class*="expanded"], + tr[class*="detail"]')
        .first();
      await expandedContent
        .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
        .catch(() => {});
    });
  }

  /**
   * Свернуть строку сотрудника
   * @param {string} name - Имя сотрудника
   */
  async collapseRow(name) {
    await this._step(`Свернуть детали для "${name}"`, async () => {
      const row = this.getRowByName(name);
      const toggle = row
        .locator(
          '[class*="arrow"], [class*="toggle"], [class*="expand"], [class*="chevron"]',
        )
        .first();

      if (await toggle.isVisible()) {
        await toggle.click();
      } else {
        await row.click();
      }
      // Ждём скрытия раскрытого контента
      const expandedContent = row
        .locator('+ tr[class*="expanded"], + tr[class*="detail"]')
        .first();
      await expandedContent
        .waitFor({ state: "hidden", timeout: TIMEOUTS.SHORT })
        .catch(() => {});
    });
  }

  /**
   * Проверить, раскрыта ли строка
   * @param {string} name - Имя сотрудника
   * @returns {Promise<boolean>}
   */
  async isRowExpanded(name) {
    const row = this.getRowByName(name);
    // Проверяем наличие раскрытого контента или класс expanded
    const expandedContent = row
      .locator('+ tr[class*="expanded"], + tr[class*="detail"]')
      .first();
    const hasExpandedClass = await row.evaluate((el) =>
      el.className.includes("expanded"),
    );
    const hasExpandedContent = await expandedContent
      .isVisible()
      .catch(() => false);
    return hasExpandedClass || hasExpandedContent;
  }

  /**
   * Получить контент раскрытой строки
   * @param {string} name - Имя сотрудника
   * @returns {import('@playwright/test').Locator}
   */
  getExpandedContent(name) {
    const row = this.getRowByName(name);
    return row
      .locator(
        '+ tr[class*="expanded"], + tr[class*="detail"], [class*="expandedContent"]',
      )
      .first();
  }

  /**
   * Получить список респондентов из раскрытой строки
   * @param {string} name - Имя сотрудника
   * @returns {Promise<string[]>}
   */
  async getRespondents(name) {
    return this._step(`Получить респондентов для "${name}"`, async () => {
      const content = this.getExpandedContent(name);
      const respondentItems = content
        .locator('[class*="respondent"], [class*="Respondent"], li')
        .all();
      const items = await respondentItems;
      const names = [];
      for (const item of items) {
        const text = await item.innerText();
        names.push(text.trim());
      }
      return names;
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ФИЛЬТРЫ
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Выбрать Performance Review в фильтре
   * @param {string} prName - Название PR
   */
  async selectPR(prName) {
    await this._step(`Выбрать PR "${prName}"`, async () => {
      await this.prSelect.click();

      // Ждём появления выпадающего списка
      const option = this.page
        .locator(SELECTORS.ROLE_OPTION)
        .filter({ hasText: prName })
        .first();
      await option.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });
      await option.click();

      // Ждём обновления таблицы после выбора
      await this.table.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
    });
  }

  /**
   * Выбрать статус в фильтре
   * @param {string} status - Статус для фильтрации
   */
  async selectStatus(status) {
    await this._step(`Выбрать статус "${status}"`, async () => {
      await this.statusFilter.click();

      // Ждём появления выпадающего списка
      const option = this.page
        .locator(SELECTORS.ROLE_OPTION)
        .filter({ hasText: status })
        .first();
      await option.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });
      await option.click();

      // Ждём обновления таблицы после применения фильтра
      await this.table.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
    });
  }

  /**
   * Найти сотрудника через поиск
   * @param {string} query - Поисковый запрос
   */
  async search(query) {
    await this._step(`Поиск: "${query}"`, async () => {
      await this.searchInput.fill(query);
      // Ждём обновления таблицы после ввода в поиск
      await this.table.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
    });
  }

  /**
   * Очистить поиск
   */
  async clearSearch() {
    await this._step("Очистить поиск", async () => {
      await this.searchInput.clear();
      // Ждём обновления таблицы после очистки поиска
      await this.table.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // КОЛОНКИ ТАБЛИЦЫ
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Получить заголовки колонок таблицы
   * @returns {Promise<string[]>}
   */
  async getColumnHeaders() {
    return this._step("Получить заголовки колонок", async () => {
      const headers = await this.tableHeaders.allInnerTexts();
      const normalized = headers
        .map((h) => h.replace(/\s+/g, " ").trim())
        .filter(Boolean);
      console.log(`✓ Колонки: ${normalized.join(" | ")}`);
      return normalized;
    });
  }

  /**
   * Проверить наличие колонки направления
   * @param {string} direction - Направление (self, manager, colleagues, subordinates)
   * @returns {Promise<boolean>}
   */
  async hasDirectionColumn(direction) {
    const headers = await this.getColumnHeaders();
    const directionNames = {
      [ASSESSMENT_DIRECTIONS.SELF]: /самооценк/i,
      [ASSESSMENT_DIRECTIONS.MANAGER]: /руководител/i,
      [ASSESSMENT_DIRECTIONS.COLLEAGUES]: /коллег/i,
      [ASSESSMENT_DIRECTIONS.SUBORDINATES]: /подчин[её]нн/i,
    };
    const pattern = directionNames[direction];
    return pattern ? headers.some((h) => pattern.test(h)) : false;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ТЕПЛОВАЯ КАРТА
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Получить ячейку тепловой карты для компетенции
   * @param {string} name - Имя сотрудника
   * @param {string} competencyName - Название компетенции
   * @returns {import('@playwright/test').Locator}
   */
  getHeatmapCell(name, competencyName) {
    const expandedContent = this.getExpandedContent(name);
    return expandedContent
      .locator(
        `[data-competency="${competencyName}"], td:has-text("${competencyName}")`,
      )
      .first();
  }

  /**
   * Получить значение из тепловой карты
   * @param {string} name - Имя сотрудника
   * @param {string} competencyName - Название компетенции
   * @returns {Promise<string|null>}
   */
  async getHeatmapValue(name, competencyName) {
    return this._step(
      `Получить оценку "${competencyName}" для "${name}"`,
      async () => {
        const cell = this.getHeatmapCell(name, competencyName);
        if (await cell.isVisible()) {
          const text = await cell.innerText();
          return text.trim();
        }
        return null;
      },
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // СКРИНШОТЫ И ОТЛАДКА
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Сделать скриншот дашборда
   * @param {string} [name='dashboard'] - Имя файла
   */
  async takeScreenshot(name = "dashboard") {
    await this.page.screenshot({
      path: `test-results/manager-dashboard-${name}.png`,
      fullPage: false,
    });
  }
}
