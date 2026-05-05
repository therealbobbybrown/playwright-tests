// tests/utils/db/verifiers/DevelopmentPlanVerifier.js
// Верификатор для модуля планов развития (Development Plans)

import { expect } from "@playwright/test";
import { BaseVerifier } from "./BaseVerifier.js";

/**
 * Верификатор для проверки данных планов развития в БД
 *
 * Структура БД:
 * - development_plans: основная таблица планов
 * - development_actions: действия/задачи в плане
 * - development_plan_templates: шаблоны планов
 *
 * @example
 * const plan = await dpVerifier.verifyPlanCreated(planId);
 * await dpVerifier.verifyPlanStatus(planId, 'active');
 */
export class DevelopmentPlanVerifier extends BaseVerifier {
  /**
   * Проверить что план создан в БД
   * @param {string|number} planId - ID плана
   * @param {number} [timeout=5000] - Таймаут ожидания
   * @returns {Promise<Object|null>} Запись плана или null если нет подключения
   */
  async verifyPlanCreated(planId, timeout = 5000) {
    if (this.skipIfNotConnected()) return null;
    const plan = await this.waitForRecord(
      "development_plans",
      { id: planId },
      timeout,
    );
    expect(plan, `План развития ${planId} не найден в БД`).not.toBeNull();
    return plan;
  }

  /**
   * Проверить статус плана
   * @param {string|number} planId - ID плана
   * @param {string} expectedStatus - Ожидаемый статус ('draft' | 'active' | 'completed' | 'cancelled')
   */
  async verifyPlanStatus(planId, expectedStatus) {
    if (this.skipIfNotConnected()) return;
    const plan = await this.db.findOne("development_plans", { id: planId });
    expect(plan, `План ${planId} не найден`).not.toBeNull();
    expect(plan.status, `Статус плана должен быть ${expectedStatus}`).toBe(
      expectedStatus,
    );
  }

  /**
   * Проверить название плана
   * @param {string|number} planId - ID плана
   * @param {string} expectedTitle - Ожидаемое название
   */
  async verifyPlanTitle(planId, expectedTitle) {
    if (this.skipIfNotConnected()) return;
    const plan = await this.db.findOne("development_plans", { id: planId });
    expect(plan, `План ${planId} не найден`).not.toBeNull();
    expect(plan.title).toBe(expectedTitle);
  }

  /**
   * Проверить что название плана содержит подстроку
   * @param {string|number} planId - ID плана
   * @param {string} expectedSubstring - Ожидаемая подстрока в названии
   */
  async verifyPlanTitleContains(planId, expectedSubstring) {
    if (this.skipIfNotConnected()) return;
    const plan = await this.db.findOne("development_plans", { id: planId });
    expect(plan, `План ${planId} не найден`).not.toBeNull();
    expect(
      plan.title,
      `Название плана должно содержать "${expectedSubstring}"`,
    ).toContain(expectedSubstring);
  }

  /**
   * Проверить владельца плана
   * @param {string|number} planId - ID плана
   * @param {string|number} userId - ID пользователя
   */
  async verifyPlanOwner(planId, userId) {
    if (this.skipIfNotConnected()) return;
    const plan = await this.db.findOne("development_plans", { id: planId });
    expect(plan, `План ${planId} не найден`).not.toBeNull();
    expect(plan.responsible_user_id, "Владелец плана").toBe(userId);
  }

  /**
   * Проверить прогресс плана
   * @param {string|number} planId - ID плана
   * @param {number} expectedProgress - Ожидаемый прогресс (0-100)
   */
  async verifyPlanProgress(planId, expectedProgress) {
    if (this.skipIfNotConnected()) return;
    const plan = await this.db.findOne("development_plans", { id: planId });
    expect(plan, `План ${planId} не найден`).not.toBeNull();
    expect(Number(plan.progress)).toBe(expectedProgress);
  }

  /**
   * Проверить что план удалён (soft delete)
   * @param {string|number} planId - ID плана
   */
  async verifyPlanDeleted(planId) {
    if (this.skipIfNotConnected()) return;
    const plan = await this.db.findOne("development_plans", { id: planId });
    expect(plan, `План ${planId} не найден`).not.toBeNull();
    expect(plan.deleted_at, "План должен быть удалён").not.toBeNull();
  }

