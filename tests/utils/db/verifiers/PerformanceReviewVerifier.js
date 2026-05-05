// tests/utils/db/verifiers/PerformanceReviewVerifier.js
// Верификатор для модуля Performance Review
// Адаптирован под структуру БД appraise

import { expect } from "@playwright/test";
import { BaseVerifier } from "./BaseVerifier.js";

/**
 * Верификатор для проверки данных Performance Review в БД
 *
 * Структура БД:
 * - performance_reviews: основная таблица PR
 * - performance_review_revisions: ревизии (версии)
 * - performance_review_target_users: участники (кого оценивают)
 * - performance_review_receivers: оценщики
 * - performance_review_responses: ответы/оценки
 * - performance_review_assessments: итоговые оценки
 *
 * Статусы PR: 'draft', 'active', 'complete', 'nomination', 'headApprove', 'adminCheck'
 *
 * @example
 * const pr = await prVerifier.verifyPRCreated(prId);
 * await prVerifier.verifyPRStatus(prId, 'active');
 * await prVerifier.verifyTargetUserAdded(prId, userId);
 */
export class PerformanceReviewVerifier extends BaseVerifier {
  // ==========================================
  // Performance Review основные проверки
  // ==========================================

  /**
   * Проверить что PR создан в БД
   * @param {string|number} prId - ID Performance Review
   * @param {number} [timeout=5000] - Таймаут ожидания
   * @returns {Promise<Object|null>} Запись PR или null если нет подключения
   */
  async verifyPRCreated(prId, timeout = 5000) {
    if (this.skipIfNotConnected()) return null;
    const pr = await this.waitForRecord(
      "performance_reviews",
      { id: prId },
      timeout,
    );
    expect(pr, `Performance Review ${prId} не найден в БД`).not.toBeNull();
    return pr;
  }

  /**
   * Проверить статус PR (с ожиданием для eventual consistency)
   * @param {string|number} prId - ID PR
   * @param {string} expectedStatus - 'draft' | 'active' | 'complete' | 'nomination' | 'headApprove' | 'adminCheck'
   * @param {number} [timeout=5000] - Таймаут ожидания
   */
  async verifyPRStatus(prId, expectedStatus, timeout = 5000) {
    if (this.skipIfNotConnected()) return;
    // Используем waitForFieldValue для eventual consistency
    const statusMatched = await this.waitForFieldValue(
      "performance_reviews",
      { id: prId },
      "status",
      expectedStatus,
      timeout,
    );
    if (!statusMatched) {
      // Если таймаут истёк, читаем текущее значение для информативной ошибки
      const pr = await this.db.findOne("performance_reviews", { id: prId });
      expect(pr, `PR ${prId} не найден`).not.toBeNull();
      expect(pr.status, `Статус PR должен быть ${expectedStatus}`).toBe(
        expectedStatus,
      );
    }
  }

  /**
   * Проверить название PR
   * @param {string|number} prId - ID PR
   * @param {string} expectedTitle - Ожидаемое название
   */
  async verifyPRTitle(prId, expectedTitle) {
    if (this.skipIfNotConnected()) return;
    const pr = await this.db.findOne("performance_reviews", { id: prId });
    expect(pr, `PR ${prId} не найден`).not.toBeNull();
    expect(pr.title).toBe(expectedTitle);
  }

  /**
   * Проверить что название PR содержит подстроку
   * @param {string|number} prId - ID PR
   * @param {string} substring - Подстрока
   */
  async verifyPRTitleContains(prId, substring) {
    if (this.skipIfNotConnected()) return;
    const pr = await this.db.findOne("performance_reviews", { id: prId });
    expect(pr, `PR ${prId} не найден`).not.toBeNull();
    expect(pr.title).toContain(substring);
  }

