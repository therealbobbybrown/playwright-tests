// pages/PerformanceReviewsListPage.js
import { BasePage } from "./BasePage.js";
import { TIMEOUTS } from "../tests/utils/constants.js";
import { URL_PATTERNS } from "../tests/utils/urls.js";
import { SELECTORS } from "../tests/utils/selectors.js";

/**
 * Page Object для страницы со списком оценок сотрудников
 * URL: /ru/manager/performance-reviews/
 */
export class PerformanceReviewsListPage extends BasePage {
  constructor(page, testInfo) {
    super(page, testInfo);

    // Заголовок страницы
    this.pageTitle = this.page
      .getByRole("heading", { name: /оценка сотрудников/i })
      .first();

    // Кнопка "Запустить оценку"
    this.launchButton = this.page
      .getByRole("button", { name: /запустить оценку/i })
      .first();

    // Типы оценок в модальном окне создания
    // Модальное окно (SheetModal)
    this.createModal = this.page
      .locator(SELECTORS.SHEET_MODAL)
      .filter({ hasText: /запустить оценку/i })
      .first();

    // Карточки типов оценок - ищем по тексту внутри карточки
    this.performanceReviewType = this.page
      .getByText("Performance review", { exact: true })
      .locator("..")
      .locator("..")
      .first();
    this.survey360Type = this.page
      .getByText("Опрос 360°", { exact: true })
      .locator("..")
      .locator("..")
      .first();
    this.onboardingType = this.page
      .getByText("Онбординг", { exact: true })
      .locator("..")
      .locator("..")
      .first();

    // Поле поиска
    this.searchInput = this.page
      .getByRole("textbox", { name: /найти|поиск/i })
      .first();

    // Карточки оценок в списке
    this.reviewCards = this.page.locator('[class*="PerformanceReview"]');

    // Вкладки/фильтры
    this.allTab = this.page.getByRole("button", { name: /все/i }).first();
    this.draftsTab = this.page
      .getByRole("button", { name: /черновики/i })
      .first();
    this.activeTab = this.page
      .getByRole("button", { name: /активные/i })
      .first();
    this.completedTab = this.page
      .getByRole("button", { name: /завершенные/i })
      .first();
    this.archivedTab = this.page
      .getByRole("button", { name: /архив/i })
      .first();
  }

  // ---------------------------------------------------------------------------
  // Навигация
  // ---------------------------------------------------------------------------

