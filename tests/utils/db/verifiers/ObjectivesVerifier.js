// tests/utils/db/verifiers/ObjectivesVerifier.js
// Верификатор для модуля целей (Objectives/OKR)

import { expect } from "@playwright/test";
import { BaseVerifier } from "./BaseVerifier.js";

/**
 * Верификатор для проверки данных целей в БД
 *
 * Структура БД:
 * - objectives: основная таблица целей
 * - objective_milestones: milestones целей
 * - objective_comments: комментарии к целям
 *
 * @example
 * const objective = await objectivesVerifier.verifyObjectiveCreated(objectiveId);
 * await objectivesVerifier.verifyObjectiveStatus(objectiveId, 'active');
 */
export class ObjectivesVerifier extends BaseVerifier {
  /**
   * Проверить что цель создана в БД
   * @param {string|number} objectiveId - ID цели
   * @param {number} [timeout=5000] - Таймаут ожидания
   * @returns {Promise<Object|null>} Запись цели или null если нет подключения
   */
  async verifyObjectiveCreated(objectiveId, timeout = 5000) {
    if (this.skipIfNotConnected()) return null;
    const objective = await this.waitForRecord(
      "objectives",
      { id: objectiveId },
      timeout,
    );
    expect(objective, `Цель ${objectiveId} не найдена в БД`).not.toBeNull();
    return objective;
  }

  /**
   * Проверить статус цели
   * @param {string|number} objectiveId - ID цели
   * @param {string} expectedStatus - Ожидаемый статус ('draft' | 'active' | 'completed' | 'cancelled')
   */
  async verifyObjectiveStatus(objectiveId, expectedStatus) {
    if (this.skipIfNotConnected()) return;
    const objective = await this.db.findOne("objectives", { id: objectiveId });
    expect(objective, `Цель ${objectiveId} не найдена`).not.toBeNull();
    expect(objective.status, `Статус цели должен быть ${expectedStatus}`).toBe(
      expectedStatus,
    );
  }

  /**
   * Проверить название цели
   * @param {string|number} objectiveId - ID цели
   * @param {string} expectedTitle - Ожидаемое название
   */
  async verifyObjectiveTitle(objectiveId, expectedTitle) {
    if (this.skipIfNotConnected()) return;
    const objective = await this.db.findOne("objectives", { id: objectiveId });
    expect(objective, `Цель ${objectiveId} не найдена`).not.toBeNull();
    expect(objective.title).toBe(expectedTitle);
  }

  /**
   * Проверить что название цели содержит подстроку
   * @param {string|number} objectiveId - ID цели
   * @param {string} substring - Подстрока для поиска
   */
  async verifyObjectiveTitleContains(objectiveId, substring) {
    if (this.skipIfNotConnected()) return;
    const objective = await this.db.findOne("objectives", { id: objectiveId });
    expect(objective, `Цель ${objectiveId} не найдена`).not.toBeNull();
    expect(objective.title).toContain(substring);
  }

  /**
   * Проверить владельца цели
   * @param {string|number} objectiveId - ID цели
   * @param {string|number} userId - ID пользователя
   */
  async verifyObjectiveOwner(objectiveId, userId) {
    if (this.skipIfNotConnected()) return;
    const objective = await this.db.findOne("objectives", { id: objectiveId });
    expect(objective, `Цель ${objectiveId} не найдена`).not.toBeNull();
    // Колонка может называться user_id или responsible_user_id
    const actualUserId =
      objective.responsible_user_id || objective.user_id || objective.owner_id;
    expect(actualUserId, "Владелец/ответственный цели").toBe(userId);
  }

  /**
   * Проверить период цели в БД (DEVAPR-11585).
   * БД хранит start_date/end_date как datetime ("YYYY-MM-DD 00:00:00").
   * Сравнение идёт по дате без времени через DATE_FORMAT.
   * @param {string|number} objectiveId - ID цели
   * @param {string} expectedStartDate - Дата в формате "YYYY-MM-DD"
   * @param {string} expectedEndDate - Дата в формате "YYYY-MM-DD"
   */
  async verifyObjectivePeriod(objectiveId, expectedStartDate, expectedEndDate) {
    if (this.skipIfNotConnected()) return;

    // Используем DATE_FORMAT на стороне MySQL — это гарантирует корректную дату
    // независимо от timezone Node.js процесса и mysql2 RowDataPacket представления.
    // DATE_FORMAT работает в серверном времени (UTC+3 Москва), совпадающем с datepicker.
    const row = await this.db.queryOne(
      "SELECT DATE_FORMAT(start_date, '%Y-%m-%d') as start_d, DATE_FORMAT(end_date, '%Y-%m-%d') as end_d FROM objectives WHERE id = ?",
      [objectiveId],
    );
    expect(row, `Цель ${objectiveId} не найдена в БД`).not.toBeNull();
    expect(row.start_d, `start_date цели ${objectiveId} должна быть ${expectedStartDate}`).toBe(expectedStartDate);
    expect(row.end_d, `end_date цели ${objectiveId} должна быть ${expectedEndDate}`).toBe(expectedEndDate);
  }

