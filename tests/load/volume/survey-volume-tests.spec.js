// @ts-check
// tests/load/volume/survey-volume-tests.spec.js
// Volume тесты для Survey API
// @tags @load @volume @survey

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

const { thresholds, pagination } = LOAD_TEST_CONFIG;

const test = base.extend({
  surveyAPI: async ({ request }, use) => {
    const api = new SurveyAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
});

// ==================== VOLUME: SURVEY LIST ====================

test.describe("Survey Volume - List Operations @load @volume @survey", () => {
  test.beforeEach(() => {
    markAsAPITest(MODULES.SURVEY, "Volume - List");
  });

  test("VOLUME: Сравнение limit 10, 50, 100, 200 @critical", async ({
    surveyAPI,
  }) => {
    setSeverity("critical");

    const limits = [10, 50, 100, 200];
    const results = {};

    for (const limit of limits) {
      const stats = await measureTimeStats(
        () => surveyAPI.getList({ limit, offset: 0 }),
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
      test.skip(true, "Нет доступа к Survey API");
      return;
    }

    // Проверяем рост времени
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
      expect(ratio, "Время не должно расти экспоненциально").toBeLessThan(10);
    }
  });

  test("VOLUME: Глубокая пагинация (offset 0, 50, 100, 200)", async ({
    surveyAPI,
  }) => {
    setSeverity("normal");

    const { response: countResp, data: countData } = await surveyAPI.getList({
      limit: 1,
    });

    if (!countResp.ok()) {
      test.skip(true, "Нет доступа к Survey API");
      return;
    }

    const total = countData?.total || countData?.items?.length || 0;
    console.log(`   Всего опросов: ${total}`);

    const offsets = [0, 50, 100, 200].filter((o) => o < total || o === 0);
    const results = {};

    for (const offset of offsets) {
      const stats = await measureTimeStats(
        () => surveyAPI.getList({ limit: 50, offset }),
        3,
      );

      if (stats.success) {
        results[offset] = { avg: stats.avg, p95: stats.p95 };
        console.log(`   offset=${offset}: avg=${stats.avg}ms`);
      }
    }

    allure.attachment(
      "Offset Comparison",
      JSON.stringify(results, null, 2),
      "application/json",
    );
  });

  test("VOLUME: Фильтрация по статусу", async ({ surveyAPI }) => {
    setSeverity("normal");

    const statuses = ["active", "draft", "stopped"];
    const results = {};

    for (const status of statuses) {
      const stats = await measureTimeStats(
        () => surveyAPI.getList({ status, limit: 50 }),
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
      "Status Filter",
      JSON.stringify(results, null, 2),
      "application/json",
    );
  });

  test("VOLUME: Получение шаблонов", async ({ surveyAPI }) => {
    setSeverity("normal");

    const stats = await measureTimeStats(
      () => surveyAPI.getTemplates({ limit: 50 }),
      5,
    );

    allure.attachment(
      "Templates",
      JSON.stringify(stats, null, 2),
      "application/json",
    );
    console.log(`   Templates: ${formatStats(stats)}`);

    if (stats.success) {
      expect(stats.avg, `Templates < ${thresholds.NORMAL}ms`).toBeLessThan(
        thresholds.NORMAL,
      );
    }
  });
});

// ==================== VOLUME: SURVEY STATISTICS ====================

test.describe("Survey Volume - Statistics @load @volume @survey @statistics", () => {
  test.beforeEach(() => {
    markAsAPITest(MODULES.SURVEY, "Volume - Statistics");
  });

  test("VOLUME: Statistics Summary @critical", async ({ surveyAPI }) => {
    setSeverity("critical");

    // Ищем опрос с ответами
    const { response: listResp, data: listData } = await surveyAPI.getList({
      limit: 10,
    });

    if (!listResp.ok() || !listData?.items?.length) {
      test.skip(true, "Нет опросов для теста");
      return;
    }

    // Пробуем несколько опросов, ищем с ответами
    let surveyId = null;

    for (const survey of listData.items) {
      try {
        const { response: statsResp } = await surveyAPI.getStatisticsSummary(
          survey.id,
          {},
        );
        if (statsResp.ok()) {
          surveyId = survey.id;
          break;
        }
      } catch {
        continue;
      }
    }

    if (!surveyId) {
      surveyId = listData.items[0].id;
    }

    console.log(`   Тестируем опрос ID=${surveyId}`);

    const stats = await measureTimeStats(
      () => surveyAPI.getStatisticsSummary(surveyId, {}),
      5,
    );

    allure.attachment(
      "Statistics Summary",
      JSON.stringify(stats, null, 2),
      "application/json",
    );
    console.log(`   Statistics Summary: ${formatStats(stats)}`);

    if (stats.success) {
      expect(
        stats.avg,
        `Statistics Summary < ${thresholds.COMPLEX}ms`,
      ).toBeLessThan(thresholds.COMPLEX);
    }
  });

  test("VOLUME: Statistics по департаментам", async ({ surveyAPI }) => {
    setSeverity("normal");

    const { response: listResp, data: listData } = await surveyAPI.getList({
      limit: 5,
    });

    if (!listResp.ok() || !listData?.items?.length) {
      test.skip(true, "Нет опросов для теста");
      return;
    }

    const surveyId = listData.items[0].id;

    const stats = await measureTimeStats(
      () => surveyAPI.getStatisticsDepartments(surveyId),
      5,
    );

    allure.attachment(
      "Statistics Departments",
      JSON.stringify(stats, null, 2),
      "application/json",
    );
    console.log(`   Statistics Departments: ${formatStats(stats)}`);

    if (stats.success) {
      expect(
        stats.avg,
        `Statistics Departments < ${thresholds.COMPLEX}ms`,
      ).toBeLessThan(thresholds.COMPLEX);
    }
  });

  test("VOLUME: Statistics по группам пользователей", async ({ surveyAPI }) => {
    setSeverity("normal");

    const { response: listResp, data: listData } = await surveyAPI.getList({
      limit: 5,
    });

    if (!listResp.ok() || !listData?.items?.length) {
      test.skip(true, "Нет опросов для теста");
      return;
    }

    const surveyId = listData.items[0].id;

    const stats = await measureTimeStats(
      () => surveyAPI.getStatisticsUserGroups(surveyId),
      5,
    );

    allure.attachment(
      "Statistics User Groups",
      JSON.stringify(stats, null, 2),
      "application/json",
    );
    console.log(`   Statistics User Groups: ${formatStats(stats)}`);

    if (stats.success) {
      expect(
        stats.avg,
        `Statistics User Groups < ${thresholds.COMPLEX}ms`,
      ).toBeLessThan(thresholds.COMPLEX);
    }
  });

  test("VOLUME: Statistics Users с разными limit @critical", async ({
    surveyAPI,
  }) => {
    setSeverity("critical");

    const { response: listResp, data: listData } = await surveyAPI.getList({
      limit: 5,
    });

    if (!listResp.ok() || !listData?.items?.length) {
      test.skip(true, "Нет опросов для теста");
      return;
    }

    const surveyId = listData.items[0].id;
    const limits = [50, 100, 200];
    const results = {};

    for (const limit of limits) {
      const stats = await measureTimeStats(
        () => surveyAPI.getStatisticsUsers(surveyId, { limit }),
        3,
      );

      if (stats.success) {
        results[limit] = {
          avg: stats.avg,
          count: stats.results[0]?.data?.items?.length || 0,
        };
        console.log(`   Statistics Users limit=${limit}: avg=${stats.avg}ms`);
      }
    }

    allure.attachment(
      "Statistics Users",
      JSON.stringify(results, null, 2),
      "application/json",
    );

    for (const [limit, data] of Object.entries(results)) {
      expect(
        data.avg,
        `Statistics Users limit=${limit} < ${thresholds.COMPLEX}ms`,
      ).toBeLessThan(thresholds.COMPLEX);
    }
  });

  test("VOLUME: Statistics Revisions", async ({ surveyAPI }) => {
    setSeverity("normal");

    const { response: listResp, data: listData } = await surveyAPI.getList({
      limit: 5,
    });

    if (!listResp.ok() || !listData?.items?.length) {
      test.skip(true, "Нет опросов для теста");
      return;
    }

    const surveyId = listData.items[0].id;

    const stats = await measureTimeStats(
      () => surveyAPI.getStatisticsRevisions(surveyId),
      5,
    );

    allure.attachment(
      "Statistics Revisions",
      JSON.stringify(stats, null, 2),
      "application/json",
    );
    console.log(`   Statistics Revisions: ${formatStats(stats)}`);

    if (stats.success) {
      expect(
        stats.avg,
        `Statistics Revisions < ${thresholds.NORMAL}ms`,
      ).toBeLessThan(thresholds.NORMAL);
    }
  });
});

// ==================== VOLUME: REVISIONS ====================

test.describe("Survey Volume - Revisions @load @volume @survey", () => {
  test.beforeEach(() => {
    markAsAPITest(MODULES.SURVEY, "Volume - Revisions");
  });

  test("VOLUME: Получение ревизий опроса", async ({ surveyAPI }) => {
    setSeverity("normal");

    const { response: listResp, data: listData } = await surveyAPI.getList({
      limit: 5,
    });

    if (!listResp.ok() || !listData?.items?.length) {
      test.skip(true, "Нет опросов для теста");
      return;
    }

    const surveyId = listData.items[0].id;

    const stats = await measureTimeStats(
      () => surveyAPI.getRevisions(surveyId, { limit: 20 }),
      5,
    );

    allure.attachment(
      "Revisions",
      JSON.stringify(stats, null, 2),
      "application/json",
    );
    console.log(`   Revisions: ${formatStats(stats)}`);

    if (stats.success) {
      expect(stats.avg, `Revisions < ${thresholds.NORMAL}ms`).toBeLessThan(
        thresholds.NORMAL,
      );
    }
  });
});

// ==================== VOLUME: EXPORT ====================

test.describe("Survey Volume - Export @load @volume @survey @export", () => {
  test.beforeEach(() => {
    markAsAPITest(MODULES.SURVEY, "Volume - Export");
  });

  test("VOLUME: Получение токена экспорта", async ({ surveyAPI }) => {
    setSeverity("normal");

    const { response: listResp, data: listData } = await surveyAPI.getList({
      limit: 5,
    });

    if (!listResp.ok() || !listData?.items?.length) {
      test.skip(true, "Нет опросов для теста");
      return;
    }

    const surveyId = listData.items[0].id;

    const stats = await measureTimeStats(
      () => surveyAPI.getExportToken(surveyId),
      3,
    );

    allure.attachment(
      "Export Token",
      JSON.stringify(stats, null, 2),
      "application/json",
    );
    console.log(`   Export Token: ${formatStats(stats)}`);

    if (stats.success) {
      // Экспорт может занимать время
      expect(stats.avg, `Export Token < ${thresholds.COMPLEX}ms`).toBeLessThan(
        thresholds.COMPLEX,
      );
    }
  });
});

// ==================== VOLUME: PARALLEL REQUESTS ====================

test.describe("Survey Volume - Parallel Requests @load @volume @survey @parallel", () => {
  test.beforeEach(() => {
    markAsAPITest(MODULES.SURVEY, "Volume - Parallel");
  });

  test("VOLUME: 10 параллельных запросов списка опросов", async ({
    surveyAPI,
  }) => {
    setSeverity("critical");

    const requests = Array(10)
      .fill(null)
      .map(() => () => surveyAPI.getList({ limit: 20 }));

    const result = await measureParallel(requests);

    allure.attachment(
      "Parallel List",
      JSON.stringify(result, null, 2),
      "application/json",
    );

    console.log(
      `   10 parallel: total=${result.totalTime}ms, avg=${result.avgTime}ms, success=${result.successCount}/10`,
    );

    expect(result.serverErrorCount, "Нет серверных ошибок").toBe(0);
    expect(result.successCount, "Все запросы успешны").toBe(10);
  });

  test("VOLUME: Параллельные запросы статистики к разным опросам", async ({
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

    const surveys = listData.items;

    // Параллельно запрашиваем статистику для всех опросов
    const requests = surveys.map(
      (s) => () => surveyAPI.getStatisticsSummary(s.id, {}),
    );

    const result = await measureParallel(requests);

    allure.attachment(
      "Parallel Statistics",
      JSON.stringify(result, null, 2),
      "application/json",
    );

    console.log(
      `   ${surveys.length} parallel stats: total=${result.totalTime}ms, success=${result.successCount}/${surveys.length}`,
    );

    expect(result.serverErrorCount, "Нет серверных ошибок").toBe(0);
  });

  test("VOLUME: Смешанные параллельные запросы", async ({ surveyAPI }) => {
    setSeverity("normal");

    const { response: listResp, data: listData } = await surveyAPI.getList({
      limit: 3,
    });

    if (!listResp.ok() || !listData?.items?.length) {
      test.skip(true, "Нет опросов для теста");
      return;
    }

    const surveyId = listData.items[0].id;

    const requests = [
      () => surveyAPI.getList({ limit: 10 }),
      () => surveyAPI.getById(surveyId),
      () => surveyAPI.getRevisions(surveyId, { limit: 5 }),
      () => surveyAPI.getStatisticsSummary(surveyId, {}),
      () => surveyAPI.getStatisticsDepartments(surveyId),
      () => surveyAPI.getTemplates({ limit: 10 }),
    ];

    const result = await measureParallel(requests);

    allure.attachment(
      "Parallel Mixed",
      JSON.stringify(result, null, 2),
      "application/json",
    );

    console.log(
      `   6 mixed parallel: total=${result.totalTime}ms, success=${result.successCount}/6`,
    );

    expect(result.serverErrorCount, "Нет серверных ошибок").toBe(0);
  });
});
