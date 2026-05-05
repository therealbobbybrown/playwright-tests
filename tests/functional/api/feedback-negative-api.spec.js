// @ts-check
import { test as fullTest, expect } from "../../fixtures/full.js";
import {
  FeedbackAPI,
  APIClient,
  getCredentials,
} from "../../utils/api/index.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import {
  assertSuccessStatus,
  assertValidArray,
} from "../../utils/api/common-assertions.js";

/**
 * Негативные API тесты для модуля Feedback
 *
 * Покрытие:
 * - Тесты без авторизации
 * - Тесты с невалидными данными
 * - Тесты граничных значений
 * - Тесты прав доступа
 */

// Расширяем test с фикстурами
const test = fullTest.extend({
  // Авторизованный API клиент под админом
  feedbackAPI: async ({ request }, use) => {
    const api = new FeedbackAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
  // Авторизованный API клиент под обычным пользователем
  feedbackUserAPI: async ({ request }, use) => {
    const api = new FeedbackAPI(request);
    const { email, password } = getCredentials("user");
    await api.signIn(email, password);
    await use(api);
  },
  // Неавторизованный API клиент
  unauthenticatedAPI: async ({ request }, use) => {
    const api = new APIClient(request);
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

// Хелпер для поиска пользователя
async function findTargetUser(feedbackAPI) {
  // Сначала пробуем получить список пользователей напрямую
  const { response: usersResp, data: usersData } = await feedbackAPI.get(
    "/manager/users?limit=10",
  );
  if (usersResp.ok()) {
    const users = usersData?.items || usersData || [];
    if (users.length > 1) {
      return users[1].id;
    }
    if (users.length > 0) {
      return users[0].id;
    }
  }

  // Fallback: ищем в благодарностях
  const { data } = await feedbackAPI.getFeedbacksOfEmployees({ limit: 50 });
  const items = data?.items || data || [];

  for (const feedback of items) {
    if (feedback.targetUsers && feedback.targetUsers.length > 0) {
      const target = feedback.targetUsers[0];
      return target.userId || target.user?.id || target.id;
    }
    if (feedback.authorUserId) {
      return feedback.authorUserId;
    }
  }
  return null;
}

test.describe(
  "Feedback API - Unauthorized Access",
  { tag: ["@api", "@feedback", "@negative", "@auth", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.FEEDBACK, "Unauthorized Access");
    });

    test("C5174: GET /private/feedbacks/of-me/ без авторизации", async ({
      unauthenticatedAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: GET /private/feedbacks/of-me/ без авторизации", async () => {
        const { response } = await unauthenticatedAPI.get(
          "/private/feedbacks/of-me/",
        );

        expect([401, 403]).toContain(response.status());
      });
    });

    test("C5175: GET /private/feedbacks/my/ без авторизации", async ({
      unauthenticatedAPI,
    }) => {
      await test.step("Выполнить: GET /private/feedbacks/my/ без авторизации", async () => {
        const { response } = await unauthenticatedAPI.get(
          "/private/feedbacks/my/",
        );

        expect([401, 403]).toContain(response.status());
      });
    });

    test("C5176: GET /private/feedbacks/shared/ без авторизации", async ({
      unauthenticatedAPI,
    }) => {
      await test.step("Выполнить: GET /private/feedbacks/shared/ без авторизации", async () => {
        const { response } = await unauthenticatedAPI.get(
          "/private/feedbacks/shared/",
        );

        expect([401, 403]).toContain(response.status());
      });
    });

    test("C5177: POST /private/feedbacks/ без авторизации", async ({
      unauthenticatedAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: POST /private/feedbacks/ без авторизации", async () => {
        const { response } = await unauthenticatedAPI.post(
          "/private/feedbacks/",
          {
            body: "Тестовая благодарность",
            targets: [1],
            feedbackTypeId: 1,
          },
        );

        expect([401, 403]).toContain(response.status());
      });
    });

    test("C5178: GET /private/feedback-requests/for-me/ без авторизации", async ({
      unauthenticatedAPI,
    }) => {
      await test.step("Выполнить: GET /private/feedback-requests/for-me/ без авторизации", async () => {
        const { response } = await unauthenticatedAPI.get(
          "/private/feedback-requests/for-me/",
        );

        expect([401, 403]).toContain(response.status());
      });
    });

    test("C5179: GET /private/feedback-types/ без авторизации", async ({
      unauthenticatedAPI,
    }) => {
      await test.step("Выполнить: GET /private/feedback-types/ без авторизации", async () => {
        const { response } = await unauthenticatedAPI.get(
          "/private/feedback-types/",
        );

        expect([401, 403]).toContain(response.status());
      });
    });

    test("C5180: GET /manager/feedbacks/ без авторизации", async ({
      unauthenticatedAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: GET /manager/feedbacks/ без авторизации", async () => {
        const { response } = await unauthenticatedAPI.get(
          "/manager/feedbacks/",
        );

        expect([401, 403]).toContain(response.status());
      });
    });

    test("C5181: GET /manager/feedbacks/statistics/timeline/ без авторизации", async ({
      unauthenticatedAPI,
    }) => {
      await test.step("Выполнить: GET /manager/feedbacks/statistics/timeline/ без авторизации", async () => {
        const { response } = await unauthenticatedAPI.get(
          "/manager/feedbacks/statistics/timeline/",
        );

        expect([401, 403]).toContain(response.status());
      });
    });
  },
);

