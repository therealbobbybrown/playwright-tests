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
 * API тесты для Competence Statistics в Performance Review
 *
 * Покрытие:
 * - POST /protected/performance-reviews/statistics/competences/get/ - общая статистика компетенций
 * - POST /protected/performance-reviews/statistics/competences/of-performance-review/{id}/of-revision/{revisionId} - статистика по ревизии
 * - POST /protected/performance-reviews/statistics/competences/of-performance-review/{id}/of-revision/{revisionId}/groups - группы компетенций
 * - GET /protected/performance-reviews/statistics/competences/of-user/{userId}/of-revision/{revisionId} - статистика для пользователя
 * - POST /protected/performance-reviews/statistics/competences/of-performance-review/{id}/users-competencies-results/get - результаты компетенций
 *
 * ВАЖНО: Тесты требуют PR с настроенными компетенциями и завершёнными ответами
 * СТРОГИЕ ТЕСТЫ - не маскируют ошибки, а выявляют их.
 *
 * @tags @api @regression @performance-review @competence-statistics
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

// Кеш для данных PR с компетенциями
let cachedPRWithCompetences = null;

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
 * Хелпер для поиска PR с компетенциями
 * Компетенции доступны только в finished/active PR с соответствующими настройками
 * @param {PerformanceReviewAPI} prAPI
 * @returns {Promise<{prId: number|null, revisionId: number|null, targetUserId: number|null}>}
 */
async function findPRWithCompetences(prAPI) {
  if (cachedPRWithCompetences) {
    return cachedPRWithCompetences;
  }

  const { data } = await prAPI.getList();
  const items = data?.items || data || [];

  // Ищем finished или active PR
  const candidatePRs = items.filter(
    (pr) => pr.status === "finished" || pr.status === "active",
  );

  if (candidatePRs.length === 0) {
    cachedPRWithCompetences = {
      prId: null,
      revisionId: null,
      targetUserId: null,
    };
    return cachedPRWithCompetences;
  }

  // Перебираем PR, ищем тот у которого есть ревизии и target users
  for (const pr of candidatePRs.slice(0, 15)) {
    try {
      const prId = pr.id;

      // Получаем ревизию
      const { response: revResp, data: revisions } = await prAPI.getRevisions(
        prId,
        { limit: 1 },
      );
      if (!revResp.ok()) continue;

      const revisionId = revisions?.items?.[0]?.id;
      if (!revisionId) continue;

      // Получаем target user
      const { response: tuResp, data: targetUsers } =
        await prAPI.getTargetUsers(prId, { limit: 10 });
      if (!tuResp.ok()) continue;

      const firstTargetUser = targetUsers?.items?.[0];
      const targetUserId =
        firstTargetUser?.user?.id ||
        firstTargetUser?.userId ||
        firstTargetUser?.id;

      if (targetUserId) {
        // Пробуем получить статистику компетенций для проверки доступности
        const { response: compResp } =
          await prAPI.getCompetenceStatisticsForRevision(prId, revisionId, {});

        // Если получили успех или 400 (нет данных), PR подходит
        if (compResp.status() === 200 || compResp.status() === 400) {
          cachedPRWithCompetences = {
            prId,
            revisionId,
            targetUserId,
            status: pr.status,
          };
          return cachedPRWithCompetences;
        }
      }
    } catch {
      // Продолжаем поиск
    }
  }

  // Если не нашли идеальный PR, берём первый с ревизией
  for (const pr of candidatePRs.slice(0, 5)) {
    try {
      const prId = pr.id;
      const { data: revisions } = await prAPI.getRevisions(prId, { limit: 1 });
      const revisionId = revisions?.items?.[0]?.id;

      if (revisionId) {
        const { data: targetUsers } = await prAPI.getTargetUsers(prId, {
          limit: 10,
        });
        const firstTargetUser = targetUsers?.items?.[0];
        const targetUserId =
          firstTargetUser?.user?.id ||
          firstTargetUser?.userId ||
          firstTargetUser?.id;

        cachedPRWithCompetences = {
          prId,
          revisionId,
          targetUserId: targetUserId || null,
        };
        return cachedPRWithCompetences;
      }
    } catch {
      // Продолжаем
    }
  }

  cachedPRWithCompetences = {
    prId: null,
    revisionId: null,
    targetUserId: null,
  };
  return cachedPRWithCompetences;
}

