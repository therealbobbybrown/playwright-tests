// pages/CompetencyFormPage.js
import { BasePage } from './BasePage.js';
import { TIMEOUTS } from '../tests/utils/constants.js';

/**
 * Страница создания/редактирования компетенции
 * URL: /ru/manager/competencies/add/ или /ru/manager/competencies/{id}/
 */
export class CompetencyFormPage extends BasePage {
  /**
   * @param {import('@playwright/test').Page} page
   * @param {import('@playwright/test').TestInfo} [testInfo]
   */
  constructor(page, testInfo) {
    super(page, testInfo);

    // Заголовок страницы (для создания)
    this.createHeading = page.getByRole('heading', { name: 'Создать компетенцию' });
    // Заголовок страницы (для карточки компетенции)
    this.viewHeading = page.getByRole('heading', { name: 'Компетенция' });

    // Поля формы создания
    this.titleInput = page.getByPlaceholder(/Например: Ведение переговоров/i);
    this.descriptionInput = page.getByPlaceholder(/Например: Способность устанавливать/i);

    // Тогглы
    this.groupToggle = page.getByText(/Компетенция входит в группу/i);
    this.feedbackToggle = page.getByText(/Показывать компетенцию в форме фидбека/i);

    // Кнопки действий
    this.cancelButton = page.getByRole('button', { name: /Отменить/i });
    this.createButton = page.getByRole('button', { name: 'Создать' });
    this.saveButton = page.getByRole('button', { name: /Сохранить/i });

    // Вкладки на странице карточки компетенции (это кнопки с классом Tabs_button, не role="tab")
    this.indicatorsTab = page.getByRole('button', { name: 'Вопросы-индикаторы' });
    this.devActionsTab = page.getByRole('button', { name: 'Развивающие действия' });
    this.recommendationsTab = page.getByRole('button', { name: 'Рекомендации' });

    // Индикаторы (вопросы) — кнопка "Добавить" (класс IndicatorQuestions_actionButton)
    this.addIndicatorButton = page.locator('[class*="IndicatorQuestions_actionButton"]').first();
    this.indicatorTitleInput = page.getByRole('textbox', { name: 'Вопрос' });
    // Footer buttons порядок: delete(trash), copy(docCopy), save(ok)/edit
    // save — третья кнопка (иконка ok/галочка) в раскрытой форме
    this.indicatorSaveButton = page.locator('button[class*="Question_footerButton__"]').nth(2);
    // delete — первая кнопка (иконка trash)
    this.indicatorDeleteButton = page.locator('button[class*="Question_footerButton__"]').nth(0);
  }

  /**
   * Открыть страницу создания компетенции
   */
  async gotoCreate() {
    const baseUrl = new URL(process.env.BASE_URL).origin;
    await this.page.goto(`${baseUrl}/ru/manager/competencies/add/`);
    await this.assertCreateOpened();
  }

  /**
   * Открыть страницу карточки компетенции
   * @param {number} id
   */
  async gotoView(id) {
    const baseUrl = new URL(process.env.BASE_URL).origin;
    await this.page.goto(`${baseUrl}/ru/manager/competencies/${id}/`);
    await this.assertViewOpened();
  }

  /**
   * Проверить что страница создания открыта
   */
  async assertCreateOpened() {
    await this.createHeading.waitFor({ state: 'visible', timeout: TIMEOUTS.PAGE_LOAD });
  }

  /**
   * Проверить что карточка компетенции открыта
   */
  async assertViewOpened() {
    await this.page.waitForLoadState('networkidle');
    // Ждём исчезновения спиннера в области контента (не навбара)
    const contentSpinner = this.page.locator('main [class*="Spinner"], main [class*="Loading"]');
    await contentSpinner.waitFor({ state: 'hidden', timeout: TIMEOUTS.PAGE_LOAD }).catch(() => {});
  }

  /**
   * Заполнить форму создания и сабмитнуть
   * @param {Object} data
   * @param {string} data.title
   * @param {string} [data.description]
   */
  async fillAndCreate({ title, description } = {}) {
    // pressSequentially вместо fill — корректно триггерит React onChange
    await this.titleInput.click();
    await this.titleInput.pressSequentially(title, { delay: 30 });
    if (description) {
      await this.descriptionInput.click();
      await this.descriptionInput.pressSequentially(description, { delay: 10 });
    }
    // Клик по кнопке "Создать" — primary button в форме
    const createBtn = this.page.getByRole('button', { name: 'Создать' }).last();
    await createBtn.waitFor({ state: 'visible', timeout: TIMEOUTS.SHORT });
    await createBtn.click();
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Включить тоггл "Показывать в фидбеке"
   */
  async enableFeedback() {
    const toggle = this.feedbackToggle;
    await toggle.click();
  }

  /**
   * Переключиться на вкладку "Вопросы-индикаторы"
   */
  async switchToIndicatorsTab() {
    await this.indicatorsTab.click();
  }

  /**
   * Добавить вопрос-индикатор
   * @param {string} questionText
   */
  async addIndicator(questionText) {
    await this.addIndicatorButton.click();
    await this.indicatorTitleInput.fill(questionText);
    // Сохранить индикатор (иконка сохранения или кнопка)
    const saveBtn = this.page.locator('[class*="save"], button[aria-label*="Сохранить"]').first();
    const hasSaveBtn = await saveBtn
      .waitFor({ state: 'visible', timeout: TIMEOUTS.SHORT })
      .then(() => true)
      .catch(() => false);
    if (hasSaveBtn) {
      await saveBtn.click();
    }
    await this.page.waitForLoadState('networkidle');
  }
}
