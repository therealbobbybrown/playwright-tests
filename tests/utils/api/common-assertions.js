// tests/utils/api/common-assertions.js
// Shared assertion helpers для API тестов
// TASK-071: Стандартизация assertions

import { expect } from "@playwright/test";
import { allure } from "allure-playwright";

// ============================================================================
// STATUS CODE HELPERS
// ============================================================================

/**
 * Проверяет успешный статус ответа (200, 201, 204)
 * @param {Response} response - Playwright APIResponse
 * @param {string} [message] - Дополнительное сообщение для assertion
 */
export function assertSuccessStatus(response, message = "") {
  const status = response.status();
  const validStatuses = [200, 201, 204];
  const assertMessage =
    message ||
    `Ожидается успешный статус (${validStatuses.join("/")}), получен ${status}`;
  expect(validStatuses, assertMessage).toContain(status);
}

/**
 * Проверяет успешный статус с указанием допустимых кодов
 * @param {Response} response - Playwright APIResponse
 * @param {number[]} validStatuses - Массив допустимых статус-кодов
 * @param {string} [message] - Дополнительное сообщение
 */
export function assertSuccessStatusWithOptions(
  response,
  validStatuses = [200, 201],
  message = "",
) {
  const status = response.status();
  const assertMessage =
    message ||
    `Ожидается статус из ${validStatuses.join("/")}, получен ${status}`;
  expect(validStatuses, assertMessage).toContain(status);
}

/**
 * Проверяет статус ошибки
 * @param {Response} response - Playwright APIResponse
 * @param {number[]} expectedStatuses - Ожидаемые статусы ошибок
 * @param {string} [message] - Дополнительное сообщение
 */
export function assertErrorStatus(
  response,
  expectedStatuses = [400, 401, 403, 404],
  message = "",
) {
  const status = response.status();
  const assertMessage =
    message ||
    `Ожидается статус ошибки из ${expectedStatuses.join("/")}, получен ${status}`;
  expect(expectedStatuses, assertMessage).toContain(status);
}

/**
 * Проверяет статус 404 Not Found
 * @param {Response} response - Playwright APIResponse
 * @param {string} [message] - Дополнительное сообщение
 */
export function assertNotFound(
  response,
  message = "Ожидается статус 404 Not Found",
) {
  expect(response.status(), message).toBe(404);
}

/**
 * Проверяет статус 401 Unauthorized
 * @param {Response} response - Playwright APIResponse
 * @param {string} [message] - Дополнительное сообщение
 */
export function assertUnauthorized(
  response,
  message = "Ожидается статус 401 Unauthorized",
) {
  expect(response.status(), message).toBe(401);
}

/**
 * Проверяет статус 403 Forbidden
 * @param {Response} response - Playwright APIResponse
 * @param {string} [message] - Дополнительное сообщение
 */
export function assertForbidden(
  response,
  message = "Ожидается статус 403 Forbidden",
) {
  expect(response.status(), message).toBe(403);
}

/**
 * Проверяет статус 400 Bad Request
 * @param {Response} response - Playwright APIResponse
 * @param {string} [message] - Дополнительное сообщение
 */
export function assertBadRequest(
  response,
  message = "Ожидается статус 400 Bad Request",
) {
  expect(response.status(), message).toBe(400);
}

// ============================================================================
// RESPONSE STRUCTURE HELPERS
// ============================================================================

/**
 * Проверяет наличие обязательных свойств в объекте
 * @param {Object} data - Данные для проверки
 * @param {string[]} properties - Массив имён обязательных свойств
 * @param {string} [entityName] - Название сущности для сообщений
 */
export function assertHasRequiredProperties(
  data,
  properties,
  entityName = "Object",
) {
  expect(data, `${entityName} должен быть определён`).toBeDefined();

  for (const prop of properties) {
    expect(
      data,
      `${entityName} должен иметь свойство "${prop}"`,
    ).toHaveProperty(prop);
  }
}

/**
 * Проверяет что данные являются массивом
 * @param {any} data - Данные для проверки
 * @param {number} [minLength=0] - Минимальная длина массива
 * @param {string} [message] - Дополнительное сообщение
 */
export function assertValidArray(data, minLength = 0, message = "") {
  const assertMessage = message || "Данные должны быть массивом";
  expect(Array.isArray(data), assertMessage).toBe(true);

  if (minLength > 0) {
    expect(
      data.length,
      `Массив должен содержать минимум ${minLength} элементов`,
    ).toBeGreaterThanOrEqual(minLength);
  }
}

