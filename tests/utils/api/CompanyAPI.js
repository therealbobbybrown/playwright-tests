// tests/utils/api/CompanyAPI.js
// API клиент для работы с настройками компании

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
 * API клиент для работы с настройками компании
 * Endpoints: /manager/company/*, /private/company/*, /manager/roles/*
 */
export class CompanyAPI extends APIClient {
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

  // ==================== COMPANY ====================

  /**
   * Получить информацию о компании
   * GET /manager/company/
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getCompany() {
    return this.get("/manager/company/");
  }

  /**
   * Получить информацию о компании (алиас для getCompany)
   * GET /manager/company/
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getCompanyInfo() {
    return this.getCompany();
  }

  /**
   * Получить настройки компании
   * GET /manager/company/settings/
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getSettings() {
    return this.get("/manager/company/settings/");
  }

  /**
   * Обновить настройки компании
   * POST /manager/company/settings/
   * @param {Object} settings - Настройки
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async updateSettings(settings = {}) {
    return this.post("/manager/company/settings/", settings);
  }

  /**
   * Получить модули компании
   * GET /private/company/modules/
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getModules() {
    return this.get("/private/company/modules/");
  }

  /**
   * Обновить компанию
   * PATCH /manager/company/
   * @param {Object} formData - Данные компании
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async updateCompany(formData = {}) {
    return this.patch("/manager/company/", formData);
  }

  /**
   * Обновить название компании
   * PATCH /manager/company/title
   * @param {string} title - Название компании
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async updateCompanyTitle(title) {
    return this.patch("/manager/company/title", { title });
  }

  /**
   * Получить настройки компании (manager)
   * GET /manager/company/settings/
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getManagerCompanySettings() {
    return this.get("/manager/company/settings/");
  }

  /**
   * Получить настройки компании (private)
   * GET /private/company/settings/
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getPrivateCompanySettings() {
    return this.get("/private/company/settings/");
  }

  /**
   * Получить email администратора
   * GET /private/company/admin-email/
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getAdminEmail() {
    return this.get("/private/company/admin-email/");
  }

  /**
   * Получить токены компании
   * GET /manager/company/tokens/
   * @param {Object} [params] - Параметры запроса
   * @param {number} [params.limit] - Лимит
   * @param {number} [params.offset] - Смещение
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getCompanyTokens(params = {}) {
    return this.get("/manager/company/tokens/", params);
  }

  /**
   * Получить активные интеграции
   * GET /private/company/active-integrations/
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getActiveIntegrations() {
    return this.get("/private/company/active-integrations/");
  }

  /**
   * Получить настройки суммарного аккаунта
   * GET /private/company-domains/summary-account-settings/
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getSummaryAccountSettings() {
    return this.get("/private/company-domains/summary-account-settings/");
  }

  // ==================== NOTIFICATIONS SETTINGS ====================

  /**
   * Получить настройки уведомлений
   * GET /manager/notifications-settings/
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getNotificationSettings() {
    return this.get("/manager/notifications-settings/");
  }

  /**
   * Получить настройки уведомлений пользователя
   * GET /manager/notifications-settings/user/
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getUserNotificationSettings() {
    return this.get("/manager/notifications-settings/user/");
  }

  /**
   * Получить полные настройки уведомлений
   * GET /manager/notifications-settings/full/
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getFullNotificationSettings() {
    return this.get("/manager/notifications-settings/full/");
  }

  /**
   * Обновить настройки уведомлений
   * POST /manager/notifications-settings/
   * @param {Object} updateData - Данные для обновления
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async updateNotificationSettings(updateData = {}) {
    return this.post("/manager/notifications-settings/", updateData);
  }

  /**
   * Обновить настройки уведомлений пользователя
   * POST /manager/notifications-settings/user/
   * @param {Object} updateData - Данные для обновления
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async updateUserNotificationSettings(updateData = {}) {
    return this.post("/manager/notifications-settings/user/", updateData);
  }

  // ==================== ROLES ====================

  /**
   * Получить список ролей (manager)
   * GET /manager/roles/
   * @param {Object} [params] - Параметры запроса
   * @param {number} [params.limit] - Лимит
   * @param {number} [params.offset] - Смещение
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getRoles(params = {}) {
    return this.get("/manager/roles/", params);
  }

  /**
   * Получить список ролей (private)
   * GET /private/roles/
   * @param {Object} [params] - Параметры запроса
   * @param {number} [params.limit] - Лимит
   * @param {number} [params.offset] - Смещение
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getPrivateRoles(params = {}) {
    return this.get("/private/roles/", params);
  }

  /**
   * Получить роль по ID
   * GET /manager/roles/{id}/
   * @param {number} id - ID роли
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getRole(id) {
    return this.get(`/manager/roles/${id}/`);
  }

  /**
   * Получить количество пользователей роли
   * GET /manager/roles/{id}/users-count/
   * @param {number} id - ID роли
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getRoleUsersCount(id) {
    return this.get(`/manager/roles/${id}/users-count/`);
  }

  /**
   * Создать роль
   * POST /manager/roles/
   * @param {Object} data - Данные роли
   * @param {string} data.title - Название роли
   * @param {number[]} [data.permissionsIds] - ID разрешений
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async createRole({ title, permissionsIds } = {}) {
    return this.post("/manager/roles/", { title, permissionsIds });
  }

  /**
   * Обновить роль
   * POST /manager/roles/{id}/
   * @param {number} id - ID роли
   * @param {Object} data - Данные роли
   * @param {string} [data.title] - Название роли
   * @param {number[]} [data.permissionsIds] - ID разрешений
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async updateRole(id, { title, permissionsIds } = {}) {
    return this.post(`/manager/roles/${id}/`, { title, permissionsIds });
  }

  /**
   * Удалить роль
   * DELETE /manager/roles/{id}/
   * @param {number} id - ID роли
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async deleteRole(id) {
    return this.delete(`/manager/roles/${id}/`);
  }
}