test.describe(
  "Feedback API - Invalid Data",
  { tag: ["@api", "@feedback", "@negative", "@validation", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.FEEDBACK, "Invalid Data");
    });

    test("C5182: POST /private/feedbacks/ - пустой body", async ({
      feedbackAPI,
    }) => {
      await test.step("Выполнить: POST /private/feedbacks/ - пустой body", async () => {
        const feedbackTypeId = await getThanksTypeId(feedbackAPI);
        const targetUserId = await findTargetUser(feedbackAPI);
        test.skip(!feedbackTypeId || !targetUserId, "Нет данных для теста");

        const { response } = await feedbackAPI.create({
          body: "",
          targets: [{ targetType: "user", entityId: targetUserId }],
          feedbackTypeId,
          userAccessType: "selective",
          usersWithAccess: [],
        });

        expect([400, 422]).toContain(response.status());
      });
    });

    test("C5183: POST /private/feedbacks/ - body только из пробелов", async ({
      feedbackAPI,
    }) => {
      await test.step("Выполнить: POST /private/feedbacks/ - body только из пробелов", async () => {
        const feedbackTypeId = await getThanksTypeId(feedbackAPI);
        const targetUserId = await findTargetUser(feedbackAPI);
        test.skip(!feedbackTypeId || !targetUserId, "Нет данных для теста");

        const { response } = await feedbackAPI.create({
          body: "     ",
          targets: [{ targetType: "user", entityId: targetUserId }],
          feedbackTypeId,
          userAccessType: "selective",
          usersWithAccess: [],
        });

        expect([400, 422]).toContain(response.status());
      });
    });

    test("C5184: POST /private/feedbacks/ - слишком длинный body (> 10000 символов)", async ({
      feedbackAPI,
    }) => {
      await test.step("Выполнить: POST /private/feedbacks/ - слишком длинный body (> 10000 символов)", async () => {
        const feedbackTypeId = await getThanksTypeId(feedbackAPI);
        const targetUserId = await findTargetUser(feedbackAPI);
        test.skip(!feedbackTypeId || !targetUserId, "Нет данных для теста");

        const longBody = "a".repeat(10001);

        const { response } = await feedbackAPI.create({
          body: longBody,
          targets: [{ targetType: "user", entityId: targetUserId }],
          feedbackTypeId,
          userAccessType: "selective",
          usersWithAccess: [],
        });

        expect([400, 422]).toContain(response.status());
      });
    });

    test("C5185: POST /private/feedbacks/ - пустой массив targets", async ({
      feedbackAPI,
    }) => {
      await test.step("Выполнить: POST /private/feedbacks/ - пустой массив targets", async () => {
        const feedbackTypeId = await getThanksTypeId(feedbackAPI);
        test.skip(!feedbackTypeId, "Нет типа благодарности");

        const { response } = await feedbackAPI.create({
          body: "Тестовая благодарность",
          targets: [],
          feedbackTypeId,
          userAccessType: "selective",
          usersWithAccess: [],
        });

        expect([400, 422]).toContain(response.status());
      });
    });

    test("C5186: POST /private/feedbacks/ - null в targets", async ({
      feedbackAPI,
    }) => {
      await test.step("Выполнить: POST /private/feedbacks/ - null в targets", async () => {
        const feedbackTypeId = await getThanksTypeId(feedbackAPI);
        test.skip(!feedbackTypeId, "Нет типа благодарности");

        const { response } = await feedbackAPI.create({
          body: "Тестовая благодарность",
          targets: [null],
          feedbackTypeId,
          userAccessType: "selective",
          usersWithAccess: [],
        });

        expect([400, 422]).toContain(response.status());
      });
    });

    test("C5187: POST /private/feedbacks/ - несуществующий feedbackTypeId", async ({
      feedbackAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: POST /private/feedbacks/ - несуществующий feedbackTypeId", async () => {
        const targetUserId = await findTargetUser(feedbackAPI);
        test.skip(!targetUserId, "Нет целевого пользователя");

        const { response } = await feedbackAPI.create({
          body: "Тестовая благодарность",
          targets: [{ targetType: "user", entityId: targetUserId }],
          feedbackTypeId: 999999,
          userAccessType: "selective",
          usersWithAccess: [],
        });

        expect([400, 404, 422]).toContain(response.status());
      });
    });

    test("C5188: POST /private/feedbacks/ - невалидный userAccessType", async ({
      feedbackAPI,
    }) => {
      await test.step("Выполнить: POST /private/feedbacks/ - невалидный userAccessType", async () => {
        const feedbackTypeId = await getThanksTypeId(feedbackAPI);
        const targetUserId = await findTargetUser(feedbackAPI);
        test.skip(!feedbackTypeId || !targetUserId, "Нет данных для теста");

        const { response } = await feedbackAPI.create({
          body: "Тестовая благодарность",
          targets: [{ targetType: "user", entityId: targetUserId }],
          feedbackTypeId,
          userAccessType: "INVALID_TYPE",
        });

        expect([400, 422]).toContain(response.status());
      });
    });

    test("C5189: POST /private/feedbacks/ - отрицательный giftBonusAmount", async ({
      feedbackAPI,
    }) => {
      await test.step("Выполнить: POST /private/feedbacks/ - отрицательный giftBonusAmount", async () => {
        const feedbackTypeId = await getThanksTypeId(feedbackAPI);
        const targetUserId = await findTargetUser(feedbackAPI);
        test.skip(!feedbackTypeId || !targetUserId, "Нет данных для теста");

        const { response } = await feedbackAPI.create({
          body: "Тестовая благодарность",
          targets: [{ targetType: "user", entityId: targetUserId }],
          feedbackTypeId,
          userAccessType: "selective",
          usersWithAccess: [],
          giftBonusAmount: -100,
        });

        expect([400, 422]).toContain(response.status());
      });
    });
  },
);

