// tests/utils/api/OrgStructureAPI.js
// API клиент для работы с организационной структурой

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
 * API клиент для работы с организационной структурой
 * Endpoints: /manager/departments/*, /manager/user-groups/*, /manager/invite-links/*, /manager/org-struct/*
 */
export class OrgStructureAPI extends APIClient {
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

  // ==================== USERS ====================

  /**
   * Получить список пользователей
   * GET /manager/users/
   * @param {Object} [params] - Параметры запроса
   * @param {number} [params.limit] - Лимит
   * @param {number} [params.offset] - Смещение
   * @param {string} [params.q] - Поисковый запрос
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getUsers(params = {}) {
    return this.get("/manager/users/", params);
  }

  /**
   * Получить дерево оргструктуры (алиас для getTreeItems)
   * GET /manager/org-struct/tree/items/
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getTree() {
    return this.getTreeItems();
  }

  /**
   * Получить группы пользователей (алиас для getUserGroups)
   * GET /manager/user-groups/
   * @param {Object} [params] - Параметры запроса
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getGroups(params = {}) {
    return this.getUserGroups(params);
  }

  // ==================== DEPARTMENTS ====================

  /**
   * Создать департамент
   * POST /manager/departments/
   * @param {Object} data - Данные департамента
   * @param {string} data.title - Название
   * @param {string} [data.description] - Описание
   * @param {string} [data.color] - Цвет
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async createDepartment({ title, description, color } = {}) {
    return this.post("/manager/departments/", { title, description, color });
  }

  /**
   * Получить список департаментов
   * GET /manager/departments/
   * @param {Object} [params] - Параметры запроса
   * @param {number} [params.limit] - Лимит
   * @param {number} [params.offset] - Смещение
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getDepartments(params = {}) {
    return this.get("/manager/departments/", params);
  }

  /**
   * Поиск департаментов с фильтрацией
   * POST /manager/departments/get/
   * @param {Object} params - Параметры поиска
   * @param {string} [params.q] - Поисковый запрос
   * @param {number} [params.limit] - Лимит
   * @param {number} [params.offset] - Смещение
   * @param {number[]} [params.exceptDepartmentsIds] - ID исключаемых департаментов
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async searchDepartments({ q, limit, offset, exceptDepartmentsIds } = {}) {
    const url = `/manager/departments/get/?${new URLSearchParams({ q, limit, offset }).toString()}`;
    return this.post(url.replace(/undefined/g, ""), { exceptDepartmentsIds });
  }

  /**
   * Получить департаменты по ID
   * POST /manager/departments/get/by-ids/
   * @param {number[]} departmentsIds - ID департаментов
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getDepartmentsByIds(departmentsIds) {
    return this.post("/manager/departments/get/by-ids/", { departmentsIds });
  }

  /**
   * Обновить департамент
   * POST /manager/departments/{id}/
   * @param {number} id - ID департамента
   * @param {Object} data - Данные для обновления
   * @param {string} [data.title] - Название
   * @param {string} [data.description] - Описание
   * @param {string} [data.color] - Цвет
   * @param {boolean} [data.autoTitle] - Автоматически генерировать название
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async updateDepartment(
    id,
    { title, description, color, autoTitle = true } = {},
  ) {
    return this.post(`/manager/departments/${id}/`, {
      title,
      description,
      color,
      autoTitle,
    });
  }

  // ==================== USER GROUPS ====================

  /**
   * Получить список групп пользователей
   * GET /manager/user-groups/
   * @param {Object} [params] - Параметры запроса
   * @param {number} [params.limit] - Лимит
   * @param {number} [params.offset] - Смещение
   * @param {boolean} [params.withUsersIds] - Включить ID пользователей
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getUserGroups(params = {}) {
    return this.get("/manager/user-groups/", params);
  }

  /**
   * Получить группу пользователей по ID
   * GET /manager/user-groups/{id}/
   * @param {number} id - ID группы
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getUserGroup(id) {
    return this.get(`/manager/user-groups/${id}/`);
  }

  /**
   * Получить группу пользователей по названию
   * GET /manager/user-groups/by-title/
   * @param {string} title - Название группы
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getUserGroupByTitle(title) {
    return this.get("/manager/user-groups/by-title/", { title: title.trim() });
  }

  /**
   * Создать группу пользователей
   * POST /manager/user-groups/
   * @param {Object} data - Данные группы
   * @param {string} data.title - Название
   * @param {string} [data.emoji] - Эмодзи
   * @param {boolean} [data.autoTitle] - Автоматически генерировать название
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async createUserGroup({ title, emoji, autoTitle } = {}) {
    return this.post("/manager/user-groups/", { title, emoji, autoTitle });
  }

  /**
   * Обновить группу пользователей
   * POST /manager/user-groups/{id}/
   * @param {number} id - ID группы
   * @param {Object} data - Данные для обновления
   * @param {string} [data.title] - Название
   * @param {string} [data.emoji] - Эмодзи
   * @param {boolean} [data.autoTitle] - Автоматически генерировать название
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async updateUserGroup(id, { title, emoji, autoTitle } = {}) {
    return this.post(`/manager/user-groups/${id}/`, {
      title,
      emoji,
      autoTitle,
    });
  }

  /**
   * Удалить группу пользователей
   * DELETE /manager/user-groups/{id}/
   * @param {number} id - ID группы
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async deleteUserGroup(id) {
    return this.delete(`/manager/user-groups/${id}/`);
  }

  /**
   * Получить пользователей группы
   * GET /manager/user-groups/{id}/users/
   * @param {number} userGroupId - ID группы
   * @param {Object} [params] - Параметры запроса
   * @param {string} [params.q] - Поисковый запрос
   * @param {number} [params.limit] - Лимит
   * @param {number} [params.offset] - Смещение
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getUserGroupUsers(userGroupId, params = {}) {
    return this.get(`/manager/user-groups/${userGroupId}/users/`, params);
  }

  /**
   * Получить пользователей вне группы
   * GET /manager/user-groups/{id}/users-outside/
   * @param {number} userGroupId - ID группы
   * @param {Object} [params] - Параметры запроса
   * @param {string} [params.q] - Поисковый запрос
   * @param {number} [params.limit] - Лимит
   * @param {number} [params.offset] - Смещение
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getUserGroupUsersOutside(userGroupId, params = {}) {
    return this.get(
      `/manager/user-groups/${userGroupId}/users-outside/`,
      params,
    );
  }

  /**
   * Добавить пользователей в группу
   * POST /manager/user-groups/{id}/users/add/
   * @param {number} userGroupId - ID группы
   * @param {number[]} usersIds - ID пользователей
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async addUsersToUserGroup(userGroupId, usersIds) {
    return this.post(`/manager/user-groups/${userGroupId}/users/add/`, {
      usersIds,
    });
  }

  /**
   * Удалить пользователей из группы
   * POST /manager/user-groups/{id}/users/remove/
   * @param {number} userGroupId - ID группы
   * @param {number[]} usersIds - ID пользователей
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async removeUsersFromUserGroup(userGroupId, usersIds) {
    return this.post(`/manager/user-groups/${userGroupId}/users/remove/`, {
      usersIds,
    });
  }

  // ==================== INVITE LINKS ====================

  /**
   * Получить список инвайт-ссылок
   * GET /manager/invite-links/
   * @param {Object} [params] - Параметры запроса
   * @param {number} [params.limit] - Лимит
   * @param {number} [params.offset] - Смещение
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getInviteLinks(params = {}) {
    return this.get("/manager/invite-links/", params);
  }

  /**
   * Получить инвайт-ссылку по UUID
   * GET /manager/invite-links/{uuid}/
   * @param {string} uuid - UUID ссылки
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getInviteLink(uuid) {
    return this.get(`/manager/invite-links/${uuid}/`);
  }

  /**
   * Получить или создать инвайт-ссылку
   * POST /manager/invite-links/get-or-create/
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getOrCreateInviteLink() {
    return this.post("/manager/invite-links/get-or-create/");
  }

  /**
   * Активировать инвайт-ссылку
   * POST /manager/invite-links/{uuid}/activate/
   * @param {string} uuid - UUID ссылки
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async activateInviteLink(uuid) {
    return this.post(`/manager/invite-links/${uuid}/activate/`);
  }

  /**
   * Деактивировать инвайт-ссылку
   * POST /manager/invite-links/{uuid}/deactivate/
   * @param {string} uuid - UUID ссылки
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async deactivateInviteLink(uuid) {
    return this.post(`/manager/invite-links/${uuid}/deactivate/`);
  }

  /**
   * Получить пользователей, присоединившихся по ссылке
   * GET /manager/invite-links/{uuid}/users/
   * @param {string} uuid - UUID ссылки
   * @param {Object} [params] - Параметры запроса
   * @param {number} [params.limit] - Лимит
   * @param {number} [params.offset] - Смещение
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getInviteLinkUsers(uuid, params = {}) {
    return this.get(`/manager/invite-links/${uuid}/users/`, params);
  }

  /**
   * Получить публичную информацию об инвайт-ссылке
   * GET /public/invite-links/{uuid}/
   * @param {string} uuid - UUID ссылки
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getPublicInviteLinkInfo(uuid) {
    return this.get(`/public/invite-links/${uuid}/`);
  }

  /**
   * Получить приватную информацию об инвайт-ссылке (для авторизованных)
   * GET /private/invite-links/{uuid}/
   * @param {string} uuid - UUID ссылки
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getPrivateInviteLinkInfo(uuid) {
    return this.get(`/private/invite-links/${uuid}/`);
  }

  // ==================== ORG STRUCTURE ====================

  /**
   * Получить пользователей из департамента
   * GET /manager/org-struct/departments/{departmentId}/users/
   * @param {number} departmentId - ID департамента
   * @param {boolean} [nested] - Включать вложенные департаменты
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getUsersFromDepartment(departmentId, nested = false) {
    return this.get(`/manager/org-struct/departments/${departmentId}/users/`, {
      nested,
    });
  }

  /**
   * Получить руководителей компании
   * GET /manager/org-struct/root/heads/
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getRootHeads() {
    return this.get("/manager/org-struct/root/heads/");
  }

  /**
   * Поиск пользователей в оргструктуре
   * POST /manager/org-struct/users/get/
   * @param {Object} params - Параметры поиска
   * @param {string} [params.q] - Поисковый запрос
   * @param {boolean} [params.inOrgStruct] - Только в оргструктуре
   * @param {number} [params.limit] - Лимит
   * @param {number} [params.offset] - Смещение
   * @param {number[]} [params.exceptUsersIds] - ID исключаемых пользователей
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async findUsers({ q, inOrgStruct, limit, offset, exceptUsersIds } = {}) {
    const queryParams = new URLSearchParams();
    if (q) queryParams.set("q", q);
    if (inOrgStruct !== undefined) queryParams.set("inOrgStruct", inOrgStruct);
    if (limit !== undefined) queryParams.set("limit", limit);
    if (offset !== undefined) queryParams.set("offset", offset);
    const queryString = queryParams.toString();
    const url = `/manager/org-struct/users/get/${queryString ? "?" + queryString : ""}`;
    return this.post(url, { exceptUsersIds });
  }

  /**
   * Получить количество подчинённых для пользователей
   * POST /manager/org-struct/subordinates/get/by-ids
   * @param {number[]} usersIds - ID пользователей
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getSubordinatesCountByUsersIds(usersIds) {
    return this.post("/manager/org-struct/subordinates/get/by-ids", {
      usersIds,
    });
  }

  /**
   * Удалить пользователей из оргструктуры
   * POST /manager/org-struct/users/delete/
   * @param {number[]} usersIds - ID пользователей
   * @param {string} [strategy] - Стратегия удаления
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async deleteUsersFromOrgStruct(usersIds, strategy) {
    return this.post("/manager/org-struct/users/delete/", {
      usersIds,
      strategy,
    });
  }

  /**
   * Получить токен для экспорта пользователей
   * GET /manager/org-struct/users/export/get-token
   * @param {string} [userDate] - Дата в формате ISO (YYYY-MM-DDTHH:mm:ss.SSSZ), по умолчанию - текущая дата
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getExportToken(userDate) {
    // API требует дату в формате ISO datetime
    const dateParam = userDate || new Date().toISOString();
    return this.get("/manager/org-struct/users/export/get-token", {
      userDate: dateParam,
    });
  }

  // ==================== ORG STRUCTURE TREE ====================

  /**
   * Получить элементы дерева оргструктуры
   * GET /manager/org-struct/tree/items/
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getTreeItems() {
    return this.get("/manager/org-struct/tree/items/");
  }

  /**
   * Получить плоское дерево департаментов
   * GET /manager/org-struct/departments/flat-tree/
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getDepartmentsFlatTree() {
    return this.get("/manager/org-struct/departments/flat-tree/");
  }

  /**
   * Получить информацию о корневом элементе дерева
   * GET /manager/org-struct/tree/departments/root/info/
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getTreeRootInfo() {
    return this.get("/manager/org-struct/tree/departments/root/info/");
  }

  /**
   * Получить информацию о департаменте в дереве
   * GET /manager/org-struct/tree/departments/{departmentId}/info/
   * @param {number} departmentId - ID департамента
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getTreeDepartmentInfo(departmentId) {
    return this.get(
      `/manager/org-struct/tree/departments/${departmentId}/info/`,
    );
  }

  /**
   * Получить информацию о пользователе в дереве
   * GET /manager/org-struct/tree/users/{userId}/info/
   * @param {number} userId - ID пользователя
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getTreeUserInfo(userId) {
    return this.get(`/manager/org-struct/tree/users/${userId}/info/`);
  }

  /**
   * Получить доступных руководителей для корня
   * GET /manager/org-struct/tree/root/available-head-users/for-root/
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getTreeAvailableHeadUsersForRoot() {
    return this.get(
      "/manager/org-struct/tree/root/available-head-users/for-root/",
    );
  }

  /**
   * Получить доступные департаменты для подчинённого
   * GET /manager/org-struct/tree/users/{headUserId}/available-departments/for-subordinate/
   * @param {number} headUserId - ID руководителя
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getTreeAvailableDepartmentsForHeadUser(headUserId) {
    return this.get(
      `/manager/org-struct/tree/users/${headUserId}/available-departments/for-subordinate/`,
    );
  }

  /**
   * Добавить пользователей в корень (руководители компании)
   * POST /manager/org-struct/tree/users/root
   * @param {number[]} usersIds - ID пользователей
   * @param {string} [strategy] - Стратегия добавления
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async addTreeUsersToRoot(usersIds, strategy) {
    return this.post("/manager/org-struct/tree/users/root", {
      usersIds,
      strategy,
    });
  }

  /**
   * Добавить пользователя к руководителю
   * POST /manager/org-struct/tree/users
   * @param {number} userId - ID пользователя
   * @param {number} headUserId - ID руководителя
   * @param {string} [strategy] - Стратегия добавления
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async addTreeUser(userId, headUserId, strategy) {
    return this.post("/manager/org-struct/tree/users", {
      userId,
      headUserId,
      strategy,
    });
  }

  /**
   * Добавить пользователей в департамент
   * POST /manager/org-struct/tree/departments/{departmentId}/users/add
   * @param {number} departmentId - ID департамента
   * @param {number[]} usersIds - ID пользователей
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async addTreeUsersToDepartment(departmentId, usersIds) {
    return this.post(
      `/manager/org-struct/tree/departments/${departmentId}/users/add`,
      { usersIds },
    );
  }

  /**
   * Удалить пользователей из департамента
   * POST /manager/org-struct/department/{departmentId}/users/delete/
   * @param {number} departmentId - ID департамента
   * @param {number[]} usersIds - ID пользователей
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async removeTreeUsersFromDepartment(departmentId, usersIds) {
    return this.post(
      `/manager/org-struct/department/${departmentId}/users/delete/`,
      { usersIds },
    );
  }

  /**
   * Добавить пользователей в корневой департамент
   * POST /manager/org-struct/tree/departments/root/users/add/
   * @param {number[]} usersIds - ID пользователей
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async addTreeUsersToRootDepartment(usersIds) {
    return this.post("/manager/org-struct/tree/departments/root/users/add/", {
      usersIds,
    });
  }

  /**
   * Добавить департаменты в корень
   * POST /manager/org-struct/tree/departments/root/departments/
   * @param {number[]} departmentsIds - ID департаментов
   * @param {string} [strategy] - Стратегия добавления
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async addTreeDepartmentsToRoot(departmentsIds, strategy) {
    return this.post("/manager/org-struct/tree/departments/root/departments/", {
      departmentsIds,
      strategy,
    });
  }

  /**
   * Добавить департаменты в департамент
   * POST /manager/org-struct/tree/departments/{departmentId}/departments/
   * @param {number} departmentId - ID родительского департамента
   * @param {number[]} departmentsIds - ID добавляемых департаментов
   * @param {string} [strategy] - Стратегия добавления
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async addTreeDepartmentsToDepartment(departmentId, departmentsIds, strategy) {
    return this.post(
      `/manager/org-struct/tree/departments/${departmentId}/departments/`,
      { departmentsIds, strategy },
    );
  }

  /**
   * Добавить руководителей компании
   * POST /manager/org-struct/tree/root/heads/add/
   * @param {number[]} headsUsersIds - ID пользователей
   * @param {string} [strategy] - Стратегия добавления
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async addRootHeadsUsers(headsUsersIds, strategy) {
    return this.post("/manager/org-struct/tree/root/heads/add/", {
      headsUsersIds,
      strategy,
    });
  }

  /**
   * Удалить руководителей компании
   * POST /manager/org-struct/tree/root/heads/delete/
   * @param {number[]} headsUsersIds - ID пользователей
   * @param {string} [strategy] - Стратегия удаления
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async removeRootHeadsUsers(headsUsersIds, strategy) {
    return this.post("/manager/org-struct/tree/root/heads/delete/", {
      headsUsersIds,
      strategy,
    });
  }

  /**
   * Установить руководителя департамента
   * POST /manager/org-struct/tree/departments/{departmentId}/heads/set/
   * @param {number} departmentId - ID департамента
   * @param {number} headUserId - ID руководителя
   * @param {string} [strategy] - Стратегия
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async setDepartmentHeadUser(departmentId, headUserId, strategy) {
    return this.post(
      `/manager/org-struct/tree/departments/${departmentId}/heads/set/`,
      { headUserId, strategy },
    );
  }

  /**
   * Снять руководителя департамента
   * POST /manager/org-struct/tree/departments/{departmentId}/heads/unset/
   * @param {number} departmentId - ID департамента
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async unsetDepartmentHeadUser(departmentId) {
    return this.post(
      `/manager/org-struct/tree/departments/${departmentId}/heads/unset/`,
    );
  }

  // ==================== USERS (manager) ====================

  /**
   * Получить пользователей по ID
   * POST /manager/users/get/by-ids
   * @param {number[]} usersIds - ID пользователей
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getUsersByIds(usersIds) {
    return this.post("/manager/users/get/by-ids", { usersIds });
  }

  // ==================== IMPORT ====================

  /**
   * Загрузить файл для импорта оргструктуры
   * POST /manager/org-struct/import/upload
   * @param {Buffer|string} file - Файл для загрузки
   * @param {string} [filename='import.xlsx'] - Имя файла
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async uploadImportFile(file, filename = "import.xlsx", mimeType = null) {
    const url = `${this.baseURL}/manager/org-struct/import/upload`;
    const headers = this.getHeaders();
    // Удаляем Content-Type — Playwright установит multipart/form-data автоматически
    delete headers["Content-Type"];

    const resolvedMimeType =
      mimeType ||
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    const response = await this.request.post(url, {
      headers,
      multipart: {
        file: {
          name: filename,
          mimeType: resolvedMimeType,
          buffer: Buffer.from(file),
        },
      },
    });
    const data = await response.json().catch(() => null);

    this.logToAllure("POST", "/manager/org-struct/import/upload", {
      requestBody: { filename },
      status: response.status(),
      responseBody: data,
    });

    return { response, data };
  }

  /**
   * Обработать загруженный импорт
   * POST /manager/org-struct/import/{id}/process
   * @param {number} importId - ID импорта
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async processImport(importId) {
    return this.post(`/manager/org-struct/import/${importId}/process`);
  }

  /**
   * Применить импорт
   * POST /manager/org-struct/import/{id}/apply
   * @param {number} importId - ID импорта
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async applyImport(importId) {
    return this.post(`/manager/org-struct/import/${importId}/apply`);
  }

  /**
   * Получить ошибки импорта
   * GET /manager/org-struct/import/{id}/data/errors
   * @param {number} importId - ID импорта
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getImportErrors(importId) {
    return this.get(`/manager/org-struct/import/${importId}/data/errors`);
  }

  /**
   * Получить пользователей из импорта
   * GET /manager/org-struct/import/{id}/data/users
   * @param {number} importId - ID импорта
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getImportUsers(importId) {
    return this.get(`/manager/org-struct/import/${importId}/data/users`);
  }
}
