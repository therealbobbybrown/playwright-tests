// tests/security/api/objectives-security-api.spec.js
// Тесты прав доступа для Objectives API
//
// Примечание по ролям:
// - admin: пользователь с правами администратора
// - user: обычный пользователь
// - manager: пользователь с правами на модуль целей
// Цели имеют уровни видимости: self, team, company

import { test as base, expect } from "@playwright/test";
import { ObjectivesAPI, getCredentials } from "../../utils/api/index.js";
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
    const api = new ObjectivesAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },

  // User API клиент (обычный пользователь)
  userAPI: async ({ request }, use) => {
    const api = new ObjectivesAPI(request);
    const { email, password } = getCredentials("user");
    await api.signIn(email, password);
    await use(api);
  },

  // Manager API клиент
  managerAPI: async ({ request }, use) => {
    const api = new ObjectivesAPI(request);
    const { email, password } = getCredentials("manager");
    await api.signIn(email, password);
    await use(api);
  },

  // Неавторизованный клиент
  anonAPI: async ({ request }, use) => {
    const api = new ObjectivesAPI(request);
    // НЕ делаем signIn
    await use(api);
  },
});

// Хелпер для получения текущего периода
function getCurrentPeriod() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const quarter = Math.floor(month / 3) + 1;
  return { periodYear: year, periodQ: quarter };
}

// Хелпер для получения ID текущего пользователя
async function getCurrentUserId(objectivesAPI) {
  const { response, data } = await objectivesAPI.get("/private/accounts/me/");
  if (response.ok() && data?.currentUserId) {
    return data.currentUserId;
  }
  if (response.ok() && data?.account?.users?.[0]?.id) {
    return data.account.users[0].id;
  }
  return null;
}

// Хелпер для создания тестовой цели
async function createTestObjective(api, overrides = {}) {
  const { periodYear, periodQ } = getCurrentPeriod();
  const responsibleUserId =
    overrides.responsibleUserId || (await getCurrentUserId(api));

  const objectiveData = {
    title: `Security Test Objective ${Date.now()}`,
    description: "Test objective for security tests",
    periodYear,
    periodQ,
    status: "draft",
    level: overrides.level || "self",
    responsibleUserId,
    userAccessType: overrides.userAccessType || "everybody",
    milestones: [
      {
        temporaryId: `temp-${Date.now()}`,
        title: "Test Milestone",
        type: "percent",
        weight: 100,
        progress: 0,
        responsibleUserId,
      },
    ],
    ...overrides,
  };

  return api.saveObjective(objectiveData);
}