  /**
   * Проверить что план НЕ удалён
   * @param {string|number} planId - ID плана
   */
  async verifyPlanNotDeleted(planId) {
    if (this.skipIfNotConnected()) return;
    const plan = await this.db.findOne("development_plans", { id: planId });
    expect(plan, `План ${planId} не найден`).not.toBeNull();
    expect(plan.deleted_at, "План не должен быть удалён").toBeNull();
  }

  /**
   * Проверить количество действий в плане
   * @param {string|number} planId - ID плана
   * @param {number} expectedCount - Ожидаемое количество
   */
  async verifyActionsCount(planId, expectedCount) {
    if (this.skipIfNotConnected()) return;
    const count = await this.db.count("development_actions", {
      plan_id: planId,
    });
    expect(count, `Количество действий должно быть ${expectedCount}`).toBe(
      expectedCount,
    );
  }

  /**
   * Проверить создание действия
   * @param {string|number} actionId - ID действия
   * @param {number} [timeout=5000] - Таймаут
   * @returns {Promise<Object|null>}
   */
  async verifyActionCreated(actionId, timeout = 5000) {
    if (this.skipIfNotConnected()) return null;
    const action = await this.waitForRecord(
      "development_actions",
      { id: actionId },
      timeout,
    );
    expect(action, `Действие ${actionId} не найдено в БД`).not.toBeNull();
    return action;
  }

  /**
   * Проверить статус действия
   * @param {string|number} actionId - ID действия
   * @param {string} expectedStatus - 'todo' | 'in_progress' | 'done'
   */
  async verifyActionStatus(actionId, expectedStatus) {
    if (this.skipIfNotConnected()) return;
    const action = await this.db.findOne("development_actions", {
      id: actionId,
    });
    expect(action, `Действие ${actionId} не найдено`).not.toBeNull();
    expect(action.status, `Статус действия должен быть ${expectedStatus}`).toBe(
      expectedStatus,
    );
  }

  /**
   * Проверить что действие удалено (soft delete)
   * @param {string|number} actionId - ID действия
   */
  async verifyActionDeleted(actionId) {
    if (this.skipIfNotConnected()) return;
    const action = await this.db.findOne("development_actions", {
      id: actionId,
    });
    // Действие либо физически удалено, либо soft delete
    if (action) {
      expect(
        action.deleted_at,
        "Действие должно быть помечено как удалённое",
      ).not.toBeNull();
    }
    // Если action === null, значит физически удалено - тоже OK
  }

  /**
   * Проверить что действие НЕ существует в БД (не создано)
   * @param {string|number} actionId - ID действия
   */
  async verifyActionNotExists(actionId) {
    if (this.skipIfNotConnected()) return;
    const action = await this.db.findOne("development_actions", {
      id: actionId,
    });
    expect(
      action,
      `Действие ${actionId} не должно существовать в БД`,
    ).toBeNull();
  }

  /**
   * Проверить название действия
   * @param {string|number} actionId - ID действия
   * @param {string} expectedTitle - Ожидаемое название
   */
  async verifyActionTitle(actionId, expectedTitle) {
    if (this.skipIfNotConnected()) return;
    const action = await this.db.findOne("development_actions", {
      id: actionId,
    });
    expect(action, `Действие ${actionId} не найдено`).not.toBeNull();
    expect(
      action.title,
      `Название действия должно быть "${expectedTitle}"`,
    ).toBe(expectedTitle);
  }

  /**
   * Получить действие по ID
   * @param {string|number} actionId - ID действия
   * @returns {Promise<Object|null>}
   */
  async getAction(actionId) {
    if (this.skipIfNotConnected()) return null;
    return this.db.findOne("development_actions", { id: actionId });
  }

  /**
   * Получить план по ID
   * @param {string|number} planId - ID плана
   * @returns {Promise<Object|null>}
   */
  async getPlan(planId) {
    if (this.skipIfNotConnected()) return null;
    return this.db.findOne("development_plans", { id: planId });
  }

