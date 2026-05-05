import { expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { BasePage } from "./BasePage.js";
import { TIMEOUTS } from "../tests/utils/constants.js";

/**
 * Page Object для вкладки «Распределение оценок» дашборда «Моя команда».
 * URL: /ru/dashboard/?tab=performanceReviewSummary
 */
export class ScoreDistributionTab extends BasePage {
  /**
   * @param {import('@playwright/test').Page} page
   * @param {import('@playwright/test').TestInfo} [testInfo]
   */
  constructor(page, testInfo) {
    super(page, testInfo);

    this.baseUrl = process.env.BASE_URL?.replace(/\/(ru\/)?login\/?$/, '') || '';
    this.tabUrl = `${this.baseUrl}/ru/dashboard/?tab=performanceReviewSummary`;

    // ─── Заголовки ──────────────────────────────────────────
    this.pageHeading = this.page
      .getByRole("heading", { level: 1, name: /Моя команда/i })
      .first();
    this.tabHeading = this.page
      .getByRole("heading", { level: 2, name: /Распределение оценок/i })
      .first();

    // ─── Вкладки ────────────────────────────────────────────
    this.teamEvaluationTab = this.page
      .getByRole("button", { name: "Оценка команды" })
      .first();
    this.scoreDistributionTab = this.page
      .getByRole("button", { name: "Распределение оценок" })
      .first();
    this.developmentPlansTab = this.page
      .getByRole("button", { name: "Планы развития" })
      .first();

    // ─── Контейнер вкладки ──────────────────────────────────
    this.container = this.page
      .locator('[class*="PerformanceReviewSummaryTab_container"]')
      .first();

    // ─── Фильтр «Сотрудники» (react-select) ────────────────
    this.employeesFilterContainer = this.container
      .locator('[class*="Select_input-group"]')
      .first();
    this.employeesFilterControl = this.employeesFilterContainer
      .locator(".react-select__control")
      .first();
    this.employeesFilterValue = this.employeesFilterContainer
      .locator(".react-select__single-value")
      .first();
    this.employeesFilterDropdownIndicator = this.employeesFilterContainer
      .locator(".react-select__indicator")
      .first();
    this.employeesFilterCombobox = this.employeesFilterContainer
      .getByRole("combobox")
      .first();
    this.employeesFilterOptions = this.page.locator(".react-select__option");

    // ─── Фильтр «Группа» ───────────────────────────────────
    this.groupFilterButton = this.container
      .getByRole("button", { name: "Группа" })
      .first();

    // Панель выбора групп (SheetModal-портал, рендерится в body)
    // Элементы панели не скоупятся к контейнеру — их классы уникальны на странице
    this.groupPanel = this.page.locator('[class*="Groups_container"]');
    this.groupPanelTitle = this.page
      .locator('[class*="UserQuerySelect_title"]')
      .first();
    this.groupPanelClose = this.page
      .locator('[class*="UserQuerySelect_closeButton"]')
      .first();
    this.groupPanelSearch = this.page
      .locator('[class*="Groups_container"]')
      .getByPlaceholder("Название группы")
      .first();
    this.groupPanelItems = this.page.locator('[class*="GroupOption_row"]');
    this.groupPanelApply = this.page
      .locator(".react-modal-sheet-container")
      .getByRole("button", { name: "Применить" });

    // ─── Фильтр «Период оценки» (datepicker, readOnly) ─────
    this.periodInput = this.container
      .locator("#input-performanceReviewSummaryFilters__period")
      .first();
    this.periodCalendarButton = this.periodInput
      .locator("..")
      .locator("button")
      .first();

    // ─── Datepicker-портал (air-datepicker в react-tiny-popover) ──
    this.datepickerPopover = this.page.locator(".react-tiny-popover-container");
    this.datepicker = this.page.locator(".air-datepicker");
    this.datepickerNavTitle = this.page.locator(".air-datepicker-nav--title");
    this.datepickerPrevMonth = this.page.locator('[data-action="prev"]');
    this.datepickerNextMonth = this.page.locator('[data-action="next"]');
    this.datepickerDayCells = this.page.locator(
      ".air-datepicker-cell.-day-",
    );

    // ─── Выбор оценки (PR) ───────────────────────────────────
    this.prSelectorButton = this.page
      .getByRole("button", { name: /Выберите оценку/i })
      .first();

    // ─── Кнопка «Скачать сводный отчёт» ─────────────────────
    this.downloadSummaryButton = this.page
      .getByRole("button", { name: /Скачать сводный отчет/i })
      .first();

    // ─── Кнопка сброса фильтров (×) ────────────────────────
    this.resetButton = this.page
      .locator('[class*="PerformanceReviewSummaryTab_resetButton"]')
      .first();

    // ─── Поиск ──────────────────────────────────────────────
    this.searchInput = this.page
      .locator("#performanceReviewSummaryFilters__q")
      .first();

    // ─── Таблица ────────────────────────────────────────────
    this.table = this.page.locator('table[class*="Table_table"]').last();
    this.tableHeaders = this.table.locator("thead th");
    this.tableRows = this.table.locator("tbody tr");

    // ─── График распределения характеристик ──────────
    this.distributionChart = this.container
      .locator('[class*="PerformanceReviewSummaryTab_characteristics"]')
      .first();
    this.chartHistogram = this.distributionChart
      .locator('[class*="CharacteristicsHistogram_histogram"]')
      .first();

    // ─── Переключатель калибровки (внутри графика) ───
    this.calibrationToggle = this.distributionChart
      .locator('[class*="TabButtons_buttons"]')
      .first();
    this.allScoresTab = this.calibrationToggle.getByRole("button", {
      name: /Все оценки/i,
    });
    this.calibratedTab = this.calibrationToggle.getByRole("button", {
      name: /Прошедшие калибровку/i,
    });

    // ─── Фильтр «Характеристика» (react-select) ─────
    this.characteristicFilterContainer = this.container
      .locator('[class*="Select_input-group"]')
      .nth(1);
    this.characteristicFilterControl = this.characteristicFilterContainer
      .locator(".react-select__control")
      .first();
    this.characteristicFilterValue = this.characteristicFilterContainer
      .locator(".react-select__single-value")
      .first();
    this.characteristicFilterPlaceholder = this.characteristicFilterContainer
      .locator(".react-select__placeholder")
      .first();
    this.characteristicFilterClear = this.characteristicFilterContainer
      .locator(".react-select__clear-indicator")
      .first();
    this.characteristicFilterCombobox = this.characteristicFilterContainer
      .getByRole("combobox")
      .first();
  }

  // ═══════════════════════════════════════════════════════════
  // НАВИГАЦИЯ
  // ═══════════════════════════════════════════════════════════

  /** Открыть вкладку «Распределение оценок» через навигацию */
  async open() {
    await this._step("Открыть вкладку «Распределение оценок»", async () => {
      await this.page.goto(this.tabUrl);
      await this.page.waitForLoadState("networkidle");
      // URL-параметр tab= не всегда активирует вкладку — кликаем явно
      await this.scoreDistributionTab.click();
      await expect(this.tabHeading).toBeVisible({ timeout: TIMEOUTS.MEDIUM });
      // Дождаться загрузки данных таблицы (заголовки колонок)
      await expect(this.tableHeaders.first()).toBeVisible({
        timeout: TIMEOUTS.MEDIUM,
      });
      await this.page.waitForLoadState("networkidle");
    });
  }

  /** Переключиться на вкладку. По умолчанию — «Распределение оценок», можно указать другую. */
  async switchToTab(tabName = "scoreDistribution") {
    const tabs = {
      scoreDistribution: this.scoreDistributionTab,
      teamEvaluation: this.teamEvaluationTab,
      developmentPlans: this.developmentPlansTab,
    };
    const tab = tabs[tabName] || this.scoreDistributionTab;
    const label =
      tabName === "scoreDistribution" ? "Распределение оценок" : tabName;
    await this._step(`Переключиться на вкладку «${label}»`, async () => {
      await tab.click();
      await this.page.waitForLoadState("domcontentloaded");
    });
  }

  /** Проверить, что вкладка видна на дашборде */
  async assertTabVisible() {
    await this._step("Вкладка «Распределение оценок» видна", async () => {
      await expect(this.scoreDistributionTab).toBeVisible({
        timeout: TIMEOUTS.MEDIUM,
      });
    });
  }

  /** Проверить, что вкладка НЕ видна (для обычного сотрудника) */
  async assertTabNotVisible() {
    await this._step("Вкладка «Распределение оценок» НЕ видна", async () => {
      await expect(this.scoreDistributionTab).not.toBeVisible({
        timeout: TIMEOUTS.SHORT,
      });
    });
  }

  /** Проверить, что вкладка активна */
  async assertTabActive() {
    await this._step("Вкладка «Распределение оценок» активна", async () => {
      // Ожидаем появления CSS-класса active на кнопке вкладки
      await expect(this.scoreDistributionTab).toHaveClass(/active/, {
        timeout: TIMEOUTS.MEDIUM,
      });
    });
  }

  // ═══════════════════════════════════════════════════════════
  // ВЫБОР ОЦЕНКИ (PR)
  // ═══════════════════════════════════════════════════════════

  /**
   * Выбрать оценку (PR) из выпадающего списка по названию (или части).
   * Поддерживает пагинацию: кликает «Показать ещё» до нахождения нужного PR.
   * @param {string} prTitle - Название PR (или подстрока)
   */
  async selectPR(prTitle) {
    await this._step(`Выбрать оценку «${prTitle}»`, async () => {
      await this.prSelectorButton.click();

      const maxPages = 5;
      for (let i = 0; i < maxPages; i++) {
        const prButton = this.page
          .getByRole("button", { name: prTitle })
          .first();
        const visible = await prButton
          .waitFor({ state: "visible", timeout: 3000 })
          .then(() => true)
          .catch(() => false);

        if (visible) {
          await prButton.click();
          await this.page.waitForLoadState("networkidle");
          return;
        }

        // Try "Показать ещё" button for pagination
        const showMore = this.page.getByRole("button", {
          name: /Показать ещ/i,
        });
        const hasMore = await showMore.isVisible().catch(() => false);
        if (!hasMore) break;
        await showMore.click();
        await this.page.waitForLoadState("networkidle");
      }

      throw new Error(`PR «${prTitle}» не найден в выпадающем списке оценок`);
    });
  }

  // ═══════════════════════════════════════════════════════════
  // ФИЛЬТР «СОТРУДНИКИ»
  // ═══════════════════════════════════════════════════════════

  /** Получить текущее значение фильтра «Сотрудники» */
  async getEmployeesFilterValue() {
    return this._step("Получить значение фильтра «Сотрудники»", async () => {
      return this.employeesFilterValue.innerText();
    });
  }

  /** Открыть dropdown фильтра «Сотрудники» и вернуть список опций */
  async getEmployeesFilterOptions() {
    return this._step("Получить опции фильтра «Сотрудники»", async () => {
      await this.employeesFilterControl.click();
      const listbox = this.page.getByRole("listbox");
      await listbox.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });
      const options = await this.employeesFilterOptions.allInnerTexts();
      await this.page.keyboard.press("Escape");
      return options;
    });
  }

  /** Выбрать опцию в фильтре «Сотрудники» */
  async selectEmployeesOption(optionText) {
    await this._step(
      `Выбрать «${optionText}» в фильтре «Сотрудники»`,
      async () => {
        await this.page.waitForLoadState("networkidle");

        const listbox = this.page.getByRole("listbox");
        await this._openEmployeesDropdown(listbox);

        const option = listbox.getByRole("option", {
          name: optionText,
          exact: true,
        });
        await option.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });
        await option.click();

        await expect(this.employeesFilterValue).toHaveText(optionText, {
          timeout: TIMEOUTS.MEDIUM,
        });
      },
    );
  }

  /** Открыть dropdown «Сотрудники» с retry-логикой */
  async _openEmployeesDropdown(listbox) {
    // Убедимся что dropdown закрыт перед открытием
    if (await listbox.isVisible().catch(() => false)) {
      await this.page.keyboard.press("Escape");
      await listbox.waitFor({ state: "hidden", timeout: 3000 }).catch(() => {});
    }

    // Стратегия 1: evaluate — focus + mousedown на combobox input
    await this.employeesFilterContainer.evaluate((container) => {
      const input = container.querySelector('input[role="combobox"]');
      if (input) {
        input.focus();
        input.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      }
    });

    try {
      await listbox.waitFor({ state: "visible", timeout: 2000 });
      return;
    } catch {
      /* fallback */
    }

    // Стратегия 2: click по control + fallback keyboard ArrowDown
    await this.employeesFilterControl.click();
    try {
      await listbox.waitFor({ state: "visible", timeout: 2000 });
      return;
    } catch {
      /* fallback */
    }

    // Стратегия 3: keyboard — focus combobox и ArrowDown
    await this.employeesFilterCombobox.focus();
    await this.page.keyboard.press("ArrowDown");
    await listbox.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });
  }

  // ═══════════════════════════════════════════════════════════
  // ФИЛЬТР «ГРУППА»
  // ═══════════════════════════════════════════════════════════

  /** Открыть панель выбора группы */
  async openGroupFilter() {
    await this._step("Открыть панель «Группа»", async () => {
      await this.groupFilterButton.click();
      await expect(this.groupPanelTitle).toBeVisible({
        timeout: TIMEOUTS.MODAL_OPEN,
      });
      // Дождаться загрузки списка групп (может грузиться асинхронно)
      await this.groupPanelItems
        .first()
        .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
        .catch(() => {});
    });
  }

  /** Получить список групп из панели */
  async getGroupNames() {
    return this._step("Получить список групп", async () => {
      // Проверяем видимость панели
      const panelVisible = await this.groupPanel.isVisible().catch(() => false);
      if (!panelVisible) return [];

      const items = this.groupPanelItems;
      const count = await items.count();
      const names = [];
      for (let i = 0; i < count; i++) {
        const nameEl = items
          .nth(i)
          .locator('[class*="GroupOption_name"]')
          .first();
        const name = await nameEl.innerText().catch(() => "");
        if (name) names.push(name.trim());
      }
      return names;
    });
  }

  /** Выбрать группу по имени */
  async selectGroup(groupName) {
    await this._step(`Выбрать группу «${groupName}»`, async () => {
      const item = this.groupPanelItems.filter({ hasText: groupName }).first();
      await item.click();
    });
  }

  /** Нажать «Применить» в панели групп */
  async applyGroupFilter() {
    await this._step("Применить фильтр «Группа»", async () => {
      await this.groupPanelApply.click();
      await expect(this.groupPanelTitle).not.toBeVisible({
        timeout: TIMEOUTS.MODAL_CLOSE,
      });
    });
  }

  /** Закрыть панель групп без применения */
  async closeGroupFilter() {
    await this._step("Закрыть панель «Группа»", async () => {
      await this.groupPanelClose.click();
      await expect(this.groupPanel).not.toBeVisible({
        timeout: TIMEOUTS.MODAL_CLOSE,
      });
    });
  }

  // ═══════════════════════════════════════════════════════════
  // ФИЛЬТР «ПЕРИОД ОЦЕНКИ»
  // ═══════════════════════════════════════════════════════════

  /** Получить текущее значение периода */
  async getPeriodValue() {
    return this._step("Получить значение фильтра «Период оценки»", async () => {
      return this.periodInput.inputValue();
    });
  }

  /** Открыть datepicker */
  async openPeriodPicker() {
    await this._step("Открыть datepicker «Период оценки»", async () => {
      await this.periodInput.click();
      await this.datepicker.waitFor({
        state: "visible",
        timeout: TIMEOUTS.SHORT,
      });
    });
  }

  /** Проверить, открыт ли datepicker */
  async isDatepickerOpen() {
    return this.datepickerPopover.isVisible().catch(() => false);
  }

  /** Навигация к конкретному месяцу/году в datepicker */
  async navigateToMonth(targetYear, targetMonth) {
    const monthNames = [
      "Январь",
      "Февраль",
      "Март",
      "Апрель",
      "Май",
      "Июнь",
      "Июль",
      "Август",
      "Сентябрь",
      "Октябрь",
      "Ноябрь",
      "Декабрь",
    ];
    await this._step(
      `Навигация к ${monthNames[targetMonth]} ${targetYear}`,
      async () => {
        for (let i = 0; i < 24; i++) {
          const titleText = await this.datepickerNavTitle.innerText();
          const yearMatch = titleText.match(/(\d{4})/);
          const currentYear = yearMatch ? parseInt(yearMatch[1], 10) : 0;
          const currentMonth = monthNames.findIndex((m) =>
            titleText.includes(m),
          );

          if (currentYear === targetYear && currentMonth === targetMonth) break;

          const currentTotal = currentYear * 12 + currentMonth;
          const targetTotal = targetYear * 12 + targetMonth;

          if (targetTotal < currentTotal) {
            await this.datepickerPrevMonth.click();
          } else {
            await this.datepickerNextMonth.click();
          }
          await this.page.waitForTimeout(100);
        }
      },
    );
  }

  /** Кликнуть конкретный день в datepicker */
  async clickDay(year, month, date) {
    await this._step(`Выбрать день ${date}.${month + 1}.${year}`, async () => {
      const cell = this.page.locator(
        `.air-datepicker-cell.-day-[data-year="${year}"][data-month="${month}"][data-date="${date}"]`,
      );
      await cell.click();
    });
  }

  /** Установить период: открыть datepicker, выбрать начало и конец диапазона */
  async setPeriod(startDate, endDate) {
    await this._step(
      `Установить период ${startDate.day}.${startDate.month + 1}.${startDate.year} – ${endDate.day}.${endDate.month + 1}.${endDate.year}`,
      async () => {
        await this.openPeriodPicker();

        await this.navigateToMonth(startDate.year, startDate.month);
        await this.clickDay(startDate.year, startDate.month, startDate.day);

        await this.navigateToMonth(endDate.year, endDate.month);
        await this.clickDay(endDate.year, endDate.month, endDate.day);

        // Datepicker закрывается автоматически после второго клика
        await this.page.waitForLoadState("networkidle");
      },
    );
  }

  // ═══════════════════════════════════════════════════════════
  // ПОИСК
  // ═══════════════════════════════════════════════════════════

  /** Ввести текст в поиск */
  async searchEmployee(query) {
    await this._step(`Поиск сотрудника: «${query}»`, async () => {
      await this.searchInput.fill(query);
    });
  }

  /** Очистить поле поиска */
  async clearSearch() {
    await this._step("Очистить поиск", async () => {
      await this.searchInput.fill("");
    });
  }

  // ═══════════════════════════════════════════════════════════
  // КНОПКА СБРОСА ФИЛЬТРОВ
  // ═══════════════════════════════════════════════════════════

  /** Проверить видимость кнопки сброса */
  async isResetButtonVisible() {
    return this._step("Проверить видимость кнопки сброса", async () => {
      return this.resetButton.isVisible();
    });
  }

  /** Нажать кнопку сброса */
  async clickReset() {
    await this._step("Нажать кнопку сброса фильтров", async () => {
      await this.resetButton.click();
      await this.page.waitForLoadState("networkidle");
    });
  }

  // ═══════════════════════════════════════════════════════════
  // ТАБЛИЦА
  // ═══════════════════════════════════════════════════════════

  /** Получить заголовки колонок */
  async getTableHeaders() {
    return this._step("Получить заголовки таблицы", async () => {
      const headers = await this.tableHeaders.allInnerTexts();
      return headers.map((t) => t.trim()).filter(Boolean);
    });
  }

  /** Получить количество строк */
  async getRowCount() {
    return this._step("Получить количество строк таблицы", async () => {
      return this.tableRows.count();
    });
  }

  /** Получить строку по имени сотрудника */
  getRowByName(name) {
    return this.tableRows.filter({ hasText: name }).first();
  }

  /** Получить список имён сотрудников */
  async getEmployeeNames() {
    return this._step("Получить имена сотрудников из таблицы", async () => {
      const count = await this.tableRows.count();
      const names = [];
      for (let i = 0; i < count; i++) {
        const firstCell = this.tableRows.nth(i).locator("td").first();
        // Имя в div.User_full-name-wrapper > первый div
        const nameEl = firstCell
          .locator('[class*="User_full-name-wrapper"] > div')
          .first();
        const text = await nameEl.innerText().catch(() => "");
        if (text) names.push(text.trim());
      }
      return names;
    });
  }

  /** Получить тексты ячеек «Название оценки» (3-я колонка) для всех строк */
  async getAssessmentTexts() {
    return this._step("Получить тексты «Название оценки» из таблицы", async () => {
      const cells = this.tableRows.locator("td:nth-child(3)");
      return cells.allTextContents();
    });
  }

  /** Получить текст оценки до калибровки для сотрудника */
  async getScoreBeforeCalibration(name) {
    return this._step(
      `Получить оценку «до калибровки» для ${name}`,
      async () => {
        const row = this.getRowByName(name);
        const cell = row.locator("td").nth(1);
        return cell.innerText();
      },
    );
  }

  /** Получить текст оценки после калибровки для сотрудника */
  async getScoreAfterCalibration(name) {
    return this._step(
      `Получить оценку «после калибровки» для ${name}`,
      async () => {
        const row = this.getRowByName(name);
        const cell = row.locator("td").nth(2);
        return cell.innerText();
      },
    );
  }

  /** Получить название оценки для сотрудника */
  async getAssessmentName(name) {
    return this._step(`Получить название оценки для ${name}`, async () => {
      const row = this.getRowByName(name);
      const cell = row.locator("td").nth(3);
      return cell.innerText();
    });
  }

  /** Проверить, видна ли кнопка «Результаты» для сотрудника */
  async isResultsButtonVisible(name) {
    return this._step(`Проверить кнопку «Результаты» для ${name}`, async () => {
      const row = this.getRowByName(name);
      const btn = row.getByRole("button", { name: "Результаты" });
      return btn.isVisible();
    });
  }

  /** Нажать кнопку «Результаты» для сотрудника */
  async clickResults(name) {
    await this._step(`Нажать «Результаты» для ${name}`, async () => {
      const row = this.getRowByName(name);
      await row.getByRole("button", { name: "Результаты" }).click();
    });
  }

  /** Подсчитать количество кнопок «Результаты» во всей таблице */
  async getResultsButtonCount() {
    return this._step("Подсчитать кнопки «Результаты» в таблице", async () => {
      const buttons = this.table.getByRole("button", { name: "Результаты" });
      return buttons.count();
    });
  }

  /** Нажать иконку-карандаш калибровки для сотрудника */
  async clickCalibrationPencil(name) {
    await this._step(`Нажать иконку калибровки для ${name}`, async () => {
      const row = this.getRowByName(name);
      const calibCell = row.locator("td").nth(2);
      // Кнопка-карандаш появляется при hover (React conditional render)
      await calibCell.hover();
      await calibCell.locator('[class*="OverwriteButton"]').click();
    });
  }

  /** Получить backgroundColor бейджа оценки (до калибровки) для сотрудника */
  async getScoreBadgeColor(name) {
    return this._step(`Получить цвет бейджа оценки для ${name}`, async () => {
      const row = this.getRowByName(name);
      const badge = row.locator('[class*="CompetenceResult_item"]').first();
      return badge.evaluate((el) => el.style.backgroundColor);
    });
  }

  // ═══════════════════════════════════════════════════════════
  // ГРАФИК РАСПРЕДЕЛЕНИЯ ХАРАКТЕРИСТИК
  // ═══════════════════════════════════════════════════════════

  /** Проверить, виден ли график характеристик */
  async isChartVisible() {
    return this._step("Проверить видимость графика характеристик", async () => {
      return this.distributionChart.isVisible();
    });
  }

  /** Дождаться появления графика */
  async waitForChart(timeout = TIMEOUTS.MEDIUM) {
    await this._step("Дождаться появления графика характеристик", async () => {
      await this.distributionChart.waitFor({ state: "visible", timeout });
    });
  }

  /** Получить количество строк графика (включая «Нет оценки») */
  async getChartRowCount() {
    return this._step("Получить количество строк графика", async () => {
      return this.chartHistogram.locator('[class*="ResultRow_title"]').count();
    });
  }

  /** Получить название характеристики по индексу */
  async getChartRowName(index) {
    return this._step(
      `Получить название строки графика #${index}`,
      async () => {
        return this.chartHistogram
          .locator('[class*="ResultRow_title"]')
          .nth(index)
          .innerText();
      },
    );
  }

  /** Получить процент по индексу строки (как число) */
  async getChartRowPercentage(index) {
    return this._step(`Получить % строки графика #${index}`, async () => {
      const text = await this.chartHistogram
        .locator('[class*="ResultRow_value"]')
        .nth(index)
        .innerText();
      return parseFloat(text.replace("%", "").replace(",", "."));
    });
  }

  /** Получить ширину прогресс-бара (%) по индексу строки */
  async getChartRowProgressBarWidth(index) {
    return this._step(`Получить ширину бара строки #${index}`, async () => {
      const style = await this.chartHistogram
        .locator('[class*="ResultRow_barProgress"]')
        .nth(index)
        .getAttribute("style");
      const match = style?.match(/width:\s*([\d.]+)%/);
      return match ? parseFloat(match[1]) : 0;
    });
  }

  /** Получить количество видимых аватаров в строке (без «+N») */
  async getChartRowAvatarCount(index) {
    return this._step(`Получить кол-во аватаров строки #${index}`, async () => {
      const footer = this.chartHistogram
        .locator('[class*="ResultRow_footer"]')
        .nth(index);
      const container = footer.locator('[class*="UsersInlineList_users"]');
      const isVisible = await container.isVisible().catch(() => false);
      if (!isVisible) return 0;
      const total = await container.locator("> *").count();
      const moreCount = await container
        .locator('[class*="UsersInlineList_more"]')
        .count();
      return total - moreCount;
    });
  }

  /** Получить число из «+N» overflow (0 если нет overflow) */
  async getChartRowOverflowCount(index) {
    return this._step(`Получить overflow строки #${index}`, async () => {
      const footer = this.chartHistogram
        .locator('[class*="ResultRow_footer"]')
        .nth(index);
      const more = footer.locator('[class*="UsersInlineList_more"]');
      if (!(await more.isVisible().catch(() => false))) return 0;
      const text = await more.innerText();
      const match = text.match(/\+(\d+)/);
      return match ? parseInt(match[1], 10) : 0;
    });
  }

  /** Нажать кнопку «Показать» / «Сбросить фильтр» в строке */
  async clickChartShowButton(index) {
    await this._step(`Нажать кнопку в строке графика #${index}`, async () => {
      const footer = this.chartHistogram
        .locator('[class*="ResultRow_footer"]')
        .nth(index);
      await footer.locator('[class*="BorderedButton_button"]').click();
      await this.page.waitForLoadState("networkidle");
    });
  }

  /** Получить текст кнопки строки («Показать» / «Сбросить фильтр») */
  async getChartShowButtonText(index) {
    return this._step(`Получить текст кнопки строки #${index}`, async () => {
      const footer = this.chartHistogram
        .locator('[class*="ResultRow_footer"]')
        .nth(index);
      return footer.locator('[class*="BorderedButton_button"]').innerText();
    });
  }

  /**
   * Получить все данные графика (массив строк)
   * @returns {Promise<Array<{name: string, percentage: number, progressBarWidth: number, avatarCount: number, overflowCount: number, buttonText: string}>>}
   */
  async getAllChartData() {
    return this._step("Получить все данные графика", async () => {
      const titles = this.chartHistogram.locator('[class*="ResultRow_title"]');
      const count = await titles.count();
      const rows = [];
      for (let i = 0; i < count; i++) {
        const name = await titles.nth(i).innerText();
        const valueText = await this.chartHistogram
          .locator('[class*="ResultRow_value"]')
          .nth(i)
          .innerText();
        const percentage = parseFloat(
          valueText.replace("%", "").replace(",", "."),
        );

        const style = await this.chartHistogram
          .locator('[class*="ResultRow_barProgress"]')
          .nth(i)
          .getAttribute("style")
          .catch(() => "");
        const widthMatch = style?.match(/width:\s*([\d.]+)%/);
        const progressBarWidth = widthMatch ? parseFloat(widthMatch[1]) : 0;

        const footer = this.chartHistogram
          .locator('[class*="ResultRow_footer"]')
          .nth(i);

        const avatarContainer = footer.locator(
          '[class*="UsersInlineList_users"]',
        );
        let avatarCount = 0;
        let overflowCount = 0;
        if (await avatarContainer.isVisible().catch(() => false)) {
          const total = await avatarContainer.locator("> *").count();
          const moreCount = await avatarContainer
            .locator('[class*="UsersInlineList_more"]')
            .count();
          avatarCount = total - moreCount;

          const more = avatarContainer.locator(
            '[class*="UsersInlineList_more"]',
          );
          if (await more.isVisible().catch(() => false)) {
            const moreText = await more.innerText();
            const overflowMatch = moreText.match(/\+(\d+)/);
            overflowCount = overflowMatch ? parseInt(overflowMatch[1], 10) : 0;
          }
        }

        const buttonText = await footer
          .locator('[class*="BorderedButton_button"]')
          .innerText()
          .catch(() => "");

        rows.push({
          name: name.trim(),
          percentage,
          progressBarWidth,
          avatarCount,
          overflowCount,
          buttonText: buttonText.trim(),
        });
      }
      return rows;
    });
  }

  // ═══════════════════════════════════════════════════════════
  // ПЕРЕКЛЮЧАТЕЛЬ КАЛИБРОВКИ (ГРАФИК)
  // ═══════════════════════════════════════════════════════════

  /** Проверить, виден ли переключатель калибровки (ждёт до timeout) */
  async isCalibrationToggleVisible(timeout = TIMEOUTS.SHORT) {
    return this._step(
      "Проверить видимость переключателя калибровки",
      async () => {
        try {
          await this.calibrationToggle.waitFor({ state: "visible", timeout });
          return true;
        } catch {
          return false;
        }
      },
    );
  }

  /** Переключиться на «Все оценки» */
  async switchToAllScores() {
    await this._step("Переключиться на «Все оценки»", async () => {
      await this.allScoresTab.click();
      await this.page.waitForLoadState("networkidle");
    });
  }

  /** Переключиться на «Прошедшие калибровку» */
  async switchToCalibrated() {
    await this._step("Переключиться на «Прошедшие калибровку»", async () => {
      await this.calibratedTab.click();
      await this.page.waitForLoadState("networkidle");
    });
  }

  /** Получить название активной вкладки переключателя */
  async getActiveCalibrationTab() {
    return this._step("Получить активную вкладку калибровки", async () => {
      const allActive = await this.allScoresTab
        .evaluate((el) => el.className.includes("active"))
        .catch(() => false);
      if (allActive) return "all";
      const calibActive = await this.calibratedTab
        .evaluate((el) => el.className.includes("active"))
        .catch(() => false);
      if (calibActive) return "calibrated";
      return null;
    });
  }

  // ═══════════════════════════════════════════════════════════
  // ФИЛЬТР «ХАРАКТЕРИСТИКА»
  // ═══════════════════════════════════════════════════════════

  /** Проверить, виден ли фильтр «Характеристика» */
  async isCharacteristicFilterVisible() {
    return this._step(
      "Проверить видимость фильтра «Характеристика»",
      async () => {
        return this.characteristicFilterContainer.isVisible();
      },
    );
  }

  /** Получить текущее значение фильтра «Характеристика» */
  async getCharacteristicFilterValue() {
    return this._step(
      "Получить значение фильтра «Характеристика»",
      async () => {
        const hasValue = await this.characteristicFilterValue
          .isVisible()
          .catch(() => false);
        if (hasValue) return this.characteristicFilterValue.innerText();
        return this.characteristicFilterPlaceholder.innerText();
      },
    );
  }

  /** Получить список опций фильтра «Характеристика» */
  async getCharacteristicFilterOptions() {
    return this._step("Получить опции фильтра «Характеристика»", async () => {
      await this.characteristicFilterControl.click();
      const menu = this.characteristicFilterContainer.locator(
        ".react-select__menu",
      );
      await menu.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });
      const options = await this.characteristicFilterContainer
        .locator(".react-select__option")
        .allInnerTexts();
      await this.page.keyboard.press("Escape");
      return options;
    });
  }

  /** Выбрать характеристику в фильтре */
  async selectCharacteristic(optionText) {
    await this._step(
      `Выбрать «${optionText}» в фильтре «Характеристика»`,
      async () => {
        await this.characteristicFilterControl.click();
        const menu = this.characteristicFilterContainer.locator(
          ".react-select__menu",
        );
        await menu.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });
        const option = this.characteristicFilterContainer
          .locator(".react-select__option")
          .filter({ hasText: optionText })
          .first();
        await option.click();
        await this.page.waitForLoadState("networkidle");
      },
    );
  }

  /** Сбросить фильтр «Характеристика» через кнопку «Сбросить фильтр» на графике */
  async clearCharacteristicFilter() {
    await this._step("Сбросить фильтр «Характеристика»", async () => {
      const resetButton = this.distributionChart.getByRole("button", {
        name: /Сбросить фильтр/i,
      });
      await resetButton.scrollIntoViewIfNeeded();
      await resetButton.click();
      await this.page.waitForLoadState("networkidle");
    });
  }

  // ═══════════════════════════════════════════════════════════
  // ПОДГРУЗКА СТРОК
  // ═══════════════════════════════════════════════════════════

  /** Кнопка «Показать еще» для подгрузки следующей страницы */
  get showMoreButton() {
    return this.page.getByRole("button", { name: "Показать еще" });
  }

  /**
   * Подгрузить все строки таблицы, кликая «Показать еще» до исчезновения кнопки.
   * @param {number} [maxClicks=10] — максимальное количество кликов (защита от бесконечного цикла)
   */
  async loadAllRows(maxClicks = 10) {
    await this._step("Подгрузить все строки таблицы", async () => {
      let clicks = 0;
      while (clicks < maxClicks) {
        const isVisible = await this.showMoreButton
          .isVisible()
          .catch(() => false);
        if (!isVisible) break;

        // Ждём, пока кнопка выйдет из pending-состояния (загрузка предыдущей порции)
        let pendingRetries = 0;
        while (pendingRetries < 60) {
          const cls = await this.showMoreButton
            .getAttribute("class")
            .catch(() => "");
          if (!cls.includes("pending")) break;
          await this.page.waitForTimeout(500);
          pendingRetries++;
        }

        await this.showMoreButton.click();
        await this.page.waitForLoadState("networkidle").catch(() => {});
        clicks++;
      }
    });
  }

  // ═══════════════════════════════════════════════════════════
  // ПУСТОЕ СОСТОЯНИЕ
  // ═══════════════════════════════════════════════════════════

  /** Проверить, видно ли пустое состояние (нет строк в таблице) */
  async isEmptyState() {
    return this._step("Проверить пустое состояние таблицы", async () => {
      const count = await this.tableRows.count();
      return count === 0;
    });
  }

  // ═══════════════════════════════════════════════════════════
  // СКАЧИВАНИЕ СВОДНОГО ОТЧЁТА
  // ═══════════════════════════════════════════════════════════

  /** Проверить, что кнопка «Скачать сводный отчёт» видна */
  async assertDownloadButtonVisible() {
    await this._step("Кнопка «Скачать сводный отчёт» видна", async () => {
      await expect(this.downloadSummaryButton).toBeVisible({
        timeout: TIMEOUTS.MEDIUM,
      });
    });
  }

  /** Проверить, что кнопка «Скачать сводный отчёт» НЕ видна */
  async assertDownloadButtonNotVisible() {
    await this._step("Кнопка «Скачать сводный отчёт» НЕ видна", async () => {
      await expect(this.downloadSummaryButton).not.toBeVisible({
        timeout: TIMEOUTS.SHORT,
      });
    });
  }

  async assertDownloadButtonDisabled() {
    await this._step("Кнопка «Скачать сводный отчёт» disabled", async () => {
      await expect(this.downloadSummaryButton).toBeDisabled();
    });
  }

  async getAvailableAssessments() {
    return this._step("Получить список доступных оценок в фильтре", async () => {
      const assessmentSelect = this.page
        .getByRole("button", { name: /Выберите оценку/i })
        .first();
      await assessmentSelect.click();

      const modal = this.page
        .locator('[class*="Modal"], [role="dialog"]')
        .filter({ hasText: "Выберите оценку" })
        .first();
      await modal.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

      const cards = modal.locator('button, [class*="Card"], [class*="card"]');
      const count = await cards.count();
      const names = [];
      for (let i = 0; i < count; i++) {
        const text = await cards.nth(i).textContent();
        if (text?.trim()) names.push(text.trim());
      }

      await this.page.keyboard.press("Escape");
      await modal.waitFor({ state: "hidden", timeout: TIMEOUTS.SHORT }).catch(() => {});
      return names;
    });
  }

  async assertAssessmentNotInFilter(prName) {
    await this._step(
      `Оценка «${prName}» отсутствует в фильтре`,
      async () => {
        const assessments = await this.getAvailableAssessments();
        expect(assessments).not.toContain(prName);
      },
    );
  }

  /**
   * Скачать сводный отчёт: клик по кнопке → перехват download или новой вкладки.
   * Кнопка может скачать файл напрямую или открыть новую вкладку с URL файла.
   * @returns {Promise<import('@playwright/test').Download>} Download или совместимый объект
   */
  async downloadSummaryReport() {
    return this._step("Скачать сводный отчёт", async () => {
      // Экспорт может скачаться напрямую или открыться в новой вкладке
      const eventPromise = Promise.race([
        this.page
          .waitForEvent("download", { timeout: 300_000 })
          .then((d) => ({ type: "download", data: d })),
        this.page
          .context()
          .waitForEvent("page", { timeout: 300_000 })
          .then((p) => ({ type: "page", data: p })),
      ]);

      await this.downloadSummaryButton.click();
      const result = await eventPromise;

      if (result.type === "download") {
        return result.data;
      }

      // Новая вкладка — промежуточная страница /download/?url=...
      const newPage = result.data;

      // Ждём, чтобы URL установился (не about:blank)
      await newPage
        .waitForURL(/^(?!about:blank)/, { timeout: 30000 })
        .catch(() => {});
      const pageUrl = newPage.url();

      // Ждём download на новой вкладке (XLSX генерируется долго — до 5 мин)
      const newTabDownload = await newPage
        .waitForEvent("download", { timeout: 300_000 })
        .catch(() => null);

      if (newTabDownload) {
        await newPage.close().catch(() => {});
        return newTabDownload;
      }

      // Fallback: извлекаем реальный URL файла из /download/?url=<encoded>
      const urlObj = new URL(pageUrl);
      const actualFileUrl = urlObj.searchParams.get("url") || pageUrl;
      await newPage.close().catch(() => {});

      // Скачиваем файл напрямую по API URL
      const response = await this.page
        .context()
        .request.get(actualFileUrl, { timeout: 300_000 });
      const body = await response.body();

      // Извлекаем имя файла из Content-Disposition
      const cd = response.headers()["content-disposition"] || "";
      let fileName = "summary-report.xlsx";
      const cdMatch = cd.match(/filename\*?=(?:UTF-8''|"?)([^";]+)/i);
      if (cdMatch) {
        fileName = decodeURIComponent(cdMatch[1].replace(/"/g, ""));
      }

      // Возвращаем объект, совместимый с Playwright Download API
      return {
        suggestedFilename: () => fileName,
        saveAs: async (savePath) => {
          const dir = path.dirname(savePath);
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }
          fs.writeFileSync(savePath, body);
        },
        url: () => actualFileUrl,
      };
    });
  }

  // ═══════════════════════════════════════════════════════════
  // КОМПЛЕКСНЫЕ ПРОВЕРКИ
  // ═══════════════════════════════════════════════════════════

  /** Проверить базовую структуру вкладки */
  async assertBaseLayout() {
    await this._step(
      "Базовая структура вкладки «Распределение оценок»",
      async () => {
        await expect(this.tabHeading).toBeVisible({ timeout: TIMEOUTS.MEDIUM });

        // Фильтры
        await expect(this.employeesFilterContainer).toBeVisible({
          timeout: TIMEOUTS.MEDIUM,
        });
        await expect(this.groupFilterButton).toBeVisible({
          timeout: TIMEOUTS.MEDIUM,
        });
        await expect(this.periodInput).toBeVisible({
          timeout: TIMEOUTS.MEDIUM,
        });

        // Поиск
        await expect(this.searchInput).toBeVisible({
          timeout: TIMEOUTS.MEDIUM,
        });

        // Таблица
        await expect(this.table).toBeVisible({ timeout: TIMEOUTS.MEDIUM });

        // Заголовки колонок
        const headers = await this.getTableHeaders();
        expect(headers).toContain("Сотрудник");
        // Калибровочные колонки ("до калибровки"/"после калибровки") видны
        // только когда у выбранного PR включена калибровка. Проверяем их наличие,
        // но не требуем — вместо этого проверяем "Итоговая оценка" как fallback.
        const hasCalibration = headers.some((h) => h.includes("до калибровки"));
        const hasOverallScore = headers.some((h) => h.includes("Итоговая оценка"));
        expect(
          hasCalibration || hasOverallScore,
          `Таблица должна содержать колонку оценки: ${headers.join(", ")}`,
        ).toBeTruthy();
        expect(headers).toContain("Название оценки");
      },
    );
  }
}
