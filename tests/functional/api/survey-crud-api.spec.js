// @ts-check
import { test as fullTest, expect } from "../../fixtures/full.js";
import { SurveyAPI, getCredentials } from "../../utils/api/index.js";
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
 * API тесты для модуля Surveys (Опросы)
 *
 * Покрытие:
 * - GET endpoints (список, пагинация, фильтры, поиск, сортировка, по ID)
 * - Шаблоны
 * - CRUD операции (создание, обновление, удаление, категории)
 *
 * Смежные файлы:
 * - survey-crud-lifecycle-api.spec.js — жизненный цикл, избранное, ревизии, негативные тесты
 * - survey-crud-users-api.spec.js — управление пользователями, внутренние и внешние опросы
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
  "Survey API - CRUD Operations",
  { tag: ["@api", "@regression", "@survey", "@crud"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.SURVEYS, "CRUD");
    });

    test.describe("GET Endpoints", () => {
      test(
        "C6847: GET /manager/surveys/ - получить список опросов",
        { tag: ["@critical"] },
        async ({ surveyAPI }) => {
          setSeverity("critical");
          let response, data, items;

          await test.step("Отправить GET /manager/surveys/", async () => {
            const result = await surveyAPI.getList();
            response = result.response;
            data = result.data;
          });

          await test.step("Проверить статус ответа: 200 OK", async () => {
            assertSuccessStatus(response);
          });

          await test.step("Проверить наличие данных в ответе", async () => {
            expect(data).toBeDefined();
          });

          await test.step("Проверить структуру ответа: массив items или прямой массив", async () => {
            items = data?.items || data || [];
            assertValidArray(items);
          });
        },
      );

      test("C6848: GET /manager/surveys/ с пагинацией", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");
        let response, data, items;

        await test.step("Отправить GET /manager/surveys/ с limit=10, offset=0", async () => {
          const result = await surveyAPI.getList({
            limit: 10,
            offset: 0,
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

        await test.step("Проверить лимит пагинации: items.length <= 10", async () => {
          expect(items.length).toBeLessThanOrEqual(10);
        });

        await test.step("Проверить метаданные пагинации: поле total", async () => {
          if (data?.total !== undefined) {
            expect(typeof data.total).toBe("number");
            expect(data.total).toBeGreaterThanOrEqual(0);
          }
        });
      });

      test("C6849: GET /manager/surveys/ с фильтром по статусу", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");
        let response, data, items;

        await test.step("Отправить GET /manager/surveys/ с status=active, limit=10", async () => {
          const result = await surveyAPI.getList({
            status: "active",
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

        await test.step("Проверить фильтр: все опросы имеют status=active", async () => {
          items.forEach((item) => {
            expect(item.status).toBe("active");
          });
        });
      });

      test("C6850: GET /manager/surveys/ с поиском", async ({ surveyAPI }) => {
        setSeverity("normal");
        let response, data, items;

        await test.step("Отправить GET /manager/surveys/ с q=test, limit=10", async () => {
          const result = await surveyAPI.getList({
            q: "test",
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

        await test.step("Проверить структуру результатов поиска: массив items", async () => {
          items = data?.items || data || [];
          assertValidArray(items);
        });
      });

      test("C6851: GET /manager/surveys/ с сортировкой", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");
        let response, data, items;

        await test.step("Отправить GET /manager/surveys/ с sortBy=createdAt, orderBy=desc", async () => {
          const result = await surveyAPI.getList({
            sortBy: "createdAt",
            orderBy: "desc",
            limit: 10,
          });
          response = result.response;
          data = result.data;
        });

        await test.step("Проверить статус ответа: 200 OK или 400 Bad Request", async () => {
          expect([200, 400]).toContain(response.status());
        });

        await test.step("Проверить структуру ответа при успехе", async () => {
          if (response.ok()) {
            expect(data).toBeDefined();
            items = data?.items || data || [];
            assertValidArray(items);
          }
        });
      });

      test(
        "C6852: GET /manager/surveys/{id}/ - получить опрос по ID",
        { tag: ["@critical", "@db"] },
        async ({ surveyAPI, surveyVerifier }) => {
          setSeverity("critical");
          let surveyId, response, data;

          await test.step("Найти существующий опрос для теста", async () => {
            const result = await findActiveSurveyWithData(surveyAPI);
            surveyId = result.surveyId;
            test.skip(!surveyId, "Нет опросов");
          });

          await test.step(`Отправить GET /manager/surveys/${surveyId}/`, async () => {
            const result = await surveyAPI.getById(surveyId);
            response = result.response;
            data = result.data;
          });

          await test.step("Проверить статус ответа: 200 OK", async () => {
            assertSuccessStatus(response);
          });

          await test.step("Проверить наличие данных в ответе", async () => {
            expect(data).toBeDefined();
          });

          await test.step(`Проверить ID опроса в ответе: id=${surveyId}`, async () => {
            expect(data.id).toBe(surveyId);
          });

          await test.step("DB: Проверка существования опроса в БД", async () => {
            if (!surveyVerifier.isConnected()) return;
            await surveyVerifier.verifySurveyCreated(surveyId);
          });
        },
      );
    });

    test.describe("Templates", () => {
      test(
        "C6853: GET /manager/surveys/templates/ - получить шаблоны",
        { tag: ["@critical"] },
        async ({ surveyAPI }) => {
          setSeverity("critical");
          let response, data, items;

          await test.step("Отправить GET /manager/surveys/templates/ с limit=10", async () => {
            const result = await surveyAPI.getTemplates({ limit: 10 });
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

          await test.step("Проверить структуру элемента шаблона: поле id", async () => {
            if (items.length > 0) {
              expect(items[0]).toHaveProperty("id");
            }
          });
        },
      );

      test("C6854: GET /manager/surveys/templates/{id}/as-survey/ - шаблон как опрос", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");
        let templateId, response, data;

        let templates;
        await test.step("Получить список шаблонов для теста", async () => {
          const result = await surveyAPI.getTemplates({ limit: 1 });
          templates = result.data;
          templateId = templates?.items?.[0]?.id || templates?.[0]?.id;
          test.skip(!templateId, "Нет шаблонов");
        });

        await test.step(`Отправить GET /manager/surveys/templates/${templateId}/as-survey/`, async () => {
          const result = await surveyAPI.getTemplateAsSurvey(templateId);
          response = result.response;
          data = result.data;
        });

        await test.step("Проверить статус ответа: 200 OK или 404 Not Found", async () => {
          expect([200, 404]).toContain(response.status());
        });

        await test.step("Проверить структуру опроса: поле title", async () => {
          if (response.ok() && data) {
            expect(data).toHaveProperty("title");
          }
        });
      });
    });

    test.describe("Create/Update/Delete", () => {
      let createdSurveyId = null;

      test.afterAll(async ({ request }) => {
        if (!createdSurveyId) return;
        const api = new SurveyAPI(request);
        const { email, password } = getCredentials("admin");
        await api.signIn(email, password);
        try {
          await api.stop(createdSurveyId).catch(() => {});
          await api.remove(createdSurveyId);
        } catch {}
      });

      test(
        "C6855: POST /manager/surveys/ - создать черновик опроса",
        { tag: ["@critical", "@db"] },
        async ({ surveyAPI, surveyVerifier }) => {
          setSeverity("critical");
          let surveyTitle, payload, response, data;

          await test.step("Подготовить payload для создания опроса", async () => {
            surveyTitle = `API Test Survey ${Date.now()}`;
            payload = {
              title: surveyTitle,
              description: "Тестовый опрос созданный через API",
            };
          });

          await test.step("Отправить POST /manager/surveys/", async () => {
            const result = await surveyAPI.createDraft(payload);
            response = result.response;
            data = result.data;
          });

          await test.step("Проверить статус ответа: 200/201 Created", async () => {
            expect(
              response.ok(),
              `Ожидается успешный ответ, получен ${response.status()}`,
            ).toBe(true);
          });

          await test.step("Проверить наличие данных в ответе", async () => {
            expect(data, "Ответ должен содержать данные").toBeDefined();
          });

          await test.step("Проверить наличие ID созданного опроса", async () => {
            expect(
              data.id,
              "ID созданного опроса должен быть определён",
            ).toBeDefined();
            createdSurveyId = data.id;
          });

          await test.step("Проверить тип ID: string или number", async () => {
            expect(
              typeof data.id === "string" || typeof data.id === "number",
              `ID должен быть string или number, получен ${typeof data.id}`,
            ).toBe(true);
          });

          await test.step("Проверить поле title: тип string", async () => {
            if (data.title) {
              expect(typeof data.title).toBe("string");
            }
          });

          await test.step("Проверить статус опроса: status=draft", async () => {
            if (data.status) {
              expect(
                data.status,
                "Статус созданного опроса должен быть draft",
              ).toBe("draft");
            }
          });

          await test.step("DB: Проверка создания опроса в БД", async () => {
            if (!surveyVerifier.isConnected()) return;
            await surveyVerifier.verifySurveyCreated(data.id);
            await surveyVerifier.verifySurveyNotDeleted(data.id);
          });
        },
      );

      test(
        "C6856: POST /manager/surveys/{id}/ - обновить опрос",
        { tag: ["@critical", "@db"] },
        async ({ surveyAPI, surveyVerifier }) => {
          setSeverity("critical");
          let surveyId, survey, response, data;

          await test.step("Найти существующий опрос для обновления", async () => {
            const result = await findActiveSurveyWithData(surveyAPI);
            surveyId = result.surveyId;
            survey = result.survey;
            test.skip(!surveyId, "Нет опросов");
          });

          await test.step(`Отправить POST /manager/surveys/${surveyId}/ с обновлённым title`, async () => {
            const result = await surveyAPI.update(surveyId, {
              title: survey.title,
            });
            response = result.response;
            data = result.data;
          });

          await test.step("Проверить статус ответа: 200/201 OK или 400 Bad Request", async () => {
            expect([200, 201, 400]).toContain(response.status());
          });

          await test.step(`Проверить ID опроса в ответе: id=${surveyId}`, async () => {
            if (response.ok() && data) {
              expect(data.id).toBe(surveyId);
            }
          });

          await test.step("DB: Проверка что опрос существует в БД", async () => {
            if (response.ok() && surveyVerifier.isConnected()) {
              await surveyVerifier.verifySurveyCreated(surveyId);
            }
          });
        },
      );

      test("C6857: PATCH /manager/surveys/{id}/change-category - изменить категорию", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");
        let surveyId, response;

        await test.step("Найти существующий опрос для изменения категории", async () => {
          const result = await findActiveSurveyWithData(surveyAPI);
          surveyId = result.surveyId;
          test.skip(!surveyId, "Нет опросов");
        });

        await test.step(`Отправить PATCH /manager/surveys/${surveyId}/change-category с category=null`, async () => {
          const result = await surveyAPI.changeCategory(surveyId, null);
          response = result.response;
        });

        await test.step("Проверить статус ответа: 200/201 OK, 400 Bad Request, или 404 Not Found", async () => {
          expect([200, 201, 400, 404]).toContain(response.status());
        });
      });

      test("C6858: DELETE /manager/surveys/{id}/ - удалить опрос (негативный тест)", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");
        let response;

        await test.step("Отправить DELETE /manager/surveys/999999/ (несуществующий ID)", async () => {
          const result = await surveyAPI.remove(999999);
          response = result.response;
        });

        await test.step("Проверить статус ответа: 400/403/404 (ошибка)", async () => {
          expect([400, 403, 404]).toContain(response.status());
        });
      });
    });
  },
);
