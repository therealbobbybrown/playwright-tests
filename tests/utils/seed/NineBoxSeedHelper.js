/**
 * Хелпер для создания NineBox настроек через API
 * NineBox требует:
 * 1. Настроенные компетенции для осей X и Y
 * 2. Включённые настройки NineBox
 */

import { TestDataHelper } from "../TestDataHelper.js";
import { AuthAPI, getCredentials } from "../api/index.js";

export class NineBoxSeedHelper {
  /**
   * @param {import('@playwright/test').APIRequestContext} request - Playwright request context
   */
  constructor(request) {
    this.request = request;
    this.apiClient = null;
    this.createdIds = {
      competencies: [],
      competenceScales: [],
    };
    this.nineboxEnabled = false;
  }

  /**
   * Инициализировать API клиент с авторизацией
   * @param {'admin' | 'user' | 'manager'} role
   */
  async init(role = "admin") {
    this.apiClient = new AuthAPI(this.request);
    const { email, password } = getCredentials(role);
    const { response } = await this.apiClient.signIn(email, password);

    if (!response.ok()) {
      throw new Error(
        `NineBoxSeedHelper: не удалось авторизоваться как ${role}`,
      );
    }
  }

  /**
   * Получить существующие компетенции
   * GET /manager/competencies
   * @returns {Promise<Array>}
   */
  async getCompetencies() {
    if (!this.apiClient) {
      throw new Error(
        "NineBoxSeedHelper не инициализирован. Вызовите init() первым.",
      );
    }

    const response = await this.apiClient.get("/manager/competencies");

    if (!response.ok()) {
      throw new Error("Не удалось получить список компетенций");
    }

    const data = await response.json();
    return Array.isArray(data) ? data : data.items || [];
  }

  /**
   * Получить существующие шкалы компетенций
   * GET /manager/competence-scales
   * @returns {Promise<Array>}
   */
  async getCompetenceScales() {
    if (!this.apiClient) {
      throw new Error(
        "NineBoxSeedHelper не инициализирован. Вызовите init() первым.",
      );
    }

    const response = await this.apiClient.get("/manager/competence-scales");

    if (!response.ok()) {
      throw new Error("Не удалось получить список шкал компетенций");
    }

    const data = await response.json();
    return Array.isArray(data) ? data : data.items || [];
  }

  /**
   * Создать шкалу компетенций
   * POST /manager/competence-scales
   * @param {Object} options
   * @returns {Promise<{id: string}>}
   */
  async seedCompetenceScale(options = {}) {
    if (!this.apiClient) {
      throw new Error(
        "NineBoxSeedHelper не инициализирован. Вызовите init() первым.",
      );
    }

    const uniqueTitle = TestDataHelper.generateUniqueName(
      options.title || "Шкала NineBox",
    );

    const response = await this.apiClient.post("/manager/competence-scales", {
      title: uniqueTitle,
      levels: options.levels || [
        { title: "Низкий", value: 1 },
        { title: "Средний", value: 2 },
        { title: "Высокий", value: 3 },
      ],
      ...options,
    });

    if (!response.ok()) {
      const error = await response.text();
      throw new Error(`Не удалось создать шкалу компетенций: ${error}`);
    }

    const data = await response.json();
    const id = data.id;
    this.createdIds.competenceScales.push(id);

    return { id, title: uniqueTitle };
  }

  /**
   * Создать компетенцию
   * POST /manager/competencies
   * @param {Object} options
   * @returns {Promise<{id: string}>}
   */
  async seedCompetence(options = {}) {
    if (!this.apiClient) {
      throw new Error(
        "NineBoxSeedHelper не инициализирован. Вызовите init() первым.",
      );
    }

    const uniqueTitle = TestDataHelper.generateUniqueName(
      options.title || "Компетенция NineBox",
    );

    const response = await this.apiClient.post("/manager/competencies", {
      title: uniqueTitle,
      competenceScaleId: options.competenceScaleId,
      ...options,
    });

    if (!response.ok()) {
      const error = await response.text();
      throw new Error(`Не удалось создать компетенцию: ${error}`);
    }

    const data = await response.json();
    const id = data.id;
    this.createdIds.competencies.push(id);

    return { id, title: uniqueTitle };
  }

