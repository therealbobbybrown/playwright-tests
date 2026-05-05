// pages/ObjectivesDatepickerHelper.js
// Хелпер для работы с air-datepicker выбора периода в модуле Цели (OKR)
//
// Discovery результаты (11.03.2026):
// - Корень: div.air-datepicker.-inline-.DatePicker_datepicker__e_PyT
// - Вкладки ВНИЗУ (реальные имена): "День" | "Месяц" | "Квартал" | "Полугодие" | "Год"
// - Активная вкладка: DatePicker_presetButtonActive__Eb8Jv
// - Кнопки периодов: button.DatePicker_periodButton__JiejB
// - Нет суб-пресетов "Текущий/Прошедший" и quick-selects "7/30/90 дней"
// - Предупреждение о прошлом: Hint_hint--color-info__EWH2v (информационный, НЕ красный)

import { expect } from "@playwright/test";
import { TIMEOUTS } from "../tests/utils/constants.js";

/**
 * Хелпер для работы с датапикером выбора периода целей.
 * Не наследуется от BasePage — используется как утилита внутри Page Objects.
 *
 * Логика вкладок при открытии:
 * - Если даты совпадают с пресетом (квартал/полугодие/месяц/год) → открывается его вкладка
 * - Если даты произвольные → открывается вкладка "День"
 *
 * @example
 * const dp = new ObjectivesDatepickerHelper(page);
 * await dp.open();
 * await dp.selectQuarter(2026, 2); // Q2 2026
 * await dp.assertValue('01.04.2026 - 30.06.2026');
 * await dp.close();
 */
export class ObjectivesDatepickerHelper {
  /**
   * @param {import('@playwright/test').Page} page
   * @param {import('@playwright/test').Locator} [triggerLocator]
   *   Опциональный локатор поля-триггера. Если не передан — ищет первый DatePicker_anchor на странице.
   */
  constructor(page, triggerLocator = null) {
    this.page = page;

    // ── Поле-триггер ─────────────────────────────────────────────
    // Инпут с текстом выбранного периода (readonly) — кликаем для открытия/закрытия
    // Discovery (11.03.2026): элемент = <input name="period" id="input-objective-period">
    // НЕ span.DatePicker_anchor__JaPaP (существует, но скрыт)
    this.anchor = triggerLocator ?? page.locator('input[name="period"]').first();
    // this.input = та же ссылка, что и anchor (input IS the trigger)
    this.input = this.anchor;
    // Кнопка-тогл (▼ / ×) рядом с полем — pattern как в ScoreDistributionTab.js
    this.clearButton = this.anchor.locator("..").locator("button").first();

    // ── Корневой контейнер датапикера ─────────────────────────────
    this.datepicker = page.locator("div.air-datepicker").first();

    // ── Навигация (< год >) ───────────────────────────────────────
    this.navTitle = page.locator("div.air-datepicker-nav--title").first();
    this.prevBtn = page.locator('div.air-datepicker-nav--action[data-action="prev"]').first();
    this.nextBtn = page.locator('div.air-datepicker-nav--action[data-action="next"]').first();

    // ── Вкладки пресетов (ВНИЗУ датапикера) ──────────────────────
    // Реальные имена из UI: "День", "Месяц", "Квартал", "Полугодие", "Год"
    this.tabDay = page.locator("button.DatePicker_presetButton__v9WBZ").filter({ hasText: /^День$/ });
    this.tabMonth = page.locator("button.DatePicker_presetButton__v9WBZ").filter({ hasText: /^Месяц$/ });
    this.tabQuarter = page.locator("button.DatePicker_presetButton__v9WBZ").filter({ hasText: /^Квартал$/ });
    this.tabHalfYear = page.locator("button.DatePicker_presetButton__v9WBZ").filter({ hasText: /^Полугодие$/ });
    this.tabYear = page.locator("button.DatePicker_presetButton__v9WBZ").filter({ hasText: /^Год$/ });
    // Активная вкладка
    this.activeTab = page.locator("button.DatePicker_presetButtonActive__Eb8Jv");

    // ── Кастомные гриды (кварталы, месяцы, полугодия, годы) ──────
    this.quarterGrid = page.locator("div.DatePicker_quarters__xbD6P");
    this.monthGrid = page.locator("div.DatePicker_months__HkHtD");
    this.halfYearGrid = page.locator("div.DatePicker_halfYears__tAgL0");
    this.yearGrid = page.locator("div.DatePicker_years__fuX6M");

    // ── Кнопки периодов (Q1..Q4, H1..H2, месяцы, годы) ──────────
    this.periodButtons = page.locator("button.DatePicker_periodButton__JiejB");

    // ── Ячейки дней (вкладка "День") ─────────────────────────────
    this.dayCells = page.locator("div.air-datepicker-cell.-day-");

    // ── Предупреждение о прошедшем периоде ───────────────────────
    // Цвет: info (синий/серый), НЕ красный (класс Hint_hint--color-info__EWH2v)
    this.pastWarning = page.locator("span.Hint_hint__FqkuM.Hint_hint--color-info__EWH2v");
    this.pastWarningText = this.pastWarning.locator("span.Hint_text__1iujD");
  }

