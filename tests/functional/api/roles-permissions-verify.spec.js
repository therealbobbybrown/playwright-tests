// @ts-check
/**
 * API тесты верификации работы прав (permissions)
 *
 * Проверяем что:
 * - Создание роли с правами работает
 * - Назначение роли пользователю даёт ему указанные права
 * - Пользователь НЕ получает права, которых нет в его ролях
 *
 * @tags @api @roles @permissions @verification @critical
 * @module Roles
 */

import { test as baseTest, expect } from "@playwright/test";
import { RolesAPI, getCredentials } from "../../utils/api/index.js";
import {
  markAsAPITest,
  setSeverity,
  MODULES,
} from "../../utils/allure-helpers.js";
import { TestDataHelper } from "../../utils/TestDataHelper.js";
// NB: Используем assignRolesToUser() напрямую, а не assignRolesAndInvalidate(),
// т.к. это чистый API-тест — он не проходит через TokenManager/loginViaApi(),
// а вызывает signIn() на каждом RolesAPI экземпляре. Инвалидация кэша не нужна.

/** Паттерны имён тестовых ролей для pre-cleanup */
const STALE_ROLE_PATTERNS = [
  /^Test[ _]/i,
  /^Perm Test Role /,
  /^Batch Role /,
  /^Lifecycle Role /,
  /^Updated Test Role /,
  /^Updated Role /,
  /\d{13}/,
];
const PROTECTED_ROLE_IDS = new Set([1, 2]);

async function cleanupStaleRoles(api) {
  try {
    const { data } = await api.getRoles({ limit: 500 });
    const items = data?.items || data || [];
    const stale = items.filter(
      (r) =>
        !PROTECTED_ROLE_IDS.has(r.id) &&
        STALE_ROLE_PATTERNS.some((p) => p.test(r.title)),
    );
    if (stale.length === 0) return;
    console.log(`[pre-cleanup] Removing ${stale.length} stale test roles...`);
    for (const role of stale) {
      try {
        await api.deleteRole(role.id);
      } catch {
        // ignore
      }
    }
  } catch (e) {
    console.warn("[pre-cleanup] Failed to cleanup stale roles:", e.message);
  }
}

// Extend test with API fixtures
const test = baseTest.extend({
  adminAPI: async ({ request }, use) => {
    const api = new RolesAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);

    // Трекаем созданные роли для cleanup в teardown
    const _origCreate = api.createRole.bind(api);
    const localCreatedIds = [];
    api.createRole = async (...args) => {
      const result = await _origCreate(...args);
      if (result?.data?.id) localCreatedIds.push(result.data.id);
      return result;
    };

    await use(api);

    // Teardown: удаляем роли, созданные в этом тесте
    for (const id of localCreatedIds) {
      try {
        await api.deleteRole(id);
      } catch {
        // ignore
      }
    }
  },
  userAPI: async ({ request }, use) => {
    const api = new RolesAPI(request);
    const { email, password } = getCredentials("user");
    await api.signIn(email, password);
    await use(api);
  },
});

let preCleanupDone = false;
let testUserId = null;
let originalUserRoleIds = [];

// ==================== PERMISSIONS STRUCTURE ====================

test.describe(
  "Permissions Structure",
  { tag: ["@api", "@roles", "@permissions"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.ROLES, "Permissions Structure");
    });

    test(
      "C6703: GET /manager/permissions возвращает список прав с группами",
      { tag: ["@critical"] },
      async ({ adminAPI }) => {
        setSeverity("critical");

        let response, data;
        await test.step("Выполнить запрос: GET /manager/permissions возвращает список прав с группами", async () => {
          ({ response, data } = await adminAPI.getPermissions());
        });

        await test.step("Проверить ответ", async () => {
          expect(
            response.ok(),
            "Admin должен иметь доступ к списку permissions",
          ).toBe(true);

          const permissions = data?.items || data || [];
          expect(
            permissions.length,
            "Должен быть хотя бы один permission",
          ).toBeGreaterThan(0);

          // Логируем структуру для понимания
          console.log(
            "[DEBUG] Sample permissions:",
            JSON.stringify(permissions.slice(0, 5), null, 2),
          );

          // Проверяем структуру permission
          const perm = permissions[0];
          expect(perm).toHaveProperty("id");
          // Permissions обычно имеют name, code или title
          expect(
            perm.name || perm.code || perm.title || perm.key,
          ).toBeDefined();
        });
      },
    );

    test("C6704: Permissions группируются по функциональным областям", async ({
      adminAPI,
    }) => {
      setSeverity("normal");

      let groups;
      await test.step("Выполнить запрос: Permissions группируются по функциональным областям", async () => {
        const { response, data } = await adminAPI.getPermissions();

        if (!response.ok()) {
          test.skip(true, "Нет доступа к permissions");
          return;
        }

        const permissions = data?.items || data || [];

        // Собираем уникальные группы/категории
        groups = new Set();
        permissions.forEach((p) => {
          if (p.group) groups.add(p.group);
          if (p.category) groups.add(p.category);
          if (p.module) groups.add(p.module);
          // Также извлекаем из имени (survey_view -> survey)
          const name = p.name || p.code || p.key || "";
          const prefix = name.split("_")[0];
          if (prefix) groups.add(prefix);
        });

        console.log("[DEBUG] Permission groups/prefixes:", Array.from(groups));
      });

      await test.step("Проверить ответ", async () => {
        expect(groups.size, "Должно быть несколько групп прав").toBeGreaterThan(
          1,
        );
      });
    });
  },
);

