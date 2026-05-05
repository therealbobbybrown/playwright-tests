// @ts-check
// tests/load/dashboard/dashboard-large-data.spec.js
// Нагрузочные тесты дашборда PR при большом количестве участников
// @tags @load @dashboard @pr

import { test as base, expect } from "@playwright/test";
import { PerformanceReviewAPI, getCredentials } from "../../utils/api/index.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
  allure,
} from "../../utils/allure-helpers.js";
import {
  measureTime,
  measureTimeStats,
  measureParallel,
  sustainedLoad,
  formatStats,
} from "../utils/measure-time.js";
import { LOAD_TEST_CONFIG } from "../seed/seed-config.js";

const { thresholds } = LOAD_TEST_CONFIG;

const test = base.extend({
  prAPI: async ({ request }, use) => {
    const api = new PerformanceReviewAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
});

// ==================== HELPERS ====================

async function fetchTargetUserIds(prAPI, prId, maxCount = 500) {
  const ids = [];
  let offset = 0;
  const limit = 100;

  while (ids.length < maxCount) {
    const { response, data } = await prAPI.getDashboardFiltersTargetUsers(
      prId,
      { limit, offset },
    );
    if (!response.ok()) break;
    const items = data?.items || data || [];
    if (items.length === 0) break;
    ids.push(...items.map((u) => u.id));
    offset += limit;
    if (items.length < limit) break;
  }

  return ids.slice(0, maxCount);
}

// ==================== SUITE 1: DASHBOARD BASELINE ====================

test.describe("Dashboard Large PR - Baseline @load @baseline @dashboard", () => {
  // Использует largePrId (10k участников, без ответов) или любой доступный PR
  let prId;
  let revisionId;

  test.beforeAll(async ({ request }) => {
    const api = new PerformanceReviewAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);

    prId = LOAD_TEST_CONFIG.largePrId;

    if (!prId) {
      // Fallback: берём первый PR из списка
      const { data } = await api.getList({ limit: 1 });
      prId = data?.items?.[0]?.id;
    }

    if (prId) {
      // Получаем revisionId — он обязателен для getDashboard
      const { data: revisionsData } =
        await api.getDashboardFiltersRevisions(prId);
      const revisions = revisionsData?.items || revisionsData || [];
      revisionId = revisions[0]?.id;
      console.log(
        `   Dashboard baseline: PR ${prId}, revision ${revisionId || "нет"}`,
      );
    }
  });

  test.beforeEach(() => {
    markAsAPITest(MODULES.PERFORMANCE_REVIEW, "Dashboard Large - Baseline");
    if (!prId) {
      test.skip(true, "Нет PR для тестов дашборда");
    }
  });

  test("BASELINE: getDashboard — 5 замеров @critical", async ({ prAPI }) => {
    setSeverity("critical");

    if (!revisionId) {
      test.skip(true, `PR ${prId} не имеет ревизий для getDashboard`);
      return;
    }

    const stats = await measureTimeStats(
      () => prAPI.getDashboard(prId, { revisionId, usersQuery: {} }),
      5,
    );

    allure.attachment("Dashboard Stats", formatStats(stats), "text/plain");
    console.log(`   getDashboard: ${formatStats(stats)}`);

    expect(
      stats.success,
      `getDashboard для PR ${prId} не вернул ни одного успешного ответа (200).`,
    ).toBe(true);
    expect(stats.avg, `Avg < ${thresholds.VERY_COMPLEX}ms`).toBeLessThan(
      thresholds.VERY_COMPLEX,
    );
  });

  test("BASELINE: getDashboardFiltersTargetUsers (limit=50) — 5 замеров", async ({
    prAPI,
  }) => {
    setSeverity("normal");

    const stats = await measureTimeStats(
      () => prAPI.getDashboardFiltersTargetUsers(prId, { limit: 50 }),
      5,
    );

    allure.attachment(
      "Target Users Filter Stats",
      formatStats(stats),
      "text/plain",
    );
    console.log(`   getDashboardFiltersTargetUsers: ${formatStats(stats)}`);

    expect(stats.success, "API должен вернуть успешный ответ").toBe(true);
    expect(stats.avg, `Avg < ${thresholds.COMPLEX}ms`).toBeLessThan(
      thresholds.COMPLEX,
    );
  });

  test("BASELINE: getDashboardFiltersGroupsDepartments — 5 замеров", async ({
    prAPI,
  }) => {
    setSeverity("normal");

    const stats = await measureTimeStats(
      () => prAPI.getDashboardFiltersGroupsDepartments(prId),
      5,
    );

    allure.attachment(
      "Groups Departments Stats",
      formatStats(stats),
      "text/plain",
    );
    console.log(
      `   getDashboardFiltersGroupsDepartments: ${formatStats(stats)}`,
    );

    expect(stats.success, "API должен вернуть успешный ответ").toBe(true);
    expect(stats.avg, `Avg < ${thresholds.VERY_COMPLEX}ms`).toBeLessThan(
      thresholds.VERY_COMPLEX,
    );
  });

  test("BASELINE: getDashboardFiltersRevisions — 5 замеров", async ({
    prAPI,
  }) => {
    setSeverity("normal");

    const stats = await measureTimeStats(
      () => prAPI.getDashboardFiltersRevisions(prId),
      5,
    );

    allure.attachment("Revisions Stats", formatStats(stats), "text/plain");
    console.log(`   getDashboardFiltersRevisions: ${formatStats(stats)}`);

    expect(stats.success, "API должен вернуть успешный ответ").toBe(true);
    expect(stats.avg, `Avg < ${thresholds.COMPLEX}ms`).toBeLessThan(
      thresholds.COMPLEX,
    );
  });
});