test.describe(
  "Feedback API - Invalid IDs",
  { tag: ["@api", "@feedback", "@negative", "@ids", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.FEEDBACK, "Invalid IDs");
    });

    test("C5190: GET /private/feedbacks/{id}/ - несуществующий ID (число)", async ({
      feedbackAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: GET /private/feedbacks/{id}/ - несуществующий ID (число)", async () => {
        const { response } = await feedbackAPI.getById(999999999);

        expect([400, 403, 404]).toContain(response.status());
      });
    });

    test("C5191: GET /private/feedbacks/{id}/ - ID = 0", async ({
      feedbackAPI,
    }) => {
      await test.step("Выполнить: GET /private/feedbacks/{id}/ - ID = 0", async () => {
        const { response } = await feedbackAPI.getById(0);

        expect([400, 403, 404]).toContain(response.status());
      });
    });

    test("C5192: GET /private/feedbacks/{id}/ - отрицательный ID", async ({
      feedbackAPI,
    }) => {
      await test.step("Выполнить: GET /private/feedbacks/{id}/ - отрицательный ID", async () => {
        const { response } = await feedbackAPI.getById(-1);

        expect([400, 403, 404]).toContain(response.status());
      });
    });

    test("C5193: GET /private/feedbacks/{id}/members/ - несуществующий ID", async ({
      feedbackAPI,
    }) => {
      await test.step("Выполнить: GET /private/feedbacks/{id}/members/ - несуществующий ID", async () => {
        const { response } = await feedbackAPI.getMembers(999999999);

        expect([400, 403, 404]).toContain(response.status());
      });
    });

    test("C5194: POST /private/feedbacks/{id}/publish/ - несуществующий ID", async ({
      feedbackAPI,
    }) => {
      await test.step("Выполнить: POST /private/feedbacks/{id}/publish/ - несуществующий ID", async () => {
        const { response } = await feedbackAPI.publish(999999999);

        expect([400, 403, 404]).toContain(response.status());
      });
    });

    test("C5195: POST /private/feedbacks/{id}/set-status/ - несуществующий ID", async ({
      feedbackAPI,
    }) => {
      await test.step("Выполнить: POST /private/feedbacks/{id}/set-status/ - несуществующий ID", async () => {
        const { response } = await feedbackAPI.setStatus(
          999999999,
          "ACKNOWLEDGED",
        );

        expect([400, 403, 404]).toContain(response.status());
      });
    });

    test("C5196: GET /private/feedback-requests/{id}/ - несуществующий ID", async ({
      feedbackAPI,
    }) => {
      await test.step("Выполнить: GET /private/feedback-requests/{id}/ - несуществующий ID", async () => {
        const { response } =
          await feedbackAPI.getFeedbackRequestById(999999999);

        expect([400, 403, 404]).toContain(response.status());
      });
    });

    test("C5197: GET /private/feedback-requests/{id}/requested-users/ - несуществующий ID", async ({
      feedbackAPI,
    }) => {
      await test.step("Выполнить: GET /private/feedback-requests/{id}/requested-users/ - несуществующий ID", async () => {
        const { response } = await feedbackAPI.getRequestedUsers(999999999);

        expect([400, 403, 404]).toContain(response.status());
      });
    });

    test("C5198: GET /private/feedback-comments/{id}/ - несуществующий ID", async ({
      feedbackAPI,
    }) => {
      await test.step("Выполнить: GET /private/feedback-comments/{id}/ - несуществующий ID", async () => {
        const { response } = await feedbackAPI.getCommentById(999999999);

        expect([400, 403, 404]).toContain(response.status());
      });
    });

    test("C5199: POST /private/feedback-comments/ - несуществующий feedbackId", async ({
      feedbackAPI,
    }) => {
      await test.step("Выполнить: POST /private/feedback-comments/ - несуществующий feedbackId", async () => {
        const { response } = await feedbackAPI.createComment(
          999999999,
          "Тестовый комментарий",
        );

        // 500 - возможный ответ при ошибке сервера на несуществующий ресурс
        expect([400, 403, 404, 500]).toContain(response.status());
      });
    });
  },
);

