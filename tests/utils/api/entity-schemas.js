// tests/utils/api/entity-schemas.js
// Схемы валидации для основных сущностей API
// TASK-071: Стандартизация assertions

import { expect } from "@playwright/test";
import {
  assertHasRequiredProperties,
  assertValidArray,
  assertEntityHasId,
  assertValidDateString,
  extractItems,
} from "./common-assertions.js";

// ============================================================================
// ENTITY FIELD DEFINITIONS
// ============================================================================

/**
 * Обязательные поля для основных сущностей
 */
export const REQUIRED_FIELDS = {
  // Auth & Users
  USER: ["id", "email"],
  USER_PROFILE: ["id", "firstName", "lastName"],
  AUTH_TOKEN: ["token"],

  // Feedback
  FEEDBACK: ["id", "body"],
  FEEDBACK_TYPE: ["id", "title"],
  FEEDBACK_COMMENT: ["id", "text"],

  // Objectives (OKR)
  OBJECTIVE: ["id", "title"],
  MILESTONE: ["id", "title"],
  OBJECTIVE_COMMENT: ["id", "text"],

  // Performance Review
  PERFORMANCE_REVIEW: ["id", "title"],
  PR_REVISION: ["id"],
  PR_QUESTIONNAIRE: ["id"],
  PR_RESPONSE: ["id"],

  // Surveys
  SURVEY: ["id", "title"],
  SURVEY_QUESTION: ["id", "title"],
  SURVEY_RESPONSE: ["id"],

  // Development Plans
  DEVELOPMENT_PLAN: ["id", "title"],
  DEVELOPMENT_GOAL: ["id", "title"],
  DEVELOPMENT_ACTION: ["id", "title"],
  DEVELOPMENT_TEMPLATE: ["id", "title"],

  // Org Structure
  DEPARTMENT: ["id", "title"],
  GROUP: ["id", "title"],
  POSITION: ["id", "title"],

  // Competencies
  COMPETENCY: ["id", "title"],
  COMPETENCY_GROUP: ["id", "title"],
  COMPETENCY_SCALE: ["id", "title"],

  // Karma
  KARMA_TRANSACTION: ["id", "amount"],
  KARMA_BALANCE: ["userId", "balance"],

  // Notifications
  NOTIFICATION: ["id", "type"],
};

/**
 * Опциональные поля (для полной валидации)
 */
export const OPTIONAL_FIELDS = {
  USER: ["firstName", "lastName", "position", "department", "avatar"],
  FEEDBACK: ["authorUserId", "recipientUserId", "type", "createdAt"],
  OBJECTIVE: [
    "description",
    "status",
    "progress",
    "periodYear",
    "periodQuarter",
  ],
  PERFORMANCE_REVIEW: ["status", "startDate", "endDate", "description"],
  SURVEY: ["status", "description", "startDate", "endDate"],
  DEVELOPMENT_PLAN: [
    "status",
    "description",
    "responsibleUserId",
    "curatorUserId",
  ],
};

// ============================================================================
// ENTITY VALIDATORS
// ============================================================================

/**
 * Валидатор сущности User
 * @param {Object} user - Объект пользователя
 * @param {Object} [options] - Опции валидации
 * @param {boolean} [options.full=false] - Полная валидация
 */
export function validateUser(user, options = {}) {
  const { full = false } = options;

  assertEntityHasId(user, "User");
  assertHasRequiredProperties(user, REQUIRED_FIELDS.USER, "User");

  if (full) {
    // Проверка email формата
    if (user.email) {
      expect(
        user.email.includes("@"),
        `User email должен быть валидным: ${user.email}`,
      ).toBe(true);
    }
  }
}

/**
 * Валидатор сущности Feedback
 * @param {Object} feedback - Объект благодарности
 * @param {Object} [options] - Опции валидации
 */
export function validateFeedback(feedback, options = {}) {
  const { full = false } = options;

  assertEntityHasId(feedback, "Feedback");
  assertHasRequiredProperties(feedback, REQUIRED_FIELDS.FEEDBACK, "Feedback");

  if (full && feedback.createdAt) {
    assertValidDateString(feedback.createdAt, "Feedback.createdAt");
  }
}

