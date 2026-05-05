// @ts-check
// tests/load/baseline/org-structure-baseline.spec.js
// Baseline Performance Tests для OrgStructure API
// @tags @load @baseline @org

import { test as base, expect } from "@playwright/test";
import { OrgStructureAPI, getCredentials } from "../../utils/api/index.js";
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
  orgAPI: async ({ request }, use) => {
    const api = new OrgStructureAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
});

// ==================== BASELINE: ORG TREE ====================

test.describe("OrgStructure API Baseline - Tree @load @baseline @org", () => {
  test.beforeEach(() => {
    markAsAPITest(MODULES.ORG_STRUCTURE, "Baseline Performance - Tree");
  });

  test("BASELINE: GET /org-struct/tree/items/ @critical", async ({
    orgAPI,
  }) => {
    setSeverity("critical");

    const stats = await measureTimeStats(() => orgAPI.getTreeItems(), 5);

    allure.attachment(
      "Performance Stats",
      JSON.stringify(stats, null, 2),
      "application/json",
    );
    console.log(`OrgStructure Tree Items baseline: ${formatStats(stats)}`);

    if (!stats.success) {
      test.skip(true, "Нет доступа к OrgStructure API");
      return;
    }

    // Дерево может быть большим, даём больше времени
    expect(
      stats.avg,
      `Среднее время < ${thresholds.VERY_COMPLEX}ms`,
    ).toBeLessThan(thresholds.VERY_COMPLEX);
    expect(stats.p95, `P95 < 15s`).toBeLessThan(15000);
  });

  test("BASELINE: GET /org-struct/departments/flat-tree/", async ({
    orgAPI,
  }) => {
    setSeverity("normal");

    const stats = await measureTimeStats(
      () => orgAPI.getDepartmentsFlatTree(),
      5,
    );

    allure.attachment(
      "Performance Stats",
      JSON.stringify(stats, null, 2),
      "application/json",
    );
    console.log(`OrgStructure Flat Tree baseline: ${formatStats(stats)}`);

    if (!stats.success) {
      test.skip(true, "Нет доступа к flat tree");
      return;
    }

    expect(stats.avg).toBeLessThan(thresholds.COMPLEX);
  });

  test("BASELINE: GET /org-struct/tree/departments/root/info/", async ({
    orgAPI,
  }) => {
    setSeverity("normal");

    const stats = await measureTimeStats(() => orgAPI.getTreeRootInfo(), 5);

    allure.attachment(
      "Performance Stats",
      JSON.stringify(stats, null, 2),
      "application/json",
    );
    console.log(`OrgStructure Root Info baseline: ${formatStats(stats)}`);

    if (!stats.success) {
      test.skip(true, "Нет доступа к root info");
      return;
    }

    expect(stats.avg).toBeLessThan(thresholds.NORMAL);
  });
});

// ==================== BASELINE: DEPARTMENTS ====================

test.describe("OrgStructure API Baseline - Departments @load @baseline @org", () => {
  test.beforeEach(() => {
    markAsAPITest(MODULES.ORG_STRUCTURE, "Baseline Performance - Departments");
  });

  test("BASELINE: GET /departments/ @critical", async ({ orgAPI }) => {
    setSeverity("critical");

    const stats = await measureTimeStats(() => orgAPI.getDepartments(), 5);

    allure.attachment(
      "Performance Stats",
      JSON.stringify(stats, null, 2),
      "application/json",
    );
    console.log(`OrgStructure Departments baseline: ${formatStats(stats)}`);

    if (!stats.success) {
      test.skip(true, "Нет доступа к OrgStructure API");
      return;
    }

    expect(stats.avg, `Среднее время < ${thresholds.SLOW}ms`).toBeLessThan(
      thresholds.SLOW,
    );
  });

  test("BASELINE: GET /departments/ с limit=100", async ({ orgAPI }) => {
    setSeverity("normal");

    const stats = await measureTimeStats(
      () => orgAPI.getDepartments({ limit: 100 }),
      5,
    );

    allure.attachment(
      "Performance Stats",
      JSON.stringify(stats, null, 2),
      "application/json",
    );
    console.log(
      `OrgStructure Departments (limit=100) baseline: ${formatStats(stats)}`,
    );

    if (!stats.success) {
      test.skip(true, "Нет доступа к departments");
      return;
    }

    expect(stats.avg).toBeLessThan(thresholds.SLOW);
  });

  test("BASELINE: POST /departments/get/ (поиск)", async ({ orgAPI }) => {
    setSeverity("normal");

    const stats = await measureTimeStats(
      () => orgAPI.searchDepartments({ q: "", limit: 50 }),
      5,
    );

    allure.attachment(
      "Performance Stats",
      JSON.stringify(stats, null, 2),
      "application/json",
    );
    console.log(
      `OrgStructure Search Departments baseline: ${formatStats(stats)}`,
    );

    if (!stats.success) {
      test.skip(true, "Нет доступа к поиску");
      return;
    }

    expect(stats.avg).toBeLessThan(thresholds.NORMAL);
  });

  test("BASELINE: POST /departments/get/ с текстовым фильтром", async ({
    orgAPI,
  }) => {
    setSeverity("normal");

    const stats = await measureTimeStats(
      () => orgAPI.searchDepartments({ q: "отдел", limit: 50 }),
      5,
    );

    allure.attachment(
      "Performance Stats",
      JSON.stringify(stats, null, 2),
      "application/json",
    );
    console.log(
      `OrgStructure Search Departments (filter) baseline: ${formatStats(stats)}`,
    );

    if (!stats.success) {
      test.skip(true, "Нет доступа к поиску");
      return;
    }

    expect(stats.avg).toBeLessThan(thresholds.NORMAL);
  });
});