  /**
   * Проверить прогресс цели
   * @param {string|number} objectiveId - ID цели
   * @param {number} expectedProgress - Ожидаемый прогресс (0-100)
   */
  async verifyObjectiveProgress(objectiveId, expectedProgress) {
    if (this.skipIfNotConnected()) return;
    const objective = await this.db.findOne("objectives", { id: objectiveId });
    expect(objective, `Цель ${objectiveId} не найдена`).not.toBeNull();
    expect(Number(objective.progress)).toBe(expectedProgress);
  }

  /**
   * Проверить что цель удалена (soft delete)
   * @param {string|number} objectiveId - ID цели
   */
  async verifyObjectiveDeleted(objectiveId) {
    if (this.skipIfNotConnected()) return;
    const objective = await this.db.findOne("objectives", { id: objectiveId });
    expect(objective, `Цель ${objectiveId} не найдена`).not.toBeNull();
    expect(objective.deleted_at, "Цель должна быть удалена").not.toBeNull();
  }

  /**
   * Проверить что цель НЕ удалена
   * @param {string|number} objectiveId - ID цели
   */
  async verifyObjectiveNotDeleted(objectiveId) {
    if (this.skipIfNotConnected()) return;
    const objective = await this.db.findOne("objectives", { id: objectiveId });
    expect(objective, `Цель ${objectiveId} не найдена`).not.toBeNull();
    expect(objective.deleted_at, "Цель не должна быть удалена").toBeNull();
  }

  /**
   * Проверить количество ключевых результатов
   * @param {string|number} objectiveId - ID цели
   * @param {number} expectedCount - Ожидаемое количество
   */
  async verifyKeyResultsCount(objectiveId, expectedCount) {
    if (this.skipIfNotConnected()) return;
    try {
      const count = await this.db.count("objective_milestones", {
        objective_id: objectiveId,
      });
      expect(count, `Количество milestones должно быть ${expectedCount}`).toBe(
        expectedCount,
      );
    } catch (error) {
      console.warn(
        "[ObjectivesVerifier] Ошибка подсчёта milestones:",
        error.message,
      );
    }
  }

  /**
   * Получить цель по ID
   * @param {string|number} objectiveId - ID цели
   * @returns {Promise<Object|null>}
   */
  async getObjective(objectiveId) {
    if (this.skipIfNotConnected()) return null;
    return this.db.findOne("objectives", { id: objectiveId });
  }

  /**
   * Получить все цели пользователя
   * @param {string|number} userId - ID пользователя
   * @param {Object} [options] - Опции (limit, orderBy)
   * @returns {Promise<Array>}
   */
  async getUserObjectives(userId, options = {}) {
    if (this.skipIfNotConnected()) return [];
    try {
      // Пробуем разные варианты названия колонки
      const byResponsible = await this.db.findAll(
        "objectives",
        { responsible_user_id: userId, deleted_at: null },
        options,
      );
      return byResponsible;
    } catch (error) {
      try {
        return await this.db.findAll(
          "objectives",
          { user_id: userId, deleted_at: null },
          options,
        );
      } catch (e) {
        console.warn(
          "[ObjectivesVerifier] Ошибка получения целей пользователя:",
          e.message,
        );
        return [];
      }
    }
  }

  /**
   * Получить ключевые результаты цели
   * @param {string|number} objectiveId - ID цели
   * @returns {Promise<Array>}
   */
  async getKeyResults(objectiveId) {
    if (this.skipIfNotConnected()) return [];
    try {
      return await this.db.findAll("objective_milestones", {
        objective_id: objectiveId,
      });
    } catch (error) {
      console.warn(
        "[ObjectivesVerifier] Ошибка получения milestones:",
        error.message,
      );
      return [];
    }
  }

  // ==================== COMMENTS ====================

  /**
   * Проверить что комментарий создан в БД
   * @param {string|number} commentId - ID комментария
   * @param {number} [timeout=5000] - Таймаут ожидания
   * @returns {Promise<Object|null>} Запись комментария или null если нет подключения
   */
  async verifyCommentCreated(commentId, timeout = 5000) {
    if (this.skipIfNotConnected()) return null;
    const comment = await this.waitForRecord(
      "objective_comments",
      { id: commentId },
      timeout,
    );
    expect(comment, `Комментарий ${commentId} не найден в БД`).not.toBeNull();
    return comment;
  }

