import { BasePage } from "./BasePage.js";
import { TIMEOUTS } from "../tests/utils/constants.js";
import { URL_PATTERNS } from "../tests/utils/urls.js";
// pages/SurveyConstructorPage.js

export class SurveyConstructorPage extends BasePage {
  /**
   * @param {import('@playwright/test').Page} page
   * @param {import('@playwright/test').TestInfo} [testInfo]
   */
  constructor(page, testInfo) {
    super(page, testInfo);

    // Лейблы "Страница" в конструкторе
    this.pageLabels = this.page.locator('span:has-text("Страница")');

    // Кликабельный заголовок опроса (обёртка-опенер)
    this.titleEditable = this.page
      .locator('span[class*="Editable_opener"]')
      .first();

    // Плашки состояния автосохранения
    this.autosaveBanner = this.page
      .getByText("Сохранение", { exact: false })
      .first();
    this.savedBanner = this.page
      .getByText("Сохранено", { exact: false })
      .first();

    // Кнопка "Перейти к настройкам публикации"
    this.goToPublicationSettingsButton = this.page.getByRole("button", {
      name: "Перейти к настройкам публикации",
    });

    // Модалка "Добавить новый вопрос"
    this.addQuestionModal = this.page
      .locator('div[class*="Block_block__"]')
      .filter({ has: this.page.getByText("Добавить новый вопрос") })
      .first();

    // Контейнеры вопросов (карточки)
    this.questionCards = this.page.locator('[class*="Question_question__"]');
  }

  /** Убедиться, что открыт конструктор опроса */
  async assertOpened() {
    await this._step("Открыт конструктор опроса", async () => {
      await this.page.waitForURL(URL_PATTERNS.SURVEY_CONSTRUCTOR, {
        timeout: TIMEOUTS.ELEMENT_VISIBLE,
      });

      // Network idle может не наступить из-за фона (long-polling/websocket), поэтому ждём
      // загрузку best-effort и сразу проверяем ключевой элемент.
      await this.page
        .waitForLoadState("domcontentloaded", {
          timeout: TIMEOUTS.ELEMENT_VISIBLE,
        })
        .catch(() => {});
      await this.page
        .waitForLoadState("networkidle", { timeout: TIMEOUTS.SHORT })
        .catch(() => {});

      await this.pageLabels
        .first()
        .waitFor({ state: "visible", timeout: TIMEOUTS.ELEMENT_VISIBLE });
    });
  }

  /**
   * Извлечь ID опроса из URL конструктора.
   * URL: /manager/company/surveys/{id}/
   * @returns {string|null}
   */
  getSurveyIdFromUrl() {
    const match = this.page.url().match(/\/surveys\/(\d+)/);
    return match ? match[1] : null;
  }

  /** Количество страниц (по числу лейблов "Страница") */
  async getPagesCount() {
    return this._step("Получить количество страниц опроса", async () =>
      this.pageLabels.count(),
    );
  }

  /**
   * Универсально: поменять заголовок на "<prefix> <n>".
   * Возвращает новый заголовок.
   */
  async changeTitleRandom(prefix = "Пустой опрос") {
    return this._step(
      `Изменить заголовок опроса на "${prefix} <n>"`,
      async () => {
        const randomNumber = Math.floor(Math.random() * 10000) + 1;
        const newTitle = `${prefix} ${randomNumber}`;

        await this.titleEditable.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        await this.titleEditable.click();

        // Ждём появления поля ввода или фокуса на редактируемом элементе
        await this.page
          .locator(
            'input[type="text"]:focus, textarea:focus, [contenteditable="true"]:focus',
          )
          .first()
          .waitFor({ state: "attached", timeout: TIMEOUTS.SHORT })
          .catch(() => {});

        try {
          await this.page.keyboard.press("Control+A");
        } catch {}
        try {
          await this.page.keyboard.press("Meta+A");
        } catch {}

        await this.page.keyboard.type(newTitle);

        const header = this.page.getByRole("heading", { level: 1 });
        try {
          if (await header.first().isVisible()) await header.first().click();
          else await this.page.mouse.click(10, 10);
        } catch {
          await this.page.mouse.click(10, 10);
        }

        await this.waitForAutosave();
        return newTitle;
      },
    );
  }

