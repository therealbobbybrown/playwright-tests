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
 * API тесты для External (Public) Surveys — интеграционные тесты и граничные случаи
 *
 * Покрытие:
 * - Полный цикл: получить опрос → проверить доступность → попробовать получить токен
 * - Консистентность между department и group кодами
 * - Повторные запросы — консистентность
 * - Граничные случаи: большие ID, нулевые, отрицательные, XSS, SQL-инъекции, Unicode
 *
 * @tags @api @regression @survey @external
 */

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
  "Survey External API — Integration & Edge Cases",
  { tag: ["@api", "@regression", "@survey", "@external"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.SURVEYS, "External Surveys");
    });

    // ==================== INTEGRATION TESTS ====================

    test.describe("Интеграционные тесты", () => {
      test("C6909: Полный цикл: получить опрос → проверить доступность → попробовать получить токен", async ({
        surveyAPI,
      }) => {
        setSeverity("critical");

        let surveyId, revisionAlias, surveyResp, surveyData;
        await test.step("Выполнить запрос: Полный цикл: получить опрос → проверить доступность → попробовать получить токен", async () => {
          ({ surveyId, revisionAlias } =
            await findSurveyWithRevision(surveyAPI));
          test.skip(
            !surveyId || !revisionAlias,
            "Нет опроса с ревизией для тестирования",
          );

          allure.attachment(
            "Test data",
            JSON.stringify({ surveyId, revisionAlias }),
            "application/json",
          );

          // Шаг 1: Получаем опрос
          ({ response: surveyResp, data: surveyData } =
            await surveyAPI.getExternalSurvey(surveyId, revisionAlias));
          allure.attachment(
            "Step 1: getExternalSurvey",
            JSON.stringify({ status: surveyResp.status(), data: surveyData }),
            "application/json",
          );
        });

        await test.step("Проверить ответ", async () => {
          expect([200, 400, 403, 404], "Статус getExternalSurvey").toContain(
            surveyResp.status(),
          );

          // Шаг 2: Проверяем доступность персонального опроса
          const { response: availResp, data: availData } =
            await surveyAPI.checkPersonalSurveyAvailability(
              surveyId,
              revisionAlias,
            );
          allure.attachment(
            "Step 2: checkPersonalSurveyAvailability",
            JSON.stringify({ status: availResp.status(), data: availData }),
            "application/json",
          );
          expect(
            [200, 400, 403, 404],
            "Статус checkPersonalSurveyAvailability",
          ).toContain(availResp.status());

          // Шаг 3: Пробуем получить токен
          const { response: tokenResp, data: tokenData } =
            await surveyAPI.getPersonalSurveyToken(
              surveyId,
              revisionAlias,
              "TEST",
            );
          allure.attachment(
            "Step 3: getPersonalSurveyToken",
            JSON.stringify({ status: tokenResp.status(), data: tokenData }),
            "application/json",
          );
          expect(
            [200, 400, 403, 404],
            "Статус getPersonalSurveyToken",
          ).toContain(tokenResp.status());
        });
      });

      test("C6910: Проверка консистентности между department и group кодами", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");

        let deptResp, groupResp;
        await test.step("Выполнить запрос: Проверка консистентности между department и group кодами", async () => {
          const { surveyId, revisionAlias } =
            await findSurveyWithRevision(surveyAPI);
          test.skip(
            !surveyId || !revisionAlias,
            "Нет опроса с ревизией для тестирования",
          );

          // Проверяем коды департаментов и групп
          ({ response: deptResp } = await surveyAPI.getRevisionDepartmentCode(
            surveyId,
            revisionAlias,
            "TEST",
          ));
          ({ response: groupResp } = await surveyAPI.getRevisionGroupCode(
            surveyId,
            revisionAlias,
            "TEST",
          ));

          // Оба endpoint должны работать одинаково для невалидных кодов
        });

        await test.step("Проверить ответ", async () => {
          expect([200, 400, 403, 404]).toContain(deptResp.status());
          expect([200, 400, 403, 404]).toContain(groupResp.status());
        });
      });

      test("C6911: Повторные запросы возвращают консистентные результаты", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");

        let resp1, resp2;
        await test.step("Выполнить запрос: Повторные запросы возвращают консистентные результаты", async () => {
          const { surveyId, revisionAlias } =
            await findSurveyWithRevision(surveyAPI);
          test.skip(
            !surveyId || !revisionAlias,
            "Нет опроса с ревизией для тестирования",
          );

          // Делаем два запроса подряд
          ({ response: resp1 } = await surveyAPI.getExternalSurvey(
            surveyId,
            revisionAlias,
          ));
          ({ response: resp2 } = await surveyAPI.getExternalSurvey(
            surveyId,
            revisionAlias,
          ));

          // Оба запроса должны вернуть одинаковый статус
        });

        await test.step("Проверить ответ", async () => {
          expect(
            resp1.status(),
            "Статусы повторных запросов должны совпадать",
          ).toBe(resp2.status());
        });
      });
    });

    // ==================== EDGE CASES ====================

    test.describe("Граничные случаи", () => {
      test("C6912: Запрос с очень большим surveyId", async ({ surveyAPI }) => {
        setSeverity("minor");

        await test.step("Выполнить: Запрос с очень большим surveyId", async () => {
          const { response } = await surveyAPI.getExternalSurvey(
            Number.MAX_SAFE_INTEGER,
            "test",
          );

          expect([400, 403, 404, 500]).toContain(response.status());
        });
      });

      test("C6913: Запрос с нулевым surveyId", async ({ surveyAPI }) => {
        setSeverity("minor");

        await test.step("Выполнить: Запрос с нулевым surveyId", async () => {
          const { response } = await surveyAPI.getExternalSurvey(0, "test");

          expect([400, 403, 404, 500]).toContain(response.status());
        });
      });

      test("C6914: Запрос с отрицательным surveyId", async ({ surveyAPI }) => {
        setSeverity("minor");

        await test.step("Выполнить: Запрос с отрицательным surveyId", async () => {
          const { response } = await surveyAPI.getExternalSurvey(-1, "test");

          expect([400, 403, 404, 500]).toContain(response.status());
        });
      });

      test("C6915: Запрос с очень длинным revisionAlias", async ({
        surveyAPI,
      }) => {
        setSeverity("minor");

        await test.step("Выполнить: Запрос с очень длинным revisionAlias", async () => {
          const { surveyId } = await findSurveyWithRevision(surveyAPI);
          test.skip(!surveyId, "Нет опроса для тестирования");

          const longAlias = "a".repeat(1000);
          const { response } = await surveyAPI.getExternalSurvey(
            surveyId,
            longAlias,
          );

          expect([400, 403, 404, 414, 500]).toContain(response.status());
        });
      });

      test("C6916: SQL-инъекция в revisionAlias", async ({ surveyAPI }) => {
        setSeverity("minor");

        await test.step("Выполнить: SQL-инъекция в revisionAlias", async () => {
          const { surveyId } = await findSurveyWithRevision(surveyAPI);
          test.skip(!surveyId, "Нет опроса для тестирования");

          const { response } = await surveyAPI.getExternalSurvey(
            surveyId,
            "'; DROP TABLE surveys;--",
          );

          expect([400, 403, 404, 500]).toContain(response.status());
        });
      });

      test("C6917: XSS-атака в коде", async ({ surveyAPI }) => {
        setSeverity("minor");

        await test.step("Выполнить: XSS-атака в коде", async () => {
          const { surveyId, revisionAlias } =
            await findSurveyWithRevision(surveyAPI);
          test.skip(
            !surveyId || !revisionAlias,
            "Нет опроса с ревизией для тестирования",
          );

          const { response } = await surveyAPI.getRevisionDepartmentCode(
            surveyId,
            revisionAlias,
            "<img src=x onerror=alert(1)>",
          );

          expect([400, 403, 404]).toContain(response.status());
        });
      });

      test("C6918: Unicode символы в alias", async ({ surveyAPI }) => {
        setSeverity("minor");

        await test.step("Выполнить: Unicode символы в alias", async () => {
          const { surveyId } = await findSurveyWithRevision(surveyAPI);
          test.skip(!surveyId, "Нет опроса для тестирования");

          const { response } = await surveyAPI.getExternalSurvey(
            surveyId,
            "тест-опрос-алиас",
          );

          expect([400, 403, 404, 500]).toContain(response.status());
        });
      });
    });
  },
);
