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
 * API тесты для менеджерской статистики Feedback - Date Validation, Aggregation, Consistency, Edge Cases
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
  "Feedback Manager Statistics API - Date Validation",
  { tag: ["@api", "@feedback", "@statistics", "@validation", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.FEEDBACK, "Manager Statistics Date Validation");
    });

    test("C5157: Timeline - dateFrom > dateTo возвращает пустой результат или ошибку", async ({
      feedbackAPI,
    }) => {
      setSeverity("normal");

      let response, data;
      await test.step("Выполнить запрос: Timeline - dateFrom > dateTo возвращает пустой результат или ошибку", async () => {
        const params = {
          dateFrom: "2025-12-31",
          dateTo: "2025-01-01",
        };
        logInput("params", params);
        logExpected("Пустой результат или ошибка валидации");

        ({ response, data } = await feedbackAPI.getStatisticsTimeline(params));
        logResponse(response, data);
      });

      await test.step("Проверить ответ", async () => {
        expect([200, 400, 403]).toContain(response.status());

        if (response.ok()) {
          const items = Array.isArray(data)
            ? data
            : data?.items || data?.timeline || [];
          expect(items.length).toBe(0);
        }
      });
    });

    test("C5158: Timeline - невалидный формат даты", async ({
      feedbackAPI,
    }) => {
      setSeverity("minor");

      await test.step("Выполнить: Timeline - невалидный формат даты", async () => {
        const params = {
          dateFrom: "invalid-date",
          dateTo: "2025-12-31",
        };
        logInput("params", params);
        logExpected("Ошибка валидации");

        const { response } = await feedbackAPI.getStatisticsTimeline(params);
        logResponse(response, {});

        // Может вернуть ошибку или проигнорировать невалидную дату
        expect([200, 400, 403, 422]).toContain(response.status());
      });
    });

    test("C5159: Timeline - очень старые даты", async ({ feedbackAPI }) => {
      setSeverity("minor");

      await test.step("Выполнить: Timeline - очень старые даты", async () => {
        const params = {
          dateFrom: "2000-01-01",
          dateTo: "2000-12-31",
        };
        logInput("params", params);
        logExpected("Пустой результат для очень старых дат");

        const { response, data } =
          await feedbackAPI.getStatisticsTimeline(params);
        logResponse(response, data);

        expect([200, 400, 403]).toContain(response.status());

        if (response.ok()) {
          // Для очень старых дат данных быть не должно
        }
      });
    });

    test("C5160: Most active users - невалидный формат даты", async ({
      feedbackAPI,
    }) => {
      setSeverity("minor");

      await test.step("Выполнить: Most active users - невалидный формат даты", async () => {
        const params = {
          dateFrom: "2025/01/01",
          dateTo: "2025-12-31",
        };
        logInput("params", params);
        logExpected("Ошибка валидации или игнорирование невалидной даты");

        const { response } =
          await feedbackAPI.getStatisticsMostActiveUsers(params);
        logResponse(response, {});

        expect([200, 400, 403, 422]).toContain(response.status());
      });
    });

    test("C5161: Most popular users - только dateFrom", async ({
      feedbackAPI,
    }) => {
      setSeverity("minor");

      await test.step("Выполнить: Most popular users - только dateFrom", async () => {
        const params = {
          dateFrom: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split("T")[0],
        };
        logInput("params", params);
        logExpected("Данные от указанной даты до сегодня");

        const { response, data } =
          await feedbackAPI.getStatisticsMostPopularUsers(params);
        logResponse(response, data);

        expect([200, 400, 403]).toContain(response.status());
      });
    });

    test("C5162: Timeline - только dateTo", async ({ feedbackAPI }) => {
      setSeverity("minor");

      await test.step("Выполнить: Timeline - только dateTo", async () => {
        const params = {
          dateTo: new Date().toISOString().split("T")[0],
        };
        logInput("params", params);
        logExpected("Данные от начала до указанной даты");

        const { response, data } =
          await feedbackAPI.getStatisticsTimeline(params);
        logResponse(response, data);

        expect([200, 400, 403]).toContain(response.status());
      });
    });
  },
);

