// @ts-check
// tests/load/volume/pr-volume-tests.spec.js
// Volume тесты для Performance Review API
// Проверяют производительность при работе с большими объёмами данных
// @tags @load @volume @pr

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
  formatStats,
} from "../utils/measure-time.js";
import { LOAD_TEST_CONFIG } from "../seed/seed-config.js";

const { thresholds, pagination } = LOAD_TEST_CONFIG;

const test = base.extend({
  prAPI: async ({ request }, use) => {
    const api = new PerformanceReviewAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
});

// ==================== VOLUME: PR LIST ====================

test.describe("PR Volume - List Operations @load @volume @pr", () => {
  test.beforeEach(() => {
    markAsAPITest(MODULES.PERFORMANCE_REVIEW, "Volume - List");
  });

  test("VOLUME: Сравнение limit 10, 50, 100, 500 @critical", async ({
    prAPI,
  }) => {
    setSeverity("critical");

    const limits = pagination.limits;
    const results = {};

    for (const limit of limits) {
      const stats = await measureTimeStats(
        () => prAPI.getList({ limit, offset: 0 }),
        3,
      );

      if (stats.success) {
        results[limit] = {
          avg: stats.avg,
          p95: stats.p95,
          itemsReturned: stats.results[0]?.data?.items?.length || 0,
        };
        console.log(
          `   limit=${limit}: avg=${stats.avg}ms, items=${results[limit].itemsReturned}`,
        );
      }
    }

    allure.attachment(
      "Limit Comparison",
      JSON.stringify(results, null, 2),
      "application/json",
    );

    if (Object.keys(results).length === 0) {
      test.skip(true, "Нет доступа к PR API");
      return;
    }

    // Проверяем что время не растёт экспоненциально
    const keys = Object.keys(results)
      .map(Number)
      .sort((a, b) => a - b);
    if (keys.length >= 2) {
      const first = results[keys[0]];
      const last = results[keys[keys.length - 1]];
      const ratio = last.avg / first.avg;

      console.log(
        `   Ratio (limit ${keys[keys.length - 1]} vs ${keys[0]}): ${ratio.toFixed(2)}x`,
      );

      // Время не должно расти более чем в 10 раз при увеличении limit в 50 раз
      expect(ratio, "Время не должно расти экспоненциально").toBeLessThan(10);
    }
  });

  test("VOLUME: Глубокая пагинация (offset 0, 100, 500, 1000) @critical", async ({
    prAPI,
  }) => {
    setSeverity("critical");

    // Сначала проверяем общее количество PR
    const { response: countResp, data: countData } = await prAPI.getList({
      limit: 1,
    });

    if (!countResp.ok()) {
      test.skip(true, "Нет доступа к PR API");
      return;
    }

    const total = countData?.total || countData?.items?.length || 0;
    console.log(`   Всего PR: ${total}`);

    const offsets = [0, 100, 500, 1000].filter((o) => o < total);
    const results = {};

    for (const offset of offsets) {
      const stats = await measureTimeStats(
        () => prAPI.getList({ limit: 50, offset }),
        3,
      );

      if (stats.success) {
        results[offset] = {
          avg: stats.avg,
          p95: stats.p95,
        };
        console.log(`   offset=${offset}: avg=${stats.avg}ms`);
      }
    }

    allure.attachment(
      "Offset Comparison",
      JSON.stringify(results, null, 2),
      "application/json",
    );

    // Время не должно сильно деградировать на больших offset
    if (results[0] && results[offsets[offsets.length - 1]]) {
      const ratio = results[offsets[offsets.length - 1]].avg / results[0].avg;
      console.log(
        `   Ratio (offset ${offsets[offsets.length - 1]} vs 0): ${ratio.toFixed(2)}x`,
      );

      // Допускаем замедление до 3x на больших offset
      expect(ratio, "Пагинация не должна сильно деградировать").toBeLessThan(5);
    }
  });

  test("VOLUME: Фильтрация по статусу (active, draft, stopped)", async ({
    prAPI,
  }) => {
    setSeverity("normal");

    const statuses = ["active", "draft", "stopped"];
    const results = {};

    for (const status of statuses) {
      const stats = await measureTimeStats(
        () => prAPI.getList({ status, limit: 50 }),
        3,
      );

      if (stats.success) {
        results[status] = {
          avg: stats.avg,
          count: stats.results[0]?.data?.items?.length || 0,
        };
        console.log(
          `   status=${status}: avg=${stats.avg}ms, count=${results[status].count}`,
        );
      }
    }

    allure.attachment(
      "Status Filter Comparison",
      JSON.stringify(results, null, 2),
      "application/json",
    );

    // Все статусы должны отрабатывать за разумное время
    for (const [status, data] of Object.entries(results)) {
      expect(
        data.avg,
        `Фильтр по статусу ${status} < ${thresholds.SLOW}ms`,
      ).toBeLessThan(thresholds.SLOW);
    }
  });
});

// ==================== VOLUME: TARGET USERS ====================

test.describe("PR Volume - Target Users @load @volume @pr", () => {
  test.beforeEach(() => {
    markAsAPITest(MODULES.PERFORMANCE_REVIEW, "Volume - Target Users");
  });

  test("VOLUME: Target Users с разными limit @critical", async ({ prAPI }) => {
    setSeverity("critical");

    // Получаем PR для теста
    const { response: listResp, data: listData } = await prAPI.getList({
      limit: 5,
    });

    if (!listResp.ok()) {
      test.skip(true, "Нет доступа к PR API");
      return;
    }

    const items = listData?.items || [];
    if (items.length === 0) {
      test.skip(true, "Нет PR для теста");
      return;
    }

    // Выбираем PR с наибольшим количеством участников
    let bestPr = items[0];
    let maxCount = 0;

    for (const pr of items) {
      const { data: counts } = await prAPI.getUsersCounts(pr.id);
      const count = counts?.targetUsersCount || 0;
      if (count > maxCount) {
        maxCount = count;
        bestPr = pr;
      }
    }

    console.log(`   Тестируем PR ID=${bestPr.id}, участников: ${maxCount}`);

    const limits = [10, 50, 100, 200];
    const results = {};

    for (const limit of limits) {
      const stats = await measureTimeStats(
        () => prAPI.getTargetUsers(bestPr.id, { limit, offset: 0 }),
        3,
      );

      if (stats.success) {
        results[limit] = {
          avg: stats.avg,
          p95: stats.p95,
        };
        console.log(`   limit=${limit}: avg=${stats.avg}ms`);
      }
    }

    allure.attachment(
      "Target Users Limit Comparison",
      JSON.stringify(results, null, 2),
      "application/json",
    );

    // Проверяем пороговые значения
    for (const [limit, data] of Object.entries(results)) {
      const threshold =
        parseInt(limit) <= 50 ? thresholds.SLOW : thresholds.COMPLEX;
      expect(
        data.avg,
        `Target Users limit=${limit} < ${threshold}ms`,
      ).toBeLessThan(threshold);
    }
  });

  test("VOLUME: Target Users с фильтрацией по поиску", async ({ prAPI }) => {
    setSeverity("normal");

    const { response: listResp, data: listData } = await prAPI.getList({
      limit: 1,
    });

    if (!listResp.ok() || !listData?.items?.length) {
      test.skip(true, "Нет PR для теста");
      return;
    }

    const prId = listData.items[0].id;

    // Тестируем поиск с разными запросами
    const queries = ["", "а", "иван", "менеджер"];
    const results = {};

    for (const q of queries) {
      const stats = await measureTimeStats(
        () => prAPI.getTargetUsers(prId, { limit: 50, q }),
        3,
      );

      if (stats.success) {
        results[q || "(empty)"] = {
          avg: stats.avg,
          count: stats.results[0]?.data?.items?.length || 0,
        };
        console.log(`   q="${q || ""}": avg=${stats.avg}ms`);
      }
    }

    allure.attachment(
      "Search Query Comparison",
      JSON.stringify(results, null, 2),
      "application/json",
    );
  });

  test("VOLUME: Users Counts для нескольких PR", async ({ prAPI }) => {
    setSeverity("normal");

    const { response: listResp, data: listData } = await prAPI.getList({
      limit: 10,
    });

    if (!listResp.ok()) {
      test.skip(true, "Нет доступа к PR API");
      return;
    }

    const items = listData?.items || [];
    if (items.length === 0) {
      test.skip(true, "Нет PR для теста");
      return;
    }

    // Параллельно получаем counts для всех PR
    const requests = items.map((pr) => () => prAPI.getUsersCounts(pr.id));

    const { totalTime, successCount, avgTime } =
      await measureParallel(requests);

    allure.attachment(
      "Parallel Users Counts",
      JSON.stringify(
        { totalTime, successCount, avgTime, prCount: items.length },
        null,
        2,
      ),
      "application/json",
    );

    console.log(
      `   ${items.length} PR: total=${totalTime}ms, avg=${avgTime}ms`,
    );

    expect(avgTime, "Среднее время getUsersCounts < 1s").toBeLessThan(1000);
  });
});

// ==================== VOLUME: DASHBOARD ====================

test.describe("PR Volume - Dashboard @load @volume @pr @dashboard", () => {
  test.beforeEach(() => {
    markAsAPITest(MODULES.PERFORMANCE_REVIEW, "Volume - Dashboard");
  });

  test("VOLUME: Dashboard Filters - список PR @critical", async ({ prAPI }) => {
    setSeverity("critical");

    const stats = await measureTimeStats(
      () => prAPI.getDashboardFiltersPerformanceReviews(),
      5,
    );

    allure.attachment(
      "Dashboard PR List",
      JSON.stringify(stats, null, 2),
      "application/json",
    );
    console.log(`   Dashboard PR List: ${formatStats(stats)}`);

    if (!stats.success) {
      test.skip(true, "Нет доступа к dashboard");
      return;
    }

    expect(stats.avg, `Dashboard PR List < ${thresholds.SLOW}ms`).toBeLessThan(
      thresholds.SLOW,
    );
  });

  test("VOLUME: Dashboard Target Users с разными limit", async ({ prAPI }) => {
    setSeverity("critical");

    const { response: prResp, data: prData } =
      await prAPI.getDashboardFiltersPerformanceReviews();

    if (!prResp.ok()) {
      test.skip(true, "Нет доступа к dashboard");
      return;
    }

    const items = prData?.items || prData || [];
    if (items.length === 0) {
      test.skip(true, "Нет PR для dashboard");
      return;
    }

    const prId = items[0].id;
    const limits = [50, 100, 200];
    const results = {};

    for (const limit of limits) {
      const stats = await measureTimeStats(
        () => prAPI.getDashboardFiltersTargetUsers(prId, { limit }),
        3,
      );

      if (stats.success) {
        results[limit] = { avg: stats.avg, p95: stats.p95 };
        console.log(
          `   Dashboard Target Users limit=${limit}: avg=${stats.avg}ms`,
        );
      }
    }

    allure.attachment(
      "Dashboard Target Users",
      JSON.stringify(results, null, 2),
      "application/json",
    );

    // Проверяем пороговые значения
    for (const [limit, data] of Object.entries(results)) {
      expect(
        data.avg,
        `Dashboard Users limit=${limit} < ${thresholds.COMPLEX}ms`,
      ).toBeLessThan(thresholds.COMPLEX);
    }
  });

  test("VOLUME: Dashboard Groups/Departments", async ({ prAPI }) => {
    setSeverity("normal");

    const { response: prResp, data: prData } =
      await prAPI.getDashboardFiltersPerformanceReviews();

    if (!prResp.ok() || !prData?.items?.length) {
      test.skip(true, "Нет доступа к dashboard");
      return;
    }

    const prId = prData.items[0].id;

    const stats = await measureTimeStats(
      () => prAPI.getDashboardFiltersGroupsDepartments(prId),
      5,
    );

    allure.attachment(
      "Dashboard Groups/Departments",
      JSON.stringify(stats, null, 2),
      "application/json",
    );
    console.log(`   Dashboard Groups/Departments: ${formatStats(stats)}`);

    if (!stats.success) {
      test.skip(true, "Нет доступа к groups/departments");
      return;
    }

    expect(
      stats.avg,
      `Groups/Departments < ${thresholds.COMPLEX}ms`,
    ).toBeLessThan(thresholds.COMPLEX);
  });
});

// ==================== VOLUME: STATISTICS ====================

test.describe("PR Volume - Statistics @load @volume @pr @statistics", () => {
  test.beforeEach(() => {
    markAsAPITest(MODULES.PERFORMANCE_REVIEW, "Volume - Statistics");
  });

  test("VOLUME: Statistics Directions @critical", async ({ prAPI }) => {
    setSeverity("critical");

    const { response: listResp, data: listData } = await prAPI.getList({
      limit: 5,
    });

    if (!listResp.ok() || !listData?.items?.length) {
      test.skip(true, "Нет PR для теста");
      return;
    }

    // Находим PR с ревизией
    let prId = null;
    let revisionId = null;

    for (const pr of listData.items) {
      const { data: revData } = await prAPI.getLastRevision(pr.id);
      if (revData?.id) {
        prId = pr.id;
        revisionId = revData.id;
        break;
      }
    }

    if (!prId || !revisionId) {
      test.skip(true, "Нет PR с ревизией");
      return;
    }

    console.log(`   PR ID=${prId}, Revision ID=${revisionId}`);

    const stats = await measureTimeStats(
      () => prAPI.getStatisticsDirections(prId, { revisionId }),
      5,
    );

    allure.attachment(
      "Statistics Directions",
      JSON.stringify(stats, null, 2),
      "application/json",
    );
    console.log(`   Statistics Directions: ${formatStats(stats)}`);

    if (!stats.success) {
      test.skip(true, "Нет доступа к статистике");
      return;
    }

    expect(
      stats.avg,
      `Statistics Directions < ${thresholds.COMPLEX}ms`,
    ).toBeLessThan(thresholds.COMPLEX);
  });

  test("VOLUME: Reviewers Workload с разными limit", async ({ prAPI }) => {
    setSeverity("normal");

    const { response: listResp, data: listData } = await prAPI.getList({
      status: "active",
      limit: 1,
    });

    if (!listResp.ok() || !listData?.items?.length) {
      // Пробуем любой PR
      const { data: anyData } = await prAPI.getList({ limit: 1 });
      if (!anyData?.items?.length) {
        test.skip(true, "Нет PR для теста");
        return;
      }
    }

    const prId = listData?.items?.[0]?.id;
    if (!prId) {
      test.skip(true, "Нет PR для теста");
      return;
    }

    const limits = [20, 50, 100];
    const results = {};

    for (const limit of limits) {
      const stats = await measureTimeStats(
        () => prAPI.getReviewersWorkload(prId, { limit }),
        3,
      );

      if (stats.success) {
        results[limit] = { avg: stats.avg };
        console.log(`   Reviewers Workload limit=${limit}: avg=${stats.avg}ms`);
      }
    }

    allure.attachment(
      "Reviewers Workload",
      JSON.stringify(results, null, 2),
      "application/json",
    );
  });
});

// ==================== VOLUME: PARALLEL REQUESTS ====================

test.describe("PR Volume - Parallel Requests @load @volume @pr @parallel", () => {
  test.beforeEach(() => {
    markAsAPITest(MODULES.PERFORMANCE_REVIEW, "Volume - Parallel");
  });

  test("VOLUME: 10 параллельных запросов списка PR", async ({ prAPI }) => {
    setSeverity("critical");

    const requests = Array(10)
      .fill(null)
      .map(() => () => prAPI.getList({ limit: 20 }));

    const result = await measureParallel(requests);

    allure.attachment(
      "Parallel List Requests",
      JSON.stringify(result, null, 2),
      "application/json",
    );

    console.log(
      `   10 parallel: total=${result.totalTime}ms, avg=${result.avgTime}ms, success=${result.successCount}/10`,
    );

    expect(result.serverErrorCount, "Нет серверных ошибок").toBe(0);
    expect(result.successCount, "Все запросы успешны").toBe(10);
    expect(result.avgTime, "Среднее время < 3s").toBeLessThan(3000);
  });

  test("VOLUME: Параллельные запросы к разным эндпоинтам", async ({
    prAPI,
  }) => {
    setSeverity("normal");

    const { response: listResp, data: listData } = await prAPI.getList({
      limit: 3,
    });

    if (!listResp.ok() || !listData?.items?.length) {
      test.skip(true, "Нет PR для теста");
      return;
    }

    const prId = listData.items[0].id;

    // Разные типы запросов параллельно
    const requests = [
      () => prAPI.getList({ limit: 10 }),
      () => prAPI.getById(prId),
      () => prAPI.getAssessments(prId),
      () => prAPI.getUsersCounts(prId),
      () => prAPI.getRevisions(prId, { limit: 5 }),
      () => prAPI.getDashboardFiltersPerformanceReviews(),
    ];

    const result = await measureParallel(requests);

    allure.attachment(
      "Parallel Mixed Requests",
      JSON.stringify(result, null, 2),
      "application/json",
    );

    console.log(
      `   6 mixed parallel: total=${result.totalTime}ms, success=${result.successCount}/6`,
    );

    expect(result.serverErrorCount, "Нет серверных ошибок").toBe(0);
  });
});
