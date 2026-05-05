// pages/DevelopmentPlanTemplateCreatePage.js
import { expect } from "@playwright/test";
import { BasePage } from "./BasePage.js";
import { TIMEOUTS } from "../tests/utils/constants.js";

/**
 * Страница создания шаблона плана развития
 *
 * ВАЖНО: После заполнения поля "Цель" форма перерендеривается!
 * Используйте fillTemplateForm() или заполняйте цель ПЕРЕД названием.
 */
export class DevelopmentPlanTemplateCreatePage extends BasePage {
  /**
   * @param {import('@playwright/test').Page} page
   * @param {import('@playwright/test').TestInfo} [testInfo]
   */
  constructor(page, testInfo) {
    super(page, testInfo);

    this.urlRe =
      /\/development-plan-templates\/(create|new|add)|\/development-plans\/templates\/(create|new|add)/;

    // Заголовок
    this.heading = this.page
      .getByRole("heading", { name: /Создать шаблон/i })
      .first();

    // Поле "Название шаблона"
    this.nameInput = this.page
      .getByRole("textbox", { name: /Название шаблона/i })
      .first()
      .or(this.page.getByPlaceholder(/План онбординга/i).first())
      .or(this.page.locator('input[placeholder*="Название"]').first())
      .or(this.page.locator('textarea[placeholder*="Название"]').first());

    // Чекбокс "Добавить описание"
    this.addDescriptionCheckbox = this.page
      .getByRole("checkbox", { name: /Добавить описание/i })
      .first()
      .or(this.page.locator('input[name*="allowDescription"]').first());

    // Поле "Описание" (появляется после активации чекбокса)
    this.descriptionInput = this.page
      .getByRole("textbox", { name: /Описание/i })
      .first()
      .or(this.page.locator('textarea[placeholder*="Описание"]').first());

    // Поле "Цель плана развития" (обязательное)
    this.goalInput = this.page
      .getByRole("textbox", { name: /Цель плана развития/i })
      .first()
      .or(this.page.getByPlaceholder(/Освоить основные процессы/i).first())
      .or(
        this.page.locator('textarea[placeholder*="Например: Освоить"]').first(),
      );

    // Поле "Куратор" (по умолчанию "Непосредственный руководитель")
    this.curatorButton = this.page
      .getByRole("button", { name: /Непосредственный руководитель/i })
      .first();
    this.curatorLabel = this.page
      .locator("text=/Кто будет следить за выполнением/i")
      .first();
    this.curatorChips = this.page.locator('[class*="Chip"], [class*="Tag"]');
    this.addCuratorButton = this.page
      .getByRole("button", { name: /Добавить сотрудников/i })
      .first();

    // Поле "Период действия" (по умолчанию "1 месяц")
    this.periodCombobox = this.page.getByRole("combobox").first();
    this.periodText = this.page
      .locator("text=/1 месяц|3 месяц|6 месяц|12 месяц/i")
      .first();
    this.periodLabel = this.page
      .locator("text=/Период действия по умолчанию/i")
      .first();

    // Кнопки
    this.createButton = this.page
      .getByRole("button", { name: /^Создать$/i })
      .first();
    this.cancelButton = this.page
      .getByRole("button", { name: /Отмена|Отменить/i })
      .first();

    // Ошибки валидации
    this.validationErrors = this.page.locator(
      '[class*="error"], [class*="Error"]',
    );

    // Toast уведомления
    this.successToast = this.page.locator(".Toastify__toast--success");
    this.errorToast = this.page.locator(".Toastify__toast--error");
  }

  async assertOpened() {
    await this._step(
      "Проверить, что открыта страница создания шаблона",
      async () => {
        await this.page
          .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
          .catch(() => {});
        const headingVisible = await this.heading
          .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
          .then(() => true)
          .catch(() => false);
        const nameVisible = await this.nameInput
          .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
          .then(() => true)
          .catch(() => false);
        expect(headingVisible || nameVisible).toBe(true);
      },
    );
  }

  /** Проверить дефолтные значения формы */
  async assertDefaultValues() {
    await this._step("Проверить дефолтные значения формы", async () => {
      await expect(this.curatorButton).toBeVisible({
        timeout: TIMEOUTS.MEDIUM,
      });
      const curatorText = await this.curatorButton.innerText();
      expect(curatorText.toLowerCase()).toContain("руководител");

      await expect(this.periodText).toBeVisible({ timeout: TIMEOUTS.MEDIUM });
      const periodTextContent = await this.periodText.innerText();
      expect(periodTextContent).toContain("1 месяц");
    });
  }

  /**
   * Заполнить обязательные поля формы в правильном порядке
   * ВАЖНО: Цель заполняется ПЕРЕД названием из-за перерендера формы!
   */
  async fillTemplateForm(name, goal) {
    await this._step(`Заполнить форму шаблона: "${name}"`, async () => {
      // Сначала заполняем цель - после этого форма перерендеривается
      await this.fillGoal(goal);
      // Затем заполняем название
      await this.fillName(name);
    });
  }

