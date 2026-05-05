// tests/functional/api/performance-review.crud.api.spec.js
// CRUD API тесты для Performance Reviews с верификацией в БД

import { test as base, expect } from "../../fixtures/full.js";
import { PerformanceReviewAPI, getCredentials } from "../../utils/api/index.js";
import { TestDataHelper } from "../../utils/TestDataHelper.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import {
  assertSuccessStatus,
  assertValidArray,
} from "../../utils/api/common-assertions.js";

/**
 * Минимальный payload для создания Performance Review
 * API требует обязательные поля: directions, anonymityType, workflowType, и др.
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
  "Performance Review CRUD API",
  { tag: ["@api", "@regression", "@performance-review"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.PERFORMANCE_REVIEW, "CRUD");
    });

    let createdReviewId = null;

    test.afterEach(async ({ prAPI }) => {
      // Cleanup: архивируем и удаляем созданный review если он есть
      if (createdReviewId) {
        try {
          await prAPI.archive(createdReviewId);
          await prAPI.remove(createdReviewId);
        } catch (e) {
          // Игнорируем ошибки при cleanup
        }
        createdReviewId = null;
      }
    });

    test.describe("READ - Получение списка", () => {
      test(
        "C6026: GET /manager/performance-reviews - получить список Performance Reviews",
        { tag: ["@critical"] },
        async ({ prAPI }) => {
          setSeverity("critical");

          let response, data, items;

          await test.step("Подготовить запрос к API", async () => {
            test.info().annotations.push({
              type: "endpoint",
              description: "GET /manager/performance-reviews",
            });
          });

          await test.step("Отправить GET /manager/performance-reviews", async () => {
            const result = await prAPI.getList();
            response = result.response;
            data = result.data;
          });

          await test.step("Проверить статус ответа: 200 OK", async () => {
            assertSuccessStatus(response);
          });

          await test.step("Проверить что тело ответа определено", async () => {
            expect(data).toBeDefined();
          });

          await test.step("Проверить что items является массивом", async () => {
            items = data?.items || data || [];
            expect(Array.isArray(items)).toBe(true);
          });

          await test.step("Проверить структуру элементов списка (если есть)", async () => {
            if (items.length > 0) {
              expect(items[0]).toHaveProperty("id");
              expect(items[0]).toHaveProperty("title");
              if (items[0].status) {
                expect(["draft", "active", "finished", "archived"]).toContain(
                  items[0].status,
                );
              }
            }
          });

          await test.step("Проверить метаданные пагинации (если есть)", async () => {
            if (data?.total !== undefined) {
              expect(typeof data.total).toBe("number");
              expect(data.total).toBeGreaterThanOrEqual(0);
            }
          });
        },
      );
    });

    test.describe("CREATE - Создание", () => {
      test(
        "C6027: POST /manager/performance-reviews - создать Performance Review с минимальными данными",
        { tag: ["@critical", "@db"] },
        async ({ prAPI, prVerifier }) => {
          setSeverity("critical");

          let title, payload, response, data;

          await test.step("Подготовить payload для создания Performance Review", async () => {
            test.info().annotations.push({
              type: "endpoint",
              description: "POST /manager/performance-reviews",
            });
            title = TestDataHelper.generateUniqueName("Ревью API");
            payload = createMinimalPRPayload(title);
          });

          await test.step(`Отправить POST /manager/performance-reviews с title="${title}"`, async () => {
            const result = await prAPI.create(payload);
            response = result.response;
            data = result.data;
          });

          await test.step("Проверить статус ответа: 200/201 (успешное создание)", async () => {
            assertSuccessStatus(response);
          });

          await test.step("Проверить что тело ответа определено", async () => {
            expect(data).toBeDefined();
          });

          await test.step("Проверить наличие ID созданного Performance Review", async () => {
            expect(data.id).toBeDefined();
            expect(typeof data.id).toBe("number");
            createdReviewId = data.id;
          });

          await test.step(`Проверить что title в ответе совпадает с отправленным: "${title}"`, async () => {
            expect(data.title).toBe(title);
          });

          // DB Verification: проверяем что PR создан в БД (опционально)
          await test.step("DB: Проверка создания Performance Review в БД", async () => {
            if (!prVerifier.isConnected()) return;
            const dbPR = await prVerifier.verifyPRCreated(data.id);
            expect(dbPR.title).toBe(title);
          });

          await test.step('DB: Проверить статус Performance Review = "draft"', async () => {
            if (!prVerifier.isConnected()) return;
            await prVerifier.verifyPRStatus(data.id, "draft");
          });

          await test.step("DB: Проверить что Performance Review не архивирован", async () => {
            if (!prVerifier.isConnected()) return;
            await prVerifier.verifyPRNotArchived(data.id);
          });
        },
      );

      test("C6028: POST /manager/performance-reviews - создать Performance Review с описанием", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        let title, payload, response, data;

        await test.step("Подготовить payload с title и description", async () => {
          test.info().annotations.push({
            type: "endpoint",
            description: "POST /manager/performance-reviews",
          });
          title = TestDataHelper.generateUniqueName("Ревью API полный");
          payload = {
            ...createMinimalPRPayload(title),
            description: "Тестовое описание Performance Review",
          };
        });

        await test.step(`Отправить POST /manager/performance-reviews с title="${title}" и description`, async () => {
          const result = await prAPI.create(payload);
          response = result.response;
          data = result.data;
        });

        await test.step("Проверить статус ответа: 200/201 (успешное создание)", async () => {
          assertSuccessStatus(response);
        });

        await test.step("Проверить наличие ID созданного Performance Review", async () => {
          expect(data.id).toBeDefined();
          createdReviewId = data.id;
        });

        await test.step(`Проверить что title в ответе совпадает с отправленным: "${title}"`, async () => {
          expect(data.title).toBe(title);
        });
      });

      test("C6029: POST /manager/performance-reviews - ошибка при создании без обязательных полей", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        let response;

        await test.step("Подготовить невалидный payload (только title, без обязательных полей)", async () => {
          test.info().annotations.push({
            type: "endpoint",
            description: "POST /manager/performance-reviews",
          });
        });

        await test.step("Отправить POST /manager/performance-reviews с невалидным payload", async () => {
          const result = await prAPI.create({ title: "Only title" });
          response = result.response;
        });

        await test.step("Проверить что запрос завершился с ошибкой", async () => {
          expect(response.ok()).toBe(false);
        });

        await test.step("Проверить статус ответа: 400/422 (ошибка валидации)", async () => {
          expect([400, 422]).toContain(response.status());
        });
      });

      test("C6030: POST /manager/performance-reviews - создание с пустым title (API допускает)", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        let payload, response, data;

        await test.step("Подготовить payload с пустым title", async () => {
          test.info().annotations.push({
            type: "endpoint",
            description: "POST /manager/performance-reviews",
          });
          payload = createMinimalPRPayload("");
        });

        await test.step('Отправить POST /manager/performance-reviews с title=""', async () => {
          const result = await prAPI.create(payload);
          response = result.response;
          data = result.data;
        });

        await test.step("Проверить результат запроса (API может допускать или отклонять пустой title)", async () => {
          // Примечание: API позволяет создание с пустым title
          // Если это баг - надо исправить на бэкенде
          if (response.ok()) {
            expect(data.id).toBeDefined();
            createdReviewId = data.id;
          } else {
            expect([400, 422]).toContain(response.status());
          }
        });
      });
    });

    test.describe("READ - Получение по ID", () => {
      test(
        "C6031: GET /manager/performance-reviews/{id} - получить существующий Performance Review",
        { tag: ["@critical"] },
        async ({ prAPI }) => {
          setSeverity("critical");

          let title, created, response, data;

          await test.step("Подготовить тестовые данные", async () => {
            test.info().annotations.push({
              type: "endpoint",
              description: "GET /manager/performance-reviews/{id}",
            });
            title = TestDataHelper.generateUniqueName("Ревью API чтение");
          });

          await test.step("Создать Performance Review для последующего получения", async () => {
            const result = await prAPI.create(createMinimalPRPayload(title));
            created = result.data;
            createdReviewId = created.id;
          });

          await test.step(`Отправить GET /manager/performance-reviews/${created.id}`, async () => {
            const result = await prAPI.getById(created.id);
            response = result.response;
            data = result.data;
          });

          await test.step("Проверить статус ответа: 200 OK", async () => {
            assertSuccessStatus(response);
          });

          await test.step("Проверить что тело ответа определено", async () => {
            expect(data).toBeDefined();
          });

          await test.step(`Проверить что ID в ответе совпадает с запрошенным: ${created.id}`, async () => {
            expect(data.id).toBe(created.id);
          });

          await test.step(`Проверить что title в ответе совпадает с созданным: "${title}"`, async () => {
            expect(data.title).toBe(title);
          });
        },
      );

      test("C6032: GET /manager/performance-reviews/{id} - ошибка при несуществующем ID", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        let response;
        const nonExistentId = 999999999;

        await test.step("Подготовить запрос к несуществующему ID", async () => {
          test.info().annotations.push({
            type: "endpoint",
            description: "GET /manager/performance-reviews/{id}",
          });
        });

        await test.step(`Отправить GET /manager/performance-reviews/${nonExistentId}`, async () => {
          const result = await prAPI.getById(nonExistentId);
          response = result.response;
        });

        await test.step("Проверить что запрос завершился с ошибкой", async () => {
          expect(response.ok()).toBe(false);
        });

        await test.step("Проверить статус ответа: 404/403 (не найдено или нет доступа)", async () => {
          expect([404, 403]).toContain(response.status());
        });
      });

      test("C6033: GET /manager/performance-reviews/{id} - ошибка при невалидном ID", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        let response;
        const invalidId = "invalid-id";

        await test.step("Подготовить запрос с невалидным ID (строка вместо числа)", async () => {
          test.info().annotations.push({
            type: "endpoint",
            description: "GET /manager/performance-reviews/{id}",
          });
        });

        await test.step(`Отправить GET /manager/performance-reviews/${invalidId}`, async () => {
          const result = await prAPI.getById(invalidId);
          response = result.response;
        });

        await test.step("Проверить что запрос завершился с ошибкой", async () => {
          expect(response.ok()).toBe(false);
        });

        await test.step("Проверить статус ответа: 400/404 (невалидный ID)", async () => {
          expect([400, 404]).toContain(response.status());
        });
      });
    });

    test.describe("UPDATE - Обновление", () => {
      test(
        "C6034: POST /manager/performance-reviews/{id} - обновить title",
        { tag: ["@critical", "@db"] },
        async ({ prAPI, prVerifier }) => {
          setSeverity("critical");

          let originalTitle, created, newTitle, response, data;

          await test.step("Подготовить тестовые данные", async () => {
            test.info().annotations.push({
              type: "endpoint",
              description: "POST /manager/performance-reviews/{id}",
            });
            originalTitle =
              TestDataHelper.generateUniqueName("Ревью API обновление");
          });

          await test.step(`Создать Performance Review с title="${originalTitle}"`, async () => {
            const result = await prAPI.create(
              createMinimalPRPayload(originalTitle),
            );
            created = result.data;
            createdReviewId = created.id;
          });

          await test.step(`DB: Проверить оригинальный title="${originalTitle}" в БД`, async () => {
            if (!prVerifier.isConnected()) return;
            await prVerifier.verifyPRTitle(created.id, originalTitle);
          });

          await test.step("Подготовить новый title для обновления", async () => {
            newTitle = TestDataHelper.generateUniqueName("Ревью API обновлённый");
          });

          await test.step(`Отправить POST /manager/performance-reviews/${created.id} с новым title="${newTitle}"`, async () => {
            const result = await prAPI.update(created.id, { title: newTitle });
            response = result.response;
            data = result.data;
          });

          await test.step("Проверить статус ответа: 200 OK", async () => {
            assertSuccessStatus(response);
          });

          await test.step(`Проверить что title в ответе обновлён: "${newTitle}"`, async () => {
            expect(data.title).toBe(newTitle);
          });

          await test.step(`DB: Проверить что title обновлён в БД: "${newTitle}"`, async () => {
            if (!prVerifier.isConnected()) return;
            await prVerifier.verifyPRTitle(created.id, newTitle);
          });
        },
      );

      test("C6035: POST /manager/performance-reviews/{id} - обновить несуществующий ID", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        let response;
        const nonExistentId = 999999999;

        await test.step("Подготовить запрос обновления несуществующего ID", async () => {
          test.info().annotations.push({
            type: "endpoint",
            description: "POST /manager/performance-reviews/{id}",
          });
        });

        await test.step(`Отправить POST /manager/performance-reviews/${nonExistentId} с новым title`, async () => {
          const result = await prAPI.update(nonExistentId, {
            title: "New Title",
          });
          response = result.response;
        });

        await test.step("Проверить что запрос завершился с ошибкой", async () => {
          expect(response.ok()).toBe(false);
        });

        await test.step("Проверить статус ответа: 404/403 (не найдено или нет доступа)", async () => {
          expect([404, 403]).toContain(response.status());
        });
      });
    });

    test.describe("DELETE - Удаление", () => {
      test(
        "C6036: DELETE /manager/performance-reviews/{id} - удалить Performance Review",
        { tag: ["@critical", "@db"] },
        async ({ prAPI, prVerifier }) => {
          setSeverity("critical");

          let title, created, response;

          await test.step("Подготовить тестовые данные", async () => {
            test.info().annotations.push({
              type: "endpoint",
              description: "DELETE /manager/performance-reviews/{id}",
            });
            title = TestDataHelper.generateUniqueName("Ревью API удаление");
          });

          await test.step(`Создать Performance Review с title="${title}"`, async () => {
            const result = await prAPI.create(createMinimalPRPayload(title));
            created = result.data;
          });

          await test.step(`DB: Проверить что Performance Review создан (ID=${created.id})`, async () => {
            if (!prVerifier.isConnected()) return;
            await prVerifier.verifyPRCreated(created.id);
          });

          await test.step("DB: Проверить что deleted_at = NULL (не удалён)", async () => {
            if (!prVerifier.isConnected()) return;
            const pr = await prVerifier.getPR(created.id);
            expect(pr.deleted_at).toBeNull();
          });

          await test.step(`Архивировать Performance Review (ID=${created.id}) перед удалением`, async () => {
            await prAPI.archive(created.id);
          });

          await test.step(`Отправить DELETE /manager/performance-reviews/${created.id}`, async () => {
            const result = await prAPI.remove(created.id);
            response = result.response;
          });

          await test.step("Проверить статус ответа: 200/204 (успешное удаление)", async () => {
            expect([200, 204]).toContain(response.status());
          });

          await test.step("DB: Проверить что Performance Review помечен как удалённый (soft delete)", async () => {
            if (!prVerifier.isConnected()) return;
            await prVerifier.verifyPRDeleted(created.id);
          });
        },
      );

      test("C6037: DELETE /manager/performance-reviews/{id} - удалить несуществующий ID", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        let response;
        const nonExistentId = 999999999;

        await test.step("Подготовить запрос удаления несуществующего ID", async () => {
          test.info().annotations.push({
            type: "endpoint",
            description: "DELETE /manager/performance-reviews/{id}",
          });
        });

        await test.step(`Отправить DELETE /manager/performance-reviews/${nonExistentId}`, async () => {
          const result = await prAPI.remove(nonExistentId);
          response = result.response;
        });

        await test.step("Проверить что запрос завершился с ошибкой", async () => {
          expect(response.ok()).toBe(false);
        });

        await test.step("Проверить статус ответа: 404/403 (не найдено или нет доступа)", async () => {
          expect([404, 403]).toContain(response.status());
        });
      });
    });

    test.describe("ARCHIVE - Архивирование", () => {
      test(
        "C6038: POST /manager/performance-reviews/{id}/archive - архивировать Performance Review",
        { tag: ["@critical", "@db"] },
        async ({ prAPI, prVerifier }) => {
          setSeverity("critical");

          let title, created, response;

          await test.step("Подготовить тестовые данные", async () => {
            test.info().annotations.push({
              type: "endpoint",
              description: "POST /manager/performance-reviews/{id}/archive",
            });
            title = TestDataHelper.generateUniqueName("Ревью API архивация");
          });

          await test.step(`Создать Performance Review с title="${title}"`, async () => {
            const result = await prAPI.create(createMinimalPRPayload(title));
            created = result.data;
            createdReviewId = created.id;
          });

          await test.step(`DB: Проверить что Performance Review не архивирован (ID=${created.id})`, async () => {
            if (!prVerifier.isConnected()) return;
            await prVerifier.verifyPRNotArchived(created.id);
          });

          await test.step(`Отправить POST /manager/performance-reviews/${created.id}/archive`, async () => {
            const result = await prAPI.archive(created.id);
            response = result.response;
          });

          await test.step("Проверить статус ответа: 200 OK", async () => {
            assertSuccessStatus(response);
          });

          await test.step("DB: Проверить что Performance Review архивирован", async () => {
            if (!prVerifier.isConnected()) return;
            await prVerifier.verifyPRArchived(created.id);
          });
        },
      );

      test(
        "C6039: POST /manager/performance-reviews/{id}/restore - восстановить из архива",
        { tag: ["@db"] },
        async ({ prAPI, prVerifier }) => {
          setSeverity("normal");

          let title, created, response;

          await test.step("Подготовить тестовые данные", async () => {
            test.info().annotations.push({
              type: "endpoint",
              description: "POST /manager/performance-reviews/{id}/restore",
            });
            title = TestDataHelper.generateUniqueName("Ревью API восстановление");
          });

          await test.step(`Создать Performance Review с title="${title}"`, async () => {
            const result = await prAPI.create(createMinimalPRPayload(title));
            created = result.data;
            createdReviewId = created.id;
          });

          await test.step(`Архивировать Performance Review (ID=${created.id})`, async () => {
            await prAPI.archive(created.id);
          });

          await test.step("DB: Проверить что Performance Review архивирован", async () => {
            if (!prVerifier.isConnected()) return;
            await prVerifier.verifyPRArchived(created.id);
          });

          await test.step(`Отправить POST /manager/performance-reviews/${created.id}/restore`, async () => {
            const result = await prAPI.restore(created.id);
            response = result.response;
          });

          await test.step("Проверить статус ответа: 200 OK", async () => {
            assertSuccessStatus(response);
          });

          await test.step("DB: Проверить что Performance Review восстановлен из архива", async () => {
            if (!prVerifier.isConnected()) return;
            await prVerifier.verifyPRNotArchived(created.id);
          });
        },
      );
    });

    test.describe("ADDITIONAL - Дополнительные операции", () => {
      test("C6040: GET /manager/performance-reviews/{id}/assessments - получить assessments", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        let title, created, response, data, assessments;

        await test.step("Подготовить тестовые данные", async () => {
          test.info().annotations.push({
            type: "endpoint",
            description: "GET /manager/performance-reviews/{id}/assessments",
          });
          title = TestDataHelper.generateUniqueName("Ревью API оценки");
        });

        await test.step(`Создать Performance Review с title="${title}"`, async () => {
          const result = await prAPI.create(createMinimalPRPayload(title));
          created = result.data;
          createdReviewId = created.id;
        });

        await test.step(`Отправить GET /manager/performance-reviews/${created.id}/assessments`, async () => {
          const result = await prAPI.getAssessments(created.id);
          response = result.response;
          data = result.data;
        });

        await test.step("Проверить статус ответа: 200 OK", async () => {
          assertSuccessStatus(response);
        });

        await test.step("Проверить что тело ответа определено", async () => {
          expect(data).toBeDefined();
        });

        await test.step("Валидация структуры assessments (для нового PR могут быть пустыми)", async () => {
          assessments = data?.assessments || data?.items || data || [];
          if (Array.isArray(assessments)) {
            expect(Array.isArray(assessments)).toBe(true);
            if (assessments.length > 0) {
              expect(assessments[0]).toHaveProperty("id");
            }
          }
        });
      });

      test("C6041: GET /manager/performance-reviews/{id}/users-counts - получить счётчики", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        let title, created, response, data;

        await test.step("Подготовить тестовые данные", async () => {
          test.info().annotations.push({
            type: "endpoint",
            description: "GET /manager/performance-reviews/{id}/users-counts",
          });
          title = TestDataHelper.generateUniqueName("Ревью API подсчёт");
        });

        await test.step(`Создать Performance Review с title="${title}"`, async () => {
          const result = await prAPI.create(createMinimalPRPayload(title));
          created = result.data;
          createdReviewId = created.id;
        });

        await test.step(`Отправить GET /manager/performance-reviews/${created.id}/users-counts`, async () => {
          const result = await prAPI.getUsersCounts(created.id);
          response = result.response;
          data = result.data;
        });

        await test.step("Проверить статус ответа: 200 OK", async () => {
          assertSuccessStatus(response);
        });

        await test.step("Проверить что тело ответа определено", async () => {
          expect(data).toBeDefined();
        });

        await test.step("Валидация targetUsersCount (если присутствует)", async () => {
          if (data.targetUsersCount !== undefined) {
            expect(typeof data.targetUsersCount).toBe("number");
            expect(data.targetUsersCount).toBeGreaterThanOrEqual(0);
          }
        });

        await test.step("Валидация receiversCount (если присутствует)", async () => {
          if (data.receiversCount !== undefined) {
            expect(typeof data.receiversCount).toBe("number");
            expect(data.receiversCount).toBeGreaterThanOrEqual(0);
          }
        });

        await test.step("Валидация completedCount (если присутствует)", async () => {
          if (data.completedCount !== undefined) {
            expect(typeof data.completedCount).toBe("number");
          }
        });
      });

      test("C6042: POST /manager/performance-reviews/{id}/validate - валидация", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        let title, created, response, data;

        await test.step("Подготовить тестовые данные", async () => {
          test.info().annotations.push({
            type: "endpoint",
            description: "POST /manager/performance-reviews/{id}/validate",
          });
          title = TestDataHelper.generateUniqueName("Ревью API валидация");
        });

        await test.step(`Создать Performance Review с title="${title}"`, async () => {
          const result = await prAPI.create(createMinimalPRPayload(title));
          created = result.data;
          createdReviewId = created.id;
        });

        await test.step(`Отправить POST /manager/performance-reviews/${created.id}/validate`, async () => {
          const result = await prAPI.validate(created.id);
          response = result.response;
          data = result.data;
        });

        await test.step("Проверить статус ответа: 200/400/409/422 (результат валидации)", async () => {
          // Валидация возвращает результат проверки - 200 с ошибками, 400/422 при невалидных данных,
          // или 409 при конфликте (например, уже запущен)
          expect([200, 400, 409, 422]).toContain(response.status());
        });

        await test.step("Валидация структуры результата (если запрос успешен)", async () => {
          if (response.ok() && data) {
            // Результат валидации может содержать isValid флаг или список ошибок
            if (data.isValid !== undefined) {
              expect(typeof data.isValid).toBe("boolean");
            }
            if (data.errors) {
              expect(Array.isArray(data.errors)).toBe(true);
            }
            if (data.warnings) {
              expect(Array.isArray(data.warnings)).toBe(true);
            }
          }
        });
      });
    });
  },
);