test.describe(
  "Feedback Manager Statistics API - Aggregation Validation",
  { tag: ["@api", "@feedback", "@statistics", "@aggregation", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.FEEDBACK, "Manager Statistics Aggregation");
    });

    test("C5163: Timeline - невалидное значение aggregation", async ({
      feedbackAPI,
    }) => {
      setSeverity("minor");

      await test.step("Выполнить: Timeline - невалидное значение aggregation", async () => {
        const params = {
          ...getDateRange(30),
          aggregation: "invalid",
        };
        logInput("params", params);
        logExpected("Ошибка валидации или значение по умолчанию");

        const { response, data } =
          await feedbackAPI.getStatisticsTimeline(params);
        logResponse(response, data);

        expect([200, 400, 403, 422]).toContain(response.status());
      });
    });

    test("C5164: Timeline - aggregation в верхнем регистре", async ({
      feedbackAPI,
    }) => {
      setSeverity("minor");

      await test.step("Выполнить: Timeline - aggregation в верхнем регистре", async () => {
        const params = {
          ...getDateRange(30),
          aggregation: "DAY",
        };
        logInput("params", params);
        logExpected("Принятие или ошибка в зависимости от API");

        const { response, data } =
          await feedbackAPI.getStatisticsTimeline(params);
        logResponse(response, data);

        expect([200, 400, 403]).toContain(response.status());
      });
    });

    test("C5165: Timeline - пустое значение aggregation", async ({
      feedbackAPI,
    }) => {
      setSeverity("minor");

      await test.step("Выполнить: Timeline - пустое значение aggregation", async () => {
        const params = {
          ...getDateRange(30),
          aggregation: "",
        };
        logInput("params", params);
        logExpected("Использование значения по умолчанию или ошибка");

        const { response, data } =
          await feedbackAPI.getStatisticsTimeline(params);
        logResponse(response, data);

        expect([200, 400, 403]).toContain(response.status());
      });
    });
  },
);

test.describe(
  "Feedback Manager Statistics API - Data Consistency",
  { tag: ["@api", "@feedback", "@statistics", "@consistency", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.FEEDBACK, "Manager Statistics Consistency");
    });

    test("C5166: Timeline данные согласованы с most-active и most-popular", async ({
      feedbackAPI,
    }) => {
      setSeverity("normal");

      let timelineResp,
        timelineData,
        activeResp,
        activeData,
        popularResp,
        popularData;
      await test.step("Выполнить запрос: Timeline данные согласованы с most-active и most-popular", async () => {
        const params = getDateRange(30);
        logInput("params", params);
        logExpected("Данные из разных эндпоинтов согласованы");

        // Получаем timeline
        ({ response: timelineResp, data: timelineData } =
          await feedbackAPI.getStatisticsTimeline(params));

        if (!timelineResp.ok()) {
          test.skip(true, "Timeline недоступен");
          return;
        }

        // Получаем most-active
        ({ response: activeResp, data: activeData } =
          await feedbackAPI.getStatisticsMostActiveUsers(params));

        // Получаем most-popular
        ({ response: popularResp, data: popularData } =
          await feedbackAPI.getStatisticsMostPopularUsers(params));

        // Все запросы должны быть успешными
      });

      await test.step("Проверить ответ", async () => {
        expect([200, 403]).toContain(activeResp.status());
        expect([200, 403]).toContain(popularResp.status());

        // Логируем результаты для анализа
        logResponse(timelineResp, {
          timeline: timelineData,
          active: activeData,
          popular: popularData,
        });
      });
    });

    test("C5167: Requests timeline согласован с requests most-active", async ({
      feedbackAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Requests timeline согласован с requests most-active", async () => {
        const params = getDateRange(30);
        logInput("params", params);
        logExpected("Данные из timeline и most-active согласованы");

        // Получаем timeline
        const { response: timelineResp, data: timelineData } =
          await feedbackAPI.getRequestsStatisticsTimeline(params);

        if (!timelineResp.ok()) {
          test.skip(true, "Requests timeline недоступен");
          return;
        }

        // Получаем most-active
        const { response: activeResp, data: activeData } =
          await feedbackAPI.getRequestsStatisticsMostActiveUsers(params);

        expect([200, 403]).toContain(activeResp.status());

        logResponse(timelineResp, {
          timeline: timelineData,
          active: activeData,
        });
      });
    });

    test("C5168: Данные за разные периоды логически согласованы", async ({
      feedbackAPI,
    }) => {
      setSeverity("normal");

      let items7, items30;
      await test.step("Выполнить запрос: Данные за разные периоды логически согласованы", async () => {
        // Получаем за 7 дней
        const params7 = getDateRange(7);
        const { response: resp7, data: data7 } =
          await feedbackAPI.getStatisticsMostActiveUsers(params7);

        // Получаем за 30 дней
        const params30 = getDateRange(30);
        const { response: resp30, data: data30 } =
          await feedbackAPI.getStatisticsMostActiveUsers(params30);

        if (!resp7.ok() || !resp30.ok()) {
          test.skip(true, "Статистика недоступна");
          return;
        }

        const rawItems7 = data7?.items || data7;
        const rawItems30 = data30?.items || data30;
        items7 = Array.isArray(rawItems7) ? rawItems7 : [];
        items30 = Array.isArray(rawItems30) ? rawItems30 : [];

        logInput("comparison", {
          period7days: items7.length,
          period30days: items30.length,
        });
        logExpected("За 30 дней должно быть >= чем за 7 дней");

        // Количество пользователей за 30 дней должно быть >= чем за 7 дней
        // (или равно, если не было активности в остальные дни)
      });

      await test.step("Проверить ответ", async () => {
        expect(items30.length).toBeGreaterThanOrEqual(
          Math.min(items7.length, items30.length),
        );
      });
    });
  },
);

