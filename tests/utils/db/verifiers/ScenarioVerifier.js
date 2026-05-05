// tests/utils/db/verifiers/ScenarioVerifier.js
// Верификатор для модуля сценариев (Scenarios / Workflows)

import { expect } from "@playwright/test";
import { BaseVerifier } from "./BaseVerifier.js";

/**
 * Верификатор для проверки данных сценариев в БД
 *
 * Структура БД:
 * - scenarios: основная таблица сценариев
 * - scenario_actions: действия в сценарии
 * - scenario_performers: участники сценария
 *
 * @example
 * const scenario = await scenarioVerifier.verifyScenarioCreated(scenarioId);
 * await scenarioVerifier.verifyScenarioStatus(scenarioId, 'active');
 */
export class ScenarioVerifier extends BaseVerifier {
  /**
   * Проверить что сценарий создан в БД
   * @param {string|number} scenarioId - ID сценария
   * @param {number} [timeout=5000] - Таймаут ожидания
   * @returns {Promise<Object|null>} Запись сценария или null если нет подключения
   */
  async verifyScenarioCreated(scenarioId, timeout = 5000) {
    if (this.skipIfNotConnected()) return null;
    const scenario = await this.waitForRecord(
      "scenarios",
      { id: scenarioId },
      timeout,
    );
    expect(scenario, `Сценарий ${scenarioId} не найден в БД`).not.toBeNull();
    return scenario;
  }

  /**
   * Проверить статус сценария (с ожиданием для eventual consistency)
   * @param {string|number} scenarioId - ID сценария
   * @param {string} expectedStatus - Ожидаемый статус ('draft' | 'active' | 'archive' | 'delete')
   * @param {number} [timeout=5000] - Таймаут ожидания
   */
  async verifyScenarioStatus(scenarioId, expectedStatus, timeout = 5000) {
    if (this.skipIfNotConnected()) return;
    const statusMatched = await this.waitForFieldValue(
      "scenarios",
      { id: scenarioId },
      "status",
      expectedStatus,
      timeout,
    );
    if (!statusMatched) {
      const scenario = await this.db.findOne("scenarios", { id: scenarioId });
      expect(scenario, `Сценарий ${scenarioId} не найден`).not.toBeNull();
      expect(
        scenario.status,
        `Статус сценария должен быть ${expectedStatus}`,
      ).toBe(expectedStatus);
    }
  }

  /**
   * Проверить название сценария
   * @param {string|number} scenarioId - ID сценария
   * @param {string} expectedTitle - Ожидаемое название
   */
  async verifyScenarioTitle(scenarioId, expectedTitle) {
    if (this.skipIfNotConnected()) return;
    const scenario = await this.db.findOne("scenarios", { id: scenarioId });
    expect(scenario, `Сценарий ${scenarioId} не найден`).not.toBeNull();
    expect(scenario.title).toBe(expectedTitle);
  }

  /**
   * Проверить описание сценария
   * @param {string|number} scenarioId - ID сценария
   * @param {string} expectedDescription - Ожидаемое описание
   */
  async verifyScenarioDescription(scenarioId, expectedDescription) {
    if (this.skipIfNotConnected()) return;
    const scenario = await this.db.findOne("scenarios", { id: scenarioId });
    expect(scenario, `Сценарий ${scenarioId} не найден`).not.toBeNull();
    expect(scenario.description).toBe(expectedDescription);
  }

  /**
   * Проверить количество действий в сценарии
   * @param {string|number} scenarioId - ID сценария
   * @param {number} expectedCount - Ожидаемое количество
   */
  async verifyActionsCount(scenarioId, expectedCount) {
    if (this.skipIfNotConnected()) return;
    // Таблица может называться scenario_actions или scenarioActions
    let actions;
    try {
      actions = await this.db.findMany("scenario_actions", {
        scenario_id: scenarioId,
      });
    } catch {
      // Попробуем другое имя столбца
      actions = await this.db.findMany("scenario_actions", {
        scenarioId: scenarioId,
      });
    }
    expect(actions.length, `Количество actions в сценарии ${scenarioId}`).toBe(
      expectedCount,
    );
  }

