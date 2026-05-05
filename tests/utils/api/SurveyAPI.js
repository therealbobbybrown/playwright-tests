// tests/utils/api/SurveyAPI.js
// API клиент для модуля Surveys (Опросы)

import { createHash } from "crypto";
import { APIClient } from "./APIClient.js";
import { getCredentials } from "./AuthAPI.js";

/**
 * Генерация fingerPrint как MD5 хеш
 * @returns {string}
 */
function generateFingerPrint() {
  const timestamp = Date.now().toString();
  return createHash("md5").update(timestamp).digest("hex");
}

/**
 * API Client для работы с опросами (Surveys)
 * Основные эндпоинты:
 * - /manager/surveys/ - управление опросами
 * - /manager/survey-reminds/ - напоминания
 * - /private/surveys/ - внутренние опросы
 * - /public/surveys/ - публичные опросы
 * - /protected/surveys/ - персональные опросы
 */
export class SurveyAPI extends APIClient {
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
   * Получить список опросов (алиас для getList)
   * @param {Object} [params] - Параметры запроса
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getSurveys(params = {}) {
    return this.getList(params);
  }

  /**
   * Получить статистику опроса
   * GET /manager/surveys/{id}/statistics/
   * @param {string|number} id - ID опроса
   * @param {Object} [params] - Параметры запроса
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getSurveyStatistics(id, params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const url = `/manager/surveys/${id}/statistics/${queryString ? `?${queryString}` : ""}`;
    return this.get(url);
  }

  /**
   * Получить типы вопросов
   * GET /manager/surveys/question-types/
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getQuestionTypes() {
    return this.get("/manager/surveys/question-types/");
  }

  // ==================== SURVEY CRUD ====================

  /**
   * Получить список опросов
   * GET /manager/surveys/
   * @param {Object} params - {status, sortBy, orderBy, q, limit, offset, category, customCategory}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getList(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const url = `/manager/surveys/${queryString ? `?${queryString}` : ""}`;
    return this.get(url);
  }

  /**
   * Получить опрос по ID
   * GET /manager/surveys/{id}/
   * @param {string|number} id - ID опроса
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getById(id) {
    return this.get(`/manager/surveys/${id}/`);
  }

  /**
   * Получить шаблоны опросов
   * GET /manager/surveys/templates/
   * @param {Object} params - {limit, offset}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getTemplates(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const url = `/manager/surveys/templates/${queryString ? `?${queryString}` : ""}`;
    return this.get(url);
  }

  /**
   * Получить шаблон как опрос
   * GET /manager/surveys/templates/{templateId}/as-survey/
   * @param {string|number} templateId - ID шаблона
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getTemplateAsSurvey(templateId) {
    return this.get(`/manager/surveys/templates/${templateId}/as-survey/`);
  }

  /**
   * Создать черновик опроса
   * POST /manager/surveys/
   * @param {Object} payload - {templateId?, srcSurveyId?, body?, withCategory?}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async createDraft(payload = {}) {
    const { templateId, srcSurveyId, withCategory, ...body } = payload;
    const params = new URLSearchParams();
    if (templateId) params.append("templateId", templateId);
    if (srcSurveyId) params.append("srcSurveyId", srcSurveyId);
    if (withCategory !== undefined) params.append("withCategory", withCategory);

    const queryString = params.toString();
    const url = `/manager/surveys/${queryString ? `?${queryString}` : ""}`;
    return this.post(url, body);
  }

  /**
   * Обновить опрос
   * POST /manager/surveys/{id}/
   * @param {string|number} id - ID опроса
   * @param {Object} payload - Данные для обновления
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async update(id, payload) {
    return this.post(`/manager/surveys/${id}/`, payload);
  }

  /**
   * Удалить опрос
   * DELETE /manager/surveys/{id}/
   * @param {string|number} id - ID опроса
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async remove(id) {
    return this.delete(`/manager/surveys/${id}/`);
  }

  /**
   * Изменить категорию опроса
   * PATCH /manager/surveys/{id}/change-category
   * @param {string|number} id - ID опроса
   * @param {string|number} categoryId - ID категории
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async changeCategory(id, categoryId) {
    const url = categoryId
      ? `/manager/surveys/${id}/change-category?categoryId=${categoryId}`
      : `/manager/surveys/${id}/change-category`;
    return this.patch(url);
  }

  // ==================== SURVEY LIFECYCLE ====================

  /**
   * Запустить опрос
   * POST /manager/surveys/{id}/start/
   * @param {string|number} id - ID опроса
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async start(id) {
    return this.post(`/manager/surveys/${id}/start/`);
  }

  /**
   * Остановить опрос
   * POST /manager/surveys/{id}/stop/
   * @param {string|number} id - ID опроса
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async stop(id) {
    return this.post(`/manager/surveys/${id}/stop/`);
  }

  /**
   * Возобновить опрос
   * POST /manager/surveys/{id}/resume/
   * @param {string|number} id - ID опроса
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async resume(id) {
    return this.post(`/manager/surveys/${id}/resume/`);
  }

  // ==================== SURVEY FAVORITES ====================

  /**
   * Добавить опрос в избранное
   * POST /manager/surveys/{id}/fave/
   * @param {string|number} id - ID опроса
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async fave(id) {
    return this.post(`/manager/surveys/${id}/fave/`);
  }

  /**
   * Удалить опрос из избранного
   * POST /manager/surveys/{id}/unfave/
   * @param {string|number} id - ID опроса
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async unfave(id) {
    return this.post(`/manager/surveys/${id}/unfave/`);
  }

  // ==================== SURVEY REVISIONS ====================

  /**
   * Получить ревизии опроса
   * GET /manager/surveys/{id}/revisions/
   * @param {string|number} id - ID опроса
   * @param {Object} params - {limit, offset}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getRevisions(id, params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const url = `/manager/surveys/${id}/revisions/${queryString ? `?${queryString}` : ""}`;
    return this.get(url);
  }

  /**
   * Получить последнюю ревизию опроса (private)
   * GET /private/surveys/{id}/revisions/last/
   * @param {string|number} id - ID опроса
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getLastRevision(id) {
    return this.get(`/private/surveys/${id}/revisions/last/`);
  }

  // ==================== SURVEY REMINDERS ====================

  /**
   * Получить напоминания
   * GET /manager/survey-reminds/
   * @param {Object} params - {surveyRevisionId, limit, offset}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getReminds(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const url = `/manager/survey-reminds/${queryString ? `?${queryString}` : ""}`;
    return this.get(url);
  }

  /**
   * Создать напоминание
   * POST /manager/survey-reminds/
   * @param {Object} payload - {surveyRevisionId, title, body, scheduledAt}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async createRemind(payload) {
    return this.post("/manager/survey-reminds/", payload);
  }

  /**
   * Обновить напоминание
   * POST /manager/survey-reminds/{id}/
   * @param {string|number} id - ID напоминания
   * @param {Object} payload - {title, body, scheduledAt}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async updateRemind(id, payload) {
    return this.post(`/manager/survey-reminds/${id}/`, payload);
  }

  /**
   * Удалить напоминание
   * DELETE /manager/survey-reminds/{id}/
   * @param {string|number} id - ID напоминания
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async removeRemind(id) {
    return this.delete(`/manager/survey-reminds/${id}/`);
  }

  /**
   * Восстановить напоминание
   * POST /manager/survey-reminds/{id}/restore
   * @param {string|number} id - ID напоминания
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async restoreRemind(id) {
    return this.post(`/manager/survey-reminds/${id}/restore`);
  }

  // ==================== SURVEY USERS ====================

  /**
   * Поиск пользователей для ревизии
   * GET /manager/surveys/{surveyId}/revisions/{revisionId}/users/search/
   * @param {string|number} surveyId - ID опроса
   * @param {string|number} revisionId - ID ревизии
   * @param {Object} params - {q, category, limit, offset}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async searchUsers(surveyId, revisionId, params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const url = `/manager/surveys/${surveyId}/revisions/${revisionId}/users/search/${queryString ? `?${queryString}` : ""}`;
    return this.get(url);
  }

  /**
   * Добавить пользователей к ревизии
   * POST /manager/surveys/{surveyId}/revisions/{revisionId}/users/append/
   * @param {string|number} surveyId - ID опроса
   * @param {string|number} revisionId - ID ревизии
   * @param {Object} payload - {usersIds}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async appendUsers(surveyId, revisionId, payload) {
    return this.post(
      `/manager/surveys/${surveyId}/revisions/${revisionId}/users/append/`,
      payload,
    );
  }

  // ==================== STATISTICS ====================

  /**
   * Получить сводную статистику
   * POST /manager/surveys/{id}/statistics/summary/get/
   * @param {string|number} id - ID опроса
   * @param {Object} payload - {revisionsIds, userDate, usersIds, userGroupsIds, userDepartmentsIds}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getStatisticsSummary(id, payload = {}) {
    return this.post(`/manager/surveys/${id}/statistics/summary/get/`, payload);
  }

  /**
   * Получить timeline статистику по вопросу
   * POST /manager/surveys/{id}/statistics/questions/{questionId}/timeline/get/
   * @param {string|number} id - ID опроса
   * @param {string|number} questionId - ID вопроса
   * @param {Object} payload - {revisionsIds, aggregation, userDate, usersIds, userGroupsIds, userDepartmentsIds, beforeDate}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getStatisticsQuestionTimeline(id, questionId, payload = {}) {
    return this.post(
      `/manager/surveys/${id}/statistics/questions/${questionId}/timeline/get/`,
      payload,
    );
  }

  /**
   * Получить статистику ответов по вопросу
   * POST /manager/surveys/{id}/statistics/questions/{questionId}/answers/get/
   * @param {string|number} id - ID опроса
   * @param {string|number} questionId - ID вопроса
   * @param {Object} payload - {revisionsIds, aggregation, userDate, usersIds, userGroupsIds, userDepartmentsIds, beforeDate}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getStatisticsQuestionAnswers(id, questionId, payload = {}) {
    return this.post(
      `/manager/surveys/${id}/statistics/questions/${questionId}/answers/get/`,
      payload,
    );
  }

  /**
   * Получить статистику по ревизиям
   * GET /manager/surveys/{id}/statistics/revisions/
   * @param {string|number} id - ID опроса
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getStatisticsRevisions(id) {
    return this.get(`/manager/surveys/${id}/statistics/revisions/`);
  }

  /**
   * Получить статистику по департаментам
   * GET /manager/surveys/{id}/statistics/departments/
   * @param {string|number} id - ID опроса
   * @param {Object} params - {revisionsIds}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getStatisticsDepartments(id, params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const url = `/manager/surveys/${id}/statistics/departments/${queryString ? `?${queryString}` : ""}`;
    return this.get(url);
  }

  /**
   * Получить статистику по группам пользователей
   * GET /manager/surveys/{id}/statistics/user-groups/
   * @param {string|number} id - ID опроса
   * @param {Object} params - {revisionsIds}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getStatisticsUserGroups(id, params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const url = `/manager/surveys/${id}/statistics/user-groups/${queryString ? `?${queryString}` : ""}`;
    return this.get(url);
  }

  /**
   * Получить статистику по пользователям
   * GET /manager/surveys/{id}/statistics/users/
   * @param {string|number} id - ID опроса
   * @param {Object} params - {revisionsIds, q, limit, offset}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getStatisticsUsers(id, params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const url = `/manager/surveys/${id}/statistics/users/${queryString ? `?${queryString}` : ""}`;
    return this.get(url);
  }

  /**
   * Обновить членство пользователей для статистики
   * POST /manager/surveys/{id}/statistics/membership/update/
   * @param {string|number} id - ID опроса
   * @param {string|number} revisionId - ID ревизии
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async updateStatisticsUsersMembership(id, revisionId) {
    return this.post(
      `/manager/surveys/${id}/statistics/membership/update/?revisionId=${revisionId}`,
    );
  }

  /**
   * Получить настройки статистики
   * GET /manager/surveys/{id}/statistics/settings/
   * @param {string|number} id - ID опроса
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getStatisticsSettings(id) {
    return this.get(`/manager/surveys/${id}/statistics/settings/`);
  }

  /**
   * Обновить настройки статистики
   * POST /manager/surveys/{id}/statistics/settings/
   * @param {string|number} id - ID опроса
   * @param {Object} settings - Настройки
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async updateStatisticsSettings(id, settings) {
    return this.post(`/manager/surveys/${id}/statistics/settings/`, settings);
  }

  // ==================== EXPORT ====================

  /**
   * Получить токен экспорта
   * GET /manager/surveys/{id}/export/get-token/
   * @param {string|number} id - ID опроса
   * @param {Object} params - {userDate, filters, resultsWithAI, resultsWithGroups}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getExportToken(id, params = {}) {
    const queryParams = { ...params };
    if (params.filters) {
      queryParams.filters = JSON.stringify(params.filters);
    }
    const queryString = new URLSearchParams(queryParams).toString();
    const url = `/manager/surveys/${id}/export/get-token/${queryString ? `?${queryString}` : ""}`;
    return this.get(url);
  }

  /**
   * Получить токен экспорта персональных кодов
   * GET /manager/surveys/{id}/personal-code/export/get-token/
   * @param {string|number} id - ID опроса
   * @param {string} revisionAlias - Алиас ревизии
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getPersonalCodeExportToken(id, revisionAlias) {
    return this.get(
      `/manager/surveys/${id}/personal-code/export/get-token/?revisionAlias=${revisionAlias}`,
    );
  }

  /**
   * Получить токен экспорта групповых кодов
   * GET /manager/surveys/{id}/group-code/export/get-token/
   * @param {string|number} id - ID опроса
   * @param {string} revisionAlias - Алиас ревизии
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getGroupCodeExportToken(id, revisionAlias) {
    return this.get(
      `/manager/surveys/${id}/group-code/export/get-token/?revisionAlias=${revisionAlias}`,
    );
  }

  // ==================== INTERNAL SURVEYS (PRIVATE) ====================

  /**
   * Получить внутренний опрос
   * GET /private/surveys/{surveyId}/{revisionAlias}/
   * @param {string|number} surveyId - ID опроса
   * @param {string} revisionAlias - Алиас ревизии
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getInternalSurvey(surveyId, revisionAlias) {
    return this.get(`/private/surveys/${surveyId}/${revisionAlias}/`);
  }

  /**
   * Получить ID компании-владельца опроса
   * GET /private/surveys/{surveyId}/owner-company-id/
   * @param {string|number} surveyId - ID опроса
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getSurveyOwnerCompanyId(surveyId) {
    return this.get(`/private/surveys/${surveyId}/owner-company-id/`);
  }

  /**
   * Начать внутренний опрос
   * POST /private/surveys/{surveyId}/{revisionAlias}/answer/page/start/
   * @param {string|number} surveyId - ID опроса
   * @param {string} revisionAlias - Алиас ревизии
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async startInternalSurvey(surveyId, revisionAlias) {
    return this.post(
      `/private/surveys/${surveyId}/${revisionAlias}/answer/page/start/`,
    );
  }

  /**
   * Ответить на страницу внутреннего опроса
   * POST /private/surveys/{surveyId}/{revisionAlias}/answer/page/next/
   * @param {string|number} surveyId - ID опроса
   * @param {string} revisionAlias - Алиас ревизии
   * @param {Object} answers - Ответы
   * @param {string} pageToken - Токен страницы
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async answerPageInternalSurvey(surveyId, revisionAlias, answers, pageToken) {
    return this.post(
      `/private/surveys/${surveyId}/${revisionAlias}/answer/page/next/?pageToken=${pageToken}`,
      answers,
    );
  }

  /**
   * Вернуться на предыдущую страницу внутреннего опроса
   * POST /private/surveys/{surveyId}/{revisionAlias}/answer/page/prev/
   * @param {string|number} surveyId - ID опроса
   * @param {string} revisionAlias - Алиас ревизии
   * @param {string} pageToken - Токен страницы
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async prevPageInternalSurvey(surveyId, revisionAlias, pageToken) {
    return this.post(
      `/private/surveys/${surveyId}/${revisionAlias}/answer/page/prev/?pageToken=${pageToken}`,
    );
  }

  /**
   * Отправить все ответы внутреннего опроса
   * POST /private/surveys/{surveyId}/{revisionAlias}/answer/
   * @param {string|number} surveyId - ID опроса
   * @param {string} revisionAlias - Алиас ревизии
   * @param {Object} answers - Ответы
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async answerInternalSurvey(surveyId, revisionAlias, answers) {
    return this.post(
      `/private/surveys/${surveyId}/${revisionAlias}/answer/`,
      answers,
    );
  }

  // ==================== EXTERNAL SURVEYS (PUBLIC) ====================

  /**
   * Получить внешний опрос
   * GET /public/surveys/{surveyId}/{revisionAlias}/
   * @param {string|number} surveyId - ID опроса
   * @param {string} revisionAlias - Алиас ревизии
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getExternalSurvey(surveyId, revisionAlias) {
    return this.get(`/public/surveys/${surveyId}/${revisionAlias}/`);
  }

  /**
   * Проверить доступность персонального опроса
   * GET /public/surveys/{surveyId}/{revisionAlias}/personal-availability/
   * @param {string|number} surveyId - ID опроса
   * @param {string} revisionAlias - Алиас ревизии
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async checkPersonalSurveyAvailability(surveyId, revisionAlias) {
    return this.get(
      `/public/surveys/${surveyId}/${revisionAlias}/personal-availability/`,
    );
  }

  /**
   * Получить токен персонального опроса
   * GET /public/surveys/{surveyId}/{revisionAlias}/personal-token/
   * @param {string|number} surveyId - ID опроса
   * @param {string} revisionAlias - Алиас ревизии
   * @param {string} code - Персональный код
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getPersonalSurveyToken(surveyId, revisionAlias, code) {
    return this.get(
      `/public/surveys/${surveyId}/${revisionAlias}/personal-token/?code=${code}`,
    );
  }

  /**
   * Получить код департамента для ревизии
   * GET /public/surveys/{surveyId}/{revisionAlias}/department-code/{code}/
   * @param {string|number} surveyId - ID опроса
   * @param {string} revisionAlias - Алиас ревизии
   * @param {string} code - Код департамента
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getRevisionDepartmentCode(surveyId, revisionAlias, code) {
    return this.get(
      `/public/surveys/${surveyId}/${revisionAlias}/department-code/${code}/`,
    );
  }

  /**
   * Получить код группы для ревизии
   * GET /public/surveys/{surveyId}/{revisionAlias}/group-code/{code}/
   * @param {string|number} surveyId - ID опроса
   * @param {string} revisionAlias - Алиас ревизии
   * @param {string} code - Код группы
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getRevisionGroupCode(surveyId, revisionAlias, code) {
    return this.get(
      `/public/surveys/${surveyId}/${revisionAlias}/group-code/${code}/`,
    );
  }

  /**
   * Получить групповой токен для ревизии
   * GET /public/surveys/{surveyId}/{revisionAlias}/group-token/
   * @param {string|number} surveyId - ID опроса
   * @param {string} revisionAlias - Алиас ревизии
   * @param {string} codeType - Тип кода
   * @param {string} code - Код
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getRevisionGroupToken(surveyId, revisionAlias, codeType, code) {
    return this.get(
      `/public/surveys/${surveyId}/${revisionAlias}/group-token/?codeType=${codeType}&code=${code}`,
    );
  }

  /**
   * Начать внешний опрос
   * POST /public/surveys/{surveyId}/{revisionAlias}/answer/page/start/
   * @param {string|number} surveyId - ID опроса
   * @param {string} revisionAlias - Алиас ревизии
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async startExternalSurvey(surveyId, revisionAlias) {
    return this.post(
      `/public/surveys/${surveyId}/${revisionAlias}/answer/page/start/`,
    );
  }

  // ==================== AI CLASSIFICATION ====================

  /**
   * Получить последнюю задачу AI классификации
   * GET /manager/surveys/{id}/ai/classify-comments/tasks/last/
   * @param {string|number} id - ID опроса
   * @param {Object} params - {revisionId, questionId}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getAiClassifyCommentsLastTask(id, params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const url = `/manager/surveys/${id}/ai/classify-comments/tasks/last/${queryString ? `?${queryString}` : ""}`;
    return this.get(url);
  }

  /**
   * Получить последнюю задачу AI классификации для всего опроса
   * GET /manager/surveys/{id}/ai/classify-comments/survey-tasks/last/
   * @param {string|number} id - ID опроса
   * @param {Object} params - {revisionId, needToUpdate}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getAiClassifyCommentsLastSurveyTask(id, params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const url = `/manager/surveys/${id}/ai/classify-comments/survey-tasks/last/${queryString ? `?${queryString}` : ""}`;
    return this.get(url);
  }

  /**
   * Запустить задачу AI классификации для опроса
   * POST /manager/surveys/{id}/ai/classify-comments/survey-task/
   * @param {string|number} id - ID опроса
   * @param {Object} payload - {revisionId}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async startAiClassifyCommentsSurveyTask(id, payload) {
    return this.post(
      `/manager/surveys/${id}/ai/classify-comments/survey-task/`,
      payload,
    );
  }

  /**
   * Повторить задачу AI классификации
   * POST /manager/surveys/{id}/ai/classify-comments/survey-tasks/retry/
   * @param {string|number} id - ID опроса
   * @param {Object} payload - {revisionId}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async retryAiClassifyCommentsSurveyTask(id, payload) {
    return this.post(
      `/manager/surveys/${id}/ai/classify-comments/survey-tasks/retry/`,
      payload,
    );
  }

  /**
   * Создать задачу AI классификации для вопроса
   * POST /manager/surveys/{id}/ai/classify-comments/tasks/
   * @param {string|number} id - ID опроса
   * @param {Object} payload - {revisionId, questionId}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async createAiClassifyCommentsTask(id, payload) {
    return this.post(
      `/manager/surveys/${id}/ai/classify-comments/tasks/`,
      payload,
    );
  }

  /**
   * Обновить задачу AI классификации
   * POST /manager/surveys/{id}/ai/classify-comments/tasks/{taskId}/refresh/
   * @param {string|number} id - ID опроса
   * @param {string|number} taskId - ID задачи
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async refreshAiClassifyCommentsTask(id, taskId) {
    return this.post(
      `/manager/surveys/${id}/ai/classify-comments/tasks/${taskId}/refresh/`,
    );
  }
}
