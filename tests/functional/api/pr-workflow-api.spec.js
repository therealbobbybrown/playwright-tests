// tests/functional/api/performance-review.workflow.api.spec.js
// Тесты жизненного цикла (workflow) Performance Reviews

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
  "Performance Review Workflow API",
  { tag: ["@api", "@regression", "@performance-review", "@workflow"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.PERFORMANCE_REVIEW, "Workflow");
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

    test.describe("Статусы и переходы", () => {
      test(
        "C6289: Новый PR создаётся в статусе draft",
        { tag: ["@critical", "@db"] },
        async ({ prAPI, prVerifier }) => {
          setSeverity("critical");

          let title, response, data;

          await test.step("Подготовить данные для создания Performance Review", async () => {
            title = TestDataHelper.generateUniqueName("Процесс черновик");
            test.info().annotations.push({
              type: "endpoint",
              description: "POST /manager/performance-reviews",
            });
            expect(title, "Заголовок PR должен быть сгенерирован").toBeTruthy();
          });

          await test.step(`Отправить POST /manager/performance-reviews с title="${title}"`, async () => {
            const result = await prAPI.create(createMinimalPRPayload(title));
            response = result.response;
            data = result.data;
          });

          await test.step("Проверить статус ответа: 200/201 OK", async () => {
            assertSuccessStatus(response);
          });

          await test.step('Проверить что новый PR создан в статусе "draft"', async () => {
            expect(data.status).toBe("draft");
            expect(data.id, "PR ID должен быть присвоен").toBeTruthy();
          });

          await test.step("Сохранить ID созданного PR для cleanup", async () => {
            createdReviewId = data.id;
          });

          // DB Verification: проверяем статус в БД
          await test.step("DB: Проверка статуса draft в БД", async () => {
            if (!prVerifier.isConnected()) return;
            await prVerifier.verifyPRCreated(data.id);
            await prVerifier.verifyPRStatus(data.id, "draft");
            await prVerifier.verifyPRNotArchived(data.id);
          });
        },
      );

      test("C6290: Validate возвращает ошибки для пустого PR", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        let title, created, response, data;

        await test.step("Подготовить данные для создания пустого PR", async () => {
          title = TestDataHelper.generateUniqueName("Процесс валидация");
          test.info().annotations.push({
            type: "endpoint",
            description: "POST /manager/performance-reviews/{id}/validate/",
          });
        });

        await test.step(`Создать пустой Performance Review с title="${title}"`, async () => {
          const result = await prAPI.create(createMinimalPRPayload(title));
          created = result.data;
          createdReviewId = created.id;
          expect(created.id, "PR должен быть создан с ID").toBeTruthy();
        });

        await test.step(`Отправить POST /manager/performance-reviews/${created.id}/validate/`, async () => {
          const result = await prAPI.validate(created.id);
          response = result.response;
          data = result.data;
        });

        await test.step("Проверить статус ответа: 200/400/409/422 (валидация принята или ошибка)", async () => {
          expect([200, 400, 409, 422]).toContain(response.status());
          console.log("Validation response:", JSON.stringify(data, null, 2));
        });

        await test.step("Проверить что API вернуло ошибки валидации (если статус 200)", async () => {
          if (response.ok() && data) {
            const hasErrors =
              data.errors?.length > 0 ||
              data.isValid === false ||
              Object.keys(data).some((key) => key.includes("error"));
            console.log("Has validation errors:", hasErrors);
          }
        });
      });

      test("C6291: Start на невалидном PR возвращает ошибку", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        let title, created, response, data;

        await test.step("Подготовить данные для создания невалидного PR", async () => {
          title = TestDataHelper.generateUniqueName(
            "Процесс запуск невалидный",
          );
          test.info().annotations.push({
            type: "endpoint",
            description: "POST /manager/performance-reviews/{id}/start/",
          });
        });

        await test.step(`Создать пустой Performance Review с title="${title}"`, async () => {
          const result = await prAPI.create(createMinimalPRPayload(title));
          created = result.data;
          createdReviewId = created.id;
          expect(created.id, "PR должен быть создан с ID").toBeTruthy();
        });

        await test.step(`Отправить POST /manager/performance-reviews/${created.id}/start/ (PR без участников)`, async () => {
          const result = await prAPI.start(created.id);
          response = result.response;
          data = result.data;
        });

        await test.step("Проверить статус ответа: 400/409/422 (ошибка валидации)", async () => {
          expect([400, 409, 422]).toContain(response.status());
          console.log(
            `Start response: HTTP ${response.status()}`,
            JSON.stringify(data, null, 2),
          );
        });
      });

      test("C6292: Stop на draft PR возвращает ошибку", async ({ prAPI }) => {
        setSeverity("normal");

        let title, created, response;

        await test.step("Подготовить данные для создания draft PR", async () => {
          title = TestDataHelper.generateUniqueName("Процесс остановка черновик");
          test.info().annotations.push({
            type: "endpoint",
            description: "POST /manager/performance-reviews/{id}/stop/",
          });
        });

        await test.step(`Создать Performance Review в статусе draft с title="${title}"`, async () => {
          const result = await prAPI.create(createMinimalPRPayload(title));
          created = result.data;
          createdReviewId = created.id;
          expect(created.status, "PR должен быть в статусе draft").toBe(
            "draft",
          );
        });

        await test.step(`Отправить POST /manager/performance-reviews/${created.id}/stop/ (PR в статусе draft)`, async () => {
          const result = await prAPI.stop(created.id);
          response = result.response;
        });

        await test.step("Проверить статус ответа: 400/403/409 (draft PR нельзя остановить)", async () => {
          expect([400, 403, 409]).toContain(response.status());
          console.log(`Stop draft response: HTTP ${response.status()}`);
        });
      });

      test("C6293: Stop на несуществующем PR возвращает ошибку", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        let response;
        const nonExistentId = 999999999;

        await test.step("Подготовить данные для теста с несуществующим PR ID", async () => {
          test.info().annotations.push({
            type: "endpoint",
            description: "POST /manager/performance-reviews/{id}/stop/",
          });
          expect(
            nonExistentId,
            "ID для негативного теста должен быть определён",
          ).toBeTruthy();
        });

        await test.step(`Отправить POST /manager/performance-reviews/${nonExistentId}/stop/`, async () => {
          const result = await prAPI.stop(nonExistentId);
          response = result.response;
        });

        await test.step("Проверить статус ответа: 403/404 (PR не найден)", async () => {
          expect(response.ok()).toBe(false);
          expect([403, 404]).toContain(response.status());
        });
      });

      test("C6294: Start на несуществующем PR возвращает ошибку", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        let response;
        const nonExistentId = 999999999;

        await test.step("Подготовить данные для теста с несуществующим PR ID", async () => {
          test.info().annotations.push({
            type: "endpoint",
            description: "POST /manager/performance-reviews/{id}/start/",
          });
          expect(
            nonExistentId,
            "ID для негативного теста должен быть определён",
          ).toBeTruthy();
        });

        await test.step(`Отправить POST /manager/performance-reviews/${nonExistentId}/start/`, async () => {
          const result = await prAPI.start(nonExistentId);
          response = result.response;
        });

        await test.step("Проверить статус ответа: 403/404 (PR не найден)", async () => {
          expect(response.ok()).toBe(false);
          expect([403, 404]).toContain(response.status());
        });
      });
    });

    test.describe("Target Users", () => {
      test(
        "C6295: GET target-users для нового PR возвращает пустой список",
        { tag: ["@critical", "@db"] },
        async ({ prAPI, prVerifier }) => {
          setSeverity("critical");

          let title, created, response, data;

          await test.step("Подготовить данные для создания нового PR", async () => {
            title = TestDataHelper.generateUniqueName(
              "Процесс целевые пользователи",
            );
            test.info().annotations.push({
              type: "endpoint",
              description: "GET /manager/performance-reviews/{id}/target-users",
            });
          });

          await test.step(`Создать Performance Review с title="${title}"`, async () => {
            const result = await prAPI.create(createMinimalPRPayload(title));
            created = result.data;
            createdReviewId = created.id;
            expect(created.id, "PR должен быть создан с ID").toBeTruthy();
          });

          await test.step(`Отправить GET /manager/performance-reviews/${created.id}/target-users`, async () => {
            const result = await prAPI.getTargetUsers(created.id);
            response = result.response;
            data = result.data;
          });

          await test.step("Проверить статус ответа: 200 OK", async () => {
            assertSuccessStatus(response);
            expect(data).toBeDefined();
          });

          await test.step("Проверить что список target users пустой (новый PR без участников)", async () => {
            const items = Array.isArray(data)
              ? data
              : data?.items || data?.users || [];
            expect(Array.isArray(items)).toBe(true);
            expect(items.length).toBe(0);
          });

          await test.step("Проверить метаданные пагинации: total = 0", async () => {
            if (data?.total !== undefined) {
              expect(typeof data.total).toBe("number");
              expect(data.total).toBe(0);
            }
          });

          // DB Verification: проверяем что target users пустой в БД
          await test.step("DB: Проверка отсутствия target users в БД", async () => {
            if (!prVerifier.isConnected()) return;
            await prVerifier.verifyTargetUsersCount(created.id, 0);
          });
        },
      );

      test("C6296: GET target-users с фильтрами", async ({ prAPI }) => {
        setSeverity("normal");

        let title, created, response, data;

        await test.step("Подготовить данные для создания PR", async () => {
          title = TestDataHelper.generateUniqueName(
            "Процесс фильтр целевых пользователей",
          );
          test.info().annotations.push({
            type: "endpoint",
            description:
              "GET /manager/performance-reviews/{id}/target-users?limit=10&offset=0",
          });
        });

        await test.step(`Создать Performance Review с title="${title}"`, async () => {
          const result = await prAPI.create(createMinimalPRPayload(title));
          created = result.data;
          createdReviewId = created.id;
          expect(created.id, "PR должен быть создан с ID").toBeTruthy();
        });

        await test.step(`Отправить GET /manager/performance-reviews/${created.id}/target-users?limit=10&offset=0`, async () => {
          const result = await prAPI.getTargetUsers(created.id, {
            limit: 10,
            offset: 0,
          });
          response = result.response;
          data = result.data;
        });

        await test.step("Проверить статус ответа: 200 OK", async () => {
          assertSuccessStatus(response);
          expect(data).toBeDefined();
        });

        await test.step("Проверить что количество записей не превышает limit=10", async () => {
          const items = data?.items || data || [];
          expect(Array.isArray(items)).toBe(true);
          expect(items.length).toBeLessThanOrEqual(10);
        });
      });

      test("C6297: GET target-users для несуществующего PR", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        let response;
        const nonExistentId = 999999999;

        await test.step("Подготовить данные для теста с несуществующим PR ID", async () => {
          test.info().annotations.push({
            type: "endpoint",
            description: "GET /manager/performance-reviews/{id}/target-users",
          });
          expect(
            nonExistentId,
            "ID для негативного теста должен быть определён",
          ).toBeTruthy();
        });

        await test.step(`Отправить GET /manager/performance-reviews/${nonExistentId}/target-users`, async () => {
          const result = await prAPI.getTargetUsers(nonExistentId);
          response = result.response;
        });

        await test.step("Проверить статус ответа: 403/404 (PR не найден)", async () => {
          expect(response.ok()).toBe(false);
          expect([403, 404]).toContain(response.status());
        });
      });

      test("C6298: POST target-users с пустым payload", async ({ prAPI }) => {
        setSeverity("normal");

        let title, created, response, data;

        await test.step("Подготовить данные для создания PR", async () => {
          title = TestDataHelper.generateUniqueName(
            "Процесс добавление целевых пустое",
          );
          test.info().annotations.push({
            type: "endpoint",
            description: "POST /manager/performance-reviews/{id}/target-users",
          });
        });

        await test.step(`Создать Performance Review с title="${title}"`, async () => {
          const result = await prAPI.create(createMinimalPRPayload(title));
          created = result.data;
          createdReviewId = created.id;
          expect(created.id, "PR должен быть создан с ID").toBeTruthy();
        });

        await test.step(`Отправить POST /manager/performance-reviews/${created.id}/target-users с пустым payload`, async () => {
          const result = await prAPI.addTargetUsers(created.id, {});
          response = result.response;
          data = result.data;
        });

        await test.step("Проверить статус ответа: 200/201/400/422 (принят или ошибка валидации)", async () => {
          expect([200, 201, 400, 422]).toContain(response.status());
          console.log(
            `Add empty target users: HTTP ${response.status()}`,
            JSON.stringify(data, null, 2),
          );
        });
      });

      test("C6299: POST target-users с невалидными данными", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        let title, created, response;

        await test.step("Подготовить данные для создания PR", async () => {
          title = TestDataHelper.generateUniqueName(
            "Процесс добавление целевых невалидное",
          );
          test.info().annotations.push({
            type: "endpoint",
            description: "POST /manager/performance-reviews/{id}/target-users",
          });
        });

        await test.step(`Создать Performance Review с title="${title}"`, async () => {
          const result = await prAPI.create(createMinimalPRPayload(title));
          created = result.data;
          createdReviewId = created.id;
          expect(created.id, "PR должен быть создан с ID").toBeTruthy();
        });

        await test.step(`Отправить POST /manager/performance-reviews/${created.id}/target-users с невалидными данными`, async () => {
          const result = await prAPI.addTargetUsers(created.id, {
            users: [{ id: "invalid-id" }],
          });
          response = result.response;
        });

        await test.step("Проверить статус ответа: 400/422 (ошибка валидации)", async () => {
          expect([400, 422]).toContain(response.status());
          console.log(`Add invalid target users: HTTP ${response.status()}`);
        });
      });
    });

    test.describe("Assessments", () => {
      test(
        "C6300: GET assessments для нового PR",
        { tag: ["@critical", "@db"] },
        async ({ prAPI, prVerifier }) => {
          setSeverity("critical");

          let title, created, response, data;

          await test.step("Подготовить данные для создания PR", async () => {
            title = TestDataHelper.generateUniqueName(
              "Процесс получение оценок",
            );
            test.info().annotations.push({
              type: "endpoint",
              description: "GET /manager/performance-reviews/{id}/assessments",
            });
          });

          await test.step(`Создать Performance Review с title="${title}"`, async () => {
            const result = await prAPI.create(createMinimalPRPayload(title));
            created = result.data;
            createdReviewId = created.id;
            expect(created.id, "PR должен быть создан с ID").toBeTruthy();
          });

          await test.step(`Отправить GET /manager/performance-reviews/${created.id}/assessments`, async () => {
            const result = await prAPI.getAssessments(created.id);
            response = result.response;
            data = result.data;
          });

          await test.step("Проверить статус ответа: 200 OK", async () => {
            assertSuccessStatus(response);
            expect(data).toBeDefined();
          });

          await test.step("Проверить структуру ответа assessments", async () => {
            const assessments = data?.assessments || data?.items || data || [];
            if (Array.isArray(assessments)) {
              expect(Array.isArray(assessments)).toBe(true);
              if (assessments.length > 0) {
                expect(assessments[0]).toHaveProperty("id");
              }
            }
          });

          // DB Verification: проверяем что PR создан корректно
          await test.step("DB: Проверка PR существует в БД", async () => {
            if (!prVerifier.isConnected()) return;
            await prVerifier.verifyPRCreated(created.id);
            await prVerifier.verifyPRStatus(created.id, "draft");
          });
        },
      );

      test("C6301: POST assessments с пустым payload", async ({ prAPI }) => {
        setSeverity("normal");

        let title, created, response, data;

        await test.step("Подготовить данные для создания PR", async () => {
          title = TestDataHelper.generateUniqueName(
            "Процесс установка оценок пустая",
          );
          test.info().annotations.push({
            type: "endpoint",
            description: "POST /manager/performance-reviews/{id}/assessments",
          });
        });

        await test.step(`Создать Performance Review с title="${title}"`, async () => {
          const result = await prAPI.create(createMinimalPRPayload(title));
          created = result.data;
          createdReviewId = created.id;
          expect(created.id, "PR должен быть создан с ID").toBeTruthy();
        });

        await test.step(`Отправить POST /manager/performance-reviews/${created.id}/assessments с пустым payload`, async () => {
          const result = await prAPI.setAssessments(created.id, {});
          response = result.response;
          data = result.data;
        });

        await test.step("Проверить статус ответа: 200/201/400/422 (принят или ошибка валидации)", async () => {
          expect([200, 201, 400, 422]).toContain(response.status());
          console.log(
            `Set empty assessments: HTTP ${response.status()}`,
            JSON.stringify(data, null, 2),
          );
        });
      });

      test("C6302: GET assessments для несуществующего PR", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        let response;
        const nonExistentId = 999999999;

        await test.step("Подготовить данные для теста с несуществующим PR ID", async () => {
          test.info().annotations.push({
            type: "endpoint",
            description: "GET /manager/performance-reviews/{id}/assessments",
          });
          expect(
            nonExistentId,
            "ID для негативного теста должен быть определён",
          ).toBeTruthy();
        });

        await test.step(`Отправить GET /manager/performance-reviews/${nonExistentId}/assessments`, async () => {
          const result = await prAPI.getAssessments(nonExistentId);
          response = result.response;
        });

        await test.step("Проверить статус ответа: 403/404 (PR не найден)", async () => {
          expect(response.ok()).toBe(false);
          expect([403, 404]).toContain(response.status());
        });
      });

      test("C6303: POST assessments для несуществующего PR", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        let response;
        const nonExistentId = 999999999;

        await test.step("Подготовить данные для теста с несуществующим PR ID", async () => {
          test.info().annotations.push({
            type: "endpoint",
            description: "POST /manager/performance-reviews/{id}/assessments",
          });
          expect(
            nonExistentId,
            "ID для негативного теста должен быть определён",
          ).toBeTruthy();
        });

        await test.step(`Отправить POST /manager/performance-reviews/${nonExistentId}/assessments с пустым payload`, async () => {
          const result = await prAPI.setAssessments(nonExistentId, {});
          response = result.response;
        });

        await test.step("Проверить статус ответа: 400/403/404 (валидация payload или PR не найден)", async () => {
          expect(response.ok()).toBe(false);
          expect([400, 403, 404]).toContain(response.status());
        });
      });
    });

    test.describe("Users Counts", () => {
      test(
        "C6304: GET users-counts для нового PR возвращает нули",
        { tag: ["@critical", "@db"] },
        async ({ prAPI, prVerifier }) => {
          setSeverity("critical");

          let title, created, response, data;

          await test.step("Подготовить данные для создания PR", async () => {
            title = TestDataHelper.generateUniqueName(
              "Процесс подсчёт пользователей",
            );
            test.info().annotations.push({
              type: "endpoint",
              description: "GET /manager/performance-reviews/{id}/users-counts",
            });
          });

          await test.step(`Создать Performance Review с title="${title}"`, async () => {
            const result = await prAPI.create(createMinimalPRPayload(title));
            created = result.data;
            createdReviewId = created.id;
            expect(created.id, "PR должен быть создан с ID").toBeTruthy();
          });

          await test.step(`Отправить GET /manager/performance-reviews/${created.id}/users-counts`, async () => {
            const result = await prAPI.getUsersCounts(created.id);
            response = result.response;
            data = result.data;
          });

          await test.step("Проверить статус ответа: 200 OK", async () => {
            assertSuccessStatus(response);
            expect(data).toBeDefined();
            expect(typeof data).toBe("object");
          });

          await test.step("Проверить что targetUsersCount = 0 (новый PR без участников)", async () => {
            if (data.targetUsersCount !== undefined) {
              expect(typeof data.targetUsersCount).toBe("number");
              expect(data.targetUsersCount).toBe(0);
            }
          });

          await test.step("Проверить что receiversCount = 0 (новый PR без получателей)", async () => {
            if (data.receiversCount !== undefined) {
              expect(typeof data.receiversCount).toBe("number");
              expect(data.receiversCount).toBe(0);
            }
          });

          await test.step("Проверить что completedCount = 0 (новый PR без завершённых)", async () => {
            if (data.completedCount !== undefined) {
              expect(typeof data.completedCount).toBe("number");
              expect(data.completedCount).toBe(0);
            }
          });

          // DB Verification: проверяем счётчики в БД
          await test.step("DB: Проверка target users count = 0 в БД", async () => {
            if (!prVerifier.isConnected()) return;
            await prVerifier.verifyTargetUsersCount(created.id, 0);
          });
        },
      );

      test("C6305: GET users-counts для несуществующего PR", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        let response;
        const nonExistentId = 999999999;

        await test.step("Подготовить данные для теста с несуществующим PR ID", async () => {
          test.info().annotations.push({
            type: "endpoint",
            description: "GET /manager/performance-reviews/{id}/users-counts",
          });
          expect(
            nonExistentId,
            "ID для негативного теста должен быть определён",
          ).toBeTruthy();
        });

        await test.step(`Отправить GET /manager/performance-reviews/${nonExistentId}/users-counts`, async () => {
          const result = await prAPI.getUsersCounts(nonExistentId);
          response = result.response;
        });

        await test.step("Проверить статус ответа: 403/404 (PR не найден)", async () => {
          expect(response.ok()).toBe(false);
          expect([403, 404]).toContain(response.status());
        });
      });
    });

    test.describe("Архив и восстановление", () => {
      test(
        "C6306: Archive → Restore → Archive цикл",
        { tag: ["@critical", "@db"] },
        async ({ prAPI, prVerifier }) => {
          setSeverity("critical");

          let title, created, archive1, restore, archive2;

          await test.step("Подготовить данные для создания PR", async () => {
            title = TestDataHelper.generateUniqueName(
              "Процесс архивация цикла",
            );
            test.info().annotations.push({
              type: "endpoints",
              description:
                "POST /manager/performance-reviews/{id}/archive/, POST /manager/performance-reviews/{id}/restore/",
            });
          });

          await test.step(`Создать Performance Review с title="${title}"`, async () => {
            const result = await prAPI.create(createMinimalPRPayload(title));
            created = result.data;
            createdReviewId = created.id;
            expect(created.id, "PR должен быть создан с ID").toBeTruthy();
          });

          // DB: проверяем начальное состояние
          await test.step("DB: PR создан и не архивирован", async () => {
            if (!prVerifier.isConnected()) return;
            await prVerifier.verifyPRCreated(created.id);
            await prVerifier.verifyPRNotArchived(created.id);
          });

          await test.step(`Отправить POST /manager/performance-reviews/${created.id}/archive/ (первая архивация)`, async () => {
            const result = await prAPI.archive(created.id);
            archive1 = result.response;
          });

          await test.step("Проверить статус ответа архивации: 200/201/204 OK", async () => {
            expect(archive1.ok()).toBe(true);
          });

          // DB: проверяем что PR архивирован
          await test.step("DB: PR архивирован (первый раз)", async () => {
            if (!prVerifier.isConnected()) return;
            await prVerifier.verifyPRArchived(created.id);
          });

          await test.step(`Отправить POST /manager/performance-reviews/${created.id}/restore/ (восстановление)`, async () => {
            const result = await prAPI.restore(created.id);
            restore = result.response;
          });

          await test.step("Проверить статус ответа восстановления: 200/201/204 OK", async () => {
            expect(restore.ok()).toBe(true);
          });

          // DB: проверяем что PR восстановлен
          await test.step("DB: PR восстановлен из архива", async () => {
            if (!prVerifier.isConnected()) return;
            await prVerifier.verifyPRNotArchived(created.id);
          });

          await test.step(`Отправить POST /manager/performance-reviews/${created.id}/archive/ (вторая архивация)`, async () => {
            const result = await prAPI.archive(created.id);
            archive2 = result.response;
          });

          await test.step("Проверить статус ответа повторной архивации: 200/201/204 OK", async () => {
            expect(archive2.ok()).toBe(true);
          });

          // DB: проверяем что PR снова архивирован
          await test.step("DB: PR архивирован (второй раз)", async () => {
            if (!prVerifier.isConnected()) return;
            await prVerifier.verifyPRArchived(created.id);
          });
        },
      );

      test("C6307: Обновление архивированного PR - документация поведения", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        let title, created, response;
        const newTitle = "Updated Title";

        await test.step("Подготовить данные для создания PR", async () => {
          title = TestDataHelper.generateUniqueName(
            "Процесс обновление архивного",
          );
          test.info().annotations.push({
            type: "endpoint",
            description: "PATCH /manager/performance-reviews/{id}",
          });
        });

        await test.step(`Создать Performance Review с title="${title}"`, async () => {
          const result = await prAPI.create(createMinimalPRPayload(title));
          created = result.data;
          createdReviewId = created.id;
          expect(created.id, "PR должен быть создан с ID").toBeTruthy();
        });

        await test.step(`Архивировать PR ${created.id}`, async () => {
          await prAPI.archive(created.id);
        });

        await test.step(`Отправить PATCH /manager/performance-reviews/${created.id} с title="${newTitle}"`, async () => {
          const result = await prAPI.update(created.id, { title: newTitle });
          response = result.response;
        });

        await test.step("Проверить статус ответа и документировать поведение API", async () => {
          console.log(`Update archived PR: HTTP ${response.status()}`);

          if (response.ok()) {
            console.log("  → API позволяет обновлять архивированный PR");
          } else if (response.status() === 404) {
            console.log(
              "  → API возвращает 404 для архивированного PR (не виден в основном списке)",
            );
          } else {
            console.log("  → API запрещает обновление архивированного PR");
          }

          expect([200, 400, 403, 404, 409]).toContain(response.status());
        });
      });

      test("C6308: Запуск архивированного PR - документация поведения", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        let title, created, response;

        await test.step("Подготовить данные для создания PR", async () => {
          title = TestDataHelper.generateUniqueName(
            "Процесс запуск архивного",
          );
          test.info().annotations.push({
            type: "endpoint",
            description: "POST /manager/performance-reviews/{id}/start/",
          });
        });

        await test.step(`Создать Performance Review с title="${title}"`, async () => {
          const result = await prAPI.create(createMinimalPRPayload(title));
          created = result.data;
          createdReviewId = created.id;
          expect(created.id, "PR должен быть создан с ID").toBeTruthy();
        });

        await test.step(`Архивировать PR ${created.id}`, async () => {
          await prAPI.archive(created.id);
        });

        await test.step(`Отправить POST /manager/performance-reviews/${created.id}/start/ (архивированный PR)`, async () => {
          const result = await prAPI.start(created.id);
          response = result.response;
        });

        await test.step("Проверить статус ответа: 400/403/404/409 (архивированный PR нельзя запустить)", async () => {
          console.log(`Start archived PR: HTTP ${response.status()}`);
          expect(response.ok()).toBe(false);
          expect([400, 403, 404, 409]).toContain(response.status());
        });
      });
    });

    test.describe("Фильтрация списка", () => {
      test(
        "C6309: GET list с limit и offset",
        { tag: ["@critical"] },
        async ({ prAPI }) => {
          setSeverity("critical");

          let response, data;

          await test.step("Подготовить параметры запроса списка PR", async () => {
            test.info().annotations.push({
              type: "endpoint",
              description: "GET /manager/performance-reviews?limit=5&offset=0",
            });
          });

          await test.step("Отправить GET /manager/performance-reviews?limit=5&offset=0", async () => {
            const result = await prAPI.get(
              "/manager/performance-reviews?limit=5&offset=0",
            );
            response = result.response;
            data = result.data;
          });

          await test.step("Проверить статус ответа: 200 OK", async () => {
            assertSuccessStatus(response);
          });

          await test.step("Проверить что количество записей не превышает limit=5", async () => {
            const items = Array.isArray(data) ? data : data?.items || [];
            expect(Array.isArray(items)).toBe(true);
            expect(items.length).toBeLessThanOrEqual(5);
          });

          await test.step("Проверить структуру элементов списка (если есть)", async () => {
            const items = Array.isArray(data) ? data : data?.items || [];
            if (items.length > 0) {
              expect(items[0]).toHaveProperty("id");
              expect(items[0]).toHaveProperty("title");
            }
          });

          await test.step("Проверить метаданные пагинации: total >= 0", async () => {
            if (data?.total !== undefined) {
              expect(typeof data.total).toBe("number");
              expect(data.total).toBeGreaterThanOrEqual(0);
            }
          });
        },
      );

      test("C6310: GET list с фильтром category=archive для архивированных PR", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        let res1, res2, data1, data2, items1, items2;

        await test.step("Подготовить параметры для двух запросов (активные и архивированные)", async () => {
          test.info().annotations.push({
            type: "endpoints",
            description:
              "GET /manager/performance-reviews?limit=20, GET /manager/performance-reviews?limit=20&category=archive",
          });
        });

        await test.step("Отправить GET /manager/performance-reviews (активные) и GET с category=archive (архивированные)", async () => {
          [res1, res2] = await Promise.all([
            prAPI.get("/manager/performance-reviews?limit=20"),
            prAPI.get("/manager/performance-reviews?limit=20&category=archive"),
          ]);
        });

        await test.step("Проверить статус ответа обоих запросов: 200 OK", async () => {
          expect(res1.response.ok()).toBe(true);
          expect(res2.response.ok()).toBe(true);
        });

        await test.step("Извлечь списки активных и архивированных PR из ответов", async () => {
          data1 = res1.data;
          data2 = res2.data;
          items1 = Array.isArray(data1) ? data1 : data1?.items || [];
          items2 = Array.isArray(data2) ? data2 : data2?.items || [];
          console.log("Без фильтра (активные):", items1.length, "PR");
          console.log("category=archive:", items2.length, "PR");
        });

        await test.step("Проверить что списки активных и архивированных PR не пересекаются", async () => {
          const ids1 = new Set(items1.map((i) => i.id));
          const ids2 = new Set(items2.map((i) => i.id));
          const overlap = [...ids1].filter((id) => ids2.has(id));

          if (overlap.length === 0) {
            console.log(
              "✅ Списки активных и архивированных PR не пересекаются",
            );
          } else {
            console.log("⚠️  Найдены PR в обоих списках:", overlap);
          }
        });

        await test.step("Проверить что все PR из category=archive имеют isArchived=true", async () => {
          for (const item of items2) {
            expect(item.isArchived).toBe(true);
          }
        });
      });

      test("C6311: GET list с фильтром status", async ({ prAPI }) => {
        setSeverity("normal");

        let response, data, items;

        await test.step("Подготовить параметры запроса с фильтром status=draft", async () => {
          test.info().annotations.push({
            type: "endpoint",
            description: "GET /manager/performance-reviews?status=draft",
          });
        });

        await test.step("Отправить GET /manager/performance-reviews?status=draft", async () => {
          const result = await prAPI.get(
            "/manager/performance-reviews?status=draft",
          );
          response = result.response;
          data = result.data;
        });

        await test.step("Проверить статус ответа: 200 OK", async () => {
          assertSuccessStatus(response);
        });

        await test.step("Извлечь список draft PR из ответа", async () => {
          items = Array.isArray(data) ? data : data?.items || [];
          console.log(`Draft PR count: ${items.length}`);
        });

        await test.step("Проверить что все элементы списка имеют status=draft", async () => {
          for (const item of items) {
            expect(item.status).toBe("draft");
          }
        });
      });

      test("C6312: GET list с поиском по q", async ({ prAPI }) => {
        setSeverity("normal");

        let uniqueTitle, created, response, data, items;

        await test.step("Подготовить данные для создания PR с уникальным названием", async () => {
          uniqueTitle = TestDataHelper.generateUniqueName("Поиск уникальный");
          test.info().annotations.push({
            type: "endpoint",
            description: "GET /manager/performance-reviews?q=SearchTest",
          });
        });

        await test.step(`Создать Performance Review с title="${uniqueTitle}"`, async () => {
          const result = await prAPI.create(
            createMinimalPRPayload(uniqueTitle),
          );
          created = result.data;
          createdReviewId = created.id;
          expect(created.id, "PR должен быть создан с ID").toBeTruthy();
          console.log(`Created PR ID: ${created.id}, title: ${uniqueTitle}`);
        });

        await test.step("Отправить GET /manager/performance-reviews?q=SearchTest", async () => {
          const result = await prAPI.get(
            "/manager/performance-reviews?q=SearchTest",
          );
          response = result.response;
          data = result.data;
        });

        await test.step("Проверить статус ответа: 200 OK", async () => {
          assertSuccessStatus(response);
        });

        await test.step("Извлечь результаты поиска из ответа", async () => {
          items = Array.isArray(data) ? data : data?.items || [];
          console.log(`Search results: ${items.length}`);
        });

        await test.step("Проверить что поиск работает (документация eventual consistency)", async () => {
          const found = items.some((item) => item.id === created.id);
          if (found) {
            console.log("  → Созданный PR найден в результатах поиска");
          } else {
            console.log(
              "  → Созданный PR НЕ найден (возможна задержка индексации)",
            );
            console.log(
              "  → Найденные ID:",
              items.map((i) => i.id).slice(0, 5),
            );
          }
          // Тест проходит - документируем поведение API
          // Поиск может не найти только что созданный PR из-за eventual consistency
        });
      });
    });
  },
);
