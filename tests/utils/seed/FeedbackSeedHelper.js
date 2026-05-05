/**
 * Хелпер для создания тестовых данных для модуля Feedback
 *
 * Создаёт:
 * - Благодарности (feedbacks)
 * - Запросы фидбека (feedback requests)
 * - Комментарии к благодарностям
 */

import { FeedbackAPI, getCredentials } from "../api/index.js";
import { TestDataHelper } from "../TestDataHelper.js";

export class FeedbackSeedHelper {
  /**
   * @param {import('@playwright/test').APIRequestContext} request
   */
  constructor(request) {
    this.request = request;
    this.feedbackAPI = null;
    this.createdIds = {
      feedbacks: [],
      feedbackRequests: [],
      comments: [],
    };
    this.cachedData = {
      feedbackTypes: null,
      users: null,
    };
  }

  /**
   * Инициализировать API с авторизацией
   * @param {'admin' | 'user' | 'manager'} role
   */
  async init(role = "admin") {
    this.feedbackAPI = new FeedbackAPI(this.request);
    const { email, password } = getCredentials(role);
    await this.feedbackAPI.signIn(email, password);
  }

  /**
   * Получить типы благодарностей (с кешированием)
   * @returns {Promise<Array>}
   */
  async getFeedbackTypes() {
    if (this.cachedData.feedbackTypes) {
      return this.cachedData.feedbackTypes;
    }

    const { response, data } = await this.feedbackAPI.getFeedbackTypes();
    if (!response.ok()) {
      console.warn("Не удалось получить типы благодарностей");
      return [];
    }

    const items = data?.items || data || [];
    this.cachedData.feedbackTypes = items;
    return items;
  }

  /**
   * Получить первый тип благодарности
   * @returns {Promise<{id: string, name: string}|null>}
   */
  async getFirstFeedbackType() {
    const types = await this.getFeedbackTypes();
    return types.length > 0 ? types[0] : null;
  }

  /**
   * Получить пользователей (с кешированием)
   * @returns {Promise<Array>}
   */
  async getUsers() {
    if (this.cachedData.users) {
      return this.cachedData.users;
    }

    // Используем manager endpoint для получения пользователей
    const { response, data } = await this.feedbackAPI.get(
      "/manager/users?limit=50",
    );
    if (!response.ok()) {
      // Пробуем private endpoint
      const { response: resp2, data: data2 } = await this.feedbackAPI.get(
        "/private/users?limit=50",
      );
      if (!resp2.ok()) {
        console.warn("Не удалось получить пользователей");
        return [];
      }
      const items = data2?.items || data2 || [];
      this.cachedData.users = items;
      return items;
    }

    const items = data?.items || data || [];
    this.cachedData.users = items;
    return items;
  }

  /**
   * Получить целевого пользователя (не текущего)
   * @returns {Promise<{id: string, name: string}|null>}
   */
  async getTargetUser() {
    const users = await this.getUsers();
    // Возвращаем второго пользователя (не себя)
    return users.length > 1 ? users[1] : users.length > 0 ? users[0] : null;
  }

  /**
   * Получить текущего пользователя
   * @returns {Promise<{id: string}|null>}
   */
  async getCurrentUser() {
    const { response, data } = await this.feedbackAPI.get("/private/users/me/");
    if (!response.ok()) {
      return null;
    }
    return data;
  }

  /**
   * Создать благодарность
   * @param {Object} options
   * @param {string} [options.body] - Текст благодарности
   * @param {string|number} [options.targetUserId] - ID получателя
   * @param {string|number} [options.feedbackTypeId] - ID типа благодарности
   * @param {string} [options.userAccessType] - Тип доступа (PRIVATE, PUBLIC)
   * @returns {Promise<{id: string, body: string}|null>}
   */
  async seedFeedback(options = {}) {
    if (!this.feedbackAPI) {
      throw new Error(
        "FeedbackSeedHelper не инициализирован. Вызовите init() первым.",
      );
    }

    // Получаем тип благодарности если не передан
    let feedbackTypeId = options.feedbackTypeId;
    if (!feedbackTypeId) {
      const type = await this.getFirstFeedbackType();
      if (!type) {
        console.warn("Нет доступных типов благодарностей");
        return null;
      }
      feedbackTypeId = type.id;
    }

    // Получаем целевого пользователя если не передан
    let targetUserId = options.targetUserId;
    if (!targetUserId) {
      const targetUser = await this.getTargetUser();
      if (!targetUser) {
        console.warn("Нет целевого пользователя для благодарности");
        return null;
      }
      targetUserId = targetUser.id;
    }

    const body =
      options.body ||
      TestDataHelper.generateUniqueName("Благодарность за отличную работу");

    const { response, data } = await this.feedbackAPI.create({
      body,
      targets: [targetUserId],
      feedbackTypeId,
      userAccessType: options.userAccessType || "PRIVATE",
    });

    if (!response.ok()) {
      const error = await response.text();
      console.warn("Не удалось создать благодарность:", error);
      return null;
    }

    const feedbackId = data?.id;
    if (feedbackId) {
      this.createdIds.feedbacks.push(feedbackId);
    }

    return { id: feedbackId, body, ...data };
  }