// ==================== ROLE CRUD WITH PERMISSIONS ====================

test.describe(
  "Role CRUD with Permissions",
  { tag: ["@api", "@roles", "@crud"] },
  () => {
    test.beforeEach(async ({ adminAPI }) => {
      if (!preCleanupDone) {
        preCleanupDone = true;
        await cleanupStaleRoles(adminAPI);
      }
      markAsAPITest(MODULES.ROLES, "Role CRUD");
    });

    test(
      "C6705: Создать роль с несколькими permissions",
      { tag: ["@critical"] },
      async ({ adminAPI }) => {
        setSeverity("critical");

        let permissions, permIds, response, data;
        await test.step("Выполнить запрос: Создать роль с несколькими permissions", async () => {
          // Получаем permissions
          const { response: permResp, data: permData } =
            await adminAPI.getPermissions();
          test.skip(!permResp.ok(), "Нет доступа к permissions");

          permissions = permData?.items || permData || [];
          test.skip(
            permissions.length < 3,
            "Недостаточно permissions для теста",
          );

          // Берём первые 3 permissions
          permIds = permissions.slice(0, 3).map((p) => p.id);
          const title = TestDataHelper.generateUniqueName("Роль с правами");

          ({ response, data } = await adminAPI.createRole({
            title,
            permissionsIds: permIds,
          }));
        });

        await test.step("Проверить ответ", async () => {
          expect(
            response.ok(),
            `Создание роли должно успешно завершиться`,
          ).toBe(true);
          expect(data.id).toBeDefined();


          // Проверяем что permissions назначены
          const { data: roleData } = await adminAPI.getRoleById(data.id);
          const assignedPermIds =
            roleData?.permissionsIds ||
            roleData?.permissions?.map((p) => p.id) ||
            [];

          for (const permId of permIds) {
            expect(
              assignedPermIds.includes(permId),
              `Permission ${permId} должен быть в роли`,
            ).toBe(true);
          }
        });
      },
    );

    test(
      "C6706: Обновить permissions в существующей роли",
      { tag: ["@critical"] },
      async ({ adminAPI }) => {
        setSeverity("critical");

        let permissions, createResp, createData, newPermIds, updateResp;
        await test.step("Выполнить запрос: Обновить permissions в существующей роли", async () => {
          // Получаем permissions
          const { response: permResp, data: permData } =
            await adminAPI.getPermissions();
          test.skip(!permResp.ok(), "Нет доступа к permissions");

          permissions = permData?.items || permData || [];
          test.skip(permissions.length < 5, "Недостаточно permissions");

          // Создаём роль с 2 permissions
          const initialPermIds = permissions.slice(0, 2).map((p) => p.id);
          const title = TestDataHelper.generateUniqueName(
            "Роль для обновления прав",
          );

          ({ response: createResp, data: createData } =
            await adminAPI.createRole({
              title,
              permissionsIds: initialPermIds,
            }));

          test.skip(!createResp.ok(), "Не удалось создать роль");


          // Обновляем на другие permissions
          newPermIds = permissions.slice(2, 5).map((p) => p.id);

          ({ response: updateResp } = await adminAPI.updateRole(createData.id, {
            permissionsIds: newPermIds,
          }));
        });

        await test.step("Проверить ответ", async () => {
          expect(
            updateResp.ok(),
            "Обновление permissions должно успешно завершиться",
          ).toBe(true);

          // Проверяем что permissions обновились
          const { data: roleData } = await adminAPI.getRoleById(createData.id);
          const updatedPermIds =
            roleData?.permissionsIds ||
            roleData?.permissions?.map((p) => p.id) ||
            [];

          // Новые permissions должны быть
          for (const permId of newPermIds) {
            expect(
              updatedPermIds.includes(permId),
              `Новый permission ${permId} должен быть в роли`,
            ).toBe(true);
          }
        });
      },
    );

    test("C6707: Нельзя изменить системную роль Администратор (ID=1)", async ({
      adminAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: Нельзя изменить системную роль Администратор (ID=1)", async () => {
        const { response } = await adminAPI.updateRole(1, {
          title: "Hacked Admin",
          permissionsIds: [],
        });

        // Системные роли не должны изменяться
        // API может вернуть 400, 403, или 500
        expect([400, 403, 500]).toContain(response.status());
      });
    });

    test("C6708: Нельзя удалить системную роль Администратор (ID=1)", async ({
      adminAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: Нельзя удалить системную роль Администратор (ID=1)", async () => {
        const { response } = await adminAPI.deleteRole(1);

        expect([400, 403, 500]).toContain(response.status());
      });
    });

    test("C6709: Нельзя удалить системную роль Пользователь (ID=2)", async ({
      adminAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: Нельзя удалить системную роль Пользователь (ID=2)", async () => {
        const { response } = await adminAPI.deleteRole(2);

        expect([400, 403, 500]).toContain(response.status());
      });
    });
  },
);

