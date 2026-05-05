// tests/security/e2e/utils/url-helpers.js
// Утилиты для работы с URL

/**
 * Преобразует camelCase имя в UPPER_SNAKE_CASE для env переменных
 * @param {string} name
 * @returns {string}
 */
export function toEnvKey(name) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/-/g, "_")
    .toUpperCase();
}

/**
 * Удаляет локаль из pathname
 * @param {string} pathname
 * @param {string} localePrefix - Префикс локали (например '/ru')
 * @returns {string}
 */
export function stripLocale(pathname, localePrefix) {
  if (!localePrefix) return pathname;
  if (pathname === localePrefix) return "/";
  if (pathname.startsWith(`${localePrefix}/`)) {
    return pathname.slice(localePrefix.length);
  }
  return pathname;
}

/**
 * Нормализует путь (удаляет локаль и trailing slash)
 * @param {string} pathname
 * @param {string} localePrefix
 * @returns {string}
 */
export function normalizePath(pathname, localePrefix) {
  const stripped = stripLocale(pathname, localePrefix);
  if (stripped.length > 1 && stripped.endsWith("/")) {
    return stripped.slice(0, -1);
  }
  return stripped;
}

/**
 * Разрешает location из redirect заголовка
 * @param {string} location
 * @param {string} origin
 * @param {string} localePrefix
 * @returns {string|null}
 */
export function resolveRedirectLocation(location, origin, localePrefix) {
  if (!location) return null;
  if (location.startsWith("http")) {
    try {
      const url = new URL(location);
      if (localePrefix) {
        const doubleLocale = `${localePrefix}${localePrefix}/`;
        if (url.pathname.startsWith(doubleLocale)) {
          url.pathname = url.pathname.slice(localePrefix.length);
        }
      }
      return url.toString();
    } catch {
      return location;
    }
  }
  const raw = location.startsWith("/") ? location : `/${location}`;
  if (localePrefix) {
    const doubleLocale = `${localePrefix}${localePrefix}/`;
    if (raw.startsWith(doubleLocale)) {
      return `${origin}${raw.slice(localePrefix.length)}`;
    }
    if (raw === localePrefix || raw.startsWith(`${localePrefix}/`)) {
      return `${origin}${raw}`;
    }
  }
  return buildUrl(raw, origin, localePrefix);
}

/**
 * Строит полный URL из пути
 * @param {string} path
 * @param {string} origin
 * @param {string} localePrefix
 * @returns {string}
 */
export function buildUrl(path, origin, localePrefix) {
  const raw = path.startsWith("/") ? path : `/${path}`;
  let normalized = raw;
  if (!raw.startsWith("/api/")) {
    const [pathname, search] = raw.split("?", 2);
    const withSlash = pathname.endsWith("/") ? pathname : `${pathname}/`;
    normalized = search ? `${withSlash}?${search}` : withSlash;
  }
  if (normalized.startsWith("/api/")) {
    return `${origin}${normalized}`;
  }
  if (localePrefix) {
    return `${origin}${localePrefix}${normalized}`;
  }
  return `${origin}${normalized}`;
}

/**
 * Строит query string из объекта параметров
 * @param {Object} params
 * @returns {string}
 */
export function buildQuery(params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    search.append(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

/**
 * Проверяет является ли путь API маршрутом
 * @param {string} path
 * @returns {boolean}
 */
export function isApiRoute(path) {
  return path.startsWith("/api/");
}

/**
 * Извлекает локаль из BASE_URL
 * @param {string} baseUrl
 * @returns {string}
 */
export function extractLocalePrefix(baseUrl) {
  try {
    const base = new URL(baseUrl);
    const firstSegment = base.pathname.split("/").filter(Boolean)[0];
    if (firstSegment && /^[a-z]{2}$/i.test(firstSegment)) {
      return `/${firstSegment}`;
    }
  } catch {
    // ignore
  }
  return "";
}

/**
 * Выводит API base URL из BASE_URL
 * @param {string} baseUrl
 * @param {string} [apiBaseOverride]
 * @returns {string}
 */
export function inferApiBaseUrl(baseUrl, apiBaseOverride) {
  if (apiBaseOverride) return apiBaseOverride.replace(/\/+$/, "");

  try {
    const base = new URL(baseUrl);
    if (base.host.startsWith("client.")) {
      return `${base.protocol}//api.${base.host.slice("client.".length)}`;
    }
    return base.origin;
  } catch {
    return "";
  }
}
