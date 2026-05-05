// tests/security/e2e/discovery/ui-collectors.js
// Функции сбора данных из UI для тестов безопасности

/**
 * Собирает параметры из pathname используя dynamic matchers
 * @param {string} pathname
 * @param {Function} normalizePath - функция нормализации пути
 * @param {Array} dynamicMatchers - массив matchers с regex и keys
 * @param {Map<string, string>} collectedParams
 */
export function collectFromPath(
  pathname,
  normalizePath,
  dynamicMatchers,
  collectedParams,
) {
  const normalized = normalizePath(pathname);

  for (const matcher of dynamicMatchers) {
    const match = normalized.match(matcher.regex);
    if (!match) continue;

    matcher.keys.forEach((key, index) => {
      if (!collectedParams.has(key)) {
        collectedParams.set(key, decodeURIComponent(match[index + 1]));
      }
    });
  }
}

/**
 * Создаёт функцию collectFromValue с замыканием на необходимые зависимости
 * @param {string} origin
 * @param {Array} dynamicMatchers
 * @param {Map<string, string>} dynamicKeys
 * @param {Map<string, string>} collectedParams
 * @param {Function} normalizePath
 * @returns {Function}
 */
export function createCollectFromValue(
  origin,
  dynamicMatchers,
  dynamicKeys,
  collectedParams,
  normalizePath,
) {
  const collectFromPathFn = (pathname) => {
    collectFromPath(pathname, normalizePath, dynamicMatchers, collectedParams);
  };

  const collectFromValue = (value) => {
    if (value == null) return;

    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) return;

      try {
        const url = new URL(trimmed, origin);
        collectFromPathFn(url.pathname);
      } catch {
        if (trimmed.startsWith("/")) {
          collectFromPathFn(trimmed);
        }
      }

      for (const matcher of dynamicMatchers) {
        const matches = trimmed.matchAll(matcher.searchRegex);
        for (const match of matches) {
          matcher.keys.forEach((key, index) => {
            if (!collectedParams.has(key)) {
              collectedParams.set(key, decodeURIComponent(match[index + 1]));
            }
          });
        }
      }

      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item) => collectFromValue(item));
      return;
    }

    if (typeof value === "object") {
      for (const [rawKey, rawValue] of Object.entries(value)) {
        const normalizedKey = rawKey.toLowerCase().replace(/[-_]/g, "");
        const dynamicKey = dynamicKeys.get(normalizedKey);
        if (
          dynamicKey &&
          (typeof rawValue === "string" || typeof rawValue === "number")
        ) {
          if (!collectedParams.has(dynamicKey)) {
            collectedParams.set(dynamicKey, String(rawValue));
          }
        }

        collectFromValue(rawValue);
      }
    }
  };

  return collectFromValue;
}

/**
 * Собирает параметры из текста страницы
 * @param {import('@playwright/test').Page} page
 * @param {Array} dynamicMatchers
 * @param {Map<string, string>} collectedParams
 */
export async function collectFromText(page, dynamicMatchers, collectedParams) {
  const text = await page.evaluate(() => document.body?.innerText ?? "");
  if (!text) return;

  for (const matcher of dynamicMatchers) {
    const matches = text.matchAll(matcher.searchRegex);
    for (const match of matches) {
      matcher.keys.forEach((key, index) => {
        if (!collectedParams.has(key)) {
          collectedParams.set(key, decodeURIComponent(match[index + 1]));
        }
      });
    }
  }
}

/**
 * Собирает параметры со страницы (URL, hrefs, текст)
 * @param {import('@playwright/test').Page} page
 * @param {string} origin
 * @param {Array} dynamicMatchers
 * @param {Map<string, string>} collectedParams
 * @param {Function} normalizePath
 */
export async function collectFromPage(
  page,
  origin,
  dynamicMatchers,
  collectedParams,
  normalizePath,
) {
  try {
    collectFromPath(
      new URL(page.url()).pathname,
      normalizePath,
      dynamicMatchers,
      collectedParams,
    );

    const hrefs = await page.evaluate(() => {
      return Array.from(document.querySelectorAll("[href], [data-href]"))
        .map(
          (anchor) =>
            anchor.getAttribute("href") ||
            anchor.getAttribute("data-href") ||
            anchor.href,
        )
        .filter(Boolean);
    });

    for (const href of hrefs) {
      try {
        const url = new URL(href, origin);
        collectFromPath(
          url.pathname,
          normalizePath,
          dynamicMatchers,
          collectedParams,
        );
      } catch {
        // ignore malformed hrefs
      }
    }

    await collectFromText(page, dynamicMatchers, collectedParams);
  } catch {
    // ignore navigation/context errors during collection
  }
}

/**
 * Прикрепляет обработчики сетевых событий для сбора данных
 * @param {import('@playwright/test').Page} page
 * @param {Function} collectFromValue
 * @param {boolean} discoveryEnabled
 */
export function attachNetworkCollectors(
  page,
  collectFromValue,
  discoveryEnabled,
) {
  page.on("response", async (response) => {
    collectFromValue(response.url());

    const headers = response.headers();
    const contentType = headers["content-type"] || "";
    if (!contentType.includes("application/json")) return;

    try {
      const data = await response.json();
      collectFromValue(data);
    } catch {
      // ignore json parse errors
    }
  });

  if (discoveryEnabled) {
    page.on("request", (request) => {
      collectFromValue(request.url());
      const postData = request.postData();
      if (postData) {
        collectFromValue(postData);
      }
    });
  }
}

/**
 * Ожидает готовности приложения
 * @param {import('@playwright/test').Page} page
 */
export async function waitForAppReady(page) {
  await page
    .waitForLoadState("domcontentloaded", { timeout: 20_000 })
    .catch(() => null);
  await page
    .waitForLoadState("networkidle", { timeout: 15_000 })
    .catch(() => null);
  await page.waitForTimeout(750);
}
