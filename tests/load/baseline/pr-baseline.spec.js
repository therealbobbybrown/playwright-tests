// @ts-check
// tests/load/baseline/pr-baseline.spec.js
// Baseline Performance Tests для Performance Review API
// @tags @load @baseline @pr

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

// ==================== BASELINE: PR LIST ====================

test.describe("PR API Baseline - List Operations @load @baseline @pr", () => {
  test.beforeEach(() => {
    markAsAPITest(MODULES.PERFORMANCE_REVIEW, "Baseline Performance");
  });

  test("BASELINE: GET /performance-reviews/ (список) @critical", async ({
    prAPI,
  }) => {
    setSeverity("critical");

    const stats = await measureTimeStats(() => prAPI.getList(), 5);

    allure.attachment(
      "Performance Stats",
      JSON.stringify(stats, null, 2),
      "application/json",
    );
    console.log(`PR List baseline: ${formatStats(stats)}`);

    if (!stats.success) {
      test.skip(true, "Нет доступа к PR API");
      return;
    }

    expect(stats.avg, `Среднее время < ${thresholds.SLOW}ms`).toBeLessThan(
      thresholds.SLOW,
    );
    expect(stats.p95, `P95 < ${thresholds.COMPLEX}ms`).toBeLessThan(
      thresholds.COMPLEX,
    );
  });

  test("BASELINE: GET /performance-reviews/ с limit=10", async ({ prAPI }) => {
    setSeverity("normal");

    const stats = await measureTimeStats(
      () => prAPI.getList({ limit: 10, offset: 0 }),
      5,
    );

    allure.attachment(
      "Performance Stats",
      JSON.stringify(stats, null, 2),
      "application/json",
    );
    console.log(`PR List (limit=10) baseline: ${formatStats(stats)}`);

    if (!stats.success) {
      test.skip(true, "Нет доступа к PR API");
      return;
    }

    expect(stats.avg).toBeLessThan(thresholds.SLOW);
  });

  test("BASELINE: GET /performance-reviews/ с limit=50", async ({ prAPI }) => {
    setSeverity("normal");

    const stats = await measureTimeStats(
      () => prAPI.getList({ limit: 50, offset: 0 }),
      5,
    );

    allure.attachment(
      "Performance Stats",
      JSON.stringify(stats, null, 2),
      "application/json",
    );
    console.log(`PR List (limit=50) baseline: ${formatStats(stats)}`);

    if (!stats.success) {
      test.skip(true, "Нет доступа к PR API");
      return;
    }

    expect(stats.avg).toBeLessThan(thresholds.SLOW);
  });

  test("BASELINE: Сравнение limit 10 vs 50 vs 100", async ({ prAPI }) => {
    setSeverity("normal");

    const limits = [10, 50, 100];
    const results = {};

    for (const limit of limits) {
      const stats = await measureTimeStats(
        () => prAPI.getList({ limit, offset: 0 }),
        3,
      );
      if (stats.success) {
        results[limit] = stats;
        console.log(`PR List (limit=${limit}): avg=${stats.avg}ms`);
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

    // Время не должно расти линейно с limit
    // limit=100 не должен быть в 10 раз медленнее limit=10
    if (results[10] && results[100]) {
      const ratio = results[100].avg / results[10].avg;
      console.log(`Ratio (limit 100 vs 10): ${ratio.toFixed(2)}x`);
      expect(ratio, "Ratio limit 100/10 должен быть < 5x").toBeLessThan(5);
    }
  });
});

// ==================== BASELINE: PR DETAILS ====================

test.describe("PR API Baseline - Detail Operations @load @baseline @pr", () => {
  test.beforeEach(() => {
    markAsAPITest(MODULES.PERFORMANCE_REVIEW, "Baseline Performance");
  });

  test("BASELINE: GET /performance-reviews/{id}/ (детали) @critical", async ({
    prAPI,
  }) => {
    setSeverity("critical");

    // Получаем ID первого PR
    const { response: listResp, data: listData } = await prAPI.getList({
      limit: 1,
    });

    if (!listResp.ok()) {
      test.skip(true, "Нет доступа к PR API");
      return;
    }

    const items = listData?.items || listData || [];
    if (items.length === 0) {
      test.skip(true, "Нет PR для теста");
      return;
    }

    const prId = items[0].id;
    const stats = await measureTimeStats(() => prAPI.getById(prId), 5);

    allure.attachment(
      "Performance Stats",
      JSON.stringify(stats, null, 2),
      "application/json",
    );
    console.log(`PR Details baseline: ${formatStats(stats)}`);

    expect(stats.avg, `Среднее время < ${thresholds.NORMAL}ms`).toBeLessThan(
      thresholds.NORMAL,
    );
    expect(stats.p95, `P95 < ${thresholds.SLOW}ms`).toBeLessThan(
      thresholds.SLOW,
    );
  });

  test("BASELINE: GET /performance-reviews/{id}/revisions", async ({
    prAPI,
  }) => {
    setSeverity("normal");

    const { response: listResp, data: listData } = await prAPI.getList({
      limit: 1,
    });

    if (!listResp.ok()) {
      test.skip(true, "Нет доступа к PR API");
      return;
    }

    const items = listData?.items || listData || [];
    if (items.length === 0) {
      test.skip(true, "Нет PR для теста");
      return;
    }

    const prId = items[0].id;
    const stats = await measureTimeStats(() => prAPI.getRevisions(prId), 5);

    allure.attachment(
      "Performance Stats",
      JSON.stringify(stats, null, 2),
      "application/json",
    );
    console.log(`PR Revisions baseline: ${formatStats(stats)}`);

    if (!stats.success) {
      test.skip(true, "Нет доступа к ревизиям");
      return;
    }

    expect(stats.avg).toBeLessThan(thresholds.NORMAL);
  });

  test("BASELINE: GET /performance-reviews/{id}/assessments", async ({
    prAPI,
  }) => {
    setSeverity("normal");

    const { response: listResp, data: listData } = await prAPI.getList({
      limit: 1,
    });

    if (!listResp.ok()) {
      test.skip(true, "Нет доступа к PR API");
      return;
    }

    const items = listData?.items || listData || [];
    if (items.length === 0) {
      test.skip(true, "Нет PR для теста");
      return;
    }

    const prId = items[0].id;
    const stats = await measureTimeStats(() => prAPI.getAssessments(prId), 5);

    allure.attachment(
      "Performance Stats",
      JSON.stringify(stats, null, 2),
      "application/json",
    );
    console.log(`PR Assessments baseline: ${formatStats(stats)}`);

    if (!stats.success) {
      test.skip(true, "Нет доступа к assessments");
      return;
    }

    expect(stats.avg).toBeLessThan(thresholds.NORMAL);
  });
});

// ==================== BASELINE: PR TARGET USERS ====================

test.describe("PR API Baseline - Target Users @load @baseline @pr", () => {
  test.beforeEach(() => {
    markAsAPITest(MODULES.PERFORMANCE_REVIEW, "Baseline Performance");
  });

  test("BASELINE: POST /performance-reviews/{id}/target-users/get @critical", async ({
    prAPI,
  }) => {
    setSeverity("critical");

    // Получаем ID активного PR
    const { response: listResp, data: listData } = await prAPI.getList({
      status: "active",
      limit: 1,
    });

    if (!listResp.ok()) {
      test.skip(true, "Нет доступа к PR API");
      return;
    }

    const items = listData?.items || listData || [];
    if (items.length === 0) {
      // Попробуем любой PR
      const { data: anyData } = await prAPI.getList({ limit: 1 });
      const anyItems = anyData?.items || anyData || [];
      if (anyItems.length === 0) {
        test.skip(true, "Нет PR для теста");
        return;
      }
    }

    const prId =
      items[0]?.id || (await prAPI.getList({ limit: 1 })).data?.items?.[0]?.id;

    if (!prId) {
      test.skip(true, "Нет PR для теста");
      return;
    }

    const stats = await measureTimeStats(
      () => prAPI.getTargetUsers(prId, { limit: 50, offset: 0 }),
      5,
    );

    allure.attachment(
      "Performance Stats",
      JSON.stringify(stats, null, 2),
      "application/json",
    );
    console.log(`PR Target Users baseline: ${formatStats(stats)}`);

    if (!stats.success) {
      test.skip(true, "Нет доступа к target users");
      return;
    }

    expect(stats.avg, `Среднее время < ${thresholds.SLOW}ms`).toBeLessThan(
      thresholds.SLOW,
    );
  });

  test("BASELINE: GET /performance-reviews/{id}/users-counts", async ({
    prAPI,
  }) => {
    setSeverity("normal");

    const { response: listResp, data: listData } = await prAPI.getList({
      limit: 1,
    });

    if (!listResp.ok()) {
      test.skip(true, "Нет доступа к PR API");
      return;
    }

    const items = listData?.items || listData || [];
    if (items.length === 0) {
      test.skip(true, "Нет PR для теста");
      return;
    }

    const prId = items[0].id;
    const stats = await measureTimeStats(() => prAPI.getUsersCounts(prId), 5);

    allure.attachment(
      "Performance Stats",
      JSON.stringify(stats, null, 2),
      "application/json",
    );
    console.log(`PR Users Counts baseline: ${formatStats(stats)}`);

    if (!stats.success) {
      test.skip(true, "Нет доступа к users counts");
      return;
    }

    expect(stats.avg).toBeLessThan(thresholds.NORMAL);
  });
});

// ==================== BASELINE: PR DASHBOARD ====================

test.describe("PR API Baseline - Dashboard @load @baseline @pr @dashboard", () => {
  test.beforeEach(() => {
    markAsAPITest(
      MODULES.PERFORMANCE_REVIEW,
      "Baseline Performance - Dashboard",
    );
  });

  test("BASELINE: GET /dashboard-filters/performance-reviews/ @critical", async ({
    prAPI,
  }) => {
    setSeverity("critical");

    const stats = await measureTimeStats(
      () => prAPI.getDashboardFiltersPerformanceReviews(),
      5,
    );

    allure.attachment(
      "Performance Stats",
      JSON.stringify(stats, null, 2),
      "application/json",
    );
    console.log(`Dashboard Filters PR List baseline: ${formatStats(stats)}`);

    if (!stats.success) {
      test.skip(true, "Нет доступа к dashboard filters");
      return;
    }

    expect(stats.avg, `Среднее время < ${thresholds.NORMAL}ms`).toBeLessThan(
      thresholds.NORMAL,
    );
  });

  test("BASELINE: GET /dashboard-filters/{id}/target-users/", async ({
    prAPI,
  }) => {
    setSeverity("normal");

    // Получаем ID PR для dashboard
    const { response: listResp, data: listData } =
      await prAPI.getDashboardFiltersPerformanceReviews();

    if (!listResp.ok()) {
      test.skip(true, "Нет доступа к dashboard filters");
      return;
    }

    const items = listData?.items || listData || [];
    if (items.length === 0) {
      test.skip(true, "Нет PR для dashboard");
      return;
    }

    const prId = items[0].id;
    const stats = await measureTimeStats(
      () => prAPI.getDashboardFiltersTargetUsers(prId, { limit: 50 }),
      5,
    );

    allure.attachment(
      "Performance Stats",
      JSON.stringify(stats, null, 2),
      "application/json",
    );
    console.log(`Dashboard Target Users baseline: ${formatStats(stats)}`);

    if (!stats.success) {
      test.skip(true, "Нет доступа к target users");
      return;
    }

    expect(stats.avg).toBeLessThan(thresholds.SLOW);
  });

  test("BASELINE: GET /dashboard-filters/{id}/groups-departments/", async ({
    prAPI,
  }) => {
    setSeverity("normal");

    const { response: listResp, data: listData } =
      await prAPI.getDashboardFiltersPerformanceReviews();

    if (!listResp.ok()) {
      test.skip(true, "Нет доступа к dashboard filters");
      return;
    }

    const items = listData?.items || listData || [];
    if (items.length === 0) {
      test.skip(true, "Нет PR для dashboard");
      return;
    }

    const prId = items[0].id;
    const stats = await measureTimeStats(
      () => prAPI.getDashboardFiltersGroupsDepartments(prId),
      5,
    );

    allure.attachment(
      "Performance Stats",
      JSON.stringify(stats, null, 2),
      "application/json",
    );
    console.log(`Dashboard Groups/Departments baseline: ${formatStats(stats)}`);

    if (!stats.success) {
      test.skip(true, "Нет доступа к groups/departments");
      return;
    }

    expect(stats.avg).toBeLessThan(thresholds.SLOW);
  });
});

// ==================== BASELINE: PR STATISTICS ====================

test.describe("PR API Baseline - Statistics @load @baseline @pr @statistics", () => {
  test.beforeEach(() => {
    markAsAPITest(
      MODULES.PERFORMANCE_REVIEW,
      "Baseline Performance - Statistics",
    );
  });

  test("BASELINE: GET /performance-reviews/{id}/statistics/directions/ @critical", async ({
    prAPI,
  }) => {
    setSeverity("critical");

    const { response: listResp, data: listData } = await prAPI.getList({
      limit: 1,
    });

    if (!listResp.ok()) {
      test.skip(true, "Нет доступа к PR API");
      return;
    }

    const items = listData?.items || listData || [];
    if (items.length === 0) {
      test.skip(true, "Нет PR для теста");
      return;
    }

    const prId = items[0].id;

    // Получаем ревизию
    const { data: revData } = await prAPI.getLastRevision(prId);
    const revisionId = revData?.id;

    if (!revisionId) {
      test.skip(true, "Нет ревизии для статистики");
      return;
    }

    const stats = await measureTimeStats(
      () => prAPI.getStatisticsDirections(prId, { revisionId }),
      5,
    );

    allure.attachment(
      "Performance Stats",
      JSON.stringify(stats, null, 2),
      "application/json",
    );
    console.log(`PR Statistics Directions baseline: ${formatStats(stats)}`);

    if (!stats.success) {
      test.skip(true, "Нет доступа к статистике");
      return;
    }

    expect(stats.avg, `Среднее время < ${thresholds.COMPLEX}ms`).toBeLessThan(
      thresholds.COMPLEX,
    );
  });

  test("BASELINE: GET /performance-reviews/{id}/reviewers-workload", async ({
    prAPI,
  }) => {
    setSeverity("normal");

    const { response: listResp, data: listData } = await prAPI.getList({
      status: "active",
      limit: 1,
    });

    if (!listResp.ok()) {
      test.skip(true, "Нет доступа к PR API");
      return;
    }

    const items = listData?.items || listData || [];
    if (items.length === 0) {
      test.skip(true, "Нет активных PR");
      return;
    }

    const prId = items[0].id;
    const stats = await measureTimeStats(
      () => prAPI.getReviewersWorkload(prId, { limit: 50 }),
      5,
    );

    allure.attachment(
      "Performance Stats",
      JSON.stringify(stats, null, 2),
      "application/json",
    );
    console.log(`PR Reviewers Workload baseline: ${formatStats(stats)}`);

    if (!stats.success) {
      test.skip(true, "Нет доступа к workload");
      return;
    }

    expect(stats.avg).toBeLessThan(thresholds.SLOW);
  });
});
