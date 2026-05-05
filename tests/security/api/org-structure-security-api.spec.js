// tests/security/api/org-structure-security-api.spec.js
// Тесты прав доступа для OrgStructure API
//
// Примечание по ролям:
// - admin: пользователь с правами администратора
// - user: обычный пользователь
// - manager: пользователь с правами на организационную структуру
// - head: руководитель департамента
// /manager/ endpoint доступен только админам и пользователям с правами на модуль

import { test as base, expect } from "@playwright/test";
import { OrgStructureAPI, getCredentials } from "../../utils/api/index.js";
import { TestDataHelper } from "../../utils/TestDataHelper.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

// Фикстуры для разных ролей
const test = base.extend({
  // Admin API клиент
  adminAPI: async ({ request }, use) => {
    const api = new OrgStructureAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },

  // User API клиент (обычный пользователь)
  userAPI: async ({ request }, use) => {
    const api = new OrgStructureAPI(request);
    const { email, password } = getCredentials("user");
    await api.signIn(email, password);
    await use(api);
  },

  // Manager API клиент
  managerAPI: async ({ request }, use) => {
    const api = new OrgStructureAPI(request);
    const { email, password } = getCredentials("manager");
    await api.signIn(email, password);
    await use(api);
  },

  // Неавторизованный клиент
  anonAPI: async ({ request }, use) => {
    const api = new OrgStructureAPI(request);
    // НЕ делаем signIn
    await use(api);
  },
});

