// @ts-check
import { test as base, expect } from "@playwright/test";
import { FeedbackAPI, getCredentials } from "../../utils/api/index.js";
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
 * API тесты для статистики модуля Feedback
 *
 * Покрытие:
 * - Статистика по полученным благодарностям (of-me)
 * - Статистика по отправленным благодарностям (my)
 * - Статистика по публичным благодарностям (shared)
 * - Статистика по благодарностям сотрудников (of-employees)
 * - Менеджерская статистика (timeline, most-active, most-popular)
 */

// Расширяем test с фикстурой для Feedback API
const test = base.extend({
  feedbackAPI: async ({ request }, use) => {
    const api = new FeedbackAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
});

test.describe(
  "Feedback API - Private Statistics",
  { tag: ["@api", "@regression", "@feedback", "@statistics", "@private"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.FEEDBACK, "Private Statistics");
    });

    test.describe("Of Me Stats", () => {
      test("C5256: GET /private/feedbacks/of-me/stats/ - статистика по полученным благодарностям", async ({
        feedbackAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: GET /private/feedbacks/of-me/stats/ - статистика по полученным благодарностям", async () => {
          const { response, data } = await feedbackAPI.getFeedbacksOfMeStats();

          assertSuccessStatus(response);
          expect(data).toBeDefined();

          // Валидация структуры статистики
          if (data.total !== undefined) {
            expect(typeof data.total).toBe("number");
            expect(data.total).toBeGreaterThanOrEqual(0);
          }
        });
      });

      test("C5257: GET /private/feedbacks/of-me/stats/ с фильтром по датам", async ({
        feedbackAPI,
      }) => {
        await test.step("Выполнить: GET /private/feedbacks/of-me/stats/ с фильтром по датам", async () => {
          const dateTo = new Date().toISOString().split("T")[0];
          const dateFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split("T")[0];

          const { response, data } = await feedbackAPI.getFeedbacksOfMeStats({
            dateFrom,
            dateTo,
          });

          assertSuccessStatus(response);
          expect(data).toBeDefined();
        });
      });

      test("C5258: GET /private/feedbacks/of-me/stats/ за последний год", async ({
        feedbackAPI,
      }) => {
        await test.step("Выполнить: GET /private/feedbacks/of-me/stats/ за последний год", async () => {
          const dateTo = new Date().toISOString().split("T")[0];
          const dateFrom = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split("T")[0];

          const { response, data } = await feedbackAPI.getFeedbacksOfMeStats({
            dateFrom,
            dateTo,
          });

          assertSuccessStatus(response);
          expect(data).toBeDefined();
        });
      });
    });

    test.describe("My Stats", () => {
      test("C5259: GET /private/feedbacks/my/stats/ - статистика по отправленным благодарностям", async ({
        feedbackAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: GET /private/feedbacks/my/stats/ - статистика по отправленным благодарностям", async () => {
          const { response, data } = await feedbackAPI.getMyFeedbacksStats();

          assertSuccessStatus(response);
          expect(data).toBeDefined();

          // Валидация структуры статистики
          if (data.total !== undefined) {
            expect(typeof data.total).toBe("number");
            expect(data.total).toBeGreaterThanOrEqual(0);
          }
        });
      });

      test("C5260: GET /private/feedbacks/my/stats/ с фильтром по датам", async ({
        feedbackAPI,
      }) => {
        await test.step("Выполнить: GET /private/feedbacks/my/stats/ с фильтром по датам", async () => {
          const dateTo = new Date().toISOString().split("T")[0];
          const dateFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split("T")[0];

          const { response, data } = await feedbackAPI.getMyFeedbacksStats({
            dateFrom,
            dateTo,
          });

          assertSuccessStatus(response);
          expect(data).toBeDefined();
        });
      });

      test("C5261: GET /private/feedbacks/my/stats/ за последний год", async ({
        feedbackAPI,
      }) => {
        await test.step("Выполнить: GET /private/feedbacks/my/stats/ за последний год", async () => {
          const dateTo = new Date().toISOString().split("T")[0];
          const dateFrom = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split("T")[0];

          const { response, data } = await feedbackAPI.getMyFeedbacksStats({
            dateFrom,
            dateTo,
          });

          assertSuccessStatus(response);
          expect(data).toBeDefined();
        });
      });
    });

    test.describe("Shared Stats", () => {
      test("C5262: GET /private/feedbacks/shared/stats/ - статистика по публичным благодарностям", async ({
        feedbackAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: GET /private/feedbacks/shared/stats/ - статистика по публичным благодарностям", async () => {
          const { response, data } =
            await feedbackAPI.getSharedFeedbacksStats();

          assertSuccessStatus(response);
          expect(data).toBeDefined();

          // Валидация структуры статистики
          if (data.total !== undefined) {
            expect(typeof data.total).toBe("number");
            expect(data.total).toBeGreaterThanOrEqual(0);
          }
        });
      });

      test("C5263: GET /private/feedbacks/shared/stats/ с фильтром по датам", async ({
        feedbackAPI,
      }) => {
        await test.step("Выполнить: GET /private/feedbacks/shared/stats/ с фильтром по датам", async () => {
          const dateTo = new Date().toISOString().split("T")[0];
          const dateFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split("T")[0];

          const { response, data } = await feedbackAPI.getSharedFeedbacksStats({
            dateFrom,
            dateTo,
          });

          assertSuccessStatus(response);
          expect(data).toBeDefined();
        });
      });

      test("C5264: GET /private/feedbacks/shared/stats/ за последний год", async ({
        feedbackAPI,
      }) => {
        await test.step("Выполнить: GET /private/feedbacks/shared/stats/ за последний год", async () => {
          const dateTo = new Date().toISOString().split("T")[0];
          const dateFrom = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split("T")[0];

          const { response, data } = await feedbackAPI.getSharedFeedbacksStats({
            dateFrom,
            dateTo,
          });

          assertSuccessStatus(response);
          expect(data).toBeDefined();
        });
      });
    });

    test.describe("Of Employees Stats", () => {
      test("C5265: GET /private/feedbacks/of-employees/stats/ - статистика по благодарностям сотрудников", async ({
        feedbackAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: GET /private/feedbacks/of-employees/stats/ - статистика по благодарностям сотрудников", async () => {
          const { response, data } =
            await feedbackAPI.getFeedbacksOfEmployeesStats();

          expect([200, 403]).toContain(response.status());

          if (response.ok()) {
            expect(data).toBeDefined();

            // Валидация структуры статистики
            if (data.total !== undefined) {
              expect(typeof data.total).toBe("number");
              expect(data.total).toBeGreaterThanOrEqual(0);
            }
          }
        });
      });

      test("C5266: GET /private/feedbacks/of-employees/stats/ с фильтром по датам", async ({
        feedbackAPI,
      }) => {
        await test.step("Выполнить: GET /private/feedbacks/of-employees/stats/ с фильтром по датам", async () => {
          const dateTo = new Date().toISOString().split("T")[0];
          const dateFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split("T")[0];

          const { response, data } =
            await feedbackAPI.getFeedbacksOfEmployeesStats({
              dateFrom,
              dateTo,
            });

          // API может не поддерживать фильтрацию по датам для stats
          expect([200, 403]).toContain(response.status());

          if (response.ok()) {
            expect(data).toBeDefined();
          }
        });
      });
    });
  },
);

