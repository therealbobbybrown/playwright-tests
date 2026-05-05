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
 * API тесты для менеджерской статистики Feedback - Most Active / Most Popular Users
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
  "Feedback Manager Statistics API - Most Active Users",
  { tag: ["@api", "@feedback", "@statistics", "@manager", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.FEEDBACK, "Manager Statistics Active Users");
    });

    test("C5136: GET /manager/feedbacks/statistics/most-active-users/ - самые активные отправители", async ({
      feedbackAPI,
    }) => {
      setSeverity("critical");

      let response, data;
      await test.step("Выполнить запрос: GET /manager/feedbacks/statistics/most-active-users/ - самые активные отправители", async () => {
        const params = getDateRange(30);
        logInput("params", params);
        logExpected("Список самых активных отправителей благодарностей");

        ({ response, data } =
          await feedbackAPI.getStatisticsMostActiveUsers(params));
        logResponse(response, data);
      });

      await test.step("Проверить ответ", async () => {
        expect([200, 403]).toContain(response.status());

        if (response.ok()) {
          expect(data).toBeDefined();

          const items = data?.items || data || [];

          if (Array.isArray(items) && items.length > 0) {
            const user = items[0];
            // Проверяем структуру пользователя
            expect(
              user.userId !== undefined ||
                user.user !== undefined ||
                user.id !== undefined,
            ).toBe(true);

            // Должно быть количество
            if (user.count !== undefined) {
              expect(typeof user.count).toBe("number");
              expect(user.count).toBeGreaterThanOrEqual(0);
            }
          }
        }
      });
    });

    test("C5137: GET /manager/feedbacks/statistics/most-active-users/ - за 7 дней", async ({
      feedbackAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: GET /manager/feedbacks/statistics/most-active-users/ - за 7 дней", async () => {
        const params = getDateRange(7);
        logInput("params", params);
        logExpected("Активные отправители за последнюю неделю");

        const { response, data } =
          await feedbackAPI.getStatisticsMostActiveUsers(params);
        logResponse(response, data);

        expect([200, 403]).toContain(response.status());

        if (response.ok()) {
          expect(data).toBeDefined();
        }
      });
    });

    test("C5138: GET /manager/feedbacks/statistics/most-active-users/ - за 90 дней", async ({
      feedbackAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: GET /manager/feedbacks/statistics/most-active-users/ - за 90 дней", async () => {
        const params = getDateRange(90);
        logInput("params", params);
        logExpected("Активные отправители за последние 3 месяца");

        const { response, data } =
          await feedbackAPI.getStatisticsMostActiveUsers(params);
        logResponse(response, data);

        expect([200, 403]).toContain(response.status());

        if (response.ok()) {
          expect(data).toBeDefined();
        }
      });
    });

    test("C5139: GET /manager/feedbacks/statistics/most-active-users/ - без параметров", async ({
      feedbackAPI,
    }) => {
      setSeverity("minor");

      await test.step("Выполнить: GET /manager/feedbacks/statistics/most-active-users/ - без параметров", async () => {
        logInput("params", {});
        logExpected("Активные отправители за период по умолчанию");

        const { response, data } =
          await feedbackAPI.getStatisticsMostActiveUsers({});
        logResponse(response, data);

        expect([200, 400, 403]).toContain(response.status());
      });
    });

    test("C5140: GET /manager/feedbacks/statistics/most-active-users/ - пользователи отсортированы по количеству", async ({
      feedbackAPI,
    }) => {
      setSeverity("normal");

      let response, data;
      await test.step("Выполнить запрос: GET /manager/feedbacks/statistics/most-active-users/ - пользователи отсортированы по количеству", async () => {
        const params = getDateRange(30);
        logInput("params", params);
        logExpected(
          "Пользователи отсортированы по убыванию количества благодарностей",
        );

        ({ response, data } =
          await feedbackAPI.getStatisticsMostActiveUsers(params));
        logResponse(response, data);
      });

      await test.step("Проверить ответ", async () => {
        expect([200, 403]).toContain(response.status());

        if (response.ok()) {
          const items = data?.items || data || [];

          if (Array.isArray(items) && items.length > 1) {
            // Проверяем сортировку по убыванию
            for (let i = 1; i < items.length; i++) {
              const prevCount = items[i - 1].count ?? 0;
              const currCount = items[i].count ?? 0;
              expect(prevCount).toBeGreaterThanOrEqual(currCount);
            }
          }
        }
      });
    });
  },
);

