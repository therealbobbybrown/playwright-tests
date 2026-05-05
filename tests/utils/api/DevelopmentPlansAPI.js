// tests/utils/api/DevelopmentPlansAPI.js
// API клиент для работы с планами развития (Development Plans)

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
 * API клиент для работы с планами развития
 * Endpoints: /private/development-plans/*, /manager/development-plans/*, /manager/development-actions/*, /manager/development-plan-templates/*
 */
export class DevelopmentPlansAPI extends APIClient {
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

  // ==================== CONVENIENCE ALIASES ====================

  /**
   * Получить список планов развития (алиас для getDevelopmentPlans)
   * @param {Object} [params] - Параметры запроса
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getPlans(params = {}) {
    return this.getDevelopmentPlans(params);
  }

  /**
   * Получить шаблоны планов развития
   * GET /manager/development-plan-templates/
   * @param {Object} [params] - Параметры запроса
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getTemplates(params = {}) {
    return this.get("/manager/development-plan-templates/", params);
  }

  // ==================== DEVELOPMENT PLANS (Private) ====================

  /**
   * Получить план развития по ID
   * GET /private/development-plans/{id}
   * @param {number} id - ID плана
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getDevelopmentPlan(id) {
    return this.get(`/private/development-plans/${id}`);
  }

  /**
   * Получить список планов развития
   * POST /private/development-plans/get
   * @param {Object} [params] - Параметры запроса
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getDevelopmentPlans(params = {}) {
    return this.post("/private/development-plans/get", params);
  }

  /**
   * Получить планы для руководителя
   * POST /private/development-plans/get/for-head
   * @param {Object} [params] - Параметры запроса
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getDevelopmentPlansForHead(params = {}) {
    return this.post("/private/development-plans/get/for-head", params);
  }

  /**
   * Получить планы для куратора
   * POST /private/development-plans/get/for-curator
   * @param {Object} [params] - Параметры запроса
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getDevelopmentPlansForCurator(params = {}) {
    return this.post("/private/development-plans/get/for-curator", params);
  }

  /**
   * Получить планы для ответственного
   * POST /private/development-plans/get/for-responsible
   * @param {Object} [params] - Параметры запроса
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getDevelopmentPlansForResponsible(params = {}) {
    return this.post("/private/development-plans/get/for-responsible", params);
  }

  /**
   * Создать план развития
   * POST /private/development-plans/
   * @param {Object} data - Данные плана
   * @param {string} data.title - Название
   * @param {number} data.responsibleUserId - ID ответственного
   * @param {number[]} [data.curatorIds] - ID кураторов
   * @param {string} [data.startDate] - Дата начала
   * @param {string} [data.endDate] - Дата окончания
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async createDevelopmentPlan({
    title,
    responsibleUserId,
    curatorIds,
    startDate,
    endDate,
    performanceReviewId,
    performanceReviewRevisionId,
  } = {}) {
    return this.post("/private/development-plans/", {
      title,
      responsibleUserId,
      curatorIds,
      startDate,
      endDate,
      performanceReviewId,
      performanceReviewRevisionId,
    });
  }

  /**
   * Создать план на основе шаблона
   * POST /private/development-plans/create-by-template/
   * @param {Object} data - Данные
   * @param {number} data.responsibleUserId - ID ответственного
   * @param {number} data.developmentPlanTemplateId - ID шаблона
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async createDevelopmentPlanFromTemplate({
    responsibleUserId,
    developmentPlanTemplateId,
    performanceReviewId,
    performanceReviewRevisionId,
  } = {}) {
    return this.post("/private/development-plans/create-by-template/", {
      responsibleUserId,
      developmentPlanTemplateId,
      performanceReviewId,
      performanceReviewRevisionId,
    });
  }

  /**
   * Обновить план развития
   * PATCH /private/development-plans/{id}
   * @param {number} id - ID плана
   * @param {Object} data - Данные для обновления
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async updateDevelopmentPlan(
    id,
    { title, curatorIds, startDate, endDate } = {},
  ) {
    return this.patch(`/private/development-plans/${id}`, {
      title,
      curatorIds,
      startDate,
      endDate,
    });
  }

  /**
   * Удалить план развития
   * DELETE /private/development-plans/{id}
   * @param {number} id - ID плана
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async deleteDevelopmentPlan(id) {
    return this.delete(`/private/development-plans/${id}`);
  }

  /**
   * Активировать план
   * POST /private/development-plans/{id}/activate
   * @param {number} id - ID плана
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async activateDevelopmentPlan(id) {
    return this.post(`/private/development-plans/${id}/activate`);
  }

  /**
   * Перевести план в черновик
   * POST /private/development-plans/{id}/draft
   * @param {number} id - ID плана
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async draftDevelopmentPlan(id) {
    return this.post(`/private/development-plans/${id}/draft`);
  }

  /**
   * Отправить план на согласование
   * POST /private/development-plans/{id}/approval
   * @param {number} id - ID плана
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async approvalDevelopmentPlan(id) {
    return this.post(`/private/development-plans/${id}/approval`);
  }

  /**
   * Завершить план
   * POST /private/development-plans/{id}/complete
   * @param {number} id - ID плана
   * @param {string} [completedComment] - Комментарий завершения
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async completeDevelopmentPlan(id, completedComment) {
    return this.post(`/private/development-plans/${id}/complete`, {
      completedComment,
    });
  }

  // ==================== DEVELOPMENT PLAN OBJECTIVES ====================

  /**
   * Получить цели плана
   * GET /private/development-plans/{id}/objectives/
   * @param {number} developmentPlanId - ID плана
   * @param {Object} [params] - Параметры
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getDevelopmentPlanObjectives(developmentPlanId, params = {}) {
    return this.get(
      `/private/development-plans/${developmentPlanId}/objectives/`,
      params,
    );
  }

  /**
   * Получить цель плана по ID
   * GET /private/development-plans/{planId}/objectives/{objectiveId}
   * @param {number} developmentPlanId - ID плана
   * @param {number} objectiveId - ID цели
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getDevelopmentPlanObjective(developmentPlanId, objectiveId) {
    return this.get(
      `/private/development-plans/${developmentPlanId}/objectives/${objectiveId}`,
    );
  }

  /**
   * Сохранить цель плана
   * POST /private/development-plans/{id}/objectives/
   * @param {number} developmentPlanId - ID плана
   * @param {Object} data - Данные цели
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async saveDevelopmentPlanObjective(developmentPlanId, data = {}) {
    return this.post(
      `/private/development-plans/${developmentPlanId}/objectives/`,
      data,
    );
  }

  /**
   * Удалить цель плана
   * DELETE /private/development-plans/{planId}/objectives/{objectiveId}
   * @param {number} developmentPlanId - ID плана
   * @param {number} objectiveId - ID цели
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async deleteDevelopmentPlanObjective(developmentPlanId, objectiveId) {
    return this.delete(
      `/private/development-plans/${developmentPlanId}/objectives/${objectiveId}`,
    );
  }

  // ==================== AI GENERATION FOR MILESTONES ====================

  /**
   * Запустить AI-генерацию milestones для цели плана развития
   * POST /private/development-plans/objectives/{objectiveId}/milestones/start-ai-generation
   * @param {number} objectiveId - ID цели плана развития
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async startMilestonesAiGeneration(objectiveId) {
    return this.post(
      `/private/development-plans/objectives/${objectiveId}/milestones/start-ai-generation`,
    );
  }

  /**
   * Проверить статус AI-генерации milestones
   * POST /private/development-plans/objectives/{objectiveId}/milestones/check-ai-generation
   * @param {number} objectiveId - ID цели плана развития
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async checkMilestonesAiGeneration(objectiveId) {
    return this.post(
      `/private/development-plans/objectives/${objectiveId}/milestones/check-ai-generation`,
    );
  }

  /**
   * Отменить AI-генерацию milestones
   * PATCH /private/development-plans/objectives/{objectiveId}/milestones/cancel-ai-generation
   * @param {number} objectiveId - ID цели плана развития
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async cancelMilestonesAiGeneration(objectiveId) {
    return this.patch(
      `/private/development-plans/objectives/${objectiveId}/milestones/cancel-ai-generation`,
    );
  }

  // ==================== DEVELOPMENT PLAN SETTINGS ====================

  /**
   * Получить настройки планов развития
   * GET /private/development-plans/settings/
   * @param {Object} [params] - Параметры
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getDevelopmentPlansSettings(params = {}) {
    return this.get("/private/development-plans/settings/", params);
  }

  /**
   * Сохранить настройки планов развития (manager)
   * POST /manager/development-plans/settings/
   * @param {Object} data - Настройки
   * @param {boolean} [data.isEnabled] - Включено
   * @param {number} [data.defaultCuratorId] - ID куратора по умолчанию
   * @param {string} [data.runTime] - Время запуска
   * @param {string} [data.repeatType] - Тип повторения
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async saveManagerDevelopmentPlansSettings({
    isEnabled,
    defaultCuratorId,
    runTime,
    repeatType,
  } = {}) {
    return this.post("/manager/development-plans/settings/", {
      isEnabled,
      defaultCuratorId,
      runTime,
      repeatType,
    });
  }

  /**
   * Включить мотивационные планы развития
   * POST /manager/development-plans/motivational-enabled/
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async enableDevelopmentPlanMotivational() {
    return this.post("/manager/development-plans/motivational-enabled/");
  }

  /**
   * Выключить мотивационные планы развития
   * POST /manager/development-plans/motivational-disabled/
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async disableDevelopmentPlanMotivational() {
    return this.post("/manager/development-plans/motivational-disabled/");
  }

  /**
   * Проверить, является ли текущий пользователь куратором
   * GET /private/development-plans/me/is-curator/
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getMeIsCurator() {
    return this.get("/private/development-plans/me/is-curator/");
  }

  /**
   * Проверить, является ли текущий пользователь куратором для пользователя
   * GET /private/development-plans/me/is-curator/for-user/{userId}
   * @param {number} userId - ID пользователя
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getMeIsCuratorForUser(userId) {
    return this.get(
      `/private/development-plans/me/is-curator/for-user/${userId}`,
    );
  }

  // ==================== DEVELOPMENT PLAN TEMPLATES (Manager) ====================

  /**
   * Получить список шаблонов планов развития
   * GET /private/development-plan-templates/get/
   * @param {Object} [params] - Параметры запроса
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getDevelopmentPlanTemplates(params = {}) {
    return this.get("/private/development-plan-templates/get/", params);
  }

  /**
   * Получить шаблон плана по ID
   * GET /private/development-plan-templates/{id}/
   * @param {number} id - ID шаблона
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getDevelopmentPlanTemplate(id) {
    return this.get(`/private/development-plan-templates/${id}/`);
  }

  /**
   * Создать шаблон плана развития
   * POST /manager/development-plan-templates/
   * @param {Object} data - Данные шаблона
   * @param {string} data.title - Название шаблона
   * @param {string} [data.description] - Описание
   * @param {string} [data.developmentPlanTitle] - Название для плана
   * @param {boolean} [data.setHeadCurator] - Руководитель как куратор
   * @param {number[]} [data.curatorIds] - ID кураторов
   * @param {number} [data.periodDuration] - Длительность периода
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async createDevelopmentPlanTemplate({
    title,
    description,
    developmentPlanTitle,
    setHeadCurator,
    curatorIds,
    periodDuration,
  } = {}) {
    return this.post("/manager/development-plan-templates/", {
      title,
      description,
      developmentPlanTitle,
      setHeadCurator,
      curatorIds,
      periodDuration,
    });
  }

  /**
   * Обновить шаблон плана развития
   * PATCH /manager/development-plan-templates/{id}/
   * @param {number} id - ID шаблона
   * @param {Object} data - Данные для обновления
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async updateDevelopmentPlanTemplate(
    id,
    {
      title,
      description,
      developmentPlanTitle,
      setHeadCurator,
      curatorIds,
      periodDuration,
    } = {},
  ) {
    return this.patch(`/manager/development-plan-templates/${id}/`, {
      title,
      description,
      developmentPlanTitle,
      setHeadCurator,
      curatorIds,
      periodDuration,
    });
  }

  /**
   * Удалить шаблон плана развития
   * DELETE /manager/development-plan-templates/{id}/
   * @param {number} id - ID шаблона
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async deleteDevelopmentPlanTemplate(id) {
    return this.delete(`/manager/development-plan-templates/${id}/`);
  }

  /**
   * Получить цели шаблона
   * GET /private/development-plan-templates/{id}/objectives/
   * @param {number} templateId - ID шаблона
   * @param {Object} [params] - Параметры
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getDevelopmentPlanTemplateObjectives(templateId, params = {}) {
    return this.get(
      `/private/development-plan-templates/${templateId}/objectives/`,
      params,
    );
  }

  /**
   * Сохранить цель шаблона
   * POST /manager/development-plan-templates/{id}/objectives/
   * @param {number} templateId - ID шаблона
   * @param {Object} data - Данные цели
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async saveDevelopmentPlanTemplateObjective(templateId, data = {}) {
    return this.post(
      `/manager/development-plan-templates/${templateId}/objectives/`,
      data,
    );
  }

  /**
   * Удалить цель шаблона
   * DELETE /manager/development-plan-templates/{templateId}/objectives/{objectiveId}/
   * @param {number} templateId - ID шаблона
   * @param {number} objectiveId - ID цели
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async deleteDevelopmentPlanTemplateObjective(templateId, objectiveId) {
    return this.delete(
      `/manager/development-plan-templates/${templateId}/objectives/${objectiveId}/`,
    );
  }

  // ==================== DEVELOPMENT ACTIONS (Manager) ====================

  /**
   * Получить список действий развития
   * GET /manager/development-actions/
   * @param {Object} [params] - Параметры запроса
   * @param {string} [params.q] - Поисковый запрос
   * @param {string} [params.type] - Тип
   * @param {string} [params.status] - Статус
   * @param {number} [params.competenceId] - ID компетенции
   * @param {number} [params.limit] - Лимит
   * @param {number} [params.offset] - Смещение
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getDevelopmentActions(params = {}) {
    return this.get("/manager/development-actions/", params);
  }

  /**
   * Получить действие развития по ID
   * GET /manager/development-actions/{id}/
   * @param {number} id - ID действия
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getDevelopmentAction(id) {
    return this.get(`/manager/development-actions/${id}/`);
  }

  /**
   * Создать действие развития
   * POST /manager/development-actions/
   * @param {Object} data - Данные действия
   * @param {string} data.title - Название
   * @param {string} [data.description] - Описание
   * @param {string} [data.type] - Тип
   * @param {number[]} [data.competenceIds] - ID компетенций
   * @param {string} [data.status] - Статус
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async createDevelopmentAction({
    title,
    description,
    type,
    competenceIds,
    status,
  } = {}) {
    return this.post("/manager/development-actions/", {
      title,
      description,
      type,
      competenceIds,
      status,
    });
  }

  /**
   * Обновить действие развития
   * PATCH /manager/development-actions/{id}/
   * @param {number} id - ID действия
   * @param {Object} data - Данные для обновления
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async updateDevelopmentAction(
    id,
    { title, description, type, status, competenceIds } = {},
  ) {
    return this.patch(`/manager/development-actions/${id}/`, {
      title,
      description,
      type,
      status,
      competenceIds,
    });
  }

  /**
   * Удалить действие развития
   * DELETE /manager/development-actions/{id}/
   * @param {number} id - ID действия
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async deleteDevelopmentAction(id) {
    return this.delete(`/manager/development-actions/${id}/`);
  }

  // ==================== DEVELOPMENT ACTIONS (Private) ====================

  /**
   * Получить список действий развития (private)
   * GET /private/development-actions/
   * @param {Object} [params] - Параметры запроса
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getPrivateDevelopmentActions(params = {}) {
    return this.get("/private/development-actions/", params);
  }

  /**
   * Получить действие развития по ID (private)
   * GET /private/development-actions/{id}
   * @param {number} id - ID действия
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getPrivateDevelopmentAction(id) {
    return this.get(`/private/development-actions/${id}`);
  }

  /**
   * Получить статистику действий развития
   * GET /private/development-actions/stats
   * @param {Object} [params] - Параметры
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getDevelopmentActionsStats(params = {}) {
    return this.get("/private/development-actions/stats", params);
  }

  /**
   * Получить действие развития по названию
   * GET /private/development-actions/by-title/
   * @param {string} title - Название
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getDevelopmentActionByTitle(title) {
    return this.get("/private/development-actions/by-title/", { title });
  }

  // ==================== ADDITIONAL ALIASES ====================

  /**
   * Получить планы развития пользователя
   * @param {number|string} userId - ID пользователя
   * @param {Object} [params] - Дополнительные параметры
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getUserPlans(userId, params = {}) {
    return this.getDevelopmentPlans({ ...params, responsibleUserId: userId });
  }

  /**
   * Создать план развития (алиас для createDevelopmentPlan)
   * @param {Object} data - Данные плана
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async createPlan(data) {
    return this.createDevelopmentPlan(data);
  }
}
