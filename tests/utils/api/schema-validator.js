// tests/utils/api/schema-validator.js
// Contract validation helper using JSON Schema (ajv)
// TASK-072: Contract тесты

import Ajv from "ajv";
import addFormats from "ajv-formats";
import { expect } from "@playwright/test";
import { allure } from "allure-playwright";

// ============================================================================
// AJV CONFIGURATION
// ============================================================================

const ajv = new Ajv({
  allErrors: true, // Показать все ошибки, не только первую
  verbose: true, // Подробные сообщения
  strict: false, // Не строгий режим для гибкости
  allowUnionTypes: true, // Разрешить union types
});

// Добавляем форматы (email, uri, date-time, etc.)
addFormats(ajv);

// ============================================================================
// JSON SCHEMAS FOR ENTITIES
// ============================================================================

/**
 * Базовая схема для entity с ID
 */
const baseEntitySchema = {
  type: "object",
  required: ["id"],
  properties: {
    id: { type: ["integer", "string"] },
  },
};

/**
 * Схемы для основных сущностей API
 */
export const SCHEMAS = {
  // -------------------------------------------------------------------------
  // User & Auth
  // -------------------------------------------------------------------------
  User: {
    $id: "User",
    type: "object",
    required: ["id"],
    properties: {
      id: { type: ["integer", "string"] },
      email: { type: "string", format: "email" },
      firstName: { type: ["string", "null"] },
      lastName: { type: ["string", "null"] },
      middleName: { type: ["string", "null"] },
      fullName: { type: ["string", "null"] },
      position: { type: ["string", "null"] },
      avatar: { type: ["string", "null"] },
      isActive: { type: "boolean" },
      departmentId: { type: ["integer", "null"] },
      headUserId: { type: ["integer", "null"] },
    },
    additionalProperties: true,
  },

  AuthToken: {
    $id: "AuthToken",
    type: "object",
    required: ["token"],
    properties: {
      token: { type: "string", minLength: 10 },
      refreshToken: { type: "string" },
      expiresIn: { type: "integer" },
    },
    additionalProperties: true,
  },

  // -------------------------------------------------------------------------
  // Feedback
  // -------------------------------------------------------------------------
  Feedback: {
    $id: "Feedback",
    type: "object",
    required: ["id"],
    properties: {
      id: { type: ["integer", "string"] },
      body: { type: ["string", "null"] },
      authorUserId: { type: ["integer", "null"] },
      recipientUserId: { type: ["integer", "null"] },
      typeId: { type: ["integer", "null"] },
      isPublic: { type: "boolean" },
      createdAt: { type: "string" },
      updatedAt: { type: ["string", "null"] },
    },
    additionalProperties: true,
  },

  FeedbackType: {
    $id: "FeedbackType",
    type: "object",
    required: ["id", "title"],
    properties: {
      id: { type: ["integer", "string"] },
      title: { type: "string" },
      description: { type: ["string", "null"] },
      icon: { type: ["string", "null"] },
      isActive: { type: "boolean" },
    },
    additionalProperties: true,
  },

  // -------------------------------------------------------------------------
  // Objectives (OKR)
  // -------------------------------------------------------------------------
  Objective: {
    $id: "Objective",
    type: "object",
    required: ["id", "title"],
    properties: {
      id: { type: ["integer", "string"] },
      title: { type: "string" },
      description: { type: ["string", "null"] },
      status: {
        type: "string",
        enum: ["draft", "active", "completed", "archived", "cancelled"],
      },
      progress: { type: "number", minimum: 0, maximum: 100 },
      periodYear: { type: ["integer", "null"] },
      periodQuarter: { type: ["integer", "null"], minimum: 1, maximum: 4 },
      ownerUserId: { type: ["integer", "null"] },
      parentObjectiveId: { type: ["integer", "null"] },
      milestones: {
        type: "array",
        items: { $ref: "Milestone" },
      },
    },
    additionalProperties: true,
  },

  Milestone: {
    $id: "Milestone",
    type: "object",
    required: ["id", "title"],
    properties: {
      id: { type: ["integer", "string"] },
      title: { type: "string" },
      description: { type: ["string", "null"] },
      targetValue: { type: ["number", "null"] },
      currentValue: { type: ["number", "null"] },
      unit: { type: ["string", "null"] },
      progress: { type: "number", minimum: 0, maximum: 100 },
    },
    additionalProperties: true,
  },

  // -------------------------------------------------------------------------
  // Performance Review
  // -------------------------------------------------------------------------
  PerformanceReview: {
    $id: "PerformanceReview",
    type: "object",
    required: ["id", "title"],
    properties: {
      id: { type: ["integer", "string"] },
      title: { type: "string" },
      description: { type: ["string", "null"] },
      status: { type: "string" },
      startDate: { type: ["string", "null"] },
      endDate: { type: ["string", "null"] },
      isActive: { type: "boolean" },
    },
    additionalProperties: true,
  },

  // -------------------------------------------------------------------------
  // Survey
  // -------------------------------------------------------------------------
  Survey: {
    $id: "Survey",
    type: "object",
    required: ["id", "title"],
    properties: {
      id: { type: ["integer", "string"] },
      title: { type: "string" },
      description: { type: ["string", "null"] },
      status: { type: "string" },
      startDate: { type: ["string", "null"] },
      endDate: { type: ["string", "null"] },
      isAnonymous: { type: "boolean" },
    },
    additionalProperties: true,
  },

  // -------------------------------------------------------------------------
  // Scenarios (Workflows)
  // -------------------------------------------------------------------------
  Scenario: {
    $id: "Scenario",
    type: "object",
    required: ["id", "title", "status"],
    properties: {
      id: { type: ["integer", "string"] },
      title: { type: "string", minLength: 1 },
      description: { type: ["string", "null"] },
      status: {
        type: "string",
        enum: ["draft", "active", "archive", "delete"],
      },
      scenarioActions: {
        type: "array",
        items: { $ref: "#/$defs/ScenarioAction" },
      },
      createdAt: { type: ["string", "null"] },
      updatedAt: { type: ["string", "null"] },
    },
    $defs: {
      ScenarioAction: {
        type: "object",
        required: ["id", "type"],
        properties: {
          id: { type: ["integer", "string"] },
          temporaryId: { type: ["string", "null"] },
          type: { type: "string", enum: ["survey"] },
          days: { type: "integer", minimum: 0 },
          time: { type: ["string", "null"] },
          surveyId: { type: ["integer", "string", "null"] },
          survey: { type: ["object", "null"] },
        },
        additionalProperties: true,
      },
    },
    additionalProperties: true,
  },

  ScenarioPerformer: {
    $id: "ScenarioPerformer",
    type: "object",
    required: ["id"],
    properties: {
      id: { type: ["integer", "string"] },
      scenarioId: { type: ["integer", "string"] },
      userId: { type: ["integer", "string"] },
      user: { type: ["object", "null"] },
      status: { type: ["string", "null"] },
      startedAt: { type: ["string", "null"] },
      completedAt: { type: ["string", "null"] },
    },
    additionalProperties: true,
  },

  // -------------------------------------------------------------------------
  // Development Plans
  // -------------------------------------------------------------------------
  DevelopmentPlan: {
    $id: "DevelopmentPlan",
    type: "object",
    required: ["id", "title"],
    properties: {
      id: { type: ["integer", "string"] },
      title: { type: "string" },
      description: { type: ["string", "null"] },
      status: { type: "string" },
      responsibleUserId: { type: ["integer", "null"] },
      curatorUserId: { type: ["integer", "null"] },
      startDate: { type: ["string", "null"] },
      endDate: { type: ["string", "null"] },
    },
    additionalProperties: true,
  },

  DevelopmentGoal: {
    $id: "DevelopmentGoal",
    type: "object",
    required: ["id", "title"],
    properties: {
      id: { type: ["integer", "string"] },
      title: { type: "string" },
      description: { type: ["string", "null"] },
      status: { type: "string" },
      priority: { type: ["integer", "null"] },
    },
    additionalProperties: true,
  },

  // -------------------------------------------------------------------------
  // Org Structure
  // -------------------------------------------------------------------------
  Department: {
    $id: "Department",
    type: "object",
    required: ["id", "title"],
    properties: {
      id: { type: ["integer", "string"] },
      title: { type: "string" },
      parentId: { type: ["integer", "null"] },
      headUserId: { type: ["integer", "null"] },
      level: { type: ["integer", "null"] },
    },
    additionalProperties: true,
  },

  // -------------------------------------------------------------------------
  // Competencies
  // -------------------------------------------------------------------------
  Competency: {
    $id: "Competency",
    type: "object",
    required: ["id", "title"],
    properties: {
      id: { type: ["integer", "string"] },
      title: { type: "string" },
      description: { type: ["string", "null"] },
      groupId: { type: ["integer", "null"] },
    },
    additionalProperties: true,
  },

  // -------------------------------------------------------------------------
  // Karma
  // -------------------------------------------------------------------------
  KarmaTransaction: {
    $id: "KarmaTransaction",
    type: "object",
    required: ["id", "amount"],
    properties: {
      id: { type: ["integer", "string"] },
      amount: { type: "number" },
      userId: { type: ["integer", "null"] },
      reason: { type: ["string", "null"] },
      createdAt: { type: "string" },
    },
    additionalProperties: true,
  },

  // -------------------------------------------------------------------------
  // Assessment
  // -------------------------------------------------------------------------
  Assessment: {
    $id: "Assessment",
    type: "object",
    required: ["id"],
    properties: {
      id: { type: ["integer", "string"] },
      title: { type: ["string", "null"] },
      description: { type: ["string", "null"] },
      status: { type: ["string", "null"] },
      type: { type: ["string", "null"] },
      isActive: { type: "boolean" },
      createdAt: { type: ["string", "null"] },
    },
    additionalProperties: true,
  },

  // -------------------------------------------------------------------------
  // Comments
  // -------------------------------------------------------------------------
  FeedbackComment: {
    $id: "FeedbackComment",
    type: "object",
    required: ["id"],
    properties: {
      id: { type: ["integer", "string"] },
      body: { type: ["string", "null"] },
      feedbackId: { type: ["integer", "string", "null"] },
      authorUserId: { type: ["integer", "null"] },
      createdAt: { type: ["string", "null"] },
      updatedAt: { type: ["string", "null"] },
    },
    additionalProperties: true,
  },

  ObjectiveComment: {
    $id: "ObjectiveComment",
    type: "object",
    required: ["id"],
    properties: {
      id: { type: ["integer", "string"] },
      body: { type: ["string", "null"] },
      objectiveId: { type: ["integer", "string", "null"] },
      authorUserId: { type: ["integer", "null"] },
      createdAt: { type: ["string", "null"] },
      updatedAt: { type: ["string", "null"] },
    },
    additionalProperties: true,
  },

  // -------------------------------------------------------------------------
  // User Groups
  // -------------------------------------------------------------------------
  UserGroup: {
    $id: "UserGroup",
    type: "object",
    required: ["id"],
    properties: {
      id: { type: ["integer", "string"] },
      title: { type: ["string", "null"] },
      description: { type: ["string", "null"] },
      membersCount: { type: ["integer", "null"] },
      isActive: { type: "boolean" },
      createdAt: { type: ["string", "null"] },
    },
    additionalProperties: true,
  },

  // -------------------------------------------------------------------------
  // Invite Links
  // -------------------------------------------------------------------------
  InviteLink: {
    $id: "InviteLink",
    type: "object",
    required: ["id"],
    properties: {
      id: { type: ["integer", "string"] },
      uuid: { type: ["string", "null"] },
      code: { type: ["string", "null"] },
      departmentId: { type: ["integer", "null"] },
      usageLimit: { type: ["integer", "null"] },
      usageCount: { type: ["integer", "null"] },
      expiresAt: { type: ["string", "null"] },
      isActive: { type: "boolean" },
      createdAt: { type: ["string", "null"] },
    },
    additionalProperties: true,
  },

  // -------------------------------------------------------------------------
  // Notifications
  // -------------------------------------------------------------------------
  Notification: {
    $id: "Notification",
    type: "object",
    required: ["id"],
    properties: {
      id: { type: ["integer", "string"] },
      type: { type: ["string", "null"] },
      title: { type: ["string", "null"] },
      body: { type: ["string", "null"] },
      isRead: { type: "boolean" },
      userId: { type: ["integer", "null"] },
      entityId: { type: ["integer", "string", "null"] },
      entityType: { type: ["string", "null"] },
      createdAt: { type: ["string", "null"] },
    },
    additionalProperties: true,
  },

  // -------------------------------------------------------------------------
  // Gift Shop
  // -------------------------------------------------------------------------
  Gift: {
    $id: "Gift",
    type: "object",
    required: ["id"],
    properties: {
      id: { type: ["integer", "string"] },
      title: { type: ["string", "null"] },
      description: { type: ["string", "null"] },
      price: { type: ["number", "string", "null"] },
      image: { type: ["string", "null"] },
      stock: { type: ["integer", "string", "null"] },
      isActive: { type: ["boolean", "null"] },
    },
    additionalProperties: true,
  },

  GiftOrder: {
    $id: "GiftOrder",
    type: "object",
    required: ["id"],
    properties: {
      id: { type: ["integer", "string"] },
      giftId: { type: ["integer", "null"] },
      userId: { type: ["integer", "null"] },
      status: { type: ["string", "null"] },
      price: { type: ["number", "null"] },
      createdAt: { type: ["string", "null"] },
    },
    additionalProperties: true,
  },

  // -------------------------------------------------------------------------
  // Roles & Permissions
  // -------------------------------------------------------------------------
  Role: {
    $id: "Role",
    type: "object",
    required: ["id"],
    properties: {
      id: { type: ["integer", "string"] },
      name: { type: ["string", "null"] },
      title: { type: ["string", "null"] },
      description: { type: ["string", "null"] },
      isSystem: { type: "boolean" },
      permissions: { type: ["array", "null"] },
    },
    additionalProperties: true,
  },

  // -------------------------------------------------------------------------
  // NineBox (обновлено по реальному API 2026-03-22)
  // -------------------------------------------------------------------------
  NineBoxSettings: {
    $id: "NineBoxSettings",
    type: "object",
    required: ["id", "matrixSize", "cellsTitles", "isEnabled", "competences", "companyId"],
    properties: {
      id: { type: "integer" },
      matrixSize: { type: "integer", minimum: 1 },
      cellsTitles: {
        type: "array",
        items: { type: "array", items: { type: "string" } },
      },
      isEnabled: { type: "boolean" },
      competences: {
        type: "array",
        items: {
          type: "object",
          required: ["id", "axis", "competenceId"],
          properties: {
            id: { type: "integer" },
            axis: { type: "string", enum: ["x", "y"] },
            competenceId: { type: "integer" },
            competence: { type: "object" },
          },
        },
      },
      companyId: { type: "integer" },
    },
    additionalProperties: true,
  },

  // NineBox матрица — 3D массив [row][col][{userId, yValue, xValue}]
  NineBoxMatrix: {
    $id: "NineBoxMatrix",
    type: "array",
    items: {
      type: "array",
      items: {
        type: "array",
        items: {
          type: "object",
          required: ["userId", "yValue", "xValue"],
          properties: {
            userId: { type: "integer" },
            yValue: { type: "number", minimum: 0, maximum: 1 },
            xValue: { type: "number", minimum: 0, maximum: 1 },
          },
        },
      },
    },
  },

  // -------------------------------------------------------------------------
  // Pagination Response
  // -------------------------------------------------------------------------
  PaginatedResponse: {
    $id: "PaginatedResponse",
    type: "object",
    properties: {
      items: { type: "array" },
      total: { type: "integer", minimum: 0 },
      limit: { type: "integer", minimum: 1 },
      offset: { type: "integer", minimum: 0 },
      page: { type: "integer", minimum: 1 },
    },
    additionalProperties: true,
  },

  // -------------------------------------------------------------------------
  // Error Response
  // -------------------------------------------------------------------------
  ErrorResponse: {
    $id: "ErrorResponse",
    type: "object",
    properties: {
      message: { type: "string" },
      error: { type: "string" },
      statusCode: { type: "integer" },
      errors: { type: "array" },
    },
    additionalProperties: true,
  },
};

