// pages/DevelopmentPlansListPage.js
import { expect } from "@playwright/test";
import { BasePage } from "./BasePage.js";
import { TIMEOUTS } from "../tests/utils/constants.js";

/**
 * Страница списка планов развития (Развитие > Планы развития)
 */
export class DevelopmentPlansListPage extends BasePage {
  /**
   * @param {import('@playwright/test').Page} page
   * @param {import('@playwright/test').TestInfo} [testInfo]
   */
  constructor(page, testInfo) {
    super(page, testInfo);

    this.urlRe = /\/development-plans\/?($|\?)/;

    // Заголовок страницы
    this.heading = this.page
      .getByRole("heading", { level: 1, name: /Планы развития/i })
      .first();

    // Хлебные крошки
    this.breadcrumbs = this.page.locator('[class*="Breadcrumbs"]').first();

    // Кнопка создания плана
    this.createButton = this.page
      .getByRole("button", { name: /Создать план развития/i })
      .first();

    // Popup выбора типа плана (если есть шаблоны).
    // Текст в popup-кнопках разбит на строки ("Новый" + "план развития"),
    // поэтому getByText не находит полную фразу — используем getByRole с regex.
    this.newPlanOption = this.page
      .getByRole("button", { name: /новый.*план развития/i })
      .first();
    this.templatePlanOption = this.page
      .getByRole("button", { name: /план развития.*по шаблону/i })
      .first();

    // Поиск (placeholder может быть "Поиск плана" или "Найти")
    this.searchInput = this.page.getByPlaceholder(/Поиск плана|Найти/i).first();

    // Таблица планов
    this.table = this.page.locator('table[class*="Table_table"]').first();
    this.tableHeaders = this.table.locator("thead th");
    this.tableRows = this.table.locator("tbody tr");

    // Пагинация
    this.paginationBlock = this.page
      .locator('[class*="Pagination"], [class*="pagination"]')
      .first();
    this.nextPageButton = this.page
      .getByRole("button", { name: /Следующая|Next|→|›/i })
      .first();

    // Фильтры
    this.statusFilter = this.page.locator('label:has-text("Статус")').first();
    this.employeesFilter = this.page
      .getByRole("button", { name: "Сотрудники" })
      .first();
    this.curatorsFilter = this.page
      .getByRole("button", { name: "Кураторы" })
      .first();
  }

  async assertOpened() {
    await this._step(
      'Проверить, что открыта страница "Планы развития"',
      async () => {
        await expect
          .poll(() => this.page.url(), { timeout: TIMEOUTS.PAGE_LOAD })
          .toMatch(this.urlRe);
        await expect(this.heading).toBeVisible({ timeout: TIMEOUTS.MEDIUM });
      },
    );
  }

  async assertBaseLayout() {
    await this._step(
      'Проверить базовые элементы страницы "Планы развития"',
      async () => {
        await this.assertOpened();
        await expect(this.createButton).toBeVisible({
          timeout: TIMEOUTS.MEDIUM,
        });
        await expect(this.table).toBeVisible({ timeout: TIMEOUTS.MEDIUM });
      },
    );
  }

  /** Нажать "Создать план развития" */
  async clickCreatePlan() {
    await this._step('Нажать "Создать план развития"', async () => {
      await this.createButton.click();
    });
  }

  /** Выбрать "Новый план развития" из popup */
  async selectNewPlan() {
    await this._step('Выбрать "Новый план развития"', async () => {
      const isVisible = await this.newPlanOption
        .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
        .then(() => true)
        .catch(() => false);
      if (isVisible) {
        await this.newPlanOption.click();
      }
      // Если popup не появился, значит сразу открывается форма создания
    });
  }

  /** Выбрать "План развития по шаблону" из popup */
  async selectPlanFromTemplate() {
    await this._step('Выбрать "План развития по шаблону"', async () => {
      await this.templatePlanOption.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
      await this.templatePlanOption.click();
    });
  }

  /** Найти план по названию в таблице (с поиском и пагинацией) */
  async findPlanByName(name) {
    return this._step(`Найти план "${name}" в таблице`, async () => {
      // Пробуем найти через поле поиска (ждём 1 сек, чтобы не блокировать если поля нет)
      const searchVisible = await this.searchInput
        .waitFor({ state: "visible", timeout: 1000 })
        .then(() => true)
        .catch(() => false);

      if (searchVisible) {
        await this.searchInput.clear();
        await this.searchInput.fill(name);
        await this.page
          .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
          .catch(() => {});
      }

      // Дождаться загрузки таблицы перед первой проверкой
      await this.page
        .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
        .catch(() => {});

      // Проверяем первую страницу (ждём до SHORT)
      const row = this.tableRows.filter({ hasText: name }).first();
      let isVisible = await row
        .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
        .then(() => true)
        .catch(() => false);
      if (isVisible) return row;

      // Если поиск недоступен — перебираем страницы через "Показать еще"
      if (!searchVisible) {
        const showMoreBtn = this.page
          .getByRole("button", { name: /Показать ещ[её]/i })
          .first();
        for (let i = 0; i < 20; i++) {
          const btnVisible = await showMoreBtn
            .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
            .then(() => true)
            .catch(() => false);
          if (!btnVisible) break;
          await showMoreBtn.scrollIntoViewIfNeeded();
          await showMoreBtn.click({ force: true });
          await this.page
            .waitForLoadState("networkidle", { timeout: TIMEOUTS.SHORT })
            .catch(() => {});
          const currentRow = this.tableRows.filter({ hasText: name }).first();
          isVisible = await currentRow
            .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
            .then(() => true)
            .catch(() => false);
          if (isVisible) return currentRow;
        }
      }

      return null;
    });
  }

  /** Открыть план по названию (с поиском и пагинацией) */
  async openPlanByName(name) {
    await this._step(`Открыть план "${name}"`, async () => {
      // Пробуем найти через поле поиска (ждём 1 сек)
      const searchVisible = await this.searchInput
        .waitFor({ state: "visible", timeout: 1000 })
        .then(() => true)
        .catch(() => false);

      if (searchVisible) {
        await this.searchInput.clear();
        await this.searchInput.fill(name);
        await this.page
          .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
          .catch(() => {});
      }

      // Проверяем первую страницу (2 сек)
      let row = this.tableRows.filter({ hasText: name }).first();
      let isVisible = await row
        .waitFor({ state: "visible", timeout: 2000 })
        .then(() => true)
        .catch(() => false);

      if (!isVisible && !searchVisible) {
        // Перебираем страницы через "Показать еще"
        const showMoreBtn = this.page
          .getByRole("button", { name: /Показать ещ[её]/i })
          .first();
        for (let i = 0; i < 10; i++) {
          const btnVisible = await showMoreBtn
            .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
            .then(() => true)
            .catch(() => false);
          if (!btnVisible) break;
          await showMoreBtn.scrollIntoViewIfNeeded();
          await showMoreBtn.click({ force: true });
          await this.page
            .waitForLoadState("networkidle", { timeout: TIMEOUTS.SHORT })
            .catch(() => {});
          row = this.tableRows.filter({ hasText: name }).first();
          isVisible = await row
            .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
            .then(() => true)
            .catch(() => false);
          if (isVisible) break;
        }
      }

      if (!isVisible) {
        throw new Error(`План "${name}" не найден в таблице`);
      }
      await row.click();
    });
  }

  /** Получить количество планов в таблице */
  async getPlansCount() {
    return this._step("Получить количество планов в таблице", async () => {
      return await this.tableRows.count();
    });
  }
}
