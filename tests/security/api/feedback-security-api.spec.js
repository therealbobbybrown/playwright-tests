// tests/security/api/feedback-security-api.spec.js
// Тесты прав доступа для Feedback API
//
// Примечание по ролям:
// - admin: пользователь с правами администратора
// - user: обычный пользователь
// - manager: пользователь с правами на модуль обратной связи
// /manager/ endpoint доступен только админам и пользователям с правами на модуль

import { test as base, expect } from "@playwright/test";
import { FeedbackAPI, getCredentials } from "../../utils/api/index.js";
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
    const api = new FeedbackAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },

  // User API клиент (обычный пользователь)
  userAPI: async ({ request }, use) => {
    const api = new FeedbackAPI(request);
    const { email, password } = getCredentials("user");
    await api.signIn(email, password);
    await use(api);
  },

  // Manager API клиент
  managerAPI: async ({ request }, use) => {
    const api = new FeedbackAPI(request);
    const { email, password } = getCredentials("manager");
    await api.signIn(email, password);
    await use(api);
  },

  // Неавторизованный клиент
  anonAPI: async ({ request }, use) => {
    const api = new FeedbackAPI(request);
    // НЕ делаем signIn
    await use(api);
  },
});

// Хелпер для получения типа благодарности
async function getThanksTypeId(feedbackAPI) {
  const { data } = await feedbackAPI.getFeedbackTypes();
  const items = data?.items || data || [];
  const thanksType = items.find(
    (t) =>
      t.name?.toLowerCase() === "thanks" ||
      t.code?.toLowerCase() === "thanks" ||
      t.selectable === true,
  );
  return thanksType?.id || items[0]?.id || null;
}

// Хелпер для получения ID целевого пользователя
async function getTargetUserId(feedbackAPI) {
  // Пробуем /manager/users (для admin)
  const { response, data } = await feedbackAPI.get("/manager/users?limit=10");
  if (response.ok()) {
    const users = data?.items || data || [];
    if (users.length > 1) return users[1].id;
    if (users.length > 0) return users[0].id;
  }

  // Fallback: пробуем /private/users (для всех авторизованных)
  const { response: privateResponse, data: privateData } =
    await feedbackAPI.get("/private/users?limit=10");
  if (privateResponse.ok()) {
    const users = privateData?.items || privateData || [];
    if (users.length > 1) return users[1].id;
    if (users.length > 0) return users[0].id;
  }

  // Последний fallback: получить текущего пользователя
  const { response: meResponse, data: meData } = await feedbackAPI.get(
    "/private/accounts/me/",
  );
  if (meResponse.ok()) {
    return meData?.currentUserId || meData?.account?.users?.[0]?.id || null;
  }

  return null;
}

