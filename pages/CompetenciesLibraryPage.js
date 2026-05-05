// pages/CompetenciesLibraryPage.js
import { BasePage } from './BasePage.js';
import { TIMEOUTS } from '../tests/utils/constants.js';

/**
 * Страница "Библиотека компетенций"
 * URL: /ru/manager/competencies/
 */
export class CompetenciesLibraryPage extends BasePage {
  /**
   * @param {import('@playwright/test').Page} page
   * @param {import('@playwright/test').TestInfo} [testInfo]
   */
  constructor(page, testInfo) {
    super(page, testInfo);

    // Заголовок страницы
    this.heading = page.getByRole('heading', { name: 'Библиотека компетенций' });

    // Поле поиска
    this.searchInput = page.getByPlaceholder(/Название компетенции или группы/i);

    // Кнопки в шапке
    this.createGroupButton = page.getByRole('button', { name: /Создать группу компетенций/i });
    // Кнопка "Создать компетенцию" — это <a>, не <button>. href содержит ?parent=competencies (не groupId)
    this.createCompetencyButton = page.locator('a[href*="competencies/add/"][href*="parent=competencies"]').first();

    // Диалог создания группы
    this.createGroupDialog = page.getByRole('dialog');
    this.groupNameInput = this.createGroupDialog.getByRole('textbox', { name: /Название/i });
    this.confirmCreateGroupButton = this.createGroupDialog.getByRole('button', { name: 'Создать' });
    this.cancelCreateGroupButton = this.createGroupDialog.getByRole('button', { name: 'Отмена' });

    // Диалог подтверждения удаления
    this.deleteConfirmDialog = page.getByRole('dialog');
    this.confirmDeleteButton = this.deleteConfirmDialog.getByRole('button', { name: /Удалить/i });
  }

  /**
   * Открыть страницу библиотеки компетенций
   */
  async goto() {
    const baseUrl = new URL(process.env.BASE_URL).origin;
    await this.page.goto(`${baseUrl}/ru/manager/competencies/`);
    await this.assertOpened();
  }

  /**
   * Проверить что страница открыта
   */
  async assertOpened() {
    await this.heading.waitFor({ state: 'visible', timeout: TIMEOUTS.PAGE_LOAD });
  }

  /**
   * Получить элемент списка по тексту (группа или компетенция)
   * @param {string} name
   */
  getItemByName(name) {
    // CompetenceItem_item — компетенция, CompetenceGroupItem_container — группа
    return this.page
      .locator('[class*="CompetenceItem_item"], [class*="CompetenceGroupItem_container"]')
      .filter({ hasText: name })
      .first();
  }

  /**
   * Получить элемент КОМПЕТЕНЦИИ (не группы) по тексту
   * @param {string} name
   */
  getCompetencyByName(name) {
    return this.page
      .locator('[class*="CompetenceItem_item"]')
      .filter({ hasText: name })
      .first();
  }

  /**
   * Получить элемент ГРУППЫ (не компетенции) по тексту
   * @param {string} name
   */
  getGroupByName(name) {
    return this.page
      .locator('[class*="CompetenceGroupItem_container"]')
      .filter({ hasText: name })
      .first();
  }

  /**
   * Открыть контекстное меню "..." для элемента
   * Использует поиск, чтобы вынести элемент в верхнюю часть списка и гарантировать viewport
   * @param {string} name — название группы или компетенции
   */
  async openContextMenu(name) {
    await this.search(name);
    const item = this.getItemByName(name);
    await item.waitFor({ state: 'visible', timeout: TIMEOUTS.ELEMENT_VISIBLE });
    await item.scrollIntoViewIfNeeded();
    await item.hover();
    const menuButton = item.locator('[class*="HandleButton"]').first();
    await menuButton.scrollIntoViewIfNeeded();
    await menuButton.click({ force: true });
  }

  /**
   * Открыть контекстное меню "..." для КОМПЕТЕНЦИИ (не группы)
   * @param {string} name — название компетенции
   */
  async openCompetencyContextMenu(name) {
    await this.search(name);
    const item = this.getCompetencyByName(name);
    await item.waitFor({ state: 'visible', timeout: TIMEOUTS.ELEMENT_VISIBLE });
    await item.scrollIntoViewIfNeeded();
    await item.hover();
    const menuButton = item.locator('[class*="HandleButton"]').first();
    await menuButton.scrollIntoViewIfNeeded();
    await menuButton.click({ force: true });
  }

  /**
   * Кликнуть на пункт контекстного меню
   * @param {string|RegExp} menuItemText
   */
  async clickContextMenuItem(menuItemText) {
    // Menu items are li > button (not role="menuitem")
    const item = this.page.locator('li').filter({ hasText: menuItemText }).locator('button');
    await item.waitFor({ state: 'visible', timeout: TIMEOUTS.ELEMENT_VISIBLE });
    await item.click();
  }

  // ==================== Группы ====================

  /**
   * Открыть диалог создания группы
   */
  async openCreateGroupDialog() {
    await this.createGroupButton.click();
    await this.createGroupDialog.waitFor({ state: 'visible', timeout: TIMEOUTS.MODAL_OPEN });
  }

