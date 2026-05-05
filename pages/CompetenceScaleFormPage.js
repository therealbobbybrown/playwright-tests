// pages/CompetenceScaleFormPage.js
import { expect } from '@playwright/test';
import { BasePage } from './BasePage.js';
import { TIMEOUTS } from '../tests/utils/constants.js';

/**
 * Страница создания/редактирования шкалы компетенций
 * URL: /ru/manager/competence-scales/add/ или /ru/manager/competence-scales/{id}/
 */
export class CompetenceScaleFormPage extends BasePage {
  /**
   * @param {import('@playwright/test').Page} page
   * @param {import('@playwright/test').TestInfo} [testInfo]
   */
  constructor(page, testInfo) {
    super(page, testInfo);

    // Поля формы
    this.titleInput = page.getByRole('textbox', { name: /Название шкалы/i });
    this.descriptionToggle = page.getByText(/Добавить описание/i);
    this.descriptionInput = page.getByRole('textbox', { name: /Описание/i });

    // Количество шагов
    this.stepsCountSelect = page.getByRole('combobox').first();
    // Вид шкалы (Цифры/Текст)
    this.widgetSelect = page.getByRole('combobox').nth(1);

    // Тогглы
    this.hideNumbersToggle = page.getByText(/Скрыть номера вариантов/i);
    this.startFromZeroToggle = page.getByText(/Начинать шкалу с нуля/i);

    // Кнопки
    this.cancelButton = page.getByRole('button', { name: /Отменить/i });
    this.createButton = page.getByRole('button', { name: 'Создать' });
    this.saveButton = page.getByRole('button', { name: /Сохранить/i });

    // Превью шкалы справа
    this.previewSection = page.locator('[class*="preview"], [class*="Preview"]').first();
    this.previewTitle = page.getByText('Ваш вопрос');
  }

  /**
   * Открыть страницу создания шкалы
   */
  async gotoCreate() {
    const baseUrl = new URL(process.env.BASE_URL).origin;
    await this.page.goto(`${baseUrl}/ru/manager/competence-scales/add/`);
    await this.assertOpened();
  }

  /**
   * Открыть страницу редактирования шкалы
   * @param {number} id
   */
  async gotoEdit(id) {
    const baseUrl = new URL(process.env.BASE_URL).origin;
    await this.page.goto(`${baseUrl}/ru/manager/competence-scales/${id}/`);
    await this.assertOpened();
  }

  /**
   * Проверить что форма открыта (наличие поля название)
   */
  async assertOpened() {
    await this.titleInput.waitFor({ state: 'visible', timeout: TIMEOUTS.PAGE_LOAD });
  }

  /**
   * Заполнить форму и создать шкалу
   * @param {Object} data
   * @param {string} data.title
   * @param {string} [data.description]
   * @param {number} [data.stepsCount] — количество шагов (не реализовано, берём дефолт)
   */
  async fillAndCreate({ title, description } = {}) {
    await this.titleInput.fill(title);
    if (description) {
      await this.descriptionToggle.click();
      await this.descriptionInput.fill(description);
    }
    await this.createButton.click();
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Выбрать тип виджета (react-select dropdown)
   * @param {'Цифры'|'Звезды'|'Текст'} widgetLabel — отображаемое название
   */
  async selectWidget(widgetLabel) {
    // Кликаем на стрелку второго react-select (виджет)
    const indicators = this.page.locator('.react-select__indicator');
    // Первый indicator — steps count, второй — widget
    await indicators.nth(1).click();
    const option = this.page.locator('.react-select__option').filter({ hasText: widgetLabel });
    await option.waitFor({ state: 'visible', timeout: 5000 });
    await option.click();
  }

  /**
   * Выбрать количество шагов (react-select dropdown)
   * @param {number} count — значение 2-10
   */
  async selectStepsCount(count) {
    const indicators = this.page.locator('.react-select__indicator');
    await indicators.nth(0).click();
    const option = this.page.locator('.react-select__option').filter({ hasText: String(count) });
    await option.waitFor({ state: 'visible', timeout: 5000 });
    await option.click();
  }

  /**
   * Заполнить подписи шагов (первый и последний)
   * @param {string} firstLabel
   * @param {string} lastLabel
   */
  async fillStepLabels(firstLabel, lastLabel) {
    // Подписи шагов — textbox элементы в секции "Подпись шагов"
    const stepInputs = this.page.locator('[class*="step"] input[type="text"], input[placeholder]')
      .or(this.page.getByRole('textbox'));
    // Первый и последний шаг — после titleInput и descriptionInput
    // Используем точные textbox с числовыми метками ("1", "5")
    const firstInput = this.page.locator('input').nth(-2); // предпоследний
    const lastInput = this.page.locator('input').last();
    // Более надёжный подход — найти input рядом с меткой
    const allInputs = this.page.getByRole('textbox');
    const count = await allInputs.count();
    // Последние два textbox — подписи шагов
    if (count >= 3) {
      await allInputs.nth(count - 2).fill(firstLabel);
      await allInputs.nth(count - 1).fill(lastLabel);
    }
  }

  /**
   * Изменить название и сохранить
   * @param {string} newTitle
   */
  async updateTitle(newTitle) {
    // click → focus input → fill → verify → save
    await this.titleInput.click();
    await this.titleInput.fill(newTitle);
    await expect(this.titleInput).toHaveValue(newTitle, { timeout: 5000 });
    await this.saveButton.click();
    await this.page.waitForLoadState('networkidle');
  }
}
