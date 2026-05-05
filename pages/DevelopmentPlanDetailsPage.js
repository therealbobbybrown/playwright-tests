// pages/DevelopmentPlanDetailsPage.js
import { expect } from "@playwright/test";
import { BasePage } from "./BasePage.js";
import { TIMEOUTS } from "../tests/utils/constants.js";

/**
 * Страница просмотра/редактирования плана развития
 */
export class DevelopmentPlanDetailsPage extends BasePage {
  /**
   * @param {import('@playwright/test').Page} page
   * @param {import('@playwright/test').TestInfo} [testInfo]
   */
  constructor(page, testInfo) {
    super(page, testInfo);

    this.urlRe = /\/development-plans\/\d+/;

    // Заголовок страницы ("Индивидуальный план развития")
    this.heading = this.page.getByRole("heading", { level: 1 }).first();

    // Цель плана — отдельное поле на странице (не в заголовке H1)
    // Структура: container > [label "Цель плана развития"] > [value "текст цели"]
    this.goalField = this.page
      .getByText("Цель плана развития", { exact: true })
      .locator("..")
      .locator("> *")
      .nth(1);

    // Статус плана — текст в карточке сотрудника (Черновик, Активен, На утверждении, Завершён)
    this.statusBadge = this.page
      .getByText(/^(Черновик|Активен|На утверждении|Завершён|Завершен)$/)
      .first();

    // Прогресс
    this.progressBar = this.page.locator('[class*="Progress"]').first();
    this.progressText = this.page.locator("text=/\\d+%/").first();

    // Информация о плане
    this.employeeInfo = this.page
      .locator("text=/Сотрудник/i")
      .locator("..")
      .first();
    this.curatorInfo = this.page
      .locator("text=/Куратор/i")
      .locator("..")
      .first();
    this.periodInfo = this.page.locator("text=/Период/i").locator("..").first();

    // Кнопки действий
    this.editButton = this.page
      .getByRole("button", { name: /Редактировать/i })
      .first();
    this.deleteButton = this.page
      .getByRole("button", { name: /Удалить/i })
      .first();
    this.archiveButton = this.page
      .getByRole("button", { name: /Архивировать/i })
      .first();

    // Цели развития (objectives) — таблица на странице плана
    this.createObjectiveLink = this.page
      .getByText("Создать цель развития")
      .first();
    this.objectivesTable = this.page.locator("table").first();
    this.objectiveRows = this.objectivesTable.locator("tbody tr");

    // Форма создания/редактирования цели (отдельная страница /objectives/add/)
    this.objectiveTitleInput = this.page.getByRole("textbox").first();
    this.objectiveCreateButton = this.page
      .getByRole("button", { name: "Создать", exact: true })
      .first();
    this.objectiveSaveButton = this.page
      .getByRole("button", { name: /Сохранить/i })
      .first();
    this.objectiveCancelButton = this.page
      .getByRole("button", { name: /Отмена/i })
      .first();

    // Комментарии
    this.commentInput = this.page.getByPlaceholder(/Комментарий/i).first();
    this.sendCommentButton = this.page
      .getByRole("button", { name: /Отправить/i })
      .first();
    this.comments = this.page.locator('[class*="Comment"]');
  }

  async assertOpened() {
    await this._step(
      "Проверить, что открыта страница плана развития",
      async () => {
        await expect
          .poll(() => this.page.url(), { timeout: TIMEOUTS.PAGE_LOAD })
          .toMatch(this.urlRe);
        await expect(this.heading).toBeVisible({ timeout: TIMEOUTS.MEDIUM });
      },
    );
  }

  /** Получить текст цели плана */
  async getGoalText() {
    return this._step("Получить текст цели плана", async () => {
      // Breadcrumb: Главная / Планы развития / [ЦЕЛЬ]
      // Ссылка "Планы развития" в breadcrumb — ориентир
      const planLink = this.page
        .getByRole("link", { name: "Планы развития" })
        .first();
      await planLink.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

      // Родитель breadcrumb → последний ребёнок = текст цели
      const breadcrumbContainer = planLink.locator("..");
      const lastChild = breadcrumbContainer.locator("> *").last();
      const text = await lastChild
        .innerText({ timeout: TIMEOUTS.SHORT })
        .catch(() => "");
      if (text && text.trim() !== "/" && text.trim() !== "Планы развития") {
        return text.trim();
      }

      // Fallback: поле "Цель плана развития" на странице
      const goalText = await this.goalField
        .innerText({ timeout: TIMEOUTS.SHORT })
        .catch(() => "");
      if (goalText) return goalText.trim();

      // Последний fallback: заголовок
      return (await this.heading.innerText()).trim();
    });
  }

  /** Получить статус плана */
  async getStatus() {
    return this._step("Получить статус плана", async () => {
      const statusText = await this.statusBadge
        .innerText({ timeout: TIMEOUTS.SHORT })
        .catch(() => "");
      return statusText.trim();
    });
  }

  /** Получить прогресс (число) */
  async getProgress() {
    return this._step("Получить прогресс плана", async () => {
      const text = await this.progressText.innerText().catch(() => "0%");
      const match = text.match(/(\d+)/);
      return match ? parseInt(match[1], 10) : 0;
    });
  }

