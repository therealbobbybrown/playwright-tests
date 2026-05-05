import { BasePage } from "./BasePage.js";
import { TIMEOUTS } from "../tests/utils/constants.js";
import { URL_PATTERNS } from "../tests/utils/urls.js";
// pages/SurveysListPage.js

export class SurveysListPage extends BasePage {
  /**
   * @param {import('@playwright/test').Page} page
   * @param {import('@playwright/test').TestInfo} [testInfo]
   */
  constructor(page, testInfo) {
    super(page, testInfo);

    // Заголовок страницы "Опросы"
    this.title = this.page
      .getByRole("heading", { level: 1, name: /опросы/i })
      .first();

    // Кнопка "Создать опрос" над списком
    this.createSurveyButton = this.page
      .getByRole("button", { name: /создать опрос/i })
      .first();

    // Кнопка фильтра "Черновики"
    this.draftsFilterButton = this.page
      .getByRole("button", { name: /черновики/i })
      .first();

    // Поле поиска "Найти опрос"
    this.searchInput = this.page
      .getByRole("textbox", { name: /найти опрос/i })
      .first();

    // Карточки опросов в списке
    this.surveyCards = this.page.locator('[class*="Survey_inner"]');

    // Текст "Черновиков пока нет"
    this.noDraftsText = this.page
      .getByText("Черновиков пока нет", { exact: false })
      .first();
  }

  // ---------------------------------------------------------------------------
  // Общие проверки
  // ---------------------------------------------------------------------------

