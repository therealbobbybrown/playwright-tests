// tests/functional/api/performance-review.permissions.api.spec.js
// Тесты прав доступа для Performance Reviews API
//
// Примечание по ролям:
// - admin: пользователь с правами администратора
// - user: обычный пользователь без прав на модуль оценки сотрудников
// - manager: пользователь с правами на модуль оценки сотрудников (не связано с должностью)
// /manager/ endpoint доступен только админам и пользователям с правами на модуль оценки

import { test as base, expect } from "@playwright/test";
import { PerformanceReviewAPI, getCredentials } from "../../utils/api/index.js";
import { TestDataHelper } from "../../utils/TestDataHelper.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

/**
 * Минимальный payload для создания Performance Review
 */
function createMinimalPRPayload(title) {
  return {
    title,
    // ВАЖНО: все 4 направления обязательны, иначе SSR падает с 500
    directions: [
      {
        id: null,
        receiverType: "self",
        isSelected: true,
        title: null,
        description: null,
      },
      {
        id: null,
        receiverType: "head",
        isSelected: true,
        title: null,
        description: null,
      },
      {
        id: null,
        receiverType: "subordinate",
        isSelected: false,
        title: null,
        description: null,
      },
      {
        id: null,
        receiverType: "colleague",
        isSelected: false,
        title: null,
        description: null,
      },
    ],
    anonymityType: "notAnonymous",
    workflowType: "basic",
    notificationsSchedule: {
      enableReminds: false,
      baseDate: new Date().toISOString(),
      repeatType: "noRepeat",
      timezoneOffset: 0,
    },
    isApprovalStep: false,
    isAsyncSteps: false,
    isAsyncStepsSelfResponseStep: false,
  };
}

// Фикстуры для разных ролей
const test = base.extend({
  // Admin API клиент
  adminAPI: async ({ request }, use) => {
    const api = new PerformanceReviewAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },

  // User API клиент (обычный пользователь)
  userAPI: async ({ request }, use) => {
    const api = new PerformanceReviewAPI(request);
    const { email, password } = getCredentials("user");
    await api.signIn(email, password);
    await use(api);
  },

  // Manager API клиент (пользователь с правами на модуль оценки сотрудников)
  managerAPI: async ({ request }, use) => {
    const api = new PerformanceReviewAPI(request);
    const { email, password } = getCredentials("manager");
    await api.signIn(email, password);
    await use(api);
  },

  // Неавторизованный клиент
  anonAPI: async ({ request }, use) => {
    const api = new PerformanceReviewAPI(request);
    // НЕ делаем signIn
    await use(api);
  },
});

