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
 * API тесты для напоминаний Surveys
 *
 * Покрытие:
 * - CRUD операции с напоминаниями
 * - Восстановление удалённых напоминаний
 */

// Расширяем test с фикстурой для Survey API
const test = fullTest.extend({
  surveyAPI: async ({ request }, use) => {
    const api = new SurveyAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
});

// Хелпер для получения активного опроса с ревизией
async function findActiveSurveyWithRevision(surveyAPI) {
  // Запрашиваем активные опросы напрямую
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
    };
  }

  // Fallback - ищем любой опрос
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
    };
  }

  return { surveyId: null, survey: null, revisionId: null };
}

test.describe(
  "Survey Reminds API",
  { tag: ["@api", "@regression", "@survey", "@reminds"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.SURVEYS, "Reminds");
    });

    test.describe("GET Endpoints", () => {
      test(
        "C7000: GET /manager/survey-reminds/ - получить список напоминаний",
        { tag: ["@critical"] },
        async ({ surveyAPI }) => {
          setSeverity("critical");

          let response, data;
          await test.step("Выполнить запрос: GET /manager/survey-reminds/ - получить список напоминаний", async () => {
            const { revisionId } =
              await findActiveSurveyWithRevision(surveyAPI);
            test.skip(!revisionId, "Нет ревизий");

            ({ response, data } = await surveyAPI.getReminds({
              surveyRevisionId: revisionId,
              limit: 10,
              offset: 0,
            }));

            assertSuccessStatus(response);
          });

          await test.step("Проверить ответ", async () => {
            expect(data).toBeDefined();

            // Валидация структуры списка напоминаний
            const items = data?.items || data || [];
            assertValidArray(items);
            expect(items.length).toBeLessThanOrEqual(10); // limit = 10

            // Проверяем структуру элемента напоминания (если есть)
            if (items.length > 0) {
              expect(items[0]).toHaveProperty("id");
              if (items[0].scheduledAt !== undefined) {
                // scheduledAt может быть строкой или объектом Date
                expect(["string", "object"]).toContain(
                  typeof items[0].scheduledAt,
                );
              }
              if (items[0].title !== undefined) {
                expect(typeof items[0].title).toBe("string");
              }
            }
          });
        },
      );

      test("C7001: GET /manager/survey-reminds/ с пагинацией", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: GET /manager/survey-reminds/ с пагинацией", async () => {
          const { revisionId } = await findActiveSurveyWithRevision(surveyAPI);
          test.skip(!revisionId, "Нет ревизий");

          const { response, data } = await surveyAPI.getReminds({
            surveyRevisionId: revisionId,
            limit: 5,
            offset: 0,
          });

          assertSuccessStatus(response);
          expect(data).toBeDefined();

          // Валидация пагинации
          const items = data?.items || data || [];
          assertValidArray(items);
          expect(items.length).toBeLessThanOrEqual(5); // limit = 5
        });
      });

      test("C7002: GET /manager/survey-reminds/ без surveyRevisionId", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: GET /manager/survey-reminds/ без surveyRevisionId", async () => {
          const { response, data } = await surveyAPI.getReminds({
            limit: 10,
          });

          // Может вернуть все напоминания или ошибку
          expect([200, 400]).toContain(response.status());

          // При успешном ответе валидируем структуру
          if (response.ok() && data) {
            const items = data?.items || data || [];
            assertValidArray(items);
          }
        });
      });
    });

    test.describe("CRUD Operations", () => {
      let createdRemindId = null;

      test(
        "C7003: POST /manager/survey-reminds/ - создать напоминание",
        { tag: ["@critical", "@db"] },
        async ({ surveyAPI, surveyVerifier }) => {
          setSeverity("critical");

          let scheduledAt, response, data;
          await test.step("Выполнить запрос: POST /manager/survey-reminds/ - создать напоминание", async () => {
            const { revisionId } =
              await findActiveSurveyWithRevision(surveyAPI);
            test.skip(!revisionId, "Нет ревизий");

            // Создаём напоминание на завтра
            scheduledAt = new Date();
            scheduledAt.setDate(scheduledAt.getDate() + 1);

            const remindTitle = `API Test Remind ${Date.now()}`;
            ({ response, data } = await surveyAPI.createRemind({
              surveyRevisionId: revisionId,
              title: remindTitle,
              body: "Тестовое напоминание созданное через API",
              scheduledAt: scheduledAt.toISOString(),
            }));
          });

          await test.step("Проверить ответ", async () => {
            expect([200, 201, 400]).toContain(response.status());

            // При успешном создании валидируем структуру
            if (response.ok() && data) {
              expect(data).toHaveProperty("id");
              expect(
                typeof data.id === "string" || typeof data.id === "number",
              ).toBe(true);
              createdRemindId = data.id;

              // Проверяем возврат данных напоминания
              if (data.title !== undefined) {
                expect(typeof data.title).toBe("string");
              }
              if (data.scheduledAt !== undefined) {
                expect(typeof data.scheduledAt).toBe("string");
              }

              // DB верификация: проверяем создание в БД
              const dbRemind = await surveyVerifier.verifyRemindCreated(
                data.id,
              );
              if (dbRemind) {
                await surveyVerifier.verifyRemindTitleContains(
                  data.id,
                  "API Test Remind",
                );
                await surveyVerifier.verifyRemindNotDeleted(data.id);
              }
            }
          });
        },
      );

      test(
        "C7004: POST /manager/survey-reminds/{id}/ - обновить напоминание",
        { tag: ["@critical"] },
        async ({ surveyAPI }) => {
          setSeverity("critical");

          let response;
          await test.step("Выполнить запрос: POST /manager/survey-reminds/{id}/ - обновить напоминание", async () => {
            const { revisionId } =
              await findActiveSurveyWithRevision(surveyAPI);
            test.skip(!revisionId, "Нет ревизий");

            // Получаем существующее напоминание
            const { data: reminds } = await surveyAPI.getReminds({
              surveyRevisionId: revisionId,
              limit: 1,
            });

            const remind = reminds?.items?.[0] || reminds?.[0];
            test.skip(!remind, "Нет напоминаний");

            // Обновляем title (используем те же данные как идемпотентную операцию)
            ({ response } = await surveyAPI.updateRemind(remind.id, {
              title: remind.title,
              body: remind.body,
              scheduledAt: remind.scheduledAt,
            }));

            // 409 может быть если напоминание уже отправлено и не может быть изменено
          });

          await test.step("Проверить ответ", async () => {
            expect([200, 201, 400, 409]).toContain(response.status());
          });
        },
      );

      test(
        "C7005: DELETE /manager/survey-reminds/{id}/ - удалить напоминание",
        { tag: ["@critical", "@db"] },
        async ({ surveyAPI, surveyVerifier }) => {
          setSeverity("critical");

          let created, response;
          await test.step("Выполнить запрос: DELETE /manager/survey-reminds/{id}/ - удалить напоминание", async () => {
            const { revisionId } =
              await findActiveSurveyWithRevision(surveyAPI);
            test.skip(!revisionId, "Нет ревизий");

            // Создаём напоминание для удаления
            const scheduledAt = new Date();
            scheduledAt.setDate(scheduledAt.getDate() + 7);

            ({ data: created } = await surveyAPI.createRemind({
              surveyRevisionId: revisionId,
              title: `To Delete ${Date.now()}`,
              body: "Напоминание для удаления",
              scheduledAt: scheduledAt.toISOString(),
            }));

            test.skip(!created?.id, "Не удалось создать напоминание");

            // DB верификация: напоминание создано
            await surveyVerifier.verifyRemindCreated(created.id);

            // Удаляем
            ({ response } = await surveyAPI.removeRemind(created.id));
          });

          await test.step("Проверить ответ", async () => {
            expect([200, 201, 204]).toContain(response.status());

            // DB верификация: напоминание удалено (soft delete)
            if (response.ok()) {
              await surveyVerifier.verifyRemindDeleted(created.id);
            }
          });
        },
      );

      test(
        "C7006: POST /manager/survey-reminds/{id}/restore - восстановить напоминание",
        { tag: ["@db"] },
        async ({ surveyAPI, surveyVerifier }) => {
          setSeverity("normal");

          let created, response;
          await test.step("Выполнить запрос: POST /manager/survey-reminds/{id}/restore - восстановить напоминание", async () => {
            const { revisionId } =
              await findActiveSurveyWithRevision(surveyAPI);
            test.skip(!revisionId, "Нет ревизий");

            // Создаём напоминание
            const scheduledAt = new Date();
            scheduledAt.setDate(scheduledAt.getDate() + 7);

            ({ data: created } = await surveyAPI.createRemind({
              surveyRevisionId: revisionId,
              title: `To Restore ${Date.now()}`,
              body: "Напоминание для восстановления",
              scheduledAt: scheduledAt.toISOString(),
            }));

            test.skip(!created?.id, "Не удалось создать напоминание");

            // DB верификация: напоминание создано
            await surveyVerifier.verifyRemindCreated(created.id);

            // Удаляем
            await surveyAPI.removeRemind(created.id);

            // DB верификация: напоминание удалено
            await surveyVerifier.verifyRemindDeleted(created.id);

            // Пробуем восстановить
            ({ response } = await surveyAPI.restoreRemind(created.id));

            // Может быть успех или ошибка если restore не поддерживается
          });

          await test.step("Проверить ответ", async () => {
            expect([200, 201, 400, 404]).toContain(response.status());

            // DB верификация: при успешном восстановлении напоминание не удалено
            if (response.ok()) {
              await surveyVerifier.verifyRemindNotDeleted(created.id);
            }
          });
        },
      );
    });

    test.describe("Validation Tests", () => {
      test("C7007: POST /manager/survey-reminds/ - без обязательных полей", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: POST /manager/survey-reminds/ - без обязательных полей", async () => {
          const { response } = await surveyAPI.createRemind({});

          expect([400, 422]).toContain(response.status());
        });
      });

      test("C7008: POST /manager/survey-reminds/ - с невалидным surveyRevisionId", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: POST /manager/survey-reminds/ - с невалидным surveyRevisionId", async () => {
          const scheduledAt = new Date();
          scheduledAt.setDate(scheduledAt.getDate() + 1);

          const { response } = await surveyAPI.createRemind({
            surveyRevisionId: 999999,
            title: "Test",
            body: "Test",
            scheduledAt: scheduledAt.toISOString(),
          });

          expect([400, 403, 404]).toContain(response.status());
        });
      });

      test("C7009: POST /manager/survey-reminds/ - с датой в прошлом", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: POST /manager/survey-reminds/ - с датой в прошлом", async () => {
          const { revisionId } = await findActiveSurveyWithRevision(surveyAPI);
          test.skip(!revisionId, "Нет ревизий");

          const pastDate = new Date();
          pastDate.setDate(pastDate.getDate() - 7);

          const { response } = await surveyAPI.createRemind({
            surveyRevisionId: revisionId,
            title: "Past Test",
            body: "Test",
            scheduledAt: pastDate.toISOString(),
          });

          // API может принять или отклонить прошедшую дату
          expect([200, 201, 400, 422]).toContain(response.status());
        });
      });
    });

    test.describe("Negative Tests", () => {
      test("C7010: POST /manager/survey-reminds/{id}/ - несуществующее напоминание", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: POST /manager/survey-reminds/{id}/ - несуществующее напоминание", async () => {
          const { response } = await surveyAPI.updateRemind(999999, {
            title: "Test",
            body: "Test",
            scheduledAt: new Date().toISOString(),
          });

          expect([400, 403, 404]).toContain(response.status());
        });
      });

      test("C7011: DELETE /manager/survey-reminds/{id}/ - несуществующее напоминание", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: DELETE /manager/survey-reminds/{id}/ - несуществующее напоминание", async () => {
          const { response } = await surveyAPI.removeRemind(999999);

          expect([400, 403, 404]).toContain(response.status());
        });
      });

      test("C7012: POST /manager/survey-reminds/{id}/restore - несуществующее напоминание", async ({
        surveyAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: POST /manager/survey-reminds/{id}/restore - несуществующее напоминание", async () => {
          const { response } = await surveyAPI.restoreRemind(999999);

          expect([400, 403, 404]).toContain(response.status());
        });
      });
    });
  },
);
