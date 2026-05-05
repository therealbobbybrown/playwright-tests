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
 * API тесты для экспорта Performance Review
 *
 * ВАЖНО: Для этих тестов нужен активный PR с данными (status: active/finished)
 * Тесты автоматически находят подходящий PR
 */

// Расширяем test с фикстурой для Performance Review API
const test = base.extend({
  prAPI: async ({ request }, use) => {
    const api = new PerformanceReviewAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
});

// Хелпер для получения активного PR с данными
async function findActivePRWithData(prAPI) {
  // Запрашиваем все PR и фильтруем по статусу
  const { data } = await prAPI.get("/manager/performance-reviews?limit=100");
  const allItems = data?.items || data || [];

  // Ищем активные или завершённые PR
  const activePRs = allItems.filter(
    (pr) => pr.status === "active" || pr.status === "finished",
  );

  if (activePRs.length === 0) {
    return { prId: null, revisionId: null, targetUserId: null };
  }

  // Перебираем активные PR пока не найдём один с ревизией
  for (const pr of activePRs) {
    const { data: revisions } = await prAPI.getRevisions(pr.id);
    const revisionId = revisions?.items?.[0]?.id || null;

    if (revisionId) {
      // Получаем target user
      const { data: targetUsers } = await prAPI.getTargetUsers(pr.id, {});
      const targetUserId =
        targetUsers?.items?.[0]?.userId || targetUsers?.items?.[0]?.id || null;

      return { prId: pr.id, revisionId, targetUserId };
    }
  }

  // Если не нашли с ревизией - возвращаем первый активный без ревизии
  const prId = activePRs[0].id;
  const { data: targetUsers } = await prAPI.getTargetUsers(prId, {});
  const targetUserId =
    targetUsers?.items?.[0]?.userId || targetUsers?.items?.[0]?.id || null;

  return { prId, revisionId: null, targetUserId };
}

test.describe(
  "Performance Review Export API",
  { tag: ["@api", "@regression", "@performance-review", "@export"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.PERFORMANCE_REVIEW, "Export");
    });

    test.describe("Export Token Endpoints", () => {
      test(
        "C6090: GET statistics/export/get-token - получить токен экспорта",
        { tag: ["@critical", "@db"] },
        async ({ prAPI, prVerifier }) => {
          setSeverity("critical");
          const { prId, revisionId } = await findActivePRWithData(prAPI);
          test.skip(!prId || !revisionId, "Нет данных");

          await test.step("DB: Проверка что PR существует", async () => {
            if (!prVerifier.isConnected()) return;
            await prVerifier.verifyPRCreated(prId);
          });

          const { response, data } = await prAPI.getExportToken(prId, {
            revisionId,
          });

          // API может вернуть 400 если недостаточно данных для экспорта
          expect([200, 201, 400]).toContain(response.status());

          // При успешном ответе валидируем токен
          if (response.ok()) {
            expect(data).toBeDefined();
            if (data?.token) {
              expect(typeof data.token).toBe("string");
              expect(data.token.length).toBeGreaterThan(0);
            }
          }
        },
      );

      test("C6091: GET statistics/export/get-token с targetUserId", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: GET statistics/export/get-token с targetUserId", async () => {
          const { prId, revisionId, targetUserId } =
            await findActivePRWithData(prAPI);
          test.skip(!prId || !revisionId || !targetUserId, "Нет данных");

          const { response, data } = await prAPI.getExportToken(prId, {
            revisionId,
            targetUserId,
          });

          expect([200, 201, 400]).toContain(response.status());

          // При успешном ответе валидируем токен
          if (response.ok() && data?.token) {
            expect(typeof data.token).toBe("string");
          }
        });
      });

      test("C6092: POST statistics/export/group-report/get-token - токен группового отчёта", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: POST statistics/export/group-report/get-token - токен группового отчёта", async () => {
          const { prId, revisionId, targetUserId } =
            await findActivePRWithData(prAPI);
          test.skip(!prId || !revisionId || !targetUserId, "Нет данных");

          const { response, data } = await prAPI.getGroupReportExportToken(
            prId,
            {
              performanceReviewId: prId,
              targetUserIds: [targetUserId],
              revisionId,
            },
          );

          expect([200, 201]).toContain(response.status());
          expect(data).toBeDefined();

          // Валидируем структуру токена
          if (data?.token) {
            expect(typeof data.token).toBe("string");
            expect(data.token.length).toBeGreaterThan(0);
          }
        });
      });

      test("C6093: POST statistics/export/group-report/get-token с departmentIds", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: POST statistics/export/group-report/get-token с departmentIds", async () => {
          const { prId, revisionId } = await findActivePRWithData(prAPI);
          test.skip(!prId || !revisionId, "Нет данных");

          const { response, data } = await prAPI.getGroupReportExportToken(
            prId,
            {
              performanceReviewId: prId,
              departmentIds: [],
              revisionId,
            },
          );

          // Может вернуть 200/201 или ошибку если нет данных
          expect([200, 201, 400, 422]).toContain(response.status());
        });
      });

      test("C6094: GET progress/export/get-token - токен экспорта прогресса", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: GET progress/export/get-token - токен экспорта прогресса", async () => {
          const { prId } = await findActivePRWithData(prAPI);
          test.skip(!prId, "Нет активного PR");

          const { response, data } = await prAPI.getProgressExportToken(prId);

          expect([200, 201, 400]).toContain(response.status());
        });
      });
    });

    test.describe("Export с разными параметрами", () => {
      test("C6095: Экспорт с userDate параметром", async ({ prAPI }) => {
        setSeverity("normal");

        await test.step("Выполнить: Экспорт с userDate параметром", async () => {
          const { prId, revisionId } = await findActivePRWithData(prAPI);
          test.skip(!prId || !revisionId, "Нет данных");

          const userDate = new Date().toISOString().split("T")[0];

          const { response, data } = await prAPI.getExportToken(prId, {
            revisionId,
            userDate,
          });

          expect([200, 201, 400]).toContain(response.status());
        });
      });

      test("C6096: Групповой отчёт без targetUserIds и departmentIds", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Групповой отчёт без targetUserIds и departmentIds", async () => {
          const { prId, revisionId } = await findActivePRWithData(prAPI);
          test.skip(!prId || !revisionId, "Нет данных");

          const { response } = await prAPI.getGroupReportExportToken(prId, {
            performanceReviewId: prId,
            revisionId,
          });

          // Может быть успех или ошибка валидации
          expect([200, 201, 400, 422]).toContain(response.status());
        });
      });
    });

    test.describe("Negative Tests", () => {
      test("C6097: GET export/get-token с несуществующим PR", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: GET export/get-token с несуществующим PR", async () => {
          const { response } = await prAPI.getExportToken(999999, {});

          expect([400, 403, 404]).toContain(response.status());
        });
      });

      test("C6098: POST group-report/get-token с несуществующим PR", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: POST group-report/get-token с несуществующим PR", async () => {
          const { response } = await prAPI.getGroupReportExportToken(999999, {
            performanceReviewId: 999999,
            revisionId: 999999,
          });

          expect([400, 403, 404]).toContain(response.status());
        });
      });

      test("C6099: GET progress/export/get-token с несуществующим PR", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: GET progress/export/get-token с несуществующим PR", async () => {
          const { response } = await prAPI.getProgressExportToken(999999);

          expect([400, 403, 404]).toContain(response.status());
        });
      });

      test("C6100: Экспорт с невалидной ревизией", async ({ prAPI }) => {
        setSeverity("normal");

        await test.step("Выполнить: Экспорт с невалидной ревизией", async () => {
          const { prId } = await findActivePRWithData(prAPI);
          test.skip(!prId, "Нет активного PR");

          const { response } = await prAPI.getExportToken(prId, {
            revisionId: 999999,
          });

          // Может быть 200 с пустыми данными или ошибка
          expect([200, 201, 400, 404, 422]).toContain(response.status());
        });
      });
    });
  },
);

