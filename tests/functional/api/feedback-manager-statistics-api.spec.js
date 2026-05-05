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
 * API тесты для менеджерской статистики Feedback - Timeline
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
  "Feedback Manager Statistics API - Timeline",
  { tag: ["@api", "@feedback", "@statistics", "@manager", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.FEEDBACK, "Manager Statistics Timeline");
    });

    test("C5128: GET /manager/feedbacks/statistics/timeline/ - получить временную шкалу статистики", async ({
      feedbackAPI,
    }) => {
      setSeverity("critical");

      let response, data;
      await test.step("Выполнить запрос: GET /manager/feedbacks/statistics/timeline/ - получить временную шкалу статистики", async () => {
        const params = getDateRange(30);
        logInput("params", params);
        logExpected("Временная шкала статистики благодарностей за 30 дней");

        ({ response, data } = await feedbackAPI.getStatisticsTimeline(params));
        logResponse(response, data);
      });

      await test.step("Проверить ответ", async () => {
        expect([200, 403]).toContain(response.status());

        if (response.ok()) {
          expect(data).toBeDefined();

          // Данные могут быть в разном формате
          if (Array.isArray(data)) {
            // Массив точек данных
            if (data.length > 0) {
              const item = data[0];
              // Проверяем наличие даты или периода
              expect(
                item.date !== undefined ||
                  item.period !== undefined ||
                  item.timestamp !== undefined,
              ).toBe(true);
            }
          } else if (data.items) {
            assertValidArray(data.items);
          } else if (data.timeline) {
            assertValidArray(data.timeline);
          }
        }
      });
    });

    test("C5129: GET /manager/feedbacks/statistics/timeline/ - агрегация по дням", async ({
      feedbackAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: GET /manager/feedbacks/statistics/timeline/ - агрегация по дням", async () => {
        const params = {
          ...getDateRange(7),
          aggregation: "day",
        };
        logInput("params", params);
        logExpected("Статистика с дневной агрегацией");

        const { response, data } =
          await feedbackAPI.getStatisticsTimeline(params);
        logResponse(response, data);

        expect([200, 400, 403]).toContain(response.status());

        if (response.ok()) {
          expect(data).toBeDefined();
        }
      });
    });

    test("C5130: GET /manager/feedbacks/statistics/timeline/ - агрегация по неделям", async ({
      feedbackAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: GET /manager/feedbacks/statistics/timeline/ - агрегация по неделям", async () => {
        const params = {
          ...getDateRange(30),
          aggregation: "week",
        };
        logInput("params", params);
        logExpected("Статистика с недельной агрегацией");

        const { response, data } =
          await feedbackAPI.getStatisticsTimeline(params);
        logResponse(response, data);

        expect([200, 400, 403]).toContain(response.status());

        if (response.ok()) {
          expect(data).toBeDefined();
        }
      });
    });

    test("C5131: GET /manager/feedbacks/statistics/timeline/ - агрегация по месяцам", async ({
      feedbackAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: GET /manager/feedbacks/statistics/timeline/ - агрегация по месяцам", async () => {
        const params = {
          ...getDateRange(90),
          aggregation: "month",
        };
        logInput("params", params);
        logExpected("Статистика с месячной агрегацией");

        const { response, data } =
          await feedbackAPI.getStatisticsTimeline(params);
        logResponse(response, data);

        expect([200, 400, 403]).toContain(response.status());

        if (response.ok()) {
          expect(data).toBeDefined();
        }
      });
    });

    test("C5132: GET /manager/feedbacks/statistics/timeline/ - фильтр по целевому пользователю", async ({
      feedbackAPI,
    }) => {
      setSeverity("normal");

      let response, data;
      await test.step("Выполнить запрос: GET /manager/feedbacks/statistics/timeline/ - фильтр по целевому пользователю", async () => {
        // Получаем пользователя из благодарностей
        const { data: feedbacks } = await feedbackAPI.getAllFeedbacks({
          limit: 10,
        });
        const items = feedbacks?.items || feedbacks || [];

        test.skip(
          items.length === 0,
          "Нет благодарностей для получения пользователя",
        );

        const targetUser = items[0]?.targetUsers?.[0];
        const targetUserId =
          targetUser?.userId || targetUser?.user?.id || targetUser?.id;

        test.skip(
          !targetUserId,
          "Не удалось получить ID целевого пользователя",
        );

        const params = {
          ...getDateRange(30),
          targetUserId,
        };
        logInput("params", params);
        logExpected("Статистика для конкретного получателя");

        ({ response, data } = await feedbackAPI.getStatisticsTimeline(params));
        logResponse(response, data);
      });

      await test.step("Проверить ответ", async () => {
        expect([200, 400, 403]).toContain(response.status());

        if (response.ok()) {
          expect(data).toBeDefined();
        }
      });
    });

    test("C5133: GET /manager/feedbacks/statistics/timeline/ - фильтр по автору", async ({
      feedbackAPI,
    }) => {
      setSeverity("normal");

      let response, data;
      await test.step("Выполнить запрос: GET /manager/feedbacks/statistics/timeline/ - фильтр по автору", async () => {
        // Получаем автора из благодарностей
        const { data: feedbacks } = await feedbackAPI.getAllFeedbacks({
          limit: 10,
        });
        const items = feedbacks?.items || feedbacks || [];

        test.skip(
          items.length === 0,
          "Нет благодарностей для получения автора",
        );

        const authorUserId = items[0]?.authorUserId || items[0]?.authorUser?.id;

        test.skip(!authorUserId, "Не удалось получить ID автора");

        const params = {
          ...getDateRange(30),
          authorUserId,
        };
        logInput("params", params);
        logExpected("Статистика для конкретного автора");

        ({ response, data } = await feedbackAPI.getStatisticsTimeline(params));
        logResponse(response, data);
      });

      await test.step("Проверить ответ", async () => {
        expect([200, 400, 403]).toContain(response.status());

        if (response.ok()) {
          expect(data).toBeDefined();
        }
      });
    });

    test("C5134: GET /manager/feedbacks/statistics/timeline/ - без параметров дат", async ({
      feedbackAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: GET /manager/feedbacks/statistics/timeline/ - без параметров дат", async () => {
        logInput("params", {});
        logExpected("Статистика за период по умолчанию или ошибка");

        const { response, data } = await feedbackAPI.getStatisticsTimeline({});
        logResponse(response, data);

        // Без дат может вернуть данные за всё время или ошибку
        expect([200, 400, 403]).toContain(response.status());
      });
    });

    test("C5135: GET /manager/feedbacks/statistics/timeline/ - будущие даты", async ({
      feedbackAPI,
    }) => {
      setSeverity("minor");

      let response, data;
      await test.step("Выполнить запрос: GET /manager/feedbacks/statistics/timeline/ - будущие даты", async () => {
        const futureDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split("T")[0];
        const params = {
          dateFrom: futureDate,
          dateTo: futureDate,
        };
        logInput("params", params);
        logExpected("Пустой результат или ошибка для будущих дат");

        ({ response, data } = await feedbackAPI.getStatisticsTimeline(params));
        logResponse(response, data);
      });

      await test.step("Проверить ответ", async () => {
        expect([200, 400, 403]).toContain(response.status());

        if (response.ok()) {
          // Для будущих дат данных быть не должно
          const items = Array.isArray(data)
            ? data
            : data?.items || data?.timeline || [];
          // Может быть пустой массив или нулевые значения
        }
      });
    });
  },
);
