// pages/SideMenu.js
// Фасад для работы с боковым меню - делегирует вызовы специализированным хелперам
import { BasePage } from "./BasePage.js";
import { TIMEOUTS } from "../tests/utils/constants.js";
import { URL_PATTERNS } from "../tests/utils/urls.js";
import { SELECTORS } from "../tests/utils/selectors.js";

// Импорт специализированных хелперов
import { ObjectivesMenuHelper } from "./menu/ObjectivesMenuHelper.js";
import { SurveysMenuHelper } from "./menu/SurveysMenuHelper.js";
import { FeedbackMenuHelper } from "./menu/FeedbackMenuHelper.js";
import { SettingsMenuHelper } from "./menu/SettingsMenuHelper.js";
import { StructureMenuHelper } from "./menu/StructureMenuHelper.js";
import { DevelopmentMenuHelper } from "./menu/DevelopmentMenuHelper.js";

/**
 * Фасад для работы с боковым меню.
 * Делегирует вызовы специализированным хелперам для каждой секции меню.
 */
export class SideMenu extends BasePage {
  /** @param {import('@playwright/test').Page} page
      @param {import('@playwright/test').TestInfo} [testInfo] */
  constructor(page, testInfo) {
    super(page, testInfo);

    // Инициализация специализированных хелперов
    this._objectivesHelper = new ObjectivesMenuHelper(page, testInfo);
    this._surveysHelper = new SurveysMenuHelper(page, testInfo);
    this._feedbackHelper = new FeedbackMenuHelper(page, testInfo);
    this._settingsHelper = new SettingsMenuHelper(page, testInfo);
    this._structureHelper = new StructureMenuHelper(page, testInfo);
    this._developmentHelper = new DevelopmentMenuHelper(page, testInfo);

    // Сохраняем локаторы для обратной совместимости
    this._initLegacyLocators();
  }

  /** Инициализация локаторов для обратной совместимости */
  _initLegacyLocators() {
    // Пункт "Моя команда" в левом меню
    this.myTeamMenuItem = this.page
      .locator(
        `li:has(span${SELECTORS.MENU_ITEM_TITLE}:has-text("Моя команда")), ` +
          `a:has(span${SELECTORS.MENU_ITEM_TITLE}:has-text("Моя команда"))`,
      )
      .first();

    // Пункт "Орг. структура" в левом меню
    this.orgStructureMenuItem = this._structureHelper.orgStructureMenuItem;

    // Структура: локаторы для обратной совместимости
    this.structureUsersLink = this._structureHelper.structureUsersLink;
    this.structureUsersAddLink = this._structureHelper.structureUsersAddLink;
    this.structureInviteLinksLink =
      this._structureHelper.structureInviteLinksLink;
    this.structureImportLink = this._structureHelper.structureImportLink;
    this.structureUserGroupsLink =
      this._structureHelper.structureUserGroupsLink;
    this.structureDepartmentsLink =
      this._structureHelper.structureDepartmentsLink;

    // Цели: локаторы
    this.objectivesMenuItem = this._objectivesHelper.objectivesMenuItem;
    this.objectivesCreateLink = this._objectivesHelper.objectivesCreateLink;
    this.objectivesAllLink = this._objectivesHelper.objectivesAllLink;
    this.objectivesSettingsLink = this._objectivesHelper.objectivesSettingsLink;

    // Опросы: локаторы
    this.surveysCreateLink = this._surveysHelper.surveysCreateLink;
    this.surveysListLink = this._surveysHelper.surveysListLink;

    // Фидбек: локаторы
    this.feedbackMenuItem = this._feedbackHelper.feedbackMenuItem;
    this.feedbackAddLink = this._feedbackHelper.feedbackAddLink;
    this.feedbackRequestLink = this._feedbackHelper.feedbackRequestLink;
    this.feedbackViewLink = this._feedbackHelper.feedbackViewLink;
    this.feedbackOfEmployeesLink = this._feedbackHelper.feedbackOfEmployeesLink;
    this.feedbackHistoryStatisticsLink =
      this._feedbackHelper.feedbackHistoryStatisticsLink;
    this.feedbackStatisticsLink = this._feedbackHelper.feedbackStatisticsLink;
  }

  // ----------------- Главные пункты меню (геттеры для совместимости) -----------------

  get developmentMenuItem() {
    return this._developmentHelper.developmentMenuItem;
  }

  get surveysMenuItem() {
    return this._surveysHelper.surveysMenuItem;
  }

  get settingsMenuItem() {
    return this._settingsHelper.settingsMenuItem;
  }

  get brandSettingsLink() {
    return this._settingsHelper.brandSettingsLink;
  }

  get structureConstructorLink() {
    return this._structureHelper.structureConstructorLink;
  }

  get giftShopMainMenuItem() {
    return this._settingsHelper.giftShopMainMenuItem;
  }

  get myProfileMenuItem() {
    return this.page.locator(
      `li:has(span${SELECTORS.MENU_ITEM_TITLE}:has-text("Мой профиль")), ` +
        `a:has(span${SELECTORS.MENU_ITEM_TITLE}:has-text("Мой профиль"))`,
    );
  }

  // ----------------- Моя команда -----------------