  /**
   * Backward-compatible alias (старые тесты зовут именно так).
   * Возвращает новый заголовок.
   */
  async changeTitleToRandom(prefix = "Пустой опрос") {
    return this.changeTitleRandom(prefix);
  }

  /**
   * Назад-совместимый метод (чтобы не сломать другие тесты).
   * Возвращает новый заголовок.
   */
  async changeTitleToTemplateRandom() {
    return this.changeTitleRandom("По шаблону");
  }

  /** Прочитать текущий заголовок опроса */
  async getTitleText() {
    return this._step("Прочитать заголовок опроса", async () => {
      const text = await this.titleEditable.innerText();
      return text.trim();
    });
  }

  /**
   * Дождаться автосохранения.
   * Важно: "Сохранение" может не успеть появиться (очень быстрое сохранение),
   * поэтому ждём либо "Сохранение"->скрыто, либо появления "Сохранено".
   */
  async waitForAutosave() {
    await this._step("Дождаться автосохранения", async () => {
      if (await this.savedBanner.isVisible().catch(() => false)) return;

      const waitSavingCycle = this.autosaveBanner
        .waitFor({ state: "visible", timeout: 2_000 })
        .then(() =>
          this.autosaveBanner
            .waitFor({ state: "hidden", timeout: TIMEOUTS.ELEMENT_VISIBLE })
            .catch(() => {}),
        )
        .catch(() => {});

      const waitSaved = this.savedBanner
        .waitFor({ state: "visible", timeout: TIMEOUTS.ELEMENT_VISIBLE })
        .catch(() => {});

      await Promise.race([waitSavingCycle, waitSaved]);
    });
  }

  /** Перейти из конструктора к настройкам публикации */
  async goToPublicationSettings() {
    await this._step("Перейти к настройкам публикации", async () => {
      const btn = this.goToPublicationSettingsButton;
      const tab = this.page
        .getByRole("button", { name: /Настройки публикации/i })
        .first();

      // Прокручиваем вниз, чтобы кнопка/таб подтянулись
      await this.page
        .evaluate(() => window.scrollTo(0, document.body.scrollHeight))
        .catch(() => {});

      const buttonVisible = await btn
        .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
        .then(() => true)
        .catch(() => false);
      if (buttonVisible) {
        await btn.scrollIntoViewIfNeeded().catch(() => {});
        await btn
          .evaluate((el) =>
            el.scrollIntoView({
              block: "center",
              inline: "center",
              behavior: "auto",
            }),
          )
          .catch(() => {});

        await btn
          .click({ timeout: TIMEOUTS.ELEMENT_VISIBLE })
          .catch(async () => {
            await btn.click({ force: true, timeout: TIMEOUTS.ELEMENT_VISIBLE });
          });
      } else {
        await tab.waitFor({ state: "visible", timeout: TIMEOUTS.LONG });
        await tab.click({ force: true }).catch(() => {});
      }

      await this.page
        .waitForURL(URL_PATTERNS.SURVEY_PUBLICATION, {
          timeout: TIMEOUTS.PAGE_LOAD,
        })
        .catch(() => {});
      await this.page
        .waitForLoadState("networkidle", { timeout: TIMEOUTS.SHORT })
        .catch(() => {});
    });
  }

  // ---------------------------------------------------------------------------
  // Добавление и настройка вопросов
  // ---------------------------------------------------------------------------

  /**
   * Добавить новый вопрос и настроить его.
   *
   * @param {{
   *  title: string,
   *  typeLabel: 'Один из списка'|'Несколько из списка'|'Шкала'|'NPS'|'Длинный ответ'|'Краткий ответ',
   *  listOptions?: string[],
   *  scaleViewType?: 'Цифры'|'Звезды'|'Текст'
   * }} params
   */
  async addQuestionWithType(params) {
    const { title, typeLabel, listOptions, scaleViewType } = params;

    return this._step(
      `Добавить вопрос: "${title}" (${typeLabel})`,
      async () => {
        const { typeSelect, root } =
          await this._addNewQuestionAndGetContext(typeLabel);

        await this._setQuestionTitle(root, title);

        await this._assertQuestionType(typeSelect, typeLabel);

        if (
          typeLabel === "Один из списка" ||
          typeLabel === "Несколько из списка"
        ) {
          const options = listOptions?.length
            ? listOptions
            : ["Вариант 1", "Вариант 2", "Вариант 3"];
          await this._fillListOptions(root, options);
        }

        if (typeLabel === "Шкала" && scaleViewType) {
          await this._setScaleViewType(root, scaleViewType);
        }

        // КЛЮЧЕВОЕ: коммитим изменения в карточке вопроса (галочка)
        await this._confirmQuestion(root);
      },
    );
  }

