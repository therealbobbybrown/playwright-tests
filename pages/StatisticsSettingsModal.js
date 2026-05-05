// pages/StatisticsSettingsModal.js
// Page Object для модального окна "Настройка статистики" в Performance Review
// Активируется через feature flag: ?feature=statisticsSettings

import { expect } from "@playwright/test";
import { BasePage } from "./BasePage.js";
import { TIMEOUTS } from "../tests/utils/constants.js";

/**
 * Page Object для модального окна "Настройка статистики"
 *
 * Функционал:
 * - Выбор источника итоговой оценки (все направления / только руководитель)
 * - Настройка компетенций и их весов
 * - Включение калибровки
 * - Настройка текстовых характеристик оценки (низко/средне/высоко)
 *
 * Активация: добавить ?feature=statisticsSettings к URL PR
 */
export class StatisticsSettingsModal extends BasePage {
  constructor(page, testInfo) {
    super(page, testInfo);

    // Модальное окно
    this.modal = this.page
      .locator('[class*="react-modal-sheet-container"]')
      .filter({ hasText: "Настройка статистики" })
      .first();
    this.closeButton = this.modal.locator('button[class*="close"]').first();
    this.saveButton = this.modal
      .getByRole("button", { name: /сохранить/i })
      .first();

    // Навигация: вкладка «Результаты» и кнопка настроек (шестерёнка)
    // Используем Tabs_button чтобы не матчить кнопки "Результаты" в строках таблицы сотрудников
    this.resultsTab = this.page
      .locator('button[class*="Tabs_button"]')
      .filter({ hasText: /^Результаты$/i });
    this.settingsButton = this.page.locator('button[class*="settings-button"]');

    // Источник итоговой оценки (radio buttons внутри <label>)
    this.allDirectionsCard = this.modal
      .locator("label")
      .filter({ hasText: /из оценок разных направлений/i })
      .first();
    this.managerOnlyCard = this.modal
      .locator("label")
      .filter({ hasText: /только из оценок руководителя/i })
      .first();

    // Тоглы — через стабильные ID чекбоксов
    this.selectCompetenciesToggle = this.page.locator(
      "#performance-review-settings-statistics-enableCompetenceWeights",
    );
    this.allowCalibrationToggle = this.page.locator(
      "#performance-review-settings-statistics-enableResponsesOverwriting",
    );
    this.showWeightsInCalibrationToggle = this.page.locator(
      "#performance-review-settings-statistics-displayCompetenceWeightsForOverwriting",
    );
    this.textCharacteristicsToggle = this.page.locator(
      "#performance-review-settings-statistics-enableCustomCharacteristics",
    );

    // Тогл "Показывать только текстовую характеристику оценки"
    // API field: enableOnlyCustomCharacteristics
    this.showOnlyCustomToggle = this.page.locator(
      "#performance-review-settings-statistics-enableOnlyCustomCharacteristics",
    );

    // Ряды характеристик (диапазонов) — фильтруем по наличию input[name="title"],
    // чтобы не матчить другие ListItem (коэффициенты направлений и т.д.)
    this.characteristicRows = this.modal
      .locator('[class*="ListItem_listItem"]')
      .filter({ has: this.page.locator('input[name="title"]') });
  }

  // ---------------------------------------------------------------------------
  // Открытие/закрытие
  // ---------------------------------------------------------------------------

  /**
   * Открыть модальное окно настроек статистики
   * (клик по вкладке «Результаты» → клик по шестерёнке → ожидание модали)
   */
  async open() {
    await this._step("Открыть модальное окно настроек статистики", async () => {
      // Ждём появления вкладки «Результаты» — страница может загружаться медленно
      await this.resultsTab.waitFor({
        state: "visible",
        timeout: TIMEOUTS.ELEMENT_VISIBLE,
      });
      // Ждём пока вкладка перестанет быть disabled (parent div перехватывает клики).
      // При параллельном запуске PR может не успеть «стартовать» → таб disabled дольше.
      // Используем polling вместо elementHandle (handle может стать stale).
      await this.page
        .locator('button[class*="Tabs_button"]:not([class*="disabled"])')
        .filter({ hasText: /^Результаты$/i })
        .waitFor({ state: "visible", timeout: 30000 });
      await this.resultsTab.click();
      // Ждём появления кнопки настроек после переключения вкладки
      await this.settingsButton.waitFor({
        state: "visible",
        timeout: TIMEOUTS.ELEMENT_VISIBLE,
      });
      await this.settingsButton.click();
      await this.modal.waitFor({
        state: "visible",
        timeout: TIMEOUTS.ELEMENT_VISIBLE,
      });
    });
  }