  /** Открыть страницу "Моя команда" через боковое меню */
  async openMyTeam() {
    await this._step('Открыть "Моя команда" через боковое меню', async () => {
      const item = this.myTeamMenuItem;
      await item.waitFor({
        state: "visible",
        timeout: TIMEOUTS.ELEMENT_VISIBLE,
      });

      await Promise.all([
        this.page
          .waitForURL(URL_PATTERNS.DASHBOARD, { timeout: TIMEOUTS.PAGE_LOAD })
          .catch(() => null),
        item.click(),
      ]);

      // Fallback: если клик по меню не привёл к /dashboard/, навигируем напрямую
      if (!URL_PATTERNS.DASHBOARD.test(this.page.url())) {
        const baseUrl = process.env.BASE_URL || "https://client.st1.apprs.ru";
        await this.page.goto(`${baseUrl}/ru/dashboard/`);
      }

      await this.page
        .waitForLoadState("domcontentloaded", { timeout: TIMEOUTS.PAGE_LOAD })
        .catch(() => null);
      await this._moveCursorToContent();
    });
  }

  // ----------------- Цели (делегирование) -----------------

  async openObjectivesSettings() {
    return this._objectivesHelper.openObjectivesSettings();
  }

  async hasObjectivesAllItem() {
    return this._objectivesHelper.hasObjectivesAllItem();
  }

  async openObjectivesAll() {
    return this._objectivesHelper.openObjectivesAll();
  }

  async assertObjectivesMenuHasOnlySettings() {
    return this._objectivesHelper.assertObjectivesMenuHasOnlySettings();
  }

  async assertObjectivesMenuHasFullSet() {
    return this._objectivesHelper.assertObjectivesMenuHasFullSet();
  }

  async hasObjectivesCreateItem() {
    return this._objectivesHelper.hasObjectivesCreateItem();
  }

  async openObjectivesCreate() {
    return this._objectivesHelper.openObjectivesCreate();
  }

  // ----------------- Развитие (делегирование) -----------------

  async openDevelopmentPlansSettings() {
    return this._developmentHelper.openDevelopmentPlansSettings();
  }

  async getDevelopmentMenuItems() {
    return this._developmentHelper.getDevelopmentMenuItems();
  }

  // ----------------- Опросы (делегирование) -----------------

  async openSurveysCreate() {
    return this._surveysHelper.openSurveysCreate();
  }

  async openSurveysList() {
    return this._surveysHelper.openSurveysList();
  }

  // ----------------- Фидбек (делегирование) -----------------

  async isFeedbackMenuItemVisible() {
    return this._feedbackHelper.isFeedbackMenuItemVisible();
  }

  async openFeedbackAdd() {
    return this._feedbackHelper.openFeedbackAdd();
  }

  async openFeedbackRequest() {
    return this._feedbackHelper.openFeedbackRequest();
  }

  async openFeedbackView() {
    return this._feedbackHelper.openFeedbackView();
  }

  async openFeedbackReview() {
    return this._feedbackHelper.openFeedbackReview();
  }

  async openFeedbackOfEmployees() {
    return this._feedbackHelper.openFeedbackOfEmployees();
  }

  async openFeedbackHistoryStatistics() {
    return this._feedbackHelper.openFeedbackHistoryStatistics();
  }

  async openFeedbackStatistics() {
    return this._feedbackHelper.openFeedbackStatistics();
  }

  async openFeedbackCompanyStatistics() {
    return this._feedbackHelper.openFeedbackCompanyStatistics();
  }

  // ----------------- Настройки / магазин подарков (делегирование) -----------------

  async openVirtualCurrencySettings() {
    return this._settingsHelper.openVirtualCurrencySettings();
  }

  async hasGiftShopMainItem() {
    return this._settingsHelper.hasGiftShopMainItem();
  }

  async hasGiftShopSettingsItem() {
    return this._settingsHelper.hasGiftShopSettingsItem();
  }

  async openGiftShopMain() {
    return this._settingsHelper.openGiftShopMain();
  }

  async openGiftShopSettingsFromSettings() {
    return this._settingsHelper.openGiftShopSettingsFromSettings();
  }

  async openOperationsHistory() {
    return this._settingsHelper.openOperationsHistory();
  }

  async openBrandSettings() {
    return this._settingsHelper.openBrandSettings();
  }

  // ----------------- Орг. структура (делегирование) -----------------

  async openStructureConstructor() {
    return this._structureHelper.openStructureConstructor();
  }

  async openStructureUsers() {
    return this._structureHelper.openStructureUsers();
  }

  async openStructureUsersAdd() {
    return this._structureHelper.openStructureUsersAdd();
  }

  async openStructureInviteLinks() {
    return this._structureHelper.openStructureInviteLinks();
  }

  async openStructureImport() {
    return this._structureHelper.openStructureImport();
  }

  async openStructureUserGroups() {
    return this._structureHelper.openStructureUserGroups();
  }

  async openStructureDepartments() {
    return this._structureHelper.openStructureDepartments();
  }

  // ----------------- Профиль -----------------

  /** Открыть страницу "Мой профиль" через боковое меню */
  async openMyProfile() {
    await this._step('Открыть "Мой профиль" через боковое меню', async () => {
      const targetUrl = /\/profile\/(\d+\/)?\?tab=main/i;

      if (targetUrl.test(this.page.url())) return;

      const item = this.myProfileMenuItem.first();
      await item.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

      await Promise.all([
        this.page
          .waitForURL(targetUrl, { timeout: TIMEOUTS.PAGE_LOAD })
          .catch(() => null),
        item.click(),
      ]);

      await this.page
        .waitForLoadState("domcontentloaded", { timeout: TIMEOUTS.PAGE_LOAD })
        .catch(() => null);
      await this._moveCursorToContent();
    });
  }
}