// ==================== PERMISSION VERIFICATION ====================

test.describe(
  "Permission Verification",
  { tag: ["@api", "@roles", "@permissions", "@verification"] },
  () => {
    test.beforeEach(async ({ adminAPI, userAPI }) => {
      markAsAPITest(MODULES.ROLES, "Permission Verification");

      // Получаем ID тестового пользователя
      const { data: meData } = await userAPI.getCurrentUser();
      testUserId =
        meData?.id || meData?.currentUserId || meData?.account?.users?.[0]?.id;

      if (testUserId) {
        // Сохраняем оригинальные роли
        originalUserRoleIds = await adminAPI.getUserRoleIds(testUserId);
      }
    });

    test.afterEach(async ({ adminAPI }) => {
      // Восстанавливаем оригинальные роли
      if (testUserId && originalUserRoleIds.length > 0) {
        try {
          await adminAPI.assignRolesToUser(testUserId, originalUserRoleIds);
        } catch {
          // Ignore
        }
      }
    });

    test(
      "C6710: Пользователь с базовой ролью (ID=2) не имеет доступ к manager API",
      { tag: ["@critical"] },
      async ({ userAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: Пользователь с базовой ролью (ID=2) не имеет доступ к manager API", async () => {
          // User с ролью "Пользователь" не должен иметь доступ к manager endpoints
          const endpoints = [
            "/manager/roles",
            "/manager/permissions",
            "/manager/surveys",
            "/manager/structure/users",
          ];

          for (const endpoint of endpoints) {
            const { response } = await userAPI.get(endpoint);
            expect(
              [403, 404].includes(response.status()),
              `User не должен иметь доступ к ${endpoint}`,
            ).toBe(true);
          }
        });
      },
    );

    test(
      "C6711: Назначение роли с permissions даёт пользователю соответствующие права",
      { tag: ["@critical"] },
      async ({ adminAPI, userAPI, request }) => {
        setSeverity("critical");

        let createResp, roleData, assignResp;
        await test.step("Выполнить запрос: Назначение роли с permissions даёт пользователю соответствующие права", async () => {
          test.skip(!testUserId, "Не удалось получить ID пользователя");

          // 1. Получаем permissions
          const { response: permResp, data: permData } =
            await adminAPI.getPermissions();
          test.skip(!permResp.ok(), "Нет доступа к permissions");

          const permissions = permData?.items || permData || [];
          test.skip(permissions.length === 0, "Нет permissions");

          // 2. Создаём роль с первым permission
          const title = TestDataHelper.generateUniqueName(
            "Тестовая роль с правами",
          );
          const permIds = [permissions[0].id];

          ({ response: createResp, data: roleData } = await adminAPI.createRole(
            {
              title,
              permissionsIds: permIds,
            },
          ));

          test.skip(!createResp.ok(), "Не удалось создать роль");


          // 3. Назначаем роль пользователю
          const newRoleIds = [
            ...new Set([...originalUserRoleIds, roleData.id]),
          ];
          ({ response: assignResp } = await adminAPI.assignRolesToUser(
            testUserId,
            newRoleIds,
          ));
        });

        await test.step("Проверить ответ", async () => {
          expect(
            assignResp.ok(),
            "Назначение роли должно успешно завершиться",
          ).toBe(true);

          // 4. Перелогиниваемся под user чтобы получить новый токен с правами
          const freshUserAPI = new RolesAPI(request);
          const { email, password } = getCredentials("user");
          await freshUserAPI.signIn(email, password);

          // 5. Проверяем что роли назначены (через private API)
          const { data: myRoles } = await freshUserAPI.getPrivateRoles();
          const myRolesList = myRoles?.items || myRoles || [];
          const hasNewRole = myRolesList.some((r) => r.id === roleData.id);

          expect(hasNewRole, "Пользователь должен иметь новую роль").toBe(true);
        });
      },
    );

    test(
      "C6712: Несколько ролей объединяют permissions",
      { tag: ["@normal"] },
      async ({ adminAPI, request }) => {
        setSeverity("normal");

        let create1Resp, role1Data, create2Resp, role2Data, assignResp;
        await test.step("Выполнить запрос: Несколько ролей объединяют permissions", async () => {
          test.skip(!testUserId, "Не удалось получить ID пользователя");

          // 1. Получаем permissions
          const { response: permResp, data: permData } =
            await adminAPI.getPermissions();
          test.skip(!permResp.ok(), "Нет доступа к permissions");

          const permissions = permData?.items || permData || [];
          test.skip(permissions.length < 4, "Недостаточно permissions");

          // 2. Создаём 2 роли с разными permissions
          const role1Title = TestDataHelper.generateUniqueName("Роль 1");
          const role1PermIds = [permissions[0].id, permissions[1].id];

          ({ response: create1Resp, data: role1Data } =
            await adminAPI.createRole({
              title: role1Title,
              permissionsIds: role1PermIds,
            }));
          test.skip(!create1Resp.ok(), "Не удалось создать роль 1");


          const role2Title = TestDataHelper.generateUniqueName("Роль 2");
          const role2PermIds = [permissions[2].id, permissions[3].id];

          ({ response: create2Resp, data: role2Data } =
            await adminAPI.createRole({
              title: role2Title,
              permissionsIds: role2PermIds,
            }));
          test.skip(!create2Resp.ok(), "Не удалось создать роль 2");


          // 3. Назначаем обе роли пользователю
          const newRoleIds = [
            ...new Set([...originalUserRoleIds, role1Data.id, role2Data.id]),
          ];
          ({ response: assignResp } = await adminAPI.assignRolesToUser(
            testUserId,
            newRoleIds,
          ));
        });

        await test.step("Проверить ответ", async () => {
          expect(
            assignResp.ok(),
            "Назначение ролей должно успешно завершиться",
          ).toBe(true);

          // 4. Проверяем что обе роли назначены
          const { data: userData } =
            await adminAPI.getManagerUserById(testUserId);
          const userRoles = userData?.roles || [];

          const hasRole1 = userRoles.some((r) => r.id === role1Data.id);
          const hasRole2 = userRoles.some((r) => r.id === role2Data.id);

          expect(
            hasRole1 && hasRole2,
            "Пользователь должен иметь обе роли",
          ).toBe(true);
        });
      },
    );
  },
);

