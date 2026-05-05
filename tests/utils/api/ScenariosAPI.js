// tests/utils/api/ScenariosAPI.js
// API клиент для модуля Scenarios (Сценарии / Workflows)

import { createHash, randomUUID } from "crypto";
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
 * Нормализует формат времени для API (добавляет секунды если нужно)
 * @param {string} time - Время в формате HH:mm или HH:mm:ss
 * @returns {string} - Время в формате HH:mm:ss
 */
function normalizeTime(time) {
  if (!time) return "09:00:00";
  // Если уже в формате HH:mm:ss, возвращаем как есть
  if (/^\d{2}:\d{2}:\d{2}$/.test(time)) return time;
  // Добавляем секунды если нужно
  if (/^\d{2}:\d{2}$/.test(time)) return `${time}:00`;
  return "09:00:00";
}

/**
 * API Client для работы со сценариями (Scenarios / Workflows)
 *
 * Основные эндпоинты:
 * - /manager/scenarios/ - CRUD сценариев
 * - /manager/scenarios/{id}/activity/ - активация
 * - /manager/scenarios/{id}/performers/ - участники
 *
 * Права доступа: ManageScenario + ManageSurvey (только супер-администратор)
 *
 * Lifecycle: draft → active (необратимо)
 */
export class ScenariosAPI extends APIClient {
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

  // ==================== SCENARIOS CRUD ====================