  /**
   * Проверить что участник добавлен в сценарий
   * @param {string|number} scenarioId - ID сценария
   * @param {string|number} userId - ID пользователя
   * @param {number} [timeout=5000] - Таймаут ожидания
   * @returns {Promise<Object|null>} Запись участника или null
   */
  async verifyPerformerAdded(scenarioId, userId, timeout = 5000) {
    if (this.skipIfNotConnected()) return null;
    // Таблица может иметь разные имена столбцов
    let performer;
    try {
      performer = await this.waitForRecord(
        "scenario_performers",
        { scenario_id: scenarioId, user_id: userId },
        timeout,
      );
    } catch {
      performer = await this.waitForRecord(
        "scenario_performers",
        { scenarioId: scenarioId, userId: userId },
        timeout,
      );
    }
    expect(
      performer,
      `Участник ${userId} не найден в сценарии ${scenarioId}`,
    ).not.toBeNull();
    return performer;
  }

  /**
   * Проверить количество участников в сценарии
   * @param {string|number} scenarioId - ID сценария
   * @param {number} expectedCount - Ожидаемое количество
   */
  async verifyPerformersCount(scenarioId, expectedCount) {
    if (this.skipIfNotConnected()) return;
    let performers;
    try {
      performers = await this.db.findMany("scenario_performers", {
        scenario_id: scenarioId,
      });
    } catch {
      performers = await this.db.findMany("scenario_performers", {
        scenarioId: scenarioId,
      });
    }
    expect(
      performers.length,
      `Количество участников в сценарии ${scenarioId}`,
    ).toBe(expectedCount);
  }

  /**
   * Проверить что сценарий принадлежит компании
   * @param {string|number} scenarioId - ID сценария
   * @param {string|number} companyId - ID компании
   */
  async verifyScenarioCompany(scenarioId, companyId) {
    if (this.skipIfNotConnected()) return;
    const scenario = await this.db.findOne("scenarios", { id: scenarioId });
    expect(scenario, `Сценарий ${scenarioId} не найден`).not.toBeNull();
    expect(
      scenario.company_id || scenario.companyId,
      "Company ID должен совпадать",
    ).toBe(companyId);
  }

  /**
   * Проверить что сценарий удалён (статус delete или запись отсутствует)
   * @param {string|number} scenarioId - ID сценария
   */
  async verifyScenarioDeleted(scenarioId) {
    if (this.skipIfNotConnected()) return;
    const scenario = await this.db.findOne("scenarios", { id: scenarioId });

    if (scenario) {
      // Soft delete - статус должен быть 'delete'
      expect(scenario.status, "Сценарий должен быть в статусе delete").toBe(
        "delete",
      );
    }
    // Если записи нет - это тоже ОК (hard delete)
  }

  /**
   * Получить сценарий напрямую из БД (без assertions)
   * @param {string|number} scenarioId - ID сценария
   * @returns {Promise<Object|null>}
   */
  async getScenario(scenarioId) {
    if (this.skipIfNotConnected()) return null;
    return this.db.findOne("scenarios", { id: scenarioId });
  }

  /**
   * Получить все действия сценария
   * @param {string|number} scenarioId - ID сценария
   * @returns {Promise<Array>}
   */
  async getActions(scenarioId) {
    if (this.skipIfNotConnected()) return [];
    try {
      return await this.db.findMany("scenario_actions", {
        scenario_id: scenarioId,
      });
    } catch {
      return await this.db.findMany("scenario_actions", {
        scenarioId: scenarioId,
      });
    }
  }

  /**
   * Получить всех участников сценария
   * @param {string|number} scenarioId - ID сценария
   * @returns {Promise<Array>}
   */
  async getPerformers(scenarioId) {
    if (this.skipIfNotConnected()) return [];
    try {
      return await this.db.findMany("scenario_performers", {
        scenario_id: scenarioId,
      });
    } catch {
      return await this.db.findMany("scenario_performers", {
        scenarioId: scenarioId,
      });
    }
  }
}