/**
 * Валидатор сущности Objective
 * @param {Object} objective - Объект цели
 * @param {Object} [options] - Опции валидации
 */
export function validateObjective(objective, options = {}) {
  const { full = false, checkMilestones = false } = options;

  assertEntityHasId(objective, "Objective");
  assertHasRequiredProperties(
    objective,
    REQUIRED_FIELDS.OBJECTIVE,
    "Objective",
  );

  if (full) {
    // Проверка статуса
    if (objective.status) {
      const validStatuses = [
        "draft",
        "active",
        "completed",
        "archived",
        "cancelled",
      ];
      expect(
        validStatuses,
        `Objective status должен быть одним из: ${validStatuses.join(", ")}`,
      ).toContain(objective.status);
    }

    // Проверка прогресса
    if (objective.progress !== undefined) {
      expect(objective.progress).toBeGreaterThanOrEqual(0);
      expect(objective.progress).toBeLessThanOrEqual(100);
    }
  }

  if (checkMilestones && objective.milestones) {
    assertValidArray(
      objective.milestones,
      0,
      "Objective milestones должен быть массивом",
    );
    objective.milestones.forEach((m, i) => {
      assertHasRequiredProperties(
        m,
        REQUIRED_FIELDS.MILESTONE,
        `Milestone[${i}]`,
      );
    });
  }
}

/**
 * Валидатор сущности PerformanceReview
 * @param {Object} pr - Объект Performance Review
 * @param {Object} [options] - Опции валидации
 */
export function validatePerformanceReview(pr, options = {}) {
  const { full = false } = options;

  assertEntityHasId(pr, "PerformanceReview");
  assertHasRequiredProperties(
    pr,
    REQUIRED_FIELDS.PERFORMANCE_REVIEW,
    "PerformanceReview",
  );

  if (full) {
    // Проверка статуса
    if (pr.status) {
      const validStatuses = ["draft", "active", "completed", "archived"];
      expect(
        validStatuses,
        `PR status должен быть одним из: ${validStatuses.join(", ")}`,
      ).toContain(pr.status);
    }

    // Проверка дат
    if (pr.startDate) {
      assertValidDateString(pr.startDate, "PR.startDate");
    }
    if (pr.endDate) {
      assertValidDateString(pr.endDate, "PR.endDate");
    }
  }
}

/**
 * Валидатор сущности Survey
 * @param {Object} survey - Объект опроса
 * @param {Object} [options] - Опции валидации
 */
export function validateSurvey(survey, options = {}) {
  const { full = false, checkQuestions = false } = options;

  assertEntityHasId(survey, "Survey");
  assertHasRequiredProperties(survey, REQUIRED_FIELDS.SURVEY, "Survey");

  if (full) {
    if (survey.status) {
      const validStatuses = ["draft", "active", "completed", "archived"];
      expect(
        validStatuses,
        `Survey status должен быть одним из: ${validStatuses.join(", ")}`,
      ).toContain(survey.status);
    }
  }

  if (checkQuestions && survey.questions) {
    assertValidArray(
      survey.questions,
      0,
      "Survey questions должен быть массивом",
    );
  }
}

/**
 * Валидатор сущности DevelopmentPlan
 * @param {Object} plan - Объект плана развития
 * @param {Object} [options] - Опции валидации
 */
export function validateDevelopmentPlan(plan, options = {}) {
  const { full = false, checkGoals = false } = options;

  assertEntityHasId(plan, "DevelopmentPlan");
  assertHasRequiredProperties(
    plan,
    REQUIRED_FIELDS.DEVELOPMENT_PLAN,
    "DevelopmentPlan",
  );

  if (full) {
    if (plan.status) {
      const validStatuses = [
        "draft",
        "active",
        "completed",
        "archived",
        "approved",
      ];
      expect(
        validStatuses,
        `Plan status должен быть одним из: ${validStatuses.join(", ")}`,
      ).toContain(plan.status);
    }
  }

  if (checkGoals && plan.goals) {
    assertValidArray(plan.goals, 0, "Plan goals должен быть массивом");
  }
}

