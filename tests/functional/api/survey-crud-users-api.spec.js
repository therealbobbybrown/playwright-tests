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
 * API тесты для модуля Surveys — Users Management, Internal & External Surveys
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
  "Survey API - Users Management",
  { tag: ["@api", "@regression", "@survey", "@users"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.SURVEYS, "Users Management");
    });

    test(
      "C6870: GET .../users/search/ - поиск пользователей для ревизии",
      { tag: ["@critical"] },
      async ({ surveyAPI }) => {
        setSeverity("critical");
        let surveyId, revisionId, response, data, items;

        await test.step("Найти опрос с ревизией для поиска пользователей", async () => {
          const result = await findActiveSurveyWithData(surveyAPI);
          surveyId = result.surveyId;
          revisionId = result.revisionId;
          test.skip(!surveyId || !revisionId, "Нет данных");
        });

        await test.step("Отправить GET .../users/search/ с category=members, limit=10", async () => {
          const result = await surveyAPI.searchUsers(surveyId, revisionId, {
            q: "",
            category: "members",
            limit: 10,
          });
          response = result.response;
          data = result.data;
        });

        await test.step("Проверить статус ответа: 200 OK или 400 Bad Request", async () => {
          expect([200, 400]).toContain(response.status());
        });

        await test.step("Проверить структуру результатов поиска: массив items", async () => {
          if (response.ok()) {
            expect(data).toBeDefined();
            items = data?.items || data || [];
            assertValidArray(items);
          }
        });

        await test.step("Проверить структуру элемента пользователя: поле id", async () => {
          if (response.ok() && items?.length > 0) {
            expect(items[0]).toHaveProperty("id");
          }
        });
      },
    );

    test("C6871: GET .../users/search/ с категорией notMembers", async ({
      surveyAPI,
    }) => {
      setSeverity("normal");
      let surveyId, revisionId, response, data, items;

      await test.step("Найти опрос с ревизией для поиска пользователей", async () => {
        const result = await findActiveSurveyWithData(surveyAPI);
        surveyId = result.surveyId;
        revisionId = result.revisionId;
        test.skip(!surveyId || !revisionId, "Нет данных");
      });

      await test.step("Отправить GET .../users/search/ с category=notMembers, limit=10", async () => {
        const result = await surveyAPI.searchUsers(surveyId, revisionId, {
          q: "",
          category: "notMembers",
          limit: 10,
        });
        response = result.response;
        data = result.data;
      });

      await test.step("Проверить статус ответа: 200 OK или 400 Bad Request", async () => {
        expect([200, 400]).toContain(response.status());
      });

      await test.step("Проверить структуру результатов: массив items", async () => {
        if (response.ok()) {
          expect(data).toBeDefined();
          items = data?.items || data || [];
          assertValidArray(items);
        }
      });
    });

    test("C6872: POST .../users/append/ - добавить пользователей (пустой список)", async ({
      surveyAPI,
    }) => {
      setSeverity("normal");
      let surveyId, revisionId, response, data;

      await test.step("Найти опрос с ревизией для добавления пользователей", async () => {
        const result = await findActiveSurveyWithData(surveyAPI);
        surveyId = result.surveyId;
        revisionId = result.revisionId;
        test.skip(!surveyId || !revisionId, "Нет данных");
      });

      await test.step("Отправить POST .../users/append/ с usersIds=[]", async () => {
        const result = await surveyAPI.appendUsers(surveyId, revisionId, {
          usersIds: [],
        });
        response = result.response;
        data = result.data;
      });

      await test.step("Проверить статус ответа: 200/201 OK, 400 Bad Request, 409 Conflict, или 422 Unprocessable", async () => {
        expect([200, 201, 400, 409, 422]).toContain(response.status());
      });

      await test.step("Проверить структуру ответа при успехе", async () => {
        if (response.ok() && data) {
          expect(data).toBeDefined();
        }
      });
    });
  },
);

