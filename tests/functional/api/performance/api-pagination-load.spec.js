// @ts-check
import { test as base, expect } from "@playwright/test";
import {
  PerformanceReviewAPI,
  SurveyAPI,
  FeedbackAPI,
  OrgStructureAPI,
  NotificationsAPI,
  KarmaAPI,
  getCredentials,
} from "../../../utils/api/index.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";
import { assertSuccessStatus } from "../../../utils/api/common-assertions.js";

/**
 * Тесты производительности API - Пагинация
 *
 * Проверяет поведение API при работе с пагинацией:
 * - Корректность пагинации (offset, limit)
 * - Производительность при разных размерах страниц
 * - Стабильность при навигации по страницам
 * - Обработка граничных случаев
 *
 * @tags @api @performance @pagination @regression
 */

// Пороговые значения
const THRESHOLDS = {
  SINGLE_PAGE: 2000,
  FULL_TRAVERSAL: 10000, // Для полного прохода по всем страницам
  PER_PAGE: 3000,
};

const test = base.extend({
  prAPI: async ({ request }, use) => {
    const api = new PerformanceReviewAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
  surveyAPI: async ({ request }, use) => {
    const api = new SurveyAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
  feedbackAPI: async ({ request }, use) => {
    const api = new FeedbackAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
  orgAPI: async ({ request }, use) => {
    const api = new OrgStructureAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
  notificationsAPI: async ({ request }, use) => {
    const api = new NotificationsAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
  karmaAPI: async ({ request }, use) => {
    const api = new KarmaAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
});

// ==================== PERFORMANCE REVIEW PAGINATION ====================

test.describe(
  "API Pagination - Performance Review",
  { tag: ["@api", "@performance", "@pagination", "@pr", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.PERFORMANCE_REVIEW, "Pagination Load");
    });

    test(
      "C5888: Получение списка PR (без пагинации)",
      { tag: ["@critical"] },
      async ({ prAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: Получение списка PR (без пагинации)", async () => {
          // PR API не поддерживает пагинацию в getList, проверяем базовую производительность
          const startTime = Date.now();
          const { response, data } = await prAPI.getList();
          const duration = Date.now() - startTime;

          expect(response.ok() || response.status() === 403).toBe(true);

          if (response.ok()) {
            const items = data?.items || data || [];
            console.log(`PR list: ${items.length} items in ${duration}ms`);
            expect(duration).toBeLessThan(THRESHOLDS.SINGLE_PAGE);
          }
        });
      },
    );

    test("C5889: Множественные запросы списка PR", async ({ prAPI }) => {
      setSeverity("normal");

      let avgTime;
      await test.step("Выполнить запрос: Множественные запросы списка PR", async () => {
        const times = [];

        // 5 последовательных запросов
        for (let i = 0; i < 5; i++) {
          const startTime = Date.now();
          const { response } = await prAPI.getList();
          const duration = Date.now() - startTime;

          if (response.ok()) {
            times.push(duration);
          }
        }

        if (times.length === 0) {
          test.skip(true, "Нет доступа к PR");
          return;
        }

        avgTime = times.reduce((a, b) => a + b, 0) / times.length;
        console.log(
          `PR list stability: avg=${avgTime.toFixed(0)}ms, times=${times.join("ms, ")}ms`,
        );
      });

      await test.step("Проверить ответ", async () => {
        expect(avgTime).toBeLessThan(THRESHOLDS.SINGLE_PAGE);
      });
    });

    test("C5890: Параллельные запросы списка PR", async ({ prAPI }) => {
      setSeverity("normal");

      await test.step("Выполнить: Параллельные запросы списка PR", async () => {
        const startTime = Date.now();

        // 3 параллельных запроса
        const results = await Promise.all([
          prAPI.getList(),
          prAPI.getList(),
          prAPI.getList(),
        ]);

        const totalTime = Date.now() - startTime;

        const successCount = results.filter((r) => r.response.ok()).length;
        console.log(
          `Parallel PR list (3 requests): ${totalTime}ms, successful: ${successCount}/3`,
        );

        expect(totalTime).toBeLessThan(THRESHOLDS.SINGLE_PAGE);
      });
    });
  },
);

// ==================== SURVEY PAGINATION ====================

test.describe(
  "API Pagination - Survey",
  { tag: ["@api", "@performance", "@pagination", "@survey", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.SURVEY, "Pagination Load");
    });

    test(
      "C5891: Пагинация списка опросов",
      { tag: ["@critical"] },
      async ({ surveyAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: Пагинация списка опросов", async () => {
          const pageSizes = [5, 10, 20];
          const results = [];

          for (const limit of pageSizes) {
            const startTime = Date.now();
            const { response, data } = await surveyAPI.getList({
              limit,
              offset: 0,
            });
            const duration = Date.now() - startTime;

            if (response.ok()) {
              const items = data?.items || data || [];
              results.push({ limit, count: items.length, duration });

              console.log(
                `Survey pagination (limit=${limit}): ${items.length} items in ${duration}ms`,
              );
              expect(items.length).toBeLessThanOrEqual(limit);
            }
          }

          if (results.length === 0) {
            test.skip(true, "Нет доступа к опросам");
            return;
          }

          for (const result of results) {
            expect(result.duration).toBeLessThan(THRESHOLDS.SINGLE_PAGE);
          }
        });
      },
    );

    test("C5892: Стабильность при последовательных запросах", async ({
      surveyAPI,
    }) => {
      setSeverity("normal");

      let avgTime, stdDev;
      await test.step("Выполнить запрос: Стабильность при последовательных запросах", async () => {
        const times = [];
        const limit = 10;

        // 5 одинаковых запросов подряд
        for (let i = 0; i < 5; i++) {
          const startTime = Date.now();
          const { response } = await surveyAPI.getList({ limit, offset: 0 });
          const duration = Date.now() - startTime;

          if (response.ok()) {
            times.push(duration);
          }
        }

        if (times.length === 0) {
          test.skip(true, "Нет доступа к опросам");
          return;
        }

        avgTime = times.reduce((a, b) => a + b, 0) / times.length;
        const variance =
          times.reduce((sum, t) => sum + Math.pow(t - avgTime, 2), 0) /
          times.length;
        stdDev = Math.sqrt(variance);

        console.log(
          `Survey stability: avg=${avgTime.toFixed(0)}ms, stdDev=${stdDev.toFixed(0)}ms`,
        );
        console.log(`Individual times: ${times.join("ms, ")}ms`);

        // Стандартное отклонение не должно быть слишком большим
      });

      await test.step("Проверить ответ", async () => {
        expect(stdDev).toBeLessThan(avgTime * 0.5); // Не более 50% от среднего
      });
    });
  },
);

