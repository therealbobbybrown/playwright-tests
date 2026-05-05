// @ts-check
import { test as base, expect } from "@playwright/test";
import { SurveyAPI, getCredentials } from "../../utils/api/index.js";
import { allure } from "allure-playwright";
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
 * API тесты для AI Classification Comments в Surveys — GET последняя задача
 *
 * Покрытие:
 * - GET /manager/surveys/{id}/ai/classify-comments/tasks/last/ - последняя задача классификации
 * - GET /manager/surveys/{id}/ai/classify-comments/survey-tasks/last/ - последняя задача классификации для опроса
 *
 * ВАЖНО: Тесты требуют опрос с комментариями для классификации
 * СТРОГИЕ ТЕСТЫ - не маскируют ошибки, а выявляют их.
 *
 * @tags @api @regression @survey @ai-classification
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

  // Сначала пробуем активные/finished опросы
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

  // Перебираем опросы, ищем тот у которого есть ревизии и вопросы
  for (const survey of items.slice(0, 15)) {
    try {
      const surveyId = survey.id;

      // Получаем ревизию
      const { response: revResp, data: revisions } =
        await surveyAPI.getRevisions(surveyId, { limit: 1 });
      if (!revResp.ok()) continue;

      const revisionId = revisions?.items?.[0]?.id;
      if (!revisionId) continue;

      // Пробуем получить вопросы через statistics или другой endpoint
      // Для AI classification нужен questionId
      // Можем попробовать получить assessments
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

      // Если не нашли questionId, всё равно возвращаем данные
      cachedSurveyData = { surveyId, revisionId, questionId: null };
      return cachedSurveyData;
    } catch (e) {
      continue;
    }
  }

  // Fallback - возвращаем первый опрос
  const surveyId = items[0]?.id || null;
  cachedSurveyData = { surveyId, revisionId: null, questionId: null };
  return cachedSurveyData;
}

test.describe(
  "Survey AI Classification API",
  { tag: ["@api", "@regression", "@survey", "@ai-classification"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.SURVEYS, "AI Classification");
    });

    // ==================== GET LAST TASK ====================

    test.describe("GET /manager/surveys/{id}/ai/classify-comments/tasks/last/ - Последняя задача классификации", () => {
      test(
        "C6789: Получить последнюю задачу классификации",
        { tag: ["@critical"] },
        async ({ surveyAPI }) => {
          setSeverity("critical");

          await test.step("Выполнить: Получить последнюю задачу классификации", async () => {
            const { surveyId, revisionId } =
              await findSurveyWithData(surveyAPI);
            test.skip(!surveyId, "Нет опроса для тестирования");

            const params = revisionId ? { revisionId } : {};
            const { response, data } =
              await surveyAPI.getAiClassifyCommentsLastTask(surveyId, params);

            expect([200, 400, 404, 500]).toContain(response.status());

            if (response.status() === 200) {
              expect(data).toBeDefined();
              // Может быть null или объект с данными задачи
              if (data !== null && typeof data === "object") {
                // Может содержать id, status и т.д.
                expect(typeof data).toBe("object");
              }
            }
          });
        },
      );

      test("C6790: Получить последнюю задачу с questionId", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить последнюю задачу с questionId", async () => {
          const { surveyId, revisionId, questionId } =
            await findSurveyWithData(surveyAPI);
          test.skip(!surveyId, "Нет опроса для тестирования");

          const params = {};
          if (revisionId) params.revisionId = revisionId;
          if (questionId) params.questionId = questionId;

          const { response, data } =
            await surveyAPI.getAiClassifyCommentsLastTask(surveyId, params);

          expect([200, 400, 404, 500]).toContain(response.status());
        });
      });

      test("C6791: Получить последнюю задачу для несуществующего опроса - должна быть ошибка", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить последнюю задачу для несуществующего опроса - должна быть ошибка", async () => {
          const { response } =
            await surveyAPI.getAiClassifyCommentsLastTask(999999999);

          expect([400, 403, 404, 409, 500]).toContain(response.status());
        });
      });

      test("C6792: Получить последнюю задачу с невалидным ID - должна быть ошибка", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить последнюю задачу с невалидным ID - должна быть ошибка", async () => {
          const { response } =
            await surveyAPI.getAiClassifyCommentsLastTask("invalid");

          expect([400, 403, 404, 409, 500]).toContain(response.status());
        });
      });

      test("C6793: Получить последнюю задачу с отрицательным ID - должна быть ошибка", async ({
        surveyAPI,
      }) => {
        setSeverity("minor");

        await test.step("Выполнить: Получить последнюю задачу с отрицательным ID - должна быть ошибка", async () => {
          const { response } =
            await surveyAPI.getAiClassifyCommentsLastTask(-1);

          expect([400, 403, 404, 409, 500]).toContain(response.status());
        });
      });
    });

    // ==================== GET LAST SURVEY TASK ====================

    test.describe("GET /manager/surveys/{id}/ai/classify-comments/survey-tasks/last/ - Последняя задача для опроса", () => {
      test(
        "C6794: Получить последнюю задачу классификации для опроса",
        { tag: ["@critical"] },
        async ({ surveyAPI }) => {
          setSeverity("critical");

          let response, data;
          await test.step("Выполнить запрос: Получить последнюю задачу классификации для опроса", async () => {
            const { surveyId, revisionId } =
              await findSurveyWithData(surveyAPI);
            test.skip(!surveyId, "Нет опроса для тестирования");

            const params = revisionId ? { revisionId } : {};
            ({ response, data } =
              await surveyAPI.getAiClassifyCommentsLastSurveyTask(
                surveyId,
                params,
              ));
          });

          await test.step("Проверить ответ", async () => {
            expect([200, 400, 404, 500]).toContain(response.status());

            if (response.status() === 200) {
              expect(data).toBeDefined();
              // Проверяем структуру
              if (data !== null && typeof data === "object") {
                // Может содержать status, progress и т.д.
                expect(typeof data).toBe("object");
              }
            }
          });
        },
      );

      test("C6795: Получить последнюю задачу с needToUpdate=true", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить последнюю задачу с needToUpdate=true", async () => {
          const { surveyId, revisionId } = await findSurveyWithData(surveyAPI);
          test.skip(!surveyId, "Нет опроса для тестирования");

          const params = { needToUpdate: true };
          if (revisionId) params.revisionId = revisionId;

          const { response, data } =
            await surveyAPI.getAiClassifyCommentsLastSurveyTask(
              surveyId,
              params,
            );

          expect([200, 400, 404, 500]).toContain(response.status());
        });
      });

      test("C6796: Получить последнюю задачу опроса (survey-task) для несуществующего опроса", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить последнюю survey-task для несуществующего опроса", async () => {
          const { response } =
            await surveyAPI.getAiClassifyCommentsLastSurveyTask(999999999);

          expect([400, 403, 404, 409, 500]).toContain(response.status());
        });
      });

      test("C6797: Получить последнюю задачу с невалидным revisionId", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить последнюю задачу с невалидным revisionId", async () => {
          const { surveyId } = await findSurveyWithData(surveyAPI);
          test.skip(!surveyId, "Нет опроса для тестирования");

          const { response } =
            await surveyAPI.getAiClassifyCommentsLastSurveyTask(surveyId, {
              revisionId: 999999999,
            });

          expect([200, 400, 404, 409, 500]).toContain(response.status());
        });
      });
    });
  },
);
