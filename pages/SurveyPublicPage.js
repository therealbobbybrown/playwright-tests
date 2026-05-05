import { BasePage } from "./BasePage.js";
import { TIMEOUTS } from "../tests/utils/constants.js";
// pages/SurveyPublicPage.js

export class SurveyPublicPage extends BasePage {
  /**
   * @param {import('@playwright/test').Page} page
   * @param {import('@playwright/test').TestInfo} [testInfo]
   */
  constructor(page, testInfo) {
    super(page, testInfo);

    // Все блоки вопросов на странице
    this.blocks = this.page.locator('[class*="Block_block__"]');

    // Заголовок опроса
    this.title = this.page.getByRole("heading", { level: 1 }).first();

    // Экран "спасибо"
    this.thanksText = this.page.getByText("Спасибо за участие в опросе", {
      exact: false,
    });
  }

  // ---------------------------------------------------------------------------
  // Проверки
  // ---------------------------------------------------------------------------

  /**
   * Проверить, что открыта публичная страница опроса с заданным заголовком.
   * @param {string} expectedTitle
   */
  async assertOpenedWithTitle(expectedTitle) {
    await this._step(
      `Открыта публичная страница опроса с названием "${expectedTitle}"`,
      async () => {
        await this.page.waitForLoadState("domcontentloaded");

        await this.title.waitFor({
          state: "visible",
          timeout: TIMEOUTS.ELEMENT_VISIBLE,
        });

        const actual = (await this.title.innerText()).trim();

        if (!actual.toLowerCase().includes(expectedTitle.toLowerCase())) {
          throw new Error(
            `Ожидали заголовок, содержащий "${expectedTitle}", но получили "${actual}".`,
          );
        }
      },
    );
  }

  // ---------------------------------------------------------------------------
  // Основной сценарий
  // ---------------------------------------------------------------------------

  /** Пройти опрос и дождаться экрана "Спасибо за участие в опросе" */
  async answerSurveyAndAssertCompleted() {
    await this._step("Пройти опрос по публичной ссылке до конца", async () => {
      // Проверяем, не пройден ли опрос уже
      const alreadyCompleted = this.page
        .locator("text=/already completed|уже прошли|уже заполнили/i")
        .first();
      const isAlreadyCompleted = await alreadyCompleted
        .waitFor({ state: "visible", timeout: 2000 })
        .then(() => true)
        .catch(() => false);

      if (isAlreadyCompleted) {
        console.log(
          "Опрос уже был пройден этим пользователем ранее - пропускаем",
        );
        return;
      }

      // Заполняем все блоки
      await this._answerAllQuestionsOnPage();

      // Кнопка отправки
      const submitButton = await this._findSubmitButton();
      await submitButton.scrollIntoViewIfNeeded().catch(() => {});
      await submitButton.click();

      // Ждём либо успешное завершение, либо ошибки валидации
      const thanks = this.thanksText.first();
      const validationError = this.page
        .locator("text=/Answer is required|Это обязательный вопрос/i")
        .first();

      const result = await Promise.race([
        thanks
          .waitFor({
            state: "visible",
            timeout: TIMEOUTS.PAGE_LOAD,
          })
          .then(() => "thanks")
          .catch(() => null),
        validationError
          .waitFor({
            state: "visible",
            timeout: TIMEOUTS.PAGE_LOAD,
          })
          .then(() => "validation")
          .catch(() => null),
      ]);

      if (result === "thanks") {
        return;
      }

      if (result === "validation") {
        throw new Error(
          'Опрос не был отправлен: после нажатия кнопки отправки появились ошибки "обязательный вопрос". ' +
            "Скорее всего, автозаполнение пропустило один из блоков.",
        );
      }

      throw new Error(
        'Опрос не был отправлен: не появился экран "Спасибо" и не отобразились ошибки валидации. ' +
          "Проверьте состояние формы и сетевые запросы.",
      );
    });
  }

  // ---------------------------------------------------------------------------
  // Внутреннее: ответы на вопросы
  // ---------------------------------------------------------------------------

