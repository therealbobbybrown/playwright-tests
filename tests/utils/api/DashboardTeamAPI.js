// tests/utils/api/DashboardTeamAPI.js
// API клиент для дашборда руководителя "Моя команда"

import { AuthAPI } from "./AuthAPI.js";

/**
 * API клиент для работы с дашбордом руководителя
 * Endpoints для получения прогресса команды и утверждения коллег
 */
export class DashboardTeamAPI extends AuthAPI {
  // ═══════════════════════════════════════════════════════════════════════
  // DASHBOARD DATA
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Получить данные дашборда для PR
   * POST /private/performance-reviews/{id}/dashboard/get
   * @param {string|number} prId - ID Performance Review
   * @param {Object} [payload] - Параметры запроса
   * @param {string} [payload.revisionId] - ID ревизии
   * @param {Object} [payload.usersQuery] - Фильтры пользователей
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getDashboard(prId, payload = {}) {
    return this.post(
      `/private/performance-reviews/${prId}/dashboard/get`,
      payload,
    );
  }

  /**
   * Получить прогресс на дашборде для target users
   * POST /private/performance-reviews/{id}/dashboard-progresses/get/
   * @param {string|number} prId - ID Performance Review
   * @param {Object} payload - Параметры запроса
   * @param {string} payload.revisionId - ID ревизии
   * @param {Array<string>} payload.targetUsersIds - IDs target users
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getDashboardProgresses(prId, payload) {
    return this.post(
      `/private/performance-reviews/${prId}/dashboard-progresses/get/`,
      payload,
    );
  }

  /**
   * Получить прогресс receiver users
   * POST /manager/performance-reviews/{id}/receiver-users/progress/get
   * @param {string|number} prId - ID Performance Review
   * @param {Object} payload - {revisionId, usersIds}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getReceiverUsersProgress(prId, payload) {
    return this.post(
      `/manager/performance-reviews/${prId}/receiver-users/progress/get`,
      payload,
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SUBORDINATES & TEAM
  // ═══════════════════════════════════════════════════════════════════════

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
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: boolean}>}
   */
  async hasSubordinates() {
    return this.get("/private/org-struct/me/has-subordinates");
  }

  /**
   * Проверить, является ли текущий пользователь руководителем
   * GET /private/org-struct/me/is-head
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: boolean}>}
   */
  async isHead() {
    return this.get("/private/org-struct/me/is-head");
  }

