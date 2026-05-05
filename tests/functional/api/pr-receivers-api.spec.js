// tests/functional/api/performance-review.receivers.api.spec.js
// API тесты для работы с receivers (получателями оценок) в Performance Reviews

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
  "Performance Review Receivers API",
  { tag: ["@api", "@regression", "@performance-review", "@receivers"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.PERFORMANCE_REVIEW, "Receivers");
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

    test.describe("Receiver Users Endpoints", () => {
      test(
        "C6170: GET receiver-users для нового PR возвращает пустой список",
        { tag: ["@critical", "@db"] },
        async ({ prAPI, prVerifier }) => {
          setSeverity("critical");
          const title = TestDataHelper.generateUniqueName(
            "Получатели пустой",
          );
          const { data: created } = await prAPI.create(
            createMinimalPRPayload(title),
          );
          createdReviewId = created.id;

          const { response, data } = await prAPI.getReceiverUsers(created.id);

          assertSuccessStatus(response);
          expect(data).toBeDefined();

          // Валидация структуры ответа
          const items = data?.items || data?.users || data || [];
          expect(Array.isArray(items)).toBe(true);
          expect(items.length).toBe(0);

          // Проверяем наличие метаданных пагинации (если есть)
          if (data?.items !== undefined) {
            expect(
              typeof data.total === "number" || data.total === undefined,
            ).toBe(true);
          }

          // DB Verification: проверяем что PR создан и target users пустой
          await test.step("DB: Проверка PR и отсутствия target users в БД", async () => {
            if (!prVerifier.isConnected()) return;
            await prVerifier.verifyPRCreated(created.id);
            await prVerifier.verifyTargetUsersCount(created.id, 0);
          });
        },
      );

      test("C6171: GET receiver-users с пагинацией", async ({ prAPI }) => {
        setSeverity("normal");

        let response, data;
        await test.step("Выполнить запрос: GET receiver-users с пагинацией", async () => {
          const title = TestDataHelper.generateUniqueName(
            "Получатели пагинация",
          );
          const { data: created } = await prAPI.create(
            createMinimalPRPayload(title),
          );
          createdReviewId = created.id;

          ({ response, data } = await prAPI.getReceiverUsers(created.id, {
            limit: 10,
            offset: 0,
          }));

          assertSuccessStatus(response);
        });

        await test.step("Проверить ответ", async () => {
          expect(data).toBeDefined();

          // Валидация структуры пагинированного ответа
          const items = data?.items || data || [];
          expect(Array.isArray(items)).toBe(true);
          expect(items.length).toBeLessThanOrEqual(10); // limit = 10

          // Проверяем метаданные пагинации
          if (data?.total !== undefined) {
            expect(typeof data.total).toBe("number");
            expect(data.total).toBeGreaterThanOrEqual(0);
          }
        });
      });

      test("C6172: GET receiver-users с поиском", async ({ prAPI }) => {
        setSeverity("normal");

        let response, data;
        await test.step("Выполнить запрос: GET receiver-users с поиском", async () => {
          const title = TestDataHelper.generateUniqueName(
            "Получатели поиск",
          );
          const { data: created } = await prAPI.create(
            createMinimalPRPayload(title),
          );
          createdReviewId = created.id;

          ({ response, data } = await prAPI.getReceiverUsers(created.id, {
            q: "test",
            limit: 10,
          }));

          assertSuccessStatus(response);
        });

        await test.step("Проверить ответ", async () => {
          expect(data).toBeDefined();

          // Валидация структуры результатов поиска
          const items = data?.items || data || [];
          expect(Array.isArray(items)).toBe(true);

          // Если есть результаты - проверяем структуру элемента
          if (items.length > 0) {
            const firstItem = items[0];
            expect(firstItem).toHaveProperty("id");
          }
        });
      });

      test("C6173: GET receiver-users с сортировкой", async ({ prAPI }) => {
        setSeverity("normal");

        let response, data;
        await test.step("Выполнить запрос: GET receiver-users с сортировкой", async () => {
          const title = TestDataHelper.generateUniqueName(
            "Получатели сортировка",
          );
          const { data: created } = await prAPI.create(
            createMinimalPRPayload(title),
          );
          createdReviewId = created.id;

          ({ response, data } = await prAPI.getReceiverUsers(created.id, {
            sortBy: "name",
            sortDirection: "asc",
          }));

          // sortBy может быть невалидным для пустого PR
        });

        await test.step("Проверить ответ", async () => {
          expect([200, 400]).toContain(response.status());

          // При успешном ответе валидируем структуру
          if (response.ok()) {
            expect(data).toBeDefined();
            const items = data?.items || data || [];
            expect(Array.isArray(items)).toBe(true);
          }
        });
      });

      test("C6126: GET receiver-users для несуществующего PR", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: GET receiver-users для несуществующего PR", async () => {
          const { response } = await prAPI.getReceiverUsers(999999999);

          expect(response.ok()).toBe(false);
          expect([403, 404]).toContain(response.status());
        });
      });
    });

    test.describe("Receiver Users Progress", () => {
      test("C6175: POST receiver-users/progress/get для нового PR", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        let response, data;
        await test.step("Выполнить запрос: POST receiver-users/progress/get для нового PR", async () => {
          const title = TestDataHelper.generateUniqueName(
            "Получатели прогресс",
          );
          const { data: created } = await prAPI.create(
            createMinimalPRPayload(title),
          );
          createdReviewId = created.id;

          ({ response, data } = await prAPI.getReceiverUsersProgress(
            created.id,
            {
              revisionId: null,
              usersIds: [],
            },
          ));

          // Без ревизии API может вернуть пустой список (200/201) или ошибку
        });

        await test.step("Проверить ответ", async () => {
          expect([200, 201, 400, 422]).toContain(response.status());

          // При успешном ответе валидируем структуру прогресса
          if (response.ok()) {
            expect(data).toBeDefined();
            // Прогресс может быть массивом или объектом с полями
            if (Array.isArray(data)) {
              data.forEach((item) => {
                expect(item).toHaveProperty("userId");
              });
            } else if (data?.items) {
              expect(Array.isArray(data.items)).toBe(true);
            }
          }
        });
      });

      test("C6176: POST receiver-users/progress/get с невалидным revisionId", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        let response, data;
        await test.step("Выполнить запрос: POST receiver-users/progress/get с невалидным revisionId", async () => {
          const title = TestDataHelper.generateUniqueName(
            "Получатели прогресс невалидный",
          );
          const { data: created } = await prAPI.create(
            createMinimalPRPayload(title),
          );
          createdReviewId = created.id;

          ({ response, data } = await prAPI.getReceiverUsersProgress(
            created.id,
            {
              revisionId: 999999999,
              usersIds: [],
            },
          ));

          // API может вернуть пустой список (201) или ошибку для несуществующей ревизии
          // (500 удалён - серверная ошибка не должна быть ожидаемой)
        });

        await test.step("Проверить ответ", async () => {
          expect([200, 201, 400, 404, 409]).toContain(response.status());

          // При ошибке проверяем структуру сообщения об ошибке
          if (!response.ok() && data) {
            // Ошибка должна содержать информацию о проблеме
            expect(
              data.error || data.message || data.errors || data.detail,
            ).toBeDefined();
          }
        });
      });

      test("C6177: POST receiver-users/progress/get для несуществующего PR", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: POST receiver-users/progress/get для несуществующего PR", async () => {
          const { response } = await prAPI.getReceiverUsersProgress(999999999, {
            revisionId: 1,
            usersIds: [],
          });

          expect(response.ok()).toBe(false);
          expect([400, 403, 404]).toContain(response.status());
        });
      });
    });

    test.describe("Receiver Users Completed Responses", () => {
      test("C6178: POST completed-responses/get для нового PR", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        let response, data;
        await test.step("Выполнить запрос: POST completed-responses/get для нового PR", async () => {
          const title = TestDataHelper.generateUniqueName(
            "Получатели завершённые",
          );
          const { data: created } = await prAPI.create(
            createMinimalPRPayload(title),
          );
          createdReviewId = created.id;

          ({ response, data } = await prAPI.getReceiverUsersCompletedResponses(
            created.id,
            {
              revisionId: null,
              usersIds: [],
            },
          ));

          // Без ревизии API может вернуть ошибку
        });

        await test.step("Проверить ответ", async () => {
          expect([200, 400, 422]).toContain(response.status());

          // При успешном ответе валидируем структуру
          if (response.ok()) {
            expect(data).toBeDefined();
            const responses = Array.isArray(data)
              ? data
              : data?.responses || data?.items || [];
            expect(Array.isArray(responses)).toBe(true);
          }
        });
      });

      test("C6179: POST completed-responses/get с пустыми usersIds", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        let response, data;
        await test.step("Выполнить запрос: POST completed-responses/get с пустыми usersIds", async () => {
          const title = TestDataHelper.generateUniqueName(
            "Получатели завершённые без пользователей",
          );
          const { data: created } = await prAPI.create(
            createMinimalPRPayload(title),
          );
          createdReviewId = created.id;

          ({ response, data } = await prAPI.getReceiverUsersCompletedResponses(
            created.id,
            {
              revisionId: 1,
              usersIds: [],
            },
          ));

          // Пустой список usersIds может быть валидным или нет
          // (500 удалён - серверная ошибка не должна быть ожидаемой)
        });

        await test.step("Проверить ответ", async () => {
          expect([200, 400, 404, 409, 422]).toContain(response.status());

          // При успешном ответе валидируем структуру
          if (response.ok()) {
            expect(data).toBeDefined();
          }
        });
      });

      test("C6180: POST completed-responses/get для несуществующего PR", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: POST completed-responses/get для несуществующего PR", async () => {
          const { response } = await prAPI.getReceiverUsersCompletedResponses(
            999999999,
            {
              revisionId: 1,
              usersIds: [],
            },
          );

          expect(response.ok()).toBe(false);
          expect([400, 403, 404]).toContain(response.status());
        });
      });
    });

    test.describe("Update Receivers", () => {
      test("C6181: POST receivers с пустым payload", async ({ prAPI }) => {
        setSeverity("normal");

        let response;
        await test.step("Выполнить запрос: POST receivers с пустым payload", async () => {
          const title = TestDataHelper.generateUniqueName(
            "Обновление получателей пустое",
          );
          const { data: created } = await prAPI.create(
            createMinimalPRPayload(title),
          );
          createdReviewId = created.id;

          // Пробуем обновить receivers для несуществующего target user
          ({ response } = await prAPI.updateReceivers(created.id, 999999999, {
            directionId: null,
            usersIds: [],
          }));

          console.log(
            `Update receivers for non-existent user: HTTP ${response.status()}`,
          );

          // Должна быть ошибка - target user не существует
        });

        await test.step("Проверить ответ", async () => {
          expect([400, 404, 422]).toContain(response.status());
        });
      });

      test("C6182: POST receivers с невалидным directionId", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        let response;
        await test.step("Выполнить запрос: POST receivers с невалидным directionId", async () => {
          const title = TestDataHelper.generateUniqueName(
            "Обновление получателей невалидное направление",
          );
          const { data: created } = await prAPI.create(
            createMinimalPRPayload(title),
          );
          createdReviewId = created.id;

          ({ response } = await prAPI.updateReceivers(created.id, 1, {
            directionId: 999999999,
            usersIds: [1, 2, 3],
          }));

          console.log(
            `Update receivers with invalid directionId: HTTP ${response.status()}`,
          );

          // API должен вернуть ошибку (500 удалён - серверная ошибка не должна быть ожидаемой)
        });

        await test.step("Проверить ответ", async () => {
          expect([400, 404, 422]).toContain(response.status());
        });
      });

      test("C6183: POST receivers для несуществующего PR", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: POST receivers для несуществующего PR", async () => {
          const { response } = await prAPI.updateReceivers(999999999, 1, {
            directionId: 1,
            usersIds: [1],
          });

          expect(response.ok()).toBe(false);
          expect([400, 403, 404]).toContain(response.status());
        });
      });
    });

    test.describe("Target Users Extended", () => {
      test(
        "C6184: POST target-users/get-for-access для нового PR",
        { tag: ["@critical", "@db"] },
        async ({ prAPI, prVerifier }) => {
          setSeverity("critical");
          const title = TestDataHelper.generateUniqueName(
            "Целевые пользователи доступ",
          );
          const { data: created } = await prAPI.create(
            createMinimalPRPayload(title),
          );
          createdReviewId = created.id;

          const { response, data } = await prAPI.getTargetUsersForAccess(
            created.id,
            {
              limit: 10,
              offset: 0,
            },
          );

          // Для нового PR может вернуть пустой список (201) или ошибку
          expect([200, 201, 400, 422]).toContain(response.status());

          // При успешном ответе валидируем структуру
          if (response.ok()) {
            expect(data).toBeDefined();
            const users = data?.items || data || [];
            expect(Array.isArray(users)).toBe(true);

            // Проверяем структуру элементов (если есть)
            if (users.length > 0) {
              expect(users[0]).toHaveProperty("userId");
            }
          }

          // DB Verification: проверяем что PR создан корректно
          await test.step("DB: Проверка создания PR в БД", async () => {
            if (!prVerifier.isConnected()) return;
            await prVerifier.verifyPRCreated(created.id);
            await prVerifier.verifyPRStatus(created.id, "draft");
          });
        },
      );

      test("C6185: POST target-users/get-for-access с targetUserIds", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        let response, data;
        await test.step("Выполнить запрос: POST target-users/get-for-access с targetUserIds", async () => {
          const title = TestDataHelper.generateUniqueName(
            "Целевые пользователи доступ с ID",
          );
          const { data: created } = await prAPI.create(
            createMinimalPRPayload(title),
          );
          createdReviewId = created.id;

          ({ response, data } = await prAPI.getTargetUsersForAccess(
            created.id,
            {
              targetUserIds: [1, 2, 3],
              performanceReviewRevisionId: null,
            },
          ));

          // targetUserIds могут быть невалидными или вернуть пустой результат (201)
        });

        await test.step("Проверить ответ", async () => {
          expect([200, 201, 400, 404, 422]).toContain(response.status());

          // При успешном ответе валидируем структуру
          if (response.ok()) {
            expect(data).toBeDefined();
          }
        });
      });

      test("C6186: POST target-users/progress/get для нового PR", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        let response, data;
        await test.step("Выполнить запрос: POST target-users/progress/get для нового PR", async () => {
          const title = TestDataHelper.generateUniqueName(
            "Целевые пользователи прогресс",
          );
          const { data: created } = await prAPI.create(
            createMinimalPRPayload(title),
          );
          createdReviewId = created.id;

          ({ response, data } = await prAPI.getTargetUsersProgress(created.id, {
            revisionId: null,
            usersIds: [],
          }));
        });

        await test.step("Проверить ответ", async () => {
          expect([200, 400, 422]).toContain(response.status());

          // При успешном ответе валидируем структуру прогресса
          if (response.ok()) {
            expect(data).toBeDefined();
            const progress = Array.isArray(data) ? data : data?.items || [];
            expect(Array.isArray(progress)).toBe(true);
          }
        });
      });

      test("C6187: POST target-users/skipped-responses/get для нового PR", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        let response, data;
        await test.step("Выполнить запрос: POST target-users/skipped-responses/get для нового PR", async () => {
          const title = TestDataHelper.generateUniqueName(
            "Целевые пользователи пропущенные",
          );
          const { data: created } = await prAPI.create(
            createMinimalPRPayload(title),
          );
          createdReviewId = created.id;

          ({ response, data } = await prAPI.getTargetUsersSkippedResponses(
            created.id,
            {
              revisionId: null,
              usersIds: [],
            },
          ));
        });

        await test.step("Проверить ответ", async () => {
          expect([200, 400, 422]).toContain(response.status());

          // При успешном ответе валидируем структуру
          if (response.ok()) {
            expect(data).toBeDefined();
            const skipped = Array.isArray(data) ? data : data?.items || [];
            expect(Array.isArray(skipped)).toBe(true);
          }
        });
      });

      test("C6188: DELETE target-user для несуществующего user", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: DELETE target-user для несуществующего user", async () => {
          const title = TestDataHelper.generateUniqueName(
            "Удаление целевого пользователя",
          );
          const { data: created } = await prAPI.create(
            createMinimalPRPayload(title),
          );
          createdReviewId = created.id;

          const { response } = await prAPI.deleteTargetUser(
            created.id,
            999999999,
          );

          // Должна быть ошибка - user не существует (409 - конфликт тоже возможен)
          expect([400, 404, 409]).toContain(response.status());
        });
      });

      test("C6189: DELETE target-user для несуществующего PR", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: DELETE target-user для несуществующего PR", async () => {
          const { response } = await prAPI.deleteTargetUser(999999999, 1);

          expect(response.ok()).toBe(false);
          expect([403, 404]).toContain(response.status());
        });
      });
    });

    test.describe("Reviewers Workload", () => {
      test("C6139: GET reviewers-workload для нового PR", async ({ prAPI }) => {
        setSeverity("normal");

        let response, data;
        await test.step("Выполнить запрос: GET reviewers-workload для нового PR", async () => {
          const title = TestDataHelper.generateUniqueName(
            "Нагрузка рецензентов",
          );
          const { data: created } = await prAPI.create(
            createMinimalPRPayload(title),
          );
          createdReviewId = created.id;

          ({ response, data } = await prAPI.getReviewersWorkload(created.id));

          // Для нового PR без участников может вернуть пустой список
        });

        await test.step("Проверить ответ", async () => {
          expect([200, 404]).toContain(response.status());

          // При успешном ответе валидируем структуру нагрузки
          if (response.ok()) {
            expect(data).toBeDefined();
            const workload = Array.isArray(data)
              ? data
              : data?.items || data?.workload || [];
            expect(Array.isArray(workload)).toBe(true);

            // Проверяем структуру элементов нагрузки (если есть)
            if (workload.length > 0) {
              expect(workload[0]).toHaveProperty("reviewerId");
              if (workload[0].assignmentCount !== undefined) {
                expect(typeof workload[0].assignmentCount).toBe("number");
              }
            }
          }
        });
      });

      test("C6191: GET reviewers-workload с пагинацией и поиском", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        let response, data;
        await test.step("Выполнить запрос: GET reviewers-workload с пагинацией и поиском", async () => {
          const title = TestDataHelper.generateUniqueName(
            "Нагрузка рецензентов поиск",
          );
          const { data: created } = await prAPI.create(
            createMinimalPRPayload(title),
          );
          createdReviewId = created.id;

          ({ response, data } = await prAPI.getReviewersWorkload(created.id, {
            q: "test",
            limit: 10,
            offset: 0,
            sortBy: "name",
            sortDirection: "asc",
          }));
        });

        await test.step("Проверить ответ", async () => {
          expect([200, 400, 404]).toContain(response.status());

          // При успешном ответе валидируем пагинацию
          if (response.ok()) {
            expect(data).toBeDefined();
            const items = data?.items || data || [];
            expect(Array.isArray(items)).toBe(true);
            expect(items.length).toBeLessThanOrEqual(10); // limit = 10
          }
        });
      });

      test("C6192: GET reviewers-workload для несуществующего PR", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: GET reviewers-workload для несуществующего PR", async () => {
          const { response } = await prAPI.getReviewersWorkload(999999999);

          expect(response.ok()).toBe(false);
          expect([403, 404]).toContain(response.status());
        });
      });
    });
  },
);
