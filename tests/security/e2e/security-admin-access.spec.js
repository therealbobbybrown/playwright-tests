// tests/security/e2e/admin-access.spec.js
import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import { allure } from "allure-playwright";
import { markAsUITest, MODULES } from "../../utils/allure-helpers.js";
import { SideMenu } from "../../../pages/SideMenu.js";

// Extracted utilities
import {
  toEnvKey,
  stripLocale,
  normalizePath,
  resolveRedirectLocation,
  buildUrl,
  buildQuery,
  isApiRoute,
  extractLocalePrefix,
  inferApiBaseUrl,
} from "./utils/url-helpers.js";
import {
  createDynamicMatchers,
  createDynamicKeys,
  extractParamsFromTemplate,
  resolveRoute,
  resolveTestUrl,
  buildDiscoveryReport,
} from "./utils/route-matchers.js";
import {
  getAuthHeaders,
  apiGet,
  apiPost,
  getFreshSurveyCode,
  getSurveyCodeType,
  pickFirstItem,
  extractId,
} from "./utils/api-helpers.js";
import {
  paramRefreshMap,
  refreshParamFromApi,
  validateOrRefreshParam,
} from "./utils/param-refresh.js";
import {
  routeTemplates,
  publicRoutes,
  expectedServerErrorRoutes,
  cacheConfig,
} from "./config/routes.js";
import {
  collectListEntities,
  collectAssessmentTemplate,
  collectFeedbackRequest,
  collectSurveyRevision,
  collectPerformanceReviewDetails,
  findNominationFromReviews,
  findRevisionUserFromReviews,
  collectDevelopmentPlanObjectives,
  collectDevelopmentPlanTemplateObjectives,
  collectIntegrationPlatform,
} from "./discovery/api-discovery.js";
import {
  collectFromPath,
  createCollectFromValue,
  collectFromText,
  collectFromPage as collectFromPageBase,
  attachNetworkCollectors as attachNetworkCollectorsBase,
  waitForAppReady,
} from "./discovery/ui-collectors.js";
import {
  clickFirstEntity as clickFirstEntityBase,
  clickActivePerformanceReview as clickActivePerformanceReviewBase,
  visitAndCollect as visitAndCollectBase,
  attachErrorScreenshot,
} from "./discovery/page-navigation.js";
import {
  fetchRoute,
  getStatusGroup,
  getOutcome,
  createStatusReport,
  checkPageForErrors,
  getRoleParams,
} from "./testing/route-checker.js";

const baseUrl = process.env.BASE_URL;
if (!baseUrl) {
  throw new Error("BASE_URL is required for security route checks.");
}

const base = new URL(baseUrl);
const origin = base.origin;
const localePrefix = extractLocalePrefix(baseUrl);

// Use extracted utilities for dynamic matchers
const dynamicMatchers = createDynamicMatchers(routeTemplates);
const dynamicKeys = createDynamicKeys(dynamicMatchers);

const collectedParams = new Map();
const unavailableParams = new Set();
const discoveryEnabled = process.env.SECURITY_DISCOVERY === "1";
const FORCE_REFRESH_CACHE = process.env.SECURITY_REFRESH_CACHE === "1";
const apiBaseOverride = process.env.API_BASE_URL;
const discoveryMeta = {
  apiBase: null,
  authTokenFound: false,
  cookieNames: [],
  apiCalls: [],
};
const forbiddenRoutes = new Set();
const redirectRoutes = new Map();
const statusReport = new Map();

function getRoleLabel(testInfo) {
  const name =
    typeof testInfo === "string" ? testInfo : (testInfo?.project?.name ?? "");
  if (!name) return "";
  if (/security-user/i.test(name)) return "user";
  if (/security/i.test(name)) return "admin";
  return name;
}

const projectRoleLabel = getRoleLabel(process.env.PW_TEST_PROJECT_NAME ?? "");
const roleTitle =
  projectRoleLabel === "user"
    ? "Пользователь"
    : projectRoleLabel === "admin"
      ? "Администратор"
      : projectRoleLabel || "Администратор";

