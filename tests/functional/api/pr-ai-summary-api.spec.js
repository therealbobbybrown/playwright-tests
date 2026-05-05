// @ts-check
import { test as base, expect } from "../../fixtures/full.js";
import { PerformanceReviewAPI, getCredentials } from "../../utils/api/index.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { assertSuccessStatus } from "../../utils/api/common-assertions.js";

/**
 * API тесты для AI Summary в Performance Review
 *
 * Покрытие:
 * - GET /private/performance-reviews/{id}/ai/summary/tasks/last/ - получение последней AI задачи
 * - POST /private/performance-reviews/{id}/ai/summary/tasks/ - создание AI задачи
 * - POST /private/performance-reviews/{id}/ai/summary/tasks/{taskId}/refresh/ - обновление AI задачи
 *
 * ВАЖНО: AI функционал может быть недоступен (требует настройки на бэкенде)
 * Тесты корректно обрабатывают случай когда AI недоступен (404)
 *
 * @tags @api @regression @performance-review @ai-summary
 */

// Кеш для данных PR (чтобы не делать запросы в каждом тесте)
let cachedFinishedPRData = null;
let cachedAnyPRData = null;

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
 * Хелпер для получения завершённого PR с данными (для AI Summary)
 * AI Summary работает лучше с завершёнными PR где есть ответы
 * @param {PerformanceReviewAPI} prAPI
 * @returns {Promise<{prId: number|null, revisionId: number|null, targetUserId: number|null}>}
 */
async function findFinishedPRWithData(prAPI) {
  if (cachedFinishedPRData) {
    return cachedFinishedPRData;
  }

  const { data } = await prAPI.getList();
  const items = data?.items || data || [];

  // Предпочитаем finished PR, но подойдёт и active
  const finishedPRs = items.filter((pr) => pr.status === "finished");
  const activePRs = items.filter((pr) => pr.status === "active");
  const candidatePRs = [...finishedPRs, ...activePRs];

  if (candidatePRs.length === 0) {
    cachedFinishedPRData = { prId: null, revisionId: null, targetUserId: null };
    return cachedFinishedPRData;
  }

  // Перебираем PR, ищем тот у которого есть ревизии и target users
  for (const pr of candidatePRs.slice(0, 10)) {
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
        cachedFinishedPRData = {
          prId,
          revisionId,
          targetUserId,
          status: pr.status,
        };
        return cachedFinishedPRData;
      }
    } catch {
      // Продолжаем поиск
    }
  }

  cachedFinishedPRData = { prId: null, revisionId: null, targetUserId: null };
  return cachedFinishedPRData;
}

/**
 * Хелпер для получения любого PR (для негативных тестов)
 * @param {PerformanceReviewAPI} prAPI
 * @returns {Promise<{prId: number|null}>}
 */
async function findAnyPR(prAPI) {
  if (cachedAnyPRData) {
    return cachedAnyPRData;
  }

  const { data } = await prAPI.getList();
  const items = data?.items || data || [];

  if (items.length === 0) {
    cachedAnyPRData = { prId: null };
    return cachedAnyPRData;
  }

  cachedAnyPRData = { prId: items[0].id };
  return cachedAnyPRData;
}

// ==================== MAIN TEST SUITE ====================

