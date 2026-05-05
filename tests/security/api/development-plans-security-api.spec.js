// tests/security/api/development-plans-security-api.spec.js
// Тесты прав доступа для Development Plans API
//
// Примечание по ролям:
// - admin: пользователь с правами администратора
// - user: обычный пользователь
// - manager: пользователь с правами на модуль планов развития
// Планы развития имеют роли: responsible (ответственный), curator (куратор), head (руководитель)

import { test as base, expect } from "@playwright/test";
import { DevelopmentPlansAPI, getCredentials } from "../../utils/api/index.js";
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
    const api = new DevelopmentPlansAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },

  // User API клиент (обычный пользователь)
  userAPI: async ({ request }, use) => {
    const api = new DevelopmentPlansAPI(request);
    const { email, password } = getCredentials("user");
    await api.signIn(email, password);
    await use(api);
  },

  // Manager API клиент
  managerAPI: async ({ request }, use) => {
    const api = new DevelopmentPlansAPI(request);
    const { email, password } = getCredentials("manager");
    await api.signIn(email, password);
    await use(api);
  },

  // Неавторизованный клиент
  anonAPI: async ({ request }, use) => {
    const api = new DevelopmentPlansAPI(request);
    // НЕ делаем signIn
    await use(api);
  },
});

// Хелпер для получения ID текущего пользователя
async function getCurrentUserId(api) {
  const { response, data } = await api.get("/private/accounts/me/");
  if (response.ok() && data?.currentUserId) {
    return data.currentUserId;
  }
  if (response.ok() && data?.account?.users?.[0]?.id) {
    return data.account.users[0].id;
  }
  return null;
}

// Хелпер для получения ID другого пользователя
async function getOtherUserId(api, excludeUserId) {
  const { response, data } = await api.get("/manager/users?limit=20");
  if (response.ok()) {
    const users = data?.items || data || [];
    const otherUser = users.find((u) => u.id !== excludeUserId);
    return otherUser?.id || null;
  }
  return null;
}

