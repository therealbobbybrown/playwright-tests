// @ts-check
import { test as base, expect } from "@playwright/test";
import {
  PerformanceReviewAPI,
  SurveyAPI,
  FeedbackAPI,
  ObjectivesAPI,
  OrgStructureAPI,
  ProfileAPI,
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
 * Тесты производительности API - Время отклика
 *
 * Проверяет время отклика различных API эндпоинтов:
 * - GET эндпоинты должны отвечать быстро (< 2s)
 * - Списковые эндпоинты с пагинацией (< 3s)
 * - Сложные запросы с фильтрами (< 5s)
 *
 * @tags @api @performance @response-time @regression
 */

// Пороговые значения времени отклика (в миллисекундах)
const THRESHOLDS = {
  FAST: 1000, // Простые GET запросы
  NORMAL: 2000, // Стандартные операции
  SLOW: 3000, // Списки с пагинацией
  COMPLEX: 5000, // Сложные запросы
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
  objectivesAPI: async ({ request }, use) => {
    const api = new ObjectivesAPI(request);
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
  profileAPI: async ({ request }, use) => {
    const api = new ProfileAPI(request);
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

// Helper: измерение времени выполнения
async function measureResponseTime(apiCall) {
  const startTime = Date.now();
  const result = await apiCall();
  const endTime = Date.now();
  const duration = endTime - startTime;

  return {
    ...result,
    duration,
    startTime,
    endTime,
  };
}

// ==================== PERFORMANCE REVIEW API ====================

test.describe(
  "API Response Time - Performance Review",
  { tag: ["@api", "@performance", "@pr", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.PERFORMANCE_REVIEW, "Response Time");
    });

    test(
      "C5900: GET /performance-reviews/ - список PR",
      { tag: ["@critical"] },
      async ({ prAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: GET /performance-reviews/ - список PR", async () => {
          const result = await measureResponseTime(() => prAPI.getList());

          expect(result.response.ok() || result.response.status() === 403).toBe(
            true,
          );
          expect(result.duration).toBeLessThan(THRESHOLDS.SLOW);

          console.log(
            `PR List response time: ${result.duration}ms (threshold: ${THRESHOLDS.SLOW}ms)`,
          );
        });
      },
    );

    test("C5901: GET /performance-reviews/ с пагинацией", async ({ prAPI }) => {
      setSeverity("normal");

      await test.step("Выполнить: GET /performance-reviews/ с пагинацией", async () => {
        const result = await measureResponseTime(() =>
          prAPI.getList({ limit: 10, offset: 0 }),
        );

        expect(result.response.ok() || result.response.status() === 403).toBe(
          true,
        );
        expect(result.duration).toBeLessThan(THRESHOLDS.SLOW);

        console.log(`PR List (paginated) response time: ${result.duration}ms`);
      });
    });

    test("C5902: GET /performance-reviews/{id}/ - детали PR", async ({
      prAPI,
    }) => {
      setSeverity("normal");

      let result;
      await test.step("Выполнить запрос: GET /performance-reviews/{id}/ - детали PR", async () => {
        // Сначала получаем список
        const { response: listResp, data: listData } = await prAPI.getList();

        if (!listResp.ok()) {
          test.skip(true, "Нет доступа к PR");
          return;
        }

        const items = listData?.items || listData || [];
        if (items.length === 0) {
          test.skip(true, "Нет PR для теста");
          return;
        }

        const prId = items[0].id;
        result = await measureResponseTime(() => prAPI.getById(prId));
      });

      await test.step("Проверить ответ", async () => {
        expect(
          result.response.ok() || [403, 404].includes(result.response.status()),
        ).toBe(true);
        expect(result.duration).toBeLessThan(THRESHOLDS.NORMAL);

        console.log(
          `PR Details response time: ${result.duration}ms (threshold: ${THRESHOLDS.NORMAL}ms)`,
        );
      });
    });
  },
);

// ==================== SURVEY API ====================

test.describe(
  "API Response Time - Survey",
  { tag: ["@api", "@performance", "@survey", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.SURVEY, "Response Time");
    });

    test(
      "C5903: GET /surveys/ - список опросов",
      { tag: ["@critical"] },
      async ({ surveyAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: GET /surveys/ - список опросов", async () => {
          const result = await measureResponseTime(() => surveyAPI.getList());

          expect(result.response.ok() || result.response.status() === 403).toBe(
            true,
          );
          expect(result.duration).toBeLessThan(THRESHOLDS.SLOW);

          console.log(
            `Survey List response time: ${result.duration}ms (threshold: ${THRESHOLDS.SLOW}ms)`,
          );
        });
      },
    );

    test("C5904: GET /surveys/{id}/ - детали опроса", async ({ surveyAPI }) => {
      setSeverity("normal");

      let result;
      await test.step("Выполнить запрос: GET /surveys/{id}/ - детали опроса", async () => {
        const { response: listResp, data: listData } =
          await surveyAPI.getList();

        if (!listResp.ok()) {
          test.skip(true, "Нет доступа к опросам");
          return;
        }

        const items = listData?.items || listData || [];
        if (items.length === 0) {
          test.skip(true, "Нет опросов для теста");
          return;
        }

        const surveyId = items[0].id;
        result = await measureResponseTime(() => surveyAPI.getById(surveyId));
      });

      await test.step("Проверить ответ", async () => {
        expect(
          result.response.ok() || [403, 404].includes(result.response.status()),
        ).toBe(true);
        expect(result.duration).toBeLessThan(THRESHOLDS.NORMAL);

        console.log(`Survey Details response time: ${result.duration}ms`);
      });
    });
  },
);