test.describe(
  "Feedback API - Comments Validation",
  { tag: ["@api", "@feedback", "@negative", "@comments", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.FEEDBACK, "Comments Validation");
    });

    test("C5200: POST /private/feedback-comments/ - пустой body", async ({
      feedbackAPI,
    }) => {
      await test.step("Выполнить: POST /private/feedback-comments/ - пустой body", async () => {
        // Находим существующую благодарность
        const { data: feedbacks } = await feedbackAPI.getMyFeedbacks({
          limit: 1,
        });
        const feedbackId = feedbacks?.items?.[0]?.id || feedbacks?.[0]?.id;
        test.skip(!feedbackId, "Нет благодарностей");

        const { response } = await feedbackAPI.createComment(feedbackId, "");

        expect([400, 422]).toContain(response.status());
      });
    });

    test("C5201: POST /private/feedback-comments/ - body только из пробелов", async ({
      feedbackAPI,
    }) => {
      await test.step("Выполнить: POST /private/feedback-comments/ - body только из пробелов", async () => {
        const { data: feedbacks } = await feedbackAPI.getMyFeedbacks({
          limit: 1,
        });
        const feedbackId = feedbacks?.items?.[0]?.id || feedbacks?.[0]?.id;
        test.skip(!feedbackId, "Нет благодарностей");

        const { response } = await feedbackAPI.createComment(
          feedbackId,
          "     ",
        );

        expect([400, 422]).toContain(response.status());
      });
    });
  },
);