// Wrapper functions that use extracted utilities with module-level constants
function _inferApiBaseUrl() {
  return inferApiBaseUrl(baseUrl, apiBaseOverride);
}

function _normalizePath(pathname) {
  return normalizePath(pathname, localePrefix);
}

function _resolveRedirectLocation(location) {
  return resolveRedirectLocation(location, origin, localePrefix);
}

function _buildUrl(path) {
  return buildUrl(path, origin, localePrefix);
}

// attachErrorScreenshot is now imported from discovery/page-navigation.js

async function loadIdCache() {
  if (FORCE_REFRESH_CACHE) {
    console.log("[security] SECURITY_REFRESH_CACHE=1, skipping cache");
    return;
  }

  try {
    const stat = await fs.stat(cacheConfig.idCachePath);
    const ageMs = Date.now() - stat.mtimeMs;
    if (ageMs > cacheConfig.ttlMs) {
      // Кеш устарел — игнорируем и пересобираем данные
      console.log(
        `[security] Cache expired (age: ${Math.round(ageMs / 60000)} min), will refresh`,
      );
      return;
    }

    const raw = await fs.readFile(cacheConfig.idCachePath, "utf8");
    const parsed = JSON.parse(raw);
    const cacheForBase = parsed?.[baseUrl] ?? parsed?.[origin];
    if (cacheForBase && typeof cacheForBase === "object") {
      // Не загружаем code из кеша — он всегда должен быть свежим
      for (const [key, value] of Object.entries(cacheForBase)) {
        if (key === "code") continue; // JWT токены не кешируем
        if (!collectedParams.has(key)) {
          collectedParams.set(key, String(value));
        }
      }
    }
  } catch {
    // cache is optional
  }
}

async function saveIdCache() {
  let cache = {};
  try {
    const raw = await fs.readFile(cacheConfig.idCachePath, "utf8");
    cache = JSON.parse(raw) ?? {};
  } catch {
    cache = {};
  }

  cache[baseUrl] = Object.fromEntries(collectedParams.entries());
  await fs.mkdir("test-results", { recursive: true });
  await fs.writeFile(
    cacheConfig.idCachePath,
    JSON.stringify(cache, null, 2),
    "utf8",
  );
}

// Wrapper for collectFromPath with module-level state
function _collectFromPath(pathname) {
  collectFromPath(pathname, _normalizePath, dynamicMatchers, collectedParams);
}

// Create collectFromValue using factory with module-level state
const collectFromValue = createCollectFromValue(
  origin,
  dynamicMatchers,
  dynamicKeys,
  collectedParams,
  _normalizePath,
);

// Wrapper for collectFromPage with module-level state
async function _collectFromPage(page) {
  await collectFromPageBase(
    page,
    origin,
    dynamicMatchers,
    collectedParams,
    _normalizePath,
  );
}

// collectFromText is now part of collectFromPageBase (imported from ui-collectors.js)

// Wrapper for attachNetworkCollectors with module-level state
function _attachNetworkCollectors(page) {
  attachNetworkCollectorsBase(page, collectFromValue, discoveryEnabled);
}

// waitForAppReady is now imported from discovery/ui-collectors.js

// Wrapper for clickFirstEntity with module-level state
async function _clickFirstEntity(page, options) {
  return clickFirstEntityBase(page, options, () => _collectFromPage(page));
}

// Wrapper for clickActivePerformanceReview with module-level state
async function _clickActivePerformanceReview(page) {
  return clickActivePerformanceReviewBase(page, collectedParams);
}

// Wrapper for visitAndCollect with module-level state
async function _visitAndCollect(name, navigate, page, afterNavigate) {
  await visitAndCollectBase(
    name,
    navigate,
    page,
    () => _collectFromPage(page),
    afterNavigate,
  );
}

// Wrapper functions that use extracted utilities with module-level state
function _resolveRoute(template) {
  return resolveRoute(template, collectedParams, unavailableParams);
}

function _resolveTestUrl(template) {
  return resolveTestUrl(template, collectedParams, unavailableParams);
}

function _buildDiscoveryReport() {
  return buildDiscoveryReport(routeTemplates, collectedParams, discoveryMeta);
}