// ==================== SUITE 2: DASHBOARD FILTERS VOLUME ====================

test.describe("Dashboard Filters - Volume @load @volume @dashboard", () => {
  let prId;

  test.beforeAll(async ({ request }) => {
    prId = LOAD_TEST_CONFIG.largePrId;

    if (!prId) {
      const api = new PerformanceReviewAPI(request);
      const { email, password } = getCredentials("admin");
      await api.signIn(email, password);
      const { data } = await api.getList({ limit: 1 });
      prId = data?.items?.[0]?.id;
    }
  });

  test.beforeEach(() => {
    markAsAPITest(MODULES.PERFORMANCE_REVIEW, "Dashboard Filters - Volume");
    if (!prId) {
      test.skip(true, "Нет PR для тестов");
    }
  });

  test("VOLUME: пагинация target users — limit 10/50/100/500", async ({
    prAPI,
  }) => {
    setSeverity("critical");

    const limits = [10, 50, 100, 500];
    const times = {};

    for (const limit of limits) {
      const { duration } = await measureTime(() =>
        prAPI.getDashboardFiltersTargetUsers(prId, { limit }),
      );
      times[limit] = duration;
      console.log(`   limit=${limit}: ${duration}ms`);
    }

    allure.attachment(
      "Pagination Volume",
      JSON.stringify(times, null, 2),
      "application/json",
    );

    // Рост от limit=10 к limit=500 < 10x
    const ratio = times[500] / Math.max(times[10], 1);
    console.log(`   Ratio 500/10: ${ratio.toFixed(1)}x`);

    expect(ratio, "Рост времени < 10x").toBeLessThan(10);

    // Все < COMPLEX
    for (const limit of limits) {
      expect(
        times[limit],
        `limit=${limit} < ${thresholds.COMPLEX}ms`,
      ).toBeLessThan(thresholds.COMPLEX);
    }
  });

  test("VOLUME: глубокая пагинация target users — offset 0/100/500/1000", async ({
    prAPI,
  }) => {
    setSeverity("normal");

    const offsets = [0, 100, 500, 1000];
    const times = {};

    for (const offset of offsets) {
      const { duration, response } = await measureTime(() =>
        prAPI.getDashboardFiltersTargetUsers(prId, { limit: 50, offset }),
      );
      times[offset] = duration;
      const statusOk = response?.ok?.() ?? true;
      console.log(
        `   offset=${offset}: ${duration}ms ${statusOk ? "" : "(не 200)"}`,
      );
    }

    allure.attachment(
      "Deep Pagination",
      JSON.stringify(times, null, 2),
      "application/json",
    );

    // Все < COMPLEX
    for (const offset of offsets) {
      expect(
        times[offset],
        `offset=${offset} < ${thresholds.COMPLEX}ms`,
      ).toBeLessThan(thresholds.COMPLEX);
    }
  });

  test("VOLUME: поиск target users (q) — пустой/буква/несуществующий", async ({
    prAPI,
  }) => {
    setSeverity("normal");

    const queries = ["", "а", "xyz_nonexistent_query"];
    const times = {};

    for (const q of queries) {
      const { duration } = await measureTime(() =>
        prAPI.getDashboardFiltersTargetUsers(prId, { limit: 50, q }),
      );
      times[q || "(пустой)"] = duration;
      console.log(`   q="${q || ""}": ${duration}ms`);
    }

    allure.attachment(
      "Search Performance",
      JSON.stringify(times, null, 2),
      "application/json",
    );

    for (const q of queries) {
      expect(
        times[q || "(пустой)"],
        `q="${q}" < ${thresholds.COMPLEX}ms`,
      ).toBeLessThan(thresholds.COMPLEX);
    }
  });

  test("VOLUME: query results — пустой запрос vs с фильтром", async ({
    prAPI,
  }) => {
    setSeverity("normal");

    // Пустой запрос
    const { duration: emptyTime } = await measureTime(() =>
      prAPI.getDashboardFiltersQueryResults(prId, {}, { limit: 50 }),
    );
    console.log(`   Пустой запрос: ${emptyTime}ms`);

    // С фильтром по департаменту (получаем первый)
    const { data: groupsData } =
      await prAPI.getDashboardFiltersGroupsDepartments(prId);
    const departments = groupsData?.departments || groupsData?.items || [];

    let filteredTime = 0;
    if (departments.length > 0) {
      const deptId = departments[0].id;
      const { duration } = await measureTime(() =>
        prAPI.getDashboardFiltersQueryResults(
          prId,
          { departmentIds: [deptId] },
          { limit: 50 },
        ),
      );
      filteredTime = duration;
      console.log(`   С фильтром dept=${deptId}: ${filteredTime}ms`);
    }

    allure.attachment(
      "Query Results",
      `Empty: ${emptyTime}ms\nFiltered: ${filteredTime}ms`,
      "text/plain",
    );

    expect(
      emptyTime,
      `Пустой запрос < ${thresholds.VERY_COMPLEX}ms`,
    ).toBeLessThan(thresholds.VERY_COMPLEX);
  });
});

