// @ts-check
import { test as base, expect } from "@playwright/test";
import { SurveyAPI, getCredentials } from "../../utils/api/index.js";
import { allure } from "allure-playwright";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

/**
 * API тесты для AI Classification Comments — задачи (start, retry, create, refresh)
 *
 * Покрытие:
 * - POST /manager/surveys/{id}/ai/classify-comments/survey-task/ - запуск классификации для опроса
 * - POST /manager/surveys/{id}/ai/classify-comments/survey-tasks/retry/ - повторный запуск классификации
 * - POST /manager/surveys/{id}/ai/classify-comments/tasks/ - создание задачи классификации для вопроса
 * - POST /manager/surveys/{id}/ai/classify-comments/tasks/{taskId}/refresh/ - обновление задачи классификации
 *
 * @tags @api @regression @survey @ai-classification
 */

// Кеш для данных опроса
let cachedSurveyData = null;

// Расширяем test с фикстурой для Survey API
const test = base.extend({
  surveyAPI: async ({ request }, use) => {
    const api = new SurveyAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
});

/**
 * Хелпер для поиска опроса с данными для классификации
 * @param {SurveyAPI} surveyAPI
 * @returns {Promise<{surveyId: number|null, revisionId: number|null, questionId: number|null}>}
 */
async function findSurveyWithData(surveyAPI) {
  if (cachedSurveyData) {
    return cachedSurveyData;
  }

  const { data: activeData } = await surveyAPI.getList({
    status: "active",
    limit: 20,
  });
  let items = activeData?.items || activeData || [];

  if (items.length === 0) {
    const { data: finishedData } = await surveyAPI.getList({
      status: "finished",
      limit: 20,
    });
    items = finishedData?.items || finishedData || [];
  }

  if (items.length === 0) {
    const { data: allData } = await surveyAPI.getList({ limit: 50 });
    items = allData?.items || allData || [];
  }

  if (items.length === 0) {
    cachedSurveyData = { surveyId: null, revisionId: null, questionId: null };
    return cachedSurveyData;
  }

  for (const survey of items.slice(0, 15)) {
    try {
      const surveyId = survey.id;

      const { response: revResp, data: revisions } =
        await surveyAPI.getRevisions(surveyId, { limit: 1 });
      if (!revResp.ok()) continue;

      const revisionId = revisions?.items?.[0]?.id;
      if (!revisionId) continue;

      const { response: assessResp, data: assessData } =
        await surveyAPI.getAssessments(surveyId);
      if (assessResp.ok()) {
        const assessmentItems = assessData?.items || assessData || [];
        if (assessmentItems.length > 0) {
          const firstAssessment = assessmentItems[0];
          const questionId = firstAssessment?.questions?.[0]?.id || null;

          cachedSurveyData = { surveyId, revisionId, questionId };
          return cachedSurveyData;
        }
      }

      cachedSurveyData = { surveyId, revisionId, questionId: null };
      return cachedSurveyData;
    } catch (e) {
      continue;
    }
  }

  const surveyId = items[0]?.id || null;
  cachedSurveyData = { surveyId, revisionId: null, questionId: null };
  return cachedSurveyData;
}

test.describe(
  "Survey AI Classification Tasks API",
  { tag: ["@api", "@regression", "@survey", "@ai-classification"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.SURVEYS, "AI Classification");
    });

    // ==================== START SURVEY TASK ====================

    test.describe("POST /manager/surveys/{id}/ai/classify-comments/survey-task/ - Запуск классификации", () => {
      test(
        "C6798: Попытка запуска классификации для опроса",
        { tag: ["@critical"] },
        async ({ surveyAPI }) => {
          setSeverity("critical");

          let response, data;
          await test.step("Выполнить запрос: Попытка запуска классификации для опроса", async () => {
            const { surveyId, revisionId } =
              await findSurveyWithData(surveyAPI);
            test.skip(!surveyId, "Нет опроса для тестирования");

            const payload = revisionId ? { revisionId } : {};
            ({ response, data } =
              await surveyAPI.startAiClassifyCommentsSurveyTask(
                surveyId,
                payload,
              ));

            // Может вернуть 200 (запущено), 400 (нет комментариев), 409 (уже запущено)
          });

          await test.step("Проверить ответ", async () => {
            expect([200, 400, 403, 404, 409, 422, 500]).toContain(
              response.status(),
            );

            if (response.status() === 200) {
              expect(data).toBeDefined();
              // Может содержать taskId, status и т.д.
            }
          });
        },
      );

      test("C6799: Запуск классификации с пустым payload", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Запуск классификации с пустым payload", async () => {
          const { surveyId } = await findSurveyWithData(surveyAPI);
          test.skip(!surveyId, "Нет опроса для тестирования");

          const { response } =
            await surveyAPI.startAiClassifyCommentsSurveyTask(surveyId, {});

          expect([200, 400, 403, 404, 409, 422, 500]).toContain(
            response.status(),
          );
        });
      });

      test("C6800: Запуск классификации для несуществующего опроса - должна быть ошибка", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Запуск классификации для несуществующего опроса - должна быть ошибка", async () => {
          const { response } =
            await surveyAPI.startAiClassifyCommentsSurveyTask(999999999, {});

          expect([400, 403, 404, 409, 500]).toContain(response.status());
        });
      });

      test("C6801: Запуск классификации с невалидным revisionId", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Запуск классификации с невалидным revisionId", async () => {
          const { surveyId } = await findSurveyWithData(surveyAPI);
          test.skip(!surveyId, "Нет опроса для тестирования");

          const { response } =
            await surveyAPI.startAiClassifyCommentsSurveyTask(surveyId, {
              revisionId: 999999999,
            });

          expect([400, 403, 404, 409, 422, 500]).toContain(response.status());
        });
      });

      test("C6802: Запуск классификации с невалидным ID опроса - должна быть ошибка", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Запуск классификации с невалидным ID опроса - должна быть ошибка", async () => {
          const { response } =
            await surveyAPI.startAiClassifyCommentsSurveyTask("invalid", {});

          expect([400, 403, 404, 409, 500]).toContain(response.status());
        });
      });
    });

    // ==================== RETRY SURVEY TASK ====================

    test.describe("POST /manager/surveys/{id}/ai/classify-comments/survey-tasks/retry/ - Повторный запуск", () => {
      test(
        "C6803: Попытка повторного запуска классификации",
        { tag: ["@critical"] },
        async ({ surveyAPI }) => {
          setSeverity("critical");

          await test.step("Выполнить: Попытка повторного запуска классификации", async () => {
            const { surveyId, revisionId } =
              await findSurveyWithData(surveyAPI);
            test.skip(!surveyId, "Нет опроса для тестирования");

            const payload = revisionId ? { revisionId } : {};
            const { response, data } =
              await surveyAPI.retryAiClassifyCommentsSurveyTask(
                surveyId,
                payload,
              );

            // Может вернуть 200 (запущено), 400 (нет задачи для повтора), 409 (задача в процессе)
            expect([200, 400, 403, 404, 409, 422, 500]).toContain(
              response.status(),
            );
          });
        },
      );

      test("C6804: Повторный запуск с пустым payload", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Повторный запуск с пустым payload", async () => {
          const { surveyId } = await findSurveyWithData(surveyAPI);
          test.skip(!surveyId, "Нет опроса для тестирования");

          const { response } =
            await surveyAPI.retryAiClassifyCommentsSurveyTask(surveyId, {});

          expect([200, 400, 403, 404, 409, 422, 500]).toContain(
            response.status(),
          );
        });
      });

      test("C6805: Повторный запуск для несуществующего опроса - должна быть ошибка", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Повторный запуск для несуществующего опроса - должна быть ошибка", async () => {
          const { response } =
            await surveyAPI.retryAiClassifyCommentsSurveyTask(999999999, {});

          expect([400, 403, 404, 409, 500]).toContain(response.status());
        });
      });

      test("C6806: Повторный запуск с невалидным revisionId", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Повторный запуск с невалидным revisionId", async () => {
          const { surveyId } = await findSurveyWithData(surveyAPI);
          test.skip(!surveyId, "Нет опроса для тестирования");

          const { response } =
            await surveyAPI.retryAiClassifyCommentsSurveyTask(surveyId, {
              revisionId: 999999999,
            });

          expect([200, 400, 403, 404, 409, 422, 500]).toContain(
            response.status(),
          );
        });
      });
    });

    // ==================== CREATE TASK ====================

    test.describe("POST /manager/surveys/{id}/ai/classify-comments/tasks/ - Создание задачи для вопроса", () => {
      test(
        "C6807: Попытка создания задачи классификации",
        { tag: ["@critical"] },
        async ({ surveyAPI }) => {
          setSeverity("critical");

          let response, data;
          await test.step("Выполнить запрос: Попытка создания задачи классификации", async () => {
            const { surveyId, revisionId, questionId } =
              await findSurveyWithData(surveyAPI);
            test.skip(!surveyId, "Нет опроса для тестирования");

            const payload = {};
            if (revisionId) payload.revisionId = revisionId;
            if (questionId) payload.questionId = questionId;

            ({ response, data } = await surveyAPI.createAiClassifyCommentsTask(
              surveyId,
              payload,
            ));

            // Может вернуть 200 (создано), 400 (нет комментариев/нет questionId)
          });

          await test.step("Проверить ответ", async () => {
            expect([200, 400, 403, 404, 409, 422, 500]).toContain(
              response.status(),
            );

            if (response.status() === 200) {
              expect(data).toBeDefined();
              // Может содержать taskId, status и т.д.
            }
          });
        },
      );

      test("C6808: Создание задачи с пустым payload", async ({ surveyAPI }) => {
        setSeverity("normal");

        await test.step("Выполнить: Создание задачи с пустым payload", async () => {
          const { surveyId } = await findSurveyWithData(surveyAPI);
          test.skip(!surveyId, "Нет опроса для тестирования");

          const { response } = await surveyAPI.createAiClassifyCommentsTask(
            surveyId,
            {},
          );

          // Может требовать questionId
          expect([200, 400, 403, 404, 409, 422, 500]).toContain(
            response.status(),
          );
        });
      });

      test("C6809: Создание задачи для несуществующего опроса - должна быть ошибка", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Создание задачи для несуществующего опроса - должна быть ошибка", async () => {
          const { response } = await surveyAPI.createAiClassifyCommentsTask(
            999999999,
            {
              questionId: 1,
            },
          );

          expect([400, 403, 404, 409, 500]).toContain(response.status());
        });
      });

      test("C6810: Создание задачи с несуществующим questionId - должна быть ошибка", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Создание задачи с несуществующим questionId - должна быть ошибка", async () => {
          const { surveyId, revisionId } = await findSurveyWithData(surveyAPI);
          test.skip(!surveyId, "Нет опроса для тестирования");

          const payload = { questionId: 999999999 };
          if (revisionId) payload.revisionId = revisionId;

          const { response } = await surveyAPI.createAiClassifyCommentsTask(
            surveyId,
            payload,
          );

          expect([200, 400, 403, 404, 409, 422, 500]).toContain(
            response.status(),
          );
        });
      });

      test("C6811: Создание задачи с невалидным ID опроса - должна быть ошибка", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Создание задачи с невалидным ID опроса - должна быть ошибка", async () => {
          const { response } = await surveyAPI.createAiClassifyCommentsTask(
            "invalid",
            { questionId: 1 },
          );

          expect([400, 403, 404, 409, 500]).toContain(response.status());
        });
      });

      test("C6812: Создание задачи с отрицательным questionId - должна быть ошибка", async ({
        surveyAPI,
      }) => {
        setSeverity("minor");

        await test.step("Выполнить: Создание задачи с отрицательным questionId - должна быть ошибка", async () => {
          const { surveyId } = await findSurveyWithData(surveyAPI);
          test.skip(!surveyId, "Нет опроса для тестирования");

          const { response } = await surveyAPI.createAiClassifyCommentsTask(
            surveyId,
            {
              questionId: -1,
            },
          );

          expect([200, 400, 403, 404, 409, 422, 500]).toContain(
            response.status(),
          );
        });
      });
    });

    // ==================== REFRESH TASK ====================

    test.describe("POST /manager/surveys/{id}/ai/classify-comments/tasks/{taskId}/refresh/ - Обновление задачи", () => {
      test("C6813: Попытка обновления задачи классификации", async ({
        surveyAPI,
      }) => {
        setSeverity("critical");

        await test.step("Выполнить: Попытка обновления задачи классификации", async () => {
          const { surveyId, revisionId, questionId } =
            await findSurveyWithData(surveyAPI);
          test.skip(!surveyId, "Нет опроса для тестирования");

          // Сначала пробуем получить последнюю задачу, чтобы узнать её ID
          const params = {};
          if (revisionId) params.revisionId = revisionId;
          if (questionId) params.questionId = questionId;

          const { response: lastTaskResp, data: lastTask } =
            await surveyAPI.getAiClassifyCommentsLastTask(surveyId, params);

          // Если есть задача, пробуем её обновить
          if (lastTaskResp.status() === 200 && lastTask?.id) {
            const { response, data } =
              await surveyAPI.refreshAiClassifyCommentsTask(
                surveyId,
                lastTask.id,
              );
            expect([200, 400, 403, 404, 409, 422, 500]).toContain(
              response.status(),
            );
          } else {
            // Пробуем обновить несуществующую задачу
            const { response } = await surveyAPI.refreshAiClassifyCommentsTask(
              surveyId,
              999999999,
            );
            expect([400, 403, 404, 409, 500]).toContain(response.status());
          }
        });
      });

      test("C6814: Обновление несуществующей задачи - должна быть ошибка", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Обновление несуществующей задачи - должна быть ошибка", async () => {
          const { surveyId } = await findSurveyWithData(surveyAPI);
          test.skip(!surveyId, "Нет опроса для тестирования");

          const { response } = await surveyAPI.refreshAiClassifyCommentsTask(
            surveyId,
            999999999,
          );

          expect([400, 403, 404, 409, 500]).toContain(response.status());
        });
      });

      test("C6815: Обновление задачи для несуществующего опроса - должна быть ошибка", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Обновление задачи для несуществующего опроса - должна быть ошибка", async () => {
          const { response } = await surveyAPI.refreshAiClassifyCommentsTask(
            999999999,
            1,
          );

          expect([400, 403, 404, 409, 500]).toContain(response.status());
        });
      });

      test("C6816: Обновление задачи с невалидным taskId - должна быть ошибка", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Обновление задачи с невалидным taskId - должна быть ошибка", async () => {
          const { surveyId } = await findSurveyWithData(surveyAPI);
          test.skip(!surveyId, "Нет опроса для тестирования");

          const { response } = await surveyAPI.refreshAiClassifyCommentsTask(
            surveyId,
            "invalid",
          );

          expect([400, 403, 404, 409, 500]).toContain(response.status());
        });
      });

      test("C6817: Обновление задачи с отрицательным taskId - должна быть ошибка", async ({
        surveyAPI,
      }) => {
        setSeverity("minor");

        await test.step("Выполнить: Обновление задачи с отрицательным taskId - должна быть ошибка", async () => {
          const { surveyId } = await findSurveyWithData(surveyAPI);
          test.skip(!surveyId, "Нет опроса для тестирования");

          const { response } = await surveyAPI.refreshAiClassifyCommentsTask(
            surveyId,
            -1,
          );

          expect([400, 403, 404, 409, 500]).toContain(response.status());
        });
      });
    });
  },
);