// Регистрируем все схемы
Object.values(SCHEMAS).forEach((schema) => {
  if (schema.$id) {
    ajv.addSchema(schema);
  }
});

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

/**
 * Валидирует данные по JSON Schema
 * @param {Object} data - Данные для валидации
 * @param {Object|string} schema - JSON Schema или ID схемы
 * @returns {{ valid: boolean, errors: Array }}
 */
export function validateSchema(data, schema) {
  const validate =
    typeof schema === "string" ? ajv.getSchema(schema) : ajv.compile(schema);

  if (!validate) {
    return {
      valid: false,
      errors: [{ message: `Schema not found: ${schema}` }],
    };
  }

  const valid = validate(data);

  return {
    valid,
    errors: validate.errors || [],
  };
}

/**
 * Валидирует данные и возвращает отформатированные ошибки
 * @param {Object} data - Данные для валидации
 * @param {Object|string} schema - JSON Schema
 * @returns {string[]} - Массив сообщений об ошибках
 */
export function getValidationErrors(data, schema) {
  const { errors } = validateSchema(data, schema);

  return errors.map((err) => {
    const path = err.instancePath || "";
    const message = err.message || "Unknown error";
    return `${path}: ${message}`;
  });
}

/**
 * Assert что данные соответствуют схеме
 * @param {Object} data - Данные для валидации
 * @param {Object|string} schema - JSON Schema или имя схемы
 * @param {string} [entityName] - Название сущности для сообщений
 */