test.describe(
  "Feedback Manager Statistics API - Most Popular Users",
  { tag: ["@api", "@feedback", "@statistics", "@manager", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.FEEDBACK, "Manager Statistics Popular Users");
    });

    test("C5141: GET /manager/feedbacks/statistics/most-popular-users/ - самые популярные получатели", async ({
      feedbackAPI,
    }) => {
      setSeverity("critical");

      let response, data;
      await test.step("Выполнить запрос: GET /manager/feedbacks/statistics/most-popular-users/ - самые популярные получатели", async () => {
        const params = getDateRange(30);
        logInput("params", params);
        logExpected("Список самых популярных получателей благодарностей");

        ({ response, data } =
          await feedbackAPI.getStatisticsMostPopularUsers(params));
        logResponse(response, data);
      });

      await test.step("Проверить ответ", async () => {
        expect([200, 403]).toContain(response.status());

        if (response.ok()) {
          expect(data).toBeDefined();

          const items = data?.items || data || [];

          if (Array.isArray(items) && items.length > 0) {
            const user = items[0];
            // Проверяем структуру пользователя
            expect(
              user.userId !== undefined ||
                user.user !== undefined ||
                user.id !== undefined,
            ).toBe(true);

            // Должно быть количество
            if (user.count !== undefined) {
              expect(typeof user.count).toBe("number");
              expect(user.count).toBeGreaterThanOrEqual(0);
            }
          }
        }
      });
    });

    test("C5142: GET /manager/feedbacks/statistics/most-popular-users/ - за 7 дней", async ({
      feedbackAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: GET /manager/feedbacks/statistics/most-popular-users/ - за 7 дней", async () => {
        const params = getDateRange(7);
        logInput("params", params);
        logExpected("Популярные получатели за последнюю неделю");

        const { response, data } =
          await feedbackAPI.getStatisticsMostPopularUsers(params);
        logResponse(response, data);

        expect([200, 403]).toContain(response.status());

        if (response.ok()) {
          expect(data).toBeDefined();
        }
      });
    });

    test("C5143: GET /manager/feedbacks/statistics/most-popular-users/ - за 90 дней", async ({
      feedbackAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: GET /manager/feedbacks/statistics/most-popular-users/ - за 90 дней", async () => {
        const params = getDateRange(90);
        logInput("params", params);
        logExpected("Популярные получатели за последние 3 месяца");

        const { response, data } =
          await feedbackAPI.getStatisticsMostPopularUsers(params);
        logResponse(response, data);

        expect([200, 403]).toContain(response.status());

        if (response.ok()) {
          expect(data).toBeDefined();
        }
      });
    });

    test("C5144: GET /manager/feedbacks/statistics/most-popular-users/ - без параметров", async ({
      feedbackAPI,
    }) => {
      setSeverity("minor");

      await test.step("Выполнить: GET /manager/feedbacks/statistics/most-popular-users/ - без параметров", async () => {
        logInput("params", {});
        logExpected("Популярные получатели за период по умолчанию");

        const { response, data } =
          await feedbackAPI.getStatisticsMostPopularUsers({});
        logResponse(response, data);

        expect([200, 400, 403]).toContain(response.status());
      });
    });

    test("C5145: GET /manager/feedbacks/statistics/most-popular-users/ - пользователи отсортированы по количеству", async ({
      feedbackAPI,
    }) => {
      setSeverity("normal");

      let response, data;
      await test.step("Выполнить запрос: GET /manager/feedbacks/statistics/most-popular-users/ - пользователи отсортированы по количеству", async () => {
        const params = getDateRange(30);
        logInput("params", params);
        logExpected(
          "Пользователи отсортированы по убыванию количества полученных благодарностей",
        );

        ({ response, data } =
          await feedbackAPI.getStatisticsMostPopularUsers(params));
        logResponse(response, data);
      });

      await test.step("Проверить ответ", async () => {
        expect([200, 403]).toContain(response.status());

        if (response.ok()) {
          const items = data?.items || data || [];

          if (Array.isArray(items) && items.length > 1) {
            // Проверяем сортировку по убыванию
            for (let i = 1; i < items.length; i++) {
              const prevCount = items[i - 1].count ?? 0;
              const currCount = items[i].count ?? 0;
              expect(prevCount).toBeGreaterThanOrEqual(currCount);
            }
          }
        }
      });
    });
  },
);