/**
 * Проверяет что массив не пустой
 * @param {any[]} data - Массив для проверки
 * @param {string} [message] - Дополнительное сообщение
 */
export function assertNotEmptyArray(
  data,
  message = "Массив не должен быть пустым",
) {
  expect(Array.isArray(data), "Данные должны быть массивом").toBe(true);
  expect(data.length, message).toBeGreaterThan(0);
}

/**
 * Проверяет элементы массива на наличие свойств
 * @param {any[]} data - Массив для проверки
 * @param {string[]} requiredProperties - Обязательные свойства каждого элемента
 * @param {string} [entityName] - Название сущности
 */
export function assertArrayItems(
  data,
  requiredProperties,
  entityName = "Item",
) {
  assertValidArray(data, 1, `Массив ${entityName} должен содержать элементы`);

  data.forEach((item, index) => {
    for (const prop of requiredProperties) {
      expect(
        item,
        `${entityName}[${index}] должен иметь свойство "${prop}"`,
      ).toHaveProperty(prop);
    }
  });
}

/**
 * Проверяет структуру пагинированного ответа
 * @param {Object} data - Данные ответа
 * @param {Object} [options] - Опции проверки
 * @param {boolean} [options.checkItems=true] - Проверять наличие items
 * @param {boolean} [options.checkTotal=true] - Проверять наличие total
 */
export function assertPaginatedResponse(data, options = {}) {
  const { checkItems = true, checkTotal = true } = options;

  expect(data, "Ответ должен быть определён").toBeDefined();

  if (checkItems) {
    const items = data?.items || data;
    expect(
      Array.isArray(items) || typeof items === "object",
      "Ответ должен содержать items или быть массивом",
    ).toBe(true);
  }

  if (checkTotal && data?.total !== undefined) {
    expect(typeof data.total, "total должен быть числом").toBe("number");
  }
}

// ============================================================================
// DATA EXTRACTION HELPERS
// ============================================================================

/**
 * Безопасно извлекает массив items из ответа
 * Обрабатывает форматы: { items: [...] }, [...], { data: [...] }
 * @param {Object|Array} data - Данные ответа
 * @returns {Array} - Массив элементов
 */
export function extractItems(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.items)) return data.items;
  if (Array.isArray(data.data)) return data.data;
  if (Array.isArray(data.results)) return data.results;
  return [];
}

/**
 * Извлекает метаданные пагинации из ответа
 * @param {Object} data - Данные ответа
 * @returns {Object} - { total, limit, offset, page }
 */
export function extractPaginationMeta(data) {
  return {
    total: data?.total ?? data?.count ?? null,
    limit: data?.limit ?? data?.pageSize ?? null,
    offset: data?.offset ?? null,
    page: data?.page ?? null,
  };
}

/**
 * Извлекает первый элемент из ответа
 * @param {Object|Array} data - Данные ответа
 * @returns {Object|null} - Первый элемент или null
 */
export function extractFirstItem(data) {
  const items = extractItems(data);
  return items.length > 0 ? items[0] : null;
}

/**
 * Ищет элемент по ID в ответе
 * @param {Object|Array} data - Данные ответа
 * @param {number|string} id - ID для поиска
 * @returns {Object|null} - Найденный элемент или null
 */
export function extractItemById(data, id) {
  const items = extractItems(data);
  return items.find((item) => item.id === id || item.id === String(id)) || null;
}

// ============================================================================
// ENTITY VALIDATION HELPERS
// ============================================================================

/**
 * Проверяет что сущность имеет ID
 * @param {Object} entity - Сущность для проверки
 * @param {string} [entityName] - Название сущности
 */
export function assertEntityHasId(entity, entityName = "Entity") {
  expect(entity, `${entityName} должен быть определён`).toBeDefined();
  expect(entity.id, `${entityName} должен иметь id`).toBeDefined();
}

/**
 * Проверяет наличие временных меток
 * @param {Object} entity - Сущность для проверки
 * @param {string} [entityName] - Название сущности
 */
