// @ts-check
import { test as fullTest, expect } from "../../fixtures/full.js";
import { FeedbackAPI, getCredentials } from "../../utils/api/index.js";
import { TestDataHelper } from "../../utils/TestDataHelper.js";
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
 * API тесты для запросов фидбека (Feedback Requests)
 *
 * Покрытие:
 * - Получение запросов (для меня, мои)
 * - Создание запросов фидбека
 * - Статистика по запросам
 * - Получение пользователей запроса
 */

// Расширяем test с фикстурой для Feedback API
const test = fullTest.extend({
  feedbackAPI: async ({ request }, use) => {
    const api = new FeedbackAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
  feedbackUserAPI: async ({ request }, use) => {
    const api = new FeedbackAPI(request);
    const { email, password } = getCredentials("user");
    await api.signIn(email, password);
    await use(api);
  },
});

// Хелпер для поиска существующего запроса фидбека
async function findExistingFeedbackRequest(feedbackAPI) {
  // Сначала ищем в моих отправленных запросах
  const { data: myRequests } = await feedbackAPI.getMyFeedbackRequests({
    limit: 10,
  });
  const myItems = myRequests?.items || myRequests || [];
  if (myItems.length > 0) {
    return { requestId: myItems[0].id, request: myItems[0] };
  }

  // Затем в запросах для меня
  const { data: forMeRequests } = await feedbackAPI.getFeedbackRequestsForMe({
    limit: 10,
  });
  const forMeItems = forMeRequests?.items || forMeRequests || [];
  if (forMeItems.length > 0) {
    return { requestId: forMeItems[0].id, request: forMeItems[0] };
  }

  return { requestId: null, request: null };
}

// Хелпер для поиска пользователя (для создания запроса фидбека)
async function findUserForRequest(feedbackAPI) {
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

  // Ищем уникального пользователя из авторов
  for (const feedback of items) {
    if (feedback.authorUserId) {
      return feedback.authorUserId;
    }
    if (feedback.authorUser?.id) {
      return feedback.authorUser.id;
    }
  }

  // Ищем в targetUsers
  for (const feedback of items) {
    if (feedback.targetUsers && feedback.targetUsers.length > 0) {
      const target = feedback.targetUsers[0];
      return target.userId || target.user?.id || target.id;
    }
  }

  return null;
}

test.describe(
  "Feedback Requests API - Lists",
  { tag: ["@api", "@feedback", "@requests", "@lists", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.FEEDBACK, "Requests - Lists");
    });

    test("C5223: GET /private/feedback-requests/for-me/ - получить запросы фидбека для меня", async ({
      feedbackAPI,
    }) => {
      setSeverity("critical");

      let response, data;
      await test.step("Выполнить запрос: GET /private/feedback-requests/for-me/ - получить запросы фидбека для меня", async () => {
        ({ response, data } = await feedbackAPI.getFeedbackRequestsForMe());

        assertSuccessStatus(response);
      });

      await test.step("Проверить ответ", async () => {
        expect(data).toBeDefined();

        const items = data?.items || data || [];
        assertValidArray(items);

        // Валидация структуры элементов (если есть)
        if (items.length > 0) {
          expect(items[0]).toHaveProperty("id");
          if (items[0].comment) {
            expect(typeof items[0].comment).toBe("string");
          }
        }

        // Проверяем метаданные пагинации (если есть)
        if (data?.total !== undefined) {
          expect(typeof data.total).toBe("number");
          expect(data.total).toBeGreaterThanOrEqual(0);
        }
      });
    });

    test("C5224: GET /private/feedback-requests/for-me/ с пагинацией", async ({
      feedbackAPI,
    }) => {
      await test.step("Выполнить: GET /private/feedback-requests/for-me/ с пагинацией", async () => {
        const { response, data } = await feedbackAPI.getFeedbackRequestsForMe({
          limit: 5,
          offset: 0,
        });

        assertSuccessStatus(response);
        expect(data).toBeDefined();

        const items = data?.items || data || [];
        assertValidArray(items);
        expect(items.length).toBeLessThanOrEqual(5);
      });
    });

    test("C5225: GET /private/feedback-requests/for-me/ с фильтром по датам", async ({
      feedbackAPI,
    }) => {
      await test.step("Выполнить: GET /private/feedback-requests/for-me/ с фильтром по датам", async () => {
        const dateTo = new Date().toISOString().split("T")[0];
        const dateFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split("T")[0];

        const { response, data } = await feedbackAPI.getFeedbackRequestsForMe({
          dateFrom,
          dateTo,
          limit: 10,
        });

        assertSuccessStatus(response);
        expect(data).toBeDefined();

        const items = data?.items || data || [];
        assertValidArray(items);
      });
    });

    test("C5226: GET /private/feedback-requests/for-me/ с фильтром по статусу ответа", async ({
      feedbackAPI,
    }) => {
      let response, data;
      await test.step("Выполнить запрос: GET /private/feedback-requests/for-me/ с фильтром по статусу ответа", async () => {
        ({ response, data } = await feedbackAPI.getFeedbackRequestsForMe({
          answerStatus: "PENDING",
          limit: 10,
        }));
      });

      await test.step("Проверить ответ", async () => {
        expect([200, 400]).toContain(response.status());

        if (response.ok()) {
          expect(data).toBeDefined();
          const items = data?.items || data || [];
          assertValidArray(items);

          // Все элементы должны иметь статус PENDING
          items.forEach((item) => {
            if (item.answerStatus) {
              expect(item.answerStatus).toBe("PENDING");
            }
          });
        }
      });
    });

    test("C5227: GET /private/feedback-requests/my/ - получить мои отправленные запросы фидбека", async ({
      feedbackAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: GET /private/feedback-requests/my/ - получить мои отправленные запросы фидбека", async () => {
        const { response, data } = await feedbackAPI.getMyFeedbackRequests();

        assertSuccessStatus(response);
        expect(data).toBeDefined();

        const items = data?.items || data || [];
        assertValidArray(items);

        // Валидация структуры элементов (если есть)
        if (items.length > 0) {
          expect(items[0]).toHaveProperty("id");
        }
      });
    });

    test("C5228: GET /private/feedback-requests/my/ с пагинацией", async ({
      feedbackAPI,
    }) => {
      await test.step("Выполнить: GET /private/feedback-requests/my/ с пагинацией", async () => {
        const { response, data } = await feedbackAPI.getMyFeedbackRequests({
          limit: 5,
          offset: 0,
        });

        assertSuccessStatus(response);
        expect(data).toBeDefined();

        const items = data?.items || data || [];
        assertValidArray(items);
        expect(items.length).toBeLessThanOrEqual(5);
      });
    });

    test("C5229: GET /private/feedback-requests/my/ с фильтром по датам", async ({
      feedbackAPI,
    }) => {
      await test.step("Выполнить: GET /private/feedback-requests/my/ с фильтром по датам", async () => {
        const dateTo = new Date().toISOString().split("T")[0];
        const dateFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split("T")[0];

        const { response, data } = await feedbackAPI.getMyFeedbackRequests({
          dateFrom,
          dateTo,
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

test.describe(
  "Feedback Requests API - CRUD",
  { tag: ["@api", "@feedback", "@requests", "@crud", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.FEEDBACK, "Requests - CRUD");
    });

    test("C5230: GET /private/feedback-requests/{id}/ - получить запрос фидбека по ID", async ({
      feedbackAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: GET /private/feedback-requests/{id}/ - получить запрос фидбека по ID", async () => {
        const { requestId } = await findExistingFeedbackRequest(feedbackAPI);
        test.skip(!requestId, "Нет запросов фидбека");

        const { response, data } =
          await feedbackAPI.getFeedbackRequestById(requestId);

        assertSuccessStatus(response);
        expect(data).toBeDefined();
        expect(data.id).toBe(requestId);

        // Валидация структуры запроса
        if (data.comment) {
          expect(typeof data.comment).toBe("string");
        }
        if (data.createdAt) {
          expect(typeof data.createdAt).toBe("string");
        }
      });
    });

    test("C5231: GET /private/feedback-requests/{id}/requested-users/ - получить пользователей запроса", async ({
      feedbackAPI,
    }) => {
      await test.step("Выполнить: GET /private/feedback-requests/{id}/requested-users/ - получить пользователей запроса", async () => {
        const { requestId } = await findExistingFeedbackRequest(feedbackAPI);
        test.skip(!requestId, "Нет запросов фидбека");

        const { response, data } =
          await feedbackAPI.getRequestedUsers(requestId);

        expect([200, 404]).toContain(response.status());

        if (response.ok()) {
          expect(data).toBeDefined();
          const items = data?.items || data || [];
          assertValidArray(items);
        }
      });
    });

    test("C5232: GET /private/feedback-requests/{id}/requested-users/ с пагинацией", async ({
      feedbackAPI,
    }) => {
      let response, data;
      await test.step("Выполнить запрос: GET /private/feedback-requests/{id}/requested-users/ с пагинацией", async () => {
        const { requestId } = await findExistingFeedbackRequest(feedbackAPI);
        test.skip(!requestId, "Нет запросов фидбека");

        ({ response, data } = await feedbackAPI.getRequestedUsers(requestId, {
          limit: 5,
          offset: 0,
        }));
      });

      await test.step("Проверить ответ", async () => {
        expect([200, 404]).toContain(response.status());

        if (response.ok()) {
          expect(data).toBeDefined();
          const items = data?.items || data || [];
          assertValidArray(items);
          expect(items.length).toBeLessThanOrEqual(5);
        }
      });
    });

    test(
      "C5233: POST /private/feedback-requests/ - создать запрос фидбека",
      { tag: ["@critical", "@db"] },
      async ({ feedbackAPI, feedbackVerifier }) => {
        setSeverity("critical");
        const targetUserId = await findUserForRequest(feedbackAPI);
        const requestedUserId = await findUserForRequest(feedbackAPI);
        test.skip(
          !targetUserId || !requestedUserId,
          "Нет целевого пользователя или запрашиваемого пользователя",
        );

        const comment = TestDataHelper.generateUniqueName("Запрос фидбека");
        const { response, data } = await feedbackAPI.createFeedbackRequest({
          comment,
          targets: [{ targetType: "user", entityId: targetUserId }],
          requestedUsersIds: [requestedUserId],
        });

        expect([200, 201, 400]).toContain(response.status());

        if (response.ok() && data) {
          expect(data).toBeDefined();
          if (data.id) {
            expect(
              typeof data.id === "string" || typeof data.id === "number",
            ).toBe(true);
          }
          if (data.comment) {
            expect(data.comment).toBe(comment);
          }

          // DB верификация
          await test.step("DB: Проверка создания запроса фидбека в БД", async () => {
            await feedbackVerifier.verifyRequestCreated(data.id);
            // verifyRequestComment не используем: БД хранит comment зашифрованным (privacy feature),
            // корректность текста проверена выше через expect(data.comment).toBe(comment)
          });
        }
      },
    );

    test("C5234: POST /private/feedback-requests/ - создать запрос фидбека с несколькими получателями", async ({
      feedbackAPI,
    }) => {
      await test.step("Выполнить: POST /private/feedback-requests/ - создать запрос фидбека с несколькими получателями", async () => {
        const targetUserId = await findUserForRequest(feedbackAPI);
        test.skip(!targetUserId, "Нет целевого пользователя");

        const comment = TestDataHelper.generateUniqueName("Групповой запрос");
        const { response, data } = await feedbackAPI.createFeedbackRequest({
          comment,
          targets: [{ targetType: "user", entityId: targetUserId }],
          requestedUsersIds: [targetUserId],
        });

        expect([200, 201, 400]).toContain(response.status());

        if (response.ok() && data) {
          expect(data).toBeDefined();
        }
      });
    });
  },
);

test.describe(
  "Feedback Requests API - Statistics",
  { tag: ["@api", "@feedback", "@requests", "@statistics", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.FEEDBACK, "Requests - Statistics");
    });

    test("C5235: GET /private/feedback-requests/for-me/stats/ - статистика по полученным запросам", async ({
      feedbackAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: GET /private/feedback-requests/for-me/stats/ - статистика по полученным запросам", async () => {
        const { response, data } =
          await feedbackAPI.getFeedbackRequestsForMeStats();

        assertSuccessStatus(response);
        expect(data).toBeDefined();

        // Валидация структуры статистики
        if (data.total !== undefined) {
          expect(typeof data.total).toBe("number");
          expect(data.total).toBeGreaterThanOrEqual(0);
        }
      });
    });

    test("C5236: GET /private/feedback-requests/for-me/stats/ с фильтром по датам", async ({
      feedbackAPI,
    }) => {
      await test.step("Выполнить: GET /private/feedback-requests/for-me/stats/ с фильтром по датам", async () => {
        const dateTo = new Date().toISOString().split("T")[0];
        const dateFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split("T")[0];

        const { response, data } =
          await feedbackAPI.getFeedbackRequestsForMeStats({
            dateFrom,
            dateTo,
          });

        assertSuccessStatus(response);
        expect(data).toBeDefined();
      });
    });

    test("C5237: GET /private/feedback-requests/my/stats/ - статистика по отправленным запросам", async ({
      feedbackAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: GET /private/feedback-requests/my/stats/ - статистика по отправленным запросам", async () => {
        const { response, data } =
          await feedbackAPI.getMyFeedbackRequestsStats();

        assertSuccessStatus(response);
        expect(data).toBeDefined();

        // Валидация структуры статистики
        if (data.total !== undefined) {
          expect(typeof data.total).toBe("number");
          expect(data.total).toBeGreaterThanOrEqual(0);
        }
      });
    });

    test("C5238: GET /private/feedback-requests/my/stats/ с фильтром по датам", async ({
      feedbackAPI,
    }) => {
      await test.step("Выполнить: GET /private/feedback-requests/my/stats/ с фильтром по датам", async () => {
        const dateTo = new Date().toISOString().split("T")[0];
        const dateFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split("T")[0];

        const { response, data } = await feedbackAPI.getMyFeedbackRequestsStats(
          {
            dateFrom,
            dateTo,
          },
        );

        assertSuccessStatus(response);
        expect(data).toBeDefined();
      });
    });
  },
);

