import { expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { BasePage } from "./BasePage.js";
import { TIMEOUTS } from "../tests/utils/constants.js";
import { SELECTORS } from "../tests/utils/selectors.js";

export class MyTeamPage extends BasePage {
  /**
   * @param {import('@playwright/test').Page} page
   * @param {import('@playwright/test').TestInfo} [testInfo]
   */
  constructor(page, testInfo) {
    super(page, testInfo);

    this.urlRe = /\/dashboard\/?($|\?)/;

    this.heading = this.page
      .getByRole("heading", { level: 1, name: /Моя команда/i })
      .first();

    this.teamEvaluationTab = this.page
      .getByRole("button", { name: "Оценка команды" })
      .first();
    this.developmentPlansTab = this.page
      .getByRole("button", { name: "Планы развития" })
      .first();

    this.assessmentSelect = this.page
      .getByRole("button", { name: /Выберите оценку/i })
      .first();
    this.resultsForSelect = this.page
      .getByRole("button", { name: /Результаты для/i })
      .first();
    this.cycleSelect = this.page
      .getByRole("button", { name: /Выберите цикл оценки/i })
      .first();

    this.downloadSummaryButton = this.page
      .getByRole("button", { name: /Скачать сводный отчет/i })
      .first();

    this.searchInput = this.page.getByPlaceholder("Найти сотрудника").first();

    this.table = this.page.locator('table[class*="Table_table"]').first();
    this.tableHeaders = this.table.locator("thead th");
    this.tableRows = this.table.locator("tbody tr");

    // Кнопки "Результаты" в таблице оценки команды
    this.resultsButtons = this.tableRows.getByRole("button", {
      name: "Результаты",
    });

    // Вкладка "Планы развития"
    this.devTabContainer = this.page
      .locator(
        'div[class*="DevelopmentPlansTab_table__"], div[class*="DevelopmentPlansTab_table"]',
      )
      .first();

    this.devPlansTitle = this.page
      .getByRole("heading", { level: 2, name: /Планы развития/i })
      .first();
    this.devPlansCreateButton = this.page
      .getByRole("button", { name: /Создать план развития/i })
      .first();

    // Фильтры внутри вкладки "Планы развития"
    this.devPlansFilterLabel = this.devTabContainer
      .locator('label:has-text("Планы развития")')
      .first();
    this.devPlansFilterControl = this.devTabContainer
      .locator(
        'div.Select_group--size-medium__v0y_2:has(label:has-text("Планы развития")) div[class*="Select_control__"]',
      )
      .first();

    this.devEmployeesFilter = this.devTabContainer
      .getByRole("button", { name: "Сотрудники" })
      .first();
    this.devCuratorsFilter = this.devTabContainer
      .getByRole("button", { name: "Кураторы" })
      .first();
    this.devDepartmentsFilter = this.devTabContainer
      .getByRole("button", { name: "Отделы" })
      .first();
    this.devGroupsFilter = this.devTabContainer
      .getByRole("button", { name: "Группы" })
      .first();

    this.devStatusFilterLabel = this.devTabContainer
      .locator('label:has-text("Статус")')
      .first();
    this.devStatusFilterControl = this.devTabContainer
      .locator(
        'div.Select_group--size-medium__v0y_2:has(label:has-text("Статус")) div[class*="Select_control__"]',
      )
      .first();
    this.devPeriodInput = this.devTabContainer
      .getByLabel("Период действия", { exact: false })
      .first();

    this.devTable = this.devTabContainer
      .locator('table[class*="Table_table"]')
      .first();
    this.devTableHeaders = this.devTable.locator("thead th");
    this.devTableRows = this.devTable.locator("tbody tr");
  }

  /** Убедиться, что открыта страница "Моя команда" */
  async assertOpened() {
    await this._step('Открыта страница "Моя команда"', async () => {
      await expect
        .poll(() => this.page.url(), { timeout: TIMEOUTS.PAGE_LOAD })
        .toMatch(this.urlRe);
      await expect(this.heading).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD });
    });
  }

  /**
   * Переключиться на вкладку "Оценка команды" (PR модуль)
   * URL: /ru/dashboard/?tab=performanceReview
   */
  async switchToTeamEvaluationTab() {
    await this._step('Переключиться на вкладку "Оценка команды"', async () => {
      // Проверяем текущий URL
      const currentUrl = this.page.url();
      if (!currentUrl.includes("tab=performanceReview")) {
        // Либо клик по вкладке, либо навигация
        const tabVisible = await this.teamEvaluationTab
          .waitFor({ state: "visible", timeout: 2000 })
          .then(() => true)
          .catch(() => false);
        if (tabVisible) {
          await this.teamEvaluationTab.click();
        } else {
          // Fallback: навигация напрямую
          const baseUrl = process.env.BASE_URL;
          await this.page.goto(
            `${baseUrl}/ru/dashboard/?tab=performanceReview`,
          );
        }
      }
      // Ждём появления элементов, характерных для Оценки команды
      await expect(this.resultsForSelect).toBeVisible({
        timeout: TIMEOUTS.MEDIUM,
      });
    });
  }

  /**
   * Переключиться на вкладку "Планы развития"
   * URL: /ru/dashboard/?tab=developmentPlans
   */
  async switchToDevelopmentPlansTab() {
    await this._step('Переключиться на вкладку "Планы развития"', async () => {
      const currentUrl = this.page.url();
      if (!currentUrl.includes("tab=developmentPlans")) {
        const tabVisible = await this.developmentPlansTab
          .waitFor({ state: "visible", timeout: 2000 })
          .then(() => true)
          .catch(() => false);
        if (tabVisible) {
          await this.developmentPlansTab.click();
        } else {
          const baseUrl = process.env.BASE_URL;
          await this.page.goto(`${baseUrl}/ru/dashboard/?tab=developmentPlans`);
        }
      }
      await this.page.waitForLoadState("domcontentloaded");
    });
  }

  /** Проверить базовые элементы страницы без учёта данных в таблице */
  async assertBaseLayout() {
    await this._step('Базовые элементы страницы "Моя команда"', async () => {
      await this.assertOpened();

      await expect(this.teamEvaluationTab).toBeVisible({
        timeout: TIMEOUTS.MEDIUM,
      });
      await expect(this.developmentPlansTab).toBeVisible({
        timeout: TIMEOUTS.MEDIUM,
      });

      await expect(this.assessmentSelect).toBeVisible({
        timeout: TIMEOUTS.MEDIUM,
      });
      await expect(this.resultsForSelect).toBeVisible({
        timeout: TIMEOUTS.MEDIUM,
      });
      await expect(this.cycleSelect).toBeVisible({ timeout: TIMEOUTS.MEDIUM });

      await expect(this.downloadSummaryButton).toBeVisible({
        timeout: TIMEOUTS.MEDIUM,
      });
      await expect(this.searchInput).toBeVisible({ timeout: TIMEOUTS.MEDIUM });

      await expect(this.table).toBeVisible({ timeout: TIMEOUTS.MEDIUM });

      const headers = await this.tableHeaders.allInnerTexts();
      const normalized = headers
        .map((text) => text.replace(/\s+/g, " ").trim())
        .filter(Boolean);
      const requiredHeaders = [
        "Оцениваемый",
        "Самооценка",
        "Оценка руководителя",
      ];

      for (const expected of requiredHeaders) {
        expect(
          normalized.some((h) =>
            h.toLowerCase().includes(expected.toLowerCase()),
          ),
        ).toBeTruthy();
      }

      const rowsCount = await this.tableRows.count();
      if (rowsCount > 0) {
        await expect(this.tableRows.first()).toBeVisible({
          timeout: TIMEOUTS.MEDIUM,
        });
      }
    });
  }

  /** Перейти на вкладку "Планы развития" */
  async openDevelopmentPlansTab() {
    await this._step('Переключиться на вкладку "Планы развития"', async () => {
      await this.developmentPlansTab.click();
      await expect(this.devPlansTitle).toBeVisible({
        timeout: TIMEOUTS.MEDIUM,
      });
    });
  }

  /** Проверить элементы вкладки "Планы развития" без привязки к данным */
  async assertDevelopmentPlansLayout() {
    await this._step('Вкладка "Планы развития": базовые элементы', async () => {
      await this.openDevelopmentPlansTab();

      await expect(this.devPlansTitle).toBeVisible({
        timeout: TIMEOUTS.MEDIUM,
      });
      await expect(this.devPlansCreateButton).toBeVisible({
        timeout: TIMEOUTS.MEDIUM,
      });

      await expect(this.devPlansFilterLabel).toBeVisible({
        timeout: TIMEOUTS.MEDIUM,
      });
      await expect(this.devPlansFilterControl).toBeVisible({
        timeout: TIMEOUTS.MEDIUM,
      });
      await expect(this.devEmployeesFilter).toBeVisible({
        timeout: TIMEOUTS.MEDIUM,
      });
      await expect(this.devCuratorsFilter).toBeVisible({
        timeout: TIMEOUTS.MEDIUM,
      });
      await expect(this.devDepartmentsFilter).toBeVisible({
        timeout: TIMEOUTS.MEDIUM,
      });
      await expect(this.devGroupsFilter).toBeVisible({
        timeout: TIMEOUTS.MEDIUM,
      });
      await expect(this.devStatusFilterLabel).toBeVisible({
        timeout: TIMEOUTS.MEDIUM,
      });
      await expect(this.devStatusFilterControl).toBeVisible({
        timeout: TIMEOUTS.MEDIUM,
      });
      await expect(this.devPeriodInput).toBeVisible({
        timeout: TIMEOUTS.MEDIUM,
      });

      await expect(this.devTable).toBeVisible({ timeout: TIMEOUTS.MEDIUM });

      const headers = await this.devTableHeaders.allInnerTexts();
      const normalized = headers
        .map((text) => text.replace(/\s+/g, " ").trim())
        .filter(Boolean);
      const requiredHeaders = [
        "Сотрудник",
        "Цель плана развития",
        "Кураторы",
        "Период действия",
        "Прогресс",
        "Статус",
      ];

      for (const expected of requiredHeaders) {
        expect(
          normalized.some((h) =>
            h.toLowerCase().includes(expected.toLowerCase()),
          ),
        ).toBeTruthy();
      }

      const rowsCount = await this.devTableRows.count();
      if (rowsCount > 0) {
        await expect(this.devTableRows.first()).toBeVisible({
          timeout: TIMEOUTS.MEDIUM,
        });
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // МЕТОДЫ: Видимость вкладок (Review Admin)
  // ═══════════════════════════════════════════════════════════════════════

  async assertDevelopmentPlansTabHidden() {
    await this._step('Вкладка "Планы развития" НЕ видна', async () => {
      await expect(this.developmentPlansTab).not.toBeVisible();
    });
  }

  async assertOnlyAllowedTabs(expectedTabs) {
    await this._step(
      `Видны только вкладки: ${expectedTabs.join(", ")}`,
      async () => {
        // Все известные вкладки дашборда
        const ALL_TAB_NAMES = [
          "Оценка команды",
          "Распределение оценок",
          "Планы развития",
        ];

        const actualTabs = [];
        for (const name of ALL_TAB_NAMES) {
          const tab = this.page
            .getByRole("button", { name, exact: true })
            .first();
          if (await tab.isVisible()) {
            actualTabs.push(name);
          }
        }

        expect(actualTabs).toEqual(expectedTabs);
      },
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // МЕТОДЫ: Скачивание сводного отчёта
  // ═══════════════════════════════════════════════════════════════════════

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

  /**
   * Скачать сводный отчёт: клик по кнопке → перехват download или новой вкладки.
   * @returns {Promise<import('@playwright/test').Download>} Download или совместимый объект
   */
  async downloadSummaryReport() {
    return this._step("Скачать сводный отчёт", async () => {
      // Экспорт может скачаться напрямую или открыться в новой вкладке
      const eventPromise = Promise.race([
        this.page
          .waitForEvent("download", { timeout: 90000 })
          .then((d) => ({ type: "download", data: d })),
        this.page
          .context()
          .waitForEvent("page", { timeout: 90000 })
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

      // Пробуем поймать download на новой вкладке (5 сек)
      const newTabDownload = await newPage
        .waitForEvent("download", { timeout: 5000 })
        .catch(() => null);

      if (newTabDownload) {
        await newPage.close().catch(() => {});
        return newTabDownload;
      }

      // Извлекаем реальный URL файла из /download/?url=<encoded>
      const urlObj = new URL(pageUrl);
      const actualFileUrl = urlObj.searchParams.get("url") || pageUrl;
      await newPage.close().catch(() => {});

      // Скачиваем файл напрямую по API URL
      const response = await this.page
        .context()
        .request.get(actualFileUrl, { timeout: 60000 });
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

  /**
   * Получить данные из нижней таблицы сотрудников (Оцениваемый + оценки по направлениям)
   * @returns {Promise<Array<{name: string, scores: Object<string, string>}>>}
   */
  async getBottomTableData() {
    return this._step("Получить данные таблицы оценок", async () => {
      await this.table.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

      // Читаем заголовки
      const headerTexts = await this.tableHeaders.allInnerTexts();
      const headers = headerTexts
        .map((h) => h.replace(/\s+/g, " ").trim())
        .filter(Boolean);

      // Читаем строки
      const rowCount = await this.tableRows.count();
      const data = [];

      for (let i = 0; i < rowCount; i++) {
        const row = this.tableRows.nth(i);
        const cells = row.locator("td");
        const cellCount = await cells.count();

        // Первая ячейка — имя сотрудника
        const nameCell = cells.first();
        const nameText = await nameCell.innerText();
        const lines = nameText
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean);
        const name = lines.find((l) => l.length > 2) || lines[0] || "";

        // Остальные ячейки — оценки по направлениям
        const scores = {};
        for (let j = 1; j < cellCount && j < headers.length; j++) {
          const cellText = await cells.nth(j).innerText();
          const value = cellText.trim();
          if (value && headers[j]) {
            scores[headers[j]] = value;
          }
        }

        data.push({ name, scores });
      }

      console.log(`✓ Прочитано строк: ${data.length}`);
      return data;
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // МЕТОДЫ: Работа с кнопками "Результаты"
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Нажать кнопку "Результаты" для сотрудника по индексу
   * @param {number} index - Индекс строки (0-based)
   * @returns {Promise<void>}
   */
  async clickResultsForEmployee(index) {
    await this._step(
      `Нажать "Результаты" для сотрудника #${index + 1}`,
      async () => {
        const button = this.resultsButtons.nth(index);
        await button.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
        await button.click();
      },
    );
  }

  /**
   * Нажать кнопку "Результаты" для сотрудника по имени
   * @param {string} employeeName - Имя сотрудника (из колонки "Оцениваемый")
   * @returns {Promise<void>}
   */
  async clickResultsForEmployeeByName(employeeName) {
    await this._step(`Нажать "Результаты" для "${employeeName}"`, async () => {
      // Ищем строку где в ПЕРВОЙ колонке (Оцениваемый) есть нужное имя
      // Важно: нельзя искать по всей строке - там могут быть другие имена (оценщики)
      const row = this.tableRows
        .filter({
          has: this.page
            .locator("td")
            .first()
            .filter({ hasText: employeeName }),
        })
        .first();
      await row.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
      const button = row.getByRole("button", { name: "Результаты" });
      await button.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
      await button.click();
    });
  }

  /**
   * Получить строку таблицы по имени сотрудника (в колонке "Оцениваемый")
   * @param {string} employeeName - Имя сотрудника
   * @returns {import('@playwright/test').Locator}
   */
  getEmployeeRowByName(employeeName) {
    return this.tableRows
      .filter({
        has: this.page.locator("td").first().filter({ hasText: employeeName }),
      })
      .first();
  }

  /**
   * Получить количество сотрудников в таблице
   * @returns {Promise<number>}
   */
  async getEmployeesCount() {
    return this._step("Получить количество сотрудников в таблице", async () => {
      const count = await this.tableRows.count();
      console.log(`✓ Найдено сотрудников: ${count}`);
      return count;
    });
  }

  /**
   * Получить имя сотрудника из строки таблицы по индексу
   * @param {number} index - Индекс строки (0-based)
   * @returns {Promise<string>}
   */
  async getEmployeeNameByIndex(index) {
    return this._step(`Получить имя сотрудника #${index + 1}`, async () => {
      const row = this.tableRows.nth(index);
      // Первая ячейка содержит имя сотрудника
      const nameCell = row.locator("td").first();
      const text = await nameCell.innerText();
      // Пропускаем короткие строки (буквы аватара, иконки) и берём первое осмысленное имя
      const lines = text
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      const name = lines.find((l) => l.length > 2) || lines[0] || "";
      return name;
    });
  }

  /**
   * Получить список имён всех сотрудников в таблице
   * @returns {Promise<string[]>}
   */
  async getAllEmployeeNames() {
    return this._step("Получить список всех сотрудников", async () => {
      const count = await this.tableRows.count();
      const names = [];
      for (let i = 0; i < count; i++) {
        const row = this.tableRows.nth(i);
        const nameCell = row.locator("td").first();
        const text = await nameCell.innerText();
        // Пропускаем короткие строки (буквы аватара, иконки)
        const lines = text
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean);
        const name = lines.find((l) => l.length > 2) || lines[0] || "";
        names.push(name);
      }
      console.log(`✓ Сотрудники: ${names.join(", ")}`);
      return names;
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // МЕТОДЫ: Навигация по профилям (клик на аватар / имя)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Кликнуть на аватар сотрудника в таблице → переход в профиль
   * @param {string} employeeName - Имя сотрудника
   */
  async clickEmployeeAvatar(employeeName) {
    await this._step(
      `Кликнуть на аватар сотрудника «${employeeName}»`,
      async () => {
        const row = this.getEmployeeRowByName(employeeName);
        const employeeCell = row.locator("td").first();
        const avatar = employeeCell.locator('[class*="Avatar_avatar"]').first();
        await avatar.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
        await avatar.click();
      },
    );
  }

  /**
   * Ctrl+Click по аватару сотрудника → открыть профиль в новой вкладке
   * @param {string} employeeName - Имя сотрудника
   */
  async clickEmployeeAvatarCtrlClick(employeeName) {
    await this._step(
      `Ctrl+Click по аватару сотрудника «${employeeName}»`,
      async () => {
        const row = this.getEmployeeRowByName(employeeName);
        const employeeCell = row.locator("td").first();
        // Кликаем по <a> ссылке с Ctrl — Next.js Link проверяет ctrlKey и
        // не вызывает preventDefault(), позволяя браузеру открыть новую вкладку.
        const link = employeeCell.locator('a[href*="/profile/"]').first();
        await link.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
        // Используем keyboard.down/up вместо modifiers для более надёжной
        // эмуляции Ctrl-клика, который корректно устанавливает ctrlKey в MouseEvent
        await this.page.keyboard.down("Control");
        await link.click();
        await this.page.keyboard.up("Control");
      },
    );
  }

  /**
   * Кликнуть на аватар менеджера-оценщика в колонке «Оценка руководителя»
   * → переход в профиль менеджера
   */
  async clickManagerAvatarInScoreTable() {
    await this._step(
      "Кликнуть по аватару менеджера в колонке «Оценка руководителя»",
      async () => {
        // Находим td с аватаром, который НЕ является первой колонкой (там сотрудник)
        const scoreCell = this.page
          .locator("tr")
          .filter({ has: this.page.locator('[class*="Avatar_avatar"]') })
          .first()
          .locator("td")
          .filter({ has: this.page.locator('[class*="Avatar_avatar"]') })
          .nth(1); // вторая td с аватаром — колонка оценщика
        const avatar = scoreCell.locator('[class*="Avatar_avatar"]').first();
        await avatar.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
        await avatar.click();
      },
    );
  }

  /**
   * Кликнуть на имя/фамилию сотрудника в таблице → переход в профиль
   * @param {string} employeeName - Имя сотрудника
   */
  async clickEmployeeName(employeeName) {
    await this._step(
      `Кликнуть на имя сотрудника «${employeeName}»`,
      async () => {
        const row = this.getEmployeeRowByName(employeeName);
        const employeeCell = row.locator("td").first();
        const nameElement = employeeCell
          .locator('[class*="User_full-name-wrapper"] > div')
          .first();
        await nameElement.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        await nameElement.click();
      },
    );
  }

  /**
   * Навести курсор на аватар сотрудника (для проверки hover-эффектов)
   * @param {string} employeeName - Имя сотрудника
   */
  async hoverEmployeeAvatar(employeeName) {
    await this._step(
      `Навести на аватар сотрудника «${employeeName}»`,
      async () => {
        const row = this.getEmployeeRowByName(employeeName);
        const employeeCell = row.locator("td").first();
        const avatar = employeeCell.locator('[class*="Avatar_avatar"]').first();
        await avatar.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
        await avatar.hover();
      },
    );
  }

  /**
   * Найти первую строку с аватаром-заглушкой (без фото — инициалы или пустой)
   * @returns {{ row: import('@playwright/test').Locator, avatar: import('@playwright/test').Locator }}
   */
  getPlaceholderAvatarRow() {
    const row = this.tableRows
      .filter({
        has: this.page.locator(
          '[class*="Avatar_avatar--letters"], [class*="Avatar_avatar--empty"]',
        ),
      })
      .first();
    const avatar = row
      .locator(
        '[class*="Avatar_avatar--letters"], [class*="Avatar_avatar--empty"]',
      )
      .first();
    return { row, avatar };
  }

  /**
   * Получить имя сотрудника из строки таблицы
   * @param {import('@playwright/test').Locator} row - Строка таблицы
   * @returns {Promise<string>}
   */
  async getEmployeeNameFromRow(row) {
    const nameElement = row
      .locator('[class*="User_full-name-wrapper"] > div')
      .first();
    const nameVisible = await nameElement.isVisible().catch(() => false);
    if (nameVisible) {
      return (await nameElement.textContent()).trim();
    }
    // Fallback: текст из первой ячейки без инициалов
    const firstCell = row.locator("td").first();
    const cellText = (await firstCell.textContent()).trim();
    return cellText
      .replace(/^[A-ZА-ЯЁ]{1,2}(?=[A-ZА-ЯЁa-zа-яё])/, "")
      .trim();
  }

  /**
   * Получить текст тултипа при наведении на аватар
   * @param {string} employeeName - Имя сотрудника
   * @returns {Promise<string>} Текст тултипа
   */
  async getAvatarTooltipText(employeeName) {
    return this._step(`Получить тултип аватара «${employeeName}»`, async () => {
      await this.hoverEmployeeAvatar(employeeName);
      // Ждём 200ms+ (задержка тултипа по спеке)
      await this.page.waitForTimeout(300);
      const tooltip = this.page.locator('[role="tooltip"]').first();
      await tooltip.waitFor({
        state: "visible",
        timeout: TIMEOUTS.SHORT,
      });
      return tooltip.textContent();
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // МЕТОДЫ: Тепловая карта (heatmap) — Оценка команды
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Получить локатор первого аватара в тепловой карте (вкладка «Оценка команды»).
   * Сначала ищет в контейнере HeatMap/heatmap/table, затем fallback на любой аватар.
   * @returns {import('@playwright/test').Locator}
   */
  getFirstHeatmapAvatar() {
    const heatmapAvatar = this.page
      .locator('[class*="HeatMap"], [class*="heatmap"], table')
      .first()
      .locator('[class*="Avatar_avatar"]')
      .first();
    return heatmapAvatar;
  }

  /**
   * Получить первое имя сотрудника в тепловой карте.
   * @returns {import('@playwright/test').Locator}
   */
  getFirstHeatmapName() {
    const heatmapName = this.page
      .locator('[class*="HeatMap"], [class*="heatmap"], table')
      .first()
      .locator('[class*="User_full-name-wrapper"] > div')
      .first();
    return heatmapName;
  }

  /**
   * Кликнуть по аватару сотрудника в тепловой карте → переход в профиль.
   */
  async clickHeatmapAvatar() {
    await this._step(
      "Кликнуть по аватару сотрудника в тепловой карте",
      async () => {
        const avatar = this.getFirstHeatmapAvatar();
        const avatarVisible = await avatar
          .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
          .then(() => true)
          .catch(() => false);

        const target = avatarVisible
          ? avatar
          : this.page.locator('[class*="Avatar_avatar"]').first();
        await target.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
        await target.click();
      },
    );
  }

  /**
   * Кликнуть по имени сотрудника в тепловой карте → переход в профиль.
   */
  async clickHeatmapName() {
    await this._step(
      "Кликнуть по имени сотрудника в тепловой карте",
      async () => {
        const name = this.getFirstHeatmapName();
        const nameVisible = await name
          .isVisible()
          .catch(() => false);

        const target = nameVisible
          ? name
          : this.page.locator('[class*="User_full-name-wrapper"] > div').first();
        await target.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
        await target.click();
      },
    );
  }

  /**
   * Навести курсор на аватар сотрудника в тепловой карте и вернуть его локатор.
   * @returns {Promise<import('@playwright/test').Locator>} Локатор аватара, на который выполнен hover
   */
  async hoverHeatmapAvatar() {
    return this._step(
      "Навести на аватар сотрудника в тепловой карте",
      async () => {
        const avatar = this.getFirstHeatmapAvatar();
        const avatarVisible = await avatar
          .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
          .then(() => true)
          .catch(() => false);

        const target = avatarVisible
          ? avatar
          : this.page.locator('[class*="Avatar_avatar"]').first();
        await target.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
        await target.hover();
        return target;
      },
    );
  }

  /**
   * Проверить наличие hover-эффекта (overlay/opacity) на аватаре.
   * @param {import('@playwright/test').Locator} avatarLocator - Локатор аватара
   * @returns {Promise<boolean>}
   */
  async checkAvatarHoverEffect(avatarLocator) {
    const avatarWrapper = avatarLocator.locator("xpath=./..");
    const overlay = avatarWrapper
      .locator(
        '[class*="overlay"], [class*="Overlay"], [class*="hover"], [class*="dim"]',
      )
      .first();
    const overlayVisible = await overlay.isVisible().catch(() => false);

    const opacityChanged = await this.page.evaluate(
      (el) => {
        const computed = window.getComputedStyle(el);
        const children = el.querySelectorAll("*");
        for (const child of children) {
          const cs = window.getComputedStyle(child);
          if (parseFloat(cs.opacity) < 1) return true;
          if (
            cs.backgroundColor.includes("rgba") &&
            cs.position !== "static" &&
            parseFloat(cs.opacity) > 0
          )
            return true;
        }
        return parseFloat(computed.opacity) < 1;
      },
      await avatarLocator.elementHandle(),
    );

    return overlayVisible || opacityChanged;
  }

  /**
   * Ожидать появления тултипа и вернуть его текст.
   * @param {string} [expectedText] - Ожидаемый текст для фильтрации (опционально)
   * @returns {Promise<string>}
   */
  async getTooltipText(expectedText) {
    const tooltip = expectedText
      ? this.page
          .locator('[role="tooltip"]')
          .filter({ hasText: expectedText })
          .first()
      : this.page.locator('[role="tooltip"]').first();
    await tooltip.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });
    return (await tooltip.textContent())?.trim();
  }

  /**
   * Найти строку таблицы с усечённым (truncated) именем сотрудника.
   * @returns {Promise<{row: import('@playwright/test').Locator, fullName: string} | null>}
   */
  async findTruncatedNameRow() {
    return this._step(
      "Найти сотрудника с усечённым именем",
      async () => {
        const rows = await this.tableRows
          .filter({ has: this.page.locator('[class*="Avatar_avatar"]') })
          .all();

        for (const row of rows) {
          const nameEl = row
            .locator('[class*="User_full-name-wrapper"] > div')
            .first();
          if (!(await nameEl.isVisible().catch(() => false))) continue;
          const handle = await nameEl.elementHandle();
          if (!handle) continue;
          const isTruncated = await this.page.evaluate(
            (el) => el.scrollWidth > el.clientWidth,
            handle,
          );
          if (isTruncated) {
            const fullName = (await nameEl.textContent()).trim();
            return { row, fullName };
          }
        }
        return null;
      },
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // МЕТОДЫ: Работа с фильтрами дашборда
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Выбрать оценку в фильтре "Выберите оценку"
   * @param {string} assessmentName - Название оценки
   * @returns {Promise<void>}
   */
  async selectAssessmentFilter(assessmentName) {
    await this._step(
      `Выбрать оценку "${assessmentName}" в фильтре`,
      async () => {
        await this.assessmentSelect.click();

        const option = this.page
          .locator(SELECTORS.ROLE_OPTION)
          .filter({ hasText: assessmentName })
          .first();
        await option.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });
        await option.click();

        await this.assessmentSelect
          .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
          .catch(() => {});
      },
    );
  }

  /**
   * Выбрать Performance Review через модальное окно "Выберите оценку"
   * Модалка открывается по клику на фильтр и показывает карточки PR.
   * Поддерживает пагинацию: кликает «Показать ещё» до нахождения карточки.
   * @param {string} prTitle - Название PR (или часть названия)
   * @returns {Promise<void>}
   */
  async selectPRFromModal(prTitle) {
    await this._step(`Выбрать PR "${prTitle}" из модального окна`, async () => {
      // Кликаем на кнопку-фильтр чтобы открыть модалку
      await this.assessmentSelect.click();

      // Ждём появления модального окна с заголовком "Выберите оценку"
      const modal = this.page
        .locator('[class*="Modal"], [role="dialog"]')
        .filter({
          hasText: "Выберите оценку",
        })
        .first();
      await modal.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

      // Пытаемся найти карточку, при необходимости подгружая ещё
      const maxPages = 5;
      let found = false;

      for (let page = 0; page < maxPages; page++) {
        // Ищем карточку PR по тексту
        const prCard = modal
          .locator('button, [class*="Card"], [class*="card"]')
          .filter({ hasText: prTitle })
          .first();

        const cardVisible = await prCard
          .waitFor({ state: "visible", timeout: 2000 })
          .then(() => true)
          .catch(() => false);

        if (cardVisible) {
          await prCard.click();
          found = true;
          break;
        }

        // Карточка не найдена — кликаем «Показать ещё» для подгрузки
        const showMoreBtn = modal
          .getByRole("button", { name: /Показать ещ[её]/i })
          .first();
        const showMoreVisible = await showMoreBtn
          .waitFor({ state: "visible", timeout: 1000 })
          .then(() => true)
          .catch(() => false);

        if (!showMoreVisible) break; // Больше нечего подгружать
        await showMoreBtn.click();
        await this.page.waitForTimeout(500);
      }

      if (!found) {
        // Финальная попытка — поиск по тексту в любом элементе
        const altCard = modal.getByText(prTitle, { exact: false }).first();
        await altCard.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });
        await altCard.click();
      }

      // Ждём закрытия модалки и обновления таблицы
      await modal
        .waitFor({ state: "hidden", timeout: TIMEOUTS.SHORT })
        .catch(() => {});
      await this.table.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
    });
  }

  /**
   * Найти и выбрать PR по паттерну (частичное совпадение названия)
   * @param {string} pattern - Паттерн для поиска в названии PR
   * @returns {Promise<boolean>} true если PR найден и выбран, false если не найден
   */
  async selectPRByPattern(pattern) {
    return this._step(
      `Найти и выбрать PR по паттерну "${pattern}"`,
      async () => {
        // Кликаем на кнопку-фильтр чтобы открыть модалку
        await this.assessmentSelect.click();

        // Ждём появления модального окна с заголовком "Выберите оценку"
        const modal = this.page
          .locator('[class*="Modal"], [role="dialog"]')
          .filter({
            hasText: "Выберите оценку",
          })
          .first();

        try {
          await modal.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
        } catch {
          console.log(`⚠️ Модальное окно выбора PR не открылось`);
          return false;
        }

        // Ищем карточку PR по паттерну (частичное совпадение)
        // Карточки обычно в виде button или div с классом Card
        const allCards = modal.locator(
          'button, [class*="Card"], [class*="card"]',
        );
        const cardCount = await allCards.count();

        console.log(`✓ Найдено карточек в модалке: ${cardCount}`);

        for (let i = 0; i < cardCount; i++) {
          const card = allCards.nth(i);
          const text = await card.innerText().catch(() => "");
          if (text.includes(pattern)) {
            console.log(
              `✓ Найден PR с паттерном "${pattern}": ${text.substring(0, 50)}...`,
            );
            await card.click();
            await modal
              .waitFor({ state: "hidden", timeout: TIMEOUTS.SHORT })
              .catch(() => {});
            await this.table.waitFor({
              state: "visible",
              timeout: TIMEOUTS.MEDIUM,
            });
            return true;
          }
        }

        // Если не нашли в карточках, пробуем найти текст напрямую
        const textMatch = modal.getByText(pattern, { exact: false }).first();
        const textVisible = await textMatch
          .waitFor({ state: "visible", timeout: 1000 })
          .then(() => true)
          .catch(() => false);
        if (textVisible) {
          console.log(`✓ Найден PR по тексту с паттерном "${pattern}"`);
          await textMatch.click();
          await modal
            .waitFor({ state: "hidden", timeout: TIMEOUTS.SHORT })
            .catch(() => {});
          await this.table.waitFor({
            state: "visible",
            timeout: TIMEOUTS.MEDIUM,
          });
          return true;
        }

        // PR не найден - закрываем модалку
        console.log(`⚠️ PR с паттерном "${pattern}" не найден в модалке`);
        await this.page.keyboard.press("Escape");
        await modal
          .waitFor({ state: "hidden", timeout: TIMEOUTS.SHORT })
          .catch(() => {});
        return false;
      },
    );
  }

  /**
   * Проверить, что выбран нужный PR
   * @param {string} prTitle - Ожидаемое название PR
   * @returns {Promise<boolean>}
   */
  async isPRSelected(prTitle) {
    return this._step(`Проверить, что выбран PR "${prTitle}"`, async () => {
      const selectedText = await this.assessmentSelect.innerText();
      const isSelected = selectedText.includes(prTitle);
      console.log(
        `✓ Текущий PR: "${selectedText}", ожидается: "${prTitle}", совпадает: ${isSelected}`,
      );
      return isSelected;
    });
  }

  /**
   * Выбрать сотрудников в фильтре "Результаты для"
   * @param {string[]} names - Массив имён сотрудников
   * @returns {Promise<void>}
   */
  async selectEmployeeFilter(names) {
    await this._step(`Выбрать сотрудников: ${names.join(", ")}`, async () => {
      await this.resultsForSelect.click();

      const firstOption = this.page.locator(SELECTORS.ROLE_OPTION).first();
      await firstOption.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });

      for (const name of names) {
        const option = this.page
          .locator(SELECTORS.ROLE_OPTION)
          .filter({ hasText: name })
          .first();
        await option.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });
        await option.click();
      }

      // Закрыть dropdown кликом вне
      await this.heading.click();
      await this.table
        .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
        .catch(() => {});
    });
  }

  /**
   * Выбрать цикл оценки в фильтре "Выберите цикл оценки"
   * @param {string} cycleName - Название цикла
   * @returns {Promise<void>}
   */
  async selectCycleFilter(cycleName) {
    await this._step(`Выбрать цикл оценки "${cycleName}"`, async () => {
      await this.cycleSelect.click();

      const option = this.page
        .locator(SELECTORS.ROLE_OPTION)
        .filter({ hasText: cycleName })
        .first();
      await option.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });
      await option.click();

      await this.cycleSelect
        .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
        .catch(() => {});
    });
  }

  /**
   * Получить текущее значение фильтра "Выберите оценку"
   * @returns {Promise<string>}
   */
  async getSelectedAssessment() {
    return this._step("Получить выбранную оценку", async () => {
      const text = await this.assessmentSelect.innerText();
      return text.trim();
    });
  }

  /**
   * Получить текущее значение фильтра "Выберите цикл оценки"
   * @returns {Promise<string>}
   */
  async getSelectedCycle() {
    return this._step("Получить выбранный цикл", async () => {
      const text = await this.cycleSelect.innerText();
      return text.trim();
    });
  }

  /**
   * Найти сотрудника по имени через поле поиска
   * @param {string} name - Имя для поиска
   * @returns {Promise<void>}
   */
  async searchEmployee(name) {
    await this._step(`Найти сотрудника "${name}"`, async () => {
      await this.searchInput.fill(name);
      await this.table
        .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
        .catch(() => {});
    });
  }

  /**
   * Очистить поле поиска сотрудника
   * @returns {Promise<void>}
   */
  async clearSearch() {
    await this._step("Очистить поиск", async () => {
      await this.searchInput.clear();
      await this.table
        .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
        .catch(() => {});
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // МЕТОДЫ: Модалка фильтра "Результаты для" (Сотрудники/Отделы/Группы)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Открыть модалку фильтра "Результаты для"
   * @returns {Promise<import('@playwright/test').Locator>} Локатор модалки
   */
  async openResultsForModal() {
    return this._step('Открыть модалку "Результаты для"', async () => {
      await this.resultsForSelect.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
      await this.resultsForSelect.click();

      // Модалка появляется как popup/sheet
      const modal = this.page
        .locator('[class*="SheetModal"], [class*="Modal"], [role="dialog"]')
        .filter({
          hasText: "Результаты для",
        })
        .first();

      await modal.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
      console.log('✓ Модалка "Результаты для" открыта');
      return modal;
    });
  }

  /**
   * Получить локатор модалки "Результаты для" (если уже открыта)
   * @returns {import('@playwright/test').Locator}
   */
  getResultsForModal() {
    return this.page
      .locator('[class*="SheetModal"], [class*="Modal"], [role="dialog"]')
      .filter({
        hasText: "Результаты для",
      })
      .first();
  }

  /**
   * Проверить, что модалка "Результаты для" открыта и содержит все элементы
   * @returns {Promise<{modal: import('@playwright/test').Locator, tabs: object, searchInput: import('@playwright/test').Locator, applyButton: import('@playwright/test').Locator, resetButton: import('@playwright/test').Locator}>}
   */
  async assertResultsForModalOpened() {
    return this._step(
      'Проверить элементы модалки "Результаты для"',
      async () => {
        const modal = this.getResultsForModal();
        await expect(modal).toBeVisible({ timeout: TIMEOUTS.MEDIUM });

        // Вкладки
        const employeesTab = modal
          .getByRole("button", { name: "Сотрудники" })
          .first();
        const departmentsTab = modal
          .getByRole("button", { name: "Отделы" })
          .first();
        const groupsTab = modal.getByRole("button", { name: "Группы" }).first();

        await expect(employeesTab).toBeVisible({ timeout: TIMEOUTS.SHORT });
        await expect(departmentsTab).toBeVisible({ timeout: TIMEOUTS.SHORT });
        await expect(groupsTab).toBeVisible({ timeout: TIMEOUTS.SHORT });

        // Поиск (placeholder зависит от активной вкладки)
        const searchInput = modal.getByRole("textbox").first();
        await expect(searchInput).toBeVisible({ timeout: TIMEOUTS.SHORT });

        // Кнопка "Применить"
        const applyButton = modal
          .getByRole("button", { name: "Применить" })
          .first();

        // Кнопка "Сбросить все" (может быть скрыта если ничего не выбрано)
        const resetButton = modal
          .getByRole("button", { name: /Сбросить все/i })
          .first();

        console.log("✓ Все элементы модалки присутствуют");

        return {
          modal,
          tabs: { employeesTab, departmentsTab, groupsTab },
          searchInput,
          applyButton,
          resetButton,
        };
      },
    );
  }

  /**
   * Переключиться на вкладку в модалке "Результаты для"
   * @param {'employees' | 'departments' | 'groups'} tabName - Название вкладки
   * @returns {Promise<void>}
   */
  async switchResultsForTab(tabName) {
    await this._step(`Переключиться на вкладку "${tabName}"`, async () => {
      const modal = this.getResultsForModal();

      const tabMap = {
        employees: "Сотрудники",
        departments: "Отделы",
        groups: "Группы",
      };

      const placeholderMap = {
        employees: "Имя, фамилия или почта",
        departments: "Название отдела",
        groups: "Название группы",
      };

      const tabButton = modal
        .getByRole("button", { name: tabMap[tabName] })
        .first();
      await tabButton.click();

      // Ждём обновления контента вкладки: placeholder поиска меняется при переключении
      const expectedPlaceholder = placeholderMap[tabName];
      if (expectedPlaceholder) {
        await modal
          .getByRole("textbox", { name: expectedPlaceholder })
          .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
          .catch(() => {});
      }

      // Ждём загрузки данных вкладки
      await this.page
        .waitForLoadState("networkidle", { timeout: TIMEOUTS.SHORT })
        .catch(() => {});

      console.log(`✓ Вкладка "${tabMap[tabName]}" активна`);
    });
  }

  /**
   * Получить placeholder поля поиска в зависимости от активной вкладки
   * @returns {Promise<string>}
   */
  async getResultsForSearchPlaceholder() {
    const modal = this.getResultsForModal();
    const searchInput = modal.getByRole("textbox").first();
    const placeholder = await searchInput.getAttribute("placeholder");
    return placeholder || "";
  }

  /**
   * Выполнить поиск в модалке "Результаты для"
   * @param {string} query - Поисковый запрос
   * @returns {Promise<void>}
   */
  async searchInResultsForModal(query) {
    await this._step(`Поиск в модалке: "${query}"`, async () => {
      const modal = this.getResultsForModal();
      const searchInput = modal.getByRole("textbox").first();
      await searchInput.fill(query);

      // Ждём debounce поиска (обычно 300-500мс) + обновления списка
      await this.page.waitForTimeout(1000).catch(() => {});
      await this.page
        .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
        .catch(() => {});
      console.log(`✓ Введён поисковый запрос: "${query}"`);
    });
  }

  /**
   * Выбрать элемент в дереве модалки "Результаты для" по тексту
   * @param {string} itemText - Текст элемента (имя сотрудника, название отдела или группы)
   * @returns {Promise<void>}
   */
  async selectItemInResultsForModal(itemText) {
    await this._step(`Выбрать "${itemText}" в модалке`, async () => {
      const modal = this.getResultsForModal();

      // Ищем строку списка по тексту: UserOption_row / DepartmentOption_row / GroupOption_row / AllOption_row
      const item = modal
        .locator('[class*="Option_row"]')
        .filter({ hasText: itemText })
        .first();

      await item.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });
      await item.click();
      console.log(`✓ Выбран элемент: "${itemText}"`);

      // Ждём обновления UI после клика
      await this.page.waitForTimeout(300).catch(() => {});
    });
  }

  /**
   * Получить количество выбранных элементов в модалке
   * @returns {Promise<number>}
   */
  async getSelectedCountInResultsForModal() {
    return this._step("Получить количество выбранных", async () => {
      const modal = this.getResultsForModal();

      // Ищем текст "Выбрано: N"
      const selectedText = modal
        .locator("*")
        .filter({ hasText: /Выбрано:\s*\d+/i })
        .first();
      if (
        await selectedText
          .waitFor({ state: "visible", timeout: 1000 })
          .then(() => true)
          .catch(() => false)
      ) {
        const text = await selectedText.innerText();
        const match = text.match(/Выбрано:\s*(\d+)/i);
        if (match) {
          const count = parseInt(match[1], 10);
          console.log(`✓ Выбрано: ${count}`);
          return count;
        }
      }

      console.log("⚠️ Счётчик выбранных не найден");
      return 0;
    });
  }

  /**
   * Нажать "Сбросить все" в модалке
   * @returns {Promise<void>}
   */
  async resetAllInResultsForModal() {
    await this._step("Сбросить все выбранные", async () => {
      const modal = this.getResultsForModal();

      // Ждём загрузки контента модалки перед сбросом
      await this.page
        .waitForFunction(
          () => {
            const m = document.querySelector('[class*="SheetModal"]');
            if (!m) return false;
            return m.querySelectorAll('[class*="Option_row"]').length > 1;
          },
          { timeout: TIMEOUTS.SHORT },
        )
        .catch(() => {});

      const resetButton = modal
        .getByRole("button", { name: /Сбросить все/i })
        .first();

      if (
        await resetButton
          .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
          .then(() => true)
          .catch(() => false)
      ) {
        await resetButton.click();
        // Ждём обновления UI после сброса
        await this.page.waitForTimeout(500).catch(() => {});
        console.log("✓ Все выбранные сброшены");
      } else {
        console.log(
          '⚠️ Кнопка "Сбросить все" не доступна (возможно ничего не выбрано)',
        );
      }
    });
  }

  /**
   * Нажать "Применить" в модалке и дождаться обновления таблицы
   * @returns {Promise<void>}
   */
  async applyResultsForFilter() {
    await this._step("Применить фильтр", async () => {
      const modal = this.getResultsForModal();
      const applyButton = modal
        .getByRole("button", { name: "Применить" })
        .first();

      // Кнопка может быть disabled если ничего не изменилось
      const isEnabled = await applyButton.isEnabled();
      if (isEnabled) {
        await applyButton.click();
        // Ждём закрытия модалки и обновления таблицы
        await modal
          .waitFor({ state: "hidden", timeout: TIMEOUTS.SHORT })
          .catch(() => {});
        await this.table.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        console.log("✓ Фильтр применён");
      } else {
        console.log('⚠️ Кнопка "Применить" не активна');
      }
    });
  }

  /**
   * Закрыть модалку "Результаты для" без применения
   * @returns {Promise<void>}
   */
  async closeResultsForModal() {
    await this._step("Закрыть модалку без применения", async () => {
      const modal = this.getResultsForModal();

      // Ищем кнопку закрытия (крестик)
      const closeButton = modal
        .locator("button")
        .filter({
          has: this.page.locator(
            'svg, img, [class*="close"], [class*="Close"]',
          ),
        })
        .first();

      if (
        await closeButton
          .waitFor({ state: "visible", timeout: 1000 })
          .then(() => true)
          .catch(() => false)
      ) {
        await closeButton.click();
      } else {
        // Нажимаем Escape
        await this.page.keyboard.press("Escape");
      }

      // Ждём закрытия модалки
      await modal
        .waitFor({ state: "hidden", timeout: TIMEOUTS.MODAL_CLOSE })
        .catch(() => {});

      // Проверяем что модалка закрылась
      const isVisible = await modal
        .waitFor({ state: "visible", timeout: 1000 })
        .then(() => true)
        .catch(() => false);
      if (!isVisible) {
        console.log("✓ Модалка закрыта");
      } else {
        console.log("⚠️ Модалка не закрылась");
      }
    });
  }

  /**
   * Получить текущее значение фильтра "Результаты для"
   * @returns {Promise<string>}
   */
  async getSelectedResultsFor() {
    return this._step(
      'Получить выбранное значение "Результаты для"',
      async () => {
        const text = await this.resultsForSelect.innerText();
        // Текст может быть "Результаты для\nМарина Леонова" — берём вторую строку
        const lines = text.split("\n").filter(Boolean);
        const value = lines.length > 1 ? lines.slice(1).join(", ") : lines[0];
        console.log(`✓ Результаты для: "${value}"`);
        return value.trim();
      },
    );
  }

  /**
   * Получить список элементов в модалке (сотрудники/отделы/группы в зависимости от вкладки)
   * @returns {Promise<string[]>}
   */
  async getItemsInResultsForModal() {
    return this._step("Получить список элементов в модалке", async () => {
      // Ждём загрузки контента модалки: ждём >1 ВИДИМОГО Option_row (первый — "Все ...", остальные — реальные)
      await this.page
        .waitForFunction(
          () => {
            const modal = document.querySelector('[class*="SheetModal"]');
            if (!modal) return false;
            const rows = modal.querySelectorAll('[class*="Option_row"]');
            const visible = Array.from(rows).filter((el) => {
              const s = window.getComputedStyle(el);
              return (
                s.display !== "none" &&
                s.visibility !== "hidden" &&
                el.offsetParent !== null
              );
            });
            return visible.length > 1;
          },
          { timeout: TIMEOUTS.MEDIUM },
        )
        .catch(() => {});

      // Получаем ВИДИМЫЕ элементы через page.evaluate (минуя Playwright locator resolution)
      const items = await this.page.evaluate(() => {
        const modal = document.querySelector('[class*="SheetModal"]');
        if (!modal) return [];
        const rows = modal.querySelectorAll('[class*="Option_row"]');
        return Array.from(rows)
          .filter((el) => {
            // Пропускаем скрытые элементы (отфильтрованные поиском)
            const style = window.getComputedStyle(el);
            return (
              style.display !== "none" &&
              style.visibility !== "hidden" &&
              el.offsetParent !== null
            );
          })
          .map((el) => {
            const text = el.innerText || "";
            const lines = text
              .split("\n")
              .map((l) => l.trim())
              .filter(Boolean);
            return lines.find((l) => l.length > 2) || "";
          })
          .filter((name) => name && !name.startsWith("Все "));
      });

      console.log(`✓ Найдено элементов: ${items.length}`);
      if (items.length > 0) {
        console.log(
          `✓ Элементы: ${items.slice(0, 5).join(", ")}${items.length > 5 ? "..." : ""}`,
        );
      }
      return items;
    });
  }
}