  /**
   * Создать публичную благодарность
   * @param {Object} options
   * @returns {Promise<{id: string, body: string}|null>}
   */
  async seedPublicFeedback(options = {}) {
    return this.seedFeedback({
      ...options,
      userAccessType: "PUBLIC",
      body:
        options.body ||
        TestDataHelper.generateUniqueName("Публичная благодарность"),
    });
  }

  /**
   * Создать приватную благодарность
   * @param {Object} options
   * @returns {Promise<{id: string, body: string}|null>}
   */
  async seedPrivateFeedback(options = {}) {
    return this.seedFeedback({
      ...options,
      userAccessType: "PRIVATE",
      body:
        options.body ||
        TestDataHelper.generateUniqueName("Приватная благодарность"),
    });
  }

  /**
   * Создать запрос фидбека
   * @param {Object} options
   * @param {string} [options.comment] - Комментарий к запросу
   * @param {Array<string|number>} [options.targets] - ID получателей
   * @param {Array<string|number>} [options.requestedUsersIds] - ID пользователей, от которых запрашивается фидбек
   * @returns {Promise<{id: string}|null>}
   */
  async seedFeedbackRequest(options = {}) {
    if (!this.feedbackAPI) {
      throw new Error(
        "FeedbackSeedHelper не инициализирован. Вызовите init() первым.",
      );
    }

    const users = await this.getUsers();
    if (users.length < 2) {
      console.warn("Недостаточно пользователей для создания запроса фидбека");
      return null;
    }

    const targets = options.targets || [users[1]?.id].filter(Boolean);
    const requestedUsersIds =
      options.requestedUsersIds || [users[0]?.id].filter(Boolean);

    if (targets.length === 0 || requestedUsersIds.length === 0) {
      console.warn("Нет пользователей для создания запроса фидбека");
      return null;
    }

    const comment =
      options.comment ||
      TestDataHelper.generateUniqueName("Запрос обратной связи");

    const { response, data } = await this.feedbackAPI.createFeedbackRequest({
      comment,
      targets,
      requestedUsersIds,
    });

    if (!response.ok()) {
      const error = await response.text();
      console.warn("Не удалось создать запрос фидбека:", error);
      return null;
    }

    const requestId = data?.id;
    if (requestId) {
      this.createdIds.feedbackRequests.push(requestId);
    }

    return { id: requestId, comment, ...data };
  }

  /**
   * Создать комментарий к благодарности
   * @param {string|number} feedbackId - ID благодарности
   * @param {string} [body] - Текст комментария
   * @returns {Promise<{id: string, body: string}|null>}
   */
  async seedComment(feedbackId, body) {
    if (!this.feedbackAPI) {
      throw new Error(
        "FeedbackSeedHelper не инициализирован. Вызовите init() первым.",
      );
    }

    const commentBody =
      body || TestDataHelper.generateUniqueName("Отличная работа!");

    const { response, data } = await this.feedbackAPI.createComment(
      feedbackId,
      commentBody,
    );

    if (!response.ok()) {
      const error = await response.text();
      console.warn("Не удалось создать комментарий:", error);
      return null;
    }

    const commentId = data?.id;
    if (commentId) {
      this.createdIds.comments.push(commentId);
    }

    return { id: commentId, body: commentBody, ...data };
  }

