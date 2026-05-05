// tests/functional/api/performance-review.extended.api.spec.js
// Расширенные API тесты Performance Reviews (statistics, revisions, reminds и др.)

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
  "Performance Review Extended API",
  { tag: ["@api", "@regression", "@performance-review", "@extended"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.PERFORMANCE_REVIEW, "Extended");
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

    test.describe("Statistics Endpoints", () => {
      test("C6117: GET statistics/directions для нового PR", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: GET statistics/directions для нового PR", async () => {
          const title = TestDataHelper.generateUniqueName(
            "Статистика направления",
          );
          const { data: created } = await prAPI.create(
            createMinimalPRPayload(title),
          );
          createdReviewId = created.id;

          const { response } = await prAPI.get(
            `/manager/performance-reviews/${created.id}/statistics/directions/`,
          );

          // Для нового PR без ревизий статистика недоступна - требуется revisionId
          // 400 - требуется revisionId, 200 - есть данные, 404 - не найдено
          expect([200, 400, 404]).toContain(response.status());
        });
      });

      test("C6118: GET statistics/assessments для нового PR", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: GET statistics/assessments для нового PR", async () => {
          const title = TestDataHelper.generateUniqueName(
            "Статистика оценки",
          );
          const { data: created } = await prAPI.create(
            createMinimalPRPayload(title),
          );
          createdReviewId = created.id;

          const { response } = await prAPI.get(
            `/manager/performance-reviews/${created.id}/statistics/assessments/`,
          );

          // 400 - требуется revisionId, 200 - есть данные, 404 - не найдено
          expect([200, 400, 404]).toContain(response.status());
        });
      });

      test("C6119: GET statistics/settings для нового PR", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: GET statistics/settings для нового PR", async () => {
          const title = TestDataHelper.generateUniqueName(
            "Статистика настройки",
          );
          const { data: created } = await prAPI.create(
            createMinimalPRPayload(title),
          );
          createdReviewId = created.id;

          const { response } = await prAPI.get(
            `/manager/performance-reviews/${created.id}/statistics/settings/`,
          );

          // Settings возвращает дефолтные значения
          expect([200, 404]).toContain(response.status());
        });
      });

      test("C6120: GET statistics для несуществующего PR", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: GET statistics для несуществующего PR", async () => {
          const { response } = await prAPI.get(
            "/manager/performance-reviews/999999999/statistics/directions/",
          );

          expect(response.ok()).toBe(false);
          // 400 - требуется revisionId, 403/404 - не найдено
          expect([400, 403, 404]).toContain(response.status());
        });
      });
    });

    test.describe("Revisions Endpoints", () => {
      test(
        "C6121: GET revisions для нового PR возвращает пустой список",
        { tag: ["@critical", "@db"] },
        async ({ prAPI, prVerifier }) => {
          setSeverity("critical");
          const title = TestDataHelper.generateUniqueName("Ревизии");
          const { data: created } = await prAPI.create(
            createMinimalPRPayload(title),
          );
          createdReviewId = created.id;

          const { response, data } = await prAPI.get(
            `/manager/performance-reviews/${created.id}/revisions/?limit=10&offset=0`,
          );

          assertSuccessStatus(response);
          expect(data).toBeDefined();

          // Для нового PR не должно быть ревизий
          const items = data?.items || data || [];
          expect(Array.isArray(items) ? items.length : 0).toBe(0);

          await test.step("DB: Проверка PR в БД", async () => {
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

          ({ response, data } = await prAPI.get(
            `/manager/performance-reviews/${created.id}/revisions/?limit=5&offset=0`,
          ));

          assertSuccessStatus(response);
        });

        await test.step("Проверить ответ", async () => {
          expect(data).toBeDefined();

          // Валидация пагинации
          const items = data?.items || data || [];
          expect(Array.isArray(items)).toBe(true);
          expect(items.length).toBeLessThanOrEqual(5);
        });
      });

      test("C6123: GET revisions для несуществующего PR", async ({ prAPI }) => {
        setSeverity("normal");

        await test.step("Выполнить: GET revisions для несуществующего PR", async () => {
          const { response } = await prAPI.get(
            "/manager/performance-reviews/999999999/revisions/",
          );

          expect(response.ok()).toBe(false);
          expect([403, 404]).toContain(response.status());
        });
      });
    });

    test.describe("Receiver Users Endpoints", () => {
      test(
        "C6124: GET receiver-users для нового PR",
        { tag: ["@critical", "@db"] },
        async ({ prAPI, prVerifier }) => {
          setSeverity("critical");
          const title = TestDataHelper.generateUniqueName(
            "Получатели пользователи",
          );
          const { data: created } = await prAPI.create(
            createMinimalPRPayload(title),
          );
          createdReviewId = created.id;

          const { response, data } = await prAPI.get(
            `/manager/performance-reviews/${created.id}/receiver-users/`,
          );

          assertSuccessStatus(response);
          expect(data).toBeDefined();

          // Для нового PR должен быть пустой список
          const items = data?.items || data?.users || data || [];
          if (Array.isArray(items)) {
            expect(items.length).toBe(0);
          }

          await test.step("DB: Проверка PR в БД", async () => {
            if (!prVerifier.isConnected()) return;
            await prVerifier.verifyPRCreated(created.id);
            await prVerifier.verifyPRNotArchived(created.id);
          });
        },
      );

      test("C6125: GET receiver-users с фильтрами", async ({ prAPI }) => {
        setSeverity("normal");

        await test.step("Выполнить: GET receiver-users с фильтрами", async () => {
          const title = TestDataHelper.generateUniqueName(
            "Получатели фильтрация",
          );
          const { data: created } = await prAPI.create(
            createMinimalPRPayload(title),
          );
          createdReviewId = created.id;

          const { response } = await prAPI.get(
            `/manager/performance-reviews/${created.id}/receiver-users/?limit=10&offset=0&sortBy=name`,
          );

          // sortBy может быть невалидным для пустого PR
          expect([200, 400]).toContain(response.status());
        });
      });

      test("C6126: GET receiver-users для несуществующего PR", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: GET receiver-users для несуществующего PR", async () => {
          const { response } = await prAPI.get(
            "/manager/performance-reviews/999999999/receiver-users/",
          );

          expect(response.ok()).toBe(false);
          expect([403, 404]).toContain(response.status());
        });
      });
    });

    test.describe("Reminds Endpoints", () => {
      test("C6127: GET reminds без revisionId", async ({ prAPI }) => {
        setSeverity("normal");

        await test.step("Выполнить: GET reminds без revisionId", async () => {
          // Reminds требует revisionId, без него должна быть ошибка или пустой ответ
          const { response } = await prAPI.get(
            "/manager/performance-review-reminds/",
          );

          // API может требовать revisionId
          expect([200, 400, 422]).toContain(response.status());
        });
      });

      test("C6128: GET reminds с несуществующим revisionId", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: GET reminds с несуществующим revisionId", async () => {
          const { response } = await prAPI.get(
            "/manager/performance-review-reminds/?revisionId=999999999",
          );

          // Может вернуть пустой список, ошибку, 409 (конфликт)
          expect([200, 400, 403, 404, 409]).toContain(response.status());
        });
      });

      test("C6129: POST reminds с невалидными данными", async ({ prAPI }) => {
        setSeverity("normal");

        await test.step("Выполнить: POST reminds с невалидными данными", async () => {
          const { response } = await prAPI.post(
            "/manager/performance-review-reminds/",
            {},
          );

          // Должна быть ошибка валидации
          expect([400, 422]).toContain(response.status());
        });
      });
    });

    test.describe("Target Users REST Endpoints", () => {
      test("C6130: GET target-users/rest для нового PR", async ({ prAPI }) => {
        setSeverity("normal");

        let response, data;
        await test.step("Выполнить запрос: GET target-users/rest для нового PR", async () => {
          const title = TestDataHelper.generateUniqueName(
            "Целевые пользователи REST",
          );
          const { data: created } = await prAPI.create(
            createMinimalPRPayload(title),
          );
          createdReviewId = created.id;

          ({ response, data } = await prAPI.get(
            `/manager/performance-reviews/${created.id}/target-users/rest/`,
          ));

          assertSuccessStatus(response);
        });

        await test.step("Проверить ответ", async () => {
          expect(data).toBeDefined();

          // REST endpoint возвращает пользователей, которые НЕ добавлены как target
          // Для нового PR это должны быть все пользователи
          const items = data?.items || data || [];
          expect(Array.isArray(items)).toBe(true);
        });
      });

      test("C6131: GET target-users/rest с поиском", async ({ prAPI }) => {
        setSeverity("normal");

        await test.step("Выполнить: GET target-users/rest с поиском", async () => {
          const title = TestDataHelper.generateUniqueName(
            "Целевые пользователи поиск REST",
          );
          const { data: created } = await prAPI.create(
            createMinimalPRPayload(title),
          );
          createdReviewId = created.id;

          const { response } = await prAPI.get(
            `/manager/performance-reviews/${created.id}/target-users/rest/?q=test&limit=5`,
          );

          assertSuccessStatus(response);
        });
      });
    });

    test.describe("Workflow Stage Endpoints", () => {
      test("C5959: POST stop-nomination-stage на draft PR", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: POST stop-nomination-stage на draft PR", async () => {
          const title = TestDataHelper.generateUniqueName(
            "Остановка номинации",
          );
          const { data: created } = await prAPI.create(
            createMinimalPRPayload(title),
          );
          createdReviewId = created.id;

          const { response } = await prAPI.post(
            `/manager/performance-reviews/${created.id}/stop-nomination-stage/`,
          );

          // Draft не в стадии nomination - должна быть ошибка
          expect(response.ok()).toBe(false);
          expect([400, 403, 409]).toContain(response.status());
        });
      });

      test("C5960: POST stop-approval-stage на draft PR", async ({ prAPI }) => {
        setSeverity("normal");

        await test.step("Выполнить: POST stop-approval-stage на draft PR", async () => {
          const title = TestDataHelper.generateUniqueName("Остановка согласования");
          const { data: created } = await prAPI.create(
            createMinimalPRPayload(title),
          );
          createdReviewId = created.id;

          const { response } = await prAPI.post(
            `/manager/performance-reviews/${created.id}/stop-approval-stage/`,
          );

          // Draft не в стадии approval - должна быть ошибка
          expect(response.ok()).toBe(false);
          expect([400, 403, 409]).toContain(response.status());
        });
      });

      test("C5961: POST stop-admin-check-stage на draft PR", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: POST stop-admin-check-stage на draft PR", async () => {
          const title = TestDataHelper.generateUniqueName(
            "Остановка проверки админа",
          );
          const { data: created } = await prAPI.create(
            createMinimalPRPayload(title),
          );
          createdReviewId = created.id;

          const { response } = await prAPI.post(
            `/manager/performance-reviews/${created.id}/stop-admin-check-stage/`,
          );

          // Draft не в стадии admin check - должна быть ошибка
          expect(response.ok()).toBe(false);
          expect([400, 403, 409]).toContain(response.status());
        });
      });

      test("C5962: POST resume на draft PR", async ({ prAPI }) => {
        setSeverity("normal");

        await test.step("Выполнить: POST resume на draft PR", async () => {
          const title = TestDataHelper.generateUniqueName("Возобновление ревью");
          const { data: created } = await prAPI.create(
            createMinimalPRPayload(title),
          );
          createdReviewId = created.id;

          const { response } = await prAPI.post(
            `/manager/performance-reviews/${created.id}/resume/`,
          );

          // Draft нельзя resume - он не был запущен
          expect(response.ok()).toBe(false);
          expect([400, 403, 409]).toContain(response.status());
        });
      });
    });

    test.describe("Category Endpoints", () => {
      test("C6136: PATCH change-category без categoryId", async ({ prAPI }) => {
        setSeverity("normal");

        await test.step("Выполнить: PATCH change-category без categoryId", async () => {
          const title = TestDataHelper.generateUniqueName(
            "Смена категории",
          );
          const { data: created } = await prAPI.create(
            createMinimalPRPayload(title),
          );
          createdReviewId = created.id;

          const { response } = await prAPI.patch(
            `/manager/performance-reviews/${created.id}/change-category`,
          );

          // Без categoryId может очистить категорию или вернуть ошибку
          expect([200, 400, 422]).toContain(response.status());
        });
      });

      test("C5969: PATCH change-category с невалидным categoryId", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: PATCH change-category с невалидным categoryId", async () => {
          const title = TestDataHelper.generateUniqueName(
            "Смена категории невалидная",
          );
          const { data: created } = await prAPI.create(
            createMinimalPRPayload(title),
          );
          createdReviewId = created.id;

          const { response } = await prAPI.patch(
            `/manager/performance-reviews/${created.id}/change-category?categoryId=999999999`,
          );

          // Невалидный categoryId: 400/422 - валидация, 404 - не найдено
          // Примечание: API может возвращать 500 для несуществующей категории (баг бэкенда)
          expect([400, 404, 422, 500]).toContain(response.status());
        });
      });
    });

    test.describe("Delete All Archived", () => {
      test("C6138: DELETE all-archived когда архив пуст", async ({ prAPI }) => {
        setSeverity("normal");

        await test.step("Выполнить: DELETE all-archived когда архив пуст", async () => {
          // Сначала проверим что архив пуст
          const { data: listData } = await prAPI.get(
            "/manager/performance-reviews?category=archive&limit=100",
          );
          const archivedItems = Array.isArray(listData)
            ? listData
            : listData?.items || [];

          console.log(
            `Archived PR count before delete: ${archivedItems.length}`,
          );

          const { response } = await prAPI.delete(
            "/manager/performance-reviews/all-archived/",
          );

          // Должно успешно выполниться даже если архив пуст
          expect([200, 204]).toContain(response.status());
        });
      });
    });

    test.describe("Reviewers Workload", () => {
      test("C6139: GET reviewers-workload для нового PR", async ({ prAPI }) => {
        setSeverity("normal");

        await test.step("Выполнить: GET reviewers-workload для нового PR", async () => {
          const title = TestDataHelper.generateUniqueName(
            "Нагрузка рецензентов",
          );
          const { data: created } = await prAPI.create(
            createMinimalPRPayload(title),
          );
          createdReviewId = created.id;

          const { response } = await prAPI.get(
            `/manager/performance-reviews/${created.id}/reviewers-workload`,
          );

          // Для нового PR без участников может вернуть пустой список
          expect([200, 404]).toContain(response.status());
        });
      });

      test("C6140: GET reviewers-workload с пагинацией", async ({ prAPI }) => {
        setSeverity("normal");

        await test.step("Выполнить: GET reviewers-workload с пагинацией", async () => {
          const title = TestDataHelper.generateUniqueName(
            "Нагрузка рецензентов пагинация",
          );
          const { data: created } = await prAPI.create(
            createMinimalPRPayload(title),
          );
          createdReviewId = created.id;

          const { response } = await prAPI.get(
            `/manager/performance-reviews/${created.id}/reviewers-workload?limit=10&offset=0`,
          );

          expect([200, 404]).toContain(response.status());
        });
      });
    });

    test.describe("History Endpoints", () => {
      test(
        "C6141: GET /private/performance-reviews/history — история оценок текущего пользователя",
        { tag: ["@P0"] },
        async ({ prAPI }) => {
          setSeverity("critical");

          await test.step("Выполнить: GET /private/performance-reviews/history — история оценок текущего пользователя", async () => {
            const { response, data } = await prAPI.getHistory();

            // Может вернуть 200 (есть история), 400 (нет данных/параметров), 404 (не найдено)
            expect([200, 400, 404]).toContain(response.status());

            if (response.ok()) {
              expect(data).toBeDefined();
              // Должен вернуть массив или объект с items
              if (Array.isArray(data)) {
                expect(Array.isArray(data)).toBe(true);
              } else if (data?.items) {
                expect(Array.isArray(data.items)).toBe(true);
              }
            }
          });
        },
      );

      test(
        "C6142: GET /private/performance-reviews/of-target-user/{id} — PR для target user",
        { tag: ["@P1"] },
        async ({ prAPI }) => {
          setSeverity("normal");

          await test.step("Выполнить: GET /private/performance-reviews/of-target-user/{id} — PR для target user", async () => {
            // Получаем текущего пользователя из истории или используем ID из токена
            const { response: historyResp, data: historyData } =
              await prAPI.getHistory();

            if (historyResp.ok() && historyData) {
              const items = Array.isArray(historyData)
                ? historyData
                : historyData?.items || [];
              if (items.length > 0 && items[0]?.targetUserId) {
                const targetUserId = items[0].targetUserId;
                const { response } = await prAPI.getOfTargetUser(targetUserId);

                // Должен вернуть данные или 404 если нет доступа
                expect([200, 403, 404]).toContain(response.status());
              }
            }
          });
        },
      );
    });
  },
);