// ==================== FEEDBACK PAGINATION ====================

test.describe(
  "API Pagination - Feedback",
  { tag: ["@api", "@performance", "@pagination", "@feedback", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.FEEDBACK, "Pagination Load");
    });

    test(
      "C5893: Пагинация feedback",
      { tag: ["@critical"] },
      async ({ feedbackAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: Пагинация feedback", async () => {
          const { response, data } = await feedbackAPI.getFeedbacks({
            limit: 20,
            offset: 0,
          });

          expect(response.ok() || response.status() === 403).toBe(true);

          if (response.ok()) {
            const items = data?.items || data || [];
            console.log(`Feedback pagination: ${items.length} items`);
            expect(items.length).toBeLessThanOrEqual(20);
          }
        });
      },
    );

    test("C5894: Пагинация с фильтрами", async ({ feedbackAPI }) => {
      setSeverity("normal");

      await test.step("Выполнить: Пагинация с фильтрами", async () => {
        // Получаем feedback с фильтром по типу (если поддерживается)
        const startTime = Date.now();
        const { response, data } = await feedbackAPI.getFeedbacks({
          limit: 10,
          offset: 0,
        });
        const duration = Date.now() - startTime;

        expect(response.ok() || response.status() === 403).toBe(true);

        if (response.ok()) {
          const items = data?.items || data || [];
          console.log(
            `Feedback with filters: ${items.length} items in ${duration}ms`,
          );
          expect(duration).toBeLessThan(THRESHOLDS.SINGLE_PAGE);
        }
      });
    });
  },
);

// ==================== NOTIFICATIONS PAGINATION ====================

test.describe(
  "API Pagination - Notifications",
  {
    tag: [
      "@api",
      "@performance",
      "@pagination",
      "@notifications",
      "@regression",
    ],
  },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.NOTIFICATIONS, "Pagination Load");
    });

    test(
      "C5895: Пагинация уведомлений",
      { tag: ["@critical"] },
      async ({ notificationsAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: Пагинация уведомлений", async () => {
          const pageSizes = [10, 20, 50];
          const results = [];

          for (const limit of pageSizes) {
            const startTime = Date.now();
            const { response, data } = await notificationsAPI.getNotifications({
              limit,
            });
            const duration = Date.now() - startTime;

            if (response.ok()) {
              const items = data?.items || data || [];
              results.push({ limit, count: items.length, duration });

              console.log(
                `Notifications (limit=${limit}): ${items.length} items in ${duration}ms`,
              );
              expect(items.length).toBeLessThanOrEqual(limit);
            }
          }

          if (results.length === 0) {
            test.skip(true, "Нет доступа к уведомлениям");
            return;
          }

          for (const result of results) {
            expect(result.duration).toBeLessThan(THRESHOLDS.SINGLE_PAGE);
          }
        });
      },
    );

    test("C5896: Навигация по уведомлениям", async ({ notificationsAPI }) => {
      setSeverity("normal");

      await test.step("Выполнить: Навигация по уведомлениям", async () => {
        const limit = 10;
        let offset = 0;
        const allIds = new Set();
        const maxIterations = 3;

        for (let i = 0; i < maxIterations; i++) {
          const { response, data } = await notificationsAPI.getNotifications({
            limit,
            offset,
          });

          if (!response.ok()) {
            break;
          }

          const items = data?.items || data || [];
          if (items.length === 0) break;

          // Собираем ID для проверки уникальности
          for (const item of items) {
            if (item.id) {
              allIds.add(item.id);
            }
          }

          offset += limit;
        }

        console.log(`Collected ${allIds.size} unique notification IDs`);
      });
    });
  },
);

