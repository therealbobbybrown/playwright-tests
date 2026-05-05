// pages/CalibrationFormModal.js
// Page Object для модального окна калибровки оценки сотрудника

import { BasePage } from "./BasePage.js";
import { TIMEOUTS } from "../tests/utils/constants.js";

/**
 * Page Object для формы калибровки оценки
 *
 * Форма открывается при клике на иконку "карандаш" в таблице результатов
 * Позволяет:
 * - Изменять оценки по компетенциям
 * - Изменять ответы на вопросы-индикаторы
 * - Устанавливать текстовую характеристику (ниже/соответствует/выше ожиданий)
 * - Утверждать оценку (только админ)
 */
export class CalibrationFormModal extends BasePage {
  constructor(page, testInfo) {
    super(page, testInfo);

    // Модальное окно
    this.modal = this.page
      .locator(".react-modal-sheet-container")
      .filter({
        has: this.page.locator(
          '[class*="calibration"], [class*="Calibration"]',
        ),
      })
      .first();

    // Альтернативный селектор - по содержимому
    this.modalByContent = this.page
      .locator(".react-modal-sheet-container")
      .filter({ hasText: /калибро|итоговая оценка/i })
      .first();

    // Информация о сотруднике
    this.employeeInfo = this.modal
      .locator('[class*="employee"], [class*="user-info"]')
      .first();
    this.employeeName = this.modal.locator('[class*="name"], h2, h3').first();

    // Итоговая оценка
    this.totalScore = this.modal
      .locator('[class*="total-score"], [class*="TotalScore"]')
      .first();
    this.totalScoreValue = this.modal
      .locator('input[class*="score"], [class*="score-value"] input')
      .first();

    // Текстовая характеристика (выпадающий список или кнопки)
    this.characteristicSelect = this.modal
      .locator(
        'select[class*="characteristic"], [class*="CharacteristicSelect"]',
      )
      .first();
    this.characteristicDropdown = this.modal
      .locator('[class*="dropdown"], [class*="Dropdown"]')
      .filter({ hasText: /ниже|соответств|выше/i })
      .first();

    // Предупреждение о несоответствии характеристики диапазону
    this.mismatchWarning = this.modal
      .locator('[class*="warning"], [class*="alert"]')
      .filter({ hasText: /не соответствует.*диапазон/i })
      .first();

    // Список компетенций
    this.competencyRows = this.modal
      .locator('[class*="competency"], [class*="Competency"]')
      .filter({ has: this.page.locator('input, [class*="score"]') });

    // Чекбокс утверждения (только для админа)
    this.approveCheckbox = this.modal
      .locator('input[type="checkbox"]')
      .filter({ hasText: /запретить.*изменение|утвердить/i })
      .first();
    this.approveCheckboxLabel = this.modal
      .locator("label")
      .filter({ hasText: /запретить дальнейшее изменение/i })
      .first();

    // Кнопки
    this.saveButton = this.modal
      .getByRole("button", { name: /сохранить/i })
      .first();
    this.cancelButton = this.modal
      .getByRole("button", { name: /отмен/i })
      .first();
  }

  /**
   * Получить корректный модальный локатор (пробуем разные селекторы)
   */
  async getModal() {
    if (await this.modal.isVisible().catch(() => false)) {
      return this.modal;
    }
    if (await this.modalByContent.isVisible().catch(() => false)) {
      return this.modalByContent;
    }
    // Fallback - любое модальное окно с формой калибровки
    return this.page
      .locator(".react-modal-sheet-container")
      .filter({
        has: this.page.locator("button").filter({ hasText: /сохранить/i }),
      })
      .first();
  }

  // ---------------------------------------------------------------------------
  // Открытие/закрытие
  // ---------------------------------------------------------------------------

  /**
   * Проверить, что форма калибровки открыта
   */
  async assertOpened() {
    await this._step("Форма калибровки открыта", async () => {
      const modal = await this.getModal();
      await modal.waitFor({
        state: "visible",
        timeout: TIMEOUTS.ELEMENT_VISIBLE,
      });
    });
  }

  /**
   * Сохранить калибровку
   */
  async save() {
    await this._step("Сохранить калибровку", async () => {
      const modal = await this.getModal();
      const saveBtn = modal.getByRole("button", { name: /сохранить/i }).first();
      await saveBtn.click();
      await modal.waitFor({ state: "hidden", timeout: TIMEOUTS.MODAL_CLOSE });
    });
  }