  /**
   * Получить все планы пользователя
   * @param {string|number} userId - ID пользователя
   * @param {Object} [options] - Опции (limit, orderBy)
   * @returns {Promise<Array>}
   */
  async getUserPlans(userId, options = {}) {
    if (this.skipIfNotConnected()) return [];
    return this.db.findAll(
      "development_plans",
      { responsible_user_id: userId, deleted_at: null },
      options,
    );
  }

  /**
   * Получить действия плана
   * @param {string|number} planId - ID плана
   * @returns {Promise<Array>}
   */
  async getPlanActions(planId) {
    if (this.skipIfNotConnected()) return [];
    return this.db.findAll("development_actions", { plan_id: planId });
  }

  // ==================== TEMPLATES ====================

  /**
   * Проверить что шаблон создан в БД
   * @param {string|number} templateId - ID шаблона
   * @param {number} [timeout=5000] - Таймаут ожидания
   * @returns {Promise<Object|null>}
   */
  async verifyTemplateCreated(templateId, timeout = 5000) {
    if (this.skipIfNotConnected()) return null;
    const template = await this.waitForRecord(
      "development_plan_templates",
      { id: templateId },
      timeout,
    );
    expect(template, `Шаблон ${templateId} не найден в БД`).not.toBeNull();
    return template;
  }

  /**
   * Проверить название шаблона
   * @param {string|number} templateId - ID шаблона
   * @param {string} expectedTitle - Ожидаемое название
   */
  async verifyTemplateTitle(templateId, expectedTitle) {
    if (this.skipIfNotConnected()) return;
    const template = await this.db.findOne("development_plan_templates", {
      id: templateId,
    });
    expect(template, `Шаблон ${templateId} не найден`).not.toBeNull();
    expect(
      template.title,
      `Название шаблона должно быть "${expectedTitle}"`,
    ).toBe(expectedTitle);
  }

  /**
   * Проверить что шаблон удалён (soft delete)
   * @param {string|number} templateId - ID шаблона
   */
  async verifyTemplateDeleted(templateId) {
    if (this.skipIfNotConnected()) return;
    const template = await this.db.findOne("development_plan_templates", {
      id: templateId,
    });
    // Шаблон либо физически удалён, либо soft delete
    if (template) {
      expect(
        template.deleted_at,
        "Шаблон должен быть помечен как удалённый",
      ).not.toBeNull();
    }
    // Если template === null, значит физически удалён - тоже OK
  }

  /**
   * Проверить что шаблон НЕ существует в БД
   * @param {string|number} templateId - ID шаблона
   */
  async verifyTemplateNotExists(templateId) {
    if (this.skipIfNotConnected()) return;
    const template = await this.db.findOne("development_plan_templates", {
      id: templateId,
    });
    expect(
      template,
      `Шаблон ${templateId} не должен существовать в БД`,
    ).toBeNull();
  }

  /**
   * Получить шаблон по ID
   * @param {string|number} templateId - ID шаблона
   * @returns {Promise<Object|null>}
   */
  async getTemplate(templateId) {
    if (this.skipIfNotConnected()) return null;
    return this.db.findOne("development_plan_templates", { id: templateId });
  }

  /**
   * Проверить что план НЕ создан по названию
   * @param {string} title - Название плана
   */
  async verifyPlanNotCreatedByTitle(title) {
    if (this.skipIfNotConnected()) return;
    const plan = await this.db.findOne("development_plans", { title });
    expect(plan, "План не должен быть создан при ошибке валидации").toBeNull();
  }

  /**
   * Проверить что действие удалено или не существует
   * @param {string|number} actionId - ID действия
   */
  async verifyActionDeletedOrNotExists(actionId) {
    if (this.skipIfNotConnected()) return;
    const action = await this.db.findOne("development_actions", {
      id: actionId,
    });
    // Либо записи нет, либо она помечена как удалённая
    if (action) {
      expect(
        action.deleted_at,
        "Действие должно быть помечено как удалённое",
      ).not.toBeNull();
    }
    // Если action === null, значит физически удалено - тоже OK
  }
}
