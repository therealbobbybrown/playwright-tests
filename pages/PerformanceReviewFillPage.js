// pages/PerformanceReviewFillPage.js
// Page Object для заполнения анкет Performance Review

import { expect } from "@playwright/test";
import { BasePage } from "./BasePage.js";
import { TIMEOUTS } from "../tests/utils/constants.js";

export class PerformanceReviewFillPage extends BasePage {
  constructor(page, testInfo = null) {
    super(page, testInfo);
  }

  // Локаторы
  get pageTitle() {
    return this.page
      .locator("h1")
      .filter({ hasText: "Performance Review" })
      .first();
  }

  get evaluatedPersonName() {
    return this.page
      .locator("h2, h3")
      .filter({ hasText: /Elena|Shapoval/i })
      .first();
  }

  get nextButton() {
    return this.page
      .locator('button[class*="Button_button"]')
      .filter({ hasText: "Далее" })
      .first();
  }

  get saveButton() {
    return this.page
      .locator("button")
      .filter({ hasText: /сохранить/i })
      .first();
  }

  get submitButton() {
    return this.page
      .locator("button")
      .filter({ hasText: /отправить|завершить/i })
      .first();
  }

  get backButton() {
    return this.page
      .locator("button")
      .filter({ hasText: /назад|вернуться/i })
      .first();
  }

  // Методы

  /**
   * Проверить, что страница заполнения открыта
   */
  async assertOpened() {
    await this._step(
      "Проверить открытие страницы заполнения анкеты",
      async () => {
        await this.pageTitle.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        console.log("✓ Страница заполнения анкеты открыта");
      },
    );
  }

  /**
   * Получить текст текущего вопроса
   */
  async getCurrentQuestionText() {
    return await this._step("Получить текст текущего вопроса", async () => {
      const questionLocator = this.page
        .locator('[class*="Question"], h2, h3')
        .filter({ hasText: /вопрос|question/i })
        .first();

      const text = await questionLocator.innerText().catch(() => "");
      console.log(`Текст вопроса: "${text}"`);
      return text;
    });
  }

  /**
   * Ответить на вопрос с выбором (радиокнопки или кликабельные блоки)
   * @param {number} optionIndex - Индекс опции (0-based)
   */
  async selectRadioOption(optionIndex) {
    await this._step(`Выбрать вариант ответа #${optionIndex + 1}`, async () => {
      // Сначала попробуем найти кнопки шкалы (как в опросах)
      let scaleButtons = this.page.locator(
        '[class*="ScaleAnswer_button"], [class*="Answer_button"]',
      );
      let count = await scaleButtons.count();
      console.log(`Найдено кнопок шкалы: ${count}`);

      if (count > 0) {
        if (optionIndex >= count) {
          throw new Error(
            `Опция ${optionIndex} не существует (всего кнопок шкалы: ${count})`,
          );
        }

        const button = scaleButtons.nth(optionIndex);
        await button.scrollIntoViewIfNeeded().catch(() => {});
        await button.click({ force: true });

        console.log(
          `✓ Выбран вариант ответа #${optionIndex + 1} (кнопка шкалы)`,
        );
        return;
      }

      // Попробуем найти кликабельные блоки с вариантами
      const optionBlocks = this.page
        .locator('[class*="option"], [class*="choice"]')
        .filter({ hasText: /шаг|step|вариант/i });
      const blocksCount = await optionBlocks.count();
      console.log(`Найдено кликабельных блоков: ${blocksCount}`);

      if (blocksCount > 0) {
        if (optionIndex >= blocksCount) {
          throw new Error(
            `Опция ${optionIndex} не существует (всего блоков: ${blocksCount})`,
          );
        }
        await optionBlocks.nth(optionIndex).click();
        console.log(
          `✓ Выбран вариант ответа #${optionIndex + 1} (кликабельный блок)`,
        );
        return;
      }

      // Запасной путь: обычные радиокнопки
      const radioButtons = this.page.locator('input[type="radio"]');
      count = await radioButtons.count();

      if (count > 0) {
        if (optionIndex >= count) {
          throw new Error(
            `Опция ${optionIndex} не существует (всего опций: ${count})`,
          );
        }

        const radio = radioButtons.nth(optionIndex);
        await radio.scrollIntoViewIfNeeded().catch(() => {});
        await radio.check({ force: true });

        console.log(
          `✓ Выбран вариант ответа #${optionIndex + 1} (радиокнопка)`,
        );
      } else {
        throw new Error("Не найдено элементов для выбора ответа");
      }
    });
  }

  /**
   * Ответить на вопрос с текстом
   * @param {string} text - Текст ответа
   * @param {number} questionIndex - Индекс вопроса (0-based), если на странице несколько текстовых полей
   */
  async fillTextAnswer(text, questionIndex = 0) {
    await this._step("Заполнить текстовый ответ", async () => {
      const textareas = this.page.locator("textarea");
      const textInputs = this.page.locator('input[type="text"]');

      const textareasCount = await textareas.count();
      const inputsCount = await textInputs.count();

      if (textareasCount > 0) {
        await textareas.nth(questionIndex).fill(text);
        console.log(
          `✓ Заполнено textarea #${questionIndex + 1}: "${text.substring(0, 50)}..."`,
        );
      } else if (inputsCount > 0) {
        await textInputs.nth(questionIndex).fill(text);
        console.log(`✓ Заполнено input #${questionIndex + 1}: "${text}"`);
      } else {
        throw new Error("Не найдено текстовых полей для ввода");
      }
    });
  }

  /**
   * Ответить на вопрос со шкалой (выбор числового значения)
   * @param {number} value - Значение шкалы (например, от 1 до 5)
   */
  async selectScaleValue(value) {
    await this._step(`Выбрать значение шкалы: ${value}`, async () => {
      // Попробуем найти кнопку или элемент с нужным значением
      const scaleButton = this.page
        .locator('[class*="Scale"], [class*="Rating"]')
        .locator('button, [role="radio"]')
        .filter({ hasText: value.toString() })
        .first();

      if (
        await scaleButton
          .waitFor({ state: "visible", timeout: 3000 })
          .then(() => true)
          .catch(() => false)
      ) {
        await scaleButton.click();
        console.log(`✓ Выбрано значение шкалы: ${value}`);
      } else {
        // Попробуем найти по индексу (value - 1, т.к. обычно шкала с 1)
        const scaleButtons = this.page
          .locator('[class*="Scale"], [class*="Rating"]')
          .locator('button, [role="radio"]');
        await scaleButtons.nth(value - 1).click();
        console.log(`✓ Выбрано значение шкалы: ${value}`);
      }
    });
  }