// ==================== BASELINE: USER GROUPS ====================

test.describe("OrgStructure API Baseline - User Groups @load @baseline @org", () => {
  test.beforeEach(() => {
    markAsAPITest(MODULES.ORG_STRUCTURE, "Baseline Performance - User Groups");
  });

  test("BASELINE: GET /user-groups/ @critical", async ({ orgAPI }) => {
    setSeverity("critical");

    const stats = await measureTimeStats(() => orgAPI.getUserGroups(), 5);

    allure.attachment(
      "Performance Stats",
      JSON.stringify(stats, null, 2),
      "application/json",
    );
    console.log(`OrgStructure User Groups baseline: ${formatStats(stats)}`);

    if (!stats.success) {
      test.skip(true, "Нет доступа к User Groups");
      return;
    }

    expect(stats.avg, `Среднее время < ${thresholds.SLOW}ms`).toBeLessThan(
      thresholds.SLOW,
    );
  });

  test("BASELINE: GET /user-groups/ с limit=100", async ({ orgAPI }) => {
    setSeverity("normal");

    const stats = await measureTimeStats(
      () => orgAPI.getUserGroups({ limit: 100 }),
      5,
    );

    allure.attachment(
      "Performance Stats",
      JSON.stringify(stats, null, 2),
      "application/json",
    );
    console.log(
      `OrgStructure User Groups (limit=100) baseline: ${formatStats(stats)}`,
    );

    if (!stats.success) {
      test.skip(true, "Нет доступа к User Groups");
      return;
    }

    expect(stats.avg).toBeLessThan(thresholds.SLOW);
  });

  test("BASELINE: GET /user-groups/{id}/users/", async ({ orgAPI }) => {
    setSeverity("normal");

    // Получаем ID группы
    const { response: listResp, data: listData } = await orgAPI.getUserGroups({
      limit: 1,
    });

    if (!listResp.ok()) {
      test.skip(true, "Нет доступа к User Groups");
      return;
    }

    const items = listData?.items || listData || [];
    if (items.length === 0) {
      test.skip(true, "Нет групп для теста");
      return;
    }

    const groupId = items[0].id;
    const stats = await measureTimeStats(
      () => orgAPI.getUserGroupUsers(groupId, { limit: 50 }),
      5,
    );

    allure.attachment(
      "Performance Stats",
      JSON.stringify(stats, null, 2),
      "application/json",
    );
    console.log(`OrgStructure Group Users baseline: ${formatStats(stats)}`);

    if (!stats.success) {
      test.skip(true, "Нет доступа к пользователям группы");
      return;
    }

    expect(stats.avg).toBeLessThan(thresholds.NORMAL);
  });
});

// ==================== BASELINE: USERS ====================

test.describe("OrgStructure API Baseline - Users @load @baseline @org", () => {
  test.beforeEach(() => {
    markAsAPITest(MODULES.ORG_STRUCTURE, "Baseline Performance - Users");
  });

  test("BASELINE: POST /org-struct/users/get/ @critical", async ({
    orgAPI,
  }) => {
    setSeverity("critical");

    const stats = await measureTimeStats(
      () => orgAPI.findUsers({ limit: 50 }),
      5,
    );

    allure.attachment(
      "Performance Stats",
      JSON.stringify(stats, null, 2),
      "application/json",
    );
    console.log(`OrgStructure Find Users baseline: ${formatStats(stats)}`);

    if (!stats.success) {
      test.skip(true, "Нет доступа к поиску пользователей");
      return;
    }

    expect(stats.avg, `Среднее время < ${thresholds.NORMAL}ms`).toBeLessThan(
      thresholds.NORMAL,
    );
  });

  test("BASELINE: POST /org-struct/users/get/ с текстовым фильтром", async ({
    orgAPI,
  }) => {
    setSeverity("normal");

    const stats = await measureTimeStats(
      () => orgAPI.findUsers({ q: "иванов", limit: 50 }),
      5,
    );

    allure.attachment(
      "Performance Stats",
      JSON.stringify(stats, null, 2),
      "application/json",
    );
    console.log(
      `OrgStructure Find Users (filter) baseline: ${formatStats(stats)}`,
    );

    if (!stats.success) {
      test.skip(true, "Нет доступа к поиску");
      return;
    }

    expect(stats.avg).toBeLessThan(thresholds.NORMAL);
  });

  test("BASELINE: POST /org-struct/users/get/ с inOrgStruct=true", async ({
    orgAPI,
  }) => {
    setSeverity("normal");

    const stats = await measureTimeStats(
      () => orgAPI.findUsers({ inOrgStruct: true, limit: 100 }),
      5,
    );

    allure.attachment(
      "Performance Stats",
      JSON.stringify(stats, null, 2),
      "application/json",
    );
    console.log(
      `OrgStructure Find Users (inOrgStruct) baseline: ${formatStats(stats)}`,
    );

    if (!stats.success) {
      test.skip(true, "Нет доступа к поиску");
      return;
    }

    expect(stats.avg).toBeLessThan(thresholds.SLOW);
  });

  test("BASELINE: GET /org-struct/root/heads/", async ({ orgAPI }) => {
    setSeverity("normal");

    const stats = await measureTimeStats(() => orgAPI.getRootHeads(), 5);

    allure.attachment(
      "Performance Stats",
      JSON.stringify(stats, null, 2),
      "application/json",
    );
    console.log(`OrgStructure Root Heads baseline: ${formatStats(stats)}`);

    if (!stats.success) {
      test.skip(true, "Нет доступа к root heads");
      return;
    }

    expect(stats.avg).toBeLessThan(thresholds.FAST);
  });
});