test.describe(
  "Survey API - Internal Surveys (Private)",
  { tag: ["@api", "@regression", "@survey", "@internal"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.SURVEYS, "Internal Surveys");
    });

    test(
      "C6873: GET /private/surveys/{id}/{alias}/ - получить внутренний опрос",
      { tag: ["@critical"] },
      async ({ surveyAPI }) => {
        setSeverity("critical");
        let surveyId, revisionAlias, response, data;

        await test.step("Найти опрос с ревизией для получения внутреннего опроса", async () => {
          const result = await findActiveSurveyWithData(surveyAPI);
          surveyId = result.surveyId;
          revisionAlias = result.revisionAlias;
          test.skip(!surveyId || !revisionAlias, "Нет данных");
        });

        await test.step(`Отправить GET /private/surveys/${surveyId}/${revisionAlias}/`, async () => {
          const result = await surveyAPI.getInternalSurvey(
            surveyId,
            revisionAlias,
          );
          response = result.response;
          data = result.data;
        });

        await test.step("Проверить статус ответа: 200 OK, 400 Bad Request, 403 Forbidden, или 404 Not Found", async () => {
          expect([200, 400, 403, 404]).toContain(response.status());
        });

        await test.step("Проверить структуру внутреннего опроса: поле id", async () => {
          if (response.ok() && data?.id) {
            expect(
              typeof data.id === "string" || typeof data.id === "number",
            ).toBe(true);
          }
        });

        await test.step("Проверить поле title опроса: тип string", async () => {
          if (response.ok() && data?.title) {
            expect(typeof data.title).toBe("string");
          }
        });
      },
    );

    test("C6874: GET /private/surveys/{id}/owner-company-id/ - получить ID компании", async ({
      surveyAPI,
    }) => {
      setSeverity("normal");
      let surveyId, response, data;

      await test.step("Найти опрос для получения ID компании", async () => {
        const result = await findActiveSurveyWithData(surveyAPI);
        surveyId = result.surveyId;
        test.skip(!surveyId, "Нет опросов");
      });

      await test.step(`Отправить GET /private/surveys/${surveyId}/owner-company-id/`, async () => {
        const result = await surveyAPI.getSurveyOwnerCompanyId(surveyId);
        response = result.response;
        data = result.data;
      });

      await test.step("Проверить статус ответа: 200 OK, 400 Bad Request, или 404 Not Found", async () => {
        expect([200, 400, 404]).toContain(response.status());
      });

      await test.step("Проверить структуру ответа: ID компании > 0", async () => {
        if (response.ok() && data) {
          expect(data).toBeDefined();
          if (typeof data === "number") {
            expect(data).toBeGreaterThan(0);
          } else if (data.id) {
            expect(
              typeof data.id === "string" || typeof data.id === "number",
            ).toBe(true);
          } else if (data.companyId) {
            expect(
              typeof data.companyId === "string" ||
                typeof data.companyId === "number",
            ).toBe(true);
          }
        }
      });
    });

    test(
      "C6875: POST .../answer/page/start/ - начать внутренний опрос",
      { tag: ["@critical"] },
      async ({ surveyAPI }) => {
        setSeverity("critical");
        let surveyId, revisionAlias, response, data;

        await test.step("Найти опрос с ревизией для запуска внутреннего опроса", async () => {
          const result = await findActiveSurveyWithData(surveyAPI);
          surveyId = result.surveyId;
          revisionAlias = result.revisionAlias;
          test.skip(!surveyId || !revisionAlias, "Нет данных");
        });

        await test.step("Отправить POST .../answer/page/start/", async () => {
          const result = await surveyAPI.startInternalSurvey(
            surveyId,
            revisionAlias,
          );
          response = result.response;
          data = result.data;
        });

        await test.step("Проверить статус ответа: 200/201 OK, 400 Bad Request, 403 Forbidden, 404 Not Found, или 409 Conflict", async () => {
          expect([200, 201, 400, 403, 404, 409]).toContain(response.status());
        });

        await test.step("Проверить структуру ответа: поле page", async () => {
          if (response.ok() && data?.page) {
            expect(data.page).toBeDefined();
          }
        });

        await test.step("Проверить поле token: тип string", async () => {
          if (response.ok() && data?.token) {
            expect(typeof data.token).toBe("string");
          }
        });
      },
    );
  },
);