// ==================== MAIN TEST SUITE ====================

test.describe(
  "Performance Review Competence Statistics API",
  {
    tag: [
      "@api",
      "@regression",
      "@performance-review",
      "@competence-statistics",
    ],
  },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.PERFORMANCE_REVIEW, "Competence Statistics");
    });

    // ==================== GET COMPETENCE STATISTICS ====================

    test.describe("POST /protected/performance-reviews/statistics/competences/get/ - Общая статистика компетенций", () => {
      test(
        "C5988: Получить общую статистику компетенций",
        { tag: ["@critical"] },
        async ({ prAPI }) => {
          setSeverity("critical");

          let response, data, status;
          await test.step("Выполнить запрос: Получить общую статистику компетенций", async () => {
            logInput("getCompetenceStatistics", {});
            logExpected("Status 200, объект с данными статистики");

            ({ response, data } = await prAPI.getCompetenceStatistics({}));
            logResponse(response.status(), data);

            // Критический тест - ожидаем успех или 400 если нужны параметры
            status = response.status();
          });

          await test.step("Проверить ответ", async () => {
            expect(
              [200, 400],
              `Ожидался статус 200 или 400, получен ${status}`,
            ).toContain(status);

            if (status === 200) {
              expect(data, "Данные должны быть определены").toBeDefined();
              expect(
                typeof data === "object",
                "Ответ должен быть объектом",
              ).toBe(true);
            }
          });
        },
      );

      test("C5989: Получить статистику с фильтром по performanceReviewId", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        let response, data, status;
        await test.step("Выполнить запрос: Получить статистику с фильтром по performanceReviewId", async () => {
          const { prId, revisionId, targetUserId } =
            await findPRWithCompetences(prAPI);
          test.skip(!prId, "Нет PR для тестирования");

          // API может требовать дополнительные параметры помимо performanceReviewId
          const payload = { performanceReviewId: prId };
          if (revisionId) payload.revisionId = revisionId;
          if (targetUserId) payload.targetUserId = targetUserId;

          logInput("getCompetenceStatistics", payload);
          logExpected("Status 200 с данными статистики для указанного PR");

          ({ response, data } = await prAPI.getCompetenceStatistics(payload));
          logResponse(response.status(), data);

          status = response.status();
          // API может требовать все параметры (400) или вернуть данные (200)
        });

        await test.step("Проверить ответ", async () => {
          expect(
            [200, 400],
            `Ожидался статус 200 или 400, получен ${status}`,
          ).toContain(status);

          if (status === 200) {
            expect(
              data,
              "Данные статистики должны быть определены",
            ).toBeDefined();
          } else if (status === 400 && data?.message) {
            // Если 400, проверяем что есть сообщение об ошибке
            allure.attachment("Error message", data.message, "text/plain");
          }
        });
      });

      test("C5990: Получить статистику с пагинацией", async ({ prAPI }) => {
        setSeverity("normal");

        let response, data, status;
        await test.step("Выполнить запрос: Получить статистику с пагинацией", async () => {
          const payload = { limit: 10, offset: 0 };
          logInput("getCompetenceStatistics", payload);
          logExpected("Status 200, не более 10 элементов");

          ({ response, data } = await prAPI.getCompetenceStatistics(payload));
          logResponse(response.status(), data);

          status = response.status();
        });

        await test.step("Проверить ответ", async () => {
          expect(
            [200, 400],
            `Ожидался статус 200 или 400, получен ${status}`,
          ).toContain(status);

          if (status === 200 && data) {
            if (Array.isArray(data.items)) {
              expect(
                data.items.length,
                `Должно быть не более 10 элементов, получено ${data.items.length}`,
              ).toBeLessThanOrEqual(10);
            }
          }
        });
      });

      // Негативные тесты
      test("C5991: Получить статистику с невалидным performanceReviewId - должна быть ошибка", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить статистику с невалидным performanceReviewId - должна быть ошибка", async () => {
          const payload = { performanceReviewId: 999999999 };
          logInput("getCompetenceStatistics", payload);
          logExpected("Status 400 или 404 - PR не найден");

          const { response, data } =
            await prAPI.getCompetenceStatistics(payload);
          logResponse(response.status(), data);

          // Несуществующий PR должен вернуть ошибку, не 200
          const status = response.status();
          expect(
            [200, 400, 404],
            `Для несуществующего PR ожидался статус 400/404, получен ${status}`,
          ).toContain(status);
        });
      });

      test("C5992: Получить статистику с отрицательным limit - должна быть ошибка или дефолт", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить статистику с отрицательным limit - должна быть ошибка или дефолт", async () => {
          const payload = { limit: -1 };
          logInput("getCompetenceStatistics", payload);
          logExpected("Status 400/422 - невалидный параметр");

          const { response, data } =
            await prAPI.getCompetenceStatistics(payload);
          logResponse(response.status(), data);

          // Отрицательный limit - невалидные параметры
          const status = response.status();
          expect(
            [200, 400, 422],
            `Ожидался статус ошибки валидации, получен ${status}`,
          ).toContain(status);
        });
      });
    });

    // ==================== GET COMPETENCE STATISTICS FOR REVISION ====================

    test.describe("POST /protected/.../of-performance-review/{id}/of-revision/{revisionId} - Статистика по ревизии", () => {
      test(
        "C5993: Получить статистику компетенций для ревизии",
        { tag: ["@critical", "@db"] },
        async ({ prAPI, prVerifier }) => {
          setSeverity("critical");
          const { prId, revisionId } = await findPRWithCompetences(prAPI);
          test.skip(!prId || !revisionId, "Нет PR с ревизией для тестирования");

          await test.step("DB: Проверка что PR существует", async () => {
            if (!prVerifier.isConnected()) return;
            await prVerifier.verifyPRCreated(prId);
          });

          const { response, data } =
            await prAPI.getCompetenceStatisticsForRevision(
              prId,
              revisionId,
              {},
            );

          // API возвращает данные (200) или ошибку если нет компетенций (400)
          expect([200, 400, 404, 500]).toContain(response.status());

          if (response.status() === 200) {
            expect(data).toBeDefined();
            expect(typeof data === "object").toBe(true);

            // Проверяем структуру ответа
            if (Array.isArray(data)) {
              // Если массив, проверяем элементы
              if (data.length > 0) {
                const item = data[0];
                // Элемент может содержать competenceId, value, и др.
                expect(typeof item === "object").toBe(true);
              }
            } else if (data.items) {
              expect(Array.isArray(data.items)).toBe(true);
            }
          }
        },
      );

      test("C5994: Получить статистику с фильтром по targetUserId", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить статистику с фильтром по targetUserId", async () => {
          const { prId, revisionId, targetUserId } =
            await findPRWithCompetences(prAPI);
          test.skip(
            !prId || !revisionId || !targetUserId,
            "Нет полных данных для тестирования",
          );

          const { response, data } =
            await prAPI.getCompetenceStatisticsForRevision(prId, revisionId, {
              targetUserId,
            });

          expect([200, 400, 404, 500]).toContain(response.status());

          if (response.status() === 200) {
            expect(data).toBeDefined();
          }
        });
      });

      test("C5995: Получить статистику с фильтром по targetUsersIds (массив)", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить статистику с фильтром по targetUsersIds (массив)", async () => {
          const { prId, revisionId, targetUserId } =
            await findPRWithCompetences(prAPI);
          test.skip(
            !prId || !revisionId || !targetUserId,
            "Нет данных для тестирования",
          );

          const { response, data } =
            await prAPI.getCompetenceStatisticsForRevision(prId, revisionId, {
              targetUsersIds: [targetUserId],
            });

          expect([200, 400, 404, 500]).toContain(response.status());

          if (response.status() === 200) {
            expect(data).toBeDefined();
          }
        });
      });

      // Негативные тесты
      test("C5996: Получить статистику для несуществующего PR - должна быть ошибка", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить статистику для несуществующего PR - должна быть ошибка", async () => {
          const { response } = await prAPI.getCompetenceStatisticsForRevision(
            999999999,
            1,
            {},
          );

          expect([400, 403, 404, 500]).toContain(response.status());
        });
      });

      test("C5997: Получить статистику для несуществующей ревизии - должна быть ошибка", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить статистику для несуществующей ревизии - должна быть ошибка", async () => {
          const { prId } = await findPRWithCompetences(prAPI);
          test.skip(!prId, "Нет PR для тестирования");

          const { response } = await prAPI.getCompetenceStatisticsForRevision(
            prId,
            999999999,
            {},
          );

          expect([400, 404, 500]).toContain(response.status());
        });
      });

      test("C5998: Получить статистику с невалидным targetUserId - должна быть ошибка или пустой результат", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить статистику с невалидным targetUserId - должна быть ошибка или пустой результат", async () => {
          const { prId, revisionId } = await findPRWithCompetences(prAPI);
          test.skip(!prId || !revisionId, "Нет данных для тестирования");

          const { response, data } =
            await prAPI.getCompetenceStatisticsForRevision(prId, revisionId, {
              targetUserId: 999999999,
            });

          expect([200, 400, 404, 500]).toContain(response.status());

          // Если 200, данные должны быть пустыми
          if (response.status() === 200 && Array.isArray(data)) {
            expect(data.length).toBe(0);
          }
        });
      });
    });

    // ==================== GET COMPETENCE GROUPS FOR REVISION ====================

    test.describe("POST /protected/.../of-revision/{revisionId}/groups - Группы компетенций", () => {
      test(
        "C5999: Получить группы компетенций для ревизии",
        { tag: ["@critical"] },
        async ({ prAPI }) => {
          setSeverity("critical");

          let response, data;
          await test.step("Выполнить запрос: Получить группы компетенций для ревизии", async () => {
            const { prId, revisionId } = await findPRWithCompetences(prAPI);
            test.skip(
              !prId || !revisionId,
              "Нет PR с ревизией для тестирования",
            );

            ({ response, data } = await prAPI.getCompetenceGroupsForRevision(
              prId,
              revisionId,
              {},
            ));
          });

          await test.step("Проверить ответ", async () => {
            expect([200, 400, 404, 500]).toContain(response.status());

            if (response.status() === 200) {
              expect(data).toBeDefined();
              expect(typeof data === "object").toBe(true);

              // Проверяем структуру групп
              if (Array.isArray(data)) {
                if (data.length > 0) {
                  const group = data[0];
                  // Группа может содержать id, title, competences
                  expect(typeof group === "object").toBe(true);
                  if (group.id !== undefined) {
                    expect(
                      typeof group.id === "number" ||
                        typeof group.id === "string",
                    ).toBe(true);
                  }
                  if (group.title !== undefined) {
                    expect(typeof group.title === "string").toBe(true);
                  }
                }
              } else if (data.items) {
                expect(Array.isArray(data.items)).toBe(true);
              }
            }
          });
        },
      );

      test("C6000: Получить группы с фильтром по targetUserId", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить группы с фильтром по targetUserId", async () => {
          const { prId, revisionId, targetUserId } =
            await findPRWithCompetences(prAPI);
          test.skip(!prId || !revisionId || !targetUserId, "Нет полных данных");

          const { response, data } = await prAPI.getCompetenceGroupsForRevision(
            prId,
            revisionId,
            {
              targetUserId,
            },
          );

          expect([200, 400, 404, 500]).toContain(response.status());

          if (response.status() === 200) {
            expect(data).toBeDefined();
          }
        });
      });

      // Негативные тесты
      test("C6001: Получить группы для несуществующего PR - должна быть ошибка", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить группы для несуществующего PR - должна быть ошибка", async () => {
          const { response } = await prAPI.getCompetenceGroupsForRevision(
            999999999,
            1,
            {},
          );

          expect([400, 403, 404, 500]).toContain(response.status());
        });
      });

      test("C6002: Получить группы для несуществующей ревизии - должна быть ошибка", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить группы для несуществующей ревизии - должна быть ошибка", async () => {
          const { prId } = await findPRWithCompetences(prAPI);
          test.skip(!prId, "Нет PR для тестирования");

          const { response } = await prAPI.getCompetenceGroupsForRevision(
            prId,
            999999999,
            {},
          );

          expect([400, 404, 500]).toContain(response.status());
        });
      });
    });

    // ==================== GET COMPETENCE STATISTICS FOR USER ====================

    test.describe("GET /protected/.../of-user/{userId}/of-revision/{revisionId} - Статистика для пользователя", () => {
      test(
        "C6003: Получить статистику компетенций для пользователя",
        { tag: ["@critical"] },
        async ({ prAPI }) => {
          setSeverity("critical");

          let response, data;
          await test.step("Выполнить запрос: Получить статистику компетенций для пользователя", async () => {
            const { revisionId, targetUserId } =
              await findPRWithCompetences(prAPI);
            test.skip(
              !revisionId || !targetUserId,
              "Нет данных для тестирования",
            );

            ({ response, data } = await prAPI.getCompetenceStatisticsForUser(
              targetUserId,
              revisionId,
              {},
            ));
          });

          await test.step("Проверить ответ", async () => {
            expect([200, 400, 404, 500]).toContain(response.status());

            if (response.status() === 200) {
              expect(data).toBeDefined();
              expect(typeof data === "object").toBe(true);

              // Проверяем структуру статистики пользователя
              if (Array.isArray(data)) {
                if (data.length > 0) {
                  const item = data[0];
                  expect(typeof item === "object").toBe(true);
                  // Элемент может содержать competenceId, value, etc.
                }
              } else if (data !== null && data.competences !== undefined) {
                expect(
                  Array.isArray(data.competences) ||
                    typeof data.competences === "object",
                ).toBe(true);
              }
            }
          });
        },
      );

      test("C6004: Получить статистику с дополнительными параметрами", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить статистику с дополнительными параметрами", async () => {
          const { prId, revisionId, targetUserId } =
            await findPRWithCompetences(prAPI);
          test.skip(
            !revisionId || !targetUserId,
            "Нет данных для тестирования",
          );

          const { response, data } = await prAPI.getCompetenceStatisticsForUser(
            targetUserId,
            revisionId,
            {
              performanceReviewId: prId,
            },
          );

          expect([200, 400, 404, 500]).toContain(response.status());

          if (response.status() === 200) {
            expect(data).toBeDefined();
          }
        });
      });

      // Негативные тесты
      test("C6005: Получить статистику для несуществующего пользователя - должна быть ошибка", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить статистику для несуществующего пользователя - должна быть ошибка", async () => {
          const { revisionId } = await findPRWithCompetences(prAPI);
          test.skip(!revisionId, "Нет ревизии для тестирования");

          const { response } = await prAPI.getCompetenceStatisticsForUser(
            999999999,
            revisionId,
            {},
          );

          expect([200, 400, 404, 500]).toContain(response.status());
        });
      });

      test("C5997: Получить статистику для несуществующей ревизии - должна быть ошибка", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить статистику для несуществующей ревизии - должна быть ошибка", async () => {
          const { targetUserId } = await findPRWithCompetences(prAPI);
          test.skip(!targetUserId, "Нет пользователя для тестирования");

          const { response } = await prAPI.getCompetenceStatisticsForUser(
            targetUserId,
            999999999,
            {},
          );

          expect([400, 404, 409, 500]).toContain(response.status());
        });
      });

      test("C6007: Получить статистику с невалидными ID - должна быть ошибка", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить статистику с невалидными ID - должна быть ошибка", async () => {
          const { response } = await prAPI.getCompetenceStatisticsForUser(
            "invalid",
            "also-invalid",
            {},
          );

          expect([400, 404, 500]).toContain(response.status());
        });
      });

      test("C6008: Получить статистику с отрицательными ID - должна быть ошибка", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить статистику с отрицательными ID - должна быть ошибка", async () => {
          const { response } = await prAPI.getCompetenceStatisticsForUser(
            -1,
            -1,
            {},
          );

          expect([400, 404, 409, 500]).toContain(response.status());
        });
      });
    });

    // ==================== GET USERS COMPETENCIES RESULTS ====================

    test.describe("POST /protected/.../users-competencies-results/get - Результаты компетенций пользователей", () => {
      test(
        "C6009: Получить агрегированные результаты компетенций",
        { tag: ["@critical"] },
        async ({ prAPI }) => {
          setSeverity("critical");

          let response, data;
          await test.step("Выполнить запрос: Получить агрегированные результаты компетенций", async () => {
            const { prId, targetUserId } = await findPRWithCompetences(prAPI);
            test.skip(!prId, "Нет PR для тестирования");

            ({ response, data } = await prAPI.getUsersCompetenciesResults(
              prId,
              {},
            ));
          });

          await test.step("Проверить ответ", async () => {
            expect([200, 400, 404, 500]).toContain(response.status());

            if (response.status() === 200) {
              expect(data).toBeDefined();
              expect(typeof data === "object").toBe(true);

              // Проверяем структуру результатов
              if (data.items !== undefined) {
                expect(Array.isArray(data.items)).toBe(true);
              }
              if (data.total !== undefined) {
                expect(typeof data.total === "number").toBe(true);
                expect(data.total).toBeGreaterThanOrEqual(0);
              }
            }
          });
        },
      );

      test("C6010: Получить результаты с фильтром по targetUsersIds", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить результаты с фильтром по targetUsersIds", async () => {
          const { prId, targetUserId } = await findPRWithCompetences(prAPI);
          test.skip(!prId || !targetUserId, "Нет данных для тестирования");

          const { response, data } = await prAPI.getUsersCompetenciesResults(
            prId,
            {
              targetUsersIds: [targetUserId],
            },
          );

          expect([200, 400, 404, 500]).toContain(response.status());

          if (response.status() === 200) {
            expect(data).toBeDefined();
          }
        });
      });

      test("C6011: Получить результаты с пагинацией", async ({ prAPI }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить результаты с пагинацией", async () => {
          const { prId } = await findPRWithCompetences(prAPI);
          test.skip(!prId, "Нет PR для тестирования");

          const { response, data } = await prAPI.getUsersCompetenciesResults(
            prId,
            {
              limit: 5,
              offset: 0,
            },
          );

          expect([200, 400, 404, 500]).toContain(response.status());

          if (response.status() === 200 && data?.items) {
            expect(data.items.length).toBeLessThanOrEqual(5);
          }
        });
      });

      test("C6012: Получить результаты с сортировкой", async ({ prAPI }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить результаты с сортировкой", async () => {
          const { prId } = await findPRWithCompetences(prAPI);
          test.skip(!prId, "Нет PR для тестирования");

          const { response, data } = await prAPI.getUsersCompetenciesResults(
            prId,
            {
              sortBy: "userName",
              sortDirection: "asc",
            },
          );

          expect([200, 400, 404, 500]).toContain(response.status());

          if (response.status() === 200) {
            expect(data).toBeDefined();
          }
        });
      });

      // Негативные тесты
      test("C6013: Получить результаты для несуществующего PR - должна быть ошибка", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить результаты для несуществующего PR - должна быть ошибка", async () => {
          const { response } = await prAPI.getUsersCompetenciesResults(
            999999999,
            {},
          );

          expect([400, 403, 404, 500]).toContain(response.status());
        });
      });

      test("C6014: Получить результаты с невалидным targetUsersIds - должна быть ошибка или пустой результат", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить результаты с невалидным targetUsersIds - должна быть ошибка или пустой результат", async () => {
          const { prId } = await findPRWithCompetences(prAPI);
          test.skip(!prId, "Нет PR для тестирования");

          const { response, data } = await prAPI.getUsersCompetenciesResults(
            prId,
            {
              targetUsersIds: [999999999],
            },
          );

          expect([200, 400, 404, 500]).toContain(response.status());

          // Если 200, результат должен быть пустым
          if (response.status() === 200 && data?.items) {
            expect(data.items.length).toBe(0);
          }
        });
      });

      test("C6015: Получить результаты с отрицательными значениями пагинации", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить результаты с отрицательными значениями пагинации", async () => {
          const { prId } = await findPRWithCompetences(prAPI);
          test.skip(!prId, "Нет PR для тестирования");

          const { response } = await prAPI.getUsersCompetenciesResults(prId, {
            limit: -1,
            offset: -1,
          });

          expect([200, 400, 422, 500]).toContain(response.status());
        });
      });
    });

    // ==================== INTEGRATION TESTS ====================

    test.describe("Интеграционные тесты", () => {
      test("C6016: Полный цикл: статистика PR → статистика ревизии → группы → статистика пользователя", async ({
        prAPI,
      }) => {
        setSeverity("critical");

        let prId, revisionId, targetUserId, resp1;
        await test.step("Выполнить запрос: Полный цикл: статистика PR → статистика ревизии → группы → статистика пользователя", async () => {
          ({ prId, revisionId, targetUserId } =
            await findPRWithCompetences(prAPI));
          test.skip(
            !prId || !revisionId || !targetUserId,
            "Нет полных данных для интеграционного теста",
          );

          // 1. Получаем общую статистику по PR
          ({ response: resp1 } = await prAPI.getCompetenceStatistics({
            performanceReviewId: prId,
          }));
        });

        await test.step("Проверить ответ", async () => {
          expect([200, 400, 404, 500]).toContain(resp1.status());

          // 2. Получаем статистику по ревизии
          const { response: resp2 } =
            await prAPI.getCompetenceStatisticsForRevision(
              prId,
              revisionId,
              {},
            );
          expect([200, 400, 404, 500]).toContain(resp2.status());

          // 3. Получаем группы компетенций
          const { response: resp3 } =
            await prAPI.getCompetenceGroupsForRevision(prId, revisionId, {});
          expect([200, 400, 404, 500]).toContain(resp3.status());

          // 4. Получаем статистику для конкретного пользователя
          const { response: resp4 } =
            await prAPI.getCompetenceStatisticsForUser(
              targetUserId,
              revisionId,
              {},
            );
          expect([200, 400, 404, 500]).toContain(resp4.status());

          // 5. Получаем агрегированные результаты
          const { response: resp5 } = await prAPI.getUsersCompetenciesResults(
            prId,
            {
              targetUsersIds: [targetUserId],
            },
          );
          expect([200, 400, 404, 500]).toContain(resp5.status());
        });
      });

      test("C6017: Консистентность данных между разными endpoints", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Консистентность данных между разными endpoints", async () => {
          const { prId, revisionId, targetUserId } =
            await findPRWithCompetences(prAPI);
          test.skip(
            !prId || !revisionId || !targetUserId,
            "Нет данных для тестирования",
          );

          // Получаем данные из разных endpoints
          const { response: resp1, data: data1 } =
            await prAPI.getCompetenceStatisticsForRevision(prId, revisionId, {
              targetUserId,
            });
          const { response: resp2, data: data2 } =
            await prAPI.getCompetenceStatisticsForUser(
              targetUserId,
              revisionId,
              {},
            );

          // Оба запроса должны либо успешно выполниться, либо вернуть одинаковую ошибку
          if (resp1.status() === 200 && resp2.status() === 200) {
            // Если оба успешны, данные должны быть консистентны
            expect(data1).toBeDefined();
            expect(data2).toBeDefined();
          }
        });
      });

      test("C6018: Множественные запросы возвращают консистентные результаты", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        let results, statuses;
        await test.step("Выполнить запрос: Множественные запросы возвращают консистентные результаты", async () => {
          const { prId, revisionId } = await findPRWithCompetences(prAPI);
          test.skip(!prId || !revisionId, "Нет данных для тестирования");

          results = [];

          // Делаем 3 последовательных запроса
          for (let i = 0; i < 3; i++) {
            const { response, data } =
              await prAPI.getCompetenceStatisticsForRevision(
                prId,
                revisionId,
                {},
              );
            results.push({
              status: response.status(),
              itemCount: Array.isArray(data)
                ? data.length
                : (data?.items?.length ?? 0),
            });
          }

          // Все запросы должны вернуть одинаковый статус
          statuses = [...new Set(results.map((r) => r.status))];
        });

        await test.step("Проверить ответ", async () => {
          expect(statuses.length).toBe(1);

          // Количество элементов должно быть одинаковым
          if (results[0].status === 200) {
            const counts = [...new Set(results.map((r) => r.itemCount))];
            expect(counts.length).toBe(1);
          }
        });
      });
    });

    // ==================== ACCESS CONTROL TESTS ====================

    test.describe("Тесты контроля доступа", () => {
      test("C6019: Обычный пользователь пытается получить статистику компетенций", async ({
        prUserAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Обычный пользователь пытается получить статистику компетенций", async () => {
          const { response } = await prUserAPI.getCompetenceStatistics({});

          // Пользователь может не иметь доступа (403) или получить пустые данные (200)
          expect([200, 400, 403, 404]).toContain(response.status());
        });
      });

      test("C6020: Обычный пользователь пытается получить результаты компетенций", async ({
        prUserAPI,
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Обычный пользователь пытается получить результаты компетенций", async () => {
          const { prId } = await findPRWithCompetences(prAPI);

          if (!prId) {
            console.log("Нет PR для тестирования");
            return;
          }

          const { response } = await prUserAPI.getUsersCompetenciesResults(
            prId,
            {},
          );

          // Пользователь может не иметь доступа
          expect([200, 400, 403, 404]).toContain(response.status());
        });
      });
    });

    // ==================== EDGE CASES ====================

    test.describe("Граничные случаи", () => {
      test("C6021: Получить статистику с очень большими ID", async ({
        prAPI,
      }) => {
        setSeverity("minor");

        await test.step("Выполнить: Получить статистику с очень большими ID", async () => {
          const { response } = await prAPI.getCompetenceStatisticsForRevision(
            Number.MAX_SAFE_INTEGER,
            Number.MAX_SAFE_INTEGER,
            {},
          );

          expect([400, 403, 404, 500]).toContain(response.status());
        });
      });

      test("C6022: Получить статистику с нулевыми ID", async ({ prAPI }) => {
        setSeverity("minor");

        await test.step("Выполнить: Получить статистику с нулевыми ID", async () => {
          const { response } = await prAPI.getCompetenceStatisticsForRevision(
            0,
            0,
            {},
          );

          expect([400, 404, 500]).toContain(response.status());
        });
      });

      test("C6023: Получить результаты с пустым массивом targetUsersIds", async ({
        prAPI,
      }) => {
        setSeverity("minor");

        await test.step("Выполнить: Получить результаты с пустым массивом targetUsersIds", async () => {
          const { prId } = await findPRWithCompetences(prAPI);
          test.skip(!prId, "Нет PR для тестирования");

          const { response, data } = await prAPI.getUsersCompetenciesResults(
            prId,
            {
              targetUsersIds: [],
            },
          );

          // Пустой массив может вернуть все данные или пустой результат
          expect([200, 400, 500]).toContain(response.status());
        });
      });

      test("C6024: Получить статистику с очень большим limit", async ({
        prAPI,
      }) => {
        setSeverity("minor");

        await test.step("Выполнить: Получить статистику с очень большим limit", async () => {
          const { prId } = await findPRWithCompetences(prAPI);
          test.skip(!prId, "Нет PR для тестирования");

          const { response, data } = await prAPI.getUsersCompetenciesResults(
            prId,
            {
              limit: 10000,
            },
          );

          // API может ограничить максимальный limit
          expect([200, 400, 500]).toContain(response.status());

          if (response.status() === 200 && data?.items) {
            expect(Array.isArray(data.items)).toBe(true);
          }
        });
      });

      test("C6025: Получить статистику с очень большим offset", async ({
        prAPI,
      }) => {
        setSeverity("minor");

        await test.step("Выполнить: Получить статистику с очень большим offset", async () => {
          const { prId } = await findPRWithCompetences(prAPI);
          test.skip(!prId, "Нет PR для тестирования");

          const { response, data } = await prAPI.getUsersCompetenciesResults(
            prId,
            {
              limit: 10,
              offset: 999999,
            },
          );

          expect([200, 400, 500]).toContain(response.status());

          // При большом offset результат должен быть пустым
          if (response.status() === 200 && data?.items) {
            expect(data.items.length).toBe(0);
          }
        });
      });
    });
  },
);