  /**
   * Получить подчинённых по IDs
   * POST /private/org-struct/subordinates/get/by-ids
   * @param {Array<string>} usersIds - IDs пользователей
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getSubordinatesByIds(usersIds) {
    return this.post("/private/org-struct/subordinates/get/by-ids", {
      usersIds,
    });
  }

  /**
   * Получить список подчинённых (с поиском и пагинацией)
   * POST /private/org-struct/users/get
   * @param {Object} [params] - Параметры запроса
   * @param {string} [params.q] - Поисковый запрос
   * @param {number} [params.limit] - Лимит
   * @param {number} [params.offset] - Смещение
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getSubordinates(params = {}) {
    return this.post("/private/org-struct/users/get", params);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // NOMINATION & APPROVAL
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Получить номинацию для утверждения
   * GET /private/performance-reviews/{prId}/nominations/{nominationId}/approval
   * @param {string|number} prId - ID Performance Review
   * @param {string|number} nominationId - ID номинации
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getNominationForApproval(prId, nominationId) {
    return this.get(
      `/private/performance-reviews/${prId}/nominations/${nominationId}/approval`,
    );
  }

  /**
   * Одобрить номинацию (утвердить коллег)
   * POST /private/performance-reviews/{prId}/nominations/{nominationId}/approval
   * @param {string|number} prId - ID Performance Review
   * @param {string|number} nominationId - ID номинации
   * @param {Object} [payload] - Данные утверждения
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async approveNomination(prId, nominationId, payload = {}) {
    return this.post(
      `/private/performance-reviews/${prId}/nominations/${nominationId}/approval`,
      payload,
    );
  }

  /**
   * Одобрить предложения в async workflow
   * POST /manager/performance-reviews/{id}/async-steps/approve-suggestions
   * @param {string|number} prId - ID Performance Review
   * @param {Object} payload - {usersIds: []}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async approveSuggestions(prId, payload) {
    return this.post(
      `/manager/performance-reviews/${prId}/async-steps/approve-suggestions`,
      payload,
    );
  }

  /**
   * Пропустить ожидание предложений
   * POST /manager/performance-reviews/{id}/async-steps/skip-suggestion-awaiting
   * @param {string|number} prId - ID Performance Review
   * @param {Object} payload - {usersIds: []}
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async skipSuggestionAwaiting(prId, payload) {
    return this.post(
      `/manager/performance-reviews/${prId}/async-steps/skip-suggestion-awaiting`,
      payload,
    );
  }

  /**
   * Получить номинацию по ревизии
   * GET /private/performance-reviews/{prId}/nominations/of-revision/{revisionId}
   * @param {string|number} prId - ID Performance Review
   * @param {string|number} revisionId - ID ревизии
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getNominationByRevision(prId, revisionId) {
    return this.get(
      `/private/performance-reviews/${prId}/nominations/of-revision/${revisionId}`,
    );
  }

  /**
   * Получить target users для номинации
   * POST /manager/performance-reviews/{prId}/nominations/{nominationId}/target-users/get
   * @param {string|number} prId - ID Performance Review
   * @param {string|number} nominationId - ID номинации
   * @param {Object} [payload] - Параметры запроса
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getNominationTargetUsers(prId, nominationId, payload = {}) {
    return this.post(
      `/manager/performance-reviews/${prId}/nominations/${nominationId}/target-users/get`,
      payload,
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // COLLEAGUES
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Получить список коллег
   * POST /private/users/collegues/get
   * @param {Object} [params] - Параметры запроса
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getColleagues(params = {}) {
    return this.post("/private/users/collegues/get", params);
  }

  /**
   * Предложить приёмников (коллег) для номинации
   * POST /private/performance-reviews/{prId}/nominations/{nominationId}/receivers
   * @param {string|number} prId - ID Performance Review
   * @param {string|number} nominationId - ID номинации
   * @param {Object} payload - Данные предложения
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async suggestReceivers(prId, nominationId, payload) {
    return this.post(
      `/private/performance-reviews/${prId}/nominations/${nominationId}/receivers`,
      payload,
    );
  }

  /**
   * Подтвердить (отправить) предложение коллег для номинации
   * POST /private/performance-reviews/{prId}/nominations/{nominationId}
   * @param {string|number} prId - ID Performance Review
   * @param {string|number} nominationId - ID номинации
   * @param {Object} payload - Данные подтверждения (targetUserId)
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async submitNomination(prId, nominationId, payload) {
    return this.post(
      `/private/performance-reviews/${prId}/nominations/${nominationId}`,
      payload,
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SCORE DISTRIBUTION (вкладка «Распределение оценок»)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Получить список сотрудников для таблицы распределения оценок
   * POST /private/performance-reviews/dashboard/distribution-users/get/
   * @param {Object} [params] - Параметры запроса
   * @param {string} [params.usersSubset] - "all" | "subordinates" | "directSubordinates"
   * @param {number[]} [params.userGroupIds] - ID групп для фильтрации
   * @param {string} [params.q] - Поисковый запрос
   * @param {number} [params.limit] - Размер страницы (default 20)
   * @param {number} [params.offset] - Смещение
   * @param {boolean} [params.withInactive] - Включать неактивных
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: {items: Array, limit: number, offset: number, total: number}}>}
   */
  async getDistributionUsers(params = {}) {
    return this.post(
      "/private/performance-reviews/dashboard/distribution-users/get/",
      {
        userGroupIds: [],
        usersSubset: "all",
        withInactive: false,
        q: "",
        limit: 20,
        offset: 0,
        ...params,
      },
    );
  }

  /**
   * Получить последние результаты оценки для набора сотрудников
   * POST /private/performance-reviews/dashboard/distribution-last-results/get/
   * @param {number[]} targetUserIds - ID пользователей
   * @param {Object} [params] - Доп. параметры
   * @param {Object} [params.period] - Период фильтрации { start: number, end: number } (Unix ms, midnight Moscow)
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   * Ответ — объект с числовыми ключами: { "0": { targetUserId, revisionMean, performanceReview, ... } }
   *
   * Пример period: { start: new Date('2025-11-01T00:00:00+03:00').getTime(), end: new Date('2026-02-13T00:00:00+03:00').getTime() }
   */
  async getDistributionLastResults(targetUserIds, params = {}) {
    return this.post(
      "/private/performance-reviews/dashboard/distribution-last-results/get/",
      { targetUserIds, ...params },
    );
  }

  /**
   * Получить распределение по текстовым характеристикам для графика
   * POST /private/performance-reviews/dashboard/distribution-characteristics/get/
   * @param {Object} [params] - Параметры запроса
   * @param {string} [params.usersSubset] - "all" | "subordinates" | "directSubordinates"
   * @param {number[]} [params.userGroupIds] - ID групп для фильтрации
   * @param {Object} [params.period] - Период { start: number, end: number } (Unix ms)
   * @param {boolean} [params.withInactive] - Включать неактивных
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: {withResults: Array, withoutResults: Object}}>}
   */
  async getDistributionCharacteristics(params = {}) {
    return this.post(
      "/private/performance-reviews/dashboard/distribution-characteristics/get/",
      {
        userGroupIds: [],
        usersSubset: "all",
        withInactive: false,
        ...params,
      },
    );
  }

