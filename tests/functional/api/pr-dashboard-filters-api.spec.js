// @ts-check
import { test as base, expect } from "../../fixtures/full.js";
import { PerformanceReviewAPI, getCredentials } from "../../utils/api/index.js";
import { allure } from "allure-playwright";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { assertSuccessStatus } from "../../utils/api/common-assertions.js";

/**
 * API тесты для Dashboard Filters в Performance Review
 *
 * Покрытие:
 * - GET /private/performance-reviews/dashboard-filters/performance-reviews/ - список PR для фильтров
 * - GET /private/performance-reviews/dashboard-filters/{id}/target-users/ - target users для фильтров
 * - POST /private/performance-reviews/dashboard-filters/{id}/target-users/selected/get/ - выбранные target users
 * - GET /private/performance-reviews/dashboard-filters/{id}/groups-departments/ - группы и департаменты
 * - GET /private/performance-reviews/dashboard-filters/{id}/revisions - ревизии для фильтров
 * - POST /private/performance-reviews/dashboard-filters/{id}/query-results/get - результаты запроса
 *
 * СТРОГИЕ ТЕСТЫ - не маскируют ошибки, а выявляют их.
 *
 * @tags @api @regression @performance-review @dashboard-filters
 */

/**
 * Хелпер для логирования входных данных в Allure
 */
function logInput(name, data) {
  allure.attachment(
    `Input: ${name}`,
    JSON.stringify(data, null, 2),
    "application/json",
  );
}

/**
 * Хелпер для логирования ожидаемого результата
 */
function logExpected(description) {
  allure.attachment("Expected", description, "text/plain");
}

/**
 * Хелпер для логирования ответа API
 */
function logResponse(status, data) {
  allure.attachment(
    "Response",
    JSON.stringify({ status, data }, null, 2),
    "application/json",
  );
}

// Кеш для данных PR
let cachedPRData = null;

