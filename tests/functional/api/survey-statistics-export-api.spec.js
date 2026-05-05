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
 * API тесты для экспорта Surveys
 *
 * Покрытие:
 * - Export tokens (get-token, personal-code, group-code)
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

test.describe(
  "Survey Export API",
  { tag: ["@api", "@regression", "@survey", "@export"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.SURVEYS, "Export");
    });

    test.describe("Export Tokens", () => {
      test(
        "C7030: GET .../export/get-token/ - получить токен экспорта",
        { tag: ["@critical"] },
        async ({ surveyAPI }) => {
          setSeverity("critical");

          let response, data;
          await test.step("Выполнить запрос: GET .../export/get-token/ - получить токен экспорта", async () => {
            const { surveyId } = await findActiveSurveyWithData(surveyAPI);
            test.skip(!surveyId, "Нет опросов");

            ({ response, data } = await surveyAPI.getExportToken(surveyId, {}));
          });

          await test.step("Проверить ответ", async () => {
            expect([200, 400]).toContain(response.status());

            // Валидация токена экспорта
            if (response.ok() && data) {
              if (data.token !== undefined) {
                expect(typeof data.token).toBe("string");
                expect(data.token.length).toBeGreaterThan(0);
              }
              if (data.url !== undefined) {
                expect(typeof data.url).toBe("string");
              }
            }
          });
        },
      );

      test("C7031: GET .../export/get-token/ с userDate", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: GET .../export/get-token/ с userDate", async () => {
          const { surveyId } = await findActiveSurveyWithData(surveyAPI);
          test.skip(!surveyId, "Нет опросов");

          const userDate = new Date().toISOString().split("T")[0];

          const { response, data } = await surveyAPI.getExportToken(surveyId, {
            userDate,
          });

          expect([200, 400]).toContain(response.status());

          // Валидация токена
          if (response.ok() && data) {
            if (data.token !== undefined) {
              expect(typeof data.token).toBe("string");
            }
          }
        });
      });

      test("C7032: GET .../export/get-token/ с фильтрами", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");

        let response, data;
        await test.step("Выполнить запрос: GET .../export/get-token/ с фильтрами", async () => {
          const { surveyId, revisionId } =
            await findActiveSurveyWithData(surveyAPI);
          test.skip(!surveyId, "Нет опросов");

          ({ response, data } = await surveyAPI.getExportToken(surveyId, {
            filters: {
              revisionsIds: revisionId ? [revisionId] : [],
            },
            resultsWithAI: false,
            resultsWithGroups: false,
          }));
        });

        await test.step("Проверить ответ", async () => {
          expect([200, 400]).toContain(response.status());

          // Валидация токена
          if (response.ok() && data) {
            if (data.token !== undefined) {
              expect(typeof data.token).toBe("string");
            }
          }
        });
      });

      test("C7033: GET .../personal-code/export/get-token/ - токен для персональных кодов", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: GET .../personal-code/export/get-token/ - токен для персональных кодов", async () => {
          const { surveyId, revisionAlias } =
            await findActiveSurveyWithData(surveyAPI);
          test.skip(!surveyId || !revisionAlias, "Нет данных");

          const { response, data } = await surveyAPI.getPersonalCodeExportToken(
            surveyId,
            revisionAlias,
          );

          // Может вернуть токен или ошибку если персональные коды не включены
          expect([200, 400, 403, 404]).toContain(response.status());

          // Валидация токена
          if (response.ok() && data) {
            if (data.token !== undefined) {
              expect(typeof data.token).toBe("string");
            }
          }
        });
      });

      test("C7034: GET .../group-code/export/get-token/ - токен для групповых кодов", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: GET .../group-code/export/get-token/ - токен для групповых кодов", async () => {
          const { surveyId, revisionAlias } =
            await findActiveSurveyWithData(surveyAPI);
          test.skip(!surveyId || !revisionAlias, "Нет данных");

          const { response, data } = await surveyAPI.getGroupCodeExportToken(
            surveyId,
            revisionAlias,
          );

          // Может вернуть токен или ошибку если групповые коды не включены
          expect([200, 400, 403, 404]).toContain(response.status());

          // Валидация токена
          if (response.ok() && data) {
            if (data.token !== undefined) {
              expect(typeof data.token).toBe("string");
            }
          }
        });
      });
    });

    test.describe("Negative Tests", () => {
      test("C7035: GET .../export/get-token/ - несуществующий опрос", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: GET .../export/get-token/ - несуществующий опрос", async () => {
          const { response } = await surveyAPI.getExportToken(999999, {});

          expect([400, 403, 404]).toContain(response.status());
        });
      });
    });
  },
);
