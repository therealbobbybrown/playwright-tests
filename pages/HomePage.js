// pages/HomePage.js
import { expect } from "@playwright/test";
import { BasePage } from "./BasePage.js";
import { TIMEOUTS } from "../tests/utils/constants.js";
import { SELECTORS } from "../tests/utils/selectors.js";

export class HomePage extends BasePage {
  /**
   * @param {import('@playwright/test').Page} page
   * @param {import('@playwright/test').TestInfo} [testInfo]
   */
  constructor(page, testInfo) {
    super(page, testInfo);

    // === Навигационное меню (иконки слева) ===
    this.homeMenuItem = this.page
      .locator(`li:has(span${SELECTORS.MENU_ITEM_TITLE}:has-text("Главная"))`)
      .first();
    // Боковое меню - контейнер nav с пунктами
    this.sideMenu = this.page
      .locator("nav, aside")
      .filter({ has: this.page.locator(SELECTORS.MENU_ITEM_TITLE) })
      .first();
    this.menuItems = this.page.locator(
      `li:has(span${SELECTORS.MENU_ITEM_TITLE})`,
    );

    // === Header (шапка) ===
    // Реальные классы из фронта: Header_inner__, Header_header-logo__, etc.
    this.header = this.page.locator('div[class*="Header_inner"]').first();
    this.headerLogo = this.page
      .locator('a[class*="Header_header-logo"]')
      .first();
    // Баланс: кнопки с иконками claps и wallet
    this.headerCurrencyCounter = this.page
      .locator('span[class*="HeaderButton_label"]')
      .first();
    this.headerPointsCounter = this.page
      .locator('span[class*="HeaderButton_label"]')
      .last();
    // Колокольчик уведомлений - ссылка на /notifications/
    this.headerNotificationBell = this.page
      .locator('a[href*="notifications"]')
      .first();
    this.headerNotificationBadge = this.page
      .locator('span[class*="HeaderButton_badge"]')
      .first();
    // Аватар пользователя в header
    this.headerAvatar = this.page
      .locator('span[class*="Header_userAvatar"]')
      .first();

    // === Заголовок страницы "Список дел" ===
    this.titleHeading = this.page
      .getByRole("heading", { level: 1, name: /Список дел/i })
      .first();
    this.titleInner = this.page
      .locator('span[class*="Home_title-inner"]')
      .first();
    this.titleBadge = this.page
      .locator('span[class*="Home_badge"], span[class*="Badge"]')
      .first();

    // === Левый сайдбар (профиль, фидбек, команда) ===
    // Реальные классы: Home_sidebar__, Profile_profile__, Feedback_feedback__, Team_team__
    this.sidebar = this.page.locator('div[class*="Home_sidebar"]').first();

    // Блок профиля
    this.profileCard = this.page
      .locator('div[class*="Profile_profile"]')
      .first();
    this.profileAvatar = this.profileCard
      .locator('span[class*="Avatar_avatar"]')
      .first();
    this.profileName = this.profileCard
      .locator('span[class*="Text_text--size-large"]')
      .first();
    this.profileRole = this.profileCard
      .locator('span[class*="Text_text--size-small"]')
      .first();

    // Блок "Мой фидбек"
    this.feedbackBlock = this.page
      .locator('div[class*="Feedback_feedback"]')
      .first();
    this.feedbackTitle = this.feedbackBlock
      .locator('b:has-text("Мой фидбек")')
      .first();
    this.feedbackCounter = this.feedbackBlock
      .locator('span[class*="Feedback_value"] b')
      .first();
    this.feedbackStatisticsLink = this.feedbackBlock
      .locator('a[class*="IconLink_link"]')
      .first();
    this.feedbackProgressCircle = this.feedbackBlock
      .locator('div[class*="Feedback_chart"] canvas')
      .first();

    // Блок "Моя команда"
    this.teamBlock = this.page.locator('div[class*="Team_team"]').first();
    this.teamTitle = this.teamBlock
      .locator('b:has-text("Моя команда")')
      .first();
    this.teamManagerCard = this.teamBlock
      .locator('div[class*="BaseCard_card"]:has-text("Мой руководитель")')
      .first();
    this.teamManagerName = this.teamBlock
      .locator('span:has-text("Мой руководитель")')
      .first();
    this.teamDepartmentLink = this.teamBlock
      .locator('div[class*="BaseCard_card"]:has-text("Мой отдел")')
      .first();
    this.teamAddLink = this.teamBlock
      .locator('a[class*="IconLink_link"]:has-text("Добавить сотрудников")')
      .first();

    // === Список дел (основной контент) ===
    // Реальные классы: Home_main__, Home_title__, Notifications_items__
    this.todoList = this.page.locator('div[class*="Home_main"]').first();
    this.todoCards = this.page
      .locator('div[class*="Notifications_items"]')
      .first();
    this.emptyState = this.todoList
      .locator('[class*="Empty"], [class*="empty-state"]')
      .first();
    this.loader = this.todoList
      .locator('[class*="Loader"], [class*="spinner"], [class*="loading"]')
      .first();

    // Карточка ИПР (Планы развития)
    this.devPlanCard = this.page
      .locator('div[class*="UserDevelopmentPlans_notification"]')
      .first();
    this.devPlanTitle = this.devPlanCard
      .locator('div[class*="UserDevelopmentPlans_title"]')
      .first();
    this.devPlanProgress = this.devPlanCard
      .locator('span[class*="Progress_label"]')
      .first();
    this.devPlanDate = this.devPlanCard
      .locator('span[class*="Progress_label"]:has-text("до")')
      .first();

    // Карточка Оценки персонала (Performance Review)
    this.prCard = this.page
      .locator(
        'div[class*="PerformanceReviewSummaryNotification_notification"]',
      )
      .first();
    this.prTitle = this.prCard
      .locator('div[class*="PerformanceReviewSummaryNotification_title"]')
      .first();
    this.prTaskFillForms = this.prCard
      .locator('div[class*="SummaryItem_title"]')
      .first();
    this.prTaskProgress = this.prCard
      .locator('span[class*="Progress_label"]')
      .first();
    this.prGoToReviewButton = this.prCard
      .locator('a[class*="Button_button"]:has-text("Перейти к оценке")')
      .first();
  }