  /**
   * Проверить, что модальное окно открыто
   */
  async assertOpened() {
    await this._step("Модальное окно настроек статистики открыто", async () => {
      await this.modal.waitFor({
        state: "visible",
        timeout: TIMEOUTS.ELEMENT_VISIBLE,
      });
    });
  }

  /**
   * Закрыть модальное окно (без сохранения)
   */
  async close() {
    await this._step("Закрыть модальное окно настроек", async () => {
      await this.closeButton.click();
      await this.modal.waitFor({
        state: "hidden",
        timeout: TIMEOUTS.MODAL_CLOSE,
      });
    });
  }

  /**
   * Сохранить настройки
   */
  async save() {
    await this._step("Сохранить настройки статистики", async () => {
      await this.saveButton.click();
      await this.modal.waitFor({
        state: "hidden",
        timeout: TIMEOUTS.MODAL_CLOSE,
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Источник итоговой оценки
  // ---------------------------------------------------------------------------

  /**
   * Выбрать источник итоговой оценки: "Из оценок разных направлений"
   */
  async selectAllDirections() {
    await this._step('Выбрать "Из оценок разных направлений"', async () => {
      await this.allDirectionsCard.click();
      // Ждём когда React обновит CSS-класс button--active
      await this.page.waitForFunction(
        (el) => el.classList.value.includes("button--active"),
        await this.allDirectionsCard.elementHandle(),
        { timeout: 5000 },
      );
    });
  }

  /**
   * Выбрать источник итоговой оценки: "Только из оценок руководителя"
   */
  async selectManagerOnly() {
    await this._step('Выбрать "Только из оценок руководителя"', async () => {
      await this.managerOnlyCard.click();
      // Ждём когда React обновит CSS-класс button--active
      await this.page.waitForFunction(
        (el) => el.classList.value.includes("button--active"),
        await this.managerOnlyCard.elementHandle(),
        { timeout: 5000 },
      );
    });
  }

  /**
   * Проверить, что выбран вариант "Все направления"
   */
  async assertAllDirectionsSelected() {
    await this._step('Проверить выбор "Все направления"', async () => {
      // ImageRadioButtons не обновляет input.checked — состояние в CSS-классе button--active
      const hasActive = await this.allDirectionsCard.evaluate((el) =>
        el.classList.value.includes("button--active"),
      );
      if (!hasActive) {
        throw new Error('Вариант "Все направления" не выбран');
      }
    });
  }

  /**
   * Проверить, что выбран вариант "Только руководитель"
   */
  async assertManagerOnlySelected() {
    await this._step('Проверить выбор "Только руководитель"', async () => {
      // ImageRadioButtons не обновляет input.checked — состояние в CSS-классе button--active
      const hasActive = await this.managerOnlyCard.evaluate((el) =>
        el.classList.value.includes("button--active"),
      );
      if (!hasActive) {
        throw new Error('Вариант "Только руководитель" не выбран');
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Тоглы
  // ---------------------------------------------------------------------------

  /**
   * Включить/выключить выбор компетенций
   * @param {boolean} enable - true = включить
   */
  async toggleSelectCompetencies(enable) {
    await this._step(
      `${enable ? "Включить" : "Выключить"} выбор компетенций`,
      async () => {
        await this._setToggle(this.selectCompetenciesToggle, enable);
      },
    );
  }

  /**
   * Включить/выключить калибровку
   * @param {boolean} enable - true = включить
   */
  async toggleCalibration(enable) {
    await this._step(
      `${enable ? "Включить" : "Выключить"} калибровку`,
      async () => {
        await this._setToggle(this.allowCalibrationToggle, enable);
      },
    );
  }

  /**
   * Включить/выключить отображение весов в форме калибровки
   * @param {boolean} enable - true = включить
   */
  async toggleShowWeightsInCalibration(enable) {
    await this._step(
      `${enable ? "Включить" : "Выключить"} отображение весов`,
      async () => {
        await this._setToggle(this.showWeightsInCalibrationToggle, enable);
      },
    );
  }

  /**
   * Включить/выключить текстовые характеристики
   * @param {boolean} enable - true = включить
   */
  async toggleTextCharacteristics(enable) {
    await this._step(
      `${enable ? "Включить" : "Выключить"} текстовые характеристики`,
      async () => {
        await this._setToggle(this.textCharacteristicsToggle, enable);
      },
    );
  }

  // ---------------------------------------------------------------------------
  // Показывать только текстовую характеристику
  // API field: enableOnlyCustomCharacteristics
  // ---------------------------------------------------------------------------

  /**
   * Проверить, виден ли чек-бокс "Показывать только текстовую характеристику оценки"
   * Чек-бокс виден только если enableCustomCharacteristics=true
   *
   * @returns {Promise<boolean>} true если чек-бокс виден
   */
  async isShowOnlyCustomVisible() {
    try {
      await this.showOnlyCustomToggle.waitFor({
        state: "visible",
        timeout: 2000,
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Проверить, включен ли чек-бокс "Показывать только текстовую характеристику оценки"
   *
   * @returns {Promise<boolean>} true если чек-бокс включен (checked)
   */
  async isShowOnlyCustomEnabled() {
    const isVisible = await this.isShowOnlyCustomVisible();
    if (!isVisible) return false;
    return await this.showOnlyCustomToggle.isChecked();
  }

  /**
   * Включить/выключить "Показывать только текстовую характеристику оценки"
   *
   * @param {boolean} enable - true = включить, false = выключить
   */
  async toggleShowOnlyCustom(enable) {
    await this._step(
      `${enable ? "Включить" : "Выключить"} "только текстовую характеристику"`,
      async () => {
        const isVisible = await this.isShowOnlyCustomVisible();
        if (!isVisible) {
          throw new Error(
            'Чек-бокс "Показывать только текстовую характеристику" не виден. Убедитесь что enableCustomCharacteristics=true',
          );
        }
        await this._setToggle(this.showOnlyCustomToggle, enable);
      },
    );
  }

  /**
   * Управление тоглом через клик по родительскому Toggler_toggler.
   *
   * Все тоглы в модали — это input[type="checkbox"] внутри компонента Toggler:
   *   div.Toggler_toggler-group
   *     div.Toggler_toggler      ← кликаем сюда (прямой родитель чекбокса)
   *       input[type="checkbox"] ← checkboxLocator (со стабильным ID)
   *     div.Toggler_label        ← <div>, НЕ <label>
   *
   * ВАЖНО: клик по toggler-group НЕ работает — обработчик React на Toggler_toggler.
   *
   * @param {import('@playwright/test').Locator} checkboxLocator - локатор checkbox input
   * @param {boolean} enable - целевое состояние
   */
  async _setToggle(checkboxLocator, enable) {
    const isChecked = await checkboxLocator.isChecked();

    if (isChecked !== enable) {
      // Клик по прямому родителю (Toggler_toggler) — именно на нём висит onClick
      const toggler = checkboxLocator.locator("..");
      await toggler.scrollIntoViewIfNeeded();
      await toggler.click();

      // Ждём изменения состояния чекбокса
      const checkboxId = await checkboxLocator.getAttribute("id");
      if (checkboxId) {
        await this.page.waitForFunction(
          ({ id, target }) => {
            const el = document.getElementById(id);
            return el && el.checked === target;
          },
          { id: checkboxId, target: enable },
          { timeout: 5000 },
        );
      } else {
        // Fallback: ожидание React re-render если нет ID
        // Ждём завершения анимации переключения тогла
        await this.page
          .waitForLoadState("networkidle", { timeout: TIMEOUTS.ANIMATION })
          .catch(() => {});
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Характеристики оценки
  // ---------------------------------------------------------------------------

  /**
   * Получить количество характеристик (диапазонов)
   */
  async getCharacteristicsCount() {
    return await this.characteristicRows.count();
  }

  /**
   * Изменить верхнюю границу диапазона
   * @param {number} index - Индекс диапазона (0-based)
   * @param {number} value - Новое значение (проценты)
   */
  async setCharacteristicUpperBound(index, value) {
    await this._step(
      `Установить границу диапазона ${index + 1} = ${value}%`,
      async () => {
        const input = this.page.locator(
          `#performance-review-settings-characteristics-threshold-${index}`,
        );
        await input.fill(String(value));
        await input.press("Tab");
        // Ждём пока input потеряет фокус (blur после Tab)
        await this.page.waitForFunction(
          (id) => document.getElementById(id) !== document.activeElement,
          `performance-review-settings-characteristics-threshold-${index}`,
          { timeout: 5000 },
        );
      },
    );
  }

  /**
   * Изменить текст характеристики
   * @param {number} index - Индекс диапазона (0-based)
   * @param {string} text - Новый текст
   */
  async setCharacteristicText(index, text) {
    await this._step(
      `Установить текст характеристики ${index + 1} = "${text}"`,
      async () => {
        const row = this.characteristicRows.nth(index);
        const input = row.locator('input[name="title"]');
        await input.scrollIntoViewIfNeeded();
        await input.fill(text);
        // Ждём пока React обработает ввод и значение закрепится в input
        await expect(input).toHaveValue(text, { timeout: 5000 });
      },
    );
  }

  /**
   * Добавить новую характеристику
   */
  async addCharacteristic() {
    await this._step("Добавить характеристику", async () => {
      const countBefore = await this.characteristicRows.count();
      const addButton = this.modal
        .getByRole("button", { name: /^добавить$/i })
        .first();
      await addButton.scrollIntoViewIfNeeded();
      await addButton.click();
      // Ждём появления новой строки характеристики
      await expect(this.characteristicRows).toHaveCount(countBefore + 1, {
        timeout: 5000,
      });
    });
  }

  /**
   * Удалить характеристику по индексу
   * @param {number} index - Индекс для удаления
   */
  async removeCharacteristic(index) {
    await this._step(`Удалить характеристику ${index + 1}`, async () => {
      const countBefore = await this.characteristicRows.count();
      const row = this.characteristicRows.nth(index);
      const deleteButton = row.locator("button").first();
      await deleteButton.click();
      // Ждём удаления строки характеристики
      await expect(this.characteristicRows).toHaveCount(countBefore - 1, {
        timeout: 5000,
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Компетенции и веса
  // ---------------------------------------------------------------------------

  /**
   * Получить список компетенций
   */
  async getCompetencies() {
    const competencyGroups = this.modal
      .locator('[class*="Toggler_toggler-group"]')
      .filter({
        has: this.page.locator('input[name="competenceGroupEnabled"]'),
      });
    const count = await competencyGroups.count();
    const result = [];

    for (let i = 0; i < count; i++) {
      const group = competencyGroups.nth(i);
      const name = await group
        .locator('[class*="Toggler_label"]')
        .innerText()
        .catch(() => `Компетенция ${i + 1}`);
      const checkbox = group.locator('input[type="checkbox"]');
      const isEnabled = await checkbox.isChecked().catch(() => true);

      const weightInput = group
        .locator("..")
        .locator('input[name="weightPercent"]');
      const weight = await weightInput.inputValue().catch(() => "0");

      result.push({ name, weight: parseFloat(weight), isEnabled });
    }

    return result;
  }

  /**
   * Включить/выключить компетенцию
   * @param {string|number} competencyNameOrIndex - Имя или индекс компетенции
   * @param {boolean} enable - true = включить
   */
  async toggleCompetency(competencyNameOrIndex, enable) {
    await this._step(
      `${enable ? "Включить" : "Выключить"} компетенцию "${competencyNameOrIndex}"`,
      async () => {
        const competencyGroups = this.modal
          .locator('[class*="Toggler_toggler-group"]')
          .filter({
            has: this.page.locator('input[name="competenceGroupEnabled"]'),
          });

        let group;
        if (typeof competencyNameOrIndex === "number") {
          group = competencyGroups.nth(competencyNameOrIndex);
        } else {
          group = competencyGroups
            .filter({ hasText: competencyNameOrIndex })
            .first();
        }

        const checkbox = group.locator('input[type="checkbox"]');
        const isChecked = await checkbox.isChecked().catch(() => false);

        if (isChecked !== enable) {
          await group.click();
          // Ждём изменения состояния чекбокса компетенции
          if (enable) {
            await expect(checkbox).toBeChecked({ timeout: 5000 });
          } else {
            await expect(checkbox).not.toBeChecked({ timeout: 5000 });
          }
        }
      },
    );
  }

  /**
   * Установить вес компетенции
   * @param {string|number} competencyNameOrIndex - Имя или индекс компетенции
   * @param {number} weight - Вес в процентах
   */
  async setCompetencyWeight(competencyNameOrIndex, weight) {
    await this._step(
      `Установить вес компетенции "${competencyNameOrIndex}" = ${weight}%`,
      async () => {
        const competencyGroups = this.modal
          .locator('[class*="Toggler_toggler-group"]')
          .filter({
            has: this.page.locator('input[name="competenceGroupEnabled"]'),
          });

        let group;
        if (typeof competencyNameOrIndex === "number") {
          group = competencyGroups.nth(competencyNameOrIndex);
        } else {
          group = competencyGroups
            .filter({ hasText: competencyNameOrIndex })
            .first();
        }

        const container = group.locator("..");
        const input = container.locator('input[name="weightPercent"]');
        await input.fill(String(weight));
        await input.press("Tab");
        // Ждём пока значение закрепится в input
        await expect(input).toHaveValue(String(weight), { timeout: 5000 });
      },
    );
  }

  // ---------------------------------------------------------------------------
  // Комплексные сценарии
  // ---------------------------------------------------------------------------

  /**
   * Настроить калибровку с параметрами по умолчанию
   */
  async configureCalibrationDefaults() {
    await this._step("Настроить калибровку по умолчанию", async () => {
      await this.selectManagerOnly();
      await this.toggleSelectCompetencies(true);
      await this.toggleCalibration(true);
      await this.toggleShowWeightsInCalibration(true);
      await this.toggleTextCharacteristics(true);
    });
  }

  /**
   * Получить текущие настройки
   */
  async getCurrentSettings() {
    const settings = {
      source: null,
      selectCompetencies: false,
      allowCalibration: false,
      showWeights: false,
      textCharacteristics: false,
      showOnlyCustomCharacteristics: false,
      characteristics: [],
      competencies: [],
    };

    // Источник — ImageRadioButtons использует CSS-класс button--active, не input.checked
    const allDirectionsActive = await this.allDirectionsCard
      .evaluate((el) => el.classList.value.includes("button--active"))
      .catch(() => false);
    settings.source = allDirectionsActive ? "allDirections" : "managerOnly";

    // Тоглы
    settings.selectCompetencies = await this._isToggleEnabled(
      this.selectCompetenciesToggle,
    );
    settings.allowCalibration = await this._isToggleEnabled(
      this.allowCalibrationToggle,
    );
    settings.showWeights = await this._isToggleEnabled(
      this.showWeightsInCalibrationToggle,
    );
    settings.textCharacteristics = await this._isToggleEnabled(
      this.textCharacteristicsToggle,
    );
    settings.showOnlyCustomCharacteristics =
      await this.isShowOnlyCustomEnabled();

    // Компетенции
    settings.competencies = await this.getCompetencies();

    return settings;
  }

  async _isToggleEnabled(checkboxLocator) {
    return await checkboxLocator.isChecked().catch(() => false);
  }
}