  /**
   * Получить текущие настройки NineBox
   * GET /manager/ninebox-settings
   * @returns {Promise<Object>}
   */
  async getSettings() {
    if (!this.apiClient) {
      throw new Error(
        "NineBoxSeedHelper не инициализирован. Вызовите init() первым.",
      );
    }

    const response = await this.apiClient.get("/manager/ninebox-settings");

    if (!response.ok()) {
      return null;
    }

    return response.json();
  }

  /**
   * Создать или обновить настройки NineBox
   * POST /manager/ninebox-settings
   * @param {Object} options
   * @returns {Promise<Object>}
   */
  async updateSettings(options = {}) {
    if (!this.apiClient) {
      throw new Error(
        "NineBoxSeedHelper не инициализирован. Вызовите init() первым.",
      );
    }

    const response = await this.apiClient.post("/manager/ninebox-settings", {
      matrixSize: options.matrixSize || 3,
      cellsTitles:
        options.cellsTitles ||
        this.getDefaultCellsTitles(options.matrixSize || 3),
      yCompetenciesIds: options.yCompetenciesIds || [],
      xCompetenciesIds: options.xCompetenciesIds || [],
    });

    if (!response.ok()) {
      const error = await response.text();
      throw new Error(`Не удалось обновить настройки NineBox: ${error}`);
    }

    return response.json();
  }

  /**
   * Включить NineBox
   * POST /manager/ninebox-settings/enable
   * @returns {Promise<Object>}
   */
  async enable() {
    if (!this.apiClient) {
      throw new Error(
        "NineBoxSeedHelper не инициализирован. Вызовите init() первым.",
      );
    }

    const response = await this.apiClient.post(
      "/manager/ninebox-settings/enable",
    );

    if (!response.ok()) {
      const error = await response.text();
      throw new Error(`Не удалось включить NineBox: ${error}`);
    }

    this.nineboxEnabled = true;
    return response.json();
  }

  /**
   * Выключить NineBox
   * POST /manager/ninebox-settings/disable
   * @returns {Promise<Object>}
   */
  async disable() {
    if (!this.apiClient) {
      throw new Error(
        "NineBoxSeedHelper не инициализирован. Вызовите init() первым.",
      );
    }

    const response = await this.apiClient.post(
      "/manager/ninebox-settings/disable",
    );

    if (!response.ok()) {
      const error = await response.text();
      throw new Error(`Не удалось выключить NineBox: ${error}`);
    }

    this.nineboxEnabled = false;
    return response.json();
  }

  /**
   * Получить матрицу NineBox
   * POST /manager/ninebox/get
   * @param {Object} options
   * @returns {Promise<Object>}
   */
  async getMatrix(options = {}) {
    if (!this.apiClient) {
      throw new Error(
        "NineBoxSeedHelper не инициализирован. Вызовите init() первым.",
      );
    }

    const response = await this.apiClient.post("/manager/ninebox/get", {
      performanceReviewId: options.performanceReviewId,
      preformanceReviewRevisionId: options.performanceReviewRevisionId,
      usersIds: options.usersIds,
    });

    if (!response.ok()) {
      return null;
    }

    return response.json();
  }

