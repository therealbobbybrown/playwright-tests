// pages/ObjectivesAllPage.js
import { expect } from "@playwright/test";
import { BasePage } from "./BasePage.js";
import { TIMEOUTS } from "../tests/utils/constants.js";
import { URL_PATTERNS } from "../tests/utils/urls.js";
import { ObjectivesDatepickerHelper } from "./ObjectivesDatepickerHelper.js";

export class ObjectivesAllPage extends BasePage {
  /** @param {import('@playwright/test').Page} page
      @param {import('@playwright/test').TestInfo} [testInfo] */
  constructor(page, testInfo) {
    super(page, testInfo);

    // Заголовок "Цели"
    this.title = this.page
      .getByRole("heading", { level: 1, name: /цели/i })
      .first();

    // Строки целей
    this.objectiveRows = this.page.locator('tr[class*="ObjectiveRow_row__"]');

    // Строки КР (важно: в разных версиях это div/tr, классы могут меняться)
    this.milestoneRows = this.page.locator(
      '[class*="MilestoneRow_row__"], tr:has(text="База:")',
    );

    // Берём первый КР, у которого есть блок прогресса (по контенту "База:" — уникальный маркер)
    this.firstMilestoneRow = this.page
      .locator('tr:has-text("База:"), [class*="MilestoneRow_row__"]:has-text("База:")')
      .first();

    this.firstMilestoneProgressContainer = this.firstMilestoneRow
      .locator('[class*="MilestoneProgress_container__"], [class*="MilestoneProgress"]')
      .first();

    this.firstMilestoneProgressInfo = this.firstMilestoneRow
      .locator('[class*="MilestoneProgress_info__"], [class*="MilestoneProgress"]:has-text("База:")')
      .first();

    // Полоса прогресса (где-то это progress__, где-то line__)
    this.firstMilestoneProgressBar = this.firstMilestoneRow
      .locator(
        '[class*="MilestoneProgress_progress__"], [class*="MilestoneProgress_line__"]',
      )
      .first();

    // Любые "кнопки" внутри прогресса (часто это карандаш/меню, видимы после hover)
    this.firstMilestoneProgressButtons =
      this.firstMilestoneProgressContainer.locator(
        'button, [role="button"], [tabindex]:not([tabindex="-1"])',
      );

    // Варианты редактора: input/textarea/contenteditable/role=textbox
    this._editorCandidatesInRow = this.firstMilestoneRow.locator(
      'input:not([type="search"]), textarea, [contenteditable="true"], [role="textbox"], [role="spinbutton"]',
    );
    this._editorCandidatesGlobal = this.page.locator(
      'input:not([type="search"]):visible, textarea:visible, [contenteditable="true"]:visible, [role="textbox"]:visible, [role="spinbutton"]:visible',
    );
    this._focusedEditor = this.page.locator(
      'input:focus:not([type="search"]), textarea:focus, [contenteditable="true"]:focus, [role="textbox"]:focus, [role="spinbutton"]:focus',
    );

    // Модалки/дроуеры/поповеры, куда могут вынести редактирование
    this._overlayContainers = this.page.locator(
      '[role="dialog"], [class*="Modal"], [class*="Drawer"], [class*="Popover"], [class*="Popper"], [data-floating-ui-portal]',
    );

    this._expanded = false;

    // ── Вкладки (DEVAPR-11591) ────────────────────────────────────
    // Порядок: Мои цели → Моя команда → Все цели → Мои черновики
    // По умолчанию активна: "Все цели"
    this.tabsContainer = this.page.locator('[class*="Tabs_tab-buttons__"]');
    this.tabMine = this.tabsContainer.getByRole("button", { name: "Мои цели", exact: true });
    this.tabTeam = this.tabsContainer.getByRole("button", { name: "Моя команда", exact: true });
    this.tabAll = this.tabsContainer.getByRole("button", { name: "Все цели", exact: true });
    this.tabDraft = this.tabsContainer.locator("button").filter({ hasText: /Мои черновики/ });

    // ── Фильтр Период (датапикер, DEVAPR-11585 + 11591) ──────────
    // Дефолт = "не выбран" (пустое поле)
    this.periodFilter = new ObjectivesDatepickerHelper(this.page);

    // ── Фильтр Уровень ────────────────────────────────────────────
    // Дропдаун "Все уровни" / "Уровень"
    this.levelFilter = this.page
      .locator('[class*="Select"], [class*="Filter"]')
      .filter({ hasText: /Уровень|Все уровни/i })
      .first();

    // Опции уровня (появляются после открытия дропдауна)
    this.levelOptions = this.page.locator('[class*="Option"], [role="option"]');

    // ── Кнопка сброса ВСЕХ фильтров (иконка × в блоке фильтров) ──
    // Сбрасывает все фильтры: период, уровень, команда, ответственный.
    // Реальный класс: BorderedButton_button--empty__ внутри AllObjectives_filters__
    // (AllObjectives_resetButton__ не существует в DOM)
    this.resetAllFiltersButton = this.page
      .locator('[class*="AllObjectives_filters__"]')
      .locator('button[class*="BorderedButton_button--empty__"]');

    // ── Таблица (для проверки периода в строках) ──────────────────
    this.tableRows = this.page.locator('tr[class*="ObjectiveRow_row__"]');

    // ── Статус утверждения (DEVAPR-11722) ─────────────────────────
    this.statusColumnHeader = this.page.locator('th, [role="columnheader"]').filter({ hasText: /^Статус$/ });
    this.statusFilter = this.page.locator('[class*="Select"], [class*="Filter"]')
      .filter({ hasText: /Статус|Все статусы/i })
      .first();
    this.statusFilterCombobox = this.page.locator('select, [role="combobox"]')
      .filter({ hasText: /Все статусы/i })
      .first();
  }