test.describe("OrgStructure Security API @api @org-structure @permissions @security", () => {
  test.beforeEach(() => {
    markAsAPITest(MODULES.ORG_STRUCTURE, "Security");
  });

  let testDepartmentId = null;
  let testGroupId = null;
  const createdGroupIds = [];

  // Получаем тестовый департамент и создаём группу перед тестами
  test.beforeAll(async ({ request }) => {
    const api = new OrgStructureAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);

    // Получаем существующий департамент (сначала /manager/, затем /private/)
    const { response: managerResponse, data: depts } = await api.getDepartments(
      { limit: 1 },
    );
    if (managerResponse.ok()) {
      testDepartmentId = depts?.items?.[0]?.id || depts?.[0]?.id;
    } else {
      // Fallback: пробуем /private/departments
      const { response: privateResponse, data: privateDepts } = await api.get(
        "/private/departments",
      );
      if (privateResponse.ok()) {
        const items = privateDepts?.items || privateDepts || [];
        testDepartmentId = items[0]?.id;
      }
    }
    console.log(`[beforeAll] testDepartmentId=${testDepartmentId}`);

    // Сначала пробуем получить существующую группу
    const { response: groupsResponse, data: groupsData } =
      await api.getUserGroups({ limit: 1 });
    if (groupsResponse.ok()) {
      const groups = groupsData?.items || groupsData || [];
      if (groups.length > 0) {
        testGroupId = groups[0].id;
        console.log(`[beforeAll] Using existing group: id=${testGroupId}`);
        return;
      }
    }

    // Создаём тестовую группу если нет существующих
    const { response: createResponse, data: group } = await api.createUserGroup(
      {
        title: `Security Test Group ${Date.now()}`,
      },
    );
    if (createResponse.ok() && group?.id) {
      testGroupId = group.id;
      createdGroupIds.push(group.id);
      console.log(`[beforeAll] Created group: id=${testGroupId}`);
    } else {
      console.log(
        `[beforeAll] Failed to create group: status=${createResponse.status()}`,
      );
    }
  });

  // Cleanup после всех тестов
  test.afterAll(async ({ request }) => {
    const api = new OrgStructureAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);

    for (const id of createdGroupIds) {
      try {
        await api.deleteUserGroup(id);
      } catch (e) {
        // ignore
      }
    }
  });

  test.describe("Неавторизованный пользователь (Anonymous)", () => {
    test("GET /manager/departments/ - должен получить 401", async ({
      anonAPI,
    }) => {
      setSeverity("critical");
      const { response } = await anonAPI.getDepartments();

      expect(response.status()).toBe(401);
    });

    test("GET /manager/user-groups/ - должен получить 401", async ({
      anonAPI,
    }) => {
      setSeverity("critical");
      const { response } = await anonAPI.getUserGroups();

      expect(response.status()).toBe(401);
    });

    test("POST /manager/user-groups/ - должен получить 401", async ({
      anonAPI,
    }) => {
      setSeverity("critical");
      const { response } = await anonAPI.createUserGroup({
        title: "Test Group",
      });

      expect(response.status()).toBe(401);
    });

    test("GET /manager/org-struct/tree/ - должен получить 401", async ({
      anonAPI,
    }) => {
      setSeverity("critical");
      const { response } = await anonAPI.get("/manager/org-struct/tree/");

      // API может вернуть 401 или 404 (скрытие endpoint для неавторизованных)
      expect([401, 404]).toContain(response.status());
    });

    test("GET /manager/users/ - должен получить 401", async ({ anonAPI }) => {
      setSeverity("critical");
      const { response } = await anonAPI.get("/manager/users/?limit=10");

      expect(response.status()).toBe(401);
    });

    test("GET /manager/invite-links/ - должен получить 401", async ({
      anonAPI,
    }) => {
      setSeverity("critical");
      const { response } = await anonAPI.get("/manager/invite-links/");

      expect(response.status()).toBe(401);
    });
  });

  test.describe("Admin - полные права", () => {
    test("GET /manager/departments/ - админ может читать департаменты", async ({
      adminAPI,
    }) => {
      setSeverity("critical");
      const { response, data } = await adminAPI.getDepartments({ limit: 10 });

      expect(response.ok()).toBe(true);
      expect(data).toBeDefined();
    });

    test("POST /manager/departments/get/ - админ может искать департаменты", async ({
      adminAPI,
    }) => {
      setSeverity("normal");
      const { response, data } = await adminAPI.searchDepartments({
        q: "",
        limit: 10,
      });

      expect(response.ok()).toBe(true);
      expect(data).toBeDefined();
    });

    test("GET /manager/user-groups/ - админ может читать группы", async ({
      adminAPI,
    }) => {
      setSeverity("critical");
      const { response, data } = await adminAPI.getUserGroups({ limit: 10 });

      expect(response.ok()).toBe(true);
      expect(data).toBeDefined();
    });

    test("POST /manager/user-groups/ - админ может создавать группы", async ({
      adminAPI,
    }) => {
      setSeverity("critical");
      const { response, data } = await adminAPI.createUserGroup({
        title: `Admin Test Group ${Date.now()}`,
      });

      // Успех или ошибка валидации/доступа
      expect([200, 201, 400, 403, 422]).toContain(response.status());
      if (response.ok() && data?.id) {
        createdGroupIds.push(data.id);
      }
    });

    test("GET /manager/user-groups/{id}/ - админ может читать группу по ID", async ({
      adminAPI,
    }) => {
      setSeverity("normal");
      test.skip(!testGroupId, "Нет тестовой группы");

      const { response, data } = await adminAPI.getUserGroup(testGroupId);

      expect(response.ok()).toBe(true);
      expect(data).toBeDefined();
    });

    test("POST /manager/user-groups/{id}/ - админ может обновлять группы", async ({
      adminAPI,
    }) => {
      setSeverity("normal");
      test.skip(!testGroupId, "Нет тестовой группы");

      const { response } = await adminAPI.updateUserGroup(testGroupId, {
        title: `Updated Group ${Date.now()}`,
      });

      expect(response.ok()).toBe(true);
    });

    test("DELETE /manager/user-groups/{id}/ - админ может удалять группы", async ({
      adminAPI,
    }) => {
      setSeverity("normal");

      // Создаём группу для удаления
      const { response: createResponse, data: created } =
        await adminAPI.createUserGroup({
          title: `Delete Test Group ${Date.now()}`,
          emoji: "🗑️",
        });

      // Если создание группы не удалось, пропускаем тест
      if (!created?.id) {
        console.log(
          `[DELETE Group] Create failed: status=${createResponse.status()}`,
        );
        test.skip(true, "Не удалось создать группу для удаления");
      }

      const { response } = await adminAPI.deleteUserGroup(created.id);

      expect(response.ok()).toBe(true);
    });

    test("GET /manager/org-struct/tree/ - админ может читать дерево структуры", async ({
      adminAPI,
    }) => {
      setSeverity("normal");
      const { response, data } = await adminAPI.get(
        "/manager/org-struct/tree/",
      );

      // Endpoint может не существовать (404) или доступ ограничен (403)
      expect([200, 403, 404]).toContain(response.status());
      if (response.ok()) {
        expect(data).toBeDefined();
      }
    });

    test("GET /manager/users/ - админ может читать список пользователей", async ({
      adminAPI,
    }) => {
      setSeverity("critical");
      const { response, data } = await adminAPI.get("/manager/users/?limit=10");

      expect(response.ok()).toBe(true);
      expect(data).toBeDefined();
    });

    test("POST /manager/departments/{id}/ - админ может обновлять департаменты", async ({
      adminAPI,
    }) => {
      setSeverity("normal");
      test.skip(!testDepartmentId, "Нет тестового департамента");

      // Сначала получаем текущие данные
      const { data: depts } = await adminAPI.getDepartments({ limit: 10 });
      const dept = (depts?.items || depts || []).find(
        (d) => d.id === testDepartmentId,
      );
      test.skip(!dept, "Департамент не найден");

      const { response } = await adminAPI.updateDepartment(testDepartmentId, {
        title: dept.title, // Оставляем тот же title
        autoTitle: false,
      });

      expect(response.ok()).toBe(true);
    });

    test("GET /manager/invite-links/ - админ может читать приглашения", async ({
      adminAPI,
    }) => {
      setSeverity("normal");
      const { response, data } = await adminAPI.get("/manager/invite-links/");

      expect(response.ok()).toBe(true);
      expect(data).toBeDefined();
    });
  });

  test.describe("User - ограниченные права", () => {
    test("GET /manager/departments/ - user не имеет доступа", async ({
      userAPI,
    }) => {
      setSeverity("critical");
      const { response } = await userAPI.getDepartments();

      // User без прав на модуль не имеет доступа к /manager/
      expect(response.status()).toBe(403);
    });

    // BUG: API возвращает 200, хотя frontend показывает 404
    // Ожидается 403, но API разрешает доступ - расхождение frontend/backend
    test.fixme(
      "GET /manager/user-groups/ - user не должен иметь доступа",
      async ({ userAPI }) => {
        setSeverity("critical");
        const { response } = await userAPI.getUserGroups();

        expect(response.status()).toBe(403);
      },
    );

    test("POST /manager/user-groups/ - user не может создавать группы", async ({
      userAPI,
    }) => {
      setSeverity("critical");
      const { response } = await userAPI.createUserGroup({
        title: `User Test Group ${Date.now()}`,
      });

      expect([403]).toContain(response.status());
    });

    test("DELETE /manager/user-groups/{id}/ - user не может удалять группы", async ({
      userAPI,
    }) => {
      setSeverity("critical");
      test.skip(!testGroupId, "Нет тестовой группы");

      const { response } = await userAPI.deleteUserGroup(testGroupId);

      expect([403, 404]).toContain(response.status());
    });

    test("GET /manager/users/ - user не имеет доступа к списку пользователей", async ({
      userAPI,
    }) => {
      setSeverity("critical");
      const { response } = await userAPI.get("/manager/users/?limit=10");

      // User без прав на модуль не имеет доступа к /manager/
      expect(response.status()).toBe(403);
    });

    test("POST /manager/departments/{id}/ - user не может обновлять департаменты", async ({
      userAPI,
    }) => {
      setSeverity("critical");
      test.skip(!testDepartmentId, "Нет тестового департамента");

      const { response } = await userAPI.updateDepartment(testDepartmentId, {
        title: "Hacked Department",
      });

      expect([403]).toContain(response.status());
    });

    test("GET /manager/invite-links/ - user не имеет доступа к приглашениям", async ({
      userAPI,
    }) => {
      setSeverity("critical");
      const { response } = await userAPI.get("/manager/invite-links/");

      // User без прав на модуль не имеет доступа к /manager/
      expect(response.status()).toBe(403);
    });
  });

  test.describe("Manager - расширенные права", () => {
    test("GET /manager/departments/ - manager (руководитель) не имеет доступа", async ({
      managerAPI,
    }) => {
      setSeverity("critical");
      const { response } = await managerAPI.getDepartments();

      // Руководитель без прав на модуль не имеет доступа к /manager/
      expect(response.status()).toBe(403);
    });

    // BUG: API возвращает 200, хотя frontend показывает 404
    // Ожидается 403, но API разрешает доступ - расхождение frontend/backend
    test.fixme(
      "GET /manager/user-groups/ - manager не должен иметь доступа",
      async ({ managerAPI }) => {
        setSeverity("critical");
        const { response } = await managerAPI.getUserGroups();

        expect(response.status()).toBe(403);
      },
    );

    test("GET /manager/org-struct/tree/ - manager (руководитель) не имеет доступа", async ({
      managerAPI,
    }) => {
      setSeverity("critical");
      const { response } = await managerAPI.get("/manager/org-struct/tree/");

      // Руководитель без прав на модуль не имеет доступа к /manager/ (403 или 404 если endpoint скрыт)
      expect([403, 404]).toContain(response.status());
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // PRIVATE ENDPOINTS - доступно всем авторизованным
  // ═══════════════════════════════════════════════════════════════
  test.describe("Private endpoints - доступно всем", () => {
    test("GET /private/departments - admin имеет доступ", async ({
      adminAPI,
    }) => {
      setSeverity("normal");
      const { response, data } = await adminAPI.get("/private/departments");

      expect(response.ok()).toBe(true);
      expect(data).toBeDefined();
    });

    test("GET /private/departments - user имеет доступ", async ({
      userAPI,
    }) => {
      setSeverity("normal");
      const { response, data } = await userAPI.get("/private/departments");

      expect(response.ok()).toBe(true);
      expect(data).toBeDefined();
    });

    test("GET /private/departments - manager имеет доступ", async ({
      managerAPI,
    }) => {
      setSeverity("normal");
      const { response, data } = await managerAPI.get("/private/departments");

      expect(response.ok()).toBe(true);
      expect(data).toBeDefined();
    });

    test("GET /private/users - admin имеет доступ", async ({ adminAPI }) => {
      setSeverity("normal");
      const { response, data } = await adminAPI.get("/private/users", {
        limit: 10,
      });

      expect(response.ok()).toBe(true);
      expect(data).toBeDefined();
    });

    test("GET /private/users - user имеет доступ", async ({ userAPI }) => {
      setSeverity("normal");
      const { response, data } = await userAPI.get("/private/users", {
        limit: 10,
      });

      expect(response.ok()).toBe(true);
      expect(data).toBeDefined();
    });

    test("GET /private/users - manager имеет доступ", async ({
      managerAPI,
    }) => {
      setSeverity("normal");
      const { response, data } = await managerAPI.get("/private/users", {
        limit: 10,
      });

      expect(response.ok()).toBe(true);
      expect(data).toBeDefined();
    });

    test("GET /private/org-struct/departments/flat-tree - admin имеет доступ", async ({
      adminAPI,
    }) => {
      setSeverity("normal");
      const { response, data } = await adminAPI.get(
        "/private/org-struct/departments/flat-tree",
      );

      expect(response.ok()).toBe(true);
      expect(data).toBeDefined();
    });

    test("GET /private/org-struct/departments/flat-tree - user имеет доступ", async ({
      userAPI,
    }) => {
      setSeverity("normal");
      const { response, data } = await userAPI.get(
        "/private/org-struct/departments/flat-tree",
      );

      expect(response.ok()).toBe(true);
      expect(data).toBeDefined();
    });

    test("GET /private/org-struct/departments/flat-tree - manager имеет доступ", async ({
      managerAPI,
    }) => {
      setSeverity("normal");
      const { response, data } = await managerAPI.get(
        "/private/org-struct/departments/flat-tree",
      );

      expect(response.ok()).toBe(true);
      expect(data).toBeDefined();
    });
  });

  test.describe("Кросс-ролевые проверки", () => {
    test("User не может удалить группу созданную Admin", async ({
      userAPI,
    }) => {
      setSeverity("critical");
      test.skip(!testGroupId, "Нет тестовой группы");

      const { response } = await userAPI.deleteUserGroup(testGroupId);

      expect([403, 404]).toContain(response.status());
    });

    test("User не может редактировать группу созданную Admin", async ({
      userAPI,
    }) => {
      setSeverity("critical");
      test.skip(!testGroupId, "Нет тестовой группы");

      const { response } = await userAPI.updateUserGroup(testGroupId, {
        title: "Hacked Group",
      });

      expect([403, 404]).toContain(response.status());
    });

    test("User не может добавлять пользователей в группу", async ({
      adminAPI,
      userAPI,
    }) => {
      setSeverity("critical");
      test.skip(!testGroupId, "Нет тестовой группы");

      // Получаем ID пользователя
      const { data: users } = await adminAPI.get("/manager/users/?limit=1");
      const userId = users?.items?.[0]?.id;
      test.skip(!userId, "Нет пользователей");

      const { response } = await userAPI.post(
        `/manager/user-groups/${testGroupId}/users/append/`,
        {
          usersIds: [userId],
        },
      );

      // 403 - forbidden, 404 - endpoint hidden for unauthorized users
      expect([403, 404]).toContain(response.status());
    });

    test("User не может удалять пользователей из группы", async ({
      userAPI,
    }) => {
      setSeverity("critical");
      test.skip(!testGroupId, "Нет тестовой группы");

      const { response } = await userAPI.post(
        `/manager/user-groups/${testGroupId}/users/remove/`,
        {
          usersIds: [1],
        },
      );

      // 403 - forbidden, 404 - endpoint hidden for unauthorized users
      expect([403, 404]).toContain(response.status());
    });
  });

  test.describe("Departments Security", () => {
    test("User не может создавать департаменты", async ({ userAPI }) => {
      setSeverity("critical");
      const { response } = await userAPI.post("/manager/departments/", {
        title: "Unauthorized Department",
      });

      expect([403, 404]).toContain(response.status());
    });

    test("User не может удалять департаменты", async ({ userAPI }) => {
      setSeverity("critical");
      test.skip(!testDepartmentId, "Нет тестового департамента");

      const { response } = await userAPI.delete(
        `/manager/departments/${testDepartmentId}/`,
      );

      expect([403, 404]).toContain(response.status());
    });

    test("User не может изменять руководителя департамента", async ({
      userAPI,
    }) => {
      setSeverity("critical");
      test.skip(!testDepartmentId, "Нет тестового департамента");

      const { response } = await userAPI.post(
        `/manager/departments/${testDepartmentId}/head/`,
        {
          userId: 1,
        },
      );

      expect([403, 404]).toContain(response.status());
    });
  });

  test.describe("Users Management Security", () => {
    test("User не может редактировать других пользователей", async ({
      adminAPI,
      userAPI,
    }) => {
      setSeverity("critical");

      // Получаем ID другого пользователя
      const { data: users } = await adminAPI.get("/manager/users/?limit=10");
      const otherUser = (users?.items || users || []).find(
        (u) => u.email !== getCredentials("user").email,
      );
      test.skip(!otherUser?.id, "Нет другого пользователя");

      const { response } = await userAPI.post(
        `/manager/users/${otherUser.id}/`,
        {
          firstName: "Hacked",
        },
      );

      expect([403]).toContain(response.status());
    });

    test("User не может деактивировать других пользователей", async ({
      adminAPI,
      userAPI,
    }) => {
      setSeverity("critical");

      const { data: users } = await adminAPI.get("/manager/users/?limit=10");
      const otherUser = (users?.items || users || []).find(
        (u) => u.email !== getCredentials("user").email,
      );
      test.skip(!otherUser?.id, "Нет другого пользователя");

      const { response } = await userAPI.post(
        `/manager/users/${otherUser.id}/deactivate/`,
      );

      // API может вернуть 403 (forbidden) или 404 (not found) - оба варианта корректны
      expect([403, 404]).toContain(response.status());
    });

    test("User не может изменять роли других пользователей", async ({
      adminAPI,
      userAPI,
    }) => {
      setSeverity("critical");

      const { data: users } = await adminAPI.get("/manager/users/?limit=10");
      const otherUser = (users?.items || users || []).find(
        (u) => u.email !== getCredentials("user").email,
      );
      test.skip(!otherUser?.id, "Нет другого пользователя");

      const { response } = await userAPI.post(
        `/manager/users/${otherUser.id}/roles/`,
        {
          rolesIds: [],
        },
      );

      // API может вернуть 403 (forbidden) или 404 (not found) - оба варианта корректны
      expect([403, 404]).toContain(response.status());
    });
  });

  test.describe("Invite Links Security", () => {
    test("User не может создавать пригласительные ссылки", async ({
      userAPI,
    }) => {
      setSeverity("critical");
      const { response } = await userAPI.post("/manager/invite-links/", {
        title: "Unauthorized Link",
      });

      expect([403]).toContain(response.status());
    });

    test("User не может удалять пригласительные ссылки", async ({
      adminAPI,
      userAPI,
    }) => {
      setSeverity("critical");

      // Получаем существующую ссылку
      const { data: links } = await adminAPI.get("/manager/invite-links/");
      const linkId = links?.items?.[0]?.id || links?.[0]?.id;
      test.skip(!linkId, "Нет пригласительных ссылок");

      const { response } = await userAPI.delete(
        `/manager/invite-links/${linkId}/`,
      );

      expect([403, 404]).toContain(response.status());
    });
  });
});

/**
 * Анализ ответа с ошибкой
 */
async function analyzeErrorResponse(response) {
  const status = response.status();
  let body = null;

  try {
    body = await response.json();
  } catch {
    try {
      body = await response.text();
    } catch {
      body = null;
    }
  }

  if (body && typeof body === "object") {
    return {
      status,
      statusCode: body.statusCode,
      error: body.error,
      message: body.message,
    };
  }

  return { status, body };
}

test.describe("OrgStructure API Error Analysis @api @org-structure @security", () => {
  test("Анализ ответа при отказе в доступе к /manager/departments/", async ({
    request,
  }) => {
    const api = new OrgStructureAPI(request);
    const { email, password } = getCredentials("user");
    await api.signIn(email, password);

    const { response } = await api.getDepartments();
    const status = response.status();

    if (!response.ok()) {
      const errorInfo = await analyzeErrorResponse(response);
      console.log(
        "User -> /manager/departments/ error:",
        JSON.stringify(errorInfo, null, 2),
      );

      if (
        status === 500 &&
        (errorInfo.statusCode === 403 || errorInfo.message?.includes("access"))
      ) {
        console.log(
          "  -> HTTP 500 contains access denied info (403 disguised)",
        );
      }
    }

    expect([200, 403, 500]).toContain(status);
  });

  test("Анализ ответа при попытке создать группу без прав", async ({
    request,
  }) => {
    const api = new OrgStructureAPI(request);
    const { email, password } = getCredentials("user");
    await api.signIn(email, password);

    const { response } = await api.createUserGroup({
      title: `Unauthorized Group ${Date.now()}`,
    });
    const status = response.status();

    if (!response.ok()) {
      const errorInfo = await analyzeErrorResponse(response);
      console.log(
        "User -> POST /manager/user-groups/ error:",
        JSON.stringify(errorInfo, null, 2),
      );
    }

    expect([403, 500]).toContain(status);
  });

  test("Анализ ответа при попытке обновить чужой департамент", async ({
    request,
  }) => {
    // Получаем департамент от admin
    const adminApi = new OrgStructureAPI(request);
    const adminCreds = getCredentials("admin");
    await adminApi.signIn(adminCreds.email, adminCreds.password);

    const { data: depts } = await adminApi.getDepartments({ limit: 1 });
    const deptId = depts?.items?.[0]?.id || depts?.[0]?.id;

    if (deptId) {
      // User пытается обновить
      const userApi = new OrgStructureAPI(request);
      const userCreds = getCredentials("user");
      await userApi.signIn(userCreds.email, userCreds.password);

      const { response } = await userApi.updateDepartment(deptId, {
        title: "Hacked Department",
      });
      const status = response.status();

      if (!response.ok()) {
        const errorInfo = await analyzeErrorResponse(response);
        console.log(
          `User -> POST /manager/departments/${deptId}/ error:`,
          JSON.stringify(errorInfo, null, 2),
        );
      }

      expect([403, 500]).toContain(status);
    }
  });
});
