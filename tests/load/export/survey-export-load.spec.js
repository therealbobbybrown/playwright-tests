// @ts-check
// tests/load/export/survey-export-load.spec.js
// Нагрузочные тесты экспорта опросов
// @tags @load @export @survey

import { test as base, expect } from "@playwright/test";
import { SurveyAPI, getCredentials } from "../../utils/api/index.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
  allure,
} from "../../utils/allure-helpers.js";
import {
  measureTimeStats,
  measureParallel,
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

// ==================== SUITE 1: SURVEY EXPORT BASELINE ====================

test.describe("Survey Export - Baseline @load @baseline @export", () => {
  const surveyId = LOAD_TEST_CONFIG.largeSurveyId;

  test.beforeEach(() => {
    markAsAPITest(MODULES.SURVEYS, "Survey Export - Baseline");
    if (!surveyId) {
      test.skip(
        true,
        "Запустите load:seed:survey для создания большого опроса",
      );
    }
  });

  test("BASELINE: getExportToken — 5 замеров @critical", async ({
    surveyAPI,
  }) => {
    setSeverity("critical");

    const stats = await measureTimeStats(
      () => surveyAPI.getExportToken(surveyId),
      5,
    );

    allure.attachment(
      "Survey Export Token Stats",
      formatStats(stats),
      "text/plain",
    );
    console.log(`   Survey export token: ${formatStats(stats)}`);

    expect(stats.avg, `Avg < ${thresholds.EXPORT}ms`).toBeLessThan(
      thresholds.EXPORT,
    );
    expect(stats.p95, `P95 < ${thresholds.EXPORT * 2}ms`).toBeLessThan(
      thresholds.EXPORT * 2,
    );
  });

  test("BASELINE: getExportToken с AI-классификацией — 5 замеров", async ({
    surveyAPI,
  }) => {
    setSeverity("normal");

    const stats = await measureTimeStats(
      () => surveyAPI.getExportToken(surveyId, { resultsWithAI: true }),
      5,
    );

    allure.attachment(
      "Survey Export with AI Stats",
      formatStats(stats),
      "text/plain",
    );
    console.log(`   Survey export (AI): ${formatStats(stats)}`);

    expect(stats.avg, `Avg < ${thresholds.EXPORT}ms`).toBeLessThan(
      thresholds.EXPORT,
    );
  });
});

// ==================== SUITE 2: SURVEY EXPORT CONCURRENT ====================

test.describe("Survey Export - Concurrent @load @stress @export", () => {
  const surveyId = LOAD_TEST_CONFIG.largeSurveyId;

  test.beforeEach(() => {
    markAsAPITest(MODULES.SURVEYS, "Survey Export - Concurrent");
    if (!surveyId) {
      test.skip(
        true,
        "Запустите load:seed:survey для создания большого опроса",
      );
    }
  });

  test("STRESS: 5 параллельных getExportToken @critical", async ({
    surveyAPI,
  }) => {
    setSeverity("critical");

    const requests = Array(5)
      .fill(null)
      .map(() => () => surveyAPI.getExportToken(surveyId));
    const result = await measureParallel(requests);

    allure.attachment(
      "5 Parallel Survey Export",
      JSON.stringify(result, null, 2),
      "application/json",
    );
    console.log(
      `   5 parallel survey export: success=${result.successCount}/5, avg=${result.avgTime}ms`,
    );

    expect(result.serverErrorCount, "Нет серверных ошибок").toBe(0);
    expect(result.successCount, "Все запросы успешны").toBe(5);
  });

  test("STRESS: 10 параллельных getExportToken", async ({ surveyAPI }) => {
    setSeverity("normal");

    const requests = Array(10)
      .fill(null)
      .map(() => () => surveyAPI.getExportToken(surveyId));
    const result = await measureParallel(requests);

    allure.attachment(
      "10 Parallel Survey Export",
      JSON.stringify(result, null, 2),
      "application/json",
    );
    console.log(
      `   10 parallel survey export: success=${result.successCount}/10, errors=${result.serverErrorCount}`,
    );

    expect(
      result.serverErrorCount,
      "Максимум 1 серверная ошибка",
    ).toBeLessThanOrEqual(1);
    expect(result.successCount, "Минимум 8 успешных").toBeGreaterThanOrEqual(8);
  });
});