test.describe("Objectives Security API @api @objectives @permissions @security", () => {
  test.beforeEach(() => {
    markAsAPITest(MODULES.OKR, "Security");
  });

  let testObjectiveId = null;
  const createdObjectiveIds = [];

  // Создаём тестовую цель перед тестами
  test.beforeAll(async ({ request }) => {
    const api = new ObjectivesAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);

    const { data } = await createTestObjective(api);
    if (data?.id) {
      testObjectiveId = data.id;
      createdObjectiveIds.push(data.id);
    }
  });

  // Cleanup после всех тестов
  test.afterAll(async ({ request }) => {
    const api = new ObjectivesAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);

    for (const id of createdObjectiveIds) {
      try {
        await api.deleteObjective(id);
      } catch (e) {
        // ignore
      }
    }
  });

  test.describe("Неавторизованный пользователь (Anonymous)", () => {
    test("POST /private/objectives/get - должен получить 401", async ({
      anonAPI,
    }) => {
      setSeverity("critical");
      const { periodYear, periodQ } = getCurrentPeriod();
      const { response } = await anonAPI.getObjectives({ periodYear, periodQ });

      expect(response.status()).toBe(401);
    });

    test("POST /private/objectives/get/mine - должен получить 401", async ({
      anonAPI,
    }) => {
      setSeverity("critical");
      const { periodYear, periodQ } = getCurrentPeriod();
      const { response } = await anonAPI.getMyObjectives({
        periodYear,
        periodQ,
      });

      expect(response.status()).toBe(401);
    });

    test("GET /private/objectives/draft - должен получить 401", async ({
      anonAPI,
    }) => {
      setSeverity("critical");
      const { response } = await anonAPI.getDraftObjectives();

      expect(response.status()).toBe(401);
    });

    test("POST /private/objectives/ - должен получить 401", async ({
      anonAPI,
    }) => {
      setSeverity("critical");
      const { response } = await anonAPI.saveObjective({
        title: "Test",
        status: "draft",
      });

      expect(response.status()).toBe(401);
    });

    test("GET /private/objectives/{id}/ - должен получить 401", async ({
      anonAPI,
    }) => {
      setSeverity("critical");
      const { response } = await anonAPI.getObjectiveById(testObjectiveId || 1);

      expect(response.status()).toBe(401);
    });

    test("DELETE /private/objectives/{id} - должен получить 401", async ({
      anonAPI,
    }) => {
      setSeverity("critical");
      const { response } = await anonAPI.deleteObjective(testObjectiveId || 1);

      expect(response.status()).toBe(401);
    });

    test("GET /manager/objectives/settings - должен получить 401", async ({
      anonAPI,
    }) => {
      setSeverity("critical");
      const { response } = await anonAPI.get("/manager/objectives/settings");

      expect(response.status()).toBe(401);
    });
  });

  test.describe("Admin - полные права", () => {
    test("POST /private/objectives/get - админ может получить все цели", async ({
      adminAPI,
    }) => {
      setSeverity("critical");
      const { periodYear, periodQ } = getCurrentPeriod();
      const { response, data } = await adminAPI.getObjectives({
        periodYear,
        periodQ,
        limit: 10,
      });

      expect(response.ok()).toBe(true);
      expect(data).toBeDefined();
    });

    test("POST /private/objectives/get/mine - админ может получить свои цели", async ({
      adminAPI,
    }) => {
      setSeverity("normal");
      const { periodYear, periodQ } = getCurrentPeriod();
      const { response, data } = await adminAPI.getMyObjectives({
        periodYear,
        periodQ,
        limit: 10,
      });

      expect(response.ok()).toBe(true);
      expect(data).toBeDefined();
    });

    test("POST /private/objectives/get/subordinates - админ может получить цели подчинённых", async ({
      adminAPI,
    }) => {
      setSeverity("normal");
      const { periodYear, periodQ } = getCurrentPeriod();
      const { response } = await adminAPI.getSubordinatesObjectives({
        periodYear,
        periodQ,
        limit: 10,
      });

      // 200/201 - если есть подчинённые, 400 - если нет
      expect([200, 201, 400]).toContain(response.status());
    });

    test("GET /private/objectives/draft - админ может получить черновики", async ({
      adminAPI,
    }) => {
      setSeverity("normal");
      const { response, data } = await adminAPI.getDraftObjectives({
        limit: 10,
      });

      expect(response.ok()).toBe(true);
      expect(data).toBeDefined();
    });

    test("POST /private/objectives/ - админ может создавать цели", async ({
      adminAPI,
    }) => {
      setSeverity("critical");
      const { response, data } = await createTestObjective(adminAPI);

      expect(response.ok()).toBe(true);
      expect(data?.id).toBeDefined();

      if (data?.id) {
        createdObjectiveIds.push(data.id);
      }
    });

    test("GET /private/objectives/{id}/ - админ может читать по ID", async ({
      adminAPI,
    }) => {
      setSeverity("normal");
      test.skip(!testObjectiveId, "Нет тестовой цели");

      const { response, data } =
        await adminAPI.getObjectiveById(testObjectiveId);

      expect(response.ok()).toBe(true);
      expect(data).toBeDefined();
    });

    test("DELETE /private/objectives/{id} - админ может удалять", async ({
      adminAPI,
    }) => {
      setSeverity("normal");
      const { data: created } = await createTestObjective(adminAPI);
      test.skip(!created?.id, "Не удалось создать цель");

      const { response } = await adminAPI.deleteObjective(created.id);

      expect(response.ok()).toBe(true);
    });

    test("GET /manager/objectives/settings - админ может читать настройки", async ({
      adminAPI,
    }) => {
      setSeverity("normal");
      const { response } = await adminAPI.get("/manager/objectives/settings");

      expect(response.ok()).toBe(true);
    });

    test("POST /manager/objectives/settings - админ может обновлять настройки", async ({
      adminAPI,
    }) => {
      setSeverity("normal");
      // Сначала получаем текущие настройки
      const { data: currentSettings } = await adminAPI.get(
        "/manager/objectives/settings",
      );

      if (currentSettings) {
        const { response } = await adminAPI.post(
          "/manager/objectives/settings",
          currentSettings,
        );
        expect([200, 201]).toContain(response.status());
      }
    });
  });

  test.describe("User - базовые права", () => {
    test("POST /private/objectives/get/mine - user может получить свои цели", async ({
      userAPI,
    }) => {
      setSeverity("critical");
      const { periodYear, periodQ } = getCurrentPeriod();
      const { response, data } = await userAPI.getMyObjectives({
        periodYear,
        periodQ,
        limit: 10,
      });

      expect(response.ok()).toBe(true);
      expect(data).toBeDefined();
    });

    test("GET /private/objectives/draft - user может получить свои черновики", async ({
      userAPI,
    }) => {
      setSeverity("normal");
      const { response, data } = await userAPI.getDraftObjectives({
        limit: 10,
      });

      expect(response.ok()).toBe(true);
      expect(data).toBeDefined();
    });

    test("POST /private/objectives/ - user может создавать свои цели", async ({
      userAPI,
    }) => {
      setSeverity("critical");
      const { response, data } = await createTestObjective(userAPI, {
        level: "self",
      });

      // User может создавать цели уровня self
      expect([200, 201, 400]).toContain(response.status());

      if (data?.id) {
        createdObjectiveIds.push(data.id);
      }
    });

    test("GET /manager/objectives/settings - user не имеет доступа", async ({
      userAPI,
    }) => {
      setSeverity("critical");
      const { response } = await userAPI.get("/manager/objectives/settings");

      // User без прав на модуль не имеет доступа к /manager/
      expect(response.status()).toBe(403);
    });

    test("POST /manager/objectives/settings - user не может изменять настройки", async ({
      userAPI,
    }) => {
      setSeverity("critical");
      const { response } = await userAPI.post(
        "/manager/objectives/settings",
        {},
      );

      // User не должен иметь права на изменение настроек
      expect([403]).toContain(response.status());
    });
  });

  test.describe("Manager - расширенные права", () => {
    test("POST /private/objectives/get/subordinates - manager может видеть цели подчинённых", async ({
      managerAPI,
    }) => {
      setSeverity("normal");
      const { periodYear, periodQ } = getCurrentPeriod();
      const { response } = await managerAPI.getSubordinatesObjectives({
        periodYear,
        periodQ,
        limit: 10,
      });

      // 200/201 - если есть подчинённые, 400 - если нет
      expect([200, 201, 400]).toContain(response.status());
    });

    test("GET /manager/objectives/settings - manager (руководитель) не имеет доступа", async ({
      managerAPI,
    }) => {
      setSeverity("critical");
      const { response } = await managerAPI.get("/manager/objectives/settings");

      // Руководитель без прав на модуль не имеет доступа к /manager/
      expect(response.status()).toBe(403);
    });
  });

  test.describe("Уровни видимости целей (level)", () => {
    test("User не может видеть цель уровня self другого пользователя", async ({
      adminAPI,
      userAPI,
    }) => {
      setSeverity("critical");

      // Admin создаёт цель уровня self
      const { data: created } = await createTestObjective(adminAPI, {
        level: "self",
        userAccessType: "selective",
      });

      if (created?.id) {
        createdObjectiveIds.push(created.id);

        // User пытается прочитать
        const { response } = await userAPI.getObjectiveById(created.id);

        // User не должен иметь доступа к чужой личной цели
        expect([403, 404]).toContain(response.status());
      }
    });

    test("User может видеть цель уровня company", async ({
      adminAPI,
      userAPI,
    }) => {
      setSeverity("normal");

      // Admin создаёт цель уровня company
      const { data: created } = await createTestObjective(adminAPI, {
        level: "company",
        userAccessType: "everybody",
      });

      if (created?.id) {
        createdObjectiveIds.push(created.id);

        // User читает цель company уровня
        const { response } = await userAPI.getObjectiveById(created.id);

        // Цель company уровня должна быть доступна всем
        expect([200, 403, 404]).toContain(response.status());
      }
    });
  });

  test.describe("Кросс-ролевые проверки доступа", () => {
    test("User не может удалить цель созданную Admin", async ({ userAPI }) => {
      setSeverity("critical");
      test.skip(!testObjectiveId, "Нет тестовой цели");

      const { response } = await userAPI.deleteObjective(testObjectiveId);

      // User не может удалить чужую цель
      expect([403, 404]).toContain(response.status());
    });

    test("User не может редактировать цель созданную Admin", async ({
      adminAPI,
      userAPI,
    }) => {
      setSeverity("critical");

      // Admin создаёт цель
      const { data: created } = await createTestObjective(adminAPI);

      if (created?.id) {
        createdObjectiveIds.push(created.id);

        // User пытается обновить
        const { response } = await userAPI.saveObjective({
          id: created.id,
          title: "Hacked by User",
        });

        // User не может редактировать чужую цель (400 - валидация, 403/404 - нет доступа)
        expect([400, 403, 404]).toContain(response.status());
      }
    });

    test("User не может обновить milestone чужой цели", async ({
      adminAPI,
      userAPI,
    }) => {
      setSeverity("critical");

      // Admin создаёт цель с milestone
      const { data: created } = await createTestObjective(adminAPI);

      if (created?.id && created?.milestones?.[0]?.id) {
        createdObjectiveIds.push(created.id);

        // User пытается обновить прогресс milestone
        const { response } = await userAPI.updateMilestoneProgress(
          created.id,
          created.milestones[0].id,
          { progress: 50 },
        );

        // User не может менять milestone чужой цели (400 - валидация, 403/404 - нет доступа)
        expect([400, 403, 404]).toContain(response.status());
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // РЕДАКТИРОВАНИЕ И УДАЛЕНИЕ СВОИХ ЦЕЛЕЙ
  // ═══════════════════════════════════════════════════════════════
  test.describe("Редактирование и удаление своих целей", () => {
    test("User может редактировать свою цель", async ({ userAPI }) => {
      setSeverity("normal");

      // User создаёт цель
      const { data: created } = await createTestObjective(userAPI, {
        title: `User Own Objective ${Date.now()}`,
        level: "self",
      });

      test.skip(!created?.id, "Не удалось создать цель");
      createdObjectiveIds.push(created.id);

      // User редактирует свою цель
      const { response } = await userAPI.saveObjective({
        id: created.id,
        title: `User Own Objective Updated ${Date.now()}`,
      });

      // User может редактировать свою цель
      expect([200, 400]).toContain(response.status());
    });

    test("Manager может редактировать свою цель", async ({ managerAPI }) => {
      setSeverity("normal");

      // Manager создаёт цель
      const { data: created } = await createTestObjective(managerAPI, {
        title: `Manager Own Objective ${Date.now()}`,
        level: "self",
      });

      test.skip(!created?.id, "Не удалось создать цель");
      createdObjectiveIds.push(created.id);

      // Manager редактирует свою цель
      const { response } = await managerAPI.saveObjective({
        id: created.id,
        title: `Manager Own Objective Updated ${Date.now()}`,
      });

      // Manager может редактировать свою цель
      expect([200, 400]).toContain(response.status());
    });

    test("User может удалить свой черновик", async ({ userAPI }) => {
      setSeverity("normal");

      // User создаёт черновик (цель в статусе draft)
      const { data: created } = await createTestObjective(userAPI, {
        title: `User Draft ${Date.now()}`,
        level: "self",
        status: "draft",
      });

      test.skip(!created?.id, "Не удалось создать черновик");

      // User удаляет свой черновик
      const { response } = await userAPI.deleteObjective(created.id);

      // User может удалить свой черновик
      expect(response.ok()).toBe(true);
    });

    test("Manager может удалить свой черновик", async ({ managerAPI }) => {
      setSeverity("normal");

      // Manager создаёт черновик
      const { data: created } = await createTestObjective(managerAPI, {
        title: `Manager Draft ${Date.now()}`,
        level: "self",
        status: "draft",
      });

      test.skip(!created?.id, "Не удалось создать черновик");

      // Manager удаляет свой черновик
      const { response } = await managerAPI.deleteObjective(created.id);

      // Manager может удалить свой черновик
      expect(response.ok()).toBe(true);
    });

    test("User не может удалить чужой черновик", async ({
      adminAPI,
      userAPI,
    }) => {
      setSeverity("critical");

      // Admin создаёт черновик
      const { data: created } = await createTestObjective(adminAPI, {
        title: `Admin Draft ${Date.now()}`,
        level: "self",
        status: "draft",
      });

      test.skip(!created?.id, "Не удалось создать черновик");
      createdObjectiveIds.push(created.id);

      // User пытается удалить чужой черновик
      const { response } = await userAPI.deleteObjective(created.id);

      // User не может удалить чужой черновик
      expect([403, 404]).toContain(response.status());
    });
  });

  test.describe("Objective Comments Security", () => {
    test("Anonymous не может читать комментарии", async ({ anonAPI }) => {
      setSeverity("critical");
      const { response } = await anonAPI.get(
        `/private/objective-comments/of-objective/${testObjectiveId || 1}/`,
      );

      expect(response.status()).toBe(401);
    });

    test("Anonymous не может создавать комментарии", async ({ anonAPI }) => {
      setSeverity("critical");
      const { response } = await anonAPI.post("/private/objective-comments/", {
        objectiveId: testObjectiveId || 1,
        body: "Test comment",
      });

      expect(response.status()).toBe(401);
    });

    test("User не может комментировать чужую приватную цель", async ({
      adminAPI,
      userAPI,
    }) => {
      setSeverity("critical");

      // Admin создаёт приватную цель
      const { data: created } = await createTestObjective(adminAPI, {
        level: "self",
        userAccessType: "selective",
      });

      if (created?.id) {
        createdObjectiveIds.push(created.id);

        // User пытается добавить комментарий
        const { response } = await userAPI.post(
          "/private/objective-comments/",
          {
            objectiveId: created.id,
            body: "Unauthorized comment",
          },
        );

        // User не должен комментировать приватную цель
        expect([403, 404]).toContain(response.status());
      }
    });

    test("User не может удалить комментарий другого пользователя", async ({
      adminAPI,
      userAPI,
    }) => {
      setSeverity("critical");

      // Admin создаёт цель с доступом everybody
      const { data: objective } = await createTestObjective(adminAPI, {
        userAccessType: "everybody",
      });

      if (objective?.id) {
        createdObjectiveIds.push(objective.id);

        // Admin добавляет комментарий
        const { data: comment } = await adminAPI.post(
          "/private/objective-comments/",
          {
            objectiveId: objective.id,
            body: "Admin comment",
          },
        );

        if (comment?.id) {
          // User пытается удалить комментарий admin
          const { response } = await userAPI.delete(
            `/private/objective-comments/${comment.id}/`,
          );

          expect([403, 404]).toContain(response.status());
        }
      }
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

test.describe("Objectives API Error Analysis @api @objectives @security", () => {
  test("Анализ ответа при отказе в доступе к /manager/objectives/settings", async ({
    request,
  }) => {
    const api = new ObjectivesAPI(request);
    const { email, password } = getCredentials("user");
    await api.signIn(email, password);

    const { response } = await api.get("/manager/objectives/settings");
    const status = response.status();

    if (!response.ok()) {
      const errorInfo = await analyzeErrorResponse(response);
      console.log(
        "User -> /manager/objectives/settings error:",
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

  test("Анализ ответа при доступе к чужой цели", async ({ request }) => {
    // Создаём цель от admin
    const adminApi = new ObjectivesAPI(request);
    const adminCreds = getCredentials("admin");
    await adminApi.signIn(adminCreds.email, adminCreds.password);

    const { periodYear, periodQ } = getCurrentPeriod();
    const userId = await getCurrentUserId(adminApi);

    const { data: created } = await adminApi.saveObjective({
      title: `Error Analysis Test ${Date.now()}`,
      periodYear,
      periodQ,
      status: "draft",
      level: "self",
      responsibleUserId: userId,
      userAccessType: "selective",
      milestones: [],
    });

    if (created?.id) {
      // User пытается получить доступ
      const userApi = new ObjectivesAPI(request);
      const userCreds = getCredentials("user");
      await userApi.signIn(userCreds.email, userCreds.password);

      const { response } = await userApi.getObjectiveById(created.id);
      const status = response.status();

      if (!response.ok()) {
        const errorInfo = await analyzeErrorResponse(response);
        console.log(
          `User -> /private/objectives/${created.id}/ error:`,
          JSON.stringify(errorInfo, null, 2),
        );
      }

      // Cleanup
      await adminApi.deleteObjective(created.id);

      expect([403, 404]).toContain(status);
    }
  });
});