  /** Открыть главную страницу через боковое меню */
  async openFromMenu() {
    await this._step('Открыть "Главная" через боковое меню', async () => {
      const item = this.homeMenuItem;
      await item.waitFor({
        state: "visible",
        timeout: TIMEOUTS.ELEMENT_VISIBLE,
      });

      await Promise.all([
        this.page
          .waitForLoadState("domcontentloaded", { timeout: TIMEOUTS.PAGE_LOAD })
          .catch(() => null),
        item.click(),
      ]);

      await this.titleHeading.waitFor({
        state: "visible",
        timeout: TIMEOUTS.PAGE_LOAD,
      });
      await this._moveCursorToContent();
    });
  }

  /** Проверить заголовок "Список дел" и бейдж с количеством (без фиксированного числа) */
  async assertTitleAndBadge() {
    await this._step('Главная: заголовок "Список дел" и бейдж', async () => {
      await this._moveCursorToContent();
      await this.titleHeading.waitFor({
        state: "visible",
        timeout: TIMEOUTS.PAGE_LOAD,
      });
      await this.titleInner.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });

      await this.titleBadge.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
      const rawText = (await this.titleBadge.textContent()) ?? "";
      const digits = rawText.replace(/\D+/g, "").trim();

      expect(digits.length).toBeGreaterThan(0);
    });
  }

  /** Проверить блоки сайдбара (профиль, фидбек, команда) без привязки к данным пользователя */
  async assertSidebarBlocks() {
    await this._step(
      "Главная: сайдбар с профилем, фидбеком и командой",
      async () => {
        await this._moveCursorToContent();
        await this.sidebar.waitFor({
          state: "visible",
          timeout: TIMEOUTS.PAGE_LOAD,
        });

        await this.profileCard.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        await this.profileAvatar.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });

        await this.feedbackBlock.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        await this.teamBlock.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        // teamAddLink видна только для admin/manager — catch допустим, т.к. метод вызывается для всех ролей
        await this.teamAddLink
          .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
          .catch(() => null);
      },
    );
  }

  // =====================
  // HEADER
  // =====================

  /** Проверить отображение header */
  async assertHeader() {
    await this._step("Проверить header страницы", async () => {
      await this.header.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
      // Аватар пользователя обязателен в header
      await expect(this.headerAvatar).toBeVisible();
      // Логотип может быть скрыт через CSS (visibility:hidden) — проверяем существование в DOM
      await expect(this.headerLogo).toBeAttached();
    });
  }

  /** Проверить счётчики в header (валюта, баллы) */
  async assertHeaderCounters() {
    await this._step("Проверить счётчики в header", async () => {
      await expect(this.headerCurrencyCounter).toBeVisible();
      await expect(this.headerPointsCounter).toBeVisible();
    });
  }

  /** Проверить колокольчик уведомлений */
  async assertNotificationBell() {
    await this._step("Проверить колокольчик уведомлений", async () => {
      await this.headerNotificationBell.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
    });
  }

  /** Клик на логотип, проверка редиректа на главную */
  async clickLogoAndVerifyRedirect() {
    await this._step("Клик на логотип → переход на главную", async () => {
      await this.headerLogo.click();
      await this.page.waitForURL(/\/ru\/?$/, { timeout: TIMEOUTS.NAVIGATION });
    });
  }

  // =====================
  // БОКОВОЕ МЕНЮ
  // =====================

  /** Проверить отображение бокового меню */
  async assertSideMenu() {
    await this._step("Проверить боковое меню", async () => {
      await this.sideMenu.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
      const itemsCount = await this.menuItems.count();
      expect(itemsCount).toBeGreaterThan(0);
    });
  }

  /** Получить количество пунктов меню */
  async getMenuItemsCount() {
    return await this.menuItems.count();
  }

  // =====================
  // БЛОК ПРОФИЛЯ
  // =====================

  /** Проверить блок профиля с именем и ролью */
  async assertProfileBlock() {
    await this._step("Проверить блок профиля", async () => {
      await this.profileCard.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
      await this.profileAvatar.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });

      await expect(this.profileName).toBeVisible();
      await expect(this.profileRole).toBeVisible();
    });
  }

  /** Получить имя пользователя из профиля */
  async getProfileName() {
    return await this.profileName.textContent();
  }

  /** Получить роль пользователя из профиля */
  async getProfileRole() {
    return await this.profileRole.textContent();
  }

  // =====================
  // БЛОК "МОЙ ФИДБЕК"
  // =====================

  /** Проверить блок "Мой фидбек" */
  async assertFeedbackBlock() {
    await this._step('Проверить блок "Мой фидбек"', async () => {
      await this.feedbackBlock.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
      await this.feedbackTitle.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
    });
  }

  /** Получить счётчик фидбеков */
  async getFeedbackCount() {
    const text = await this.feedbackCounter.textContent();
    return parseInt(text?.replace(/\D/g, "") || "0", 10);
  }

  /** Клик на "Статистика" в блоке фидбека */
  async clickFeedbackStatistics() {
    await this._step('Клик на "Статистика" в блоке фидбека', async () => {
      await this.feedbackStatisticsLink.click();
      await this.page.waitForURL(/\/feedback.*statistics|\/statistics/, {
        timeout: TIMEOUTS.NAVIGATION,
      });
    });
  }

  // =====================
  // БЛОК "МОЯ КОМАНДА"
  // =====================

  /** Проверить блок "Моя команда" */
  async assertTeamBlock() {
    await this._step('Проверить блок "Моя команда"', async () => {
      await this.teamBlock.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
      await this.teamTitle.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
    });
  }

  /** Проверить отображение руководителя */
  async assertManagerDisplayed() {
    await this._step("Проверить отображение руководителя", async () => {
      await this.teamManagerName.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
    });
  }

  /** Проверить видимость ссылки "Добавить сотрудников" */
  async isAddEmployeesLinkVisible() {
    return await this.teamAddLink.isVisible();
  }

  /** Клик на "Мой отдел" */
  async clickMyDepartment() {
    await this._step('Клик на "Мой отдел"', async () => {
      await this.teamDepartmentLink.click();
      await this.page.waitForURL(/\/structure|\/department/, {
        timeout: TIMEOUTS.NAVIGATION,
      });
    });
  }

  /** Клик на "Добавить сотрудников" */
  async clickAddEmployees() {
    await this._step('Клик на "Добавить сотрудников"', async () => {
      await this.teamAddLink.click();
      await this.page.waitForURL(/\/manager\/structure/, {
        timeout: TIMEOUTS.NAVIGATION,
      });
    });
  }

  // =====================
  // СПИСОК ДЕЛ
  // =====================

  /** Проверить наличие списка дел */
  async assertTodoListVisible() {
    await this._step("Проверить наличие списка дел", async () => {
      await this.todoList.waitFor({
        state: "visible",
        timeout: TIMEOUTS.PAGE_LOAD,
      });
    });
  }

  /** Получить количество карточек в списке дел */
  async getTodoCardsCount() {
    return await this.todoCards.count();
  }

  /** Проверить пустое состояние списка дел */
  async assertEmptyState() {
    await this._step("Проверить пустое состояние списка дел", async () => {
      await this.emptyState.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
    });
  }

  /** Прокрутить список и проверить подгрузку (infinite scroll) */
  async scrollAndCheckInfiniteLoad() {
    await this._step("Прокрутить список и проверить подгрузку", async () => {
      const initialCount = await this.getTodoCardsCount();

      // Прокрутить до конца списка
      await this.page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });

      // Wait for possible loader or network idle after scroll
      await this.page
        .waitForLoadState("networkidle", { timeout: TIMEOUTS.SHORT })
        .catch(() => {});

      // Проверяем loader или новые карточки
      const loaderVisible = await this.loader.isVisible().catch(() => false);
      const newCount = await this.getTodoCardsCount();

      return { initialCount, newCount, loaderVisible };
    });
  }

  // =====================
  // КАРТОЧКА ИПР
  // =====================

  /** Проверить карточку плана развития (ИПР) */
  async assertDevPlanCard() {
    await this._step("Проверить карточку плана развития", async () => {
      await this.devPlanCard.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
    });
  }

  /** Получить прогресс выполнения ИПР */
  async getDevPlanProgress() {
    const text = await this.devPlanProgress.textContent();
    const match = text?.match(/(\d+)\s*из\s*(\d+)/);
    if (match) {
      return {
        completed: parseInt(match[1], 10),
        total: parseInt(match[2], 10),
      };
    }
    return null;
  }

  /** Клик на карточку ИПР */
  async clickDevPlanCard() {
    await this._step("Клик на карточку плана развития", async () => {
      await this.devPlanCard.click();
      await this.page.waitForURL(/\/development|\/plan/, {
        timeout: TIMEOUTS.NAVIGATION,
      });
    });
  }

  // =====================
  // КАРТОЧКА ОЦЕНКИ (PR)
  // =====================

  /** Проверить карточку оценки персонала */
  async assertPRCard() {
    await this._step("Проверить карточку оценки персонала", async () => {
      await this.prCard.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
    });
  }

  /** Проверить кнопку "Перейти к оценке" */
  async assertGoToReviewButton() {
    await this._step('Проверить кнопку "Перейти к оценке"', async () => {
      await this.prGoToReviewButton.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
    });
  }

  /** Получить прогресс заполнения анкет */
  async getPRFormsProgress() {
    const text = await this.prTaskProgress.textContent();
    const match = text?.match(/(\d+)\s*из\s*(\d+)/);
    if (match) {
      return { filled: parseInt(match[1], 10), total: parseInt(match[2], 10) };
    }
    return null;
  }

  /** Клик на "Перейти к оценке" */
  async clickGoToReview() {
    await this._step('Клик на "Перейти к оценке"', async () => {
      await this.prGoToReviewButton.click();
      await this.page.waitForURL(/\/performance-review|\/review/, {
        timeout: TIMEOUTS.NAVIGATION,
      });
    });
  }

  // =====================
  // УТИЛИТЫ
  // =====================

  /** Перейти на главную страницу напрямую */
  async goto() {
    await this._step("Перейти на главную страницу", async () => {
      const baseUrl = process.env.BASE_URL;
      // Используем new URL для корректного построения пути относительно базового URL
      const homeUrl = new URL("/ru/", baseUrl).toString();
      await this.page.goto(homeUrl, {
        waitUntil: "domcontentloaded",
        timeout: TIMEOUTS.PAGE_LOAD,
      });
      await this.titleHeading.waitFor({
        state: "visible",
        timeout: TIMEOUTS.PAGE_LOAD,
      });
    });
  }

  /** Получить текст badge количества дел */
  async getTodoBadgeCount() {
    const text = await this.titleBadge.textContent();
    const digits = text?.replace(/\D/g, "").trim() || "0";
    return digits === "" ? 99 : parseInt(digits, 10); // 99+ отображается как 99
  }
}
