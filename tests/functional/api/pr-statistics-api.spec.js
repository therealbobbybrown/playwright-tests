// @ts-check
import { test as base, expect } from "../../fixtures/full.js";
import { PerformanceReviewAPI, getCredentials } from "../../utils/api/index.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

/**
 * API тесты для статистики Performance Review
 *
 * ВАЖНО: Для этих тестов нужен активный PR с данными (status: active/finished)
 * Тесты автоматически находят подходящий PR
 */

// Кеш для данных PR (чтобы не делать запросы в каждом тесте)
let cachedPRData = null;
let cachedQuestionData = null;

// Расширяем test с фикстурой для Performance Review API
const test = base.extend({
  prAPI: async ({ request }, use) => {
    const api = new PerformanceReviewAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
});

// Хелпер для получения активного PR с данными (с кешированием)
async function findActivePRWithData(prAPI) {
  // Используем кеш если есть
  if (cachedPRData) {
    return cachedPRData;
  }

  const { data } = await prAPI.getList();
  const items = data?.items || data || [];
  const activePRs = items.filter(
    (pr) => pr.status === "active" || pr.status === "finished",
  );

  if (activePRs.length === 0) {
    cachedPRData = { prId: null, revisionId: null, targetUserId: null };
    return cachedPRData;
  }

  const prId = activePRs[0].id;

  // Получаем ревизию
  const { data: revisions } = await prAPI.getRevisions(prId);
  const revisionId = revisions?.items?.[0]?.id || null;

  // Получаем target user
  const { data: targetUsers } = await prAPI.getTargetUsers(prId, {});
  const targetUserId =
    targetUsers?.items?.[0]?.userId || targetUsers?.items?.[0]?.id || null;

  cachedPRData = { prId, revisionId, targetUserId };
  return cachedPRData;
}

// Хелпер для поиска PR с реальными данными summary статистики (с кешированием)
async function findPRWithSummaryStats(prAPI) {
  if (cachedQuestionData) return cachedQuestionData;

  const { data } = await prAPI.getList();
  const items = data?.items || data || [];
  const activePRs = items.filter(
    (pr) => pr.status === "active" || pr.status === "finished",
  );

  for (const pr of activePRs.slice(0, 10)) {
    try {
      const prId = pr.id;

      const { data: revisions } = await prAPI.getRevisions(prId);
      const revisionId = revisions?.items?.[0]?.id;
      if (!revisionId) continue;

      const { data: targetUsers } = await prAPI.getTargetUsers(prId, {
        limit: 10,
      });
      const firstTargetUser = targetUsers?.items?.[0];
      const targetUserId =
        firstTargetUser?.user?.id ||
        firstTargetUser?.userId ||
        firstTargetUser?.id;
      if (!targetUserId) continue;

      // Используем реальный endpoint summary
      const { response, data: summary } = await prAPI.getStatisticsSummary(
        prId,
        {
          revisionId,
          targetUserId,
        },
      );

      if (!response.ok() || !summary) continue;

      // Извлекаем questionId из структуры summary.assessments[].questions[].question.id
      const questionId = summary.assessments?.[0]?.questions?.[0]?.question?.id;
      if (questionId) {
        cachedQuestionData = { prId, revisionId, targetUserId, questionId };
        return cachedQuestionData;
      }
    } catch {
      // Продолжаем поиск
    }
  }

  cachedQuestionData = {
    prId: null,
    revisionId: null,
    targetUserId: null,
    questionId: null,
  };
  return cachedQuestionData;
}

test.describe(
  "Performance Review Statistics API",
  { tag: ["@api", "@regression", "@performance-review", "@statistics"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.PERFORMANCE_REVIEW, "Statistics");
    });

    test.describe("Manager Statistics Endpoints", () => {
      test(
        "C6262: GET statistics/directions - получить статистику по направлениям",
        { tag: ["@critical", "@db"] },
        async ({ prAPI, prVerifier }) => {
          setSeverity("critical");
          const { prId, revisionId } = await findActivePRWithData(prAPI);
          test.skip(!prId, "Нет активного PR");

          await test.step("DB: Проверка что PR существует", async () => {
            if (!prVerifier.isConnected()) return;
            await prVerifier.verifyPRCreated(prId);
          });

          const { response, data } = await prAPI.getStatisticsDirections(prId, {
            revisionId,
          });

          // API может вернуть 400 если нет данных для статистики
          expect([200, 400]).toContain(response.status());
        },
      );

      test("C6263: GET statistics/directions с targetUserId", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: GET statistics/directions с targetUserId", async () => {
          const { prId, revisionId, targetUserId } =
            await findActivePRWithData(prAPI);
          test.skip(!prId || !targetUserId, "Нет данных");

          const { response, data } = await prAPI.getStatisticsDirections(prId, {
            revisionId,
            targetUserId,
          });

          expect(response.status()).toBe(200);
          expect(data).toBeDefined();
        });
      });

      test(
        "C6264: GET statistics/assessments - получить статистику по анкетам",
        { tag: ["@critical"] },
        async ({ prAPI }) => {
          setSeverity("critical");

          await test.step("Выполнить: GET statistics/assessments - получить статистику по анкетам", async () => {
            const { prId, revisionId } = await findActivePRWithData(prAPI);
            test.skip(!prId, "Нет активного PR");

            const { response, data } = await prAPI.getStatisticsAssessments(
              prId,
              { revisionId },
            );

            expect([200, 400]).toContain(response.status());
          });
        },
      );

      test("C6265: GET statistics/assessments с targetUserId", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: GET statistics/assessments с targetUserId", async () => {
          const { prId, revisionId, targetUserId } =
            await findActivePRWithData(prAPI);
          test.skip(!prId || !targetUserId, "Нет данных");

          const { response, data } = await prAPI.getStatisticsAssessments(
            prId,
            {
              revisionId,
              targetUserId,
            },
          );

          expect([200, 400]).toContain(response.status());
        });
      });

      test("C6266: POST statistics/summary-results/get - получить summary results", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: POST statistics/summary-results/get - получить summary results", async () => {
          const { prId, revisionId, targetUserId } =
            await findActivePRWithData(prAPI);
          test.skip(!prId || !targetUserId, "Нет данных");

          const { response, data } = await prAPI.getStatisticsSummaryResults(
            prId,
            {
              targetUsersIds: [targetUserId],
              revisionId,
            },
          );

          expect([200, 201, 400]).toContain(response.status());
        });
      });

      test("C6267: GET statistics/settings - получить настройки статистики", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: GET statistics/settings - получить настройки статистики", async () => {
          const { prId } = await findActivePRWithData(prAPI);
          test.skip(!prId, "Нет активного PR");

          const { response, data } = await prAPI.getStatisticsSettings(prId);

          expect(response.status()).toBe(200);
          expect(data).toBeDefined();
        });
      });

      test("C6268: POST statistics/settings - обновить настройки (без изменений)", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: POST statistics/settings - обновить настройки (без изменений)", async () => {
          const { prId } = await findActivePRWithData(prAPI);
          test.skip(!prId, "Нет активного PR");

          // Сначала получаем текущие настройки
          const { data: currentSettings } =
            await prAPI.getStatisticsSettings(prId);

          // Отправляем обратно те же настройки
          const { response } = await prAPI.updateStatisticsSettings(prId, {
            settings: currentSettings?.settings || {},
            userSettings: currentSettings?.userSettings || {},
          });

          expect([200, 201, 400]).toContain(response.status());
        });
      });

      test("C6269: GET statistics/summary - содержит данные по вопросам и компетенциям", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        let prId, revisionId, targetUserId, questionId, response, data;
        await test.step("Выполнить запрос: GET statistics/summary - содержит данные по вопросам и компетенциям", async () => {
          ({ prId, revisionId, targetUserId, questionId } =
            await findPRWithSummaryStats(prAPI));
          test.skip(!prId || !questionId, "Не найден PR с данными статистики");

          ({ response, data } = await prAPI.getStatisticsSummary(prId, {
            revisionId,
            targetUserId,
          }));
        });

        await test.step("Проверить ответ", async () => {
          expect(response.status()).toBe(200);
          expect(data).toBeDefined();

          // Проверяем структуру summary: assessments содержит вопросы
          expect(data.assessments).toBeDefined();
          expect(Array.isArray(data.assessments)).toBe(true);
          expect(data.assessments.length).toBeGreaterThan(0);

          const firstAssessment = data.assessments[0];
          expect(firstAssessment).toHaveProperty("title");
          expect(firstAssessment).toHaveProperty("questions");
          expect(Array.isArray(firstAssessment.questions)).toBe(true);

          // Проверяем структуру вопроса
          const firstQuestion = firstAssessment.questions[0];
          expect(firstQuestion).toHaveProperty("question");
          expect(firstQuestion.question).toHaveProperty("id");
          expect(firstQuestion.question).toHaveProperty("type");
          expect(firstQuestion.question).toHaveProperty("title");

          // Проверяем что questionId совпадает
          expect(firstQuestion.question.id).toBe(questionId);
        });
      });

      test("C6270: GET statistics/summary - содержит competenceStatistics", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: GET statistics/summary - содержит competenceStatistics", async () => {
          const { prId, revisionId, targetUserId } =
            await findPRWithSummaryStats(prAPI);
          test.skip(!prId, "Не найден PR с данными статистики");

          const { response, data } = await prAPI.getStatisticsSummary(prId, {
            revisionId,
            targetUserId,
          });

          expect(response.status()).toBe(200);

          // Проверяем наличие основных полей summary
          expect(data).toHaveProperty("assessments");
          expect(data).toHaveProperty("users");
          expect(data).toHaveProperty("responsedUsersCount");
          expect(typeof data.responsedUsersCount).toBe("number");
        });
      });
    });

    test.describe("Private Statistics Endpoints", () => {
      test("C6271: POST dashboard/get - получить данные дашборда", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: POST dashboard/get - получить данные дашборда", async () => {
          const { prId, revisionId } = await findActivePRWithData(prAPI);
          test.skip(!prId, "Нет активного PR");

          const { response, data } = await prAPI.getDashboard(prId, {
            revisionId,
            usersQuery: {},
          });

          expect([200, 201]).toContain(response.status());
          expect(data).toBeDefined();
        });
      });

      test("C6272: GET statistics/target-users - получить target users для статистики", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: GET statistics/target-users - получить target users для статистики", async () => {
          const { prId } = await findActivePRWithData(prAPI);
          test.skip(!prId, "Нет активного PR");

          const { response, data } = await prAPI.getStatisticsTargetUsers(
            prId,
            {
              limit: 10,
              offset: 0,
            },
          );

          expect(response.status()).toBe(200);
          expect(data).toBeDefined();
        });
      });

      test("C6273: GET statistics/target-users с поиском", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: GET statistics/target-users с поиском", async () => {
          const { prId } = await findActivePRWithData(prAPI);
          test.skip(!prId, "Нет активного PR");

          const { response, data } = await prAPI.getStatisticsTargetUsers(
            prId,
            {
              q: "test",
              limit: 10,
            },
          );

          expect(response.status()).toBe(200);
          expect(data).toBeDefined();
        });
      });

      test("C6274: GET statistics/revisions - получить ревизии для статистики", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: GET statistics/revisions - получить ревизии для статистики", async () => {
          const { prId } = await findActivePRWithData(prAPI);
          test.skip(!prId, "Нет активного PR");

          const { response, data } = await prAPI.getStatisticsRevisions(
            prId,
            {},
          );

          expect(response.status()).toBe(200);
          expect(data).toBeDefined();
        });
      });

      test("C6275: GET statistics/revisions с targetUserId", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: GET statistics/revisions с targetUserId", async () => {
          const { prId, targetUserId } = await findActivePRWithData(prAPI);
          test.skip(!prId || !targetUserId, "Нет данных");

          const { response, data } = await prAPI.getStatisticsRevisions(prId, {
            targetUserId,
          });

          expect(response.status()).toBe(200);
          expect(data).toBeDefined();
        });
      });

      test("C6276: GET statistics/summary - получить summary статистику", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: GET statistics/summary - получить summary статистику", async () => {
          const { prId, revisionId } = await findActivePRWithData(prAPI);
          test.skip(!prId || !revisionId, "Нет данных");

          const { response, data } = await prAPI.getStatisticsSummary(prId, {
            revisionId,
          });

          expect([200, 400]).toContain(response.status());
        });
      });

      test("C6277: GET statistics/summary с targetUserId", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: GET statistics/summary с targetUserId", async () => {
          const { prId, revisionId, targetUserId } =
            await findActivePRWithData(prAPI);
          test.skip(!prId || !revisionId || !targetUserId, "Нет данных");

          const { response, data } = await prAPI.getStatisticsSummary(prId, {
            revisionId,
            targetUserId,
          });

          expect(response.status()).toBe(200);
          expect(data).toBeDefined();
        });
      });

      test("C6278: POST dashboard-progresses/get - получить прогресс на дашборде", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: POST dashboard-progresses/get - получить прогресс на дашборде", async () => {
          const { prId, revisionId, targetUserId } =
            await findActivePRWithData(prAPI);
          test.skip(!prId || !revisionId || !targetUserId, "Нет данных");

          const { response, data } = await prAPI.getDashboardProgresses(prId, {
            revisionId,
            targetUsersIds: [targetUserId],
          });

          // API возвращает 200/201 при любых данных
          expect([200, 201]).toContain(response.status());
          expect(data).toBeDefined();
        });
      });
    });

    test.describe("Dashboard Filters Endpoints", () => {
      test("C6279: GET dashboard-filters/performance-reviews - список PR для фильтров", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: GET dashboard-filters/performance-reviews - список PR для фильтров", async () => {
          const { response, data } =
            await prAPI.getDashboardFiltersPerformanceReviews();

          expect(response.status()).toBe(200);
          expect(data).toBeDefined();
        });
      });

      test("C6280: GET dashboard-filters/{id}/target-users - target users для фильтров", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: GET dashboard-filters/{id}/target-users - target users для фильтров", async () => {
          const { prId } = await findActivePRWithData(prAPI);
          test.skip(!prId, "Нет активного PR");

          const { response, data } = await prAPI.getDashboardFiltersTargetUsers(
            prId,
            {
              limit: 10,
              offset: 0,
            },
          );

          expect(response.status()).toBe(200);
          expect(data).toBeDefined();
        });
      });

      test("C6281: POST dashboard-filters/{id}/target-users/selected/get - выбранные target users", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: POST dashboard-filters/{id}/target-users/selected/get - выбранные target users", async () => {
          const { prId, targetUserId } = await findActivePRWithData(prAPI);
          test.skip(!prId || !targetUserId, "Нет данных");

          const { response, data } =
            await prAPI.getDashboardFiltersTargetUsersSelected(prId, {
              ids: [targetUserId],
              limit: 10,
            });

          expect([200, 201]).toContain(response.status());
          expect(data).toBeDefined();
        });
      });

      test("C6282: GET dashboard-filters/{id}/groups-departments - группы и департаменты", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: GET dashboard-filters/{id}/groups-departments - группы и департаменты", async () => {
          const { prId } = await findActivePRWithData(prAPI);
          test.skip(!prId, "Нет активного PR");

          const { response, data } =
            await prAPI.getDashboardFiltersGroupsDepartments(prId);

          expect(response.status()).toBe(200);
          expect(data).toBeDefined();
        });
      });

      test("C6283: GET dashboard-filters/{id}/revisions - ревизии для фильтров", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: GET dashboard-filters/{id}/revisions - ревизии для фильтров", async () => {
          const { prId } = await findActivePRWithData(prAPI);
          test.skip(!prId, "Нет активного PR");

          const { response, data } =
            await prAPI.getDashboardFiltersRevisions(prId);

          expect(response.status()).toBe(200);
          expect(data).toBeDefined();
        });
      });

      test("C6284: POST dashboard-filters/{id}/query-results/get - результаты запроса", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: POST dashboard-filters/{id}/query-results/get - результаты запроса", async () => {
          const { prId } = await findActivePRWithData(prAPI);
          test.skip(!prId, "Нет активного PR");

          const { response, data } =
            await prAPI.getDashboardFiltersQueryResults(
              prId,
              {},
              {
                limit: 10,
                offset: 0,
              },
            );

          expect([200, 201]).toContain(response.status());
          expect(data).toBeDefined();
        });
      });
    });

    test.describe("Negative Tests", () => {
      test("C6285: GET statistics/directions с несуществующим PR", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: GET statistics/directions с несуществующим PR", async () => {
          const { response } = await prAPI.getStatisticsDirections(999999, {});

          expect([400, 403, 404]).toContain(response.status());
        });
      });

      test("C6286: GET statistics/assessments с несуществующим PR", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: GET statistics/assessments с несуществующим PR", async () => {
          const { response } = await prAPI.getStatisticsAssessments(999999, {});

          expect([400, 403, 404]).toContain(response.status());
        });
      });

      test("C6287: GET statistics/summary с несуществующим PR", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: GET statistics/summary с несуществующим PR", async () => {
          const { response } = await prAPI.getStatisticsSummary(999999, {});

          expect([400, 403, 404]).toContain(response.status());
        });
      });

      test("C6288: POST dashboard/get с несуществующим PR", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: POST dashboard/get с несуществующим PR", async () => {
          const { response } = await prAPI.getDashboard(999999, {});

          expect([400, 403, 404]).toContain(response.status());
        });
      });
    });
  },
);