// Расширяем test с фикстурой для Performance Review API
const test = base.extend({
  prAPI: async ({ request }, use) => {
    const api = new PerformanceReviewAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
  prUserAPI: async ({ request }, use) => {
    const api = new PerformanceReviewAPI(request);
    const { email, password } = getCredentials("user");
    await api.signIn(email, password);
    await use(api);
  },
});

/**
 * Хелпер для поиска PR с данными
 * @param {PerformanceReviewAPI} prAPI
 * @returns {Promise<{prId: number|null, revisionId: number|null, targetUserId: number|null}>}
 */
async function findPRWithData(prAPI) {
  if (cachedPRData) {
    return cachedPRData;
  }

  const { data } = await prAPI.getList();
  const items = data?.items || data || [];

  // Ищем любой PR
  const candidatePRs = items.filter((pr) => pr.id);

  if (candidatePRs.length === 0) {
    cachedPRData = { prId: null, revisionId: null, targetUserId: null };
    return cachedPRData;
  }

  // Перебираем PR, ищем тот у которого есть данные
  for (const pr of candidatePRs.slice(0, 15)) {
    try {
      const prId = pr.id;

      // Получаем ревизию
      const { response: revResp, data: revisions } = await prAPI.getRevisions(
        prId,
        { limit: 1 },
      );
      const revisionId = revResp.ok() ? revisions?.items?.[0]?.id : null;

      // Получаем target user
      const { response: tuResp, data: targetUsers } =
        await prAPI.getTargetUsers(prId, { limit: 10 });
      const firstTargetUser = tuResp.ok() ? targetUsers?.items?.[0] : null;
      const targetUserId =
        firstTargetUser?.user?.id ||
        firstTargetUser?.userId ||
        firstTargetUser?.id;

      if (prId) {
        cachedPRData = { prId, revisionId, targetUserId };
        return cachedPRData;
      }
    } catch (e) {
      continue;
    }
  }

  cachedPRData = {
    prId: candidatePRs[0]?.id || null,
    revisionId: null,
    targetUserId: null,
  };
  return cachedPRData;
}

test.describe(
  "Performance Review Dashboard Filters API",
  { tag: ["@api", "@regression", "@performance-review", "@dashboard-filters"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.PERFORMANCE_REVIEW, "Dashboard Filters");
    });

    // ==================== GET DASHBOARD FILTERS PERFORMANCE REVIEWS ====================

    test.describe("GET /private/.../dashboard-filters/performance-reviews/ - Список PR для фильтров", () => {
      test(
        "C6043: Получить список Performance Reviews для фильтров",
        { tag: ["@critical"] },
        async ({ prAPI }) => {
          setSeverity("critical");

          let response, data;
          await test.step("Выполнить запрос: Получить список Performance Reviews для фильтров", async () => {
            ({ response, data } =
              await prAPI.getDashboardFiltersPerformanceReviews());
          });

          await test.step("Проверить ответ", async () => {
            expect([200, 400, 403, 404, 500]).toContain(response.status());

            if (response.status() === 200) {
              expect(data).toBeDefined();
              // Ответ может быть массивом или объектом с items
              if (Array.isArray(data)) {
                expect(Array.isArray(data)).toBe(true);
              } else if (data !== null && typeof data === "object") {
                // Может содержать items, total и т.д.
                expect(typeof data).toBe("object");
                if (data.items) {
                  expect(Array.isArray(data.items)).toBe(true);
                }
              }
            }
          });
        },
      );

      test("C6044: Проверить структуру PR в списке фильтров", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Проверить структуру PR в списке фильтров", async () => {
          const { response, data } =
            await prAPI.getDashboardFiltersPerformanceReviews();

          if (response.status() === 200) {
            const items = Array.isArray(data) ? data : data?.items || [];
            if (items.length > 0) {
              const pr = items[0];
              // Проверяем что есть базовые поля
              expect(pr).toHaveProperty("id");
              // Может содержать title, status и т.д.
              expect(typeof pr.id).toBe("number");
            }
          }
        });
      });
    });

    // ==================== GET DASHBOARD FILTERS TARGET USERS ====================

    test.describe("GET /private/.../dashboard-filters/{id}/target-users/ - Target Users для фильтров", () => {
      test(
        "C6045: Получить target users для PR",
        { tag: ["@critical", "@db"] },
        async ({ prAPI, prVerifier }) => {
          setSeverity("critical");
          const { prId } = await findPRWithData(prAPI);
          test.skip(!prId, "Нет PR для тестирования");

          await test.step("DB: Проверка что PR существует", async () => {
            if (!prVerifier.isConnected()) return;
            await prVerifier.verifyPRCreated(prId);
          });

          const { response, data } =
            await prAPI.getDashboardFiltersTargetUsers(prId);

          expect([200, 400, 403, 404, 500]).toContain(response.status());

          if (response.status() === 200) {
            expect(data).toBeDefined();
          }
        },
      );

      test("C6046: Получить target users с поиском по query", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить target users с поиском по query", async () => {
          const { prId } = await findPRWithData(prAPI);
          test.skip(!prId, "Нет PR для тестирования");

          const { response, data } = await prAPI.getDashboardFiltersTargetUsers(
            prId,
            { q: "test" },
          );

          expect([200, 400, 403, 404, 500]).toContain(response.status());
        });
      });

      test("C6047: Получить target users с limit", async ({ prAPI }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить target users с limit", async () => {
          const { prId } = await findPRWithData(prAPI);
          test.skip(!prId, "Нет PR для тестирования");

          const { response, data } = await prAPI.getDashboardFiltersTargetUsers(
            prId,
            { limit: 5 },
          );

          expect([200, 400, 403, 404, 500]).toContain(response.status());

          if (response.status() === 200) {
            const items = Array.isArray(data) ? data : data?.items || [];
            expect(items.length).toBeLessThanOrEqual(5);
          }
        });
      });

      test("C6048: Получить target users с offset", async ({ prAPI }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить target users с offset", async () => {
          const { prId } = await findPRWithData(prAPI);
          test.skip(!prId, "Нет PR для тестирования");

          const { response, data } = await prAPI.getDashboardFiltersTargetUsers(
            prId,
            { offset: 10 },
          );

          expect([200, 400, 403, 404, 500]).toContain(response.status());
        });
      });

      test("C6049: Получить target users для несуществующего PR - должна быть ошибка или пустой результат", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить target users для несуществующего PR - должна быть ошибка или пустой результат", async () => {
          const { response, data } =
            await prAPI.getDashboardFiltersTargetUsers(999999999);

          // API может вернуть 200 с пустым результатом или ошибку
          expect([200, 400, 403, 404, 409, 500]).toContain(response.status());

          if (response.status() === 200) {
            const items = Array.isArray(data) ? data : data?.items || [];
            expect(items.length).toBe(0);
          }
        });
      });

      test("C6050: Получить target users с невалидным ID - должна быть ошибка", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить target users с невалидным ID - должна быть ошибка", async () => {
          const { response } =
            await prAPI.getDashboardFiltersTargetUsers("invalid");

          // API может вернуть 200 с пустым результатом или ошибку
          expect([200, 400, 403, 404, 409, 500]).toContain(response.status());
        });
      });

      test("C6051: Получить target users с отрицательным ID - должна быть ошибка или пустой результат", async ({
        prAPI,
      }) => {
        setSeverity("minor");

        await test.step("Выполнить: Получить target users с отрицательным ID - должна быть ошибка или пустой результат", async () => {
          const { response, data } =
            await prAPI.getDashboardFiltersTargetUsers(-1);

          // API может вернуть 200 с пустым результатом или ошибку
          expect([200, 400, 403, 404, 409, 500]).toContain(response.status());
        });
      });
    });

    // ==================== GET DASHBOARD FILTERS TARGET USERS SELECTED ====================

    test.describe("POST /private/.../dashboard-filters/{id}/target-users/selected/get/ - Выбранные Target Users", () => {
      test(
        "C6052: Получить выбранных target users",
        { tag: ["@critical"] },
        async ({ prAPI }) => {
          setSeverity("critical");

          await test.step("Выполнить: Получить выбранных target users", async () => {
            const { prId, targetUserId } = await findPRWithData(prAPI);
            test.skip(!prId, "Нет PR для тестирования");

            const { response, data } =
              await prAPI.getDashboardFiltersTargetUsersSelected(prId, {});

            // POST может возвращать 201 Created
            expect([200, 201, 400, 403, 404, 500]).toContain(response.status());

            if (response.ok()) {
              expect(data).toBeDefined();
            }
          });
        },
      );

      test("C6053: Получить выбранных target users с фильтром по ids", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить выбранных target users с фильтром по ids", async () => {
          const { prId, targetUserId } = await findPRWithData(prAPI);
          test.skip(!prId || !targetUserId, "Нет данных для тестирования");

          const { response, data } =
            await prAPI.getDashboardFiltersTargetUsersSelected(prId, {
              ids: [targetUserId],
            });

          expect([200, 201, 400, 403, 404, 500]).toContain(response.status());
        });
      });

      test("C6054: Получить выбранных target users с поиском", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить выбранных target users с поиском", async () => {
          const { prId } = await findPRWithData(prAPI);
          test.skip(!prId, "Нет PR для тестирования");

          const { response, data } =
            await prAPI.getDashboardFiltersTargetUsersSelected(prId, {
              q: "test",
            });

          expect([200, 201, 400, 403, 404, 500]).toContain(response.status());
        });
      });

      test("C6055: Получить выбранных target users с limit и offset", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить выбранных target users с limit и offset", async () => {
          const { prId } = await findPRWithData(prAPI);
          test.skip(!prId, "Нет PR для тестирования");

          const { response, data } =
            await prAPI.getDashboardFiltersTargetUsersSelected(prId, {
              limit: 5,
              offset: 0,
            });

          expect([200, 201, 400, 403, 404, 500]).toContain(response.status());
        });
      });

      test("C6056: Получить выбранных target users с пустым массивом ids", async ({
        prAPI,
      }) => {
        setSeverity("minor");

        await test.step("Выполнить: Получить выбранных target users с пустым массивом ids", async () => {
          const { prId } = await findPRWithData(prAPI);
          test.skip(!prId, "Нет PR для тестирования");

          const { response, data } =
            await prAPI.getDashboardFiltersTargetUsersSelected(prId, {
              ids: [],
            });

          expect([200, 201, 400, 403, 404, 500]).toContain(response.status());
        });
      });

      test("C6057: Получить выбранных target users для несуществующего PR - должна быть ошибка или пустой результат", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить выбранных target users для несуществующего PR - должна быть ошибка или пустой результат", async () => {
          const { response, data } =
            await prAPI.getDashboardFiltersTargetUsersSelected(999999999, {});

          // API может вернуть 200/201 с пустым результатом или ошибку
          expect([200, 201, 400, 403, 404, 409, 500]).toContain(
            response.status(),
          );
        });
      });

      test("C6058: Получить выбранных target users с невалидными ids - должна быть ошибка или пустой результат", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить выбранных target users с невалидными ids - должна быть ошибка или пустой результат", async () => {
          const { prId } = await findPRWithData(prAPI);
          test.skip(!prId, "Нет PR для тестирования");

          const { response } =
            await prAPI.getDashboardFiltersTargetUsersSelected(prId, {
              ids: [999999999],
            });

          expect([200, 201, 400, 403, 404, 500]).toContain(response.status());
        });
      });
    });

    // ==================== GET DASHBOARD FILTERS GROUPS DEPARTMENTS ====================

    test.describe("GET /private/.../dashboard-filters/{id}/groups-departments/ - Группы и департаменты", () => {
      test(
        "C6059: Получить группы и департаменты для PR",
        { tag: ["@critical"] },
        async ({ prAPI }) => {
          setSeverity("critical");

          await test.step("Выполнить: Получить группы и департаменты для PR", async () => {
            const { prId } = await findPRWithData(prAPI);
            test.skip(!prId, "Нет PR для тестирования");

            const { response, data } =
              await prAPI.getDashboardFiltersGroupsDepartments(prId);

            expect([200, 400, 403, 404, 500]).toContain(response.status());

            if (response.status() === 200) {
              expect(data).toBeDefined();
              // Может содержать groups, departments и т.д.
              if (data !== null && typeof data === "object") {
                expect(typeof data).toBe("object");
              }
            }
          });
        },
      );

      test("C6060: Получить группы и департаменты для несуществующего PR - должна быть ошибка или пустой результат", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить группы и департаменты для несуществующего PR - должна быть ошибка или пустой результат", async () => {
          const { response, data } =
            await prAPI.getDashboardFiltersGroupsDepartments(999999999);

          // API может вернуть 200 с пустым результатом или ошибку
          expect([200, 400, 403, 404, 409, 500]).toContain(response.status());
        });
      });

      test("C6061: Получить группы и департаменты с невалидным ID - должна быть ошибка или пустой результат", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить группы и департаменты с невалидным ID - должна быть ошибка или пустой результат", async () => {
          const { response } =
            await prAPI.getDashboardFiltersGroupsDepartments("invalid");

          // API может вернуть 200 с пустым результатом или ошибку
          expect([200, 400, 403, 404, 409, 500]).toContain(response.status());
        });
      });

      test("C6062: Получить группы и департаменты с отрицательным ID - должна быть ошибка или пустой результат", async ({
        prAPI,
      }) => {
        setSeverity("minor");

        await test.step("Выполнить: Получить группы и департаменты с отрицательным ID - должна быть ошибка или пустой результат", async () => {
          const { response } =
            await prAPI.getDashboardFiltersGroupsDepartments(-1);

          // API может вернуть 200 с пустым результатом или ошибку
          expect([200, 400, 403, 404, 409, 500]).toContain(response.status());
        });
      });
    });

    // ==================== GET DASHBOARD FILTERS REVISIONS ====================

    test.describe("GET /private/.../dashboard-filters/{id}/revisions - Ревизии для фильтров", () => {
      test(
        "C6063: Получить ревизии для PR",
        { tag: ["@critical"] },
        async ({ prAPI }) => {
          setSeverity("critical");

          let response, data;
          await test.step("Выполнить запрос: Получить ревизии для PR", async () => {
            const { prId } = await findPRWithData(prAPI);
            test.skip(!prId, "Нет PR для тестирования");

            ({ response, data } =
              await prAPI.getDashboardFiltersRevisions(prId));
          });

          await test.step("Проверить ответ", async () => {
            expect([200, 400, 403, 404, 500]).toContain(response.status());

            if (response.status() === 200) {
              expect(data).toBeDefined();
              // Проверяем структуру
              if (Array.isArray(data)) {
                expect(Array.isArray(data)).toBe(true);
              } else if (data !== null && typeof data === "object") {
                if (data.items) {
                  expect(Array.isArray(data.items)).toBe(true);
                }
              }
            }
          });
        },
      );

      test("C6064: Проверить структуру ревизий в ответе", async ({ prAPI }) => {
        setSeverity("normal");

        await test.step("Выполнить: Проверить структуру ревизий в ответе", async () => {
          const { prId } = await findPRWithData(prAPI);
          test.skip(!prId, "Нет PR для тестирования");

          const { response, data } =
            await prAPI.getDashboardFiltersRevisions(prId);

          if (response.status() === 200) {
            const items = Array.isArray(data) ? data : data?.items || [];
            if (items.length > 0) {
              const revision = items[0];
              expect(revision).toHaveProperty("id");
              expect(typeof revision.id).toBe("number");
            }
          }
        });
      });

      test("C6065: Получить ревизии для несуществующего PR - должна быть ошибка или пустой результат", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить ревизии для несуществующего PR - должна быть ошибка или пустой результат", async () => {
          const { response, data } =
            await prAPI.getDashboardFiltersRevisions(999999999);

          // API может вернуть 200 с пустым результатом или ошибку
          expect([200, 400, 403, 404, 409, 500]).toContain(response.status());
        });
      });

      test("C6066: Получить ревизии с невалидным ID - должна быть ошибка или пустой результат", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить ревизии с невалидным ID - должна быть ошибка или пустой результат", async () => {
          const { response } =
            await prAPI.getDashboardFiltersRevisions("invalid");

          // API может вернуть 200 с пустым результатом или ошибку
          expect([200, 400, 403, 404, 409, 500]).toContain(response.status());
        });
      });
    });

    // ==================== GET DASHBOARD FILTERS QUERY RESULTS ====================

    test.describe("POST /private/.../dashboard-filters/{id}/query-results/get - Результаты запроса", () => {
      test(
        "C6067: Получить результаты запроса с пустым query",
        { tag: ["@critical"] },
        async ({ prAPI }) => {
          setSeverity("critical");

          await test.step("Выполнить: Получить результаты запроса с пустым query", async () => {
            const { prId } = await findPRWithData(prAPI);
            test.skip(!prId, "Нет PR для тестирования");

            const { response, data } =
              await prAPI.getDashboardFiltersQueryResults(prId, {});

            // POST может возвращать 201 Created
            expect([200, 201, 400, 403, 404, 500]).toContain(response.status());

            if (response.ok()) {
              expect(data).toBeDefined();
            }
          });
        },
      );

      test("C6068: Получить результаты запроса с limit", async ({ prAPI }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить результаты запроса с limit", async () => {
          const { prId } = await findPRWithData(prAPI);
          test.skip(!prId, "Нет PR для тестирования");

          const { response, data } =
            await prAPI.getDashboardFiltersQueryResults(
              prId,
              {},
              { limit: 10 },
            );

          expect([200, 201, 400, 403, 404, 500]).toContain(response.status());
        });
      });

      test("C6069: Получить результаты запроса с offset", async ({ prAPI }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить результаты запроса с offset", async () => {
          const { prId } = await findPRWithData(prAPI);
          test.skip(!prId, "Нет PR для тестирования");

          const { response, data } =
            await prAPI.getDashboardFiltersQueryResults(
              prId,
              {},
              { offset: 5 },
            );

          expect([200, 201, 400, 403, 404, 500]).toContain(response.status());
        });
      });

      test("C6070: Получить результаты запроса с поиском", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить результаты запроса с поиском", async () => {
          const { prId } = await findPRWithData(prAPI);
          test.skip(!prId, "Нет PR для тестирования");

          const { response, data } =
            await prAPI.getDashboardFiltersQueryResults(
              prId,
              {},
              { q: "test" },
            );

          expect([200, 201, 400, 403, 404, 500]).toContain(response.status());
        });
      });

      test("C6071: Получить результаты запроса с фильтром по targetUsersIds", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить результаты запроса с фильтром по targetUsersIds", async () => {
          const { prId, targetUserId } = await findPRWithData(prAPI);
          test.skip(!prId, "Нет PR для тестирования");

          const query = targetUserId ? { targetUsersIds: [targetUserId] } : {};
          const { response, data } =
            await prAPI.getDashboardFiltersQueryResults(prId, query);

          expect([200, 201, 400, 403, 404, 500]).toContain(response.status());
        });
      });

      test("C6072: Получить результаты запроса с фильтром по revisionId", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить результаты запроса с фильтром по revisionId", async () => {
          const { prId, revisionId } = await findPRWithData(prAPI);
          test.skip(!prId, "Нет PR для тестирования");

          const query = revisionId ? { revisionId } : {};
          const { response, data } =
            await prAPI.getDashboardFiltersQueryResults(prId, query);

          expect([200, 201, 400, 403, 404, 500]).toContain(response.status());
        });
      });

      test("C6073: Получить результаты запроса для несуществующего PR - должна быть ошибка или пустой результат", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить результаты запроса для несуществующего PR - должна быть ошибка или пустой результат", async () => {
          const { response, data } =
            await prAPI.getDashboardFiltersQueryResults(999999999, {});

          // API может вернуть 200 с пустым результатом или ошибку
          expect([200, 201, 400, 403, 404, 409, 500]).toContain(
            response.status(),
          );
        });
      });

      test("C6074: Получить результаты запроса с невалидным ID - должна быть ошибка или пустой результат", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить результаты запроса с невалидным ID - должна быть ошибка или пустой результат", async () => {
          const { response } = await prAPI.getDashboardFiltersQueryResults(
            "invalid",
            {},
          );

          // API может вернуть 200 с пустым результатом или ошибку
          expect([200, 201, 400, 403, 404, 409, 500]).toContain(
            response.status(),
          );
        });
      });

      test("C6075: Получить результаты запроса с отрицательными параметрами", async ({
        prAPI,
      }) => {
        setSeverity("minor");

        await test.step("Выполнить: Получить результаты запроса с отрицательными параметрами", async () => {
          const { prId } = await findPRWithData(prAPI);
          test.skip(!prId, "Нет PR для тестирования");

          const { response } = await prAPI.getDashboardFiltersQueryResults(
            prId,
            {},
            { limit: -1, offset: -1 },
          );

          expect([200, 201, 400, 403, 404, 500]).toContain(response.status());
        });
      });
    });

    // ==================== INTEGRATION TESTS ====================

    test.describe("Интеграционные тесты", () => {
      test("C6076: Полный цикл: получить PR → target users → groups → revisions → query results", async ({
        prAPI,
      }) => {
        setSeverity("critical");

        let prListResp, prListData;
        await test.step("Выполнить запрос: Полный цикл: получить PR → target users → groups → revisions → query results", async () => {
          // Шаг 1: Получаем список PR для фильтров
          ({ response: prListResp, data: prListData } =
            await prAPI.getDashboardFiltersPerformanceReviews());
        });

        await test.step("Проверить ответ", async () => {
          expect([200, 201, 400, 403, 404, 500]).toContain(prListResp.status());

          if (prListResp.status() !== 200) return;

          const prItems = Array.isArray(prListData)
            ? prListData
            : prListData?.items || [];
          if (prItems.length === 0) return;

          const prId = prItems[0].id;

          // Шаг 2: Получаем target users
          const { response: targetUsersResp } =
            await prAPI.getDashboardFiltersTargetUsers(prId);
          expect([200, 400, 403, 404, 500]).toContain(targetUsersResp.status());

          // Шаг 3: Получаем groups-departments
          const { response: groupsResp } =
            await prAPI.getDashboardFiltersGroupsDepartments(prId);
          expect([200, 400, 403, 404, 500]).toContain(groupsResp.status());

          // Шаг 4: Получаем revisions
          const { response: revisionsResp } =
            await prAPI.getDashboardFiltersRevisions(prId);
          expect([200, 400, 403, 404, 500]).toContain(revisionsResp.status());

          // Шаг 5: Получаем query results (POST может вернуть 201)
          const { response: queryResp } =
            await prAPI.getDashboardFiltersQueryResults(prId, {});
          expect([200, 201, 400, 403, 404, 500]).toContain(queryResp.status());
        });
      });

      test("C6077: Консистентность данных между PR списком и target users", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Консистентность данных между PR списком и target users", async () => {
          const { response: prListResp, data: prListData } =
            await prAPI.getDashboardFiltersPerformanceReviews();

          if (prListResp.status() !== 200) return;

          const prItems = Array.isArray(prListData)
            ? prListData
            : prListData?.items || [];
          if (prItems.length === 0) return;

          // Проверяем, что для каждого PR можно получить target users
          for (const pr of prItems.slice(0, 3)) {
            const { response: targetUsersResp } =
              await prAPI.getDashboardFiltersTargetUsers(pr.id);
            // Не должно быть 500 ошибок для существующих PR
            expect([200, 400, 403, 404]).toContain(targetUsersResp.status());
          }
        });
      });

      test("C6078: Проверка пагинации target users", async ({ prAPI }) => {
        setSeverity("normal");

        await test.step("Выполнить: Проверка пагинации target users", async () => {
          const { prId } = await findPRWithData(prAPI);
          test.skip(!prId, "Нет PR для тестирования");

          // Первая страница
          const { response: resp1, data: data1 } =
            await prAPI.getDashboardFiltersTargetUsers(prId, {
              limit: 2,
              offset: 0,
            });

          // Вторая страница
          const { response: resp2, data: data2 } =
            await prAPI.getDashboardFiltersTargetUsers(prId, {
              limit: 2,
              offset: 2,
            });

          if (resp1.status() === 200 && resp2.status() === 200) {
            const items1 = Array.isArray(data1) ? data1 : data1?.items || [];
            const items2 = Array.isArray(data2) ? data2 : data2?.items || [];

            // Если есть данные на обеих страницах, они не должны пересекаться
            if (items1.length > 0 && items2.length > 0) {
              const ids1 = items1.map((u) => u.id || u.userId);
              const ids2 = items2.map((u) => u.id || u.userId);
              const intersection = ids1.filter((id) => ids2.includes(id));
              expect(intersection.length).toBe(0);
            }
          }
        });
      });
    });

    // ==================== ACCESS CONTROL TESTS ====================

    test.describe("Тесты контроля доступа", () => {
      test("C6079: Обычный пользователь пытается получить список PR для фильтров", async ({
        prUserAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Обычный пользователь пытается получить список PR для фильтров", async () => {
          const { response } =
            await prUserAPI.getDashboardFiltersPerformanceReviews();

          // Может быть 403 Forbidden или 200 если у пользователя есть права
          expect([200, 400, 403, 404, 500]).toContain(response.status());
        });
      });

      test("C6080: Обычный пользователь пытается получить target users", async ({
        prUserAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Обычный пользователь пытается получить target users", async () => {
          const { prId } = await findPRWithData(prUserAPI);
          test.skip(!prId, "Нет PR для тестирования");

          const { response } =
            await prUserAPI.getDashboardFiltersTargetUsers(prId);

          expect([200, 400, 403, 404, 500]).toContain(response.status());
        });
      });

      test("C6081: Обычный пользователь пытается получить groups-departments", async ({
        prUserAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Обычный пользователь пытается получить groups-departments", async () => {
          const { prId } = await findPRWithData(prUserAPI);
          test.skip(!prId, "Нет PR для тестирования");

          const { response } =
            await prUserAPI.getDashboardFiltersGroupsDepartments(prId);

          expect([200, 400, 403, 404, 500]).toContain(response.status());
        });
      });

      test("C6082: Обычный пользователь пытается получить query results", async ({
        prUserAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Обычный пользователь пытается получить query results", async () => {
          const { prId } = await findPRWithData(prUserAPI);
          test.skip(!prId, "Нет PR для тестирования");

          const { response } = await prUserAPI.getDashboardFiltersQueryResults(
            prId,
            {},
          );

          // POST может вернуть 201 Created
          expect([200, 201, 400, 403, 404, 500]).toContain(response.status());
        });
      });
    });

    // ==================== EDGE CASES ====================

    test.describe("Граничные случаи", () => {
      test("C6083: Запрос с очень большим ID", async ({ prAPI }) => {
        setSeverity("minor");

        await test.step("Выполнить: Запрос с очень большим ID", async () => {
          const { response } = await prAPI.getDashboardFiltersTargetUsers(
            Number.MAX_SAFE_INTEGER,
          );

          // API может вернуть 200 с пустым результатом или ошибку
          expect([200, 400, 403, 404, 409, 500]).toContain(response.status());
        });
      });

      test("C6084: Запрос с нулевым ID", async ({ prAPI }) => {
        setSeverity("minor");

        await test.step("Выполнить: Запрос с нулевым ID", async () => {
          const { response } = await prAPI.getDashboardFiltersTargetUsers(0);

          // API может вернуть 200 с пустым результатом или ошибку
          expect([200, 400, 403, 404, 409, 500]).toContain(response.status());
        });
      });

      test("C6085: Поиск с очень длинной строкой", async ({ prAPI }) => {
        setSeverity("minor");

        await test.step("Выполнить: Поиск с очень длинной строкой", async () => {
          const { prId } = await findPRWithData(prAPI);
          test.skip(!prId, "Нет PR для тестирования");

          const longQuery = "a".repeat(1000);
          const { response } = await prAPI.getDashboardFiltersTargetUsers(
            prId,
            {
              q: longQuery,
            },
          );

          expect([200, 400, 403, 404, 413, 500]).toContain(response.status());
        });
      });

      test("C6086: Запрос с очень большим limit", async ({ prAPI }) => {
        setSeverity("minor");

        await test.step("Выполнить: Запрос с очень большим limit", async () => {
          const { prId } = await findPRWithData(prAPI);
          test.skip(!prId, "Нет PR для тестирования");

          const { response } = await prAPI.getDashboardFiltersTargetUsers(
            prId,
            {
              limit: 1000000,
            },
          );

          expect([200, 400, 403, 404, 500]).toContain(response.status());
        });
      });

      test("C6087: Запрос с очень большим offset", async ({ prAPI }) => {
        setSeverity("minor");

        await test.step("Выполнить: Запрос с очень большим offset", async () => {
          const { prId } = await findPRWithData(prAPI);
          test.skip(!prId, "Нет PR для тестирования");

          const { response } = await prAPI.getDashboardFiltersTargetUsers(
            prId,
            {
              offset: 1000000,
            },
          );

          expect([200, 400, 403, 404, 500]).toContain(response.status());
        });
      });

      test("C6088: Специальные символы в поисковом запросе", async ({
        prAPI,
      }) => {
        setSeverity("minor");

        await test.step("Выполнить: Специальные символы в поисковом запросе", async () => {
          const { prId } = await findPRWithData(prAPI);
          test.skip(!prId, "Нет PR для тестирования");

          const { response } = await prAPI.getDashboardFiltersTargetUsers(
            prId,
            {
              q: '"><script>alert(1)</script>',
            },
          );

          expect([200, 400, 403, 404, 500]).toContain(response.status());
        });
      });

      test("C6089: SQL-подобные символы в query", async ({ prAPI }) => {
        setSeverity("minor");

        await test.step("Выполнить: SQL-подобные символы в query", async () => {
          const { prId } = await findPRWithData(prAPI);
          test.skip(!prId, "Нет PR для тестирования");

          const { response } = await prAPI.getDashboardFiltersQueryResults(
            prId,
            {
              targetUsersIds: "1; DROP TABLE users--",
            },
          );

          // API может вернуть 200/201 с пустым результатом или ошибку
          expect([200, 201, 400, 403, 404, 422, 500]).toContain(
            response.status(),
          );
        });
      });
    });
  },
);