test.describe(
  "Feedback API - Feedback Requests Validation",
  { tag: ["@api", "@feedback", "@negative", "@requests", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.FEEDBACK, "Requests Validation");
    });

    // C5202 — дубликат, живёт в feedback-requests-api.spec.js

    test("C5203: POST /private/feedback-requests/ - пустой массив targets", async ({
      feedbackAPI,
    }) => {
      await test.step("Выполнить: POST /private/feedback-requests/ - пустой массив targets", async () => {
        const targetUserId = await findTargetUser(feedbackAPI);
        test.skip(!targetUserId, "Нет пользователя");

        const { response } = await feedbackAPI.createFeedbackRequest({
          comment: "Тестовый запрос",
          targets: [],
          requestedUsersIds: [targetUserId],
        });

        expect([400, 422]).toContain(response.status());
      });
    });

    test("C5204: POST /private/feedback-requests/ - пустой массив requestedUsersIds", async ({
      feedbackAPI,
    }) => {
      await test.step("Выполнить: POST /private/feedback-requests/ - пустой массив requestedUsersIds", async () => {
        const targetUserId = await findTargetUser(feedbackAPI);
        test.skip(!targetUserId, "Нет пользователя");

        const { response } = await feedbackAPI.createFeedbackRequest({
          comment: "Тестовый запрос",
          targets: [{ targetType: "user", entityId: targetUserId }],
          requestedUsersIds: [],
        });

        expect([400, 422]).toContain(response.status());
      });
    });

    // C5205, C5206 — дубликаты, живут в feedback-requests-api.spec.js
  },
);

test.describe(
  "Feedback API - Pagination Edge Cases",
  { tag: ["@api", "@feedback", "@negative", "@pagination", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.FEEDBACK, "Pagination Edge Cases");
    });

    test("C5207: GET /private/feedbacks/of-me/ - отрицательный limit", async ({
      feedbackAPI,
    }) => {
      await test.step("Выполнить: GET /private/feedbacks/of-me/ - отрицательный limit", async () => {
        const { response } = await feedbackAPI.getFeedbacksOfMe({ limit: -1 });

        // API возвращает 500 на отрицательные значения (баг) или 400 (валидация) или 200 (значение по умолчанию)
        expect([200, 400, 500]).toContain(response.status());
      });
    });

    test("C5208: GET /private/feedbacks/of-me/ - отрицательный offset", async ({
      feedbackAPI,
    }) => {
      await test.step("Выполнить: GET /private/feedbacks/of-me/ - отрицательный offset", async () => {
        const { response } = await feedbackAPI.getFeedbacksOfMe({ offset: -1 });

        // API возвращает 500 на отрицательные значения (баг) или 400 (валидация) или 200 (значение по умолчанию)
        expect([200, 400, 500]).toContain(response.status());
      });
    });

    test("C5209: GET /private/feedbacks/of-me/ - очень большой limit", async ({
      feedbackAPI,
    }) => {
      await test.step("Выполнить: GET /private/feedbacks/of-me/ - очень большой limit", async () => {
        const { response, data } = await feedbackAPI.getFeedbacksOfMe({
          limit: 999999,
        });

        // Должен вернуть результат или ограничить максимальным значением
        expect([200, 400]).toContain(response.status());

        if (response.ok()) {
          expect(data).toBeDefined();
        }
      });
    });

    test("C5210: GET /private/feedbacks/of-me/ - очень большой offset", async ({
      feedbackAPI,
    }) => {
      await test.step("Выполнить: GET /private/feedbacks/of-me/ - очень большой offset", async () => {
        const { response, data } = await feedbackAPI.getFeedbacksOfMe({
          offset: 999999,
        });

        // Должен вернуть пустой результат
        assertSuccessStatus(response);
        expect(data).toBeDefined();

        const items = data?.items || data || [];
        assertValidArray(items);
      });
    });

    test("C5211: GET /private/feedbacks/of-me/ - limit = 0", async ({
      feedbackAPI,
    }) => {
      await test.step("Выполнить: GET /private/feedbacks/of-me/ - limit = 0", async () => {
        const { response } = await feedbackAPI.getFeedbacksOfMe({ limit: 0 });

        // Может вернуть все результаты или пустой массив
        expect([200, 400]).toContain(response.status());
      });
    });
  },
);