export function assertEntityHasTimestamps(entity, entityName = "Entity") {
  expect(entity, `${entityName} должен быть определён`).toBeDefined();

  // Проверяем различные варианты названий полей
  const hasCreatedAt =
    entity.createdAt || entity.created_at || entity.createDate;
  const hasUpdatedAt =
    entity.updatedAt ||
    entity.updated_at ||
    entity.updateDate ||
    entity.modifiedAt;

  expect(
    hasCreatedAt || hasUpdatedAt,
    `${entityName} должен иметь временные метки (createdAt/updatedAt)`,
  ).toBeTruthy();
}

/**
 * Проверяет что строка является валидной датой
 * @param {string} dateString - Строка с датой
 * @param {string} [fieldName] - Название поля для сообщения
 */
export function assertValidDateString(dateString, fieldName = "Date") {
  expect(dateString, `${fieldName} должен быть определён`).toBeDefined();

  const date = new Date(dateString);
  expect(
    !isNaN(date.getTime()),
    `${fieldName} должен быть валидной датой, получено: ${dateString}`,
  ).toBe(true);
}

/**
 * Проверяет ISO формат даты
 * @param {string} dateString - Строка с датой
 * @param {string} [fieldName] - Название поля
 */
export function assertISODateFormat(dateString, fieldName = "Date") {
  expect(dateString, `${fieldName} должен быть определён`).toBeDefined();

  // ISO 8601 формат: 2024-01-15T10:30:00.000Z или 2024-01-15
  const isoRegex =
    /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?(Z|[+-]\d{2}:\d{2})?)?$/;
  expect(
    isoRegex.test(dateString),
    `${fieldName} должен быть в ISO формате, получено: ${dateString}`,
  ).toBe(true);
}

// ============================================================================
// PAGINATION VALIDATION HELPERS
// ============================================================================

/**
 * Проверяет корректность пагинации
 * @param {Object} data - Данные ответа с пагинацией
 * @param {number} limit - Запрошенный лимит
 */
export function assertPaginationBounds(data, limit) {
  const items = extractItems(data);

  expect(
    items.length,
    `Количество элементов (${items.length}) не должно превышать лимит (${limit})`,
  ).toBeLessThanOrEqual(limit);
}

/**
 * Проверяет метаданные пагинации
 * @param {Object} data - Данные ответа
 */
export function assertPaginationMetadata(data) {
  expect(data, "Ответ должен быть определён").toBeDefined();

  // Проверяем наличие хотя бы одного поля пагинации
  const hasTotal = data.total !== undefined || data.count !== undefined;
  const hasLimit = data.limit !== undefined || data.pageSize !== undefined;
  const hasOffset = data.offset !== undefined || data.page !== undefined;

  expect(
    hasTotal || hasLimit || hasOffset,
    "Ответ должен содержать метаданные пагинации (total/limit/offset)",
  ).toBe(true);
}

// ============================================================================
// PERMISSION/ACCESS HELPERS
// ============================================================================

/**
 * Проверяет что доступ разрешён (2xx статус)
 * @param {Response} response - Playwright APIResponse
 * @param {string} [message] - Дополнительное сообщение
 */
export function assertAccessGranted(
  response,
  message = "Доступ должен быть разрешён",
) {
  expect(response.ok(), message).toBe(true);
}

/**
 * Проверяет что доступ запрещён (403)
 * @param {Response} response - Playwright APIResponse
 * @param {string} [message] - Дополнительное сообщение
 */
export function assertAccessDenied(
  response,
  message = "Доступ должен быть запрещён (403)",
) {
  expect(response.status(), message).toBe(403);
}

/**
 * Проверяет что требуется аутентификация (401)
 * @param {Response} response - Playwright APIResponse
 * @param {string} [message] - Дополнительное сообщение
 */
export function assertRequiresAuth(
  response,
  message = "Требуется аутентификация (401)",
) {
  expect(response.status(), message).toBe(401);
}

/**
 * Проверяет негативный сценарий доступа
 * @param {Response} response - Playwright APIResponse
 * @param {string} [scenario] - Описание сценария
 */
export function assertAccessDeniedScenario(
  response,
  scenario = "unauthorized access",
) {
  const status = response.status();
  const validDeniedStatuses = [401, 403, 404];

  expect(
    validDeniedStatuses,
    `Сценарий "${scenario}": ожидается статус ${validDeniedStatuses.join("/")}, получен ${status}`,
  ).toContain(status);
}

// ============================================================================
// ALLURE INTEGRATION HELPERS
// ============================================================================

/**
 * Логирует результат assertion в Allure
 * @param {string} name - Название проверки
 * @param {boolean} passed - Результат
 * @param {Object} [details] - Дополнительные детали
 */