  /** Заполнить название шаблона */
  async fillName(name) {
    await this._step(`Заполнить название шаблона: "${name}"`, async () => {
      // Пробуем разные варианты локаторов
      const nameField = this.page
        .getByRole("textbox", { name: /Название шаблона/i })
        .first();
      const nameFieldVisible = await nameField
        .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
        .then(() => true)
        .catch(() => false);

      if (nameFieldVisible) {
        await nameField.fill(name);
      } else {
        // Fallback на placeholder
        const placeholderField = this.page
          .getByPlaceholder(/План онбординга/i)
          .first();
        const placeholderVisible = await placeholderField
          .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
          .then(() => true)
          .catch(() => false);

        if (placeholderVisible) {
          await placeholderField.fill(name);
        } else {
          await this.nameInput.waitFor({
            state: "visible",
            timeout: TIMEOUTS.MEDIUM,
          });
          await this.nameInput.fill(name);
        }
      }

      await this.page
        .waitForLoadState("networkidle", { timeout: TIMEOUTS.SHORT })
        .catch(() => {});
    });
  }

  /** Заполнить описание */
  async fillDescription(description) {
    await this._step(`Заполнить описание: "${description}"`, async () => {
      await this.descriptionInput.fill(description);
    });
  }

  /** Заполнить цель плана развития (обязательное поле) */
  async fillGoal(goal) {
    await this._step(`Заполнить цель плана развития: "${goal}"`, async () => {
      // Пробуем разные варианты локаторов
      const goalField = this.page
        .getByRole("textbox", { name: /Цель плана развития/i })
        .first();
      const goalFieldVisible = await goalField
        .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
        .then(() => true)
        .catch(() => false);

      if (goalFieldVisible) {
        await goalField.fill(goal);
      } else {
        await this.goalInput.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        await this.goalInput.fill(goal);
      }

      await this.page
        .waitForLoadState("networkidle", { timeout: TIMEOUTS.SHORT })
        .catch(() => {});
    });
  }

  /** Удалить текущего куратора */
  async removeCurator() {
    await this._step("Удалить текущего куратора", async () => {
      const removeButton = this.curatorChips
        .first()
        .locator('[class*="remove"], [class*="close"], button')
        .first();
      await removeButton.click();
    });
  }

  /** Добавить куратора */
  async addCurator(curatorName) {
    await this._step(`Добавить куратора: "${curatorName}"`, async () => {
      await this.curatorSelect.click();
      const option = this.page
        .getByRole("option", { name: new RegExp(curatorName, "i") })
        .first();
      await option.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
      await option.click();
    });
  }

  /** Изменить период действия */
  async selectPeriod(period) {
    await this._step(`Выбрать период действия: "${period}"`, async () => {
      await this.periodSelect.click();
      const option = this.page
        .getByRole("option", { name: new RegExp(period, "i") })
        .first();
      await option.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
      await option.click();
    });
  }

  /** Закрыть попап выбора куратора если он открыт */
  async closeCuratorPopupIfOpen() {
    const curatorPopup = this.page.locator('[class*="UserQuerySelect_panels"]');
    const popupVisible = await curatorPopup
      .waitFor({ state: "visible", timeout: 2000 })
      .then(() => true)
      .catch(() => false);

    if (popupVisible) {
      const applyButton = this.page
        .getByRole("button", { name: /Применить/i })
        .first();
      const applyVisible = await applyButton
        .waitFor({ state: "visible", timeout: 2000 })
        .then(() => true)
        .catch(() => false);

      if (applyVisible) {
        await applyButton.click();
        await curatorPopup
          .waitFor({ state: "hidden", timeout: TIMEOUTS.SHORT })
          .catch(() => {});
      } else {
        // Escape для закрытия попапа
        await this.page.keyboard.press("Escape");
        await curatorPopup
          .waitFor({ state: "hidden", timeout: TIMEOUTS.SHORT })
          .catch(() => {});
      }
    }
  }

  /** Нажать "Создать" */
  async clickCreate() {
    await this._step('Нажать "Создать"', async () => {
      await this.closeCuratorPopupIfOpen();
      await this.createButton.scrollIntoViewIfNeeded();
      await this.createButton.click();
    });
  }

  /** Создать шаблон (заполнить форму и нажать "Создать") */
  async createTemplate(name, goal) {
    await this.fillTemplateForm(name, goal);
    await this.clickCreate();
  }

  /** Нажать "Отмена" */
  async clickCancel() {
    await this._step('Нажать "Отмена"', async () => {
      await this.cancelButton.click();
    });
  }

  /** Проверить, что кнопка "Создать" заблокирована */
  async assertCreateButtonDisabled() {
    await this._step(
      'Проверить, что кнопка "Создать" заблокирована',
      async () => {
        const isDisabled = await this.createButton.isDisabled();
        expect(isDisabled).toBe(true);
      },
    );
  }

  /** Дождаться успешного создания */
  async waitForSuccess() {
    await this._step("Дождаться уведомления об успешном создании", async () => {
      await this.successToast.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
    });
  }

  /** Проверить наличие ошибки валидации */
  async assertHasValidationError() {
    await this._step("Проверить наличие ошибки валидации", async () => {
      const hasError = await this.validationErrors
        .first()
        .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
        .then(() => true)
        .catch(() => false);
      const hasErrorToast = await this.errorToast
        .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
        .then(() => true)
        .catch(() => false);
      expect(hasError || hasErrorToast).toBe(true);
    });
  }
}