  /** Добавить все типы вопросов */
  async addAllQuestionTypes() {
    return this._step("Добавить все типы вопросов", async () => {
      const plan = [
        {
          title: "Q1 — Один из списка",
          typeLabel: "Один из списка",
          listOptions: ["Вариант 1", "Вариант 2", "Вариант 3"],
        },
        {
          title: "Q2 — Несколько из списка",
          typeLabel: "Несколько из списка",
          listOptions: ["Вариант 1", "Вариант 2", "Вариант 3"],
        },
        {
          title: "Q3 — Шкала (Цифры)",
          typeLabel: "Шкала",
          scaleViewType: "Цифры",
        },
        {
          title: "Q4 — Шкала (Звезды)",
          typeLabel: "Шкала",
          scaleViewType: "Звезды",
        },
        {
          title: "Q5 — Шкала (Текст)",
          typeLabel: "Шкала",
          scaleViewType: "Текст",
        },
        { title: "Q6 — NPS", typeLabel: "NPS" },
        { title: "Q7 — Длинный ответ", typeLabel: "Длинный ответ" },
        { title: "Q8 — Краткий ответ", typeLabel: "Краткий ответ" },
      ];

      for (const q of plan) {
        await this.addQuestionWithType(q);
        await this.waitForAutosave();

        // Пауза для визуальной проверки (только при DEBUG_PAUSE=1)
        if (process.env.DEBUG_PAUSE === "1") {
          await this.page.waitForTimeout(3_000);
        }
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Внутреннее: добавление вопроса через модалку
  // ---------------------------------------------------------------------------

  async _addNewQuestionAndGetContext(typeLabel) {
    const before = await this.questionCards.count();

    await this._openAddQuestionModal();
    await this._chooseTypeInAddQuestionModal(typeLabel);

    await this.addQuestionModal
      .waitFor({ state: "hidden", timeout: TIMEOUTS.MEDIUM })
      .catch(() => {});

    const newCard = await this._waitForNewQuestionCard(before);

    await this._ensureQuestionInEditMode(newCard);

    const base = await this._getQuestionBaseId(newCard);

    let typeSelect = newCard.locator(`#${base}__type`).first();

    typeSelect = typeSelect
      .locator('xpath=ancestor-or-self::*[contains(@class,"Select_group")][1]')
      .first();

    if (!(await typeSelect.isVisible().catch(() => false))) {
      typeSelect = newCard
        .locator('input[type="hidden"][name="type"]')
        .first()
        .locator('xpath=ancestor::*[contains(@class,"Select_group")][1]')
        .first();
    }

    const root = newCard;

    return { typeSelect, root };
  }

  async _waitForNewQuestionCard(before) {
    const selector = '[class*="Question_question__"]';

    await this.page.waitForFunction(
      ({ selector, before }) =>
        document.querySelectorAll(selector).length > before,
      { selector, before },
      { timeout: TIMEOUTS.ELEMENT_VISIBLE },
    );

    const card = this.questionCards.nth(before);
    await card.waitFor({ state: "visible", timeout: TIMEOUTS.ELEMENT_VISIBLE });
    await card.scrollIntoViewIfNeeded().catch(() => {});
    return card;
  }

  async _ensureQuestionInEditMode(rootOrCard) {
    const root = rootOrCard;

    const editTitle = root.getByPlaceholder("Вопрос").first();
    const titleById = root
      .locator('textarea[id^="question-edit-"][id$="__title"]')
      .first();

    if (
      (await editTitle.isVisible().catch(() => false)) ||
      (await titleById.isVisible().catch(() => false))
    ) {
      return;
    }

    const heading = root.getByRole("heading").first();
    if (await heading.isVisible().catch(() => false)) {
      await heading.click().catch(() => {});
    } else {
      await root.click().catch(() => {});
    }

    if (
      !(await editTitle.isVisible().catch(() => false)) &&
      !(await titleById.isVisible().catch(() => false))
    ) {
      await root.click({ force: true }).catch(() => {});
    }

    await Promise.race([
      editTitle
        .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
        .catch(() => {}),
      titleById
        .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
        .catch(() => {}),
    ]);
  }

  async _getQuestionBaseId(card) {
    const title = card
      .locator('textarea[id^="question-edit-"][id$="__title"]')
      .first();
    if (await title.isVisible().catch(() => false)) {
      const titleId = await title.getAttribute("id");
      if (titleId) return titleId.replace(/__title$/, "");
    }

    const typeInput = card
      .locator('input[id^="question-edit-"][id$="__type"]')
      .first();
    if (await typeInput.isVisible().catch(() => false)) {
      const id = await typeInput.getAttribute("id");
      if (id) return id.replace(/__type$/, "");
    }

    const any = card.locator('[id^="question-edit-"]').first();
    await any.waitFor({ state: "attached", timeout: TIMEOUTS.ELEMENT_VISIBLE });

    const anyId = await any.getAttribute("id");
    if (!anyId)
      throw new Error(
        "Не удалось получить base id у вопроса (question-edit-...).",
      );

    return anyId.replace(/__(.+)$/, "");
  }

  async _openAddQuestionModal() {
    await this._clickAddQuestion();
    await this.addQuestionModal.waitFor({
      state: "visible",
      timeout: TIMEOUTS.MEDIUM,
    });
  }

  async _chooseTypeInAddQuestionModal(typeLabel) {
    const button = this.addQuestionModal
      .getByRole("button", {
        name: new RegExp(`^${this._escapeRegExp(typeLabel)}$`),
      })
      .first();

    await button.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
    await button.click();
  }

  async _clickAddQuestion() {
    const candidates = [
      this.page.getByRole("button", { name: /добавить вопрос/i }).first(),
      this.page.locator('button:has-text("Добавить вопрос")').first(),
      this.page.locator('button:has(svg):has-text("Добавить вопрос")').first(),
      this.page.locator('[data-testid*="add-question"]').first(),
      this.page.locator('[aria-label*="Добавить вопрос"]').first(),
    ];

    for (const c of candidates) {
      if (await c.isVisible().catch(() => false)) {
        await c.scrollIntoViewIfNeeded().catch(() => {});
        await c.click();
        return;
      }
    }

    throw new Error(
      'Не нашёл кнопку, которая открывает модалку "Добавить новый вопрос".',
    );
  }

  // ---------------------------------------------------------------------------
  // Внутреннее: настройка вопроса
  // ---------------------------------------------------------------------------

  async _setQuestionTitle(root, title) {
    const titleField = root.getByPlaceholder("Вопрос").first();
    if (await titleField.isVisible().catch(() => false)) {
      await titleField.fill(title);
      return;
    }

    const titleById = root
      .locator('textarea[id^="question-edit-"][id$="__title"]')
      .first();
    if (await titleById.isVisible().catch(() => false)) {
      await titleById.fill(title);
      return;
    }

    const textarea = root.locator("textarea").first();
    if (await textarea.isVisible().catch(() => false)) {
      await textarea.fill(title);
      return;
    }

    const input = root
      .locator('input:not([aria-readonly="true"]):not([readonly])')
      .first();
    await input.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
    await input.fill(title);
  }

  async _assertQuestionType(typeSelect, expectedLabel) {
    const value = typeSelect.locator(".react-select__single-value").first();
    const text = (await value.innerText().catch(() => "")).trim();
    if (!text) return;

    if (text !== expectedLabel) {
      throw new Error(
        `Тип вопроса не совпал. Ожидали "${expectedLabel}", на странице "${text}".`,
      );
    }
  }

  async _fillListOptions(root, options) {
    await this._ensureQuestionInEditMode(root);

    const optionInputsByRole = () =>
      root.getByRole("textbox", { name: /введите текст ответа/i });

    const optionInputsFallback = () =>
      root.locator(
        'input[placeholder*="Введите текст ответа"], textarea[placeholder*="Введите текст ответа"], input[aria-label*="Введите текст ответа"], textarea[aria-label*="Введите текст ответа"]',
      );

    let optionInputs = optionInputsByRole();
    if ((await optionInputs.count().catch(() => 0)) === 0) {
      optionInputs = optionInputsFallback();
    }

    await optionInputs
      .first()
      .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

    const addBtn = root
      .getByRole("button", { name: /добавить вариант/i })
      .first();

    for (let i = 0; i < options.length; i++) {
      let count = await optionInputs.count();

      while (count <= i) {
        const previousCount = count;

        if (await addBtn.isVisible().catch(() => false)) {
          await addBtn.click();
        } else {
          const last = optionInputs.last();
          await last.click();
          await this.page.keyboard.press("Enter").catch(() => {});
        }

        // Ждём появления нового поля ввода (retry-цикл — ЛЕГИТИМНОЕ использование waitForTimeout)
        await this.page.waitForTimeout(TIMEOUTS.TINY);

        optionInputs = optionInputsByRole();
        if ((await optionInputs.count().catch(() => 0)) === 0) {
          optionInputs = optionInputsFallback();
        }

        count = await optionInputs.count();
      }

      await optionInputs.nth(i).fill(options[i]);
    }
  }

  async _setScaleViewType(root, viewType) {
    // Надёжно: секция "Количество и вид шагов" содержит два combobox-инпута; второй = вид.
    await this._ensureQuestionInEditMode(root);

    const label = root
      .getByText("Количество и вид шагов", { exact: true })
      .first();
    await label.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

    const section = label
      .locator('xpath=ancestor::*[contains(@class,"Section_section")][1]')
      .first();
    await section.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
    await section.scrollIntoViewIfNeeded().catch(() => {});

    const combos = section.locator('input[role="combobox"]');
    await combos
      .first()
      .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

    const viewCombo = combos.nth(1);
    await viewCombo.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

    const control = viewCombo
      .locator(
        'xpath=ancestor::*[contains(@class,"react-select__control") or contains(@class,"Select_control__")][1]',
      )
      .first();
    await control.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

    await control
      .evaluate((el) =>
        el.scrollIntoView({
          block: "center",
          inline: "center",
          behavior: "auto",
        }),
      )
      .catch(() => {});

    await control.click({ timeout: TIMEOUTS.MEDIUM }).catch(async () => {
      await control.click({ force: true, timeout: TIMEOUTS.MEDIUM });
    });

    const listbox = this.page
      .getByRole("listbox")
      .filter({
        has: this.page.getByRole("option", { name: viewType, exact: true }),
      })
      .first();

    await listbox.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

    const opt = listbox
      .getByRole("option", { name: viewType, exact: true })
      .first();
    await opt.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

    await opt.click({ timeout: TIMEOUTS.MEDIUM }).catch(async () => {
      await opt.click({ force: true, timeout: TIMEOUTS.MEDIUM });
    });
  }

  async _confirmQuestion(root) {
    // Нажимаем кнопку "галочка" в футере текущей карточки вопроса.
    await this._ensureQuestionInEditMode(root);

    // Стабильнее через contains(), чтобы не зависеть от хеша CSS-модуля
    const footerButtons = root
      .locator('button[class*="Question_footer-button"]')
      .filter({
        hasNot: root.locator("[disabled]"),
      });

    // Пытаемся найти по иконке ok
    let okBtn = footerButtons
      .filter({
        has: footerButtons.locator(
          'use[href*="#icon-ok"], use[xlink\\:href*="#icon-ok"]',
        ),
      })
      .first();

    if ((await okBtn.count().catch(() => 0)) === 0) {
      // Фолбэк: в футере обычно 3 кнопки: trash/copy/ok
      okBtn = footerButtons.nth(2);
    }

    if (!(await okBtn.isVisible().catch(() => false))) return;

    await okBtn.scrollIntoViewIfNeeded().catch(() => {});
    await okBtn
      .evaluate((el) =>
        el.scrollIntoView({
          block: "center",
          inline: "center",
          behavior: "auto",
        }),
      )
      .catch(() => {});

    await okBtn.click({ timeout: TIMEOUTS.MEDIUM }).catch(async () => {
      await okBtn.click({ force: true, timeout: TIMEOUTS.MEDIUM });
    });
  }

  _escapeRegExp(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
}