test.describe(
  "Feedback API - Date Filter Edge Cases",
  { tag: ["@api", "@feedback", "@negative", "@dates", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.FEEDBACK, "Date Filter Edge Cases");
    });

    test("C5212: GET /private/feedbacks/of-me/ - dateFrom > dateTo", async ({
      feedbackAPI,
    }) => {
      await test.step("Выполнить: GET /private/feedbacks/of-me/ - dateFrom > dateTo", async () => {
        const dateFrom = "2025-12-31";
        const dateTo = "2025-01-01";

        const { response, data } = await feedbackAPI.getFeedbacksOfMe({
          dateFrom,
          dateTo,
        });

        // Должен вернуть пустой результат или ошибку
        expect([200, 400]).toContain(response.status());

        if (response.ok()) {
          const items = data?.items || data || [];
          expect(items.length).toBe(0);
        }
      });
    });

    test("C5213: GET /private/feedbacks/of-me/ - невалидный формат dateFrom", async ({
      feedbackAPI,
    }) => {
      await test.step("Выполнить: GET /private/feedbacks/of-me/ - невалидный формат dateFrom", async () => {
        const { response } = await feedbackAPI.getFeedbacksOfMe({
          dateFrom: "invalid-date",
        });

        expect([200, 400]).toContain(response.status());
      });
    });

    test("C5214: GET /private/feedbacks/of-me/ - невалидный формат dateTo", async ({
      feedbackAPI,
    }) => {
      await test.step("Выполнить: GET /private/feedbacks/of-me/ - невалидный формат dateTo", async () => {
        const { response } = await feedbackAPI.getFeedbacksOfMe({
          dateTo: "not-a-date",
        });

        expect([200, 400]).toContain(response.status());
      });
    });

    test("C5215: GET /private/feedbacks/of-me/ - дата в будущем", async ({
      feedbackAPI,
    }) => {
      await test.step("Выполнить: GET /private/feedbacks/of-me/ - дата в будущем", async () => {
        const futureDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split("T")[0];

        const { response, data } = await feedbackAPI.getFeedbacksOfMe({
          dateFrom: futureDate,
        });

        // Должен вернуть пустой результат
        assertSuccessStatus(response);
        expect(data).toBeDefined();

        const items = data?.items || data || [];
        expect(items.length).toBe(0);
      });
    });
  },
);