export function assertMatchesSchema(data, schema, entityName = "Data") {
  const { valid, errors } = validateSchema(data, schema);

  if (!valid) {
    const errorMessages = errors
      .map((err) => `${err.instancePath || "root"}: ${err.message}`)
      .join("\n");

    expect(
      valid,
      `${entityName} не соответствует схеме:\n${errorMessages}`,
    ).toBe(true);
  }
}

/**
 * Валидирует массив сущностей по схеме
 * @param {Array} items - Массив сущностей
 * @param {Object|string} itemSchema - Схема для каждого элемента
 * @param {string} [entityName] - Название сущности
 */
export function assertArrayMatchesSchema(
  items,
  itemSchema,
  entityName = "Item",
) {
  expect(Array.isArray(items), `${entityName}s должен быть массивом`).toBe(
    true,
  );

  items.forEach((item, index) => {
    const { valid, errors } = validateSchema(item, itemSchema);

    if (!valid) {
      const errorMessages = errors
        .map((err) => `${err.instancePath || "root"}: ${err.message}`)
        .join("; ");

      expect(
        valid,
        `${entityName}[${index}] не соответствует схеме: ${errorMessages}`,
      ).toBe(true);
    }
  });
}

// ============================================================================
// ALLURE INTEGRATION
// ============================================================================