  async assertOpened() {
    await this._step('Проверка страницы "Все цели"', async () => {
      await this.page
        .waitForURL(URL_PATTERNS.OBJECTIVES_ALL, { timeout: TIMEOUTS.LONG })
        .catch(() => null);
      await this.title.waitFor({ state: "visible", timeout: TIMEOUTS.LONG });
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // ВКЛАДКИ (DEVAPR-11591)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Переключиться на вкладку.
   * @param {'mine'|'team'|'all'|'draft'} tab
   */
  async switchToTab(tab) {
    const tabs = {
      mine: this.tabMine,
      team: this.tabTeam,
      all: this.tabAll,
      draft: this.tabDraft,
    };
    await tabs[tab].click();
    await this.page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM }).catch(() => {});
  }

  /**
   * Проверить что вкладка активна (имеет класс active).
   * @param {'mine'|'team'|'all'|'draft'} tab
   */
  async assertTabActive(tab) {
    const tabs = {
      mine: this.tabMine,
      team: this.tabTeam,
      all: this.tabAll,
      draft: this.tabDraft,
    };
    await expect(tabs[tab]).toHaveClass(/Tabs_button--active__/);
  }

  /**
   * Проверить порядок вкладок: Мои цели → Моя команда → Все цели → Мои черновики (DEVAPR-11591).
   */
  async assertTabOrder() {
    await this._step("Проверить порядок вкладок", async () => {
      const buttons = this.tabsContainer.locator("button");
      const count = await buttons.count();
      expect(count).toBeGreaterThanOrEqual(4);
      // Проверяем тексты в правильном порядке
      await expect(buttons.nth(0)).toContainText("Мои цели");
      await expect(buttons.nth(1)).toContainText("Моя команда");
      await expect(buttons.nth(2)).toContainText("Все цели");
      await expect(buttons.nth(3)).toContainText("Мои черновики");
    });
  }

  /**
   * Проверить что по умолчанию активна вкладка "Все цели" (DEVAPR-11591).
   */
  async assertDefaultTabIsAll() {
    await expect(this.tabAll).toHaveClass(/Tabs_button--active__/);
  }

  // ═══════════════════════════════════════════════════════════════
  // ФИЛЬТР ПЕРИОДА (DEVAPR-11591: дефолт = "не выбран")
  // ═══════════════════════════════════════════════════════════════

  /**
   * Проверить что фильтр периода пустой (не выбран).
   */
  async assertPeriodFilterEmpty() {
    await this.periodFilter.assertEmpty();
  }

  /**
   * Проверить что старые дропдауны "Год"/"Квартал" отсутствуют (DEVAPR-11585).
   */
  async assertOldDropdownsRemoved() {
    await this._step("Проверить отсутствие старых дропдаунов год/квартал", async () => {
      const oldYearSelect = this.page.locator('[class*="Select"]').filter({ hasText: /202\d/ });
      const oldQuarterSelect = this.page.locator('[class*="Select"]').filter({
        hasText: /Q1|Q2|Q3|Q4|Весь год/,
      });
      await expect(oldYearSelect).toHaveCount(0);
      await expect(oldQuarterSelect).toHaveCount(0);
    });
  }

  /**
   * Сбросить ВСЕ фильтры кликом по кнопке × справа от "Ответственный".
   * Сбрасывает: период, уровень, команда, ответственный.
   */
  async resetAllFilters() {
    await this.resetAllFiltersButton.click();
    await this.page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM }).catch(() => {});
  }

  // ═══════════════════════════════════════════════════════════════
  // ТАБЛИЦА ЦЕЛЕЙ
  // ═══════════════════════════════════════════════════════════════

  /**
   * Проверить формат периода в строке таблицы.
   * Ожидаемый формат: "DD.MM.YYYY - DD.MM.YYYY"
   * @param {number} rowIndex - Индекс строки (0-based)
   * @param {string} expectedPeriodText - Ожидаемый текст периода
   */
  async assertPeriodInRow(rowIndex, expectedPeriodText) {
    await this._step(`Проверить период в строке #${rowIndex}`, async () => {
      const row = this.tableRows.nth(rowIndex);
      await expect(row).toContainText(expectedPeriodText);
    });
  }

  /**
   * Получить тексты названий целей в текущем порядке (для проверки сортировки).
   * Использует page.evaluate для атомарного сбора текстов — не страдает от
   * race condition при изменении DOM между count() и nth(i).innerText().
   * @returns {Promise<string[]>}
   */
  async getObjectiveTitlesInOrder() {
    return this._step("Получить порядок названий целей", async () => {
      // Атомарный сбор: читаем текст первой ячейки всех видимых строк за один evaluate
      const titles = await this.page.evaluate(() => {
        const rows = Array.from(
          document.querySelectorAll('tr[class*="ObjectiveRow_row__"]'),
        );
        return rows
          .filter((row) => {
            // Только строки, которые реально видны в DOM (не hidden/display:none)
            const style = window.getComputedStyle(row);
            return style.display !== "none" && style.visibility !== "hidden";
          })
          .map((row) => {
            const td = row.querySelector("td");
            return (td?.textContent ?? "").trim();
          })
          .filter((t) => t.length > 0); // Пропускаем пустые ячейки
      });
      return titles;
    });
  }

  async expandFirstObjectiveRow() {
    await this._step("Раскрыть первую цель (где есть КР с %)", async () => {
      const rowsCount = await this.objectiveRows.count();
      const tryCount = Math.min(rowsCount, 10);

      for (let i = 0; i < tryCount; i += 1) {
        const row = this.objectiveRows.nth(i);
        await row.scrollIntoViewIfNeeded().catch(() => null);

        // стрелка раскрытия может быть svg/кнопкой/дивом
        const toggle = row
          .locator(
            '[class*="ObjectiveRow_arrow__"], button:has([class*="ObjectiveRow_arrow__"])',
          )
          .first();

        if (await toggle.isVisible().catch(() => false)) {
          await toggle.click().catch(() => null);
        } else {
          await row.click().catch(() => null);
        }

        // Проверяем раскрытие по контенту "База:" — уникальный маркер КР прогресса
        const ok = await this.page
          .locator('tr:has-text("База:"), [class*="MilestoneRow"]:has-text("База:")')
          .first()
          .waitFor({ state: "visible", timeout: 3000 })
          .then(() => true)
          .catch(() => false);

        if (ok) {
          this._expanded = true;
          return;
        }
      }

      throw new Error(
        "Не удалось раскрыть цель с КР, у которого есть процентный прогресс (MilestoneProgress_info__).",
      );
    });
  }

  async getFirstMilestoneCurrentProgress() {
    return await this._step("Считать текущий прогресс первого КР", async () => {
      // Сначала пробуем раскрытую строку КР
      const krRow = this.firstMilestoneRow;
      const krVisible = await krRow.isVisible().catch(() => false);
      if (krVisible) {
        const text = (await krRow.innerText().catch(() => ""))?.trim();
        const m = text.match(/(\d+)%/);
        if (m) return Number.parseInt(m[1], 10);
      }

      // Fallback: прогресс из колонки "Прогресс" первой строки цели (когда КР свёрнут)
      const firstRow = this.objectiveRows.first();
      const visible = await firstRow.isVisible().catch(() => false);
      if (!visible) return Number.NaN;

      // Колонка "Прогресс" — 6-я ячейка (index 5)
      const progressCell = firstRow.locator("td, [role=cell]").nth(5);
      const text = (await progressCell.innerText().catch(() => ""))?.trim();
      const m = text.match(/(\d+)%/);
      return m ? Number.parseInt(m[1], 10) : Number.NaN;
    });
  }

  async _tryFindEditorQuick(timeoutMs = 800) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const focused = this._focusedEditor.first();
      if (await focused.isVisible().catch(() => false)) return focused;

      const inRow = this._editorCandidatesInRow.first();
      if (await inRow.isVisible().catch(() => false)) return inRow;

      // часто редактор в оверлее
      const inOverlay = this._overlayContainers
        .filter({ has: this._editorCandidatesGlobal })
        .first()
        .locator(
          'input:not([type="search"]), textarea, [contenteditable="true"], [role="textbox"], [role="spinbutton"]',
        )
        .first();

      if (await inOverlay.isVisible().catch(() => false)) return inOverlay;

      // Retry delay in loop - legitimate use, keep as-is
      await this.page.waitForTimeout(TIMEOUTS.MICRO);
    }
    return null;
  }

  async _setValueInEditor(editor, value) {
    const str = String(value);

    // best-effort: для input/textarea используем fill; иначе type
    const tag = await editor
      .evaluate((el) => el.tagName?.toLowerCase?.() || "")
      .catch(() => "");
    const isInputLike = tag === "input" || tag === "textarea";

    await editor.click().catch(() => null);

    if (isInputLike) {
      await editor.press("Control+A").catch(() => null);
      await editor.fill(str).catch(async () => {
        await editor.press("Control+A").catch(() => null);
        await editor.type(str, { delay: 20 });
      });
    } else {
      // contenteditable / role=textbox
      await editor.press("Control+A").catch(() => null);
      await editor.type(str, { delay: 20 }).catch(() => null);
    }

    // Коммитим: Enter + blur
    await editor.press("Enter").catch(() => null);
    await this.title.click({ trial: false }).catch(() => null);
  }

  async _tryOpenEditorViaProgressButtons() {
    const count = await this.firstMilestoneProgressButtons.count();
    const limit = Math.min(count, 6);

    for (let i = 0; i < limit; i += 1) {
      const btn = this.firstMilestoneProgressButtons.nth(i);
      if (!(await btn.isVisible().catch(() => false))) continue;

      await btn.click().catch(() => null);
      const editor = await this._tryFindEditorQuick(800);
      if (editor) return editor;

      // если это меню/поповер — закрываем и идём дальше
      await this.page.keyboard.press("Escape").catch(() => null);
    }

    return null;
  }

  async _tryOpenEditorViaRowButtons() {
    const buttons = this.firstMilestoneRow.locator(
      'button:visible, [role="button"]:visible',
    );
    const count = await buttons.count();
    const limit = Math.min(count, 8);

    for (let i = 0; i < limit; i += 1) {
      const btn = buttons.nth(i);
      await btn.click().catch(() => null);
      const editor = await this._tryFindEditorQuick(800);
      if (editor) return editor;
      await this.page.keyboard.press("Escape").catch(() => null);
    }

    return null;
  }

  async _trySetProgressByBarClick(value) {
    // Иногда прогресс можно выставить кликом по полосе, без редактора
    const target = (await this.firstMilestoneProgressBar
      .isVisible()
      .catch(() => false))
      ? this.firstMilestoneProgressBar
      : this.firstMilestoneProgressContainer;

    const box = await target.boundingBox().catch(() => null);
    if (!box || box.width < 10) return false;

    const x = Math.max(
      1,
      Math.min(box.width - 1, Math.round((box.width * value) / 100)),
    );
    const y = Math.max(1, Math.round(box.height / 2));

    await target.click({ position: { x, y } }).catch(() => null);
    // Wait for progress update to be reflected in UI
    await this.firstMilestoneProgressInfo
      .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
      .catch(() => {});

    const current = await this.getFirstMilestoneCurrentProgress();
    return current === value;
  }

  async _tryOpenDetailsAndEdit(value) {
    // Иногда редактирование уехало в карточку/дроуер
    await this.firstMilestoneRow.click().catch(() => null);

    const overlay = this._overlayContainers.first();
    const overlayVisible = await overlay
      .waitFor({ state: "visible", timeout: 2000 })
      .then(() => true)
      .catch(() => false);

    if (!overlayVisible) return false;

    const editor = overlay
      .locator(
        'input:not([type="search"]), textarea, [contenteditable="true"], [role="textbox"], [role="spinbutton"]',
      )
      .first();

    const editorVisible = await editor
      .waitFor({ state: "visible", timeout: 2000 })
      .then(() => true)
      .catch(() => false);

    if (!editorVisible) {
      await this.page.keyboard.press("Escape").catch(() => null);
      return false;
    }

    await this._setValueInEditor(editor, value);

    // Закрываем оверлей, если он не закрылся сам
    await this.page.keyboard.press("Escape").catch(() => null);
    return true;
  }

  async updateFirstMilestoneProgress(newValue) {
    await this._step(
      `Обновить прогресс первого КР на ${newValue}%`,
      async () => {
        if (!this._expanded) {
          await this.expandFirstObjectiveRow();
        }

        // Новый лейаут (DEVAPR-11722):
        // Вариант A: input уже открыт (expand автоматически открывает editor)
        // Вариант B: hover → "Обновить КР" → input
        const inputLocator = this.page.locator(
          'input#objective-milestone-progress, tr:has-text("из") input',
        ).first();

        // Проверяем — вдруг input уже открыт после expand
        let inputReady = await inputLocator.isVisible().catch(() => false);

        if (!inputReady) {
          // Hover на строку КР → кнопка "Обновить КР"
          const krRow = this.page.locator('tr:has-text("База:")').first();
          await krRow.scrollIntoViewIfNeeded().catch(() => null);
          await krRow.hover();

          const updateBtn = this.page.getByRole("button", { name: /Обновить КР/i });
          const btnVisible = await updateBtn.waitFor({ state: "visible", timeout: 3000 })
            .then(() => true).catch(() => false);

          if (btnVisible) {
            await updateBtn.click();
          } else {
            // Fallback: hover на строку цели
            await this.objectiveRows.first().hover().catch(() => null);
            await updateBtn.waitFor({ state: "visible", timeout: 3000 });
            await updateBtn.click();
          }

          await inputLocator.waitFor({ state: "visible", timeout: 5000 });
        }

        const input = inputLocator;

        // Очищаем и вводим новое значение
        await input.fill(String(newValue));

        // Подтверждаем — кнопка ✓ в той же ячейке (tr cell с "из")
        const cell = this.page.locator('td:has-text("из"), [role="cell"]:has-text("из")').first();
        const confirmBtn = cell.locator("button").first();
        if (await confirmBtn.isVisible().catch(() => false)) {
          await confirmBtn.click();
        } else {
          await input.press("Enter");
        }

        // Ждём исчезновения input (редактор закрылся)
        await input
          .waitFor({ state: "hidden", timeout: 5000 })
          .catch(() => null);
      },
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // СТАТУС УТВЕРЖДЕНИЯ (DEVAPR-11722)
  // ═══════════════════════════════════════════════════════════════

  /** Проверить что колонка "Статус" видна */
  async assertStatusColumnVisible() {
    await this._step('Проверить видимость колонки "Статус"', async () => {
      await expect(this.statusColumnHeader).toBeVisible();
    });
  }

  /** Проверить что колонка "Статус" отсутствует */
  async assertStatusColumnHidden() {
    await this._step('Проверить отсутствие колонки "Статус"', async () => {
      await expect(this.statusColumnHeader).toHaveCount(0);
    });
  }

  /**
   * Получить текст статуса из строки таблицы по индексу
   * @param {number} rowIndex - Индекс строки (0-based)
   * @returns {Promise<string>}
   */
  async getStatusForRow(rowIndex) {
    const row = this.tableRows.nth(rowIndex);
    // Колонка статуса — 5-я (index 4) по порядку: Цель, Уровень, Период, Ответственный, Статус
    const statusCell = row.locator('td').nth(4);
    return (await statusCell.innerText()).trim();
  }

  /**
   * Получить все значения статусов из видимых строк
   * @returns {Promise<string[]>}
   */
  async getAllStatusValues() {
    return this._step('Получить все статусы из таблицы', async () => {
      const count = await this.tableRows.count();
      const statuses = [];
      for (let i = 0; i < count; i++) {
        const status = await this.getStatusForRow(i);
        statuses.push(status);
      }
      return statuses;
    });
  }

  /**
   * Применить фильтр по статусу
   * @param {string} statusText - Текст опции: "Все статусы"|"Требует утверждения"|"На утверждении"|"Утверждена"
   */
  async filterByStatus(statusText) {
    await this._step(`Фильтр по статусу: "${statusText}"`, async () => {
      await this.page.keyboard.press("Escape").catch(() => {});

      // React-select фильтра "Статус" содержит aria-live log с текстом "results available".
      // Рядом с ним — контейнер с SingleValue + combobox + DropdownIndicator.
      // Есть 2 таких react-select: "Уровень цели" и "Статус". Статус — последний.
      // Кликаем по DropdownIndicator (стрелка) — это cursor=pointer div после combobox.
      // Но проще: кликаем прямо по тексту значения фильтра, ограничив поиск вне table.
      const filtersArea = this.page.locator('table').locator('..');
      // Ищем текст текущего значения фильтра — НЕ внутри table
      // filtersArea содержит и фильтры и table. Нужна область фильтров без table.
      // Проще: берём все log[role=log] (aria-live react-select) — их 2, последний = статус.
      const logs = this.page.locator('[role="log"]');
      const logCount = await logs.count();
      const statusLog = logs.nth(logCount - 1);
      // Sibling: div-контейнер react-select (содержит SingleValue + combobox)
      // Кликнем по sibling-контейнеру (следующий div после log)
      const selectContainer = statusLog.locator('~ div').first();
      await selectContainer.click();

      const option = this.page.getByRole('option', { name: statusText, exact: true });
      await option.waitFor({ state: 'visible', timeout: TIMEOUTS.SHORT });
      await option.click();

      await this.page.waitForLoadState('networkidle', { timeout: TIMEOUTS.MEDIUM }).catch(() => {});
      await this.page.waitForTimeout(500);
    });
  }

  /** Клик по заголовку "Статус" для сортировки */
  async sortByStatus() {
    await this._step('Сортировать по статусу', async () => {
      // Кликаем по кнопке внутри th "Статус" (strict mode: берём именно кнопку, не th)
      const sortButton = this.statusColumnHeader.getByRole('button').first();
      await sortButton.click();
      await this.page.waitForLoadState('networkidle', { timeout: TIMEOUTS.MEDIUM }).catch(() => {});
    });
  }

  /**
   * Проверить что ВСЕ строки имеют указанный статус
   * @param {string} expectedStatus - Ожидаемый статус
   */
  async assertAllRowsHaveStatus(expectedStatus) {
    await this._step(`Проверить что все строки имеют статус "${expectedStatus}"`, async () => {
      const statuses = await this.getAllStatusValues();
      expect(statuses.length, 'Должна быть хотя бы 1 строка').toBeGreaterThan(0);
      for (let i = 0; i < statuses.length; i++) {
        expect(statuses[i], `Строка ${i}: статус должен быть "${expectedStatus}"`).toBe(expectedStatus);
      }
    });
  }

  /** Проверить что фильтр статуса видим */
  async assertStatusFilterVisible() {
    await this._step('Проверить видимость фильтра "Статус"', async () => {
      const statusLabel = this.page.getByText('Статус', { exact: true }).or(
        this.page.getByText('Все статусы')
      );
      await expect(statusLabel.first()).toBeVisible();
    });
  }

  /** Проверить что фильтр статуса скрыт */
  async assertStatusFilterHidden() {
    await this._step('Проверить отсутствие фильтра "Статус"', async () => {
      // Ищем лейбл "Статус" как отдельный фильтр (не внутри таблицы)
      const filterArea = this.page.locator('[class*="Filter"], [class*="filter"]')
        .filter({ hasText: /^Статус$|Все статусы/ });
      await expect(filterArea).toHaveCount(0);
    });
  }
}
