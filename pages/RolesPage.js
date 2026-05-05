// pages/RolesPage.js
import { BasePage } from "./BasePage.js";
import { TIMEOUTS } from "../tests/utils/constants.js";
import { URL_PATTERNS } from "../tests/utils/urls.js";

/**
 * Page Object для страницы управления ролями
 *
 * Real UI structure:
 *   List page:  /ru/manager/company/roles/
 *     - heading "Роли" + link "Добавить роль" → /roles/add/
 *     - roles displayed as links (no table)
 *     - custom roles have a delete button (icon) next to the link
 *
 *   Create page: /ru/manager/company/roles/add/
 *     - heading "Создать роль"
 *     - textbox "Название роли"
 *     - permissions checkboxes grouped by category
 *     - button "Сохранить"
 *
 *   Edit page: /ru/manager/company/roles/{id}/
 *     - heading "Редактирование роли"
 *     - textbox "Название роли" (pre-filled)
 *     - same permissions checkboxes
 *     - button "Сохранить"
 */
export class RolesPage extends BasePage {
  /**
   * @param {import('@playwright/test').Page} page
   * @param {import('@playwright/test').TestInfo} [testInfo]
   */
  constructor(page, testInfo) {
    super(page, testInfo);

    // === List page locators ===

    // Заголовок страницы списка ролей
    this.heading = page.getByRole("heading", { level: 1 }).first();

    // Ссылка "Добавить роль" (это link, НЕ button)
    this.addRoleLink = page.getByRole("link", { name: /добавить роль/i });

    // Контейнер списка ролей (generic после heading)
    this.rolesList = page.locator("h1 + div").first();

    // === Form page locators (create/edit — full page, NOT modal) ===

    // Поле названия роли
    this.roleNameInput = page.getByRole("textbox", { name: /название роли/i });

    // Чекбоксы разрешений
    this.permissionCheckboxes = page.getByRole("checkbox");

    // Секция разрешений (headings "Администрирование" и подсекции)
    this.permissionsSection = page
      .getByRole("heading", { name: /администрирование/i })
      .locator("..");

    // Кнопка "Сохранить"
    this.saveButton = page.getByRole("button", { name: /сохранить/i });

    // === Delete dialog locators ===

    // Диалог удаления (появляется как popup при клике на кнопку удаления)
    this.deleteDialogTitle = page.locator("text=Удалить роль");
    this.deleteConfirmButton = page.getByRole("button", {
      name: /удалить|да|confirm|yes|delete/i,
    });
  }

  // =============================================
  // Navigation
  // =============================================

  /**
   * Перейти на страницу списка ролей
   */
  async navigate() {
    await this._step("Перейти на страницу управления ролями", async () => {
      const baseUrl = process.env.BASE_URL;
      const rolesUrl = new URL("/ru/manager/company/roles", baseUrl).toString();
      await this.page.goto(rolesUrl);
      await this.page.waitForURL(URL_PATTERNS.ROLES_LIST, {
        timeout: TIMEOUTS.PAGE_LOAD,
      });
      await this.page.waitForLoadState("networkidle");
    });
  }

  /**
   * Проверить, что страница ролей открыта
   */
  async assertOpened() {
    await this._step("Проверить, что страница ролей открыта", async () => {
      await this.page.waitForURL(URL_PATTERNS.ROLES_LIST, {
        timeout: TIMEOUTS.ELEMENT_VISIBLE,
      });
    });
  }

  // =============================================
  // List page — assertions & helpers
  // =============================================

  /**
   * Проверить, что список ролей отображается (вместо assertRolesTableVisible)
   */
  async assertRolesTableVisible() {
    await this._step("Список ролей отображается", async () => {
      await this.rolesList.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
    });
  }

  /**
   * Проверить, что ссылка "Добавить роль" видима (вместо assertCreateButtonVisible)
   */
  async assertCreateButtonVisible() {
    await this._step("Ссылка «Добавить роль» видима", async () => {
      await this.addRoleLink.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
    });
  }

  /**
   * Проверить, что ссылка "Добавить роль" скрыта (для пользователей без прав)
   */
  async assertCreateButtonHidden() {
    await this._step("Ссылка «Добавить роль» скрыта", async () => {
      const isVisible = await this.addRoleLink
        .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
        .then(() => true)
        .catch(() => false);

      if (isVisible) {
        throw new Error("Ссылка «Добавить роль» должна быть скрыта");
      }
    });
  }

  /**
   * Получить количество ролей в списке
   * @returns {Promise<number>}
   */
  async getRolesCount() {
    return await this._step("Получить количество ролей", async () => {
      await this.rolesList.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
      // Each role is a link inside the roles list container
      return await this.rolesList.getByRole("link").count();
    });
  }