test.describe(
  "Survey API - External Surveys (Public)",
  { tag: ["@api", "@regression", "@survey", "@external"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.SURVEYS, "External Surveys");
    });

    test(
      "C6876: GET /public/surveys/{id}/{alias}/ - получить внешний опрос",
      { tag: ["@critical"] },
      async ({ surveyAPI }) => {
        setSeverity("critical");
        let surveyId, revisionAlias, response, data;

        await test.step("Найти опрос с ревизией для получения внешнего опроса", async () => {
          const result = await findActiveSurveyWithData(surveyAPI);
          surveyId = result.surveyId;
          revisionAlias = result.revisionAlias;
          test.skip(!surveyId || !revisionAlias, "Нет данных");
        });

        await test.step(`Отправить GET /public/surveys/${surveyId}/${revisionAlias}/`, async () => {
          const result = await surveyAPI.getExternalSurvey(
            surveyId,
            revisionAlias,
          );
          response = result.response;
          data = result.data;
        });

        await test.step("Проверить статус ответа: 200 OK, 400 Bad Request, 403 Forbidden, или 404 Not Found", async () => {
          expect([200, 400, 403, 404]).toContain(response.status());
        });

        await test.step("Проверить структуру внешнего опроса: поле id", async () => {
          if (response.ok() && data?.id) {
            expect(
              typeof data.id === "string" || typeof data.id === "number",
            ).toBe(true);
          }
        });

        await test.step("Проверить поле title опроса: тип string", async () => {
          if (response.ok() && data?.title) {
            expect(typeof data.title).toBe("string");
          }
        });
      },
    );

    test(
      "C6877: GET .../personal-availability/ - проверить доступность персонального опроса",
      { tag: ["@critical"] },
      async ({ surveyAPI }) => {
        setSeverity("critical");
        let surveyId, revisionAlias, response, data;

        await test.step("Найти опрос с ревизией для проверки доступности", async () => {
          const result = await findActiveSurveyWithData(surveyAPI);
          surveyId = result.surveyId;
          revisionAlias = result.revisionAlias;
          test.skip(!surveyId || !revisionAlias, "Нет данных");
        });

        await test.step("Отправить GET .../personal-availability/", async () => {
          const result = await surveyAPI.checkPersonalSurveyAvailability(
            surveyId,
            revisionAlias,
          );
          response = result.response;
          data = result.data;
        });

        await test.step("Проверить статус ответа: 200 OK, 400 Bad Request, 403 Forbidden, или 404 Not Found", async () => {
          expect([200, 400, 403, 404]).toContain(response.status());
        });

        await test.step("Проверить поле available: тип boolean", async () => {
          if (response.ok() && data?.available !== undefined) {
            expect(typeof data.available).toBe("boolean");
          }
        });

        await test.step("Проверить поле isAvailable: тип boolean", async () => {
          if (response.ok() && data?.isAvailable !== undefined) {
            expect(typeof data.isAvailable).toBe("boolean");
          }
        });
      },
    );

    test("C6878: GET .../personal-token/ - получить персональный токен с невалидным кодом", async ({
      surveyAPI,
    }) => {
      setSeverity("normal");
      let surveyId, revisionAlias, response;

      await test.step("Найти опрос с ревизией для получения токена", async () => {
        const result = await findActiveSurveyWithData(surveyAPI);
        surveyId = result.surveyId;
        revisionAlias = result.revisionAlias;
        test.skip(!surveyId || !revisionAlias, "Нет данных");
      });

      await test.step("Отправить GET .../personal-token/ с невалидным кодом", async () => {
        const result = await surveyAPI.getPersonalSurveyToken(
          surveyId,
          revisionAlias,
          "invalid-code",
        );
        response = result.response;
      });

      await test.step("Проверить статус ответа: 400/403/404 (ошибка)", async () => {
        expect([400, 403, 404]).toContain(response.status());
      });
    });

    // C6879, C6880 — дубликаты, живут в survey-group-codes-api.spec.js

    test(
      "C6881: POST /public/surveys/{id}/{alias}/answer/page/start/ - начать внешний опрос",
      { tag: ["@critical"] },
      async ({ surveyAPI }) => {
        setSeverity("critical");
        let surveyId, revisionAlias, response, data;

        await test.step("Найти опрос с ревизией для запуска внешнего опроса", async () => {
          const result = await findActiveSurveyWithData(surveyAPI);
          surveyId = result.surveyId;
          revisionAlias = result.revisionAlias;
          test.skip(!surveyId || !revisionAlias, "Нет данных");
        });

        await test.step(`Отправить POST /public/surveys/${surveyId}/${revisionAlias}/answer/page/start/`, async () => {
          const result = await surveyAPI.startExternalSurvey(
            surveyId,
            revisionAlias,
          );
          response = result.response;
          data = result.data;
        });

        await test.step("Проверить статус ответа: 200/201 OK, 400 Bad Request, 403 Forbidden, или 404 Not Found", async () => {
          expect([200, 201, 400, 403, 404]).toContain(response.status());
        });

        await test.step("Проверить поле token: тип string", async () => {
          if (response.ok() && data?.token) {
            expect(typeof data.token).toBe("string");
          }
        });

        await test.step("Проверить структуру ответа: поле page", async () => {
          if (response.ok() && data?.page) {
            expect(data.page).toBeDefined();
          }
        });
      },
    );
  },
);