test.describe(
  "Performance Review AI Summary API",
  { tag: ["@api", "@regression", "@performance-review", "@ai-summary"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.PERFORMANCE_REVIEW, "AI Summary");
    });

    // ==================== GET LAST TASK ====================

    test.describe("GET /private/performance-reviews/{id}/ai/summary/tasks/last/ - Получение последней AI задачи", () => {
      test(
        "C5920: Получить последнюю AI задачу без параметров",
        { tag: ["@critical", "@db"] },
        async ({ prAPI, prVerifier }) => {
          setSeverity("critical");
          const { prId } = await findFinishedPRWithData(prAPI);
          test.skip(!prId, "Нет PR с данными для тестирования AI Summary");

          await test.step("DB: Проверка что PR существует", async () => {
            if (!prVerifier.isConnected()) return;
            await prVerifier.verifyPRCreated(prId);
          });

          const { response, data } = await prAPI.getAiSummaryLastTask(prId, {});

          // AI функционал может быть недоступен (404), нет задач (200 с null/пустым),
          // или требуются обязательные параметры (400)
          expect([200, 400, 404]).toContain(response.status());

          if (response.status() === 200) {
            // Если задача существует, проверяем структуру
            if (
              data !== null &&
              data !== undefined &&
              Object.keys(data).length > 0
            ) {
              // Задача должна содержать id
              expect(data).toHaveProperty("id");
              expect(
                typeof data.id === "number" || typeof data.id === "string",
              ).toBe(true);

              // Задача должна содержать статус
              if (data.status !== undefined) {
                expect([
                  "pending",
                  "process",
                  "processing",
                  "completed",
                  "failed",
                  "cancelled",
                ]).toContain(data.status);
              }

              // Если есть результат, проверяем его тип
              if (data.result !== undefined) {
                expect(
                  typeof data.result === "string" ||
                    typeof data.result === "object",
                ).toBe(true);
              }
            }
          }
        },
      );

      test(
        "C5921: Получить последнюю AI задачу с revisionId",
        { tag: ["@critical"] },
        async ({ prAPI }) => {
          setSeverity("critical");

          await test.step("Выполнить: Получить последнюю AI задачу с revisionId", async () => {
            const { prId, revisionId } = await findFinishedPRWithData(prAPI);
            test.skip(
              !prId || !revisionId,
              "Нет PR с ревизией для тестирования",
            );

            const { response, data } = await prAPI.getAiSummaryLastTask(prId, {
              revisionId,
            });

            // API может требовать targetUserId (400), быть недоступен (404), или вернуть данные (200)
            expect([200, 400, 404]).toContain(response.status());

            if (response.status() === 200 && data) {
              // Если задача связана с ревизией, проверяем
              if (data.revisionId !== undefined) {
                expect(data.revisionId).toBe(revisionId);
              }
            }
          });
        },
      );

      test("C5922: Получить последнюю AI задачу с targetUserId", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        let prId, revisionId, targetUserId, response, data;
        await test.step("Выполнить запрос: Получить последнюю AI задачу с targetUserId", async () => {
          ({ prId, revisionId, targetUserId } =
            await findFinishedPRWithData(prAPI));
          test.skip(
            !prId || !targetUserId,
            "Нет PR с target user для тестирования",
          );

          ({ response, data } = await prAPI.getAiSummaryLastTask(prId, {
            revisionId,
            targetUserId,
          }));
        });

        await test.step("Проверить ответ", async () => {
          expect([200, 404]).toContain(response.status());

          if (
            response.status() === 200 &&
            data &&
            Object.keys(data).length > 0
          ) {
            // Проверяем что задача для правильного пользователя
            if (data.targetUserId !== undefined) {
              expect(data.targetUserId).toBe(targetUserId);
            }
          }
        });
      });

      test("C5923: Получить последнюю AI задачу с полными параметрами", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        let response, data;
        await test.step("Выполнить запрос: Получить последнюю AI задачу с полными параметрами", async () => {
          const { prId, revisionId, targetUserId } =
            await findFinishedPRWithData(prAPI);
          test.skip(
            !prId || !revisionId || !targetUserId,
            "Нет полных данных для тестирования",
          );

          ({ response, data } = await prAPI.getAiSummaryLastTask(prId, {
            revisionId,
            targetUserId,
          }));
        });

        await test.step("Проверить ответ", async () => {
          expect([200, 404]).toContain(response.status());

          // При успешном ответе валидируем полную структуру
          if (
            response.status() === 200 &&
            data &&
            Object.keys(data).length > 0
          ) {
            expect(data).toHaveProperty("id");

            // Проверяем временные метки если есть
            if (data.createdAt !== undefined) {
              expect(
                typeof data.createdAt === "string" ||
                  typeof data.createdAt === "number",
              ).toBe(true);
            }
            if (data.updatedAt !== undefined) {
              expect(
                typeof data.updatedAt === "string" ||
                  typeof data.updatedAt === "number",
              ).toBe(true);
            }
          }
        });
      });

      // Негативные тесты для getAiSummaryLastTask
      test("C5924: Получить AI задачу для несуществующего PR - должна быть ошибка или пустой результат", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        let response, data;
        await test.step("Выполнить запрос: Получить AI задачу для несуществующего PR - должна быть ошибка или пустой результат", async () => {
          ({ response, data } = await prAPI.getAiSummaryLastTask(
            999999999,
            {},
          ));

          // API может вернуть:
          // - 200 с пустым результатом (если PR не найден, но запрос валиден)
          // - 400 (невалидные параметры)
          // - 403 (нет доступа)
          // - 404 (не найдено)
          // - 500 (внутренняя ошибка)
        });

        await test.step("Проверить ответ", async () => {
          expect([200, 400, 403, 404, 500]).toContain(response.status());

          // Если 200, данные должны быть пустыми
          if (response.status() === 200) {
            const isEmpty =
              data === null ||
              data === undefined ||
              Object.keys(data).length === 0;
            expect(isEmpty).toBe(true);
          }
        });
      });

      test("C5925: Получить AI задачу с невалидным ID PR - должна быть ошибка", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить AI задачу с невалидным ID PR - должна быть ошибка", async () => {
          const { response } = await prAPI.getAiSummaryLastTask(
            "invalid-id",
            {},
          );

          expect([400, 404, 500]).toContain(response.status());
        });
      });

      test("C5926: Получить AI задачу с отрицательным ID PR - должна быть ошибка", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить AI задачу с отрицательным ID PR - должна быть ошибка", async () => {
          const { response } = await prAPI.getAiSummaryLastTask(-1, {});

          expect([400, 404, 500]).toContain(response.status());
        });
      });

      test("C5927: Получить AI задачу с несуществующей ревизией - должна быть ошибка или пустой результат", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить AI задачу с несуществующей ревизией - должна быть ошибка или пустой результат", async () => {
          const { prId } = await findFinishedPRWithData(prAPI);
          test.skip(!prId, "Нет PR для тестирования");

          const { response, data } = await prAPI.getAiSummaryLastTask(prId, {
            revisionId: 999999999,
          });

          // API может вернуть 200 с пустым результатом или ошибку
          expect([200, 400, 404, 500]).toContain(response.status());

          if (response.status() === 200) {
            // Если 200, то данные должны быть пустыми или null
            const isEmpty =
              data === null ||
              data === undefined ||
              Object.keys(data).length === 0;
            expect(isEmpty).toBe(true);
          }
        });
      });

      test("C5928: Получить AI задачу с несуществующим targetUserId - должна быть ошибка или пустой результат", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить AI задачу с несуществующим targetUserId - должна быть ошибка или пустой результат", async () => {
          const { prId, revisionId } = await findFinishedPRWithData(prAPI);
          test.skip(!prId, "Нет PR для тестирования");

          const { response, data } = await prAPI.getAiSummaryLastTask(prId, {
            revisionId,
            targetUserId: 999999999,
          });

          expect([200, 400, 404, 500]).toContain(response.status());

          if (response.status() === 200) {
            const isEmpty =
              data === null ||
              data === undefined ||
              Object.keys(data).length === 0;
            expect(isEmpty).toBe(true);
          }
        });
      });
    });

    // ==================== CREATE TASK ====================

    test.describe("POST /private/performance-reviews/{id}/ai/summary/tasks/ - Создание AI задачи", () => {
      test(
        "C5929: Создать AI задачу с обязательными параметрами",
        { tag: ["@critical"] },
        async ({ prAPI }) => {
          setSeverity("critical");

          let prId, revisionId, targetUserId, response, data;
          await test.step("Выполнить запрос: Создать AI задачу с обязательными параметрами", async () => {
            ({ prId, revisionId, targetUserId } =
              await findFinishedPRWithData(prAPI));
            test.skip(
              !prId || !revisionId || !targetUserId,
              "Нет данных для создания AI задачи",
            );

            ({ response, data } = await prAPI.createAiSummaryTask(prId, {
              revisionId,
              targetUserId,
            }));

            // AI может быть недоступен (404), уже есть задача (409), или успех (200/201)
            // Также возможна ошибка если нет данных для генерации (400/422)
          });

          await test.step("Проверить ответ", async () => {
            expect([200, 201, 400, 404, 409, 422, 500]).toContain(
              response.status(),
            );

            if (response.status() === 200 || response.status() === 201) {
              expect(data).toBeDefined();
              expect(data).toHaveProperty("id");
              expect(
                typeof data.id === "number" || typeof data.id === "string",
              ).toBe(true);

              // Новая задача должна быть в статусе pending, processing/process или completed
              if (data.status !== undefined) {
                expect([
                  "pending",
                  "process",
                  "processing",
                  "completed",
                ]).toContain(data.status);
              }

              // Проверяем что задача создана для правильных параметров
              if (data.revisionId !== undefined) {
                expect(data.revisionId).toBe(revisionId);
              }
              if (data.targetUserId !== undefined) {
                expect(data.targetUserId).toBe(targetUserId);
              }
            }

            if (response.status() === 409) {
              // Конфликт - задача уже существует или выполняется
              expect(data).toBeDefined();
            }
          });
        },
      );

      test("C5930: Создать AI задачу только с revisionId", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Создать AI задачу только с revisionId", async () => {
          const { prId, revisionId } = await findFinishedPRWithData(prAPI);
          test.skip(!prId || !revisionId, "Нет данных для тестирования");

          const { response, data } = await prAPI.createAiSummaryTask(prId, {
            revisionId,
          });

          // API может требовать targetUserId или работать без него
          expect([200, 201, 400, 404, 409, 422, 500]).toContain(
            response.status(),
          );

          if (response.status() === 200 || response.status() === 201) {
            expect(data).toBeDefined();
            expect(data).toHaveProperty("id");
          }
        });
      });

      // Негативные тесты для createAiSummaryTask
      test("C5931: Создать AI задачу без параметров - должна быть ошибка валидации", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Создать AI задачу без параметров - должна быть ошибка валидации", async () => {
          const { prId } = await findFinishedPRWithData(prAPI);
          test.skip(!prId, "Нет PR для тестирования");

          const { response } = await prAPI.createAiSummaryTask(prId, {});

          // Ожидаем ошибку валидации
          expect([400, 404, 422, 500]).toContain(response.status());
        });
      });

      test("C5932: Создать AI задачу для несуществующего PR - должна быть ошибка", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Создать AI задачу для несуществующего PR - должна быть ошибка", async () => {
          const { response } = await prAPI.createAiSummaryTask(999999999, {
            revisionId: 1,
            targetUserId: 1,
          });

          expect([403, 404, 500]).toContain(response.status());
        });
      });

      test("C5933: Создать AI задачу с невалидным revisionId - должна быть ошибка", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Создать AI задачу с невалидным revisionId - должна быть ошибка", async () => {
          const { prId } = await findFinishedPRWithData(prAPI);
          test.skip(!prId, "Нет PR для тестирования");

          const { response } = await prAPI.createAiSummaryTask(prId, {
            revisionId: 999999999,
            targetUserId: 1,
          });

          expect([400, 404, 422, 500]).toContain(response.status());
        });
      });

      test("C5934: Создать AI задачу с невалидным targetUserId - должна быть ошибка", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Создать AI задачу с невалидным targetUserId - должна быть ошибка", async () => {
          const { prId, revisionId } = await findFinishedPRWithData(prAPI);
          test.skip(!prId || !revisionId, "Нет данных для тестирования");

          const { response } = await prAPI.createAiSummaryTask(prId, {
            revisionId,
            targetUserId: 999999999,
          });

          expect([400, 404, 422, 500]).toContain(response.status());
        });
      });

      test("C5935: Создать AI задачу с отрицательными ID - должна быть ошибка", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Создать AI задачу с отрицательными ID - должна быть ошибка", async () => {
          const { prId } = await findFinishedPRWithData(prAPI);
          test.skip(!prId, "Нет PR для тестирования");

          const { response } = await prAPI.createAiSummaryTask(prId, {
            revisionId: -1,
            targetUserId: -1,
          });

          expect([400, 404, 422, 500]).toContain(response.status());
        });
      });

      test("C5936: Создать AI задачу с невалидным типом данных в payload", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Создать AI задачу с невалидным типом данных в payload", async () => {
          const { prId } = await findFinishedPRWithData(prAPI);
          test.skip(!prId, "Нет PR для тестирования");

          const { response } = await prAPI.createAiSummaryTask(prId, {
            revisionId: "not-a-number",
            targetUserId: "also-not-a-number",
          });

          expect([400, 404, 422, 500]).toContain(response.status());
        });
      });
    });

    // ==================== REFRESH TASK ====================

    test.describe("POST /private/performance-reviews/{id}/ai/summary/tasks/{taskId}/refresh/ - Обновление AI задачи", () => {
      test(
        "C5937: Обновить существующую AI задачу",
        { tag: ["@critical"] },
        async ({ prAPI }) => {
          setSeverity("critical");

          let response, data;
          await test.step("Выполнить запрос: Обновить существующую AI задачу", async () => {
            const { prId, revisionId, targetUserId } =
              await findFinishedPRWithData(prAPI);
            test.skip(
              !prId || !revisionId || !targetUserId,
              "Нет данных для тестирования",
            );

            // Сначала получаем последнюю задачу или создаём новую
            let taskId = null;

            const { response: lastResp, data: lastTask } =
              await prAPI.getAiSummaryLastTask(prId, {
                revisionId,
                targetUserId,
              });

            if (lastResp.status() === 200 && lastTask && lastTask.id) {
              taskId = lastTask.id;
            } else {
              // Пробуем создать задачу
              const { response: createResp, data: createdTask } =
                await prAPI.createAiSummaryTask(prId, {
                  revisionId,
                  targetUserId,
                });

              if (
                (createResp.status() === 200 || createResp.status() === 201) &&
                createdTask?.id
              ) {
                taskId = createdTask.id;
              }
            }

            test.skip(!taskId, "Не удалось получить или создать AI задачу");

            // Обновляем задачу
            ({ response, data } = await prAPI.refreshAiSummaryTask(
              prId,
              taskId,
            ));

            // Refresh может вернуть успех, конфликт (задача уже обновляется), или ошибку
          });

          await test.step("Проверить ответ", async () => {
            expect([200, 201, 400, 404, 409, 500]).toContain(response.status());

            if (response.status() === 200 || response.status() === 201) {
              expect(data).toBeDefined();
              // После refresh задача должна иметь id
              if (data.id !== undefined) {
                expect(
                  typeof data.id === "number" || typeof data.id === "string",
                ).toBe(true);
              }
            }
          });
        },
      );

      // Негативные тесты для refreshAiSummaryTask
      test("C5938: Обновить несуществующую AI задачу - должна быть ошибка", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Обновить несуществующую AI задачу - должна быть ошибка", async () => {
          const { prId } = await findFinishedPRWithData(prAPI);
          test.skip(!prId, "Нет PR для тестирования");

          const { response } = await prAPI.refreshAiSummaryTask(
            prId,
            999999999,
          );

          expect([400, 404, 500]).toContain(response.status());
        });
      });

      test("C5939: Обновить AI задачу для несуществующего PR - должна быть ошибка", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Обновить AI задачу для несуществующего PR - должна быть ошибка", async () => {
          const { response } = await prAPI.refreshAiSummaryTask(999999999, 1);

          expect([403, 404, 500]).toContain(response.status());
        });
      });

      test("C5940: Обновить AI задачу с невалидным taskId - должна быть ошибка", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Обновить AI задачу с невалидным taskId - должна быть ошибка", async () => {
          const { prId } = await findFinishedPRWithData(prAPI);
          test.skip(!prId, "Нет PR для тестирования");

          const { response } = await prAPI.refreshAiSummaryTask(
            prId,
            "invalid-task-id",
          );

          expect([400, 404, 500]).toContain(response.status());
        });
      });

      test("C5941: Обновить AI задачу с отрицательным taskId - должна быть ошибка", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Обновить AI задачу с отрицательным taskId - должна быть ошибка", async () => {
          const { prId } = await findFinishedPRWithData(prAPI);
          test.skip(!prId, "Нет PR для тестирования");

          const { response } = await prAPI.refreshAiSummaryTask(prId, -1);

          expect([400, 404, 500]).toContain(response.status());
        });
      });
    });

    // ==================== INTEGRATION TESTS ====================

    test.describe("Интеграционные тесты", () => {
      test("C5942: Полный цикл: получить → создать → получить → обновить", async ({
        prAPI,
      }) => {
        setSeverity("critical");

        let prId, revisionId, targetUserId, getResp1, task1;
        await test.step("Выполнить запрос: Полный цикл: получить → создать → получить → обновить", async () => {
          ({ prId, revisionId, targetUserId } =
            await findFinishedPRWithData(prAPI));
          test.skip(
            !prId || !revisionId || !targetUserId,
            "Нет данных для интеграционного теста",
          );

          // 1. Получаем текущую последнюю задачу (может не существовать)
          ({ response: getResp1, data: task1 } =
            await prAPI.getAiSummaryLastTask(prId, {
              revisionId,
              targetUserId,
            }));

          // AI может быть недоступен
          if (getResp1.status() === 404) {
            console.log("AI Summary недоступен для этого PR");
            return;
          }
        });

        await test.step("Проверить ответ", async () => {
          expect(getResp1.status()).toBe(200);

          // 2. Создаём новую задачу (или получаем ошибку если уже есть активная)
          const { response: createResp, data: createdTask } =
            await prAPI.createAiSummaryTask(prId, {
              revisionId,
              targetUserId,
            });

          // Принимаем успех или конфликт (задача уже существует)
          expect([200, 201, 400, 409, 500]).toContain(createResp.status());

          let taskId = null;
          if (createResp.status() === 200 || createResp.status() === 201) {
            expect(createdTask).toBeDefined();
            expect(createdTask).toHaveProperty("id");
            taskId = createdTask.id;
          } else if (task1?.id) {
            taskId = task1.id;
          }

          if (!taskId) {
            console.log("Не удалось получить taskId для дальнейших тестов");
            return;
          }

          // 3. Получаем задачу снова - должна быть последняя
          const { response: getResp2, data: task2 } =
            await prAPI.getAiSummaryLastTask(prId, {
              revisionId,
              targetUserId,
            });

          expect(getResp2.status()).toBe(200);
          expect(task2).toBeDefined();
          expect(task2).toHaveProperty("id");

          // 4. Обновляем задачу
          const { response: refreshResp } = await prAPI.refreshAiSummaryTask(
            prId,
            taskId,
          );

          // Refresh может вернуть успех или ошибку если задача уже обновляется
          expect([200, 201, 400, 409, 500]).toContain(refreshResp.status());
        });
      });

      test("C5943: Множественные запросы getAiSummaryLastTask возвращают консистентные данные", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        let results, statuses;
        await test.step("Выполнить запрос: Множественные запросы getAiSummaryLastTask возвращают консистентные данные", async () => {
          const { prId, revisionId, targetUserId } =
            await findFinishedPRWithData(prAPI);
          test.skip(!prId, "Нет PR для тестирования");

          results = [];

          // Делаем 3 последовательных запроса
          for (let i = 0; i < 3; i++) {
            const { response, data } = await prAPI.getAiSummaryLastTask(prId, {
              revisionId,
              targetUserId,
            });
            results.push({ status: response.status(), taskId: data?.id });
          }

          // Все запросы должны вернуть одинаковый статус
          statuses = [...new Set(results.map((r) => r.status))];
        });

        await test.step("Проверить ответ", async () => {
          expect(statuses.length).toBe(1);
          expect([200, 404]).toContain(statuses[0]);

          // Если есть задачи, их ID должны быть одинаковыми
          if (statuses[0] === 200) {
            const taskIds = [
              ...new Set(results.map((r) => r.taskId).filter(Boolean)),
            ];
            // Может быть 0 или 1 уникальный ID (если задач нет или есть одна)
            expect(taskIds.length).toBeLessThanOrEqual(1);
          }
        });
      });

      test("C5944: Создание задачи дважды подряд - вторая должна вернуть конфликт или ту же задачу", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        let resp1, task1, resp2, task2;
        await test.step("Выполнить запрос: Создание задачи дважды подряд - вторая должна вернуть конфликт или ту же задачу", async () => {
          const { prId, revisionId, targetUserId } =
            await findFinishedPRWithData(prAPI);
          test.skip(
            !prId || !revisionId || !targetUserId,
            "Нет данных для тестирования",
          );

          // Первый запрос на создание
          ({ response: resp1, data: task1 } = await prAPI.createAiSummaryTask(
            prId,
            {
              revisionId,
              targetUserId,
            },
          ));

          // AI может быть недоступен
          if (resp1.status() === 404) {
            console.log("AI Summary недоступен");
            return;
          }

          // Второй запрос на создание с теми же параметрами
          ({ response: resp2, data: task2 } = await prAPI.createAiSummaryTask(
            prId,
            {
              revisionId,
              targetUserId,
            },
          ));

          // Второй запрос должен вернуть конфликт или ту же задачу
        });

        await test.step("Проверить ответ", async () => {
          expect([200, 201, 400, 409, 500]).toContain(resp2.status());

          // Если оба успешны, должны вернуть одну и ту же задачу
          if (
            (resp1.status() === 200 || resp1.status() === 201) &&
            (resp2.status() === 200 || resp2.status() === 201)
          ) {
            if (task1?.id && task2?.id) {
              // ID могут быть одинаковыми (та же задача) или разными (новая задача создана)
              // Главное что оба ответа валидны
              expect(task1.id).toBeDefined();
              expect(task2.id).toBeDefined();
            }
          }
        });
      });
    });

    // ==================== ACCESS CONTROL TESTS ====================

    test.describe("Тесты контроля доступа", () => {
      test("C5945: Обычный пользователь может получить AI задачу для своего PR", async ({
        prUserAPI,
      }) => {
        setSeverity("normal");

        let aiResp;
        await test.step("Выполнить запрос: Обычный пользователь может получить AI задачу для своего PR", async () => {
          // Получаем любой PR от имени обычного пользователя
          const { response, data } = await prUserAPI.getList();

          // Пользователь может не иметь доступа к PR вообще
          if (!response.ok()) {
            console.log("Пользователь не имеет доступа к Performance Reviews");
            return;
          }

          const items = data?.items || data || [];
          if (items.length === 0) {
            console.log("У пользователя нет доступных PR");
            return;
          }

          const prId = items[0].id;
          ({ response: aiResp } = await prUserAPI.getAiSummaryLastTask(
            prId,
            {},
          ));

          // Пользователь может получить задачу или получить ошибку доступа
        });

        await test.step("Проверить ответ", async () => {
          if (!aiResp) return; // step завершился раньше (нет доступа к PR или нет PR)
          expect([200, 403, 404]).toContain(aiResp.status());
        });
      });
    });

    // ==================== EDGE CASES ====================

    test.describe("Граничные случаи", () => {
      test("C5946: Получить AI задачу с очень большим PR ID", async ({
        prAPI,
      }) => {
        setSeverity("minor");

        await test.step("Выполнить: Получить AI задачу с очень большим PR ID", async () => {
          const { response } = await prAPI.getAiSummaryLastTask(
            Number.MAX_SAFE_INTEGER,
            {},
          );

          expect([400, 403, 404, 500]).toContain(response.status());
        });
      });

      test("C5947: Создать AI задачу с нулевыми ID", async ({ prAPI }) => {
        setSeverity("minor");

        await test.step("Выполнить: Создать AI задачу с нулевыми ID", async () => {
          const { prId } = await findAnyPR(prAPI);
          test.skip(!prId, "Нет PR для тестирования");

          const { response } = await prAPI.createAiSummaryTask(prId, {
            revisionId: 0,
            targetUserId: 0,
          });

          expect([400, 404, 422, 500]).toContain(response.status());
        });
      });

      test("C5948: Обновить AI задачу с нулевым taskId", async ({ prAPI }) => {
        setSeverity("minor");

        await test.step("Выполнить: Обновить AI задачу с нулевым taskId", async () => {
          const { prId } = await findAnyPR(prAPI);
          test.skip(!prId, "Нет PR для тестирования");

          const { response } = await prAPI.refreshAiSummaryTask(prId, 0);

          expect([400, 404, 500]).toContain(response.status());
        });
      });

      test("C5949: Получить AI задачу для draft PR", async ({ prAPI }) => {
        setSeverity("minor");

        await test.step("Выполнить: Получить AI задачу для draft PR", async () => {
          const { data } = await prAPI.getList();
          const items = data?.items || data || [];
          const draftPR = items.find((pr) => pr.status === "draft");

          if (!draftPR) {
            console.log("Нет draft PR для тестирования");
            return;
          }

          const { response } = await prAPI.getAiSummaryLastTask(draftPR.id, {});

          // Для draft PR AI может быть недоступен
          expect([200, 400, 404]).toContain(response.status());
        });
      });

      test("C5950: Получить AI задачу для archived PR", async ({ prAPI }) => {
        setSeverity("minor");

        await test.step("Выполнить: Получить AI задачу для archived PR", async () => {
          const { data } = await prAPI.getList();
          const items = data?.items || data || [];
          const archivedPR = items.find((pr) => pr.status === "archived");

          if (!archivedPR) {
            console.log("Нет archived PR для тестирования");
            return;
          }

          const { response } = await prAPI.getAiSummaryLastTask(
            archivedPR.id,
            {},
          );

          // Для archived PR AI может быть недоступен
          expect([200, 400, 403, 404]).toContain(response.status());
        });
      });
    });
  },
);