  /**
   * Проверить что PR архивирован
   * @param {string|number} prId - ID PR
   */
  async verifyPRArchived(prId) {
    if (this.skipIfNotConnected()) return;
    const pr = await this.db.findOne("performance_reviews", { id: prId });
    expect(pr, `PR ${prId} не найден`).not.toBeNull();
    expect(pr.is_archived, "PR должен быть архивирован").toBe(1);
  }

  /**
   * Проверить что PR НЕ архивирован
   * @param {string|number} prId - ID PR
   */
  async verifyPRNotArchived(prId) {
    if (this.skipIfNotConnected()) return;
    const pr = await this.db.findOne("performance_reviews", { id: prId });
    expect(pr, `PR ${prId} не найден`).not.toBeNull();
    expect(pr.is_archived, "PR не должен быть архивирован").toBe(0);
  }

  /**
   * Проверить что PR удалён (soft delete)
   * @param {string|number} prId - ID PR
   */
  async verifyPRDeleted(prId) {
    if (this.skipIfNotConnected()) return;
    const pr = await this.db.findOne("performance_reviews", { id: prId });
    expect(pr, `PR ${prId} не найден`).not.toBeNull();
    expect(pr.deleted_at, "PR должен быть удалён").not.toBeNull();
  }

  /**
   * Проверить тип анонимности PR
   * @param {string|number} prId - ID PR
   * @param {string} expectedType - 'anonymous' | 'forAdminHead' | 'notAnonymous'
   */
  async verifyPRAnonymityType(prId, expectedType) {
    if (this.skipIfNotConnected()) return;
    const pr = await this.db.findOne("performance_reviews", { id: prId });
    expect(pr, `PR ${prId} не найден`).not.toBeNull();
    expect(pr.anonymity_type).toBe(expectedType);
  }

  /**
   * Проверить тип workflow PR
   * @param {string|number} prId - ID PR
   * @param {string} expectedType - 'basic' | 'withNominations'
   */
  async verifyPRWorkflowType(prId, expectedType) {
    if (this.skipIfNotConnected()) return;
    const pr = await this.db.findOne("performance_reviews", { id: prId });
    expect(pr, `PR ${prId} не найден`).not.toBeNull();
    expect(pr.workflow_type).toBe(expectedType);
  }

  /**
   * Проверить что PR принадлежит компании
   * @param {string|number} prId - ID PR
   * @param {string|number} companyId - ID компании
   */
  async verifyPRCompany(prId, companyId) {
    if (this.skipIfNotConnected()) return;
    const pr = await this.db.findOne("performance_reviews", { id: prId });
    expect(pr, `PR ${prId} не найден`).not.toBeNull();
    expect(pr.owner_company_id).toBe(companyId);
  }

  // ==========================================
  // Target Users (участники - кого оценивают)
  // ==========================================

  /**
   * Проверить что пользователь добавлен как участник PR
   * @param {string|number} prId - ID PR
   * @param {string|number} userId - ID пользователя
   * @returns {Promise<Object|null>} Запись участника или null если нет подключения
   */
  async verifyTargetUserAdded(prId, userId) {
    if (this.skipIfNotConnected()) return null;
    const targetUser = await this.db.findOne(
      "performance_review_target_users",
      {
        performance_review_id: prId,
        user_id: userId,
      },
    );
    expect(
      targetUser,
      `Участник ${userId} не найден в PR ${prId}`,
    ).not.toBeNull();
    return targetUser;
  }

  /**
   * Проверить что участник обработан
   * @param {string|number} prId - ID PR
   * @param {string|number} userId - ID пользователя
   */
  async verifyTargetUserProcessed(prId, userId) {
    if (this.skipIfNotConnected()) return;
    const targetUser = await this.db.findOne(
      "performance_review_target_users",
      {
        performance_review_id: prId,
        user_id: userId,
      },
    );
    expect(targetUser, `Участник ${userId} не найден`).not.toBeNull();
    expect(targetUser.is_processed, "Участник должен быть обработан").toBe(1);
  }

