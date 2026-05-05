import { BasePage } from "./BasePage.js";
import { TIMEOUTS } from "../tests/utils/constants.js";
import { URL_PATTERNS } from "../tests/utils/urls.js";
// pages/StructureUserAddPage.js

import { expect } from "@playwright/test";
import { SideMenu } from "./SideMenu.js";

export class StructureUserAddPage extends BasePage {
  /**
   * @param {import('@playwright/test').Page} page
   * @param {import('@playwright/test').TestInfo} [testInfo]
   */
  constructor(page, testInfo) {
    super(page, testInfo);

    this.title = this.page
      .getByRole("heading", { name: "Добавление сотрудника" })
      .first();
    this.form = this.page.locator("form").first();

    this.emailInput = this.page.getByLabel("E-mail").first();
    this.firstNameInput = this.page.getByLabel("Имя").first();
    this.lastNameInput = this.page.getByLabel("Фамилия").first();
    this.jobTitleInput = this.page.getByLabel("Должность").first();

    this.managerSelect = this.page
      .getByRole("button", { name: "Руководитель" })
      .first();
    this.departmentSelect = this.page
      .getByRole("button", { name: "Отдел" })
      .first();
    // Элементы с выбранными значениями - ищем внутри соответствующих контейнеров
    this.managerValue = this.page
      .locator("button")
      .filter({ hasText: "Руководитель" })
      .locator('[class*="value-names-inner"]')
      .first();
    this.departmentValue = this.page
      .locator("button")
      .filter({ hasText: "Отдел" })
      .locator('[class*="value-names-inner"]')
      .first();

    this.rolesSection = this.page
      .locator('div[class*="StructureUser_form-group--roles"]')
      .first();
    this.roleAdmin = this.page
      .getByRole("checkbox", { name: /Администратор/i })
      .first();
    this.roleUser = this.page
      .locator('input#chackbox-user-role--2, input[name="role[2]"]')
      .first();
    this.roleUserLabel = this.page
      .locator('label[for="chackbox-user-role--2"]')
      .first();
    this.roleHr = this.page.getByRole("checkbox", { name: /HR/i }).first();

    this.submitButton = this.page
      .getByRole("button", { name: /^Создать$/ })
      .first();

    // Inline validation error under any input field (class Input_error)
    this.inputValidationError = this.page
      .locator('[class*="Input_error"]')
      .first();
    // Validation error under the roles section (class StructureUser_error)
    this.rolesValidationError = this.page
      .locator('[class*="StructureUser_error"]')
      .first();

    this.selectSheet = this.page.locator(".react-modal-sheet-content").first();
    this.selectOptions = this.selectSheet
      .locator('[class*="Option_option-item__"] button.Option_option__K_CL1')
      .filter({ has: this.page.locator('[class*="Option_name__"]') });
    this.selectConfirmButton = this.page
      .getByRole("button", { name: /^Подтвердить$/i })
      .first();
  }

  async openFromSideMenu() {
    await this._step(
      'Открыть "Добавить сотрудника" через боковое меню',
      async () => {
        const sideMenu = new SideMenu(this.page, this.testInfo);
        await sideMenu.openStructureUsersAdd();
        await this.assertOpened();
      },
    );
  }

  async assertOpened() {
    await this._step(
      'Проверить, что открыта страница "Добавление сотрудника"',
      async () => {
        await this.page
          .waitForLoadState("domcontentloaded", { timeout: TIMEOUTS.LONG })
          .catch(() => null);
        await this.title.waitFor({
          state: "visible",
          timeout: TIMEOUTS.PAGE_LOAD,
        });
        await this.form.waitFor({
          state: "visible",
          timeout: TIMEOUTS.PAGE_LOAD,
        });
        await this.page
          .waitForURL(URL_PATTERNS.STRUCTURE_USER_ADD, {
            timeout: TIMEOUTS.SHORT,
          })
          .catch(() => null);
      },
    );
  }