  /**
   * Создать группу компетенций через диалог
   * @param {string} title
   */
  async createGroup(title) {
    await this.openCreateGroupDialog();
    await this.groupNameInput.fill(title);
    await this.confirmCreateGroupButton.click();
    await this.createGroupDialog.waitFor({ state: 'hidden', timeout: TIMEOUTS.MODAL_CLOSE });
  }

  /**
   * Редактировать группу через контекстное меню
   * @param {string} currentName
   * @param {string} newName
   */
  async editGroup(currentName, newName) {
    await this.openContextMenu(currentName);
    await this.clickContextMenuItem('Переименовать');
    await this.createGroupDialog.waitFor({ state: 'visible', timeout: TIMEOUTS.MODAL_OPEN });
    await this.groupNameInput.clear();
    await this.groupNameInput.fill(newName);
    await this.page.getByRole('dialog').getByRole('button', { name: /Сохранить|Готово|Применить/i }).click();
    await this.createGroupDialog.waitFor({ state: 'hidden', timeout: TIMEOUTS.MODAL_CLOSE });
  }

  /**
   * Удалить группу через контекстное меню
   * @param {string} name
   */
  async deleteGroup(name) {
    await this.openContextMenu(name);
    await this.clickContextMenuItem('Удалить');
    // Подтверждение удаления обязательно
    const confirmBtn = this.page.getByRole('button', { name: /Удалить/i }).last();
    await confirmBtn.waitFor({ state: 'visible', timeout: TIMEOUTS.MODAL_OPEN });
    await confirmBtn.click();
    await this.page.waitForLoadState('networkidle');
  }

  // ==================== Компетенции ====================

  /**
   * Перейти к странице создания компетенции
   */
  async clickCreateCompetency() {
    await this.createCompetencyButton.click();
  }

  /**
   * Удалить компетенцию через контекстное меню
   * @param {string} name
   */
  async deleteCompetency(name) {
    await this.openCompetencyContextMenu(name);
    await this.clickContextMenuItem('Удалить');
    // Подтверждение удаления обязательно
    const confirmBtn = this.page.getByRole('button', { name: /Удалить/i }).last();
    await confirmBtn.waitFor({ state: 'visible', timeout: TIMEOUTS.MODAL_OPEN });
    await confirmBtn.click();
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Перенести компетенцию в группу через контекстное меню
   * @param {string} competencyName
   * @param {string} targetGroupName
   */
  async moveCompetency(competencyName, targetGroupName) {
    await this.openCompetencyContextMenu(competencyName);
    await this.clickContextMenuItem('Перенести');

    // 1. Предупреждающий диалог "Редактируйте с осторожностью" → "Продолжить"
    const warningDialog = this.page.getByRole('dialog');
    await warningDialog.waitFor({ state: 'visible', timeout: TIMEOUTS.MODAL_OPEN });
    const continueBtn = warningDialog.getByRole('button', { name: 'Продолжить' });
    const hasContinue = await continueBtn
      .waitFor({ state: 'visible', timeout: TIMEOUTS.ANIMATION })
      .then(() => true)
      .catch(() => false);
    if (hasContinue) {
      await continueBtn.click();
    }

    // 2. Диалог "Перенести компетенцию" → combobox выбор группы → "Перенести"
    const moveDialog = this.page.getByRole('dialog');
    await moveDialog.waitFor({ state: 'visible', timeout: TIMEOUTS.MODAL_OPEN });
    // React-select: кликнуть на value-container чтобы раскрыть dropdown
    const valueContainer = moveDialog.locator('.react-select__value-container').first();
    await valueContainer.click();
    // Выбрать целевую группу из списка опций
    const option = this.page.locator('.react-select__option').filter({ hasText: targetGroupName });
    await option.waitFor({ state: 'visible', timeout: TIMEOUTS.ELEMENT_VISIBLE });
    await option.click();
    // Нажать "Перенести"
    await moveDialog.getByRole('button', { name: 'Перенести' }).click();
    await moveDialog.waitFor({ state: 'hidden', timeout: TIMEOUTS.MODAL_CLOSE });
  }

  // ==================== Поиск ====================

  /**
   * Выполнить поиск
   * @param {string} query
   */
  async search(query) {
    await this.searchInput.fill(query);
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Очистить поиск
   */
  async clearSearch() {
    await this.searchInput.clear();
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Проверить что элемент с именем виден в списке
   * @param {string} name
   */
  async assertItemVisible(name) {
    await this.getItemByName(name).first().waitFor({ state: 'visible', timeout: TIMEOUTS.ELEMENT_VISIBLE });
  }

  /**
   * Проверить что элемент с именем НЕ виден в списке
   * @param {string} name
   */
  async assertItemNotVisible(name) {
    await this.getItemByName(name).waitFor({ state: 'hidden', timeout: TIMEOUTS.ELEMENT_VISIBLE }).catch(async () => {
      const count = await this.getItemByName(name).count();
      if (count > 0) throw new Error(`Expected item "${name}" to not be visible`);
    });
  }
}