  /**
   * Проверить количество участников PR
   * @param {string|number} prId - ID PR
   * @param {number} expectedCount - Ожидаемое количество
   */
  async verifyTargetUsersCount(prId, expectedCount) {
    if (this.skipIfNotConnected()) return;
    const count = await this.db.count("performance_review_target_users", {
      performance_review_id: prId,
      is_archived: 0,
    });
    expect(count, `Количество участников должно быть ${expectedCount}`).toBe(
      expectedCount,
    );
  }

  /**
   * Получить всех участников PR
   * @param {string|number} prId - ID PR
   * @returns {Promise<Array>}
   */
  async getTargetUsers(prId) {
    if (this.skipIfNotConnected()) return [];
    return this.db.findAll("performance_review_target_users", {
      performance_review_id: prId,
      is_archived: 0,
    });
  }

  // ==========================================
  // Receivers (оценщики)
  // ==========================================

  /**
   * Проверить что оценщик назначен участнику
   * @param {string|number} targetUserId - ID записи участника (не user_id!)
   * @param {string|number} receiverUserId - ID пользователя-оценщика
   * @returns {Promise<Object|null>}
   */
  async verifyReceiverAdded(targetUserId, receiverUserId) {
    if (this.skipIfNotConnected()) return null;
    const receiver = await this.db.findOne("performance_review_receivers", {
      target_user_id: targetUserId,
      user_id: receiverUserId,
    });
    expect(
      receiver,
      `Оценщик ${receiverUserId} не найден для участника ${targetUserId}`,
    ).not.toBeNull();
    return receiver;
  }

  /**
   * Проверить количество оценщиков участника
   * @param {string|number} targetUserId - ID записи участника
   * @param {number} expectedCount - Ожидаемое количество
   */
  async verifyReceiversCount(targetUserId, expectedCount) {
    if (this.skipIfNotConnected()) return;
    const count = await this.db.count("performance_review_receivers", {
      target_user_id: targetUserId,
    });
    expect(count, `Количество оценщиков должно быть ${expectedCount}`).toBe(
      expectedCount,
    );
  }

  /**
   * Получить всех оценщиков участника
   * @param {string|number} targetUserId - ID записи участника
   * @returns {Promise<Array>}
   */
  async getReceivers(targetUserId) {
    if (this.skipIfNotConnected()) return [];
    return this.db.findAll("performance_review_receivers", {
      target_user_id: targetUserId,
    });
  }

  // ==========================================
  // Responses (ответы/оценки)
  // ==========================================

  /**
   * Проверить статус ответа
   * @param {string|number} responseId - ID ответа
   * @param {string} expectedStatus - 'awaiting' | 'skipped' | 'complete'
   */
  async verifyResponseStatus(responseId, expectedStatus) {
    if (this.skipIfNotConnected()) return;
    const response = await this.db.findOne("performance_review_responses", {
      id: responseId,
    });
    expect(response, `Ответ ${responseId} не найден`).not.toBeNull();
    expect(response.status).toBe(expectedStatus);
  }

  /**
   * Проверить количество завершённых ответов в PR
   * @param {string|number} prId - ID PR
   * @param {number} expectedCount - Ожидаемое количество
   */
  async verifyCompletedResponsesCount(prId, expectedCount) {
    if (this.skipIfNotConnected()) return;
    const revision = await this.db.findOne("performance_review_revisions", {
      performance_review_id: prId,
    });
    if (!revision) {
      expect(expectedCount, "Нет ревизии PR, ожидалось 0 ответов").toBe(0);
      return;
    }

    const count = await this.db.count("performance_review_responses", {
      performance_review_revision_id: revision.id,
      status: "complete",
    });
    expect(
      count,
      `Количество завершённых ответов должно быть ${expectedCount}`,
    ).toBe(expectedCount);
  }

