// @ts-check
import { test as fullTest, expect } from "../../fixtures/full.js";
import { SurveyAPI, getCredentials } from "../../utils/api/index.js";
import { SurveySeedHelper } from "../../utils/seed/SurveySeedHelper.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import {
  assertSuccessStatus,
  assertValidArray,
} from "../../utils/api/common-assertions.js";

/**
 * API тесты для модуля Surveys — Жизненный цикл, Избранное, Ревизии, Негативные тесты
 */

// Расширяем fullTest с фикстурой для Survey API (включает DB фикстуры)
const test = fullTest.extend({
  surveyAPI: async ({ request }, use) => {
    const api = new SurveyAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
});

// Хелпер для получения активного опроса с данными
async function findActiveSurveyWithData(surveyAPI) {
  // Сначала ищем активные опросы напрямую
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
    const revisionId = revisions?.items?.[0]?.id || null;
    const revisionAlias = revisions?.items?.[0]?.alias || null;

    return {
      surveyId: activeSurvey.id,
      survey: activeSurvey,
      revisionId,
      revisionAlias,
    };
  }

  // Fallback - ищем любой опрос
  const { data } = await surveyAPI.getList({ limit: 50 });
  const items = data?.items || data || [];

  if (items.length > 0) {
    const { data: revisions } = await surveyAPI.getRevisions(items[0].id, {
      limit: 1,
    });
    const revisionId = revisions?.items?.[0]?.id || null;
    const revisionAlias = revisions?.items?.[0]?.alias || null;

    return {
      surveyId: items[0].id,
      survey: items[0],
      revisionId,
      revisionAlias,
    };
  }

  return {
    surveyId: null,
    survey: null,
    revisionId: null,
    revisionAlias: null,
  };
}

