// tests/utils/api/PerformanceReviewAPI.js
// API клиент для Performance Reviews

import { AuthAPI } from "./AuthAPI.js";

/**
 * API клиент для работы с Performance Reviews
 * Endpoints: /manager/performance-reviews/*
 */
export class PerformanceReviewAPI extends AuthAPI {
  /**
   * Получить список Performance Reviews
   * GET /manager/performance-reviews
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Array}>}
   */
  async getList() {
    return this.get("/manager/performance-reviews");
  }

  /**
   * Получить конфигурацию Performance Reviews
   * GET /manager/performance-reviews/config
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getConfig() {
    return this.get("/manager/performance-reviews/config");
  }

  /**
   * Получить статистику Performance Reviews
   * GET /manager/performance-reviews/statistics
   * @param {Object} [params] - Параметры запроса
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getStatistics(params = {}) {
    return this.get("/manager/performance-reviews/statistics", params);
  }

  /**
   * Получить данные dashboard для всех
   * GET /manager/performance-reviews/dashboard/all
   * @param {Object} [params] - Параметры запроса
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getDashboardAll(params = {}) {
    return this.get("/manager/performance-reviews/dashboard/all", params);
  }

  /**
   * Создать Performance Review
   * POST /manager/performance-reviews
   * @param {Object} payload - Данные для создания
   * @param {string} payload.title - Название
   * @param {string} [payload.description] - Описание
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async create(payload) {
    return this.post("/manager/performance-reviews", payload);
  }

  /**
   * Создать Performance Review (алиас для create)
   * @param {Object} payload - Данные для создания
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async createPerformanceReview(payload) {
    return this.create(payload);
  }

  /**
   * Получить Performance Review по ID
   * GET /manager/performance-reviews/{id}
   * @param {string|number} id - ID Performance Review
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getById(id) {
    return this.get(`/manager/performance-reviews/${id}`);
  }

  /**
   * Обновить Performance Review
   * POST /manager/performance-reviews/{id}
   * @param {string|number} id - ID Performance Review
   * @param {Object} payload - Данные для обновления
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async update(id, payload) {
    return this.post(`/manager/performance-reviews/${id}`, payload);
  }

  /**
   * Удалить Performance Review (soft delete)
   * DELETE /manager/performance-reviews/{id}
   * @param {string|number} id - ID Performance Review
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async remove(id) {
    return this.delete(`/manager/performance-reviews/${id}`);
  }

  /**
   * Архивировать Performance Review
   * POST /manager/performance-reviews/{id}/archive
   * @param {string|number} id - ID Performance Review
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async archive(id) {
    return this.post(`/manager/performance-reviews/${id}/archive`);
  }

  /**
   * Восстановить архивированный Performance Review
   * POST /manager/performance-reviews/{performanceReviewId}/restore
   * @param {string|number} id - ID Performance Review
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async restore(id) {
    return this.post(`/manager/performance-reviews/${id}/restore`);
  }

  /**
   * Валидировать Performance Review перед запуском
   * POST /manager/performance-reviews/{id}/validate
   * @param {string|number} id - ID Performance Review
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async validate(id) {
    return this.post(`/manager/performance-reviews/${id}/validate`);
  }

  /**
   * Запустить Performance Review
   * POST /manager/performance-reviews/{id}/start
   * @param {string|number} id - ID Performance Review
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async start(id) {
    return this.post(`/manager/performance-reviews/${id}/start`);
  }

  /**
   * Остановить Performance Review
   * POST /manager/performance-reviews/{id}/stop
   * @param {string|number} id - ID Performance Review
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async stop(id) {
    return this.post(`/manager/performance-reviews/${id}/stop`);
  }

  /**
   * Получить assessments Performance Review
   * GET /manager/performance-reviews/{id}/assessments
   * @param {string|number} id - ID Performance Review
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getAssessments(id) {
    return this.get(`/manager/performance-reviews/${id}/assessments`);
  }

  /**
   * Установить assessments Performance Review
   * POST /manager/performance-reviews/{id}/assessments
   * @param {string|number} id - ID Performance Review
   * @param {Object} payload - Assessments данные
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async setAssessments(id, payload) {
    return this.post(`/manager/performance-reviews/${id}/assessments`, payload);
  }

  /**
   * Получить target users
   * POST /manager/performance-reviews/{id}/target-users/get
   * @param {string|number} id - ID Performance Review
   * @param {Object} [payload] - Фильтры
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getTargetUsers(id, payload = {}) {
    return this.post(
      `/manager/performance-reviews/${id}/target-users/get`,
      payload,
    );
  }

  /**
   * Добавить target users
   * POST /manager/performance-reviews/{id}/target-users
   * @param {string|number} id - ID Performance Review
   * @param {Object} payload - Данные пользователей
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async addTargetUsers(id, payload) {
    return this.post(
      `/manager/performance-reviews/${id}/target-users`,
      payload,
    );
  }

  /**
   * Получить счётчики пользователей
   * GET /manager/performance-reviews/{id}/users-counts
   * @param {string|number} id - ID Performance Review
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getUsersCounts(id) {
    return this.get(`/manager/performance-reviews/${id}/users-counts`);
  }

  // ==================== RECEIVERS ====================

  /**
   * Получить receiver users
   * GET /manager/performance-reviews/{id}/receiver-users
   * @param {string|number} id - ID Performance Review
   * @param {Object} [params] - Параметры запроса
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getReceiverUsers(id, params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const url = `/manager/performance-reviews/${id}/receiver-users${queryString ? `?${queryString}` : ""}`;
    return this.get(url);
  }

  /**
   * Обновить receivers для target user
   * POST /manager/performance-reviews/{id}/target-users/{userId}/receivers
   * @param {string|number} prId - ID Performance Review
   * @param {string|number} userId - ID target user
   * @param {Object} payload - {directionId, usersIds}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async updateReceivers(prId, userId, payload) {
    return this.post(
      `/manager/performance-reviews/${prId}/target-users/${userId}/receivers`,
      payload,
    );
  }

  /**
   * Получить прогресс receiver users
   * POST /manager/performance-reviews/{id}/receiver-users/progress/get
   * @param {string|number} id - ID Performance Review
   * @param {Object} payload - {revisionId, usersIds}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getReceiverUsersProgress(id, payload) {
    return this.post(
      `/manager/performance-reviews/${id}/receiver-users/progress/get`,
      payload,
    );
  }

  /**
   * Получить завершённые ответы receiver users
   * POST /manager/performance-reviews/{id}/receiver-users/completed-responses/get
   * @param {string|number} id - ID Performance Review
   * @param {Object} payload - {revisionId, usersIds}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getReceiverUsersCompletedResponses(id, payload) {
    return this.post(
      `/manager/performance-reviews/${id}/receiver-users/completed-responses/get`,
      payload,
    );
  }

  /**
   * Удалить target user
   * DELETE /manager/performance-reviews/{id}/target-users/{userId}
   * @param {string|number} prId - ID Performance Review
   * @param {string|number} userId - ID target user
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async deleteTargetUser(prId, userId) {
    return this.delete(
      `/manager/performance-reviews/${prId}/target-users/${userId}`,
    );
  }

  /**
   * Получить target users для доступа к результатам
   * POST /manager/performance-reviews/{id}/target-users/get-for-access
   * @param {string|number} id - ID Performance Review
   * @param {Object} payload - Параметры запроса
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getTargetUsersForAccess(id, payload) {
    return this.post(
      `/manager/performance-reviews/${id}/target-users/get-for-access`,
      payload,
    );
  }

  /**
   * Получить прогресс ответов по ревизиям
   * POST /manager/performance-reviews/{id}/target-users/progress/get
   * @param {string|number} id - ID Performance Review
   * @param {Object} payload - {revisionId, usersIds}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getTargetUsersProgress(id, payload) {
    return this.post(
      `/manager/performance-reviews/${id}/target-users/progress/get`,
      payload,
    );
  }

  /**
   * Получить пропущенные ответы target users
   * POST /manager/performance-reviews/{id}/target-users/skipped-responses/get
   * @param {string|number} id - ID Performance Review
   * @param {Object} payload - {revisionId, usersIds}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getTargetUsersSkippedResponses(id, payload) {
    return this.post(
      `/manager/performance-reviews/${id}/target-users/skipped-responses/get`,
      payload,
    );
  }

  // ==================== RESULT ACCESS ====================

  /**
   * Изменить доступ к результатам
   * POST /manager/performance-reviews/{id}/target-users/change-result-access
   *
   * API использует ДВА поля для управления доступом:
   * - `resultAccess`: "head" (только руководитель) | "user" (сотрудник + руководитель)
   * - `contentAccess`: "final" (только итоговая оценка) | "finalAndResults" (оценка + отчёт)
   *
   * Маппинг UI → API:
   * | UI опция                              | resultAccess | contentAccess      |
   * |----------------------------------------|-------------|--------------------|
   * | Не делиться результатами и оценкой     | "head"       | "final"            |
   * | Только итоговой оценкой (scoreOnly)    | "user"       | "final"            |
   * | Результатами и итоговой оценкой (full) | "user"       | "finalAndResults"  |
   *
   * @param {string|number} id - ID Performance Review
   * @param {Object} payload - Параметры доступа
   * @param {boolean} [payload.targetUsersAll] - Применить ко всем target users
   * @param {number[]} [payload.targetUsersIds] - ID конкретных target users
   * @param {number[]} [payload.exceptTargetUsersIds] - Исключить target users
   * @param {"head"|"user"} payload.resultAccess - Уровень видимости результатов
   * @param {"final"|"finalAndResults"} payload.contentAccess - Глубина доступа к контенту
   * @param {boolean} [payload.enableNotification=false] - Отправить уведомление сотруднику
   * @param {string} [payload.notificationMessage] - Текст уведомления
   * @param {boolean} [payload.includePdfLink=false] - Включить ссылку на PDF (только для full)
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async changeResultAccess(id, payload) {
    return this.post(
      `/manager/performance-reviews/${id}/target-users/change-result-access`,
      payload,
    );
  }

  // ==================== ASYNC STEPS ====================

  /**
   * Пропустить ожидание предложений (async workflow)
   * POST /manager/performance-reviews/{id}/async-steps/skip-suggestion-awaiting
   * @param {string|number} id - ID Performance Review
   * @param {Object} payload - {usersIds}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async asyncStepsSkipSuggestionAwaiting(id, payload) {
    return this.post(
      `/manager/performance-reviews/${id}/async-steps/skip-suggestion-awaiting`,
      payload,
    );
  }

  /**
   * Одобрить предложения (async workflow)
   * POST /manager/performance-reviews/{id}/async-steps/approve-suggestions
   * @param {string|number} id - ID Performance Review
   * @param {Object} payload - {usersIds}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async asyncStepsApproveSuggestion(id, payload) {
    return this.post(
      `/manager/performance-reviews/${id}/async-steps/approve-suggestions`,
      payload,
    );
  }

  // ==================== POPULATE & RESET ====================

  /**
   * Автозаполнение ревью
   * POST /manager/performance-reviews/{id}/populate-review
   * @param {string|number} id - ID Performance Review
   * @param {Object} settings - Настройки заполнения
   * @param {Object} [options] - Дополнительные опции (timeout и др.)
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async populateReview(id, settings, options = {}) {
    const maxRetries = options.retries ?? 2;
    const retryDelay = options.retryDelay ?? 3000;

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      try {
        const result = await this.post(
          `/manager/performance-reviews/${id}/populate-review`,
          settings,
          { ...options, timeout: options.timeout ?? 60_000 },
        );
        return result;
      } catch (e) {
        const isRetryable =
          e.message?.includes("socket hang up") ||
          e.message?.includes("ECONNRESET") ||
          e.message?.includes("Timeout");
        if (isRetryable && attempt <= maxRetries) {
          console.warn(
            `[populateReview] Attempt ${attempt} failed (${e.message.split("\n")[0]}), retrying in ${retryDelay}ms...`,
          );
          await new Promise((r) => setTimeout(r, retryDelay));
          continue;
        }
        throw e;
      }
    }
  }

  /**
   * Сбросить ответ пользователя
   * POST /manager/performance-reviews/{id}/reset-user-response
   * @param {string|number} id - ID Performance Review
   * @param {Object} payload - {receiverUserId, targetUserId, assessmentId}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async resetUserResponse(id, payload) {
    return this.post(
      `/manager/performance-reviews/${id}/reset-user-response`,
      payload,
    );
  }

  // ==================== REVISIONS ====================

  /**
   * Получить ревизии Performance Review
   * GET /manager/performance-reviews/{id}/revisions
   * @param {string|number} id - ID Performance Review
   * @param {Object} [params] - {limit, offset}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getRevisions(id, params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const url = `/manager/performance-reviews/${id}/revisions${queryString ? `?${queryString}` : ""}`;
    return this.get(url);
  }

  /**
   * Получить последнюю ревизию
   * GET /manager/performance-reviews/{id}/revisions?limit=1&offset=0
   * @param {string|number} id - ID Performance Review
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object|null}>}
   */
  async getLastRevision(id) {
    const { response, data } = await this.getRevisions(id, {
      limit: 1,
      offset: 0,
    });
    return { response, data: data?.items?.[0] || null };
  }

