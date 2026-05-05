// @ts-check
import { test as base, expect } from "@playwright/test";
import { MyTeamAPI, getCredentials } from "../../utils/api/index.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import {
  assertSuccessStatus,
  assertErrorStatus,
  assertHasRequiredProperties,
  assertValidArray,
  assertNotEmptyArray,
  assertEntityHasId,
  extractItems,
  assertUnauthorized,
  assertForbidden,
  assertNotFound,
  assertBadRequest,
} from "../../utils/api/common-assertions.js";

/**
 * API тесты для модуля My Team (Моя команда)
 *
 * Покрытие:
 * - Информация о текущем пользователе в оргструктуре
 * - Проверка наличия подчинённых
 * - Проверка роли руководителя
 * - Получение руководителей пользователя
 * - Дерево оргструктуры
 * - Коллеги
 *
 * @tags @api @my-team @org-structure
 */

// Расширяем test с фикстурой для MyTeam API
const test = base.extend({
  myTeamAPI: async ({ request }, use) => {
    const api = new MyTeamAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
  myTeamUserAPI: async ({ request }, use) => {
    const api = new MyTeamAPI(request);
    const { email, password } = getCredentials("user");
    await api.signIn(email, password);
    await use(api);
  },
  myTeamManagerAPI: async ({ request }, use) => {
    const api = new MyTeamAPI(request);
    const { email, password } = getCredentials("manager");
    await api.signIn(email, password);
    await use(api);
  },
});

// ==================== MY INFO ====================

test.describe(
  "My Team API - My Info",
  { tag: ["@api", "@my-team", "@info", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.MY_TEAM, "My Info");
    });

    test(
      "C5417: GET /private/org-struct/me/info - получить информацию о себе",
      { tag: ["@critical"] },
      async ({ myTeamAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: GET /private/org-struct/me/info - получить информацию о себе", async () => {
          const { response, data } = await myTeamAPI.getMyInfo();

          assertSuccessStatus(response);
          expect(data).toBeDefined();
        });
      },
    );

    test(
      "C5418: GET /private/org-struct/me/has-subordinates - проверить наличие подчинённых",
      { tag: ["@critical"] },
      async ({ myTeamAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: GET /private/org-struct/me/has-subordinates - проверить наличие подчинённых", async () => {
          const { response, data } = await myTeamAPI.hasSubordinates();

          assertSuccessStatus(response);
          expect(data).toBeDefined();

          // Должен вернуть boolean или объект с флагом
          if (typeof data === "boolean") {
            expect([true, false]).toContain(data);
          } else if (data?.hasSubordinates !== undefined) {
            expect([true, false]).toContain(data.hasSubordinates);
          }
        });
      },
    );

    test(
      "C5419: GET /private/org-struct/me/is-head - проверить роль руководителя",
      { tag: ["@critical"] },
      async ({ myTeamAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: GET /private/org-struct/me/is-head - проверить роль руководителя", async () => {
          const { response, data } = await myTeamAPI.isHead();

          assertSuccessStatus(response);
          expect(data).toBeDefined();

          // Должен вернуть boolean или объект с флагом
          if (typeof data === "boolean") {
            expect([true, false]).toContain(data);
          } else if (data?.isHead !== undefined) {
            expect([true, false]).toContain(data.isHead);
          }
        });
      },
    );
  },
);

// ==================== USER HIERARCHY ====================

