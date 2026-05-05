// tests/utils/db/verifiers/SurveyVerifier.js
// Верификатор для модуля опросов (Surveys)
// Адаптирован под структуру БД appraise

import { expect } from "@playwright/test";
import { BaseVerifier } from "./BaseVerifier.js";

/**
 * Верификатор для проверки данных опросов в БД
 *
 * Структура БД:
 * - surveys: основная таблица опросов
 * - survey_questions: вопросы
 * - survey_responses: ответы (через survey_revision_id)
 * - survey_revisions: ревизии опросов
 *
 * @example
 * const survey = await surveyVerifier.verifySurveyCreated(surveyId);
 * await surveyVerifier.verifySurveyStatus(surveyId, 'active');
 */
export class SurveyVerifier extends BaseVerifier {
  /**
   * Проверить что опрос создан в БД
   * @param {string|number} surveyId - ID опроса
   * @param {number} [timeout=5000] - Таймаут ожидания
   * @returns {Promise<Object|null>} Запись опроса или null если нет подключения
   */
  async verifySurveyCreated(surveyId, timeout = 5000) {
    if (this.skipIfNotConnected()) return null;
    const survey = await this.waitForRecord(
      "surveys",
      { id: surveyId },
      timeout,
    );
    expect(survey, `Опрос ${surveyId} не найден в БД`).not.toBeNull();
    return survey;
  }

  /**
   * Проверить статус опроса (с ожиданием для eventual consistency)
   * @param {string|number} surveyId - ID опроса
   * @param {string} expectedStatus - Ожидаемый статус ('template' | 'active' | 'complete' | 'draft')
   * @param {number} [timeout=5000] - Таймаут ожидания
   */
  async verifySurveyStatus(surveyId, expectedStatus, timeout = 5000) {
    if (this.skipIfNotConnected()) return;
    // Используем waitForFieldValue для eventual consistency
    const statusMatched = await this.waitForFieldValue(
      "surveys",
      { id: surveyId },
      "status",
      expectedStatus,
      timeout,
    );
    if (!statusMatched) {
      // Если таймаут истёк, читаем текущее значение для информативной ошибки
      const survey = await this.db.findOne("surveys", { id: surveyId });
      expect(survey, `Опрос ${surveyId} не найден`).not.toBeNull();
      expect(survey.status, `Статус опроса должен быть ${expectedStatus}`).toBe(
        expectedStatus,
      );
    }
  }

  /**
   * Проверить название опроса
   * @param {string|number} surveyId - ID опроса
   * @param {string} expectedTitle - Ожидаемое название
   */
  async verifySurveyTitle(surveyId, expectedTitle) {
    if (this.skipIfNotConnected()) return;
    const survey = await this.db.findOne("surveys", { id: surveyId });
    expect(survey, `Опрос ${surveyId} не найден`).not.toBeNull();
    expect(survey.title).toBe(expectedTitle);
  }

  /**
   * Проверить что название опроса содержит подстроку
   * @param {string|number} surveyId - ID опроса
   * @param {string} substring - Подстрока для поиска
   */
  async verifySurveyTitleContains(surveyId, substring) {
    if (this.skipIfNotConnected()) return;
    const survey = await this.db.findOne("surveys", { id: surveyId });
    expect(survey, `Опрос ${surveyId} не найден`).not.toBeNull();
    expect(survey.title).toContain(substring);
  }

  /**
   * Проверить количество вопросов в опросе (через survey_questions)
   * @param {string|number} surveyId - ID опроса
   * @param {number} expectedCount - Ожидаемое количество
   */
  async verifySurveyQuestionsCount(surveyId, expectedCount) {
    if (this.skipIfNotConnected()) return;
    // Вопросы привязаны к ревизии опроса
    const revision = await this.db.findOne("survey_revisions", {
      survey_id: surveyId,
    });
    if (!revision) {
      expect(expectedCount, "Нет ревизии опроса, ожидалось 0 вопросов").toBe(0);
      return;
    }

    const count = await this.db.count("survey_questions", {
      survey_revision_id: revision.id,
    });
    expect(count, `Количество вопросов должно быть ${expectedCount}`).toBe(
      expectedCount,
    );
  }

  /**
   * Проверить что опрос архивирован
   * @param {string|number} surveyId - ID опроса
   */
  async verifySurveyArchived(surveyId) {
    if (this.skipIfNotConnected()) return;
    const survey = await this.db.findOne("surveys", { id: surveyId });
    expect(survey, `Опрос ${surveyId} не найден`).not.toBeNull();
    expect(survey.is_archived, "Опрос должен быть архивирован").toBe(1);
  }

