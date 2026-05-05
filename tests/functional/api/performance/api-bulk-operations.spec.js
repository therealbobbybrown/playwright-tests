// @ts-check
import { test as base, expect } from "@playwright/test";
import {
  PerformanceReviewAPI,
  SurveyAPI,
  FeedbackAPI,
  OrgStructureAPI,
  NotificationsAPI,
  KarmaAPI,
  ProfileAPI,
  getCredentials,
} from "../../../utils/api/index.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";
import { assertSuccessStatus } from "../../../utils/api/common-assertions.js";

/**
 * Тесты производительности API - Массовые операции
 *
 * Проверяет поведение API при массовых операциях:
 * - Множественные параллельные запросы
 * - Batch операции (если поддерживаются)
 * - Сравнение производительности: batch vs sequential
 * - Нагрузочное тестирование (умеренное)
 *
 * @tags @api @performance @bulk @regression
 */

// Пороговые значения
const THRESHOLDS = {
  SINGLE_REQUEST: 2000,
  BATCH_SMALL: 5000, // 5-10 операций
  BATCH_MEDIUM: 10000, // 10-20 операций
  BATCH_LARGE: 20000, // 20+ операций
  PARALLEL_MULTIPLIER: 1.5, // Параллельные запросы не должны быть более чем в 1.5x медленнее одиночных
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
  profileAPI: async ({ request }, use) => {
    const api = new ProfileAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
});

// ==================== PARALLEL READ OPERATIONS ====================

test.describe(
  "Bulk Operations - Parallel Reads",
  { tag: ["@api", "@performance", "@bulk", "@parallel", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.PERFORMANCE_REVIEW, "Bulk Operations - Parallel");
    });

    test(
      "C5878: Параллельное чтение нескольких PR",
      { tag: ["@critical"] },
      async ({ prAPI }) => {
        setSeverity("critical");

        let parallelResults, parallelTime, sequentialTime;
        await test.step("Выполнить запрос: Параллельное чтение нескольких PR", async () => {
          // Сначала получаем список PR
          const { response: listResp, data: listData } = await prAPI.getList({
            limit: 5,
          });

          if (!listResp.ok()) {
            test.skip(true, "Нет доступа к PR");
            return;
          }

          const items = listData?.items || listData || [];
          if (items.length < 2) {
            test.skip(true, "Недостаточно PR для теста");
            return;
          }

          const prIds = items.slice(0, 5).map((pr) => pr.id);

          // Параллельное чтение
          const startParallel = Date.now();
          parallelResults = await Promise.all(
            prIds.map((id) => prAPI.getById(id)),
          );
          parallelTime = Date.now() - startParallel;

          // Последовательное чтение для сравнения
          const startSequential = Date.now();
          for (const id of prIds) {
            await prAPI.getById(id);
          }
          sequentialTime = Date.now() - startSequential;

          console.log(
            `Parallel read (${prIds.length} items): ${parallelTime}ms`,
          );
          console.log(
            `Sequential read (${prIds.length} items): ${sequentialTime}ms`,
          );
          console.log(
            `Speedup: ${(sequentialTime / parallelTime).toFixed(2)}x`,
          );

          // Параллельные запросы должны быть быстрее
        });

        await test.step("Проверить ответ", async () => {
          expect(parallelTime).toBeLessThan(
            sequentialTime * THRESHOLDS.PARALLEL_MULTIPLIER,
          );

          // Все запросы должны быть успешными
          for (const result of parallelResults) {
            expect([200, 403, 404].includes(result.response.status())).toBe(
              true,
            );
          }
        });
      },
    );

    test(
      "C5879: Параллельное чтение разных модулей",
      { tag: ["@critical"] },
      async ({ prAPI, surveyAPI, feedbackAPI, notificationsAPI, karmaAPI }) => {
        setSeverity("critical");

        let results, totalTime;
        await test.step("Выполнить запрос: Параллельное чтение разных модулей", async () => {
          const startTime = Date.now();

          // Параллельные запросы к разным модулям
          results = await Promise.all([
            prAPI.getList({ limit: 10 }),
            surveyAPI.getList({ limit: 10 }),
            feedbackAPI.getFeedbacks({ limit: 10 }),
            notificationsAPI.getNotifications({ limit: 10 }),
            karmaAPI.getUserBalances(),
          ]);

          totalTime = Date.now() - startTime;

          console.log(`Cross-module parallel read (5 modules): ${totalTime}ms`);

          // Время должно быть близко к самому медленному запросу, а не сумме
        });

        await test.step("Проверить ответ", async () => {
          expect(totalTime).toBeLessThan(THRESHOLDS.BATCH_SMALL);

          // Проверяем статусы
          const statuses = results.map((r) => r.response.status());
          console.log(`Response statuses: ${statuses.join(", ")}`);

          for (const status of statuses) {
            expect([200, 403].includes(status)).toBe(true);
          }
        });
      },
    );

    test("C5880: Массовое получение деталей (10 элементов)", async ({
      prAPI,
    }) => {
      setSeverity("normal");

      let totalTime;
      await test.step("Выполнить запрос: Массовое получение деталей (10 элементов)", async () => {
        const { response: listResp, data: listData } = await prAPI.getList({
          limit: 10,
        });

        if (!listResp.ok()) {
          test.skip(true, "Нет доступа к PR");
          return;
        }

        const items = listData?.items || listData || [];
        if (items.length < 5) {
          test.skip(true, "Недостаточно данных");
          return;
        }

        const ids = items.map((item) => item.id);

        const startTime = Date.now();
        const results = await Promise.all(ids.map((id) => prAPI.getById(id)));
        totalTime = Date.now() - startTime;

        console.log(`Bulk details fetch (${ids.length} items): ${totalTime}ms`);
        console.log(
          `Average per item: ${(totalTime / ids.length).toFixed(0)}ms`,
        );
      });

      await test.step("Проверить ответ", async () => {
        expect(totalTime).toBeLessThan(THRESHOLDS.BATCH_MEDIUM);
      });
    });
  },
);