/**
 * Валидирует данные и логирует результат в Allure
 * @param {Object} data - Данные для валидации
 * @param {Object|string} schema - JSON Schema
 * @param {string} [entityName] - Название сущности
 */
export async function validateWithAllure(
  data,
  schema,
  entityName = "Response",
) {
  const { valid, errors } = validateSchema(data, schema);

  await allure.step(`Contract validation: ${entityName}`, async () => {
    // Логируем схему
    const schemaObj =
      typeof schema === "string" ? ajv.getSchema(schema)?.schema : schema;
    if (schemaObj) {
      allure.attachment(
        "Schema",
        JSON.stringify(schemaObj, null, 2),
        "application/json",
      );
    }

    // Логируем данные
    allure.attachment(
      "Data",
      JSON.stringify(data, null, 2),
      "application/json",
    );

    // Логируем результат
    if (valid) {
      allure.attachment("Result", "Schema validation passed ✅", "text/plain");
    } else {
      const errorReport = errors.map((err) => ({
        path: err.instancePath || "root",
        message: err.message,
        params: err.params,
      }));
      allure.attachment(
        "Validation Errors",
        JSON.stringify(errorReport, null, 2),
        "application/json",
      );
    }
  });

  return { valid, errors };
}

/**
 * Assert с логированием в Allure
 * @param {Object} data - Данные для валидации
 * @param {Object|string} schema - JSON Schema
 * @param {string} [entityName] - Название сущности
 */