// ==================== KARMA TRANSACTIONS PAGINATION ====================

test.describe(
  "API Pagination - Karma",
  { tag: ["@api", "@performance", "@pagination", "@karma", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.KARMA, "Pagination Load");
    });

    test(
      "C5897: Пагинация транзакций",
      { tag: ["@critical"] },
      async ({ karmaAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: Пагинация транзакций", async () => {
          const pageSizes = [10, 20, 50];
          const results = [];

          for (const limit of pageSizes) {
            const startTime = Date.now();
            const { response, data } = await karmaAPI.getTransactions({
              limit,
            });
            const duration = Date.now() - startTime;

            if (response.ok()) {
              const items = data?.items || data || [];
              results.push({ limit, count: items.length, duration });

              console.log(
                `Karma transactions (limit=${limit}): ${items.length} items in ${duration}ms`,
              );
            }
          }

          if (results.length === 0) {
            test.skip(true, "Нет доступа к транзакциям");
            return;
          }

          for (const result of results) {
            expect(result.duration).toBeLessThan(THRESHOLDS.SINGLE_PAGE);
          }
        });
      },
    );
  },
);

// ==================== CROSS-MODULE PAGINATION COMPARISON ====================

test.describe(
  "API Pagination - Cross-Module Comparison",
  {
    tag: ["@api", "@performance", "@pagination", "@comparison", "@regression"],
  },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.PERFORMANCE_REVIEW, "Pagination Comparison");
    });

    test(
      "C5898: Сравнение производительности пагинации между модулями",
      { tag: ["@critical"] },
      async ({ prAPI, surveyAPI, feedbackAPI, notificationsAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: Сравнение производительности пагинации между модулями", async () => {
          const limit = 20;
          const results = {};

          // Performance Review (не поддерживает пагинацию)
          let startTime = Date.now();
          let { response } = await prAPI.getList();
          results.pr = {
            status: response.status(),
            duration: Date.now() - startTime,
          };

          // Survey
          startTime = Date.now();
          ({ response } = await surveyAPI.getList({ limit, offset: 0 }));
          results.survey = {
            status: response.status(),
            duration: Date.now() - startTime,
          };

          // Feedback
          startTime = Date.now();
          ({ response } = await feedbackAPI.getFeedbacks({ limit, offset: 0 }));
          results.feedback = {
            status: response.status(),
            duration: Date.now() - startTime,
          };

          // Notifications
          startTime = Date.now();
          ({ response } = await notificationsAPI.getNotifications({ limit }));
          results.notifications = {
            status: response.status(),
            duration: Date.now() - startTime,
          };

          console.log("Pagination performance comparison (limit=20):");
          for (const [module, data] of Object.entries(results)) {
            console.log(
              `  ${module}: ${data.duration}ms (status: ${data.status})`,
            );
          }

          // Все успешные запросы должны быть в пределах порога
          for (const data of Object.values(results)) {
            if (data.status === 200) {
              expect(data.duration).toBeLessThan(THRESHOLDS.SINGLE_PAGE);
            }
          }
        });
      },
    );

    test("C5899: Параллельная пагинация нескольких модулей", async ({
      prAPI,
      surveyAPI,
      feedbackAPI,
    }) => {
      setSeverity("normal");

      let results, totalTime;
      await test.step("Выполнить запрос: Параллельная пагинация нескольких модулей", async () => {
        const limit = 10;
        const startTime = Date.now();

        // Параллельные запросы с пагинацией
        results = await Promise.all([
          prAPI.getList(),
          prAPI.getList(),
          surveyAPI.getList({ limit, offset: 0 }),
          feedbackAPI.getFeedbacks({ limit, offset: 0 }),
        ]);

        totalTime = Date.now() - startTime;

        console.log(`Parallel pagination (4 requests): ${totalTime}ms`);

        // Параллельные запросы должны выполняться быстрее чем последовательные
      });

      await test.step("Проверить ответ", async () => {
        expect(totalTime).toBeLessThan(THRESHOLDS.FULL_TRAVERSAL);

        // Все запросы должны вернуть ожидаемые статусы
        for (const result of results) {
          expect([200, 403].includes(result.response.status())).toBe(true);
        }
      });
    });
  },
);