  /**
   * Проверить что опрос НЕ архивирован
   * @param {string|number} surveyId - ID опроса
   */
  async verifySurveyNotArchived(surveyId) {
    if (this.skipIfNotConnected()) return;
    const survey = await this.db.findOne("surveys", { id: surveyId });
    expect(survey, `Опрос ${surveyId} не найден`).not.toBeNull();
    expect(survey.is_archived, "Опрос не должен быть архивирован").toBe(0);
  }

  /**
   * Проверить что опрос удалён (soft delete)
   * @param {string|number} surveyId - ID опроса
   */
  async verifySurveyDeleted(surveyId) {
    if (this.skipIfNotConnected()) return;
    const survey = await this.db.findOne("surveys", { id: surveyId });
    expect(survey, `Опрос ${surveyId} не найден`).not.toBeNull();
    expect(survey.deleted_at, "Опрос должен быть удалён").not.toBeNull();
  }

  /**
   * Проверить что опрос НЕ удалён
   * @param {string|number} surveyId - ID опроса
   */
  async verifySurveyNotDeleted(surveyId) {
    if (this.skipIfNotConnected()) return;
    const survey = await this.db.findOne("surveys", { id: surveyId });
    expect(survey, `Опрос ${surveyId} не найден`).not.toBeNull();
    // deleted_at может быть null или undefined в зависимости от драйвера БД
    expect(survey.deleted_at == null, "Опрос не должен быть удалён").toBe(true);
  }

  /**
   * Проверить количество ответов на опрос
   * @param {string|number} surveyId - ID опроса
   * @param {number} expectedCount - Ожидаемое количество
   */
  async verifySurveyResponsesCount(surveyId, expectedCount) {
    if (this.skipIfNotConnected()) return;
    // Ответы привязаны к ревизии
    const revision = await this.db.findOne("survey_revisions", {
      survey_id: surveyId,
    });
    if (!revision) {
      expect(expectedCount, "Нет ревизии опроса, ожидалось 0 ответов").toBe(0);
      return;
    }

    const count = await this.db.count("survey_responses", {
      survey_revision_id: revision.id,
    });
    expect(count, `Количество ответов должно быть ${expectedCount}`).toBe(
      expectedCount,
    );
  }

  /**
   * Проверить что опрос принадлежит компании
   * @param {string|number} surveyId - ID опроса
   * @param {string|number} companyId - ID компании
   */
  async verifySurveyCompany(surveyId, companyId) {
    if (this.skipIfNotConnected()) return;
    const survey = await this.db.findOne("surveys", { id: surveyId });
    expect(survey, `Опрос ${surveyId} не найден`).not.toBeNull();
    expect(survey.owner_company_id).toBe(companyId);
  }

  /**
   * Проверить тип опроса (анонимный/именной)
   * @param {string|number} surveyId - ID опроса
   * @param {boolean} isAnonymous - Ожидаемое значение
   */
  async verifySurveyAnonymous(surveyId, isAnonymous) {
    if (this.skipIfNotConnected()) return;
    const survey = await this.db.findOne("surveys", { id: surveyId });
    expect(survey, `Опрос ${surveyId} не найден`).not.toBeNull();
    expect(Boolean(survey.is_anonim)).toBe(isAnonymous);
  }

  /**
   * Проверить тип публичности опроса
   * @param {string|number} surveyId - ID опроса
   * @param {string} expectedType - 'internal' | 'external'
   */
  async verifySurveyPublicityType(surveyId, expectedType) {
    if (this.skipIfNotConnected()) return;
    const survey = await this.db.findOne("surveys", { id: surveyId });
    expect(survey, `Опрос ${surveyId} не найден`).not.toBeNull();
    expect(survey.publicity_type).toBe(expectedType);
  }

  /**
   * Получить опрос по ID
   * @param {string|number} surveyId - ID опроса
   * @returns {Promise<Object|null>}
   */
  async getSurvey(surveyId) {
    if (this.skipIfNotConnected()) return null;
    return this.db.findOne("surveys", { id: surveyId });
  }

  /**
   * Получить все опросы компании
   * @param {string|number} companyId - ID компании
   * @param {Object} [options] - Опции (limit, orderBy)
   * @returns {Promise<Array>}
   */
  async getCompanySurveys(companyId, options = {}) {
    if (this.skipIfNotConnected()) return [];
    return this.db.findAll("surveys", { owner_company_id: companyId }, options);
  }

  /**
   * Получить ревизию опроса
   * @param {string|number} surveyId - ID опроса
   * @returns {Promise<Object|null>}
   */
  async getSurveyRevision(surveyId) {
    if (this.skipIfNotConnected()) return null;
    return this.db.findOne("survey_revisions", { survey_id: surveyId });
  }

  /**
   * Получить все ответы на опрос
   * @param {string|number} surveyId - ID опроса
   * @returns {Promise<Array>}
   */
  async getSurveyResponses(surveyId) {
    if (this.skipIfNotConnected()) return [];
    const revision = await this.getSurveyRevision(surveyId);
    if (!revision) return [];
    return this.db.findAll("survey_responses", {
      survey_revision_id: revision.id,
    });
  }

