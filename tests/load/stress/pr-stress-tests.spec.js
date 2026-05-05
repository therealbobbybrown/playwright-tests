// @ts-check
// tests/load/stress/pr-stress-tests.spec.js
// Stress/Concurrent тесты для Performance Review API
// @tags @load @stress @pr

import { test as base, expect } from "@playwright/test";
import { PerformanceReviewAPI, getCredentials } from "../../utils/api/index.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
  allure,
} from "../../utils/allure-helpers.js";
import {
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

// ==================== STRESS: CONCURRENT LIST ====================

test.describe("PR Stress - Concurrent List @load @stress @pr", () => {
  test.beforeEach(() => {
    markAsAPITest(MODULES.PERFORMANCE_REVIEW, "Stress - Concurrent List");
  });

  test("STRESS: 10 параллельных запросов списка PR @critical", async ({
    prAPI,
  }) => {
    setSeverity("critical");

    const requests = Array(10)
      .fill(null)
      .map(() => () => prAPI.getList({ limit: 20 }));
    const result = await measureParallel(requests);

    allure.attachment(
      "10 Parallel List",
      JSON.stringify(result, null, 2),
      "application/json",
    );
    console.log(
      `   10 parallel: total=${result.totalTime}ms, avg=${result.avgTime}ms`,
    );

    expect(result.serverErrorCount, "Нет серверных ошибок").toBe(0);
    expect(result.successCount, "Все запросы успешны").toBe(10);
  });

  test("STRESS: 25 параллельных запросов списка PR", async ({ prAPI }) => {
    setSeverity("normal");

    const requests = Array(25)
      .fill(null)
      .map(() => () => prAPI.getList({ limit: 10 }));
    const result = await measureParallel(requests);

    allure.attachment(
      "25 Parallel List",
      JSON.stringify(result, null, 2),
      "application/json",
    );
    console.log(
      `   25 parallel: success=${result.successCount}/25, avg=${result.avgTime}ms`,
    );

    expect(result.serverErrorCount, "Нет серверных ошибок").toBe(0);
    expect(result.successCount, "Минимум 23 успешных").toBeGreaterThanOrEqual(
      23,
    );
  });

  test("STRESS: 50 параллельных запросов списка PR @critical", async ({
    prAPI,
  }) => {
    setSeverity("critical");

    const requests = Array(50)
      .fill(null)
      .map(() => () => prAPI.getList({ limit: 5 }));
    const result = await measureParallel(requests);

    allure.attachment(
      "50 Parallel List",
      JSON.stringify(result, null, 2),
      "application/json",
    );
    console.log(
      `   50 parallel: success=${result.successCount}/50, errors=${result.serverErrorCount}`,
    );

    expect(
      result.serverErrorCount,
      "Максимум 2 серверных ошибки",
    ).toBeLessThanOrEqual(2);
    expect(result.successCount, "Минимум 45 успешных").toBeGreaterThanOrEqual(
      45,
    );
  });
});

// ==================== STRESS: CONCURRENT DETAILS ====================

test.describe("PR Stress - Concurrent Details @load @stress @pr", () => {
  test.beforeEach(() => {
    markAsAPITest(MODULES.PERFORMANCE_REVIEW, "Stress - Concurrent Details");
  });

  test("STRESS: Параллельные запросы деталей разных PR", async ({ prAPI }) => {
    setSeverity("normal");

    const { response: listResp, data: listData } = await prAPI.getList({
      limit: 10,
    });
    if (!listResp.ok() || !listData?.items?.length) {
      test.skip(true, "Нет PR для теста");
      return;
    }

    const requests = listData.items.map((pr) => () => prAPI.getById(pr.id));
    const result = await measureParallel(requests);

    allure.attachment(
      "Parallel Details",
      JSON.stringify(result, null, 2),
      "application/json",
    );
    console.log(
      `   ${listData.items.length} parallel details: total=${result.totalTime}ms`,
    );

    expect(result.serverErrorCount, "Нет серверных ошибок").toBe(0);
  });

  test("STRESS: 20 запросов одного PR (cache test)", async ({ prAPI }) => {
    setSeverity("normal");

    const { response: listResp, data: listData } = await prAPI.getList({
      limit: 1,
    });
    if (!listResp.ok() || !listData?.items?.length) {
      test.skip(true, "Нет PR для теста");
      return;
    }

    const prId = listData.items[0].id;
    const requests = Array(20)
      .fill(null)
      .map(() => () => prAPI.getById(prId));
    const result = await measureParallel(requests);

    allure.attachment(
      "Cache Test",
      JSON.stringify(result, null, 2),
      "application/json",
    );
    console.log(`   20 same PR: avg=${result.avgTime}ms`);

    expect(result.serverErrorCount, "Нет серверных ошибок").toBe(0);
  });
});

// ==================== STRESS: CONCURRENT DASHBOARD ====================

test.describe("PR Stress - Concurrent Dashboard @load @stress @pr @dashboard", () => {
  test.beforeEach(() => {
    markAsAPITest(MODULES.PERFORMANCE_REVIEW, "Stress - Dashboard");
  });

  test("STRESS: 10 параллельных запросов dashboard @critical", async ({
    prAPI,
  }) => {
    setSeverity("critical");

    const { response: listResp, data: listData } = await prAPI.getList({
      limit: 1,
    });
    if (!listResp.ok() || !listData?.items?.length) {
      test.skip(true, "Нет PR для теста");
      return;
    }

    const prId = listData.items[0].id;
    const requests = Array(10)
      .fill(null)
      .map(() => () => prAPI.getDashboard(prId));
    const result = await measureParallel(requests);

    allure.attachment(
      "10 Parallel Dashboard",
      JSON.stringify(result, null, 2),
      "application/json",
    );
    console.log(`   10 parallel dashboard: avg=${result.avgTime}ms`);

    expect(result.serverErrorCount, "Нет серверных ошибок").toBe(0);
  });

  test("STRESS: Dashboard для разных PR параллельно", async ({ prAPI }) => {
    setSeverity("normal");

    const { response: listResp, data: listData } = await prAPI.getList({
      limit: 5,
    });
    if (!listResp.ok() || !listData?.items?.length) {
      test.skip(true, "Нет PR для теста");
      return;
    }

    const requests = listData.items.map(
      (pr) => () => prAPI.getDashboard(pr.id),
    );
    const result = await measureParallel(requests);

    allure.attachment(
      "Parallel Dashboards",
      JSON.stringify(result, null, 2),
      "application/json",
    );
    console.log(
      `   ${listData.items.length} dashboards: total=${result.totalTime}ms`,
    );

    expect(result.serverErrorCount, "Нет серверных ошибок").toBe(0);
  });
});

// ==================== STRESS: SUSTAINED LOAD ====================

test.describe("PR Stress - Sustained Load @load @stress @pr @sustained", () => {
  test.beforeEach(() => {
    markAsAPITest(MODULES.PERFORMANCE_REVIEW, "Stress - Sustained");
  });

  test("STRESS: Непрерывная нагрузка 30 секунд @critical", async ({
    prAPI,
  }) => {
    setSeverity("critical");

    const result = await sustainedLoad(() => prAPI.getList({ limit: 10 }), {
      durationMs: 30000,
      targetRps: 5,
      rampUpMs: 5000,
    });

    allure.attachment(
      "Sustained 30s",
      JSON.stringify(result, null, 2),
      "application/json",
    );
    console.log(
      `   30s load: ${result.totalRequests} req, ${result.successRate.toFixed(2)} success rate`,
    );

    expect(result.serverErrorRate, "Server error rate < 5%").toBeLessThan(0.05);
    expect(result.successRate, "Success rate > 90%").toBeGreaterThan(0.9);
  });

  test("STRESS: Непрерывная нагрузка 60 секунд", async ({ prAPI }) => {
    setSeverity("normal");

    const result = await sustainedLoad(() => prAPI.getList({ limit: 10 }), {
      durationMs: 60000,
      targetRps: 3,
      rampUpMs: 10000,
    });

    allure.attachment(
      "Sustained 60s",
      JSON.stringify(result, null, 2),
      "application/json",
    );
    console.log(
      `   60s load: ${result.totalRequests} req, avg=${result.avgTime}ms`,
    );

    expect(result.serverErrorRate, "Server error rate < 5%").toBeLessThan(0.05);
  });
});

// ==================== STRESS: MIXED OPERATIONS ====================

test.describe("PR Stress - Mixed Operations @load @stress @pr @mixed", () => {
  test.beforeEach(() => {
    markAsAPITest(MODULES.PERFORMANCE_REVIEW, "Stress - Mixed");
  });

  test("STRESS: Смешанные параллельные операции @critical", async ({
    prAPI,
  }) => {
    setSeverity("critical");

    const { response: listResp, data: listData } = await prAPI.getList({
      limit: 3,
    });
    if (!listResp.ok() || !listData?.items?.length) {
      test.skip(true, "Нет PR для теста");
      return;
    }

    const prId = listData.items[0].id;
    const requests = [
      () => prAPI.getList({ limit: 20 }),
      () => prAPI.getList({ limit: 50 }),
      () => prAPI.getById(prId),
      () => prAPI.getTargetUsers(prId, { limit: 50 }),
      () => prAPI.getUsersCounts(prId),
      () => prAPI.getDashboard(prId),
      ...listData.items.slice(1).map((pr) => () => prAPI.getById(pr.id)),
    ];

    const result = await measureParallel(requests);

    allure.attachment(
      "Mixed Operations",
      JSON.stringify(result, null, 2),
      "application/json",
    );
    console.log(
      `   ${requests.length} mixed: success=${result.successCount}/${requests.length}`,
    );

    expect(result.serverErrorCount, "Нет серверных ошибок").toBe(0);
  });

  test("STRESS: Волна запросов (burst)", async ({ prAPI }) => {
    setSeverity("normal");

    const results = [];

    for (let wave = 0; wave < 3; wave++) {
      const requests = Array(20)
        .fill(null)
        .map(() => () => prAPI.getList({ limit: 10 }));
      const result = await measureParallel(requests);
      results.push({ wave: wave + 1, ...result });
      console.log(`   Wave ${wave + 1}: success=${result.successCount}/20`);

      if (wave < 2) await new Promise((r) => setTimeout(r, 2000));
    }

    allure.attachment(
      "Burst Waves",
      JSON.stringify(results, null, 2),
      "application/json",
    );

    for (const result of results) {
      expect(result.serverErrorCount, `Wave ${result.wave} без ошибок`).toBe(0);
    }
  });
});

// ==================== STRESS: RAMP UP ====================

test.describe("PR Stress - Ramp Up @load @stress @pr @rampup", () => {
  test.beforeEach(() => {
    markAsAPITest(MODULES.PERFORMANCE_REVIEW, "Stress - Ramp Up");
  });

  test("STRESS: Постепенное увеличение нагрузки @critical", async ({
    prAPI,
  }) => {
    setSeverity("critical");

    const stages = [5, 10, 20, 30, 50];
    const results = [];

    for (const concurrency of stages) {
      const requests = Array(concurrency)
        .fill(null)
        .map(() => () => prAPI.getList({ limit: 10 }));
      const result = await measureParallel(requests);

      results.push({
        concurrency,
        successCount: result.successCount,
        serverErrors: result.serverErrorCount,
        avgTime: result.avgTime,
      });

      console.log(
        `   Concurrency ${concurrency}: success=${result.successCount}/${concurrency}`,
      );
      await new Promise((r) => setTimeout(r, 1000));
    }

    allure.attachment(
      "Ramp Up",
      JSON.stringify(results, null, 2),
      "application/json",
    );

    expect(results[0].serverErrors, "Нет ошибок на 5 запросах").toBe(0);
    expect(results[1].serverErrors, "Нет ошибок на 10 запросах").toBe(0);
  });
});
