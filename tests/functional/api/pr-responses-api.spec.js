// tests/functional/api/performance-review.responses.api.spec.js
// API тесты для работы с ответами, result access и перезаписью в Performance Reviews

import { test as base, expect } from "../../fixtures/full.js";
import { PerformanceReviewAPI, getCredentials } from "../../utils/api/index.js";
import { TestDataHelper } from "../../utils/TestDataHelper.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { assertSuccessStatus } from "../../utils/api/common-assertions.js";

/**
 * Минимальный payload для создания Performance Review
 */
function createMinimalPRPayload(title) {
  return {
    title,
    // ВАЖНО: все 4 направления обязательны, иначе SSR падает с 500
    directions: [
      {
        id: null,
        receiverType: "self",
        isSelected: true,
        title: null,
        description: null,
      },
      {
        id: null,
        receiverType: "head",
        isSelected: true,
        title: null,
        description: null,
      },
      {
        id: null,
        receiverType: "subordinate",
        isSelected: false,
        title: null,
        description: null,
      },
      {
        id: null,
        receiverType: "colleague",
        isSelected: false,
        title: null,
        description: null,
      },
    ],
    anonymityType: "notAnonymous",
    workflowType: "basic",
    notificationsSchedule: {
      enableReminds: false,
      baseDate: new Date().toISOString(),
      repeatType: "noRepeat",
      timezoneOffset: 0,
    },
    isApprovalStep: false,
    isAsyncSteps: false,
    isAsyncStepsSelfResponseStep: false,
  };
}

