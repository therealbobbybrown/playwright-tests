// pages/CompetenceScalesPage.js
import { BasePage } from './BasePage.js';
import { TIMEOUTS } from '../tests/utils/constants.js';

/**
 * Страница "Шкалы оценки компетенций"
 * URL: /ru/manager/competence-scales/
 */
export class CompetenceScalesPage extends BasePage {
  /**
   * @param {import('@playwright/test').Page} page
   * @param {import('@playwright/test').TestInfo} [testInfo]
   */
  constructor(page, testInfo) {
    super(page, testInfo);

    // Заголовок страницы
    this.heading = page.getByRole('heading', { name: 'Шкалы оценки компетенций' });

    // Кнопка создания — это <a>, не <button>
    this.createScaleButton = page.getByRole('link', { name: /Создать шкалу/i });

    // Боковая панель (preview)
    this.sidePanel = page.locator('[class*="SidePanel"], [class*="preview"], [class*="aside"]').first();
    this.editButton = page.getByRole('button', { name: 'Редактировать' });
    this.deleteButton = page.getByRole('button', { name: 'Удалить' });

    // Бейдж "По умолчанию"
    this.defaultBadge = page.getByText(/Применяется по умолчанию/i);
  }

  /**
   * Открыть страницу шкал
   */
  async goto() {
    const baseUrl = new URL(process.env.BASE_URL).origin;
    await this.page.goto(`${baseUrl}/ru/manager/competence-scales/`);
    await this.assertOpened();
  }

  /**
   * Проверить что страница открыта
   */
  async assertOpened() {
    await this.heading.waitFor({ state: 'visible', timeout: TIMEOUTS.PAGE_LOAD });
  }

  /**
   * Получить строку шкалы по имени (внешний контейнер CompetenceScaleItem_item)
   * @param {string} name
   */
  getScaleByName(name) {
    return this.page.locator('[class*="CompetenceScaleItem_item"]').filter({ hasText: name }).first();
  }

  /**
   * Загрузить все шкалы (кликать «Показать ещё» до исчезновения кнопки)
   */
  async loadAll() {
    const showMore = this.page.getByRole('button', { name: /Показать еще/i });
    let attempts = 0;
    while (attempts < 20 && await showMore.isVisible().catch(() => false)) {
      await showMore.scrollIntoViewIfNeeded().catch(() => {});
      await showMore.click({ force: true }).catch(() => {});
      await this.page.waitForLoadState('networkidle');
      attempts++;
    }
  }

  /**
   * Открыть боковую панель шкалы (кликнуть на div[role="button"] с именем шкалы)
   * @param {string} name
   */
  async openScalePreview(name) {
    await this.loadAll();
    // Scale item contains two buttons: first = preview button (scale name), last = handle button
    const item = this.page.locator('[class*="CompetenceScaleItem_item"]').filter({ hasText: name }).first();
    await item.waitFor({ state: 'visible', timeout: TIMEOUTS.ELEMENT_VISIBLE });
    await item.scrollIntoViewIfNeeded();
    const btn = item.locator('button').first();
    await btn.click();
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Открыть контекстное меню "..." для шкалы
   * @param {string} name
   */
  async openContextMenu(name) {
    await this.loadAll();
    const item = this.getScaleByName(name);
    await item.waitFor({ state: 'visible', timeout: TIMEOUTS.ELEMENT_VISIBLE });
    await item.scrollIntoViewIfNeeded();
    await item.hover();
    const menuBtn = item.locator('[class*="HandleButton"]').first();
    await menuBtn.scrollIntoViewIfNeeded();
    await menuBtn.click({ force: true });
  }

  /**
   * Кликнуть пункт контекстного меню
   * @param {string|RegExp} menuItemText
   */
  async clickContextMenuItem(menuItemText) {
    // Menu items — portaled list > listitem > button
    const item = this.page.locator('li').filter({ hasText: menuItemText }).locator('button');
    await item.waitFor({ state: 'visible', timeout: TIMEOUTS.ELEMENT_VISIBLE });
    await item.scrollIntoViewIfNeeded();
    await item.click({ force: true });
  }

  /**
   * Нажать кнопку "Создать шкалу"
   */
  async clickCreateScale() {
    await this.createScaleButton.click();
  }

  /**
   * Нажать кнопку "Редактировать" в боковой панели
   * Может открыться диалог предупреждения
   */
  async clickEditInPanel() {
    await this.editButton.scrollIntoViewIfNeeded();
    await this.editButton.click();
    // Если появился диалог предупреждения — подтвердить
    const confirmBtn = this.page.getByRole('button', { name: 'Редактировать' }).last();
    const hasDialog = await confirmBtn
      .waitFor({ state: 'visible', timeout: TIMEOUTS.ANIMATION })
      .then(() => true)
      .catch(() => false);
    if (hasDialog) {
      await confirmBtn.click();
    }
  }

  /**
   * Удалить шкалу через боковую панель
   */
  async clickDeleteInPanel() {
    await this.deleteButton.click();
    // Подтверждение удаления обязательно
    const confirmBtn = this.page.getByRole('button', { name: /Удалить/i }).last();
    await confirmBtn.waitFor({ state: 'visible', timeout: TIMEOUTS.MODAL_OPEN });
    await confirmBtn.click();
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Удалить шкалу по имени (через контекстное меню)
   * @param {string} name
   */
  async deleteScale(name) {
    await this.openContextMenu(name);
    await this.clickContextMenuItem('Удалить');
    // Подтверждение удаления обязательно
    const confirmBtn = this.page.getByRole('button', { name: /Удалить/i }).last();
    await confirmBtn.waitFor({ state: 'visible', timeout: TIMEOUTS.MODAL_OPEN });
    await confirmBtn.click();
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Сделать шкалу "по умолчанию" через контекстное меню
   * @param {string} name
   */
  async makeDefault(name) {
    await this.openContextMenu(name);
    await this.clickContextMenuItem(/по умолчанию/i);
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Проверить наличие шкалы в списке (загружает все страницы)
   * @param {string} name
   */
  async assertScaleVisible(name) {
    await this.loadAll();
    await this.getScaleByName(name).waitFor({ state: 'visible', timeout: TIMEOUTS.ELEMENT_VISIBLE });
  }

  /**
   * Проверить отсутствие шкалы в списке
   * @param {string} name
   */
  async assertScaleNotVisible(name) {
    // Ждём обновления DOM после удаления/переименования
    await this.page.waitForLoadState('networkidle');
    await this.getScaleByName(name).waitFor({ state: 'hidden', timeout: TIMEOUTS.ELEMENT_VISIBLE }).catch(async () => {
      const count = await this.getScaleByName(name).count();
      if (count > 0) {
        throw new Error(`Expected scale "${name}" to not be visible, but it was found`);
      }
    });
  }
}
