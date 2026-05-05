// tests/security/e2e/utils/route-matchers.js
// Утилиты для работы с шаблонами маршрутов

import { toEnvKey, buildQuery } from "./url-helpers.js";

/**
 * Создаёт массив matchers для динамических маршрутов
 * @param {string[]} routeTemplates - Массив шаблонов маршрутов
 * @returns {Array<{template: string, keys: string[], regex: RegExp, searchRegex: RegExp}>}
 */
export function createDynamicMatchers(routeTemplates) {
  return routeTemplates
    .filter((template) => /:([A-Za-z0-9_]+)/.test(template))
    .map((template) => {
      const keys = [];
      const pattern = template
        .replace(/([.*+?^${}()|[\]\\])/g, "\\$1")
        .replace(/\\:([A-Za-z0-9_]+)/g, (_, key) => {
          keys.push(key);
          return "([^/\\s\"'<>]+)";
        });
      return {
        template,
        keys,
        regex: new RegExp(`^${pattern}(?:/)?$`, "i"),
        searchRegex: new RegExp(pattern, "gi"),
      };
    });
}

/**
 * Создаёт Map динамических ключей (нормализованных)
 * @param {Array} dynamicMatchers
 * @returns {Map<string, string>}
 */
export function createDynamicKeys(dynamicMatchers) {
  return new Map(
    dynamicMatchers
      .flatMap((matcher) => matcher.keys)
      .map((key) => [key.toLowerCase().replace(/[-_]/g, ""), key]),
  );
}

/**
 * Извлекает параметры из шаблона маршрута
 * @param {string} template
 * @returns {string[]}
 */
export function extractParamsFromTemplate(template) {
  const matches = template.match(/:([a-zA-Z]+)/g) || [];
  return matches.map((m) => m.slice(1));
}

/**
 * Разрешает шаблон маршрута, подставляя значения параметров
 * @param {string} template
 * @param {Map<string, string>} collectedParams
 * @param {Set<string>} unavailableParams
 * @returns {{resolved: string, missing: string[]}}
 */
export function resolveRoute(
  template,
  collectedParams,
  unavailableParams = new Set(),
) {
  const missing = [];
  const resolved = template.replace(/:([A-Za-z0-9_]+)/g, (_, key) => {
    let envKey = `SECURITY_${toEnvKey(key)}`;
    let value = collectedParams.get(key) ?? process.env[envKey];

    if (key === "objectiveId") {
      if (
        /^\/development-plans\/[^/]+\/objectives\/:objectiveId/i.test(template)
      ) {
        envKey = "SECURITY_DEVELOPMENT_PLAN_OBJECTIVE_ID";
        value =
          collectedParams.get("developmentPlanObjectiveId") ??
          collectedParams.get("objectiveId") ??
          process.env[envKey];
      }
      if (
        /^\/development-plans\/templates\/[^/]+\/objectives\/:objectiveId/i.test(
          template,
        )
      ) {
        envKey = "SECURITY_DEVELOPMENT_PLAN_TEMPLATE_OBJECTIVE_ID";
        value =
          collectedParams.get("developmentPlanTemplateObjectiveId") ??
          collectedParams.get("objectiveId") ??
          process.env[envKey];
      }
    }
    if (!value) {
      const unavailableNote = unavailableParams.has(key)
        ? `${envKey} (not available)`
        : envKey;
      missing.push(unavailableNote);
      return `:${key}`;
    }
    return encodeURIComponent(value);
  });

  return { resolved, missing };
}

/**
 * Разрешает URL для теста (с особой обработкой некоторых маршрутов)
 * @param {string} template
 * @param {Map<string, string>} collectedParams
 * @param {Set<string>} unavailableParams
 * @returns {{resolved: string, missing: string[]}}
 */
export function resolveTestUrl(
  template,
  collectedParams,
  unavailableParams = new Set(),
) {
  if (
    template === "/performance-reviews/:performanceReviewId/results" ||
    template === "/performance-reviews/:performanceReviewId/results/export"
  ) {
    const required = [
      { key: "performanceReviewId", env: "SECURITY_PERFORMANCE_REVIEW_ID" },
      { key: "revisionId", env: "SECURITY_REVISION_ID" },
      { key: "userId", env: "SECURITY_USER_ID" },
    ];
    const missing = [];
    const values = {};
    for (const item of required) {
      const value = collectedParams.get(item.key) ?? process.env[item.env];
      if (!value) {
        missing.push(item.env);
      } else {
        values[item.key] = value;
      }
    }

    const path = `/manager/performance-reviews/${encodeURIComponent(
      values.performanceReviewId ?? ":performanceReviewId",
    )}/`;
    const query = buildQuery({
      revisionId: values.revisionId,
      tab: "results",
      targetUserId: values.userId,
    });
    return { resolved: `${path}${query}`, missing };
  }

  return resolveRoute(template, collectedParams, unavailableParams);
}

/**
 * Строит отчёт о discovery (какие параметры собраны, какие отсутствуют)
 * @param {string[]} routeTemplates
 * @param {Map<string, string>} collectedParams
 * @param {Object} discoveryMeta
 * @returns {Object}
 */
export function buildDiscoveryReport(
  routeTemplates,
  collectedParams,
  discoveryMeta = {},
) {
  const missing = [];

  for (const template of routeTemplates) {
    const { missing: missingKeys } = resolveRoute(template, collectedParams);
    if (missingKeys.length > 0) {
      missing.push({ template, missing: missingKeys });
    }
  }

  return {
    meta: discoveryMeta,
    collectedParams: Object.fromEntries(collectedParams.entries()),
    missingTemplates: missing,
  };
}
