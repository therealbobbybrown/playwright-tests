// tests/utils/api/MyTeamAPI.js
// API клиент для работы с модулем "Моя команда"

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
 * API клиент для работы с модулем "Моя команда"
 * Endpoints:
 * - /private/org-struct/* - информация о команде для пользователя
 * - /private/users/collegues/* - коллеги
 */
export class MyTeamAPI extends APIClient {
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

  // ==================== MY INFO ====================

  /**
   * Получить информацию о текущем пользователе в оргструктуре
   * GET /private/org-struct/me/info
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getMyInfo() {
    return this.get("/private/org-struct/me/info");
  }

  /**
   * Проверить, есть ли у текущего пользователя подчинённые
   * GET /private/org-struct/me/has-subordinates
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async hasSubordinates() {
    return this.get("/private/org-struct/me/has-subordinates");
  }

  /**
   * Проверить, является ли текущий пользователь руководителем
   * GET /private/org-struct/me/is-head
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async isHead() {
    return this.get("/private/org-struct/me/is-head");
  }

  // ==================== TEAM ENDPOINTS ====================

  /**
   * Получить дерево команды
   * GET /private/org-struct/tree/items
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getTeamTree() {
    return this.get("/private/org-struct/tree/items");
  }

  /**
   * Получить статистику команды
   * GET /private/org-struct/team/statistics
   * @param {Object} [params] - Параметры запроса
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getTeamStatistics(params = {}) {
    return this.get("/private/org-struct/team/statistics", params);
  }

  /**
   * Получить цели команды
   * POST /private/objectives/get/for-head
   * @param {Object} [params] - Параметры запроса
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getTeamObjectives(params = {}) {
    return this.post("/private/objectives/get/for-head", params);
  }

  /**
   * Получить планы развития команды
   * POST /private/development-plans/get/for-head
   * @param {Object} [params] - Параметры запроса
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getTeamDevelopmentPlans(params = {}) {
    return this.post("/private/development-plans/get/for-head", params);
  }

  // ==================== SUBORDINATES ====================

  /**
   * Получить подчинённых по IDs
   * POST /private/org-struct/subordinates/get/by-ids
   * @param {Array<number|string>} usersIds - ID пользователей
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getSubordinatesByIds(usersIds) {
    return this.post("/private/org-struct/subordinates/get/by-ids", {
      usersIds,
    });
  }

  /**
   * Получить список подчинённых текущего пользователя
   * POST /private/org-struct/users/get
   * @param {Object} [params] - Параметры поиска
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getSubordinates(params = {}) {
    return this.post("/private/org-struct/users/get", params);
  }

  /**
   * Получить количество целевых пользователей
   * POST /private/org-struct/target-users/count
   * @param {Object} [params] - Параметры
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getTargetUsersCount(params = {}) {
    return this.post("/private/org-struct/target-users/count", params);
  }

  /**
   * Получить руководителей целевых пользователей
   * POST /private/org-struct/target-users/heads
   * @param {Object} [params] - Параметры
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getTargetUsersHeads(params = {}) {
    return this.post("/private/org-struct/target-users/heads", params);
  }

  // ==================== USER INFO ====================

  /**
   * Получить руководителя пользователя
   * GET /private/org-struct/users/{id}/head
   * @param {number|string} userId - ID пользователя
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getUserHead(userId) {
    return this.get(`/private/org-struct/users/${userId}/head`);
  }

  /**
   * Получить всех руководителей пользователя (цепочка)
   * GET /private/org-struct/users/{id}/heads
   * @param {number|string} userId - ID пользователя
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getUserHeads(userId) {
    return this.get(`/private/org-struct/users/${userId}/heads`);
  }

  /**
   * Получить информацию о пользователе в оргструктуре
   * GET /private/org-struct/users/{id}/info
   * @param {number|string} userId - ID пользователя
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getUserInfo(userId) {
    return this.get(`/private/org-struct/users/${userId}/info`);
  }

  // ==================== DEPARTMENTS ====================

  /**
   * Получить плоское дерево департаментов
   * GET /private/org-struct/departments/flat-tree
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getDepartmentsFlatTree() {
    return this.get("/private/org-struct/departments/flat-tree");
  }

  /**
   * Получить пользователей департамента
   * GET /private/org-struct/departments/{id}/users
   * @param {number|string} departmentId - ID департамента
   * @param {Object} [params] - Параметры
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getDepartmentUsers(departmentId, params = {}) {
    return this.get(
      `/private/org-struct/departments/${departmentId}/users`,
      params,
    );
  }

  // ==================== ORG STRUCTURE TREE ====================

  /**
   * Получить элементы дерева оргструктуры
   * GET /private/org-struct/tree/items
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getTreeItems() {
    return this.get("/private/org-struct/tree/items");
  }

  /**
   * Получить информацию о корневом элементе дерева
   * GET /private/org-struct/tree/departments/root/info
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getTreeRootInfo() {
    return this.get("/private/org-struct/tree/departments/root/info");
  }

  /**
   * Получить информацию о департаменте в дереве
   * GET /private/org-struct/tree/departments/{departmentId}/info
   * @param {number|string} departmentId - ID департамента
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getTreeDepartmentInfo(departmentId) {
    return this.get(
      `/private/org-struct/tree/departments/${departmentId}/info`,
    );
  }

  /**
   * Получить информацию о пользователе в дереве
   * GET /private/org-struct/tree/users/{userId}/info
   * @param {number|string} userId - ID пользователя
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getTreeUserInfo(userId) {
    return this.get(`/private/org-struct/tree/users/${userId}/info`);
  }

  // ==================== SEARCH ====================

  /**
   * Поиск пользователей в оргструктуре
   * POST /private/org-struct/users/get
   * @param {Object} [params] - Параметры поиска
   * @param {string} [params.q] - Поисковый запрос
   * @param {number} [params.limit] - Лимит
   * @param {number} [params.offset] - Смещение
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async searchUsers(params = {}) {
    return this.post("/private/org-struct/users/get", params);
  }

  // ==================== COLLEAGUES ====================

  /**
   * Получить список коллег
   * GET /private/users/collegues
   * @param {Object} [params] - Параметры
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getColleagues(params = {}) {
    return this.get("/private/users/collegues", params);
  }

  /**
   * Получить список коллег (оптимизированный)
   * POST /private/users/collegues/get
   * @param {Object} [params] - Параметры
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getColleaguesOptimized(params = {}) {
    return this.post("/private/users/collegues/get", params);
  }

  /**
   * Получить информацию о коллеге
   * GET /private/users/collegues/{userId}
   * @param {number|string} userId - ID коллеги
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getColleague(userId) {
    return this.get(`/private/users/collegues/${userId}`);
  }
}