  /**
   * Отменить калибровку
   */
  async cancel() {
    await this._step("Отменить калибровку", async () => {
      const modal = await this.getModal();
      const cancelBtn = modal.getByRole("button", { name: /отмен/i }).first();
      await cancelBtn.click();
      await modal.waitFor({ state: "hidden", timeout: TIMEOUTS.MODAL_CLOSE });
    });
  }

  // ---------------------------------------------------------------------------
  // Компетенции
  // ---------------------------------------------------------------------------

  /**
   * Получить список компетенций с оценками.
   * Реальный DOM: CalibrationModal_competence-row → CompetenceRow_content[role="button"]
   * Оценка отображается в "пилюле" (Value_container → h1.Title_title).
   */
  async getCompetencies() {
    const modal = await this.getModal();
    const rows = modal.locator('[class*="CalibrationModal_competence-row"]');
    const count = await rows.count();
    const result = [];

    for (let i = 0; i < count; i++) {
      const row = rows.nth(i);
      // Название — h1 внутри CompetenceRow_title-container
      const name = await row
        .locator('[class*="CompetenceRow_title-container"] h1')
        .innerText()
        .catch(() => `Компетенция ${i + 1}`);
      // Оценка — текст в "пилюле" Value_container
      const scoreText = await row
        .locator('[class*="Value_container"] h1')
        .innerText()
        .catch(() => "");

      const parsedScore = parseFloat(scoreText);
      result.push({
        name: name.trim(),
        score: isNaN(parsedScore) ? null : parsedScore,
      });
    }

    return result;
  }

  /**
   * Развернуть компетенцию для показа вопросов-индикаторов.
   * Кликает по div[role="button"] (CompetenceRow_content) → появляются input-ы вопросов.
   * @param {string|number} competencyNameOrIndex - Имя или индекс компетенции
   */
  async expandCompetency(competencyNameOrIndex) {
    await this._step(
      `Развернуть компетенцию "${competencyNameOrIndex}"`,
      async () => {
        const modal = await this.getModal();
        const rows = modal.locator(
          '[class*="CalibrationModal_competence-row"]',
        );
        let row;

        if (typeof competencyNameOrIndex === "number") {
          row = rows.nth(competencyNameOrIndex);
        } else {
          row = rows.filter({ hasText: competencyNameOrIndex }).first();
        }

        const button = row.locator('[class*="CompetenceRow_content"]').first();
        // Раскрываем только если ещё не раскрыта
        const isExpanded = await button
          .getAttribute("class")
          .then((cls) => cls?.includes("expanded"))
          .catch(() => false);

        if (!isExpanded) {
          await button.click();
        }

        // Ждём появления input-ов вопросов внутри раскрытого блока
        const questionInputs = row.locator(
          'input[id^="performance-review-overwriting-question-answer-"]',
        );
        await questionInputs
          .first()
          .waitFor({ state: "visible", timeout: 5000 });
      },
    );
  }

  /**
   * Свернуть компетенцию (скрыть вопросы-индикаторы).
   * @param {string|number} competencyNameOrIndex - Имя или индекс компетенции
   */
  async collapseCompetency(competencyNameOrIndex) {
    await this._step(
      `Свернуть компетенцию "${competencyNameOrIndex}"`,
      async () => {
        const modal = await this.getModal();
        const rows = modal.locator(
          '[class*="CalibrationModal_competence-row"]',
        );
        let row;

        if (typeof competencyNameOrIndex === "number") {
          row = rows.nth(competencyNameOrIndex);
        } else {
          row = rows.filter({ hasText: competencyNameOrIndex }).first();
        }

        const button = row.locator('[class*="CompetenceRow_content"]').first();
        const isExpanded = await button
          .getAttribute("class")
          .then((cls) => cls?.includes("expanded"))
          .catch(() => false);

        if (isExpanded) {
          await button.click();
        }
      },
    );
  }

