// @ts-check
// tests/load/baseline/survey-baseline.spec.js
// Baseline Performance Tests для Survey API
// @tags @load @baseline @survey

import { test as base, expect } from "@playwright/test";
import { SurveyAPI, getCredentials } from "../../utils/api/index.js";
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
  surveyAPI: async ({ request }, use) => {
    const api = new SurveyAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
});

// ==================== BASELINE: SURVEY LIST ====================

test.describe("Survey API Baseline - List Operations @load @baseline @survey", () => {
  test.beforeEach(() => {
    markAsAPITest(MODULES.SURVEY, "Baseline Performance");
  });

  test("BASELINE: GET /surveys/ (список) @critical", async ({ surveyAPI }) => {
    setSeverity("critical");

    const stats = await measureTimeStats(() => surveyAPI.getList(), 5);

    allure.attachment(
      "Performance Stats",
      JSON.stringify(stats, null, 2),
      "application/json",
    );
    console.log(`Survey List baseline: ${formatStats(stats)}`);

    if (!stats.success) {
      test.skip(true, "Нет доступа к Survey API");
      return;
    }

    expect(stats.avg, `Среднее время < ${thresholds.SLOW}ms`).toBeLessThan(
      thresholds.SLOW,
    );
    expect(stats.p95, `P95 < ${thresholds.COMPLEX}ms`).toBeLessThan(
      thresholds.COMPLEX,
    );
  });

  test("BASELINE: GET /surveys/ с limit=10", async ({ surveyAPI }) => {
    setSeverity("normal");

    const stats = await measureTimeStats(
      () => surveyAPI.getList({ limit: 10, offset: 0 }),
      5,
    );

    allure.attachment(
      "Performance Stats",
      JSON.stringify(stats, null, 2),
      "application/json",
    );
    console.log(`Survey List (limit=10) baseline: ${formatStats(stats)}`);

    if (!stats.success) {
      test.skip(true, "Нет доступа к Survey API");
      return;
    }

    expect(stats.avg).toBeLessThan(thresholds.SLOW);
  });

  test("BASELINE: GET /surveys/ с limit=50", async ({ surveyAPI }) => {
    setSeverity("normal");

    const stats = await measureTimeStats(
      () => surveyAPI.getList({ limit: 50, offset: 0 }),
      5,
    );

    allure.attachment(
      "Performance Stats",
      JSON.stringify(stats, null, 2),
      "application/json",
    );
    console.log(`Survey List (limit=50) baseline: ${formatStats(stats)}`);

    if (!stats.success) {
      test.skip(true, "Нет доступа к Survey API");
      return;
    }

    expect(stats.avg).toBeLessThan(thresholds.SLOW);
  });

  test("BASELINE: GET /surveys/templates/", async ({ surveyAPI }) => {
    setSeverity("normal");

    const stats = await measureTimeStats(
      () => surveyAPI.getTemplates({ limit: 20 }),
      5,
    );

    allure.attachment(
      "Performance Stats",
      JSON.stringify(stats, null, 2),
      "application/json",
    );
    console.log(`Survey Templates baseline: ${formatStats(stats)}`);

    if (!stats.success) {
      test.skip(true, "Нет доступа к шаблонам");
      return;
    }

    expect(stats.avg).toBeLessThan(thresholds.NORMAL);
  });
});

// ==================== BASELINE: SURVEY DETAILS ====================

