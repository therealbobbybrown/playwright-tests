// tests/security/e2e/utils/api-helpers.js
// API утилиты для тестов безопасности

import { buildQuery } from "./url-helpers.js";

/**
 * Получает заголовки авторизации из page context
 * @param {import('@playwright/test').Page} page
 * @param {Object} discoveryMeta - мета-объект для сбора информации
 * @returns {Promise<Object>} headers object
 */
export async function getAuthHeaders(page, discoveryMeta = {}) {
  const storage = await page.evaluate(() => {
    const entries = (store) => Object.fromEntries(Object.entries(store));
    return {
      local: entries(window.localStorage),
      session: entries(window.sessionStorage),
    };
  });

  const cookies = await page.context().cookies();
  if (discoveryMeta) {
    discoveryMeta.cookieNames = cookies.map((cookie) => cookie.name);
  }

  const pickToken = (record) => {
    for (const [key, value] of Object.entries(record)) {
      if (typeof value !== "string") continue;
      const trimmed = value.trim();
      if (!trimmed) continue;

      if (/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/.test(trimmed)) {
        return trimmed;
      }

      if (key.toLowerCase().includes("token")) {
        try {
          const parsed = JSON.parse(trimmed);
          if (typeof parsed === "string") return parsed;
          if (parsed?.accessToken) return parsed.accessToken;
          if (parsed?.token) return parsed.token;
        } catch {
          // ignore JSON parse errors
        }
      }
    }
    return null;
  };

  const token =
    pickToken(storage.local) ??
    pickToken(storage.session) ??
    cookies
      .map((cookie) => {
        if (
          cookie.name.toLowerCase().includes("access_token") &&
          /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/.test(cookie.value)
        ) {
          return cookie.value;
        }
        return null;
      })
      .find(Boolean);

  const cookieHeader = cookies.length
    ? cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ")
    : null;

  if (discoveryMeta) {
    discoveryMeta.authTokenFound = Boolean(token || cookieHeader);
  }

  if (!token && !cookieHeader) return {};

  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(cookieHeader ? { Cookie: cookieHeader } : {}),
  };
}

/**
 * Выполняет GET запрос к API
 * @param {import('@playwright/test').Page} page
 * @param {string} apiBase
 * @param {string} path
 * @param {Object} query
 * @param {Object} options - { discoveryMeta, collectFromValue }
 * @returns {Promise<any>}
 */
export async function apiGet(page, apiBase, path, query = {}, options = {}) {
  const { discoveryMeta = {}, collectFromValue = () => {} } = options;

  if (!apiBase) return;
  const headers = await getAuthHeaders(page, discoveryMeta);
  const url = `${apiBase}${path}${buildQuery(query)}`;
  let response;
  let data = null;

  try {
    response = await page.request.get(url, {
      headers,
      failOnStatusCode: false,
      timeout: 10_000,
    });
  } catch {
    if (discoveryMeta.apiCalls) {
      discoveryMeta.apiCalls.push({ url, status: "error" });
    }
    return;
  }

  if (!response) return;
  collectFromValue(url);
  const status = response.status();
  if (discoveryMeta.apiCalls) {
    discoveryMeta.apiCalls.push({ url, status });
  }
  if (status >= 400) return null;

  try {
    data = await response.json();
    collectFromValue(data);
  } catch {
    // ignore json parse errors
  }

  return data;
}

/**
 * Выполняет POST запрос к API
 * @param {import('@playwright/test').Page} page
 * @param {string} apiBase
 * @param {string} path
 * @param {Object} body
 * @param {Object} options - { discoveryMeta, collectFromValue }
 * @returns {Promise<any>}
 */