  // ═══════════════════════════════════════════════════════════════
  // ПРИВАТНЫЕ УТИЛИТЫ
  // ═══════════════════════════════════════════════════════════════

  /**
   * Безопасный клик для элементов внутри датапикера (portal, может выходить за viewport).
   * Используем dispatchEvent('click') — обходит проверку viewport,
   * при этом триггерит React-обработчики (в отличие от evaluate(el => el.click())).
   * @param {import('@playwright/test').Locator} locator
   */
  async _safeClick(locator) {
    await locator.dispatchEvent("click");
  }

  // ═══════════════════════════════════════════════════════════════
  // УПРАВЛЕНИЕ ОТКРЫТИЕМ / ЗАКРЫТИЕМ
  // ═══════════════════════════════════════════════════════════════

  /**
   * Открыть датапикер кликом по якорю.
   * При повторном открытии датапикер переходит на нужную вкладку:
   * - Квартал/Полугодие/Месяц/Год → соответствующая вкладка
   * - Произвольный диапазон → вкладка "День"
   */
  async open() {
    const isVisible = await this.datepicker.isVisible();
    if (!isVisible) {
      // Скроллим поле "Период" к верху viewport, чтобы датапикер (portal, ~300px)
      // раскрылся в видимой области и не выходил за viewport
      await this.anchor.evaluate((el) => el.scrollIntoView({ block: "start" }));
      await this.anchor.click();
      await this.datepicker.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });
    }
  }

  /**
   * Закрыть датапикер кликом вне его области.
   * Escape не закрывает inline-datepicker; нужен клик снаружи.
   */
  async close() {
    const isVisible = await this.datepicker.isVisible();
    if (isVisible) {
      // Клик по первому заголовку страницы (вне датапикера) закрывает его
      await this.page.getByRole("heading").first().click();
      await this.datepicker
        .waitFor({ state: "hidden", timeout: TIMEOUTS.SHORT })
        .catch(() => {});
    }
  }

  /**
   * Проверить, открыт ли датапикер.
   * @returns {Promise<boolean>}
   */
  async isOpen() {
    return this.datepicker.isVisible();
  }

  // ═══════════════════════════════════════════════════════════════
  // ЗНАЧЕНИЕ ПОЛЯ
  // ═══════════════════════════════════════════════════════════════

  /**
   * Получить текущее значение поля ("DD.MM.YYYY - DD.MM.YYYY" или пустое).
   * @returns {Promise<string>}
   */
  async getValue() {
    return this.input.inputValue();
  }

  /**
   * Проверить значение поля.
   * @param {string} expected - Ожидаемое значение, напр. "01.04.2026 - 30.06.2026"
   */
  async assertValue(expected) {
    await expect(this.input).toHaveValue(expected);
  }

  /**
   * Проверить что поле пустое (период не выбран).
   */
  async assertEmpty() {
    await expect(this.input).toHaveValue("");
  }

  /**
   * Очистить значение кликом по кнопке ×.
   */
  async clearValue() {
    await this.clearButton.click();
    await expect(this.input).toHaveValue("", { timeout: TIMEOUTS.SHORT });
  }

  // ═══════════════════════════════════════════════════════════════
  // ВКЛАДКИ ПРЕСЕТОВ
  // ═══════════════════════════════════════════════════════════════

  /**
   * Переключиться на вкладку пресета.
   * @param {'day'|'month'|'quarter'|'halfYear'|'year'} tab
   */
  async switchToPreset(tab) {
    const tabs = {
      day: this.tabDay,
      month: this.tabMonth,
      quarter: this.tabQuarter,
      halfYear: this.tabHalfYear,
      year: this.tabYear,
    };
    const btn = tabs[tab];
    if (!btn) throw new Error(`Неизвестная вкладка: ${tab}. Доступны: day, month, quarter, halfYear, year`);
    await this._safeClick(btn);
    await this.page.waitForTimeout(TIMEOUTS.TINY);
  }

  /**
   * Получить текст активной вкладки пресета.
   * @returns {Promise<string>}
   */
  async getActivePresetTab() {
    return this.activeTab.innerText();
  }

  /**
   * Проверить что вкладка активна.
   * @param {'day'|'month'|'quarter'|'halfYear'|'year'} tab
   */
  async assertPresetTabActive(tab) {
    const tabNames = {
      day: "День",
      month: "Месяц",
      quarter: "Квартал",
      halfYear: "Полугодие",
      year: "Год",
    };
    const expectedName = tabNames[tab];
    await expect(this.activeTab).toHaveText(expectedName);
  }

  /**
   * Проверить что нет активной подсвеченной вкладки (для произвольного диапазона).
   * Применимо только для состояния когда все вкладки одинаковы (нет активной).
   */
  async assertNoActivePresetHighlight() {
    // При произвольном диапазоне вкладка "День" активна, но ни одна ячейка
    // в кастомных гридах не подсвечена как выбранная.
    // Проверяем что нет кнопок с классами start/end в кастомных гридах.
    const selectedPeriodButtons = this.page.locator(
      "button.DatePicker_periodRangeStart__uce2C, button.DatePicker_periodRangeEnd__LBRbp",
    );
    await expect(selectedPeriodButtons).toHaveCount(0);
  }

  // ═══════════════════════════════════════════════════════════════
  // ВЫБОР ОДНИМ КЛИКОМ (Квартал, Полугодие, Месяц, Год)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Выбрать квартал (одним кликом).
   * @param {number} year - Год, напр. 2026
   * @param {1|2|3|4} q - Номер квартала
   */
  async selectQuarter(year, q) {
    await this.open();
    await this.switchToPreset("quarter");
    await this._navigateToYear(year);
    const btn = this.quarterGrid.locator("button").filter({ hasText: `Q${q}` });
    await this._safeClick(btn);
    await this.datepicker.waitFor({ state: "hidden", timeout: TIMEOUTS.SHORT }).catch(() => {});
  }

  /**
   * Выбрать полугодие (одним кликом).
   * @param {number} year - Год, напр. 2026
   * @param {1|2} h - Номер полугодия
   */
  async selectHalfYear(year, h) {
    await this.open();
    await this.switchToPreset("halfYear");
    await this._navigateToYear(year);
    const btn = this.halfYearGrid.locator("button").filter({ hasText: `H${h}` });
    await this._safeClick(btn);
    await this.datepicker.waitFor({ state: "hidden", timeout: TIMEOUTS.SHORT }).catch(() => {});
  }

  /**
   * Выбрать месяц (одним кликом).
   * @param {number} year - Год, напр. 2026
   * @param {number} monthIndex - Индекс месяца 0-11 (0=Январь, 11=Декабрь)
   */
  async selectMonth(year, monthIndex) {
    await this.open();
    await this.switchToPreset("month");
    await this._navigateToYear(year);
    // Кнопки месяцев в кастомном гриде (DatePicker_months): Янв Фев Мар ...
    const btn = this.monthGrid.locator("button").nth(monthIndex);
    await this._safeClick(btn);
    await this.datepicker.waitFor({ state: "hidden", timeout: TIMEOUTS.SHORT }).catch(() => {});
  }

  /**
   * Выбрать год (одним кликом).
   * @param {number} year - Год, напр. 2026
   */
  async selectYear(year) {
    await this.open();
    await this.switchToPreset("year");
    // Для годов навигация по десятилетиям
    await this._navigateToDecade(year);
    const btn = this.yearGrid.locator("button").filter({ hasText: String(year) });
    await this._safeClick(btn);
    await this.datepicker.waitFor({ state: "hidden", timeout: TIMEOUTS.SHORT }).catch(() => {});
  }

  // ═══════════════════════════════════════════════════════════════
  // ВЫБОР ДНЕй (вкладка "День", диапазон двумя кликами)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Выбрать диапазон дней двумя кликами (начало → конец).
   * Автосвап: если startDate > endDate, они меняются местами.
   * @param {{year: number, month: number, date: number}} startDate - month 0-based
   * @param {{year: number, month: number, date: number}} endDate - month 0-based
   */
  async selectDayRange(startDate, endDate) {
    await this.open();
    await this.switchToPreset("day");
    await this._navigateToYearMonth(startDate.year, startDate.month);
    await this._clickDayCell(startDate.year, startDate.month, startDate.date);
    // Если endDate в другом месяце — навигируем
    if (endDate.year !== startDate.year || endDate.month !== startDate.month) {
      await this._navigateToYearMonth(endDate.year, endDate.month);
    }
    await this._clickDayCell(endDate.year, endDate.month, endDate.date);
    await this.datepicker.waitFor({ state: "hidden", timeout: TIMEOUTS.SHORT }).catch(() => {});
  }

  /**
   * Выбрать один день (полные сутки: startDate = endDate).
   * @param {{year: number, month: number, date: number}} dayDate - month 0-based
   */
  async selectSingleDay(dayDate) {
    await this.selectDayRange(dayDate, dayDate);
  }

  // ═══════════════════════════════════════════════════════════════
  // НАВИГАЦИЯ (внутреннее использование)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Навигировать к нужному году для гридов кварталов/месяцев/полугодий.
   * @param {number} targetYear
   */
  async _navigateToYear(targetYear) {
    for (let i = 0; i < 20; i++) {
      const titleText = await this.navTitle.innerText();
      const yearMatch = titleText.match(/\b(\d{4})\b/);
      if (!yearMatch) break;
      const currentYear = parseInt(yearMatch[1], 10);
      if (currentYear === targetYear) break;
      if (targetYear < currentYear) {
        await this._safeClick(this.prevBtn);
      } else {
        await this._safeClick(this.nextBtn);
      }
      await this.page.waitForTimeout(TIMEOUTS.MICRO);
    }
  }

  /**
   * Навигировать к нужному десятилетию для грида годов.
   * @param {number} targetYear
   */
  async _navigateToDecade(targetYear) {
    for (let i = 0; i < 20; i++) {
      const titleText = await this.navTitle.innerText();
      // Формат: "2020 - 2029"
      const match = titleText.match(/(\d{4})\s*-\s*(\d{4})/);
      if (!match) break;
      const decadeStart = parseInt(match[1], 10);
      const decadeEnd = parseInt(match[2], 10);
      if (targetYear >= decadeStart && targetYear <= decadeEnd) break;
      if (targetYear < decadeStart) {
        await this._safeClick(this.prevBtn);
      } else {
        await this._safeClick(this.nextBtn);
      }
      await this.page.waitForTimeout(TIMEOUTS.MICRO);
    }
  }

  /**
   * Навигировать к нужному месяцу/году для грида дней.
   * @param {number} targetYear
   * @param {number} targetMonth - 0-based
   */
  async _navigateToYearMonth(targetYear, targetMonth) {
    const monthNames = [
      "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
      "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
    ];
    for (let i = 0; i < 36; i++) {
      const titleText = await this.navTitle.innerText();
      const yearMatch = titleText.match(/(\d{4})/);
      const currentYear = yearMatch ? parseInt(yearMatch[1], 10) : 0;
      const currentMonth = monthNames.findIndex((m) => titleText.includes(m));
      if (currentYear === targetYear && currentMonth === targetMonth) break;
      const currentTotal = currentYear * 12 + (currentMonth >= 0 ? currentMonth : 0);
      const targetTotal = targetYear * 12 + targetMonth;
      if (targetTotal < currentTotal) {
        await this._safeClick(this.prevBtn);
      } else {
        await this._safeClick(this.nextBtn);
      }
      await this.page.waitForTimeout(TIMEOUTS.MICRO);
    }
  }

  /**
   * Кликнуть по ячейке дня в календаре.
   * @param {number} year
   * @param {number} month - 0-based
   * @param {number} date
   */
  async _clickDayCell(year, month, date) {
    const cell = this.page.locator(
      `.air-datepicker-cell.-day-[data-year="${year}"][data-month="${month}"][data-date="${date}"]`,
    );
    await this._safeClick(cell);
  }

  // ═══════════════════════════════════════════════════════════════
  // ПРОВЕРКИ ПРЕДУПРЕЖДЕНИЯ О ПРОШЕДШЕМ ПЕРИОДЕ
  // ═══════════════════════════════════════════════════════════════

  /**
   * Проверить видимость предупреждения о прошлом периоде.
   * @param {boolean} [visible=true]
   */
  async assertPastPeriodWarning(visible = true) {
    if (visible) {
      await expect(this.pastWarning).toBeVisible({ timeout: TIMEOUTS.SHORT });
    } else {
      await expect(this.pastWarning).not.toBeVisible();
    }
  }

  /**
   * Проверить точный текст предупреждения.
   * Ожидаемый текст: "Обратите внимание, выбранный период уже прошёл"
   */
  async assertPastWarningText() {
    await expect(this.pastWarningText).toContainText("Обратите внимание, выбранный период уже прошёл");
  }

  /**
   * Проверить что предупреждение имеет информационный (не красный) стиль.
   * Класс: Hint_hint--color-info__EWH2v
   */
  async assertPastWarningIsInfo() {
    await expect(this.pastWarning).toHaveClass(/Hint_hint--color-info__EWH2v/);
  }

  // ═══════════════════════════════════════════════════════════════
  // ВСПОМОГАТЕЛЬНЫЕ УТИЛИТЫ
  // ═══════════════════════════════════════════════════════════════

  /**
   * Вычислить ожидаемую строку значения для квартала.
   * @param {number} year
   * @param {1|2|3|4} q
   * @returns {string} "DD.MM.YYYY - DD.MM.YYYY"
   */
  static getExpectedQuarterValue(year, q) {
    const starts = ["01.01", "01.04", "01.07", "01.10"];
    const ends = ["31.03", "30.06", "30.09", "31.12"];
    return `${starts[q - 1]}.${year} - ${ends[q - 1]}.${year}`;
  }

  /**
   * Вычислить ожидаемую строку значения для полугодия.
   * @param {number} year
   * @param {1|2} h
   * @returns {string} "DD.MM.YYYY - DD.MM.YYYY"
   */
  static getExpectedHalfYearValue(year, h) {
    if (h === 1) return `01.01.${year} - 30.06.${year}`;
    return `01.07.${year} - 31.12.${year}`;
  }

  /**
   * Вычислить ожидаемую строку значения для года.
   * @param {number} year
   * @returns {string} "01.01.YYYY - 31.12.YYYY"
   */
  static getExpectedYearValue(year) {
    return `01.01.${year} - 31.12.${year}`;
  }

  /**
   * Вычислить ожидаемую строку значения для месяца.
   * @param {number} year
   * @param {number} monthIndex - 0-based (0=Январь, 11=Декабрь)
   * @returns {string} "DD.MM.YYYY - DD.MM.YYYY"
   */
  static getExpectedMonthValue(year, monthIndex) {
    const month = String(monthIndex + 1).padStart(2, "0");
    // Последний день месяца
    const lastDay = new Date(year, monthIndex + 1, 0).getDate();
    const lastDayStr = String(lastDay).padStart(2, "0");
    return `01.${month}.${year} - ${lastDayStr}.${month}.${year}`;
  }

  /**
   * Вычислить startDate/endDate для API (формат "YYYY-MM-DD") по кварталу.
   * @param {number} year
   * @param {1|2|3|4} q
   * @returns {{startDate: string, endDate: string}}
   */
  static getQuarterDates(year, q) {
    const starts = ["01-01", "04-01", "07-01", "10-01"];
    const ends = ["03-31", "06-30", "09-30", "12-31"];
    return {
      startDate: `${year}-${starts[q - 1]}`,
      endDate: `${year}-${ends[q - 1]}`,
    };
  }

  /**
   * Вычислить startDate/endDate для API по полугодию.
   * @param {number} year
   * @param {1|2} h
   * @returns {{startDate: string, endDate: string}}
   */
  static getHalfYearDates(year, h) {
    if (h === 1) return { startDate: `${year}-01-01`, endDate: `${year}-06-30` };
    return { startDate: `${year}-07-01`, endDate: `${year}-12-31` };
  }

  /**
   * Вычислить startDate/endDate для текущего квартала (для дефолтного состояния).
   * @returns {{startDate: string, endDate: string, displayValue: string}}
   */
  static getCurrentQuarterDates() {
    const now = new Date();
    const year = now.getFullYear();
    const q = Math.floor(now.getMonth() / 3) + 1;
    const dates = ObjectivesDatepickerHelper.getQuarterDates(year, q);
    const displayValue = ObjectivesDatepickerHelper.getExpectedQuarterValue(year, q);
    return { ...dates, displayValue };
  }
}
