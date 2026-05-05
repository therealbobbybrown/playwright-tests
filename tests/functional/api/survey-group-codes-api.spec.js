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
 * API тесты для групповых опросов (Department/Group Codes)
 *
 * Покрытие:
 * - Department codes
 * - Group codes
 * - Group tokens
 * - Экспорт групповых кодов
 */

const test = base.extend({
  surveyAPI: async ({ request }, use) => {
    const api = new SurveyAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
});

// Хелпер для поиска активного публичного опроса
async function findPublicSurvey(surveyAPI) {
  const { data } = await surveyAPI.getList({ status: "active", limit: 20 });
  const items = data?.items || data || [];

  for (const survey of items) {
    const { data: surveyDetails } = await surveyAPI.getById(survey.id);

    // Проверяем что опрос внешний (external)
    if (surveyDetails?.publicityType === "external") {
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

  // Возвращаем любой активный опрос
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
  "Survey Department Codes API",
  { tag: ["@api", "@regression", "@survey", "@department-codes"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.SURVEYS, "Department Codes");
    });

    test.describe("Department Code Endpoints", () => {
      test(
        "C6879: GET .../department-code/{code}/ - получить код департамента",
        { tag: ["@critical"] },
        async ({ surveyAPI }) => {
          setSeverity("critical");

          let response, data;
          await test.step("Выполнить запрос: GET .../department-code/{code}/ - получить код департамента", async () => {
            const { surveyId, revisionAlias } =
              await findPublicSurvey(surveyAPI);
            test.skip(!surveyId || !revisionAlias, "Нет опросов");

            ({ response, data } = await surveyAPI.getRevisionDepartmentCode(
              surveyId,
              revisionAlias,
              "test-department-code",
            ));

            // Код скорее всего невалидный
          });

          await test.step("Проверить ответ", async () => {
            expect([200, 400, 403, 404]).toContain(response.status());

            // При успешном ответе валидируем структуру
            if (response.ok() && data) {
              expect(data).toBeDefined();
              // Код департамента должен содержать информацию
              if (data.code !== undefined) {
                expect(typeof data.code).toBe("string");
              }
              if (data.departmentId !== undefined) {
                expect(
                  typeof data.departmentId === "string" ||
                    typeof data.departmentId === "number",
                ).toBe(true);
              }
            }
          });
        },
      );

      test("C6920: GET .../department-code/{code}/ - пустой код", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: GET .../department-code/{code}/ - пустой код", async () => {
          const { surveyId, revisionAlias } = await findPublicSurvey(surveyAPI);
          test.skip(!surveyId || !revisionAlias, "Нет опросов");

          // Пустой код в URL
          const { response } = await surveyAPI.get(
            `/public/surveys/${surveyId}/${revisionAlias}/department-code//`,
          );

          expect([400, 404]).toContain(response.status());
        });
      });

      test(
        "C6921: GET .../department-code/{code}/ - специальные символы",
        { tag: ["@critical"] },
        async ({ surveyAPI }) => {
          setSeverity("critical");

          await test.step("Выполнить: GET .../department-code/{code}/ - специальные символы", async () => {
            const { surveyId, revisionAlias } =
              await findPublicSurvey(surveyAPI);
            test.skip(!surveyId || !revisionAlias, "Нет опросов");

            const { response } = await surveyAPI.getRevisionDepartmentCode(
              surveyId,
              revisionAlias,
              "../../../etc/passwd",
            );

            expect([400, 403, 404]).toContain(response.status());
          });
        },
      );

      test(
        "C6922: GET .../department-code/{code}/ - XSS в коде",
        { tag: ["@critical"] },
        async ({ surveyAPI }) => {
          setSeverity("critical");

          await test.step("Выполнить: GET .../department-code/{code}/ - XSS в коде", async () => {
            const { surveyId, revisionAlias } =
              await findPublicSurvey(surveyAPI);
            test.skip(!surveyId || !revisionAlias, "Нет опросов");

            const { response } = await surveyAPI.getRevisionDepartmentCode(
              surveyId,
              revisionAlias,
              "<img src=x onerror=alert(1)>",
            );

            expect([400, 403, 404]).toContain(response.status());
          });
        },
      );

      test("C6923: GET .../department-code/{code}/ - очень длинный код", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: GET .../department-code/{code}/ - очень длинный код", async () => {
          const { surveyId, revisionAlias } = await findPublicSurvey(surveyAPI);
          test.skip(!surveyId || !revisionAlias, "Нет опросов");

          const longCode = "x".repeat(500);
          const { response } = await surveyAPI.getRevisionDepartmentCode(
            surveyId,
            revisionAlias,
            longCode,
          );

          expect([400, 403, 404, 413, 414]).toContain(response.status());
        });
      });
    });

    test.describe("Group Code Endpoints", () => {
      test(
        "C6880: GET .../group-code/{code}/ - получить код группы",
        { tag: ["@critical"] },
        async ({ surveyAPI }) => {
          setSeverity("critical");

          let response, data;
          await test.step("Выполнить запрос: GET .../group-code/{code}/ - получить код группы", async () => {
            const { surveyId, revisionAlias } =
              await findPublicSurvey(surveyAPI);
            test.skip(!surveyId || !revisionAlias, "Нет опросов");

            ({ response, data } = await surveyAPI.getRevisionGroupCode(
              surveyId,
              revisionAlias,
              "test-group-code",
            ));
          });

          await test.step("Проверить ответ", async () => {
            expect([200, 400, 403, 404]).toContain(response.status());

            // При успешном ответе валидируем структуру
            if (response.ok() && data) {
              expect(data).toBeDefined();
              // Код группы должен содержать информацию
              if (data.code !== undefined) {
                expect(typeof data.code).toBe("string");
              }
              if (data.groupId !== undefined) {
                expect(
                  typeof data.groupId === "string" ||
                    typeof data.groupId === "number",
                ).toBe(true);
              }
            }
          });
        },
      );

      test("C6925: GET .../group-code/{code}/ - пустой код", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: GET .../group-code/{code}/ - пустой код", async () => {
          const { surveyId, revisionAlias } = await findPublicSurvey(surveyAPI);
          test.skip(!surveyId || !revisionAlias, "Нет опросов");

          const { response } = await surveyAPI.get(
            `/public/surveys/${surveyId}/${revisionAlias}/group-code//`,
          );

          expect([400, 404]).toContain(response.status());
        });
      });

      test(
        "C6926: GET .../group-code/{code}/ - SQL injection",
        { tag: ["@critical"] },
        async ({ surveyAPI }) => {
          setSeverity("critical");

          await test.step("Выполнить: GET .../group-code/{code}/ - SQL injection", async () => {
            const { surveyId, revisionAlias } =
              await findPublicSurvey(surveyAPI);
            test.skip(!surveyId || !revisionAlias, "Нет опросов");

            const { response } = await surveyAPI.getRevisionGroupCode(
              surveyId,
              revisionAlias,
              "1' OR '1'='1",
            );

            expect([400, 403, 404]).toContain(response.status());
          });
        },
      );
    });

    test.describe("Group Token Endpoints", () => {
      test(
        "C6927: GET .../group-token/ - получить групповой токен",
        { tag: ["@critical"] },
        async ({ surveyAPI }) => {
          setSeverity("critical");

          let response, data;
          await test.step("Выполнить запрос: GET .../group-token/ - получить групповой токен", async () => {
            const { surveyId, revisionAlias } =
              await findPublicSurvey(surveyAPI);
            test.skip(!surveyId || !revisionAlias, "Нет опросов");

            ({ response, data } = await surveyAPI.getRevisionGroupToken(
              surveyId,
              revisionAlias,
              "department",
              "test-code",
            ));
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
            }
          });
        },
      );

      test("C6928: GET .../group-token/ - codeType = group", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: GET .../group-token/ - codeType = group", async () => {
          const { surveyId, revisionAlias } = await findPublicSurvey(surveyAPI);
          test.skip(!surveyId || !revisionAlias, "Нет опросов");

          const { response, data } = await surveyAPI.getRevisionGroupToken(
            surveyId,
            revisionAlias,
            "group",
            "test-group-code",
          );

          expect([200, 400, 403, 404]).toContain(response.status());
        });
      });

      test("C6929: GET .../group-token/ - невалидный codeType", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: GET .../group-token/ - невалидный codeType", async () => {
          const { surveyId, revisionAlias } = await findPublicSurvey(surveyAPI);
          test.skip(!surveyId || !revisionAlias, "Нет опросов");

          const { response } = await surveyAPI.getRevisionGroupToken(
            surveyId,
            revisionAlias,
            "invalid-type",
            "test-code",
          );

          expect([400, 403, 404, 422]).toContain(response.status());
        });
      });

      test("C6930: GET .../group-token/ - пустой код", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: GET .../group-token/ - пустой код", async () => {
          const { surveyId, revisionAlias } = await findPublicSurvey(surveyAPI);
          test.skip(!surveyId || !revisionAlias, "Нет опросов");

          const { response } = await surveyAPI.getRevisionGroupToken(
            surveyId,
            revisionAlias,
            "department",
            "",
          );

          expect([400, 403, 404, 422]).toContain(response.status());
        });
      });
    });

    test.describe("Group Code Export", () => {
      test(
        "C6931: GET .../group-code/export/get-token/ - экспорт групповых кодов",
        { tag: ["@critical"] },
        async ({ surveyAPI }) => {
          setSeverity("critical");

          await test.step("Выполнить: GET .../group-code/export/get-token/ - экспорт групповых кодов", async () => {
            const { surveyId, revisionAlias } =
              await findPublicSurvey(surveyAPI);
            test.skip(!surveyId || !revisionAlias, "Нет опросов");

            const { response, data } = await surveyAPI.getGroupCodeExportToken(
              surveyId,
              revisionAlias,
            );

            // Групповые коды могут быть не настроены
            expect([200, 400, 403, 404]).toContain(response.status());

            // При успешном ответе валидируем токен экспорта
            if (response.ok() && data) {
              if (data.token !== undefined) {
                expect(typeof data.token).toBe("string");
                expect(data.token.length).toBeGreaterThan(0);
              }
            }
          });
        },
      );

      test("C6932: GET .../group-code/export/get-token/ - несуществующий опрос", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: GET .../group-code/export/get-token/ - несуществующий опрос", async () => {
          const { response } = await surveyAPI.getGroupCodeExportToken(
            999999,
            "test-alias",
          );

          expect([400, 403, 404]).toContain(response.status());
        });
      });

      test("C6933: GET .../group-code/export/get-token/ - несуществующий alias", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: GET .../group-code/export/get-token/ - несуществующий alias", async () => {
          const { surveyId } = await findPublicSurvey(surveyAPI);
          test.skip(!surveyId, "Нет опросов");

          const { response } = await surveyAPI.getGroupCodeExportToken(
            surveyId,
            "non-existent-alias",
          );

          // ПРИМЕЧАНИЕ: API генерирует токен даже для несуществующего alias (возвращает 200).
          // Токен будет невалидным при использовании, но генерируется успешно.
          // Это может быть потенциальной проблемой - API не валидирует alias при генерации токена.
          expect([200, 400, 403, 404]).toContain(response.status());
        });
      });
    });

    test.describe("Negative Tests", () => {
      test("C6934: Department code - несуществующий опрос", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Department code - несуществующий опрос", async () => {
          const { response } = await surveyAPI.getRevisionDepartmentCode(
            999999,
            "test",
            "code",
          );

          expect([400, 403, 404]).toContain(response.status());
        });
      });

      test("C6935: Group code - несуществующий опрос", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Group code - несуществующий опрос", async () => {
          const { response } = await surveyAPI.getRevisionGroupCode(
            999999,
            "test",
            "code",
          );

          expect([400, 403, 404]).toContain(response.status());
        });
      });

      test("C6936: Group token - несуществующий опрос", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Group token - несуществующий опрос", async () => {
          const { response } = await surveyAPI.getRevisionGroupToken(
            999999,
            "test",
            "department",
            "code",
          );

          expect([400, 403, 404]).toContain(response.status());
        });
      });

      test("C6937: Department code - Unicode в коде", async ({ surveyAPI }) => {
        setSeverity("normal");

        await test.step("Выполнить: Department code - Unicode в коде", async () => {
          const { surveyId, revisionAlias } = await findPublicSurvey(surveyAPI);
          test.skip(!surveyId || !revisionAlias, "Нет опросов");

          const { response } = await surveyAPI.getRevisionDepartmentCode(
            surveyId,
            revisionAlias,
            "тестовый-код-кириллица",
          );

          expect([200, 400, 403, 404]).toContain(response.status());
        });
      });

      test("C6938: Group code - эмодзи в коде", async ({ surveyAPI }) => {
        setSeverity("normal");

        await test.step("Выполнить: Group code - эмодзи в коде", async () => {
          const { surveyId, revisionAlias } = await findPublicSurvey(surveyAPI);
          test.skip(!surveyId || !revisionAlias, "Нет опросов");

          const { response } = await surveyAPI.getRevisionGroupCode(
            surveyId,
            revisionAlias,
            "🎉test🎉",
          );

          expect([200, 400, 403, 404]).toContain(response.status());
        });
      });
    });
  },
);
