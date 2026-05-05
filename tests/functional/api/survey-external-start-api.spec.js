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
 * API тесты для External (Public) Surveys — начало внешнего опроса
 *
 * Покрытие:
 * - POST /public/surveys/{surveyId}/{revisionAlias}/answer/page/start/ - начало внешнего опроса
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
  "Survey External API — Start External Survey",
  { tag: ["@api", "@regression", "@survey", "@external"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.SURVEYS, "External Surveys");
    });

    // ==================== START EXTERNAL SURVEY ====================

    test.describe("POST /public/surveys/{surveyId}/{revisionAlias}/answer/page/start/ - Начало внешнего опроса", () => {
      test(
        "C6905: Попытка начать внешний опрос",
        { tag: ["@critical"] },
        async ({ surveyAPI }) => {
          setSeverity("critical");

          let response, data, status;
          await test.step("Выполнить запрос: Попытка начать внешний опрос", async () => {
            const { surveyId, revisionAlias } =
              await findSurveyWithRevision(surveyAPI);
            test.skip(
              !surveyId || !revisionAlias,
              "Нет опроса с ревизией для тестирования",
            );

            logInput("startExternalSurvey", { surveyId, revisionAlias });
            logExpected(
              "Status 200/201 для публичного опроса или 403/404 для закрытого",
            );

            ({ response, data } = await surveyAPI.startExternalSurvey(
              surveyId,
              revisionAlias,
            ));
            logResponse(response.status(), data);

            status = response.status();
            // Опрос может быть публичным или требовать авторизацию
          });

          await test.step("Проверить ответ", async () => {
            expect(
              [200, 201, 400, 403, 404],
              `Ожидался допустимый статус, получен ${status}`,
            ).toContain(status);

            if (status === 200 || status === 201) {
              expect(data, "Данные должны быть определены").toBeDefined();
            }
          });
        },
      );

      test("C6906: Начать несуществующий внешний опрос - должна быть ошибка", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Начать несуществующий внешний опрос - должна быть ошибка", async () => {
          logInput("startExternalSurvey", {
            surveyId: 999999999,
            revisionAlias: "nonexistent",
          });
          logExpected("Status 404 - опрос не найден");

          const { response } = await surveyAPI.startExternalSurvey(
            999999999,
            "nonexistent-alias",
          );

          expect(
            [400, 403, 404],
            `Ожидался статус ошибки, получен ${response.status()}`,
          ).toContain(response.status());
        });
      });

      test("C6907: Начать опрос с невалидным alias - должна быть ошибка", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Начать опрос с невалидным alias - должна быть ошибка", async () => {
          const { surveyId } = await findSurveyWithRevision(surveyAPI);
          test.skip(!surveyId, "Нет опроса для тестирования");

          const { response } = await surveyAPI.startExternalSurvey(
            surveyId,
            "invalid-alias-xyz",
          );

          expect(
            [400, 403, 404],
            `Ожидался статус ошибки, получен ${response.status()}`,
          ).toContain(response.status());
        });
      });

      test("C6908: Начать опрос с пустыми параметрами - должна быть ошибка", async ({
        surveyAPI,
      }) => {
        setSeverity("minor");

        await test.step("Выполнить: Начать опрос с пустыми параметрами - должна быть ошибка", async () => {
          const { response } = await surveyAPI.startExternalSurvey("", "");

          expect(
            [400, 403, 404, 500],
            `Ожидался статус ошибки, получен ${response.status()}`,
          ).toContain(response.status());
        });
      });
    });
  },
);