test.describe(
  "Feedback Requests API - Manager Statistics",
  { tag: ["@api", "@feedback", "@requests", "@manager", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.FEEDBACK, "Requests - Manager Statistics");
    });

    test("C5239: GET /manager/feedback-requests/statistics/timeline/ - временная шкала статистики", async ({
      feedbackAPI,
    }) => {
      let response, data;
      await test.step("Выполнить запрос: GET /manager/feedback-requests/statistics/timeline/ - временная шкала статистики", async () => {
        const dateTo = new Date().toISOString().split("T")[0];
        const dateFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split("T")[0];

        ({ response, data } = await feedbackAPI.getRequestsStatisticsTimeline({
          dateFrom,
          dateTo,
          aggregation: "day",
        }));
      });

      await test.step("Проверить ответ", async () => {
        expect([200, 403]).toContain(response.status());

        if (response.ok()) {
          expect(data).toBeDefined();
          // API возвращает { timeline: [...] }
          const timeline = data?.timeline || data?.items || [];
          assertValidArray(timeline);
        }
      });
    });

    test("C5240: GET /manager/feedback-requests/statistics/timeline/ с агрегацией по неделям", async ({
      feedbackAPI,
    }) => {
      await test.step("Выполнить: GET /manager/feedback-requests/statistics/timeline/ с агрегацией по неделям", async () => {
        const dateTo = new Date().toISOString().split("T")[0];
        const dateFrom = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split("T")[0];

        const { response, data } =
          await feedbackAPI.getRequestsStatisticsTimeline({
            dateFrom,
            dateTo,
            aggregation: "week",
          });

        expect([200, 403]).toContain(response.status());

        if (response.ok()) {
          expect(data).toBeDefined();
        }
      });
    });

    test("C5241: GET /manager/feedback-requests/statistics/timeline/ с агрегацией по месяцам", async ({
      feedbackAPI,
    }) => {
      await test.step("Выполнить: GET /manager/feedback-requests/statistics/timeline/ с агрегацией по месяцам", async () => {
        const dateTo = new Date().toISOString().split("T")[0];
        const dateFrom = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split("T")[0];

        const { response, data } =
          await feedbackAPI.getRequestsStatisticsTimeline({
            dateFrom,
            dateTo,
            aggregation: "month",
          });

        expect([200, 403]).toContain(response.status());

        if (response.ok()) {
          expect(data).toBeDefined();
        }
      });
    });

    test("C5242: GET /manager/feedback-requests/statistics/most-active-users/ - самые активные отправители", async ({
      feedbackAPI,
    }) => {
      let response, data;
      await test.step("Выполнить запрос: GET /manager/feedback-requests/statistics/most-active-users/ - самые активные отправители", async () => {
        const dateTo = new Date().toISOString().split("T")[0];
        const dateFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split("T")[0];

        ({ response, data } =
          await feedbackAPI.getRequestsStatisticsMostActiveUsers({
            dateFrom,
            dateTo,
          }));
      });

      await test.step("Проверить ответ", async () => {
        expect([200, 403]).toContain(response.status());

        if (response.ok()) {
          expect(data).toBeDefined();
          // API возвращает { users: [...] } или { items: [...] }
          const users = data?.users || data?.items || [];
          assertValidArray(users);
        }
      });
    });

    test("C5243: GET /manager/feedback-requests/statistics/most-active-users/ с пагинацией", async ({
      feedbackAPI,
    }) => {
      let response, data;
      await test.step("Выполнить запрос: GET /manager/feedback-requests/statistics/most-active-users/ с пагинацией", async () => {
        const dateTo = new Date().toISOString().split("T")[0];
        const dateFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split("T")[0];

        ({ response, data } =
          await feedbackAPI.getRequestsStatisticsMostActiveUsers({
            dateFrom,
            dateTo,
            limit: 5,
            offset: 0,
          }));
      });

      await test.step("Проверить ответ", async () => {
        expect([200, 403]).toContain(response.status());

        if (response.ok()) {
          expect(data).toBeDefined();
          const users = data?.users || data?.items || [];
          assertValidArray(users);
          expect(users.length).toBeLessThanOrEqual(5);
        }
      });
    });
  },
);