  /**
   * Получить все ответы PR
   * @param {string|number} prId - ID PR
   * @returns {Promise<Array>}
   */
  async getResponses(prId) {
    if (this.skipIfNotConnected()) return [];
    const revision = await this.db.findOne("performance_review_revisions", {
      performance_review_id: prId,
    });
    if (!revision) return [];
    return this.db.findAll("performance_review_responses", {
      performance_review_revision_id: revision.id,
    });
  }

  // ==========================================
  // Revisions (ревизии)
  // ==========================================

  /**
   * Проверить что ревизия PR существует
   * @param {string|number} prId - ID PR
   * @returns {Promise<Object|null>}
   */
  async verifyRevisionExists(prId) {
    if (this.skipIfNotConnected()) return null;
    const revision = await this.db.findOne("performance_review_revisions", {
      performance_review_id: prId,
    });
    expect(revision, `Ревизия для PR ${prId} не найдена`).not.toBeNull();
    return revision;
  }

  /**
   * Проверить что ревизия активна
   * @param {string|number} prId - ID PR
   */
  async verifyRevisionActive(prId) {
    if (this.skipIfNotConnected()) return;
    const revision = await this.db.findOne("performance_review_revisions", {
      performance_review_id: prId,
    });
    expect(revision, `Ревизия для PR ${prId} не найдена`).not.toBeNull();
    expect(revision.is_active, "Ревизия должна быть активной").toBe(1);
  }

  /**
   * Получить ревизию PR
   * @param {string|number} prId - ID PR
   * @returns {Promise<Object|null>}
   */
  async getRevision(prId) {
    if (this.skipIfNotConnected()) return null;
    return this.db.findOne("performance_review_revisions", {
      performance_review_id: prId,
    });
  }

  // ==========================================
  // Result Access (доступ к результатам)
  // ==========================================

  /**
   * Проверить доступ к результатам для target user.
   * Таблица: performance_review_target_user_access
   *
   * Маппинг режимов:
   * - "none":      resultAccess="head",  contentAccess="final"
   * - "scoreOnly": resultAccess="user",  contentAccess="final"
   * - "full":      resultAccess="user",  contentAccess="finalAndResults"
   *
   * @param {string|number} prId - ID Performance Review
   * @param {string|number} userId - ID target user
   * @param {"none"|"scoreOnly"|"full"} expectedMode - Ожидаемый режим доступа
   * @param {number} [timeout=5000] - Таймаут ожидания
   */
  async verifyResultAccess(prId, userId, expectedMode, timeout = 5000) {
    if (this.skipIfNotConnected()) return;

    const modeMap = {
      none: { result_access: "head", content_access: "final" },
      scoreOnly: { result_access: "user", content_access: "final" },
      full: { result_access: "user", content_access: "finalAndResults" },
    };

    const expected = modeMap[expectedMode];
    if (!expected) {
      throw new Error(
        `Неизвестный режим доступа: "${expectedMode}". Допустимые: none, scoreOnly, full`,
      );
    }

    const record = await this.waitForRecord(
      "performance_review_target_user_access",
      { performance_review_id: prId, user_id: userId },
      timeout,
    );

    expect(
      record,
      `Запись доступа не найдена для PR ${prId}, user ${userId}`,
    ).not.toBeNull();

    expect(
      record.result_access,
      `result_access для user ${userId}: ожидалось "${expected.result_access}" (${expectedMode})`,
    ).toBe(expected.result_access);

    expect(
      record.content_access,
      `content_access для user ${userId}: ожидалось "${expected.content_access}" (${expectedMode})`,
    ).toBe(expected.content_access);
  }

  /**
   * Получить запись доступа к результатам для target user
   * @param {string|number} prId - ID Performance Review
   * @param {string|number} userId - ID target user
   * @returns {Promise<Object|null>} { result_access, content_access, run_id } или null
   */
  async getResultAccess(prId, userId) {
    if (this.skipIfNotConnected()) return null;
    return this.db.findOne("performance_review_target_user_access", {
      performance_review_id: prId,
      user_id: userId,
    });
  }

