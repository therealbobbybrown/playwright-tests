// tests/security/e2e/discovery/page-navigation.js
// Функции навигации по страницам для discovery

import { waitForAppReady } from "./ui-collectors.js";

/**
 * Кликает по первой найденной сущности и собирает данные
 * @param {import('@playwright/test').Page} page
 * @param {Object} options
 * @param {string} options.linkSelector - CSS селектор для ссылки
 * @param {string[]} options.rowSelectors - альтернативные селекторы строк
 * @param {RegExp} options.urlRe - регулярное выражение для ожидания URL
 * @param {Function} collectFromPage - функция сбора данных со страницы
 * @returns {Promise<boolean>}
 */
export async function clickFirstEntity(page, options, collectFromPage) {
  const { linkSelector, rowSelectors = [], urlRe } = options;

  if (linkSelector) {
    const link = page.locator(linkSelector).first();
    if ((await link.count()) > 0) {
      await Promise.all([
        urlRe
          ? page.waitForURL(urlRe, { timeout: 15_000 }).catch(() => null)
          : null,
        link.click({ timeout: 5_000 }).catch(() => null),
      ]);
      await waitForAppReady(page);
      await collectFromPage();
      return true;
    }
  }

  for (const selector of rowSelectors) {
    const row = page.locator(selector).first();
    if ((await row.count()) === 0) continue;

    const rowLink = row.locator("a[href]").first();
    const clickTarget = (await rowLink.count()) > 0 ? rowLink : row;

    await Promise.all([
      urlRe
        ? page.waitForURL(urlRe, { timeout: 15_000 }).catch(() => null)
        : null,
      clickTarget.click({ timeout: 5_000 }).catch(() => null),
    ]);
    await waitForAppReady(page);
    await collectFromPage();
    return true;
  }

  return false;
}

/**
 * Кликает по активному Performance Review
 * @param {import('@playwright/test').Page} page
 * @param {Map<string, string>} collectedParams
 * @returns {Promise<boolean>}
 */
export async function clickActivePerformanceReview(page, collectedParams) {
  const activeInner = page
    .locator('[class*="PerformanceReview_inner"]')
    .filter({
      has: page.locator('[class*="PerformanceReview_status--active"]'),
    })
    .first();
  if ((await activeInner.count()) === 0) return false;

  const link = activeInner
    .locator('xpath=../a[contains(@class,"PerformanceReview_link")]')
    .first();
  if ((await link.count()) === 0) return false;

  await Promise.all([
    page
      .waitForURL(/\/manager\/performance-reviews\/[^/]+/i, { timeout: 15_000 })
      .catch(() => null),
    link.click({ timeout: 5_000 }).catch(() => null),
  ]);

  await waitForAppReady(page);
  const match = new URL(page.url()).pathname.match(
    /\/manager\/performance-reviews\/([^/]+)/i,
  );
  if (match?.[1]) {
    collectedParams.set("performanceReviewId", decodeURIComponent(match[1]));
  }
  return true;
}

/**
 * Посещает страницу и собирает данные
 * @param {string} name - название для логирования
 * @param {Function} navigate - функция навигации
 * @param {import('@playwright/test').Page} page
 * @param {Function} collectFromPage - функция сбора данных
 * @param {Function} afterNavigate - опциональная функция после навигации
 */
export async function visitAndCollect(
  name,
  navigate,
  page,
  collectFromPage,
  afterNavigate,
) {
  let response = null;
  try {
    response = await navigate();
  } catch {
    // ignore navigation failures for discovery
  }

  const status = response?.status?.();
  if (status && status >= 400) {
    await page
      .waitForLoadState("domcontentloaded", { timeout: 10_000 })
      .catch(() => null);
    await collectFromPage().catch(() => null);
    return;
  }

  await waitForAppReady(page);
  await collectFromPage();

  if (afterNavigate) {
    await afterNavigate();
    await collectFromPage();
  }
}

/**
 * Прикрепляет скриншот ошибки к тесту
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').TestInfo} testInfo
 * @param {string} name
 */
export async function attachErrorScreenshot(
  page,
  testInfo,
  name = "error-screenshot",
) {
  if (!page || !testInfo) return;
  const buffer = await page.screenshot({ fullPage: true }).catch(() => null);
  if (!buffer) return;
  await testInfo.attach(name, { body: buffer, contentType: "image/png" });
}