test.describe(
  "Feedback API - Manager Statistics",
  { tag: ["@api", "@regression", "@feedback", "@statistics", "@manager"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.FEEDBACK, "Manager Statistics");
    });

    test.describe("Timeline", () => {
      test("C5267: GET /manager/feedbacks/statistics/timeline/ - временная шкала статистики", async ({
        feedbackAPI,
      }) => {
        setSeverity("critical");

        let response, data;
        await test.step("Выполнить запрос: GET /manager/feedbacks/statistics/timeline/ - временная шкала статистики", async () => {
          const dateTo = new Date().toISOString().split("T")[0];
          const dateFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split("T")[0];

          ({ response, data } = await feedbackAPI.getStatisticsTimeline({
            dateFrom,
            dateTo,
          }));
        });

        await test.step("Проверить ответ", async () => {
          expect([200, 403]).toContain(response.status());

          if (response.ok()) {
            expect(data).toBeDefined();
            // API возвращает { timeline: [...], aggregation: '...', availableAggregations: [...] }
            const timeline = data?.timeline || data?.items || [];
            assertValidArray(timeline);

            // Валидация структуры элементов timeline (если есть)
            if (timeline.length > 0) {
              if (timeline[0].date) {
                expect(typeof timeline[0].date).toBe("string");
              }
            }

            // Проверка aggregation
            if (data?.aggregation) {
              expect(typeof data.aggregation).toBe("string");
            }
          }
        });
      });

      test("C5268: GET /manager/feedbacks/statistics/timeline/ с агрегацией по дням", async ({
        feedbackAPI,
      }) => {
        await test.step("Выполнить: GET /manager/feedbacks/statistics/timeline/ с агрегацией по дням", async () => {
          const dateTo = new Date().toISOString().split("T")[0];
          const dateFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split("T")[0];

          const { response, data } = await feedbackAPI.getStatisticsTimeline({
            dateFrom,
            dateTo,
            aggregation: "day",
          });

          expect([200, 403]).toContain(response.status());

          if (response.ok()) {
            expect(data).toBeDefined();
            const timeline = data?.timeline || data?.items || [];
            assertValidArray(timeline);
          }
        });
      });

      test("C5269: GET /manager/feedbacks/statistics/timeline/ с агрегацией по неделям", async ({
        feedbackAPI,
      }) => {
        await test.step("Выполнить: GET /manager/feedbacks/statistics/timeline/ с агрегацией по неделям", async () => {
          const dateTo = new Date().toISOString().split("T")[0];
          const dateFrom = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split("T")[0];

          const { response, data } = await feedbackAPI.getStatisticsTimeline({
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

      test("C5270: GET /manager/feedbacks/statistics/timeline/ с агрегацией по месяцам", async ({
        feedbackAPI,
      }) => {
        await test.step("Выполнить: GET /manager/feedbacks/statistics/timeline/ с агрегацией по месяцам", async () => {
          const dateTo = new Date().toISOString().split("T")[0];
          const dateFrom = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split("T")[0];

          const { response, data } = await feedbackAPI.getStatisticsTimeline({
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

      test("C5271: GET /manager/feedbacks/statistics/timeline/ с фильтром по автору", async ({
        feedbackAPI,
      }) => {
        let response, data;
        await test.step("Выполнить запрос: GET /manager/feedbacks/statistics/timeline/ с фильтром по автору", async () => {
          // Получаем ID автора из существующих благодарностей
          const { data: feedbacks } = await feedbackAPI.getAllFeedbacks({
            limit: 10,
          });
          const items = feedbacks?.items || feedbacks || [];
          const authorUserId =
            items[0]?.authorUserId || items[0]?.authorUser?.id;

          test.skip(!authorUserId, "Нет благодарностей с автором");

          const dateTo = new Date().toISOString().split("T")[0];
          const dateFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split("T")[0];

          ({ response, data } = await feedbackAPI.getStatisticsTimeline({
            dateFrom,
            dateTo,
            authorUserId,
          }));
        });

        await test.step("Проверить ответ", async () => {
          expect([200, 403]).toContain(response.status());

          if (response.ok()) {
            expect(data).toBeDefined();
          }
        });
      });

      test("C5272: GET /manager/feedbacks/statistics/timeline/ с фильтром по получателю", async ({
        feedbackAPI,
      }) => {
        let response, data;
        await test.step("Выполнить запрос: GET /manager/feedbacks/statistics/timeline/ с фильтром по получателю", async () => {
          // Получаем ID получателя из существующих благодарностей
          const { data: feedbacks } = await feedbackAPI.getAllFeedbacks({
            limit: 10,
          });
          const items = feedbacks?.items || feedbacks || [];
          const firstFeedback = items[0];
          const targetUser = firstFeedback?.targetUsers?.[0];
          const targetUserId =
            targetUser?.userId || targetUser?.user?.id || targetUser?.id;

          test.skip(!targetUserId, "Нет благодарностей с получателем");

          const dateTo = new Date().toISOString().split("T")[0];
          const dateFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split("T")[0];

          ({ response, data } = await feedbackAPI.getStatisticsTimeline({
            dateFrom,
            dateTo,
            targetUserId,
          }));
        });

        await test.step("Проверить ответ", async () => {
          expect([200, 403]).toContain(response.status());

          if (response.ok()) {
            expect(data).toBeDefined();
          }
        });
      });
    });

    test.describe("Most Active Users", () => {
      test("C5136: GET /manager/feedbacks/statistics/most-active-users/ - самые активные отправители", async ({
        feedbackAPI,
      }) => {
        let response, data;
        await test.step("Выполнить запрос: GET /manager/feedbacks/statistics/most-active-users/ - самые активные отправители", async () => {
          const dateTo = new Date().toISOString().split("T")[0];
          const dateFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split("T")[0];

          ({ response, data } = await feedbackAPI.getStatisticsMostActiveUsers({
            dateFrom,
            dateTo,
          }));
        });

        await test.step("Проверить ответ", async () => {
          expect([200, 403]).toContain(response.status());

          if (response.ok()) {
            expect(data).toBeDefined();
            // API возвращает { users: [...] }
            const users = data?.users || data?.items || [];
            assertValidArray(users);
          }
        });
      });

      test("C5274: GET /manager/feedbacks/statistics/most-active-users/ за последний год", async ({
        feedbackAPI,
      }) => {
        await test.step("Выполнить: GET /manager/feedbacks/statistics/most-active-users/ за последний год", async () => {
          const dateTo = new Date().toISOString().split("T")[0];
          const dateFrom = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split("T")[0];

          const { response, data } =
            await feedbackAPI.getStatisticsMostActiveUsers({
              dateFrom,
              dateTo,
            });

          expect([200, 403]).toContain(response.status());

          if (response.ok()) {
            expect(data).toBeDefined();
            const users = data?.users || data?.items || [];
            assertValidArray(users);
          }
        });
      });

      test("C5275: GET /manager/feedbacks/statistics/most-active-users/ проверка структуры данных", async ({
        feedbackAPI,
      }) => {
        let response, data;
        await test.step("Выполнить запрос: GET /manager/feedbacks/statistics/most-active-users/ проверка структуры данных", async () => {
          const dateTo = new Date().toISOString().split("T")[0];
          const dateFrom = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split("T")[0];

          ({ response, data } = await feedbackAPI.getStatisticsMostActiveUsers({
            dateFrom,
            dateTo,
          }));
        });

        await test.step("Проверить ответ", async () => {
          expect([200, 403]).toContain(response.status());

          if (response.ok()) {
            expect(data).toBeDefined();
            const users = data?.users || data?.items || [];
            assertValidArray(users);

            // Проверяем структуру элемента (если есть)
            // Структура: { user: {...}, totalByFeedbackType: {...} }
            if (users.length > 0) {
              const item = users[0];
              expect(item.user || item.userId || item.id).toBeDefined();
            }
          }
        });
      });
    });

    test.describe("Most Popular Users", () => {
      test("C5141: GET /manager/feedbacks/statistics/most-popular-users/ - самые популярные получатели", async ({
        feedbackAPI,
      }) => {
        let response, data;
        await test.step("Выполнить запрос: GET /manager/feedbacks/statistics/most-popular-users/ - самые популярные получатели", async () => {
          const dateTo = new Date().toISOString().split("T")[0];
          const dateFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split("T")[0];

          ({ response, data } = await feedbackAPI.getStatisticsMostPopularUsers(
            {
              dateFrom,
              dateTo,
            },
          ));
        });

        await test.step("Проверить ответ", async () => {
          expect([200, 403]).toContain(response.status());

          if (response.ok()) {
            expect(data).toBeDefined();
            // API возвращает { users: [...] }
            const users = data?.users || data?.items || [];
            assertValidArray(users);
          }
        });
      });

      test("C5277: GET /manager/feedbacks/statistics/most-popular-users/ за последний год", async ({
        feedbackAPI,
      }) => {
        await test.step("Выполнить: GET /manager/feedbacks/statistics/most-popular-users/ за последний год", async () => {
          const dateTo = new Date().toISOString().split("T")[0];
          const dateFrom = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split("T")[0];

          const { response, data } =
            await feedbackAPI.getStatisticsMostPopularUsers({
              dateFrom,
              dateTo,
            });

          expect([200, 403]).toContain(response.status());

          if (response.ok()) {
            expect(data).toBeDefined();
            const users = data?.users || data?.items || [];
            assertValidArray(users);
          }
        });
      });

      test("C5278: GET /manager/feedbacks/statistics/most-popular-users/ проверка структуры данных", async ({
        feedbackAPI,
      }) => {
        let response, data;
        await test.step("Выполнить запрос: GET /manager/feedbacks/statistics/most-popular-users/ проверка структуры данных", async () => {
          const dateTo = new Date().toISOString().split("T")[0];
          const dateFrom = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split("T")[0];

          ({ response, data } = await feedbackAPI.getStatisticsMostPopularUsers(
            {
              dateFrom,
              dateTo,
            },
          ));
        });

        await test.step("Проверить ответ", async () => {
          expect([200, 403]).toContain(response.status());

          if (response.ok()) {
            expect(data).toBeDefined();
            const users = data?.users || data?.items || [];
            assertValidArray(users);

            // Проверяем структуру элемента (если есть)
            // Структура: { user: {...}, totalByFeedbackType: {...} }
            if (users.length > 0) {
              const item = users[0];
              expect(item.user || item.userId || item.id).toBeDefined();
            }
          }
        });
      });
    });
  },
);

test.describe(
  "Feedback API - Statistics Edge Cases",
  { tag: ["@api", "@regression", "@feedback", "@statistics", "@edge"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.FEEDBACK, "Statistics Edge Cases");
    });

    test("C5279: Statistics с пустым диапазоном дат (dateFrom > dateTo)", async ({
      feedbackAPI,
    }) => {
      await test.step("Выполнить: Statistics с пустым диапазоном дат (dateFrom > dateTo)", async () => {
        const dateFrom = new Date().toISOString().split("T")[0];
        const dateTo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split("T")[0];

        const { response } = await feedbackAPI.getFeedbacksOfMeStats({
          dateFrom,
          dateTo,
        });

        // Может вернуть пустой результат или ошибку валидации
        expect([200, 400]).toContain(response.status());
      });
    });

    test("C5280: Statistics с очень большим диапазоном дат", async ({
      feedbackAPI,
    }) => {
      await test.step("Выполнить: Statistics с очень большим диапазоном дат", async () => {
        const dateTo = new Date().toISOString().split("T")[0];
        const dateFrom = new Date(Date.now() - 5 * 365 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split("T")[0];

        const { response, data } = await feedbackAPI.getFeedbacksOfMeStats({
          dateFrom,
          dateTo,
        });

        assertSuccessStatus(response);
        expect(data).toBeDefined();
      });
    });

    test("C5281: Statistics без параметров дат", async ({ feedbackAPI }) => {
      await test.step("Выполнить: Statistics без параметров дат", async () => {
        const { response, data } = await feedbackAPI.getFeedbacksOfMeStats();

        assertSuccessStatus(response);
        expect(data).toBeDefined();
      });
    });

    test("C5282: Manager timeline с невалидной агрегацией", async ({
      feedbackAPI,
    }) => {
      await test.step("Выполнить: Manager timeline с невалидной агрегацией", async () => {
        const dateTo = new Date().toISOString().split("T")[0];
        const dateFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split("T")[0];

        const { response } = await feedbackAPI.getStatisticsTimeline({
          dateFrom,
          dateTo,
          aggregation: "invalid",
        });

        // Может вернуть ошибку или использовать значение по умолчанию
        expect([200, 403]).toContain(response.status());
      });
    });

    test("C5283: Manager statistics с несуществующим пользователем", async ({
      feedbackAPI,
    }) => {
      await test.step("Выполнить: Manager statistics с несуществующим пользователем", async () => {
        const dateTo = new Date().toISOString().split("T")[0];
        const dateFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split("T")[0];

        const { response, data } = await feedbackAPI.getStatisticsTimeline({
          dateFrom,
          dateTo,
          authorUserId: 999999,
        });

        // Должен вернуть пустой результат или ошибку
        expect([200, 400, 403, 404]).toContain(response.status());

        if (response.ok()) {
          expect(data).toBeDefined();
        }
      });
    });
  },
);
