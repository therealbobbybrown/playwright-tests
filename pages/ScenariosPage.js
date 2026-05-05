// pages/ScenariosPage.js
import { BasePage } from "./BasePage.js";
import { TIMEOUTS } from "../tests/utils/constants.js";
import { URL_PATTERNS } from "../tests/utils/urls.js";
import { SELECTORS } from "../tests/utils/selectors.js";

/**
 * Page Object для модуля Сценарии (Workflows)
 *
 * URLs:
 * - /manager/scenarios/ - список сценариев
 * - /manager/scenarios/add/ - создание сценария
 * - /manager/scenarios/{id}/ - просмотр/редактирование
 *
 * Права: ManageScenario + ManageSurvey (только супер-администратор)
 */
export class ScenariosPage extends BasePage {
  /**
   * @param {import('@playwright/test').Page} page
   * @param {import('@playwright/test').TestInfo} [testInfo]
   */
  constructor(page, testInfo) {
    super(page, testInfo);

    // ========================
    // Список сценариев
    // ========================
    /** Заголовок страницы (h1 "Сценарии" или h2 "Все сценарии") */
    this.heading = page
      .locator("h1, h2")
      .filter({ hasText: /сценарии/i })
      .first();

    /** Кнопка создания сценария - фиолетовая кнопка "+ Создать сценарий" справа */
    this.createButton = page.getByRole("link", { name: /создать сценарий/i });

    /** Контейнер списка сценариев */
    this.scenariosList = page
      .locator('[class*="Scenarios"], [class*="scenarios"]')
      .first();

    /**
     * Карточки сценариев - ссылки на /manager/scenarios/{id}/
     * Исключаем навигацию (SidePanel) и кнопку создания (/add/)
     */
    this.scenarioCards = page.locator(
      'a[href*="/manager/scenarios/"]:not([class*="SidePanel"]):not([href*="/add"])',
    );

    /** Альтернативный локатор - контейнеры карточек с бейджем статуса */
    this.scenarioCardContainers = page.locator(
      '[class*="ScenarioCard"], [class*="scenario-card"]',
    );

    /** Пустое состояние */
    this.emptyState = page
      .locator('[class*="Empty"], [class*="empty"]')
      .first();

    // ========================
    // Табы списка (Все сценарии / Мои сценарии)
    // ========================
    /** Таб "Все сценарии" на странице списка */
    this.allScenariosTab = page
      .getByRole("button", { name: /все сценарии/i })
      .first();

    /** Таб "Мои сценарии" на странице списка */
    this.myScenariosTab = page
      .getByRole("button", { name: /мои сценарии/i })
      .first();

    // ========================
    // Фильтры
    // ========================
    /** Фильтр по статусу (Все статусы/Активные/Черновики) */
    this.statusFilterButtons = page
      .locator("button")
      .filter({ hasText: /статус|активн|черновик/i });
    this.statusFilterAll = page
      .getByRole("button", { name: /все статусы/i })
      .first();
    this.statusFilterActive = page
      .getByRole("button", { name: /активные/i })
      .first();
    this.statusFilterDraft = page
      .getByRole("button", { name: /черновики/i })
      .first();

    /** Сортировка */
    this.sortSelect = page.locator('#sortField, [class*="SortField"]').first();

    // ========================
    // Форма сценария (страница создания/редактирования)
    // ========================
    /**
     * Inline-edit компонент (Editable):
     * - ДО клика: span.Editable_opener внутри FormTab_title / FormTab_description
     * - ПОСЛЕ клика: input#scenarioTitle / textarea#scenarioDescription
     * CSS-классы проверены через MCP-браузер на /ru/manager/scenarios/add/
     */

    /** Display-элемент названия (ДО клика — span.Editable_opener в FormTab_title) */
    this.titleDisplay = page
      .locator('[class*="FormTab_title"] [class*="Editable_opener"]')
      .first()
      .or(page.locator("#scenarioTitle"));

    /** Input названия (ПОСЛЕ клика — input#scenarioTitle, type=text) */
    this.titleInput = page.locator("#scenarioTitle");

    /** Display-элемент описания (ДО клика — span.Editable_opener в FormTab_description) */
    this.descriptionDisplay = page
      .locator('[class*="FormTab_description"] [class*="Editable_opener"]')
      .first()
      .or(page.locator("#scenarioDescription"));

    /** Textarea описания (ПОСЛЕ клика — textarea#scenarioDescription) */
    this.descriptionInput = page.locator("#scenarioDescription");

    /** Кнопка создания/запуска сценария (фиолетовая внизу формы) */
    this.activateButton = page
      .locator('button[type="submit"]')
      .or(page.getByRole("button", { name: /^создать сценарий$/i }))
      .first();

    /** Кнопка submit для создания (синоним activateButton) */
    this.submitButton = page
      .getByRole("button", { name: /^создать сценарий$/i })
      .or(page.locator('button[type="submit"]'))
      .first();

    // ========================
    // Действия (Actions)
    // ========================
    /** Кнопка добавления действия - "+ Запланировать опрос" */
    this.addActionButton = page
      .getByRole("button", { name: /запланировать опрос/i })
      .or(page.locator("button").filter({ hasText: /запланировать опрос/i }))
      .or(page.getByText(/запланировать опрос/i))
      .first();

    /** Карточки действий */
    this.actionCards = page.locator('[class*="ActionForm"], [class*="action"]');

    /** Поле дней в форме действия */
    this.actionDaysInput = page
      .locator('input[name="days"], [class*="days"] input')
      .first();

    /** Поле времени в форме действия */
    this.actionTimeInput = page
      .locator('input[name="time"], [class*="time"] input')
      .first();

    /** Кнопка выбора опроса */
    this.selectSurveyButton = page
      .getByRole("button", { name: /выбрать опрос|select survey/i })
      .or(page.locator('[class*="Survey_button"]'))
      .first();

    /**
     * Кнопка сохранения действия (icon-ok).
     * Кнопки сохранения/удаления не имеют CSS-классов на элементе <button>.
     * Они расположены во враппере внутри ActionForm: delete — первая, save — последняя.
     */
    this.saveActionButton = page
      .locator('[class*="ActionForm_form"] button:not([class]):not([tabindex="-1"])')
      .last();

    /** Кнопка удаления действия (icon-newTrash, без CSS-класса на button) */
    this.deleteActionButton = page
      .locator('[class*="ActionForm_form"] button:not([class]):not([tabindex="-1"])')
      .first();

    // ========================
    // Табы (Dashboard / Form)
    // ========================
    /** Таб Dashboard ("Панель управления") */
    this.dashboardTab = page
      .getByRole("button", { name: /панель управления/i })
      .first();

    /** Таб Form / Editor ("Редактор сценария") */
    this.formTab = page
      .getByRole("button", { name: /редактор сценария/i })
      .first();

    /** Алиас formTab для читаемости в тестах */
    this.editorTab = this.formTab;

    // ========================
    // Performers (участники)
    // ========================
    /** Поиск участников */
    this.performersSearchInput = page
      .locator('#scenarioPerformers__q, [name="q"]')
      .first();

    /** Кнопка добавления участника */
    this.addPerformerButton = page
      .getByRole("button", {
        name: /добавить сотрудников|add employees|add performer/i,
      })
      .first();

    /** Таблица участников */
    this.performersTable = page
      .locator('[class*="Performers"] table, [class*="performers"] table')
      .first();

    /** Строки участников */
    this.performerRows = page.locator(
      '[class*="PerformerRow"], [class*="performer-row"]',
    );

    /** Заголовки колонок таблицы участников */
    this.performersTableHeaders = page.locator(
      'table th, table [role="columnheader"]',
    );

    /** Строки данных таблицы участников */
    this.performersTableRows = page.locator(
      'table tbody tr, table [role="rowgroup"]:last-child [role="row"]',
    );

    /** Кнопка завершения для участника */
    this.completePerformerButton = page
      .getByRole("button", { name: /завершить|complete/i })
      .first();

    // ========================
    // Toast уведомления
    // ========================
    this.toast = page.locator(SELECTORS.TOAST).first();

    // ========================
    // Селект пользователей (модалка добавления участников)
    // ========================
    this.userSelectModal = page
      .locator('[class*="UserQuerySelect"], [class*="UserSelect"]')
      .first();
    this.userSelectOptions = page.locator(
      '[class*="UserOption"], [role="option"]',
    );
  }