test.describe("Survey API Baseline - Detail Operations @load @baseline @survey", () => {
  test.beforeEach(() => {
    markAsAPITest(MODULES.SURVEY, "Baseline Performance");
  });

  test("BASELINE: GET /surveys/{id}/ (детали) @critical", async ({
    surveyAPI,
  }) => {
    setSeverity("critical");

    const { response: listResp, data: listData } = await surveyAPI.getList({
      limit: 1,
    });

    if (!listResp.ok()) {
      test.skip(true, "Нет доступа к Survey API");
      return;
    }

    const items = listData?.items || listData || [];
    if (items.length === 0) {
      test.skip(true, "Нет опросов для теста");
      return;
    }

    const surveyId = items[0].id;
    const stats = await measureTimeStats(() => surveyAPI.getById(surveyId), 5);

    allure.attachment(
      "Performance Stats",
      JSON.stringify(stats, null, 2),
      "application/json",
    );
    console.log(`Survey Details baseline: ${formatStats(stats)}`);

    expect(stats.avg, `Среднее время < ${thresholds.NORMAL}ms`).toBeLessThan(
      thresholds.NORMAL,
    );
    expect(stats.p95, `P95 < ${thresholds.SLOW}ms`).toBeLessThan(
      thresholds.SLOW,
    );
  });

  test("BASELINE: GET /surveys/{id}/revisions/", async ({ surveyAPI }) => {
    setSeverity("normal");

    const { response: listResp, data: listData } = await surveyAPI.getList({
      limit: 1,
    });

    if (!listResp.ok()) {
      test.skip(true, "Нет доступа к Survey API");
      return;
    }

    const items = listData?.items || listData || [];
    if (items.length === 0) {
      test.skip(true, "Нет опросов для теста");
      return;
    }

    const surveyId = items[0].id;
    const stats = await measureTimeStats(
      () => surveyAPI.getRevisions(surveyId),
      5,
    );

    allure.attachment(
      "Performance Stats",
      JSON.stringify(stats, null, 2),
      "application/json",
    );
    console.log(`Survey Revisions baseline: ${formatStats(stats)}`);

    if (!stats.success) {
      test.skip(true, "Нет доступа к ревизиям");
      return;
    }

    expect(stats.avg).toBeLessThan(thresholds.NORMAL);
  });
});

// ==================== BASELINE: SURVEY STATISTICS ====================

