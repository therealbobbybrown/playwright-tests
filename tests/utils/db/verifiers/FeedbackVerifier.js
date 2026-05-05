// tests/utils/db/verifiers/FeedbackVerifier.js
// Верификатор для модуля обратной связи (Feedback)
// Адаптирован под структуру БД appraise

import { expect } from "@playwright/test";
import { BaseVerifier } from "./BaseVerifier.js";

/**
 * Верификатор для проверки данных обратной связи в БД
 *
 * Структура БД:
 * - feedbacks: основная таблица фидбеков
 * - feedback_target_users: получатели фидбека
 * - feedback_types: типы фидбека
 * - feedback_comments: комментарии
 *
 * @example
 * const feedback = await feedbackVerifier.verifyFeedbackCreated(feedbackId);
 * await feedbackVerifier.verifyFeedbackAuthor(feedbackId, authorUserId);
 */
export class FeedbackVerifier extends BaseVerifier {
  /**
   * Проверить что фидбек создан в БД
   * @param {string|number} feedbackId - ID фидбека
   * @param {number} [timeout=5000] - Таймаут ожидания
   * @returns {Promise<Object|null>} Запись фидбека или null если нет подключения
   */
  async verifyFeedbackCreated(feedbackId, timeout = 5000) {
    if (this.skipIfNotConnected()) return null;
    const feedback = await this.waitForRecord(
      "feedbacks",
      { id: feedbackId },
      timeout,
    );
    expect(feedback, `Фидбек ${feedbackId} не найден в БД`).not.toBeNull();
    return feedback;
  }

  /**
   * Проверить текст фидбека
   * @param {string|number} feedbackId - ID фидбека
   * @param {string} expectedBody - Ожидаемый текст
   */
  async verifyFeedbackBody(feedbackId, expectedBody) {
    if (this.skipIfNotConnected()) return;
    const feedback = await this.db.findOne("feedbacks", { id: feedbackId });
    expect(feedback, `Фидбек ${feedbackId} не найден`).not.toBeNull();
    expect(feedback.body).toBe(expectedBody);
  }

  /**
   * Проверить что текст фидбека содержит подстроку
   * @param {string|number} feedbackId - ID фидбека
   * @param {string} substring - Подстрока для поиска
   */
  async verifyFeedbackBodyContains(feedbackId, substring) {
    if (this.skipIfNotConnected()) return;
    const feedback = await this.db.findOne("feedbacks", { id: feedbackId });
    expect(feedback, `Фидбек ${feedbackId} не найден`).not.toBeNull();
    expect(feedback.body).toContain(substring);
  }

  /**
   * Проверить автора фидбека
   * @param {string|number} feedbackId - ID фидбека
   * @param {string|number} authorUserId - ID автора
   */
  async verifyFeedbackAuthor(feedbackId, authorUserId) {
    if (this.skipIfNotConnected()) return;
    const feedback = await this.db.findOne("feedbacks", { id: feedbackId });
    expect(feedback, `Фидбек ${feedbackId} не найден`).not.toBeNull();
    expect(feedback.author_user_id).toBe(authorUserId);
  }

  /**
   * Проверить получателя фидбека (через feedback_target_users)
   * @param {string|number} feedbackId - ID фидбека
   * @param {string|number} recipientUserId - ID получателя
   */
  async verifyFeedbackRecipient(feedbackId, recipientUserId) {
    if (this.skipIfNotConnected()) return;
    const target = await this.db.findOne("feedback_target_users", {
      feedback_id: feedbackId,
      user_id: recipientUserId,
    });
    expect(
      target,
      `Получатель ${recipientUserId} не найден для фидбека ${feedbackId}`,
    ).not.toBeNull();
  }

  /**
   * Получить всех получателей фидбека
   * @param {string|number} feedbackId - ID фидбека
   * @returns {Promise<Array>}
   */
  async getFeedbackRecipients(feedbackId) {
    if (this.skipIfNotConnected()) return [];
    return this.db.findAll("feedback_target_users", {
      feedback_id: feedbackId,
    });
  }

