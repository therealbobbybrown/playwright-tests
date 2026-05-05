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
 * API тесты для статистики Surveys
 *
 * Покрытие:
 * - Summary статистика
 * - Статистика по вопросам (timeline, answers)
 * - Статистика по ревизиям
 * - Статистика по департаментам и группам
 * - Настройки статистики
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
  // Сначала пробуем получить активные опросы напрямую
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
      questionId: null, // Будет заполнен из survey pages
    };
  }

  // Fallback - ищем любой опрос
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
  "Survey Statistics API",
  { tag: ["@api", "@regression", "@survey", "@statistics"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.SURVEYS, "Statistics");
    });

    test.describe("Summary Statistics", () => {
      test(
        "C7013: POST .../statistics/summary/get/ - получить сводную статистику",
        { tag: ["@critical"] },
        async ({ surveyAPI }) => {
          setSeverity("critical");

          let response, data;
          await test.step("Выполнить запрос: POST .../statistics/summary/get/ - получить сводную статистику", async () => {
            const { surveyId, revisionId } =
              await findActiveSurveyWithData(surveyAPI);
            test.skip(!surveyId, "Нет опросов");

            ({ response, data } = await surveyAPI.getStatisticsSummary(
              surveyId,
              {
                revisionsIds: revisionId ? [revisionId] : [],
              },
            ));
          });

          await test.step("Проверить ответ", async () => {
            expect([200, 201, 400]).toContain(response.status());

            // Валидация структуры сводной статистики
            if (response.ok() && data) {
              expect(typeof data).toBe("object");

              // Проверяем наличие основных полей статистики
              if (data.totalResponses !== undefined) {
                expect(typeof data.totalResponses).toBe("number");
                expect(data.totalResponses).toBeGreaterThanOrEqual(0);
              }
              if (data.completedResponses !== undefined) {
                expect(typeof data.completedResponses).toBe("number");
                expect(data.completedResponses).toBeGreaterThanOrEqual(0);
              }
              if (data.questions !== undefined) {
                assertValidArray(data.questions);
              }
            }
          });
        },
      );

      test("C7014: POST .../statistics/summary/get/ с фильтрами", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");

        let response, data;
        await test.step("Выполнить запрос: POST .../statistics/summary/get/ с фильтрами", async () => {
          const { surveyId, revisionId } =
            await findActiveSurveyWithData(surveyAPI);
          test.skip(!surveyId, "Нет опросов");

          const userDate = new Date().toISOString().split("T")[0];

          ({ response, data } = await surveyAPI.getStatisticsSummary(surveyId, {
            revisionsIds: revisionId ? [revisionId] : [],
            userDate,
            usersIds: [],
            userGroupsIds: [],
            userDepartmentsIds: [],
          }));
        });

        await test.step("Проверить ответ", async () => {
          expect([200, 201, 400]).toContain(response.status());

          // Валидация структуры при успешном ответе
          if (response.ok() && data) {
            expect(typeof data).toBe("object");
          }
        });
      });
    });

    test.describe("Question Statistics", () => {
      test("C7015: POST .../statistics/questions/{id}/timeline/get/ - timeline по вопросу", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");

        let response, data;
        await test.step("Выполнить запрос: POST .../statistics/questions/{id}/timeline/get/ - timeline по вопросу", async () => {
          const { surveyId, revisionId } =
            await findActiveSurveyWithData(surveyAPI);
          test.skip(!surveyId, "Нет опросов");

          const questionId = await getQuestionIdFromSurvey(surveyAPI, surveyId);
          test.skip(!questionId, "Нет вопросов");

          ({ response, data } = await surveyAPI.getStatisticsQuestionTimeline(
            surveyId,
            questionId,
            {
              revisionsIds: revisionId ? [revisionId] : [],
              aggregation: "day",
            },
          ));
        });

        await test.step("Проверить ответ", async () => {
          expect([200, 201, 400, 404]).toContain(response.status());

          // Валидация структуры timeline
          if (response.ok() && data) {
            const timeline = data?.items || data?.timeline || data || [];
            if (Array.isArray(timeline) && timeline.length > 0) {
              // Проверяем структуру элементов timeline
              expect(timeline[0]).toHaveProperty("date");
            }
          }
        });
      });

      test(
        "C7016: POST .../statistics/questions/{id}/answers/get/ - ответы по вопросу",
        { tag: ["@critical"] },
        async ({ surveyAPI }) => {
          setSeverity("critical");

          let response, data;
          await test.step("Выполнить запрос: POST .../statistics/questions/{id}/answers/get/ - ответы по вопросу", async () => {
            const { surveyId, revisionId } =
              await findActiveSurveyWithData(surveyAPI);
            test.skip(!surveyId, "Нет опросов");

            const questionId = await getQuestionIdFromSurvey(
              surveyAPI,
              surveyId,
            );
            test.skip(!questionId, "Нет вопросов");

            ({ response, data } = await surveyAPI.getStatisticsQuestionAnswers(
              surveyId,
              questionId,
              {
                revisionsIds: revisionId ? [revisionId] : [],
              },
            ));
          });

          await test.step("Проверить ответ", async () => {
            expect([200, 201, 400, 404]).toContain(response.status());

            // Валидация структуры ответов
            if (response.ok() && data) {
              const answers = data?.items || data?.answers || data || [];
              if (Array.isArray(answers)) {
                assertValidArray(answers);
                if (answers.length > 0) {
                  // Ответы должны содержать данные о выборе/тексте
                  expect(answers[0]).toBeDefined();
                }
              }
            }
          });
        },
      );

      test("C7017: POST .../statistics/questions/{id}/timeline/get/ с агрегацией по неделям", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");

        let response, data;
        await test.step("Выполнить запрос: POST .../statistics/questions/{id}/timeline/get/ с агрегацией по неделям", async () => {
          const { surveyId, revisionId } =
            await findActiveSurveyWithData(surveyAPI);
          test.skip(!surveyId, "Нет опросов");

          const questionId = await getQuestionIdFromSurvey(surveyAPI, surveyId);
          test.skip(!questionId, "Нет вопросов");

          ({ response, data } = await surveyAPI.getStatisticsQuestionTimeline(
            surveyId,
            questionId,
            {
              revisionsIds: revisionId ? [revisionId] : [],
              aggregation: "week",
            },
          ));
        });

        await test.step("Проверить ответ", async () => {
          expect([200, 201, 400, 404]).toContain(response.status());

          // Валидация структуры при успешном ответе
          if (response.ok() && data) {
            const timeline = data?.items || data?.timeline || data || [];
            if (Array.isArray(timeline)) {
              assertValidArray(timeline);
            }
          }
        });
      });
    });

    test.describe("Revisions Statistics", () => {
      test(
        "C7018: GET .../statistics/revisions/ - статистика по ревизиям",
        { tag: ["@critical"] },
        async ({ surveyAPI }) => {
          setSeverity("critical");

          await test.step("Выполнить: GET .../statistics/revisions/ - статистика по ревизиям", async () => {
            const { surveyId } = await findActiveSurveyWithData(surveyAPI);
            test.skip(!surveyId, "Нет опросов");

            const { response, data } =
              await surveyAPI.getStatisticsRevisions(surveyId);

            expect([200, 400]).toContain(response.status());

            // Валидация структуры статистики ревизий
            if (response.ok() && data) {
              const revisions = data?.items || data || [];
              if (Array.isArray(revisions)) {
                assertValidArray(revisions);
                if (revisions.length > 0) {
                  expect(revisions[0]).toHaveProperty("id");
                }
              }
            }
          });
        },
      );
    });

    test.describe("Departments & Groups Statistics", () => {
      test(
        "C7019: GET .../statistics/departments/ - статистика по департаментам",
        { tag: ["@critical"] },
        async ({ surveyAPI }) => {
          setSeverity("critical");

          let response, data;
          await test.step("Выполнить запрос: GET .../statistics/departments/ - статистика по департаментам", async () => {
            const { surveyId, revisionId } =
              await findActiveSurveyWithData(surveyAPI);
            test.skip(!surveyId, "Нет опросов");

            ({ response, data } = await surveyAPI.getStatisticsDepartments(
              surveyId,
              {
                revisionsIds: revisionId,
              },
            ));
          });

          await test.step("Проверить ответ", async () => {
            expect([200, 400]).toContain(response.status());

            // Валидация структуры статистики департаментов
            if (response.ok() && data) {
              const departments = data?.items || data || [];
              if (Array.isArray(departments)) {
                assertValidArray(departments);
                if (departments.length > 0) {
                  expect(departments[0]).toHaveProperty("id");
                  if (departments[0].name !== undefined) {
                    expect(typeof departments[0].name).toBe("string");
                  }
                }
              }
            }
          });
        },
      );

      test(
        "C7020: GET .../statistics/user-groups/ - статистика по группам",
        { tag: ["@critical"] },
        async ({ surveyAPI }) => {
          setSeverity("critical");

          let response, data;
          await test.step("Выполнить запрос: GET .../statistics/user-groups/ - статистика по группам", async () => {
            const { surveyId, revisionId } =
              await findActiveSurveyWithData(surveyAPI);
            test.skip(!surveyId, "Нет опросов");

            ({ response, data } = await surveyAPI.getStatisticsUserGroups(
              surveyId,
              {
                revisionsIds: revisionId,
              },
            ));
          });

          await test.step("Проверить ответ", async () => {
            expect([200, 400]).toContain(response.status());

            // Валидация структуры статистики групп
            if (response.ok() && data) {
              const groups = data?.items || data || [];
              if (Array.isArray(groups)) {
                assertValidArray(groups);
                if (groups.length > 0) {
                  expect(groups[0]).toHaveProperty("id");
                  if (groups[0].name !== undefined) {
                    expect(typeof groups[0].name).toBe("string");
                  }
                }
              }
            }
          });
        },
      );

      test("C7021: GET .../statistics/users/ - статистика по пользователям", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");

        let response, data;
        await test.step("Выполнить запрос: GET .../statistics/users/ - статистика по пользователям", async () => {
          const { surveyId, revisionId } =
            await findActiveSurveyWithData(surveyAPI);
          test.skip(!surveyId, "Нет опросов");

          ({ response, data } = await surveyAPI.getStatisticsUsers(surveyId, {
            revisionsIds: revisionId,
            limit: 10,
            offset: 0,
          }));
        });

        await test.step("Проверить ответ", async () => {
          expect([200, 400]).toContain(response.status());

          // Валидация структуры и пагинации
          if (response.ok() && data) {
            const users = data?.items || data || [];
            if (Array.isArray(users)) {
              assertValidArray(users);
              expect(users.length).toBeLessThanOrEqual(10); // limit = 10
              if (users.length > 0) {
                expect(users[0]).toHaveProperty("id");
              }
            }
            // Проверка метаданных пагинации
            if (data?.total !== undefined) {
              expect(typeof data.total).toBe("number");
              expect(data.total).toBeGreaterThanOrEqual(0);
            }
          }
        });
      });

      test("C7022: GET .../statistics/users/ с поиском", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");

        let response, data;
        await test.step("Выполнить запрос: GET .../statistics/users/ с поиском", async () => {
          const { surveyId, revisionId } =
            await findActiveSurveyWithData(surveyAPI);
          test.skip(!surveyId, "Нет опросов");

          ({ response, data } = await surveyAPI.getStatisticsUsers(surveyId, {
            revisionsIds: revisionId,
            q: "test",
            limit: 10,
          }));
        });

        await test.step("Проверить ответ", async () => {
          expect([200, 400]).toContain(response.status());

          // Валидация структуры при поиске
          if (response.ok() && data) {
            const users = data?.items || data || [];
            if (Array.isArray(users)) {
              assertValidArray(users);
              expect(users.length).toBeLessThanOrEqual(10); // limit = 10
            }
          }
        });
      });

      test("C7023: POST .../statistics/membership/update/ - обновить членство", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: POST .../statistics/membership/update/ - обновить членство", async () => {
          const { surveyId, revisionId } =
            await findActiveSurveyWithData(surveyAPI);
          test.skip(!surveyId || !revisionId, "Нет данных");

          const { response } = await surveyAPI.updateStatisticsUsersMembership(
            surveyId,
            revisionId,
          );

          expect([200, 201, 400]).toContain(response.status());
        });
      });
    });

    test.describe("Statistics Settings", () => {
      test(
        "C7024: GET .../statistics/settings/ - получить настройки",
        { tag: ["@critical"] },
        async ({ surveyAPI }) => {
          setSeverity("critical");

          await test.step("Выполнить: GET .../statistics/settings/ - получить настройки", async () => {
            const { surveyId } = await findActiveSurveyWithData(surveyAPI);
            test.skip(!surveyId, "Нет опросов");

            const { response, data } =
              await surveyAPI.getStatisticsSettings(surveyId);

            expect([200, 400, 404]).toContain(response.status());

            // Валидация структуры настроек
            if (response.ok() && data) {
              expect(typeof data).toBe("object");
            }
          });
        },
      );

      test(
        "C7025: POST .../statistics/settings/ - обновить настройки (без изменений)",
        { tag: ["@critical"] },
        async ({ surveyAPI }) => {
          setSeverity("critical");

          await test.step("Выполнить: POST .../statistics/settings/ - обновить настройки (без изменений)", async () => {
            const { surveyId } = await findActiveSurveyWithData(surveyAPI);
            test.skip(!surveyId, "Нет опросов");

            // Получаем текущие настройки
            const { data: currentSettings } =
              await surveyAPI.getStatisticsSettings(surveyId);

            // Отправляем те же настройки обратно
            const { response } = await surveyAPI.updateStatisticsSettings(
              surveyId,
              currentSettings || {},
            );

            expect([200, 201, 400]).toContain(response.status());
          });
        },
      );
    });

    test.describe("Negative Tests", () => {
      test("C7026: POST .../statistics/summary/get/ - несуществующий опрос", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: POST .../statistics/summary/get/ - несуществующий опрос", async () => {
          const { response } = await surveyAPI.getStatisticsSummary(999999, {});

          expect([400, 403, 404]).toContain(response.status());
        });
      });

      test("C7027: GET .../statistics/revisions/ - несуществующий опрос", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: GET .../statistics/revisions/ - несуществующий опрос", async () => {
          const { response } = await surveyAPI.getStatisticsRevisions(999999);

          expect([400, 403, 404]).toContain(response.status());
        });
      });

      test("C7028: GET .../statistics/departments/ - несуществующий опрос", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: GET .../statistics/departments/ - несуществующий опрос", async () => {
          const { response } = await surveyAPI.getStatisticsDepartments(
            999999,
            {},
          );

          expect([400, 403, 404]).toContain(response.status());
        });
      });

      test("C7029: GET .../statistics/settings/ - несуществующий опрос", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: GET .../statistics/settings/ - несуществующий опрос", async () => {
          const { response } = await surveyAPI.getStatisticsSettings(999999);

          expect([400, 403, 404]).toContain(response.status());
        });
      });
    });
  },
);
