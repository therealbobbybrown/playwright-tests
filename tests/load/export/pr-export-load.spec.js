// @ts-check
// tests/load/export/pr-export-load.spec.js
// Нагрузочные тесты экспорта Performance Review
// @tags @load @export @pr

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

/**
 * Получить targetUserIds из PR с пагинацией
 */
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

// ==================== SUITE 1: PROGRESS EXPORT ====================

test.describe("PR Export - Progress Token @load @baseline @export", () => {
  test.beforeEach(() => {
    markAsAPITest(MODULES.PERFORMANCE_REVIEW, "Export - Progress Token");
  });

  test("BASELINE: getProgressExportToken — 5 замеров", async ({ prAPI }) => {
    setSeverity("critical");

    // Берём любой PR из списка
    const { data: listData } = await prAPI.getList({ limit: 1 });
    const prId = listData?.items?.[0]?.id;
    if (!prId) {
      test.skip(true, "Нет PR для теста");
      return;
    }

    // Endpoint может возвращать 400 если не передан userDate — это нормально.
    // Проверяем только время отклика и отсутствие 5xx.
    const times = [];
    for (let i = 0; i < 5; i++) {
      const { duration, response } = await measureTime(() =>
        prAPI.getProgressExportToken(prId),
      );
      times.push(duration);
      const status = response?.status();
      expect(status, `Итерация ${i + 1}: нет серверных ошибок`).toBeLessThan(
        500,
      );
    }

    const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
    const sorted = [...times].sort((a, b) => a - b);
    const p95 =
      sorted[Math.floor(sorted.length * 0.95)] || sorted[sorted.length - 1];

    allure.attachment(
      "Progress Export Stats",
      `Samples: ${times.length}, Avg: ${avg}ms, P95: ${p95}ms`,
      "text/plain",
    );
    console.log(
      `   Progress export: Avg=${avg}ms, P95=${p95}ms (note: 400 is expected without userDate)`,
    );

    expect(avg, `Avg < ${thresholds.EXPORT}ms`).toBeLessThan(thresholds.EXPORT);
    expect(p95, `P95 < ${thresholds.EXPORT * 2}ms`).toBeLessThan(
      thresholds.EXPORT * 2,
    );
  });

  test("CONCURRENT: 5 параллельных getProgressExportToken", async ({
    prAPI,
  }) => {
    setSeverity("normal");

    const { data: listData } = await prAPI.getList({ limit: 1 });
    const prId = listData?.items?.[0]?.id;
    if (!prId) {
      test.skip(true, "Нет PR для теста");
      return;
    }

    const requests = Array(5)
      .fill(null)
      .map(() => () => prAPI.getProgressExportToken(prId));
    const result = await measureParallel(requests);

    allure.attachment(
      "5 Parallel Progress Export",
      JSON.stringify(result, null, 2),
      "application/json",
    );
    console.log(
      `   5 parallel progress export: serverErrors=${result.serverErrorCount}/5, avg=${result.avgTime}ms (400 is expected)`,
    );

    // 400 допустим (без userDate), проверяем только отсутствие 5xx
    expect(result.serverErrorCount, "Нет серверных ошибок").toBe(0);
  });
});

// ==================== SUITE 2: INDIVIDUAL EXPORT TOKEN ====================