  /**
   * Проверить тип фидбека
   * @param {string|number} feedbackId - ID фидбека
   * @param {string|number} expectedTypeId - ID типа фидбека
   */
  async verifyFeedbackType(feedbackId, expectedTypeId) {
    if (this.skipIfNotConnected()) return;
    const feedback = await this.db.findOne("feedbacks", { id: feedbackId });
    expect(feedback, `Фидбек ${feedbackId} не найден`).not.toBeNull();
    expect(feedback.feedback_type_id).toBe(expectedTypeId);
  }

  /**
   * Проверить статус фидбека
   * @param {string|number} feedbackId - ID фидбека
   * @param {string} expectedStatus - 'none' | 'agree' | 'disagree'
   */
  async verifyFeedbackStatus(feedbackId, expectedStatus) {
    if (this.skipIfNotConnected()) return;
    const feedback = await this.db.findOne("feedbacks", { id: feedbackId });
    expect(feedback, `Фидбек ${feedbackId} не найден`).not.toBeNull();
    expect(feedback.feedback_status).toBe(expectedStatus);
  }

  /**
   * Проверить что фидбек удалён (soft delete)
   * @param {string|number} feedbackId - ID фидбека
   * @param {number} [timeout=5000] - Таймаут
   */
  async verifyFeedbackDeleted(feedbackId, timeout = 5000) {
    if (this.skipIfNotConnected()) return;
    const deleted = await this.waitForDeletion(
      "feedbacks",
      { id: feedbackId },
      "deleted_at",
      timeout,
    );
    expect(deleted, `Фидбек ${feedbackId} должен быть удалён`).toBe(true);
  }

  /**
   * Проверить что фидбек НЕ удалён
   * @param {string|number} feedbackId - ID фидбека
   */
  async verifyFeedbackNotDeleted(feedbackId) {
    if (this.skipIfNotConnected()) return;
    const feedback = await this.db.findOne("feedbacks", { id: feedbackId });
    expect(feedback, `Фидбек ${feedbackId} не найден`).not.toBeNull();
    expect(feedback.deleted_at, "Фидбек не должен быть удалён").toBeNull();
  }

  /**
   * Получить все фидбеки где пользователь - получатель
   * @param {string|number} recipientUserId - ID получателя
   * @param {Object} [options] - Опции (limit, orderBy)
   * @returns {Promise<Array>}
   */
  async getFeedbacksByRecipient(recipientUserId, options = {}) {
    if (this.skipIfNotConnected()) return [];
    const targets = await this.db.findAll("feedback_target_users", {
      user_id: recipientUserId,
    });
    if (targets.length === 0) return [];

    const feedbackIds = targets.map((t) => t.feedback_id);
    return this.db.query(
      `SELECT * FROM feedbacks WHERE id IN (${feedbackIds.map(() => "?").join(",")}) AND deleted_at IS NULL`,
      feedbackIds,
    );
  }

  /**
   * Получить все фидбеки по автору
   * @param {string|number} authorUserId - ID автора
   * @param {Object} [options] - Опции (limit, orderBy)
   * @returns {Promise<Array>}
   */
  async getFeedbacksByAuthor(authorUserId, options = {}) {
    if (this.skipIfNotConnected()) return [];
    return this.db.findAll(
      "feedbacks",
      { author_user_id: authorUserId, deleted_at: null },
      options,
    );
  }

  /**
   * Подсчитать количество фидбеков получателя
   * @param {string|number} recipientUserId - ID получателя
   * @returns {Promise<number>}
   */
  async countFeedbacksByRecipient(recipientUserId) {
    if (this.skipIfNotConnected()) return 0;
    const results = await this.db.query(
      `SELECT COUNT(DISTINCT f.id) as count
       FROM feedbacks f
       JOIN feedback_target_users ftu ON f.id = ftu.feedback_id
       WHERE ftu.user_id = ? AND f.deleted_at IS NULL`,
      [recipientUserId],
    );
    return results[0]?.count || 0;
  }

  /**
   * Проверить количество фидбеков получателя
   * @param {string|number} recipientUserId - ID получателя
   * @param {number} expectedCount - Ожидаемое количество
   */
  async verifyFeedbacksCount(recipientUserId, expectedCount) {
    if (this.skipIfNotConnected()) return;
    const count = await this.countFeedbacksByRecipient(recipientUserId);
    expect(count, `Количество фидбеков должно быть ${expectedCount}`).toBe(
      expectedCount,
    );
  }