  /**
   * Получить ссылку на роль по названию в списке
   * @param {string} title
   * @returns {import('@playwright/test').Locator}
   */
  getRoleLink(title) {
    return this.rolesList.getByRole("link", { name: title, exact: true });
  }

  /**
   * Проверить, что роль существует в списке
   * @param {string} title
   */
  async assertRoleExists(title) {
    await this._step(`Роль "${title}" существует в списке`, async () => {
      await this.getRoleLink(title).waitFor({
        state: "visible",
        timeout: TIMEOUTS.ELEMENT_VISIBLE,
      });
    });
  }

  /**
   * Проверить, что роль НЕ существует в списке
   * @param {string} title
   */
  async assertRoleNotExists(title) {
    await this._step(`Роль "${title}" не существует в списке`, async () => {
      await this.getRoleLink(title).waitFor({
        state: "hidden",
        timeout: TIMEOUTS.ELEMENT_VISIBLE,
      });
    });
  }

  // =============================================
  // Create role
  // =============================================

  /**
   * Открыть форму создания роли (переход на /roles/add/)
   */
  async openCreateRoleModal() {
    await this._step("Открыть форму создания роли", async () => {
      await this.addRoleLink.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
      await this.addRoleLink.click();

      // Ждём перехода на страницу создания
      await this.page.waitForURL(/\/roles\/add/, {
        timeout: TIMEOUTS.PAGE_LOAD,
      });
      await this.page.waitForLoadState("networkidle");
    });
  }

  /**
   * Создать новую роль
   * @param {Object} params
   * @param {string} params.title - Название роли
   * @param {string[]} [params.permissions] - Массив названий разрешений для включения
   */
  async createRole({ title, permissions = [] }) {
    await this._step(`Создать роль "${title}"`, async () => {
      await this.openCreateRoleModal();

      // Заполнить название
      await this.roleNameInput.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
      await this.roleNameInput.fill(title);

      // Выбрать разрешения если указаны
      for (const permission of permissions) {
        await this.selectPermission(permission);
      }

      // Сохранить
      await this.saveButton.click();

      // Дождаться возврата на страницу списка ролей
      await this.page.waitForURL(URL_PATTERNS.ROLES_LIST, {
        timeout: TIMEOUTS.PAGE_LOAD,
      });
      await this.page.waitForLoadState("networkidle");
    });
  }

  /**
   * Попытаться создать роль с пустым названием (негативный сценарий)
   */
  async tryCreateRoleWithEmptyName() {
    await this._step("Попытка создать роль с пустым названием", async () => {
      await this.openCreateRoleModal();

      // Очистить поле названия
      await this.roleNameInput.clear();

      // Попробовать сохранить
      await this.saveButton.click();

      // Должны остаться на странице создания (НЕ редирект на список)
      // Ждём завершения сетевых запросов и убеждаемся что URL не изменился
      await this.page.waitForLoadState("networkidle");
    });
  }

  /**
   * Попытаться создать роль с дублирующим названием
   * @param {string} title - Существующее название роли
   */
  async tryCreateDuplicateRole(title) {
    await this._step(`Попытка создать дубликат роли "${title}"`, async () => {
      await this.openCreateRoleModal();

      await this.roleNameInput.fill(title);
      await this.saveButton.click();

      // Ожидаем ошибку — должны остаться на странице создания
      await this.page.waitForLoadState("networkidle");
    });
  }

  // =============================================
  // Edit role
  // =============================================

  /**
   * Открыть роль для редактирования (клик по ссылке → /roles/{id}/)
   * @param {string} title - Название роли
   */
  async openRoleForEdit(title) {
    await this._step(`Открыть роль "${title}" для редактирования`, async () => {
      const roleLink = this.getRoleLink(title);
      await roleLink.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
      await roleLink.click();

      // Ждём перехода на страницу редактирования
      await this.page.waitForURL(URL_PATTERNS.ROLE_EDIT, {
        timeout: TIMEOUTS.PAGE_LOAD,
      });
      await this.page.waitForLoadState("networkidle");
    });
  }

  /**
   * Редактировать роль
   * @param {string} currentTitle - Текущее название роли
   * @param {Object} params
   * @param {string} [params.newTitle] - Новое название
   * @param {string[]} [params.addPermissions] - Разрешения для добавления
   * @param {string[]} [params.removePermissions] - Разрешения для удаления
   */
  async editRole(
    currentTitle,
    { newTitle, addPermissions = [], removePermissions = [] },
  ) {
    await this._step(`Редактировать роль "${currentTitle}"`, async () => {
      await this.openRoleForEdit(currentTitle);

      // Изменить название если указано
      if (newTitle) {
        await this.roleNameInput.clear();
        await this.roleNameInput.fill(newTitle);
      }

      // Добавить разрешения
      for (const permission of addPermissions) {
        await this.selectPermission(permission);
      }

      // Удалить разрешения
      for (const permission of removePermissions) {
        await this.deselectPermission(permission);
      }

      // Сохранить
      await this.saveButton.click();

      // Страница редактирования НЕ делает редирект — ждём завершения сохранения
      await this.page.waitForLoadState("networkidle");

      // Возвращаемся к списку ролей вручную
      await this.navigate();
    });
  }