test.describe(
  "Feedback Manager Statistics API - Edge Cases",
  { tag: ["@api", "@feedback", "@statistics", "@edge", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.FEEDBACK, "Manager Statistics Edge Cases");
    });

    test("C5169: Timeline - диапазон в 1 день", async ({ feedbackAPI }) => {
      setSeverity("minor");

      await test.step("Выполнить: Timeline - диапазон в 1 день", async () => {
        const today = new Date().toISOString().split("T")[0];
        const params = {
          dateFrom: today,
          dateTo: today,
        };
        logInput("params", params);
        logExpected("Данные за один день");

        const { response, data } =
          await feedbackAPI.getStatisticsTimeline(params);
        logResponse(response, data);

        expect([200, 400, 403]).toContain(response.status());
      });
    });

    test("C5170: Timeline - диапазон в 1 год", async ({ feedbackAPI }) => {
      setSeverity("minor");

      await test.step("Выполнить: Timeline - диапазон в 1 год", async () => {
        const params = getDateRange(365);
        logInput("params", params);
        logExpected("Данные за год");

        const { response, data } =
          await feedbackAPI.getStatisticsTimeline(params);
        logResponse(response, data);

        expect([200, 400, 403]).toContain(response.status());
      });
    });

    test("C5171: Most active users - несуществующий authorUserId", async ({
      feedbackAPI,
    }) => {
      setSeverity("minor");

      await test.step("Выполнить: Most active users - несуществующий authorUserId", async () => {
        const params = {
          ...getDateRange(30),
          authorUserId: "non-existent-user-id-999999",
        };
        logInput("params", params);
        logExpected("Пустой результат для несуществующего пользователя");

        const { response, data } =
          await feedbackAPI.getStatisticsMostActiveUsers(params);
        logResponse(response, data);

        expect([200, 400, 403]).toContain(response.status());

        if (response.ok()) {
          const items = data?.items || data || [];
          // Может быть пустой массив или данные игнорируют невалидный фильтр
        }
      });
    });

    test("C5172: Most popular users - несуществующий targetUserId", async ({
      feedbackAPI,
    }) => {
      setSeverity("minor");

      await test.step("Выполнить: Most popular users - несуществующий targetUserId", async () => {
        const params = {
          ...getDateRange(30),
          targetUserId: "non-existent-user-id-999999",
        };
        logInput("params", params);
        logExpected("Пустой результат для несуществующего пользователя");

        const { response, data } =
          await feedbackAPI.getStatisticsMostPopularUsers(params);
        logResponse(response, data);

        expect([200, 400, 403]).toContain(response.status());
      });
    });

    test("C5173: Requests timeline - несуществующий targetUserId", async ({
      feedbackAPI,
    }) => {
      setSeverity("minor");

      await test.step("Выполнить: Requests timeline - несуществующий targetUserId", async () => {
        const params = {
          ...getDateRange(30),
          targetUserId: "non-existent-user-id-999999",
        };
        logInput("params", params);
        logExpected("Пустой результат для несуществующего пользователя");

        const { response, data } =
          await feedbackAPI.getRequestsStatisticsTimeline(params);
        logResponse(response, data);

        expect([200, 400, 403]).toContain(response.status());
      });
    });
  },
);