export async function apiPost(page, apiBase, path, body = {}, options = {}) {
  const { discoveryMeta = {}, collectFromValue = () => {} } = options;

  if (!apiBase) return;
  const headers = await getAuthHeaders(page, discoveryMeta);
  const url = `${apiBase}${path}`;
  let response;
  let data = null;

  try {
    response = await page.request.post(url, {
      headers,
      data: body,
      failOnStatusCode: false,
      timeout: 10_000,
    });
  } catch {
    if (discoveryMeta.apiCalls) {
      discoveryMeta.apiCalls.push({ url, status: "error" });
    }
    return;
  }

  if (!response) return;
  collectFromValue(url);
  const status = response.status();
  if (discoveryMeta.apiCalls) {
    discoveryMeta.apiCalls.push({ url, status });
  }
  if (status >= 400) return null;

  try {
    data = await response.json();
    collectFromValue(data);
  } catch {
    // ignore json parse errors
  }

  return data;
}

/**
 * Получает свежий токен для survey code маршрутов.
 * Токены имеют короткий TTL (~2 мин), поэтому нужно получать их непосредственно перед тестом.
 * @param {import('@playwright/test').Page} page
 * @param {string} surveyId
 * @param {'group'|'personal'|'department'} codeType
 * @param {string} apiBase
 * @param {Object} options - { discoveryMeta, collectFromValue }
 * @returns {Promise<string|null>}
 */
export async function getFreshSurveyCode(
  page,
  surveyId,
  codeType = "group",
  apiBase,
  options = {},
) {
  if (!apiBase || !surveyId) return null;

  // department-code использует тот же endpoint что и group-code
  const endpoint =
    codeType === "personal"
      ? `/manager/surveys/${surveyId}/personal-code/export/get-token`
      : `/manager/surveys/${surveyId}/group-code/export/get-token`;

  const tokenData = await apiGet(page, apiBase, endpoint, {}, options);
  if (!tokenData) return null;

  return tokenData.code ?? tokenData.token ?? tokenData.value ?? null;
}

/**
 * Определяет тип кода по шаблону маршрута
 * @param {string} template
 * @returns {'group'|'personal'|'department'|null}
 */
export function getSurveyCodeType(template) {
  if (template.includes("/department-code/")) return "department";
  if (template.includes("/group-code/")) return "group";
  if (template.includes("/personal/")) return "personal";
  return null;
}

/**
 * Извлекает первый элемент из различных форматов ответа API
 * @param {any} data
 * @returns {any|null}
 */
export function pickFirstItem(data) {
  if (!data) return null;
  if (Array.isArray(data)) return data[0] ?? null;
  if (Array.isArray(data.items)) return data.items[0] ?? null;
  if (Array.isArray(data.rows)) return data.rows[0] ?? null;
  if (Array.isArray(data.results)) return data.results[0] ?? null;
  if (Array.isArray(data.list)) return data.list[0] ?? null;
  if (Array.isArray(data.data)) return data.data[0] ?? null;
  if (Array.isArray(data?.data?.items)) return data.data.items[0] ?? null;
  if (Array.isArray(data?.data?.rows)) return data.data.rows[0] ?? null;
  if (Array.isArray(data.nominations)) return data.nominations[0] ?? null;
  if (Array.isArray(data?.data?.nominations)) {
    return data.data.nominations[0] ?? null;
  }
  if (Array.isArray(data.templates)) return data.templates[0] ?? null;
  if (Array.isArray(data?.data?.templates))
    return data.data.templates[0] ?? null;
  return null;
}

/**
 * Извлекает ID из элемента по разным полям
 * @param {any} item
 * @param {string} key
 * @returns {string|number|null}
 */
export function extractId(item, key) {
  if (!item) return null;
  const candidates = [
    item[key],
    item.id,
    item.uuid,
    item.templateId,
    item.assessmentId,
    item.surveyId,
    item.requestId,
    item.feedbackRequestId,
    item.developmentPlanId,
    item.objectiveId,
    item.actionId,
    item.nominationId,
    item.nomination?.id,
    item.nomination?.nominationId,
    item.performanceReviewId,
    item.userId,
    item.roleId,
    item.groupId,
    item.template?.id,
    item.assessmentTemplate?.id,
    item.developmentPlanTemplateId,
    item.developmentPlanTemplate?.id,
  ];
  return candidates.find(
    (value) => typeof value === "string" || typeof value === "number",
  );
}