  // ==================== REMINDS ====================

  /**
   * Проверить что напоминание создано в БД
   * @param {string|number} remindId - ID напоминания
   * @param {number} [timeout=5000] - Таймаут ожидания
   * @returns {Promise<Object|null>} Запись напоминания или null если нет подключения
   */
  async verifyRemindCreated(remindId, timeout = 5000) {
    if (this.skipIfNotConnected()) return null;
    const remind = await this.waitForRecord(
      "survey_reminds",
      { id: remindId },
      timeout,
    );
    expect(remind, `Напоминание ${remindId} не найдено в БД`).not.toBeNull();
    return remind;
  }

  /**
   * Проверить название напоминания
   * @param {string|number} remindId - ID напоминания
   * @param {string} expectedTitle - Ожидаемое название
   */
  async verifyRemindTitle(remindId, expectedTitle) {
    if (this.skipIfNotConnected()) return;
    const remind = await this.db.findOne("survey_reminds", { id: remindId });
    expect(remind, `Напоминание ${remindId} не найдено`).not.toBeNull();
    expect(
      remind.title,
      `Название напоминания должно быть "${expectedTitle}"`,
    ).toBe(expectedTitle);
  }

  /**
   * Проверить что название напоминания содержит подстроку
   * @param {string|number} remindId - ID напоминания
   * @param {string} substring - Подстрока для поиска
   */
  async verifyRemindTitleContains(remindId, substring) {
    if (this.skipIfNotConnected()) return;
    const remind = await this.db.findOne("survey_reminds", { id: remindId });
    expect(remind, `Напоминание ${remindId} не найдено`).not.toBeNull();
    expect(
      remind.title,
      `Название напоминания должно содержать "${substring}"`,
    ).toContain(substring);
  }

  /**
   * Проверить что напоминание удалено (soft delete)
   * @param {string|number} remindId - ID напоминания
   */
  async verifyRemindDeleted(remindId) {
    if (this.skipIfNotConnected()) return;
    const remind = await this.db.findOne("survey_reminds", { id: remindId });
    // Напоминание либо физически удалено, либо soft delete
    if (remind) {
      expect(
        remind.deleted_at,
        "Напоминание должно быть помечено как удалённое",
      ).not.toBeNull();
    }
    // Если remind === null, значит физически удалено - тоже OK
  }

  /**
   * Проверить что напоминание НЕ удалено
   * @param {string|number} remindId - ID напоминания
   */
  async verifyRemindNotDeleted(remindId) {
    if (this.skipIfNotConnected()) return;
    const remind = await this.db.findOne("survey_reminds", { id: remindId });
    expect(remind, `Напоминание ${remindId} не найдено`).not.toBeNull();
    // deleted_at может быть null или undefined
    expect(
      remind.deleted_at == null,
      "Напоминание не должно быть удалено",
    ).toBe(true);
  }

  /**
   * Проверить что напоминание НЕ существует в БД
   * @param {string|number} remindId - ID напоминания
   */
  async verifyRemindNotExists(remindId) {
    if (this.skipIfNotConnected()) return;
    const remind = await this.db.findOne("survey_reminds", { id: remindId });
    expect(
      remind,
      `Напоминание ${remindId} не должно существовать в БД`,
    ).toBeNull();
  }

  /**
   * Получить напоминание по ID
   * @param {string|number} remindId - ID напоминания
   * @returns {Promise<Object|null>}
   */
  async getRemind(remindId) {
    if (this.skipIfNotConnected()) return null;
    return this.db.findOne("survey_reminds", { id: remindId });
  }

  /**
   * Получить все напоминания ревизии опроса
   * @param {string|number} revisionId - ID ревизии
   * @returns {Promise<Array>}
   */
  async getRevisionReminds(revisionId) {
    if (this.skipIfNotConnected()) return [];
    return this.db.findAll("survey_reminds", {
      survey_revision_id: revisionId,
    });
  }

  /**
   * Подсчитать количество напоминаний ревизии
   * @param {string|number} revisionId - ID ревизии
   * @returns {Promise<number>}
   */
  async countRevisionReminds(revisionId) {
    if (this.skipIfNotConnected()) return 0;
    return this.db.count("survey_reminds", {
      survey_revision_id: revisionId,
      deleted_at: null,
    });
  }

  /**
   * Проверить что опрос НЕ существует в БД
   * @param {string|number} surveyId - ID опроса
   */
  async verifySurveyNotExists(surveyId) {
    if (this.skipIfNotConnected()) return;
    const survey = await this.db.findOne("surveys", { id: surveyId });
    expect(survey, `Опрос ${surveyId} не должен существовать в БД`).toBeNull();
  }
}
