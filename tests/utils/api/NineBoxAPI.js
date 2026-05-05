// tests/utils/api/NineBoxAPI.js
// API клиент для работы с NineBox матрицей

import { createHash } from "crypto";
import { APIClient } from "./APIClient.js";

/**
 * Генерация fingerPrint как MD5 хеш
 * @returns {string}
 */
function generateFingerPrint() {
  const timestamp = Date.now().toString();
  return createHash("md5").update(timestamp).digest("hex");
}

/**
 * API клиент для работы с NineBox
 * Endpoints: /manager/ninebox/*, /private/ninebox/*, /protected/ninebox/*
 */
export class NineBoxAPI extends APIClient {
  constructor(request, token = null) {
    super(request, token);
    this.fingerPrint = generateFingerPrint();
  }

  /**
   * Авторизация пользователя
   * @param {string} email
   * @param {string} password
   * @returns {Promise<Object>}
   */
  async signIn(email, password) {
    const { data } = await this.post(
      "/auth/account/signin",
      {
        email,
        password,
        fingerPrint: this.fingerPrint,
        permissions: [],
      },
      { timeout: 60_000 },
    );
    if (data?.accessToken) {
      this.setToken(data.accessToken);
    }
    return data;
  }

  // ==================== SETTINGS (Manager) ====================

  /**
   * Получить настройки NineBox (manager)
   * GET /manager/ninebox-settings/
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getManagerSettings() {
    return this.get("/manager/ninebox-settings/");
  }

  /**
   * Обновить настройки NineBox
   * POST /manager/ninebox-settings/
   * @param {Object} data - Настройки
   * @param {number} [data.matrixSize] - Размер матрицы
   * @param {Object} [data.cellsTitles] - Названия ячеек
   * @param {number[]} [data.yCompetenciesIds] - ID компетенций по оси Y
   * @param {number[]} [data.xCompetenciesIds] - ID компетенций по оси X
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async updateSettings({
    matrixSize,
    cellsTitles,
    yCompetenciesIds,
    xCompetenciesIds,
  } = {}) {
    return this.post("/manager/ninebox-settings/", {
      matrixSize,
      cellsTitles,
      yCompetenciesIds,
      xCompetenciesIds,
    });
  }

  /**
   * Включить NineBox
   * POST /manager/ninebox-settings/enable/
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async enable() {
    return this.post("/manager/ninebox-settings/enable/");
  }

  /**
   * Отключить NineBox
   * POST /manager/ninebox-settings/disable/
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async disable() {
    return this.post("/manager/ninebox-settings/disable/");
  }

  /**
   * Гарантированно включить NineBox (идемпотентно).
   * Если уже включён — ничего не делает. Если отключён — включает.
   * Устойчив к гонкам при параллельном запуске тестов.
   * @returns {Promise<Object>} Актуальные настройки с isEnabled=true
   */
  async ensureEnabled() {
    const { data } = await this.getManagerSettings();
    if (!data.isEnabled) {
      await this.enable();
      const { data: updated } = await this.getManagerSettings();
      return updated;
    }
    return data;
  }

  // ==================== SETTINGS (Private) ====================

  /**
   * Получить настройки NineBox (private)
   * GET /private/ninebox-settings/
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getPrivateSettings() {
    return this.get("/private/ninebox-settings/");
  }

  // ==================== MATRIX (Manager) ====================

  /**
   * Получить матрицу NineBox (manager)
   * POST /manager/ninebox/get/
   * @param {Object} [params] - Параметры
   * @param {number} [params.performanceReviewId] - ID Performance Review
   * @param {number} [params.preformanceReviewRevisionId] - ID ревизии
   * @param {number[]} [params.usersIds] - ID пользователей
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getManagerMatrix(params = {}) {
    return this.post("/manager/ninebox/get/", params);
  }

  /**
   * Поиск в матрице NineBox (manager)
   * POST /manager/ninebox/search/get/
   * @param {Object} [params] - Параметры поиска
   * @param {number} [params.limit] - Лимит
   * @param {number} [params.offset] - Смещение
   * @param {boolean} [params.actualize] - Актуализировать данные
   * @param {number} [params.performanceReviewId] - ID Performance Review
   * @param {number} [params.preformanceReviewRevisionId] - ID ревизии
   * @param {number[]} [params.usersIds] - ID пользователей
   * @param {string} [params.q] - Поисковый запрос
   * @param {number} [params.xCoord] - Координата X
   * @param {number} [params.yCoord] - Координата Y
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async searchManager(params = {}) {
    return this.post("/manager/ninebox/search/get/", params);
  }

  // ==================== MATRIX (Protected) ====================

  /**
   * Получить матрицу NineBox (protected)
   * POST /protected/ninebox/get/
   * @param {Object} [params] - Параметры
   * @param {number} [params.performanceReviewId] - ID Performance Review
   * @param {number} [params.preformanceReviewRevisionId] - ID ревизии
   * @param {string} [params.usersSubset] - Подмножество пользователей
   * @param {number[]} [params.usersIds] - ID пользователей
   * @param {number[]} [params.departmentsIds] - ID департаментов
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getProtectedMatrix(params = {}) {
    return this.post("/protected/ninebox/get/", params);
  }

  /**
   * Поиск в матрице NineBox (protected)
   * POST /protected/ninebox/search/get/
   * @param {Object} [params] - Параметры поиска
   * @param {number} [params.limit] - Лимит
   * @param {number} [params.offset] - Смещение
   * @param {boolean} [params.actualize] - Актуализировать
   * @param {number} [params.performanceReviewId] - ID Performance Review
   * @param {number} [params.preformanceReviewRevisionId] - ID ревизии
   * @param {string} [params.usersSubset] - Подмножество пользователей
   * @param {number[]} [params.departmentsIds] - ID департаментов
   * @param {number[]} [params.usersIds] - ID пользователей
   * @param {string} [params.q] - Поисковый запрос
   * @param {number} [params.xCoord] - Координата X
   * @param {number} [params.yCoord] - Координата Y
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async searchProtected(params = {}) {
    return this.post("/protected/ninebox/search/get/", params);
  }

  /**
   * Получить список доступных департаментов
   * POST /protected/ninebox/available-departments/search/get/
   * @param {Object} [params] - Параметры
   * @param {boolean} [params.actualize] - Актуализировать
   * @param {string} [params.q] - Поисковый запрос
   * @param {string} [params.usersSubset] - Подмножество пользователей
   * @param {number} [params.limit] - Лимит
   * @param {number} [params.offset] - Смещение
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getAvailableDepartments(params = {}) {
    return this.post(
      "/protected/ninebox/available-departments/search/get/",
      params,
    );
  }
}