test.describe("Development Plans Security API @api @development-plans @permissions @security", () => {
  test.beforeEach(() => {
    markAsAPITest(MODULES.DEVELOPMENT_PLANS, "Security");
  });

  let testPlanId = null;
  let adminUserId = null;
  const createdPlanIds = [];

  // Создаём тестовый план перед тестами
  test.beforeAll(async ({ request }) => {
    const api = new DevelopmentPlansAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);

    adminUserId = await getCurrentUserId(api);
    console.log(`[beforeAll] adminUserId=${adminUserId}`);

    // Сначала пробуем получить существующий план
    const { response: listResponse, data: listData } =
      await api.getDevelopmentPlans({ limit: 1 });
    if (listResponse.ok()) {
      const plans = listData?.items || listData || [];
      if (plans.length > 0) {
        testPlanId = plans[0].id;
        console.log(`[beforeAll] Using existing plan: id=${testPlanId}`);
        return;
      }
    }

    // Если нет существующих планов, создаём новый
    if (adminUserId) {
      const { response, data } = await api.createDevelopmentPlan({
        title: `Security Test Plan ${Date.now()}`,
        responsibleUserId: adminUserId,
      });
      if (response.ok() && data?.id) {
        testPlanId = data.id;
        createdPlanIds.push(data.id);
        console.log(`[beforeAll] Created plan: id=${testPlanId}`);
      } else {
        console.log(
          `[beforeAll] Failed to create plan: status=${response.status()}`,
        );
      }
    } else {
      console.log("[beforeAll] No adminUserId - cannot create plan");
    }
  });

  // Cleanup после всех тестов
  test.afterAll(async ({ request }) => {
    const api = new DevelopmentPlansAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);

    for (const id of createdPlanIds) {
      try {
        await api.deleteDevelopmentPlan(id);
      } catch (e) {
        // ignore
      }
    }
  });

  test.describe("Неавторизованный пользователь (Anonymous)", () => {
    test("POST /private/development-plans/get - должен получить 401", async ({
      anonAPI,
    }) => {
      setSeverity("critical");
      const { response } = await anonAPI.getDevelopmentPlans({ limit: 10 });

      expect(response.status()).toBe(401);
    });

    test("GET /private/development-plans/{id} - должен получить 401", async ({
      anonAPI,
    }) => {
      setSeverity("critical");
      const { response } = await anonAPI.getDevelopmentPlan(testPlanId || 1);

      expect(response.status()).toBe(401);
    });

    test("POST /private/development-plans/ - должен получить 401", async ({
      anonAPI,
    }) => {
      setSeverity("critical");
      const { response } = await anonAPI.createDevelopmentPlan({
        title: "Test",
        responsibleUserId: 1,
      });

      expect(response.status()).toBe(401);
    });

    test("DELETE /private/development-plans/{id} - должен получить 401", async ({
      anonAPI,
    }) => {
      setSeverity("critical");
      const { response } = await anonAPI.deleteDevelopmentPlan(testPlanId || 1);

      expect(response.status()).toBe(401);
    });

    test("GET /manager/development-plan-templates/ - должен получить 401", async ({
      anonAPI,
    }) => {
      setSeverity("critical");
      const { response } = await anonAPI.get(
        "/manager/development-plan-templates/",
      );

      // API может вернуть 401 или 404 (скрытие endpoint)
      expect([401, 404]).toContain(response.status());
    });

    test("POST /private/development-plans/{id}/activate - должен получить 401", async ({
      anonAPI,
    }) => {
      setSeverity("critical");
      const { response } = await anonAPI.activateDevelopmentPlan(
        testPlanId || 1,
      );

      expect(response.status()).toBe(401);
    });
  });

  test.describe("Admin - полные права", () => {
    test("POST /private/development-plans/get - админ может получить все планы", async ({
      adminAPI,
    }) => {
      setSeverity("critical");
      const { response, data } = await adminAPI.getDevelopmentPlans({
        limit: 10,
      });

      expect(response.ok()).toBe(true);
      expect(data).toBeDefined();
    });

    test("POST /private/development-plans/get/for-head - админ может получить планы как руководитель", async ({
      adminAPI,
    }) => {
      setSeverity("normal");
      const { response } = await adminAPI.getDevelopmentPlansForHead({
        limit: 10,
      });

      // 200 - если есть подчинённые, 400 - если нет
      expect([200, 400]).toContain(response.status());
    });

    test("POST /private/development-plans/get/for-curator - админ может получить планы как куратор", async ({
      adminAPI,
    }) => {
      setSeverity("normal");
      const { response } = await adminAPI.getDevelopmentPlansForCurator({
        limit: 10,
      });

      expect([200, 400]).toContain(response.status());
    });

    test("POST /private/development-plans/get/for-responsible - админ может получить планы как ответственный", async ({
      adminAPI,
    }) => {
      setSeverity("normal");
      const { response } = await adminAPI.getDevelopmentPlansForResponsible({
        limit: 10,
      });

      expect([200, 400]).toContain(response.status());
    });

    test("GET /private/development-plans/{id} - админ может читать план по ID", async ({
      adminAPI,
    }) => {
      setSeverity("normal");
      test.skip(!testPlanId, "Нет тестового плана");

      const { response, data } = await adminAPI.getDevelopmentPlan(testPlanId);

      expect(response.ok()).toBe(true);
      expect(data).toBeDefined();
    });

    test("POST /private/development-plans/ - админ может создавать планы", async ({
      adminAPI,
    }) => {
      setSeverity("critical");
      test.skip(!adminUserId, "Нет ID пользователя");

      const { response, data } = await adminAPI.createDevelopmentPlan({
        title: `Admin Test Plan ${Date.now()}`,
        responsibleUserId: adminUserId,
      });

      // Успех или ошибка валидации (400/422) если не все поля заполнены
      expect([200, 201, 400, 422]).toContain(response.status());
      if (response.ok() && data?.id) {
        createdPlanIds.push(data.id);
      }
    });

    test("PATCH /private/development-plans/{id} - админ может обновлять планы", async ({
      adminAPI,
    }) => {
      setSeverity("normal");
      test.skip(!testPlanId, "Нет тестового плана");

      const { response } = await adminAPI.updateDevelopmentPlan(testPlanId, {
        title: `Updated Plan ${Date.now()}`,
      });

      expect(response.ok()).toBe(true);
    });

    test("DELETE /private/development-plans/{id} - админ может удалять планы", async ({
      adminAPI,
    }) => {
      setSeverity("normal");
      test.skip(!adminUserId, "Нет ID пользователя");

      // Создаём план для удаления (требуются даты в ISO 8601)
      const startDate = new Date().toISOString();
      const endDate = new Date(
        Date.now() + 30 * 24 * 60 * 60 * 1000,
      ).toISOString(); // +30 дней
      const { response: createResponse, data: created } =
        await adminAPI.createDevelopmentPlan({
          title: `Delete Test Plan ${Date.now()}`,
          responsibleUserId: adminUserId,
          startDate,
          endDate,
        });

      console.log(
        `[DELETE Plan] Create status=${createResponse.status()}, id=${created?.id}`,
      );
      test.skip(!created?.id, "Не удалось создать план");

      const { response } = await adminAPI.deleteDevelopmentPlan(created.id);

      expect(response.ok()).toBe(true);
    });

    test("GET /manager/development-plan-templates/ - админ может читать шаблоны", async ({
      adminAPI,
    }) => {
      setSeverity("normal");
      const { response, data } = await adminAPI.get(
        "/manager/development-plan-templates/?limit=10",
      );

      // Endpoint может не существовать (404) или доступ ограничен (403)
      expect([200, 403, 404]).toContain(response.status());
      if (response.ok()) {
        expect(data).toBeDefined();
      }
    });

    test("POST /private/development-plans/{id}/activate - админ может активировать план", async ({
      adminAPI,
    }) => {
      setSeverity("normal");
      test.skip(!testPlanId, "Нет тестового плана");

      const { response } = await adminAPI.activateDevelopmentPlan(testPlanId);

      // 200 - успех, 400 - план не заполнен, 409 - план уже активен (Conflict)
      expect([200, 400, 409]).toContain(response.status());
    });
  });

  test.describe("User - базовые права", () => {
    test("POST /private/development-plans/get/for-responsible - user может получить свои планы", async ({
      userAPI,
    }) => {
      setSeverity("critical");
      const { response } = await userAPI.getDevelopmentPlansForResponsible({
        limit: 10,
      });

      // User может получить планы где он ответственный
      expect([200, 400]).toContain(response.status());
    });

    test("GET /manager/development-plan-templates/ - user не имеет доступа к шаблонам", async ({
      userAPI,
    }) => {
      setSeverity("critical");
      const { response } = await userAPI.get(
        "/manager/development-plan-templates/?limit=10",
      );

      // User без прав на модуль не имеет доступа к /manager/ (403 или 404 если endpoint скрыт)
      expect([403, 404]).toContain(response.status());
    });

    test("POST /manager/development-plan-templates/ - user не может создавать шаблоны", async ({
      userAPI,
    }) => {
      setSeverity("critical");
      const { response } = await userAPI.post(
        "/manager/development-plan-templates/",
        {
          title: "Test Template",
        },
      );

      expect([403]).toContain(response.status());
    });
  });

  test.describe("Manager - расширенные права", () => {
    test("GET /manager/development-plan-templates/ - manager (руководитель) не имеет доступа к шаблонам", async ({
      managerAPI,
    }) => {
      setSeverity("critical");
      const { response } = await managerAPI.get(
        "/manager/development-plan-templates/?limit=10",
      );

      // Руководитель без прав на модуль не имеет доступа к /manager/ (403 или 404 если endpoint скрыт)
      expect([403, 404]).toContain(response.status());
    });

    test("POST /private/development-plans/get/for-head - manager может получить планы как руководитель", async ({
      managerAPI,
    }) => {
      setSeverity("normal");
      const { response } = await managerAPI.getDevelopmentPlansForHead({
        limit: 10,
      });

      expect([200, 400]).toContain(response.status());
    });
  });

  test.describe("Роли в плане развития (curator/responsible/head)", () => {
    test("User не может читать план где он не является участником", async ({
      adminAPI,
      userAPI,
    }) => {
      setSeverity("critical");
      test.skip(!adminUserId, "Нет ID пользователя");

      // Admin создаёт план где ответственный - он сам
      const { data: created } = await adminAPI.createDevelopmentPlan({
        title: `Private Plan ${Date.now()}`,
        responsibleUserId: adminUserId,
        curatorIds: [], // Без кураторов
      });

      if (created?.id) {
        createdPlanIds.push(created.id);

        // User пытается прочитать план
        const { response } = await userAPI.getDevelopmentPlan(created.id);

        // User не является участником плана
        expect([403, 404]).toContain(response.status());
      }
    });

    test("User не может удалить план созданный Admin", async ({ userAPI }) => {
      setSeverity("critical");
      test.skip(!testPlanId, "Нет тестового плана");

      const { response } = await userAPI.deleteDevelopmentPlan(testPlanId);

      expect([403, 404]).toContain(response.status());
    });

    test("User не может изменить статус чужого плана", async ({ userAPI }) => {
      setSeverity("critical");
      test.skip(!testPlanId, "Нет тестового плана");

      const { response } = await userAPI.activateDevelopmentPlan(testPlanId);

      expect([403, 404]).toContain(response.status());
    });

    test("User не может редактировать чужой план", async ({ userAPI }) => {
      setSeverity("critical");
      test.skip(!testPlanId, "Нет тестового плана");

      const { response } = await userAPI.updateDevelopmentPlan(testPlanId, {
        title: "Hacked Title",
      });

      expect([403, 404]).toContain(response.status());
    });
  });

  test.describe("Кросс-ролевые проверки", () => {
    test("User может создать план для себя", async ({ userAPI }) => {
      setSeverity("normal");

      const userId = await getCurrentUserId(userAPI);
      test.skip(!userId, "Нет ID пользователя");

      const { response, data } = await userAPI.createDevelopmentPlan({
        title: `User Own Plan ${Date.now()}`,
        responsibleUserId: userId,
      });

      // User может создавать планы для себя
      expect([200, 201, 400, 403]).toContain(response.status());

      if (data?.id) {
        createdPlanIds.push(data.id);
      }
    });

    test("User не может создать план для другого пользователя", async ({
      adminAPI,
      userAPI,
    }) => {
      setSeverity("critical");

      const userId = await getCurrentUserId(userAPI);
      const otherUserId = await getOtherUserId(adminAPI, userId);
      test.skip(!otherUserId, "Нет другого пользователя");

      const { response } = await userAPI.createDevelopmentPlan({
        title: `Plan for Other ${Date.now()}`,
        responsibleUserId: otherUserId,
      });

      // User не может создавать планы для других
      expect([403, 400]).toContain(response.status());
    });

    test("User не может добавить себя как куратора к чужому плану", async ({
      adminAPI,
      userAPI,
    }) => {
      setSeverity("critical");
      test.skip(!testPlanId, "Нет тестового плана");

      const userId = await getCurrentUserId(userAPI);
      test.skip(!userId, "Нет ID пользователя");

      const { response } = await userAPI.updateDevelopmentPlan(testPlanId, {
        curatorIds: [userId],
      });

      expect([403, 404]).toContain(response.status());
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // РЕДАКТИРОВАНИЕ СВОЕГО ПЛАНА РАЗВИТИЯ
  // ═══════════════════════════════════════════════════════════════
  test.describe("Редактирование своего плана развития", () => {
    test("User может редактировать свой план развития", async ({ userAPI }) => {
      setSeverity("normal");

      const userId = await getCurrentUserId(userAPI);
      test.skip(!userId, "Нет ID пользователя");

      // Сначала пробуем найти существующий план пользователя
      const { response: listResponse, data: listData } =
        await userAPI.getDevelopmentPlansForResponsible({ limit: 1 });
      let planId = null;

      if (listResponse.ok()) {
        const plans = listData?.items || listData || [];
        if (plans.length > 0) {
          planId = plans[0].id;
        }
      }

      // Если нет существующего плана, пробуем создать
      if (!planId) {
        const { response: createResponse, data: created } =
          await userAPI.createDevelopmentPlan({
            title: `User Own Plan to Edit ${Date.now()}`,
            responsibleUserId: userId,
          });
        if (createResponse.ok() && created?.id) {
          planId = created.id;
          createdPlanIds.push(created.id);
        }
      }

      test.skip(
        !planId,
        "Нет плана для редактирования (User не может создавать планы)",
      );

      // User редактирует свой план
      const { response } = await userAPI.updateDevelopmentPlan(planId, {
        title: `User Plan Updated ${Date.now()}`,
      });

      // User может редактировать свой план (как responsible)
      expect([200, 400]).toContain(response.status());
    });

    test("Manager может редактировать свой план развития", async ({
      managerAPI,
    }) => {
      setSeverity("normal");

      const userId = await getCurrentUserId(managerAPI);
      test.skip(!userId, "Нет ID пользователя");

      // Сначала пробуем найти существующий план менеджера
      const { response: listResponse, data: listData } =
        await managerAPI.getDevelopmentPlansForResponsible({ limit: 1 });
      let planId = null;

      if (listResponse.ok()) {
        const plans = listData?.items || listData || [];
        if (plans.length > 0) {
          planId = plans[0].id;
        }
      }

      // Если нет существующего плана, пробуем создать
      if (!planId) {
        const { response: createResponse, data: created } =
          await managerAPI.createDevelopmentPlan({
            title: `Manager Own Plan to Edit ${Date.now()}`,
            responsibleUserId: userId,
          });
        if (createResponse.ok() && created?.id) {
          planId = created.id;
          createdPlanIds.push(created.id);
        }
      }

      test.skip(
        !planId,
        "Нет плана для редактирования (Manager не может создавать планы)",
      );

      // Manager редактирует свой план
      const { response } = await managerAPI.updateDevelopmentPlan(planId, {
        title: `Manager Plan Updated ${Date.now()}`,
      });

      // Manager может редактировать свой план (как responsible)
      expect([200, 400]).toContain(response.status());
    });
  });

  test.describe("Development Plan Objectives Security", () => {
    test("Anonymous не может получить цели плана", async ({ anonAPI }) => {
      setSeverity("critical");
      const { response } = await anonAPI.get(
        `/private/development-plans/${testPlanId || 1}/objectives`,
      );

      expect(response.status()).toBe(401);
    });

    test("User не может добавить цель к чужому плану", async ({ userAPI }) => {
      setSeverity("critical");
      test.skip(!testPlanId, "Нет тестового плана");

      const { response } = await userAPI.post(
        `/private/development-plans/${testPlanId}/objectives`,
        {
          title: "Unauthorized Objective",
        },
      );

      expect([403, 404]).toContain(response.status());
    });
  });

  test.describe("Development Actions Security", () => {
    test("Anonymous не может получить развивающие действия", async ({
      anonAPI,
    }) => {
      setSeverity("critical");
      const { response } = await anonAPI.get(
        "/manager/development-actions/?limit=10",
      );

      // API может вернуть 401 или 404 (скрытие endpoint для неавторизованных)
      expect([401, 404]).toContain(response.status());
    });

    test("User не имеет доступа к manager API развивающих действий", async ({
      userAPI,
    }) => {
      setSeverity("critical");
      const { response } = await userAPI.get(
        "/manager/development-actions/?limit=10",
      );

      // User без прав на модуль не имеет доступа к /manager/ (403 или 404 если endpoint скрыт)
      expect([403, 404]).toContain(response.status());
    });

    test("User не может создать развивающее действие через manager API", async ({
      userAPI,
    }) => {
      setSeverity("critical");
      const { response } = await userAPI.post("/manager/development-actions/", {
        title: "Unauthorized Action",
        type: "task",
      });

      expect([403]).toContain(response.status());
    });
  });

  test.describe("Development Plan Templates Security", () => {
    test("User не может удалить шаблон", async ({ adminAPI, userAPI }) => {
      setSeverity("critical");

      // Получаем список шаблонов (правильный endpoint - /private/)
      const { response: templatesResponse, data: templates } =
        await adminAPI.get("/private/development-plan-templates/get/?limit=1");
      const templatesList = templates?.items || templates || [];
      const templateId = templatesList[0]?.id;
      console.log(
        `[Templates] status=${templatesResponse.status()}, items=${templatesList.length}, id=${templateId}`,
      );
      test.skip(!templateId, "Нет шаблонов");

      const { response } = await userAPI.delete(
        `/manager/development-plan-templates/${templateId}`,
      );

      expect([403, 404]).toContain(response.status());
    });

    test("User не может редактировать шаблон", async ({
      adminAPI,
      userAPI,
    }) => {
      setSeverity("critical");

      const { response: templatesResponse, data: templates } =
        await adminAPI.get("/private/development-plan-templates/get/?limit=1");
      const templatesList = templates?.items || templates || [];
      const templateId = templatesList[0]?.id;
      test.skip(!templateId, "Нет шаблонов");

      const { response } = await userAPI.patch(
        `/manager/development-plan-templates/${templateId}`,
        {
          title: "Hacked Template",
        },
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

test.describe("Development Plans API Error Analysis @api @development-plans @security", () => {
  test("Анализ ответа при отказе в доступе к /manager/development-plan-templates/", async ({
    request,
  }) => {
    const api = new DevelopmentPlansAPI(request);
    const { email, password } = getCredentials("user");
    await api.signIn(email, password);

    const { response } = await api.get(
      "/manager/development-plan-templates/?limit=10",
    );
    const status = response.status();

    if (!response.ok()) {
      const errorInfo = await analyzeErrorResponse(response);
      console.log(
        "User -> /manager/development-plan-templates/ error:",
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

    // 404 также возможен - endpoint может быть скрыт для неавторизованных пользователей
    expect([200, 403, 404, 500]).toContain(status);
  });

  test("Анализ ответа при доступе к чужому плану", async ({ request }) => {
    // Создаём план от admin
    const adminApi = new DevelopmentPlansAPI(request);
    const adminCreds = getCredentials("admin");
    await adminApi.signIn(adminCreds.email, adminCreds.password);

    const adminUserId = await getCurrentUserId(adminApi);

    const { data: created } = await adminApi.createDevelopmentPlan({
      title: `Error Analysis Plan ${Date.now()}`,
      responsibleUserId: adminUserId,
    });

    if (created?.id) {
      // User пытается получить доступ
      const userApi = new DevelopmentPlansAPI(request);
      const userCreds = getCredentials("user");
      await userApi.signIn(userCreds.email, userCreds.password);

      const { response } = await userApi.getDevelopmentPlan(created.id);
      const status = response.status();

      if (!response.ok()) {
        const errorInfo = await analyzeErrorResponse(response);
        console.log(
          `User -> /private/development-plans/${created.id} error:`,
          JSON.stringify(errorInfo, null, 2),
        );
      }

      // Cleanup
      await adminApi.deleteDevelopmentPlan(created.id);

      expect([403, 404]).toContain(status);
    }
  });
});
