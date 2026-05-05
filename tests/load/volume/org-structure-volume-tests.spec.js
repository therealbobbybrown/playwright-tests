// @ts-check
// tests/load/volume/org-structure-volume-tests.spec.js
// Volume тесты для OrgStructure API
// @tags @load @volume @org

import { test as base, expect } from "@playwright/test";
import { OrgStructureAPI, getCredentials } from "../../utils/api/index.js";
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
  orgAPI: async ({ request }, use) => {
    const api = new OrgStructureAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
});

// ==================== VOLUME: USERS LIST ====================

test.describe("OrgStructure Volume - Users @load @volume @org", () => {
  test.beforeEach(() => {
    markAsAPITest(MODULES.ORG_STRUCTURE, "Volume - Users");
  });

  test("VOLUME: Сравнение limit 10, 50, 100, 500 @critical", async ({
    orgAPI,
  }) => {
    setSeverity("critical");

    const limits = [10, 50, 100, 500];
    const results = {};

    for (const limit of limits) {
      const stats = await measureTimeStats(
        () => orgAPI.findUsers({ limit, offset: 0 }),
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
      test.skip(true, "Нет доступа к OrgStructure API");
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

  test("VOLUME: Глубокая пагинация (offset 0, 100, 500, 1000, 5000)", async ({
    orgAPI,
  }) => {
    setSeverity("normal");

    // Получаем общее количество
    const { response: countResp, data: countData } = await orgAPI.findUsers({
      limit: 1,
    });

    if (!countResp.ok()) {
      test.skip(true, "Нет доступа к OrgStructure API");
      return;
    }

    const total = countData?.total || countData?.items?.length || 0;
    console.log(`   Всего пользователей: ${total}`);

    const offsets = [0, 100, 500, 1000, 5000].filter(
      (o) => o < total || o === 0,
    );
    const results = {};

    for (const offset of offsets) {
      const stats = await measureTimeStats(
        () => orgAPI.findUsers({ limit: 50, offset }),
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

    // Проверяем деградацию на глубокой пагинации
    const keys = Object.keys(results)
      .map(Number)
      .sort((a, b) => a - b);
    if (keys.length >= 2) {
      const first = results[keys[0]];
      const last = results[keys[keys.length - 1]];
      const ratio = last.avg / first.avg;

      console.log(`   Деградация на глубокой пагинации: ${ratio.toFixed(2)}x`);
      expect(
        ratio,
        "Глубокая пагинация не должна сильно замедляться",
      ).toBeLessThan(5);
    }
  });

  test("VOLUME: Поиск с текстовым фильтром", async ({ orgAPI }) => {
    setSeverity("normal");

    const searchTerms = ["а", "иван", "отдел", "менеджер"];
    const results = {};

    for (const term of searchTerms) {
      const stats = await measureTimeStats(
        () => orgAPI.findUsers({ q: term, limit: 50 }),
        3,
      );

      if (stats.success) {
        results[term] = {
          avg: stats.avg,
          count: stats.results[0]?.data?.items?.length || 0,
        };
        console.log(
          `   q="${term}": avg=${stats.avg}ms, count=${results[term].count}`,
        );
      }
    }

    allure.attachment(
      "Search Terms",
      JSON.stringify(results, null, 2),
      "application/json",
    );
  });

  test("VOLUME: Фильтр inOrgStruct с разными limit", async ({ orgAPI }) => {
    setSeverity("normal");

    const limits = [50, 100, 500];
    const results = {};

    for (const limit of limits) {
      const stats = await measureTimeStats(
        () => orgAPI.findUsers({ inOrgStruct: true, limit }),
        3,
      );

      if (stats.success) {
        results[limit] = {
          avg: stats.avg,
          count: stats.results[0]?.data?.items?.length || 0,
        };
        console.log(
          `   inOrgStruct limit=${limit}: avg=${stats.avg}ms, count=${results[limit].count}`,
        );
      }
    }

    allure.attachment(
      "InOrgStruct Limits",
      JSON.stringify(results, null, 2),
      "application/json",
    );
  });
});

// ==================== VOLUME: DEPARTMENTS ====================

test.describe("OrgStructure Volume - Departments @load @volume @org", () => {
  test.beforeEach(() => {
    markAsAPITest(MODULES.ORG_STRUCTURE, "Volume - Departments");
  });

  test("VOLUME: Список департаментов с разными limit @critical", async ({
    orgAPI,
  }) => {
    setSeverity("critical");

    const limits = [10, 50, 100, 200];
    const results = {};

    for (const limit of limits) {
      const stats = await measureTimeStats(
        () => orgAPI.getDepartments({ limit, offset: 0 }),
        3,
      );

      if (stats.success) {
        results[limit] = {
          avg: stats.avg,
          count:
            stats.results[0]?.data?.items?.length ||
            stats.results[0]?.data?.length ||
            0,
        };
        console.log(
          `   limit=${limit}: avg=${stats.avg}ms, count=${results[limit].count}`,
        );
      }
    }

    allure.attachment(
      "Departments Limits",
      JSON.stringify(results, null, 2),
      "application/json",
    );

    if (Object.keys(results).length === 0) {
      test.skip(true, "Нет доступа к departments");
      return;
    }

    for (const [limit, data] of Object.entries(results)) {
      expect(
        data.avg,
        `Departments limit=${limit} < ${thresholds.SLOW}ms`,
      ).toBeLessThan(thresholds.SLOW);
    }
  });

  test("VOLUME: Поиск департаментов с разными запросами", async ({
    orgAPI,
  }) => {
    setSeverity("normal");

    const searchTerms = ["", "отдел", "департамент", "управление"];
    const results = {};

    for (const term of searchTerms) {
      const stats = await measureTimeStats(
        () => orgAPI.searchDepartments({ q: term, limit: 50 }),
        3,
      );

      if (stats.success) {
        results[term || "(пусто)"] = {
          avg: stats.avg,
          count: stats.results[0]?.data?.items?.length || 0,
        };
        console.log(
          `   q="${term || "(пусто)"}": avg=${stats.avg}ms, count=${results[term || "(пусто)"].count}`,
        );
      }
    }

    allure.attachment(
      "Search Departments",
      JSON.stringify(results, null, 2),
      "application/json",
    );
  });

  test("VOLUME: Пользователи департамента (без nested)", async ({ orgAPI }) => {
    setSeverity("normal");

    const { response: listResp, data: listData } = await orgAPI.getDepartments({
      limit: 10,
    });

    if (!listResp.ok()) {
      test.skip(true, "Нет доступа к departments");
      return;
    }

    const items = listData?.items || listData || [];
    if (items.length === 0) {
      test.skip(true, "Нет департаментов");
      return;
    }

    const results = {};

    // Тестируем несколько департаментов
    for (const dept of items.slice(0, 5)) {
      const stats = await measureTimeStats(
        () => orgAPI.getUsersFromDepartment(dept.id, false),
        3,
      );

      if (stats.success) {
        results[dept.id] = {
          title: dept.title || dept.name,
          avg: stats.avg,
          count:
            stats.results[0]?.data?.items?.length ||
            stats.results[0]?.data?.length ||
            0,
        };
      }
    }

    allure.attachment(
      "Department Users",
      JSON.stringify(results, null, 2),
      "application/json",
    );
    console.log(
      `   Протестировано ${Object.keys(results).length} департаментов`,
    );
  });

  test("VOLUME: Пользователи департамента (с nested) @critical", async ({
    orgAPI,
  }) => {
    setSeverity("critical");

    const { response: listResp, data: listData } = await orgAPI.getDepartments({
      limit: 5,
    });

    if (!listResp.ok()) {
      test.skip(true, "Нет доступа к departments");
      return;
    }

    const items = listData?.items || listData || [];
    if (items.length === 0) {
      test.skip(true, "Нет департаментов");
      return;
    }

    const results = {};

    // Тестируем с nested=true (рекурсивный обход)
    for (const dept of items.slice(0, 3)) {
      const stats = await measureTimeStats(
        () => orgAPI.getUsersFromDepartment(dept.id, true),
        3,
      );

      if (stats.success) {
        results[dept.id] = {
          title: dept.title || dept.name,
          avg: stats.avg,
          count:
            stats.results[0]?.data?.items?.length ||
            stats.results[0]?.data?.length ||
            0,
        };
        console.log(
          `   Dept "${dept.title || dept.id}" nested: avg=${stats.avg}ms, users=${results[dept.id].count}`,
        );
      }
    }

    allure.attachment(
      "Department Users Nested",
      JSON.stringify(results, null, 2),
      "application/json",
    );

    // Nested запросы не должны превышать VERY_COMPLEX
    for (const [id, data] of Object.entries(results)) {
      expect(
        data.avg,
        `Nested users dept=${id} < ${thresholds.VERY_COMPLEX}ms`,
      ).toBeLessThan(thresholds.VERY_COMPLEX);
    }
  });
});

// ==================== VOLUME: ORG TREE ====================

test.describe("OrgStructure Volume - Tree @load @volume @org @tree", () => {
  test.beforeEach(() => {
    markAsAPITest(MODULES.ORG_STRUCTURE, "Volume - Tree");
  });

  test("VOLUME: Полное дерево организации @critical", async ({ orgAPI }) => {
    setSeverity("critical");

    const stats = await measureTimeStats(() => orgAPI.getTreeItems(), 5);

    allure.attachment(
      "Tree Items",
      JSON.stringify(stats, null, 2),
      "application/json",
    );
    console.log(`   Tree Items: ${formatStats(stats)}`);

    if (!stats.success) {
      test.skip(true, "Нет доступа к дереву");
      return;
    }

    // Анализируем размер дерева
    const firstResult = stats.results[0]?.data;
    const treeSize = Array.isArray(firstResult)
      ? firstResult.length
      : Object.keys(firstResult || {}).length;
    console.log(`   Размер дерева: ${treeSize} элементов`);

    // Большое дерево может загружаться долго
    expect(stats.avg, `Tree < ${thresholds.VERY_COMPLEX}ms`).toBeLessThan(
      thresholds.VERY_COMPLEX,
    );
  });

  test("VOLUME: Плоское дерево департаментов", async ({ orgAPI }) => {
    setSeverity("normal");

    const stats = await measureTimeStats(
      () => orgAPI.getDepartmentsFlatTree(),
      5,
    );

    allure.attachment(
      "Flat Tree",
      JSON.stringify(stats, null, 2),
      "application/json",
    );
    console.log(`   Flat Tree: ${formatStats(stats)}`);

    if (!stats.success) {
      test.skip(true, "Нет доступа к flat tree");
      return;
    }

    expect(stats.avg, `Flat Tree < ${thresholds.COMPLEX}ms`).toBeLessThan(
      thresholds.COMPLEX,
    );
  });

  test("VOLUME: Информация о нескольких департаментах в дереве", async ({
    orgAPI,
  }) => {
    setSeverity("normal");

    const { response: listResp, data: listData } = await orgAPI.getDepartments({
      limit: 10,
    });

    if (!listResp.ok()) {
      test.skip(true, "Нет доступа к departments");
      return;
    }

    const items = listData?.items || listData || [];
    if (items.length === 0) {
      test.skip(true, "Нет департаментов");
      return;
    }

    const results = {};

    for (const dept of items.slice(0, 5)) {
      const stats = await measureTimeStats(
        () => orgAPI.getTreeDepartmentInfo(dept.id),
        3,
      );

      if (stats.success) {
        results[dept.id] = {
          title: dept.title || dept.name,
          avg: stats.avg,
        };
      }
    }

    allure.attachment(
      "Tree Department Info",
      JSON.stringify(results, null, 2),
      "application/json",
    );
    console.log(
      `   Протестировано ${Object.keys(results).length} департаментов`,
    );
  });

  test("VOLUME: Информация о корне дерева", async ({ orgAPI }) => {
    setSeverity("normal");

    const stats = await measureTimeStats(() => orgAPI.getTreeRootInfo(), 5);

    allure.attachment(
      "Tree Root Info",
      JSON.stringify(stats, null, 2),
      "application/json",
    );
    console.log(`   Tree Root Info: ${formatStats(stats)}`);

    if (!stats.success) {
      test.skip(true, "Нет доступа к root info");
      return;
    }

    expect(stats.avg, `Root Info < ${thresholds.NORMAL}ms`).toBeLessThan(
      thresholds.NORMAL,
    );
  });
});

// ==================== VOLUME: USER GROUPS ====================

test.describe("OrgStructure Volume - User Groups @load @volume @org @groups", () => {
  test.beforeEach(() => {
    markAsAPITest(MODULES.ORG_STRUCTURE, "Volume - User Groups");
  });

  test("VOLUME: Список групп с разными limit @critical", async ({ orgAPI }) => {
    setSeverity("critical");

    const limits = [10, 50, 100];
    const results = {};

    for (const limit of limits) {
      const stats = await measureTimeStats(
        () => orgAPI.getUserGroups({ limit }),
        3,
      );

      if (stats.success) {
        results[limit] = {
          avg: stats.avg,
          count:
            stats.results[0]?.data?.items?.length ||
            stats.results[0]?.data?.length ||
            0,
        };
        console.log(
          `   limit=${limit}: avg=${stats.avg}ms, count=${results[limit].count}`,
        );
      }
    }

    allure.attachment(
      "User Groups Limits",
      JSON.stringify(results, null, 2),
      "application/json",
    );

    if (Object.keys(results).length === 0) {
      test.skip(true, "Нет доступа к user groups");
      return;
    }
  });

  test("VOLUME: Пользователи групп с разными limit", async ({ orgAPI }) => {
    setSeverity("normal");

    const { response: listResp, data: listData } = await orgAPI.getUserGroups({
      limit: 5,
    });

    if (!listResp.ok()) {
      test.skip(true, "Нет доступа к user groups");
      return;
    }

    const items = listData?.items || listData || [];
    if (items.length === 0) {
      test.skip(true, "Нет групп");
      return;
    }

    const groupId = items[0].id;
    const limits = [20, 50, 100, 200];
    const results = {};

    for (const limit of limits) {
      const stats = await measureTimeStats(
        () => orgAPI.getUserGroupUsers(groupId, { limit }),
        3,
      );

      if (stats.success) {
        results[limit] = {
          avg: stats.avg,
          count: stats.results[0]?.data?.items?.length || 0,
        };
        console.log(
          `   Group users limit=${limit}: avg=${stats.avg}ms, count=${results[limit].count}`,
        );
      }
    }

    allure.attachment(
      "Group Users Limits",
      JSON.stringify(results, null, 2),
      "application/json",
    );
  });

  test("VOLUME: Пользователи вне группы", async ({ orgAPI }) => {
    setSeverity("normal");

    const { response: listResp, data: listData } = await orgAPI.getUserGroups({
      limit: 3,
    });

    if (!listResp.ok()) {
      test.skip(true, "Нет доступа к user groups");
      return;
    }

    const items = listData?.items || listData || [];
    if (items.length === 0) {
      test.skip(true, "Нет групп");
      return;
    }

    const results = {};

    for (const group of items) {
      const stats = await measureTimeStats(
        () => orgAPI.getUserGroupUsersOutside(group.id, { limit: 50 }),
        3,
      );

      if (stats.success) {
        results[group.id] = {
          title: group.title || group.name,
          avg: stats.avg,
          count: stats.results[0]?.data?.items?.length || 0,
        };
        console.log(
          `   Outside group "${group.title || group.id}": avg=${stats.avg}ms`,
        );
      }
    }

    allure.attachment(
      "Users Outside Groups",
      JSON.stringify(results, null, 2),
      "application/json",
    );
  });
});

// ==================== VOLUME: EXPORT ====================

test.describe("OrgStructure Volume - Export @load @volume @org @export", () => {
  test.beforeEach(() => {
    markAsAPITest(MODULES.ORG_STRUCTURE, "Volume - Export");
  });

  test("VOLUME: Получение токена экспорта", async ({ orgAPI }) => {
    setSeverity("normal");

    const stats = await measureTimeStats(() => orgAPI.getExportToken(), 3);

    allure.attachment(
      "Export Token",
      JSON.stringify(stats, null, 2),
      "application/json",
    );
    console.log(`   Export Token: ${formatStats(stats)}`);

    if (!stats.success) {
      // Экспорт может быть недоступен
      console.log(`   Экспорт недоступен: ${stats.error || "unknown error"}`);
      return;
    }

    expect(stats.avg, `Export Token < ${thresholds.EXPORT}ms`).toBeLessThan(
      thresholds.EXPORT,
    );
  });
});

// ==================== VOLUME: SUBORDINATES ====================

test.describe("OrgStructure Volume - Subordinates @load @volume @org", () => {
  test.beforeEach(() => {
    markAsAPITest(MODULES.ORG_STRUCTURE, "Volume - Subordinates");
  });

  test("VOLUME: Количество подчинённых для пользователей", async ({
    orgAPI,
  }) => {
    setSeverity("normal");

    // Получаем пользователей
    const { response: usersResp, data: usersData } = await orgAPI.findUsers({
      limit: 50,
    });

    if (!usersResp.ok()) {
      test.skip(true, "Нет доступа к пользователям");
      return;
    }

    const items = usersData?.items || usersData || [];
    if (items.length === 0) {
      test.skip(true, "Нет пользователей");
      return;
    }

    // Тестируем запрос с разным количеством ID
    const batches = [5, 10, 20, 50];
    const results = {};

    for (const batchSize of batches) {
      const userIds = items.slice(0, batchSize).map((u) => u.id);

      const stats = await measureTimeStats(
        () => orgAPI.getSubordinatesCountByUsersIds(userIds),
        3,
      );

      if (stats.success) {
        results[batchSize] = { avg: stats.avg };
        console.log(`   ${batchSize} users: avg=${stats.avg}ms`);
      }
    }

    allure.attachment(
      "Subordinates Count",
      JSON.stringify(results, null, 2),
      "application/json",
    );
  });

  test("VOLUME: Руководители компании", async ({ orgAPI }) => {
    setSeverity("normal");

    const stats = await measureTimeStats(() => orgAPI.getRootHeads(), 5);

    allure.attachment(
      "Root Heads",
      JSON.stringify(stats, null, 2),
      "application/json",
    );
    console.log(`   Root Heads: ${formatStats(stats)}`);

    if (!stats.success) {
      test.skip(true, "Нет доступа к root heads");
      return;
    }

    expect(stats.avg, `Root Heads < ${thresholds.FAST}ms`).toBeLessThan(
      thresholds.FAST,
    );
  });
});

// ==================== VOLUME: PARALLEL REQUESTS ====================

test.describe("OrgStructure Volume - Parallel Requests @load @volume @org @parallel", () => {
  test.beforeEach(() => {
    markAsAPITest(MODULES.ORG_STRUCTURE, "Volume - Parallel");
  });

  test("VOLUME: 10 параллельных запросов списка пользователей", async ({
    orgAPI,
  }) => {
    setSeverity("critical");

    const requests = Array(10)
      .fill(null)
      .map(() => () => orgAPI.findUsers({ limit: 20 }));

    const result = await measureParallel(requests);

    allure.attachment(
      "Parallel Users",
      JSON.stringify(result, null, 2),
      "application/json",
    );

    console.log(
      `   10 parallel: total=${result.totalTime}ms, avg=${result.avgTime}ms, success=${result.successCount}/10`,
    );

    expect(result.serverErrorCount, "Нет серверных ошибок").toBe(0);
    expect(result.successCount, "Все запросы успешны").toBe(10);
  });

  test("VOLUME: Параллельные запросы к разным ресурсам", async ({ orgAPI }) => {
    setSeverity("normal");

    const { response: deptResp, data: deptData } = await orgAPI.getDepartments({
      limit: 3,
    });
    const { response: groupResp, data: groupData } = await orgAPI.getUserGroups(
      { limit: 2 },
    );

    const depts = deptData?.items || deptData || [];
    const groups = groupData?.items || groupData || [];

    const requests = [
      () => orgAPI.findUsers({ limit: 20 }),
      () => orgAPI.getDepartments({ limit: 20 }),
      () => orgAPI.getUserGroups({ limit: 20 }),
      () => orgAPI.getTreeRootInfo(),
      () => orgAPI.getRootHeads(),
    ];

    // Добавляем запросы к конкретным ресурсам
    if (depts.length > 0) {
      requests.push(() => orgAPI.getUsersFromDepartment(depts[0].id, false));
    }
    if (groups.length > 0) {
      requests.push(() =>
        orgAPI.getUserGroupUsers(groups[0].id, { limit: 20 }),
      );
    }

    const result = await measureParallel(requests);

    allure.attachment(
      "Parallel Mixed",
      JSON.stringify(result, null, 2),
      "application/json",
    );

    console.log(
      `   ${requests.length} mixed parallel: total=${result.totalTime}ms, success=${result.successCount}/${requests.length}`,
    );

    expect(result.serverErrorCount, "Нет серверных ошибок").toBe(0);
  });

  test("VOLUME: Параллельный поиск пользователей с разными фильтрами", async ({
    orgAPI,
  }) => {
    setSeverity("normal");

    const requests = [
      () => orgAPI.findUsers({ limit: 50 }),
      () => orgAPI.findUsers({ q: "а", limit: 50 }),
      () => orgAPI.findUsers({ inOrgStruct: true, limit: 50 }),
      () => orgAPI.findUsers({ q: "иван", limit: 50 }),
      () => orgAPI.findUsers({ offset: 100, limit: 50 }),
    ];

    const result = await measureParallel(requests);

    allure.attachment(
      "Parallel Search",
      JSON.stringify(result, null, 2),
      "application/json",
    );

    console.log(
      `   5 parallel search: total=${result.totalTime}ms, success=${result.successCount}/5`,
    );

    expect(result.serverErrorCount, "Нет серверных ошибок").toBe(0);
  });

  test("VOLUME: 20 параллельных запросов дерева", async ({ orgAPI }) => {
    setSeverity("critical");

    // Высокая нагрузка на дерево - критичный эндпоинт
    const requests = Array(20)
      .fill(null)
      .map(() => () => orgAPI.getTreeRootInfo());

    const result = await measureParallel(requests);

    allure.attachment(
      "Parallel Tree",
      JSON.stringify(result, null, 2),
      "application/json",
    );

    console.log(
      `   20 parallel tree: total=${result.totalTime}ms, avg=${result.avgTime}ms, success=${result.successCount}/20`,
    );

    expect(result.serverErrorCount, "Нет серверных ошибок").toBe(0);
    expect(
      result.successCount,
      "Минимум 18 запросов успешны",
    ).toBeGreaterThanOrEqual(18);
  });
});

// ==================== VOLUME: HEAVY OPERATIONS ====================

test.describe("OrgStructure Volume - Heavy Operations @load @volume @org @heavy", () => {
  test.beforeEach(() => {
    markAsAPITest(MODULES.ORG_STRUCTURE, "Volume - Heavy");
  });

  test("VOLUME: Полное дерево + статистика @critical", async ({ orgAPI }) => {
    setSeverity("critical");

    // Комбинация тяжёлых запросов
    const results = {};

    // 1. Полное дерево
    const treeStats = await measureTimeStats(() => orgAPI.getTreeItems(), 3);
    if (treeStats.success) {
      results.tree = { avg: treeStats.avg, p95: treeStats.p95 };
      console.log(`   Tree: avg=${treeStats.avg}ms`);
    }

    // 2. Все пользователи (большой limit)
    const usersStats = await measureTimeStats(
      () => orgAPI.findUsers({ limit: 500 }),
      3,
    );
    if (usersStats.success) {
      results.users = {
        avg: usersStats.avg,
        count: usersStats.results[0]?.data?.items?.length || 0,
      };
      console.log(
        `   Users (500): avg=${usersStats.avg}ms, count=${results.users.count}`,
      );
    }

    // 3. Все департаменты
    const deptsStats = await measureTimeStats(
      () => orgAPI.getDepartments({ limit: 200 }),
      3,
    );
    if (deptsStats.success) {
      results.departments = {
        avg: deptsStats.avg,
        count:
          deptsStats.results[0]?.data?.items?.length ||
          deptsStats.results[0]?.data?.length ||
          0,
      };
      console.log(
        `   Departments: avg=${deptsStats.avg}ms, count=${results.departments.count}`,
      );
    }

    allure.attachment(
      "Heavy Operations",
      JSON.stringify(results, null, 2),
      "application/json",
    );
  });

  test("VOLUME: Последовательная цепочка запросов", async ({ orgAPI }) => {
    setSeverity("normal");

    const timings = [];

    // Симулируем типичный сценарий загрузки страницы оргструктуры
    const startTime = Date.now();

    // 1. Получаем корень
    const { time: rootTime } = await measureTimeStats(
      () => orgAPI.getTreeRootInfo(),
      1,
    );
    timings.push({ operation: "getRootInfo", time: rootTime });

    // 2. Получаем департаменты
    const { time: deptsTime, results: deptsResults } = await measureTimeStats(
      () => orgAPI.getDepartments({ limit: 50 }),
      1,
    );
    timings.push({ operation: "getDepartments", time: deptsTime });

    // 3. Получаем пользователей
    const { time: usersTime } = await measureTimeStats(
      () => orgAPI.findUsers({ limit: 50 }),
      1,
    );
    timings.push({ operation: "findUsers", time: usersTime });

    // 4. Для первого департамента получаем пользователей
    const depts =
      deptsResults?.[0]?.data?.items || deptsResults?.[0]?.data || [];
    if (depts.length > 0) {
      const { time: deptUsersTime } = await measureTimeStats(
        () => orgAPI.getUsersFromDepartment(depts[0].id, false),
        1,
      );
      timings.push({ operation: "getDepartmentUsers", time: deptUsersTime });
    }

    const totalTime = Date.now() - startTime;

    allure.attachment(
      "Chain Timings",
      JSON.stringify({ timings, totalTime }, null, 2),
      "application/json",
    );

    console.log(`   Цепочка запросов: ${totalTime}ms`);
    timings.forEach((t) => console.log(`     - ${t.operation}: ${t.time}ms`));

    // Общее время не должно быть слишком большим
    expect(
      totalTime,
      `Цепочка < ${thresholds.VERY_COMPLEX * 2}ms`,
    ).toBeLessThan(thresholds.VERY_COMPLEX * 2);
  });
});