  /**
   * Проверить сумму бонусов в фидбеке
   * @param {string|number} feedbackId - ID фидбека
   * @param {number} expectedAmount - Ожидаемая сумма
   */
  async verifyFeedbackBonusAmount(feedbackId, expectedAmount) {
    if (this.skipIfNotConnected()) return;
    const feedback = await this.db.findOne("feedbacks", { id: feedbackId });
    expect(feedback, `Фидбек ${feedbackId} не найден`).not.toBeNull();
    expect(Number(feedback.gift_bonus_amount)).toBe(expectedAmount);
  }

  /**
   * Получить фидбек по ID
   * @param {string|number} feedbackId - ID фидбека
   * @returns {Promise<Object|null>}
   */
  async getFeedback(feedbackId) {
    if (this.skipIfNotConnected()) return null;
    return this.db.findOne("feedbacks", { id: feedbackId });
  }

  /**
   * Получить типы фидбеков
   * @returns {Promise<Array>}
   */
  async getFeedbackTypes() {
    if (this.skipIfNotConnected()) return [];
    return this.db.findAll("feedback_types", {});
  }

  // ==================== FEEDBACK COMMENTS ====================

  /**
   * Проверить что комментарий создан в БД
   * @param {string|number} commentId - ID комментария
   * @param {number} [timeout=5000] - Таймаут ожидания
   * @returns {Promise<Object|null>} Запись комментария или null если нет подключения
   */
  async verifyCommentCreated(commentId, timeout = 5000) {
    if (this.skipIfNotConnected()) return null;
    const comment = await this.waitForRecord(
      "feedback_comments",
      { id: commentId },
      timeout,
    );
    expect(comment, `Комментарий ${commentId} не найден в БД`).not.toBeNull();
    return comment;
  }

  /**
   * Проверить текст комментария
   * @param {string|number} commentId - ID комментария
   * @param {string} expectedBody - Ожидаемый текст
   */
  async verifyCommentBody(commentId, expectedBody) {
    if (this.skipIfNotConnected()) return;
    const comment = await this.db.findOne("feedback_comments", {
      id: commentId,
    });
    expect(comment, `Комментарий ${commentId} не найден`).not.toBeNull();
    expect(comment.body).toBe(expectedBody);
  }

  /**
   * Проверить что комментарий принадлежит фидбеку
   * @param {string|number} commentId - ID комментария
   * @param {string|number} feedbackId - ID фидбека
   */
  async verifyCommentFeedback(commentId, feedbackId) {
    if (this.skipIfNotConnected()) return;
    const comment = await this.db.findOne("feedback_comments", {
      id: commentId,
    });
    expect(comment, `Комментарий ${commentId} не найден`).not.toBeNull();
    expect(comment.feedback_id).toBe(feedbackId);
  }

  /**
   * Получить комментарий по ID
   * @param {string|number} commentId - ID комментария
   * @returns {Promise<Object|null>}
   */
  async getComment(commentId) {
    if (this.skipIfNotConnected()) return null;
    return this.db.findOne("feedback_comments", { id: commentId });
  }

  /**
   * Получить все комментарии фидбека
   * @param {string|number} feedbackId - ID фидбека
   * @returns {Promise<Array>}
   */
  async getFeedbackComments(feedbackId) {
    if (this.skipIfNotConnected()) return [];
    return this.db.findAll("feedback_comments", { feedback_id: feedbackId });
  }

  // ==================== FEEDBACK REQUESTS ====================

  /**
   * Проверить что запрос фидбека создан в БД
   * @param {string|number} requestId - ID запроса
   * @param {number} [timeout=5000] - Таймаут ожидания
   * @returns {Promise<Object|null>} Запись запроса или null если нет подключения
   */
  async verifyRequestCreated(requestId, timeout = 5000) {
    if (this.skipIfNotConnected()) return null;
    const request = await this.waitForRecord(
      "feedback_requests",
      { id: requestId },
      timeout,
    );
    expect(
      request,
      `Запрос фидбека ${requestId} не найден в БД`,
    ).not.toBeNull();
    return request;
  }