  /** Нажать "Создать цель развития" — переход на форму /objectives/add/ */
  async clickCreateGoal() {
    await this._step('Нажать "Создать цель развития"', async () => {
      await this.createObjectiveLink.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
      await this.createObjectiveLink.click();
      await this.page.waitForURL(/objectives\/add/, {
        timeout: TIMEOUTS.PAGE_LOAD,
      });
    });
  }

  /** Алиас для clickCreateGoal (совместимость) */
  async clickAddAction() {
    await this.clickCreateGoal();
  }

  /** Добавить комментарий */
  async addComment(text) {
    await this._step(`Добавить комментарий: "${text}"`, async () => {
      await this.commentInput.fill(text);
      await this.sendCommentButton.click();
    });
  }

  /** Получить количество комментариев */
  async getCommentsCount() {
    return this._step("Получить количество комментариев", async () => {
      return await this.comments.count();
    });
  }

  /** Нажать "Удалить" */
  async clickDelete() {
    await this._step('Нажать "Удалить"', async () => {
      await this.deleteButton.click();
    });
  }

  /** Нажать "Архивировать" */
  async clickArchive() {
    await this._step('Нажать "Архивировать"', async () => {
      await this.archiveButton.click();
    });
  }

  /** Подтвердить удаление в модальном окне */
  async confirmDelete() {
    await this._step("Подтвердить удаление", async () => {
      const confirmButton = this.page
        .getByRole("button", { name: /Удалить|Да|Подтвердить/i })
        .last();
      await confirmButton.click();
    });
  }

  /**
   * Получить локатор badge со счётчиком комментариев у действия
   * @param {number} actionIndex - индекс действия (0-based)
   */
  getActionCommentsBadge(actionIndex) {
    return this.page
      .locator(
        `[data-testid="action-${actionIndex}"] [class*="badge"], ` +
          `[data-testid="action-${actionIndex}"] [class*="count"], ` +
          `[class*="Action"]:nth-child(${actionIndex + 1}) [class*="badge"], ` +
          `[class*="Action"]:nth-child(${actionIndex + 1}) [class*="count"]`,
      )
      .first();
  }

  /**
   * Получить количество комментариев из badge действия
   * @param {number} actionIndex - индекс действия (0-based)
   * @returns {Promise<number>} количество комментариев или 0
   */
  async getActionCommentsCount(actionIndex) {
    return this._step(
      `Получить количество комментариев действия #${actionIndex}`,
      async () => {
        const badge = this.getActionCommentsBadge(actionIndex);
        const isVisible = await badge.isVisible().catch(() => false);
        if (!isVisible) return 0;
        const text = await badge.textContent();
        return parseInt(text, 10) || 0;
      },
    );
  }

  // ==================== МЕТОДЫ ДЛЯ РАБОТЫ С ЦЕЛЯМИ РАЗВИТИЯ ====================

  /**
   * Получить все строки-цели из таблицы (без строк действий и разделителей).
   * Цели = строки с непустой первой ячейкой.
   * @returns {Promise<import('@playwright/test').Locator[]>} массив Locator строк-целей
   */
  async _getObjectiveRowsFiltered() {
    const allRows = await this.objectiveRows.all();
    const result = [];
    for (const row of allRows) {
      const firstCellText = await row
        .locator("td")
        .first()
        .innerText()
        .catch(() => "");
      if (firstCellText.trim()) result.push(row);
    }
    return result;
  }

  /** Получить количество целей развития (только строки-цели, без действий/разделителей) */
  async getActionsCount() {
    return this._step("Получить количество целей в плане", async () => {
      await this.page
        .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
        .catch(() => {});
      const tableVisible = await this.objectivesTable
        .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
        .then(() => true)
        .catch(() => false);
      if (!tableVisible) return 0;
      const objectiveRows = await this._getObjectiveRowsFiltered();
      return objectiveRows.length;
    });
  }

  /** Заполнить название цели на странице формы */
  async fillActionTitle(title) {
    await this._step(`Заполнить название цели: "${title}"`, async () => {
      await this.objectiveTitleInput.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
      await this.objectiveTitleInput.fill(title);
    });
  }

  /** Заполнить описание (noop — форма цели не имеет описания) */
  async fillActionDescription(_description) {
    // Форма создания цели не имеет отдельного поля описания
  }

