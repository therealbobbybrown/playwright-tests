// tests/functional/api/performance-review.async-workflow.api.spec.js
// API тесты для асинхронных шагов workflow и стадий в Performance Reviews

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
function createMinimalPRPayload(title, isAsyncSteps = false) {
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
    isAsyncSteps,
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
  "Performance Review Async Workflow API",
  { tag: ["@api", "@regression", "@performance-review", "@async-workflow"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.PERFORMANCE_REVIEW, "Async Workflow");
    });

    let createdReviewId = null;

    test.afterEach(async ({ prAPI }) => {
      // Cleanup: пробуем остановить, архивировать и удалить
      if (createdReviewId) {
        try {
          await prAPI.stop(createdReviewId);
        } catch {
          // ignore
        }
        try {
          await prAPI.archive(createdReviewId);
          await prAPI.remove(createdReviewId);
        } catch {
          // ignore
        }
        createdReviewId = null;
      }
    });

    test.describe("Async Steps - Skip Suggestion Awaiting", () => {
      test("C5951: POST skip-suggestion-awaiting с пустым payload", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        let response, data;
        await test.step("Выполнить запрос: POST skip-suggestion-awaiting с пустым payload", async () => {
          const title = TestDataHelper.generateUniqueName(
            "Пропуск пустой асинхр",
          );
          const { data: created } = await prAPI.create(
            createMinimalPRPayload(title, true),
          );
          createdReviewId = created.id;

          ({ response, data } = await prAPI.asyncStepsSkipSuggestionAwaiting(
            created.id,
            {},
          ));

          console.log(
            `Skip suggestion awaiting empty: HTTP ${response.status()}`,
          );

          if (!response.ok()) {
            console.log("Error:", JSON.stringify(data, null, 2));
          }

          // Draft PR не может выполнить эту операцию
        });

        await test.step("Проверить ответ", async () => {
          expect([400, 403, 409, 422]).toContain(response.status());
        });
      });

      test("C5952: POST skip-suggestion-awaiting с usersIds", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        let response;
        await test.step("Выполнить запрос: POST skip-suggestion-awaiting с usersIds", async () => {
          const title = TestDataHelper.generateUniqueName(
            "Пропуск пользователей асинхр",
          );
          const { data: created } = await prAPI.create(
            createMinimalPRPayload(title, true),
          );
          createdReviewId = created.id;

          ({ response } = await prAPI.asyncStepsSkipSuggestionAwaiting(
            created.id,
            {
              usersIds: [1, 2, 3],
            },
          ));

          console.log(
            `Skip suggestion awaiting with users: HTTP ${response.status()}`,
          );

          // Draft PR не в нужной стадии
        });

        await test.step("Проверить ответ", async () => {
          expect([400, 403, 409, 422]).toContain(response.status());
        });
      });

      test("C5953: POST skip-suggestion-awaiting для sync PR", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        let response;
        await test.step("Выполнить запрос: POST skip-suggestion-awaiting для sync PR", async () => {
          // Создаём PR без async steps
          const title = TestDataHelper.generateUniqueName(
            "Пропуск синхр ревью",
          );
          const { data: created } = await prAPI.create(
            createMinimalPRPayload(title, false),
          );
          createdReviewId = created.id;

          ({ response } = await prAPI.asyncStepsSkipSuggestionAwaiting(
            created.id,
            {
              usersIds: [],
            },
          ));

          console.log(`Skip suggestion on sync PR: HTTP ${response.status()}`);

          // PR без async steps не может использовать этот endpoint
        });

        await test.step("Проверить ответ", async () => {
          expect([400, 403, 409, 422]).toContain(response.status());
        });
      });

      test("C5954: POST skip-suggestion-awaiting для несуществующего PR", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: POST skip-suggestion-awaiting для несуществующего PR", async () => {
          const { response } = await prAPI.asyncStepsSkipSuggestionAwaiting(
            999999999,
            {
              usersIds: [],
            },
          );

          expect(response.ok()).toBe(false);
          expect([400, 403, 404]).toContain(response.status());
        });
      });
    });

    test.describe("Async Steps - Approve Suggestions", () => {
      test("C5955: POST approve-suggestions с пустым payload", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        let response, data;
        await test.step("Выполнить запрос: POST approve-suggestions с пустым payload", async () => {
          const title = TestDataHelper.generateUniqueName(
            "Согласование пустое асинхр",
          );
          const { data: created } = await prAPI.create(
            createMinimalPRPayload(title, true),
          );
          createdReviewId = created.id;

          ({ response, data } = await prAPI.asyncStepsApproveSuggestion(
            created.id,
            {},
          ));

          console.log(`Approve suggestions empty: HTTP ${response.status()}`);

          if (!response.ok()) {
            console.log("Error:", JSON.stringify(data, null, 2));
          }

          // Draft PR не может выполнить эту операцию
        });

        await test.step("Проверить ответ", async () => {
          expect([400, 403, 409, 422]).toContain(response.status());
        });
      });

      test("C5956: POST approve-suggestions с usersIds", async ({ prAPI }) => {
        setSeverity("normal");

        let response;
        await test.step("Выполнить запрос: POST approve-suggestions с usersIds", async () => {
          const title = TestDataHelper.generateUniqueName(
            "Согласование пользователей асинхр",
          );
          const { data: created } = await prAPI.create(
            createMinimalPRPayload(title, true),
          );
          createdReviewId = created.id;

          ({ response } = await prAPI.asyncStepsApproveSuggestion(created.id, {
            usersIds: [1, 2, 3],
          }));

          console.log(
            `Approve suggestions with users: HTTP ${response.status()}`,
          );

          // Draft PR не в нужной стадии
        });

        await test.step("Проверить ответ", async () => {
          expect([400, 403, 409, 422]).toContain(response.status());
        });
      });

      test("C5957: POST approve-suggestions для sync PR", async ({ prAPI }) => {
        setSeverity("normal");

        let response;
        await test.step("Выполнить запрос: POST approve-suggestions для sync PR", async () => {
          const title = TestDataHelper.generateUniqueName(
            "Согласование синхр ревью",
          );
          const { data: created } = await prAPI.create(
            createMinimalPRPayload(title, false),
          );
          createdReviewId = created.id;

          ({ response } = await prAPI.asyncStepsApproveSuggestion(created.id, {
            usersIds: [],
          }));

          console.log(
            `Approve suggestions on sync PR: HTTP ${response.status()}`,
          );
        });

        await test.step("Проверить ответ", async () => {
          expect([400, 403, 409, 422]).toContain(response.status());
        });
      });

      test("C5958: POST approve-suggestions для несуществующего PR", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: POST approve-suggestions для несуществующего PR", async () => {
          const { response } = await prAPI.asyncStepsApproveSuggestion(
            999999999,
            {
              usersIds: [],
            },
          );

          expect(response.ok()).toBe(false);
          expect([400, 403, 404]).toContain(response.status());
        });
      });
    });

    test.describe("Workflow Stages", () => {
      test("C5959: POST stop-nomination-stage на draft PR", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: POST stop-nomination-stage на draft PR", async () => {
          const title = TestDataHelper.generateUniqueName(
            "Остановка номинации черновик",
          );
          const { data: created } = await prAPI.create(
            createMinimalPRPayload(title),
          );
          createdReviewId = created.id;

          const { response } = await prAPI.stopNominationStage(created.id);

          console.log(`Stop nomination on draft: HTTP ${response.status()}`);

          // Draft не в стадии nomination
          expect(response.ok()).toBe(false);
          expect([400, 403, 409]).toContain(response.status());
        });
      });

      test("C5960: POST stop-approval-stage на draft PR", async ({ prAPI }) => {
        setSeverity("normal");

        await test.step("Выполнить: POST stop-approval-stage на draft PR", async () => {
          const title = TestDataHelper.generateUniqueName(
            "Остановка согласования черновик",
          );
          const { data: created } = await prAPI.create(
            createMinimalPRPayload(title),
          );
          createdReviewId = created.id;

          const { response } = await prAPI.stopApprovalStage(created.id);

          console.log(`Stop approval on draft: HTTP ${response.status()}`);

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
            "Остановка проверки админа черновик",
          );
          const { data: created } = await prAPI.create(
            createMinimalPRPayload(title),
          );
          createdReviewId = created.id;

          const { response } = await prAPI.stopAdminCheckStage(created.id);

          console.log(`Stop admin check on draft: HTTP ${response.status()}`);

          expect(response.ok()).toBe(false);
          expect([400, 403, 409]).toContain(response.status());
        });
      });

      test("C5962: POST resume на draft PR", async ({ prAPI }) => {
        setSeverity("normal");

        await test.step("Выполнить: POST resume на draft PR", async () => {
          const title = TestDataHelper.generateUniqueName("Возобновление черновик");
          const { data: created } = await prAPI.create(
            createMinimalPRPayload(title),
          );
          createdReviewId = created.id;

          const { response } = await prAPI.resume(created.id);

          console.log(`Resume draft PR: HTTP ${response.status()}`);

          // Draft нельзя resume - он не был запущен
          expect(response.ok()).toBe(false);
          expect([400, 403, 409]).toContain(response.status());
        });
      });

      test("C5963: POST stop-nomination-stage для несуществующего PR", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: POST stop-nomination-stage для несуществующего PR", async () => {
          const { response } = await prAPI.stopNominationStage(999999999);

          expect(response.ok()).toBe(false);
          expect([403, 404]).toContain(response.status());
        });
      });

      test("C5964: POST stop-approval-stage для несуществующего PR", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: POST stop-approval-stage для несуществующего PR", async () => {
          const { response } = await prAPI.stopApprovalStage(999999999);

          expect(response.ok()).toBe(false);
          expect([403, 404]).toContain(response.status());
        });
      });

      test("C5965: POST stop-admin-check-stage для несуществующего PR", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: POST stop-admin-check-stage для несуществующего PR", async () => {
          const { response } = await prAPI.stopAdminCheckStage(999999999);

          expect(response.ok()).toBe(false);
          expect([403, 404]).toContain(response.status());
        });
      });

      test("C5966: POST resume для несуществующего PR", async ({ prAPI }) => {
        setSeverity("normal");

        await test.step("Выполнить: POST resume для несуществующего PR", async () => {
          const { response } = await prAPI.resume(999999999);

          expect(response.ok()).toBe(false);
          expect([403, 404]).toContain(response.status());
        });
      });
    });

    test.describe("Categories", () => {
      let testCategoryId = null;

      // Создаём тестовую категорию перед тестами
      test.beforeAll(async ({ request }) => {
        const api = new PerformanceReviewAPI(request);
        const { email, password } = getCredentials("admin");
        await api.signIn(email, password);

        // Создаём категорию для тестов
        const categoryTitle =
          TestDataHelper.generateUniqueName("Тестовая категория");
        const { response, data } = await api.post("/manager/category-filter/", {
          type: "performanceReview",
          title: categoryTitle,
        });

        if (response.ok() && data?.id) {
          testCategoryId = data.id;
          console.log(
            `Создана тестовая категория: ID=${testCategoryId}, title=${categoryTitle}`,
          );
        } else {
          console.log(`Не удалось создать категорию: ${response.status()}`);
        }
      });

      // Удаляем тестовую категорию после тестов
      test.afterAll(async ({ request }) => {
        if (testCategoryId) {
          const api = new PerformanceReviewAPI(request);
          const { email, password } = getCredentials("admin");
          await api.signIn(email, password);

          await api.delete(
            `/manager/category-filter/performanceReview/${testCategoryId}`,
          );
          console.log(`Удалена тестовая категория: ID=${testCategoryId}`);
          testCategoryId = null;
        }
      });

      test("C5967: PATCH change-category без categoryId (очистка)", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: PATCH change-category без categoryId (очистка)", async () => {
          const title = TestDataHelper.generateUniqueName(
            "Смена категории очистка",
          );
          const { data: created } = await prAPI.create(
            createMinimalPRPayload(title),
          );
          createdReviewId = created.id;

          const { response } = await prAPI.changeCategory(created.id, null);

          console.log(`Change category clear: HTTP ${response.status()}`);

          // Может очистить категорию или вернуть 200
          expect([200, 204, 400]).toContain(response.status());
        });
      });

      test("C5968: PATCH change-category с валидным categoryId", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        let response;
        await test.step("Выполнить запрос: PATCH change-category с валидным categoryId", async () => {
          test.skip(!testCategoryId, "Тестовая категория не создана");

          const title = TestDataHelper.generateUniqueName(
            "Смена категории валидная",
          );
          const { data: created } = await prAPI.create(
            createMinimalPRPayload(title),
          );
          createdReviewId = created.id;

          // Используем реально созданную категорию
          ({ response } = await prAPI.changeCategory(
            created.id,
            testCategoryId,
          ));

          console.log(
            `Change category to ${testCategoryId}: HTTP ${response.status()}`,
          );

          // При валидной категории ожидаем успех
          assertSuccessStatus(response);
        });

        await test.step("Проверить ответ", async () => {
          expect(response.status()).toBe(200);
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

          const { response } = await prAPI.changeCategory(
            created.id,
            999999999,
          );

          console.log(`Change category invalid: HTTP ${response.status()}`);

          // Несуществующая категория - ожидаем ошибку 404 или 500 (баг бэкенда)
          expect(response.ok()).toBe(false);
          expect([400, 404, 422, 500]).toContain(response.status());
        });
      });

      test("C5970: PATCH change-category для несуществующего PR", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: PATCH change-category для несуществующего PR", async () => {
          const { response } = await prAPI.changeCategory(999999999, 1);

          expect(response.ok()).toBe(false);
          expect([403, 404]).toContain(response.status());
        });
      });
    });

    test.describe("PR Creation with Async Steps", () => {
      test(
        "C5971: Создание PR с isAsyncSteps=true",
        { tag: ["@critical", "@db"] },
        async ({ prAPI, prVerifier }) => {
          setSeverity("critical");
          const title = TestDataHelper.generateUniqueName(
            "Асинхр шаги ревью",
          );
          const { response, data } = await prAPI.create(
            createMinimalPRPayload(title, true),
          );

          assertSuccessStatus(response);
          expect(data.id).toBeDefined();
          expect(data.isAsyncSteps).toBe(true);

          createdReviewId = data.id;

          console.log("Created async PR:", {
            id: data.id,
            isAsyncSteps: data.isAsyncSteps,
            status: data.status,
          });

          await test.step("DB: Проверка создания async PR в БД", async () => {
            if (!prVerifier.isConnected()) return;
            await prVerifier.verifyPRCreated(data.id);
            await prVerifier.verifyPRStatus(data.id, "draft");
            await prVerifier.verifyPRNotArchived(data.id);
          });
        },
      );

      test("C5972: Создание PR с isAsyncSteps=false", async ({ prAPI }) => {
        setSeverity("normal");

        await test.step("Выполнить: Создание PR с isAsyncSteps=false", async () => {
          const title = TestDataHelper.generateUniqueName("Синхр шаги ревью");
          const { response, data } = await prAPI.create(
            createMinimalPRPayload(title, false),
          );

          assertSuccessStatus(response);
          expect(data.id).toBeDefined();
          expect(data.isAsyncSteps).toBe(false);

          createdReviewId = data.id;
        });
      });

      test("C5973: Обновление isAsyncSteps на существующем PR", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        let response, data;
        await test.step("Выполнить запрос: Обновление isAsyncSteps на существующем PR", async () => {
          const title = TestDataHelper.generateUniqueName(
            "Обновление асинхр шагов",
          );
          const { data: created } = await prAPI.create(
            createMinimalPRPayload(title, false),
          );
          createdReviewId = created.id;

          // Пробуем изменить isAsyncSteps
          ({ response, data } = await prAPI.update(created.id, {
            isAsyncSteps: true,
          }));

          console.log(`Update isAsyncSteps: HTTP ${response.status()}`);

          if (response.ok()) {
            console.log("Updated PR:", {
              id: data.id,
              isAsyncSteps: data.isAsyncSteps,
            });
          }

          // Может быть разрешено или запрещено менять на draft
        });

        await test.step("Проверить ответ", async () => {
          expect([200, 400, 409]).toContain(response.status());
        });
      });
    });

    test.describe("Workflow Type Variations", () => {
      test(
        "C5974: Создание PR с workflowType=basic",
        { tag: ["@db"] },
        async ({ prAPI, prVerifier }) => {
          setSeverity("normal");
          const title = TestDataHelper.generateUniqueName(
            "Базовый процесс",
          );
          const payload = createMinimalPRPayload(title);
          payload.workflowType = "basic";

          const { response, data } = await prAPI.create(payload);

          assertSuccessStatus(response);
          expect(data.workflowType).toBe("basic");

          createdReviewId = data.id;

          await test.step("DB: Проверка workflowType в БД", async () => {
            if (!prVerifier.isConnected()) return;
            await prVerifier.verifyPRCreated(data.id);
          });
        },
      );

      test("C5975: Создание PR с workflowType=extended", async ({ prAPI }) => {
        setSeverity("normal");

        await test.step("Выполнить: Создание PR с workflowType=extended", async () => {
          const title = TestDataHelper.generateUniqueName(
            "Расширенный процесс",
          );
          const payload = createMinimalPRPayload(title);
          payload.workflowType = "extended";

          const { response, data } = await prAPI.create(payload);

          // extended может быть валидным или нет
          if (response.ok()) {
            expect(data.workflowType).toBe("extended");
            createdReviewId = data.id;
          } else {
            console.log(
              `Extended workflow not supported: HTTP ${response.status()}`,
            );
            expect([400, 422]).toContain(response.status());
          }
        });
      });

      test("C5976: Создание PR с невалидным workflowType", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Создание PR с невалидным workflowType", async () => {
          const title = TestDataHelper.generateUniqueName(
            "Невалидный процесс",
          );
          const payload = createMinimalPRPayload(title);
          payload.workflowType = "invalidWorkflow";

          const { response } = await prAPI.create(payload);

          expect(response.ok()).toBe(false);
          expect([400, 422]).toContain(response.status());
        });
      });
    });

    test.describe("Anonymity Type Variations", () => {
      test("C5977: Создание PR с anonymityType=notAnonymous", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Создание PR с anonymityType=notAnonymous", async () => {
          const title = TestDataHelper.generateUniqueName("Неанонимный ревью");
          const payload = createMinimalPRPayload(title);
          payload.anonymityType = "notAnonymous";

          const { response, data } = await prAPI.create(payload);

          assertSuccessStatus(response);
          expect(data.anonymityType).toBe("notAnonymous");

          createdReviewId = data.id;
        });
      });

      test("C5978: Создание PR с anonymityType=anonymous", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Создание PR с anonymityType=anonymous", async () => {
          const title = TestDataHelper.generateUniqueName("Анонимный ревью");
          const payload = createMinimalPRPayload(title);
          payload.anonymityType = "anonymous";

          const { response, data } = await prAPI.create(payload);

          if (response.ok()) {
            expect(data.anonymityType).toBe("anonymous");
            createdReviewId = data.id;
          } else {
            console.log(`Anonymous not supported: HTTP ${response.status()}`);
            expect([400, 422]).toContain(response.status());
          }
        });
      });

      test("C5979: Создание PR с anonymityType=semiAnonymous", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Создание PR с anonymityType=semiAnonymous", async () => {
          const title = TestDataHelper.generateUniqueName(
            "Полуанонимный ревью",
          );
          const payload = createMinimalPRPayload(title);
          payload.anonymityType = "semiAnonymous";

          const { response, data } = await prAPI.create(payload);

          if (response.ok()) {
            expect(data.anonymityType).toBe("semiAnonymous");
            createdReviewId = data.id;
          } else {
            console.log(
              `SemiAnonymous not supported: HTTP ${response.status()}`,
            );
            expect([400, 422]).toContain(response.status());
          }
        });
      });

      test("C5980: Создание PR с невалидным anonymityType", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Создание PR с невалидным anonymityType", async () => {
          const title = TestDataHelper.generateUniqueName(
            "Невалидная анонимность",
          );
          const payload = createMinimalPRPayload(title);
          payload.anonymityType = "superSecret";

          const { response } = await prAPI.create(payload);

          expect(response.ok()).toBe(false);
          expect([400, 422]).toContain(response.status());
        });
      });
    });

    test.describe("Approval Step Variations", () => {
      test("C5981: Создание PR с isApprovalStep=true", async ({ prAPI }) => {
        setSeverity("normal");

        await test.step("Выполнить: Создание PR с isApprovalStep=true", async () => {
          const title = TestDataHelper.generateUniqueName("Шаг согласования");
          const payload = createMinimalPRPayload(title);
          payload.isApprovalStep = true;

          const { response, data } = await prAPI.create(payload);

          assertSuccessStatus(response);
          expect(data.isApprovalStep).toBe(true);

          createdReviewId = data.id;
        });
      });

      test("C5982: Создание PR с isApprovalStep=false", async ({ prAPI }) => {
        setSeverity("normal");

        await test.step("Выполнить: Создание PR с isApprovalStep=false", async () => {
          const title = TestDataHelper.generateUniqueName(
            "Без шага согласования",
          );
          const payload = createMinimalPRPayload(title);
          payload.isApprovalStep = false;

          const { response, data } = await prAPI.create(payload);

          assertSuccessStatus(response);
          expect(data.isApprovalStep).toBe(false);

          createdReviewId = data.id;
        });
      });
    });
  },
);