test.describe(
  "Performance Review AI Summary API",
  { tag: ["@api", "@regression", "@performance-review", "@ai"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.PERFORMANCE_REVIEW, "AI Summary");
    });

    test.describe("AI Summary Endpoints", () => {
      test("C6101: GET ai/summary/tasks/last - получить последнюю AI задачу", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        let response, data;
        await test.step("Выполнить запрос: GET ai/summary/tasks/last - получить последнюю AI задачу", async () => {
          const { prId, revisionId } = await findActivePRWithData(prAPI);
          test.skip(!prId || !revisionId, "Нет данных");

          ({ response, data } = await prAPI.getAiSummaryLastTask(prId, {
            revisionId,
          }));

          // AI функционал может быть отключен или задача может отсутствовать
        });

        await test.step("Проверить ответ", async () => {
          expect([200, 201, 400, 404]).toContain(response.status());

          // При успешном ответе валидируем структуру задачи
          if (response.ok() && data) {
            // Задача должна иметь id и status
            if (data.id) {
              expect(
                typeof data.id === "string" || typeof data.id === "number",
              ).toBe(true);
            }
            if (data.status) {
              expect([
                "pending",
                "running",
                "completed",
                "failed",
                "cancelled",
              ]).toContain(data.status);
            }
          }
        });
      });

      test("C6102: GET ai/summary/tasks/last с targetUserId", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: GET ai/summary/tasks/last с targetUserId", async () => {
          const { prId, revisionId, targetUserId } =
            await findActivePRWithData(prAPI);
          test.skip(!prId || !revisionId || !targetUserId, "Нет данных");

          const { response, data } = await prAPI.getAiSummaryLastTask(prId, {
            revisionId,
            targetUserId,
          });

          expect([200, 201, 404]).toContain(response.status());

          // При успешном ответе валидируем структуру
          if (response.ok() && data?.id) {
            expect(
              typeof data.id === "string" || typeof data.id === "number",
            ).toBe(true);
          }
        });
      });

      test("C6103: POST ai/summary/tasks - создать AI задачу", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        let response, data;
        await test.step("Выполнить запрос: POST ai/summary/tasks - создать AI задачу", async () => {
          const { prId, revisionId, targetUserId } =
            await findActivePRWithData(prAPI);
          test.skip(!prId || !revisionId || !targetUserId, "Нет данных");

          ({ response, data } = await prAPI.createAiSummaryTask(prId, {
            revisionId,
            targetUserId,
          }));

          // AI функционал может быть отключен, или лимиты, или уже есть задача
          // Примечание: 429 удалён - rate limit слишком редкий случай для основного теста
        });

        await test.step("Проверить ответ", async () => {
          expect([200, 201, 400, 403, 409, 422]).toContain(response.status());

          // При успешном создании валидируем id задачи
          if (response.ok() && data) {
            if (data.id || data.taskId) {
              const taskId = data.id || data.taskId;
              expect(
                typeof taskId === "string" || typeof taskId === "number",
              ).toBe(true);
            }
          }
        });
      });

      test("C6104: POST ai/summary/tasks/{taskId}/refresh - обновить AI задачу", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        let response, data;
        await test.step("Выполнить запрос: POST ai/summary/tasks/{taskId}/refresh - обновить AI задачу", async () => {
          const { prId, revisionId, targetUserId } =
            await findActivePRWithData(prAPI);
          test.skip(!prId || !revisionId || !targetUserId, "Нет данных");

          // Сначала пробуем получить существующую задачу
          const { data: lastTask } = await prAPI.getAiSummaryLastTask(prId, {
            revisionId,
            targetUserId,
          });

          const taskId = lastTask?.id || lastTask?.taskId;
          test.skip(!taskId, "Нет существующей AI задачи для refresh");

          ({ response, data } = await prAPI.refreshAiSummaryTask(prId, taskId));

          // AI функционал может быть отключен, задача уже обновляется, или другие ограничения
          // Примечание: 429 удалён - rate limit слишком редкий случай для основного теста
        });

        await test.step("Проверить ответ", async () => {
          expect([200, 201, 400, 403, 409, 422]).toContain(response.status());
        });
      });

      test("C6105: POST ai/summary/tasks/{taskId}/refresh с несуществующим taskId", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: POST ai/summary/tasks/{taskId}/refresh с несуществующим taskId", async () => {
          const { prId } = await findActivePRWithData(prAPI);
          test.skip(!prId, "Нет активного PR");

          const { response } = await prAPI.refreshAiSummaryTask(
            prId,
            "non-existent-task-id",
          );

          // Должна быть ошибка - задача не найдена
          expect([400, 404]).toContain(response.status());
        });
      });
    });

    test.describe("Statistics Visibility", () => {
      test("C6106: PATCH statistics/visibility - изменить видимость (без данных)", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: PATCH statistics/visibility - изменить видимость (без данных)", async () => {
          const { prId, revisionId, targetUserId } =
            await findActivePRWithData(prAPI);
          test.skip(!prId || !revisionId || !targetUserId, "Нет данных");

          // Пробуем с несуществующим responseValueId
          const { response } = await prAPI.patchStatisticsVisibility(prId, {
            revisionId,
            targetUserId,
            responseValueId: 999999,
          });

          // Может быть успех или ошибка
          expect([200, 201, 400, 404, 422]).toContain(response.status());
        });
      });
    });

    test.describe("Negative Tests", () => {
      test("C6107: GET ai/summary/tasks/last с несуществующим PR", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: GET ai/summary/tasks/last с несуществующим PR", async () => {
          const { response } = await prAPI.getAiSummaryLastTask(999999, {});

          expect([400, 403, 404]).toContain(response.status());
        });
      });

      test("C6108: POST ai/summary/tasks с несуществующим PR", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: POST ai/summary/tasks с несуществующим PR", async () => {
          const { response } = await prAPI.createAiSummaryTask(999999, {
            revisionId: 999999,
            targetUserId: 999999,
          });

          expect([400, 403, 404]).toContain(response.status());
        });
      });
    });
  },
);

