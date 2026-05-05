// pages/DevelopmentPlanTemplatesListPage.js
import { expect } from "@playwright/test";
import { BasePage } from "./BasePage.js";
import { TIMEOUTS } from "../tests/utils/constants.js";

/**
 * Страница списка шаблонов планов развития
 */
export class DevelopmentPlanTemplatesListPage extends BasePage {
  /**
   * @param {import('@playwright/test').Page} page
   * @param {import('@playwright/test').TestInfo} [testInfo]
   */
  constructor(page, testInfo) {
    super(page, testInfo);

    this.urlRe =
      /\/development-plan-templates\/?($|\?)|\/development-plans\/templates\/?($|\?)/;

    // Заголовок
    this.heading = this.page
      .getByRole("heading", { level: 1, name: /Шаблоны планов развития/i })
      .first();

    // Хлебные крошки
    this.breadcrumbs = this.page.locator('[class*="Breadcrumbs"]').first();

    // Кнопка создания шаблона (может быть link или button)
    this.createButton = this.page
      .getByRole("link", { name: /Создать шаблон/i })
      .first()
      .or(this.page.getByRole("button", { name: /Создать шаблон/i }).first());

    // Поиск
    this.searchInput = this.page
      .getByPlaceholder(/Найти|Поиск|Название шаблона/i)
      .first()
      .or(
        this.page.getByRole("textbox", { name: /Название шаблона/i }).first(),
      );

    // Список шаблонов
    this.templatesList = this.page
      .locator('[class*="TemplatesList"], [class*="List"]')
      .first();
    // Карточки шаблонов - это контейнеры с кнопкой-названием и кнопкой меню
    this.templateItems = this.page
      .locator('[class*="TemplateItem"], [class*="Card"]')
      .or(
        this.page
          .locator("button")
          .filter({ hasText: /Шаблон/i })
          .locator(".."),
      ); // родитель кнопки

    // Контекстное меню шаблона (пункты меню - не role="menuitem", а кнопки/ссылки)
    this.contextMenuButton = this.page.locator(
      '[class*="Menu"], [class*="dots"]',
    );
    this.menuOpen = this.page
      .getByRole("menuitem", { name: /Открыть/i })
      .first()
      .or(this.page.getByRole("button", { name: /Открыть/i }).first())
      .or(
        this.page
          .locator('[class*="Menu"], [class*="Popup"], [class*="Dropdown"]')
          .getByText("Открыть")
          .first(),
      );
    this.menuCreatePlan = this.page
      .getByRole("menuitem", { name: /Создать план по шаблону/i })
      .first()
      .or(
        this.page
          .getByRole("button", { name: /Создать план по шаблону/i })
          .first(),
      )
      .or(
        this.page
          .locator('[class*="Menu"], [class*="Popup"], [class*="Dropdown"]')
          .getByText("Создать план по шаблону")
          .first(),
      );
    this.menuEdit = this.page
      .getByRole("menuitem", { name: /Редактировать/i })
      .first()
      .or(this.page.getByRole("button", { name: /Редактировать/i }).first())
      .or(
        this.page
          .locator('[class*="Menu"], [class*="Popup"], [class*="Dropdown"]')
          .getByText("Редактировать")
          .first(),
      );
    this.menuDelete = this.page
      .getByRole("menuitem", { name: /Удалить/i })
      .first()
      .or(this.page.getByRole("button", { name: /Удалить/i }).first())
      .or(
        this.page
          .locator('[class*="Menu"], [class*="Popup"], [class*="Dropdown"]')
          .getByText("Удалить")
          .first(),
      );

    // Пагинация
    this.paginationBlock = this.page
      .locator('[class*="Pagination"], [class*="pagination"], nav[aria-label*="страниц"]')
      .first();
    this.nextPageButton = this.page
      .getByRole("button", { name: /Следующая|Next|→|›/i })
      .first();
  }

  async assertOpened() {
    await this._step(
      'Проверить, что открыта страница "Шаблоны планов развития"',
      async () => {
        await expect
          .poll(() => this.page.url(), { timeout: TIMEOUTS.PAGE_LOAD })
          .toMatch(this.urlRe);
        await expect(this.heading).toBeVisible({ timeout: TIMEOUTS.MEDIUM });
      },
    );
  }

  async assertBaseLayout() {
    await this._step("Проверить базовые элементы страницы", async () => {
      await this.assertOpened();
      await expect(this.createButton).toBeVisible({ timeout: TIMEOUTS.MEDIUM });
    });
  }