// isApiRoute, buildQuery are now imported from url-helpers.js
// getAuthHeaders, apiGet, apiPost, getFreshSurveyCode, getSurveyCodeType, pickFirstItem, extractId
// are now imported from api-helpers.js
// paramRefreshMap, refreshParamFromApi, validateOrRefreshParam are now imported from param-refresh.js

// Wrapper functions that use imported utilities with module-level state
function _getAuthHeaders(page) {
  return getAuthHeaders(page, discoveryMeta);
}

function _apiGet(page, apiBase, path, query = {}) {
  return apiGet(page, apiBase, path, query, {
    discoveryMeta,
    collectFromValue,
  });
}

function _apiPost(page, apiBase, path, body = {}) {
  return apiPost(page, apiBase, path, body, {
    discoveryMeta,
    collectFromValue,
  });
}

function _getFreshSurveyCode(page, surveyId, codeType = "group") {
  const apiBase = discoveryMeta.apiBase;
  return getFreshSurveyCode(page, surveyId, codeType, apiBase, {
    discoveryMeta,
    collectFromValue,
  });
}

function _refreshParamFromApi(page, paramName) {
  const apiBase = discoveryMeta.apiBase;
  return refreshParamFromApi(page, paramName, apiBase, collectedParams, {
    discoveryMeta,
    collectFromValue,
  });
}

function _validateOrRefreshParam(page, paramName, currentValue) {
  const apiBase = discoveryMeta.apiBase;
  return validateOrRefreshParam(
    page,
    paramName,
    currentValue,
    apiBase,
    collectedParams,
    { discoveryMeta },
  );
}

// extractParamsFromTemplate is now imported from route-matchers.js

async function collectFromApi(page) {
  // Probe API base URL
  const inferred = _inferApiBaseUrl();
  const candidates = [
    inferred,
    inferred ? `${inferred}/api` : "",
    apiBaseOverride ? apiBaseOverride : "",
  ].filter(Boolean);

  let apiBase = "";
  for (const candidate of candidates) {
    const probe = await page.request
      .get(`${candidate}/status`, { timeout: 7_500, failOnStatusCode: false })
      .catch(() => null);
    if (probe && probe.status() < 500) {
      apiBase = candidate;
      break;
    }

    const fallback = await page.request
      .get(`${candidate}/health`, { timeout: 7_500, failOnStatusCode: false })
      .catch(() => null);
    if (fallback && fallback.status() < 500) {
      apiBase = candidate;
      break;
    }
  }

  discoveryMeta.apiBase = apiBase;
  if (!apiBase) return;

  // Create context for discovery functions
  const setParam = (key, value) => {
    if (value === undefined || value === null) return;
    if (!collectedParams.has(key)) {
      collectedParams.set(key, String(value));
    }
  };

  const ctx = {
    apiGet: (page, apiBase, path, query) => _apiGet(page, apiBase, path, query),
    apiPost: (page, apiBase, path, body) => _apiPost(page, apiBase, path, body),
    setParam,
    collectedParams,
    unavailableParams,
  };

  // Collect entities using extracted discovery functions
  await collectListEntities(ctx, page, apiBase);
  await collectAssessmentTemplate(ctx, page, apiBase);
  await collectFeedbackRequest(ctx, page, apiBase);
  await collectSurveyRevision(ctx, page, apiBase);
  await collectPerformanceReviewDetails(ctx, page, apiBase);
  await findNominationFromReviews(ctx, page, apiBase);
  await findRevisionUserFromReviews(ctx, page, apiBase);
  await collectDevelopmentPlanObjectives(ctx, page, apiBase);
  await collectDevelopmentPlanTemplateObjectives(ctx, page, apiBase);
  await collectIntegrationPlatform(ctx, page, apiBase);

  // Set default fallback values
  if (!collectedParams.has("platformName")) {
    setParam("platformName", "google");
  }
  if (!collectedParams.has("service")) {
    setParam("service", "google");
  }
  if (!collectedParams.has("entity")) {
    setParam("entity", "users");
  }
  if (!collectedParams.has("entityType") && collectedParams.has("entityId")) {
    collectedParams.set("entityType", "department");
  }
  if (!collectedParams.has("tab")) {
    collectedParams.set("tab", "transfers");
  }
  if (!collectedParams.has("alias")) {
    collectedParams.set("alias", "cookies");
  }
  if (!collectedParams.has("name")) {
    collectedParams.set("name", "of-employees");
  }
}