/**
 * Валидатор сущности Department
 * @param {Object} department - Объект департамента
 */
export function validateDepartment(department) {
  assertEntityHasId(department, "Department");
  assertHasRequiredProperties(
    department,
    REQUIRED_FIELDS.DEPARTMENT,
    "Department",
  );
}

/**
 * Валидатор сущности Competency
 * @param {Object} competency - Объект компетенции
 */
export function validateCompetency(competency) {
  assertEntityHasId(competency, "Competency");
  assertHasRequiredProperties(
    competency,
    REQUIRED_FIELDS.COMPETENCY,
    "Competency",
  );
}

// ============================================================================
// ARRAY VALIDATORS
// ============================================================================

/**
 * Валидирует массив пользователей
 * @param {Array} users - Массив пользователей
 * @param {Object} [options] - Опции
 */
export function validateUserArray(users, options = {}) {
  const items = extractItems(users);
  assertValidArray(items, options.minLength || 0, "Users array");

  items.forEach((user, index) => {
    try {
      validateUser(user, options);
    } catch (e) {
      throw new Error(`User[${index}] validation failed: ${e.message}`);
    }
  });
}

/**
 * Валидирует массив благодарностей
 * @param {Array} feedbacks - Массив благодарностей
 * @param {Object} [options] - Опции
 */
export function validateFeedbackArray(feedbacks, options = {}) {
  const items = extractItems(feedbacks);
  assertValidArray(items, options.minLength || 0, "Feedbacks array");

  items.forEach((feedback, index) => {
    try {
      validateFeedback(feedback, options);
    } catch (e) {
      throw new Error(`Feedback[${index}] validation failed: ${e.message}`);
    }
  });
}

/**
 * Валидирует массив целей
 * @param {Array} objectives - Массив целей
 * @param {Object} [options] - Опции
 */
export function validateObjectiveArray(objectives, options = {}) {
  const items = extractItems(objectives);
  assertValidArray(items, options.minLength || 0, "Objectives array");

  items.forEach((objective, index) => {
    try {
      validateObjective(objective, options);
    } catch (e) {
      throw new Error(`Objective[${index}] validation failed: ${e.message}`);
    }
  });
}

// ============================================================================
// GENERIC VALIDATOR
// ============================================================================

/**
 * Универсальный валидатор сущности по типу
 * @param {Object} entity - Сущность для валидации
 * @param {string} entityType - Тип сущности (USER, FEEDBACK, OBJECTIVE, etc.)
 * @param {Object} [options] - Опции валидации
 */
export function validateEntity(entity, entityType, options = {}) {
  const requiredFields = REQUIRED_FIELDS[entityType];

  if (!requiredFields) {
    throw new Error(`Unknown entity type: ${entityType}`);
  }

  assertEntityHasId(entity, entityType);
  assertHasRequiredProperties(entity, requiredFields, entityType);

  return true;
}

/**
 * Универсальный валидатор массива сущностей
 * @param {Array} entities - Массив сущностей
 * @param {string} entityType - Тип сущности
 * @param {Object} [options] - Опции
 */
export function validateEntityArray(entities, entityType, options = {}) {
  const items = extractItems(entities);
  assertValidArray(items, options.minLength || 0, `${entityType} array`);

  items.forEach((entity, index) => {
    try {
      validateEntity(entity, entityType, options);
    } catch (e) {
      throw new Error(
        `${entityType}[${index}] validation failed: ${e.message}`,
      );
    }
  });

  return true;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  REQUIRED_FIELDS,
  OPTIONAL_FIELDS,

  // Individual validators
  validateUser,
  validateFeedback,
  validateObjective,
  validatePerformanceReview,
  validateSurvey,
  validateDevelopmentPlan,
  validateDepartment,
  validateCompetency,

  // Array validators
  validateUserArray,
  validateFeedbackArray,
  validateObjectiveArray,

  // Generic validators
  validateEntity,
  validateEntityArray,
};