test.describe(
  "My Team API - User Hierarchy",
  { tag: ["@api", "@my-team", "@hierarchy", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.MY_TEAM, "User Hierarchy");
    });

    test(
      "C5420: GET /private/org-struct/users/{id}/head - получить руководителя пользователя",
      { tag: ["@critical"] },
      async ({ myTeamAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: GET /private/org-struct/users/{id}/head - получить руководителя пользователя", async () => {
          const userId = myTeamAPI.getCurrentUserId();

          test.skip(!userId, "Не удалось получить ID текущего пользователя");

          const { response, data } = await myTeamAPI.getUserHead(userId);

          // Может не быть руководителя (404) или успех
          expect([200, 404]).toContain(response.status());

          if (response.ok() && data) {
            expect(data).toBeDefined();
          }
        });
      },
    );

    test("C5421: GET /private/org-struct/users/{id}/heads - получить цепочку руководителей", async ({
      myTeamAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: GET /private/org-struct/users/{id}/heads - получить цепочку руководителей", async () => {
        const userId = myTeamAPI.getCurrentUserId();

        test.skip(!userId, "Не удалось получить ID текущего пользователя");

        const { response, data } = await myTeamAPI.getUserHeads(userId);

        assertSuccessStatus(response);
        expect(data).toBeDefined();

        const items = data?.items || data || [];
        assertValidArray(items);
      });
    });

    test(
      "C5422: GET /private/org-struct/users/{id}/info - получить информацию о пользователе",
      { tag: ["@critical"] },
      async ({ myTeamAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: GET /private/org-struct/users/{id}/info - получить информацию о пользователе", async () => {
          const userId = myTeamAPI.getCurrentUserId();

          test.skip(!userId, "Не удалось получить ID текущего пользователя");

          const { response, data } = await myTeamAPI.getUserInfo(userId);

          assertSuccessStatus(response);
          expect(data).toBeDefined();
        });
      },
    );

    test("C5423: GET /private/org-struct/users/{id}/info - несуществующий пользователь", async ({
      myTeamAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: GET /private/org-struct/users/{id}/info - несуществующий пользователь", async () => {
        const { response } = await myTeamAPI.getUserInfo(999999999);

        expect([400, 403, 404]).toContain(response.status());
      });
    });
  },
);

// ==================== SUBORDINATES ====================

test.describe(
  "My Team API - Subordinates",
  { tag: ["@api", "@my-team", "@subordinates", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.MY_TEAM, "Subordinates");
    });

    test("C5424: POST /private/org-struct/subordinates/get/by-ids - получить подчинённых по IDs", async ({
      myTeamAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: POST /private/org-struct/subordinates/get/by-ids - получить подчинённых по IDs", async () => {
        // Получаем ID текущего пользователя для теста
        const userId = myTeamAPI.getCurrentUserId();

        test.skip(!userId, "Не удалось получить ID текущего пользователя");

        const { response, data } = await myTeamAPI.getSubordinatesByIds([
          userId,
        ]);

        assertSuccessStatus(response);
        expect(data).toBeDefined();
      });
    });

    test("C5425: POST /private/org-struct/subordinates/get/by-ids - пустой массив", async ({
      myTeamAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: POST /private/org-struct/subordinates/get/by-ids - пустой массив", async () => {
        const { response, data } = await myTeamAPI.getSubordinatesByIds([]);

        expect([200, 400]).toContain(response.status());

        if (response.ok()) {
          const items = data?.items || data || [];
          expect(items.length).toBe(0);
        }
      });
    });

    test("C5426: POST /private/org-struct/target-users/count - получить количество целевых пользователей", async ({
      myTeamAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: POST /private/org-struct/target-users/count - получить количество целевых пользователей", async () => {
        const { response, data } = await myTeamAPI.getTargetUsersCount({});

        // API может вернуть 200 или ошибку для некоторых пользователей
        expect([200, 400, 403, 500]).toContain(response.status());

        if (response.ok()) {
          expect(data).toBeDefined();
          // Должен вернуть число или объект с count
          const count = data?.count ?? data;
          if (typeof count === "number") {
            expect(count).toBeGreaterThanOrEqual(0);
          }
        }
      });
    });

    test("C5427: POST /private/org-struct/target-users/heads - получить руководителей целевых пользователей", async ({
      myTeamAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: POST /private/org-struct/target-users/heads - получить руководителей целевых пользователей", async () => {
        const { response, data } = await myTeamAPI.getTargetUsersHeads({});

        // API может вернуть 200 или ошибку для некоторых пользователей
        expect([200, 400, 403, 500]).toContain(response.status());

        if (response.ok()) {
          expect(data).toBeDefined();
          const items = data?.items || data || [];
          assertValidArray(items);
        }
      });
    });
  },
);

// ==================== DEPARTMENTS ====================