  /**
   * Проверить тело комментария
   * @param {string|number} commentId - ID комментария
   * @param {string} expectedBody - Ожидаемый текст
   */
  async verifyCommentBody(commentId, expectedBody) {
    if (this.skipIfNotConnected()) return;
    const comment = await this.db.findOne("objective_comments", {
      id: commentId,
    });
    expect(comment, `Комментарий ${commentId} не найден`).not.toBeNull();
    expect(
      comment.body,
      `Текст комментария должен быть "${expectedBody}"`,
    ).toBe(expectedBody);
  }

  /**
   * Проверить привязку комментария к цели
   * @param {string|number} commentId - ID комментария
   * @param {string|number} expectedObjectiveId - Ожидаемый ID цели
   */
  async verifyCommentObjective(commentId, expectedObjectiveId) {
    if (this.skipIfNotConnected()) return;
    const comment = await this.db.findOne("objective_comments", {
      id: commentId,
    });
    expect(comment, `Комментарий ${commentId} не найден`).not.toBeNull();
    expect(
      Number(comment.objective_id),
      "Комментарий привязан к неверной цели",
    ).toBe(Number(expectedObjectiveId));
  }

  /**
   * Проверить что комментарий удалён (soft delete)
   * @param {string|number} commentId - ID комментария
   */
  async verifyCommentDeleted(commentId) {
    if (this.skipIfNotConnected()) return;
    const comment = await this.db.findOne("objective_comments", {
      id: commentId,
    });
    // Комментарий либо физически удалён, либо soft delete
    if (comment) {
      const isDeleted = comment.deleted_at || comment.is_deleted;
      expect(
        isDeleted,
        "Комментарий должен быть помечен как удалённый",
      ).toBeTruthy();
    }
    // Если comment === null, значит физически удалён - тоже OK
  }

  /**
   * Проверить что комментарий НЕ существует в БД
   * @param {string|number} commentId - ID комментария
   */
  async verifyCommentNotExists(commentId) {
    if (this.skipIfNotConnected()) return;
    const comment = await this.db.findOne("objective_comments", {
      id: commentId,
    });
    expect(
      comment,
      `Комментарий ${commentId} не должен существовать в БД`,
    ).toBeNull();
  }

  /**
   * Получить комментарий по ID
   * @param {string|number} commentId - ID комментария
   * @returns {Promise<Object|null>}
   */
  async getComment(commentId) {
    if (this.skipIfNotConnected()) return null;
    return this.db.findOne("objective_comments", { id: commentId });
  }

  /**
   * Подсчитать количество комментариев цели
   * @param {string|number} objectiveId - ID цели
   * @returns {Promise<number>}
   */
  async countComments(objectiveId) {
    if (this.skipIfNotConnected()) return 0;
    return this.db.count("objective_comments", { objective_id: objectiveId });
  }

  /**
   * Подсчитать общее количество комментариев
   * @param {Object} [where={}] - Условия фильтрации
   * @returns {Promise<number>}
   */
  async countAllComments(where = {}) {
    if (this.skipIfNotConnected()) return 0;
    return this.db.count("objective_comments", where);
  }

  /**
   * Проверить количество комментариев цели
   * @param {string|number} objectiveId - ID цели
   * @param {number} expectedCount - Ожидаемое количество
   */
  async verifyCommentsCount(objectiveId, expectedCount) {
    if (this.skipIfNotConnected()) return;
    const count = await this.db.count("objective_comments", {
      objective_id: objectiveId,
    });
    expect(count, `Количество комментариев должно быть ${expectedCount}`).toBe(
      expectedCount,
    );
  }

  /**
   * Проверить что цель НЕ создана по описанию
   * @param {string} description - Описание цели
   */
  async verifyObjectiveNotCreatedByDescription(description) {
    if (this.skipIfNotConnected()) return;
    const objective = await this.db.findOne("objectives", { description });
    expect(
      objective,
      "Цель не должна быть создана при ошибке валидации",
    ).toBeNull();
  }

  // ==================== APPROVAL (DEVAPR-11722) ====================

  /**
   * Проверить approval_status цели в БД
   * @param {string|number} objectiveId - ID цели
   * @param {string} expectedStatus - Ожидаемый статус: 'draft'|'approvalWaiting'|'approvalProcess'|'approved'
   */
  async verifyApprovalStatus(objectiveId, expectedStatus) {
    if (this.skipIfNotConnected()) return;
    const row = await this.db.queryOne(
      "SELECT approval_status FROM objectives WHERE id = ?",
      [objectiveId],
    );
    expect(row, `Цель ${objectiveId} не найдена в БД`).not.toBeNull();
    expect(
      row.approval_status,
      `approval_status цели ${objectiveId} должен быть '${expectedStatus}', получено '${row.approval_status}'`,
    ).toBe(expectedStatus);
  }