// ==================== STRESS TEST (MODERATE) ====================

test.describe(
  "Bulk Operations - Stress Test",
  { tag: ["@api", "@performance", "@bulk", "@stress", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.PERFORMANCE_REVIEW, "Bulk Operations - Stress");
    });

    test(
      "C5881: Множественные запросы к одному эндпоинту",
      { tag: ["@critical"] },
      async ({ prAPI }) => {
        setSeverity("critical");

        let avgTime, maxTime;
        await test.step("Выполнить запрос: Множественные запросы к одному эндпоинту", async () => {
          const requestCount = 10;
          const times = [];

          const startTime = Date.now();

          // Последовательные запросы
          for (let i = 0; i < requestCount; i++) {
            const reqStart = Date.now();
            const { response } = await prAPI.getList({
              limit: 5,
              offset: i * 5,
            });
            const reqTime = Date.now() - reqStart;

            if (response.ok()) {
              times.push(reqTime);
            }
          }

          const totalTime = Date.now() - startTime;

          if (times.length === 0) {
            test.skip(true, "Нет доступа к PR");
            return;
          }

          avgTime = times.reduce((a, b) => a + b, 0) / times.length;
          maxTime = Math.max(...times);
          const minTime = Math.min(...times);

          console.log(`Stress test (${requestCount} sequential requests):`);
          console.log(`  Total: ${totalTime}ms`);
          console.log(`  Avg: ${avgTime.toFixed(0)}ms`);
          console.log(`  Min: ${minTime}ms, Max: ${maxTime}ms`);

          // Проверяем стабильность - разброс не должен быть слишком большим
        });

        await test.step("Проверить ответ", async () => {
          expect(maxTime).toBeLessThan(avgTime * 3);
        });
      },
    );

    test("C5882: Параллельная нагрузка (5 одновременных запросов)", async ({
      prAPI,
    }) => {
      setSeverity("normal");

      let batchTimes;
      await test.step("Выполнить запрос: Параллельная нагрузка (5 одновременных запросов)", async () => {
        const batchCount = 3;
        const batchSize = 5;
        batchTimes = [];

        for (let batch = 0; batch < batchCount; batch++) {
          const startTime = Date.now();

          // Параллельный batch
          const promises = [];
          for (let i = 0; i < batchSize; i++) {
            promises.push(
              prAPI.getList({ limit: 5, offset: (batch * batchSize + i) * 5 }),
            );
          }

          const results = await Promise.all(promises);
          const batchTime = Date.now() - startTime;
          batchTimes.push(batchTime);

          // Проверяем что все запросы успешны
          const allOk = results.every(
            (r) => r.response.ok() || r.response.status() === 403,
          );
          if (!allOk) {
            console.log(`Batch ${batch} had failures`);
          }
        }

        const avgBatchTime =
          batchTimes.reduce((a, b) => a + b, 0) / batchTimes.length;

        console.log(
          `Parallel stress test (${batchCount} batches of ${batchSize}):`,
        );
        console.log(`  Batch times: ${batchTimes.join("ms, ")}ms`);
        console.log(`  Average batch time: ${avgBatchTime.toFixed(0)}ms`);

        // Среднее время batch не должно расти со временем (деградация)
      });

      await test.step("Проверить ответ", async () => {
        expect(batchTimes[batchTimes.length - 1]).toBeLessThan(
          batchTimes[0] * 2,
        );
      });
    });
  },
);