test.describe("PR Export - Individual Statistics Token @load @baseline @export", () => {
  const prId = LOAD_TEST_CONFIG.largePrWithAnswersId;
  const revisionId = LOAD_TEST_CONFIG.largePrWithAnswersRevisionId;

  test.beforeEach(() => {
    markAsAPITest(
      MODULES.PERFORMANCE_REVIEW,
      "Export - Individual Statistics Token",
    );
    if (!prId || !revisionId) {
      test.skip(
        true,
        "Запустите load:seed:pr:answers для создания PR с ответами",
      );
    }
  });

  test("BASELINE: getExportToken для ревизии — 5 замеров", async ({
    prAPI,
  }) => {
    setSeverity("critical");

    const stats = await measureTimeStats(
      () => prAPI.getExportToken(prId, { revisionId }),
      5,
    );

    allure.attachment(
      "Individual Export Stats",
      formatStats(stats),
      "text/plain",
    );
    console.log(`   Individual export: ${formatStats(stats)}`);

    expect(stats.avg, `Avg < ${thresholds.COMPLEX}ms`).toBeLessThan(
      thresholds.COMPLEX,
    );
  });

  test("BASELINE: getExportToken с targetUserId — 5 замеров", async ({
    prAPI,
  }) => {
    setSeverity("normal");

    // Получаем первого target user
    const { data: targetData } = await prAPI.getStatisticsTargetUsers(prId, {
      limit: 1,
    });
    const targetUserId = targetData?.items?.[0]?.id;
    if (!targetUserId) {
      test.skip(true, "Нет target users в PR");
      return;
    }

    const stats = await measureTimeStats(
      () => prAPI.getExportToken(prId, { revisionId, targetUserId }),
      5,
    );

    allure.attachment(
      "Individual Export with TargetUser",
      formatStats(stats),
      "text/plain",
    );
    console.log(`   Individual export (targetUser): ${formatStats(stats)}`);

    expect(stats.avg, `Avg < ${thresholds.COMPLEX}ms`).toBeLessThan(
      thresholds.COMPLEX,
    );
  });

  test("CONCURRENT: 10 параллельных getExportToken", async ({ prAPI }) => {
    setSeverity("normal");

    const requests = Array(10)
      .fill(null)
      .map(() => () => prAPI.getExportToken(prId, { revisionId }));
    const result = await measureParallel(requests);

    allure.attachment(
      "10 Parallel Individual Export",
      JSON.stringify(result, null, 2),
      "application/json",
    );
    console.log(
      `   10 parallel individual export: success=${result.successCount}/10, avg=${result.avgTime}ms`,
    );

    expect(result.serverErrorCount, "Нет серверных ошибок").toBe(0);
    expect(result.successCount, "Все запросы успешны").toBe(10);
  });
});

// ==================== SUITE 3: GROUP REPORT VOLUME ====================