  // ==================== REMINDS ====================

  /**
   * Получить напоминания
   * GET /manager/performance-review-reminds
   * @param {Object} params - {revisionId, limit, offset, type}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getReminds(params) {
    const queryString = new URLSearchParams(params).toString();
    return this.get(`/manager/performance-review-reminds?${queryString}`);
  }

  /**
   * Создать напоминание
   * POST /manager/performance-review-reminds
   * @param {Object} payload - {revisionId, title, body, scheduledAt, type}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async createRemind(payload) {
    return this.post("/manager/performance-review-reminds", payload);
  }

  /**
   * Обновить напоминание
   * POST /manager/performance-review-reminds/{id}
   * @param {string|number} id - ID напоминания
   * @param {Object} payload - {title, body, scheduledAt}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async updateRemind(id, payload) {
    return this.post(`/manager/performance-review-reminds/${id}`, payload);
  }

  /**
   * Удалить напоминание
   * DELETE /manager/performance-review-reminds/{id}
   * @param {string|number} id - ID напоминания
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async removeRemind(id) {
    return this.delete(`/manager/performance-review-reminds/${id}`);
  }

  /**
   * Восстановить напоминание
   * POST /manager/performance-review-reminds/{id}/restore
   * @param {string|number} id - ID напоминания
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async restoreRemind(id) {
    return this.post(`/manager/performance-review-reminds/${id}/restore`);
  }

  // ==================== REVIEWERS WORKLOAD ====================

  /**
   * Получить нагрузку ревьюеров
   * GET /manager/performance-reviews/{id}/reviewers-workload
   * @param {string|number} id - ID Performance Review
   * @param {Object} [params] - {q, limit, offset, sortBy, sortDirection}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getReviewersWorkload(id, params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const url = `/manager/performance-reviews/${id}/reviewers-workload${queryString ? `?${queryString}` : ""}`;
    return this.get(url);
  }

  // ==================== RESPONSE OVERWRITE (PROTECTED) ====================

  /**
   * Получить перезаписываемые ответы
   * POST /protected/performance-reviews/{id}/response-overwrite/of-revision/{revisionId}/overwritable/get
   * @param {string|number} prId - ID Performance Review
   * @param {string|number} revisionId - ID ревизии
   * @param {Object} payload - {targetUsersIds}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getResponsesOverwritable(prId, revisionId, payload) {
    return this.post(
      `/protected/performance-reviews/${prId}/response-overwrite/of-revision/${revisionId}/overwritable/get`,
      payload,
    );
  }

  /**
   * Получить данные для перезаписи ответов
   * GET /protected/performance-reviews/{id}/response-overwrite/of-revision/{revisionId}/of-user/{userId}
   * @param {string|number} prId - ID Performance Review
   * @param {string|number} revisionId - ID ревизии
   * @param {string|number} userId - ID пользователя
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getResponseOverwritesData(prId, revisionId, userId) {
    return this.get(
      `/protected/performance-reviews/${prId}/response-overwrite/of-revision/${revisionId}/of-user/${userId}`,
    );
  }

  /**
   * Перезаписать значения ответов (компетенции и/или итоговая оценка)
   * POST /protected/performance-reviews/{id}/response-overwrite/of-revision/{revisionId}/of-user/{userId}
   * @param {string|number} prId - ID Performance Review
   * @param {string|number} revisionId - ID ревизии
   * @param {string|number} userId - ID пользователя
   * @param {Object} payload - Данные калибровки
   * @param {Array<{responseId: number, questionId: number, answer: number}>} payload.overwrites - Перезаписи компетенций
   * @param {{value: number|null, characteristicId: number|null}} [payload.meanOverwrite] - Перезапись итоговой оценки
   *   - Числовой режим: {value: rawScore, characteristicId: null}
   *   - Дропдаун режим: {value: null, characteristicId: id}
   * @param {boolean} payload.isLocked - Заблокировать изменение руководителем
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async overwriteResponsesValues(prId, revisionId, userId, payload) {
    return this.post(
      `/protected/performance-reviews/${prId}/response-overwrite/of-revision/${revisionId}/of-user/${userId}`,
      payload,
    );
  }

  // ==================== WORKFLOW STAGES ====================

  /**
   * Остановить стадию номинации
   * POST /manager/performance-reviews/{id}/stop-nomination-stage
   * @param {string|number} id - ID Performance Review
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async stopNominationStage(id) {
    return this.post(
      `/manager/performance-reviews/${id}/stop-nomination-stage`,
    );
  }

  /**
   * Остановить стадию одобрения
   * POST /manager/performance-reviews/{id}/stop-approval-stage
   * @param {string|number} id - ID Performance Review
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async stopApprovalStage(id) {
    return this.post(`/manager/performance-reviews/${id}/stop-approval-stage`);
  }

  /**
   * Остановить стадию проверки админом
   * POST /manager/performance-reviews/{id}/stop-admin-check-stage
   * @param {string|number} id - ID Performance Review
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async stopAdminCheckStage(id) {
    return this.post(
      `/manager/performance-reviews/${id}/stop-admin-check-stage`,
    );
  }

  /**
   * Завершить этап самооценки и отправить анкеты руководителям и коллегам
   * Пакетная рассылка анкет для сотрудников с незаполненной самооценкой
   * POST /manager/performance-reviews/{id}/finish-self-assessment-stage
   * @param {string|number} id - ID Performance Review
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async finishSelfAssessmentStage(id) {
    return this.post(
      `/manager/performance-reviews/${id}/finish-self-assessment-stage`,
    );
  }

  /**
   * Отправить анкеты руководителям и коллегам (пакетная рассылка)
   * Альтернативный endpoint для пакетной рассылки анкет
   * POST /manager/performance-reviews/{id}/batch-send-questionnaires
   * @param {string|number} id - ID Performance Review
   * @param {Object} [payload] - Дополнительные параметры (список userIds)
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async batchSendQuestionnaires(id, payload = {}) {
    return this.post(
      `/manager/performance-reviews/${id}/batch-send-questionnaires`,
      payload,
    );
  }

  /**
   * Возобновить Performance Review
   * POST /manager/performance-reviews/{id}/resume
   * @param {string|number} id - ID Performance Review
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async resume(id) {
    return this.post(`/manager/performance-reviews/${id}/resume`);
  }

  // ==================== CATEGORIES ====================

  /**
   * Изменить категорию Performance Review
   * PATCH /manager/performance-reviews/{id}/change-category
   * @param {string|number} id - ID Performance Review
   * @param {string|number} [categoryId] - ID категории (или null для очистки)
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async changeCategory(id, categoryId) {
    const url = categoryId
      ? `/manager/performance-reviews/${id}/change-category?categoryId=${categoryId}`
      : `/manager/performance-reviews/${id}/change-category`;
    return this.patch(url);
  }

  // ==================== STATISTICS (MANAGER) ====================

  /**
   * Получить статистику по направлениям
   * GET /manager/performance-reviews/{id}/statistics/directions/
   * @param {string|number} id - ID Performance Review
   * @param {Object} params - {revisionId, targetUserId}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getStatisticsDirections(id, params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const url = `/manager/performance-reviews/${id}/statistics/directions/${queryString ? `?${queryString}` : ""}`;
    return this.get(url);
  }

  /**
   * Получить статистику по анкетам
   * GET /manager/performance-reviews/{id}/statistics/assessments/
   * @param {string|number} id - ID Performance Review
   * @param {Object} params - {revisionId, targetUserId, direction, assessmentId}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getStatisticsAssessments(id, params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const url = `/manager/performance-reviews/${id}/statistics/assessments/${queryString ? `?${queryString}` : ""}`;
    return this.get(url);
  }

  /**
   * Получить статистику по вопросу
   * GET /manager/performance-reviews/{id}/statistics/questions/{questionId}/
   * @param {string|number} id - ID Performance Review
   * @param {string|number} questionId - ID вопроса
   * @param {Object} params - {revisionId, targetUserId, direction, assessmentId, aggregation, userDate}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getStatisticsQuestion(id, questionId, params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const url = `/manager/performance-reviews/${id}/statistics/questions/${questionId}/${queryString ? `?${queryString}` : ""}`;
    return this.get(url);
  }

  /**
   * Получить summary results
   * POST /manager/performance-reviews/{id}/statistics/summary-results/get
   * @param {string|number} id - ID Performance Review
   * @param {Object} payload - {targetUsersIds, revisionId}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getStatisticsSummaryResults(id, payload) {
    return this.post(
      `/manager/performance-reviews/${id}/statistics/summary-results/get`,
      payload,
    );
  }

  /**
   * Получить настройки статистики
   * GET /manager/performance-reviews/{id}/statistics/settings/
   * @param {string|number} id - ID Performance Review
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getStatisticsSettings(id) {
    return this.get(
      `/manager/performance-reviews/${id}/statistics/settings/`,
      {},
      { timeout: 30000 },
    );
  }

  /**
   * Обновить настройки статистики
   * POST /manager/performance-reviews/{id}/statistics/settings/
   * @param {string|number} id - ID Performance Review
   * @param {Object} payload - {settings, userSettings, competenceSettings, competenceGroupSettings, characteristicSettings}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async updateStatisticsSettings(id, payload) {
    return this.post(
      `/manager/performance-reviews/${id}/statistics/settings/`,
      payload,
    );
  }

  // ==================== STATISTICS (PRIVATE) ====================

  /**
   * Получить данные дашборда
   * POST /private/performance-reviews/{id}/dashboard/get
   * @param {string|number} id - ID Performance Review
   * @param {Object} payload - {usersQuery, revisionId}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getDashboard(id, payload) {
    return this.post(
      `/private/performance-reviews/${id}/dashboard/get`,
      payload,
    );
  }

  /**
   * Получить target users для статистики
   * GET /private/performance-reviews/{id}/statistics/target-users/
   * @param {string|number} id - ID Performance Review
   * @param {Object} params - {q, limit, offset, targetUserId}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getStatisticsTargetUsers(id, params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const url = `/private/performance-reviews/${id}/statistics/target-users/${queryString ? `?${queryString}` : ""}`;
    return this.get(url);
  }

  /**
   * Получить ревизии для статистики
   * GET /private/performance-reviews/{id}/statistics/revisions/
   * @param {string|number} id - ID Performance Review
   * @param {Object} params - {targetUserId}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getStatisticsRevisions(id, params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const url = `/private/performance-reviews/${id}/statistics/revisions/${queryString ? `?${queryString}` : ""}`;
    return this.get(url);
  }

  /**
   * Получить summary статистику
   * GET /private/performance-reviews/{id}/statistics/summary/
   * @param {string|number} id - ID Performance Review
   * @param {Object} params - {revisionId, targetUserId, assessmentId, direction, userDate}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getStatisticsSummary(id, params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const url = `/private/performance-reviews/${id}/statistics/summary/${queryString ? `?${queryString}` : ""}`;
    return this.get(url);
  }

  /**
   * Получить прогресс на дашборде
   * POST /private/performance-reviews/{id}/dashboard-progresses/get/
   * @param {string|number} id - ID Performance Review
   * @param {Object} payload - {revisionId, targetUsersIds}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getDashboardProgresses(id, payload) {
    return this.post(
      `/private/performance-reviews/${id}/dashboard-progresses/get/`,
      payload,
    );
  }

  // ==================== EXPORT ====================

  /**
   * Получить токен для экспорта
   * GET /private/performance-reviews/{id}/statistics/export/get-token/
   * @param {string|number} id - ID Performance Review
   * @param {Object} params - {revisionId, targetUserId, userDate}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getExportToken(id, params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const url = `/private/performance-reviews/${id}/statistics/export/get-token/${queryString ? `?${queryString}` : ""}`;
    return this.get(url);
  }

  /**
   * Получить токен для группового отчёта
   * POST /private/performance-reviews/{id}/statistics/export/group-report/get-token/
   * @param {string|number} id - ID Performance Review
   * @param {Object} payload - {performanceReviewId, targetUserIds, departmentIds, revisionId}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getGroupReportExportToken(id, payload) {
    return this.post(
      `/private/performance-reviews/${id}/statistics/export/group-report/get-token/`,
      payload,
    );
  }

  /**
   * Получить токен для экспорта прогресса
   * GET /private/performance-reviews/{id}/progress/export/get-token/
   * @param {string|number} id - ID Performance Review
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getProgressExportToken(id) {
    return this.get(
      `/private/performance-reviews/${id}/progress/export/get-token/`,
    );
  }

  // ==================== DASHBOARD FILTERS ====================

  /**
   * Получить список PR для фильтров дашборда
   * GET /private/performance-reviews/dashboard-filters/performance-reviews/
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getDashboardFiltersPerformanceReviews() {
    return this.get(
      "/private/performance-reviews/dashboard-filters/performance-reviews/",
    );
  }

  /**
   * Получить target users для фильтров
   * GET /private/performance-reviews/dashboard-filters/{id}/target-users/
   * @param {string|number} id - ID Performance Review
   * @param {Object} params - {q, limit, offset}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getDashboardFiltersTargetUsers(id, params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const url = `/private/performance-reviews/dashboard-filters/${id}/target-users/${queryString ? `?${queryString}` : ""}`;
    return this.get(url);
  }

  /**
   * Получить выбранных target users для фильтров
   * POST /private/performance-reviews/dashboard-filters/{id}/target-users/selected/get/
   * @param {string|number} id - ID Performance Review
   * @param {Object} payload - {q, limit, offset, ids}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getDashboardFiltersTargetUsersSelected(id, payload) {
    return this.post(
      `/private/performance-reviews/dashboard-filters/${id}/target-users/selected/get/`,
      payload,
    );
  }

  /**
   * Получить группы и департаменты для фильтров
   * GET /private/performance-reviews/dashboard-filters/{id}/groups-departments/
   * @param {string|number} id - ID Performance Review
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getDashboardFiltersGroupsDepartments(id) {
    return this.get(
      `/private/performance-reviews/dashboard-filters/${id}/groups-departments/`,
    );
  }

  /**
   * Получить ревизии для фильтров
   * GET /private/performance-reviews/dashboard-filters/{id}/revisions
   * @param {string|number} id - ID Performance Review
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getDashboardFiltersRevisions(id) {
    return this.get(
      `/private/performance-reviews/dashboard-filters/${id}/revisions`,
    );
  }

  /**
   * Получить результаты запроса (query results)
   * POST /private/performance-reviews/dashboard-filters/{id}/query-results/get
   * @param {string|number} id - ID Performance Review
   * @param {Object} query - Параметры запроса
   * @param {Object} params - {limit, offset, q}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getDashboardFiltersQueryResults(id, query, params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const url = `/private/performance-reviews/dashboard-filters/${id}/query-results/get${queryString ? `?${queryString}` : ""}`;
    return this.post(url, query);
  }

  // ==================== AI SUMMARY ====================

  /**
   * Получить последнюю AI задачу
   * GET /private/performance-reviews/{id}/ai/summary/tasks/last/
   * @param {string|number} id - ID Performance Review
   * @param {Object} params - {revisionId, targetUserId}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getAiSummaryLastTask(id, params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const url = `/private/performance-reviews/${id}/ai/summary/tasks/last/${queryString ? `?${queryString}` : ""}`;
    return this.get(url);
  }

  /**
   * Создать AI задачу
   * POST /private/performance-reviews/{id}/ai/summary/tasks/
   * @param {string|number} id - ID Performance Review
   * @param {Object} payload - {revisionId, targetUserId}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async createAiSummaryTask(id, payload) {
    return this.post(
      `/private/performance-reviews/${id}/ai/summary/tasks/`,
      payload,
    );
  }

  /**
   * Обновить AI задачу
   * POST /private/performance-reviews/{id}/ai/summary/tasks/{taskId}/refresh/
   * @param {string|number} id - ID Performance Review
   * @param {string|number} taskId - ID задачи
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async refreshAiSummaryTask(id, taskId) {
    return this.post(
      `/private/performance-reviews/${id}/ai/summary/tasks/${taskId}/refresh/`,
    );
  }

  /**
   * Изменить видимость результата
   * PATCH /private/performance-reviews/{id}/statistics/visibility/
   * @param {string|number} id - ID Performance Review
   * @param {Object} payload - {revisionId, targetUserId, responseValueId}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async patchStatisticsVisibility(id, payload) {
    return this.patch(
      `/private/performance-reviews/${id}/statistics/visibility/`,
      payload,
    );
  }

  // ==================== HISTORY (PRIVATE) ====================

  /**
   * Получить историю оценок текущего пользователя
   * GET /private/performance-reviews/history
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getHistory() {
    return this.get("/private/performance-reviews/history");
  }

  /**
   * Получить PR для target user
   * GET /private/performance-reviews/of-target-user/{targetUserId}
   * @param {string|number} targetUserId - ID target user
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getOfTargetUser(targetUserId) {
    return this.get(
      `/private/performance-reviews/of-target-user/${targetUserId}`,
    );
  }

  // ==================== COMPETENCE STATISTICS (PROTECTED) ====================

  /**
   * Получить статистику по компетенциям
   * POST /protected/performance-reviews/statistics/competences/get/
   * @param {Object} payload - Параметры запроса
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getCompetenceStatistics(payload) {
    return this.post(
      "/protected/performance-reviews/statistics/competences/get/",
      payload,
    );
  }

  /**
   * Получить статистику по компетенциям для PR и ревизии
   * POST /protected/performance-reviews/statistics/competences/of-performance-review/{id}/of-revision/{revisionId}
   * @param {string|number} id - ID Performance Review
   * @param {string|number} revisionId - ID ревизии
   * @param {Object} payload - Параметры запроса
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getCompetenceStatisticsForRevision(id, revisionId, payload) {
    return this.post(
      `/protected/performance-reviews/statistics/competences/of-performance-review/${id}/of-revision/${revisionId}`,
      payload,
    );
  }

  /**
   * Получить группы компетенций для PR и ревизии
   * POST /protected/performance-reviews/statistics/competences/of-performance-review/{id}/of-revision/{revisionId}/groups
   * @param {string|number} id - ID Performance Review
   * @param {string|number} revisionId - ID ревизии
   * @param {Object} payload - Параметры запроса
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getCompetenceGroupsForRevision(id, revisionId, payload) {
    return this.post(
      `/protected/performance-reviews/statistics/competences/of-performance-review/${id}/of-revision/${revisionId}/groups`,
      payload,
    );
  }

  /**
   * Получить компетенции пользователя
   * GET /protected/performance-reviews/statistics/competences/of-user/{userId}/of-revision/{revisionId}
   * @param {string|number} userId - ID пользователя
   * @param {string|number} revisionId - ID ревизии
   * @param {Object} params - Параметры запроса
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getCompetenceStatisticsForUser(userId, revisionId, params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const url = `/protected/performance-reviews/statistics/competences/of-user/${userId}/of-revision/${revisionId}${queryString ? `?${queryString}` : ""}`;
    return this.get(url);
  }

  /**
   * Получить результаты компетенций пользователей
   * POST /protected/performance-reviews/statistics/competences/of-performance-review/{id}/users-competencies-results/get
   * @param {string|number} id - ID Performance Review
   * @param {Object} payload - Параметры запроса
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getUsersCompetenciesResults(id, payload) {
    return this.post(
      `/protected/performance-reviews/statistics/competences/of-performance-review/${id}/users-competencies-results/get`,
      payload,
    );
  }
}