  /**
   * Полностью настроить NineBox (создать компетенции если нужно, настроить и включить)
   * @param {Object} options
   * @returns {Promise<{settingsId: string, xCompetencies: Array, yCompetencies: Array}>}
   */
  async seedNineBox(options = {}) {
    if (!this.apiClient) {
      throw new Error(
        "NineBoxSeedHelper не инициализирован. Вызовите init() первым.",
      );
    }

    // Проверяем текущие настройки
    const currentSettings = await this.getSettings();
    if (currentSettings && currentSettings.isEnabled) {
      // NineBox уже настроен
      return {
        settingsId: currentSettings.id,
        xCompetencies: currentSettings.xCompetenciesIds || [],
        yCompetencies: currentSettings.yCompetenciesIds || [],
        alreadyExists: true,
      };
    }

    // Получаем существующие компетенции
    let competencies = await this.getCompetencies();

    // Если компетенций недостаточно, создаём новые
    if (competencies.length < 2) {
      // Сначала нужна шкала
      let scales = await this.getCompetenceScales();
      let scaleId;

      if (scales.length === 0) {
        const scale = await this.seedCompetenceScale({
          title: "Шкала для NineBox",
        });
        scaleId = scale.id;
      } else {
        scaleId = scales[0].id;
      }

      // Создаём компетенции
      const comp1 = await this.seedCompetence({
        title: "Потенциал (NineBox Y)",
        competenceScaleId: scaleId,
      });
      const comp2 = await this.seedCompetence({
        title: "Результативность (NineBox X)",
        competenceScaleId: scaleId,
      });

      competencies = [{ id: comp1.id }, { id: comp2.id }];
    }

    // Настраиваем NineBox
    const xCompetenciesIds = [competencies[0].id];
    const yCompetenciesIds = competencies[1]
      ? [competencies[1].id]
      : [competencies[0].id];

    await this.updateSettings({
      matrixSize: options.matrixSize || 3,
      xCompetenciesIds,
      yCompetenciesIds,
    });

    // Включаем NineBox
    const result = await this.enable();

    return {
      settingsId: result?.id,
      xCompetencies: xCompetenciesIds,
      yCompetencies: yCompetenciesIds,
      alreadyExists: false,
    };
  }

  /**
   * Получить стандартные заголовки ячеек для матрицы NineBox
   * @param {number} size - Размер матрицы (обычно 3)
   * @returns {Array<Array<string>>}
   */
  getDefaultCellsTitles(size = 3) {
    if (size === 3) {
      return [
        ["Звезда", "Растущая звезда", "Потенциальный работник"],
        [
          "Опытный профессионал",
          "Ключевой работник",
          "Противоречивый работник",
        ],
        [
          "Эффективный специалист",
          "Средний работник",
          "Неэффективный работник",
        ],
      ];
    }

    // Для других размеров генерируем пустые заголовки
    return Array(size)
      .fill(null)
      .map(() => Array(size).fill(""));
  }

  /**
   * Удалить компетенцию через API
   * DELETE /manager/competencies/{id}
   * @param {string} id - ID компетенции
   */
  async deleteCompetence(id) {
    if (!this.apiClient) return;

    try {
      await this.apiClient.delete(`/manager/competencies/${id}`);
    } catch (error) {
      console.warn(`Не удалось удалить компетенцию ${id}:`, error.message);
    }
  }

  /**
   * Удалить шкалу компетенций через API
   * DELETE /manager/competence-scales/{id}
   * @param {string} id - ID шкалы
   */
  async deleteCompetenceScale(id) {
    if (!this.apiClient) return;

    try {
      await this.apiClient.delete(`/manager/competence-scales/${id}`);
    } catch (error) {
      console.warn(
        `Не удалось удалить шкалу компетенций ${id}:`,
        error.message,
      );
    }
  }

  /**
   * Очистить все созданные тестовые данные
   * Вызывать в afterEach
   */
  async cleanup() {
    if (!this.apiClient) {
      console.warn(
        "NineBoxSeedHelper: apiClient не инициализирован, очистка пропущена",
      );
      return;
    }

    try {
      // Выключаем NineBox если был включён нами
      if (this.nineboxEnabled) {
        await this.disable();
      }

      // Удаляем компетенции
      for (const id of this.createdIds.competencies) {
        await this.deleteCompetence(id);
      }

      // Удаляем шкалы
      for (const id of this.createdIds.competenceScales) {
        await this.deleteCompetenceScale(id);
      }

      // Очищаем массивы
      this.createdIds = {
        competencies: [],
        competenceScales: [],
      };
    } catch (error) {
      console.error("Ошибка при очистке NineBox данных:", error);
    }
  }
}