  /**
   * Создать полный набор тестовых данных для Feedback модуля
   * @returns {Promise<{
   *   privateFeedback: Object,
   *   publicFeedback: Object,
   *   feedbackWithComment: Object,
   *   feedbackRequest: Object,
   *   feedbackTypes: Array,
   *   users: Array
   * }>}
   */
  async seedAll() {
    console.log("Создание тестовых данных для Feedback модуля...");

    // Получаем типы и пользователей
    console.log("  - Получение типов благодарностей...");
    const feedbackTypes = await this.getFeedbackTypes();

    console.log("  - Получение пользователей...");
    const users = await this.getUsers();

    if (feedbackTypes.length === 0) {
      console.warn("Нет типов благодарностей, seed данных невозможен");
      return {
        privateFeedback: null,
        publicFeedback: null,
        feedbackWithComment: null,
        feedbackRequest: null,
        feedbackTypes,
        users,
      };
    }

    if (users.length < 2) {
      console.warn("Недостаточно пользователей, seed данных невозможен");
      return {
        privateFeedback: null,
        publicFeedback: null,
        feedbackWithComment: null,
        feedbackRequest: null,
        feedbackTypes,
        users,
      };
    }

    // Приватная благодарность
    console.log("  - Создание приватной благодарности...");
    const privateFeedback = await this.seedPrivateFeedback();

    // Публичная благодарность
    console.log("  - Создание публичной благодарности...");
    const publicFeedback = await this.seedPublicFeedback();

    // Благодарность с комментарием
    console.log("  - Создание благодарности с комментарием...");
    let feedbackWithComment = await this.seedPrivateFeedback({
      body: "Благодарность для комментария",
    });

    if (feedbackWithComment?.id) {
      const comment = await this.seedComment(feedbackWithComment.id);
      if (comment) {
        feedbackWithComment.comment = comment;
      }
    }

    // Запрос фидбека
    console.log("  - Создание запроса фидбека...");
    const feedbackRequest = await this.seedFeedbackRequest();

    console.log("Тестовые данные Feedback созданы:");
    console.log(`  - Типов благодарностей: ${feedbackTypes.length}`);
    console.log(`  - Пользователей: ${users.length}`);
    console.log(
      `  - Приватная благодарность: ${privateFeedback?.id || "не создано"}`,
    );
    console.log(
      `  - Публичная благодарность: ${publicFeedback?.id || "не создано"}`,
    );
    console.log(
      `  - Благодарность с комментарием: ${feedbackWithComment?.id || "не создано"}`,
    );
    console.log(`  - Запрос фидбека: ${feedbackRequest?.id || "не создано"}`);

    return {
      privateFeedback,
      publicFeedback,
      feedbackWithComment,
      feedbackRequest,
      feedbackTypes,
      users,
    };
  }

  /**
   * Проверить существующие данные
   * @returns {Promise<{hasData: boolean, counts: Object}>}
   */
  async checkExistingData() {
    if (!this.feedbackAPI) {
      throw new Error("FeedbackSeedHelper не инициализирован.");
    }

    // Проверяем наличие благодарностей
    const { data: myFeedbacks } = await this.feedbackAPI.getMyFeedbacks({
      limit: 1,
    });
    const { data: ofMeFeedbacks } = await this.feedbackAPI.getFeedbacksOfMe({
      limit: 1,
    });
    const { data: sharedFeedbacks } = await this.feedbackAPI.getSharedFeedbacks(
      { limit: 1 },
    );

    // Проверяем наличие запросов
    const { data: myRequests } = await this.feedbackAPI.getMyFeedbackRequests({
      limit: 1,
    });
    const { data: forMeRequests } =
      await this.feedbackAPI.getFeedbackRequestsForMe({ limit: 1 });

    const myCount = myFeedbacks?.items?.length || myFeedbacks?.length || 0;
    const ofMeCount =
      ofMeFeedbacks?.items?.length || ofMeFeedbacks?.length || 0;
    const sharedCount =
      sharedFeedbacks?.items?.length || sharedFeedbacks?.length || 0;
    const myRequestsCount =
      myRequests?.items?.length || myRequests?.length || 0;
    const forMeRequestsCount =
      forMeRequests?.items?.length || forMeRequests?.length || 0;

    // Проверяем типы
    const types = await this.getFeedbackTypes();

    return {
      hasData:
        (myCount > 0 || ofMeCount > 0 || sharedCount > 0) && types.length > 0,
      counts: {
        myFeedbacks: myCount,
        ofMeFeedbacks: ofMeCount,
        sharedFeedbacks: sharedCount,
        myRequests: myRequestsCount,
        forMeRequests: forMeRequestsCount,
        feedbackTypes: types.length,
      },
    };
  }

  /**
   * Очистить все созданные тестовые данные
   */
  async cleanup() {
    if (!this.feedbackAPI) {
      console.warn("FeedbackSeedHelper: не инициализирован, очистка пропущена");
      return;
    }

    console.log("Очистка тестовых данных Feedback...");

    // Благодарности обычно не удаляются через API
    // Но очищаем массивы для отслеживания

    // Очищаем массивы
    this.createdIds = {
      feedbacks: [],
      feedbackRequests: [],
      comments: [],
    };

    console.log("Очистка завершена");
  }

  /**
   * Получить все созданные ID
   * @returns {Object}
   */
  getCreatedIds() {
    return this.createdIds;
  }
}