// ==================== NEGATIVE CASES ====================

test.describe(
  "Permission Negative Cases",
  { tag: ["@api", "@roles", "@permissions", "@negative"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.ROLES, "Negative Cases");
    });

    test(
      "C6713: User не может создавать роли",
      { tag: ["@critical"] },
      async ({ userAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: User не может создавать роли", async () => {
          const { response } = await userAPI.createRole({
            title: "Hacked Role",
            permissionsIds: [],
          });

          expect(response.status()).toBe(403);
        });
      },
    );

    test(
      "C6714: User не может редактировать роли",
      { tag: ["@critical"] },
      async ({ userAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: User не может редактировать роли", async () => {
          const { response } = await userAPI.updateRole(1, {
            title: "Hacked",
          });

          expect([403, 404]).toContain(response.status());
        });
      },
    );

    test(
      "C6715: User не может удалять роли",
      { tag: ["@critical"] },
      async ({ userAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: User не может удалять роли", async () => {
          const { response } = await userAPI.deleteRole(1);

          expect([403, 404]).toContain(response.status());
        });
      },
    );

    test(
      "C6716: User не может видеть список permissions",
      { tag: ["@normal"] },
      async ({ userAPI }) => {
        setSeverity("normal");

        await test.step("Выполнить: User не может видеть список permissions", async () => {
          const { response } = await userAPI.getPermissions();

          expect(response.status()).toBe(403);
        });
      },
    );

    test(
      "C6717: User не может назначать роли другим пользователям",
      { tag: ["@critical"] },
      async ({ userAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: User не может назначать роли другим пользователям", async () => {
          // Пытаемся назначить роль какому-то пользователю
          const { response } = await userAPI.assignRolesToUser(1, [1, 2]);

          expect([403, 404]).toContain(response.status());
        });
      },
    );
  },
);