  async assertFormElementsVisible() {
    await this._step(
      "Проверить элементы формы добавления сотрудника",
      async () => {
        await this.emailInput.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        await this.firstNameInput.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        await this.lastNameInput.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        await this.jobTitleInput.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });

        await this.managerSelect.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        await this.departmentSelect.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });

        await this.rolesSection.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        await this.roleAdmin.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        await this.roleUser.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        await this.roleHr.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });

        await this.submitButton.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
      },
    );
  }

  async fillRequiredFields({ email, firstName, lastName, jobTitle }) {
    await this._step(
      "Заполнить обязательные поля формы сотрудника",
      async () => {
        await this.emailInput.fill(email);
        await this.firstNameInput.fill(firstName);
        await this.lastNameInput.fill(lastName);

        if (jobTitle) {
          await this.jobTitleInput.fill(jobTitle);
        }

        await expect(this.emailInput).toHaveValue(email);
        await expect(this.firstNameInput).toHaveValue(firstName);
        await expect(this.lastNameInput).toHaveValue(lastName);
        if (jobTitle) {
          await expect(this.jobTitleInput).toHaveValue(jobTitle);
        }
      },
    );
  }

  async selectRandomManager() {
    await this._step("Выбрать произвольного руководителя", async () => {
      await this.managerSelect.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
      await this.managerSelect.click();

      await this.selectSheet.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
      await this.selectOptions
        .first()
        .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

      const count = await this.selectOptions.count();
      if (!count) throw new Error("Не нашли доступных руководителей в списке");

      let clicked = false;
      for (let i = 0; i < count; i += 1) {
        const option = this.selectOptions.nth(i);
        const label = await option
          .locator('[class*="Option_name__"]')
          .first()
          .innerText();
        if (!/Без руководителя/i.test(label)) {
          await option.click();
          clicked = true;
          break;
        }
      }

      if (!clicked) {
        throw new Error(
          'Не нашли пользователя для выбора руководителя (кроме "Без руководителя")',
        );
      }

      await this.selectConfirmButton.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
      await Promise.all([
        this.selectSheet
          .waitFor({ state: "hidden", timeout: TIMEOUTS.ELEMENT_VISIBLE })
          .catch(() => null),
        this.selectConfirmButton.click(),
      ]);

      await expect(this.managerValue).not.toHaveText("", {
        timeout: TIMEOUTS.MEDIUM,
      });
    });
  }

  async selectRandomDepartment() {
    await this._step("Выбрать произвольный отдел", async () => {
      await this.departmentSelect.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
      await this.departmentSelect.click();

      await this.selectSheet.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
      await this.selectOptions
        .first()
        .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

      const count = await this.selectOptions.count();
      if (!count) throw new Error("Не нашли доступные отделы в списке");

      const option = this.selectOptions.nth(Math.floor(Math.random() * count));
      await option.click();

      await this.selectConfirmButton.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
      await Promise.all([
        this.selectSheet
          .waitFor({ state: "hidden", timeout: TIMEOUTS.ELEMENT_VISIBLE })
          .catch(() => null),
        this.selectConfirmButton.click(),
      ]);

      await expect(this.departmentValue).not.toHaveText("", {
        timeout: TIMEOUTS.MEDIUM,
      });
    });
  }

  async selectUserRole() {
    await this._step('Выбрать роль "Пользователь"', async () => {
      await this.roleUser.waitFor({
        state: "attached",
        timeout: TIMEOUTS.MEDIUM,
      });
      if (!(await this.roleUser.isChecked())) {
        if (await this.roleUserLabel.isVisible().catch(() => false)) {
          await this.roleUserLabel.click();
        } else {
          await this.roleUser.check({ force: true });
        }
      }
      await expect(this.roleUser).toBeChecked();
    });
  }

  async submitForm() {
    await this._step('Нажать "Создать" и отправить форму', async () => {
      await this.submitButton.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
      await this.submitButton.click();
    });
  }

  /**
   * Нажать "Создать" и дождаться появления ошибки валидации поля ввода.
   * Проверяет что inline-ошибка (Input_error) видима.
   */
  async submitAndAssertInputError() {
    await this._step(
      "Нажать «Создать» и проверить ошибку валидации поля",
      async () => {
        await this.submitButton.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        await this.submitButton.click();
        await this.inputValidationError.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        await expect(this.inputValidationError).toBeVisible();
      },
    );
  }

  /**
   * Нажать "Создать" и дождаться ошибки валидации email ("Неправильный e-mail").
   */
  async submitAndAssertEmailError() {
    await this._step(
      "Нажать «Создать» и проверить ошибку невалидного email",
      async () => {
        await this.submitButton.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        await this.submitButton.click();
        const emailError = this.page
          .locator('[class*="Input_error"]')
          .filter({ hasText: /неправильный e-mail/i })
          .first();
        await emailError.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        await expect(emailError).toBeVisible();
      },
    );
  }

  /**
   * Нажать "Создать" и проверить ошибку при пустом email.
   * Форма должна показать inline-ошибку валидации под полем email.
   */
  async submitAndAssertEmptyEmailError() {
    await this._step(
      "Нажать «Создать» и проверить ошибку при пустом email",
      async () => {
        await this.submitButton.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        await this.submitButton.click();
        await this.inputValidationError.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        await expect(
          this.inputValidationError,
          "Должна появиться ошибка валидации при пустом email",
        ).toBeVisible();
      },
    );
  }

  /**
   * Нажать "Создать" и проверить ошибку при дублирующемся email.
   * Приложение возвращает серверную ошибку (toast или inline).
   */
  async submitAndAssertDuplicateEmailError() {
    await this._step(
      "Нажать «Создать» и проверить ошибку дублирующегося email",
      async () => {
        await this.submitButton.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        await this.submitButton.click();

        // Ошибка может быть toast (Toastify) или inline (Input_error)
        const toastError = this.page
          .locator(".Toastify__toast--error")
          .first();
        const inlineError = this.page
          .locator('[class*="Input_error"]')
          .first();

        // Ждём появления любой из них
        await Promise.race([
          toastError.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM }),
          inlineError.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM }),
        ]);

        const toastVisible = await toastError
          .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
          .then(() => true)
          .catch(() => false);
        const inlineVisible = await inlineError
          .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
          .then(() => true)
          .catch(() => false);

        if (toastVisible) {
          await expect(
            toastError,
            "Toast-ошибка при дублирующемся email должна быть видна",
          ).toBeVisible();
        } else {
          await expect(
            inlineError,
            "Inline-ошибка при дублирующемся email должна быть видна",
          ).toBeVisible();
        }
      },
    );
  }
}