  /**
   * Изменить оценку компетенции через изменение первого вопроса-индикатора.
   *
   * В текущем UI нет прямого input для оценки компетенции (только "пилюля" с числом).
   * Чтобы изменить оценку: раскрыть компетенцию → изменить оценки вопросов → пилюля пересчитается.
   *
   * @param {string|number} competencyNameOrIndex - Имя или индекс
   * @param {number} newScore - Новая оценка (применяется ко ВСЕМ вопросам компетенции)
   */
  async setCompetencyScore(competencyNameOrIndex, newScore) {
    await this._step(
      `Установить оценку компетенции "${competencyNameOrIndex}" = ${newScore}`,
      async () => {
        // 1. Раскрыть компетенцию
        await this.expandCompetency(competencyNameOrIndex);

        const modal = await this.getModal();
        const rows = modal.locator(
          '[class*="CalibrationModal_competence-row"]',
        );
        let row;

        if (typeof competencyNameOrIndex === "number") {
          row = rows.nth(competencyNameOrIndex);
        } else {
          row = rows.filter({ hasText: competencyNameOrIndex }).first();
        }

        // 2. Найти все input-ы вопросов внутри раскрытой компетенции
        const questionInputs = row.locator(
          'input[id^="performance-review-overwriting-question-answer-"]',
        );
        const inputCount = await questionInputs.count();

        if (inputCount === 0) {
          throw new Error(
            `Не найдены input-ы вопросов для компетенции "${competencyNameOrIndex}". Убедитесь, что компетенция раскрыта.`,
          );
        }

        // 3. Заполнить ВСЕ вопросы одинаковым значением → средняя оценка = newScore
        for (let i = 0; i < inputCount; i++) {
          const input = questionInputs.nth(i);
          await input.click();
          await input.fill(String(newScore));
          await input.press("Tab");
        }

        // 4. Ждём пересчёт пилюли (значение в Value_container обновляется)
        const pill = row.locator('[class*="Value_container"] h1').first();
        await this.page
          .waitForFunction(
            ({ el, expected }) => {
              const text = el?.textContent?.trim();
              return text === String(expected);
            },
            { el: await pill.elementHandle(), expected: newScore },
            { timeout: 5000 },
          )
          .catch(() => {
            // Пересчёт мог привести к округлённому значению — не критично
          });
      },
    );
  }

  // ---------------------------------------------------------------------------
  // Вопросы-индикаторы
  // ---------------------------------------------------------------------------

  /**
   * Получить вопросы-индикаторы развернутой компетенции.
   * Реальный DOM: CompetenceRow_questions-container → CompetenceRow_value-row-container
   * Input ID: performance-review-overwriting-question-answer-{receiverId}-{questionId}
   * @param {string|number} competencyNameOrIndex - Имя или индекс компетенции
   */
  async getQuestionIndicators(competencyNameOrIndex) {
    const modal = await this.getModal();
    const rows = modal.locator('[class*="CalibrationModal_competence-row"]');
    let row;

    if (typeof competencyNameOrIndex === "number") {
      row = rows.nth(competencyNameOrIndex);
    } else {
      row = rows.filter({ hasText: competencyNameOrIndex }).first();
    }

    const inputs = row.locator(
      'input[id^="performance-review-overwriting-question-answer-"]',
    );
    const count = await inputs.count();
    const result = [];

    for (let i = 0; i < count; i++) {
      const input = inputs.nth(i);
      // Текст вопроса — span.CompetenceRow_question-title рядом с input
      const container = input.locator(
        'xpath=ancestor::*[contains(@class,"CompetenceRow_value-row-container")]',
      );
      const text = await container
        .locator('[class*="CompetenceRow_question-title"]')
        .innerText()
        .catch(() => `Вопрос ${i + 1}`);
      const score = await input.inputValue().catch(() => "");

      const parsedScore = parseFloat(score);
      result.push({
        text: text.trim(),
        score: isNaN(parsedScore) ? null : parsedScore,
      });
    }

    return result;
  }

  /**
   * Изменить ответ на вопрос-индикатор.
   * Компетенция должна быть раскрыта (expandCompetency).
   * @param {string|number} competencyNameOrIndex - Компетенция
   * @param {number} questionIndex - Индекс вопроса
   * @param {number} newScore - Новая оценка
   */
  async setQuestionScore(competencyNameOrIndex, questionIndex, newScore) {
    await this._step(
      `Установить оценку вопроса ${questionIndex + 1} = ${newScore}`,
      async () => {
        const modal = await this.getModal();
        const rows = modal.locator(
          '[class*="CalibrationModal_competence-row"]',
        );
        let row;

        if (typeof competencyNameOrIndex === "number") {
          row = rows.nth(competencyNameOrIndex);
        } else {
          row = rows.filter({ hasText: competencyNameOrIndex }).first();
        }

        const inputs = row.locator(
          'input[id^="performance-review-overwriting-question-answer-"]',
        );
        const input = inputs.nth(questionIndex);

        await input.click();
        await input.fill(String(newScore));
        await input.press("Tab");
      },
    );
  }

