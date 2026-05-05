// tests/utils/api/RolesAPI.js
// API клиент для работы с ролями и разрешениями

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
 * API клиент для работы с ролями и разрешениями
 * Endpoints:
 * - /manager/roles/* - управление ролями (manager)
 * - /manager/permissions - список разрешений (manager)
 * - /private/roles - список ролей для пользователя (private)
 */
export class RolesAPI extends APIClient {
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

  // ==================== PERMISSIONS ====================

  /**
   * Получить список разрешений
   * GET /manager/permissions
   * @param {Object} [params] - Параметры запроса
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getPermissions(params = {}) {
    return this.get("/manager/permissions", params);
  }

  // ==================== ROLES (manager) ====================

  /**
   * Получить список ролей (manager)
   * GET /manager/roles
   * @param {Object} [params] - Параметры запроса
   * @param {number} [params.limit] - Лимит
   * @param {number} [params.offset] - Смещение
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getRoles(params = {}) {
    return this.get("/manager/roles", params);
  }

  /**
   * Получить роль по ID
   * GET /manager/roles/{id}
   * @param {number|string} id - ID роли
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getRoleById(id) {
    return this.get(`/manager/roles/${id}`);
  }

  /**
   * Получить количество пользователей с ролью
   * GET /manager/roles/{id}/users-count
   * @param {number|string} id - ID роли
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getRoleUsersCount(id) {
    return this.get(`/manager/roles/${id}/users-count`);
  }

  /**
   * Создать роль
   * POST /manager/roles
   * @param {Object} roleData - Данные роли
   * @param {string} roleData.title - Название роли
   * @param {Array<number>} [roleData.permissionsIds] - ID разрешений
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async createRole(roleData) {
    return this.post("/manager/roles", roleData);
  }

  /**
   * Обновить роль
   * POST /manager/roles/{id}
   * @param {number|string} id - ID роли
   * @param {Object} roleData - Данные роли
   * @param {string} [roleData.title] - Название роли
   * @param {Array<number>} [roleData.permissionsIds] - ID разрешений
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async updateRole(id, roleData) {
    return this.post(`/manager/roles/${id}`, roleData);
  }

  /**
   * Удалить роль
   * DELETE /manager/roles/{id}
   * @param {number|string} id - ID роли
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async deleteRole(id) {
    return this.delete(`/manager/roles/${id}`);
  }

  // ==================== ROLES (private) ====================

  /**
   * Получить список ролей (private, для пользователя)
   * GET /private/roles
   * @param {Object} [params] - Параметры запроса
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getPrivateRoles(params = {}) {
    return this.get("/private/roles", params);
  }

  // ==================== USER ROLE ASSIGNMENT ====================

  /**
   * Получить данные текущего пользователя
   * GET /private/accounts/me
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getCurrentUser() {
    return this.get("/private/accounts/me");
  }

  /**
   * Получить пользователя по ID
   * GET /private/users/{id}
   * @param {number|string} userId - ID пользователя
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getUserById(userId) {
    return this.get(`/private/users/${userId}`);
  }

  /**
   * Получить данные пользователя для manager (нужно для обновления)
   * GET /manager/users/{userId}/
   * @param {number|string} userId - ID пользователя
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getManagerUserById(userId) {
    return this.get(`/manager/users/${userId}/`);
  }

  /**
   * Назначить роли пользователю (admin only)
   * POST /manager/users/{userId}/
   *
   * API требует firstName и lastName при обновлении пользователя.
   * Поле для ролей - rolesIds (не roleIds).
   *
   * @param {number|string} userId - ID пользователя
   * @param {number[]} roleIds - Массив ID ролей
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async assignRolesToUser(userId, roleIds) {
    // Получаем текущие данные пользователя
    const { data: userData } = await this.getManagerUserById(userId);

    // Извлекаем обязательные поля
    const firstName =
      userData?.firstName || userData?.user?.firstName || "User";
    const lastName = userData?.lastName || userData?.user?.lastName || "Test";

    // Обновляем пользователя с новыми ролями
    return this.post(`/manager/users/${userId}/`, {
      firstName,
      lastName,
      rolesIds: roleIds,
    });
  }

  /**
   * Получить ID системных ролей "Администратор" и "Пользователь" по имени.
   * Кеширует результат — безопасно вызывать повторно.
   * @returns {Promise<{adminRoleId: number, userRoleId: number}>}
   */
  async getSystemRoleIds() {
    if (this._systemRoleIds) return this._systemRoleIds;

    const { data } = await this.getRoles({ limit: 100 });
    const roles = data?.items || data?.results || (Array.isArray(data) ? data : []);

    // Системные роли: "Manager" (API) / "Администратор" (UI) и "User" (API) / "Пользователь" (UI)
    // Точное совпадение по title чтобы не зацепить кастомные роли
    const adminRole = roles.find(
      (r) => r.title === "Manager" || r.title === "Администратор",
    );
    const userRole = roles.find(
      (r) => r.title === "User" || r.title === "Пользователь",
    );

    if (!adminRole || !userRole) {
      throw new Error(
        `System roles not found. Available: ${roles.map((r) => `${r.id}:${r.title}`).join(", ")}`,
      );
    }

    this._systemRoleIds = {
      adminRoleId: adminRole.id,
      userRoleId: userRole.id,
    };
    return this._systemRoleIds;
  }

  /**
   * Получить текущие роли пользователя
   * @param {number|string} userId - ID пользователя
   * @returns {Promise<number[]>} - Массив ID ролей
   */
  async getUserRoleIds(userId) {
    const { data } = await this.getManagerUserById(userId);
    // Структура может быть: { roleIds: [...] } или { roles: [{id: ...}] } или { user: { roleIds: [...] } }
    const roleIds =
      data?.roleIds ||
      data?.user?.roleIds ||
      data?.roles?.map((r) => r.id) ||
      [];
    return roleIds;
  }
}