// ==================== FEEDBACK API ====================

test.describe(
  "API Response Time - Feedback",
  { tag: ["@api", "@performance", "@feedback", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.FEEDBACK, "Response Time");
    });

    test(
      "C5905: GET /feedbacks/ - список feedback",
      { tag: ["@critical"] },
      async ({ feedbackAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: GET /feedbacks/ - список feedback", async () => {
          const result = await measureResponseTime(() =>
            feedbackAPI.getFeedbacks(),
          );

          expect(result.response.ok() || result.response.status() === 403).toBe(
            true,
          );
          expect(result.duration).toBeLessThan(THRESHOLDS.SLOW);

          console.log(
            `Feedback List response time: ${result.duration}ms (threshold: ${THRESHOLDS.SLOW}ms)`,
          );
        });
      },
    );

    test("C5906: GET /feedback-types/ - типы feedback", async ({
      feedbackAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: GET /feedback-types/ - типы feedback", async () => {
        const result = await measureResponseTime(() =>
          feedbackAPI.getFeedbackTypes(),
        );

        expect(result.response.ok() || result.response.status() === 403).toBe(
          true,
        );
        expect(result.duration).toBeLessThan(THRESHOLDS.FAST);

        console.log(
          `Feedback Types response time: ${result.duration}ms (threshold: ${THRESHOLDS.FAST}ms)`,
        );
      });
    });
  },
);

// ==================== OBJECTIVES API ====================

test.describe(
  "API Response Time - Objectives",
  { tag: ["@api", "@performance", "@objectives", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.OBJECTIVES, "Response Time");
    });

    test(
      "C5907: GET /objectives/ - список целей",
      { tag: ["@critical"] },
      async ({ objectivesAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: GET /objectives/ - список целей", async () => {
          const result = await measureResponseTime(() =>
            objectivesAPI.getObjectives(),
          );

          expect([200, 201, 403].includes(result.response.status())).toBe(true);
          expect(result.duration).toBeLessThan(THRESHOLDS.SLOW);

          console.log(
            `Objectives List response time: ${result.duration}ms (threshold: ${THRESHOLDS.SLOW}ms)`,
          );
        });
      },
    );

    test("C5908: GET /objectives/settings/ - настройки", async ({
      objectivesAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: GET /objectives/settings/ - настройки", async () => {
        const result = await measureResponseTime(() =>
          objectivesAPI.getSettings(),
        );

        expect([200, 403, 500].includes(result.response.status())).toBe(true);
        expect(result.duration).toBeLessThan(THRESHOLDS.FAST);

        console.log(`Objectives Settings response time: ${result.duration}ms`);
      });
    });
  },
);

// ==================== ORG STRUCTURE API ====================