  // ---------------------------------------------------------------------------
  // Текстовая характеристика
  // ---------------------------------------------------------------------------

  /**
   * Получить текущую текстовую характеристику
   */
  async getCharacteristic() {
    const modal = await this.getModal();

    // Пробуем разные селекторы
    const select = modal.locator('select[class*="characteristic"]').first();
    if (await select.isVisible().catch(() => false)) {
      return await select.inputValue();
    }

    // Dropdown
    const dropdown = modal
      .locator(
        '[class*="dropdown"] [class*="selected"], [class*="Dropdown"] [class*="value"]',
      )
      .first();
    if (await dropdown.isVisible().catch(() => false)) {
      return await dropdown.innerText();
    }

    // Активная кнопка
    const activeButton = modal
      .locator(
        'button[class*="active"], [class*="characteristic"] button[class*="selected"]',
      )
      .first();
    if (await activeButton.isVisible().catch(() => false)) {
      return await activeButton.innerText();
    }

    return null;
  }

  /**
   * Установить текстовую характеристику
   * @param {string} characteristic - "низко", "средне", "высоко" или кастомное значение
   */
  async setCharacteristic(characteristic) {
    await this._step(
      `Установить характеристику "${characteristic}"`,
      async () => {
        const modal = await this.getModal();

        // Пробуем select
        const select = modal.locator('select[class*="characteristic"]').first();
        if (await select.isVisible().catch(() => false)) {
          await select.selectOption({ label: characteristic });
          return;
        }

        // Пробуем dropdown
        const dropdownTrigger = modal
          .locator(
            '[class*="dropdown"] [class*="trigger"], [class*="Dropdown"]',
          )
          .first();
        if (await dropdownTrigger.isVisible().catch(() => false)) {
          await dropdownTrigger.click();
          const option = this.page
            .locator('[class*="dropdown-option"], [class*="option"]')
            .filter({ hasText: new RegExp(characteristic, "i") })
            .first();
          // Ждём появления опции после раскрытия дропдауна
          await option.waitFor({ state: "visible", timeout: 5000 });
          await option.click();
          return;
        }

        // Пробуем кнопки
        const button = modal
          .locator("button")
          .filter({ hasText: new RegExp(characteristic, "i") })
          .first();
        if (await button.isVisible().catch(() => false)) {
          await button.click();
        }
      },
    );
  }

  /**
   * Проверить наличие предупреждения о несоответствии
   */
  async hasMismatchWarning() {
    const modal = await this.getModal();
    const warning = modal
      .locator('[class*="warning"], [class*="alert"]')
      .filter({ hasText: /не соответствует/i })
      .first();
    return await warning.isVisible().catch(() => false);
  }

  // ---------------------------------------------------------------------------
  // Утверждение оценки (только админ)
  // ---------------------------------------------------------------------------

  /**
   * Проверить, виден ли чекбокс утверждения (только для админа)
   */
  async isApproveCheckboxVisible() {
    const modal = await this.getModal();
    const checkbox = modal
      .locator('label, [class*="checkbox"]')
      .filter({ hasText: /запретить дальнейшее изменение/i })
      .first();
    return await checkbox.isVisible().catch(() => false);
  }

  /**
   * Утвердить оценку (запретить изменение руководителем)
   * @param {boolean} approve - true = утвердить
   */
  async setApproved(approve) {
    await this._step(
      `${approve ? "Утвердить" : "Снять утверждение"} оценки`,
      async () => {
        const modal = await this.getModal();
        const checkboxLabel = modal
          .locator("label")
          .filter({ hasText: /запретить дальнейшее изменение/i })
          .first();

        const checkbox = checkboxLabel
          .locator('input[type="checkbox"]')
          .first();
        const isChecked = await checkbox.isChecked().catch(() => false);

        if (isChecked !== approve) {
          await checkboxLabel.click();
          // Ждём пока чекбокс перейдёт в нужное состояние
          const handle = await checkbox.elementHandle();
          if (handle) {
            await this.page.waitForFunction(
              ({ el, target }) => el.checked === target,
              { el: handle, target: approve },
              { timeout: 5000 },
            );
          }
        }
      },
    );
  }

  /**
   * Проверить, утверждена ли оценка
   */
  async isApproved() {
    const modal = await this.getModal();
    const checkbox = modal
      .locator("label")
      .filter({ hasText: /запретить дальнейшее изменение/i })
      .locator('input[type="checkbox"]')
      .first();

    return await checkbox.isChecked().catch(() => false);
  }