  /**
   * Получить список сценариев
   * GET /manager/scenarios/
   * @param {Object} params - {q, own, sortBy, orderBy, status, limit, offset}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getList(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const url = `/manager/scenarios/${queryString ? `?${queryString}` : ""}`;
    return this.get(url);
  }

  /**
   * Получить список сценариев (алиас)
   * @param {Object} [params]
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getScenarios(params = {}) {
    return this.getList(params);
  }

  /**
   * Получить сценарий по ID
   * GET /manager/scenarios/{id}/
   * @param {string|number} id - ID сценария
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getById(id) {
    return this.get(`/manager/scenarios/${id}/`);
  }

  /**
   * Получить сценарий по ID (алиас)
   * @param {string|number} id
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getScenario(id) {
    return this.getById(id);
  }

  /**
   * Создать сценарий
   * POST /manager/scenarios/
   * @param {Object} payload - {title (required), description (optional)}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async create(payload) {
    return this.post("/manager/scenarios/", payload);
  }

  /**
   * Создать сценарий (алиас)
   * @param {Object} payload - {title, description}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async createScenario(payload) {
    return this.create(payload);
  }

  /**
   * Обновить сценарий
   * PATCH /manager/scenarios/{id}/
   * @param {string|number} id - ID сценария
   * @param {Object} payload - {title, description, actions}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async update(id, payload) {
    return this.patch(`/manager/scenarios/${id}/`, payload);
  }

  /**
   * Обновить сценарий (алиас)
   * @param {string|number} id
   * @param {Object} payload
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async updateScenario(id, payload) {
    return this.update(id, payload);
  }

  /**
   * Удалить сценарий (soft delete)
   * DELETE /manager/scenarios/{id}/
   * @param {string|number} id - ID сценария
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async remove(id) {
    return this.delete(`/manager/scenarios/${id}/`);
  }

  /**
   * Удалить сценарий (алиас)
   * @param {string|number} id
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async deleteScenario(id) {
    return this.remove(id);
  }

  // ==================== SCENARIO LIFECYCLE ====================

  /**
   * Активировать сценарий (draft → active)
   * PATCH /manager/scenarios/{id}/activity/
   *
   * ВАЖНО: Эта операция необратима! После активации нельзя вернуть в draft.
   *
   * @param {string|number} id - ID сценария
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async activate(id) {
    return this.patch(`/manager/scenarios/${id}/activity/`);
  }

  /**
   * Активировать сценарий (алиас)
   * @param {string|number} id
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async activateScenario(id) {
    return this.activate(id);
  }

  // ==================== SCENARIO ACTIONS ====================

  /**
   * Добавить действие к сценарию через update
   * Действия передаются в массиве actions при обновлении сценария
   *
   * ВАЖНО: API требует:
   * - temporaryId должен быть валидным UUID
   * - time должен быть в формате HH:mm:ss
   * - поле для действий называется "actions" (не scenarioActions)
   *
   * @param {string|number} scenarioId - ID сценария
   * @param {Object} action - {type: 'survey', days: number, time: string, surveyId: string}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async addAction(scenarioId, action) {
    // Сначала получаем текущий сценарий
    const { data: scenario } = await this.getById(scenarioId);
    // API возвращает scenarioActions, но принимает actions
    const currentActions = scenario?.scenarioActions || scenario?.actions || [];

    // Добавляем новое действие с правильным форматом
    const newAction = {
      temporaryId: randomUUID(), // API требует валидный UUID
      type: action.type || "survey",
      days: action.days ?? 0,
      time: normalizeTime(action.time), // API требует формат HH:mm:ss
      timezoneOffset: action.timezoneOffset ?? new Date().getTimezoneOffset(),
      surveyId: action.surveyId,
    };

    // Форматируем существующие actions для совместимости
    const formattedCurrentActions = currentActions.map((a) => ({
      temporaryId: a.temporaryId || a.id?.toString() || randomUUID(),
      type: a.type || "survey",
      days: a.days ?? 0,
      time: normalizeTime(a.time),
      timezoneOffset: a.timezoneOffset ?? new Date().getTimezoneOffset(),
      surveyId: a.surveyId || a.survey?.id,
    }));

    const result = await this.update(scenarioId, {
      actions: [...formattedCurrentActions, newAction],
    });

    // Нормализуем ответ - добавляем actions как алиас для scenarioActions
    if (result.data) {
      result.data.actions = result.data.scenarioActions || [];
    }

    return result;
  }

  /**
   * Удалить действие из сценария
   * @param {string|number} scenarioId - ID сценария
   * @param {string|number} actionId - ID или temporaryId действия
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async removeAction(scenarioId, actionId) {
    const { data: scenario } = await this.getById(scenarioId);
    // API возвращает scenarioActions
    const currentActions = scenario?.scenarioActions || scenario?.actions || [];

    const filteredActions = currentActions
      .filter((a) => a.id !== actionId && a.temporaryId !== actionId)
      .map((a) => ({
        temporaryId: a.temporaryId || a.id?.toString() || randomUUID(),
        type: a.type || "survey",
        days: a.days ?? 0,
        time: normalizeTime(a.time),
        timezoneOffset: a.timezoneOffset ?? new Date().getTimezoneOffset(),
        surveyId: a.surveyId || a.survey?.id,
      }));

    const result = await this.update(scenarioId, {
      actions: filteredActions,
    });

    // Нормализуем ответ
    if (result.data) {
      result.data.actions = result.data.scenarioActions || [];
    }

    return result;
  }

  // ==================== SCENARIO PERFORMERS ====================

  /**
   * Получить список участников сценария
   * GET /manager/scenarios/{scenarioId}/performers/
   * @param {string|number} scenarioId - ID сценария
   * @param {Object} params - {q, limit, offset}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getPerformers(scenarioId, params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const url = `/manager/scenarios/${scenarioId}/performers/${queryString ? `?${queryString}` : ""}`;
    return this.get(url);
  }

  /**
   * Получить участника по ID
   * GET /manager/scenarios/{scenarioId}/performers/{performerId}/
   * @param {string|number} scenarioId - ID сценария
   * @param {string|number} performerId - ID участника
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getPerformer(scenarioId, performerId) {
    return this.get(
      `/manager/scenarios/${scenarioId}/performers/${performerId}/`,
    );
  }

  /**
   * Добавить участника в сценарий
   * POST /manager/scenarios/{scenarioId}/performers/
   *
   * ВАЖНО: Можно добавить только в АКТИВНЫЙ сценарий.
   * Нельзя добавить одного пользователя дважды (пока он активен в сценарии).
   *
   * @param {string|number} scenarioId - ID сценария
   * @param {string|number} userId - ID пользователя
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async createPerformer(scenarioId, userId) {
    return this.post(`/manager/scenarios/${scenarioId}/performers/`, {
      userId,
    });
  }

  /**
   * Добавить участника (алиас)
   * @param {string|number} scenarioId
   * @param {string|number} userId
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async addPerformer(scenarioId, userId) {
    return this.createPerformer(scenarioId, userId);
  }

  /**
   * Завершить сценарий для участника (ручное завершение)
   * PATCH /manager/scenarios/{scenarioId}/performers/{performerId}/completion/
   * @param {string|number} scenarioId - ID сценария
   * @param {string|number} performerId - ID участника
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async completePerformer(scenarioId, performerId) {
    return this.patch(
      `/manager/scenarios/${scenarioId}/performers/${performerId}/completion/`,
    );
  }

  /**
   * Завершить сценарий для участника (алиас)
   * @param {string|number} scenarioId
   * @param {string|number} performerId
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async completeScenarioForPerformer(scenarioId, performerId) {
    return this.completePerformer(scenarioId, performerId);
  }

  // ==================== HELPER METHODS ====================

  /**
   * Создать сценарий с действиями (helper для тестов)
   *
   * ВАЖНО: API требует:
   * - temporaryId должен быть валидным UUID
   * - time должен быть в формате HH:mm:ss
   * - поле для действий называется "actions" (не scenarioActions)
   *
   * @param {Object} params - {title, description, actions: [{type, days, time, surveyId}]}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async createWithActions({ title, description, actions = [] }) {
    // 1. Создаём сценарий (description обязателен)
    const { response, data } = await this.create({
      title,
      description: description || "Auto-generated description",
    });

    if (!response.ok() || !data?.id) {
      return { response, data };
    }

    // 2. Если есть действия, добавляем их
    if (actions.length > 0) {
      const formattedActions = actions.map((action) => ({
        temporaryId: randomUUID(), // API требует валидный UUID
        type: action.type || "survey",
        days: action.days ?? 0,
        time: normalizeTime(action.time), // API требует формат HH:mm:ss
        timezoneOffset: action.timezoneOffset ?? new Date().getTimezoneOffset(),
        surveyId: action.surveyId,
      }));

      // API принимает поле "actions", возвращает "scenarioActions"
      const updateResult = await this.update(data.id, {
        actions: formattedActions,
      });

      // Нормализуем ответ - добавляем actions как алиас для scenarioActions
      if (updateResult.data) {
        updateResult.data.actions = updateResult.data.scenarioActions || [];
      }

      return updateResult;
    }

    // Нормализуем ответ
    if (data) {
      data.actions = data.scenarioActions || [];
    }

    return { response, data };
  }

  /**
   * Создать и активировать сценарий (helper для тестов)
   *
   * ВАЖНО: activate() не возвращает данные сценария, поэтому
   * после активации делаем getById для получения актуальных данных.
   *
   * @param {Object} params - {title, description, actions}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async createAndActivate({ title, description, actions = [] }) {
    // 1. Создаём с действиями
    const createResult = await this.createWithActions({
      title,
      description,
      actions,
    });

    if (!createResult.response.ok() || !createResult.data?.id) {
      return createResult;
    }

    const scenarioId = createResult.data.id;

    // 2. Активируем
    const { response: activateResponse } = await this.activate(scenarioId);

    if (!activateResponse.ok()) {
      return { response: activateResponse, data: null };
    }

    // 3. Получаем актуальные данные (activate не возвращает данные)
    const { response, data } = await this.getById(scenarioId);

    // Нормализуем ответ
    if (data) {
      data.actions = data.scenarioActions || [];
    }

    return { response, data };
  }

  /**
   * Получить первый доступный сценарий или создать новый
   * @param {Object} options - {status: 'draft' | 'active'}
   * @returns {Promise<Object|null>}
   */
  async getOrCreateScenario(options = {}) {
    const { status } = options;

    // Пробуем найти существующий
    const { data } = await this.getList({ status, limit: 1 });
    const items = data?.items || [];

    if (items.length > 0) {
      return items[0];
    }

    // Создаём новый
    const { data: newScenario } = await this.create({
      title: `Test Scenario ${Date.now()}`,
      description: "Auto-created for testing",
    });

    return newScenario;
  }
}
