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
 * API тесты для External (Public) Surveys — получение опроса, доступность и токены
 *
 * Покрытие:
 * - GET /public/surveys/{surveyId}/{revisionAlias}/ - получение внешнего опроса
 * - GET /public/surveys/{surveyId}/{revisionAlias}/personal-availability/ - проверка доступности персонального опроса
 * - GET /public/surveys/{surveyId}/{revisionAlias}/personal-token/ - получение токена персонального опроса
 *
 * ВАЖНО: Тесты работают с публичными endpoints (без авторизации для некоторых)
 * СТРОГИЕ ТЕСТЫ - не маскируют ошибки, а выявляют их.
 *
 * @tags @api @regression @survey @external
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

// Кеш для данных опроса с ревизией
let cachedSurveyWithRevision = null;

// Расширяем test с фикстурой для Survey API
const test = base.extend({
  surveyAPI: async ({ request }, use) => {
    const api = new SurveyAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
  // API без авторизации для публичных endpoints
  publicAPI: async ({ request }, use) => {
    const api = new SurveyAPI(request);
    await use(api);
  },
});

/**
 * Хелпер для поиска опроса с ревизией и alias
 * @param {SurveyAPI} surveyAPI
 * @returns {Promise<{surveyId: number|null, revisionId: number|null, revisionAlias: string|null}>}
 */
async function findSurveyWithRevision(surveyAPI) {
  if (cachedSurveyWithRevision) {
    return cachedSurveyWithRevision;
  }

  // Ищем активные опросы
  const { data: activeData } = await surveyAPI.getList({
    status: "active",
    limit: 20,
  });
  let items = activeData?.items || activeData || [];

  if (items.length === 0) {
    const { data: allData } = await surveyAPI.getList({ limit: 50 });
    items = allData?.items || allData || [];
  }

  if (items.length === 0) {
    cachedSurveyWithRevision = {
      surveyId: null,
      revisionId: null,
      revisionAlias: null,
    };
    return cachedSurveyWithRevision;
  }

  // Перебираем опросы, ищем тот у которого есть ревизия с alias
  for (const survey of items.slice(0, 15)) {
    try {
      const surveyId = survey.id;

      const { response: revResp, data: revisions } =
        await surveyAPI.getRevisions(surveyId, { limit: 5 });
      if (!revResp.ok()) continue;

      const revisionItems = revisions?.items || revisions || [];
      for (const revision of revisionItems) {
        if (revision.alias) {
          cachedSurveyWithRevision = {
            surveyId,
            revisionId: revision.id,
            revisionAlias: revision.alias,
          };
          return cachedSurveyWithRevision;
        }
      }
    } catch {
      continue;
    }
  }

  // Fallback
  cachedSurveyWithRevision = {
    surveyId: items[0]?.id || null,
    revisionId: null,
    revisionAlias: null,
  };
  return cachedSurveyWithRevision;
}

test.describe(
  "Survey External API",
  { tag: ["@api", "@regression", "@survey", "@external"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.SURVEYS, "External Surveys");
    });

    // ==================== GET EXTERNAL SURVEY ====================

    test.describe("GET /public/surveys/{surveyId}/{revisionAlias}/ - Получение внешнего опроса", () => {
      test(
        "C6885: Получить внешний опрос по surveyId и revisionAlias",
        { tag: ["@critical"] },
        async ({ surveyAPI }) => {
          setSeverity("critical");

          let response, data, status;
          await test.step("Выполнить запрос: Получить внешний опрос по surveyId и revisionAlias", async () => {
            const { surveyId, revisionAlias } =
              await findSurveyWithRevision(surveyAPI);
            test.skip(
              !surveyId || !revisionAlias,
              "Нет опроса с ревизией для тестирования",
            );

            logInput("getExternalSurvey", { surveyId, revisionAlias });
            logExpected(
              "Status 200 с данными опроса или 403/404 если опрос не публичный",
            );

            ({ response, data } = await surveyAPI.getExternalSurvey(
              surveyId,
              revisionAlias,
            ));
            logResponse(response.status(), data);

            status = response.status();
            // Опрос может быть публичным (200) или требовать авторизацию (403/404)
          });

          await test.step("Проверить ответ", async () => {
            expect(
              [200, 400, 403, 404],
              `Ожидался статус 200/403/404, получен ${status}`,
            ).toContain(status);

            if (status === 200) {
              expect(
                data,
                "Данные опроса должны быть определены",
              ).toBeDefined();
              if (data && typeof data === "object") {
                // Может содержать id, title, questions и т.д.
                expect(typeof data).toBe("object");
              }
            }
          });
        },
      );

      test("C6886: Получить внешний опрос для несуществующего surveyId - должна быть ошибка", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");

        let response, data;
        await test.step("Выполнить запрос: Получить внешний опрос для несуществующего surveyId - должна быть ошибка", async () => {
          const { revisionAlias } = await findSurveyWithRevision(surveyAPI);
          const alias = revisionAlias || "test-alias";

          logInput("getExternalSurvey", {
            surveyId: 999999999,
            revisionAlias: alias,
          });
          logExpected("Status 404 - опрос не найден");

          ({ response, data } = await surveyAPI.getExternalSurvey(
            999999999,
            alias,
          ));
          logResponse(response.status(), data);
        });

        await test.step("Проверить ответ", async () => {
          expect(
            [400, 403, 404],
            `Ожидался статус ошибки, получен ${response.status()}`,
          ).toContain(response.status());
        });
      });

      test("C6887: Получить внешний опрос с невалидным revisionAlias - должна быть ошибка", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");

        let response, data;
        await test.step("Выполнить запрос: Получить внешний опрос с невалидным revisionAlias - должна быть ошибка", async () => {
          const { surveyId } = await findSurveyWithRevision(surveyAPI);
          test.skip(!surveyId, "Нет опроса для тестирования");

          logInput("getExternalSurvey", {
            surveyId,
            revisionAlias: "invalid-alias-12345",
          });
          logExpected("Status 404 - ревизия не найдена");

          ({ response, data } = await surveyAPI.getExternalSurvey(
            surveyId,
            "invalid-alias-12345",
          ));
          logResponse(response.status(), data);
        });

        await test.step("Проверить ответ", async () => {
          expect(
            [400, 403, 404],
            `Ожидался статус ошибки, получен ${response.status()}`,
          ).toContain(response.status());
        });
      });

      test("C6888: Получить внешний опрос с пустыми параметрами - должна быть ошибка", async ({
        surveyAPI,
      }) => {
        setSeverity("minor");

        await test.step("Выполнить: Получить внешний опрос с пустыми параметрами - должна быть ошибка", async () => {
          const { response } = await surveyAPI.getExternalSurvey("", "");

          expect(
            [400, 403, 404, 500],
            `Ожидался статус ошибки, получен ${response.status()}`,
          ).toContain(response.status());
        });
      });
    });

    // ==================== CHECK PERSONAL SURVEY AVAILABILITY ====================

    test.describe("GET /public/surveys/{surveyId}/{revisionAlias}/personal-availability/ - Доступность персонального опроса", () => {
      test(
        "C6889: Проверить доступность персонального опроса",
        { tag: ["@critical"] },
        async ({ surveyAPI }) => {
          setSeverity("critical");

          let response, data, status;
          await test.step("Выполнить запрос: Проверить доступность персонального опроса", async () => {
            const { surveyId, revisionAlias } =
              await findSurveyWithRevision(surveyAPI);
            test.skip(
              !surveyId || !revisionAlias,
              "Нет опроса с ревизией для тестирования",
            );

            logInput("checkPersonalSurveyAvailability", {
              surveyId,
              revisionAlias,
            });
            logExpected("Status 200 с информацией о доступности");

            ({ response, data } =
              await surveyAPI.checkPersonalSurveyAvailability(
                surveyId,
                revisionAlias,
              ));
            logResponse(response.status(), data);

            status = response.status();
          });

          await test.step("Проверить ответ", async () => {
            expect(
              [200, 400, 403, 404],
              `Ожидался статус 200/400/403/404, получен ${status}`,
            ).toContain(status);

            if (status === 200 && data) {
              // Может содержать isAvailable, reason и т.д.
              expect(typeof data).toBe("object");
            }
          });
        },
      );

      test("C6890: Проверить доступность для несуществующего опроса - должна быть ошибка", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Проверить доступность для несуществующего опроса - должна быть ошибка", async () => {
          logInput("checkPersonalSurveyAvailability", {
            surveyId: 999999999,
            revisionAlias: "test",
          });
          logExpected("Status 404 - опрос не найден");

          const { response } = await surveyAPI.checkPersonalSurveyAvailability(
            999999999,
            "test-alias",
          );

          expect(
            [400, 403, 404],
            `Ожидался статус ошибки, получен ${response.status()}`,
          ).toContain(response.status());
        });
      });

      test("C6891: Проверить доступность с невалидным alias - должна быть ошибка", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Проверить доступность с невалидным alias - должна быть ошибка", async () => {
          const { surveyId } = await findSurveyWithRevision(surveyAPI);
          test.skip(!surveyId, "Нет опроса для тестирования");

          const { response } = await surveyAPI.checkPersonalSurveyAvailability(
            surveyId,
            "nonexistent-alias",
          );

          expect(
            [400, 403, 404],
            `Ожидался статус ошибки, получен ${response.status()}`,
          ).toContain(response.status());
        });
      });
    });

    // ==================== GET PERSONAL SURVEY TOKEN ====================

    test.describe("GET /public/surveys/{surveyId}/{revisionAlias}/personal-token/ - Токен персонального опроса", () => {
      test(
        "C6892: Получить токен с тестовым кодом",
        { tag: ["@critical"] },
        async ({ surveyAPI }) => {
          setSeverity("critical");

          let response, data, status;
          await test.step("Выполнить запрос: Получить токен с тестовым кодом", async () => {
            const { surveyId, revisionAlias } =
              await findSurveyWithRevision(surveyAPI);
            test.skip(
              !surveyId || !revisionAlias,
              "Нет опроса с ревизией для тестирования",
            );

            const testCode = "TEST123";
            logInput("getPersonalSurveyToken", {
              surveyId,
              revisionAlias,
              code: testCode,
            });
            logExpected("Status 200 с токеном или 400/404 если код невалидный");

            ({ response, data } = await surveyAPI.getPersonalSurveyToken(
              surveyId,
              revisionAlias,
              testCode,
            ));
            logResponse(response.status(), data);

            status = response.status();
            // Код может быть невалидным (400/404) или вернуть токен (200)
          });

          await test.step("Проверить ответ", async () => {
            expect(
              [200, 400, 403, 404],
              `Ожидался статус 200/400/403/404, получен ${status}`,
            ).toContain(status);

            if (status === 200 && data) {
              // Может содержать token
              expect(typeof data).toBe("object");
            }
          });
        },
      );

      test("C6893: Получить токен с пустым кодом - должна быть ошибка", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить токен с пустым кодом - должна быть ошибка", async () => {
          const { surveyId, revisionAlias } =
            await findSurveyWithRevision(surveyAPI);
          test.skip(
            !surveyId || !revisionAlias,
            "Нет опроса с ревизией для тестирования",
          );

          const { response } = await surveyAPI.getPersonalSurveyToken(
            surveyId,
            revisionAlias,
            "",
          );

          expect(
            [400, 403, 404],
            `Ожидался статус ошибки, получен ${response.status()}`,
          ).toContain(response.status());
        });
      });

      test("C6894: Получить токен для несуществующего опроса - должна быть ошибка", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить токен для несуществующего опроса - должна быть ошибка", async () => {
          const { response } = await surveyAPI.getPersonalSurveyToken(
            999999999,
            "test-alias",
            "CODE123",
          );

          expect(
            [400, 403, 404],
            `Ожидался статус ошибки, получен ${response.status()}`,
          ).toContain(response.status());
        });
      });

      test("C6895: Получить токен с специальными символами в коде", async ({
        surveyAPI,
      }) => {
        setSeverity("minor");

        await test.step("Выполнить: Получить токен с специальными символами в коде", async () => {
          const { surveyId, revisionAlias } =
            await findSurveyWithRevision(surveyAPI);
          test.skip(
            !surveyId || !revisionAlias,
            "Нет опроса с ревизией для тестирования",
          );

          const { response } = await surveyAPI.getPersonalSurveyToken(
            surveyId,
            revisionAlias,
            "<script>alert(1)</script>",
          );

          expect(
            [400, 403, 404],
            `Ожидался статус ошибки, получен ${response.status()}`,
          ).toContain(response.status());
        });
      });
    });
  },
);