  /** Сохранить цель (нажать "Создать" или "Сохранить" на странице формы) */
  async saveAction() {
    await this._step("Сохранить цель развития", async () => {
      // Форма создания ТРЕБУЕТ хотя бы одно действие
      const noActionsText = this.page
        .getByText("Действия ещё не добавлены")
        .first();
      const noActions = await noActionsText
        .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
        .then(() => true)
        .catch(() => false);

      if (noActions) {
        // Добавляем минимальное действие (обязательное требование формы)
        const addActionBtn = this.page
          .getByRole("button", { name: "Добавить действие" })
          .first();
        await addActionBtn.click();
        const actionNameInput = this.page
          .getByRole("textbox", { name: "Название" })
          .first();
        await actionNameInput.waitFor({
          state: "visible",
          timeout: TIMEOUTS.SHORT,
        });
        await actionNameInput.fill("Развивающее действие");
      }

      // На странице создания — кнопка "Создать", на странице редактирования — "Сохранить"
      const createBtn = this.objectiveCreateButton;
      const saveBtn = this.objectiveSaveButton;

      const createVisible = await createBtn
        .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
        .then(() => true)
        .catch(() => false);

      if (createVisible) {
        await createBtn.click();
      } else {
        await saveBtn.click();
      }

      // Ждём возврата на страницу плана
      await this.page
        .waitForURL(/\/development-plans\/\d+($|\?|\/(?!objectives))/, {
          timeout: TIMEOUTS.PAGE_LOAD,
        })
        .catch(() => {});
    });
  }

  /** Отменить создание/редактирование цели */
  async cancelAction() {
    await this._step("Отменить создание цели", async () => {
      await this.objectiveCancelButton.click();
    });
  }

  /**
   * Получить строку-цель по индексу (с учётом фильтрации строк действий/разделителей)
   * @param {number} index - индекс цели (0-based)
   */
  async _getObjectiveRow(index) {
    const rows = await this._getObjectiveRowsFiltered();
    return rows[index] || null;
  }

  /**
   * Получить текст названия цели по индексу
   * @param {number} index - индекс цели (0-based)
   */
  async getActionTitle(index) {
    return this._step(`Получить название цели #${index}`, async () => {
      const row = await this._getObjectiveRow(index);
      if (!row) return "";
      const firstCell = row.locator("td").first();
      return (await firstCell.innerText({ timeout: TIMEOUTS.SHORT })).trim();
    });
  }

  /**
   * Открыть цель на редактирование через 3-dot меню → "Редактировать"
   * Навигирует на /development-plans/{planId}/objectives/{objectiveId}/
   * @param {number} index - индекс цели (0-based)
   */
  async openActionForEdit(index) {
    await this._step(`Открыть цель #${index} на редактирование`, async () => {
      const row = await this._getObjectiveRow(index);
      if (!row) throw new Error(`Цель #${index} не найдена`);

      // 3-dot меню в последней ячейке строки-цели
      const menuButton = row.locator("td").last().getByRole("button").first();
      await menuButton.click();

      // Dropdown: list > listitem > button "Редактировать"
      const dropdownList = this.page.locator('ul, [role="list"]').last();
      const editOption = dropdownList.getByRole("button", {
        name: "Редактировать",
      });
      await editOption.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });
      await editOption.click();

      // Ждём перехода на страницу редактирования цели
      await this.page.waitForURL(/objectives\/\d+/, {
        timeout: TIMEOUTS.PAGE_LOAD,
      });
    });
  }

  /**
   * Удалить цель по индексу (через 3-dot меню → "Удалить")
   * @param {number} index - индекс цели (0-based)
   */
  async deleteAction(index) {
    await this._step(`Удалить цель #${index}`, async () => {
      const row = await this._getObjectiveRow(index);
      if (!row) throw new Error(`Цель #${index} не найдена`);

      // 3-dot меню в последней ячейке строки-цели
      const menuButton = row.locator("td").last().getByRole("button").first();
      await menuButton.click();

      // Dropdown: list > listitem > button "Удалить"
      // Ждём появления выпадающего списка (list) с кнопками
      const dropdownList = this.page.locator('ul, [role="list"]').last();
      const deleteOption = dropdownList.getByRole("button", {
        name: "Удалить",
      });
      await deleteOption.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });
      await deleteOption.click();

      // Ждём появления dialog подтверждения и нажимаем "Удалить"
      const dialog = this.page.getByRole("dialog");
      await dialog.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });
      const confirmButton = dialog.getByRole("button", { name: /Удалить/i });
      await confirmButton.click();

      // Ждём закрытия dialog и обновления таблицы
      await dialog
        .waitFor({ state: "hidden", timeout: TIMEOUTS.MEDIUM })
        .catch(() => {});
      await this.page
        .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
        .catch(() => {});
    });
  }

  /**
   * Получить прогресс цели (из ячейки "Прогресс" строки)
   * @param {number} index - индекс цели (0-based)
   * @returns {Promise<string>} текст прогресса, например "0% 0 из 1"
   */
  async getActionStatus(index) {
    return this._step(`Получить прогресс цели #${index}`, async () => {
      const row = await this._getObjectiveRow(index);
      if (!row) return "";
      // Ячейка "Прогресс" — 4-я (Цель, пустая, Апдейт, Прогресс, меню)
      const progressCell = row.locator("td").nth(3);
      const text = await progressCell
        .innerText({ timeout: TIMEOUTS.SHORT })
        .catch(() => "");
      return text.trim();
    });
  }

  /**
   * "Завершить" цель — noop, т.к. прогресс цели определяется действиями внутри неё
   * @param {number} _index
   */
  async completeAction(_index) {
    // Цели не имеют кнопки "завершить" — прогресс определяется действиями внутри
  }
}