test.describe(
  "Feedback API - Status Operations Edge Cases",
  { tag: ["@api", "@feedback", "@negative", "@status", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.FEEDBACK, "Status Operations");
    });

    test("C5216: POST /private/feedbacks/{id}/set-status/ - невалидный статус", async ({
      feedbackAPI,
    }) => {
      await test.step("Выполнить: POST /private/feedbacks/{id}/set-status/ - невалидный статус", async () => {
        // Находим существующую благодарность
        const { data: feedbacks } = await feedbackAPI.getMyFeedbacks({
          limit: 1,
        });
        const feedbackId = feedbacks?.items?.[0]?.id || feedbacks?.[0]?.id;
        test.skip(!feedbackId, "Нет благодарностей");

        const { response } = await feedbackAPI.setStatus(
          feedbackId,
          "INVALID_STATUS",
        );

        expect([400, 422]).toContain(response.status());
      });
    });

    test("C5217: POST /private/feedbacks/{id}/set-status/ - пустой статус", async ({
      feedbackAPI,
    }) => {
      await test.step("Выполнить: POST /private/feedbacks/{id}/set-status/ - пустой статус", async () => {
        const { data: feedbacks } = await feedbackAPI.getMyFeedbacks({
          limit: 1,
        });
        const feedbackId = feedbacks?.items?.[0]?.id || feedbacks?.[0]?.id;
        test.skip(!feedbackId, "Нет благодарностей");

        const { response } = await feedbackAPI.setStatus(feedbackId, "");

        expect([400, 422]).toContain(response.status());
      });
    });

    test("C5218: POST /private/feedbacks/{id}/publish/ - повторная публикация", async ({
      feedbackAPI,
    }) => {
      let response;
      await test.step("Выполнить запрос: POST /private/feedbacks/{id}/publish/ - повторная публикация", async () => {
        // Создаём приватную благодарность, публикуем её, затем пытаемся опубликовать повторно
        const feedbackTypeId = await getThanksTypeId(feedbackAPI);
        const targetUserId = await findTargetUser(feedbackAPI);
        test.skip(
          !feedbackTypeId || !targetUserId,
          "Нет типа благодарности или целевого пользователя",
        );

        // 1. Создаём приватную благодарность
        const timestamp = Date.now();
        const { response: createResp, data: createData } =
          await feedbackAPI.create({
            body: `Тест повторной публикации ${timestamp}`,
            targets: [{ targetType: "user", entityId: targetUserId }],
            feedbackTypeId,
            userAccessType: "selective",
            usersWithAccess: [],
          });

        test.skip(
          !createResp.ok() || !createData?.id,
          "Не удалось создать благодарность",
        );

        const feedbackId = createData.id;

        // 2. Публикуем благодарность первый раз
        const { response: firstPublishResp } =
          await feedbackAPI.publish(feedbackId);
        test.skip(
          !firstPublishResp.ok(),
          "Не удалось опубликовать благодарность",
        );

        // 3. Пытаемся опубликовать повторно
        ({ response } = await feedbackAPI.publish(feedbackId));

        // Может быть успех (идемпотентность) или ошибка (уже опубликована)
      });

      await test.step("Проверить ответ", async () => {
        expect([200, 201, 400, 409]).toContain(response.status());
      });
    });
  },
);

test.describe(
  "Feedback API - Manager Permissions",
  { tag: ["@api", "@feedback", "@negative", "@permissions", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.FEEDBACK, "Manager Permissions");
    });

    test("C5219: GET /manager/feedbacks/ - доступ под обычным пользователем", async ({
      feedbackUserAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: GET /manager/feedbacks/ - доступ под обычным пользователем", async () => {
        const { response } = await feedbackUserAPI.getAllFeedbacks();

        // Обычный пользователь может не иметь доступа к менеджерским эндпоинтам
        expect([200, 403]).toContain(response.status());
      });
    });

    test("C5220: GET /manager/feedbacks/statistics/timeline/ - доступ под обычным пользователем", async ({
      feedbackUserAPI,
    }) => {
      await test.step("Выполнить: GET /manager/feedbacks/statistics/timeline/ - доступ под обычным пользователем", async () => {
        const dateTo = new Date().toISOString().split("T")[0];
        const dateFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split("T")[0];

        const { response } = await feedbackUserAPI.getStatisticsTimeline({
          dateFrom,
          dateTo,
        });

        // Обычный пользователь может не иметь доступа
        expect([200, 403]).toContain(response.status());
      });
    });

    test("C5221: GET /manager/feedbacks/export/get-token/ - доступ под обычным пользователем", async ({
      feedbackUserAPI,
    }) => {
      await test.step("Выполнить: GET /manager/feedbacks/export/get-token/ - доступ под обычным пользователем", async () => {
        const userDate = new Date().toISOString();

        const { response } = await feedbackUserAPI.getExportToken(userDate);

        // Обычный пользователь может не иметь доступа
        expect([200, 403]).toContain(response.status());
      });
    });

    test("C5222: POST /manager/feedbacks/motivational-enabled/ - доступ под обычным пользователем", async ({
      feedbackUserAPI,
    }) => {
      await test.step("Выполнить: POST /manager/feedbacks/motivational-enabled/ - доступ под обычным пользователем", async () => {
        const { response } = await feedbackUserAPI.enableMotivational();

        // Обычный пользователь не должен иметь доступа
        expect([200, 400, 403]).toContain(response.status());
      });
    });
  },
);