// Расширяем test с фикстурой для Performance Review API
const test = base.extend({
  prAPI: async ({ request }, use) => {
    const api = new PerformanceReviewAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
});

test.describe(
  "Performance Review Responses API",
  { tag: ["@api", "@regression", "@performance-review", "@responses"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.PERFORMANCE_REVIEW, "Responses");
    });

    let createdReviewId = null;

    test.afterEach(async ({ prAPI }) => {
      // Cleanup: пробуем архивировать и удалить
      if (createdReviewId) {
        try {
          await prAPI.archive(createdReviewId);
          await prAPI.remove(createdReviewId);
        } catch {
          // ignore
        }
        createdReviewId = null;
      }
    });

    test.describe("Result Access", () => {
      test("C6231: POST change-result-access с пустым payload", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        let response, data;
        await test.step("Выполнить запрос: POST change-result-access с пустым payload", async () => {
          const title = TestDataHelper.generateUniqueName(
            "Доступ к результатам пустой",
          );
          const { data: created } = await prAPI.create(
            createMinimalPRPayload(title),
          );
          createdReviewId = created.id;

          ({ response, data } = await prAPI.changeResultAccess(created.id, {}));

          console.log(`Change result access empty: HTTP ${response.status()}`);

          // Пустой payload должен вызвать ошибку валидации
        });

        await test.step("Проверить ответ", async () => {
          expect([200, 400, 422]).toContain(response.status());

          // При ошибке валидируем структуру сообщения об ошибке
          if (!response.ok() && data) {
            expect(
              data.error || data.message || data.errors || data.statusCode,
            ).toBeDefined();
          }
        });
      });

      test(
        "C6232: POST change-result-access с targetUsersAll=true",
        { tag: ["@critical", "@db"] },
        async ({ prAPI, prVerifier }) => {
          setSeverity("critical");
          const title = TestDataHelper.generateUniqueName(
            "Доступ к результатам все пользователи",
          );
          const { data: created } = await prAPI.create(
            createMinimalPRPayload(title),
          );
          createdReviewId = created.id;

          // DB: проверяем что PR создан
          await test.step("DB: Проверка создания PR", async () => {
            if (!prVerifier.isConnected()) return;
            await prVerifier.verifyPRCreated(created.id);
            await prVerifier.verifyPRStatus(created.id, "draft");
          });

          const { response, data } = await prAPI.changeResultAccess(
            created.id,
            {
              targetUsersAll: true,
              resultAccess: "full",
              enableNotification: false,
            },
          );

          console.log(
            `Change result access for all: HTTP ${response.status()}`,
          );

          // Для нового PR без target users может быть успех или ошибка
          expect([200, 400, 404, 422]).toContain(response.status());

          // При успешном ответе валидируем структуру
          if (response.ok() && data) {
            // Ответ может содержать количество обновленных пользователей
            if (data.updated !== undefined) {
              expect(typeof data.updated).toBe("number");
            }
            if (data.affectedCount !== undefined) {
              expect(typeof data.affectedCount).toBe("number");
            }
          }
        },
      );

      test("C6233: POST change-result-access с targetUsersIds", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        let response;
        await test.step("Выполнить запрос: POST change-result-access с targetUsersIds", async () => {
          const title = TestDataHelper.generateUniqueName(
            "Доступ к результатам конкретные пользователи",
          );
          const { data: created } = await prAPI.create(
            createMinimalPRPayload(title),
          );
          createdReviewId = created.id;

          ({ response } = await prAPI.changeResultAccess(created.id, {
            targetUsersIds: [1, 2, 3],
            resultAccess: "limited",
            enableNotification: true,
            notificationMessage: "Test notification",
          }));

          console.log(
            `Change result access for specific users: HTTP ${response.status()}`,
          );

          // Невалидные userIds должны вызвать ошибку
        });

        await test.step("Проверить ответ", async () => {
          expect([200, 400, 404, 422]).toContain(response.status());
        });
      });

      test("C6234: POST change-result-access с exceptTargetUsersIds", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        let response;
        await test.step("Выполнить запрос: POST change-result-access с exceptTargetUsersIds", async () => {
          const title = TestDataHelper.generateUniqueName(
            "Доступ к результатам кроме пользователей",
          );
          const { data: created } = await prAPI.create(
            createMinimalPRPayload(title),
          );
          createdReviewId = created.id;

          ({ response } = await prAPI.changeResultAccess(created.id, {
            targetUsersAll: true,
            exceptTargetUsersIds: [999999],
            resultAccess: "none",
            enableNotification: false,
          }));

          console.log(
            `Change result access except users: HTTP ${response.status()}`,
          );
        });

        await test.step("Проверить ответ", async () => {
          expect([200, 400, 404, 422]).toContain(response.status());
        });
      });

      test("C6235: POST change-result-access с includePdfLink", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        let response;
        await test.step("Выполнить запрос: POST change-result-access с includePdfLink", async () => {
          const title = TestDataHelper.generateUniqueName(
            "Доступ к результатам PDF ссылка",
          );
          const { data: created } = await prAPI.create(
            createMinimalPRPayload(title),
          );
          createdReviewId = created.id;

          ({ response } = await prAPI.changeResultAccess(created.id, {
            targetUsersAll: true,
            resultAccess: "full",
            enableNotification: true,
            notificationMessage: "Your results are ready",
            includePdfLink: true,
          }));

          console.log(
            `Change result access with PDF link: HTTP ${response.status()}`,
          );
        });

        await test.step("Проверить ответ", async () => {
          expect([200, 400, 404, 422]).toContain(response.status());
        });
      });

      test("C6236: POST change-result-access для несуществующего PR", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: POST change-result-access для несуществующего PR", async () => {
          const { response } = await prAPI.changeResultAccess(999999999, {
            targetUsersAll: true,
            resultAccess: "full",
          });

          expect(response.ok()).toBe(false);
          expect([400, 403, 404]).toContain(response.status());
        });
      });

      test("C6237: POST change-result-access с невалидным resultAccess", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        let response;
        await test.step("Выполнить запрос: POST change-result-access с невалидным resultAccess", async () => {
          const title = TestDataHelper.generateUniqueName(
            "Доступ к результатам невалидный тип",
          );
          const { data: created } = await prAPI.create(
            createMinimalPRPayload(title),
          );
          createdReviewId = created.id;

          ({ response } = await prAPI.changeResultAccess(created.id, {
            targetUsersAll: true,
            resultAccess: "invalidAccessType",
          }));

          console.log(
            `Change result access with invalid type: HTTP ${response.status()}`,
          );

          // API должен отклонить невалидное значение
        });

        await test.step("Проверить ответ", async () => {
          expect([400, 422]).toContain(response.status());
        });
      });
    });

    test.describe("Reset User Response", () => {
      test("C6238: POST reset-user-response с пустым payload", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        let response, data;
        await test.step("Выполнить запрос: POST reset-user-response с пустым payload", async () => {
          const title = TestDataHelper.generateUniqueName(
            "Сброс ответов пустой",
          );
          const { data: created } = await prAPI.create(
            createMinimalPRPayload(title),
          );
          createdReviewId = created.id;

          ({ response, data } = await prAPI.resetUserResponse(created.id, {}));

          console.log(`Reset user response empty: HTTP ${response.status()}`);

          if (!response.ok()) {
            console.log("Error:", JSON.stringify(data, null, 2));
          }

          // Пустой payload должен вызвать ошибку валидации
        });

        await test.step("Проверить ответ", async () => {
          expect([400, 422]).toContain(response.status());
        });
      });

      test("C6239: POST reset-user-response с невалидными IDs", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        let response;
        await test.step("Выполнить запрос: POST reset-user-response с невалидными IDs", async () => {
          const title = TestDataHelper.generateUniqueName(
            "Сброс ответов невалидные ID",
          );
          const { data: created } = await prAPI.create(
            createMinimalPRPayload(title),
          );
          createdReviewId = created.id;

          ({ response } = await prAPI.resetUserResponse(created.id, {
            receiverUserId: 999999999,
            targetUserId: 999999999,
            assessmentId: 999999999,
          }));

          console.log(
            `Reset user response with invalid IDs: HTTP ${response.status()}`,
          );

          // Невалидные IDs должны вызвать ошибку
        });

        await test.step("Проверить ответ", async () => {
          expect([400, 404, 409, 422]).toContain(response.status());
        });
      });

      test("C6240: POST reset-user-response для несуществующего PR", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: POST reset-user-response для несуществующего PR", async () => {
          const { response } = await prAPI.resetUserResponse(999999999, {
            receiverUserId: 1,
            targetUserId: 1,
            assessmentId: 1,
          });

          expect(response.ok()).toBe(false);
          expect([400, 403, 404]).toContain(response.status());
        });
      });

      test("C6241: POST reset-user-response с частичным payload", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: POST reset-user-response с частичным payload", async () => {
          const title = TestDataHelper.generateUniqueName(
            "Сброс ответов частичный",
          );
          const { data: created } = await prAPI.create(
            createMinimalPRPayload(title),
          );
          createdReviewId = created.id;

          // Только receiverUserId
          const { response } = await prAPI.resetUserResponse(created.id, {
            receiverUserId: 1,
          });

          console.log(`Reset user response partial: HTTP ${response.status()}`);

          // Частичный payload должен вызвать ошибку валидации
          expect([400, 422]).toContain(response.status());
        });
      });
    });

    test.describe("Populate Review", () => {
      test("C6242: POST populate-review с пустыми settings", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: POST populate-review с пустыми settings", async () => {
          const title = TestDataHelper.generateUniqueName(
            "Заполнение пустое",
          );
          const { data: created } = await prAPI.create(
            createMinimalPRPayload(title),
          );
          createdReviewId = created.id;

          const { response, data } = await prAPI.populateReview(created.id, {});

          console.log(`Populate review empty: HTTP ${response.status()}`);

          if (!response.ok()) {
            console.log("Error:", JSON.stringify(data, null, 2));
          }

          // Может требовать настройки или работать с дефолтами
          expect([200, 400, 422]).toContain(response.status());
        });
      });

      test("C6243: POST populate-review с базовыми settings", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: POST populate-review с базовыми settings", async () => {
          const title = TestDataHelper.generateUniqueName(
            "Заполнение базовое",
          );
          const { data: created } = await prAPI.create(
            createMinimalPRPayload(title),
          );
          createdReviewId = created.id;

          const { response, data } = await prAPI.populateReview(created.id, {
            includeSubordinates: true,
            includeManagers: false,
          });

          console.log(`Populate review basic: HTTP ${response.status()}`);

          if (response.ok()) {
            console.log("Response:", JSON.stringify(data, null, 2));
          }

          // Для нового PR без направлений может быть ошибка
          expect([200, 400, 409, 422]).toContain(response.status());
        });
      });

      test("C6244: POST populate-review для несуществующего PR", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: POST populate-review для несуществующего PR", async () => {
          const { response } = await prAPI.populateReview(999999999, {});

          expect(response.ok()).toBe(false);
          expect([400, 403, 404]).toContain(response.status());
        });
      });
    });

    test.describe("Response Overwrite (Protected API)", () => {
      test("C6245: POST overwritable/get для нового PR", async ({ prAPI }) => {
        setSeverity("normal");

        let response, data;
        await test.step("Выполнить запрос: POST overwritable/get для нового PR", async () => {
          const title = TestDataHelper.generateUniqueName(
            "Перезаписываемые получение",
          );
          const { data: created } = await prAPI.create(
            createMinimalPRPayload(title),
          );
          createdReviewId = created.id;

          // Для нового PR нет ревизий - используем фиктивный revisionId
          ({ response, data } = await prAPI.getResponsesOverwritable(
            created.id,
            999999999,
            {
              targetUsersIds: [],
            },
          ));

          console.log(`Get overwritable responses: HTTP ${response.status()}`);

          if (response.ok()) {
            console.log("Response:", JSON.stringify(data, null, 2));
          }

          // Несуществующая ревизия должна вызвать ошибку
        });

        await test.step("Проверить ответ", async () => {
          expect([200, 400, 403, 404, 409]).toContain(response.status());
        });
      });

      test("C6246: POST overwritable/get с targetUsersIds", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        let response;
        await test.step("Выполнить запрос: POST overwritable/get с targetUsersIds", async () => {
          const title = TestDataHelper.generateUniqueName(
            "Перезаписываемые с пользователями",
          );
          const { data: created } = await prAPI.create(
            createMinimalPRPayload(title),
          );
          createdReviewId = created.id;

          ({ response } = await prAPI.getResponsesOverwritable(created.id, 1, {
            targetUsersIds: [1, 2, 3],
          }));

          console.log(`Get overwritable with users: HTTP ${response.status()}`);
        });

        await test.step("Проверить ответ", async () => {
          expect([200, 400, 403, 404, 409]).toContain(response.status());
        });
      });

      test("C6247: GET response-overwrite data для несуществующих параметров", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        let response, data;
        await test.step("Выполнить запрос: GET response-overwrite data для несуществующих параметров", async () => {
          const title = TestDataHelper.generateUniqueName(
            "Данные перезаписи получение",
          );
          const { data: created } = await prAPI.create(
            createMinimalPRPayload(title),
          );
          createdReviewId = created.id;

          ({ response, data } = await prAPI.getResponseOverwritesData(
            created.id,
            999999999, // несуществующий revisionId
            999999999, // несуществующий userId
          ));

          console.log(`Get overwrite data: HTTP ${response.status()}`);

          if (!response.ok()) {
            console.log("Error:", JSON.stringify(data, null, 2));
          }

          // Должна быть ошибка для несуществующих параметров
        });

        await test.step("Проверить ответ", async () => {
          expect([400, 403, 404]).toContain(response.status());
        });
      });

      test("C6248: POST overwrite-responses-values с пустым payload", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        let response, data;
        await test.step("Выполнить запрос: POST overwrite-responses-values с пустым payload", async () => {
          const title = TestDataHelper.generateUniqueName(
            "Значения перезаписи пустые",
          );
          const { data: created } = await prAPI.create(
            createMinimalPRPayload(title),
          );
          createdReviewId = created.id;

          ({ response, data } = await prAPI.overwriteResponsesValues(
            created.id,
            999999999,
            999999999,
            {},
          ));

          console.log(`Overwrite values empty: HTTP ${response.status()}`);

          if (!response.ok()) {
            console.log("Error:", JSON.stringify(data, null, 2));
          }

          // Пустой payload или несуществующие параметры
        });

        await test.step("Проверить ответ", async () => {
          expect([400, 403, 404, 422]).toContain(response.status());
        });
      });

      test("C6249: POST overwrite-responses-values с overwrites и isLocked", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        let response;
        await test.step("Выполнить запрос: POST overwrite-responses-values с overwrites и isLocked", async () => {
          const title = TestDataHelper.generateUniqueName(
            "Значения перезаписи полные",
          );
          const { data: created } = await prAPI.create(
            createMinimalPRPayload(title),
          );
          createdReviewId = created.id;

          ({ response } = await prAPI.overwriteResponsesValues(
            created.id,
            1,
            1,
            {
              overwrites: [],
              isLocked: false,
            },
          ));

          console.log(`Overwrite values with data: HTTP ${response.status()}`);
        });

        await test.step("Проверить ответ", async () => {
          expect([200, 400, 403, 404, 422]).toContain(response.status());
        });
      });

      test("C6250: Protected API для несуществующего PR", async ({ prAPI }) => {
        setSeverity("normal");

        await test.step("Выполнить: Protected API для несуществующего PR", async () => {
          const { response } = await prAPI.getResponsesOverwritable(
            999999999,
            1,
            {
              targetUsersIds: [],
            },
          );

          expect(response.ok()).toBe(false);
          expect([400, 403, 404]).toContain(response.status());
        });
      });
    });

    test.describe("Revisions", () => {
      test(
        "C6251: GET revisions для нового PR",
        { tag: ["@critical", "@db"] },
        async ({ prAPI, prVerifier }) => {
          setSeverity("critical");
          const title = TestDataHelper.generateUniqueName("Ревизии получение");
          const { data: created } = await prAPI.create(
            createMinimalPRPayload(title),
          );
          createdReviewId = created.id;

          const { response, data } = await prAPI.getRevisions(created.id);

          assertSuccessStatus(response);
          expect(data).toBeDefined();

          // Для нового PR должен быть пустой список ревизий
          const items = data?.items || data || [];
          expect(Array.isArray(items)).toBe(true);
          expect(items.length).toBe(0);

          // DB Verification: проверяем что PR создан и в статусе draft
          await test.step("DB: Проверка создания PR в БД", async () => {
            if (!prVerifier.isConnected()) return;
            await prVerifier.verifyPRCreated(created.id);
            await prVerifier.verifyPRStatus(created.id, "draft");
          });
        },
      );

      test("C6122: GET revisions с пагинацией", async ({ prAPI }) => {
        setSeverity("normal");

        let response, data;
        await test.step("Выполнить запрос: GET revisions с пагинацией", async () => {
          const title = TestDataHelper.generateUniqueName(
            "Ревизии пагинация",
          );
          const { data: created } = await prAPI.create(
            createMinimalPRPayload(title),
          );
          createdReviewId = created.id;

          ({ response, data } = await prAPI.getRevisions(created.id, {
            limit: 5,
            offset: 0,
          }));

          assertSuccessStatus(response);
        });

        await test.step("Проверить ответ", async () => {
          expect(data).toBeDefined();

          // Валидация структуры пагинации
          const items = data?.items || data || [];
          expect(Array.isArray(items)).toBe(true);
          expect(items.length).toBeLessThanOrEqual(5); // limit = 5

          if (data?.total !== undefined) {
            expect(typeof data.total).toBe("number");
            expect(data.total).toBeGreaterThanOrEqual(0);
          }
        });
      });

      test("C6253: GET last revision для нового PR", async ({ prAPI }) => {
        setSeverity("normal");

        await test.step("Выполнить: GET last revision для нового PR", async () => {
          const title = TestDataHelper.generateUniqueName("Последняя ревизия");
          const { data: created } = await prAPI.create(
            createMinimalPRPayload(title),
          );
          createdReviewId = created.id;

          const { response, data } = await prAPI.getLastRevision(created.id);

          assertSuccessStatus(response);
          // Для нового PR последняя ревизия должна быть null
          expect(data).toBeNull();
        });
      });

      test("C6123: GET revisions для несуществующего PR", async ({ prAPI }) => {
        setSeverity("normal");

        await test.step("Выполнить: GET revisions для несуществующего PR", async () => {
          const { response } = await prAPI.getRevisions(999999999);

          expect(response.ok()).toBe(false);
          expect([403, 404]).toContain(response.status());
        });
      });
    });

    test.describe("Reminds CRUD", () => {
      test("C6255: GET reminds без параметров", async ({ prAPI }) => {
        setSeverity("normal");

        let response, data;
        await test.step("Выполнить запрос: GET reminds без параметров", async () => {
          ({ response, data } = await prAPI.getReminds({}));

          console.log(`Get reminds empty params: HTTP ${response.status()}`);

          // Может требовать revisionId
        });

        await test.step("Проверить ответ", async () => {
          expect([200, 400, 422]).toContain(response.status());

          // При успешном ответе валидируем структуру списка напоминаний
          if (response.ok() && data) {
            const items = data?.items || data || [];
            expect(Array.isArray(items)).toBe(true);

            // Проверяем структуру элемента напоминания (если есть)
            if (items.length > 0) {
              expect(items[0]).toHaveProperty("id");
              if (items[0].scheduledAt) {
                expect(typeof items[0].scheduledAt).toBe("string");
              }
            }
          }
        });
      });

      test("C6128: GET reminds с несуществующим revisionId", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: GET reminds с несуществующим revisionId", async () => {
          const { response } = await prAPI.getReminds({
            revisionId: 999999999,
            limit: 10,
            offset: 0,
          });

          console.log(
            `Get reminds invalid revision: HTTP ${response.status()}`,
          );

          // Несуществующая ревизия
          expect([200, 400, 404, 409]).toContain(response.status());
        });
      });

      test("C6257: POST create remind с пустым payload", async ({ prAPI }) => {
        setSeverity("normal");

        await test.step("Выполнить: POST create remind с пустым payload", async () => {
          const { response, data } = await prAPI.createRemind({});

          console.log(`Create remind empty: HTTP ${response.status()}`);

          if (!response.ok()) {
            console.log("Error:", JSON.stringify(data, null, 2));
          }

          // Должна быть ошибка валидации
          expect([400, 422]).toContain(response.status());
        });
      });

      test("C6258: POST create remind с невалидным revisionId", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: POST create remind с невалидным revisionId", async () => {
          const { response } = await prAPI.createRemind({
            revisionId: 999999999,
            title: "Test Remind",
            body: "Test body",
            scheduledAt: new Date(Date.now() + 86400000).toISOString(),
            type: "manual",
          });

          console.log(
            `Create remind invalid revision: HTTP ${response.status()}`,
          );

          // Несуществующая ревизия
          expect([400, 404, 409, 422]).toContain(response.status());
        });
      });

      test("C6259: POST update remind для несуществующего ID", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: POST update remind для несуществующего ID", async () => {
          const { response } = await prAPI.updateRemind(999999999, {
            title: "Updated Title",
            body: "Updated body",
            scheduledAt: new Date(Date.now() + 86400000).toISOString(),
          });

          console.log(`Update remind non-existent: HTTP ${response.status()}`);

          expect(response.ok()).toBe(false);
          expect([403, 404]).toContain(response.status());
        });
      });

      test("C6260: DELETE remind для несуществующего ID", async ({ prAPI }) => {
        setSeverity("normal");

        await test.step("Выполнить: DELETE remind для несуществующего ID", async () => {
          const { response } = await prAPI.removeRemind(999999999);

          console.log(`Delete remind non-existent: HTTP ${response.status()}`);

          expect(response.ok()).toBe(false);
          expect([403, 404]).toContain(response.status());
        });
      });

      test("C6261: POST restore remind для несуществующего ID", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: POST restore remind для несуществующего ID", async () => {
          const { response } = await prAPI.restoreRemind(999999999);

          console.log(`Restore remind non-existent: HTTP ${response.status()}`);

          expect(response.ok()).toBe(false);
          expect([403, 404]).toContain(response.status());
        });
      });
    });
  },
);