  // ---------------------------------------------------------------------------
  // Получение данных
  // ---------------------------------------------------------------------------

  /**
   * Получить имя сотрудника
   */
  async getEmployeeName() {
    const modal = await this.getModal();
    const name = modal.locator('[class*="employee-name"], h2, h3').first();
    return await name.innerText().catch(() => "Unknown");
  }

  /**
   * Получить итоговую оценку
   */
  async getTotalScore() {
    const modal = await this.getModal();
    const scoreInput = modal
      .locator('input[class*="total"], [class*="total-score"] input')
      .first();

    if (await scoreInput.isVisible().catch(() => false)) {
      const value = await scoreInput.inputValue();
      return parseFloat(value) || 0;
    }

    // Пробуем текстовое значение
    const scoreText = modal
      .locator('[class*="total-score"], [class*="TotalScore"]')
      .first();
    const text = await scoreText.innerText().catch(() => "0");
    return parseFloat(text.replace(/[^0-9.]/g, "")) || 0;
  }

  /**
   * Получить полные данные формы калибровки
   */
  async getFormData() {
    return {
      employeeName: await this.getEmployeeName(),
      totalScore: await this.getTotalScore(),
      characteristic: await this.getCharacteristic(),
      competencies: await this.getCompetencies(),
      isApproved: await this.isApproved(),
      hasMismatchWarning: await this.hasMismatchWarning(),
    };
  }

  // ---------------------------------------------------------------------------
  // Итоговая оценка — числовой ввод
  // ---------------------------------------------------------------------------

  /**
   * Получить input итоговой оценки (числовой режим)
   * @returns {import('@playwright/test').Locator}
   */
  get totalScoreInput() {
    return this.page.locator("#performance-review-overwriting-mean-value");
  }

  /**
   * Проверить, активен ли числовой режим итоговой оценки
   */
  async isTotalScoreNumericMode() {
    return await this.totalScoreInput.isVisible().catch(() => false);
  }

  /**
   * Получить текущее значение итоговой оценки (числовой режим)
   * @returns {Promise<string>} Строковое значение из input
   */
  async getTotalScoreInputValue() {
    return await this.totalScoreInput.inputValue();
  }

  /**
   * Установить числовое значение итоговой оценки
   * @param {number|string} value - Новое значение (напр. 4.2)
   */
  async setTotalScore(value) {
    await this._step(`Установить итоговую оценку = ${value}`, async () => {
      const input = this.totalScoreInput;
      await input.click();
      await input.fill("");
      await input.fill(String(value));
      await input.press("Tab");
      // Ждём blur после Tab (input потеряет фокус)
      await this.page.waitForFunction(
        (id) => document.getElementById(id) !== document.activeElement,
        "performance-review-overwriting-mean-value",
        { timeout: 5000 },
      );
    });
  }

  // ---------------------------------------------------------------------------
  // Итоговая оценка — дропдаун характеристик
  // ---------------------------------------------------------------------------

  /**
   * Получить combobox итоговой оценки (дропдаун режим)
   * @returns {import('@playwright/test').Locator}
   */
  get totalCharacteristicCombobox() {
    // ID рендерится на ДВУХ элементах (div + input) — используем div (видимый контейнер)
    return this.page.locator(
      "div#performance-review-overwriting-characteristics-select",
    );
  }

  /**
   * Получить trigger дропдауна (кликабельная стрелка)
   * ВАЖНО: combobox может быть outside viewport — кликать по trigger!
   * @returns {import('@playwright/test').Locator}
   */
  get totalCharacteristicTrigger() {
    const modal = this.page
      .locator(".react-modal-sheet-container")
      .filter({
        has: this.page.locator("button").filter({ hasText: /сохранить/i }),
      })
      .first();
    return modal.locator(".react-select__indicator").first();
  }

  /**
   * Проверить, активен ли дропдаун режим итоговой оценки
   * NOTE: react-select рендерит input[role="combobox"] с width:1px, opacity:0
   * поэтому проверяем видимый контейнер .react-select__control
   */
  async isTotalScoreDropdownMode() {
    // По ID
    if (
      await this.page
        .locator("#performance-review-overwriting-characteristics-select")
        .isVisible()
        .catch(() => false)
    ) {
      return true;
    }
    // Fallback: ищем .react-select__control внутри модалки
    try {
      const modal = await this.getModal();
      return await modal
        .locator(".react-select__control")
        .first()
        .isVisible()
        .catch(() => false);
    } catch {
      return false;
    }
  }

