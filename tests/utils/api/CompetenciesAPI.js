// tests/utils/api/CompetenciesAPI.js
// API клиент для работы с компетенциями

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
 * API клиент для работы с компетенциями
 * Endpoints: /manager/competencies/*, /manager/competence-groups/*, /manager/competence-scales/*
 */
export class CompetenciesAPI extends APIClient {
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
  async signIn(email, password, options = {}) {
    const { timeout = 120_000, ...restOptions } = options;
    const { data } = await this.post(
      "/auth/account/signin",
      {
        email,
        password,
        fingerPrint: this.fingerPrint,
        permissions: [],
      },
      { timeout, ...restOptions },
    );
    if (data?.accessToken) {
      this.setToken(data.accessToken);
    }
    return data;
  }

  // ==================== CONVENIENCE ALIASES ====================

  /**
   * Получить группы компетенций (алиас для getCompetenceGroups)
   * @param {Object} [params] - Параметры запроса
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getGroups(params = {}) {
    return this.getCompetenceGroups(params);
  }

  /**
   * Получить шкалы компетенций (алиас для getCompetenceScales)
   * @param {Object} [params] - Параметры запроса
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getScales(params = {}) {
    return this.getCompetenceScales(params);
  }

  // ==================== COMPETENCIES ====================

  /**
   * Получить список компетенций
   * GET /manager/competencies/
   * @param {Object} [params] - Параметры запроса
   * @param {number} [params.limit] - Лимит
   * @param {number} [params.offset] - Смещение
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getCompetencies(params = {}) {
    return this.get("/manager/competencies/", params);
  }

  /**
   * Получить компетенцию по ID
   * GET /manager/competencies/{id}/
   * @param {number} id - ID компетенции
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getCompetency(id) {
    return this.get(`/manager/competencies/${id}/`);
  }

  /**
   * Получить компетенцию по названию
   * GET /manager/competencies/by-title/
   * @param {string} title - Название компетенции
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getCompetencyByTitle(title) {
    return this.get("/manager/competencies/by-title/", { title });
  }

  /**
   * Создать компетенцию
   * POST /manager/competencies/
   * @param {Object} data - Данные компетенции
   * @param {string} data.title - Название
   * @param {string} [data.description] - Описание
   * @param {string} [data.emoji] - Эмодзи
   * @param {number} [data.groupId] - ID группы
   * @param {boolean} [data.forFeedback] - Для обратной связи
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async createCompetency({
    title,
    description,
    emoji,
    groupId,
    forFeedback,
  } = {}) {
    return this.post("/manager/competencies/", {
      title,
      description,
      emoji,
      groupId,
      forFeedback,
    });
  }

  /**
   * Обновить компетенцию
   * POST /manager/competencies/{id}/
   * @param {number} id - ID компетенции
   * @param {Object} data - Данные для обновления
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async updateCompetency(
    id,
    {
      title,
      description,
      emoji,
      groupId,
      forFeedback,
      goodRecommendation,
      badRecommendation,
    } = {},
  ) {
    return this.post(`/manager/competencies/${id}/`, {
      title,
      description,
      emoji,
      groupId,
      forFeedback,
      goodRecommendation,
      badRecommendation,
    });
  }

  /**
   * Удалить компетенцию
   * DELETE /manager/competencies/{id}/
   * @param {number} id - ID компетенции
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async deleteCompetency(id) {
    return this.delete(`/manager/competencies/${id}/`);
  }

  /**
   * Изменить шкалу компетенции
   * PATCH /manager/competencies/{id}/change-scale/
   * @param {number} id - ID компетенции
   * @param {number} scaleId - ID шкалы
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async changeCompetencyScale(id, scaleId) {
    return this.patch(`/manager/competencies/${id}/change-scale/`, { scaleId });
  }

  /**
   * Проверить связанные сущности
   * GET /manager/competencies/{id}/is-related/
   * @param {number} id - ID компетенции
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getCompetencyIsRelated(id) {
    return this.get(`/manager/competencies/${id}/is-related/`);
  }

  /**
   * Добавить действия развития к компетенции
   * POST /manager/competencies/{id}/development-actions/add/
   * @param {number} id - ID компетенции
   * @param {number[]} developmentActionIds - ID действий развития
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async addDevelopmentActions(id, developmentActionIds) {
    return this.post(`/manager/competencies/${id}/development-actions/add/`, {
      developmentActionIds,
    });
  }

  // ==================== COMPETENCE GROUPS ====================

  /**
   * Получить список групп компетенций
   * GET /private/competence-groups
   * @param {Object} [params] - Параметры запроса
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getCompetenceGroups(params = {}) {
    const query = new URLSearchParams(params).toString();
    const endpoint = query
      ? `/private/competence-groups?${query}`
      : "/private/competence-groups";
    return this.get(endpoint);
  }

  /**
   * Создать группу компетенций
   * POST /manager/competence-groups
   * @param {string} title - Название группы
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async createCompetenceGroup(title) {
    return this.post("/manager/competence-groups", { title });
  }

  /**
   * Обновить группу компетенций
   * PATCH /manager/competence-groups/{id}
   * @param {number} id - ID группы
   * @param {string} title - Новое название
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async updateCompetenceGroup(id, title) {
    return this.patch(`/manager/competence-groups/${id}`, { title });
  }

  /**
   * Удалить группу компетенций
   * DELETE /manager/competence-groups/{id}
   * @param {number} id - ID группы
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async deleteCompetenceGroup(id) {
    return this.delete(`/manager/competence-groups/${id}`);
  }

  /**
   * Проверить связанные сущности группы
   * GET /manager/competence-groups/{id}/is-related
   * @param {number} id - ID группы
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getCompetenceGroupIsRelated(id) {
    return this.get(`/manager/competence-groups/${id}/is-related`);
  }

  // ==================== COMPETENCE SCALES ====================

  /**
   * Получить список шкал компетенций
   * GET /manager/competence-scales/
   * @param {Object} [params] - Параметры запроса
   * @param {number} [params.limit] - Лимит
   * @param {number} [params.offset] - Смещение
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getCompetenceScales(params = {}) {
    return this.get("/manager/competence-scales/", params);
  }

  /**
   * Получить шкалу по ID
   * GET /manager/competence-scales/{id}
   * @param {number} id - ID шкалы
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getCompetenceScale(id) {
    return this.get(`/manager/competence-scales/${id}`);
  }

  /**
   * Получить шкалу по названию
   * GET /manager/competence-scales/by-title/
   * @param {string} title - Название шкалы
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getCompetenceScaleByTitle(title) {
    return this.get("/manager/competence-scales/by-title/", { title });
  }

  /**
   * Создать шкалу компетенций
   * POST /manager/competence-scales/
   * @param {Object} data - Данные шкалы
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async createCompetenceScale({
    title,
    description,
    rangeMin,
    rangeMax,
    rangeMinLabel,
    rangeMaxLabel,
    stepLabels,
    disallowStepNumbers,
    widget,
  } = {}) {
    return this.post("/manager/competence-scales/", {
      title,
      description,
      rangeMin,
      rangeMax,
      rangeMinLabel,
      rangeMaxLabel,
      stepLabels,
      disallowStepNumbers,
      widget,
    });
  }

  /**
   * Обновить шкалу компетенций
   * PATCH /manager/competence-scales/{id}/
   * @param {number} id - ID шкалы
   * @param {Object} data - Данные для обновления
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async updateCompetenceScale(id, data = {}) {
    return this.patch(`/manager/competence-scales/${id}/`, data);
  }

  /**
   * Удалить шкалу компетенций
   * DELETE /manager/competence-scales/{id}/
   * @param {number} id - ID шкалы
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async deleteCompetenceScale(id) {
    return this.delete(`/manager/competence-scales/${id}/`);
  }

  /**
   * Сделать шкалу по умолчанию
   * POST /manager/competence-scales/{id}/make-default
   * @param {number} id - ID шкалы
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async makeCompetenceScaleDefault(id) {
    return this.post(`/manager/competence-scales/${id}/make-default`);
  }

  /**
   * Получить оценки компетенций пользователя
   * GET /manager/performance-reviews/statistics/competences/of-user/{userId}
   * @param {number|string} userId - ID пользователя
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getUserAssessments(userId) {
    return this.get(
      `/manager/performance-reviews/statistics/competences/of-user/${userId}`,
    );
  }
}