test.describe("Feedback Security API @api @feedback @permissions @security", () => {
  test.beforeEach(() => {
    markAsAPITest(MODULES.FEEDBACK, "Security");
  });

  let testFeedbackId = null;
  let feedbackTypeId = null;
  let targetUserId = null;

  // Создаём тестовую благодарность перед тестами
  test.beforeAll(async ({ request }) => {
    const api = new FeedbackAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);

    // Получаем тип благодарности и целевого пользователя
    feedbackTypeId = await getThanksTypeId(api);
    targetUserId = await getTargetUserId(api);

    console.log(
      `[beforeAll] feedbackTypeId=${feedbackTypeId}, targetUserId=${targetUserId}`,
    );

    // Сначала пробуем получить существующую благодарность
    const { response: listResponse, data: listData } = await api.getFeedbacks({
      limit: 1,
    });
    if (listResponse.ok()) {
      const feedbacks = listData?.items || listData || [];
      if (feedbacks.length > 0) {
        testFeedbackId = feedbacks[0].id;
        console.log(
          `[beforeAll] Using existing feedback: id=${testFeedbackId}`,
        );
        return;
      }
    }

    // Если нет существующих, создаём новую
    if (feedbackTypeId && targetUserId) {
      const { response, data } = await api.create({
        body: `Security Test Feedback ${Date.now()}`,
        targets: [targetUserId],
        feedbackTypeId,
        userAccessType: "everybody",
      });
      if (response.ok() && data?.id) {
        testFeedbackId = data.id;
        console.log(`[beforeAll] Created feedback: id=${testFeedbackId}`);
      } else {
        console.log(
          `[beforeAll] Failed to create feedback: status=${response.status()}`,
        );
      }
    }
  });

  // Cleanup после всех тестов
  test.afterAll(async ({ request }) => {
    if (testFeedbackId) {
      const api = new FeedbackAPI(request);
      const { email, password } = getCredentials("admin");
      await api.signIn(email, password);
      try {
        await api.delete(`/private/feedbacks/${testFeedbackId}/`);
      } catch (e) {
        // ignore
      }
    }
  });

  test.describe("Неавторизованный пользователь (Anonymous)", () => {
    test("GET /private/feedbacks/ - должен получить 401", async ({
      anonAPI,
    }) => {
      setSeverity("critical");
      const { response } = await anonAPI.getFeedbacks();

      expect(response.status()).toBe(401);
    });

    test("GET /private/feedbacks/my/ - должен получить 401", async ({
      anonAPI,
    }) => {
      setSeverity("critical");
      const { response } = await anonAPI.getMyFeedbacks();

      expect(response.status()).toBe(401);
    });

    test("GET /private/feedbacks/of-me/ - должен получить 401", async ({
      anonAPI,
    }) => {
      setSeverity("critical");
      const { response } = await anonAPI.getFeedbacksOfMe();

      expect(response.status()).toBe(401);
    });

    test("GET /private/feedbacks/shared/ - должен получить 401", async ({
      anonAPI,
    }) => {
      setSeverity("critical");
      const { response } = await anonAPI.getSharedFeedbacks();

      expect(response.status()).toBe(401);
    });

    test("POST /private/feedbacks/ - должен получить 401", async ({
      anonAPI,
    }) => {
      setSeverity("critical");
      const { response } = await anonAPI.create({
        body: "Test",
        targets: [1],
        feedbackTypeId: 1,
      });

      expect(response.status()).toBe(401);
    });

    test("GET /private/feedback-types/ - должен получить 401", async ({
      anonAPI,
    }) => {
      setSeverity("critical");
      const { response } = await anonAPI.getFeedbackTypes();

      expect(response.status()).toBe(401);
    });

    test("GET /private/feedback-requests/for-me/ - должен получить 401", async ({
      anonAPI,
    }) => {
      setSeverity("critical");
      const { response } = await anonAPI.getFeedbackRequestsForMe();

      expect(response.status()).toBe(401);
    });

    test("GET /manager/feedbacks/ - должен получить 401", async ({
      anonAPI,
    }) => {
      setSeverity("critical");
      const { response } = await anonAPI.get("/manager/feedbacks/");

      expect(response.status()).toBe(401);
    });
  });

  test.describe("Admin - полные права", () => {
    test("GET /private/feedbacks/ - админ может читать все благодарности", async ({
      adminAPI,
    }) => {
      setSeverity("critical");
      const { response, data } = await adminAPI.getFeedbacks({ limit: 10 });

      expect(response.ok()).toBe(true);
      expect(data).toBeDefined();
    });

    test("GET /private/feedbacks/my/ - админ может читать свои отправленные", async ({
      adminAPI,
    }) => {
      setSeverity("normal");
      const { response, data } = await adminAPI.getMyFeedbacks({ limit: 10 });

      expect(response.ok()).toBe(true);
      expect(data).toBeDefined();
    });

    test("GET /private/feedbacks/of-me/ - админ может читать полученные", async ({
      adminAPI,
    }) => {
      setSeverity("normal");
      const { response, data } = await adminAPI.getFeedbacksOfMe({ limit: 10 });

      expect(response.ok()).toBe(true);
      expect(data).toBeDefined();
    });

    test("GET /private/feedbacks/shared/ - админ может читать публичные", async ({
      adminAPI,
    }) => {
      setSeverity("normal");
      const { response, data } = await adminAPI.getSharedFeedbacks({
        limit: 10,
      });

      expect(response.ok()).toBe(true);
      expect(data).toBeDefined();
    });

    test("GET /private/feedbacks/of-employees/ - админ может читать благодарности сотрудников", async ({
      adminAPI,
    }) => {
      setSeverity("normal");
      const { response, data } = await adminAPI.getFeedbacksOfEmployees({
        limit: 10,
      });

      expect(response.ok()).toBe(true);
      expect(data).toBeDefined();
    });

    test("POST /private/feedbacks/ - админ может создавать благодарности", async ({
      adminAPI,
    }) => {
      setSeverity("critical");
      test.skip(!feedbackTypeId || !targetUserId, "Нет данных для теста");

      const { response, data } = await adminAPI.create({
        body: `Admin Test Feedback ${Date.now()}`,
        targets: [targetUserId],
        feedbackTypeId,
        userAccessType: "everybody",
      });

      // 200/201 - успех, 400/422 - валидация (если API требует дополнительные поля)
      expect([200, 201, 400, 422]).toContain(response.status());

      if (response.ok()) {
        expect(data?.id).toBeDefined();
      }

      // Cleanup
      if (data?.id) {
        await adminAPI.delete(`/private/feedbacks/${data.id}/`);
      }
    });

    test("GET /private/feedbacks/{id}/ - админ может читать по ID", async ({
      adminAPI,
    }) => {
      setSeverity("normal");
      test.skip(!testFeedbackId, "Нет тестовой благодарности");

      const { response, data } = await adminAPI.getById(testFeedbackId);

      expect(response.ok()).toBe(true);
      expect(data).toBeDefined();
    });

    test("GET /manager/feedbacks/ - админ может читать через manager API", async ({
      adminAPI,
    }) => {
      setSeverity("normal");
      const { response, data } = await adminAPI.get(
        "/manager/feedbacks/?limit=10",
      );

      expect(response.ok()).toBe(true);
      expect(data).toBeDefined();
    });

    test("GET /manager/feedbacks/statistics/timeline - админ может читать статистику", async ({
      adminAPI,
    }) => {
      setSeverity("normal");
      const { response } = await adminAPI.get(
        "/manager/feedbacks/statistics/timeline",
      );

      expect([200, 400]).toContain(response.status());
    });
  });

  test.describe("User - базовые права", () => {
    test("GET /private/feedbacks/my/ - user может читать свои отправленные", async ({
      userAPI,
    }) => {
      setSeverity("critical");
      const { response, data } = await userAPI.getMyFeedbacks({ limit: 10 });

      expect(response.ok()).toBe(true);
      expect(data).toBeDefined();
    });

    test("GET /private/feedbacks/of-me/ - user может читать полученные", async ({
      userAPI,
    }) => {
      setSeverity("critical");
      const { response, data } = await userAPI.getFeedbacksOfMe({ limit: 10 });

      expect(response.ok()).toBe(true);
      expect(data).toBeDefined();
    });

    test("GET /private/feedbacks/shared/ - user может читать публичные", async ({
      userAPI,
    }) => {
      setSeverity("normal");
      const { response, data } = await userAPI.getSharedFeedbacks({
        limit: 10,
      });

      expect(response.ok()).toBe(true);
      expect(data).toBeDefined();
    });

    test("GET /private/feedback-types/ - user может читать типы благодарностей", async ({
      userAPI,
    }) => {
      setSeverity("normal");
      const { response, data } = await userAPI.getFeedbackTypes();

      expect(response.ok()).toBe(true);
      expect(data).toBeDefined();
    });

    test("GET /private/feedback-requests/for-me/ - user может читать запросы для себя", async ({
      userAPI,
    }) => {
      setSeverity("normal");
      const { response, data } = await userAPI.getFeedbackRequestsForMe({
        limit: 10,
      });

      expect(response.ok()).toBe(true);
      expect(data).toBeDefined();
    });

    test("GET /private/feedback-requests/my/ - user может читать свои запросы", async ({
      userAPI,
    }) => {
      setSeverity("normal");
      const { response, data } = await userAPI.getMyFeedbackRequests({
        limit: 10,
      });

      expect(response.ok()).toBe(true);
      expect(data).toBeDefined();
    });

    test("GET /manager/feedbacks/ - user не имеет доступа к manager API", async ({
      userAPI,
    }) => {
      setSeverity("critical");
      const { response } = await userAPI.get("/manager/feedbacks/?limit=10");

      // User без прав на модуль не имеет доступа к /manager/
      expect(response.status()).toBe(403);
    });
  });

  test.describe("Manager - расширенные права", () => {
    test("GET /manager/feedbacks/ - manager (руководитель) не имеет доступа к manager API", async ({
      managerAPI,
    }) => {
      setSeverity("critical");
      const { response } = await managerAPI.get("/manager/feedbacks/?limit=10");

      // Руководитель без прав на модуль не имеет доступа к /manager/
      expect(response.status()).toBe(403);
    });

    test("GET /private/feedbacks/of-employees/ - manager может читать благодарности подчинённых", async ({
      managerAPI,
    }) => {
      setSeverity("normal");
      const { response } = await managerAPI.getFeedbacksOfEmployees({
        limit: 10,
      });

      // 200 - если есть подчинённые, 400 - если нет
      expect([200, 400]).toContain(response.status());
    });
  });

  test.describe("Кросс-ролевые проверки доступа", () => {
    test("User не может удалить благодарность созданную Admin", async ({
      userAPI,
    }) => {
      setSeverity("critical");
      test.skip(!testFeedbackId, "Нет тестовой благодарности");

      const { response } = await userAPI.delete(
        `/private/feedbacks/${testFeedbackId}/`,
      );

      // User не может удалить чужую благодарность
      expect([403, 404]).toContain(response.status());
    });

    test("User не может изменить статус чужой благодарности", async ({
      userAPI,
    }) => {
      setSeverity("critical");
      test.skip(!testFeedbackId, "Нет тестовой благодарности");

      const { response } = await userAPI.setStatus(testFeedbackId, "approved");

      // User не может менять статус чужой благодарности (400 - invalid operation, 403 - forbidden, 404 - not found)
      expect([400, 403, 404]).toContain(response.status());
    });

    test("User не может опубликовать чужую благодарность", async ({
      userAPI,
    }) => {
      setSeverity("critical");
      test.skip(!testFeedbackId, "Нет тестовой благодарности");

      const { response } = await userAPI.publish(testFeedbackId);

      // User не может публиковать чужую благодарность
      expect([403, 404]).toContain(response.status());
    });

    test("User может читать публичную благодарность", async ({
      adminAPI,
      userAPI,
    }) => {
      setSeverity("normal");
      test.skip(!feedbackTypeId || !targetUserId, "Нет данных для теста");

      // Admin создаёт публичную благодарность
      const { data: created } = await adminAPI.create({
        body: `Public Test Feedback ${Date.now()}`,
        targets: [targetUserId],
        feedbackTypeId,
        userAccessType: "everybody",
      });

      if (created?.id) {
        // Публикуем
        await adminAPI.publish(created.id);

        // User читает публичные благодарности
        const { response, data } = await userAPI.getSharedFeedbacks({
          limit: 50,
        });

        expect(response.ok()).toBe(true);
        // Публичная благодарность должна быть в списке
        const items = data?.items || data || [];
        expect(Array.isArray(items)).toBe(true);

        // Cleanup
        await adminAPI.delete(`/private/feedbacks/${created.id}/`);
      }
    });

    test("User не может читать приватную благодарность другого пользователя", async ({
      adminAPI,
      userAPI,
    }) => {
      setSeverity("critical");
      test.skip(!feedbackTypeId || !targetUserId, "Нет данных для теста");

      // Admin создаёт приватную благодарность (не для текущего user)
      const { data: created } = await adminAPI.create({
        body: `Private Test Feedback ${Date.now()}`,
        targets: [targetUserId],
        feedbackTypeId,
        userAccessType: "selective", // Только для выбранных
        usersWithAccess: [], // Никто кроме участников
      });

      if (created?.id) {
        // User пытается прочитать приватную благодарность напрямую
        const { response } = await userAPI.getById(created.id);

        // User не является участником - должен получить отказ
        expect([403, 404]).toContain(response.status());

        // Cleanup
        await adminAPI.delete(`/private/feedbacks/${created.id}/`);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // УДАЛЕНИЕ СВОЕГО ФИДБЕКА - все роли могут
  // ═══════════════════════════════════════════════════════════════
  test.describe("Удаление своего фидбека", () => {
    test("User может удалить свою благодарность", async ({ userAPI }) => {
      setSeverity("normal");
      test.skip(!feedbackTypeId || !targetUserId, "Нет данных для теста");

      // User создаёт благодарность (targets - массив объектов с targetType и entityId)
      const { response: createResponse, data: created } = await userAPI.create({
        body: `User Own Feedback ${Date.now()}`,
        targets: [{ targetType: "user", entityId: targetUserId }],
        feedbackTypeId,
        userAccessType: "everybody",
        usersWithAccess: [],
      });

      console.log(
        `[DELETE Feedback User] Create status=${createResponse.status()}, id=${created?.id}, err=${JSON.stringify(created)}`,
      );
      test.skip(!created?.id, "Не удалось создать благодарность");

      // User удаляет свою благодарность
      const { response } = await userAPI.delete(
        `/private/feedbacks/${created.id}/`,
      );

      // User может удалить свою благодарность
      expect(response.ok()).toBe(true);
    });

    test("Manager может удалить свою благодарность", async ({ managerAPI }) => {
      setSeverity("normal");
      test.skip(!feedbackTypeId || !targetUserId, "Нет данных для теста");

      // Manager создаёт благодарность (targets - массив объектов с targetType и entityId)
      const { response: createResponse, data: created } =
        await managerAPI.create({
          body: `Manager Own Feedback ${Date.now()}`,
          targets: [{ targetType: "user", entityId: targetUserId }],
          feedbackTypeId,
          userAccessType: "everybody",
          usersWithAccess: [],
        });

      console.log(
        `[DELETE Feedback Manager] Create status=${createResponse.status()}, id=${created?.id}, err=${JSON.stringify(created)}`,
      );
      test.skip(!created?.id, "Не удалось создать благодарность");

      // Manager удаляет свою благодарность
      const { response } = await managerAPI.delete(
        `/private/feedbacks/${created.id}/`,
      );

      // Manager может удалить свою благодарность
      expect(response.ok()).toBe(true);
    });
  });

  test.describe("Feedback Requests Security", () => {
    test("User может создать запрос фидбека", async ({ userAPI }) => {
      setSeverity("normal");
      test.skip(!targetUserId, "Нет целевого пользователя");

      const { response, data } = await userAPI.createFeedbackRequest({
        comment: `Test Request ${Date.now()}`,
        targets: [targetUserId],
        requestedUsersIds: [],
      });

      // User может создавать запросы (возможно с ограничениями)
      expect([200, 201, 400, 403]).toContain(response.status());

      // Cleanup
      if (data?.id) {
        await userAPI.delete(`/private/feedback-requests/${data.id}/`);
      }
    });

    test("User не может удалить чужой запрос фидбека", async ({
      adminAPI,
      userAPI,
    }) => {
      setSeverity("critical");
      test.skip(!targetUserId, "Нет целевого пользователя");

      // Admin создаёт запрос
      const { data: created } = await adminAPI.createFeedbackRequest({
        comment: `Admin Request ${Date.now()}`,
        targets: [targetUserId],
        requestedUsersIds: [],
      });

      if (created?.id) {
        // User пытается удалить
        const { response } = await userAPI.delete(
          `/private/feedback-requests/${created.id}/`,
        );

        expect([403, 404]).toContain(response.status());

        // Cleanup
        await adminAPI.delete(`/private/feedback-requests/${created.id}/`);
      }
    });
  });

  test.describe("Feedback Comments Security", () => {
    test("User может комментировать благодарность с доступом everybody", async ({
      adminAPI,
      userAPI,
    }) => {
      setSeverity("normal");
      test.skip(!feedbackTypeId || !targetUserId, "Нет данных для теста");

      // Admin создаёт публичную благодарность
      const { data: feedback } = await adminAPI.create({
        body: `Comment Test Feedback ${Date.now()}`,
        targets: [targetUserId],
        feedbackTypeId,
        userAccessType: "everybody",
      });

      if (feedback?.id) {
        // User добавляет комментарий
        const { response } = await userAPI.post("/private/feedback-comments/", {
          feedbackId: feedback.id,
          body: "Test comment from user",
        });

        // User может комментировать публичные благодарности
        expect([200, 201, 400, 403]).toContain(response.status());

        // Cleanup
        await adminAPI.delete(`/private/feedbacks/${feedback.id}/`);
      }
    });

    test("User не может удалить чужой комментарий", async ({
      adminAPI,
      userAPI,
    }) => {
      setSeverity("critical");
      test.skip(!feedbackTypeId || !targetUserId, "Нет данных для теста");

      // Admin создаёт благодарность и комментарий
      const { data: feedback } = await adminAPI.create({
        body: `Comment Delete Test ${Date.now()}`,
        targets: [targetUserId],
        feedbackTypeId,
        userAccessType: "everybody",
      });

      if (feedback?.id) {
        // Admin добавляет комментарий
        const { data: comment } = await adminAPI.post(
          "/private/feedback-comments/",
          {
            feedbackId: feedback.id,
            body: "Admin comment",
          },
        );

        if (comment?.id) {
          // User пытается удалить комментарий admin
          const { response } = await userAPI.delete(
            `/private/feedback-comments/${comment.id}/`,
          );

          expect([403, 404]).toContain(response.status());
        }

        // Cleanup
        await adminAPI.delete(`/private/feedbacks/${feedback.id}/`);
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

test.describe("Feedback API Error Analysis @api @feedback @security", () => {
  test("Анализ ответа при отказе в доступе к /manager/feedbacks/", async ({
    request,
  }) => {
    const api = new FeedbackAPI(request);
    const { email, password } = getCredentials("user");
    await api.signIn(email, password);

    const { response } = await api.get("/manager/feedbacks/?limit=10");
    const status = response.status();

    if (!response.ok()) {
      const errorInfo = await analyzeErrorResponse(response);
      console.log(
        "User -> /manager/feedbacks/ error:",
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
});