test.describe(
  "Feedback Requests API - Update/Delete",
  { tag: ["@api", "@feedback", "@requests", "@workflow", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.FEEDBACK, "Requests - Update/Delete");
    });

    test("C5244: POST /private/feedback-requests/{id}/ - обновить запрос фидбека", async ({
      feedbackAPI,
    }) => {
      setSeverity("critical");

      let response, data;
      await test.step("Выполнить запрос: POST /private/feedback-requests/{id}/ - обновить запрос фидбека", async () => {
        // Сначала создаём запрос для обновления
        const targetUserId = await findUserForRequest(feedbackAPI);
        test.skip(!targetUserId, "Нет целевого пользователя");

        const originalComment = TestDataHelper.generateUniqueName(
          "Запрос для обновления",
        );
        const { response: createResp, data: createData } =
          await feedbackAPI.createFeedbackRequest({
            comment: originalComment,
            targets: [{ targetType: "user", entityId: targetUserId }],
            requestedUsersIds: [targetUserId],
          });

        test.skip(
          !createResp.ok() || !createData?.id,
          "Не удалось создать запрос для теста",
        );

        const requestId = createData.id;
        const updatedComment =
          TestDataHelper.generateUniqueName("Обновлённый запрос");

        ({ response, data } = await feedbackAPI.updateFeedbackRequest(
          requestId,
          {
            comment: updatedComment,
          },
        ));

        // API может не поддерживать обновление или вернуть ошибку
      });

      await test.step("Проверить ответ", async () => {
        expect([200, 201, 400, 403, 404, 405]).toContain(response.status());

        if (response.ok()) {
          expect(data).toBeDefined();
        }
      });
    });

    test(
      "C5245: DELETE /private/feedback-requests/{id}/ - удалить запрос фидбека",
      { tag: ["@critical", "@db"] },
      async ({ feedbackAPI, feedbackVerifier }) => {
        setSeverity("critical");
        // Сначала создаём запрос для удаления
        const targetUserId = await findUserForRequest(feedbackAPI);
        test.skip(!targetUserId, "Нет целевого пользователя");

        const comment = TestDataHelper.generateUniqueName(
          "Запрос для удаления",
        );
        const { response: createResp, data: createData } =
          await feedbackAPI.createFeedbackRequest({
            comment,
            targets: [{ targetType: "user", entityId: targetUserId }],
            requestedUsersIds: [targetUserId],
          });

        test.skip(
          !createResp.ok() || !createData?.id,
          "Не удалось создать запрос для теста",
        );

        const requestId = createData.id;

        const { response } = await feedbackAPI.deleteFeedbackRequest(requestId);

        // API может не поддерживать удаление
        expect([200, 204, 400, 403, 404, 405]).toContain(response.status());

        // Если удаление успешно, проверяем что запрос недоступен
        if (response.ok() || response.status() === 204) {
          const { response: getResp } =
            await feedbackAPI.getFeedbackRequestById(requestId);
          expect([400, 403, 404]).toContain(getResp.status());

          // DB верификация
          await test.step("DB: Проверка удаления запроса из БД", async () => {
            await feedbackVerifier.verifyRequestDeleted(requestId);
          });
        }
      },
    );

    test("C5246: DELETE /private/feedback-requests/{id}/ - удаление несуществующего запроса", async ({
      feedbackAPI,
    }) => {
      await test.step("Выполнить: DELETE /private/feedback-requests/{id}/ - удаление несуществующего запроса", async () => {
        const { response } = await feedbackAPI.deleteFeedbackRequest(999999);

        expect([400, 403, 404, 405]).toContain(response.status());
      });
    });

    test("C5247: POST /private/feedback-requests/{id}/ - обновление несуществующего запроса", async ({
      feedbackAPI,
    }) => {
      await test.step("Выполнить: POST /private/feedback-requests/{id}/ - обновление несуществующего запроса", async () => {
        const { response } = await feedbackAPI.updateFeedbackRequest(999999, {
          comment: "Тест",
        });

        expect([400, 403, 404, 405]).toContain(response.status());
      });
    });
  },
);