test.describe("Survey API Baseline - Statistics @load @baseline @survey @statistics", () => {
  test.beforeEach(() => {
    markAsAPITest(MODULES.SURVEY, "Baseline Performance - Statistics");
  });

  test("BASELINE: POST /surveys/{id}/statistics/summary/get/ @critical", async ({
    surveyAPI,
  }) => {
    setSeverity("critical");

    // Ищем опрос со статусом active или stopped (имеющий ответы)
    const { response: listResp, data: listData } = await surveyAPI.getList({
      status: "active",
      limit: 5,
    });

    if (!listResp.ok()) {
      test.skip(true, "Нет доступа к Survey API");
      return;
    }

    let items = listData?.items || listData || [];

    // Если нет активных, берём любые
    if (items.length === 0) {
      const { data: anyData } = await surveyAPI.getList({ limit: 5 });
      items = anyData?.items || anyData || [];
    }

    if (items.length === 0) {
      test.skip(true, "Нет опросов для теста");
      return;
    }

    const surveyId = items[0].id;

    // Получаем ревизию
    const { data: revData } = await surveyAPI.getRevisions(surveyId, {
      limit: 1,
    });
    const revisionId = revData?.items?.[0]?.id;

    const stats = await measureTimeStats(
      () =>
        surveyAPI.getStatisticsSummary(surveyId, {
          revisionsIds: revisionId ? [revisionId] : [],
        }),
      5,
    );

    allure.attachment(
      "Performance Stats",
      JSON.stringify(stats, null, 2),
      "application/json",
    );
    console.log(`Survey Statistics Summary baseline: ${formatStats(stats)}`);

    if (!stats.success) {
      test.skip(true, "Нет доступа к статистике");
      return;
    }

    expect(stats.avg, `Среднее время < ${thresholds.COMPLEX}ms`).toBeLessThan(
      thresholds.COMPLEX,
    );
  });

  test("BASELINE: GET /surveys/{id}/statistics/revisions/", async ({
    surveyAPI,
  }) => {
    setSeverity("normal");

    const { response: listResp, data: listData } = await surveyAPI.getList({
      limit: 1,
    });

    if (!listResp.ok()) {
      test.skip(true, "Нет доступа к Survey API");
      return;
    }

    const items = listData?.items || listData || [];
    if (items.length === 0) {
      test.skip(true, "Нет опросов для теста");
      return;
    }

    const surveyId = items[0].id;
    const stats = await measureTimeStats(
      () => surveyAPI.getStatisticsRevisions(surveyId),
      5,
    );

    allure.attachment(
      "Performance Stats",
      JSON.stringify(stats, null, 2),
      "application/json",
    );
    console.log(`Survey Statistics Revisions baseline: ${formatStats(stats)}`);

    if (!stats.success) {
      test.skip(true, "Нет доступа к статистике ревизий");
      return;
    }

    expect(stats.avg).toBeLessThan(thresholds.NORMAL);
  });

  test("BASELINE: GET /surveys/{id}/statistics/departments/", async ({
    surveyAPI,
  }) => {
    setSeverity("normal");

    const { response: listResp, data: listData } = await surveyAPI.getList({
      limit: 1,
    });

    if (!listResp.ok()) {
      test.skip(true, "Нет доступа к Survey API");
      return;
    }

    const items = listData?.items || listData || [];
    if (items.length === 0) {
      test.skip(true, "Нет опросов для теста");
      return;
    }

    const surveyId = items[0].id;
    const stats = await measureTimeStats(
      () => surveyAPI.getStatisticsDepartments(surveyId),
      5,
    );

    allure.attachment(
      "Performance Stats",
      JSON.stringify(stats, null, 2),
      "application/json",
    );
    console.log(
      `Survey Statistics Departments baseline: ${formatStats(stats)}`,
    );

    if (!stats.success) {
      test.skip(true, "Нет доступа к статистике департаментов");
      return;
    }

    expect(stats.avg).toBeLessThan(thresholds.SLOW);
  });

  test("BASELINE: GET /surveys/{id}/statistics/user-groups/", async ({
    surveyAPI,
  }) => {
    setSeverity("normal");

    const { response: listResp, data: listData } = await surveyAPI.getList({
      limit: 1,
    });

    if (!listResp.ok()) {
      test.skip(true, "Нет доступа к Survey API");
      return;
    }

    const items = listData?.items || listData || [];
    if (items.length === 0) {
      test.skip(true, "Нет опросов для теста");
      return;
    }

    const surveyId = items[0].id;
    const stats = await measureTimeStats(
      () => surveyAPI.getStatisticsUserGroups(surveyId),
      5,
    );

    allure.attachment(
      "Performance Stats",
      JSON.stringify(stats, null, 2),
      "application/json",
    );
    console.log(
      `Survey Statistics User Groups baseline: ${formatStats(stats)}`,
    );

    if (!stats.success) {
      test.skip(true, "Нет доступа к статистике групп");
      return;
    }

    expect(stats.avg).toBeLessThan(thresholds.SLOW);
  });

  test("BASELINE: GET /surveys/{id}/statistics/users/ @critical", async ({
    surveyAPI,
  }) => {
    setSeverity("critical");

    const { response: listResp, data: listData } = await surveyAPI.getList({
      limit: 1,
    });

    if (!listResp.ok()) {
      test.skip(true, "Нет доступа к Survey API");
      return;
    }

    const items = listData?.items || listData || [];
    if (items.length === 0) {
      test.skip(true, "Нет опросов для теста");
      return;
    }

    const surveyId = items[0].id;
    const stats = await measureTimeStats(
      () => surveyAPI.getStatisticsUsers(surveyId, { limit: 50 }),
      5,
    );

    allure.attachment(
      "Performance Stats",
      JSON.stringify(stats, null, 2),
      "application/json",
    );
    console.log(`Survey Statistics Users baseline: ${formatStats(stats)}`);

    if (!stats.success) {
      test.skip(true, "Нет доступа к статистике пользователей");
      return;
    }

    expect(stats.avg, `Среднее время < ${thresholds.SLOW}ms`).toBeLessThan(
      thresholds.SLOW,
    );
  });
});

// ==================== BASELINE: SURVEY EXPORT ====================