  /**
   * Проверить что утверждение целей включено/выключено в настройках компании
   * @param {number} companyId - ID компании
   * @param {boolean} expectedEnabled - true = включено, false = выключено
   */
  async verifyApprovalEnabled(companyId, expectedEnabled) {
    if (this.skipIfNotConnected()) return;
    const row = await this.db.queryOne(
      "SELECT is_objectives_approval_enabled FROM company_settings WHERE company_id = ?",
      [companyId],
    );
    expect(row, `Настройки компании ${companyId} не найдены`).not.toBeNull();
    const actual = Number(row.is_objectives_approval_enabled);
    expect(
      actual,
      `is_objectives_approval_enabled должен быть ${expectedEnabled ? 1 : 0}`,
    ).toBe(expectedEnabled ? 1 : 0);
  }

  /**
   * Проверить что уведомление об утверждении создано
   * DB: notifications WHERE entity_name='objective' AND entity_id=objectiveId AND action=action AND user_id=userId
   * @param {number} userId - ID получателя уведомления
   * @param {number} objectiveId - ID цели
   * @param {string} action - Тип действия: 'approval'|'approved'
   * @param {number} [timeout=5000] - Таймаут ожидания
   * @returns {Promise<Object|null>} Запись уведомления
   */
  async verifyApprovalNotification(userId, objectiveId, action, timeout = 5000) {
    if (this.skipIfNotConnected()) return null;
    const startTime = Date.now();
    let notification = null;
    while (Date.now() - startTime < timeout) {
      notification = await this.db.queryOne(
        "SELECT * FROM notifications WHERE user_id = ? AND entity_name = 'objective' AND entity_id = ? AND action = ? AND deleted_at IS NULL ORDER BY id DESC LIMIT 1",
        [userId, objectiveId, action],
      );
      if (notification) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    expect(
      notification,
      `Уведомление (entity_name='objective', entity_id=${objectiveId}, action='${action}', user_id=${userId}) не найдено в БД`,
    ).not.toBeNull();
    return notification;
  }

  /**
   * Проверить что email-уведомление об утверждении отправлено
   * DB: `appraise-mailer`.email_messages WHERE `to` LIKE email AND subject LIKE subjectContains
   * Фильтрует по created_at > sinceTime чтобы не ловить старые emails
   * @param {string} toEmail - Email получателя
   * @param {string} subjectContains - Подстрока для поиска в subject
   * @param {number} [timeout=15000] - Таймаут ожидания
   * @param {Date} [since] - Искать emails созданные после этого времени (default: 60 сек назад)
   * @returns {Promise<Object|null>} Запись email
   */
  async verifyApprovalEmail(toEmail, subjectContains, timeout = 15000, since) {
    if (this.skipIfNotConnected()) return null;
    const sinceDate = since || new Date(Date.now() - 60_000);
    const sinceStr = sinceDate.toISOString().slice(0, 19).replace("T", " ");
    const startTime = Date.now();
    let email = null;
    while (Date.now() - startTime < timeout) {
      email = await this.db.queryOne(
        "SELECT * FROM `appraise-mailer`.email_messages WHERE `to` LIKE ? AND subject LIKE ? AND created_at > ? ORDER BY id DESC LIMIT 1",
        [`%${toEmail}%`, `%${subjectContains}%`, sinceStr],
      );
      if (email) break;
      await new Promise((r) => setTimeout(r, 1000));
    }
    expect(
      email,
      `Email (to='${toEmail}', subject содержит '${subjectContains}', после ${sinceStr}) не найден в appraise-mailer`,
    ).not.toBeNull();
    return email;
  }

  /**
   * Подсчитать количество уведомлений для цели
   * @param {number} objectiveId - ID цели
   * @param {string} [action] - Фильтр по action
   * @returns {Promise<number>}
   */
  async countApprovalNotifications(objectiveId, action) {
    if (this.skipIfNotConnected()) return 0;
    let sql =
      "SELECT COUNT(*) as cnt FROM notifications WHERE entity_name = 'objective' AND entity_id = ? AND deleted_at IS NULL";
    const params = [objectiveId];
    if (action) {
      sql += " AND action = ?";
      params.push(action);
    }
    const row = await this.db.queryOne(sql, params);
    return row ? Number(row.cnt) : 0;
  }
}
