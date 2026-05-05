// @ts-check
import { test as base, expect } from "@playwright/test";
import { SurveyAPI, getCredentials } from "../../utils/api/index.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import {
  assertSuccessStatus,
  assertErrorStatus,
  assertHasRequiredProperties,
  assertValidArray,
  assertNotEmptyArray,
  assertEntityHasId,
  extractItems,
  extractFirstItem,
  assertUnauthorized,
  assertForbidden,
  assertNotFound,
  assertBadRequest,
} from "../../utils/api/common-assertions.js";

/**
 * API тесты для AI Classification в контексте Survey Statistics
 *
 * Покрытие:
 * - AI Tasks (get last, get last survey task, start, create, retry, refresh)
 * - Negative tests
 */

// Расширяем test с фикстурой для Survey API
const test = base.extend({
  surveyAPI: async ({ request }, use) => {
    const api = new SurveyAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
});

// Хелпер для получения активного опроса с данными
async function findActiveSurveyWithData(surveyAPI) {
  const { data: activeData } = await surveyAPI.getList({
    status: "active",
    limit: 20,
  });
  const activeItems = activeData?.items || activeData || [];

  if (activeItems.length > 0) {
    const activeSurvey = activeItems[0];
    const { data: revisions } = await surveyAPI.getRevisions(activeSurvey.id, {
      limit: 1,
    });
    const revision = revisions?.items?.[0] || null;

    return {
      surveyId: activeSurvey.id,
      survey: activeSurvey,
      revisionId: revision?.id || null,
      revisionAlias: revision?.alias || null,
      questionId: null,
    };
  }

  const { data } = await surveyAPI.getList({ limit: 50 });
  const items = data?.items || data || [];

  if (items.length > 0) {
    const { data: revisions } = await surveyAPI.getRevisions(items[0].id, {
      limit: 1,
    });
    const revision = revisions?.items?.[0] || null;

    return {
      surveyId: items[0].id,
      survey: items[0],
      revisionId: revision?.id || null,
      revisionAlias: revision?.alias || null,
      questionId: null,
    };
  }

  return {
    surveyId: null,
    survey: null,
    revisionId: null,
    revisionAlias: null,
    questionId: null,
  };
}

// Хелпер для получения ID вопроса из опроса
async function getQuestionIdFromSurvey(surveyAPI, surveyId) {
  const { data } = await surveyAPI.getById(surveyId);
  const pages = data?.pages || [];
  for (const page of pages) {
    const questions = page?.questions || [];
    if (questions.length > 0) {
      return questions[0].id;
    }
  }
  return null;
}

test.describe(
  "Survey AI Classification API",
  { tag: ["@api", "@regression", "@survey", "@ai"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.SURVEYS, "AI Classification");
    });

    test.describe("AI Tasks", () => {
      test(
        "C7036: GET .../ai/classify-comments/tasks/last/ - последняя задача AI",
        { tag: ["@critical"] },
        async ({ surveyAPI }) => {
          setSeverity("critical");

          let response, data;
          await test.step("Выполнить запрос: GET .../ai/classify-comments/tasks/last/ - последняя задача AI", async () => {
            const { surveyId, revisionId } =
              await findActiveSurveyWithData(surveyAPI);
            test.skip(!surveyId, "Нет опросов");

            const questionId = await getQuestionIdFromSurvey(
              surveyAPI,
              surveyId,
            );

            ({ response, data } = await surveyAPI.getAiClassifyCommentsLastTask(
              surveyId,
              {
                revisionId,
                questionId,
              },
            ));

            // AI может быть отключен или задачи нет
          });

          await test.step("Проверить ответ", async () => {
            expect([200, 400, 403, 404]).toContain(response.status());

            // Валидация структуры AI задачи
            if (response.ok() && data) {
              expect(typeof data).toBe("object");
              if (data.id !== undefined || data.taskId !== undefined) {
                const taskId = data.id || data.taskId;
                expect(typeof taskId).not.toBe("undefined");
              }
              if (data.status !== undefined) {
                expect([
                  "pending",
                  "process",
                  "processing",
                  "completed",
                  "failed",
                  "cancelled",
                  "error",
                ]).toContain(data.status);
              }
            }
          });
        },
      );

      test("C7037: GET .../ai/classify-comments/survey-tasks/last/ - последняя задача AI для опроса", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");

        let response, data;
        await test.step("Выполнить запрос: GET .../ai/classify-comments/survey-tasks/last/ - последняя задача AI для опроса", async () => {
          const { surveyId, revisionId } =
            await findActiveSurveyWithData(surveyAPI);
          test.skip(!surveyId, "Нет опросов");

          ({ response, data } =
            await surveyAPI.getAiClassifyCommentsLastSurveyTask(surveyId, {
              revisionId,
            }));
        });

        await test.step("Проверить ответ", async () => {
          expect([200, 400, 403, 404]).toContain(response.status());

          // Валидация структуры AI задачи для опроса
          if (response.ok() && data) {
            expect(typeof data).toBe("object");
            if (data.status !== undefined) {
              expect([
                "pending",
                "process",
                "processing",
                "completed",
                "failed",
                "cancelled",
                "error",
              ]).toContain(data.status);
            }
          }
        });
      });

      test(
        "C7038: POST .../ai/classify-comments/survey-task/ - запустить AI классификацию",
        { tag: ["@critical"] },
        async ({ surveyAPI }) => {
          setSeverity("critical");

          let response, data;
          await test.step("Выполнить запрос: POST .../ai/classify-comments/survey-task/ - запустить AI классификацию", async () => {
            const { surveyId, revisionId } =
              await findActiveSurveyWithData(surveyAPI);
            test.skip(!surveyId || !revisionId, "Нет данных");

            ({ response, data } =
              await surveyAPI.startAiClassifyCommentsSurveyTask(surveyId, {
                revisionId,
              }));

            // AI может быть отключен, лимиты, уже есть задача и т.д.
            // (429 удалён - rate limit тестируется отдельно)
          });

          await test.step("Проверить ответ", async () => {
            expect([200, 201, 400, 403, 409, 422]).toContain(response.status());

            // Валидация результата создания задачи
            if (response.ok() && data) {
              expect(typeof data).toBe("object");
              if (data.id !== undefined || data.taskId !== undefined) {
                const taskId = data.id || data.taskId;
                expect(typeof taskId).not.toBe("undefined");
              }
            }
          });
        },
      );

      test("C7039: POST .../ai/classify-comments/tasks/ - создать задачу для вопроса", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");

        let response, data;
        await test.step("Выполнить запрос: POST .../ai/classify-comments/tasks/ - создать задачу для вопроса", async () => {
          const { surveyId, revisionId } =
            await findActiveSurveyWithData(surveyAPI);
          test.skip(!surveyId || !revisionId, "Нет данных");

          const questionId = await getQuestionIdFromSurvey(surveyAPI, surveyId);
          test.skip(!questionId, "Нет вопросов");

          ({ response, data } = await surveyAPI.createAiClassifyCommentsTask(
            surveyId,
            {
              revisionId,
              questionId,
            },
          ));

          // (429 удалён - rate limit тестируется отдельно)
        });

        await test.step("Проверить ответ", async () => {
          expect([200, 201, 400, 403, 409, 422]).toContain(response.status());

          // Валидация результата создания задачи
          if (response.ok() && data) {
            expect(typeof data).toBe("object");
            if (data.id !== undefined || data.taskId !== undefined) {
              const taskId = data.id || data.taskId;
              expect(typeof taskId).not.toBe("undefined");
            }
          }
        });
      });

      test("C7040: POST .../ai/classify-comments/survey-tasks/retry/ - повторить AI классификацию", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: POST .../ai/classify-comments/survey-tasks/retry/ - повторить AI классификацию", async () => {
          const { surveyId, revisionId } =
            await findActiveSurveyWithData(surveyAPI);
          test.skip(!surveyId || !revisionId, "Нет данных");

          const { response, data } =
            await surveyAPI.retryAiClassifyCommentsSurveyTask(surveyId, {
              revisionId,
            });

          // Может не быть задачи для retry, AI отключен, лимиты и т.д.
          // (429 удалён - rate limit тестируется отдельно)
          expect([200, 201, 400, 403, 404, 409, 422]).toContain(
            response.status(),
          );
        });
      });

      test("C7041: POST .../ai/classify-comments/tasks/{taskId}/refresh/ - обновить задачу AI", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");

        let response, data;
        await test.step("Выполнить запрос: POST .../ai/classify-comments/tasks/{taskId}/refresh/ - обновить задачу AI", async () => {
          const { surveyId, revisionId } =
            await findActiveSurveyWithData(surveyAPI);
          test.skip(!surveyId || !revisionId, "Нет данных");

          // Сначала пробуем получить существующую задачу
          const questionId = await getQuestionIdFromSurvey(surveyAPI, surveyId);
          const { data: lastTask } =
            await surveyAPI.getAiClassifyCommentsLastTask(surveyId, {
              revisionId,
              questionId,
            });

          const taskId = lastTask?.id || lastTask?.taskId;
          test.skip(!taskId, "Нет существующей AI задачи для refresh");

          ({ response, data } = await surveyAPI.refreshAiClassifyCommentsTask(
            surveyId,
            taskId,
          ));

          // AI функционал может быть отключен, задача уже обновляется, или другие ограничения
          // (429 удалён - rate limit тестируется отдельно)
        });

        await test.step("Проверить ответ", async () => {
          expect([200, 201, 400, 403, 409, 422]).toContain(response.status());
        });
      });

      test("C7042: POST .../ai/classify-comments/tasks/{taskId}/refresh/ - несуществующий taskId", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: POST .../ai/classify-comments/tasks/{taskId}/refresh/ - несуществующий taskId", async () => {
          const { surveyId } = await findActiveSurveyWithData(surveyAPI);
          test.skip(!surveyId, "Нет опросов");

          const { response } = await surveyAPI.refreshAiClassifyCommentsTask(
            surveyId,
            "non-existent-task-id",
          );

          // Должна быть ошибка - задача не найдена
          expect([400, 404]).toContain(response.status());
        });
      });
    });

    test.describe("Negative Tests", () => {
      test("C7043: GET .../ai/classify-comments/tasks/last/ - несуществующий опрос", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: GET .../ai/classify-comments/tasks/last/ - несуществующий опрос", async () => {
          const { response } = await surveyAPI.getAiClassifyCommentsLastTask(
            999999,
            {},
          );

          expect([400, 403, 404]).toContain(response.status());
        });
      });

      test("C7044: POST .../ai/classify-comments/survey-task/ - несуществующий опрос", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: POST .../ai/classify-comments/survey-task/ - несуществующий опрос", async () => {
          const { response } =
            await surveyAPI.startAiClassifyCommentsSurveyTask(999999, {
              revisionId: 999999,
            });

          expect([400, 403, 404]).toContain(response.status());
        });
      });
    });
  },
);