  /**
   * Выбрать характеристику итоговой оценки из дропдауна
   * @param {string} label - Название характеристики (напр. "Средне", "Высоко")
   */
  async selectTotalCharacteristic(label) {
    await this._step(
      `Выбрать характеристику итоговой = "${label}"`,
      async () => {
        await this.totalCharacteristicTrigger.click();
        // Ждём появления списка опций
        const option = this.page.getByRole("option", { name: label });
        await option.waitFor({ state: "visible", timeout: 5000 });
        await option.click();
        // Ждём закрытия дропдауна (listbox исчезает)
        await this.page
          .getByRole("listbox")
          .waitFor({ state: "hidden", timeout: 5000 })
          .catch(() => {});
      },
    );
  }

  /**
   * Получить все опции дропдауна характеристик
   * @returns {Promise<string[]>} Массив названий характеристик
   */
  async getTotalCharacteristicOptions() {
    await this.totalCharacteristicTrigger.click();
    // Ждём появления listbox после раскрытия дропдауна
    await this.page
      .getByRole("listbox")
      .waitFor({ state: "visible", timeout: 5000 });

    const options = this.page.getByRole("listbox").getByRole("option");
    const count = await options.count();
    const result = [];

    for (let i = 0; i < count; i++) {
      result.push(await options.nth(i).innerText());
    }

    // Закрыть дропдаун нажатием Escape
    await this.page.keyboard.press("Escape");
    return result;
  }

  /**
   * Получить текущую выбранную характеристику (дропдаун режим)
   * react-select показывает выбранное значение в .react-select__single-value
   * @returns {Promise<string|null>}
   */
  async getSelectedTotalCharacteristic() {
    const modal = this.page
      .locator(".react-modal-sheet-container")
      .filter({
        has: this.page.locator("button").filter({ hasText: /сохранить/i }),
      })
      .first();
    const singleValue = modal.locator(".react-select__single-value").first();
    if (await singleValue.isVisible().catch(() => false)) {
      return (await singleValue.innerText()).trim();
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Информер калибровки итоговой
  // ---------------------------------------------------------------------------

  /**
   * Получить локатор информера
   * Текст: "Итоговая оценка изменена вручную. Оценки по компетенциям пересчитаны не будут."
   * @returns {import('@playwright/test').Locator}
   */
  get infoBanner() {
    return this.page.getByText("Итоговая оценка изменена вручную");
  }

  /**
   * Проверить видимость информера
   * @returns {Promise<boolean>}
   */
  async isInfoBannerVisible() {
    return await this.infoBanner.isVisible().catch(() => false);
  }

  /**
   * Получить полный текст информера
   * @returns {Promise<string|null>}
   */
  async getInfoBannerText() {
    if (!(await this.isInfoBannerVisible())) return null;
    return (await this.infoBanner.innerText()).trim();
  }

  // ---------------------------------------------------------------------------
  // Lock checkbox (улучшенная версия для реального DOM)
  // ---------------------------------------------------------------------------

  /**
   * Получить чекбокс "Запретить дальнейшее изменение оценки руководителем"
   * @returns {import('@playwright/test').Locator}
   */
  get lockCheckbox() {
    return this.page.getByRole("checkbox", {
      name: "Запретить дальнейшее изменение оценки руководителем",
    });
  }

  /**
   * Проверить, виден ли чекбокс блокировки (реальный DOM)
   */
  async isLockCheckboxVisible() {
    return await this.lockCheckbox.isVisible().catch(() => false);
  }

  /**
   * Установить состояние чекбокса блокировки
   * @param {boolean} locked - true = заблокировать
   */
  async setLocked(locked) {
    await this._step(
      `${locked ? "Заблокировать" : "Разблокировать"} изменение оценки`,
      async () => {
        const checkbox = this.lockCheckbox;
        const isChecked = await checkbox.isChecked().catch(() => false);
        if (isChecked !== locked) {
          // Click parent generic element (кастомный чекбокс)
          await checkbox.locator("..").click();
          // Ждём изменения состояния чекбокса блокировки
          const handle = await checkbox.elementHandle();
          if (handle) {
            await this.page.waitForFunction(
              ({ el, target }) => el.checked === target,
              { el: handle, target: locked },
              { timeout: 5000 },
            );
          }
        }
      },
    );
  }

  /**
   * Проверить, заблокирована ли оценка
   */
  async isLocked() {
    return await this.lockCheckbox.isChecked().catch(() => false);
  }
}
