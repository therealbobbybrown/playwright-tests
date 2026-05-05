// tests/utils/api/ObjectivesAPI.js
// API клиент для модуля Objectives (Цели)

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
 * API Client для работы с целями (Objectives)
 * Основные эндпоинты:
 * - /private/objectives/ - операции с целями
 * - /private/objective-comments/ - комментарии к целям
 * - /manager/objectives/ - настройки и управление (для менеджеров)
 */
export class ObjectivesAPI extends APIClient {
  /**
   * @param {import('@playwright/test').APIRequestContext} request
   */
  constructor(request) {
    super(request);
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

  // ==================== PERIOD DATE HELPERS ====================

  /**
   * Получить startDate/endDate для конкретного квартала (DEVAPR-11585).
   * @param {number} year - Год, напр. 2026
   * @param {1|2|3|4} q - Номер квартала
   * @returns {{startDate: string, endDate: string}} Даты в формате "YYYY-MM-DD"
   */
  static getQuarterDates(year, q) {
    const starts = ["01-01", "04-01", "07-01", "10-01"];
    const ends = ["03-31", "06-30", "09-30", "12-31"];
    return {
      startDate: `${year}-${starts[q - 1]}`,
      endDate: `${year}-${ends[q - 1]}`,
    };
  }

  /**
   * Получить startDate/endDate для полугодия.
   * @param {number} year
   * @param {1|2} h
   * @returns {{startDate: string, endDate: string}}
   */
  static getHalfYearDates(year, h) {
    if (h === 1) return { startDate: `${year}-01-01`, endDate: `${year}-06-30` };
    return { startDate: `${year}-07-01`, endDate: `${year}-12-31` };
  }

  /**
   * Получить startDate/endDate для текущего квартала (дефолтный период).
   * Используется вместо устаревшего getCurrentPeriod() с periodYear/periodQ.
   * @returns {{startDate: string, endDate: string, year: number, q: number}}
   */
  static getCurrentQuarterDates() {
    const now = new Date();
    const year = now.getFullYear();
    const q = Math.floor(now.getMonth() / 3) + 1;
    return { ...ObjectivesAPI.getQuarterDates(year, q), year, q };
  }

  // ==================== PERIODS ====================

  /**
   * Получить периоды целей
   * GET /private/objectives/periods/
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getPeriods() {
    return this.get("/private/objectives/periods/");
  }

  // ==================== OBJECTIVES CRUD ====================

  /**
   * Получить список целей
   * POST /private/objectives/get
   * @param {Object} params - Фильтры:
   *   {dateFrom, dateTo} — ФИЛЬТР по периоду (DEVAPR-11585, формат "YYYY-MM-DD", логика пересечения).
   *   ВАЖНО: для фильтрации используются dateFrom/dateTo, НЕ startDate/endDate!
   *   startDate/endDate игнорируются в GET-запросах (используются только при создании цели).
   *   Без dateFrom/dateTo — возвращает ВСЕ цели (DEVAPR-11591).
   *   Остальные: {status, developmentPlanId, level, responsibleUserIds, departmentIds,
   *   includeDepartmentTitle, includeCanEdit, q, limit, offset, sortBy, sortOrder}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getObjectives(params = {}) {
    return this.post("/private/objectives/get", params);
  }

  /**
   * Получить мои цели
   * POST /private/objectives/get/mine
   * @param {Object} params - {startDate, endDate, status, level, includeDepartmentTitle, includeCanEdit, q, limit, offset, sortBy, sortOrder}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getMyObjectives(params = {}) {
    return this.post("/private/objectives/get/mine", params);
  }

  /**
   * Получить цели подчинённых
   * POST /private/objectives/get/subordinates
   * @param {Object} params - {startDate, endDate, status, level, responsibleUserIds, departmentIds, includeDepartmentTitle, includeCanEdit, q, limit, offset, sortBy, sortOrder}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getSubordinatesObjectives(params = {}) {
    return this.post("/private/objectives/get/subordinates", params);
  }

  /**
   * Получить черновики целей
   * GET /private/objectives/draft
   * @param {Object} params - {limit, offset, includeDepartmentTitle, sortBy, sortOrder}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getDraftObjectives(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const url = `/private/objectives/draft${queryString ? `?${queryString}` : ""}`;
    return this.get(url);
  }

  /**
   * Получить цель по ID
   * GET /private/objectives/{objectiveId}/
   * @param {string|number} objectiveId - ID цели
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getObjectiveById(objectiveId) {
    return this.get(`/private/objectives/${objectiveId}/`);
  }

  /**
   * Создать/обновить цель
   * POST /private/objectives/
   * @param {Object} data - данные цели.
   *   Новые поля периода (DEVAPR-11585): {startDate: "YYYY-MM-DD", endDate: "YYYY-MM-DD"}
   *   Остальные: {title, description, status, milestones, responsibleUserId, level, etc.}
   *   Устаревшие: {periodYear, periodQ} — могут не поддерживаться сервером.
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async saveObjective(data) {
    // Auto-fill startDate/endDate from periodYear/periodQ if not provided
    if (data.periodYear && data.periodQ && !data.startDate && !data.endDate) {
      const { startDate, endDate } = ObjectivesAPI.getQuarterDates(
        data.periodYear,
        data.periodQ,
      );
      data = { ...data, startDate, endDate };
    }
    const result = await this.post("/private/objectives/", data);
    // Back-fill periodYear/periodQ from startDate/endDate for backward compat
    if (result.data && result.data.startDate && !result.data.periodQ) {
      const d = new Date(result.data.startDate);
      result.data.periodYear = d.getFullYear();
      result.data.periodQ = Math.floor(d.getMonth() / 3) + 1;
    }
    return result;
  }

  /**
   * Удалить цель
   * DELETE /private/objectives/{objectiveId}
   * @param {string|number} objectiveId - ID цели
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async deleteObjective(objectiveId) {
    return this.delete(`/private/objectives/${objectiveId}`);
  }

  /**
   * Проверить, есть ли цели
   * GET /private/objectives/is-empty
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async checkIsEmpty() {
    return this.get("/private/objectives/is-empty");
  }

  // ==================== MILESTONES ====================

  /**
   * Обновить прогресс milestone
   * PATCH /private/objectives/{objectiveId}/milestones/{id}
   * @param {string|number} objectiveId - ID цели
   * @param {string|number} milestoneId - ID milestone
   * @param {Object} data - данные для обновления
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async updateMilestoneProgress(objectiveId, milestoneId, data) {
    return this.patch(
      `/private/objectives/${objectiveId}/milestones/${milestoneId}`,
      data,
    );
  }

  // ==================== FILTERS ====================

  /**
   * Получить фильтр подчинённых (ответственных)
   * GET /private/objectives/subordinates/filter
   * @param {Object} params - {q, limit, offset, withSelf}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getSubordinatesFilter(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const url = `/private/objectives/subordinates/filter${queryString ? `?${queryString}` : ""}`;
    return this.get(url);
  }

  /**
   * Получить выбранный фильтр подчинённых
   * GET /private/objectives/subordinates/filter/selected
   * @param {Object} params - {q, limit, offset, ids}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getSubordinatesFilterSelected(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const url = `/private/objectives/subordinates/filter/selected${queryString ? `?${queryString}` : ""}`;
    return this.get(url);
  }

  /**
   * Получить отделы руководителя
   * GET /private/objectives/head/departments
   * @param {Object} params - {q, limit, offset, departmentId}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getHeadDepartments(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const url = `/private/objectives/head/departments${queryString ? `?${queryString}` : ""}`;
    return this.get(url);
  }

  /**
   * Получить результаты запроса пользователей подчинённых
   * POST /private/objectives/subordinates/query-results/get
   * @param {Object} query - параметры запроса
   * @param {Object} params - {limit, offset}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getSubordinatesQueryResults(query, params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const url = `/private/objectives/subordinates/query-results/get${queryString ? `?${queryString}` : ""}`;
    return this.post(url, query);
  }

  // ==================== OBJECTIVE COMMENTS ====================

  /**
   * Получить комментарии к цели
   * GET /private/objective-comments/of-objective/{objectiveId}/
   * @param {string|number} objectiveId - ID цели
   * @param {Object} params - {limit, offset}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getComments(objectiveId, params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const url = `/private/objective-comments/of-objective/${objectiveId}/${queryString ? `?${queryString}` : ""}`;
    return this.get(url);
  }

  /**
   * Получить комментарий по ID
   * GET /private/objective-comments/{id}/
   * @param {string|number} id - ID комментария
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getCommentById(id) {
    return this.get(`/private/objective-comments/${id}/`);
  }

  /**
   * Создать комментарий к цели
   * POST /private/objective-comments/
   * @param {string|number} objectiveId - ID цели
   * @param {string} body - текст комментария
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async createComment(objectiveId, body) {
    return this.post("/private/objective-comments/", {
      objectiveId,
      body,
    });
  }

  /**
   * Обновить комментарий
   * POST /private/objective-comments/{id}/
   * @param {string|number} id - ID комментария
   * @param {string} body - новый текст комментария
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async updateComment(id, body) {
    return this.post(`/private/objective-comments/${id}/`, { body });
  }

  /**
   * Удалить комментарий
   * DELETE /private/objective-comments/{id}/
   * @param {string|number} id - ID комментария
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async deleteComment(id) {
    return this.delete(`/private/objective-comments/${id}/`);
  }

  /**
   * Проверить доступ к комментариям цели
   * GET /private/objective-comments/of-objective/{objectiveId}/check-access/
   * @param {string|number} objectiveId - ID цели
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async checkCommentAccess(objectiveId) {
    return this.get(
      `/private/objective-comments/of-objective/${objectiveId}/check-access/`,
    );
  }

  // ==================== MANAGER SETTINGS ====================

  /**
   * Получить настройки целей
   * GET /manager/objectives/settings/
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getSettings() {
    return this.get("/manager/objectives/settings/");
  }

  /**
   * Сохранить настройки целей
   * POST /manager/objectives/settings/
   * @param {Object} data - настройки
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async saveSettings(data) {
    return this.post("/manager/objectives/settings/", data);
  }

  /**
   * Включить мотивационные цели
   * POST /manager/objectives/motivational-enabled/
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async enableMotivational() {
    return this.post("/manager/objectives/motivational-enabled/");
  }

  /**
   * Отключить мотивационные цели
   * POST /manager/objectives/motivational-disabled/
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async disableMotivational() {
    return this.post("/manager/objectives/motivational-disabled/");
  }

  // ==================== CONVENIENCE ALIASES ====================

  /**
   * Получить цели пользователя (алиас для getObjectives с фильтром по userId)
   * @param {number|string} userId - ID пользователя
   * @param {Object} [params] - Дополнительные параметры
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getUserObjectives(userId, params = {}) {
    return this.getObjectives({ ...params, responsibleUserIds: [userId] });
  }

  /**
   * Создать цель (алиас для saveObjective)
   * @param {Object} data - Данные цели
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async createObjective(data) {
    return this.saveObjective(data);
  }

  // ==================== APPROVAL (DEVAPR-11722) ====================

  /**
   * Сменить approval status цели
   * POST /private/objectives/{objectiveId}/approval-status/
   * @param {number|string} objectiveId - ID цели
   * @param {string} approvalStatus - Новый статус: 'approvalWaiting'|'approvalProcess'|'approved'
   * @param {string} [comment] - Опциональный комментарий (при возврате на доработку)
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async changeApprovalStatus(objectiveId, approvalStatus, comment) {
    const body = { status: approvalStatus };
    if (comment) {
      body.comment = comment;
    }
    return this.post(
      `/private/objectives/${objectiveId}/approval-status/`,
      body,
    );
  }

  /**
   * Отправить цель на утверждение (approvalWaiting → approvalProcess)
   * @param {number|string} objectiveId - ID цели
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async sendForApproval(objectiveId) {
    return this.changeApprovalStatus(objectiveId, "approvalProcess");
  }

  /**
   * Утвердить цель (approvalProcess → approved или approvalWaiting → approved)
   * POST /private/objectives/{objectiveId}/approval-status/
   * @param {number|string} objectiveId - ID цели
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async approveObjective(objectiveId) {
    return this.changeApprovalStatus(objectiveId, "approved");
  }

  /**
   * Вернуть цель на доработку (approvalProcess → approvalWaiting)
   * @param {number|string} objectiveId - ID цели
   * @param {string} [comment] - Комментарий о причинах возврата
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async returnToRevision(objectiveId, comment = "") {
    return this.changeApprovalStatus(
      objectiveId,
      "approvalWaiting",
      comment || undefined,
    );
  }

  /**
   * Включить/выключить утверждение целей
   * PATCH /manager/company/settings/
   * @param {boolean} enabled - true = включить, false = выключить
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async setApprovalEnabled(enabled) {
    return this.patch("/manager/company/settings/", {
      isObjectivesApprovalEnabled: !!enabled,
    });
  }

  /**
   * Получить настройки компании (включая is_objectives_approval_enabled)
   * GET /private/company/settings/
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getCompanySettings() {
    return this.get("/private/company/settings/");
  }
}