// ==================== MIXED OPERATIONS ====================

test.describe(
  "Bulk Operations - Mixed Workload",
  { tag: ["@api", "@performance", "@bulk", "@mixed", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.PERFORMANCE_REVIEW, "Bulk Operations - Mixed");
    });

    test(
      "C5883: Смешанная нагрузка: чтение + списки",
      { tag: ["@critical"] },
      async ({ prAPI, surveyAPI, feedbackAPI }) => {
        setSeverity("critical");

        let totalTime;
        await test.step("Выполнить запрос: Смешанная нагрузка: чтение + списки", async () => {
          const startTime = Date.now();

          // Первая волна: получаем списки
          const [prList, surveyList, feedbackList] = await Promise.all([
            prAPI.getList({ limit: 5 }),
            surveyAPI.getList({ limit: 5 }),
            feedbackAPI.getFeedbacks({ limit: 5 }),
          ]);

          const listTime = Date.now() - startTime;

          // Собираем ID для детальных запросов
          const prItems = prList.data?.items || prList.data || [];
          const surveyItems = surveyList.data?.items || surveyList.data || [];

          // Вторая волна: детальные запросы
          const detailPromises = [];

          if (prItems.length > 0) {
            detailPromises.push(prAPI.getById(prItems[0].id));
          }
          if (surveyItems.length > 0) {
            detailPromises.push(surveyAPI.getById(surveyItems[0].id));
          }

          const detailStart = Date.now();
          if (detailPromises.length > 0) {
            await Promise.all(detailPromises);
          }
          const detailTime = Date.now() - detailStart;

          totalTime = Date.now() - startTime;

          console.log(`Mixed workload:`);
          console.log(`  List requests: ${listTime}ms`);
          console.log(`  Detail requests: ${detailTime}ms`);
          console.log(`  Total: ${totalTime}ms`);
        });

        await test.step("Проверить ответ", async () => {
          expect(totalTime).toBeLessThan(THRESHOLDS.BATCH_MEDIUM);
        });
      },
    );

    test("C5884: Имитация пользовательского сценария", async ({
      prAPI,
      notificationsAPI,
      profileAPI,
      karmaAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Имитация пользовательского сценария", async () => {
        // Имитируем загрузку dashboard: несколько виджетов одновременно
        const startTime = Date.now();

        const [prList, notifications, balance] = await Promise.all([
          prAPI.getList({ limit: 5 }),
          notificationsAPI.getNotifications({ limit: 10 }),
          karmaAPI.getUserBalances(),
        ]);

        const dashboardTime = Date.now() - startTime;

        console.log(`Dashboard simulation:`);
        console.log(`  PR List: ${prList.response.status()}`);
        console.log(`  Notifications: ${notifications.response.status()}`);
        console.log(`  Karma Balance: ${balance.response.status()}`);
        console.log(`  Total time: ${dashboardTime}ms`);

        // Dashboard должен загружаться быстро
        expect(dashboardTime).toBeLessThan(THRESHOLDS.BATCH_SMALL);
      });
    });
  },
);

// ==================== CONCURRENT OPERATIONS ====================