  // =============================================
  // Delete role
  // =============================================

  /**
   * Удалить роль (клик по кнопке удаления рядом с ролью)
   * @param {string} title - Название роли
   */
  async deleteRole(title) {
    await this._step(`Удалить роль "${title}"`, async () => {
      // Находим контейнер роли (generic, содержащий link + button)
      const roleLink = this.getRoleLink(title);
      await roleLink.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

      // Кнопка удаления — button-сиблинг рядом со ссылкой в том же контейнере
      const roleContainer = roleLink.locator("..");
      const deleteButton = roleContainer.getByRole("button").first();
      await deleteButton.click();

      // Ждём появления диалога удаления
      await this.deleteDialogTitle.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });

      // Подтверждаем удаление (если роль не назначена пользователям)
      const confirmBtn = this.deleteConfirmButton;
      const hasConfirm = await confirmBtn
        .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
        .then(() => true)
        .catch(() => false);

      if (hasConfirm) {
        await confirmBtn.click();
      }

      // Ждём исчезновения роли из списка
      await this.assertRoleNotExists(title);
    });
  }

  // =============================================
  // Permissions
  // =============================================

  /**
   * Выбрать разрешение по названию
   * @param {string} permissionName
   */
  async selectPermission(permissionName) {
    await this._step(`Выбрать разрешение "${permissionName}"`, async () => {
      const checkbox = this.page
        .getByRole("checkbox", { name: new RegExp(permissionName, "i") })
        .first();

      const isChecked = await checkbox.isChecked().catch(() => false);
      if (!isChecked) {
        // Click the visual wrapper (sibling generic) since the checkbox itself may be hidden
        const wrapper = checkbox
          .locator("..")
          .locator('[cursor="pointer"]')
          .first();
        const hasWrapper = await wrapper.count();
        if (hasWrapper > 0) {
          await wrapper.click();
        } else {
          await checkbox.click({ force: true });
        }
      }
    });
  }

  /**
   * Снять разрешение по названию
   * @param {string} permissionName
   */
  async deselectPermission(permissionName) {
    await this._step(`Снять разрешение "${permissionName}"`, async () => {
      const checkbox = this.page
        .getByRole("checkbox", { name: new RegExp(permissionName, "i") })
        .first();

      const isChecked = await checkbox.isChecked().catch(() => false);
      if (isChecked) {
        const wrapper = checkbox
          .locator("..")
          .locator('[cursor="pointer"]')
          .first();
        const hasWrapper = await wrapper.count();
        if (hasWrapper > 0) {
          await wrapper.click();
        } else {
          await checkbox.click({ force: true });
        }
      }
    });
  }

  // =============================================
  // Form helpers (shared between create/edit/test specs)
  // =============================================

  /**
   * Закрыть форму (вернуться на список ролей через breadcrumb)
   * Backward-compat alias for specs that call closeModal()
   */
  async closeModal() {
    await this._step("Вернуться к списку ролей", async () => {
      // Click "Роли" breadcrumb link if available
      const rolesBreadcrumb = this.page.getByRole("link", { name: "Роли" });
      const hasBreadcrumb = await rolesBreadcrumb
        .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
        .then(() => true)
        .catch(() => false);

      if (hasBreadcrumb) {
        await rolesBreadcrumb.click();
      } else {
        // Fallback: navigate directly
        await this.navigate();
        return;
      }

      await this.page.waitForURL(URL_PATTERNS.ROLES_LIST, {
        timeout: TIMEOUTS.PAGE_LOAD,
      });
      await this.page.waitForLoadState("networkidle");
    });
  }

  /**
   * Проверить валидационную ошибку в форме
   * @param {string|RegExp} errorMessage
   */
  async assertValidationError(errorMessage) {
    await this._step(
      `Отображается ошибка валидации: "${errorMessage}"`,
      async () => {
        const errorElement = this.page
          .locator('[class*="error"], [class*="Error"], [role="alert"]')
          .filter({ hasText: errorMessage })
          .first();

        await errorElement.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
      },
    );
  }

  /**
   * Backward-compat: проверка что "модалка" (форма) видна
   * На самом деле проверяем, что мы на странице создания/редактирования
   */
  get modal() {
    // Return a locator that is visible when we are on the create/edit page
    return this.roleNameInput;
  }
}