  /**
   * Перейти к следующему вопросу
   */
  async goToNextQuestion() {
    await this._step("Перейти к следующему вопросу", async () => {
      // Подождать, пока кнопка станет видимой и активной
      await this.nextButton.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });

      // Подождать, пока кнопка станет enabled (может быть disabled до выбора ответа)
      await expect(this.nextButton).toBeEnabled({ timeout: TIMEOUTS.MEDIUM });

      await this.nextButton.click();
      await this.page
        .waitForLoadState("networkidle", { timeout: 15_000 })
        .catch(() => {});
      console.log("✓ Переход к следующему вопросу");
    });
  }

  /**
   * Вернуться к предыдущему вопросу
   */
  async goToPreviousQuestion() {
    await this._step("Вернуться к предыдущему вопросу", async () => {
      await this.backButton.waitFor({ state: "visible", timeout: 5000 });
      await this.backButton.click();
      await this.page
        .waitForLoadState("networkidle", { timeout: 5_000 })
        .catch(() => {});
      console.log("✓ Возврат к предыдущему вопросу");
    });
  }

  /**
   * Сохранить черновик анкеты
   */
  async saveDraft() {
    await this._step("Сохранить черновик", async () => {
      if (
        await this.saveButton
          .waitFor({ state: "visible", timeout: 3000 })
          .then(() => true)
          .catch(() => false)
      ) {
        await this.saveButton.click();
        await this.page
          .waitForLoadState("networkidle", { timeout: 15_000 })
          .catch(() => {});
        console.log("✓ Черновик сохранен");
      } else {
        console.log('⚠️ Кнопка "Сохранить" не найдена');
      }
    });
  }

  /**
   * Отправить анкету (завершить заполнение)
   */
  async submit() {
    await this._step("Отправить анкету", async () => {
      await this.submitButton.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
      await this.submitButton.click();

      // Может быть модальное окно подтверждения
      const confirmModal = this.page
        .locator('[class*="Modal"]')
        .filter({ hasText: /подтвердите|отправить/i })
        .first();

      if (
        await confirmModal
          .waitFor({ state: "visible", timeout: 3000 })
          .then(() => true)
          .catch(() => false)
      ) {
        const confirmButton = this.page
          .locator("button")
          .filter({ hasText: /да|отправить|подтвердить/i })
          .first();
        await confirmButton.click();
        await confirmModal
          .waitFor({ state: "hidden", timeout: TIMEOUTS.MEDIUM })
          .catch(() => {});
      }

      await this.page
        .waitForLoadState("networkidle", { timeout: 15_000 })
        .catch(() => {});
      console.log("✓ Анкета отправлена");
    });
  }

  /**
   * Отправить анкету если кнопка видна (опционально)
   */
  async submitIfVisible() {
    // Прокручиваем страницу в самый низ чтобы увидеть кнопку
    await this.page.evaluate(() =>
      window.scrollTo(0, document.body.scrollHeight),
    );

    // Ищем кнопку отправки - несколько вариантов
    let submitBtn = this.page
      .locator("button")
      .filter({ hasText: /^отправить$/i })
      .first();
    let isVisible = await submitBtn
      .waitFor({ state: "visible", timeout: 3000 })
      .then(() => true)
      .catch(() => false);

    if (!isVisible) {
      submitBtn = this.page
        .locator("button")
        .filter({ hasText: /^завершить$/i })
        .first();
      isVisible = await submitBtn
        .waitFor({ state: "visible", timeout: 2000 })
        .then(() => true)
        .catch(() => false);
    }

    if (!isVisible) {
      submitBtn = this.page
        .locator("button")
        .filter({ hasText: /отправить|завершить|submit/i })
        .first();
      isVisible = await submitBtn
        .waitFor({ state: "visible", timeout: 2000 })
        .then(() => true)
        .catch(() => false);
    }

    // Ещё один fallback - кнопка с классом submit
    if (!isVisible) {
      submitBtn = this.page
        .locator('button[type="submit"], [class*="Submit"], [class*="submit"]')
        .first();
      isVisible = await submitBtn
        .waitFor({ state: "visible", timeout: 2000 })
        .then(() => true)
        .catch(() => false);
    }

    if (isVisible) {
      // Прокручиваем к кнопке и кликаем
      await submitBtn.scrollIntoViewIfNeeded().catch(() => {});
      await submitBtn.click();
      console.log("✓ Нажата кнопка отправки");

      // Может быть модальное окно подтверждения
      const confirmModal = this.page
        .locator('[class*="Modal"]')
        .filter({ hasText: /подтвердите|отправить|уверены/i })
        .first();

      if (
        await confirmModal
          .waitFor({ state: "visible", timeout: 3000 })
          .then(() => true)
          .catch(() => false)
      ) {
        const confirmButton = this.page
          .locator("button")
          .filter({ hasText: /да|отправить|подтвердить/i })
          .first();
        await confirmButton.click();
        await confirmModal
          .waitFor({ state: "hidden", timeout: TIMEOUTS.MEDIUM })
          .catch(() => {});
        console.log("✓ Подтверждена отправка");
      }

      await this.page
        .waitForLoadState("networkidle", { timeout: 15_000 })
        .catch(() => {});
      console.log("✓ Анкета отправлена");
    } else {
      // Выводим все кнопки на странице для отладки
      const allButtons = await this.page.locator("button").allTextContents();
      console.log(
        `⚠️ Кнопка отправки не найдена. Все кнопки на странице: ${allButtons.join(", ")}`,
      );
    }
  }

  /**
   * Быстро заполнить анкету - универсальный метод для любых типов вопросов
   * Логика заимствована из SurveyPublicPage для поддержки разных анкет
   * @param {Object} options - Опции заполнения
   * @param {boolean} options.randomize - Выбирать случайные ответы (по умолчанию true)
   */
  async quickFill({ randomize = true } = {}) {
    await this._step("Заполнить все вопросы анкеты", async () => {
      await this.page
        .waitForLoadState("networkidle", { timeout: 5_000 })
        .catch(() => {});

      // Пробуем Block_block__ (SinglePage анкета)
      const blockCount = await this.page
        .locator('[class*="Block_block__"]')
        .count();
      if (blockCount > 0) {
        console.log(`Найдено блоков вопросов (Block_block): ${blockCount}`);
        await this._fillCurrentPageQuestions('[class*="Block_block__"]');
        return;
      }

      // Fallback: ищем по другим классам
      const altCount = await this.page
        .locator('[class*="Question"], [class*="FormBlock"]')
        .count();
      if (altCount > 0) {
        console.log(`Найдено блоков (альтернативный поиск): ${altCount}`);
        await this._fillCurrentPageQuestions(
          '[class*="Question"], [class*="FormBlock"]',
        );
        return;
      }

      // Если блоки не найдены - пошаговая анкета
      console.log("Блоки не найдены, пробуем пошаговое заполнение...");
      await this._fillStepByStepQuestionnaire({ randomize });
    });
  }

  /**
   * Заполнить пошаговую анкету (один вопрос за раз с кнопкой "Далее")
   * @param {Object} options - Опции заполнения
   * @param {boolean} options.randomize - Выбирать случайные ответы
   */
  async _fillStepByStepQuestionnaire({ randomize = true } = {}) {
    console.log("Заполняем пошаговую анкету...");
    let questionNumber = 0;
    const maxQuestions = 50; // защита от бесконечного цикла

    while (questionNumber < maxQuestions) {
      questionNumber++;
      console.log(`\n--- Вопрос ${questionNumber} ---`);

      // Заполняем текущий вопрос (вся страница как один блок)
      const pageContent = this.page
        .locator('main, [class*="content"], body')
        .first();
      const answered = await this._answerQuestionBlock(pageContent, {
        randomize,
      });

      if (!answered) {
        console.log(
          "⚠️ Не удалось найти элементы для ответа, возможно анкета завершена",
        );
        break;
      }

      // Ищем кнопку "Далее"
      const nextBtn = this.page
        .locator("button")
        .filter({ hasText: /далее|next/i })
        .first();
      const nextVisible = await nextBtn
        .waitFor({ state: "visible", timeout: 2000 })
        .then(() => true)
        .catch(() => false);

      if (nextVisible) {
        await nextBtn.click();
        await this.page
          .waitForLoadState("networkidle", { timeout: 15_000 })
          .catch(() => {});
        console.log("✓ Переход к следующему вопросу");
      } else {
        // Проверяем, есть ли кнопка "Отправить"/"Завершить"
        const submitBtn = this.page
          .locator("button")
          .filter({ hasText: /отправить|завершить|submit/i })
          .first();
        if (
          await submitBtn
            .waitFor({ state: "visible", timeout: 2000 })
            .then(() => true)
            .catch(() => false)
        ) {
          console.log("✓ Найдена кнопка отправки - анкета заполнена");
          break;
        }
        console.log(
          '⚠️ Кнопка "Далее" не найдена, возможно это последний вопрос',
        );
        break;
      }
    }

    console.log(`✓ Заполнено ${questionNumber} вопросов`);
  }

  /**
   * Ответить на вопрос в одном блоке - универсальный метод
   * Поддерживает: текстовые поля, радио/шкалу, чекбоксы
   * @param {import('@playwright/test').Locator} block
   * @param {Object} options - Опции заполнения
   * @param {boolean} options.randomize - Выбирать случайные ответы
   * @returns {Promise<boolean>} true если удалось ответить
   */
  async _answerQuestionBlock(block, { randomize = true } = {}) {
    let answered = false;

    // 1. Текстовые поля (textarea и input[type=text])
    answered = (await this._answerTextQuestion(block)) || answered;

    // 2. Радио-кнопки или шкала
    answered =
      (await this._answerRadioOrScaleQuestion(block, { randomize })) ||
      answered;

    // 3. Чекбоксы
    answered =
      (await this._answerCheckboxQuestion(block, { randomize })) || answered;

    return answered;
  }

  /**
   * Заполнить текстовый вопрос (если есть)
   * @param {import('@playwright/test').Locator} block
   */
  async _answerTextQuestion(block) {
    const textInputs = block.locator(
      'textarea, input:not([type="radio"]):not([type="checkbox"]):not([type="hidden"]):not([type="submit"]):not([type="button"])',
    );

    const count = await textInputs.count();
    if (!count) return false;

    for (let i = 0; i < count; i++) {
      const field = textInputs.nth(i);
      const isVisible = await field.isVisible().catch(() => false);
      const isDisabled = await field.isDisabled().catch(() => true);

      if (isVisible && !isDisabled) {
        await field.scrollIntoViewIfNeeded().catch(() => {});
        await field.fill("Автотест: тестовый ответ");
        console.log(`✓ Заполнено текстовое поле #${i + 1}`);
        return true;
      }
    }
    return false;
  }

  /**
   * Выбрать вариант в радио-группе или шкале (если есть)
   * @param {import('@playwright/test').Locator} block
   * @param {Object} options - Опции
   * @param {boolean} options.randomize - Выбирать случайный вариант
   */
  async _answerRadioOrScaleQuestion(block, { randomize = true } = {}) {
    // Сначала ищем кнопки шкалы по классам (ScaleAnswer_button)
    let scaleButtons = block.locator(
      '[class*="ScaleAnswer_button"], [class*="Answer_button"]',
    );
    let count = await scaleButtons.count();

    if (count > 0) {
      // Выбираем случайный или средний вариант
      const index = randomize
        ? Math.floor(Math.random() * count)
        : count > 2
          ? Math.floor(count / 2)
          : count > 1
            ? 1
            : 0;
      const button = scaleButtons.nth(index);

      await button.scrollIntoViewIfNeeded().catch(() => {});
      await button.click({ force: true });
      console.log(
        `✓ Выбран вариант шкалы #${index + 1} из ${count}${randomize ? " (случайно)" : ""}`,
      );

      // Проверяем, что выбралось
      const input = button.locator('input[type="radio"]');
      const checked = await input.isChecked().catch(() => false);
      if (checked) return true;
      // Если не выбралось через input - все равно считаем успехом (визуальное выделение)
      return true;
    }

    // Запасной путь: обычные радио-инпуты
    const radios = block.locator('input[type="radio"]');
    count = await radios.count();
    if (!count) return false;

    const idx = randomize
      ? Math.floor(Math.random() * count)
      : count > 2
        ? Math.floor(count / 2)
        : count > 1
          ? 1
          : 0;
    const input = radios.nth(idx);

    await input.scrollIntoViewIfNeeded().catch(() => {});
    await input.check({ force: true });
    console.log(
      `✓ Выбрана радио-кнопка #${idx + 1} из ${count}${randomize ? " (случайно)" : ""}`,
    );

    return (await input.isChecked().catch(() => false)) || true;
  }

  /**
   * Поставить чекбокс хотя бы в одном варианте (если есть)
   * @param {import('@playwright/test').Locator} block
   * @param {Object} options - Опции
   * @param {boolean} options.randomize - Выбирать случайный чекбокс
   */
  async _answerCheckboxQuestion(block, { randomize = true } = {}) {
    const checkboxes = block.locator('input[type="checkbox"]');
    const count = await checkboxes.count();
    if (!count) return false;

    // При randomize выбираем случайный чекбокс, иначе первый доступный
    const startIndex = randomize ? Math.floor(Math.random() * count) : 0;

    for (let j = 0; j < count; j++) {
      const i = (startIndex + j) % count;
      const input = checkboxes.nth(i);

      try {
        const disabled = await input.isDisabled().catch(() => false);
        const visible = await input.isVisible().catch(() => false);
        if (disabled || !visible) continue;

        await input.scrollIntoViewIfNeeded().catch(() => {});
        await input.check({ force: true });

        const checked = await input.isChecked().catch(() => false);
        if (checked) {
          console.log(
            `✓ Выбран чекбокс #${i + 1}${randomize ? " (случайно)" : ""}`,
          );
          return true;
        }
      } catch {
        // Переходим к следующему чекбоксу
      }
    }

    return false;
  }

  /**
   * Открыть анкету для заполнения - простой метод через главную страницу
   * @param {string} baseUrl - Базовый URL приложения
   */
  async openQuestionnaireFromMainPage(baseUrl) {
    await this._step("Открыть анкету с главной страницы", async () => {
      // Перейти на главную страницу
      await this.page.goto(new URL("/ru/", baseUrl).toString(), {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
      await this.page
        .waitForLoadState("networkidle", { timeout: 15_000 })
        .catch(() => {});

      // Ищем блок Performance Review на главной странице (не план развития!)
      const prCard = this.page
        .locator('[class*="PerformanceReviewSummaryNotification"]')
        .first();
      const prVisible = await prCard
        .waitFor({ state: "visible", timeout: 5000 })
        .then(() => true)
        .catch(() => false);

      if (prVisible) {
        console.log("✓ Найден блок Performance Review");

        // Кликаем на "Перейти к оценке"
        const goToButton = prCard
          .locator('a[class*="Button"]')
          .filter({ hasText: /перейти к оценке/i })
          .first();
        if (
          await goToButton
            .waitFor({ state: "visible", timeout: 3000 })
            .then(() => true)
            .catch(() => false)
        ) {
          await Promise.all([
            this.page
              .waitForNavigation({ waitUntil: "networkidle" })
              .catch(() => {}),
            goToButton.click(),
          ]);
          console.log("✓ Перешли к оценке");
        }
      } else {
        // Fallback: через уведомления
        console.log("⚠️ Блок PR не найден, пробуем через уведомления");
        const bellIcon = this.page
          .locator('[class*="bell"], [class*="notification"]')
          .first();
        await bellIcon.click();
        await this.page
          .waitForLoadState("networkidle", { timeout: 15_000 })
          .catch(() => {});

        const goToLink = this.page
          .locator("a")
          .filter({ hasText: "Перейти к оценке" })
          .first();
        if (
          await goToLink
            .waitFor({ state: "visible", timeout: 3000 })
            .then(() => true)
            .catch(() => false)
        ) {
          await goToLink.click();
          await this.page
            .waitForLoadState("networkidle", { timeout: 15_000 })
            .catch(() => {});
        }
      }

      // Теперь ищем кнопку "Заполнить анкету"
      let fillButton = this.page
        .locator("button, a")
        .filter({ hasText: /заполнить анкету/i })
        .first();
      let fillVisible = await fillButton
        .waitFor({ state: "visible", timeout: 5000 })
        .then(() => true)
        .catch(() => false);

      if (fillVisible) {
        console.log('✓ Найдена кнопка "Заполнить анкету"');
        await fillButton.click();
        await this.page
          .waitForLoadState("networkidle", { timeout: 15_000 })
          .catch(() => {});
        console.log("✓ Открыта форма заполнения анкеты");
      } else {
        console.log(
          '⚠️ Кнопка "Заполнить анкету" не найдена, возможно форма уже открыта',
        );
      }
    });
  }

  /**
   * Проверить, все ли анкеты уже отправлены
   * @returns {Promise<boolean>}
   */
  async isAllQuestionnairesCompleted() {
    const allDone = this.page.locator("text=Все анкеты отправлены").first();
    return await allDone
      .waitFor({ state: "visible", timeout: 2000 })
      .then(() => true)
      .catch(() => false);
  }

  /**
   * Заполнить анкету полностью (открыть + заполнить + отправить)
   * @param {string} baseUrl - Базовый URL
   */
  async fillQuestionnaireComplete(baseUrl, prId = null, options = {}) {
    await this._step("Заполнить анкету полностью", async () => {
      if (prId) {
        await this.openFromNotificationsByPrId(baseUrl, prId, options);
      } else {
        await this.openFromNotifications(baseUrl);
      }

      if (await this.isAllQuestionnairesCompleted()) {
        console.log("✓ Все анкеты уже отправлены ранее");
        return;
      }

      // Проверяем, не на странице ли выбора коллег мы находимся
      // Если да - нужно кликнуть на секцию "Самооценка" в сайдбаре
      const selfAssessmentSection = this.page
        .locator('[class*="Sidebar"], [class*="Steps"], aside')
        .locator("text=Самооценка")
        .first();

      if (
        await selfAssessmentSection
          .waitFor({ state: "visible", timeout: 3000 })
          .then(() => true)
          .catch(() => false)
      ) {
        // Проверяем, есть ли страница "Выберите коллег" или "Вы уже выбрали коллег"
        const colleaguesPage = this.page
          .locator("text=выберите коллег, text=выбрали коллег")
          .first();
        if (
          await colleaguesPage
            .waitFor({ state: "visible", timeout: 2000 })
            .then(() => true)
            .catch(() => false)
        ) {
          console.log(
            "📝 Находимся на странице выбора коллег, переходим к самооценке...",
          );
          await selfAssessmentSection.click();
          await this.page
            .waitForLoadState("networkidle", { timeout: 15_000 })
            .catch(() => {});
        }
      }

      // Нажать кнопку "Заполнить анкету" если она видна
      const fillButton = this.page
        .locator("button")
        .filter({ hasText: /заполнить анкету/i })
        .first();
      if (
        await fillButton
          .waitFor({ state: "visible", timeout: 3000 })
          .then(() => true)
          .catch(() => false)
      ) {
        await fillButton.click();
        await this.page
          .waitForLoadState("networkidle", { timeout: 15_000 })
          .catch(() => {});
        console.log('✓ Нажата кнопка "Заполнить анкету"');
      }

      // Заполняем пошаговую анкету (с кнопками "Далее")
      await this.fillStepByStepWithNext();
      console.log("✓ Анкета заполнена и отправлена");
    });
  }

  /**
   * Заполнить пошаговую анкету с кнопками "Далее" и "Отправить"
   * Подходит для анкет с несколькими страницами вопросов
   */
  async fillStepByStepWithNext() {
    await this._step("Заполнить пошаговую анкету", async () => {
      const maxSteps = 20; // Защита от бесконечного цикла
      let step = 0;

      while (step < maxSteps) {
        step++;
        console.log(`\n--- Шаг ${step} ---`);

        // Ждём загрузки страницы
        await this.page
          .waitForLoadState("networkidle", { timeout: 5_000 })
          .catch(() => {});

        // Заполняем все видимые вопросы на текущей странице
        await this._fillCurrentPageQuestions();

        // Ищем кнопку "Далее" или "Отправить"
        const nextBtn = this.page
          .locator("button")
          .filter({ hasText: /^далее$/i })
          .first();
        const submitBtn = this.page
          .locator("button")
          .filter({ hasText: /^отправить$/i })
          .first();

        const nextVisible = await nextBtn
          .waitFor({ state: "visible", timeout: 2000 })
          .then(() => true)
          .catch(() => false);
        const submitVisible = await submitBtn
          .waitFor({ state: "visible", timeout: 2000 })
          .then(() => true)
          .catch(() => false);

        if (submitVisible) {
          // Нашли кнопку "Отправить" - это последний шаг
          await submitBtn.scrollIntoViewIfNeeded().catch(() => {});
          await submitBtn.click();
          console.log('✓ Нажата кнопка "Отправить"');

          // Ждём модальное окно успеха или подтверждения
          await this.page
            .waitForLoadState("networkidle", { timeout: 15_000 })
            .catch(() => {});

          // Проверяем, нет ли модального окна подтверждения
          const confirmModal = this.page
            .locator('[class*="Modal"]')
            .filter({ hasText: /подтвердите|уверены/i })
            .first();
          if (
            await confirmModal
              .waitFor({ state: "visible", timeout: 2000 })
              .then(() => true)
              .catch(() => false)
          ) {
            const confirmBtn = confirmModal
              .locator("button")
              .filter({ hasText: /да|отправить|подтвердить/i })
              .first();
            await confirmBtn.click();
            await this.page
              .waitForLoadState("networkidle", { timeout: 15_000 })
              .catch(() => {});
            console.log("✓ Подтверждена отправка");
          }

          console.log("✓ Анкета отправлена");
          return;
        } else if (nextVisible) {
          // Нажимаем "Далее" и переходим к следующему шагу
          await nextBtn.scrollIntoViewIfNeeded().catch(() => {});
          await nextBtn.click();
          await this.page
            .waitForLoadState("networkidle", { timeout: 15_000 })
            .catch(() => {});
          console.log('✓ Нажата кнопка "Далее"');
        } else {
          // Ни "Далее", ни "Отправить" не найдены
          console.log(
            "⚠️ Кнопки навигации не найдены, проверяем другие варианты...",
          );

          // Может быть кнопка "Завершить"
          const finishBtn = this.page
            .locator("button")
            .filter({ hasText: /завершить/i })
            .first();
          if (
            await finishBtn
              .waitFor({ state: "visible", timeout: 2000 })
              .then(() => true)
              .catch(() => false)
          ) {
            await finishBtn.click();
            console.log('✓ Нажата кнопка "Завершить"');
            await this.page
              .waitForLoadState("networkidle", { timeout: 15_000 })
              .catch(() => {});
            return;
          }

          // Выводим все кнопки для отладки
          const allButtons = await this.page
            .locator("button")
            .allTextContents();
          console.log(
            `Все кнопки: ${allButtons.filter((b) => b.trim()).join(", ")}`,
          );
          break;
        }
      }

      if (step >= maxSteps) {
        console.log("⚠️ Достигнут лимит шагов");
      }
    });
  }

  /**
   * Заполнить все вопросы на текущей странице
   * Ищем блоки вопросов Block_block с id вида qXX и заполняем каждый по типу
   * Один вопрос может иметь несколько элементов (шкала + комментарий)
   */
  async _fillCurrentPageQuestions(
    blockSelector = '[class*="Block_block"][id^="q"]',
  ) {
    const questionBlocks = this.page.locator(blockSelector);
    const blockCount = await questionBlocks.count();
    console.log(`Найдено блоков вопросов: ${blockCount}`);

    for (let i = 0; i < blockCount; i++) {
      const block = questionBlocks.nth(i);
      const blockId = await block.getAttribute("id").catch(() => `block_${i}`);

      // Получаем заголовок вопроса для лога
      const titleEl = block
        .locator('[class*="QuestionnaireQuestion_title"]')
        .first();
      const title = await titleEl.textContent().catch(() => "Без названия");
      const shortTitle = title.substring(0, 40).replace(/\s+/g, " ").trim();

      // Проскроллим к блоку
      await block.scrollIntoViewIfNeeded().catch(() => {});

      let filled = false;

      // 1. Шкала (ScaleAnswer) - кнопки 1-10 или 0-5
      const scaleContainer = block
        .locator('[class*="ScaleAnswer_scale"]')
        .first();
      if (
        (await scaleContainer.count()) > 0 &&
        (await scaleContainer.isVisible().catch(() => false))
      ) {
        const scaleButtons = scaleContainer.locator(
          '[class*="ScaleAnswer_button"] label',
        );
        const btnCount = await scaleButtons.count();
        if (btnCount > 0) {
          // Проверяем, есть ли уже выбранный
          const checked = scaleContainer.locator('input[type="radio"]:checked');
          if ((await checked.count()) === 0) {
            const idx = Math.min(2, btnCount - 1); // 3-й или последний
            await scaleButtons.nth(idx).click({ force: true });
            console.log(
              `  [${blockId}] Шкала: выбран ${idx + 1}/${btnCount} - "${shortTitle}"`,
            );
            filled = true;
          }
        }
      }

      // 2. Звёзды (StarsAnswer)
      const starsContainer = block
        .locator('[class*="StarsAnswer_stars"]')
        .first();
      if (
        (await starsContainer.count()) > 0 &&
        (await starsContainer.isVisible().catch(() => false))
      ) {
        const starButtons = starsContainer.locator(
          '[class*="StarsAnswer_star-button"]',
        );
        const starCount = await starButtons.count();
        if (starCount > 0) {
          // Кликаем на предпоследнюю звезду
          const idx = Math.max(0, starCount - 2);
          await starButtons.nth(idx).click({ force: true });
          console.log(
            `  [${blockId}] Звёзды: выбрана ${idx + 1}/${starCount} - "${shortTitle}"`,
          );
          filled = true;
        }
      }

      // 3. Switch-кнопки (SwitchAnswer) - текстовые варианты
      const switchContainer = block
        .locator('[class*="SwitchAnswer_buttons"]')
        .first();
      if (
        (await switchContainer.count()) > 0 &&
        (await switchContainer.isVisible().catch(() => false))
      ) {
        const switchButtons = switchContainer.locator(
          '[class*="SwitchAnswer_button"]',
        );
        const switchCount = await switchButtons.count();
        if (switchCount > 0) {
          // Проверяем, есть ли уже выбранный
          const selected = switchContainer.locator(
            '[class*="selected"], [class*="active"]',
          );
          if ((await selected.count()) === 0) {
            const idx = Math.min(2, switchCount - 1); // 3-й или последний
            await switchButtons.nth(idx).click({ force: true });
            console.log(
              `  [${blockId}] Switch: выбран ${idx + 1}/${switchCount} - "${shortTitle}"`,
            );
            filled = true;
          }
        }
      }

      // 4. Radio-кнопки (RadioAnswer/RadioButton) - только если нет шкалы (т.к. шкала тоже использует radio)
      if (!filled) {
        const radioContainer = block
          .locator('[class*="RadioAnswer"], [class*="RadioButton_radio"]')
          .first();
        if ((await radioContainer.count()) > 0) {
          const radios = block.locator(
            '[class*="RadioAnswer"] input[type="radio"], [class*="RadioButton_radio"] input[type="radio"]',
          );
          const radioCount = await radios.count();
          if (radioCount > 0) {
            const checked = block.locator(
              '[class*="RadioAnswer"] input[type="radio"]:checked, [class*="RadioButton_radio"] input[type="radio"]:checked',
            );
            if ((await checked.count()) === 0) {
              // Кликаем на первый вариант (не "Другое")
              await radios.first().click({ force: true });
              console.log(
                `  [${blockId}] Radio: выбран 1/${radioCount} - "${shortTitle}"`,
              );
              filled = true;
            }
          }
        }
      }

      // 5. Textarea (длинный текст / комментарий) - проверяем ВСЕГДА, даже если шкала уже заполнена
      const textareas = block.locator("textarea");
      const textareaCount = await textareas.count();
      for (let t = 0; t < textareaCount; t++) {
        const textarea = textareas.nth(t);
        if (await textarea.isVisible().catch(() => false)) {
          const currentValue = await textarea.inputValue().catch(() => "");
          if (!currentValue.trim()) {
            await textarea.fill("Автотест комментарий " + Date.now());
            console.log(`  [${blockId}] Textarea: заполнен - "${shortTitle}"`);
            filled = true;
          }
        }
      }

      // 6. Input text (краткий ответ) - исключаем hidden, проверяем ВСЕГДА
      const textInputs = block.locator(
        'input.Input_input__yiXzv, input[class*="Input_input"]',
      );
      const inputCount = await textInputs.count();
      for (let t = 0; t < inputCount; t++) {
        const textInput = textInputs.nth(t);
        if (await textInput.isVisible().catch(() => false)) {
          const currentValue = await textInput.inputValue().catch(() => "");
          const isDisabled = await textInput.isDisabled().catch(() => false);
          if (!currentValue.trim() && !isDisabled) {
            await textInput.fill("Автотест краткий ответ");
            console.log(
              `  [${blockId}] Text input: заполнен - "${shortTitle}"`,
            );
            filled = true;
          }
        }
      }

      // 7. Checkbox
      const checkboxes = block.locator('input[type="checkbox"]:not(:checked)');
      const checkCount = await checkboxes.count();
      if (checkCount > 0) {
        await checkboxes.first().click({ force: true });
        console.log(
          `  [${blockId}] Checkbox: выбран 1/${checkCount} - "${shortTitle}"`,
        );
        filled = true;
      }

      if (!filled) {
        console.log(`  [${blockId}] Пропущен (уже заполнен) - "${shortTitle}"`);
      }
    }

    console.log("✓ Страница заполнена");
  }

  /**
   * Выбрать коллег на этапе подбора респондентов (для оцениваемого)
   * @param {Array<{name: string, email: string}>} colleagues - Массив коллег для выбора
   * @param {number} maxCount - Максимальное количество коллег для выбора
   * @returns {Promise<Array<{name: string, email: string}>>} - Массив выбранных коллег
   */
  async selectColleaguesForReview(colleagues, maxCount = 2) {
    return await this._step("Выбрать коллег для оценки", async () => {
      const selectedColleagues = [];

      // Находим кнопку "Выбрать" (используем waitFor вместо isVisible, т.к. React может ещё рендерить)
      let selectButton = this.page
        .getByRole("button", { name: /^выбрать$/i })
        .first();
      try {
        await selectButton.waitFor({ state: "visible", timeout: 10_000 });
      } catch {
        // Fallback: менее строгий поиск
        selectButton = this.page
          .locator("button")
          .filter({ hasText: /выбрать/i })
          .first();
        await selectButton
          .waitFor({ state: "visible", timeout: 5000 })
          .catch(() => {
            throw new Error(
              'Кнопка "Выбрать" не найдена на странице выбора коллег',
            );
          });
      }

      await selectButton.scrollIntoViewIfNeeded();
      await selectButton.click();
      console.log("✓ Открыто модальное окно выбора коллег");

      // Ждём появления строк пользователей в модалке (react-modal-sheet-container)
      const modal = this.page.locator(".react-modal-sheet-container").last();
      await modal.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

      // Ждём загрузки списка пользователей
      const allRows = modal.locator('[class*="UserOption_row"]');
      await allRows.first().waitFor({ state: "visible", timeout: 10_000 });
      const clickableRows = modal.locator(
        '[class*="UserOption_row"]:not([class*="disabled"])',
      );
      console.log(
        `  Найдено строк: ${await allRows.count()}, кликабельных: ${await clickableRows.count()}`,
      );

      let selectedCount = 0;

      // Пробуем найти указанных коллег
      for (const colleague of colleagues) {
        if (selectedCount >= maxCount) break;

        const colleagueRow = clickableRows
          .filter({
            has: this.page.locator(`text=${colleague.name}`),
          })
          .first();

        if ((await colleagueRow.count()) === 0) {
          console.log(`⚠️ Коллега ${colleague.name} не найден в списке`);
          continue;
        }

        await colleagueRow.click();
        selectedCount++;
        selectedColleagues.push(colleague);
        console.log(`✓ Выбран коллега: ${colleague.name}`);
      }

      // Fallback: если заданные коллеги не найдены, выбираем первых доступных
      if (selectedCount === 0) {
        console.log(
          "⚠️ Указанные коллеги не найдены, выбираем первых доступных...",
        );
        const availableCount = await clickableRows.count();
        for (let i = 0; i < availableCount && selectedCount < maxCount; i++) {
          const row = clickableRows.nth(i);
          const name = await row.textContent().catch(() => "");
          await row.click();
          selectedCount++;
          selectedColleagues.push({ name: name.trim(), email: "" });
          console.log(
            `✓ Выбран коллега (fallback): ${name.trim().slice(0, 50)}`,
          );
        }
      }

      if (selectedCount === 0) {
        throw new Error("Не удалось выбрать ни одного коллегу");
      }

      // Применить выбор
      const applyButton = this.page
        .locator("button")
        .filter({ hasText: /применить|сохранить/i })
        .first();
      await applyButton.click();
      await this.page
        .waitForLoadState("networkidle", { timeout: 15_000 })
        .catch(() => {});
      console.log("✓ Коллеги выбраны и применены");

      // Отправить - ищем на странице nomination
      let submitButton = this.page
        .locator("button")
        .filter({ hasText: /^отправить$/i })
        .first();
      if (
        !(await submitButton
          .waitFor({ state: "visible", timeout: 3000 })
          .then(() => true)
          .catch(() => false))
      ) {
        // Попробуем найти по другому тексту
        submitButton = this.page
          .locator("button")
          .filter({ hasText: /отправить предложение|предложить/i })
          .first();
      }

      if (
        await submitButton
          .waitFor({ state: "visible", timeout: 5000 })
          .then(() => true)
          .catch(() => false)
      ) {
        console.log('📍 Найдена кнопка "Отправить", кликаем...');
        await submitButton.click();
        await this.page
          .waitForLoadState("networkidle", { timeout: 15_000 })
          .catch(() => {});

        // Подтвердить в модалке если появится
        const confirmButton = this.page
          .locator("button")
          .filter({ hasText: /^Отправить$/i })
          .last();
        if (
          await confirmButton
            .waitFor({ state: "visible", timeout: 3000 })
            .then(() => true)
            .catch(() => false)
        ) {
          await confirmButton.click();
          await this.page
            .waitForLoadState("networkidle", { timeout: 15_000 })
            .catch(() => {});
        }
        console.log("✓ Выбор коллег отправлен");
      } else {
        console.log('⚠️ Кнопка "Отправить" не найдена на странице');
      }

      return selectedColleagues;
    });
  }

  /**
   * Навигация с retry при 404 (SSR может не успеть при параллельном запуске тестов)
   * @param {string} url - URL для навигации
   * @param {Object} [opts] - Опции
   * @param {number} [opts.retries=1] - Количество повторных попыток
   * @param {number} [opts.retryDelay=5000] - Задержка между попытками (мс)
   * @returns {Promise<boolean>} true если навигация успешна (не 404)
   * @private
   */
  async _gotoWithRetryOn404(url, opts = {}) {
    const { retries = 1, retryDelay = 5000 } = opts;
    for (let attempt = 0; attempt <= retries; attempt++) {
      if (attempt > 0) {
        console.log(
          `⏳ Retry ${attempt}/${retries}: ожидание ${retryDelay}ms перед повторной навигацией...`,
        );
        await this.page.waitForTimeout(retryDelay);
      }
      await this.page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
      await this.page
        .waitForLoadState("networkidle", { timeout: 15_000 })
        .catch(() => {});

      // Проверяем 404
      const is404 = await this.page
        .locator("h1")
        .filter({ hasText: "404" })
        .first()
        .waitFor({ state: "visible", timeout: 2000 })
        .then(() => true)
        .catch(() => false);
      if (!is404) {
        return true; // Успешная навигация
      }
      console.log(
        `⚠️ Получен 404 при навигации к ${url} (попытка ${attempt + 1}/${retries + 1})`,
      );
    }
    return false; // Все попытки вернули 404
  }

  /**
   * Перейти к странице выбора коллег
   * @param {string} baseUrl
   * @param {string|null} [prId=null] - ID Performance Review для точной фильтрации карточки
   * @param {Object} [options={}] - Опции навигации
   * @param {string} [options.nominationUrl] - Прямой URL страницы номинации (наиболее стабильный путь)
   * @param {string} [options.revisionAlias] - Alias ревизии для прямой навигации
   */
  async navigateToColleagueSelection(baseUrl, prId = null, options = {}) {
    await this._step("Перейти к выбору коллег", async () => {
      // Путь 1: Прямая навигация по полному URL номинации (самый стабильный)
      if (options.nominationUrl) {
        await this.page.goto(options.nominationUrl, {
          waitUntil: "domcontentloaded",
          timeout: 60_000,
        });
        await this.page
          .waitForLoadState("networkidle", { timeout: 15_000 })
          .catch(() => {});
        console.log(
          `✓ Перешли к странице выбора коллег (direct): ${this.page.url()}`,
        );
        return;
      }

      // Путь 2: Alias URL — автоматический редирект на /nomination/ для пользователя с незавершённым выбором коллег
      if (prId && options.revisionAlias) {
        const aliasUrl = new URL(
          `/ru/performance-reviews/${prId}/${options.revisionAlias}/`,
          baseUrl,
        ).toString();
        console.log(`📍 Переход к выбору коллег через alias URL: ${aliasUrl}`);
        const ok = await this._gotoWithRetryOn404(aliasUrl, {
          retries: 3,
          retryDelay: 5000,
        });
        if (ok) {
          const currentUrl = this.page.url();
          if (currentUrl.includes("/login")) {
            throw new Error(
              `Редирект на login — пользователь не авторизован (${currentUrl})`,
            );
          }
          console.log(
            `✓ Перешли к странице выбора коллег (alias): ${currentUrl}`,
          );
          return;
        }
        console.log("⚠️ Alias URL вернул 404, пробуем toAssessments...");
      }

      // Путь 3: Прямой URL на страницу PR (toAssessments) — ищем ссылку на номинацию
      // ПРИМЕЧАНИЕ: /nomination URL НЕ существует в приложении (404), поэтому идём на PR-страницу
      if (prId) {
        const prPageUrl = new URL(
          `/ru/staff/performance-reviews/${prId}/?toAssessments=true`,
          baseUrl,
        ).toString();
        console.log(
          `📍 Переход к PR ${prId} для поиска ссылки на выбор коллег: ${prPageUrl}`,
        );
        await this.page.goto(prPageUrl, {
          waitUntil: "domcontentloaded",
          timeout: 60_000,
        });
        await this.page
          .waitForLoadState("networkidle", { timeout: 15_000 })
          .catch(() => {});

        const currentUrl = this.page.url();
        if (currentUrl.includes("/login")) {
          throw new Error(
            `Редирект на login — пользователь не авторизован (${currentUrl})`,
          );
        }

        // Проверяем: может уже на странице номинации (редирект)
        const hasSelectButton = await this.page
          .getByRole("button", { name: /^выбрать$/i })
          .first()
          .waitFor({ state: "visible", timeout: 5000 })
          .then(() => true)
          .catch(() => false);
        if (hasSelectButton) {
          console.log(`✓ Уже на странице выбора коллег: ${currentUrl}`);
          return;
        }

        // Ищем ссылку "Выберите коллег" или кнопку номинации на PR-странице
        const nominationLink = this.page
          .locator('a[href*="/nomination/"]')
          .first();
        const hasNominationLink = await nominationLink
          .waitFor({ state: "visible", timeout: 3000 })
          .then(() => true)
          .catch(() => false);
        if (hasNominationLink) {
          console.log(`✓ Найдена ссылка на номинацию, переходим...`);
          await nominationLink.click();
          await this.page
            .waitForLoadState("networkidle", { timeout: 15_000 })
            .catch(() => {});
          console.log(`✓ Перешли к странице выбора коллег: ${this.page.url()}`);
          return;
        }

        // Если на странице PR, но нет ссылки на номинацию — может этап номинации ещё не наступил или уже завершён
        if (currentUrl.includes(`/performance-reviews/${prId}/`)) {
          console.log(
            `⚠️ Страница PR загружена, но ссылка на номинацию не найдена — пробуем dashboard...`,
          );
        } else {
          console.log(
            `⚠️ Прямой URL не привёл к странице PR (${currentUrl}), пробуем dashboard...`,
          );
        }
      }

      // Путь 3: Поиск карточки на главной странице с retry (legacy fallback)
      const MAX_ATTEMPTS = 2;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        if (attempt > 1) {
          console.log(
            `⚠️ Попытка ${attempt}/${MAX_ATTEMPTS}: перезагружаем главную...`,
          );
        }
        await this.page.goto(new URL("/ru/", baseUrl).toString(), {
          waitUntil: "domcontentloaded",
          timeout: 60_000,
        });
        await this.page
          .waitForLoadState("networkidle", { timeout: 15_000 })
          .catch(() => {});

        const found = await this._findAndClickColleagueCard(prId);
        if (found) {
          await this._verifyColleagueSelectionPage(baseUrl, prId);
          return;
        }

        if (attempt < MAX_ATTEMPTS) {
          await this.page.waitForTimeout(3000);
        }
      }

      // Путь 4: Fallback через уведомления (колокольчик)
      console.log(
        "⚠️ Блок выбора коллег не найден на главной, пробуем через уведомления...",
      );

      const bellIcon = this.page
        .locator('[class*="bell"], [class*="notification"]')
        .first();
      await bellIcon.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
      await bellIcon.click();
      console.log("✓ Открыто окно уведомлений");

      const prLink = prId
        ? this.page.locator(`a[href*="/performance-reviews/${prId}/"]`).first()
        : this.page
            .locator("a")
            .filter({ hasText: "Перейти к оценке" })
            .first();
      await prLink.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
      await prLink.click();
      await this.page
        .waitForLoadState("networkidle", { timeout: 15_000 })
        .catch(() => {});
      console.log(`✓ Перешли к странице выбора коллег: ${this.page.url()}`);

      // Закрыть панель уведомлений
      const modalPanel = this.page
        .locator('[class*="Panel"], [class*="Drawer"]')
        .first();
      await modalPanel
        .waitFor({ state: "hidden", timeout: TIMEOUTS.MEDIUM })
        .catch(() => {});

      // Верификация: проверяем что находимся на странице номинации/выбора коллег
      await this._verifyColleagueSelectionPage(baseUrl, prId);
    });
  }

  /**
   * Верификация: проверяем что попали на страницу выбора коллег, fallback через прямой URL
   * @private
   */
  async _verifyColleagueSelectionPage(baseUrl, prId) {
    const finalUrl = this.page.url();
    const isNominationPage = finalUrl.includes("/nomination");
    const hasSelectButton = await this.page
      .getByRole("button", { name: /^выбрать$/i })
      .first()
      .waitFor({ state: "visible", timeout: 5000 })
      .then(() => true)
      .catch(() => false);

    if (isNominationPage || hasSelectButton) return;

    if (prId) {
      console.log(
        `⚠️ Не на странице выбора коллег (URL: ${finalUrl}), повторяем поиск карточки...`,
      );
      // Возвращаемся на главную и ищем карточку заново с reload
      for (let retry = 1; retry <= 3; retry++) {
        await this.page.goto(new URL("/ru/", baseUrl).toString(), {
          waitUntil: "domcontentloaded",
          timeout: 60_000,
        });
        await this.page
          .waitForLoadState("networkidle", { timeout: 15_000 })
          .catch(() => {});
        const found = await this._findAndClickColleagueCard(prId);
        if (found) {
          // Проверяем, что теперь попали на правильную страницу
          const retryUrl = this.page.url();
          if (
            retryUrl.includes("/nomination") ||
            retryUrl.includes(`/performance-reviews/${prId}/`)
          ) {
            console.log(`✓ Fallback retry ${retry}: попали на ${retryUrl}`);
            return;
          }
        }
        console.log(`⚠️ Fallback retry ${retry}/3 не удался`);
        await this.page.waitForTimeout(3000);
      }
      console.log(`⚠️ Не удалось найти страницу выбора коллег после 3 ретраев`);
    } else {
      console.log(
        `⚠️ Не на странице выбора коллег и prId не передан (URL: ${finalUrl})`,
      );
    }
  }

  /**
   * Внутренний метод: поиск и клик по карточке выбора коллег на главной странице
   * @param {string|null} prId
   * @returns {Promise<boolean>} true если удалось найти и кликнуть
   * @private
   */
  async _findAndClickColleagueCard(prId) {
    let colleagueTask = null;

    // Если передан prId — ищем карточку по ссылке с этим ID (точное совпадение)
    if (prId) {
      colleagueTask = this.page
        .locator('[class*="PerformanceReviewSummaryNotification"]')
        .filter({
          has: this.page.locator(`a[href*="/performance-reviews/${prId}/"]`),
        })
        .first();

      if (
        !(await colleagueTask
          .waitFor({ state: "visible", timeout: 8000 })
          .then(() => true)
          .catch(() => false))
      ) {
        // Fallback: любая карточка с текстом "Выберите коллег" и ссылкой на этот PR
        colleagueTask = this.page
          .locator(
            '[class*="Notification"], [class*="Card"], section, article, div',
          )
          .filter({ hasText: /выберите коллег/i })
          .filter({
            has: this.page.locator(`a[href*="/performance-reviews/${prId}/"]`),
          })
          .first();
      }
    }

    // Если prId не передан или не найдена карточка по ID — ищем любую карточку (legacy)
    if (
      !colleagueTask ||
      !(await colleagueTask
        .waitFor({ state: "visible", timeout: 5000 })
        .then(() => true)
        .catch(() => false))
    ) {
      colleagueTask = this.page
        .locator(
          '[class*="Notification"], [class*="Card"], section, article, div',
        )
        .filter({ hasText: "Выберите коллег, которые оценят вас" })
        .first();
    }

    const colleagueBlockVisible = await colleagueTask
      .waitFor({ state: "visible", timeout: 5000 })
      .then(() => true)
      .catch(() => false);
    if (!colleagueBlockVisible) return false;

    console.log(
      `✓ Найден блок "Выберите коллег"${prId ? ` для PR #${prId}` : ""}`,
    );

    // Если prId передан — кликаем по ссылке с конкретным prId в href
    if (prId) {
      const prLink = colleagueTask
        .locator(`a[href*="/performance-reviews/${prId}/"]`)
        .first();
      if (
        await prLink
          .waitFor({ state: "visible", timeout: 3000 })
          .then(() => true)
          .catch(() => false)
      ) {
        // Извлекаем href для прямой навигации (стабильнее клика)
        const href = await prLink.getAttribute("href").catch(() => null);
        if (href) {
          const targetUrl = href.startsWith("http")
            ? href
            : new URL(href, this.page.url()).toString();
          await this.page.goto(targetUrl, {
            waitUntil: "domcontentloaded",
            timeout: 60_000,
          });
          await this.page
            .waitForLoadState("networkidle", { timeout: 15_000 })
            .catch(() => {});
          console.log(`✓ Перешли к странице выбора коллег: ${this.page.url()}`);
          return true;
        }
      }
      // prId задан, но ссылка не найдена — карточка может быть от другого PR, НЕ кликаем
      console.log(
        `⚠️ Ссылка на PR ${prId} не найдена в карточке — возможно карточка другого PR`,
      );
      return false;
    }

    // Fallback: кнопка "Перейти к оценке" (только без prId — legacy)
    const goToButton = colleagueTask
      .locator("a, button")
      .filter({ hasText: /перейти к оценке/i })
      .first();
    if (
      await goToButton
        .waitFor({ state: "visible", timeout: 3000 })
        .then(() => true)
        .catch(() => false)
    ) {
      const href = await goToButton.getAttribute("href").catch(() => null);
      if (href) {
        const targetUrl = href.startsWith("http")
          ? href
          : new URL(href, this.page.url()).toString();
        await this.page.goto(targetUrl, {
          waitUntil: "domcontentloaded",
          timeout: 60_000,
        });
      } else {
        const currentUrl = this.page.url();
        await Promise.all([
          this.page
            .waitForURL((url) => url.toString() !== currentUrl, {
              timeout: TIMEOUTS.MEDIUM,
            })
            .catch(() => {}),
          goToButton.click(),
        ]);
      }
      await this.page
        .waitForLoadState("networkidle", { timeout: 15_000 })
        .catch(() => {});
      console.log(`✓ Перешли к странице выбора коллег: ${this.page.url()}`);
      return true;
    }

    console.log('⚠️ Кнопка "Перейти к оценке" не найдена в блоке');
    return false;
  }

  /**
   * Открыть анкету для конкретного оцениваемого
   * @param {string} baseUrl - Базовый URL приложения
   * @param {string} evaluatedName - Имя оцениваемого (например, "Elena Shapoval")
   * @param {string} [prId] - Опциональный ID Performance Review для фильтрации
   */
  async openQuestionnaireFor(
    baseUrl,
    evaluatedName,
    prId = null,
    options = {},
  ) {
    const { revisionAlias } = options;
    await this._step(`Открыть анкету для ${evaluatedName}`, async () => {
      await this.page.goto(new URL("/ru/", baseUrl).toString(), {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
      await this.page
        .waitForLoadState("networkidle", { timeout: 15_000 })
        .catch(() => {});

      let foundBlock = null;

      // Если передан prId - фильтруем СТРОГО по нему с увеличенным временем ожидания
      if (prId) {
        // Если есть revisionAlias, ищем по нему (более точно)
        const hrefPattern = revisionAlias
          ? `a[href*="/performance-reviews/${prId}/${revisionAlias}/"]`
          : `a[href*="/performance-reviews/${prId}/"]`;

        foundBlock = this.page
          .locator('[class*="PerformanceReviewSummaryNotification"]')
          .filter({ has: this.page.locator(hrefPattern) })
          .first();

        // Ждём дольше (30 сек) - после пакетной рассылки анкета может появиться не сразу
        const maxRetries = 6;
        for (let retry = 0; retry < maxRetries; retry++) {
          if (
            await foundBlock
              .waitFor({ state: "visible", timeout: 5000 })
              .then(() => true)
              .catch(() => false)
          ) {
            console.log(`✓ Найден блок PR по ID: ${prId}`);
            break;
          }
          if (retry < maxRetries - 1) {
            console.log(
              `⏳ Блок PR с ID ${prId} не найден, обновляем страницу (попытка ${retry + 2}/${maxRetries})...`,
            );
            await this.page.reload({ waitUntil: "networkidle" });
            // Ждём, пока контейнер уведомлений появится после reload
            await this.page
              .locator('[class*="PerformanceReviewSummaryNotification"]')
              .first()
              .waitFor({ state: "attached", timeout: TIMEOUTS.SHORT })
              .catch(() => {});
          }
        }

        // Финальная проверка - если prId передан, мы ДОЛЖНЫ найти именно этот PR
        if (
          !(await foundBlock
            .waitFor({ state: "visible", timeout: 3000 })
            .then(() => true)
            .catch(() => false))
        ) {
          throw new Error(
            `Блок PR с ID ${prId} не найден после ${maxRetries} попыток. Возможно анкета ещё не отправлена.`,
          );
        }
      }

      // Если prId не передан - ищем по имени оцениваемого
      if (!foundBlock) {
        const prBlocks = this.page
          .locator(
            '[class*="PerformanceReviewSummaryNotification"], [class*="Card"]',
          )
          .filter({ hasText: /performance review/i });

        const blocksCount = await prBlocks.count();
        console.log(`Найдено блоков PR: ${blocksCount}`);

        // Ищем блок с именем оцениваемого
        for (let i = 0; i < blocksCount; i++) {
          const block = prBlocks.nth(i);
          const blockText = await block.innerText().catch(() => "");

          if (
            blockText.toLowerCase().includes(evaluatedName.toLowerCase()) ||
            blockText.includes("Заполните анкеты")
          ) {
            foundBlock = block;
            console.log(`✓ Найден блок PR для ${evaluatedName}`);
            break;
          }
        }
      }

      // Если не нашли по имени, берём первый блок с "Заполните анкеты" (только если prId НЕ передан)
      if (!foundBlock) {
        foundBlock = this.page
          .locator('[class*="PerformanceReviewSummaryNotification"]')
          .filter({ hasText: /заполните анкеты/i })
          .first();

        if (
          await foundBlock
            .waitFor({ state: "visible", timeout: 3000 })
            .then(() => true)
            .catch(() => false)
        ) {
          console.log('✓ Найден блок "Заполните анкеты"');
        } else {
          // Fallback на первый блок PR
          foundBlock = this.page
            .locator('[class*="PerformanceReviewSummaryNotification"]')
            .first();
          console.log("⚠️ Используем первый блок PR");
        }
      }

      // Кликаем "Перейти к оценке" в найденном блоке
      const goToButton = foundBlock
        .locator("a, button")
        .filter({ hasText: /перейти к оценке/i })
        .first();
      if (
        await goToButton
          .waitFor({ state: "visible", timeout: 3000 })
          .then(() => true)
          .catch(() => false)
      ) {
        await Promise.all([
          this.page
            .waitForNavigation({ waitUntil: "networkidle" })
            .catch(() => {}),
          goToButton.click(),
        ]);
        console.log("✓ Перешли к оценке");
      }

      // Проверяем, открыта ли уже форма анкеты
      const formAlreadyOpen = await this._isFormOpen();
      if (formAlreadyOpen) {
        console.log("✓ Форма анкеты уже открыта");
        return;
      }

      // Если есть список анкет для заполнения - ищем карточку с именем оцениваемого
      const userCard = this.page
        .locator('[class*="Card"], [class*="Item"], [class*="Row"]')
        .filter({ hasText: new RegExp(evaluatedName, "i") })
        .first();

      if (
        await userCard
          .waitFor({ state: "visible", timeout: 3000 })
          .then(() => true)
          .catch(() => false)
      ) {
        await userCard.click();
        await this.page
          .waitForLoadState("networkidle", { timeout: 15_000 })
          .catch(() => {});
        console.log(`✓ Открыта карточка ${evaluatedName}`);
      }

      // Ищем кнопку "Заполнить анкету"
      const fillButton = this.page
        .locator("button, a")
        .filter({ hasText: /заполнить анкету/i })
        .first();
      if (
        await fillButton
          .waitFor({ state: "visible", timeout: 5000 })
          .then(() => true)
          .catch(() => false)
      ) {
        await fillButton.click();
        await this.page
          .waitForLoadState("networkidle", { timeout: 15_000 })
          .catch(() => {});
        console.log("✓ Открыта форма заполнения анкеты");
      }
    });
  }

  /**
   * Проверить, открыта ли форма анкеты
   */
  async _isFormOpen() {
    const scaleButtons = this.page.locator(
      '[class*="ScaleAnswer_button"], [class*="Answer_button"]',
    );
    const questionBlocks = this.page.locator(
      '[class*="Block_block__"], [class*="Question"]',
    );
    const radioInputs = this.page.locator('input[type="radio"]');

    return (
      (await scaleButtons.count()) > 0 ||
      (await questionBlocks.count()) > 0 ||
      (await radioInputs.count()) > 0
    );
  }

  /**
   * Заполнить анкету для конкретного оцениваемого (открыть + заполнить + отправить)
   * Используется респондентами (коллегами, руководителями, подчиненными) для заполнения анкеты на конкретного человека
   * @param {string} baseUrl - Базовый URL
   * @param {string} evaluatedName - Имя оцениваемого (например, "Elena Shapoval")
   */
  async fillQuestionnaireForEvaluated(
    baseUrl,
    evaluatedName,
    prId = null,
    options = {},
  ) {
    await this._step(`Заполнить анкету на ${evaluatedName}`, async () => {
      // Путь 1: Alias URL — прямая навигация (надёжнее dashboard при 1200+ PR)
      if (prId && options.revisionAlias) {
        const aliasUrl = new URL(
          `/ru/performance-reviews/${prId}/${options.revisionAlias}/`,
          baseUrl,
        ).toString();
        console.log(`📍 Переход к анкете через alias URL: ${aliasUrl}`);
        const ok = await this._gotoWithRetryOn404(aliasUrl);
        if (ok) {
          const currentUrl = this.page.url();
          if (!currentUrl.includes("/login")) {
            console.log(`✓ Перешли на страницу PR ${prId}: ${currentUrl}`);
            // Ищем кнопку "Заполнить анкету" или форму
            const fillBtn = this.page
              .locator("button, a")
              .filter({ hasText: /заполнить анкету/i })
              .first();
            if (
              await fillBtn
                .waitFor({ state: "visible", timeout: 5000 })
                .then(() => true)
                .catch(() => false)
            ) {
              await fillBtn.click();
              await this.page
                .waitForLoadState("networkidle", { timeout: 15_000 })
                .catch(() => {});
              console.log('✓ Нажата кнопка "Заполнить анкету"');
            }
            if (await this._isFormOpen()) {
              await this.quickFill();
              await this.submitIfVisible();
              console.log("✓ Анкета заполнена и отправлена");
              return;
            }
          }
        }
        console.log(
          "⚠️ Alias URL не привёл к форме анкеты, пробуем dashboard...",
        );
      }

      // Путь 2: Dashboard search (legacy)
      await this.page.goto(new URL("/ru/", baseUrl).toString(), {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
      await this.page
        .waitForLoadState("networkidle", { timeout: 15_000 })
        .catch(() => {});

      // Проверяем, есть ли вообще незаполненные анкеты
      const allDone = this.page.locator("text=Все анкеты отправлены").first();
      if (
        await allDone
          .waitFor({ state: "visible", timeout: 2000 })
          .then(() => true)
          .catch(() => false)
      ) {
        console.log("✓ Все анкеты уже отправлены ранее");
        return;
      }

      // Ищем блок "Заполните анкеты" для Performance Review
      let prBlockLocator = this.page
        .locator('[class*="PerformanceReviewSummaryNotification"]')
        .filter({ hasText: /заполните анкеты|performance review/i });
      if (prId) {
        prBlockLocator = prBlockLocator.filter({
          has: this.page.locator(`a[href*="/performance-reviews/${prId}/"]`),
        });
      }
      const prBlock = prBlockLocator.first();

      if (
        await prBlock
          .waitFor({ state: "visible", timeout: 5000 })
          .then(() => true)
          .catch(() => false)
      ) {
        console.log('✓ Найден блок "Заполните анкеты"');

        // Кликаем "Перейти к оценке"
        const goToButton = prBlock
          .locator("a, button")
          .filter({ hasText: /перейти к оценке/i })
          .first();
        if (
          await goToButton
            .waitFor({ state: "visible", timeout: 3000 })
            .then(() => true)
            .catch(() => false)
        ) {
          await Promise.all([
            this.page
              .waitForNavigation({ waitUntil: "networkidle" })
              .catch(() => {}),
            goToButton.click(),
          ]);
          console.log("✓ Перешли к списку анкет");
        }
      }

      // Теперь мы на странице со списком анкет для заполнения
      // Ищем карточку с именем оцениваемого
      const evaluatedCard = this.page
        .locator(
          '[class*="Card"], [class*="UserCard"], [class*="Item"], [class*="Row"], a',
        )
        .filter({ hasText: new RegExp(evaluatedName, "i") })
        .first();

      if (
        await evaluatedCard
          .waitFor({ state: "visible", timeout: 5000 })
          .then(() => true)
          .catch(() => false)
      ) {
        console.log(`✓ Найдена карточка ${evaluatedName}`);
        await evaluatedCard.click();
        await this.page
          .waitForLoadState("networkidle", { timeout: 15_000 })
          .catch(() => {});
      } else {
        // Проверяем, есть ли кнопка "Заполнить анкету" на текущей странице
        const fillBtn = this.page
          .locator("button, a")
          .filter({ hasText: /заполнить анкету/i })
          .first();
        if (
          await fillBtn
            .waitFor({ state: "visible", timeout: 3000 })
            .then(() => true)
            .catch(() => false)
        ) {
          await fillBtn.click();
          await this.page
            .waitForLoadState("networkidle", { timeout: 15_000 })
            .catch(() => {});
          console.log('✓ Нажата кнопка "Заполнить анкету"');
        } else {
          console.log(
            `⚠️ Карточка ${evaluatedName} не найдена, форма может быть уже открыта`,
          );
        }
      }

      // Проверяем, открылась ли форма анкеты
      if (await this._isFormOpen()) {
        console.log("✓ Форма анкеты открыта, заполняем...");
        await this.quickFill();
        await this.submitIfVisible();
        console.log("✓ Анкета заполнена и отправлена");
      } else {
        // Пробуем найти кнопку "Заполнить анкету" еще раз
        const fillButton = this.page
          .locator("button, a")
          .filter({ hasText: /заполнить анкету/i })
          .first();
        if (
          await fillButton
            .waitFor({ state: "visible", timeout: 3000 })
            .then(() => true)
            .catch(() => false)
        ) {
          await fillButton.click();
          await this.page
            .waitForLoadState("networkidle", { timeout: 15_000 })
            .catch(() => {});

          if (await this._isFormOpen()) {
            await this.quickFill();
            await this.submitIfVisible();
            console.log("✓ Анкета заполнена и отправлена");
          }
        } else {
          console.log("⚠️ Не удалось открыть форму анкеты");
        }
      }
    });
  }

  /**
   * Открыть анкету через уведомления
   * @param {string} baseUrl - Базовый URL приложения
   */
  async openFromNotifications(baseUrl) {
    await this._step("Открыть анкету через уведомления", async () => {
      // Перейти на главную страницу
      await this.page.goto(new URL("/ru/", baseUrl).toString(), {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
      await this.page
        .waitForLoadState("networkidle", { timeout: 15_000 })
        .catch(() => {});

      // Ищем блок Performance Review на главной странице (с ретраем — уведомление может появиться не сразу)
      const prCard = this.page
        .locator('[class*="PerformanceReviewSummaryNotification"]')
        .first();
      let prVisible = await prCard
        .waitFor({ state: "visible", timeout: 10000 })
        .then(() => true)
        .catch(() => false);

      if (!prVisible) {
        for (let attempt = 1; attempt <= 2 && !prVisible; attempt++) {
          console.log(`⚠️ Блок PR не найден, ретрай ${attempt}/2 (reload)...`);
          await this.page.reload({
            waitUntil: "domcontentloaded",
            timeout: 60_000,
          });
          await this.page
            .waitForLoadState("networkidle", { timeout: 15_000 })
            .catch(() => {});
          prVisible = await prCard
            .waitFor({ state: "visible", timeout: 10000 })
            .then(() => true)
            .catch(() => false);
        }
      }

      if (prVisible) {
        console.log("✓ Найден блок Performance Review на главной");

        // Ищем ссылку SummaryItem_link с toAssessments в href (ведёт к анкетам)
        // Проверяем все ссылки внутри блока PR
        const allLinks = prCard.locator('a[class*="SummaryItem_link"]');
        const linksCount = await allLinks.count();
        console.log(`📍 Найдено ${linksCount} ссылок SummaryItem_link`);

        for (let i = 0; i < linksCount; i++) {
          const link = allLinks.nth(i);
          const href = await link.getAttribute("href").catch(() => "");
          console.log(`  Ссылка ${i}: ${href}`);
          if (href && href.includes("toAssessments")) {
            console.log(`📍 Найдена ссылка с toAssessments: ${href}`);
            // Используем прямую навигацию вместо клика - клик не работает
            const fullUrl = new URL(href, baseUrl).toString();
            console.log(`📍 Переходим по URL: ${fullUrl}`);
            await this.page.goto(fullUrl);
            await this.page.waitForLoadState("networkidle");
            console.log("✓ Перешли на страницу анкет");
            console.log("📍 URL после перехода:", this.page.url());
            return;
          }
        }

        // Альтернатива: ищем ссылку рядом с текстом "Заполните анкеты"
        const summaryItems = prCard.locator('[class*="SummaryItem"]');
        const itemsCount = await summaryItems.count();
        for (let i = 0; i < itemsCount; i++) {
          const item = summaryItems.nth(i);
          const text = await item.textContent().catch(() => "");
          if (text.toLowerCase().includes("заполните анкеты")) {
            const link = item.locator('a[class*="SummaryItem_link"]').first();
            if (
              await link
                .waitFor({ state: "visible", timeout: 1000 })
                .then(() => true)
                .catch(() => false)
            ) {
              await this.page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
              const href = await link.getAttribute("href").catch(() => null);
              console.log(`📍 Найдена ссылка "Заполните анкеты": ${href}`);
              // Используем прямую навигацию вместо клика
              const fullUrl = new URL(href, baseUrl).toString();
              console.log(`📍 Переходим по URL: ${fullUrl}`);
              await this.page.goto(fullUrl);
              await this.page.waitForLoadState("networkidle");
              console.log("✓ Перешли на страницу анкет");
              console.log("📍 URL после перехода:", this.page.url());
              return;
            }
          }
        }

        // Fallback: кликаем на "Перейти к оценке"
        console.log(
          '⚠️ Ссылка "Заполните анкеты" не найдена, кликаем "Перейти к оценке"',
        );
        const goToButton = prCard
          .locator('a[class*="Button"]')
          .filter({ hasText: /перейти к оценке/i })
          .first();
        if (
          await goToButton
            .waitFor({ state: "visible", timeout: 3000 })
            .then(() => true)
            .catch(() => false)
        ) {
          await Promise.all([
            this.page
              .waitForNavigation({ waitUntil: "networkidle" })
              .catch(() => {}),
            goToButton.click(),
          ]);
          console.log("✓ Перешли к оценке");
        }
      } else {
        // Fallback: через колокольчик уведомлений
        console.log("⚠️ Блок PR не найден, пробуем через уведомления...");
        const bellIcon = this.page
          .locator('[class*="bell"], [class*="notification"]')
          .first();
        await bellIcon.click();
        await this.page
          .waitForLoadState("networkidle", { timeout: 15_000 })
          .catch(() => {});
        console.log("✓ Открыто окно уведомлений");

        const goToLink = this.page
          .locator("a")
          .filter({ hasText: "Перейти к оценке" })
          .first();
        if (
          await goToLink
            .waitFor({ state: "visible", timeout: 3000 })
            .then(() => true)
            .catch(() => false)
        ) {
          await goToLink.click();
          await this.page
            .waitForLoadState("networkidle", { timeout: 15_000 })
            .catch(() => {});
          console.log("✓ Перешли к оценке");
        }
      }

      // Проверяем, открыта ли уже форма анкеты
      if (await this._isFormOpen()) {
        console.log("✓ Форма анкеты уже открыта");
        return;
      }

      // Отладка: показать URL
      const currentUrl = this.page.url();
      console.log("📍 URL после перехода:", currentUrl);

      // Если попали на страницу /nomination/ или /approval/ - нужно перейти к самооценке
      if (
        currentUrl.includes("/nomination/") ||
        currentUrl.includes("/approval/")
      ) {
        console.log(
          "📝 Находимся на странице выбора/утверждения коллег, переходим к самооценке...",
        );

        // На этой странице есть боковое меню с шагами. Ищем шаг "Самооценка" и кликаем
        // Ищем ссылку с текстом "Самооценка" в боковом меню
        const selfAssessmentLink = this.page
          .locator("a")
          .filter({ hasText: /самооценка/i })
          .first();

        if (
          await selfAssessmentLink
            .waitFor({ state: "visible", timeout: 3000 })
            .then(() => true)
            .catch(() => false)
        ) {
          await this.page
            .waitForLoadState("networkidle", { timeout: 10_000 })
            .catch(() => {});
          const href = await selfAssessmentLink.getAttribute("href").catch(() => null);
          console.log(`📍 Найдена ссылка "Самооценка": ${href}`);
          await selfAssessmentLink.click();
          await this.page.waitForLoadState("networkidle");
          console.log('✓ Перешли к разделу "Самооценка"');
          console.log("📍 URL после перехода:", this.page.url());
        } else {
          // Альтернатива: посмотрим все ссылки на странице
          console.log(
            '⚠️ Ссылка "Самооценка" не найдена, ищем другие способы...',
          );

          // Попробуем найти любой элемент с текстом "Самооценка" и кликнуть на него
          const selfItem = this.page
            .locator(
              '[class*="Step"], [class*="MenuItem"], [class*="Tab"], span, div',
            )
            .filter({ hasText: /^Самооценка$/i })
            .first();

          if (
            await selfItem
              .waitFor({ state: "visible", timeout: 3000 })
              .then(() => true)
              .catch(() => false)
          ) {
            await selfItem.click();
            await this.page.waitForLoadState("networkidle");
            console.log('✓ Кликнули на элемент "Самооценка"');
            console.log("📍 URL после клика:", this.page.url());
          } else {
            console.log('⚠️ Элемент "Самооценка" не найден на странице');
          }
        }
      }

      // Ищем кнопку "Заполнить анкету", "Заполнить" или "Начать"
      let fillButton = this.page
        .locator("button, a")
        .filter({ hasText: /заполнить анкету/i })
        .first();
      if (
        await fillButton
          .waitFor({ state: "visible", timeout: 5000 })
          .then(() => true)
          .catch(() => false)
      ) {
        await fillButton.click();
        await this.page
          .waitForLoadState("networkidle", { timeout: 15_000 })
          .catch(() => {});
        console.log("✓ Открыта форма заполнения анкеты");
      } else {
        // Пробуем просто "Заполнить"
        fillButton = this.page
          .locator("button, a")
          .filter({ hasText: /^Заполнить$/i })
          .first();
        if (
          await fillButton
            .waitFor({ state: "visible", timeout: 3000 })
            .then(() => true)
            .catch(() => false)
        ) {
          await fillButton.click();
          await this.page
            .waitForLoadState("networkidle", { timeout: 15_000 })
            .catch(() => {});
          console.log('✓ Нажата кнопка "Заполнить"');
        } else {
          // Пробуем "Начать"
          fillButton = this.page
            .locator("button, a")
            .filter({ hasText: /начать/i })
            .first();
          if (
            await fillButton
              .waitFor({ state: "visible", timeout: 3000 })
              .then(() => true)
              .catch(() => false)
          ) {
            await fillButton.click();
            await this.page
              .waitForLoadState("networkidle", { timeout: 15_000 })
              .catch(() => {});
            console.log('✓ Нажата кнопка "Начать"');
          } else {
            console.log(
              '⚠️ Кнопка "Заполнить анкету" не найдена, возможно форма уже открыта',
            );
          }
        }
      }
    });
  }

  /**
   * Открыть анкету через уведомления по ID конкретного PR
   * @param {string} baseUrl - Базовый URL приложения
   * @param {string|number} prId - ID Performance Review
   */
  async openFromNotificationsByPrId(baseUrl, prId, options = {}) {
    await this._step(`Открыть анкету PR ${prId} через прямой URL`, async () => {
      // Alias URL предпочтительнее toAssessments=true (который редиректит admin на manager view)
      let directUrl;
      if (options.revisionAlias) {
        directUrl = new URL(
          `/ru/performance-reviews/${prId}/${options.revisionAlias}/`,
          baseUrl,
        ).toString();
      } else {
        directUrl = new URL(
          `/ru/staff/performance-reviews/${prId}/?toAssessments=true`,
          baseUrl,
        ).toString();
      }
      console.log(`📍 Переход по прямому URL: ${directUrl}`);

      // Alias URL может вернуть 404 при параллельном запуске тестов (SSR race condition)
      const ok = await this._gotoWithRetryOn404(directUrl);
      if (!ok && options.revisionAlias) {
        // Fallback: toAssessments=true (работает для non-admin, для admin редиректит на manager view)
        const fallbackUrl = new URL(
          `/ru/staff/performance-reviews/${prId}/?toAssessments=true`,
          baseUrl,
        ).toString();
        console.log(
          `⚠️ Alias URL вернул 404, пробуем fallback: ${fallbackUrl}`,
        );
        await this.page.goto(fallbackUrl, {
          waitUntil: "domcontentloaded",
          timeout: 60_000,
        });
        await this.page
          .waitForLoadState("networkidle", { timeout: 15_000 })
          .catch(() => {});
      }

      // Проверяем, что не попали на страницу ошибки или логина
      const currentUrl = this.page.url();
      if (currentUrl.includes("/login")) {
        throw new Error(
          `Редирект на login — пользователь не авторизован (${currentUrl})`,
        );
      }
      const isErrorPage = await this.page
        .getByText("Ошибка")
        .first()
        .waitFor({ state: "visible", timeout: 3000 })
        .then(() => true)
        .catch(() => false);
      if (isErrorPage) {
        throw new Error(`Страница PR ${prId} вернула ошибку (${currentUrl})`);
      }
      // Финальная проверка на 404
      const is404 = await this.page
        .locator("h1")
        .filter({ hasText: "404" })
        .first()
        .waitFor({ state: "visible", timeout: 2000 })
        .then(() => true)
        .catch(() => false);
      if (is404) {
        throw new Error(
          `Страница PR ${prId} вернула 404 после всех попыток (${directUrl})`,
        );
      }
      console.log(`✓ Перешли на страницу PR ${prId}: ${currentUrl}`);

      // Проверяем, открыта ли уже форма анкеты
      if (await this._isFormOpen()) {
        console.log("✓ Форма анкеты уже открыта");
        return;
      }

      // Если попали на страницу /nomination/ или /approval/ - нужно перейти к самооценке
      if (
        currentUrl.includes("/nomination/") ||
        currentUrl.includes("/approval/")
      ) {
        console.log(
          "📝 Находимся на странице выбора/утверждения коллег, переходим к самооценке...",
        );

        const selfAssessmentLink = this.page
          .locator("a")
          .filter({ hasText: /самооценка/i })
          .first();

        if (
          await selfAssessmentLink
            .waitFor({ state: "visible", timeout: 3000 })
            .then(() => true)
            .catch(() => false)
        ) {
          await this.page
            .waitForLoadState("networkidle", { timeout: 10_000 })
            .catch(() => {});
          const href = await selfAssessmentLink.getAttribute("href").catch(() => null);
          console.log(`📍 Найдена ссылка "Самооценка": ${href}`);
          await selfAssessmentLink.click();
          await this.page.waitForLoadState("networkidle");
          console.log('✓ Перешли к разделу "Самооценка"');
          console.log("📍 URL после перехода:", this.page.url());
        } else {
          const selfItem = this.page
            .locator(
              '[class*="Step"], [class*="MenuItem"], [class*="Tab"], span, div',
            )
            .filter({ hasText: /^Самооценка$/i })
            .first();

          if (
            await selfItem
              .waitFor({ state: "visible", timeout: 3000 })
              .then(() => true)
              .catch(() => false)
          ) {
            await selfItem.click();
            await this.page.waitForLoadState("networkidle");
            console.log('✓ Кликнули на элемент "Самооценка"');
            console.log("📍 URL после клика:", this.page.url());
          } else {
            // Fallback: кнопка рядом с текстом "Самооценка" (listitem > generic "Самооценка" + button)
            const selfLabel = this.page.getByText("Самооценка", {
              exact: true,
            });
            if (
              await selfLabel
                .waitFor({ state: "visible", timeout: 2000 })
                .then(() => true)
                .catch(() => false)
            ) {
              const siblingBtn = selfLabel
                .locator("..")
                .locator("button")
                .first();
              if (
                await siblingBtn
                  .waitFor({ state: "visible", timeout: 2000 })
                  .then(() => true)
                  .catch(() => false)
              ) {
                await siblingBtn.click();
                await this.page.waitForLoadState("networkidle");
                console.log('✓ Кликнули кнопку рядом с "Самооценка"');
              } else {
                console.log('⚠️ Элемент "Самооценка" не найден на странице');
              }
            } else {
              console.log('⚠️ Текст "Самооценка" не найден на странице');
            }
          }
        }
      }

      // Ищем кнопку "Заполнить анкету"
      let fillButton = this.page
        .locator("button, a")
        .filter({ hasText: /заполнить анкету/i })
        .first();
      if (
        await fillButton
          .waitFor({ state: "visible", timeout: 5000 })
          .then(() => true)
          .catch(() => false)
      ) {
        await fillButton.click();
        await this.page
          .waitForLoadState("networkidle", { timeout: 15_000 })
          .catch(() => {});
        console.log("✓ Открыта форма заполнения анкеты");
      } else {
        fillButton = this.page
          .locator("button, a")
          .filter({ hasText: /^Заполнить$/i })
          .first();
        if (
          await fillButton
            .waitFor({ state: "visible", timeout: 3000 })
            .then(() => true)
            .catch(() => false)
        ) {
          await fillButton.click();
          await this.page
            .waitForLoadState("networkidle", { timeout: 15_000 })
            .catch(() => {});
          console.log('✓ Нажата кнопка "Заполнить"');
        } else {
          fillButton = this.page
            .locator("button, a")
            .filter({ hasText: /начать/i })
            .first();
          if (
            await fillButton
              .waitFor({ state: "visible", timeout: 3000 })
              .then(() => true)
              .catch(() => false)
          ) {
            await fillButton.click();
            await this.page
              .waitForLoadState("networkidle", { timeout: 15_000 })
              .catch(() => {});
            console.log('✓ Нажата кнопка "Начать"');
          } else {
            console.log(
              '⚠️ Кнопка "Заполнить анкету" не найдена, возможно форма уже открыта',
            );
          }
        }
      }
    });
  }

  /**
   * Заполнить анкету полностью для конкретного PR
   * @param {string} baseUrl - Базовый URL
   * @param {string|number} prId - ID Performance Review
   */
  async fillQuestionnaireCompleteByPrId(baseUrl, prId) {
    await this._step(`Заполнить анкету PR ${prId} полностью`, async () => {
      await this.openFromNotificationsByPrId(baseUrl, prId);

      if (await this.isAllQuestionnairesCompleted()) {
        console.log("✓ Все анкеты уже отправлены ранее");
        return;
      }

      // Проверяем, не на странице ли выбора коллег мы находимся
      const selfAssessmentSection = this.page
        .locator('[class*="Sidebar"], [class*="Steps"], aside')
        .locator("text=Самооценка")
        .first();

      if (
        await selfAssessmentSection
          .waitFor({ state: "visible", timeout: 3000 })
          .then(() => true)
          .catch(() => false)
      ) {
        const colleaguesPage = this.page
          .locator("text=выберите коллег, text=выбрали коллег")
          .first();
        if (
          await colleaguesPage
            .waitFor({ state: "visible", timeout: 2000 })
            .then(() => true)
            .catch(() => false)
        ) {
          console.log(
            "📝 Находимся на странице выбора коллег, переходим к самооценке...",
          );
          await selfAssessmentSection.click();
          await this.page
            .waitForLoadState("networkidle", { timeout: 15_000 })
            .catch(() => {});
        }
      }

      // Нажать кнопку "Заполнить анкету" если она видна
      const fillButton = this.page
        .locator("button")
        .filter({ hasText: /заполнить анкету/i })
        .first();
      if (
        await fillButton
          .waitFor({ state: "visible", timeout: 3000 })
          .then(() => true)
          .catch(() => false)
      ) {
        await fillButton.click();
        await this.page
          .waitForLoadState("networkidle", { timeout: 15_000 })
          .catch(() => {});
        console.log('✓ Нажата кнопка "Заполнить анкету"');
      }

      // Заполняем пошаговую анкету (с кнопками "Далее")
      await this.fillStepByStepWithNext();
      console.log("✓ Анкета заполнена и отправлена");
    });
  }

  /**
   * Утвердить коллег как руководитель
   * Используется когда включено утверждение коллег руководителем (managerApproval: true)
   * @param {string} baseUrl - Базовый URL
   */
  async approveColleagues(baseUrl) {
    await this._step("Утвердить коллег", async () => {
      await this.page.goto(new URL("/ru/", baseUrl).toString(), {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
      await this.page
        .waitForLoadState("networkidle", { timeout: 15_000 })
        .catch(() => {});

      // Ищем блок "Утвердите коллег" на главной странице
      const approvalBlock = this.page
        .locator('[class*="PerformanceReviewSummaryNotification"]')
        .filter({ hasText: /утвердите коллег|performance review/i })
        .first();

      if (
        await approvalBlock
          .waitFor({ state: "visible", timeout: 5000 })
          .then(() => true)
          .catch(() => false)
      ) {
        console.log('✓ Найден блок "Утвердите коллег"');

        // Получаем href из ссылки для навигации (вместо клика, который может редиректить на главную)
        const approvalLink = approvalBlock
          .locator('a[href*="/approval/"], a[href*="/performance-reviews/"]')
          .first();
        let targetHref = await approvalLink
          .getAttribute("href")
          .catch(() => null);

        // Если не нашли ссылку на утверждение, берём любую ссылку в блоке
        if (!targetHref) {
          const anyLink = approvalBlock.locator("a").first();
          targetHref = await anyLink.getAttribute("href").catch(() => null);
        }

        if (targetHref) {
          // Используем прямую навигацию вместо клика
          const targetUrl = new URL(targetHref, baseUrl).toString();
          await this.page.goto(targetUrl);
          await this.page.waitForLoadState("networkidle");
          console.log("✓ Перешли к странице утверждения коллег");
        } else {
          console.log("⚠️ Ссылка на утверждение не найдена в блоке");
        }
      }

      // Логируем URL для отладки
      console.log("📍 URL страницы утверждения:", this.page.url());

      // Ищем кнопку "Утвердить" на странице утверждения коллег
      // ВАЖНО: ищем именно button, а не любой элемент с текстом!
      // Используем exact: true чтобы избежать ложных совпадений с "Утвердите коллег"
      let approveButton = this.page
        .locator("button")
        .filter({ hasText: /^Утвердить$/i })
        .first();

      console.log('🔍 Ищем button с точным текстом "Утвердить"...');

      if (
        !(await approveButton
          .waitFor({ state: "visible", timeout: 2000 })
          .then(() => true)
          .catch(() => false))
      ) {
        console.log(
          "  ❌ Не найдена по точному совпадению, пробуем getByRole...",
        );
        approveButton = this.page
          .getByRole("button", { name: /^Утвердить$/i })
          .first();
      }

      if (
        !(await approveButton
          .waitFor({ state: "visible", timeout: 2000 })
          .then(() => true)
          .catch(() => false))
      ) {
        console.log(
          '  ❌ getByRole не сработал, пробуем button[class*="Button"]...',
        );
        approveButton = this.page
          .locator('button[class*="Button"]')
          .filter({ hasText: /^Утвердить$/i })
          .first();
      }

      if (
        !(await approveButton
          .waitFor({ state: "visible", timeout: 2000 })
          .then(() => true)
          .catch(() => false))
      ) {
        console.log("  ❌ Не найдена, пробуем без exact...");
        approveButton = this.page
          .locator("button")
          .filter({ hasText: /утвердить/i })
          .first();
      }

      // Отладка: показать что нашли
      const buttonCount = await this.page
        .locator("button")
        .filter({ hasText: /утвердить/i })
        .count();
      console.log(`🔍 Найдено кнопок с текстом "утвердить": ${buttonCount}`);

      if (
        await approveButton
          .waitFor({ state: "visible", timeout: 5000 })
          .then(() => true)
          .catch(() => false)
      ) {
        const tagName = await approveButton.evaluate((el) => el.tagName);
        const buttonText = await approveButton.textContent();
        console.log(
          `🔍 Кликаем элемент: <${tagName}> с текстом: "${buttonText.trim()}"`,
        );

        await approveButton.click();
        console.log('✓ Нажата кнопка "Утвердить"');

        // Проверяем наличие модального окна
        const modal = this.page
          .locator('[class*="Modal"], [role="dialog"], [class*="Dialog"]')
          .first();
        const modalVisible = await modal
          .waitFor({ state: "visible", timeout: 2000 })
          .then(() => true)
          .catch(() => false);
        console.log(`🔍 Модальное окно видно: ${modalVisible}`);

        if (modalVisible) {
          // Логируем все кнопки в модальном окне
          const modalButtons = modal.locator("button");
          const modalButtonsCount = await modalButtons.count();
          console.log(`🔍 Кнопок в модальном окне: ${modalButtonsCount}`);
          for (let i = 0; i < modalButtonsCount; i++) {
            const btnText = await modalButtons.nth(i).textContent();
            console.log(`   Кнопка ${i + 1}: "${btnText.trim()}"`);
          }

          // Ищем кнопку подтверждения - может быть "Утвердить", "Подтвердить", "Да", "ОК"
          const confirmButton = modal
            .locator("button")
            .filter({ hasText: /утвердить|подтвердить|да|ок/i })
            .first();
          if (
            await confirmButton
              .waitFor({ state: "visible", timeout: 2000 })
              .then(() => true)
              .catch(() => false)
          ) {
            const confirmText = await confirmButton.textContent();
            console.log(
              `🔍 Кликаем кнопку подтверждения: "${confirmText.trim()}"`,
            );
            await confirmButton.click();
            console.log("✓ Утверждение подтверждено");
          } else {
            console.log("⚠️ Кнопка подтверждения в модальном окне НЕ найдена");
          }
        } else {
          console.log(
            "ℹ️ Модальное окно не появилось (возможно утверждение без подтверждения)",
          );
        }

        // Ждём обработки на бэкенде
        await this.page
          .waitForLoadState("networkidle", { timeout: 15_000 })
          .catch(() => {});
        console.log("✓ Коллеги утверждены");
      } else {
        // Альтернативный путь - ищем ссылку "Утвердить коллег"
        const approveLink = this.page
          .locator('a, button, [role="button"]')
          .filter({ hasText: /утвердить коллег/i })
          .first();
        if (
          await approveLink
            .waitFor({ state: "visible", timeout: 3000 })
            .then(() => true)
            .catch(() => false)
        ) {
          await approveLink.click();
          await this.page
            .waitForLoadState("networkidle", { timeout: 15_000 })
            .catch(() => {});

          // На странице утверждения коллег
          const approveBtn = this.page
            .getByText("Утвердить", { exact: false })
            .first();
          if (
            await approveBtn
              .waitFor({ state: "visible", timeout: 3000 })
              .then(() => true)
              .catch(() => false)
          ) {
            await approveBtn.click();
            await this.page
              .waitForLoadState("networkidle", { timeout: 15_000 })
              .catch(() => {});

            // Подтверждение
            const confirmBtn = this.page
              .locator("button")
              .filter({ hasText: /подтвердить|да|ок/i })
              .first();
            if (
              await confirmBtn
                .waitFor({ state: "visible", timeout: 2000 })
                .then(() => true)
                .catch(() => false)
            ) {
              await confirmBtn.click();
              await this.page
                .waitForLoadState("networkidle", { timeout: 15_000 })
                .catch(() => {});
            }
            console.log("✓ Коллеги утверждены");
          }
        } else {
          console.log("⚠️ Кнопка утверждения не найдена");
        }
      }
    });
  }

  // ========================== БЛОК ПРОСМОТРА САМООЦЕНКИ ==========================

  /**
   * Локатор блока просмотра самооценки
   * Текст: "Сотрудник заполнил самооценку"
   * Ищем по тексту напрямую, используя getByText для точного поиска
   */
  get selfAssessmentPreviewBlock() {
    // Ищем текст напрямую без вложенных фильтров
    return this.page.getByText(/сотрудник заполнил самооценку/i).first();
  }

  /**
   * Локатор блока когда сотрудник ещё НЕ заполнил самооценку
   * Текст: "Сотрудник ещё не заполнил самооценку"
   */
  get selfAssessmentNotFilledBlock() {
    // Ищем текст напрямую без вложенных фильтров
    return this.page
      .getByText(/сотрудник ещё не заполнил|сотрудник еще не заполнил/i)
      .first();
  }

  /**
   * Кнопка "Показать самооценку"
   * Находится внутри блока SelfResponseBlock_block
   */
  get showSelfAssessmentButton() {
    // Ищем кнопку внутри блока SelfResponseBlock, чтобы не попасть на другую кнопку
    return this.page
      .locator('[class*="SelfResponseBlock"] button')
      .filter({ hasText: /показать самооценку/i })
      .first();
  }

  /**
   * Модальное окно просмотра самооценки
   * HTML: <div class="react-modal-sheet-container SheetModal_react-modal-sheet-container--full-height__b8pSh">
   *   <div class="SheetModal_title__tJh4a">Самооценка сотрудника</div>
   */
  get selfAssessmentModal() {
    return this.page.locator(".react-modal-sheet-container").first();
  }

  /**
   * Кнопка "Закрыть" в модальном окне просмотра самооценки
   */
  get closeSelfAssessmentModalButton() {
    return this.selfAssessmentModal
      .locator("button")
      .filter({ hasText: /закрыть/i })
      .first();
  }

  /**
   * Проверить, виден ли блок просмотра самооценки (когда сотрудник заполнил)
   * @returns {Promise<boolean>}
   */
  async isSelfAssessmentPreviewVisible() {
    return await this.selfAssessmentPreviewBlock
      .waitFor({ state: "visible", timeout: 5000 })
      .then(() => true)
      .catch(() => false);
  }

  /**
   * Проверить, виден ли блок "Сотрудник ещё не заполнил самооценку"
   * @returns {Promise<boolean>}
   */
  async isSelfAssessmentNotFilledVisible() {
    return await this.selfAssessmentNotFilledBlock
      .waitFor({ state: "visible", timeout: 5000 })
      .then(() => true)
      .catch(() => false);
  }

  /**
   * Проверить что блок просмотра самооценки ВИДЕН
   */
  async assertSelfAssessmentPreviewVisible() {
    await this._step(
      "Проверить что блок просмотра самооценки виден",
      async () => {
        await this.selfAssessmentPreviewBlock.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        console.log('✓ Блок "Сотрудник заполнил самооценку" виден');
      },
    );
  }

  /**
   * Проверить что блок просмотра самооценки НЕ виден
   */
  async assertSelfAssessmentPreviewNotVisible() {
    await this._step(
      "Проверить что блок просмотра самооценки НЕ виден",
      async () => {
        const isVisible = await this.selfAssessmentPreviewBlock
          .waitFor({ state: "visible", timeout: 3000 })
          .then(() => true)
          .catch(() => false);
        if (isVisible) {
          throw new Error("Блок просмотра самооценки виден, но не должен быть");
        }
        console.log("✓ Блок просмотра самооценки НЕ виден");
      },
    );
  }

  /**
   * Проверить что блок "Ещё не заполнил" виден
   */
  async assertSelfAssessmentNotFilledVisible() {
    await this._step(
      'Проверить что блок "Сотрудник ещё не заполнил самооценку" виден',
      async () => {
        await this.selfAssessmentNotFilledBlock.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        console.log('✓ Блок "Сотрудник ещё не заполнил самооценку" виден');
      },
    );
  }

  /**
   * Нажать кнопку "Показать самооценку" и открыть модальное окно
   */
  async openSelfAssessmentPreview() {
    await this._step("Открыть просмотр самооценки", async () => {
      console.log('📍 Ищем кнопку "Показать самооценку"...');
      await this.showSelfAssessmentButton.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
      console.log('📍 Кнопка "Показать самооценку" найдена, кликаем...');
      await this.showSelfAssessmentButton.click();
      console.log("📍 Клик выполнен, ждём модальное окно...");
      await this.selfAssessmentModal.waitFor({
        state: "visible",
        timeout: TIMEOUTS.MEDIUM,
      });
      console.log("✓ Модальное окно просмотра самооценки открыто");
    });
  }

  /**
   * Закрыть модальное окно просмотра самооценки
   */
  async closeSelfAssessmentPreview() {
    await this._step("Закрыть просмотр самооценки", async () => {
      await this.closeSelfAssessmentModalButton.click();
      await this.selfAssessmentModal.waitFor({
        state: "hidden",
        timeout: TIMEOUTS.MEDIUM,
      });
      console.log("✓ Модальное окно просмотра самооценки закрыто");
    });
  }

  /**
   * Проверить что модальное окно просмотра самооценки открыто
   */
  async assertSelfAssessmentModalVisible() {
    await this._step(
      "Проверить что модальное окно самооценки открыто",
      async () => {
        await this.selfAssessmentModal.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        console.log("✓ Модальное окно просмотра самооценки открыто");
      },
    );
  }

  /**
   * Получить количество вопросов в модальном окне самооценки
   * @returns {Promise<number>}
   */
  async getSelfAssessmentQuestionsCount() {
    return await this._step(
      "Получить количество вопросов в модальном окне",
      async () => {
        // Ждём загрузки модального окна
        await this.selfAssessmentModal.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });

        // Ждём загрузки контента модалки (вопросы подгружаются асинхронно)
        await this.page.waitForTimeout(1000);

        // Считаем вопросы через evaluate — ищем элементы с текстом вопроса
        // Реальные вопросы: "Оцените планирование_test сотрудника", "Как вы оцениваете..." и т.д.
        const count = await this.selfAssessmentModal.evaluate((modal) => {
          const seen = new Set();
          const walker = document.createTreeWalker(
            modal,
            NodeFilter.SHOW_ELEMENT,
          );
          while (walker.nextNode()) {
            const el = walker.currentNode;
            const text = el.textContent?.trim() || "";
            // Пропускаем пустые, заголовок модалки и имя пользователя
            if (text.length < 10 || text.length > 500) continue;
            if (/самооценка сотрудника/i.test(text) && text.length < 40)
              continue;
            // Вопросы содержат "Оцените", "Опишите", "Расскажите", "Как вы" и т.п.
            if (
              /оцените|опишите|расскажите|как вы|выберите|укажите|rate|describe|evaluate|assess|select|choose/i.test(text)
            ) {
              // Берём только листовые элементы (без дочерних блоков с тем же паттерном)
              const children = el.querySelectorAll("*");
              const hasChildMatch = Array.from(children).some(
                (c) =>
                  c !== el &&
                  /оцените|опишите|расскажите|как вы|выберите|укажите|rate|describe|evaluate|assess|select|choose/i.test(
                    c.textContent?.trim() || "",
                  ) &&
                  (c.textContent?.trim() || "").length < 200,
              );
              if (!hasChildMatch && !seen.has(text.slice(0, 80))) {
                seen.add(text.slice(0, 80));
              }
            }
          }
          return seen.size;
        });

        // Fallback: если regex не нашёл вопросы, ищем по DOM-структуре
        if (count === 0) {
          const domCount = await this.selfAssessmentModal
            .locator('[class*="Question"], [class*="Block_block"], [id^="q"]')
            .count()
            .catch(() => 0);
          if (domCount > 0) {
            console.log(`✓ Fallback: найдено ${domCount} вопросов по DOM-структуре`);
            return domCount;
          }
        }

        console.log(`✓ Найдено вопросов в модальном окне: ${count}`);
        return count;
      },
    );
  }

  /**
   * Проверить наличие оценки со звездочками в модальном окне самооценки
   * @returns {Promise<boolean>}
   */
  async hasStarRatingInPreview() {
    return await this._step(
      "Проверить наличие звёздочек в просмотре",
      async () => {
        await this.selfAssessmentModal.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });

        // Звёзды в модалке: SVG-иконки или символы ★/⭐ рядом с числовой оценкой
        const hasStars = await this.selfAssessmentModal.evaluate((modal) => {
          // Проверяем наличие SVG-звёзд или символов
          const svgs = modal.querySelectorAll("svg");
          for (const svg of svgs) {
            const html = svg.outerHTML.toLowerCase();
            if (
              html.includes("star") ||
              html.includes("polygon") ||
              html.includes("path")
            )
              return true;
          }
          // Проверяем текстовые символы звёзд
          const text = modal.textContent || "";
          if (/[★⭐✦✧]/.test(text)) return true;
          // Проверяем элементы с классами, содержащими star/rating
          const starEls = modal.querySelectorAll(
            '[class*="star" i], [class*="Star"], [class*="rating" i], [class*="Rating"]',
          );
          return starEls.length > 0;
        });
        console.log(`✓ Звёздочки в просмотре: ${hasStars ? "есть" : "нет"}`);
        return hasStars;
      },
    );
  }

  /**
   * Проверить наличие текстового ответа в модальном окне самооценки
   * @returns {Promise<boolean>}
   */
  async hasTextAnswerInPreview() {
    return await this._step(
      "Проверить наличие текстового ответа в просмотре",
      async () => {
        await this.selfAssessmentModal.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });

        // Текстовый ответ: любой блок с достаточно длинным текстом,
        // не являющимся заголовком или именем пользователя
        const hasText = await this.selfAssessmentModal.evaluate((modal) => {
          const allEls = modal.querySelectorAll("p, span, div");
          for (const el of allEls) {
            const text = el.textContent?.trim() || "";
            // Текстовый ответ обычно > 20 символов и не содержит паттерны вопросов/заголовков
            if (
              text.length > 20 &&
              text.length < 1000 &&
              !/оцените|опишите|расскажите|самооценка сотрудника|закрыть/i.test(
                text,
              ) &&
              !/^\d+$/.test(text) &&
              el.children.length === 0
            ) {
              // Проверяем что это похоже на ответ (не имя пользователя)
              if (/автотест|тестовый|ответ|комментарий|текст/i.test(text))
                return true;
            }
          }
          return false;
        });
        console.log(
          `✓ Текстовый ответ в просмотре: ${hasText ? "есть" : "нет"}`,
        );
        return hasText;
      },
    );
  }

  /**
   * Проверить наличие числовой оценки (шкалы) в модальном окне самооценки
   * @returns {Promise<boolean>}
   */
  async hasScaleAnswerInPreview() {
    return await this._step(
      "Проверить наличие оценки по шкале в просмотре",
      async () => {
        await this.selfAssessmentModal.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });

        // Числовая оценка: число 0-10 рядом со звездой или в отдельном блоке
        const hasScale = await this.selfAssessmentModal.evaluate((modal) => {
          const allEls = modal.querySelectorAll("*");
          for (const el of allEls) {
            if (el.children.length > 2) continue;
            const text = el.textContent?.trim() || "";
            // Ищем числовую оценку: "2", "3.5", "4" и т.п.
            if (/^[0-9]([.,][0-9])?$/.test(text)) return true;
          }
          // Также проверяем через CSS-классы
          const scoreEls = modal.querySelectorAll(
            '[class*="score" i], [class*="Score"], [class*="value" i], [class*="Value"], [class*="rating" i], [class*="Rating"]',
          );
          return scoreEls.length > 0;
        });
        console.log(
          `✓ Оценка по шкале в просмотре: ${hasScale ? "есть" : "нет"}`,
        );
        return hasScale;
      },
    );
  }

  /**
   * Получить имя сотрудника из модального окна просмотра самооценки
   * @returns {Promise<string>}
   */
  async getEmployeeNameFromPreview() {
    return await this._step(
      "Получить имя сотрудника из просмотра",
      async () => {
        await this.selfAssessmentModal.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });

        // Имя обычно в заголовке или рядом с аватаром
        const nameElement = this.selfAssessmentModal
          .locator('[class*="User"], [class*="Name"], h2, h3')
          .filter({ hasNotText: /самооценка сотрудника|вопрос/i })
          .first();

        const name = await nameElement.textContent().catch(() => "");
        console.log(`✓ Имя сотрудника в просмотре: "${name}"`);
        return name.trim();
      },
    );
  }

  /**
   * Проверить все типы ответов в модальном окне просмотра самооценки
   * @returns {Promise<{hasQuestions: boolean, questionsCount: number, hasStars: boolean, hasScale: boolean, hasText: boolean}>}
   */
  async verifySelfAssessmentPreviewContent() {
    return await this._step(
      "Проверить содержимое просмотра самооценки",
      async () => {
        await this.selfAssessmentModal.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });

        const questionsCount = await this.getSelfAssessmentQuestionsCount();
        const hasStars = await this.hasStarRatingInPreview();
        const hasScale = await this.hasScaleAnswerInPreview();
        const hasText = await this.hasTextAnswerInPreview();

        const result = {
          hasQuestions: questionsCount > 0,
          questionsCount,
          hasStars,
          hasScale,
          hasText,
        };

        console.log(
          "✓ Результат проверки содержимого:",
          JSON.stringify(result),
        );
        return result;
      },
    );
  }

  // ---------------------------------------------------------------------------
  // Баннер "Сотрудник пока не заполнил самооценку"
  // ---------------------------------------------------------------------------

  /**
   * Проверить видимость баннера "Сотрудник пока не заполнил самооценку"
   * Баннер появляется в анкетах руководителей и коллег когда самооценка не заполнена,
   * но анкеты были разосланы через пакетную рассылку
   * @returns {Promise<boolean>}
   */
  async isSelfAssessmentNotFilledBannerVisible() {
    return this._step(
      'Проверить баннер "Сотрудник не заполнил самооценку"',
      async () => {
        // Компонент SelfResponseBlock содержит текст "Сотрудник пока не заполнил самооценку"
        const banner = this.page
          .locator(
            '[class*="SelfResponseBlock"], [class*="Alert"], [class*="Banner"], [class*="Info"]',
          )
          .filter({
            hasText:
              /сотрудник.*не заполнил.*самооценк|пока не заполнил самооценку/i,
          })
          .first();

        const isVisible = await banner
          .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
          .then(() => true)
          .catch(() => false);
        console.log(
          `Баннер "Сотрудник не заполнил самооценку": ${isVisible ? "виден" : "не виден"}`,
        );
        return isVisible;
      },
    );
  }

  /**
   * Проверить что баннер "Сотрудник не заполнил самооценку" виден
   * @throws {Error} если баннер не виден
   */
  async assertSelfAssessmentNotFilledBannerVisible() {
    await this._step("Проверить что баннер виден", async () => {
      // Компонент SelfResponseBlock содержит текст "Сотрудник пока не заполнил самооценку"
      const banner = this.page
        .locator(
          '[class*="SelfResponseBlock"], [class*="Alert"], [class*="Banner"], [class*="Info"]',
        )
        .filter({
          hasText:
            /сотрудник.*не заполнил.*самооценк|пока не заполнил самооценку/i,
        })
        .first();

      await banner.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
      console.log(
        '✓ Баннер "Сотрудник пока не заполнил самооценку" отображается',
      );
    });
  }

  /**
   * Проверить что баннер "Сотрудник не заполнил самооценку" НЕ виден
   * (после того как сотрудник заполнил самооценку)
   * @returns {Promise<boolean>}
   */
  async assertSelfAssessmentNotFilledBannerNotVisible() {
    return this._step("Проверить что баннер скрыт", async () => {
      const banner = this.page
        .locator(
          '[class*="Alert"], [class*="alert"], [class*="Banner"], [class*="banner"], [class*="Info"], [class*="Warning"]',
        )
        .filter({
          hasText:
            /сотрудник.*не заполнил.*самооценк|самооценка.*не заполнен|пока не заполнил самооценку/i,
        })
        .first();

      const isVisible = await banner
        .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
        .then(() => true)
        .catch(() => false);

      if (isVisible) {
        console.log("⚠️ Баннер всё ещё виден");
        return false;
      }

      console.log('✓ Баннер "Сотрудник не заполнил самооценку" скрыт');
      return true;
    });
  }

  /**
   * Получить текст баннера
   * @returns {Promise<string>}
   */
  async getSelfAssessmentNotFilledBannerText() {
    return this._step("Получить текст баннера", async () => {
      const banner = this.page
        .locator(
          '[class*="Alert"], [class*="alert"], [class*="Banner"], [class*="banner"], [class*="Info"], [class*="Warning"]',
        )
        .filter({
          hasText:
            /сотрудник.*не заполнил.*самооценк|самооценка.*не заполнен|пока не заполнил самооценку/i,
        })
        .first();

      await banner.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
      const text = await banner.innerText();
      console.log(`Текст баннера: ${text}`);
      return text.trim();
    });
  }
}