  /**
   * Проверить комментарий запроса фидбека
   * @param {string|number} requestId - ID запроса
   * @param {string} expectedComment - Ожидаемый комментарий
   */
  async verifyRequestComment(requestId, expectedComment) {
    if (this.skipIfNotConnected()) return;
    const request = await this.db.findOne("feedback_requests", {
      id: requestId,
    });
    expect(request, `Запрос фидбека ${requestId} не найден`).not.toBeNull();
    expect(request.comment).toBe(expectedComment);
  }

  /**
   * Получить запрос фидбека по ID
   * @param {string|number} requestId - ID запроса
   * @returns {Promise<Object|null>}
   */
  async getRequest(requestId) {
    if (this.skipIfNotConnected()) return null;
    return this.db.findOne("feedback_requests", { id: requestId });
  }

  /**
   * Подсчитать количество комментариев фидбека
   * @param {string|number} feedbackId - ID фидбека
   * @returns {Promise<number>}
   */
  async countComments(feedbackId) {
    if (this.skipIfNotConnected()) return 0;
    return this.db.count("feedback_comments", { feedback_id: feedbackId });
  }

  /**
   * Подсчитать количество запросов фидбека
   * @param {Object} [where={}] - Условия фильтрации
   * @returns {Promise<number>}
   */
  async countRequests(where = {}) {
    if (this.skipIfNotConnected()) return 0;
    return this.db.count("feedback_requests", where);
  }

  /**
   * Проверить что комментарий НЕ существует
   * @param {string|number} commentId - ID комментария
   */
  async verifyCommentNotExists(commentId) {
    if (this.skipIfNotConnected()) return;
    const comment = await this.db.findOne("feedback_comments", {
      id: commentId,
    });
    expect(
      comment,
      `Комментарий ${commentId} не должен существовать`,
    ).toBeNull();
  }

  /**
   * Проверить что для фидбека нет комментариев с указанным условием
   * @param {string|number} feedbackId - ID фидбека
   */
  async verifyNoCommentsForFeedback(feedbackId) {
    if (this.skipIfNotConnected()) return;
    const comment = await this.db.findOne("feedback_comments", {
      feedback_id: feedbackId,
    });
    expect(
      comment,
      `Комментарии для фидбека ${feedbackId} не должны существовать`,
    ).toBeNull();
  }

  /**
   * Проверить что запрос фидбека удалён (soft delete)
   * @param {string|number} requestId - ID запроса
   */
  async verifyRequestDeleted(requestId) {
    if (this.skipIfNotConnected()) return;
    const request = await this.db.findOne("feedback_requests", {
      id: requestId,
    });
    if (request) {
      // Проверяем soft delete
      expect(
        request.deleted_at || request.is_deleted,
        `Запрос ${requestId} должен быть помечен как удалённый`,
      ).toBeTruthy();
    }
    // Если request === null, значит физически удалён - тоже OK
  }

  /**
   * Проверить что количество комментариев не изменилось
   * @param {string|number} feedbackId - ID фидбека
   * @param {number} expectedCount - Ожидаемое количество
   */
  async verifyCommentsCount(feedbackId, expectedCount) {
    if (this.skipIfNotConnected()) return;
    const count = await this.countComments(feedbackId);
    expect(count, `Количество комментариев должно быть ${expectedCount}`).toBe(
      expectedCount,
    );
  }

  /**
   * Проверить что количество запросов не изменилось
   * @param {number} expectedCount - Ожидаемое количество
   * @param {Object} [where={}] - Условия фильтрации
   */
  async verifyRequestsCount(expectedCount, where = {}) {
    if (this.skipIfNotConnected()) return;
    const count = await this.countRequests(where);
    expect(count, `Количество запросов должно быть ${expectedCount}`).toBe(
      expectedCount,
    );
  }

  /**
   * Проверить что запрос фидбека НЕ существует в БД
   * @param {string|number} requestId - ID запроса
   */
  async verifyRequestNotExists(requestId) {
    if (this.skipIfNotConnected()) return;
    const request = await this.db.findOne("feedback_requests", {
      id: requestId,
    });
    expect(
      request,
      `Запрос ${requestId} не должен существовать в БД`,
    ).toBeNull();
  }
}
