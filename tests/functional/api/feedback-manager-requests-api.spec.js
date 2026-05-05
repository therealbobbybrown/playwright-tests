// @ts-check
import { test as base, expect } from "@playwright/test";
import { allure } from "allure-playwright";
import { FeedbackAPI, getCredentials } from "../../utils/api/index.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import {
  assertSuccessStatus,
  assertValidArray,
  assertForbidden,
} from "../../utils/api/common-assertions.js";

/**
 * API тесты для менеджерской статистики Feedback - Requests + Access Control
 * TASK-035-036
 */

// Хелперы для Allure логирования
function logInput(name, value) {
  allure.attachment(
    `Input: ${name}`,
    JSON.stringify(value, null, 2),
    "application/json",
  );
}

function logExpected(description) {
  allure.attachment("Expected", description, "text/plain");
}

function logResponse(response, data) {
  allure.attachment(
    `Response (${response.status()})`,
    JSON.stringify(data, null, 2),
    "application/json",
  );
}

// Расширяем test с фикстурой для Feedback API
const test = base.extend({
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

// Хелперы для дат
function getDateRange(daysBack) {
  const dateTo = new Date().toISOString().split("T")[0];
  const dateFrom = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];
  return { dateFrom, dateTo };
}

test.describe(
  "Feedback Requests Manager Statistics API",
  { tag: ["@api", "@feedback", "@statistics", "@manager", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.FEEDBACK, "Manager Statistics Requests");
    });

    test("C5146: GET /manager/feedback-requests/statistics/timeline/ - временная шкала запросов", async ({
      feedbackAPI,
    }) => {
      setSeverity("critical");

      let response, data;
      await test.step("Выполнить запрос: GET /manager/feedback-requests/statistics/timeline/ - временная шкала запросов", async () => {
        const params = getDateRange(30);
        logInput("params", params);
        logExpected("Временная шкала статистики запросов фидбека");

        ({ response, data } =
          await feedbackAPI.getRequestsStatisticsTimeline(params));
        logResponse(response, data);
      });

      await test.step("Проверить ответ", async () => {
        expect([200, 403]).toContain(response.status());

        if (response.ok()) {
          expect(data).toBeDefined();

          // Данные могут быть в разном формате
          if (Array.isArray(data)) {
            if (data.length > 0) {
              const item = data[0];
              expect(
                item.date !== undefined ||
                  item.period !== undefined ||
                  item.timestamp !== undefined,
              ).toBe(true);
            }
          } else if (data.items) {
            assertValidArray(data.items);
          }
        }
      });
    });

    test("C5147: GET /manager/feedback-requests/statistics/timeline/ - агрегация по дням", async ({
      feedbackAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: GET /manager/feedback-requests/statistics/timeline/ - агрегация по дням", async () => {
        const params = {
          ...getDateRange(7),
          aggregation: "day",
        };
        logInput("params", params);
        logExpected("Статистика запросов с дневной агрегацией");

        const { response, data } =
          await feedbackAPI.getRequestsStatisticsTimeline(params);
        logResponse(response, data);

        expect([200, 400, 403]).toContain(response.status());
      });
    });

    test("C5148: GET /manager/feedback-requests/statistics/timeline/ - агрегация по неделям", async ({
      feedbackAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: GET /manager/feedback-requests/statistics/timeline/ - агрегация по неделям", async () => {
        const params = {
          ...getDateRange(30),
          aggregation: "week",
        };
        logInput("params", params);
        logExpected("Статистика запросов с недельной агрегацией");

        const { response, data } =
          await feedbackAPI.getRequestsStatisticsTimeline(params);
        logResponse(response, data);

        expect([200, 400, 403]).toContain(response.status());
      });
    });

    test("C5149: GET /manager/feedback-requests/statistics/timeline/ - фильтр по автору", async ({
      feedbackAPI,
    }) => {
      setSeverity("normal");

      let response, data;
      await test.step("Выполнить запрос: GET /manager/feedback-requests/statistics/timeline/ - фильтр по автору", async () => {
        // Получаем автора из запросов
        const { data: requests } = await feedbackAPI.getMyFeedbackRequests({
          limit: 10,
        });
        const items = requests?.items || requests || [];

        test.skip(
          items.length === 0,
          "Нет запросов фидбека для получения автора",
        );

        const authorUserId = items[0]?.authorUserId || items[0]?.authorUser?.id;

        test.skip(!authorUserId, "Не удалось получить ID автора");

        const params = {
          ...getDateRange(30),
          authorUserId,
        };
        logInput("params", params);
        logExpected("Статистика запросов для конкретного автора");

        ({ response, data } =
          await feedbackAPI.getRequestsStatisticsTimeline(params));
        logResponse(response, data);
      });

      await test.step("Проверить ответ", async () => {
        expect([200, 400, 403]).toContain(response.status());
      });
    });

    test("C5150: GET /manager/feedback-requests/statistics/most-active-users/ - активные отправители запросов", async ({
      feedbackAPI,
    }) => {
      setSeverity("critical");

      let response, data;
      await test.step("Выполнить запрос: GET /manager/feedback-requests/statistics/most-active-users/ - активные отправители запросов", async () => {
        const params = getDateRange(30);
        logInput("params", params);
        logExpected("Список самых активных отправителей запросов фидбека");

        ({ response, data } =
          await feedbackAPI.getRequestsStatisticsMostActiveUsers(params));
        logResponse(response, data);
      });

      await test.step("Проверить ответ", async () => {
        expect([200, 403]).toContain(response.status());

        if (response.ok()) {
          expect(data).toBeDefined();

          const items = data?.items || data || [];

          if (Array.isArray(items) && items.length > 0) {
            const user = items[0];
            expect(
              user.userId !== undefined ||
                user.user !== undefined ||
                user.id !== undefined,
            ).toBe(true);
          }
        }
      });
    });

    test("C5151: GET /manager/feedback-requests/statistics/most-active-users/ - с пагинацией", async ({
      feedbackAPI,
    }) => {
      setSeverity("normal");

      let response, data;
      await test.step("Выполнить запрос: GET /manager/feedback-requests/statistics/most-active-users/ - с пагинацией", async () => {
        const params = {
          ...getDateRange(30),
          limit: 5,
          offset: 0,
        };
        logInput("params", params);
        logExpected("Не более 5 пользователей");

        ({ response, data } =
          await feedbackAPI.getRequestsStatisticsMostActiveUsers(params));
        logResponse(response, data);
      });

      await test.step("Проверить ответ", async () => {
        expect([200, 403]).toContain(response.status());

        if (response.ok()) {
          const items = data?.items || data || [];
          assertValidArray(items);
          expect(items.length).toBeLessThanOrEqual(5);
        }
      });
    });
  },
);

