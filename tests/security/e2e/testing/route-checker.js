// tests/security/e2e/testing/route-checker.js
// Логика проверки маршрутов для тестов безопасности

import { isApiRoute } from "../utils/url-helpers.js";

/**
 * Выполняет HTTP запрос к маршруту и возвращает response
 * @param {import('@playwright/test').Page} page
 * @param {string} url - полный URL для запроса
 * @param {Object} options
 * @param {boolean} options.allowForbidden - разрешены ли 4xx статусы
 * @param {string} options.resolved - нормализованный путь
 * @param {Function} options.resolveRedirectLocation - функция резолва редиректов
 * @param {Map} options.redirectRoutes - Map для хранения редиректов
 * @returns {Promise<import('@playwright/test').Response|null>}
 */
export async function fetchRoute(page, url, options) {
  const { allowForbidden, resolved, resolveRedirectLocation, redirectRoutes } =
    options;

  const requestTimeout = allowForbidden ? 8_000 : 12_000;
  const preflightTimeout = allowForbidden ? 8_000 : 7_500;
  const gotoTimeout = allowForbidden ? 8_000 : 10_000;

  // API маршруты - просто делаем GET
  if (isApiRoute(resolved)) {
    return page.request.get(url, {
      failOnStatusCode: false,
      maxRedirects: 0,
      timeout: requestTimeout,
    });
  }

  // UI маршруты - сначала preflight, потом goto
  let preflight = null;
  try {
    preflight = await page.request.get(url, {
      failOnStatusCode: false,
      maxRedirects: 0,
      timeout: preflightTimeout,
    });
  } catch {
    preflight = null;
  }

  let response = null;

  if (preflight) {
    const preflightStatus = preflight.status();

    // Обрабатываем редиректы
    if (preflightStatus >= 300 && preflightStatus < 400) {
      const location = preflight.headers()["location"];
      if (location) {
        const resolvedLocation = resolveRedirectLocation(location);
        redirectRoutes.set(resolved, resolvedLocation);
      }
      if (!allowForbidden) {
        response = preflight;
      }
    }

    // Обрабатываем 4xx+
    if (preflightStatus >= 400) {
      response = preflight;
    }
  }

  // Если response ещё не установлен — делаем goto
  if (!response) {
    response = await page
      .goto(url, {
        waitUntil: "commit",
        timeout: gotoTimeout,
      })
      .catch(() => null);

    if (!response || response.status() < 300) {
      await page
        .waitForLoadState("domcontentloaded", { timeout: 5_000 })
        .catch(() => null);
    }
  }

  return response;
}

/**
 * Определяет группу статуса
 * @param {number} status
 * @returns {string}
 */
export function getStatusGroup(status) {
  if (status >= 500) return "5xx";
  if (status >= 400) return "4xx";
  if (status >= 300) return "3xx";
  return "2xx";
}

/**
 * Определяет outcome для статуса
 * @param {number} status
 * @param {boolean} allowForbidden
 * @param {string|null} redirectLocation
 * @returns {string}
 */
export function getOutcome(status, allowForbidden, redirectLocation) {
  if (status >= 500) return "server-error";
  if (status >= 400) return allowForbidden ? "expected-4xx" : "unexpected-4xx";
  if (status >= 300) {
    return redirectLocation
      ? "redirect"
      : allowForbidden
        ? "expected-3xx"
        : "unexpected-3xx";
  }
  return "ok";
}

/**
 * Создаёт объект отчёта о статусе
 * @param {Object} params
 * @returns {Object}
 */
export function createStatusReport(params) {
  const { status, redirectLocation, roleLabel, strictAccess } = params;
  return {
    status,
    statusGroup: getStatusGroup(status),
    location: redirectLocation ?? null,
    role: roleLabel,
    expected: strictAccess ? "must-200" : "may-be-non-200",
    outcome: getOutcome(status, !strictAccess, redirectLocation),
  };
}

/**
 * Проверяет UI страницу на наличие ошибок
 * @param {import('@playwright/test').Page} page
 * @param {string} resolved
 * @param {Function} normalizePath
 * @param {Function} expect
 */
export async function checkPageForErrors(
  page,
  resolved,
  normalizePath,
  expect,
) {
  await page.waitForTimeout(150);

  const currentPath = normalizePath(new URL(page.url()).pathname);
  const originalPath = normalizePath(resolved);

  // Проверяем редирект на auth страницы
  if (!/^\/(login|auth|signup)/i.test(originalPath)) {
    expect(
      currentPath,
      `Unexpected auth redirect for ${resolved} -> ${currentPath}`,
    ).not.toMatch(/^\/(login|auth|signup)/i);
  }

  // Проверяем наличие контейнера ошибки
  const errorContainer = page.locator('[class*="Error_container"]');
  const hasErrorContainer = (await errorContainer.count()) > 0;
  if (hasErrorContainer) {
    const errorTitle = errorContainer.locator("h1").first();
    const errorText = await errorTitle.textContent().catch(() => "");
    expect(
      errorText?.trim() || "error",
      `Error page rendered for ${resolved}`,
    ).not.toMatch(/^(404|500)$/);
  }
}

/**
 * Определяет параметры роли для теста
 * @param {string} projectName
 * @param {string} template
 * @param {Set<string>} publicRoutes
 * @returns {Object}
 */
export function getRoleParams(projectName, template, publicRoutes) {
  const isUserProject =
    /security/i.test(projectName) && !/chromium-security$/i.test(projectName);
  const isPublicRoute = publicRoutes.has(template);
  const allowForbidden = isUserProject && !isPublicRoute;
  const strictAccess = !allowForbidden;
  const navigationTimeout = allowForbidden ? 12_000 : 20_000;

  return {
    isUserProject,
    isPublicRoute,
    allowForbidden,
    strictAccess,
    navigationTimeout,
  };
}