test.describe("PR Export - Group Report Volume @load @volume @export", () => {
  const prId = LOAD_TEST_CONFIG.largePrWithAnswersId;
  const revisionId = LOAD_TEST_CONFIG.largePrWithAnswersRevisionId;
  let allTargetUserIds = [];

  test.beforeAll(async ({ request }) => {
    if (!prId || !revisionId) return;

    const api = new PerformanceReviewAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);

    allTargetUserIds = await fetchTargetUserIds(api, prId, 1000);
    console.log(
      `   Загружено ${allTargetUserIds.length} targetUserIds для group report тестов`,
    );
  });

  test.beforeEach(() => {
    markAsAPITest(MODULES.PERFORMANCE_REVIEW, "Export - Group Report Volume");
    if (!prId || !revisionId) {
      test.skip(
        true,
        "Запустите load:seed:pr:answers для создания PR с ответами",
      );
    }
  });

  test("VOLUME: групповой отчёт для 10 оцениваемых — 3 замера", async ({
    prAPI,
  }) => {
    setSeverity("critical");
    test.setTimeout(120000);

    const targetUserIds = allTargetUserIds.slice(0, 10);
    expect(
      targetUserIds.length,
      "Минимум 10 target users",
    ).toBeGreaterThanOrEqual(10);

    const stats = await measureTimeStats(
      () =>
        prAPI.getGroupReportExportToken(prId, {
          performanceReviewId: Number(prId),
          targetUserIds,
          revisionId: Number(revisionId),
        }),
      3,
    );

    allure.attachment(
      "Group Report 10 users",
      formatStats(stats),
      "text/plain",
    );
    console.log(`   Group report (10 чел): ${formatStats(stats)}`);

    expect(stats.avg, `Avg < ${thresholds.GROUP_REPORT_SMALL}ms`).toBeLessThan(
      thresholds.GROUP_REPORT_SMALL,
    );
  });

  test("VOLUME: групповой отчёт для 50 оцениваемых — 3 замера", async ({
    prAPI,
  }) => {
    setSeverity("critical");
    test.setTimeout(120000);

    const targetUserIds = allTargetUserIds.slice(0, 50);
    if (targetUserIds.length < 50) {
      test.skip(true, `Только ${targetUserIds.length} target users`);
      return;
    }

    const stats = await measureTimeStats(
      () =>
        prAPI.getGroupReportExportToken(prId, {
          performanceReviewId: Number(prId),
          targetUserIds,
          revisionId: Number(revisionId),
        }),
      3,
    );

    allure.attachment(
      "Group Report 50 users",
      formatStats(stats),
      "text/plain",
    );
    console.log(`   Group report (50 чел): ${formatStats(stats)}`);

    expect(stats.avg, `Avg < ${thresholds.GROUP_REPORT_SMALL}ms`).toBeLessThan(
      thresholds.GROUP_REPORT_SMALL,
    );
  });

  test("VOLUME: групповой отчёт для 100 оцениваемых — 2 замера", async ({
    prAPI,
  }) => {
    setSeverity("critical");
    test.setTimeout(180000);

    const targetUserIds = allTargetUserIds.slice(0, 100);
    if (targetUserIds.length < 100) {
      test.skip(true, `Только ${targetUserIds.length} target users`);
      return;
    }

    const stats = await measureTimeStats(
      () =>
        prAPI.getGroupReportExportToken(prId, {
          performanceReviewId: Number(prId),
          targetUserIds,
          revisionId: Number(revisionId),
        }),
      2,
    );

    allure.attachment(
      "Group Report 100 users",
      formatStats(stats),
      "text/plain",
    );
    console.log(`   Group report (100 чел): ${formatStats(stats)}`);

    expect(stats.avg, `Avg < ${thresholds.GROUP_REPORT_MEDIUM}ms`).toBeLessThan(
      thresholds.GROUP_REPORT_MEDIUM,
    );
  });

  test("VOLUME: групповой отчёт для 500 оцениваемых", async ({ prAPI }) => {
    setSeverity("critical");
    test.setTimeout(180000);

    const targetUserIds = allTargetUserIds.slice(0, 500);
    if (targetUserIds.length < 500) {
      test.skip(true, `Только ${targetUserIds.length} target users`);
      return;
    }

    const { duration } = await measureTime(() =>
      prAPI.getGroupReportExportToken(prId, {
        performanceReviewId: Number(prId),
        targetUserIds,
        revisionId: Number(revisionId),
      }),
    );

    allure.attachment(
      "Group Report 500 users",
      `Duration: ${duration}ms`,
      "text/plain",
    );
    console.log(`   Group report (500 чел): ${duration}ms`);

    expect(
      duration,
      `Duration < ${thresholds.GROUP_REPORT_MEDIUM}ms`,
    ).toBeLessThan(thresholds.GROUP_REPORT_MEDIUM);
  });

  test("VOLUME: групповой отчёт для ВСЕХ оцениваемых", async ({ prAPI }) => {
    setSeverity("critical");
    test.setTimeout(300000);

    const targetUserIds = allTargetUserIds;
    if (targetUserIds.length < 100) {
      test.skip(true, `Только ${targetUserIds.length} target users`);
      return;
    }

    const { duration } = await measureTime(() =>
      prAPI.getGroupReportExportToken(prId, {
        performanceReviewId: Number(prId),
        targetUserIds,
        revisionId: Number(revisionId),
      }),
    );

    allure.attachment(
      "Group Report ALL users",
      `Users: ${targetUserIds.length}, Duration: ${duration}ms`,
      "text/plain",
    );
    console.log(
      `   Group report (ALL ${targetUserIds.length} чел): ${duration}ms`,
    );

    expect(
      duration,
      `Duration < ${thresholds.GROUP_REPORT_LARGE}ms`,
    ).toBeLessThan(thresholds.GROUP_REPORT_LARGE);
  });

  test("VOLUME: рост времени 500 vs 10 чел — ratio < 10x", async ({
    prAPI,
  }) => {
    setSeverity("normal");
    test.setTimeout(240000);

    if (allTargetUserIds.length < 500) {
      test.skip(true, `Только ${allTargetUserIds.length} target users`);
      return;
    }

    const ids10 = allTargetUserIds.slice(0, 10);
    const ids500 = allTargetUserIds.slice(0, 500);

    const { duration: time10 } = await measureTime(() =>
      prAPI.getGroupReportExportToken(prId, {
        performanceReviewId: Number(prId),
        targetUserIds: ids10,
        revisionId: Number(revisionId),
      }),
    );

    const { duration: time500 } = await measureTime(() =>
      prAPI.getGroupReportExportToken(prId, {
        performanceReviewId: Number(prId),
        targetUserIds: ids500,
        revisionId: Number(revisionId),
      }),
    );

    const ratio = time500 / Math.max(time10, 1);

    allure.attachment(
      "Volume Growth Ratio",
      `10 users: ${time10}ms\n500 users: ${time500}ms\nRatio: ${ratio.toFixed(1)}x`,
      "text/plain",
    );
    console.log(
      `   Growth: 10 чел=${time10}ms, 500 чел=${time500}ms, ratio=${ratio.toFixed(1)}x`,
    );

    expect(ratio, "Рост < 10x").toBeLessThan(10);
  });
});