// ==================== SUITE 3: DASHBOARD PROGRESSES ====================

test.describe("Dashboard Progresses - Large Data @load @volume @dashboard", () => {
  const prId = LOAD_TEST_CONFIG.largePrWithAnswersId;
  const revisionId = LOAD_TEST_CONFIG.largePrWithAnswersRevisionId;
  let allTargetUserIds = [];

  test.beforeAll(async ({ request }) => {
    if (!prId) return;

    const api = new PerformanceReviewAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);

    allTargetUserIds = await fetchTargetUserIds(api, prId, 500);
    console.log(
      `   Загружено ${allTargetUserIds.length} targetUserIds для progresses`,
    );
  });

  test.beforeEach(() => {
    markAsAPITest(
      MODULES.PERFORMANCE_REVIEW,
      "Dashboard Progresses - Large Data",
    );
    if (!prId || !revisionId) {
      test.skip(
        true,
        "Запустите load:seed:pr:answers для создания PR с ответами",
      );
    }
  });

  test("VOLUME: getDashboardProgresses для 10 чел — 3 замера", async ({
    prAPI,
  }) => {
    setSeverity("normal");

    const ids = allTargetUserIds.slice(0, 10);
    if (ids.length < 10) {
      test.skip(true, `Только ${ids.length} target users`);
      return;
    }

    const stats = await measureTimeStats(
      () =>
        prAPI.getDashboardProgresses(prId, {
          revisionId,
          targetUsersIds: ids.map(String),
        }),
      3,
    );

    allure.attachment("Progresses 10 users", formatStats(stats), "text/plain");
    console.log(`   Progresses (10 чел): ${formatStats(stats)}`);

    expect(stats.avg, `Avg < ${thresholds.SLOW}ms`).toBeLessThan(
      thresholds.SLOW,
    );
  });

  test("VOLUME: getDashboardProgresses для 50 чел — 3 замера", async ({
    prAPI,
  }) => {
    setSeverity("normal");

    const ids = allTargetUserIds.slice(0, 50);
    if (ids.length < 50) {
      test.skip(true, `Только ${ids.length} target users`);
      return;
    }

    const stats = await measureTimeStats(
      () =>
        prAPI.getDashboardProgresses(prId, {
          revisionId,
          targetUsersIds: ids.map(String),
        }),
      3,
    );

    allure.attachment("Progresses 50 users", formatStats(stats), "text/plain");
    console.log(`   Progresses (50 чел): ${formatStats(stats)}`);

    expect(stats.avg, `Avg < ${thresholds.COMPLEX}ms`).toBeLessThan(
      thresholds.COMPLEX,
    );
  });

  test("VOLUME: getDashboardProgresses для 100 чел", async ({ prAPI }) => {
    setSeverity("normal");

    const ids = allTargetUserIds.slice(0, 100);
    if (ids.length < 100) {
      test.skip(true, `Только ${ids.length} target users`);
      return;
    }

    const { duration } = await measureTime(() =>
      prAPI.getDashboardProgresses(prId, {
        revisionId,
        targetUsersIds: ids.map(String),
      }),
    );

    allure.attachment(
      "Progresses 100 users",
      `Duration: ${duration}ms`,
      "text/plain",
    );
    console.log(`   Progresses (100 чел): ${duration}ms`);

    expect(duration, `Duration < ${thresholds.VERY_COMPLEX}ms`).toBeLessThan(
      thresholds.VERY_COMPLEX,
    );
  });

  test("VOLUME: getDashboardProgresses для 500 чел", async ({ prAPI }) => {
    setSeverity("critical");
    test.setTimeout(120000);

    const ids = allTargetUserIds.slice(0, 500);
    if (ids.length < 500) {
      test.skip(true, `Только ${ids.length} target users`);
      return;
    }

    const { duration } = await measureTime(() =>
      prAPI.getDashboardProgresses(prId, {
        revisionId,
        targetUsersIds: ids.map(String),
      }),
    );

    allure.attachment(
      "Progresses 500 users",
      `Duration: ${duration}ms`,
      "text/plain",
    );
    console.log(`   Progresses (500 чел): ${duration}ms`);

    expect(duration, `Duration < ${thresholds.DASHBOARD_LARGE}ms`).toBeLessThan(
      thresholds.DASHBOARD_LARGE,
    );
  });

  test("VOLUME: рост времени progresses 500 vs 10 чел — ratio < 10x", async ({
    prAPI,
  }) => {
    setSeverity("normal");
    test.setTimeout(120000);

    if (allTargetUserIds.length < 500) {
      test.skip(true, `Только ${allTargetUserIds.length} target users`);
      return;
    }

    const ids10 = allTargetUserIds.slice(0, 10);
    const ids500 = allTargetUserIds.slice(0, 500);

    const { duration: time10 } = await measureTime(() =>
      prAPI.getDashboardProgresses(prId, {
        revisionId,
        targetUsersIds: ids10.map(String),
      }),
    );

    const { duration: time500 } = await measureTime(() =>
      prAPI.getDashboardProgresses(prId, {
        revisionId,
        targetUsersIds: ids500.map(String),
      }),
    );

    const ratio = time500 / Math.max(time10, 1);

    allure.attachment(
      "Progresses Volume Ratio",
      `10 users: ${time10}ms\n500 users: ${time500}ms\nRatio: ${ratio.toFixed(1)}x`,
      "text/plain",
    );
    console.log(
      `   Progresses growth: 10=${time10}ms, 500=${time500}ms, ratio=${ratio.toFixed(1)}x`,
    );

    expect(ratio, "Рост < 10x").toBeLessThan(10);
  });
});