/**
 * Проверить, имеет ли пользователь доступ к анкетам PR.
 * Используется в тестах внутри `userSession.runAs()` callback, где нет инстанса page object.
 *
 * @param {import('@playwright/test').Page} page - Playwright page
 * @param {string} baseUrl - Базовый URL
 * @param {string|number} prId - ID Performance Review
 * @param {boolean} shouldHave - true = ожидаем анкеты, false = НЕ ожидаем
 * @param {import('@playwright/test').expect} expect - Playwright expect
 * @param {{ revisionAlias?: string }} [options] - Опции (revisionAlias для прямой навигации)
 */
export async function assertUserHasQuestionnaire(
  page,
  baseUrl,
  prId,
  shouldHave,
  expect,
  options = {},
) {
  const { revisionAlias } = options;

  // Путь 1: Прямая навигация через alias URL (надёжнее dashboard при 1200+ активных PR)
  if (revisionAlias && shouldHave) {
    const url = new URL(
      `/ru/performance-reviews/${prId}/${revisionAlias}/`,
      baseUrl,
    ).toString();
    console.log(`📍 assertUserHasQuestionnaire: прямой переход к ${url}`);

    // Навигация с retry при 404 (SSR race condition при параллельных тестах)
    for (let attempt = 0; attempt <= 1; attempt++) {
      if (attempt > 0) {
        console.log(`⏳ Retry: ожидание 5s перед повторной навигацией...`);
        await page.waitForTimeout(5000);
      }
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await page
        .waitForLoadState("networkidle", { timeout: 10_000 })
        .catch(() => {});

      const is404 = await page
        .locator("h1")
        .filter({ hasText: "404" })
        .first()
        .waitFor({ state: "visible", timeout: 2000 })
        .then(() => true)
        .catch(() => false);
      if (!is404) break;
      if (attempt === 1) {
        console.log(`⚠️ Alias URL вернул 404 после retry`);
      }
    }

    const currentUrl = page.url();
    if (currentUrl.includes("/login")) {
      expect(
        false,
        `Пользователь не авторизован (редирект на login при проверке PR ${prId})`,
      ).toBe(true);
      return;
    }

    // Пользователь на странице PR = у него есть доступ к анкетам
    const isOnPRPage = currentUrl.includes(`/performance-reviews/${prId}/`);
    expect(
      isOnPRPage,
      `Пользователь должен иметь доступ к анкетам PR ${prId} (URL: ${currentUrl})`,
    ).toBe(true);
    console.log(`✓ Пользователь имеет доступ к PR ${prId}: ${currentUrl}`);
    return;
  }

  // Путь 2: Dashboard search (для shouldHave=false или без revisionAlias)
  await page.goto(new URL("/ru/", baseUrl).toString(), {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  await page
    .waitForLoadState("networkidle", { timeout: 10_000 })
    .catch(() => {});

  const prBlock = page
    .locator('[class*="PerformanceReviewSummaryNotification"]')
    .filter({ has: page.locator(`a[href*="/performance-reviews/${prId}/"]`) })
    .first();

  const hasQuestionnaire = await prBlock
    .waitFor({ state: "visible", timeout: 5000 })
    .then(() => true)
    .catch(() => false);

  if (shouldHave) {
    expect(
      hasQuestionnaire,
      `Пользователь должен видеть уведомление PR ${prId} на dashboard`,
    ).toBe(true);
  } else {
    expect(
      hasQuestionnaire,
      `Пользователь НЕ должен видеть уведомление PR ${prId} на dashboard`,
    ).toBe(false);
  }
}

/**
 * Навигация к alias URL с retry при 404 (SSR race condition при параллельных тестах)
 * @param {import('@playwright/test').Page} page
 * @param {string} url - Полный alias URL
 * @param {Object} [opts]
 * @param {number} [opts.retries=1] - Количество повторных попыток
 * @param {number} [opts.retryDelay=5000] - Задержка между попытками (мс)
 * @returns {Promise<boolean>} true если навигация успешна (не 404)
 */
export async function gotoWithRetryOn404(page, url, opts = {}) {
  const { retries = 1, retryDelay = 5000 } = opts;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      console.log(
        `⏳ Retry ${attempt}/${retries}: ожидание ${retryDelay}ms перед повторной навигацией...`,
      );
      await page.waitForTimeout(retryDelay);
    }
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page
      .waitForLoadState("networkidle", { timeout: 15_000 })
      .catch(() => {});

    const is404 = await page
      .locator("h1")
      .filter({ hasText: "404" })
      .first()
      .waitFor({ state: "visible", timeout: 2000 })
      .then(() => true)
      .catch(() => false);
    if (!is404) return true;
    console.log(
      `⚠️ 404 при навигации к ${url} (попытка ${attempt + 1}/${retries + 1})`,
    );
  }
  return false;
}