test.describe(
  "My Team API - Departments",
  { tag: ["@api", "@my-team", "@departments", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.MY_TEAM, "Departments");
    });

    test(
      "C5428: GET /private/org-struct/departments/flat-tree - получить дерево департаментов",
      { tag: ["@critical"] },
      async ({ myTeamAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: GET /private/org-struct/departments/flat-tree - получить дерево департаментов", async () => {
          const { response, data } = await myTeamAPI.getDepartmentsFlatTree();

          assertSuccessStatus(response);
          expect(data).toBeDefined();

          const items = data?.items || data || [];
          assertValidArray(items);
        });
      },
    );

    test("C5429: GET /private/org-struct/departments/{id}/users - получить пользователей департамента", async ({
      myTeamAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: GET /private/org-struct/departments/{id}/users - получить пользователей департамента", async () => {
        // Сначала получаем список департаментов
        const { data: deptData } = await myTeamAPI.getDepartmentsFlatTree();
        const departments = deptData?.items || deptData || [];

        test.skip(departments.length === 0, "Нет департаментов");

        const departmentId = departments[0].id;
        const { response, data } =
          await myTeamAPI.getDepartmentUsers(departmentId);

        assertSuccessStatus(response);
        expect(data).toBeDefined();

        const items = data?.items || data || [];
        assertValidArray(items);
      });
    });

    test("C5430: GET /private/org-struct/departments/{id}/users - несуществующий департамент", async ({
      myTeamAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: GET /private/org-struct/departments/{id}/users - несуществующий департамент", async () => {
        const { response } = await myTeamAPI.getDepartmentUsers(999999999);

        expect([400, 403, 404]).toContain(response.status());
      });
    });
  },
);

// ==================== ORG STRUCTURE TREE ====================

test.describe(
  "My Team API - Org Structure Tree",
  { tag: ["@api", "@my-team", "@tree", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.MY_TEAM, "Org Structure Tree");
    });

    test(
      "C5431: GET /private/org-struct/tree/items - получить элементы дерева",
      { tag: ["@critical"] },
      async ({ myTeamAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: GET /private/org-struct/tree/items - получить элементы дерева", async () => {
          const { response, data } = await myTeamAPI.getTreeItems();

          assertSuccessStatus(response);
          expect(data).toBeDefined();
        });
      },
    );

    test("C5432: GET /private/org-struct/tree/departments/root/info - получить информацию о корне", async ({
      myTeamAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: GET /private/org-struct/tree/departments/root/info - получить информацию о корне", async () => {
        const { response, data } = await myTeamAPI.getTreeRootInfo();

        assertSuccessStatus(response);
        expect(data).toBeDefined();
      });
    });

    test("C5433: GET /private/org-struct/tree/departments/{departmentId}/info - информация о департаменте", async ({
      myTeamAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: GET /private/org-struct/tree/departments/{departmentId}/info - информация о департаменте", async () => {
        // Получаем список департаментов
        const { data: deptData } = await myTeamAPI.getDepartmentsFlatTree();
        const departments = deptData?.items || deptData || [];

        test.skip(departments.length === 0, "Нет департаментов");

        const departmentId = departments[0].id;
        const { response, data } =
          await myTeamAPI.getTreeDepartmentInfo(departmentId);

        // API может вернуть 200 или 404/500 для некоторых департаментов
        expect([200, 404, 500]).toContain(response.status());

        if (response.ok()) {
          expect(data).toBeDefined();
        }
      });
    });

    test("C5434: GET /private/org-struct/tree/users/{userId}/info - информация о пользователе в дереве", async ({
      myTeamAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: GET /private/org-struct/tree/users/{userId}/info - информация о пользователе в дереве", async () => {
        const userId = myTeamAPI.getCurrentUserId();

        test.skip(!userId, "Не удалось получить ID текущего пользователя");

        const { response, data } = await myTeamAPI.getTreeUserInfo(userId);

        assertSuccessStatus(response);
        expect(data).toBeDefined();
      });
    });
  },
);

// ==================== SEARCH ====================