// ==================== SUITE 4: DASHBOARD CONCURRENT STRESS ====================

test.describe("Dashboard - Concurrent Stress @load @stress @dashboard", () => {
  let prId;
  let revisionId;

  test.beforeAll(async ({ request }) => {
    const api = new PerformanceReviewAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);

    prId = LOAD_TEST_CONFIG.largePrId;

    if (!prId) {
      const { data } = await api.getList({ limit: 1 });
      prId = data?.items?.[0]?.id;
    }

    if (prId) {
      const { data: revisionsData } =
        await api.getDashboardFiltersRevisions(prId);
      const revisions = revisionsData?.items || revisionsData || [];
      revisionId = revisions[0]?.id;
      console.log(
        `   Concurrent stress: PR ${prId}, revision ${revisionId || "нет"}`,
      );
    }
  });

  test.beforeEach(() => {
    markAsAPITest(MODULES.PERFORMANCE_REVIEW, "Dashboard - Concurrent Stress");
    if (!prId) {
      test.skip(true, "Нет PR для тестов");
    }
  });

  test("STRESS: 10 параллельных getDashboard @critical", async ({ prAPI }) => {
    setSeverity("critical");

    if (!revisionId) {
      test.skip(true, `PR ${prId} не имеет ревизий для getDashboard`);
      return;
    }

    const requests = Array(10)
      .fill(null)
      .map(
        () => () => prAPI.getDashboard(prId, { revisionId, usersQuery: {} }),
      );
    const result = await measureParallel(requests);

    allure.attachment(
      "10 Parallel Dashboard",
      JSON.stringify(result, null, 2),
      "application/json",
    );
    console.log(
      `   10 parallel getDashboard: success=${result.successCount}/10, avg=${result.avgTime}ms`,
    );

    expect(result.serverErrorCount, "Нет серверных ошибок").toBe(0);
    expect(result.successCount, "Все запросы успешны").toBe(10);
  });

  test("STRESS: 25 параллельных getDashboardFiltersTargetUsers", async ({
    prAPI,
  }) => {
    setSeverity("normal");

    const requests = Array(25)
      .fill(null)
      .map(
        () => () => prAPI.getDashboardFiltersTargetUsers(prId, { limit: 50 }),
      );
    const result = await measureParallel(requests);

    allure.attachment(
      "25 Parallel Target Users",
      JSON.stringify(result, null, 2),
      "application/json",
    );
    console.log(
      `   25 parallel targetUsers: success=${result.successCount}/25, errors=${result.serverErrorCount}`,
    );

    expect(result.successCount, "Минимум 23 успешных").toBeGreaterThanOrEqual(
      23,
    );
  });

  test("STRESS: sustained load getDashboard 30с", async ({ prAPI }) => {
    setSeverity("normal");
    test.setTimeout(120000);

    if (!revisionId) {
      test.skip(true, `PR ${prId} не имеет ревизий для getDashboard`);
      return;
    }

    const result = await sustainedLoad(
      () => prAPI.getDashboard(prId, { revisionId, usersQuery: {} }),
      { durationMs: 30000, delayMs: 500 },
    );

    allure.attachment(
      "Sustained Dashboard Load",
      JSON.stringify(result, null, 2),
      "application/json",
    );
    const degradationRatio = parseFloat(result.degradation?.ratio || 0);
    const successPct = (result.successRate * 100).toFixed(1);
    const serverErrorPct = (result.serverErrorRate * 100).toFixed(1);

    console.log(
      `   Sustained 30s: requests=${result.totalRequests}, success=${successPct}%, degradation=${degradationRatio.toFixed(1)}x, serverErrors=${serverErrorPct}%`,
    );

    expect(degradationRatio, "Деградация < 3x").toBeLessThan(3);
    expect(result.serverErrorRate, "Серверных ошибок < 5%").toBeLessThan(0.05);
  });
});
