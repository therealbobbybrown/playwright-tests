// tests/utils/allure-helpers.js
// Утилиты для Allure репортинга

import { allure } from "allure-playwright";

/**
 * Типы тестов для категоризации в Allure отчёте
 */
export const TEST_TYPES = {
  API: "API Tests",
  UI: "UI Tests",
  E2E: "E2E Tests",
  SECURITY: "Security Tests",
  SMOKE: "Smoke Tests",
};

/**
 * Модули приложения для группировки в Allure
 */
export const MODULES = {
  SURVEYS: "Surveys",
  PERFORMANCE_REVIEW: "Performance Review",
  FEEDBACK: "Feedback",
  OBJECTIVES: "Objectives",
  ORG_STRUCTURE: "Org Structure",
  AUTH: "Auth",
  DEVELOPMENT_PLANS: "Development Plans",
  KARMA: "Karma",
  SECURITY: "Security",
  PROFILE: "Profile",
  BRAND: "Brand",
  GIFT_SHOP: "Gift Shop",
  HOME: "Home",
  MY_TEAM: "My Team",
  SETTINGS: "Settings",
  VIRTUAL_CURRENCY: "Virtual Currency",
  ACCOUNT: "Account",
  NOTIFICATIONS: "Notifications",
  ROLES: "Roles & Permissions",
  SCENARIOS: "Scenarios",
  CALIBRATION: "Calibration",
  COMPETENCIES: "Competencies",
  NINE_BOX: "NineBox",
};

/**
 * Устанавливает Allure метки для API тестов
 * @param {string} module - Название модуля (например, 'Surveys', 'Performance Review')
 * @param {string} [feature] - Опционально: название функциональности
 */
export function markAsAPITest(module, feature) {
  allure.parentSuite(TEST_TYPES.API);
  allure.suite(module);
  if (feature) {
    allure.subSuite(feature);
  }
  allure.label("testType", "api");
  allure.label("layer", "api");
}

/**
 * Устанавливает Allure метки для UI тестов
 * @param {string} module - Название модуля
 * @param {string} [feature] - Опционально: название функциональности
 */
export function markAsUITest(module, feature) {
  allure.parentSuite(TEST_TYPES.UI);
  allure.suite(module);
  if (feature) {
    allure.subSuite(feature);
  }
  allure.label("testType", "ui");
  allure.label("layer", "ui");
}

/**
 * Устанавливает Allure метки для E2E тестов
 * @param {string} module - Название модуля
 * @param {string} [feature] - Опционально: название функциональности
 */
export function markAsE2ETest(module, feature) {
  allure.parentSuite(TEST_TYPES.E2E);
  allure.suite(module);
  if (feature) {
    allure.subSuite(feature);
  }
  allure.label("testType", "e2e");
  allure.label("layer", "e2e");
}

/**
 * Устанавливает Allure метки для Smoke тестов
 * @param {string} module - Название модуля
 */
export function markAsSmokeTest(module) {
  allure.parentSuite(TEST_TYPES.SMOKE);
  allure.suite(module);
  allure.label("testType", "smoke");
  allure.label("layer", "smoke");
}

/**
 * Устанавливает Allure метки для Security тестов
 * @param {string} [feature] - Опционально: название функциональности
 */
export function markAsSecurityTest(feature) {
  allure.parentSuite(TEST_TYPES.SECURITY);
  if (feature) {
    allure.suite(feature);
  }
  allure.label("testType", "security");
  allure.label("layer", "security");
}

/**
 * Добавляет severity метку
 * @param {'blocker'|'critical'|'normal'|'minor'|'trivial'} severity
 */
export function setSeverity(severity) {
  allure.severity(severity);
}

/**
 * Добавляет owner метку
 * @param {string} owner - Владелец теста
 */
export function setOwner(owner) {
  allure.owner(owner);
}

/**
 * Добавляет epic метку
 * @param {string} epic - Название эпика
 */
export function setEpic(epic) {
  allure.epic(epic);
}

/**
 * Добавляет feature метку
 * @param {string} feature - Название фичи
 */
export function setFeature(feature) {
  allure.feature(feature);
}

/**
 * Добавляет story метку
 * @param {string} story - Название истории
 */
export function setStory(story) {
  allure.story(story);
}

/**
 * Логирует API запрос и ответ в Allure отчёт
 * @param {string} method - HTTP метод (GET, POST, etc.)
 * @param {string} endpoint - URL эндпоинта
 * @param {Object} options - Опции запроса
 * @param {Object} [options.requestBody] - Тело запроса
 * @param {number} options.status - HTTP статус ответа
 * @param {Object} [options.responseBody] - Тело ответа
 * @param {number} [options.duration] - Время выполнения в мс
 */
export function logAPICall(method, endpoint, options = {}) {
  const { requestBody, status, responseBody, duration } = options;

  // Формируем краткое описание
  const statusEmoji =
    status >= 200 && status < 300 ? "✅" : status >= 400 ? "❌" : "⚠️";
  const durationStr = duration ? ` (${duration}ms)` : "";

  // Добавляем step с информацией о запросе
  allure.step(
    `${statusEmoji} ${method} ${endpoint} → ${status}${durationStr}`,
    () => {
      // Request body
      if (requestBody !== undefined) {
        allure.attachment(
          "Request Body",
          JSON.stringify(requestBody, null, 2),
          "application/json",
        );
      }

      // Response body
      if (responseBody !== undefined) {
        allure.attachment(
          "Response Body",
          JSON.stringify(responseBody, null, 2),
          "application/json",
        );
      }
    },
  );
}

/**
 * Обёртка для API вызова с автоматическим логированием в Allure
 * @param {Function} apiCall - Функция API вызова, возвращающая { response, data }
 * @param {string} method - HTTP метод
 * @param {string} endpoint - URL эндпоинта
 * @param {Object} [requestBody] - Тело запроса (для логирования)
 * @returns {Promise<{response: any, data: any}>}
 */
export async function withAPILogging(apiCall, method, endpoint, requestBody) {
  const start = Date.now();
  const result = await apiCall();
  const duration = Date.now() - start;

  logAPICall(method, endpoint, {
    requestBody,
    status: result.response.status(),
    responseBody: result.data,
    duration,
  });

  return result;
}

export { allure };