export function logAssertionToAllure(name, passed, details = {}) {
  const status = passed ? "✅" : "❌";
  allure.step(`${status} ${name}`, () => {
    if (Object.keys(details).length > 0) {
      allure.attachment(
        "Assertion Details",
        JSON.stringify(details, null, 2),
        "application/json",
      );
    }
  });
}

/**
 * Комплексная проверка API ответа с логированием в Allure
 * @param {Response} response - Playwright APIResponse
 * @param {Object} data - Данные ответа
 * @param {Object} [options] - Опции проверки
 * @param {number[]} [options.validStatuses] - Допустимые статусы
 * @param {string[]} [options.requiredFields] - Обязательные поля
 * @param {string} [options.entityName] - Название сущности
 */
export async function assertAPIResponse(response, data, options = {}) {
  const {
    validStatuses = [200, 201],
    requiredFields = [],
    entityName = "Response",
  } = options;

  await allure.step(`Проверка ответа ${entityName}`, async () => {
    // Проверка статуса
    const status = response.status();
    expect(
      validStatuses,
      `Статус ${status} должен быть в ${validStatuses.join("/")}`,
    ).toContain(status);

    // Логируем в Allure
    allure.attachment(
      "Response Info",
      JSON.stringify(
        {
          status,
          validStatuses,
          entityName,
        },
        null,
        2,
      ),
      "application/json",
    );

    // Проверка обязательных полей
    if (requiredFields.length > 0 && data) {
      assertHasRequiredProperties(data, requiredFields, entityName);
    }
  });
}

// ============================================================================
// UTILITY HELPERS
// ============================================================================

/**
 * Безопасное сравнение значений (учитывает null/undefined)
 * @param {any} actual - Фактическое значение
 * @param {any} expected - Ожидаемое значение
 * @param {string} [message] - Сообщение
 */
export function assertEqualsSafe(actual, expected, message = "") {
  if (expected === null || expected === undefined) {
    expect(actual, message).toBeNull();
  } else {
    expect(actual, message).toEqual(expected);
  }
}

/**
 * Проверяет что значение является числом
 * @param {any} value - Значение для проверки
 * @param {string} [fieldName] - Название поля
 */
export function assertIsNumber(value, fieldName = "Value") {
  expect(typeof value, `${fieldName} должен быть числом`).toBe("number");
  expect(
    Number.isFinite(value),
    `${fieldName} должен быть конечным числом`,
  ).toBe(true);
}

/**
 * Проверяет что значение является строкой
 * @param {any} value - Значение для проверки
 * @param {string} [fieldName] - Название поля
 * @param {boolean} [allowEmpty=false] - Разрешить пустую строку
 */
export function assertIsString(value, fieldName = "Value", allowEmpty = false) {
  expect(typeof value, `${fieldName} должен быть строкой`).toBe("string");

  if (!allowEmpty) {
    expect(
      value.length,
      `${fieldName} не должен быть пустой строкой`,
    ).toBeGreaterThan(0);
  }
}

/**
 * Проверяет что значение является boolean
 * @param {any} value - Значение для проверки
 * @param {string} [fieldName] - Название поля
 */
export function assertIsBoolean(value, fieldName = "Value") {
  expect(typeof value, `${fieldName} должен быть boolean`).toBe("boolean");
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // Status
  assertSuccessStatus,
  assertSuccessStatusWithOptions,
  assertErrorStatus,
  assertNotFound,
  assertUnauthorized,
  assertForbidden,
  assertBadRequest,

  // Structure
  assertHasRequiredProperties,
  assertValidArray,
  assertNotEmptyArray,
  assertArrayItems,
  assertPaginatedResponse,

  // Extraction
  extractItems,
  extractPaginationMeta,
  extractFirstItem,
  extractItemById,

  // Entity
  assertEntityHasId,
  assertEntityHasTimestamps,
  assertValidDateString,
  assertISODateFormat,

  // Pagination
  assertPaginationBounds,
  assertPaginationMetadata,

  // Access
  assertAccessGranted,
  assertAccessDenied,
  assertRequiresAuth,
  assertAccessDeniedScenario,

  // Allure
  logAssertionToAllure,
  assertAPIResponse,

  // Utility
  assertEqualsSafe,
  assertIsNumber,
  assertIsString,
  assertIsBoolean,
};