export async function assertMatchesSchemaWithAllure(
  data,
  schema,
  entityName = "Data",
) {
  const { valid, errors } = await validateWithAllure(data, schema, entityName);

  if (!valid) {
    const errorMessages = errors
      .map((err) => `${err.instancePath || "root"}: ${err.message}`)
      .join("\n");

    expect(
      valid,
      `${entityName} не соответствует контракту:\n${errorMessages}`,
    ).toBe(true);
  }
}

// ============================================================================
// SCHEMA BUILDER HELPERS
// ============================================================================

/**
 * Создаёт схему для массива сущностей
 * @param {Object|string} itemSchema - Схема элемента
 * @returns {Object} - JSON Schema для массива
 */
export function createArraySchema(itemSchema) {
  return {
    type: "array",
    items: typeof itemSchema === "string" ? { $ref: itemSchema } : itemSchema,
  };
}

/**
 * Создаёт схему для пагинированного ответа
 * @param {Object|string} itemSchema - Схема элемента
 * @returns {Object} - JSON Schema для пагинированного ответа
 */
export function createPaginatedSchema(itemSchema) {
  return {
    type: "object",
    properties: {
      items: {
        type: "array",
        items:
          typeof itemSchema === "string" ? { $ref: itemSchema } : itemSchema,
      },
      total: { type: "integer", minimum: 0 },
      limit: { type: "integer", minimum: 1 },
      offset: { type: "integer", minimum: 0 },
    },
    additionalProperties: true,
  };
}

/**
 * Расширяет существующую схему дополнительными полями
 * @param {Object} baseSchema - Базовая схема
 * @param {Object} additionalProperties - Дополнительные свойства
 * @returns {Object} - Расширенная схема
 */
export function extendSchema(baseSchema, additionalProperties) {
  return {
    ...baseSchema,
    properties: {
      ...baseSchema.properties,
      ...additionalProperties,
    },
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  SCHEMAS,
  validateSchema,
  getValidationErrors,
  assertMatchesSchema,
  assertArrayMatchesSchema,
  validateWithAllure,
  assertMatchesSchemaWithAllure,
  createArraySchema,
  createPaginatedSchema,
  extendSchema,
  ajv,
};