  // ========================
  // NAVIGATION
  // ========================

  /**
   * Получить базовый URL из окружения
   * @returns {string}
   */
  _getBaseUrl() {
    return process.env.BASE_URL;
  }

  /**
   * Перейти на страницу списка сценариев
   */
  async navigate() {
    await this._step("Перейти на страницу сценариев", async () => {
      const baseUrl = this._getBaseUrl();
      const url = new URL("/ru/manager/scenarios/", baseUrl).toString();
      await this.page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: TIMEOUTS.PAGE_LOAD,
      });
      await this.page.waitForURL(URL_PATTERNS.SCENARIOS_LIST, {
        timeout: TIMEOUTS.PAGE_LOAD,
      });
      await this.page
        .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
        .catch(() => {});
    });
  }

  /**
   * Перейти на страницу создания сценария
   */
  async navigateToCreate() {
    await this._step("Перейти на создание сценария", async () => {
      const baseUrl = this._getBaseUrl();
      const url = new URL("/ru/manager/scenarios/add/", baseUrl).toString();
      await this.page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: TIMEOUTS.PAGE_LOAD,
      });
      await this.page.waitForURL(URL_PATTERNS.SCENARIOS_ADD, {
        timeout: TIMEOUTS.PAGE_LOAD,
      });
      await this.page
        .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
        .catch(() => {});
    });
  }

  /**
   * Перейти к конкретному сценарию
   * @param {string|number} id - ID сценария
   */
  async navigateToScenario(id) {
    await this._step(`Перейти к сценарию ${id}`, async () => {
      const baseUrl = this._getBaseUrl();
      const url = new URL(`/ru/manager/scenarios/${id}/`, baseUrl).toString();
      await this.page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: TIMEOUTS.PAGE_LOAD,
      });
      await this.page.waitForURL(URL_PATTERNS.SCENARIOS_VIEW, {
        timeout: TIMEOUTS.PAGE_LOAD,
      });
      await this.page
        .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
        .catch(() => {});
    });
  }

  /**
   * Проверить, что страница списка открыта
   */
  async assertListOpened() {
    await this._step("Проверить, что список сценариев открыт", async () => {
      await this.page.waitForURL(URL_PATTERNS.SCENARIOS_LIST, {
        timeout: TIMEOUTS.ELEMENT_VISIBLE,
      });
    });
  }

  /**
   * Проверить, что страница сценария открыта
   */
  async assertScenarioOpened() {
    await this._step("Проверить, что страница сценария открыта", async () => {
      await this.page.waitForURL(URL_PATTERNS.SCENARIOS_VIEW, {
        timeout: TIMEOUTS.ELEMENT_VISIBLE,
      });
    });
  }

  // ========================
  // LIST OPERATIONS
  // ========================

  /**
   * Получить количество сценариев в списке
   * @returns {Promise<number>}
   */
  async getScenariosCount() {
    return await this._step("Получить количество сценариев", async () => {
      return await this.scenarioCards.count();
    });
  }

  /**
   * Проверить пустое состояние
   * @returns {Promise<boolean>}
   */
  async isListEmpty() {
    return await this._step("Проверить пустое состояние", async () => {
      return await this.emptyState.isVisible().catch(() => false);
    });
  }

  /**
   * Фильтровать по статусу
   * @param {'all' | 'active' | 'draft'} status
   */
  async filterByStatus(status) {
    await this._step(`Фильтровать по статусу: ${status}`, async () => {
      const button =
        status === "active"
          ? this.statusFilterActive
          : status === "draft"
            ? this.statusFilterDraft
            : this.statusFilterAll;

      await button.click();
      await this.page
        .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
        .catch(() => {});
    });
  }

  /**
   * Открыть сценарий по названию
   * @param {string} title - Название сценария
   */
  async openScenarioByTitle(title) {
    await this._step(`Открыть сценарий "${title}"`, async () => {
      const card = this.scenarioCards
        .filter({
          has: this.page.getByText(title, { exact: false }),
        })
        .first();

      await card.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
      // Используем force: true т.к. элементы карточки могут перекрывать ссылку
      await card.click({ force: true });
      await this.page.waitForURL(URL_PATTERNS.SCENARIOS_VIEW, {
        timeout: TIMEOUTS.PAGE_LOAD,
      });
    });
  }

  /**
   * Открыть первый сценарий из списка
   */
  async openFirstScenario() {
    await this._step("Открыть первый сценарий из списка", async () => {
      // Ждём загрузки списка
      await this.page
        .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
        .catch(() => {});

      // Находим первую карточку с бейджем "Черновик" или ссылкой на сценарий
      const firstCard = this.scenarioCards.first();
      await firstCard.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

      // Получаем href и переходим напрямую
      const href = await firstCard.getAttribute("href");
      if (href) {
        // Конвертируем относительный путь в абсолютный
        const fullUrl = href.startsWith("http")
          ? href
          : new URL(href, this._getBaseUrl()).toString();
        await this.page.goto(fullUrl, {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        });
      } else {
        // Если href нет - кликаем с force
        await firstCard.click({ force: true });
      }

      await this.page.waitForURL(URL_PATTERNS.SCENARIOS_VIEW, {
        timeout: TIMEOUTS.PAGE_LOAD,
      });
    });
  }

  // ========================
  // CRUD OPERATIONS
  // ========================

  /**
   * Создать сценарий
   * @param {Object} params
   * @param {string} params.title - Название
   * @param {string} [params.description] - Описание
   */
  async createScenario({ title, description }) {
    await this._step(`Создать сценарий "${title}"`, async () => {
      // Если на странице списка - нажать кнопку создания
      const isOnList = await this.createButton.isVisible().catch(() => false);
      if (isOnList) {
        await this.createButton.click();
        await this.page.waitForURL(URL_PATTERNS.SCENARIOS_ADD, {
          timeout: TIMEOUTS.PAGE_LOAD,
        });
      }

      // Заполнить название: клик по display → input#scenarioTitle появляется
      await this.titleDisplay.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
      await this.titleDisplay.click();
      await this.titleInput.waitFor({ state: "visible", timeout: 3000 });
      await this.titleInput.clear();
      await this.titleInput.fill(title);

      // Заполнить описание (если есть)
      if (description) {
        await this.descriptionDisplay.click();
        await this.descriptionInput.waitFor({
          state: "visible",
          timeout: 3000,
        });
        await this.descriptionInput.clear();
        await this.descriptionInput.fill(description);
      }

      // Кликнуть вне полей для деактивации inline-edit и автосохранения
      await this.page.locator("body").click({ position: { x: 10, y: 10 } });
      // Ждём завершения автосохранения
      await this.page
        .waitForLoadState("networkidle", { timeout: TIMEOUTS.SHORT })
        .catch(() => {});
    });
  }

  /**
   * Изменить название сценария (inline-edit)
   * @param {string} newTitle
   */
  async updateTitle(newTitle) {
    await this._step(`Изменить название на "${newTitle}"`, async () => {
      // Клик по display-элементу активирует inline-edit → input#scenarioTitle
      await this.titleDisplay.click();
      await this.titleInput.waitFor({ state: "visible", timeout: 3000 });
      await this.titleInput.clear();
      await this.titleInput.fill(newTitle);
      await this.titleInput.press("Tab"); // Выход из inline-edit + автосохранение
      // Ждём завершения автосохранения
      await this.page
        .waitForLoadState("networkidle", { timeout: TIMEOUTS.SHORT })
        .catch(() => {});
    });
  }

  /**
   * Изменить описание сценария
   * @param {string} newDescription
   */
  async updateDescription(newDescription) {
    await this._step(`Изменить описание`, async () => {
      // Клик по display-элементу активирует inline-edit → textarea#scenarioDescription
      await this.descriptionDisplay.click();
      await this.descriptionInput.waitFor({ state: "visible", timeout: 3000 });
      await this.descriptionInput.clear();
      await this.descriptionInput.fill(newDescription);
      await this.descriptionInput.press("Tab"); // Выход из inline-edit + автосохранение
      // Ждём завершения автосохранения
      await this.page
        .waitForLoadState("networkidle", { timeout: TIMEOUTS.SHORT })
        .catch(() => {});
    });
  }

  /**
   * Получить текущее название
   * @returns {Promise<string>}
   */
  async getTitle() {
    return await this._step("Получить название сценария", async () => {
      await this.page
        .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
        .catch(() => {});
      // Если input уже виден (режим редактирования) — читаем из него
      const inputVisible = await this.titleInput.isVisible().catch(() => false);
      if (inputVisible) {
        return (await this.titleInput.inputValue()).trim();
      }
      // Иначе читаем текст из display-элемента (Editable_opener)
      return ((await this.titleDisplay.textContent()) || "").trim();
    });
  }

  /**
   * Получить текущее описание
   * @returns {Promise<string>}
   */
  async getDescription() {
    return await this._step("Получить описание сценария", async () => {
      const inputVisible = await this.descriptionInput
        .isVisible()
        .catch(() => false);
      if (inputVisible) {
        return (await this.descriptionInput.inputValue()).trim();
      }
      return ((await this.descriptionDisplay.textContent()) || "").trim();
    });
  }

  // ========================
  // ACTIONS MANAGEMENT
  // ========================

  /**
   * Добавить действие "Отправить опрос"
   * @param {Object} params
   * @param {number} params.days - Через сколько дней
   * @param {string} [params.time] - Время (HH:mm)
   * @param {string} params.surveyTitle - Название опроса для выбора
   */
  async addSurveyAction({ days, time, surveyTitle }) {
    await this._step(
      `Добавить действие: опрос "${surveyTitle}" через ${days} дней`,
      async () => {
        // Нажать кнопку добавления
        await this.addActionButton.click();

        // Заполнить дни
        await this.actionDaysInput.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        await this.actionDaysInput.fill(String(days));

        // Заполнить время (если указано)
        if (time) {
          await this.actionTimeInput.fill(time);
        }

        // Выбрать опрос
        await this.selectSurveyButton.click();
        const surveyOption = this.page
          .getByText(surveyTitle, { exact: false })
          .first();
        await surveyOption.click();

        // Сохранить действие
        await this.saveActionButton.click();
        // Ждём сохранения и скрытия формы
        await this.saveActionButton
          .waitFor({ state: "hidden", timeout: TIMEOUTS.SHORT })
          .catch(() => {});
      },
    );
  }

  /**
   * Получить количество действий
   * @returns {Promise<number>}
   */
  async getActionsCount() {
    return await this._step("Получить количество действий", async () => {
      return await this.actionCards.count();
    });
  }

  /**
   * Удалить действие по индексу
   * @param {number} index - Индекс действия (0-based)
   */
  async deleteAction(index) {
    await this._step(`Удалить действие #${index + 1}`, async () => {
      const actionCard = this.actionCards.nth(index);
      const deleteBtn = actionCard
        .locator('button[class*="trash"], [class*="delete"]')
        .first();
      await deleteBtn.click();
      // Ждём удаления карточки
      await actionCard
        .waitFor({ state: "hidden", timeout: TIMEOUTS.SHORT })
        .catch(() => {});
    });
  }

  // ========================
  // LIFECYCLE
  // ========================

  /**
   * Активировать сценарий
   */
  async activateScenario() {
    await this._step("Активировать сценарий", async () => {
      await this.activateButton.click();
      await this.page
        .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
        .catch(() => {});
    });
  }

  /**
   * Проверить, активен ли сценарий
   * @returns {Promise<boolean>}
   */
  async isScenarioActive() {
    return await this._step("Проверить статус сценария", async () => {
      // После активации кнопка "Запустить" должна исчезнуть
      const activateVisible = await this.activateButton
        .isVisible()
        .catch(() => false);
      return !activateVisible;
    });
  }

  // ========================
  // TABS
  // ========================

  /**
   * Переключиться на таб
   * @param {'dashboard' | 'form'} tabName
   */
  async switchToTab(tabName) {
    await this._step(`Переключиться на таб ${tabName}`, async () => {
      const tab = tabName === "dashboard" ? this.dashboardTab : this.formTab;
      await tab.click();
      await this.page
        .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
        .catch(() => {});
    });
  }

  // ========================
  // PERFORMERS
  // ========================

  /**
   * Добавить участника в сценарий
   * @param {string} userName - Имя пользователя для поиска
   */
  async addPerformer(userName) {
    await this._step(`Добавить участника "${userName}"`, async () => {
      await this.addPerformerButton.click();

      // Поиск пользователя
      const searchInput = this.userSelectModal.locator("input").first();
      await searchInput.fill(userName);

      // Ждём появления опций после поиска
      await this.userSelectOptions
        .first()
        .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
        .catch(() => {});

      // Выбрать пользователя
      const userOption = this.userSelectOptions
        .filter({ hasText: userName })
        .first();
      await userOption.click();

      await this.page
        .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
        .catch(() => {});
    });
  }

  /**
   * Получить количество участников
   * @returns {Promise<number>}
   */
  async getPerformersCount() {
    return await this._step("Получить количество участников", async () => {
      return await this.performerRows.count();
    });
  }

  /**
   * Завершить сценарий для участника по индексу
   * @param {number} index - Индекс строки участника
   */
  async completePerformerByIndex(index) {
    await this._step(
      `Завершить сценарий для участника #${index + 1}`,
      async () => {
        const row = this.performerRows.nth(index);
        const completeBtn = row
          .getByRole("button", { name: /завершить|complete/i })
          .first();
        await completeBtn.click();
        await this.page
          .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
          .catch(() => {});
      },
    );
  }

  /**
   * Открыть детализацию участника
   * @param {number} index - Индекс строки
   */
  async expandPerformerDetails(index) {
    await this._step(`Раскрыть детали участника #${index + 1}`, async () => {
      const row = this.performerRows.nth(index);
      await row.click();
      // Ждём раскрытия деталей (появления вложенного контента)
      await this.page
        .waitForLoadState("domcontentloaded", { timeout: TIMEOUTS.SHORT })
        .catch(() => {});
    });
  }

  // ========================
  // ASSERTIONS
  // ========================

  /**
   * Кликнуть на кнопку создания сценария
   */
  async clickCreateButton() {
    await this._step("Нажать кнопку создания сценария", async () => {
      await this.page
        .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
        .catch(() => {});

      // Пробуем найти и кликнуть кнопку
      try {
        await this.createButton.waitFor({ state: "visible", timeout: 5000 });
        const href = await this.createButton.getAttribute("href");
        if (href) {
          // Переходим напрямую по ссылке
          await this.page.goto(href, { waitUntil: "domcontentloaded" });
        } else {
          await this.createButton.click();
        }
      } catch {
        // Если не нашли кнопку - переходим напрямую по URL
        const baseUrl = this._getBaseUrl();
        const url = new URL("/ru/manager/scenarios/add/", baseUrl).toString();
        await this.page.goto(url, { waitUntil: "domcontentloaded" });
      }

      await this.page.waitForURL(URL_PATTERNS.SCENARIOS_ADD, {
        timeout: TIMEOUTS.PAGE_LOAD,
      });
    });
  }

  /**
   * Проверить видимость toast уведомления
   * @param {string} [expectedText] - Ожидаемый текст (опционально)
   */
  async assertToastVisible(expectedText) {
    await this._step("Проверить toast уведомление", async () => {
      await this.toast.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

      if (expectedText) {
        const toastText = await this.toast.textContent();
        if (!toastText?.includes(expectedText)) {
          throw new Error(
            `Toast не содержит текст "${expectedText}". Actual: "${toastText}"`,
          );
        }
      }
    });
  }

  /**
   * Проверить, что кнопка создания видима (для проверки доступа)
   * @returns {Promise<boolean>}
   */
  async isCreateButtonVisible() {
    return await this._step("Проверить видимость кнопки создания", async () => {
      try {
        // Ждём загрузки страницы
        await this.page
          .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
          .catch(() => {});

        // Проверяем наличие ссылки с href на /scenarios/add
        const addLink = this.page.locator('a[href*="/scenarios/add"]');
        const count = await addLink.count();

        if (count > 0) {
          // Проверяем первую найденную ссылку
          const first = addLink.first();
          const isVisible = await first.isVisible();
          return isVisible;
        }

        return false;
      } catch {
        // Button may not exist on page (e.g., user lacks ManageScenario permission)
        return false;
      }
    });
  }

  /**
   * Проверить, что сценарий с названием существует в списке
   * @param {string} title
   * @returns {Promise<boolean>}
   */
  async scenarioExistsInList(title) {
    return await this._step(
      `Проверить наличие сценария "${title}"`,
      async () => {
        const card = this.scenarioCards
          .filter({
            has: this.page.getByText(title, { exact: false }),
          })
          .first();
        return await card.isVisible().catch(() => false);
      },
    );
  }
}
