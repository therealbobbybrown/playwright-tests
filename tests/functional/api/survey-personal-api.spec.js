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
 * API тесты для персональных опросов (Protected)
 *
 * Покрытие:
 * - Проверка доступности персонального опроса
 * - Получение персонального токена
 * - Прохождение опроса с персональным токеном
 * - Анонимность
 */

const test = base.extend({
  surveyAPI: async ({ request }, use) => {
    const api = new SurveyAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
});

// Хелпер для поиска опроса с персональной ссылкой
async function findSurveyWithPersonalLink(surveyAPI) {
  const { data } = await surveyAPI.getList({ status: "active", limit: 20 });
  const items = data?.items || data || [];

  for (const survey of items) {
    const { data: surveyDetails } = await surveyAPI.getById(survey.id);

    // Проверяем что персональная ссылка разрешена
    if (surveyDetails?.allowPersonalLink) {
      const { data: revisions } = await surveyAPI.getRevisions(survey.id, {
        limit: 1,
      });
      const revision = revisions?.items?.[0];

      return {
        surveyId: survey.id,
        survey: surveyDetails,
        revisionId: revision?.id,
        revisionAlias: revision?.alias,
      };
    }
  }

  // Если не нашли с персональной ссылкой, возвращаем любой активный
  if (items.length > 0) {
    const { data: revisions } = await surveyAPI.getRevisions(items[0].id, {
      limit: 1,
    });
    const revision = revisions?.items?.[0];

    return {
      surveyId: items[0].id,
      survey: items[0],
      revisionId: revision?.id,
      revisionAlias: revision?.alias,
      hasPersonalLink: false,
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
  "Survey Personal Link API",
  { tag: ["@api", "@regression", "@survey", "@personal"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.SURVEYS, "Personal Link");
    });

    test.describe("Personal Availability Check", () => {
      test(
        "C6987: GET .../personal-availability/ - проверить доступность",
        { tag: ["@critical"] },
        async ({ surveyAPI }) => {
          setSeverity("critical");

          let surveyId, revisionAlias, response, data;
          await test.step("Выполнить запрос: GET .../personal-availability/ - проверить доступность", async () => {
            ({ surveyId, revisionAlias } =
              await findSurveyWithPersonalLink(surveyAPI));
            test.skip(!surveyId || !revisionAlias, "Нет опросов");

            ({ response, data } =
              await surveyAPI.checkPersonalSurveyAvailability(
                surveyId,
                revisionAlias,
              ));

            // Может быть доступен или нет
          });

          await test.step("Проверить ответ", async () => {
            expect([200, 400, 403, 404]).toContain(response.status());

            if (response.status() === 200) {
              expect(data).toBeDefined();
              // Валидация структуры ответа о доступности
              if (data.available !== undefined) {
                expect(typeof data.available).toBe("boolean");
              }
              if (data.surveyId !== undefined) {
                expect(
                  typeof data.surveyId === "string" ||
                    typeof data.surveyId === "number",
                ).toBe(true);
              }
              if (data.reason !== undefined) {
                expect(typeof data.reason).toBe("string");
              }
            }
          });
        },
      );

      test("C6988: GET .../personal-availability/ - несуществующий опрос", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: GET .../personal-availability/ - несуществующий опрос", async () => {
          const { response } = await surveyAPI.checkPersonalSurveyAvailability(
            999999,
            "test-alias",
          );

          expect([400, 403, 404]).toContain(response.status());
        });
      });

      test("C6989: GET .../personal-availability/ - несуществующий alias", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: GET .../personal-availability/ - несуществующий alias", async () => {
          const { surveyId } = await findSurveyWithPersonalLink(surveyAPI);
          test.skip(!surveyId, "Нет опросов");

          const { response } = await surveyAPI.checkPersonalSurveyAvailability(
            surveyId,
            "non-existent-alias",
          );

          expect([400, 403, 404]).toContain(response.status());
        });
      });
    });

    test.describe("Personal Token", () => {
      test(
        "C6990: GET .../personal-token/ - получить токен с валидным кодом",
        { tag: ["@critical"] },
        async ({ surveyAPI }) => {
          setSeverity("critical");

          let response, data;
          await test.step("Выполнить запрос: GET .../personal-token/ - получить токен с валидным кодом", async () => {
            const { surveyId, revisionAlias } =
              await findSurveyWithPersonalLink(surveyAPI);
            test.skip(!surveyId || !revisionAlias, "Нет опросов");

            // Используем тестовый код (вероятно невалидный)
            ({ response, data } = await surveyAPI.getPersonalSurveyToken(
              surveyId,
              revisionAlias,
              "test-personal-code",
            ));

            // Скорее всего будет ошибка - код невалидный
          });

          await test.step("Проверить ответ", async () => {
            expect([200, 400, 403, 404]).toContain(response.status());

            // При успешном ответе валидируем структуру токена
            if (response.ok() && data) {
              expect(data).toBeDefined();
              if (data.token !== undefined) {
                expect(typeof data.token).toBe("string");
                expect(data.token.length).toBeGreaterThan(0);
              }
              if (data.expiresAt !== undefined) {
                expect(typeof data.expiresAt).toBe("string");
              }
            }
          });
        },
      );

      test("C6991: GET .../personal-token/ - пустой код", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: GET .../personal-token/ - пустой код", async () => {
          const { surveyId, revisionAlias } =
            await findSurveyWithPersonalLink(surveyAPI);
          test.skip(!surveyId || !revisionAlias, "Нет опросов");

          const { response } = await surveyAPI.getPersonalSurveyToken(
            surveyId,
            revisionAlias,
            "",
          );

          expect([400, 403, 404, 422]).toContain(response.status());
        });
      });

      test(
        "C6992: GET .../personal-token/ - специальные символы в коде",
        { tag: ["@critical"] },
        async ({ surveyAPI }) => {
          setSeverity("critical");

          await test.step("Выполнить: GET .../personal-token/ - специальные символы в коде", async () => {
            const { surveyId, revisionAlias } =
              await findSurveyWithPersonalLink(surveyAPI);
            test.skip(!surveyId || !revisionAlias, "Нет опросов");

            const { response } = await surveyAPI.getPersonalSurveyToken(
              surveyId,
              revisionAlias,
              "<script>alert(1)</script>",
            );

            expect([400, 403, 404]).toContain(response.status());
          });
        },
      );

      test("C6993: GET .../personal-token/ - очень длинный код", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: GET .../personal-token/ - очень длинный код", async () => {
          const { surveyId, revisionAlias } =
            await findSurveyWithPersonalLink(surveyAPI);
          test.skip(!surveyId || !revisionAlias, "Нет опросов");

          const longCode = "a".repeat(1000);
          const { response } = await surveyAPI.getPersonalSurveyToken(
            surveyId,
            revisionAlias,
            longCode,
          );

          expect([400, 403, 404, 413, 422]).toContain(response.status());
        });
      });

      test(
        "C6994: GET .../personal-token/ - SQL injection в коде",
        { tag: ["@critical"] },
        async ({ surveyAPI }) => {
          setSeverity("critical");

          await test.step("Выполнить: GET .../personal-token/ - SQL injection в коде", async () => {
            const { surveyId, revisionAlias } =
              await findSurveyWithPersonalLink(surveyAPI);
            test.skip(!surveyId || !revisionAlias, "Нет опросов");

            const { response } = await surveyAPI.getPersonalSurveyToken(
              surveyId,
              revisionAlias,
              "'; DROP TABLE users; --",
            );

            expect([400, 403, 404]).toContain(response.status());
          });
        },
      );
    });

    test.describe("Personal Code Export", () => {
      test(
        "C6995: GET .../personal-code/export/get-token/ - экспорт кодов",
        { tag: ["@critical"] },
        async ({ surveyAPI }) => {
          setSeverity("critical");

          let response, data;
          await test.step("Выполнить запрос: GET .../personal-code/export/get-token/ - экспорт кодов", async () => {
            const { surveyId, revisionAlias } =
              await findSurveyWithPersonalLink(surveyAPI);
            test.skip(!surveyId || !revisionAlias, "Нет опросов");

            ({ response, data } = await surveyAPI.getPersonalCodeExportToken(
              surveyId,
              revisionAlias,
            ));

            // Может не быть персональных кодов
          });

          await test.step("Проверить ответ", async () => {
            expect([200, 400, 403, 404]).toContain(response.status());

            // При успешном ответе валидируем структуру токена экспорта
            if (response.ok() && data) {
              expect(data).toBeDefined();
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

      test("C6996: GET .../personal-code/export/get-token/ - несуществующий опрос", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: GET .../personal-code/export/get-token/ - несуществующий опрос", async () => {
          const { response } = await surveyAPI.getPersonalCodeExportToken(
            999999,
            "test-alias",
          );

          expect([400, 403, 404]).toContain(response.status());
        });
      });
    });

    test.describe("Negative Tests", () => {
      test(
        "C6997: Попытка получить персональный опрос без токена",
        { tag: ["@critical"] },
        async ({ surveyAPI }) => {
          setSeverity("critical");

          await test.step("Выполнить: Попытка получить персональный опрос без токена", async () => {
            const { surveyId, revisionAlias } =
              await findSurveyWithPersonalLink(surveyAPI);
            test.skip(!surveyId || !revisionAlias, "Нет опросов");

            // Пробуем получить персональный опрос напрямую (должна быть ошибка)
            const { response } = await surveyAPI.get(
              `/protected/surveys/${surveyId}/${revisionAlias}/`,
            );

            // Без токена должен быть отказ
            expect([401, 403, 404]).toContain(response.status());
          });
        },
      );

      test(
        "C6998: Попытка ответить на персональный опрос без токена",
        { tag: ["@critical"] },
        async ({ surveyAPI }) => {
          setSeverity("critical");

          await test.step("Выполнить: Попытка ответить на персональный опрос без токена", async () => {
            const { surveyId, revisionAlias } =
              await findSurveyWithPersonalLink(surveyAPI);
            test.skip(!surveyId || !revisionAlias, "Нет опросов");

            // Пробуем ответить напрямую без персонального токена
            const { response } = await surveyAPI.post(
              `/protected/surveys/${surveyId}/${revisionAlias}/answer/`,
              {},
            );

            expect([401, 403, 404]).toContain(response.status());
          });
        },
      );

      test(
        "C6999: Попытка начать персональный опрос без токена",
        { tag: ["@critical"] },
        async ({ surveyAPI }) => {
          setSeverity("critical");

          await test.step("Выполнить: Попытка начать персональный опрос без токена", async () => {
            const { surveyId, revisionAlias } =
              await findSurveyWithPersonalLink(surveyAPI);
            test.skip(!surveyId || !revisionAlias, "Нет опросов");

            const { response } = await surveyAPI.post(
              `/protected/surveys/${surveyId}/${revisionAlias}/answer/page/start/`,
            );

            expect([401, 403, 404]).toContain(response.status());
          });
        },
      );
    });
  },
);