  /**
   * Проверить доступ к результатам для ВСЕХ target users PR
   * @param {string|number} prId - ID Performance Review
   * @param {"none"|"scoreOnly"|"full"} expectedMode - Ожидаемый режим для всех
   */
  async verifyAllTargetUsersResultAccess(prId, expectedMode) {
    if (this.skipIfNotConnected()) return;

    const targetUsers = await this.getTargetUsers(prId);
    expect(
      targetUsers.length,
      `PR ${prId} не имеет target users`,
    ).toBeGreaterThan(0);

    for (const tu of targetUsers) {
      await this.verifyResultAccess(prId, tu.user_id, expectedMode);
    }
  }

  // ==========================================
  // Утилиты
  // ==========================================

  /**
   * Получить PR по ID
   * @param {string|number} prId - ID PR
   * @returns {Promise<Object|null>}
   */
  async getPR(prId) {
    if (this.skipIfNotConnected()) return null;
    return this.db.findOne("performance_reviews", { id: prId });
  }

  /**
   * Получить все PR компании
   * @param {string|number} companyId - ID компании
   * @param {Object} [options] - Опции
   * @returns {Promise<Array>}
   */
  async getCompanyPRs(companyId, options = {}) {
    if (this.skipIfNotConnected()) return [];
    return this.db.findAll(
      "performance_reviews",
      { owner_company_id: companyId, deleted_at: null },
      options,
    );
  }

  /**
   * Подождать изменения статуса PR
   * @param {string|number} prId - ID PR
   * @param {string} expectedStatus - Ожидаемый статус
   * @param {number} [timeout=10000] - Таймаут
   * @returns {Promise<boolean>}
   */
  async waitForPRStatus(prId, expectedStatus, timeout = 10000) {
    if (this.skipIfNotConnected()) return false;
    return this.waitForFieldValue(
      "performance_reviews",
      { id: prId },
      "status",
      expectedStatus,
      timeout,
    );
  }

  /**
   * Получить полную информацию о PR с участниками
   * @param {string|number} prId - ID PR
   * @returns {Promise<Object|null>}
   */
  async getPRWithDetails(prId) {
    if (this.skipIfNotConnected()) return null;
    const pr = await this.getPR(prId);
    if (!pr) return null;

    const revision = await this.getRevision(prId);
    const targetUsers = await this.getTargetUsers(prId);

    return {
      ...pr,
      revision,
      targetUsers,
      targetUsersCount: targetUsers.length,
    };
  }

  // ==========================================
  // Review Admin (администраторы PR)
  // ==========================================

  /**
   * Проверить что пользователь назначен администратором PR
   * Таблица: performance_review_managers (id, performance_review_id, user_id)
   * @param {string|number} prId - ID Performance Review
   * @param {string|number} userId - ID пользователя
   * @param {number} [timeout=5000] - Таймаут ожидания
   * @returns {Promise<Object|null>} Запись или null если нет подключения
   */
  async verifyReviewAdminAssigned(prId, userId, timeout = 5000) {
    this.ensureConnected();
    const record = await this.waitForRecord(
      "performance_review_managers",
      { performance_review_id: prId, user_id: userId },
      timeout,
    );
    expect(
      record,
      `Пользователь ${userId} должен быть назначен администратором PR ${prId}`,
    ).not.toBeNull();
    return record;
  }

  /**
   * Проверить что пользователь НЕ назначен администратором PR
   * @param {string|number} prId - ID Performance Review
   * @param {string|number} userId - ID пользователя
   */
  async verifyReviewAdminNotAssigned(prId, userId) {
    this.ensureConnected();
    const record = await this.db.findOne("performance_review_managers", {
      performance_review_id: prId,
      user_id: userId,
    });
    expect(
      record,
      `Пользователь ${userId} НЕ должен быть администратором PR ${prId}`,
    ).toBeNull();
  }
}