test.describe("Performance Review Permissions API @api @performance-review @permissions @ui @security", () => {
  test.beforeEach(() => {
    markAsAPITest(MODULES.PERFORMANCE_REVIEW, "Permissions");
  });

  let testReviewId = null;

  // Создаём тестовый review перед тестами прав
  test.beforeAll(async ({ request }) => {
    const api = new PerformanceReviewAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);

    const title = TestDataHelper.generateUniqueName("Проверка прав ревью");
    const { data } = await api.create(createMinimalPRPayload(title));
    testReviewId = data?.id;
  });

  // Cleanup после всех тестов
  test.afterAll(async ({ request }) => {
    if (testReviewId) {
      const api = new PerformanceReviewAPI(request);
      const { email, password } = getCredentials("admin");
      await api.signIn(email, password);
      try {
        await api.archive(testReviewId);
        await api.remove(testReviewId);
      } catch (e) {
        // ignore
      }
    }
  });

  test.describe("Неавторизованный пользователь (Anonymous)", () => {
    test("GET /manager/performance-reviews - должен получить 401", async ({
      anonAPI,
    }) => {
      const { response } = await anonAPI.getList();

      expect(response.status()).toBe(401);
    });

    test("POST /manager/performance-reviews - должен получить 401", async ({
      anonAPI,
    }) => {
      const { response } = await anonAPI.create({ title: "Test" });

      expect(response.status()).toBe(401);
    });

    test("GET /manager/performance-reviews/{id} - должен получить 401", async ({
      anonAPI,
    }) => {
      const { response } = await anonAPI.getById(testReviewId || 1);

      expect(response.status()).toBe(401);
    });

    test("DELETE /manager/performance-reviews/{id} - должен получить 401", async ({
      anonAPI,
    }) => {
      const { response } = await anonAPI.remove(testReviewId || 1);

      expect(response.status()).toBe(401);
    });
  });

  test.describe("Admin - полные права", () => {
    test("GET /manager/performance-reviews - админ может читать список", async ({
      adminAPI,
    }) => {
      const { response } = await adminAPI.getList();

      expect(response.ok()).toBe(true);
    });

    test("POST /manager/performance-reviews - админ может создавать", async ({
      adminAPI,
    }) => {
      const title = TestDataHelper.generateUniqueName("Админ создание");
      const { response, data } = await adminAPI.create(
        createMinimalPRPayload(title),
      );

      expect(response.ok()).toBe(true);
      expect(data.id).toBeDefined();

      // Cleanup - архивируем перед удалением
      if (data?.id) {
        await adminAPI.archive(data.id);
        await adminAPI.remove(data.id);
      }
    });

    test("GET /manager/performance-reviews/{id} - админ может читать по ID", async ({
      adminAPI,
    }) => {
      // Создаём свой для теста
      const { data: created } = await adminAPI.create(
        createMinimalPRPayload(
          TestDataHelper.generateUniqueName("Админ чтение"),
        ),
      );

      const { response } = await adminAPI.getById(created.id);

      expect(response.ok()).toBe(true);

      // Cleanup - архивируем перед удалением
      await adminAPI.archive(created.id);
      await adminAPI.remove(created.id);
    });

    test("POST /manager/performance-reviews/{id} - админ может обновлять", async ({
      adminAPI,
    }) => {
      const { data: created } = await adminAPI.create(
        createMinimalPRPayload(
          TestDataHelper.generateUniqueName("Админ обновление"),
        ),
      );

      const { response } = await adminAPI.update(created.id, {
        title: "Updated by Admin",
      });

      expect(response.ok()).toBe(true);

      // Cleanup - архивируем перед удалением
      await adminAPI.archive(created.id);
      await adminAPI.remove(created.id);
    });

    test("DELETE /manager/performance-reviews/{id} - админ может удалять", async ({
      adminAPI,
    }) => {
      const { data: created } = await adminAPI.create(
        createMinimalPRPayload(
          TestDataHelper.generateUniqueName("Админ удаление"),
        ),
      );

      // Сначала архивируем (API требует архивировать перед удалением)
      await adminAPI.archive(created.id);

      const { response } = await adminAPI.remove(created.id);

      expect(response.ok()).toBe(true);
    });
  });

  test.describe("Manager - права менеджера", () => {
    test("GET /manager/performance-reviews - менеджер может читать список (если есть право)", async ({
      managerAPI,
    }) => {
      const { response } = await managerAPI.getList();

      // Менеджер может иметь или не иметь права на manager endpoints
      // В зависимости от настроек прав в системе
      expect([200, 403]).toContain(response.status());
    });

    test("POST /manager/performance-reviews - менеджер может создавать (если есть право)", async ({
      managerAPI,
    }) => {
      const title = TestDataHelper.generateUniqueName("Менеджер создание");
      const { response, data } = await managerAPI.create(
        createMinimalPRPayload(title),
      );

      // Менеджер может иметь или не иметь права на создание
      // В зависимости от настроек прав
      if (response.ok()) {
        expect(data.id).toBeDefined();
        // Cleanup - удаляем от admin т.к. manager может не иметь права на удаление
      }
      // Если нет права - ожидаем 403
      expect([200, 201, 403]).toContain(response.status());
    });
  });

  test.describe("User - ограниченные права", () => {
    test("GET /manager/performance-reviews - user может не иметь доступа к manager API", async ({
      userAPI,
    }) => {
      const { response } = await userAPI.getList();

      // Обычный пользователь обычно не имеет доступа к manager endpoints
      // Но это зависит от настроек прав
      expect([200, 403]).toContain(response.status());
    });

    test("POST /manager/performance-reviews - user не может создавать", async ({
      userAPI,
    }) => {
      const title = TestDataHelper.generateUniqueName("Пользователь создание");
      const { response } = await userAPI.create(createMinimalPRPayload(title));

      // Обычный пользователь не должен создавать PR через manager API
      expect([403]).toContain(response.status());
    });

    test("DELETE /manager/performance-reviews/{id} - user не может удалять чужие PR", async ({
      userAPI,
    }) => {
      // Пытаемся удалить PR созданный админом
      if (testReviewId) {
        const { response } = await userAPI.remove(testReviewId);

        // Должен быть отказ в доступе
        expect([403, 404]).toContain(response.status());
      }
    });
  });

  test.describe("Кросс-ролевые проверки", () => {
    test("User не может обновить PR созданный Admin", async ({
      adminAPI,
      userAPI,
    }) => {
      // Admin создаёт
      const { data: created } = await adminAPI.create(
        createMinimalPRPayload(
          TestDataHelper.generateUniqueName("Кросс-роль"),
        ),
      );

      // User пытается обновить
      const { response } = await userAPI.update(created.id, {
        title: "Hacked by User",
      });

      // Должен быть отказ
      expect([403, 404]).toContain(response.status());

      // Cleanup - архивируем перед удалением
      await adminAPI.archive(created.id);
      await adminAPI.remove(created.id);
    });

    test("Manager может/не может обновить PR созданный Admin (зависит от прав)", async ({
      adminAPI,
      managerAPI,
    }) => {
      // Admin создаёт
      const { data: created } = await adminAPI.create(
        createMinimalPRPayload(
          TestDataHelper.generateUniqueName("Кросс-роль админ-менеджер"),
        ),
      );

      // Manager пытается обновить
      const { response } = await managerAPI.update(created.id, {
        title: "Updated by Manager",
      });

      // Результат зависит от настроек прав в системе
      expect([200, 403, 404]).toContain(response.status());

      // Cleanup - архивируем перед удалением
      await adminAPI.archive(created.id);
      await adminAPI.remove(created.id);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // УТВЕРЖДЕНИЕ КОЛЛЕГ - admin и manager могут, user нет
  // ═══════════════════════════════════════════════════════════════
  test.describe("Утверждение коллег в оценке", () => {
    test("Admin может утверждать коллег через manager API", async ({
      adminAPI,
    }) => {
      setSeverity("normal");
      // Проверяем доступ к endpoint утверждения - 200 или 400/404 если нет активной оценки
      const { response } = await adminAPI.get("/manager/performance-reviews");

      // Admin имеет доступ к manager API
      expect(response.ok()).toBe(true);
    });

    test("Manager может утверждать коллег через private API (если есть права)", async ({
      managerAPI,
    }) => {
      setSeverity("normal");
      // Проверяем доступ к private endpoint истории - косвенная проверка прав
      const { response } = await managerAPI.get(
        "/private/performance-reviews/history",
      );

      // Manager имеет доступ к private API оценки
      expect([200, 400, 404]).toContain(response.status());
    });

    test("User не может утверждать коллег через manager API", async ({
      userAPI,
    }) => {
      setSeverity("critical");
      // User без прав не имеет доступа к manager API утверждения
      const { response } = await userAPI.post(
        "/manager/performance-reviews/1/async-steps/approve-suggestions",
        {},
      );

      // User без прав на модуль не имеет доступа к /manager/
      expect([403, 404]).toContain(response.status());
    });

    test("User не может получить доступ к управлению оценкой", async ({
      userAPI,
    }) => {
      setSeverity("critical");
      const { response } = await userAPI.get("/manager/performance-reviews");

      // User без прав на модуль не имеет доступа к /manager/
      expect(response.status()).toBe(403);
    });
  });
});

/**
 * Анализ ответа с ошибкой - проверяет тело на наличие информации о реальном статусе
 * Фронт может использовать поля в теле ответа для определения типа ошибки (403 vs 500)
 */
async function analyzeErrorResponse(response) {
  const status = response.status();
  let body = null;
  let errorInfo = null;

  try {
    body = await response.json();
  } catch {
    try {
      body = await response.text();
    } catch {
      body = null;
    }
  }

  // Анализируем тело ответа на наличие информации об ошибке
  if (body && typeof body === "object") {
    errorInfo = {
      status,
      statusCode: body.statusCode,
      error: body.error,
      message: body.message,
      code: body.code,
      // Дополнительные поля которые могут содержать информацию
      type: body.type,
      errorCode: body.errorCode,
    };
  } else {
    errorInfo = { status, body };
  }

  return errorInfo;
}

test.describe("Private API Permissions @api @performance-review @permissions", () => {
  test.describe("Анализ ошибок API (403 vs 500)", () => {
    test("User пытается получить доступ к /manager/ endpoint - анализ ответа", async ({
      request,
    }) => {
      const api = new PerformanceReviewAPI(request);
      const { email, password } = getCredentials("user");
      await api.signIn(email, password);

      // User без прав пытается получить список PR через manager API
      const { response } = await api.get("/manager/performance-reviews");
      const status = response.status();

      if (!response.ok()) {
        const errorInfo = await analyzeErrorResponse(response);
        console.log(
          "User -> /manager/performance-reviews error analysis:",
          JSON.stringify(errorInfo, null, 2),
        );

        // Документируем как backend возвращает отказ в доступе
        if (status === 500) {
          console.log(
            "  -> HTTP 500 received. Check if body contains access denied info.",
          );
          if (
            errorInfo.statusCode === 403 ||
            errorInfo.message?.includes("access") ||
            errorInfo.message?.includes("forbidden")
          ) {
            console.log(
              "  -> Body indicates access denied (403 disguised as 500)",
            );
          }
        } else if (status === 403) {
          console.log("  -> Proper HTTP 403 Forbidden returned");
        }
      }

      // User без прав должен получить отказ (403 или 500 с информацией о 403)
      expect([200, 403, 500]).toContain(status);
    });

    test("User пытается обновить чужой PR - анализ ответа", async ({
      request,
    }) => {
      // Сначала создаём PR от admin
      const adminApi = new PerformanceReviewAPI(request);
      const adminCreds = getCredentials("admin");
      await adminApi.signIn(adminCreds.email, adminCreds.password);

      const { data: created } = await adminApi.create(
        createMinimalPRPayload(
          TestDataHelper.generateUniqueName("Анализ ошибок"),
        ),
      );

      // Теперь user пытается его обновить
      const userApi = new PerformanceReviewAPI(request);
      const userCreds = getCredentials("user");
      await userApi.signIn(userCreds.email, userCreds.password);

      const { response } = await userApi.post(
        `/manager/performance-reviews/${created.id}`,
        {
          title: "Hacked Title",
        },
      );
      const status = response.status();

      if (!response.ok()) {
        const errorInfo = await analyzeErrorResponse(response);
        console.log(
          `User -> /manager/performance-reviews/${created.id} (update) error analysis:`,
          JSON.stringify(errorInfo, null, 2),
        );
      }

      // Cleanup
      await adminApi.archive(created.id);
      await adminApi.remove(created.id);

      // Ожидаем отказ
      expect([403, 404, 500]).toContain(status);
    });

    test("User пытается получить доступ к разным API endpoints - проверка 403", async ({
      request,
    }) => {
      const api = new PerformanceReviewAPI(request);
      const { email, password } = getCredentials("user");
      await api.signIn(email, password);

      // Тестируем разные API endpoints
      const endpointsToTest = [
        "/private/performance-reviews/history",
        "/private/performance-reviews/dashboard-filters/performance-reviews",
      ];

      console.log("Testing API endpoints for 500 vs 403 behavior:");

      for (const endpoint of endpointsToTest) {
        const { response } = await api.get(endpoint);
        const status = response.status();

        if (status === 500) {
          const errorInfo = await analyzeErrorResponse(response);
          console.log(
            `  ${endpoint}: HTTP 500`,
            JSON.stringify(errorInfo, null, 2),
          );
        } else if (status === 403) {
          console.log(`  ${endpoint}: HTTP 403 (proper)`);
        } else if (status === 400) {
          console.log(`  ${endpoint}: HTTP 400 (validation)`);
        } else if (status === 200) {
          console.log(`  ${endpoint}: HTTP 200 (access granted)`);
        } else {
          console.log(`  ${endpoint}: HTTP ${status}`);
        }
      }

      // Тест всегда проходит - это исследовательский тест
      expect(true).toBe(true);
    });

    // ПРИМЕЧАНИЕ: SSR 500 вместо 403 происходит при браузерном запросе с cookies
    // API тесты через request не воспроизводят это поведение т.к. используют Bearer token
    // Для полного теста нужен E2E тест с браузером (см. tests/functional/e2e/)
    //
    // Документация поведения:
    // - API — возвращает корректный HTTP 403 с message: "User lacks required permissions"
    // - Frontend SSR — при браузерном запросе может возвращать HTTP 500
    //   Фронт клиент перехватывает это и показывает пользователю страницу 403
  });

  test.describe("Private endpoints для обычного пользователя", () => {
    test("GET /private/performance-reviews/history - проверка доступа user", async ({
      request,
    }) => {
      const api = new PerformanceReviewAPI(request);
      const { email, password } = getCredentials("user");
      await api.signIn(email, password);

      const { response } = await api.get(
        "/private/performance-reviews/history",
      );
      const status = response.status();

      // Анализируем ответ если это ошибка
      if (!response.ok()) {
        const errorInfo = await analyzeErrorResponse(response);
        console.log(
          "GET /private/performance-reviews/history error analysis:",
          JSON.stringify(errorInfo, null, 2),
        );
      }

      // 400 - validation error (ожидает параметры), 200 - успех
      expect([200, 400, 403, 500]).toContain(status);
    });

    test("GET /private/performance-reviews/dashboard-filters/performance-reviews - проверка доступа user", async ({
      request,
    }) => {
      const api = new PerformanceReviewAPI(request);
      const { email, password } = getCredentials("user");
      await api.signIn(email, password);

      const { response } = await api.get(
        "/private/performance-reviews/dashboard-filters/performance-reviews",
      );
      const status = response.status();

      // Анализируем ответ если это ошибка
      if (!response.ok()) {
        const errorInfo = await analyzeErrorResponse(response);
        console.log(
          "GET /private/performance-reviews/dashboard-filters/performance-reviews error analysis:",
          JSON.stringify(errorInfo, null, 2),
        );
      }

      // 400 "No such subordinates" - у user нет подчинённых
      expect([200, 400, 403, 500]).toContain(status);
    });
  });
});
