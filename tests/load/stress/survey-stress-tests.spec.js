// @ts-check
// tests/load/stress/survey-stress-tests.spec.js
// Stress/Concurrent тесты для Survey API
// @tags @load @stress @survey

import { test as base, expect } from "@playwright/test";
import { SurveyAPI, getCredentials } from "../../utils/api/index.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
  allure,
} from "../../utils/allure-helpers.js";
import { measureParallel, sustainedLoad } from "../utils/measure-time.js";
import { LOAD_TEST_CONFIG } from "../seed/seed-config.js";

const { thresholds } = LOAD_TEST_CONFIG;

const test = base.extend({
  surveyAPI: async ({ request }, use) => {
    const api = new SurveyAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
});

// ==================== STRESS: CONCURRENT LIST ====================

test.describe("Survey Stress - Concurrent List @load @stress @survey", () => {
  test.beforeEach(() => {
    markAsAPITest(MODULES.SURVEY, "Stress - Concurrent List");
  });

  test("STRESS: 10 параллельных запросов списка опросов @critical", async ({
    surveyAPI,
  }) => {
    setSeverity("critical");

    const requests = Array(10)
      .fill(null)
      .map(() => () => surveyAPI.getList({ limit: 20 }));
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

  test("STRESS: 25 параллельных запросов списка опросов", async ({
    surveyAPI,
  }) => {
    setSeverity("normal");

    const requests = Array(25)
      .fill(null)
      .map(() => () => surveyAPI.getList({ limit: 10 }));
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

  test("STRESS: 50 параллельных запросов списка опросов @critical", async ({
    surveyAPI,
  }) => {
    setSeverity("critical");

    const requests = Array(50)
      .fill(null)
      .map(() => () => surveyAPI.getList({ limit: 5 }));
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

test.describe("Survey Stress - Concurrent Details @load @stress @survey", () => {
  test.beforeEach(() => {
    markAsAPITest(MODULES.SURVEY, "Stress - Concurrent Details");
  });

  test("STRESS: Параллельные запросы деталей разных опросов", async ({
    surveyAPI,
  }) => {
    setSeverity("normal");

    const { response: listResp, data: listData } = await surveyAPI.getList({
      limit: 10,
    });
    if (!listResp.ok() || !listData?.items?.length) {
      test.skip(true, "Нет опросов для теста");
      return;
    }

    const requests = listData.items.map((s) => () => surveyAPI.getById(s.id));
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

  test("STRESS: 20 запросов одного опроса (cache test)", async ({
    surveyAPI,
  }) => {
    setSeverity("normal");

    const { response: listResp, data: listData } = await surveyAPI.getList({
      limit: 1,
    });
    if (!listResp.ok() || !listData?.items?.length) {
      test.skip(true, "Нет опросов для теста");
      return;
    }

    const surveyId = listData.items[0].id;
    const requests = Array(20)
      .fill(null)
      .map(() => () => surveyAPI.getById(surveyId));
    const result = await measureParallel(requests);

    allure.attachment(
      "Cache Test",
      JSON.stringify(result, null, 2),
      "application/json",
    );
    console.log(`   20 same survey: avg=${result.avgTime}ms`);

    expect(result.serverErrorCount, "Нет серверных ошибок").toBe(0);
  });
});

// ==================== STRESS: CONCURRENT STATISTICS ====================

test.describe("Survey Stress - Concurrent Statistics @load @stress @survey @statistics", () => {
  test.beforeEach(() => {
    markAsAPITest(MODULES.SURVEY, "Stress - Statistics");
  });

  test("STRESS: 10 параллельных запросов статистики @critical", async ({
    surveyAPI,
  }) => {
    setSeverity("critical");

    const { response: listResp, data: listData } = await surveyAPI.getList({
      limit: 1,
    });
    if (!listResp.ok() || !listData?.items?.length) {
      test.skip(true, "Нет опросов для теста");
      return;
    }

    const surveyId = listData.items[0].id;
    const requests = Array(10)
      .fill(null)
      .map(() => () => surveyAPI.getStatisticsSummary(surveyId, {}));
    const result = await measureParallel(requests);

    allure.attachment(
      "10 Parallel Stats",
      JSON.stringify(result, null, 2),
      "application/json",
    );
    console.log(`   10 parallel stats: avg=${result.avgTime}ms`);

    expect(result.serverErrorCount, "Нет серверных ошибок").toBe(0);
  });

  test("STRESS: Параллельная статистика разных опросов", async ({
    surveyAPI,
  }) => {
    setSeverity("normal");

    const { response: listResp, data: listData } = await surveyAPI.getList({
      limit: 5,
    });
    if (!listResp.ok() || !listData?.items?.length) {
      test.skip(true, "Нет опросов для теста");
      return;
    }

    const requests = listData.items.map(
      (s) => () => surveyAPI.getStatisticsSummary(s.id, {}),
    );
    const result = await measureParallel(requests);

    allure.attachment(
      "Parallel Stats Different",
      JSON.stringify(result, null, 2),
      "application/json",
    );
    console.log(
      `   ${listData.items.length} different stats: total=${result.totalTime}ms`,
    );

    expect(result.serverErrorCount, "Нет серверных ошибок").toBe(0);
  });

  test("STRESS: Параллельные разные типы статистики одного опроса", async ({
    surveyAPI,
  }) => {
    setSeverity("normal");

    const { response: listResp, data: listData } = await surveyAPI.getList({
      limit: 1,
    });
    if (!listResp.ok() || !listData?.items?.length) {
      test.skip(true, "Нет опросов для теста");
      return;
    }

    const surveyId = listData.items[0].id;
    const requests = [
      () => surveyAPI.getStatisticsSummary(surveyId, {}),
      () => surveyAPI.getStatisticsDepartments(surveyId),
      () => surveyAPI.getStatisticsUserGroups(surveyId),
      () => surveyAPI.getStatisticsUsers(surveyId, { limit: 50 }),
      () => surveyAPI.getStatisticsRevisions(surveyId),
    ];

    const result = await measureParallel(requests);

    allure.attachment(
      "Parallel Stats Types",
      JSON.stringify(result, null, 2),
      "application/json",
    );
    console.log(`   5 stats types: total=${result.totalTime}ms`);

    expect(result.serverErrorCount, "Нет серверных ошибок").toBe(0);
  });
});

// ==================== STRESS: SUSTAINED LOAD ====================

test.describe("Survey Stress - Sustained Load @load @stress @survey @sustained", () => {
  test.beforeEach(() => {
    markAsAPITest(MODULES.SURVEY, "Stress - Sustained");
  });

  test("STRESS: Непрерывная нагрузка 30 секунд @critical", async ({
    surveyAPI,
  }) => {
    setSeverity("critical");

    const result = await sustainedLoad(() => surveyAPI.getList({ limit: 10 }), {
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
      `   30s load: ${result.totalRequests} req, success=${result.successRate.toFixed(2)}`,
    );

    expect(result.serverErrorRate, "Server error rate < 5%").toBeLessThan(0.05);
    expect(result.successRate, "Success rate > 90%").toBeGreaterThan(0.9);
  });

  test("STRESS: Непрерывная нагрузка 60 секунд", async ({ surveyAPI }) => {
    setSeverity("normal");

    const result = await sustainedLoad(() => surveyAPI.getList({ limit: 10 }), {
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

test.describe("Survey Stress - Mixed Operations @load @stress @survey @mixed", () => {
  test.beforeEach(() => {
    markAsAPITest(MODULES.SURVEY, "Stress - Mixed");
  });

  test("STRESS: Смешанные параллельные операции @critical", async ({
    surveyAPI,
  }) => {
    setSeverity("critical");

    const { response: listResp, data: listData } = await surveyAPI.getList({
      limit: 3,
    });
    if (!listResp.ok() || !listData?.items?.length) {
      test.skip(true, "Нет опросов для теста");
      return;
    }

    const surveyId = listData.items[0].id;
    const requests = [
      () => surveyAPI.getList({ limit: 20 }),
      () => surveyAPI.getList({ limit: 50 }),
      () => surveyAPI.getList({ status: "active", limit: 10 }),
      () => surveyAPI.getById(surveyId),
      () => surveyAPI.getStatisticsSummary(surveyId, {}),
      () => surveyAPI.getStatisticsDepartments(surveyId),
      () => surveyAPI.getRevisions(surveyId, { limit: 10 }),
      () => surveyAPI.getTemplates({ limit: 10 }),
      ...listData.items.slice(1).map((s) => () => surveyAPI.getById(s.id)),
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

  test("STRESS: Волна запросов (burst)", async ({ surveyAPI }) => {
    setSeverity("normal");

    const results = [];

    for (let wave = 0; wave < 3; wave++) {
      const requests = Array(20)
        .fill(null)
        .map(() => () => surveyAPI.getList({ limit: 10 }));
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

test.describe("Survey Stress - Ramp Up @load @stress @survey @rampup", () => {
  test.beforeEach(() => {
    markAsAPITest(MODULES.SURVEY, "Stress - Ramp Up");
  });

  test("STRESS: Постепенное увеличение нагрузки @critical", async ({
    surveyAPI,
  }) => {
    setSeverity("critical");

    const stages = [5, 10, 20, 30, 50];
    const results = [];

    for (const concurrency of stages) {
      const requests = Array(concurrency)
        .fill(null)
        .map(() => () => surveyAPI.getList({ limit: 10 }));
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

// ==================== STRESS: TEMPLATES ====================

test.describe("Survey Stress - Templates @load @stress @survey @templates", () => {
  test.beforeEach(() => {
    markAsAPITest(MODULES.SURVEY, "Stress - Templates");
  });

  test("STRESS: 15 параллельных запросов шаблонов", async ({ surveyAPI }) => {
    setSeverity("normal");

    const requests = Array(15)
      .fill(null)
      .map(() => () => surveyAPI.getTemplates({ limit: 20 }));
    const result = await measureParallel(requests);

    allure.attachment(
      "15 Parallel Templates",
      JSON.stringify(result, null, 2),
      "application/json",
    );
    console.log(`   15 parallel templates: avg=${result.avgTime}ms`);

    expect(result.serverErrorCount, "Нет серверных ошибок").toBe(0);
    expect(result.successCount, "Минимум 13 успешных").toBeGreaterThanOrEqual(
      13,
    );
  });
});