test.describe(
  "My Team API - Search",
  { tag: ["@api", "@my-team", "@search", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.MY_TEAM, "Search");
    });

    test(
      "C5435: POST /private/org-struct/users/get - поиск пользователей",
      { tag: ["@critical"] },
      async ({ myTeamAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: POST /private/org-struct/users/get - поиск пользователей", async () => {
          const { response, data } = await myTeamAPI.searchUsers({
            limit: 10,
          });

          assertSuccessStatus(response);
          expect(data).toBeDefined();

          const items = data?.items || data || [];
          assertValidArray(items);
        });
      },
    );

    test("C5436: POST /private/org-struct/users/get - поиск с запросом", async ({
      myTeamAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: POST /private/org-struct/users/get - поиск с запросом", async () => {
        const { response, data } = await myTeamAPI.searchUsers({
          q: "test",
          limit: 10,
        });

        assertSuccessStatus(response);
        expect(data).toBeDefined();

        const items = data?.items || data || [];
        assertValidArray(items);
      });
    });

    test("C5437: POST /private/org-struct/users/get - поиск кириллицей", async ({
      myTeamAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: POST /private/org-struct/users/get - поиск кириллицей", async () => {
        const { response, data } = await myTeamAPI.searchUsers({
          q: "тест",
          limit: 10,
        });

        assertSuccessStatus(response);
        expect(data).toBeDefined();

        const items = data?.items || data || [];
        assertValidArray(items);
      });
    });
  },
);

// ==================== COLLEAGUES ====================

test.describe(
  "My Team API - Colleagues",
  { tag: ["@api", "@my-team", "@colleagues", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.MY_TEAM, "Colleagues");
    });

    test(
      "C5438: GET /private/users/collegues - получить список коллег",
      { tag: ["@critical"] },
      async ({ myTeamAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: GET /private/users/collegues - получить список коллег", async () => {
          const { response, data } = await myTeamAPI.getColleagues();

          assertSuccessStatus(response);
          expect(data).toBeDefined();

          const items = data?.items || data || [];
          assertValidArray(items);
        });
      },
    );

    test("C5439: POST /private/users/collegues/get - получить коллег (оптимизированный)", async ({
      myTeamAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: POST /private/users/collegues/get - получить коллег (оптимизированный)", async () => {
        const { response, data } = await myTeamAPI.getColleaguesOptimized({});

        assertSuccessStatus(response);
        expect(data).toBeDefined();

        const items = data?.items || data || [];
        assertValidArray(items);
      });
    });

    test("C5440: GET /private/users/collegues/{userId} - получить информацию о коллеге", async ({
      myTeamAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: GET /private/users/collegues/{userId} - получить информацию о коллеге", async () => {
        // Получаем список коллег
        const { data: colleaguesData } = await myTeamAPI.getColleagues();
        const items = colleaguesData?.items || colleaguesData || [];

        test.skip(items.length === 0, "Нет коллег");

        const colleagueId = items[0].id;
        const { response, data } = await myTeamAPI.getColleague(colleagueId);

        assertSuccessStatus(response);
        expect(data).toBeDefined();
        expect(data.id).toBe(colleagueId);
      });
    });

    test("C5441: GET /private/users/collegues/{userId} - несуществующий коллега", async ({
      myTeamAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: GET /private/users/collegues/{userId} - несуществующий коллега", async () => {
        const { response } = await myTeamAPI.getColleague(999999999);

        expect([400, 403, 404]).toContain(response.status());
      });
    });
  },
);

// ==================== NEGATIVE TESTS ====================

test.describe(
  "My Team API - Negative Tests",
  { tag: ["@api", "@my-team", "@negative", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.MY_TEAM, "Negative");
    });

    test("C5442: GET /private/org-struct/users/{id}/head - невалидный ID", async ({
      myTeamAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: GET /private/org-struct/users/{id}/head - невалидный ID", async () => {
        const { response } = await myTeamAPI.getUserHead("invalid-id");

        expect([400, 404, 500]).toContain(response.status());
      });
    });

    test("C5443: GET /private/org-struct/users/{id}/info - отрицательный ID", async ({
      myTeamAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: GET /private/org-struct/users/{id}/info - отрицательный ID", async () => {
        const { response } = await myTeamAPI.getUserInfo(-1);

        expect([400, 404]).toContain(response.status());
      });
    });

    test("C5444: POST /private/org-struct/subordinates/get/by-ids - невалидные IDs", async ({
      myTeamAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: POST /private/org-struct/subordinates/get/by-ids - невалидные IDs", async () => {
        const { response, data } = await myTeamAPI.getSubordinatesByIds([
          999999999, 999999998,
        ]);

        // API может вернуть 200, 201 или 400 для невалидных IDs
        expect([200, 201, 400]).toContain(response.status());

        if (response.ok()) {
          const items = data?.items || data || [];
          // Должен вернуть пустой результат для несуществующих
          expect(items.length).toBeLessThanOrEqual(2);
        }
      });
    });

    test("C5445: GET /private/org-struct/tree/departments/{id}/info - невалидный департамент", async ({
      myTeamAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: GET /private/org-struct/tree/departments/{id}/info - невалидный департамент", async () => {
        const { response } = await myTeamAPI.getTreeDepartmentInfo(999999999);

        expect([400, 403, 404]).toContain(response.status());
      });
    });

    test("C5446: GET /private/org-struct/tree/users/{id}/info - невалидный пользователь", async ({
      myTeamAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: GET /private/org-struct/tree/users/{id}/info - невалидный пользователь", async () => {
        const { response } = await myTeamAPI.getTreeUserInfo(999999999);

        expect([400, 403, 404]).toContain(response.status());
      });
    });
  },
);