test.describe("Security - admin access @ui @security", () => {
  test.describe.configure({ timeout: 30 * 60_000 });
  test.beforeEach(() => {
    markAsUITest(MODULES.SECURITY, "Admin Access");
  });
  test.beforeAll(async ({ browser }, testInfo) => {
    testInfo.setTimeout(30 * 60_000);
    statusReport.clear();
    redirectRoutes.clear();
    forbiddenRoutes.clear();
    await loadIdCache();

    const context = await browser.newContext({
      storageState: "test-results/.auth/admin.json",
    });
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    page.setDefaultNavigationTimeout(10_000);
    _attachNetworkCollectors(page);

    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });

    const sideMenu = new SideMenu(page, { step: async (_title, fn) => fn() });

    await _visitAndCollect(
      "org-structure users",
      () => sideMenu.openStructureUsers(),
      page,
      async () => {
        await _clickFirstEntity(page, {
          linkSelector:
            'a[href*="/manager/structure/users/"]:not([href*="/add"])',
          rowSelectors: ["table tbody tr", '[role="row"]'],
          urlRe: /\/manager\/structure\/users\/[^/]+/i,
        });
      },
    );
    await _visitAndCollect(
      "org-structure departments",
      () => sideMenu.openStructureDepartments(),
      page,
      async () => {
        await _clickFirstEntity(page, {
          linkSelector: 'a[href*="/manager/structure/departments/"]',
          rowSelectors: ["table tbody tr", '[role="row"]'],
          urlRe: /\/manager\/structure\/departments\/[^/]+\/[^/]+/i,
        });
      },
    );
    await _visitAndCollect(
      "org-structure invite links",
      () => sideMenu.openStructureInviteLinks(),
      page,
      async () => {
        await _clickFirstEntity(page, {
          linkSelector: 'a[href*="/invite/"]',
        });
      },
    );
    await _visitAndCollect(
      "surveys list",
      () => sideMenu.openSurveysList(),
      page,
      async () => {
        await _clickFirstEntity(page, {
          linkSelector:
            'a[href*="/manager/company/surveys/"]:not([href*="/templates"])',
          rowSelectors: ["table tbody tr", '[role="row"]'],
          urlRe: /\/manager\/company\/surveys\/[^/]+/i,
        });
      },
    );
    await _visitAndCollect(
      "feedback view",
      () => sideMenu.openFeedbackView(),
      page,
      async () => {
        await _clickFirstEntity(page, {
          linkSelector: 'a[href*="/feedbacks/"]:not([href*="/add"])',
          rowSelectors: ["table tbody tr", '[role="row"]'],
          urlRe: /\/feedbacks\/[^/]+/i,
        });
      },
    );
    await _visitAndCollect(
      "feedback of employees",
      () => sideMenu.openFeedbackOfEmployees(),
      page,
    );
    await _visitAndCollect(
      "feedback request",
      () => sideMenu.openFeedbackRequest(),
      page,
    );
    await _visitAndCollect(
      "requests list",
      () =>
        page.goto(_buildUrl("/requests"), { waitUntil: "domcontentloaded" }),
      page,
      async () => {
        await _clickFirstEntity(page, {
          linkSelector: 'a[href*="/requests/"]:not([href*="/add"])',
          rowSelectors: ["table tbody tr", '[role="row"]'],
          urlRe: /\/requests\/[^/]+/i,
        });
      },
    );
    await _visitAndCollect(
      "requests feed",
      () =>
        page.goto(_buildUrl("/requests/feed/of-employees"), {
          waitUntil: "domcontentloaded",
        }),
      page,
    );

    await _visitAndCollect(
      "development plans",
      () =>
        page.goto(_buildUrl("/development-plans"), {
          waitUntil: "domcontentloaded",
        }),
      page,
      async () => {
        await _clickFirstEntity(page, {
          linkSelector:
            'a[href*="/development-plans/"]:not([href*="/templates"]):not([href*="/add"])',
          rowSelectors: ["table tbody tr", '[role="row"]'],
          urlRe: /\/development-plans\/[^/]+/i,
        });
      },
    );
    await _visitAndCollect(
      "development templates",
      () =>
        page.goto(_buildUrl("/development-plans/templates"), {
          waitUntil: "domcontentloaded",
        }),
      page,
      async () => {
        await _clickFirstEntity(page, {
          linkSelector:
            'a[href*="/development-plans/templates/"]:not([href*="/add"])',
          rowSelectors: ["table tbody tr", '[role="row"]'],
          urlRe: /\/development-plans\/templates\/[^/]+/i,
        });
      },
    );
    await _visitAndCollect(
      "performance reviews",
      () =>
        page.goto(_buildUrl("/manager/performance-reviews"), {
          waitUntil: "domcontentloaded",
        }),
      page,
      async () => {
        const clicked = await _clickActivePerformanceReview(page);
        if (!clicked) {
          await _clickFirstEntity(page, {
            linkSelector:
              'a[href*="/manager/performance-reviews/"]:not([href*="/results"])',
            rowSelectors: ["table tbody tr", '[role="row"]'],
            urlRe: /\/manager\/performance-reviews\/[^/]+/i,
          });
        }
      },
    );
    await _visitAndCollect(
      "assessments",
      () =>
        page.goto(_buildUrl("/manager/assessments"), {
          waitUntil: "domcontentloaded",
        }),
      page,
      async () => {
        await _clickFirstEntity(page, {
          linkSelector:
            'a[href*="/manager/assessments/"]:not([href*="/templates"])',
          rowSelectors: ["table tbody tr", '[role="row"]'],
          urlRe: /\/manager\/assessments\/[^/]+/i,
        });
      },
    );
    await _visitAndCollect(
      "assessment templates",
      () =>
        page.goto(_buildUrl("/manager/assessments/templates"), {
          waitUntil: "domcontentloaded",
        }),
      page,
      async () => {
        await _clickFirstEntity(page, {
          linkSelector: 'a[href*="/manager/assessments/templates/"]',
          rowSelectors: ["table tbody tr", '[role="row"]'],
          urlRe: /\/manager\/assessments\/templates\/[^/]+/i,
        });
      },
    );
    await _visitAndCollect(
      "competencies",
      () =>
        page.goto(_buildUrl("/manager/competencies"), {
          waitUntil: "domcontentloaded",
        }),
      page,
      async () => {
        await _clickFirstEntity(page, {
          linkSelector: 'a[href*="/manager/competencies/"]:not([href*="/add"])',
          rowSelectors: ["table tbody tr", '[role="row"]'],
          urlRe: /\/manager\/competencies\/[^/]+/i,
        });
      },
    );
    await _visitAndCollect(
      "competence scales",
      () =>
        page.goto(_buildUrl("/manager/competence-scales"), {
          waitUntil: "domcontentloaded",
        }),
      page,
      async () => {
        await _clickFirstEntity(page, {
          linkSelector: 'a[href*="/manager/competence-scales/"]',
          rowSelectors: ["table tbody tr", '[role="row"]'],
          urlRe: /\/manager\/competence-scales\/[^/]+/i,
        });
      },
    );
    await _visitAndCollect(
      "development actions",
      () =>
        page.goto(_buildUrl("/manager/development-actions"), {
          waitUntil: "domcontentloaded",
        }),
      page,
      async () => {
        await _clickFirstEntity(page, {
          linkSelector:
            'a[href*="/manager/development-actions/"]:not([href*="/add"])',
          rowSelectors: ["table tbody tr", '[role="row"]'],
          urlRe: /\/manager\/development-actions\/[^/]+/i,
        });
      },
    );
    await _visitAndCollect(
      "manager roles",
      () =>
        page.goto(_buildUrl("/manager/company/roles"), {
          waitUntil: "domcontentloaded",
        }),
      page,
      async () => {
        await _clickFirstEntity(page, {
          linkSelector: 'a[href*="/manager/company/roles/"]',
          rowSelectors: ["table tbody tr", '[role="row"]'],
          urlRe: /\/manager\/company\/roles\/[^/]+/i,
        });
      },
    );
    await _visitAndCollect(
      "company surveys",
      () =>
        page.goto(_buildUrl("/manager/company/surveys"), {
          waitUntil: "domcontentloaded",
        }),
      page,
      async () => {
        await _clickFirstEntity(page, {
          linkSelector:
            'a[href*="/manager/company/surveys/"]:not([href*="/templates"])',
          rowSelectors: ["table tbody tr", '[role="row"]'],
          urlRe: /\/manager\/company\/surveys\/[^/]+/i,
        });
      },
    );
    await _visitAndCollect(
      "company integrations",
      () =>
        page.goto(_buildUrl("/manager/company/integrations"), {
          waitUntil: "domcontentloaded",
        }),
      page,
    );
    await _visitAndCollect(
      "company import",
      () =>
        page.goto(_buildUrl("/manager/company"), {
          waitUntil: "domcontentloaded",
        }),
      page,
    );
    await _visitAndCollect(
      "karma",
      () =>
        page.goto(_buildUrl("/manager/karma/transfers/deposit"), {
          waitUntil: "domcontentloaded",
        }),
      page,
    );
    await _visitAndCollect("profile", () => sideMenu.openMyProfile(), page);
    await _visitAndCollect(
      "policies cookies",
      () =>
        page.goto(_buildUrl("/policies/cookies"), {
          waitUntil: "domcontentloaded",
        }),
      page,
    );

    // Gift shop discovery
    await _visitAndCollect(
      "gift-shop gifts",
      () =>
        page.goto(_buildUrl("/manager/gift-shop/gifts"), {
          waitUntil: "domcontentloaded",
        }),
      page,
      async () => {
        await _clickFirstEntity(page, {
          linkSelector:
            'a[href*="/manager/gift-shop/gifts/"]:not([href*="/add"])',
          rowSelectors: ["table tbody tr", '[role="row"]'],
          urlRe: /\/manager\/gift-shop\/gifts\/[^/]+/i,
        });
      },
    );

    // NineBox - только settings, без отдельных ID страниц
    await _visitAndCollect(
      "ninebox settings",
      () =>
        page.goto(_buildUrl("/manager/ninebox/settings"), {
          waitUntil: "domcontentloaded",
        }),
      page,
    );

    // User groups discovery
    await _visitAndCollect(
      "user-groups list",
      () =>
        page.goto(_buildUrl("/manager/structure/user-groups"), {
          waitUntil: "domcontentloaded",
        }),
      page,
      async () => {
        await _clickFirstEntity(page, {
          linkSelector:
            'a[href*="/manager/structure/user-groups/"]:not([href*="/add"])',
          rowSelectors: ["table tbody tr", '[role="row"]'],
          urlRe: /\/manager\/structure\/user-groups\/[^/]+/i,
        });
      },
    );

    // Survey templates discovery
    await _visitAndCollect(
      "survey templates",
      () =>
        page.goto(_buildUrl("/manager/company/surveys/templates"), {
          waitUntil: "domcontentloaded",
        }),
      page,
      async () => {
        await _clickFirstEntity(page, {
          linkSelector: 'a[href*="/manager/company/surveys/templates/"]',
          rowSelectors: ["table tbody tr", '[role="row"]'],
          urlRe: /\/manager\/company\/surveys\/templates\/[^/]+/i,
        });
      },
    );

    await collectFromApi(page);

    await saveIdCache();
    await context.close();
  });

  test.afterAll(async ({}, testInfo) => {
    await fs.mkdir("test-results", { recursive: true });
    await saveIdCache();

    if (discoveryEnabled) {
      const report = _buildDiscoveryReport();
      await fs.writeFile(
        cacheConfig.discoveryReportPath,
        JSON.stringify(report, null, 2),
        "utf8",
      );
    }

    if (
      /security/i.test(testInfo.project.name) &&
      !/chromium-security$/i.test(testInfo.project.name)
    ) {
      const safeName = testInfo.project.name.replace(/[^a-z0-9_-]+/gi, "-");
      await fs.writeFile(
        `test-results/security-forbidden-${safeName}.json`,
        JSON.stringify(
          { forbidden: Array.from(forbiddenRoutes).sort() },
          null,
          2,
        ),
        "utf8",
      );
      await fs.writeFile(
        `test-results/security-redirects-${safeName}.json`,
        JSON.stringify(Object.fromEntries(redirectRoutes.entries()), null, 2),
        "utf8",
      );
    }

    const safeName = testInfo.project.name.replace(/[^a-z0-9_-]+/gi, "-");
    await fs.writeFile(
      `test-results/security-status-${safeName}.json`,
      JSON.stringify(Object.fromEntries(statusReport.entries()), null, 2),
      "utf8",
    );

    const role = getRoleLabel(testInfo);
    const summary = {
      role,
      forbidden: Array.from(forbiddenRoutes).sort(),
      redirects: Object.fromEntries(redirectRoutes.entries()),
      status: Object.fromEntries(statusReport.entries()),
    };
    allure.attachment(
      `security-summary-${role}`,
      JSON.stringify(summary, null, 2),
      "application/json",
    );

    try {
      const envLines = [
        `BASE_URL=${baseUrl}`,
        `PROJECT=${testInfo.project.name}`,
        `ROLE=${role}`,
      ];
      await fs.mkdir("allure-results", { recursive: true });
      await fs.writeFile(
        "allure-results/environment.properties",
        `${envLines.join("\n")}\n`,
        "utf8",
      );
    } catch {
      // optional
    }
  });

  for (const template of routeTemplates) {
    test(`Проверка доступа ${template}`, async ({ page }, testInfo) => {
      // Для маршрутов с :code получаем свежий токен (JWT имеет короткий TTL ~2 мин)
      const codeType = getSurveyCodeType(template);
      if (codeType && template.includes(":code")) {
        const surveyId = collectedParams.get("surveyId");
        if (surveyId) {
          // Сначала навигируемся на страницу, чтобы localStorage был доступен
          const baseUrl = process.env.BASE_URL;
          await page
            .goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 15_000 })
            .catch(() => {});
          const freshCode = await _getFreshSurveyCode(page, surveyId, codeType);
          if (freshCode) {
            collectedParams.set("code", freshCode);
          }
        }
      }

      let { resolved, missing } = _resolveTestUrl(template);
      test.skip(
        missing.length > 0,
        `Set env vars to resolve params: ${missing.join(", ")}`,
      );

      // Валидируем ID из кеша и обновляем если получаем 404
      const templateParams = extractParamsFromTemplate(template);
      const refreshableParams = templateParams.filter(
        (p) => paramRefreshMap[p],
      );
      if (refreshableParams.length > 0) {
        // Убедимся что страница загружена для API запросов
        if (page.url() === "about:blank") {
          const baseUrl = process.env.BASE_URL;
          await page
            .goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 15_000 })
            .catch(() => {});
        }

        let needResolve = false;
        for (const paramName of refreshableParams) {
          const currentValue = collectedParams.get(paramName);
          if (currentValue) {
            const isValid = await _validateOrRefreshParam(
              page,
              paramName,
              currentValue,
            );
            if (!isValid) {
              // Не удалось получить новый ID — пропускаем тест
              test.skip(true, `Could not refresh ${paramName}`);
              return;
            }
            if (collectedParams.get(paramName) !== currentValue) {
              needResolve = true; // ID обновился

              // Если обновился surveyId — нужно также обновить revisionAlias
              if (
                paramName === "surveyId" &&
                template.includes(":revisionAlias")
              ) {
                const newSurveyId = collectedParams.get("surveyId");
                const apiBase = discoveryMeta.apiBase;
                if (newSurveyId && apiBase) {
                  // Получаем revisionAlias для нового surveyId
                  const revision = await _apiGet(
                    page,
                    apiBase,
                    `/private/surveys/${newSurveyId}/revisions/last`,
                  );
                  if (revision) {
                    const newRevision =
                      revision.alias ?? revision.revisionAlias ?? revision.id;
                    if (newRevision) {
                      collectedParams.set("revisionAlias", String(newRevision));
                      console.log(
                        `[security] Refreshed revisionAlias for surveyId=${newSurveyId}: ${newRevision}`,
                      );
                    }
                  }
                }
              }
            }
          }
        }

        // Пересчитываем URL если ID обновились
        if (needResolve) {
          const updated = _resolveTestUrl(template);
          resolved = updated.resolved;
        }
      }

      const roleLabel = getRoleLabel(testInfo.project.name);
      const isUserProject =
        /security/i.test(testInfo.project.name) &&
        !/chromium-security$/i.test(testInfo.project.name);
      const isPublicRoute = publicRoutes.has(template);
      const allowForbidden = isUserProject && !isPublicRoute;
      const strictAccess = !allowForbidden;
      const navigationTimeout = allowForbidden ? 12_000 : 20_000;
      page.setDefaultTimeout(navigationTimeout);
      page.setDefaultNavigationTimeout(navigationTimeout);
      allure.label("role", roleLabel);
      allure.parameter("role", roleLabel);
      allure.parameter(
        "expected",
        allowForbidden ? "non-200 allowed" : "200 expected",
      );
      testInfo.annotations.push({
        type: "role",
        description: roleLabel,
      });
      testInfo.annotations.push({
        type: "expectation",
        description: allowForbidden ? "non-200 acceptable" : "200 only",
      });

      const url = _buildUrl(resolved);
      const response = await fetchRoute(page, url, {
        allowForbidden,
        resolved,
        resolveRedirectLocation: _resolveRedirectLocation,
        redirectRoutes,
      });

      expect(response, `No response for ${resolved}`).not.toBeNull();
      if (!response) return;

      const status = response.status();
      const locationHeader = response.headers()["location"];
      if (locationHeader) {
        const resolvedLocation = _resolveRedirectLocation(locationHeader);
        redirectRoutes.set(resolved, resolvedLocation);
      }
      const redirectLocation = redirectRoutes.get(resolved);
      const statusGroup = getStatusGroup(status);
      const outcome = getOutcome(status, allowForbidden, redirectLocation);
      statusReport.set(
        resolved,
        createStatusReport({
          status,
          redirectLocation,
          roleLabel,
          strictAccess,
        }),
      );

      allure.parameter("httpStatus", status);
      allure.parameter("outcome", outcome);
      allure.label("statusGroup", statusGroup);
      if (allowForbidden) {
        allure.parentSuite("Security access (user)");
        allure.suite(`Status ${status}`);
      } else {
        allure.parentSuite("Security access (admin)");
      }
      if (!strictAccess) {
        if (status === 403) {
          forbiddenRoutes.add(resolved);
        }
        allure.step(
          `Status ${status} (role=${getRoleLabel(testInfo)})`,
          () => {},
        );
        if (status >= 400 && status !== 403 && !isApiRoute(resolved)) {
          await attachErrorScreenshot(page, testInfo, `error-${status}`);
        }
        if (status >= 300) return;
      } else {
        if (status >= 300 && status < 400) {
          const location =
            redirectRoutes.get(resolved) ??
            response.headers()["location"] ??
            page.url();
          redirectRoutes.set(resolved, location);
          allure.step(
            `Redirect ${status} -> ${location ?? "unknown"} (role=${getRoleLabel(testInfo)})`,
            () => {},
          );
          return;
        }
        if (status >= 400) {
          if (!isApiRoute(resolved)) {
            await attachErrorScreenshot(page, testInfo, `error-${status}`);
          }
          // Для маршрутов с ожидаемыми 500 ошибками — не фейлим тест
          if (status === 500 && expectedServerErrorRoutes.has(template)) {
            allure.step(
              `Expected 500 for ${template} (known limitation)`,
              () => {},
            );
            return;
          }
          expect(status, `Unexpected status for ${resolved}`).toBeLessThan(300);
          allure.step(
            `Status ${status} (role=${getRoleLabel(testInfo)})`,
            () => {},
          );
          return;
        }
        allure.step(
          `Status ${status} (role=${getRoleLabel(testInfo)})`,
          () => {},
        );
      }

      if (!isApiRoute(resolved)) {
        await checkPageForErrors(page, resolved, _normalizePath, expect);
      }
    });
  }
});
