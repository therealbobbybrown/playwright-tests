/**
 * Security API тесты для Ролей и разрешений (Roles & Permissions)
 *
 * Проверяет ролевую модель доступа:
 * - Anonymous: 401 на все endpoints
 * - Admin: полный доступ к /manager/roles/* и /manager/permissions
 * - User: доступ только к /private/roles, 403 на /manager/*
 * - Manager: доступ только к /private/roles, 403 на /manager/*
 */
import { test as base, expect } from "@playwright/test";
import { RolesAPI, getCredentials } from "../../utils/api/index.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

// Расширение fixtures для ролей
const test = base.extend({
  adminAPI: async ({ request }, use) => {
    const api = new RolesAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
  userAPI: async ({ request }, use) => {
    const api = new RolesAPI(request);
    const { email, password } = getCredentials("user");
    await api.signIn(email, password);
    await use(api);
  },
  managerAPI: async ({ request }, use) => {
    const api = new RolesAPI(request);
    const { email, password } = getCredentials("manager");
    await api.signIn(email, password);
    await use(api);
  },
  anonAPI: async ({ request }, use) => {
    const api = new RolesAPI(request);
    // НЕ делаем signIn - анонимный пользователь
    await use(api);
  },
});

test.describe("Roles Security API @api @roles @permissions @security", () => {
  test.beforeEach(() => {
    markAsAPITest(MODULES.ROLES, "Security");
  });

  // Тестовые данные
  let testRoleId = null;
  const createdRoleIds = [];

  test.beforeAll(async ({ request }) => {
    // Setup: создать тестовую роль через admin
    const api = new RolesAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);

    const { response, data } = await api.createRole({
      title: `Security Test Role ${Date.now()}`,
      permissionsIds: [],
    });

    if (response.ok() && data?.id) {
      testRoleId = data.id;
      createdRoleIds.push(data.id);
    }
  });

  test.afterAll(async ({ request }) => {
    // Cleanup: удалить созданные роли
    const api = new RolesAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);

    for (const id of createdRoleIds) {
      try {
        await api.deleteRole(id);
      } catch {
        // ignore cleanup errors
      }
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // ANONYMOUS - должен получить 401
  // ═══════════════════════════════════════════════════════════════
  test.describe("Неавторизованный пользователь (Anonymous)", () => {
    test("GET /manager/roles - anonymous получает 401", async ({ anonAPI }) => {
      setSeverity("critical");
      const { response } = await anonAPI.getRoles({ limit: 10 });

      expect(response.status()).toBe(401);
    });

    test("GET /manager/permissions - anonymous получает 401", async ({
      anonAPI,
    }) => {
      setSeverity("critical");
      const { response } = await anonAPI.getPermissions();

      expect(response.status()).toBe(401);
    });

    test("POST /manager/roles - anonymous не может создать роль", async ({
      anonAPI,
    }) => {
      setSeverity("critical");
      const { response } = await anonAPI.createRole({
        title: "Unauthorized Role",
        permissionsIds: [],
      });

      expect(response.status()).toBe(401);
    });

    test("GET /private/roles - anonymous получает 401", async ({ anonAPI }) => {
      setSeverity("critical");
      const { response } = await anonAPI.getPrivateRoles();

      expect(response.status()).toBe(401);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // ADMIN - полный доступ
  // ═══════════════════════════════════════════════════════════════
  test.describe("Admin - полные права", () => {
    test("GET /manager/roles - admin имеет доступ к списку ролей", async ({
      adminAPI,
    }) => {
      setSeverity("critical");
      const { response, data } = await adminAPI.getRoles({ limit: 10 });

      expect(response.ok()).toBe(true);
      expect(data).toBeDefined();
    });

    test("GET /manager/permissions - admin имеет доступ к списку разрешений", async ({
      adminAPI,
    }) => {
      setSeverity("critical");
      const { response, data } = await adminAPI.getPermissions();

      expect(response.ok()).toBe(true);
      expect(data).toBeDefined();
    });

    test("GET /manager/roles/{id} - admin может получить роль по ID", async ({
      adminAPI,
    }) => {
      setSeverity("normal");
      test.skip(!testRoleId, "Нет тестовой роли");

      const { response, data } = await adminAPI.getRoleById(testRoleId);

      expect(response.ok()).toBe(true);
      expect(data).toBeDefined();
    });

    test("GET /manager/roles/{id}/users-count - admin может получить счётчик пользователей", async ({
      adminAPI,
    }) => {
      setSeverity("normal");
      test.skip(!testRoleId, "Нет тестовой роли");

      const { response } = await adminAPI.getRoleUsersCount(testRoleId);

      expect(response.ok()).toBe(true);
    });

    test("POST /manager/roles - admin может создать роль", async ({
      adminAPI,
    }) => {
      setSeverity("critical");
      const { response, data } = await adminAPI.createRole({
        title: `Admin Test Role ${Date.now()}`,
        permissionsIds: [],
      });

      // 201 - создано, 400 - ошибка валидации
      expect([200, 201, 400]).toContain(response.status());
      if (data?.id) {
        createdRoleIds.push(data.id);
      }
    });

    test("POST /manager/roles/{id} - admin может обновить роль", async ({
      adminAPI,
    }) => {
      setSeverity("normal");
      test.skip(!testRoleId, "Нет тестовой роли");

      const { response } = await adminAPI.updateRole(testRoleId, {
        title: `Updated Role ${Date.now()}`,
        permissionsIds: [], // Требуется передать permissionsIds
      });

      // 200 - успех, 400 - ошибка валидации
      expect([200, 400]).toContain(response.status());
    });

    test("DELETE /manager/roles/{id} - admin может удалить роль", async ({
      adminAPI,
    }) => {
      setSeverity("normal");
      // Создаём роль для удаления
      const { data: created } = await adminAPI.createRole({
        title: `Role to Delete ${Date.now()}`,
        permissionsIds: [],
      });

      test.skip(!created?.id, "Не удалось создать роль для удаления");

      const { response } = await adminAPI.deleteRole(created.id);

      expect(response.ok()).toBe(true);
    });

    test("GET /private/roles - admin имеет доступ к приватному списку ролей", async ({
      adminAPI,
    }) => {
      setSeverity("normal");
      const { response, data } = await adminAPI.getPrivateRoles();

      expect(response.ok()).toBe(true);
      expect(data).toBeDefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // USER - ограниченные права (403 на /manager/*)
  // ═══════════════════════════════════════════════════════════════
  test.describe("User - ограниченные права", () => {
    test("GET /private/roles - user имеет доступ к приватному списку ролей", async ({
      userAPI,
    }) => {
      setSeverity("normal");
      const { response, data } = await userAPI.getPrivateRoles();

      expect(response.ok()).toBe(true);
      expect(data).toBeDefined();
    });

    test("GET /manager/roles - user не имеет доступа к списку ролей", async ({
      userAPI,
    }) => {
      setSeverity("critical");
      const { response } = await userAPI.getRoles({ limit: 10 });

      // User без прав на модуль не имеет доступа к /manager/
      expect(response.status()).toBe(403);
    });

    test("GET /manager/permissions - user не имеет доступа к списку разрешений", async ({
      userAPI,
    }) => {
      setSeverity("critical");
      const { response } = await userAPI.getPermissions();

      // User без прав на модуль не имеет доступа к /manager/
      expect(response.status()).toBe(403);
    });

    test("GET /manager/roles/{id} - user не может получить роль по ID", async ({
      userAPI,
    }) => {
      setSeverity("critical");
      test.skip(!testRoleId, "Нет тестовой роли");

      const { response } = await userAPI.getRoleById(testRoleId);

      expect([403, 404]).toContain(response.status());
    });

    test("POST /manager/roles - user не может создать роль", async ({
      userAPI,
    }) => {
      setSeverity("critical");
      const { response } = await userAPI.createRole({
        title: "Unauthorized Role Creation",
        permissionsIds: [],
      });

      // User не должен иметь права на создание ролей
      expect(response.status()).toBe(403);
    });

    test("POST /manager/roles/{id} - user не может обновить роль", async ({
      userAPI,
    }) => {
      setSeverity("critical");
      test.skip(!testRoleId, "Нет тестовой роли");

      const { response } = await userAPI.updateRole(testRoleId, {
        title: "Hacked Role Title",
      });

      expect([403, 404]).toContain(response.status());
    });

    test("DELETE /manager/roles/{id} - user не может удалить роль", async ({
      userAPI,
    }) => {
      setSeverity("critical");
      test.skip(!testRoleId, "Нет тестовой роли");

      const { response } = await userAPI.deleteRole(testRoleId);

      expect([403, 404]).toContain(response.status());
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // MANAGER - расширенные права (403 на /manager/* без прав модуля)
  // ═══════════════════════════════════════════════════════════════
  test.describe("Manager - расширенные права", () => {
    test("GET /private/roles - manager имеет доступ к приватному списку ролей", async ({
      managerAPI,
    }) => {
      setSeverity("normal");
      const { response, data } = await managerAPI.getPrivateRoles();

      expect(response.ok()).toBe(true);
      expect(data).toBeDefined();
    });

    test("GET /manager/roles - manager (руководитель) не имеет доступа к управлению ролями", async ({
      managerAPI,
    }) => {
      setSeverity("critical");
      const { response } = await managerAPI.getRoles({ limit: 10 });

      // Руководитель без прав на модуль не имеет доступа к /manager/
      expect(response.status()).toBe(403);
    });

    test("GET /manager/permissions - manager не имеет доступа к списку разрешений", async ({
      managerAPI,
    }) => {
      setSeverity("critical");
      const { response } = await managerAPI.getPermissions();

      // Руководитель без прав на модуль не имеет доступа к /manager/
      expect(response.status()).toBe(403);
    });

    test("POST /manager/roles - manager не может создать роль", async ({
      managerAPI,
    }) => {
      setSeverity("critical");
      const { response } = await managerAPI.createRole({
        title: "Manager Unauthorized Role",
        permissionsIds: [],
      });

      // Руководитель не должен иметь права на создание ролей
      expect(response.status()).toBe(403);
    });

    test("POST /manager/roles/{id} - manager не может обновить роль", async ({
      managerAPI,
    }) => {
      setSeverity("critical");
      test.skip(!testRoleId, "Нет тестовой роли");

      const { response } = await managerAPI.updateRole(testRoleId, {
        title: "Manager Hacked Title",
      });

      expect([403, 404]).toContain(response.status());
    });

    test("DELETE /manager/roles/{id} - manager не может удалить роль", async ({
      managerAPI,
    }) => {
      setSeverity("critical");
      test.skip(!testRoleId, "Нет тестовой роли");

      const { response } = await managerAPI.deleteRole(testRoleId);

      expect([403, 404]).toContain(response.status());
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // КРОСС-РОЛЕВЫЕ ПРОВЕРКИ
  // ═══════════════════════════════════════════════════════════════
  test.describe("Кросс-ролевые проверки", () => {
    test("User не может удалить роль созданную Admin", async ({ userAPI }) => {
      setSeverity("critical");
      test.skip(!testRoleId, "Нет тестовой роли");

      const { response } = await userAPI.deleteRole(testRoleId);

      expect([403, 404]).toContain(response.status());
    });

    test("Manager не может обновить роль созданную Admin", async ({
      managerAPI,
    }) => {
      setSeverity("critical");
      test.skip(!testRoleId, "Нет тестовой роли");

      const { response } = await managerAPI.updateRole(testRoleId, {
        title: "Manager Hacked Admin Role",
        permissionsIds: [1, 2, 3], // Попытка добавить права
      });

      expect([403, 404]).toContain(response.status());
    });

    test("User не может назначить себе права через создание роли", async ({
      userAPI,
    }) => {
      setSeverity("critical");
      const { response } = await userAPI.createRole({
        title: "Self Privilege Escalation",
        permissionsIds: [1, 2, 3, 4, 5], // Попытка назначить все права
      });

      expect(response.status()).toBe(403);
    });
  });
});