// ==================== BASELINE: DEPARTMENT USERS ====================

test.describe("OrgStructure API Baseline - Department Users @load @baseline @org", () => {
  test.beforeEach(() => {
    markAsAPITest(
      MODULES.ORG_STRUCTURE,
      "Baseline Performance - Department Users",
    );
  });

  test("BASELINE: GET /org-struct/departments/{id}/users/ @critical", async ({
    orgAPI,
  }) => {
    setSeverity("critical");

    // Получаем ID департамента
    const { response: listResp, data: listData } = await orgAPI.getDepartments({
      limit: 1,
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

    const deptId = items[0].id;
    const stats = await measureTimeStats(
      () => orgAPI.getUsersFromDepartment(deptId, false),
      5,
    );

    allure.attachment(
      "Performance Stats",
      JSON.stringify(stats, null, 2),
      "application/json",
    );
    console.log(
      `OrgStructure Department Users baseline: ${formatStats(stats)}`,
    );

    if (!stats.success) {
      test.skip(true, "Нет доступа к пользователям департамента");
      return;
    }

    expect(stats.avg, `Среднее время < ${thresholds.SLOW}ms`).toBeLessThan(
      thresholds.SLOW,
    );
  });

  test("BASELINE: GET /org-struct/departments/{id}/users/ с nested=true", async ({
    orgAPI,
  }) => {
    setSeverity("normal");

    const { response: listResp, data: listData } = await orgAPI.getDepartments({
      limit: 1,
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

    const deptId = items[0].id;
    const stats = await measureTimeStats(
      () => orgAPI.getUsersFromDepartment(deptId, true),
      5,
    );

    allure.attachment(
      "Performance Stats",
      JSON.stringify(stats, null, 2),
      "application/json",
    );
    console.log(
      `OrgStructure Department Users (nested) baseline: ${formatStats(stats)}`,
    );

    if (!stats.success) {
      test.skip(true, "Нет доступа к nested users");
      return;
    }

    // С nested может занять больше времени
    expect(stats.avg).toBeLessThan(thresholds.COMPLEX);
  });
});

// ==================== BASELINE: LIMIT COMPARISON ====================

test.describe("OrgStructure API Baseline - Limit Comparison @load @baseline @org", () => {
  test.beforeEach(() => {
    markAsAPITest(MODULES.ORG_STRUCTURE, "Baseline Performance - Limits");
  });

  test("BASELINE: Сравнение limit 50 vs 100 vs 500 (users)", async ({
    orgAPI,
  }) => {
    setSeverity("normal");

    const limits = [50, 100, 500];
    const results = {};

    for (const limit of limits) {
      const stats = await measureTimeStats(
        () => orgAPI.findUsers({ limit }),
        3,
      );
      if (stats.success) {
        results[limit] = stats;
        console.log(
          `OrgStructure Find Users (limit=${limit}): avg=${stats.avg}ms`,
        );
      }
    }

    allure.attachment(
      "Limit Comparison",
      JSON.stringify(results, null, 2),
      "application/json",
    );

    if (Object.keys(results).length === 0) {
      test.skip(true, "Нет доступа к поиску пользователей");
      return;
    }

    // Проверяем что время не растёт линейно
    if (results[50] && results[500]) {
      const ratio = results[500].avg / results[50].avg;
      console.log(`Ratio (limit 500 vs 50): ${ratio.toFixed(2)}x`);
      expect(ratio, "Ratio limit 500/50 должен быть < 5x").toBeLessThan(5);
    }
  });
});