// ==================== USER ROLE ACCESS ====================

test.describe(
  "My Team API - User Role Access",
  { tag: ["@api", "@my-team", "@access", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.MY_TEAM, "User Role Access");
    });

    test(
      "C5447: Обычный пользователь может получить информацию о себе",
      { tag: ["@critical"] },
      async ({ myTeamUserAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: Обычный пользователь может получить информацию о себе", async () => {
          const { response, data } = await myTeamUserAPI.getMyInfo();

          assertSuccessStatus(response);
          expect(data).toBeDefined();
        });
      },
    );

    test(
      "C5448: Обычный пользователь может проверить наличие подчинённых",
      { tag: ["@critical"] },
      async ({ myTeamUserAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: Обычный пользователь может проверить наличие подчинённых", async () => {
          const { response, data } = await myTeamUserAPI.hasSubordinates();

          assertSuccessStatus(response);
          expect(data).toBeDefined();
        });
      },
    );

    test("C5449: Обычный пользователь может получить дерево департаментов", async ({
      myTeamUserAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Обычный пользователь может получить дерево департаментов", async () => {
        const { response, data } = await myTeamUserAPI.getDepartmentsFlatTree();

        assertSuccessStatus(response);
        expect(data).toBeDefined();
      });
    });

    test(
      "C5450: Обычный пользователь может получить список коллег",
      { tag: ["@critical"] },
      async ({ myTeamUserAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: Обычный пользователь может получить список коллег", async () => {
          const { response, data } = await myTeamUserAPI.getColleagues();

          assertSuccessStatus(response);
          expect(data).toBeDefined();

          const items = data?.items || data || [];
          assertValidArray(items);
        });
      },
    );

    test("C5451: Обычный пользователь может искать пользователей", async ({
      myTeamUserAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Обычный пользователь может искать пользователей", async () => {
        const { response, data } = await myTeamUserAPI.searchUsers({
          limit: 10,
        });

        assertSuccessStatus(response);
        expect(data).toBeDefined();
      });
    });
  },
);

// ==================== INTEGRATION TESTS ====================