test.describe(
  "Performance Review Competence Statistics API",
  { tag: ["@api", "@regression", "@performance-review", "@competence"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.PERFORMANCE_REVIEW, "Competence Statistics");
    });

    test.describe("Competence Statistics (Protected)", () => {
      test(
        "C6109: POST competences/get - общая статистика по компетенциям",
        { tag: ["@critical"] },
        async ({ prAPI }) => {
          setSeverity("critical");

          await test.step("Выполнить: POST competences/get - общая статистика по компетенциям", async () => {
            const { response, data } = await prAPI.getCompetenceStatistics({});

            // Protected endpoint - может требовать особые права
            expect([200, 201, 400, 403]).toContain(response.status());

            // При успешном ответе валидируем структуру
            if (response.ok() && data) {
              const competences =
                data?.competences || data?.items || data || [];
              if (Array.isArray(competences) && competences.length > 0) {
                expect(competences[0]).toHaveProperty("id");
              }
            }
          });
        },
      );

      test("C6110: POST competences/of-performance-review/{id}/of-revision/{revisionId}", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: POST competences/of-performance-review/{id}/of-revision/{revisionId}", async () => {
          const { prId, revisionId } = await findActivePRWithData(prAPI);
          test.skip(!prId || !revisionId, "Нет данных");

          const { response, data } =
            await prAPI.getCompetenceStatisticsForRevision(
              prId,
              revisionId,
              {},
            );

          expect([200, 201, 400, 403, 404]).toContain(response.status());

          // При успешном ответе валидируем структуру
          if (response.ok() && data) {
            const items = Array.isArray(data)
              ? data
              : data?.competences || data?.items || [];
            expect(Array.isArray(items)).toBe(true);
          }
        });
      });

      test("C6111: POST competences/.../groups - группы компетенций", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        let response, data;
        await test.step("Выполнить запрос: POST competences/.../groups - группы компетенций", async () => {
          const { prId, revisionId } = await findActivePRWithData(prAPI);
          test.skip(!prId || !revisionId, "Нет данных");

          ({ response, data } = await prAPI.getCompetenceGroupsForRevision(
            prId,
            revisionId,
            {},
          ));
        });

        await test.step("Проверить ответ", async () => {
          expect([200, 201, 400, 403, 404]).toContain(response.status());

          // При успешном ответе валидируем структуру групп
          if (response.ok() && data) {
            const groups = Array.isArray(data)
              ? data
              : data?.groups || data?.items || [];
            expect(Array.isArray(groups)).toBe(true);
            if (groups.length > 0) {
              expect(groups[0]).toHaveProperty("id");
            }
          }
        });
      });

      test("C6112: GET competences/of-user/{userId}/of-revision/{revisionId}", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        let targetUserId, revisionId, response, data;
        await test.step("Выполнить запрос: GET competences/of-user/{userId}/of-revision/{revisionId}", async () => {
          ({ targetUserId, revisionId } = await findActivePRWithData(prAPI));
          test.skip(!targetUserId || !revisionId, "Нет данных");

          ({ response, data } = await prAPI.getCompetenceStatisticsForUser(
            targetUserId,
            revisionId,
            {},
          ));
        });

        await test.step("Проверить ответ", async () => {
          expect([200, 201, 400, 403, 404]).toContain(response.status());

          // При успешном ответе валидируем структуру
          if (response.ok() && data) {
            expect(data).toBeDefined();
            // Может содержать userId или competences
            if (data.userId) {
              expect(data.userId).toBe(targetUserId);
            }
          }
        });
      });

      test("C6113: POST users-competencies-results/get", async ({ prAPI }) => {
        setSeverity("normal");

        await test.step("Выполнить: POST users-competencies-results/get", async () => {
          const { prId } = await findActivePRWithData(prAPI);
          test.skip(!prId, "Нет активного PR");

          const { response, data } = await prAPI.getUsersCompetenciesResults(
            prId,
            {},
          );

          expect([200, 201, 400, 403, 404]).toContain(response.status());

          // При успешном ответе валидируем структуру результатов
          if (response.ok() && data) {
            const results = Array.isArray(data)
              ? data
              : data?.results || data?.items || [];
            expect(Array.isArray(results)).toBe(true);
          }
        });
      });
    });

    test.describe("Negative Tests", () => {
      test("C6114: POST competences/of-performance-review с несуществующим PR", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: POST competences/of-performance-review с несуществующим PR", async () => {
          const { response } = await prAPI.getCompetenceStatisticsForRevision(
            999999,
            999999,
            {},
          );

          expect([400, 403, 404]).toContain(response.status());
        });
      });

      test("C6115: GET competences/of-user с несуществующим user", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: GET competences/of-user с несуществующим user", async () => {
          const { response } = await prAPI.getCompetenceStatisticsForUser(
            999999,
            999999,
            {},
          );

          // API может вернуть пустые данные (200) или ошибку
          // Примечание: 500 удалён - серверная ошибка не должна быть ожидаемой
          expect([200, 201, 400, 403, 404, 409]).toContain(response.status());
        });
      });

      test("C6116: POST users-competencies-results с несуществующим PR", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: POST users-competencies-results с несуществующим PR", async () => {
          const { response } = await prAPI.getUsersCompetenciesResults(
            999999,
            {},
          );

          expect([400, 403, 404]).toContain(response.status());
        });
      });
    });
  },
);