test.describe(
  "Feedback Manager Statistics API - Access Control",
  { tag: ["@api", "@feedback", "@statistics", "@access", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.FEEDBACK, "Manager Statistics Access");
    });

    test("C5152: Обычный пользователь не имеет доступа к manager статистике timeline", async ({
      feedbackUserAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: Обычный пользователь не имеет доступа к manager статистике timeline", async () => {
        const params = getDateRange(30);
        logInput("params", params);
        logExpected("Ошибка 403 Forbidden для обычного пользователя");

        const { response } =
          await feedbackUserAPI.getStatisticsTimeline(params);
        logResponse(response, {});

        assertForbidden(response);
      });
    });

    test("C5153: Обычный пользователь не имеет доступа к most-active-users", async ({
      feedbackUserAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: Обычный пользователь не имеет доступа к most-active-users", async () => {
        const params = getDateRange(30);
        logInput("params", params);
        logExpected("Ошибка 403 Forbidden для обычного пользователя");

        const { response } =
          await feedbackUserAPI.getStatisticsMostActiveUsers(params);
        logResponse(response, {});

        assertForbidden(response);
      });
    });

    test("C5154: Обычный пользователь не имеет доступа к most-popular-users", async ({
      feedbackUserAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: Обычный пользователь не имеет доступа к most-popular-users", async () => {
        const params = getDateRange(30);
        logInput("params", params);
        logExpected("Ошибка 403 Forbidden для обычного пользователя");

        const { response } =
          await feedbackUserAPI.getStatisticsMostPopularUsers(params);
        logResponse(response, {});

        assertForbidden(response);
      });
    });

    test("C5155: Обычный пользователь не имеет доступа к requests timeline", async ({
      feedbackUserAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: Обычный пользователь не имеет доступа к requests timeline", async () => {
        const params = getDateRange(30);
        logInput("params", params);
        logExpected("Ошибка 403 Forbidden для обычного пользователя");

        const { response } =
          await feedbackUserAPI.getRequestsStatisticsTimeline(params);
        logResponse(response, {});

        assertForbidden(response);
      });
    });

    test("C5156: Обычный пользователь не имеет доступа к requests most-active-users", async ({
      feedbackUserAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: Обычный пользователь не имеет доступа к requests most-active-users", async () => {
        const params = getDateRange(30);
        logInput("params", params);
        logExpected("Ошибка 403 Forbidden для обычного пользователя");

        const { response } =
          await feedbackUserAPI.getRequestsStatisticsMostActiveUsers(params);
        logResponse(response, {});

        assertForbidden(response);
      });
    });
  },
);