test.describe(
  "API Response Time - OrgStructure",
  { tag: ["@api", "@performance", "@org", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.ORG_STRUCTURE, "Response Time");
    });

    test(
      "C5909: GET /org-structure/tree/ - дерево структуры",
      { tag: ["@critical"] },
      async ({ orgAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: GET /org-structure/tree/ - дерево структуры", async () => {
          const result = await measureResponseTime(() => orgAPI.getTreeItems());

          expect(result.response.ok() || result.response.status() === 403).toBe(
            true,
          );
          // Дерево может быть большим, даём больше времени
          expect(result.duration).toBeLessThan(THRESHOLDS.COMPLEX);

          console.log(
            `OrgStructure Tree response time: ${result.duration}ms (threshold: ${THRESHOLDS.COMPLEX}ms)`,
          );
        });
      },
    );

    test("C5910: GET /org-structure/users/ - поиск пользователей", async ({
      orgAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: GET /org-structure/users/ - поиск пользователей", async () => {
        const result = await measureResponseTime(() =>
          orgAPI.findUsers({ search: "test" }),
        );

        expect(result.response.ok() || result.response.status() === 403).toBe(
          true,
        );
        expect(result.duration).toBeLessThan(THRESHOLDS.NORMAL);

        console.log(
          `OrgStructure Users search response time: ${result.duration}ms`,
        );
      });
    });
  },
);

// ==================== PROFILE API ====================

test.describe(
  "API Response Time - Profile",
  { tag: ["@api", "@performance", "@profile", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.PROFILE, "Response Time");
    });

    test(
      "C5911: GET /profile/users/ - список пользователей",
      { tag: ["@critical"] },
      async ({ profileAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: GET /profile/users/ - список пользователей", async () => {
          const result = await measureResponseTime(() => profileAPI.getUsers());

          expect(result.response.ok() || result.response.status() === 403).toBe(
            true,
          );
          expect(result.duration).toBeLessThan(THRESHOLDS.SLOW);

          console.log(
            `Profile Users response time: ${result.duration}ms (threshold: ${THRESHOLDS.SLOW}ms)`,
          );
        });
      },
    );

    test("C5912: GET /profile/colleagues/ - коллеги", async ({
      profileAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: GET /profile/colleagues/ - коллеги", async () => {
        const result = await measureResponseTime(() =>
          profileAPI.getColleagues(),
        );

        expect(result.response.ok() || result.response.status() === 403).toBe(
          true,
        );
        expect(result.duration).toBeLessThan(THRESHOLDS.NORMAL);

        console.log(`Profile Colleagues response time: ${result.duration}ms`);
      });
    });
  },
);

// ==================== NOTIFICATIONS API ====================

test.describe(
  "API Response Time - Notifications",
  { tag: ["@api", "@performance", "@notifications", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.NOTIFICATIONS, "Response Time");
    });

    test(
      "C5913: GET /notifications/ - список уведомлений",
      { tag: ["@critical"] },
      async ({ notificationsAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: GET /notifications/ - список уведомлений", async () => {
          const result = await measureResponseTime(() =>
            notificationsAPI.getNotifications({ limit: 20 }),
          );

          expect(result.response.ok() || result.response.status() === 403).toBe(
            true,
          );
          expect(result.duration).toBeLessThan(THRESHOLDS.NORMAL);

          console.log(
            `Notifications List response time: ${result.duration}ms (threshold: ${THRESHOLDS.NORMAL}ms)`,
          );
        });
      },
    );

    test("C5914: GET /notifications/unread-count/ - счётчик", async ({
      notificationsAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: GET /notifications/unread-count/ - счётчик", async () => {
        const result = await measureResponseTime(() =>
          notificationsAPI.getUnreadCount(),
        );

        expect(result.response.ok() || result.response.status() === 403).toBe(
          true,
        );
        // Счётчик должен быть очень быстрым
        expect(result.duration).toBeLessThan(THRESHOLDS.FAST);

        console.log(
          `Notifications Unread Count response time: ${result.duration}ms (threshold: ${THRESHOLDS.FAST}ms)`,
        );
      });
    });
  },
);

// ==================== KARMA API ====================

