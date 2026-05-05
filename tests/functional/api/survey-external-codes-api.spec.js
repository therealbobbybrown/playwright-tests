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
 * API тесты для External (Public) Surveys — коды департаментов, групп и групповые токены
 *
 * Покрытие:
 * - GET /public/surveys/{surveyId}/{revisionAlias}/department-code/{code}/ - код департамента
 * - GET /public/surveys/{surveyId}/{revisionAlias}/group-code/{code}/ - код группы
 * - GET /public/surveys/{surveyId}/{revisionAlias}/group-token/ - групповой токен
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
  "Survey External API — Codes & Group Token",
  { tag: ["@api", "@regression", "@survey", "@external"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.SURVEYS, "External Surveys");
    });

    // ==================== GET REVISION DEPARTMENT CODE ====================

    test.describe("GET /public/surveys/{surveyId}/{revisionAlias}/department-code/{code}/ - Код департамента", () => {
      test(
        "C6896: Получить информацию по коду департамента",
        { tag: ["@critical"] },
        async ({ surveyAPI }) => {
          setSeverity("critical");

          let status;
          await test.step("Выполнить запрос: Получить информацию по коду департамента", async () => {
            const { surveyId, revisionAlias } =
              await findSurveyWithRevision(surveyAPI);
            test.skip(
              !surveyId || !revisionAlias,
              "Нет опроса с ревизией для тестирования",
            );

            const testCode = "DEPT001";
            logInput("getRevisionDepartmentCode", {
              surveyId,
              revisionAlias,
              code: testCode,
            });
            logExpected(
              "Status 200 с данными департамента или 404 если код не найден",
            );

            const { response, data } =
              await surveyAPI.getRevisionDepartmentCode(
                surveyId,
                revisionAlias,
                testCode,
              );
            logResponse(response.status(), data);

            status = response.status();
          });

          await test.step("Проверить ответ", async () => {
            expect(
              [200, 400, 403, 404],
              `Ожидался статус 200/400/403/404, получен ${status}`,
            ).toContain(status);
          });
        },
      );

      test("C6897: Получить данные по несуществующему коду департамента - должна быть ошибка", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить данные по несуществующему коду департамента - должна быть ошибка", async () => {
          const { surveyId, revisionAlias } =
            await findSurveyWithRevision(surveyAPI);
          test.skip(
            !surveyId || !revisionAlias,
            "Нет опроса с ревизией для тестирования",
          );

          const { response } = await surveyAPI.getRevisionDepartmentCode(
            surveyId,
            revisionAlias,
            "INVALID_CODE_999",
          );

          expect(
            [400, 403, 404],
            `Ожидался статус ошибки, получен ${response.status()}`,
          ).toContain(response.status());
        });
      });

      test("C6898: Получить данные с пустым кодом - должна быть ошибка", async ({
        surveyAPI,
      }) => {
        setSeverity("minor");

        await test.step("Выполнить: Получить данные с пустым кодом - должна быть ошибка", async () => {
          const { surveyId, revisionAlias } =
            await findSurveyWithRevision(surveyAPI);
          test.skip(
            !surveyId || !revisionAlias,
            "Нет опроса с ревизией для тестирования",
          );

          const { response } = await surveyAPI.getRevisionDepartmentCode(
            surveyId,
            revisionAlias,
            "",
          );

          expect(
            [400, 403, 404, 500],
            `Ожидался статус ошибки, получен ${response.status()}`,
          ).toContain(response.status());
        });
      });
    });

    // ==================== GET REVISION GROUP CODE ====================

    test.describe("GET /public/surveys/{surveyId}/{revisionAlias}/group-code/{code}/ - Код группы", () => {
      test(
        "C6899: Получить информацию по коду группы",
        { tag: ["@critical"] },
        async ({ surveyAPI }) => {
          setSeverity("critical");

          let status;
          await test.step("Выполнить запрос: Получить информацию по коду группы", async () => {
            const { surveyId, revisionAlias } =
              await findSurveyWithRevision(surveyAPI);
            test.skip(
              !surveyId || !revisionAlias,
              "Нет опроса с ревизией для тестирования",
            );

            const testCode = "GROUP001";
            logInput("getRevisionGroupCode", {
              surveyId,
              revisionAlias,
              code: testCode,
            });
            logExpected(
              "Status 200 с данными группы или 404 если код не найден",
            );

            const { response, data } = await surveyAPI.getRevisionGroupCode(
              surveyId,
              revisionAlias,
              testCode,
            );
            logResponse(response.status(), data);

            status = response.status();
          });

          await test.step("Проверить ответ", async () => {
            expect(
              [200, 400, 403, 404],
              `Ожидался статус 200/400/403/404, получен ${status}`,
            ).toContain(status);
          });
        },
      );

      test("C6900: Получить данные по несуществующему коду группы - должна быть ошибка", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить данные по несуществующему коду группы - должна быть ошибка", async () => {
          const { surveyId, revisionAlias } =
            await findSurveyWithRevision(surveyAPI);
          test.skip(
            !surveyId || !revisionAlias,
            "Нет опроса с ревизией для тестирования",
          );

          const { response } = await surveyAPI.getRevisionGroupCode(
            surveyId,
            revisionAlias,
            "INVALID_GROUP_999",
          );

          expect(
            [400, 403, 404],
            `Ожидался статус ошибки, получен ${response.status()}`,
          ).toContain(response.status());
        });
      });
    });

    // ==================== GET REVISION GROUP TOKEN ====================

    test.describe("GET /public/surveys/{surveyId}/{revisionAlias}/group-token/ - Групповой токен", () => {
      test(
        "C6901: Получить групповой токен",
        { tag: ["@critical"] },
        async ({ surveyAPI }) => {
          setSeverity("critical");

          let response, data, status;
          await test.step("Выполнить запрос: Получить групповой токен", async () => {
            const { surveyId, revisionAlias } =
              await findSurveyWithRevision(surveyAPI);
            test.skip(
              !surveyId || !revisionAlias,
              "Нет опроса с ревизией для тестирования",
            );

            const codeType = "department";
            const code = "TEST_CODE";
            logInput("getRevisionGroupToken", {
              surveyId,
              revisionAlias,
              codeType,
              code,
            });
            logExpected(
              "Status 200 с токеном или 400/404 если параметры невалидны",
            );

            ({ response, data } = await surveyAPI.getRevisionGroupToken(
              surveyId,
              revisionAlias,
              codeType,
              code,
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
              expect(typeof data).toBe("object");
            }
          });
        },
      );

      test("C6902: Получить групповой токен с codeType=group", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");

        let response, data;
        await test.step("Выполнить запрос: Получить групповой токен с codeType=group", async () => {
          const { surveyId, revisionAlias } =
            await findSurveyWithRevision(surveyAPI);
          test.skip(
            !surveyId || !revisionAlias,
            "Нет опроса с ревизией для тестирования",
          );

          ({ response, data } = await surveyAPI.getRevisionGroupToken(
            surveyId,
            revisionAlias,
            "group",
            "TEST_CODE",
          ));
          logResponse(response.status(), data);
        });

        await test.step("Проверить ответ", async () => {
          expect(
            [200, 400, 403, 404],
            `Ожидался статус 200/400/403/404, получен ${response.status()}`,
          ).toContain(response.status());
        });
      });

      test("C6903: Получить групповой токен с невалидным codeType - должна быть ошибка", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");

        let response;
        await test.step("Выполнить запрос: Получить групповой токен с невалидным codeType - должна быть ошибка", async () => {
          const { surveyId, revisionAlias } =
            await findSurveyWithRevision(surveyAPI);
          test.skip(
            !surveyId || !revisionAlias,
            "Нет опроса с ревизией для тестирования",
          );

          ({ response } = await surveyAPI.getRevisionGroupToken(
            surveyId,
            revisionAlias,
            "invalid_type",
            "CODE",
          ));
        });

        await test.step("Проверить ответ", async () => {
          expect(
            [400, 403, 404],
            `Ожидался статус ошибки, получен ${response.status()}`,
          ).toContain(response.status());
        });
      });

      test("C6904: Получить групповой токен с пустыми параметрами - должна быть ошибка", async ({
        surveyAPI,
      }) => {
        setSeverity("minor");

        let response;
        await test.step("Выполнить запрос: Получить групповой токен с пустыми параметрами - должна быть ошибка", async () => {
          const { surveyId, revisionAlias } =
            await findSurveyWithRevision(surveyAPI);
          test.skip(
            !surveyId || !revisionAlias,
            "Нет опроса с ревизией для тестирования",
          );

          ({ response } = await surveyAPI.getRevisionGroupToken(
            surveyId,
            revisionAlias,
            "",
            "",
          ));
        });

        await test.step("Проверить ответ", async () => {
          expect(
            [400, 403, 404],
            `Ожидался статус ошибки, получен ${response.status()}`,
          ).toContain(response.status());
        });
      });
    });
  },
);