test.describe(
  "Bulk Operations - Concurrency",
  { tag: ["@api", "@performance", "@bulk", "@concurrency", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(
        MODULES.PERFORMANCE_REVIEW,
        "Bulk Operations - Concurrency",
      );
    });

    test("C5885: Конкурентные запросы к одному ресурсу", async ({ prAPI }) => {
      setSeverity("normal");

      let uniqueStatuses;
      await test.step("Выполнить запрос: Конкурентные запросы к одному ресурсу", async () => {
        const { response: listResp, data: listData } = await prAPI.getList({
          limit: 1,
        });

        if (!listResp.ok()) {
          test.skip(true, "Нет доступа к PR");
          return;
        }

        const items = listData?.items || listData || [];
        if (items.length === 0) {
          test.skip(true, "Нет PR");
          return;
        }

        const prId = items[0].id;

        // 5 одновременных запросов к одному ресурсу
        const startTime = Date.now();
        const results = await Promise.all([
          prAPI.getById(prId),
          prAPI.getById(prId),
          prAPI.getById(prId),
          prAPI.getById(prId),
          prAPI.getById(prId),
        ]);
        const totalTime = Date.now() - startTime;

        console.log(
          `Concurrent requests to same resource (5x): ${totalTime}ms`,
        );

        // Все запросы должны вернуть одинаковый результат
        const statuses = results.map((r) => r.response.status());
        uniqueStatuses = new Set(statuses);

        console.log(
          `Response statuses: ${Array.from(uniqueStatuses).join(", ")}`,
        );
      });

      await test.step("Проверить ответ", async () => {
        expect(uniqueStatuses.size).toBe(1); // Все статусы одинаковые
      });
    });

    test("C5886: Интерливинг запросов разных типов", async ({
      prAPI,
      surveyAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Интерливинг запросов разных типов", async () => {
        const startTime = Date.now();

        // Чередуем запросы к разным API
        const results = await Promise.all([
          prAPI.getList({ limit: 5 }),
          surveyAPI.getList({ limit: 5 }),
          prAPI.getList({ limit: 5, offset: 5 }),
          surveyAPI.getList({ limit: 5, offset: 5 }),
          prAPI.getList({ limit: 5, offset: 10 }),
        ]);

        const totalTime = Date.now() - startTime;

        console.log(`Interleaved requests (5 total): ${totalTime}ms`);

        const successCount = results.filter((r) => r.response.ok()).length;
        console.log(`Successful: ${successCount}/${results.length}`);

        expect(totalTime).toBeLessThan(THRESHOLDS.BATCH_SMALL);
      });
    });
  },
);

// ==================== PERFORMANCE METRICS ====================

test.describe(
  "Bulk Operations - Metrics",
  { tag: ["@api", "@performance", "@bulk", "@metrics", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.PERFORMANCE_REVIEW, "Bulk Operations - Metrics");
    });

    test(
      "C5887: Сводная метрика производительности",
      { tag: ["@critical"] },
      async ({ prAPI, surveyAPI, feedbackAPI, notificationsAPI, karmaAPI }) => {
        setSeverity("critical");

        let metrics;
        await test.step("Выполнить запрос: Сводная метрика производительности", async () => {
          metrics = {
            endpoints: {},
            summary: {
              totalRequests: 0,
              successfulRequests: 0,
              totalTime: 0,
              avgTime: 0,
            },
          };

          const apis = [
            {
              name: "PR",
              api: prAPI,
              method: () => prAPI.getList({ limit: 10 }),
            },
            {
              name: "Survey",
              api: surveyAPI,
              method: () => surveyAPI.getList({ limit: 10 }),
            },
            {
              name: "Feedback",
              api: feedbackAPI,
              method: () => feedbackAPI.getFeedbacks({ limit: 10 }),
            },
            {
              name: "Notifications",
              api: notificationsAPI,
              method: () => notificationsAPI.getNotifications({ limit: 10 }),
            },
            {
              name: "Karma",
              api: karmaAPI,
              method: () => karmaAPI.getUserBalances(),
            },
          ];

          for (const { name, method } of apis) {
            const times = [];

            // 3 запроса к каждому API
            for (let i = 0; i < 3; i++) {
              const start = Date.now();
              const { response } = await method();
              const duration = Date.now() - start;

              metrics.summary.totalRequests++;

              if (response.ok()) {
                metrics.summary.successfulRequests++;
                times.push(duration);
              }
            }

            if (times.length > 0) {
              metrics.endpoints[name] = {
                avgTime: times.reduce((a, b) => a + b, 0) / times.length,
                minTime: Math.min(...times),
                maxTime: Math.max(...times),
                samples: times.length,
              };
              metrics.summary.totalTime += times.reduce((a, b) => a + b, 0);
            }
          }

          metrics.summary.avgTime =
            metrics.summary.totalTime / metrics.summary.successfulRequests;

          console.log("=== Performance Metrics Summary ===");
          console.log(`Total requests: ${metrics.summary.totalRequests}`);
          console.log(`Successful: ${metrics.summary.successfulRequests}`);
          console.log(
            `Average response time: ${metrics.summary.avgTime.toFixed(0)}ms`,
          );
          console.log("\nPer endpoint:");

          for (const [name, data] of Object.entries(metrics.endpoints)) {
            console.log(
              `  ${name}: avg=${data.avgTime.toFixed(0)}ms, min=${data.minTime}ms, max=${data.maxTime}ms`,
            );
          }

          // Общая производительность должна быть в норме
        });

        await test.step("Проверить ответ", async () => {
          expect(metrics.summary.avgTime).toBeLessThan(
            THRESHOLDS.SINGLE_REQUEST,
          );
          expect(metrics.summary.successfulRequests).toBeGreaterThan(0);
        });
      },
    );
  },
);