test.describe(
  "Survey API - Lifecycle, Favorites & Revisions",
  { tag: ["@api", "@regression", "@survey", "@crud"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.SURVEYS, "CRUD");
    });

    test.describe("Lifecycle (Start/Stop/Resume)", () => {
      let testStoppedSurveyId = null;

      test.beforeAll(async ({ request }) => {
        // Создаём остановленный опрос для теста resume
        const seedHelper = new SurveySeedHelper(request);
        await seedHelper.init("admin");

        try {
          const stoppedSurvey = await seedHelper.seedStoppedSurvey({
            title: "E2E_Stopped Survey for Resume Test",
          });
          testStoppedSurveyId = stoppedSurvey.id;
          console.log(`Создан остановленный опрос: ID=${testStoppedSurveyId}`);
        } catch (error) {
          console.warn(
            "Не удалось создать остановленный опрос:",
            error.message,
          );
        }
      });

      test.afterAll(async ({ request }) => {
        // Очистка: удаляем созданный опрос
        if (testStoppedSurveyId) {
          const api = new SurveyAPI(request);
          const { email, password } = getCredentials("admin");
          await api.signIn(email, password);

          try {
            await api.stop(testStoppedSurveyId);
          } catch {
            /* ignore */
          }

          try {
            await api.remove(testStoppedSurveyId);
            console.log(
              `Удалён тестовый остановленный опрос: ID=${testStoppedSurveyId}`,
            );
          } catch (error) {
            console.warn("Не удалось удалить тестовый опрос:", error.message);
          }
        }
      });

      test(
        "C6859: POST /manager/surveys/{id}/start/ - запуск черновика",
        { tag: ["@critical", "@db"] },
        async ({ surveyAPI, surveyVerifier }) => {
          setSeverity("critical");
          let draftSurvey, response;

          await test.step("Найти черновик опроса для запуска", async () => {
            const result = await surveyAPI.getList({
              status: "draft",
              limit: 1,
            });
            const data = result.data;
            draftSurvey = data?.items?.[0] || data?.[0];
            test.skip(!draftSurvey, "Нет черновиков");
          });

          await test.step("DB: Проверка статуса draft перед запуском", async () => {
            if (!surveyVerifier.isConnected()) return;
            await surveyVerifier.verifySurveyCreated(draftSurvey.id);
          });

          await test.step(`Отправить POST /manager/surveys/${draftSurvey.id}/start/`, async () => {
            const result = await surveyAPI.start(draftSurvey.id);
            response = result.response;
          });

          await test.step("Проверить статус ответа: 200/201 OK, 400 Bad Request, или 422 Unprocessable", async () => {
            expect([200, 201, 400, 422]).toContain(response.status());
          });

          await test.step("DB: Проверка изменения статуса на active после запуска", async () => {
            if (response.ok() && surveyVerifier.isConnected()) {
              await surveyVerifier.verifySurveyStatus(draftSurvey.id, "active");
            }
          });
        },
      );

      test(
        "C6860: POST /manager/surveys/{id}/stop/ - остановка опроса",
        { tag: ["@critical", "@db"] },
        async ({ surveyAPI, surveyVerifier }) => {
          setSeverity("critical");
          let activeSurvey, response, survey;

          await test.step("Найти активный опрос для остановки", async () => {
            const result = await surveyAPI.getList({
              status: "active",
              limit: 1,
            });
            const data = result.data;
            activeSurvey = data?.items?.[0] || data?.[0];
            test.skip(!activeSurvey, "Нет активных опросов");
          });

          await test.step("DB: Проверка статуса active перед остановкой", async () => {
            if (!surveyVerifier.isConnected()) return;
            await surveyVerifier.verifySurveyStatus(activeSurvey.id, "active");
          });

          await test.step(`Отправить POST /manager/surveys/${activeSurvey.id}/stop/`, async () => {
            const result = await surveyAPI.stop(activeSurvey.id);
            response = result.response;
          });

          await test.step("Проверить статус ответа: 200/201 OK или 400 Bad Request", async () => {
            expect([200, 201, 400]).toContain(response.status());
          });

          await test.step("DB: Проверка изменения статуса на complete/stopped после остановки", async () => {
            if (response.ok() && surveyVerifier.isConnected()) {
              survey = await surveyVerifier.getSurvey(activeSurvey.id);
              expect(["complete", "stopped"]).toContain(survey?.status);
            }
          });
        },
      );

      test(
        "C6861: POST /manager/surveys/{id}/resume/ - возобновление опроса",
        { tag: ["@critical", "@db"] },
        async ({ surveyAPI, surveyVerifier }) => {
          setSeverity("critical");
          let stoppedSurveyId, response;

          await test.step("Найти остановленный опрос для возобновления", async () => {
            stoppedSurveyId = testStoppedSurveyId;

            if (!stoppedSurveyId) {
              const result = await surveyAPI.getList({
                status: "stopped",
                limit: 1,
              });
              const data = result.data;
              const stoppedSurvey = data?.items?.[0] || data?.[0];
              stoppedSurveyId = stoppedSurvey?.id;
            }
            test.skip(!stoppedSurveyId, "Нет остановленных опросов");
          });

          await test.step(`Отправить POST /manager/surveys/${stoppedSurveyId}/resume/`, async () => {
            const result = await surveyAPI.resume(stoppedSurveyId);
            response = result.response;
          });

          await test.step("Проверить статус ответа: 200/201 OK или 400 Bad Request", async () => {
            expect([200, 201, 400]).toContain(response.status());
          });

          await test.step("DB: Проверка статуса active после возобновления", async () => {
            if (response.ok() && surveyVerifier.isConnected()) {
              await surveyVerifier.verifySurveyStatus(
                stoppedSurveyId,
                "active",
              );
            }
          });
        },
      );
    });

    test.describe("Favorites", () => {
      test("C6862: POST /manager/surveys/{id}/fave/ - добавить в избранное", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");
        let surveyId, response;

        await test.step("Найти опрос для добавления в избранное", async () => {
          const result = await findActiveSurveyWithData(surveyAPI);
          surveyId = result.surveyId;
          test.skip(!surveyId, "Нет опросов");
        });

        await test.step(`Отправить POST /manager/surveys/${surveyId}/fave/`, async () => {
          const result = await surveyAPI.fave(surveyId);
          response = result.response;
        });

        await test.step("Проверить статус ответа: 200/201 OK", async () => {
          expect([200, 201]).toContain(response.status());
        });
      });

      test("C6863: POST /manager/surveys/{id}/unfave/ - удалить из избранного", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");
        let surveyId, response;

        await test.step("Найти опрос для удаления из избранного", async () => {
          const result = await findActiveSurveyWithData(surveyAPI);
          surveyId = result.surveyId;
          test.skip(!surveyId, "Нет опросов");
        });

        await test.step(`Отправить POST /manager/surveys/${surveyId}/unfave/`, async () => {
          const result = await surveyAPI.unfave(surveyId);
          response = result.response;
        });

        await test.step("Проверить статус ответа: 200/201 OK", async () => {
          expect([200, 201]).toContain(response.status());
        });
      });
    });

    test.describe("Revisions", () => {
      test(
        "C6864: GET /manager/surveys/{id}/revisions/ - получить ревизии",
        { tag: ["@critical", "@db"] },
        async ({ surveyAPI, surveyVerifier }) => {
          setSeverity("critical");
          let surveyId, response, data, items, revision;

          await test.step("Найти опрос для получения ревизий", async () => {
            const result = await findActiveSurveyWithData(surveyAPI);
            surveyId = result.surveyId;
            test.skip(!surveyId, "Нет опросов");
          });

          await test.step(`Отправить GET /manager/surveys/${surveyId}/revisions/ с limit=10`, async () => {
            const result = await surveyAPI.getRevisions(surveyId, {
              limit: 10,
            });
            response = result.response;
            data = result.data;
          });

          await test.step("Проверить статус ответа: 200 OK", async () => {
            assertSuccessStatus(response);
          });

          await test.step("Проверить наличие данных в ответе", async () => {
            expect(data).toBeDefined();
          });

          await test.step("Проверить структуру ответа: массив items", async () => {
            items = data?.items || data || [];
            assertValidArray(items);
          });

          await test.step("Проверить структуру элемента ревизии: поле id", async () => {
            if (items.length > 0) {
              expect(items[0]).toHaveProperty("id");
            }
          });

          await test.step("Проверить поле alias ревизии: тип string", async () => {
            if (items.length > 0 && items[0].alias) {
              expect(typeof items[0].alias).toBe("string");
            }
          });

          await test.step("DB: Проверка ревизии опроса в БД", async () => {
            if (!surveyVerifier.isConnected()) return;
            revision = await surveyVerifier.getSurveyRevision(surveyId);
            if (items.length > 0) {
              expect(revision).not.toBeNull();
            }
          });
        },
      );

      test("C6865: GET /private/surveys/{id}/revisions/last/ - последняя ревизия", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");
        let surveyId, response, data, revision;

        await test.step("Найти опрос для получения последней ревизии", async () => {
          const result = await findActiveSurveyWithData(surveyAPI);
          surveyId = result.surveyId;
          test.skip(!surveyId, "Нет опросов");
        });

        await test.step(`Отправить GET /private/surveys/${surveyId}/revisions/last/`, async () => {
          const result = await surveyAPI.getLastRevision(surveyId);
          response = result.response;
          data = result.data;
        });

        await test.step("Проверить статус ответа: 200 OK, 403 Forbidden, или 404 Not Found", async () => {
          expect([200, 403, 404]).toContain(response.status());
        });

        await test.step("Проверить структуру ревизии: поле id", async () => {
          if (response.ok() && data) {
            revision = data.lastSurveyRevision || data;
            if (revision.id) {
              expect(
                typeof revision.id === "string" ||
                  typeof revision.id === "number",
              ).toBe(true);
            }
          }
        });

        await test.step("Проверить поле alias ревизии: тип string", async () => {
          if (response.ok() && data && revision?.alias) {
            expect(typeof revision.alias).toBe("string");
          }
        });
      });
    });

    test.describe("Negative Tests", () => {
      test("C6866: GET /manager/surveys/{id}/ - несуществующий опрос", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");
        let response;

        await test.step("Отправить GET /manager/surveys/999999/ (несуществующий ID)", async () => {
          const result = await surveyAPI.getById(999999);
          response = result.response;
        });

        await test.step("Проверить статус ответа: 400/403/404 (ошибка)", async () => {
          expect([400, 403, 404]).toContain(response.status());
        });
      });

      test("C6867: POST /manager/surveys/{id}/start/ - несуществующий опрос", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");
        let response;

        await test.step("Отправить POST /manager/surveys/999999/start/ (несуществующий ID)", async () => {
          const result = await surveyAPI.start(999999);
          response = result.response;
        });

        await test.step("Проверить статус ответа: 400/403/404 (ошибка)", async () => {
          expect([400, 403, 404]).toContain(response.status());
        });
      });

      test("C6868: POST /manager/surveys/{id}/stop/ - несуществующий опрос", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");
        let response;

        await test.step("Отправить POST /manager/surveys/999999/stop/ (несуществующий ID)", async () => {
          const result = await surveyAPI.stop(999999);
          response = result.response;
        });

        await test.step("Проверить статус ответа: 400/403/404 (ошибка)", async () => {
          expect([400, 403, 404]).toContain(response.status());
        });
      });

      test("C6869: GET /manager/surveys/{id}/revisions/ - несуществующий опрос", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");
        let response;

        await test.step("Отправить GET /manager/surveys/999999/revisions/ (несуществующий ID)", async () => {
          const result = await surveyAPI.getRevisions(999999);
          response = result.response;
        });

        await test.step("Проверить статус ответа: 400/403/404 (ошибка)", async () => {
          expect([400, 403, 404]).toContain(response.status());
        });
      });
    });
  },
);
