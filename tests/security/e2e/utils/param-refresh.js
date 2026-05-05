// tests/security/e2e/utils/param-refresh.js
// Обновление параметров из API для тестов безопасности

import {
  getAuthHeaders,
  apiGet,
  apiPost,
  pickFirstItem,
} from "./api-helpers.js";

/**
 * Маппинг параметров на API endpoints для получения свежих ID
 * method: 'POST' для endpoints, которые требуют POST запрос
 * altPaths: альтернативные пути для получения данных
 */
export const paramRefreshMap = {
  surveyId: { path: "/manager/surveys", query: { limit: 5, offset: 0 } },
  feedbackId: { path: "/manager/feedbacks", query: { limit: 1, offset: 0 } },
  developmentPlanId: {
    path: "/private/development-plans/get",
    method: "POST",
    body: { limit: 1, offset: 0 },
    altPaths: [
      "/private/development-plans/get/for-head",
      "/private/development-plans/get/for-curator",
      "/private/development-plans/get/for-responsible",
    ],
  },
  performanceReviewId: {
    path: "/manager/performance-reviews",
    query: { limit: 10, offset: 0 },
  },
  assessmentId: {
    path: "/manager/assessments",
    query: { limit: 1, offset: 0 },
  },
  competenceId: {
    path: "/manager/competencies",
    query: { limit: 1, offset: 0 },
  },
  userId: { path: "/manager/users", query: { limit: 1, offset: 0 } },
  roleId: { path: "/manager/roles", query: { limit: 1, offset: 0 } },
  userGroupId: { path: "/manager/user-groups", query: { limit: 1, offset: 0 } },
  developmentPlanTemplateId: {
    path: "/private/development-plan-templates",
    query: { limit: 1, offset: 0 },
  },
  inviteLinkUUID: {
    path: "/manager/invite-links",
    query: { limit: 1, offset: 0 },
  },
  competenceScaleId: {
    path: "/manager/competence-scales",
    query: { limit: 1, offset: 0 },
  },
  developmentActionId: {
    path: "/manager/development-actions",
    query: { limit: 1, offset: 0 },
  },
};

/**
 * Получает свежий ID из API если текущий невалиден
 * @param {import('@playwright/test').Page} page
 * @param {string} paramName — название параметра (surveyId, feedbackId, etc.)
 * @param {string} apiBase
 * @param {Map<string, string>} collectedParams
 * @param {Object} options - { discoveryMeta, collectFromValue }
 * @returns {Promise<string|null>}
 */
export async function refreshParamFromApi(
  page,
  paramName,
  apiBase,
  collectedParams,
  options = {},
) {
  if (!apiBase) return null;

  const config = paramRefreshMap[paramName];
  if (!config) return null;

  // Собираем все пути для попыток (основной + альтернативные)
  const pathsToTry = [config.path, ...(config.altPaths || [])];

  let data = null;
  for (const path of pathsToTry) {
    if (config.method === "POST") {
      data = await apiPost(page, apiBase, path, config.body || {}, options);
    } else {
      data = await apiGet(page, apiBase, path, config.query, options);
    }
    if (data) break;
  }

  const item = pickFirstItem(data);
  if (!item) return null;

  const newValue = item.id ?? item[paramName] ?? item.uuid ?? item.value;
  if (newValue) {
    collectedParams.set(paramName, String(newValue));
    console.log(`[security] Refreshed ${paramName}: ${newValue}`);
    return String(newValue);
  }
  return null;
}

/**
 * Маппинг для проверки валидности ID (путь для GET запроса)
 */
const validatePathMap = {
  developmentPlanId: "/private/development-plans",
  developmentPlanTemplateId: "/private/development-plan-templates",
};

/**
 * Проверяет валидность ID и обновляет если получаем 404
 * @param {import('@playwright/test').Page} page
 * @param {string} paramName
 * @param {string} currentValue
 * @param {string} apiBase
 * @param {Map<string, string>} collectedParams
 * @param {Object} options - { discoveryMeta }
 * @returns {Promise<boolean>} true если ID валиден или обновлён
 */
export async function validateOrRefreshParam(
  page,
  paramName,
  currentValue,
  apiBase,
  collectedParams,
  options = {},
) {
  const { discoveryMeta = {} } = options;

  if (!apiBase || !currentValue) return true; // нечего валидировать

  const config = paramRefreshMap[paramName];
  if (!config) return true; // нет конфига для refresh

  // Определяем путь для проверки валидности
  // Для POST endpoints используем отдельный маппинг
  const basePath = validatePathMap[paramName] || config.path;
  const checkPath = `${basePath}/${currentValue}`;

  try {
    const headers = await getAuthHeaders(page, discoveryMeta);
    const response = await page.request.get(`${apiBase}${checkPath}`, {
      headers,
      failOnStatusCode: false,
      timeout: 5_000,
    });
    const status = response?.status() ?? 0;

    if (status === 404 || status === 400) {
      // ID не существует — получаем новый
      console.log(
        `[security] ${paramName}=${currentValue} returned ${status}, refreshing...`,
      );
      const newValue = await refreshParamFromApi(
        page,
        paramName,
        apiBase,
        collectedParams,
        options,
      );
      return !!newValue;
    }
    return true; // ID валиден
  } catch {
    return true; // при ошибке сети не блокируем тест
  }
}