  /** Нажать "Создать шаблон" */
  async clickCreateTemplate() {
    await this._step('Нажать "Создать шаблон"', async () => {
      await this.createButton.click();
    });
  }

  /** Получить количество шаблонов */
  async getTemplatesCount() {
    return this._step("Получить количество шаблонов", async () => {
      return await this.templateItems.count();
    });
  }

  /** Найти шаблон по названию */
  async findTemplateByName(name) {
    return this._step(`Найти шаблон "${name}"`, async () => {
      // Сначала ищем шаблон через поиск (при большом количестве шаблонов)
      const searchVisible = await this.searchInput
        .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
        .then(() => true)
        .catch(() => false);
      if (searchVisible) {
        await this.searchInput.clear();
        await this.searchInput.fill(name);
        await this.page
          .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
          .catch(() => {});
      }

      // Шаблоны отображаются как кнопки: button "Название Шаблон"
      const templateButton = this.page
        .getByRole("button", {
          name: new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
        })
        .first();
      const isVisible = await templateButton
        .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
        .then(() => true)
        .catch(() => false);
      return isVisible ? templateButton : null;
    });
  }

  /** Открыть шаблон по названию */
  async openTemplateByName(name) {
    await this._step(`Открыть шаблон "${name}"`, async () => {
      // Сначала ищем шаблон через поиск (при большом количестве шаблонов)
      const searchVisible = await this.searchInput
        .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
        .then(() => true)
        .catch(() => false);
      if (searchVisible) {
        await this.searchInput.clear();
        await this.searchInput.fill(name);
        await this.page
          .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
          .catch(() => {});
      }

      // Находим карточку шаблона по accessible name
      const templateCard = this.page
        .getByRole("button", {
          name: new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
        })
        .first();
      await templateCard.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
      await templateCard.click();
    });
  }

  /** Открыть контекстное меню шаблона */
  async openTemplateContextMenu(name) {
    await this._step(`Открыть контекстное меню шаблона "${name}"`, async () => {
      // Сначала попробуем найти через поиск
      const searchVisible = await this.searchInput
        .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
        .then(() => true)
        .catch(() => false);
      if (searchVisible) {
        await this.searchInput.clear();
        await this.searchInput.fill(name);
        await this.page
          .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
          .catch(() => {});
      }

      // Структура DOM:
      // generic [container]
      //   button "Название Шаблон" [карточка шаблона] - accessible name включает полный текст
      //   button [кнопка меню "..."]

      // После ввода в поиск на странице остаётся только один шаблон
      // DOM структура:
      // generic [container]
      //   button [карточка шаблона - с текстом]
      //   button [кнопка меню "..." - без текста]

      // Находим карточку шаблона
      const templateCard = this.page
        .getByRole("button", {
          name: new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
        })
        .first();

      await templateCard.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });

      // Используем page.evaluate для поиска кнопки меню через DOM
      const cardHandle = await templateCard.elementHandle();
      const menuButtonHandle = await this.page.evaluateHandle((card) => {
        if (!card) return null;

        // Родительский контейнер содержит и карточку и кнопку меню
        const parent = card.parentElement;
        if (!parent) return null;

        // Находим все кнопки в родителе
        const buttons = Array.from(parent.querySelectorAll("button"));

        // Кнопка меню - это кнопка без текста (только иконка)
        for (const btn of buttons) {
          if (btn !== card) {
            const text = btn.innerText || "";
            if (!text.trim()) {
              return btn;
            }
          }
        }

        return null;
      }, cardHandle);

      const menuElement = menuButtonHandle.asElement();
      if (menuElement) {
        await menuElement.click();
        await this.menuDelete
          .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
          .catch(() => {});
      } else {
        throw new Error("Menu button not found in parent container");
      }
    });
  }

  /** Удалить шаблон через контекстное меню */
  async deleteTemplate(name) {
    await this._step(`Удалить шаблон "${name}"`, async () => {
      await this.openTemplateContextMenu(name);

      // Ждём появления меню и кликаем "Удалить"
      // Используем точный локатор - кнопка с текстом "Удалить"
      const deleteButton = this.page
        .getByRole("button", { name: "Удалить", exact: true })
        .first();
      await deleteButton.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
      await deleteButton.click();

      // Подтвердить удаление в диалоге
      const confirmButton = this.page
        .getByRole("button", { name: /Удалить|Да|Подтвердить/i })
        .last();
      await confirmButton
        .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
        .catch(() => {});
      await confirmButton.click().catch(() => {});
    });
  }
}
