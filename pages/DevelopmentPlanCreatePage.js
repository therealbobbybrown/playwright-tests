// pages/DevelopmentPlanCreatePage.js
import { expect } from "@playwright/test";
import { BasePage } from "./BasePage.js";
import { TIMEOUTS } from "../tests/utils/constants.js";

/**
 * Страница создания плана развития
 */
export class DevelopmentPlanCreatePage extends BasePage {
  /**
   * @param {import('@playwright/test').Page} page
   * @param {import('@playwright/test').TestInfo} [testInfo]
   */
  constructor(page, testInfo) {
    super(page, testInfo);

    this.urlRe =
      /\/development-plans\/create|\/development-plans\/new|\/development-plans\/add/;

    // Заголовок
    this.heading = this.page
      .getByRole("heading", { name: /Создать план развития/i })
      .first();

    // Поле "Цель плана развития" (название)
    this.goalInput = this.page
      .locator(
        'textarea[placeholder*="Например"], input[placeholder*="Цель"], textarea[placeholder*="Цель"]',
      )
      .first();

    // Поле "Сотрудник" — новый UI: button "Выберите сотрудника", старый: Select_control
    this.employeeSelect = this.page
      .getByRole("button", { name: /Выберите сотрудника/i })
      .first()
      .or(
        this.page
          .locator('[class*="Select_control"]')
          .filter({ hasText: /Сотрудник/i })
          .first(),
      )
      .or(this.page.getByLabel(/Сотрудник/i).first());

    // Поле "Куратор"
    this.curatorSelect = this.page
      .locator('label:has-text("Куратор")')
      .locator("..")
      .locator('[class*="Select_control"]')
      .first()
      .or(
        this.page.getByRole("button", { name: /Выберите кураторов/i }).first(),
      );

    // Поле "Период действия"
    this.periodSelect = this.page
      .locator('label:has-text("Период действия")')
      .locator("..")
      .first();

    // Кнопки
    this.createButton = this.page
      .getByRole("button", { name: /^Создать$/i })
      .first();
    this.cancelButton = this.page
      .getByRole("button", { name: /Отмена|Отменить/i })
      .first()
      .or(this.page.getByRole("link", { name: /Отменить/i }).first());

    // Ошибки валидации
    this.validationErrors = this.page.locator(
      '[class*="error"], [class*="Error"], .Toastify__toast--error',
    );

    // Модальное окно выбора сотрудника (новый UI)
    // Accessible name "Имя, фамилия или почта" приходит из floating label, НЕ из placeholder
    this._employeeSearchInput = this.page.getByRole("textbox", {
      name: /Имя, фамилия или почта/i,
    });
    this._employeeApplyButton = this.page.getByRole("button", {
      name: /Применить/i,
    });
  }

  async assertOpened() {
    await this._step(
      "Проверить, что открыта страница создания плана развития",
      async () => {
        await this.page
          .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
          .catch(() => {});
        // URL содержит development-plans (create/new/add)
        await expect
          .poll(() => this.page.url(), { timeout: TIMEOUTS.MEDIUM })
          .toMatch(this.urlRe);
        // Форма создания видна: заголовок + поле цели
        await expect(this.heading).toBeVisible({ timeout: TIMEOUTS.MEDIUM });
        await expect(this.goalInput).toBeVisible({ timeout: TIMEOUTS.MEDIUM });
      },
    );
  }

  /** Заполнить цель/название плана */
  async fillGoal(goal) {
    await this._step(`Заполнить цель плана: "${goal}"`, async () => {
      await this.goalInput.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
      await this.goalInput.fill(goal);
    });
  }

  /**
   * Выбрать сотрудника по имени.
   * Новый UI: button → модалка с поиском → выбор → "Применить"
   * Старый UI: Select → option
   */
  async selectEmployee(employeeName) {
    await this._step(`Выбрать сотрудника: "${employeeName}"`, async () => {
      await this.employeeSelect.click();

      // Новый UI: модалка с поиском (waitFor ждёт появления, isVisible — нет)
      const isModal = await this._employeeSearchInput
        .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
        .then(() => true)
        .catch(() => false);

      if (isModal) {
        // Ввести имя для поиска
        await this._employeeSearchInput.fill(employeeName);
        await this.page
          .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
          .catch(() => {});

        // Кликнуть по первому найденному результату в списке сотрудников
        const firstResult = this.page
          .locator('div[class*="UserOption_row"]')
          .first();
        await firstResult.waitFor({
          state: "visible",
          timeout: TIMEOUTS.PAGE_LOAD,
        });
        await firstResult.click();

        // "Применить" — подтвердить выбор
        await expect(this._employeeApplyButton).toBeEnabled({
          timeout: TIMEOUTS.MEDIUM,
        });
        await this._employeeApplyButton.click();
        await this.page
          .waitForLoadState("networkidle", { timeout: TIMEOUTS.SHORT })
          .catch(() => {});
      } else {
        // Старый UI: dropdown с role=option
        const option = this.page
          .getByRole("option", { name: new RegExp(employeeName, "i") })
          .first();
        await option.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
        await option.click();
      }
    });
  }

  /**
   * Выбрать первого доступного сотрудника (без указания имени).
   * Новый UI: button → модалка → клик по первому элементу → "Применить"
   * Старый UI: Select → первый option
   */
  async selectFirstEmployee() {
    await this._step("Выбрать первого доступного сотрудника", async () => {
      await this.employeeSelect.click();

      // Новый UI: модалка с поиском (waitFor ждёт появления, isVisible — нет)
      const isModal = await this._employeeSearchInput
        .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
        .then(() => true)
        .catch(() => false);

      if (isModal) {
        // Ждём загрузки списка сотрудников (API может быть медленным на staging)
        await this.page
          .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
          .catch(() => {});

        // Первый сотрудник в списке
        const firstItem = this.page
          .locator('div[class*="UserOption_row"]')
          .first();
        await firstItem.waitFor({
          state: "visible",
          timeout: TIMEOUTS.PAGE_LOAD,
        });
        await firstItem.click();

        // "Применить"
        await expect(this._employeeApplyButton).toBeEnabled({
          timeout: TIMEOUTS.MEDIUM,
        });
        await this._employeeApplyButton.click();
        await this.page
          .waitForLoadState("networkidle", { timeout: TIMEOUTS.SHORT })
          .catch(() => {});
      } else {
        // Старый UI: dropdown с role=option
        const firstOption = this.page.getByRole("option").first();
        await firstOption.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        await firstOption.click();
      }
    });
  }

  /** Нажать "Создать" */
  async clickCreate() {
    await this._step('Нажать "Создать"', async () => {
      await this.createButton.click();
    });
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

  /** Проверить, что кнопка "Создать" активна */
  async assertCreateButtonEnabled() {
    await this._step('Проверить, что кнопка "Создать" активна', async () => {
      const isDisabled = await this.createButton.isDisabled();
      expect(isDisabled).toBe(false);
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
      expect(hasError).toBe(true);
    });
  }
}