  /**
   * Проверить, что страница открыта
   */
  async assertOpened() {
    await this._step('Страница "Оценка сотрудников" открыта', async () => {
      await this.page.waitForURL(URL_PATTERNS.PR_LIST, {
        timeout: TIMEOUTS.NAVIGATION,
      });
      await this.pageTitle.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Создание оценки
  // ---------------------------------------------------------------------------

  /**
   * Открыть модальное окно создания оценки
   */
  async openCreateModal() {
    await this._step("Открыть модальное окно создания оценки", async () => {
      await this.launchButton.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
      await this.launchButton.click();
      await this.createModal.waitFor({
        state: "visible",
        timeout: TIMEOUTS.SHORT,
      });
    });
  }

  /**
   * Создать Performance Review
   * @param {Object} options
   * @param {string} options.title - Название оценки
   */
  async createPerformanceReview({ title }) {
    await this._step(`Создать Performance Review "${title}"`, async () => {
      await this.openCreateModal();
      await this.performanceReviewType.waitFor({
        state: "visible",
        timeout: TIMEOUTS.SHORT,
      });
      await this.performanceReviewType.click();

      // После выбора типа перенаправляет на страницу настройки
      await this.page.waitForURL(URL_PATTERNS.PR_CARD, {
        timeout: TIMEOUTS.ELEMENT_VISIBLE,
      });
    });
  }

  /**
   * Создать опрос 360°
   * @param {Object} options
   * @param {string} options.title - Название оценки
   */
  async createSurvey360({ title }) {
    await this._step(`Создать опрос 360° "${title}"`, async () => {
      await this.openCreateModal();
      await this.survey360Type.waitFor({
        state: "visible",
        timeout: TIMEOUTS.SHORT,
      });
      await this.survey360Type.click();

      await this.page.waitForURL(URL_PATTERNS.PR_CARD, {
        timeout: TIMEOUTS.ELEMENT_VISIBLE,
      });
    });
  }

  /**
   * Создать онбординг
   * @param {Object} options
   * @param {string} options.title - Название оценки
   */
  async createOnboarding({ title }) {
    await this._step(`Создать онбординг "${title}"`, async () => {
      await this.openCreateModal();
      await this.onboardingType.waitFor({
        state: "visible",
        timeout: TIMEOUTS.SHORT,
      });
      await this.onboardingType.click();

      await this.page.waitForURL(URL_PATTERNS.PR_CARD, {
        timeout: TIMEOUTS.ELEMENT_VISIBLE,
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Поиск и фильтрация
  // ---------------------------------------------------------------------------

  /**
   * Найти оценку по названию
   * @param {string} title - Название оценки
   */
  async searchReview(title) {
    await this._step(`Найти оценку "${title}"`, async () => {
      const hasSearch = await this.searchInput.isVisible().catch(() => false);
      if (!hasSearch) return;

      await this.searchInput.fill(title);
      await this.page.keyboard.press("Enter").catch(() => {});
      // Wait for list to update after search
      await this.page
        .waitForLoadState("domcontentloaded", { timeout: TIMEOUTS.SHORT })
        .catch(() => {});
    });
  }

  /**
   * Открыть оценку по названию из списка
   * @param {string} title - Название оценки
   */
  async openReviewByTitle(title) {
    await this._step(`Открыть оценку "${title}" из списка`, async () => {
      await this.assertOpened();
      await this.searchReview(title);

      const card = this.reviewCards
        .filter({ has: this.page.getByText(title, { exact: false }) })
        .first();
      await card.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
      await card.click();

      await this.page.waitForURL(URL_PATTERNS.PR_CARD, {
        timeout: TIMEOUTS.ELEMENT_VISIBLE,
      });
    });
  }

  /**
   * Переключиться на вкладку
   * @param {'all'|'drafts'|'active'|'completed'|'archived'} tab
   */
  async switchTab(tab) {
    await this._step(`Переключиться на вкладку "${tab}"`, async () => {
      const tabs = {
        all: this.allTab,
        drafts: this.draftsTab,
        active: this.activeTab,
        completed: this.completedTab,
        archived: this.archivedTab,
      };

      const tabElement = tabs[tab];
      if (!tabElement) {
        throw new Error(`Неизвестная вкладка: ${tab}`);
      }

      await tabElement.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });
      await tabElement.click();
      // Wait for list to update after tab switch
      await this.page
        .waitForLoadState("domcontentloaded", { timeout: TIMEOUTS.SHORT })
        .catch(() => {});
    });
  }

  // ---------------------------------------------------------------------------
  // Проверки
  // ---------------------------------------------------------------------------

  /**
   * Проверить, что оценка отображается в списке
   * @param {string} title - Название оценки
   */
  async assertReviewPresent(title) {
    await this._step(`Оценка "${title}" отображается в списке`, async () => {
      await this.searchReview(title);

      const card = this.reviewCards
        .filter({ has: this.page.getByText(title, { exact: false }) })
        .first();
      await card.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
    });
  }

  /**
   * Проверить, что оценка отсутствует в списке
   * @param {string} title - Название оценки
   */
  async assertReviewAbsent(title) {
    await this._step(`Оценка "${title}" отсутствует в списке`, async () => {
      await this.searchReview(title);

      const card = this.reviewCards
        .filter({ has: this.page.getByText(title, { exact: false }) })
        .first();
      const visible = await card.isVisible().catch(() => false);

      if (visible) {
        throw new Error(`Оценка "${title}" все еще отображается в списке`);
      }
    });
  }
}