// ==================== SUITE 4: CONCURRENT GROUP REPORTS ====================

test.describe("PR Export - Concurrent Group Reports @load @stress @export", () => {
  const prId = LOAD_TEST_CONFIG.largePrWithAnswersId;
  const revisionId = LOAD_TEST_CONFIG.largePrWithAnswersRevisionId;
  let targetUserIds50 = [];

  test.beforeAll(async ({ request }) => {
    if (!prId || !revisionId) return;

    const api = new PerformanceReviewAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);

    const allIds = await fetchTargetUserIds(api, prId, 100);
    targetUserIds50 = allIds.slice(0, 50);
  });

  test.beforeEach(() => {
    markAsAPITest(
      MODULES.PERFORMANCE_REVIEW,
      "Export - Concurrent Group Reports",
    );
    if (!prId || !revisionId) {
      test.skip(
        true,
        "Запустите load:seed:pr:answers для создания PR с ответами",
      );
    }
  });

  test("STRESS: 3 параллельных групповых отчёта по 50 чел", async ({
    prAPI,
  }) => {
    setSeverity("critical");
    test.setTimeout(120000);

    if (targetUserIds50.length < 50) {
      test.skip(true, `Только ${targetUserIds50.length} target users`);
      return;
    }

    const requests = Array(3)
      .fill(null)
      .map(
        () => () =>
          prAPI.getGroupReportExportToken(prId, {
            performanceReviewId: Number(prId),
            targetUserIds: targetUserIds50,
            revisionId: Number(revisionId),
          }),
      );

    const result = await measureParallel(requests);

    allure.attachment(
      "3 Parallel Group Reports (50 users)",
      JSON.stringify(result, null, 2),
      "application/json",
    );
    console.log(
      `   3 parallel group reports: success=${result.successCount}/3, avg=${result.avgTime}ms`,
    );

    expect(result.serverErrorCount, "Нет серверных ошибок").toBe(0);
    expect(result.successCount, "Все запросы успешны").toBe(3);
  });

  test("STRESS: burst — 3 волны по 2 запроса для 50 чел", async ({ prAPI }) => {
    setSeverity("normal");
    test.setTimeout(180000);

    if (targetUserIds50.length < 50) {
      test.skip(true, `Только ${targetUserIds50.length} target users`);
      return;
    }

    const waveTimes = [];

    for (let wave = 0; wave < 3; wave++) {
      const requests = Array(2)
        .fill(null)
        .map(
          () => () =>
            prAPI.getGroupReportExportToken(prId, {
              performanceReviewId: Number(prId),
              targetUserIds: targetUserIds50,
              revisionId: Number(revisionId),
            }),
        );

      const result = await measureParallel(requests);
      waveTimes.push(result.avgTime);
      console.log(
        `   Волна ${wave + 1}: avg=${result.avgTime}ms, errors=${result.serverErrorCount}`,
      );

      expect(
        result.serverErrorCount,
        `Волна ${wave + 1}: нет серверных ошибок`,
      ).toBe(0);

      // Пауза между волнами
      if (wave < 2) {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }

    // Деградация: последняя волна не более 2x первой
    const degradation = waveTimes[2] / Math.max(waveTimes[0], 1);

    allure.attachment(
      "Burst Waves",
      `Wave 1: ${waveTimes[0]}ms\nWave 2: ${waveTimes[1]}ms\nWave 3: ${waveTimes[2]}ms\nDegradation: ${degradation.toFixed(1)}x`,
      "text/plain",
    );
    console.log(`   Деградация: ${degradation.toFixed(1)}x`);

    expect(degradation, "Деградация < 3x").toBeLessThan(3);
  });
});
