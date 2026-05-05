// tests/utils/api/ProfileAPI.js
// API клиент для работы с профилем пользователя

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
 * API клиент для работы с профилем пользователя
 * Endpoints:
 * - /private/users/* - данные пользователей
 * - /private/users/{id}/info - информация о пользователе
 * - /private/users/{userId}/fields/* - кастомные поля пользователя
 * - /private/users/{userId}/profile/* - профиль пользователя
 */
export class ProfileAPI extends APIClient {
  constructor(request, token = null) {
    super(request, token);
    this.fingerPrint = generateFingerPrint();
    this.currentUserId = null;
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
      // Извлекаем userId из JWT токена если нет в ответе
      if (!data?.user?.id) {
        try {
          const payload = JSON.parse(
            Buffer.from(data.accessToken.split(".")[1], "base64").toString(),
          );
          if (payload?.userId) {
            this.currentUserId = payload.userId;
          }
        } catch (e) {
          // Игнорируем ошибки парсинга
        }
      }
    }
    if (data?.user?.id) {
      this.currentUserId = data.user.id;
    }
    return data;
  }

  /**
   * Получить ID текущего пользователя
   * @returns {number|string|null}
   */
  getCurrentUserId() {
    return this.currentUserId;
  }

  // ==================== USERS LIST ====================

  /**
   * Получить список пользователей
   * GET /private/users
   * @param {Object} [params] - Параметры запроса
   * @param {number} [params.limit] - Лимит
   * @param {number} [params.offset] - Смещение
   * @param {string} [params.q] - Поисковый запрос
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getUsers(params = {}) {
    return this.get("/private/users", params);
  }

  /**
   * Получить упрощённый список пользователей
   * GET /private/users/simple
   * @param {Object} [params] - Параметры запроса
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getSimpleUsers(params = {}) {
    return this.get("/private/users/simple", params);
  }

  /**
   * Получить пользователя по ID
   * GET /private/users/{id}
   * @param {number|string} id - ID пользователя
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getUserById(id) {
    return this.get(`/private/users/${id}`);
  }

  /**
   * Получить пользователей по IDs
   * POST /private/users/get/by-ids
   * @param {Array<number|string>} ids - Массив ID пользователей
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getUsersByIds(ids) {
    return this.post("/private/users/get/by-ids", { usersIds: ids });
  }

  /**
   * Поиск пользователей по запросу
   * POST /private/users/query
   * @param {Object} query - Параметры запроса
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async queryUsers(query) {
    return this.post("/private/users/query", query);
  }

  // ==================== USER INFO ====================

  /**
   * Получить информацию о пользователе
   * GET /private/users/{id}/info
   * @param {number|string} id - ID пользователя
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getUserInfo(id) {
    return this.get(`/private/users/${id}/info`);
  }

  /**
   * Обновить информацию о пользователе
   * POST /private/users/{id}/info
   * @param {number|string} id - ID пользователя
   * @param {Object} info - Данные для обновления
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async updateUserInfo(id, info) {
    return this.post(`/private/users/${id}/info`, info);
  }

  // ==================== COLLEAGUES ====================

  /**
   * Получить список коллег
   * GET /private/users/collegues
   * @param {Object} [params] - Параметры запроса
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getColleagues(params = {}) {
    return this.get("/private/users/collegues", params);
  }

  /**
   * Получить список коллег (оптимизированный)
   * POST /private/users/collegues/get
   * @param {Object} [params] - Параметры запроса
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getColleaguesOptimized(params = {}) {
    return this.post("/private/users/collegues/get", params);
  }

  /**
   * Получить информацию о коллеге
   * GET /private/users/collegues/{userId}
   * @param {number|string} userId - ID пользователя
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getColleague(userId) {
    return this.get(`/private/users/collegues/${userId}`);
  }

  // ==================== AVATAR ====================

  /**
   * Загрузить аватар
   * POST /private/users/upload/avatar
   * @param {Buffer|string} avatar - Данные аватара
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async uploadAvatar(avatar) {
    // Для загрузки файла нужен multipart/form-data
    // Здесь упрощённая версия
    return this.post("/private/users/upload/avatar", { avatar });
  }

  /**
   * Обновить аватар пользователя
   * POST /private/users/{id}/avatar
   * @param {number|string} id - ID пользователя
   * @param {Object} avatarData - Данные аватара
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async updateAvatar(id, avatarData) {
    return this.post(`/private/users/${id}/avatar`, avatarData);
  }

  // ==================== CUSTOM FIELDS ====================

  /**
   * Получить значения кастомных полей пользователя
   * GET /private/users/{userId}/fields/values
   * @param {number|string} userId - ID пользователя
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getFieldValues(userId) {
    return this.get(`/private/users/${userId}/fields/values`);
  }

  /**
   * Обновить строковое значение кастомного поля
   * POST /private/users/{userId}/fields/{fieldId}/values/string
   * @param {number|string} userId - ID пользователя
   * @param {number|string} fieldId - ID поля
   * @param {string} value - Значение
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async updateStringFieldValue(userId, fieldId, value, valueId = null) {
    const entry = valueId != null ? { id: valueId, value } : { value };
    return this.post(
      `/private/users/${userId}/fields/${fieldId}/values/string/`,
      { values: [entry] },
    );
  }

  /**
   * Обновить числовое значение кастомного поля
   * POST /private/users/{userId}/fields/{fieldId}/values/number/
   * @param {number|string} userId - ID пользователя
   * @param {number|string} fieldId - ID поля
   * @param {number} value - Значение
   * @param {number|null} [valueId] - ID существующей записи (для обновления)
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async updateNumberFieldValue(userId, fieldId, value, valueId = null) {
    // API ожидает значение как строку (аналогично браузерному вводу)
    const strValue =
      value !== null && value !== undefined ? String(value) : value;
    const entry =
      valueId != null ? { id: valueId, value: strValue } : { value: strValue };
    return this.post(
      `/private/users/${userId}/fields/${fieldId}/values/number/`,
      { values: [entry] },
    );
  }

  /**
   * Обновить значение даты кастомного поля
   * POST /private/users/{userId}/fields/{fieldId}/values/datetime/
   * @param {number|string} userId - ID пользователя
   * @param {number|string} fieldId - ID поля
   * @param {string} value - Значение даты (ISO формат)
   * @param {number|null} [valueId] - ID существующей записи (для обновления)
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async updateDatetimeFieldValue(userId, fieldId, value, valueId = null) {
    const entry = valueId != null ? { id: valueId, value } : { value };
    return this.post(
      `/private/users/${userId}/fields/${fieldId}/values/datetime/`,
      { values: [entry] },
    );
  }

  // ==================== PROFILE TABS ====================

  /**
   * Получить шаблон профиля пользователя
   * GET /private/users/{userId}/profile/tabs
   * @param {number|string} userId - ID пользователя
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getProfileTabs(userId) {
    return this.get(`/private/users/${userId}/profile/tabs`);
  }

  // ==================== MY PROFILE ====================

  /**
   * Получить свой профиль
   * GET /private/users/{id}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getMyProfile() {
    const userId = this.getCurrentUserId();
    if (!userId) {
      // Return a fake 401 response if not authenticated
      return {
        response: { ok: () => false, status: () => 401 },
        data: null,
      };
    }
    return this.getUserById(userId);
  }

  // ==================== STATS ====================

  /**
   * Получить статистику пользователей
   * GET /private/users/stats
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getStats() {
    return this.get("/private/users/stats");
  }

  /**
   * Проверить наличие фидбеков
   * GET /private/users/has-feedbacks
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async hasFeedbacks() {
    return this.get("/private/users/has-feedbacks");
  }

  /**
   * Проверить наличие фидбеков сотрудников
   * GET /private/users/has-employees-feedbacks
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async hasEmployeesFeedbacks() {
    return this.get("/private/users/has-employees-feedbacks");
  }

  /**
   * Получить платформы пользователя
   * GET /private/users/me/platforms
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getMyPlatforms() {
    return this.get("/private/users/me/platforms");
  }
}