  /**
   * Хелпер: получить полные данные распределения (users + results)
   * @param {Object} [params] - Параметры для distribution-users
   * @returns {Promise<{users: Array, results: Object, total: number}>}
   */
  async getDistributionData(params = {}) {
    const { data: usersData } = await this.getDistributionUsers(params);
    const users = usersData?.items || [];
    const total = usersData?.total || 0;

    let results = {};
    if (users.length > 0) {
      const userIds = users.map((u) => u.id);
      const { data: resultsData } =
        await this.getDistributionLastResults(userIds);
      results = resultsData || {};
    }

    return { users, results, total };
  }

  /**
   * Батчевый поиск сотрудника в таблице распределения по предикату
   * Перебирает пользователей пакетами по 100, для каждого пакета загружает результаты
   * и проверяет предикат на записях. Возвращает первое совпадение.
   *
   * @param {Function} predicate - (resultEntry) => boolean, например: r => r.revisionMean != null
   * @param {Object} [options]
   * @param {string} [options.usersSubset="all"] - Подмножество пользователей
   * @param {number} [options.batchSize=100] - Размер пакета
   * @param {number} [options.maxBatches=30] - Макс. кол-во пакетов (= batchSize * maxBatches юзеров)
   * @returns {Promise<{result: Object|null, user: Object|null}>} result = запись из getDistributionLastResults, user = из getDistributionUsers
   */
  async findDistributionUser(predicate, options = {}) {
    const { usersSubset = "all", batchSize = 100, maxBatches = 30 } = options;

    for (let batch = 0; batch < maxBatches; batch++) {
      const { data: usersData } = await this.getDistributionUsers({
        usersSubset,
        limit: batchSize,
        offset: batch * batchSize,
      });

      if (!usersData?.items?.length) break;

      const userIds = usersData.items.map((u) => u.id);
      const { data: resultsData } =
        await this.getDistributionLastResults(userIds);

      const entries = Object.values(resultsData || {});
      const match = entries.find(predicate);

      if (match) {
        const user = usersData.items.find((u) => u.id === match.targetUserId);
        return { result: match, user };
      }

      if (usersData.items.length < batchSize) break;
    }

    return { result: null, user: null };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // DASHBOARD FILTERS
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Получить список PR для фильтров дашборда
   * GET /private/performance-reviews/dashboard-filters/performance-reviews/
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getDashboardFiltersPRs() {
    return this.get(
      "/private/performance-reviews/dashboard-filters/performance-reviews/",
    );
  }

  /**
   * Получить target users для фильтров
   * GET /private/performance-reviews/dashboard-filters/{id}/target-users/
   * @param {string|number} prId - ID Performance Review
   * @param {Object} [params] - Параметры запроса
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getDashboardFiltersTargetUsers(prId, params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const url = `/private/performance-reviews/dashboard-filters/${prId}/target-users/${queryString ? `?${queryString}` : ""}`;
    return this.get(url);
  }

  /**
   * Получить ревизии для фильтров
   * GET /private/performance-reviews/dashboard-filters/{id}/revisions
   * @param {string|number} prId - ID Performance Review
   * @returns {Promise<{response: import('@playwright/test').APIResponse, data: Object}>}
   */
  async getDashboardFiltersRevisions(prId) {
    return this.get(
      `/private/performance-reviews/dashboard-filters/${prId}/revisions`,
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // HELPER METHODS
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Получить полную информацию о команде для дашборда
   * Комбинирует несколько API вызовов
   * @param {string|number} prId - ID Performance Review
   * @returns {Promise<Object>}
   */
  async getTeamDashboardData(prId) {
    // Получаем ревизии
    const { data: revisions } = await this.getDashboardFiltersRevisions(prId);
    const latestRevision = revisions?.items?.[0] || revisions?.[0];
    const revisionId = latestRevision?.id;

    // Получаем данные дашборда
    const { data: dashboard } = await this.getDashboard(prId, {
      revisionId,
      usersQuery: {},
    });

    // Получаем target users
    const { data: targetUsers } =
      await this.getDashboardFiltersTargetUsers(prId);

    return {
      revisionId,
      revision: latestRevision,
      dashboard,
      targetUsers: Array.isArray(targetUsers?.items || targetUsers)
        ? targetUsers?.items || targetUsers
        : [],
    };
  }

  /**
   * Получить статусы подчинённых для PR
   * @param {string|number} prId - ID Performance Review
   * @param {Array<string>} [targetUsersIds] - IDs пользователей (опционально)
   * @returns {Promise<Object>}
   */
  async getSubordinatesStatuses(prId, targetUsersIds = []) {
    const { revisionId, targetUsers } = await this.getTeamDashboardData(prId);

    const userIds =
      targetUsersIds.length > 0
        ? targetUsersIds
        : targetUsers.map((u) => u.id || u.userId);

    if (userIds.length === 0) {
      return { statuses: [], revisionId };
    }

    const { data: progresses } = await this.getDashboardProgresses(prId, {
      revisionId,
      targetUsersIds: userIds,
    });

    const raw = progresses?.items || progresses;
    return {
      statuses: Array.isArray(raw) ? raw : [],
      revisionId,
    };
  }
}