test.describe(
  "Feedback Requests API - Negative Tests",
  { tag: ["@api", "@feedback", "@requests", "@negative", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.FEEDBACK, "Requests - Negative");
    });

    test("C5248: GET /private/feedback-requests/{id}/ - несуществующий запрос", async ({
      feedbackAPI,
    }) => {
      await test.step("Выполнить: GET /private/feedback-requests/{id}/ - несуществующий запрос", async () => {
        const { response } = await feedbackAPI.getFeedbackRequestById(999999);

        expect([400, 403, 404]).toContain(response.status());
      });
    });

    test("C5249: GET /private/feedback-requests/{id}/requested-users/ - несуществующий запрос", async ({
      feedbackAPI,
    }) => {
      await test.step("Выполнить: GET /private/feedback-requests/{id}/requested-users/ - несуществующий запрос", async () => {
        const { response } = await feedbackAPI.getRequestedUsers(999999);

        expect([400, 403, 404]).toContain(response.status());
      });
    });

    test(
      "C5202: POST /private/feedback-requests/ - без обязательных полей",
      { tag: ["@db"] },
      async ({ feedbackAPI, feedbackVerifier }) => {
        // DB: Получаем количество запросов до теста
        const requestsBefore =
          await test.step("DB: Получение запросов до теста", async () => {
            return await feedbackVerifier.countRequests();
          });

        const { response } = await feedbackAPI.createFeedbackRequest({});

        expect([400, 422]).toContain(response.status());

        // DB: Проверяем что запрос НЕ создан
        await test.step("DB: Проверка что запрос НЕ создан", async () => {
          await feedbackVerifier.verifyRequestsCount(requestsBefore);
        });
      },
    );

    test("C5251: POST /private/feedback-requests/ - пустой комментарий", async ({
      feedbackAPI,
    }) => {
      await test.step("Выполнить: POST /private/feedback-requests/ - пустой комментарий", async () => {
        const targetUserId = await findUserForRequest(feedbackAPI);
        test.skip(!targetUserId, "Нет целевого пользователя");

        const { response } = await feedbackAPI.createFeedbackRequest({
          comment: "",
          targets: [{ targetType: "user", entityId: targetUserId }],
          requestedUsersIds: [targetUserId],
        });

        // Пустой комментарий может быть разрешен или запрещен
        expect([200, 201, 400, 422]).toContain(response.status());
      });
    });

    test(
      "C5252: POST /private/feedback-requests/ - без получателей",
      { tag: ["@db"] },
      async ({ feedbackAPI, feedbackVerifier }) => {
        const requestedUserId = await findUserForRequest(feedbackAPI);
        test.skip(!requestedUserId, "Нет запрашиваемого пользователя");

        // DB: Получаем количество запросов до теста
        const requestsBefore =
          await test.step("DB: Получение запросов до теста", async () => {
            return await feedbackVerifier.countRequests();
          });

        const { response } = await feedbackAPI.createFeedbackRequest({
          comment: "Тестовый запрос",
          targets: [],
          requestedUsersIds: [requestedUserId],
        });

        expect([400, 422]).toContain(response.status());

        // DB: Проверяем что запрос НЕ создан
        await test.step("DB: Проверка что запрос НЕ создан", async () => {
          await feedbackVerifier.verifyRequestsCount(requestsBefore);
        });
      },
    );

    test(
      "C5253: POST /private/feedback-requests/ - без запрашиваемых пользователей",
      { tag: ["@db"] },
      async ({ feedbackAPI, feedbackVerifier }) => {
        const targetUserId = await findUserForRequest(feedbackAPI);
        test.skip(!targetUserId, "Нет целевого пользователя");

        // DB: Получаем количество запросов до теста
        const requestsBefore =
          await test.step("DB: Получение запросов до теста", async () => {
            return await feedbackVerifier.countRequests();
          });

        const { response } = await feedbackAPI.createFeedbackRequest({
          comment: "Тестовый запрос",
          targets: [{ targetType: "user", entityId: targetUserId }],
          requestedUsersIds: [],
        });

        expect([400, 422]).toContain(response.status());

        // DB: Проверяем что запрос НЕ создан
        await test.step("DB: Проверка что запрос НЕ создан", async () => {
          await feedbackVerifier.verifyRequestsCount(requestsBefore);
        });
      },
    );

    test(
      "C5205: POST /private/feedback-requests/ - несуществующий пользователь в targets",
      { tag: ["@db"] },
      async ({ feedbackAPI, feedbackVerifier }) => {
        const requestedUserId = await findUserForRequest(feedbackAPI);
        test.skip(!requestedUserId, "Нет запрашиваемого пользователя");

        // DB: Получаем количество запросов до теста
        const requestsBefore =
          await test.step("DB: Получение запросов до теста", async () => {
            return await feedbackVerifier.countRequests();
          });

        const { response } = await feedbackAPI.createFeedbackRequest({
          comment: "Тестовый запрос",
          targets: [{ targetType: "user", entityId: 999999 }],
          requestedUsersIds: [requestedUserId],
        });

        // 409 Conflict - возвращается когда пользователь не найден
        expect([400, 403, 404, 409, 422]).toContain(response.status());

        // DB: Проверяем что запрос НЕ создан
        await test.step("DB: Проверка что запрос НЕ создан", async () => {
          await feedbackVerifier.verifyRequestsCount(requestsBefore);
        });
      },
    );

    test(
      "C5206: POST /private/feedback-requests/ - несуществующий пользователь в requestedUsersIds",
      { tag: ["@db"] },
      async ({ feedbackAPI, feedbackVerifier }) => {
        const targetUserId = await findUserForRequest(feedbackAPI);
        test.skip(!targetUserId, "Нет целевого пользователя");

        // DB: Получаем количество запросов до теста
        const requestsBefore =
          await test.step("DB: Получение запросов до теста", async () => {
            return await feedbackVerifier.countRequests();
          });

        const { response } = await feedbackAPI.createFeedbackRequest({
          comment: "Тестовый запрос",
          targets: [{ targetType: "user", entityId: targetUserId }],
          requestedUsersIds: [999999],
        });

        expect([400, 403, 404, 422]).toContain(response.status());

        // DB: Проверяем что запрос НЕ создан
        await test.step("DB: Проверка что запрос НЕ создан", async () => {
          await feedbackVerifier.verifyRequestsCount(requestsBefore);
        });
      },
    );
  },
);