test.describe("Survey API Baseline - Export @load @baseline @survey @export", () => {
  test.beforeEach(() => {
    markAsAPITest(MODULES.SURVEY, "Baseline Performance - Export");
  });

  test("BASELINE: GET /surveys/{id}/export/get-token/", async ({
    surveyAPI,
  }) => {
    setSeverity("normal");

    const { response: listResp, data: listData } = await surveyAPI.getList({
      limit: 1,
    });

    if (!listResp.ok()) {
      test.skip(true, "Нет доступа к Survey API");
      return;
    }

    const items = listData?.items || listData || [];
    if (items.length === 0) {
      test.skip(true, "Нет опросов для теста");
      return;
    }

    const surveyId = items[0].id;
    const stats = await measureTimeStats(
      () => surveyAPI.getExportToken(surveyId),
      5,
    );

    allure.attachment(
      "Performance Stats",
      JSON.stringify(stats, null, 2),
      "application/json",
    );
    console.log(`Survey Export Token baseline: ${formatStats(stats)}`);

    if (!stats.success) {
      test.skip(true, "Нет доступа к экспорту");
      return;
    }

    // Генерация токена экспорта может занимать время при больших объёмах
    expect(stats.avg).toBeLessThan(thresholds.COMPLEX);
  });
});

// ==================== BASELINE: LIMIT COMPARISON ====================

test.describe("Survey API Baseline - Limit Comparison @load @baseline @survey", () => {
  test.beforeEach(() => {
    markAsAPITest(MODULES.SURVEY, "Baseline Performance - Limits");
  });

  test("BASELINE: Сравнение limit 10 vs 50 vs 100 (список)", async ({
    surveyAPI,
  }) => {
    setSeverity("normal");

    const limits = [10, 50, 100];
    const results = {};

    for (const limit of limits) {
      const stats = await measureTimeStats(
        () => surveyAPI.getList({ limit, offset: 0 }),
        3,
      );
      if (stats.success) {
        results[limit] = stats;
        console.log(`Survey List (limit=${limit}): avg=${stats.avg}ms`);
      }
    }

    allure.attachment(
      "Limit Comparison",
      JSON.stringify(results, null, 2),
      "application/json",
    );

    if (Object.keys(results).length === 0) {
      test.skip(true, "Нет доступа к Survey API");
      return;
    }

    // Проверяем что время не растёт линейно
    if (results[10] && results[100]) {
      const ratio = results[100].avg / results[10].avg;
      console.log(`Ratio (limit 100 vs 10): ${ratio.toFixed(2)}x`);
      expect(ratio, "Ratio limit 100/10 должен быть < 5x").toBeLessThan(5);
    }
  });

  test("BASELINE: Сравнение limit 50 vs 100 vs 200 (users statistics)", async ({
    surveyAPI,
  }) => {
    setSeverity("normal");

    const { response: listResp, data: listData } = await surveyAPI.getList({
      limit: 1,
    });

    if (!listResp.ok()) {
      test.skip(true, "Нет доступа к Survey API");
      return;
    }

    const items = listData?.items || listData || [];
    if (items.length === 0) {
      test.skip(true, "Нет опросов для теста");
      return;
    }

    const surveyId = items[0].id;
    const limits = [50, 100, 200];
    const results = {};

    for (const limit of limits) {
      const stats = await measureTimeStats(
        () => surveyAPI.getStatisticsUsers(surveyId, { limit }),
        3,
      );
      if (stats.success) {
        results[limit] = stats;
        console.log(
          `Survey Users Statistics (limit=${limit}): avg=${stats.avg}ms`,
        );
      }
    }

    allure.attachment(
      "Limit Comparison",
      JSON.stringify(results, null, 2),
      "application/json",
    );

    if (Object.keys(results).length === 0) {
      test.skip(true, "Нет доступа к статистике пользователей");
      return;
    }

    // Проверяем что время не растёт линейно
    if (results[50] && results[200]) {
      const ratio = results[200].avg / results[50].avg;
      console.log(`Ratio (limit 200 vs 50): ${ratio.toFixed(2)}x`);
      expect(ratio, "Ratio limit 200/50 должен быть < 4x").toBeLessThan(4);
    }
  });
});
