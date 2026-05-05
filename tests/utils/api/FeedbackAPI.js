// tests/utils/api/FeedbackAPI.js
// API клиент для модуля Feedback (Обратная связь)

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
 * Форматирование даты в ISO формат с таймзоной для API
 * API ожидает формат: 2026-01-10T00:00:00.000+03:00
 * @param {string|Date} date - Дата в формате YYYY-MM-DD или объект Date
 * @param {boolean} isEndOfDay - Если true, устанавливает время на конец дня (23:59:59.999)
 * @returns {string} - Дата в ISO формате с таймзоной
 */
function formatDateForAPI(date, isEndOfDay = false) {
  if (!date) return null;

  let dateObj;
  if (typeof date === "string") {
    // Если передана строка YYYY-MM-DD, парсим её
    dateObj = new Date(date);
  } else {
    dateObj = date;
  }

  if (isEndOfDay) {
    dateObj.setHours(23, 59, 59, 999);
  } else {
    dateObj.setHours(0, 0, 0, 0);
  }

  // Получаем offset таймзоны в формате +03:00
  const offset = -dateObj.getTimezoneOffset();
  const offsetHours = Math.floor(Math.abs(offset) / 60)
    .toString()
    .padStart(2, "0");
  const offsetMinutes = (Math.abs(offset) % 60).toString().padStart(2, "0");
  const offsetSign = offset >= 0 ? "+" : "-";
  const timezoneStr = `${offsetSign}${offsetHours}:${offsetMinutes}`;

  // Форматируем дату
  const year = dateObj.getFullYear();
  const month = (dateObj.getMonth() + 1).toString().padStart(2, "0");
  const day = dateObj.getDate().toString().padStart(2, "0");
  const hours = dateObj.getHours().toString().padStart(2, "0");
  const minutes = dateObj.getMinutes().toString().padStart(2, "0");
  const seconds = dateObj.getSeconds().toString().padStart(2, "0");
  const ms = dateObj.getMilliseconds().toString().padStart(3, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${ms}${timezoneStr}`;
}

/**
 * Преобразование параметров с датами для API запроса
 * @param {Object} params - Параметры запроса
 * @returns {Object} - Параметры с форматированными датами
 */
function formatParamsWithDates(params) {
  if (!params) return {};

  const result = { ...params };

  if (result.dateFrom) {
    result.dateFrom = formatDateForAPI(result.dateFrom, false);
  }
  if (result.dateTo) {
    result.dateTo = formatDateForAPI(result.dateTo, true);
  }

  return result;
}

/**
 * API Client для работы с обратной связью (Feedback)
 * Основные эндпоинты:
 * - /private/feedbacks/ - операции с благодарностями
 * - /private/feedback-requests/ - запросы фидбека
 * - /private/feedback-types/ - типы благодарностей
 * - /private/feedback-comments/ - комментарии к благодарностям
 * - /manager/feedbacks/ - управление благодарностями (для менеджеров)
 */
export class FeedbackAPI extends APIClient {
  /**
   * @param {import('@playwright/test').APIRequestContext} request
   */
  constructor(request) {
    super(request);
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

  // ==================== CONVENIENCE ALIASES ====================

  /**
   * Получить список благодарностей (алиас для getFeedbacks)
   * @param {Object} [params] - Параметры запроса
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getFeedbackList(params = {}) {
    return this.getFeedbacks(params);
  }

  /**
   * Получить запросы фидбека (алиас для getFeedbackRequestsForMe)
   * @param {Object} [params] - Параметры запроса
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getFeedbackRequests(params = {}) {
    return this.getFeedbackRequestsForMe(params);
  }

  /**
   * Создать благодарность (алиас для create)
   * @param {Object} payload - Данные благодарности
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async createFeedback(payload) {
    return this.create(payload);
  }

  // ==================== FEEDBACK TYPES ====================

  /**
   * Получить список типов благодарностей
   * GET /private/feedback-types/
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getFeedbackTypes() {
    return this.get("/private/feedback-types/?limit=0&offset=0");
  }

  // ==================== FEEDBACK CRUD ====================

  /**
   * Создать благодарность
   * POST /private/feedbacks/
   * @param {Object} payload - {body, targets, feedbackTypeId, userAccessType, usersWithAccess, competenciesIds, lackCompetenciesIds, feedbackRequestId, giftBonusAmount, giphyId}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async create(payload) {
    return this.post("/private/feedbacks/", payload);
  }

  /**
   * Получить благодарность по ID
   * GET /private/feedbacks/{id}/
   * @param {string|number} id - ID благодарности
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getById(id) {
    return this.get(`/private/feedbacks/${id}/`);
  }

  /**
   * Получить членов/получателей благодарности
   * GET /private/feedbacks/{id}/members/
   * @param {string|number} id - ID благодарности
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getMembers(id) {
    return this.get(`/private/feedbacks/${id}/members/`);
  }

  /**
   * Опубликовать благодарность (сделать публичной)
   * POST /private/feedbacks/{id}/publish/
   * @param {string|number} id - ID благодарности
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async publish(id) {
    return this.post(`/private/feedbacks/${id}/publish/`);
  }

  /**
   * Изменить статус благодарности
   * POST /private/feedbacks/{id}/set-status/
   * @param {string|number} id - ID благодарности
   * @param {string} feedbackStatus - Новый статус
   * @param {string} [comment] - Комментарий
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async setStatus(id, feedbackStatus, comment) {
    return this.post(`/private/feedbacks/${id}/set-status/`, {
      feedbackStatus,
      comment,
    });
  }

  // ==================== FEEDBACK LISTS ====================

  /**
   * Получить все благодарности (базовый эндпоинт)
   * GET /private/feedbacks/
   * @param {Object} params - {dateFrom, dateTo, feedbackTypeName, authorUserId, targetUserId, limit, offset, id}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getFeedbacks(params = {}) {
    const formattedParams = formatParamsWithDates(params);
    const queryString = new URLSearchParams(formattedParams).toString();
    const url = `/private/feedbacks/${queryString ? `?${queryString}` : ""}`;
    return this.get(url);
  }

  /**
   * Получить благодарности для пользователя (полученные)
   * GET /private/feedbacks/of-me/
   * @param {Object} params - {dateFrom, dateTo, feedbackTypeName, authorUserId, targetUserId, limit, offset, id}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getFeedbacksOfMe(params = {}) {
    const formattedParams = formatParamsWithDates(params);
    const queryString = new URLSearchParams(formattedParams).toString();
    const url = `/private/feedbacks/of-me/${queryString ? `?${queryString}` : ""}`;
    return this.get(url);
  }

  /**
   * Получить отправленные пользователем благодарности
   * GET /private/feedbacks/my/
   * @param {Object} params - {dateFrom, dateTo, feedbackTypeName, authorUserId, targetUserId, limit, offset, id}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getMyFeedbacks(params = {}) {
    const formattedParams = formatParamsWithDates(params);
    const queryString = new URLSearchParams(formattedParams).toString();
    const url = `/private/feedbacks/my/${queryString ? `?${queryString}` : ""}`;
    return this.get(url);
  }

  /**
   * Получить публичные/общие благодарности
   * GET /private/feedbacks/shared/
   * @param {Object} params - {dateFrom, dateTo, feedbackTypeName, authorUserId, targetUserId, includeMy, limit, offset, id}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getSharedFeedbacks(params = {}) {
    const formattedParams = formatParamsWithDates(params);
    const queryString = new URLSearchParams(formattedParams).toString();
    const url = `/private/feedbacks/shared/${queryString ? `?${queryString}` : ""}`;
    return this.get(url);
  }

  /**
   * Получить благодарности сотрудников (для менеджеров)
   * GET /private/feedbacks/of-employees/
   * @param {Object} params - {dateFrom, dateTo, feedbackTypeName, authorUserId, targetUserId, limit, offset, id}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getFeedbacksOfEmployees(params = {}) {
    const formattedParams = formatParamsWithDates(params);
    const queryString = new URLSearchParams(formattedParams).toString();
    const url = `/private/feedbacks/of-employees/${queryString ? `?${queryString}` : ""}`;
    return this.get(url);
  }

  // ==================== FEEDBACK STATISTICS (PRIVATE) ====================

  /**
   * Статистика по полученным благодарностям
   * GET /private/feedbacks/of-me/stats/
   * @param {Object} params - {dateFrom, dateTo}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getFeedbacksOfMeStats(params = {}) {
    const formattedParams = formatParamsWithDates(params);
    const queryString = new URLSearchParams(formattedParams).toString();
    const url = `/private/feedbacks/of-me/stats/${queryString ? `?${queryString}` : ""}`;
    return this.get(url);
  }

  /**
   * Статистика по отправленным благодарностям
   * GET /private/feedbacks/my/stats/
   * @param {Object} params - {dateFrom, dateTo}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getMyFeedbacksStats(params = {}) {
    const formattedParams = formatParamsWithDates(params);
    const queryString = new URLSearchParams(formattedParams).toString();
    const url = `/private/feedbacks/my/stats/${queryString ? `?${queryString}` : ""}`;
    return this.get(url);
  }

  /**
   * Статистика по публичным благодарностям
   * GET /private/feedbacks/shared/stats/
   * @param {Object} params - {dateFrom, dateTo}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getSharedFeedbacksStats(params = {}) {
    const formattedParams = formatParamsWithDates(params);
    const queryString = new URLSearchParams(formattedParams).toString();
    const url = `/private/feedbacks/shared/stats/${queryString ? `?${queryString}` : ""}`;
    return this.get(url);
  }

  /**
   * Статистика по благодарностям сотрудников
   * GET /private/feedbacks/of-employees/stats/
   * @param {Object} params - {dateFrom, dateTo}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getFeedbacksOfEmployeesStats(params = {}) {
    const formattedParams = formatParamsWithDates(params);
    const queryString = new URLSearchParams(formattedParams).toString();
    const url = `/private/feedbacks/of-employees/stats/${queryString ? `?${queryString}` : ""}`;
    return this.get(url);
  }

  // ==================== FEEDBACK REQUESTS ====================

  /**
   * Получить запросы фидбека для меня
   * GET /private/feedback-requests/for-me/
   * @param {Object} params - {id, dateFrom, dateTo, answerStatus, authorUserId, targetUserId, limit, offset}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getFeedbackRequestsForMe(params = {}) {
    const formattedParams = formatParamsWithDates(params);
    const queryString = new URLSearchParams(formattedParams).toString();
    const url = `/private/feedback-requests/for-me/${queryString ? `?${queryString}` : ""}`;
    return this.get(url);
  }

  /**
   * Получить мои отправленные запросы фидбека
   * GET /private/feedback-requests/my/
   * @param {Object} params - {id, dateFrom, dateTo, answerStatus, authorUserId, targetUserId, limit, offset}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getMyFeedbackRequests(params = {}) {
    const formattedParams = formatParamsWithDates(params);
    const queryString = new URLSearchParams(formattedParams).toString();
    const url = `/private/feedback-requests/my/${queryString ? `?${queryString}` : ""}`;
    return this.get(url);
  }

  /**
   * Получить запрос фидбека по ID
   * GET /private/feedback-requests/{id}/
   * @param {string|number} id - ID запроса
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getFeedbackRequestById(id) {
    return this.get(`/private/feedback-requests/${id}/`);
  }

  /**
   * Получить пользователей, которым отправлен запрос фидбека
   * GET /private/feedback-requests/{id}/requested-users/
   * @param {string|number} feedbackRequestId - ID запроса
   * @param {Object} params - {limit, offset}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getRequestedUsers(feedbackRequestId, params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const url = `/private/feedback-requests/${feedbackRequestId}/requested-users/${queryString ? `?${queryString}` : ""}`;
    return this.get(url);
  }

  /**
   * Создать запрос фидбека
   * POST /private/feedback-requests/
   * @param {Object} payload - {comment, targets, requestedUsersIds}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async createFeedbackRequest(payload) {
    return this.post("/private/feedback-requests/", payload);
  }

  /**
   * Статистика по полученным запросам фидбека
   * GET /private/feedback-requests/for-me/stats/
   * @param {Object} params - {dateFrom, dateTo}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getFeedbackRequestsForMeStats(params = {}) {
    const formattedParams = formatParamsWithDates(params);
    const queryString = new URLSearchParams(formattedParams).toString();
    const url = `/private/feedback-requests/for-me/stats/${queryString ? `?${queryString}` : ""}`;
    return this.get(url);
  }

  /**
   * Статистика по отправленным запросам фидбека
   * GET /private/feedback-requests/my/stats/
   * @param {Object} params - {dateFrom, dateTo}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getMyFeedbackRequestsStats(params = {}) {
    const formattedParams = formatParamsWithDates(params);
    const queryString = new URLSearchParams(formattedParams).toString();
    const url = `/private/feedback-requests/my/stats/${queryString ? `?${queryString}` : ""}`;
    return this.get(url);
  }

  // ==================== FEEDBACK COMMENTS ====================

  /**
   * Получить комментарии к благодарности
   * GET /private/feedback-comments/of-feedback/{feedbackId}/
   * @param {string|number} feedbackId - ID благодарности
   * @param {Object} params - {limit, offset}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getComments(feedbackId, params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const url = `/private/feedback-comments/of-feedback/${feedbackId}/${queryString ? `?${queryString}` : ""}`;
    return this.get(url);
  }

  /**
   * Получить комментарий по ID
   * GET /private/feedback-comments/{id}/
   * @param {string|number} id - ID комментария
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getCommentById(id) {
    return this.get(`/private/feedback-comments/${id}/`);
  }

  /**
   * Создать комментарий к благодарности
   * POST /private/feedback-comments/
   * @param {string|number} feedbackId - ID благодарности
   * @param {string} body - Текст комментария
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async createComment(feedbackId, body) {
    return this.post("/private/feedback-comments/", {
      feedbackId,
      body,
    });
  }

  /**
   * Обновить комментарий
   * POST /private/feedback-comments/{id}/
   * @param {string|number} id - ID комментария
   * @param {string} body - Новый текст комментария
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async updateComment(id, body) {
    return this.post(`/private/feedback-comments/${id}/`, { body });
  }

  /**
   * Удалить комментарий
   * DELETE /private/feedback-comments/{id}/
   * @param {string|number} id - ID комментария
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async deleteComment(id) {
    return this.delete(`/private/feedback-comments/${id}/`);
  }

  // ==================== FEEDBACK UPDATE/DELETE ====================

  /**
   * Обновить благодарность
   * POST /private/feedbacks/{id}/
   * @param {string|number} id - ID благодарности
   * @param {Object} payload - {body, userAccessType, usersWithAccess, competenciesIds, lackCompetenciesIds}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async update(id, payload) {
    return this.post(`/private/feedbacks/${id}/`, payload);
  }

  /**
   * Удалить благодарность
   * DELETE /private/feedbacks/{id}/
   * @param {string|number} id - ID благодарности
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async deleteFeedback(id) {
    return this.delete(`/private/feedbacks/${id}/`);
  }

  // ==================== FEEDBACK REQUEST UPDATE/DELETE ====================

  /**
   * Обновить запрос фидбека
   * POST /private/feedback-requests/{id}/
   * @param {string|number} id - ID запроса
   * @param {Object} payload - {comment, targets, requestedUsersIds}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async updateFeedbackRequest(id, payload) {
    return this.post(`/private/feedback-requests/${id}/`, payload);
  }

  /**
   * Удалить запрос фидбека
   * DELETE /private/feedback-requests/{id}/
   * @param {string|number} id - ID запроса
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async deleteFeedbackRequest(id) {
    return this.delete(`/private/feedback-requests/${id}/`);
  }

  // ==================== MANAGER ENDPOINTS ====================

  /**
   * Получить все благодарности (только для менеджеров)
   * GET /manager/feedbacks/
   * @param {Object} params - {q, dateFrom, dateTo, feedbackTypeName, authorUserId, targetUserId, requestAuthorUserId, limit, offset, id}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getAllFeedbacks(params = {}) {
    const formattedParams = formatParamsWithDates(params);
    const queryString = new URLSearchParams(formattedParams).toString();
    const url = `/manager/feedbacks/${queryString ? `?${queryString}` : ""}`;
    return this.get(url);
  }

  /**
   * Получить токен экспорта благодарностей
   * GET /manager/feedbacks/export/get-token/
   * @param {string} userDate - Дата пользователя
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getExportToken(userDate) {
    return this.get(
      `/manager/feedbacks/export/get-token/?userDate=${userDate}`,
    );
  }

  /**
   * Включить мотивационные благодарности
   * POST /manager/feedbacks/motivational-enabled/
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async enableMotivational() {
    return this.post("/manager/feedbacks/motivational-enabled/");
  }

  /**
   * Отключить мотивационные благодарности
   * POST /manager/feedbacks/motivational-disabled/
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async disableMotivational() {
    return this.post("/manager/feedbacks/motivational-disabled/");
  }

  // ==================== MANAGER STATISTICS ====================

  /**
   * Временная шкала статистики благодарностей (для менеджеров)
   * GET /manager/feedbacks/statistics/timeline/
   * @param {Object} params - {dateFrom, dateTo, aggregation, targetUserId, authorUserId}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getStatisticsTimeline(params = {}) {
    const formattedParams = formatParamsWithDates(params);
    const queryString = new URLSearchParams(formattedParams).toString();
    const url = `/manager/feedbacks/statistics/timeline/${queryString ? `?${queryString}` : ""}`;
    return this.get(url);
  }

  /**
   * Самые активные отправители благодарностей
   * GET /manager/feedbacks/statistics/most-active-users/
   * @param {Object} params - {dateFrom, dateTo}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getStatisticsMostActiveUsers(params = {}) {
    const formattedParams = formatParamsWithDates(params);
    const queryString = new URLSearchParams(formattedParams).toString();
    const url = `/manager/feedbacks/statistics/most-active-users/${queryString ? `?${queryString}` : ""}`;
    return this.get(url);
  }

  /**
   * Самые популярные получатели благодарностей
   * GET /manager/feedbacks/statistics/most-popular-users/
   * @param {Object} params - {dateFrom, dateTo}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getStatisticsMostPopularUsers(params = {}) {
    const formattedParams = formatParamsWithDates(params);
    const queryString = new URLSearchParams(formattedParams).toString();
    const url = `/manager/feedbacks/statistics/most-popular-users/${queryString ? `?${queryString}` : ""}`;
    return this.get(url);
  }

  /**
   * Временная шкала статистики запросов фидбека (для менеджеров)
   * GET /manager/feedback-requests/statistics/timeline/
   * @param {Object} params - {dateFrom, dateTo, aggregation, authorUserId, targetUserId}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getRequestsStatisticsTimeline(params = {}) {
    const formattedParams = formatParamsWithDates(params);
    const queryString = new URLSearchParams(formattedParams).toString();
    const url = `/manager/feedback-requests/statistics/timeline/${queryString ? `?${queryString}` : ""}`;
    return this.get(url);
  }

  /**
   * Самые активные отправители запросов фидбека
   * GET /manager/feedback-requests/statistics/most-active-users/
   * @param {Object} params - {dateFrom, dateTo, limit, offset}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getRequestsStatisticsMostActiveUsers(params = {}) {
    const formattedParams = formatParamsWithDates(params);
    const queryString = new URLSearchParams(formattedParams).toString();
    const url = `/manager/feedback-requests/statistics/most-active-users/${queryString ? `?${queryString}` : ""}`;
    return this.get(url);
  }

  // ==================== PRIVATE API - дополнительные методы ====================

  /**
   * Получить тип благодарности по ID
   * GET /private/feedback-types/{id}/
   * @param {string|number} id - ID типа
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getFeedbackTypeById(id) {
    return this.get(`/private/feedback-types/${id}/`);
  }

  /**
   * Получить фидбек пользователя (алиас для getFeedbacksOfEmployees с фильтром)
   * @param {number|string} userId - ID пользователя
   * @param {Object} [params] - Дополнительные параметры
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getUserFeedback(userId, params = {}) {
    return this.getFeedbacksOfEmployees({ ...params, userIds: [userId] });
  }
}