test.describe(
  "API Response Time - Karma",
  { tag: ["@api", "@performance", "@karma", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.KARMA, "Response Time");
    });

    test(
      "C5915: GET /karma/balances/ - баланс",
      { tag: ["@critical"] },
      async ({ karmaAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: GET /karma/balances/ - баланс", async () => {
          const result = await measureResponseTime(() =>
            karmaAPI.getUserBalances(),
          );

          expect(result.response.ok() || result.response.status() === 403).toBe(
            true,
          );
          expect(result.duration).toBeLessThan(THRESHOLDS.FAST);

          console.log(
            `Karma Balance response time: ${result.duration}ms (threshold: ${THRESHOLDS.FAST}ms)`,
          );
        });
      },
    );

    test("C5916: GET /karma/transactions/ - транзакции", async ({
      karmaAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: GET /karma/transactions/ - транзакции", async () => {
        const result = await measureResponseTime(() =>
          karmaAPI.getTransactions({ limit: 20 }),
        );

        expect(result.response.ok() || result.response.status() === 403).toBe(
          true,
        );
        expect(result.duration).toBeLessThan(THRESHOLDS.NORMAL);

        console.log(`Karma Transactions response time: ${result.duration}ms`);
      });
    });
  },
);

// ==================== AGGREGATE PERFORMANCE ====================

test.describe(
  "API Response Time - Aggregate Tests",
  { tag: ["@api", "@performance", "@aggregate", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.PERFORMANCE_REVIEW, "Aggregate Performance");
    });

    test(
      "C5917: Множественные параллельные запросы",
      { tag: ["@critical"] },
      async ({ prAPI, surveyAPI, feedbackAPI, notificationsAPI }) => {
        setSeverity("critical");

        let totalTime;
        await test.step("Выполнить запрос: Множественные параллельные запросы", async () => {
          const startTime = Date.now();

          // Параллельные запросы
          const results = await Promise.all([
            prAPI.getList(),
            surveyAPI.getList(),
            feedbackAPI.getFeedbacks(),
            notificationsAPI.getNotifications({ limit: 10 }),
          ]);

          totalTime = Date.now() - startTime;

          // Все запросы должны завершиться успешно
          for (const result of results) {
            expect([200, 403].includes(result.response.status())).toBe(true);
          }

          // Параллельные запросы должны быть быстрее последовательных
        });

        await test.step("Проверить ответ", async () => {
          expect(totalTime).toBeLessThan(THRESHOLDS.COMPLEX);

          console.log(
            `Parallel requests (4 endpoints) total time: ${totalTime}ms (threshold: ${THRESHOLDS.COMPLEX}ms)`,
          );
        });
      },
    );

    test("C5918: Последовательные запросы к одному API", async ({ prAPI }) => {
      setSeverity("normal");

      let avgTime;
      await test.step("Выполнить запрос: Последовательные запросы к одному API", async () => {
        const times = [];

        // 5 последовательных запросов
        for (let i = 0; i < 5; i++) {
          const result = await measureResponseTime(() =>
            prAPI.getList({ limit: 5, offset: i * 5 }),
          );
          if (result.response.ok()) {
            times.push(result.duration);
          }
        }

        if (times.length === 0) {
          test.skip(true, "Нет доступа к PR");
          return;
        }

        avgTime = times.reduce((a, b) => a + b, 0) / times.length;
        const maxTime = Math.max(...times);
        const minTime = Math.min(...times);

        console.log(
          `Sequential requests stats: avg=${avgTime.toFixed(0)}ms, min=${minTime}ms, max=${maxTime}ms`,
        );

        // Среднее время должно быть в пределах нормы
      });

      await test.step("Проверить ответ", async () => {
        expect(avgTime).toBeLessThan(THRESHOLDS.SLOW);
      });
    });

    test("C5919: Время отклика при разных размерах limit", async ({
      prAPI,
    }) => {
      setSeverity("normal");

      let maxDuration;
      await test.step("Выполнить запрос: Время отклика при разных размерах limit", async () => {
        const limits = [5, 10, 20, 50];
        const results = [];

        for (const limit of limits) {
          const result = await measureResponseTime(() =>
            prAPI.getList({ limit }),
          );

          if (result.response.ok()) {
            results.push({ limit, duration: result.duration });
            console.log(`PR List (limit=${limit}): ${result.duration}ms`);
          }
        }

        if (results.length === 0) {
          test.skip(true, "Нет доступа к PR");
          return;
        }

        // Время не должно расти линейно с увеличением limit
        // Проверяем что максимальное время в пределах порога
        maxDuration = Math.max(...results.map((r) => r.duration));
      });

      await test.step("Проверить ответ", async () => {
        expect(maxDuration).toBeLessThan(THRESHOLDS.COMPLEX);
      });
    });
  },
);
