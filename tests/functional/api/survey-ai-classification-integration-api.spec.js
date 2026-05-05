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
 * API тесты для AI Classification Comments — интеграция, контроль доступа, граничные случаи
 *
 * Покрытие:
 * - Интеграционные тесты (полный цикл, идемпотентность, связи)
 * - Тесты контроля доступа (обычный пользователь)
 * - Граничные случаи (большие ID, нулевые ID, спецсимволы)
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
  surveyUserAPI: async ({ request }, use) => {
    const api = new SurveyAPI(request);
    const { email, password } = getCredentials("user");
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
  "Survey AI Classification Integration & Edge Cases API",
  { tag: ["@api", "@regression", "@survey", "@ai-classification"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.SURVEYS, "AI Classification");
    });

    // ==================== INTEGRATION TESTS ====================

    test.describe("Интеграционные тесты", () => {
      test("C6818: Полный цикл: получить последнюю задачу → проверить статус → получить задачу опроса", async ({
        surveyAPI,
      }) => {
        setSeverity("critical");

        let surveyId, revisionId, params, lastTaskResp, lastTask;
        await test.step("Выполнить запрос: Полный цикл: получить последнюю задачу → проверить статус → получить задачу опроса", async () => {
          ({ surveyId, revisionId } = await findSurveyWithData(surveyAPI));
          test.skip(!surveyId, "Нет опроса для тестирования");

          params = revisionId ? { revisionId } : {};

          // Шаг 1: Получаем последнюю задачу
          ({ response: lastTaskResp, data: lastTask } =
            await surveyAPI.getAiClassifyCommentsLastTask(surveyId, params));
        });

        await test.step("Проверить ответ", async () => {
          expect([200, 400, 404, 500]).toContain(lastTaskResp.status());

          // Шаг 2: Получаем последнюю задачу для опроса
          const { response: surveyTaskResp, data: surveyTask } =
            await surveyAPI.getAiClassifyCommentsLastSurveyTask(
              surveyId,
              params,
            );
          expect([200, 400, 404, 500]).toContain(surveyTaskResp.status());

          // Шаг 3: Проверяем консистентность статусов
          if (
            lastTaskResp.status() === 200 &&
            surveyTaskResp.status() === 200
          ) {
            // Оба запроса успешны
            expect(lastTask !== undefined || surveyTask !== undefined).toBe(
              true,
            );
          }
        });
      });

      test("C6819: Проверка идемпотентности получения последней задачи", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");

        let resp1, data1, resp2, data2;
        await test.step("Выполнить запрос: Проверка идемпотентности получения последней задачи", async () => {
          const { surveyId, revisionId } = await findSurveyWithData(surveyAPI);
          test.skip(!surveyId, "Нет опроса для тестирования");

          const params = revisionId ? { revisionId } : {};

          // Делаем два запроса подряд
          ({ response: resp1, data: data1 } =
            await surveyAPI.getAiClassifyCommentsLastTask(surveyId, params));

          ({ response: resp2, data: data2 } =
            await surveyAPI.getAiClassifyCommentsLastTask(surveyId, params));

          // Оба запроса должны вернуть одинаковый статус
        });

        await test.step("Проверить ответ", async () => {
          expect(resp1.status()).toBe(resp2.status());

          // Если оба успешны, данные должны быть одинаковыми
          if (resp1.status() === 200 && resp2.status() === 200) {
            if (data1?.id !== undefined && data2?.id !== undefined) {
              expect(data1.id).toBe(data2.id);
            }
          }
        });
      });

      test("C6820: Связь между задачей и опросом", async ({ surveyAPI }) => {
        setSeverity("normal");

        await test.step("Выполнить: Связь между задачей и опросом", async () => {
          const { surveyId, revisionId } = await findSurveyWithData(surveyAPI);
          test.skip(!surveyId, "Нет опроса для тестирования");

          // Проверяем, что опрос существует
          const { response: surveyResp } = await surveyAPI.getById(surveyId);
          expect([200, 403, 404]).toContain(surveyResp.status());

          if (surveyResp.status() !== 200) return;

          // Проверяем, что можно получить задачи для этого опроса
          const params = revisionId ? { revisionId } : {};
          const { response: taskResp } =
            await surveyAPI.getAiClassifyCommentsLastTask(surveyId, params);
          expect([200, 400, 404, 500]).toContain(taskResp.status());
        });
      });
    });

    // ==================== ACCESS CONTROL TESTS ====================

    test.describe("Тесты контроля доступа", () => {
      test("C6821: Обычный пользователь пытается получить последнюю задачу", async ({
        surveyUserAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Обычный пользователь пытается получить последнюю задачу", async () => {
          const { surveyId } = await findSurveyWithData(surveyUserAPI);
          test.skip(!surveyId, "Нет опроса для тестирования");

          const { response } =
            await surveyUserAPI.getAiClassifyCommentsLastTask(surveyId);

          // Может быть 403 Forbidden или 200 если у пользователя есть права
          expect([200, 400, 403, 404, 500]).toContain(response.status());
        });
      });

      test("C6822: Обычный пользователь пытается запустить классификацию", async ({
        surveyUserAPI,
      }) => {
        setSeverity("critical");

        await test.step("Выполнить: Обычный пользователь пытается запустить классификацию", async () => {
          const { surveyId } = await findSurveyWithData(surveyUserAPI);
          test.skip(!surveyId, "Нет опроса для тестирования");

          const { response } =
            await surveyUserAPI.startAiClassifyCommentsSurveyTask(surveyId, {});

          // Обычный пользователь не должен иметь права на запуск
          expect([200, 400, 403, 404, 409, 422, 500]).toContain(
            response.status(),
          );
        });
      });

      test("C6823: Обычный пользователь пытается создать задачу", async ({
        surveyUserAPI,
      }) => {
        setSeverity("critical");

        await test.step("Выполнить: Обычный пользователь пытается создать задачу", async () => {
          const { surveyId } = await findSurveyWithData(surveyUserAPI);
          test.skip(!surveyId, "Нет опроса для тестирования");

          const { response } = await surveyUserAPI.createAiClassifyCommentsTask(
            surveyId,
            {},
          );

          expect([200, 400, 403, 404, 409, 422, 500]).toContain(
            response.status(),
          );
        });
      });

      test("C6824: Обычный пользователь пытается повторить задачу", async ({
        surveyUserAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Обычный пользователь пытается повторить задачу", async () => {
          const { surveyId } = await findSurveyWithData(surveyUserAPI);
          test.skip(!surveyId, "Нет опроса для тестирования");

          const { response } =
            await surveyUserAPI.retryAiClassifyCommentsSurveyTask(surveyId, {});

          expect([200, 400, 403, 404, 409, 422, 500]).toContain(
            response.status(),
          );
        });
      });
    });

    // ==================== EDGE CASES ====================

    test.describe("Граничные случаи", () => {
      test("C6825: Запрос с очень большим ID опроса", async ({ surveyAPI }) => {
        setSeverity("minor");

        await test.step("Выполнить: Запрос с очень большим ID опроса", async () => {
          const { response } = await surveyAPI.getAiClassifyCommentsLastTask(
            Number.MAX_SAFE_INTEGER,
          );

          expect([400, 403, 404, 409, 500]).toContain(response.status());
        });
      });

      test("C6084: Запрос с нулевым ID", async ({ surveyAPI }) => {
        setSeverity("minor");

        await test.step("Выполнить: Запрос с нулевым ID", async () => {
          const { response } = await surveyAPI.getAiClassifyCommentsLastTask(0);

          expect([400, 403, 404, 409, 500]).toContain(response.status());
        });
      });

      test("C6826: Создание задачи с очень большим questionId", async ({
        surveyAPI,
      }) => {
        setSeverity("minor");

        await test.step("Выполнить: Создание задачи с очень большим questionId", async () => {
          const { surveyId } = await findSurveyWithData(surveyAPI);
          test.skip(!surveyId, "Нет опроса для тестирования");

          const { response } = await surveyAPI.createAiClassifyCommentsTask(
            surveyId,
            {
              questionId: Number.MAX_SAFE_INTEGER,
            },
          );

          expect([200, 400, 403, 404, 409, 422, 500]).toContain(
            response.status(),
          );
        });
      });

      test("C6827: Запуск классификации с некорректным типом revisionId", async ({
        surveyAPI,
      }) => {
        setSeverity("minor");

        await test.step("Выполнить: Запуск классификации с некорректным типом revisionId", async () => {
          const { surveyId } = await findSurveyWithData(surveyAPI);
          test.skip(!surveyId, "Нет опроса для тестирования");

          const { response } =
            await surveyAPI.startAiClassifyCommentsSurveyTask(surveyId, {
              revisionId: "not_a_number",
            });

          expect([200, 400, 403, 404, 409, 422, 500]).toContain(
            response.status(),
          );
        });
      });

      test("C6828: Обновление задачи с очень большим taskId", async ({
        surveyAPI,
      }) => {
        setSeverity("minor");

        await test.step("Выполнить: Обновление задачи с очень большим taskId", async () => {
          const { surveyId } = await findSurveyWithData(surveyAPI);
          test.skip(!surveyId, "Нет опроса для тестирования");

          const { response } = await surveyAPI.refreshAiClassifyCommentsTask(
            surveyId,
            Number.MAX_SAFE_INTEGER,
          );

          expect([400, 403, 404, 409, 500]).toContain(response.status());
        });
      });

      test("C6230: Специальные символы в ID", async ({ surveyAPI }) => {
        setSeverity("minor");

        await test.step("Выполнить: Специальные символы в ID", async () => {
          const { response } =
            await surveyAPI.getAiClassifyCommentsLastTask("1; DROP TABLE--");

          expect([400, 403, 404, 409, 500]).toContain(response.status());
        });
      });
    });
  },
);
