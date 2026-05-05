/**
 * URL-хелперы для модуля Performance Review
 *
 * Использование:
 * import { buildPRUrl, FEATURE_FLAGS, PR_ROUTES } from '../tests/utils/pr-urls.js';
 *
 * // URL с feature flag statisticsSettings
 * await page.goto(buildPRUrl(prId, { statisticsSettings: true }));
 *
 * // URL с несколькими feature flags
 * await page.goto(buildPRUrl(prId, { statisticsSettings: true, debug: true }));
 */

// ========================
// FEATURE FLAGS
// ========================

/**
 * Известные feature flags для Performance Review
 */
export const FEATURE_FLAGS = {
  /** Настройки статистики (калибровка, веса компетенций) */
  STATISTICS_SETTINGS: "statisticsSettings",

  /** Дебаг-режим (если поддерживается) */
  DEBUG: "debug",
};

// ========================
// PR ROUTES
// ========================

/**
 * Базовые маршруты для Performance Review
 */
export const PR_ROUTES = {
  /** Список всех PR */
  LIST: "/ru/manager/performance-reviews",

  /** Создание нового PR */
  CREATE: "/ru/manager/performance-reviews/add",

  /**
   * Карточка PR по ID
   * @param {number|string} prId
   */
  card: (prId) => `/ru/manager/performance-reviews/${prId}`,

  /**
   * Результаты PR
   * @param {number|string} prId
   */
  results: (prId) => `/ru/manager/performance-reviews/${prId}/results`,

  /**
   * Прогресс PR
   * @param {number|string} prId
   */
  progress: (prId) => `/ru/manager/performance-reviews/${prId}/progress`,

  /**
   * Дашборд "Моя команда"
   */
  DASHBOARD_TEAM: "/ru/manager/performance-reviews/dashboard-team",

  /**
   * Номинация коллег (для сотрудника)
   * @param {number|string} prId
   */
  nomination: (prId) => `/ru/staff/performance-reviews/${prId}/nomination`,

  /**
   * Страница заполнения анкеты (для респондента)
   * @param {number|string} prId
   * @param {number|string} questionnaireId
   */
  questionnaire: (prId, questionnaireId) =>
    `/ru/staff/performance-reviews/${prId}/questionnaire/${questionnaireId}`,
};

// ========================
// URL BUILDERS
// ========================

/**
 * Построить полный URL для Performance Review
 *
 * @param {number|string} prId - ID Performance Review
 * @param {Object} [options={}] - Опции
 * @param {boolean} [options.statisticsSettings] - Включить feature flag statisticsSettings
 * @param {boolean} [options.debug] - Включить debug режим
 * @param {string} [options.tab] - Вкладка (participants, results, etc.)
 * @param {Object} [options.extraParams] - Дополнительные query параметры
 * @param {string} [options.baseUrl] - Базовый URL (по умолчанию из process.env.BASE_URL)
 * @returns {string} Полный URL
 *
 * @example
 * // Базовый URL карточки PR
 * buildPRUrl(123)
 * // => "https://example.com/ru/manager/performance-reviews/123/"
 *
 * @example
 * // С feature flag statisticsSettings
 * buildPRUrl(123, { statisticsSettings: true })
 * // => "https://example.com/ru/manager/performance-reviews/123/?feature=statisticsSettings"
 *
 * @example
 * // Вкладка результаты с настройками
 * buildPRUrl(123, { statisticsSettings: true, tab: 'results' })
 * // => "https://example.com/ru/manager/performance-reviews/123/?feature=statisticsSettings&tab=results"
 */
export function buildPRUrl(prId, options = {}) {
  const {
    statisticsSettings = false,
    debug = false,
    tab,
    extraParams = {},
  } = options;

  // Только path — page.goto() с Playwright baseURL сам резолвит origin
  let url = `${PR_ROUTES.card(prId)}/`;

  // Собираем query параметры
  const params = new URLSearchParams();

  // Feature flags
  if (statisticsSettings) {
    params.append("feature", FEATURE_FLAGS.STATISTICS_SETTINGS);
  }
  if (debug) {
    params.append("feature", FEATURE_FLAGS.DEBUG);
  }

  // Вкладка
  if (tab) {
    params.append("tab", tab);
  }

  // Дополнительные параметры
  for (const [key, value] of Object.entries(extraParams)) {
    params.append(key, value);
  }

  // Добавляем query string если есть параметры
  const queryString = params.toString();
  if (queryString) {
    url += `?${queryString}`;
  }

  return url;
}

/**
 * Построить URL для списка PR
 *
 * @param {Object} [options={}] - Опции
 * @param {string} [options.baseUrl] - Базовый URL
 * @param {string} [options.status] - Фильтр по статусу (draft, active, stopped, archived)
 * @returns {string}
 */
export function buildPRListUrl(options = {}) {
  const { status } = options;

  let url = `${PR_ROUTES.LIST}/`;

  if (status) {
    url += `?status=${status}`;
  }

  return url;
}

/**
 * Построить URL для результатов PR
 *
 * @param {number|string} prId - ID Performance Review
 * @param {Object} [options={}] - Опции
 * @param {boolean} [options.statisticsSettings] - Включить feature flag
 * @param {string} [options.baseUrl] - Базовый URL
 * @returns {string}
 */
export function buildPRResultsUrl(prId, options = {}) {
  const { statisticsSettings = false } = options;

  let url = `${PR_ROUTES.results(prId)}/`;

  if (statisticsSettings) {
    url += `?feature=${FEATURE_FLAGS.STATISTICS_SETTINGS}`;
  }

  return url;
}

// ========================
// SHORTHAND HELPERS
// ========================

/**
 * Получить URL PR с включённой калибровкой (statisticsSettings)
 * Shorthand для buildPRUrl(prId, { statisticsSettings: true })
 *
 * @param {number|string} prId - ID Performance Review
 * @param {string} [baseUrl] - Базовый URL
 * @returns {string}
 *
 * @example
 * await page.goto(getPRWithCalibration(prId));
 */
export function getPRWithCalibration(prId, baseUrl) {
  return buildPRUrl(prId, { statisticsSettings: true, baseUrl });
}

/**
 * Добавить feature flag statisticsSettings к существующему URL
 *
 * @param {string} url - Существующий URL
 * @returns {string} URL с добавленным feature flag
 *
 * @example
 * const url = addStatisticsSettings('/ru/manager/performance-reviews/123/');
 * // => "/ru/manager/performance-reviews/123/?feature=statisticsSettings"
 */
export function addStatisticsSettings(url) {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}feature=${FEATURE_FLAGS.STATISTICS_SETTINGS}`;
}

/**
 * Построить URL для дашборда "Моя команда"
 *
 * @param {Object} [options={}] - Опции
 * @param {number|string} [options.prId] - ID Performance Review для фильтрации
 * @param {string} [options.status] - Фильтр по статусу прохождения
 * @param {string} [options.baseUrl] - Базовый URL
 * @returns {string}
 *
 * @example
 * // Базовый дашборд
 * buildDashboardTeamUrl()
 *
 * @example
 * // Дашборд для конкретного PR
 * buildDashboardTeamUrl({ prId: 123 })
 */
export function buildDashboardTeamUrl(options = {}) {
  const { prId, status } = options;

  let url = `${PR_ROUTES.DASHBOARD_TEAM}`;

  const params = new URLSearchParams();

  if (prId) {
    params.append("prId", prId);
  }

  if (status) {
    params.append("status", status);
  }

  const queryString = params.toString();
  if (queryString) {
    url += `?${queryString}`;
  }

  return url;
}