  /** Убедиться, что открыта страница "Опросы" */
  async assertOpened() {
    await this._step('Открыта страница "Опросы"', async () => {
      // URL можем использовать только как вспомогательный сигнал, без падения
      await this.page
        .waitForURL(URL_PATTERNS.SURVEYS_LIST, {
          timeout: TIMEOUTS.ELEMENT_VISIBLE,
        })
        .catch(() => {});

      // Главный маркер — виден заголовок/кнопка "Создать опрос"
      await this.createSurveyButton.waitFor({
        state: "visible",
        timeout: TIMEOUTS.ELEMENT_VISIBLE,
      });
      await this.title.waitFor({
        state: "visible",
        timeout: TIMEOUTS.ELEMENT_VISIBLE,
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Работа со списком
  // ---------------------------------------------------------------------------

  /**
   * Открыть первый опрос со статусом "Черновик" из списка.
   * Если черновиков нет — создать НОВЫЙ ЧЕРНОВИК ИЗ ШАБЛОНА и открыть его.
   */
  async openFirstDraftSurveyOrCreate() {
    await this._step(
      "Открыть первый черновик опроса или создать новый из шаблона",
      async () => {
        await this.assertOpened();

        // Переключаем фильтр на "Черновики"
        await this.draftsFilterButton.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        await this.draftsFilterButton.click();

        // Ждём обновления списка карточек или текста "Черновиков пока нет"
        await Promise.race([
          this.surveyCards
            .first()
            .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT }),
          this.noDraftsText.waitFor({
            state: "visible",
            timeout: TIMEOUTS.SHORT,
          }),
        ]).catch(() => {});

        const firstCard = this.surveyCards.first();
        const hasAnyCard = await firstCard.isVisible().catch(() => false);

        if (hasAnyCard) {
          // Открываем первый черновик из списка
          const link = firstCard
            .locator('a[href*="/manager/company/surveys/"]')
            .first();

          await link.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

          await Promise.all([
            this.page
              .waitForURL(URL_PATTERNS.SURVEY_CONSTRUCTOR, {
                timeout: TIMEOUTS.ELEMENT_VISIBLE,
              })
              .catch(() => {}),
            link.click(),
          ]);

          return;
        }

        // Черновиков нет — убеждаемся, что это действительно так
        await this.noDraftsText
          .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
          .catch(() => {});

        // Создаём новый черновик ИЗ ШАБЛОНА и переходим в конструктор
        await this._createDraftViaTemplateFromList();
      },
    );
  }

  /**
   * Открыть список шаблонов через кнопку "Создать опрос".
   * Используется в отдельном сценарии "открыть шаблоны из списка".
   */
  async openCreateFromTemplatePopup() {
    await this._step(
      'Через кнопку "Создать опрос" открыть список шаблонов',
      async () => {
        await this.assertOpened();
        await this._openCreateSurveyPopup();

        const templateLink = this.page
          .getByRole("link", { name: /опрос из шаблона/i })
          .first();

        await templateLink.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });

        await Promise.all([
          this.page
            .waitForURL(URL_PATTERNS.SURVEY_TEMPLATES, {
              timeout: TIMEOUTS.ELEMENT_VISIBLE,
            })
            .catch(() => {}),
          templateLink.click(),
        ]);
      },
    );
  }

  /**
   * Найти опрос по названию и открыть его карточку.
   * Используется в сценариях проверки результатов.
   * @param {string} title
   */
  async openSurveyByTitle(title) {
    await this._step(
      `Открыть опрос по названию "${title}" из списка`,
      async () => {
        await this.assertOpened();

        await this._applySearchFilter(title);

        const card = this._surveyCardByTitle(title);

        await card.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

        const link = card
          .locator('a[href*="/manager/company/surveys/"]')
          .first();
        await link.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

        await Promise.all([
          this.page
            .waitForURL(URL_PATTERNS.SURVEY_CONSTRUCTOR, {
              timeout: TIMEOUTS.ELEMENT_VISIBLE,
            })
            .catch(() => {}),
          link.click(),
        ]);
      },
    );
  }

  /**
   * Создать новый пустой опрос (не из шаблона) через кнопку "Создать опрос" на странице списка.
   * После выполнения ожидается переход в конструктор (/surveys/add/...).
   */
  async createBlankSurveyFromList() {
    await this._step(
      "Создать новый пустой черновик опроса (не из шаблона) из списка",
      async () => {
        await this._createBlankSurveyFromList();
      },
    );
  }

  /**
   * Удалить опрос по названию через меню карточки.
   * @param {string} title
   */
  async deleteSurveyByTitle(title) {
    await this._step(`Удалить опрос "${title}" из списка`, async () => {
      await this.assertOpened();
      await this._applySearchFilter(title);

      const card = this._surveyCardByTitle(title);
      await card.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

      const actionsButton = card
        .locator('button[class*="HandleButton_button__"]')
        .first();
      await actionsButton.waitFor({
        state: "visible",
        timeout: TIMEOUTS.SHORT,
      });
      await actionsButton.scrollIntoViewIfNeeded().catch(() => {});
      await actionsButton.click();

      const deleteAction = this.page
        .locator('div[class*="ActionList_content__"]')
        .filter({ hasText: "Удалить" })
        .first();

      await deleteAction.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });
      await deleteAction.click();

      const confirmButton = this.page
        .getByRole("button", { name: /да, удалить/i })
        .first();
      await confirmButton.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
      await confirmButton.click();

      await card.waitFor({
        state: "hidden",
        timeout: TIMEOUTS.ELEMENT_VISIBLE,
      });
    });
  }

  /**
   * Скопировать опрос по названию через меню карточки ("Создать копию").
   * После клика копия появляется в списке с названием "Копия <title>".
   * @param {string} title — название оригинального опроса
   * @returns {string} — название созданной копии ("Копия <title>")
   */
  async copySurveyByTitle(title) {
    return this._step(`Создать копию опроса "${title}"`, async () => {
      await this.assertOpened();
      await this._applySearchFilter(title);

      const card = this._surveyCardByTitle(title);
      await card.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

      const actionsButton = card
        .locator('button[class*="HandleButton_button__"]')
        .first();
      await actionsButton.waitFor({
        state: "visible",
        timeout: TIMEOUTS.SHORT,
      });
      await actionsButton.scrollIntoViewIfNeeded().catch(() => {});
      await actionsButton.click();

      const copyAction = this.page
        .locator('div[class*="ActionList_content__"]')
        .filter({ hasText: "Создать копию" })
        .first();

      await copyAction.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });
      await copyAction.click();

      const copyTitle = `Копия ${title}`;
      const copyCard = this._surveyCardByTitle(copyTitle);
      await copyCard.waitFor({
        state: "visible",
        timeout: TIMEOUTS.ELEMENT_VISIBLE,
      });

      return copyTitle;
    });
  }

  /**
   * Проверить, что опрос с указанным названием отсутствует в списке.
   * @param {string} title
   */
  async assertSurveyAbsent(title) {
    await this._step(`Опрос "${title}" отсутствует в списке`, async () => {
      await this.assertOpened();
      await this._applySearchFilter(title);

      const card = this._surveyCardByTitle(title);
      const visible = await card.isVisible().catch(() => false);
      if (visible) {
        await card.waitFor({ state: "hidden", timeout: TIMEOUTS.MEDIUM });
      }

      const stillVisible = await card.isVisible().catch(() => false);
      if (stillVisible) {
        throw new Error(
          `Опрос "${title}" все еще отображается в списке после удаления.`,
        );
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Внутреннее: создание черновика по шаблону из списка
  // ---------------------------------------------------------------------------

  async _createDraftViaTemplateFromList() {
    await this._step(
      "Создать новый черновик опроса из случайного шаблона через список",
      async () => {
        await this.openCreateFromTemplatePopup();

        // Шаблоны в списке (НЕ "Новый опрос", а именно карточки-шаблоны)
        const templateButtons = this.page.locator(
          'button[class*="SurveyTemplate_link__"]',
        );

        await templateButtons
          .first()
          .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

        const count = await templateButtons.count();
        if (!count)
          throw new Error("Не найдено ни одного шаблона для создания опроса.");

        const randomIndex = Math.floor(Math.random() * count);
        const button = templateButtons.nth(randomIndex);

        await button.scrollIntoViewIfNeeded();
        await button.click();

        const useTemplateLink = this.page
          .getByRole("link", { name: "Использовать шаблон" })
          .first();

        await useTemplateLink.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });

        await Promise.all([
          this.page
            .waitForURL(URL_PATTERNS.SURVEY_ADD, {
              timeout: TIMEOUTS.ELEMENT_VISIBLE,
            })
            .catch(() => {}),
          useTemplateLink.click(),
        ]);
      },
    );
  }

  // ---------------------------------------------------------------------------
  // Внутреннее: запасной метод создания пустого опроса (НЕ из шаблона)
  // ---------------------------------------------------------------------------

  async _createBlankSurveyFromList() {
    await this._step(
      "Создать новый пустой черновик опроса (не из шаблона)",
      async () => {
        await this.assertOpened();
        await this._openCreateSurveyPopup();

        const blankByHref = this.page
          .locator('a[href*="/manager/company/surveys/add"]')
          .first();

        const blankByRole = this.page
          .getByRole("link", { name: /создать опрос/i })
          .first();

        const candidates = [blankByHref, blankByRole];

        let clicked = false;
        for (const link of candidates) {
          const visible = await link.isVisible().catch(() => false);
          if (!visible) continue;

          await Promise.all([
            this.page
              .waitForURL(URL_PATTERNS.SURVEY_ADD, {
                timeout: TIMEOUTS.ELEMENT_VISIBLE,
              })
              .catch(() => {}),
            link.click(),
          ]);

          clicked = true;
          break;
        }

        if (!clicked) {
          throw new Error(
            'Не удалось найти ссылку "Создать опрос" для создания пустого черновика.',
          );
        }
      },
    );
  }

  // ---------------------------------------------------------------------------
  // Вспомогательное
  // ---------------------------------------------------------------------------

  /** Открыть попап / меню "Создать опрос" */
  async _openCreateSurveyPopup() {
    await this.createSurveyButton.waitFor({
      state: "visible",
      timeout: TIMEOUTS.MEDIUM,
    });
    await this.createSurveyButton.click();

    const templateLink = this.page
      .getByRole("link", { name: /опрос из шаблона/i })
      .first();
    const blankLink = this.page
      .getByRole("link", { name: /создать опрос/i })
      .first();

    await Promise.race([
      templateLink
        .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
        .catch(() => {}),
      blankLink
        .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
        .catch(() => {}),
    ]);
  }

  /** Отфильтровать список опросов по названию, если есть строка поиска */
  async _applySearchFilter(title) {
    const hasSearch = await this.searchInput.isVisible().catch(() => false);
    if (!hasSearch) return;

    await this.searchInput.fill(title);
    await this.page.keyboard.press("Enter").catch(() => {});

    // Ждём обновления списка после применения поиска
    await this.page
      .waitForLoadState("networkidle", { timeout: TIMEOUTS.SHORT })
      .catch(() => {});
  }

  /** Получить локатор карточки опроса по названию */
  _surveyCardByTitle(title) {
    return this.surveyCards
      .filter({ has: this.page.getByText(title, { exact: false }) })
      .first();
  }
}
