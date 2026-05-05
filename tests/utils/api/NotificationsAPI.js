// tests/utils/api/NotificationsAPI.js
// API клиент для работы с уведомлениями

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
 * API клиент для работы с уведомлениями
 * Endpoints:
 * - /private/notifications/* - пользовательские уведомления
 * - /manager/notifications-settings/* - настройки уведомлений компании
 */
export class NotificationsAPI extends APIClient {
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

  // ==================== USER NOTIFICATIONS (private) ====================

  /**
   * Получить список уведомлений пользователя
   * GET /private/notifications
   * @param {Object} [params] - Параметры запроса
   * @param {number} [params.limit] - Лимит
   * @param {number} [params.offset] - Смещение
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getNotifications(params = {}) {
    return this.get("/private/notifications", params);
  }

  /**
   * Получить количество непрочитанных уведомлений
   * GET /private/notifications/unread-count
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getUnreadCount() {
    return this.get("/private/notifications/unread-count");
  }

  /**
   * Получить уведомление по ID
   * GET /private/notifications/{id}
   * @param {number|string} id - ID уведомления
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getNotificationById(id) {
    return this.get(`/private/notifications/${id}`);
  }

  /**
   * Отметить все уведомления как прочитанные
   * POST /private/notifications/read-all
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async readAll() {
    return this.post("/private/notifications/read-all");
  }

  // ==================== COMPANY NOTIFICATION SETTINGS (manager) ====================

  /**
   * Получить настройки уведомлений компании
   * GET /manager/notifications-settings
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getSettings() {
    return this.get("/manager/notifications-settings");
  }

  /**
   * Получить полные настройки уведомлений
   * GET /manager/notifications-settings/full
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getFullSettings() {
    return this.get("/manager/notifications-settings/full");
  }

  /**
   * Получить настройки уведомлений пользователя
   * GET /manager/notifications-settings/user
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getUserSettings() {
    return this.get("/manager/notifications-settings/user");
  }

  /**
   * Обновить настройки уведомлений компании
   * POST /manager/notifications-settings
   * @param {Object} settings - Настройки уведомлений
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async updateSettings(settings) {
    return this.post("/manager/notifications-settings", settings);
  }

  /**
   * Обновить настройки уведомлений пользователя
   * POST /manager/notifications-settings/user
   * @param {Object} settings - Настройки уведомлений
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async updateUserSettings(settings) {
    return this.post("/manager/notifications-settings/user", settings);
  }
}