  /** Обойти все блоки вопросов и ответить на них */
  async _answerAllQuestionsOnPage() {
    await this._step("Заполнить все вопросы на странице опроса", async () => {
      await this.blocks.first().waitFor({
        state: "visible",
        timeout: TIMEOUTS.ELEMENT_VISIBLE,
      });

      const count = await this.blocks.count();

      for (let i = 0; i < count; i += 1) {
        const block = this.blocks.nth(i);

        await block.scrollIntoViewIfNeeded().catch(() => {});
        await this._answerQuestionBlock(block);
      }
    });
  }

  /**
   * Ответить на вопрос в одном блоке:
   * - текстовое поле / textarea
   * - радио / шкала
   * - чекбоксы
   * @param {import('@playwright/test').Locator} block
   */
  async _answerQuestionBlock(block) {
    await this._answerTextQuestion(block);
    await this._answerRadioOrScaleQuestion(block);
    await this._answerCheckboxQuestion(block);
  }

  // ---------------------- текстовые поля ----------------------

  /** Заполнить текстовый вопрос (если есть) */
  async _answerTextQuestion(block) {
    const textInputs = block.locator(
      'textarea, input:not([type="radio"]):not([type="checkbox"]):not([type="hidden"]):not([type="submit"]):not([type="button"])',
    );

    const count = await textInputs.count();
    if (!count) return false;

    const field = textInputs.first();
    await field.scrollIntoViewIfNeeded().catch(() => {});
    await field.fill("Автотест: ответ");

    return true;
  }

  // ---------------------- радио / шкала ----------------------

  /** Выбрать вариант в радио-группе или шкале (если есть) */
  async _answerRadioOrScaleQuestion(block) {
    // Сначала пытаемся работать с «кнопками шкалы» по классам
    let scaleButtons = block.locator('[class*="ScaleAnswer_button"]');
    let count = await scaleButtons.count();

    if (count) {
      const index = count > 1 ? 1 : 0; // берём второй вариант, если есть
      const button = scaleButtons.nth(index);

      await button.scrollIntoViewIfNeeded().catch(() => {});
      await button.click({ force: true });

      // Проверяем, что внутри этого же контейнера есть выбранный input[type=radio]
      const input = button.locator('input[type="radio"]');
      const checked = await input.isChecked().catch(() => false);
      if (checked) return true;
      // если почему-то не выбралось, не падаем — пойдём по запасному пути
    }

    // Запасной путь: любые радио-инпуты в блоке
    const radios = block.locator('input[type="radio"]');
    count = await radios.count();
    if (!count) return false;

    const idx = count > 1 ? 1 : 0;
    const input = radios.nth(idx);

    await input.scrollIntoViewIfNeeded().catch(() => {});
    await input.check({ force: true });

    return (await input.isChecked().catch(() => false)) || false;
  }

  // ---------------------- чекбоксы ----------------------

  /** Поставить чекбокс хотя бы в одном варианте (если есть) */
  async _answerCheckboxQuestion(block) {
    const checkboxes = block.locator('input[type="checkbox"]');
    const count = await checkboxes.count();
    if (!count) return false;

    for (let i = 0; i < count; i += 1) {
      const input = checkboxes.nth(i);

      try {
        const disabled = await input.isDisabled().catch(() => false);
        if (disabled) continue;

        await input.scrollIntoViewIfNeeded().catch(() => {});
        await input.check({ force: true });

        const checked = await input.isChecked().catch(() => false);
        if (checked) {
          return true;
        }
      } catch {
        // Переходим к следующему чекбоксу
      }
    }

    return false;
  }

  // ---------------------------------------------------------------------------
  // Внутреннее: кнопка отправки
  // ---------------------------------------------------------------------------

  /** Найти кнопку отправки/завершения опроса */
  async _findSubmitButton() {
    const candidates = [
      this.page
        .getByRole("button", {
          name: /отправить|завершить|закончить|готово|submit/i,
        })
        .first(),
    ];

    for (const locator of candidates) {
      const visible = await locator.isVisible().catch(() => false);
      if (visible) return locator;
    }

    throw new Error(
      "Кнопка отправки/завершения опроса не найдена на публичной странице.",
    );
  }

  // ---------------------------------------------------------------------------
  // Вспомогательное
  // ---------------------------------------------------------------------------
}