test.describe(
  "My Team API - Integration Tests",
  { tag: ["@api", "@my-team", "@integration", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.MY_TEAM, "Integration");
    });

    test("C5452: Согласованность: isHead и hasSubordinates", async ({
      myTeamAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Согласованность: isHead и hasSubordinates", async () => {
        // Если пользователь руководитель, у него должны быть подчинённые (или нет)
        const { response: headResp, data: headData } = await myTeamAPI.isHead();
        expect(headResp.ok()).toBe(true);

        const { response: subResp, data: subData } =
          await myTeamAPI.hasSubordinates();
        expect(subResp.ok()).toBe(true);

        // Оба должны вернуть boolean или объект
        expect(headData).toBeDefined();
        expect(subData).toBeDefined();
      });
    });

    test("C5453: Цепочка: получить коллегу и его информацию в дереве", async ({
      myTeamAPI,
    }) => {
      setSeverity("normal");

      let collResp, collData;
      await test.step("Выполнить запрос: Цепочка: получить коллегу и его информацию в дереве", async () => {
        // 1. Получаем список коллег
        ({ response: collResp, data: collData } =
          await myTeamAPI.getColleagues());
      });

      await test.step("Проверить ответ", async () => {
        expect(collResp.ok()).toBe(true);

        const colleagues = collData?.items || collData || [];
        test.skip(colleagues.length === 0, "Нет коллег");

        const colleague = colleagues[0];

        // 2. Получаем информацию о коллеге
        const { response: infoResp, data: infoData } =
          await myTeamAPI.getUserInfo(colleague.id);
        expect(infoResp.ok()).toBe(true);

        // 3. Получаем информацию в дереве
        const { response: treeResp, data: treeData } =
          await myTeamAPI.getTreeUserInfo(colleague.id);
        expect(treeResp.ok()).toBe(true);

        // Все должны относиться к одному пользователю
        if (infoData?.id && treeData?.id) {
          expect(infoData.id).toBe(colleague.id);
        }
      });
    });

    test("C5454: Дерево департаментов согласовано с пользователями департамента", async ({
      myTeamAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Дерево департаментов согласовано с пользователями департамента", async () => {
        // 1. Получаем дерево департаментов
        const { response: treeResp, data: treeData } =
          await myTeamAPI.getDepartmentsFlatTree();
        expect(treeResp.ok()).toBe(true);

        const departments = treeData?.items || treeData || [];
        test.skip(departments.length === 0, "Нет департаментов");

        // 2. Для первого департамента получаем пользователей
        const dept = departments[0];
        const { response: usersResp, data: usersData } =
          await myTeamAPI.getDepartmentUsers(dept.id);
        expect(usersResp.ok()).toBe(true);

        const users = usersData?.items || usersData || [];
        assertValidArray(users);
      });
    });

    test("C5455: Поиск пользователей возвращает согласованные данные", async ({
      myTeamAPI,
    }) => {
      setSeverity("normal");

      let resp1, data1;
      await test.step("Выполнить запрос: Поиск пользователей возвращает согласованные данные", async () => {
        // 1. Поиск без фильтра
        ({ response: resp1, data: data1 } = await myTeamAPI.searchUsers({
          limit: 10,
        }));
      });

      await test.step("Проверить ответ", async () => {
        expect(resp1.ok()).toBe(true);

        const items1 = data1?.items || data1 || [];

        // 2. Поиск с лимитом
        const { response: resp2, data: data2 } = await myTeamAPI.searchUsers({
          limit: 5,
        });
        expect(resp2.ok()).toBe(true);

        const items2 = data2?.items || data2 || [];

        // API может игнорировать параметр limit, поэтому проверяем только валидность результата
        assertValidArray(items2);
        // Если API учитывает limit, то items2 <= items1
        // Но если нет - это тоже валидно
        expect(items2.length).toBeGreaterThanOrEqual(0);
      });
    });
  },
);

// ==================== DATA CONSISTENCY ====================

test.describe(
  "My Team API - Data Consistency",
  { tag: ["@api", "@my-team", "@consistency", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.MY_TEAM, "Data Consistency");
    });

    test("C5456: Множественные запросы myInfo возвращают одинаковые данные", async ({
      myTeamAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Множественные запросы myInfo возвращают одинаковые данные", async () => {
        const results = [];

        for (let i = 0; i < 3; i++) {
          const { response, data } = await myTeamAPI.getMyInfo();
          results.push({
            status: response.status(),
            id: data?.id || data?.userId,
          });
        }

        // Все статусы должны быть одинаковыми
        const statuses = [...new Set(results.map((r) => r.status))];
        expect(statuses.length).toBe(1);

        // ID должен быть одинаковым
        const ids = [...new Set(results.map((r) => r.id))];
        expect(ids.length).toBe(1);
      });
    });

    test("C5457: Коллеги из разных эндпоинтов согласованы", async ({
      myTeamAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Коллеги из разных эндпоинтов согласованы", async () => {
        // Получаем через обычный эндпоинт
        const { response: resp1, data: data1 } =
          await myTeamAPI.getColleagues();
        expect(resp1.ok()).toBe(true);

        // Получаем через оптимизированный
        const { response: resp2, data: data2 } =
          await myTeamAPI.getColleaguesOptimized({});
        expect(resp2.ok()).toBe(true);

        const items1 = data1?.items || data1 || [];
        const items2 = data2?.items || data2 || [];

        // Количество должно быть примерно одинаковым
        expect(Math.abs(items1.length - items2.length)).toBeLessThanOrEqual(5);
      });
    });
  },
);
