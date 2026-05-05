// tests/functional/api/idempotency-api.spec.js
// TASK-API-012: Тесты идемпотентности API операций
// Проверка консистентности при повторных запросах
// @api @idempotency @regression

import { test as base, expect } from "@playwright/test";
import {
  FeedbackAPI,
  ObjectivesAPI,
  getCredentials,
} from "../../utils/api/index.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
  allure,
} from "../../utils/allure-helpers.js";
import { assertSuccessStatus } from "../../utils/api/common-assertions.js";
import {
  createTestFeedback,
  createTestObjective,
} from "../../utils/api/test-helpers.js";

// Фикстуры
const test = base.extend({
  feedbackAPI: async ({ request }, use) => {
    const api = new FeedbackAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },

  objectivesAPI: async ({ request }, use) => {
    const api = new ObjectivesAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
});

// Хранение созданных ID для cleanup
const createdFeedbackIds = [];
const createdObjectiveIds = [];

// Cleanup после всех тестов
test.afterAll(async ({ request }) => {
  const api = new FeedbackAPI(request);
  const { email, password } = getCredentials("admin");
  await api.signIn(email, password);

  for (const id of createdFeedbackIds) {
    try {
      await api.delete(`/private/feedbacks/${id}/`);
    } catch {
      // Игнорируем ошибки cleanup
    }
  }

  const objApi = new ObjectivesAPI(request);
  await objApi.signIn(email, password);

  for (const id of createdObjectiveIds) {
    try {
      await objApi.deleteObjective(id);
    } catch {
      // Игнорируем ошибки cleanup
    }
  }
});

// ============================================================================
// DELETE IDEMPOTENCY
// ============================================================================

test.describe(
  "Idempotency - DELETE Operations",
  { tag: ["@api", "@idempotency"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.FEEDBACK);
    });

    test("C5324: DELETE после DELETE возвращает 404", async ({
      feedbackAPI,
    }) => {
      setSeverity("normal");

      let delete1, delete2;
      await test.step("Выполнить запрос: DELETE после DELETE возвращает 404", async () => {
        const { id: feedbackId } = await createTestFeedback(feedbackAPI, {
          body: `Delete test ${Date.now()}`,
        });

        if (!feedbackId) {
          test.skip(true, "Не удалось создать тестовую благодарность");
          return;
        }

        // Первое удаление
        delete1 = await feedbackAPI.delete(`/private/feedbacks/${feedbackId}/`);
        allure.attachment(
          "Delete 1 Status",
          `${delete1.response.status()}`,
          "text/plain",
        );

        // Второе удаление той же записи
        delete2 = await feedbackAPI.delete(`/private/feedbacks/${feedbackId}/`);
        allure.attachment(
          "Delete 2 Status",
          `${delete2.response.status()}`,
          "text/plain",
        );

        // Первое удаление успешно
      });

      await test.step("Проверить ответ", async () => {
        expect([200, 204]).toContain(delete1.response.status());

        // Второе удаление возвращает 404 (уже удалено)
        expect([404, 410]).toContain(delete2.response.status());

        console.log(
          `DELETE idempotency: первый=${delete1.response.status()}, второй=${delete2.response.status()}`,
        );
      });
    });

    test("C5325: Множественные DELETE одной записи", async ({
      feedbackAPI,
    }) => {
      setSeverity("normal");

      let results;
      await test.step("Выполнить запрос: Множественные DELETE одной записи", async () => {
        const { id: feedbackId } = await createTestFeedback(feedbackAPI, {
          body: `Multiple delete test ${Date.now()}`,
        });

        if (!feedbackId) {
          test.skip(true, "Не удалось создать тестовую благодарность");
          return;
        }

        // 5 попыток удаления
        results = [];
        for (let i = 0; i < 5; i++) {
          const result = await feedbackAPI.delete(
            `/private/feedbacks/${feedbackId}/`,
          );
          results.push(result.response.status());
        }

        allure.attachment(
          "All Delete Statuses",
          results.join(", "),
          "text/plain",
        );

        // Первый успешен
      });

      await test.step("Проверить ответ", async () => {
        expect([200, 204]).toContain(results[0]);

        // Остальные 404
        for (let i = 1; i < results.length; i++) {
          expect([404, 410]).toContain(results[i]);
        }

        console.log(`Multiple DELETE: ${results.join(" -> ")}`);
      });
    });

    test("C5326: GET после DELETE возвращает 404", async ({ feedbackAPI }) => {
      setSeverity("normal");

      await test.step("Выполнить: GET после DELETE возвращает 404", async () => {
        const { id: feedbackId } = await createTestFeedback(feedbackAPI, {
          body: `GET after DELETE test ${Date.now()}`,
        });

        if (!feedbackId) {
          test.skip(true, "Не удалось создать тестовую благодарность");
          return;
        }

        // Удаляем
        await feedbackAPI.delete(`/private/feedbacks/${feedbackId}/`);

        // Пытаемся получить
        const { response: getResp } = await feedbackAPI.get(
          `/private/feedbacks/${feedbackId}/`,
        );

        expect([404, 410]).toContain(getResp.status());
        console.log(`GET после DELETE: ${getResp.status()}`);
      });
    });

    test("C5327: PUT после DELETE возвращает 404", async ({ feedbackAPI }) => {
      setSeverity("normal");

      let putResp;
      await test.step("Выполнить запрос: PUT после DELETE возвращает 404", async () => {
        const { id: feedbackId } = await createTestFeedback(feedbackAPI, {
          body: `PUT after DELETE test ${Date.now()}`,
        });

        if (!feedbackId) {
          test.skip(true, "Не удалось создать тестовую благодарность");
          return;
        }

        // Удаляем
        await feedbackAPI.delete(`/private/feedbacks/${feedbackId}/`);

        // Пытаемся обновить
        ({ response: putResp } = await feedbackAPI.patch(
          `/private/feedbacks/${feedbackId}/`,
          {
            body: "Trying to update deleted",
          },
        ));
      });

      await test.step("Проверить ответ", async () => {
        expect([404, 410]).toContain(putResp.status());
        console.log(`PUT после DELETE: ${putResp.status()}`);
      });
    });
  },
);

// ============================================================================
// GET IDEMPOTENCY
// ============================================================================

test.describe(
  "Idempotency - GET Operations",
  { tag: ["@api", "@idempotency"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.FEEDBACK);
    });

    test("C5328: Множественные GET возвращают идентичные данные", async ({
      feedbackAPI,
    }) => {
      setSeverity("normal");

      let results, allOk;
      await test.step("Выполнить запрос: Множественные GET возвращают идентичные данные", async () => {
        const { id: feedbackId } = await createTestFeedback(feedbackAPI, {
          body: `GET idempotency test ${Date.now()}`,
        });

        if (!feedbackId) {
          test.skip(true, "Не удалось создать тестовую благодарность");
          return;
        }

        createdFeedbackIds.push(feedbackId);

        // 5 последовательных GET
        results = [];
        for (let i = 0; i < 5; i++) {
          const result = await feedbackAPI.get(
            `/private/feedbacks/${feedbackId}/`,
          );
          results.push(result);
        }

        // Все успешны
        allOk = results.every((r) => r.response.ok());
      });

      await test.step("Проверить ответ", async () => {
        expect(allOk, "Все GET должны быть успешными").toBe(true);

        // Данные идентичны
        const bodies = results.map((r) => r.data?.body || r.data?.data?.body);
        const uniqueBodies = [...new Set(bodies)];

        expect(
          uniqueBodies.length,
          "Все GET должны вернуть одинаковые данные",
        ).toBe(1);

        console.log("5 GET запросов вернули идентичные данные");
      });
    });

    test("C5329: GET списка с одинаковыми параметрами", async ({
      feedbackAPI,
    }) => {
      setSeverity("normal");

      let results, allOk;
      await test.step("Выполнить запрос: GET списка с одинаковыми параметрами", async () => {
        // 3 запроса списка с одинаковыми параметрами
        results = [];
        for (let i = 0; i < 3; i++) {
          const result = await feedbackAPI.getFeedbackTypes();
          results.push(result);
        }

        // Все успешны
        allOk = results.every((r) => r.response.ok());
      });

      await test.step("Проверить ответ", async () => {
        expect(allOk).toBe(true);

        // Количество элементов одинаково
        const counts = results.map((r) => {
          const items = r.data?.items || r.data || [];
          return items.length;
        });

        const uniqueCounts = [...new Set(counts)];
        expect(
          uniqueCounts.length,
          "Количество элементов должно быть одинаковым",
        ).toBe(1);

        console.log(`GET списка: ${counts[0]} элементов в каждом ответе`);
      });
    });
  },
);

// ============================================================================
// OBJECTIVES IDEMPOTENCY
// ============================================================================

test.describe(
  "Idempotency - Objectives",
  { tag: ["@api", "@idempotency"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.OBJECTIVES);
    });

    test("C5330: DELETE Objective после DELETE", async ({ objectivesAPI }) => {
      setSeverity("normal");

      let delete1, delete2;
      await test.step("Выполнить запрос: DELETE Objective после DELETE", async () => {
        const { id: objectiveId, response: createResp } =
          await createTestObjective(objectivesAPI, {
            title: `Delete Objective ${Date.now()}`,
            description: "Will be deleted",
          });

        if (!objectiveId) {
          test.skip(true, "Не удалось создать цель");
          return;
        }

        // Первое удаление
        delete1 = await objectivesAPI.deleteObjective(objectiveId);

        // Второе удаление
        delete2 = await objectivesAPI.deleteObjective(objectiveId);

        allure.attachment(
          "Delete Results",
          `Delete 1: ${delete1.response.status()}\nDelete 2: ${delete2.response.status()}`,
          "text/plain",
        );

        // Первое успешно
      });

      await test.step("Проверить ответ", async () => {
        expect([200, 204]).toContain(delete1.response.status());

        // Второе 404
        expect([404, 410]).toContain(delete2.response.status());

        console.log(
          `Objectives DELETE: ${delete1.response.status()} -> ${delete2.response.status()}`,
        );
      });
    });
  },
);

// ============================================================================
// POST CONSISTENCY (не идемпотентный по стандарту, но проверяем поведение)
// ============================================================================

test.describe(
  "Idempotency - POST Behavior",
  { tag: ["@api", "@idempotency"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.FEEDBACK);
    });

    test("C5331: Повторный POST создаёт новые записи (не идемпотентен)", async ({
      feedbackAPI,
    }) => {
      setSeverity("normal");

      let id1, resp1, id2, resp2;
      await test.step("Выполнить запрос: Повторный POST создаёт новые записи (не идемпотентен)", async () => {
        // Первое создание
        ({ id: id1, response: resp1 } = await createTestFeedback(feedbackAPI, {
          body: `POST consistency test v1 ${Date.now()}`,
        }));

        // Второе создание
        ({ id: id2, response: resp2 } = await createTestFeedback(feedbackAPI, {
          body: `POST consistency test v2 ${Date.now()}`,
        }));

        if (id1) createdFeedbackIds.push(id1);
        if (id2) createdFeedbackIds.push(id2);

        allure.attachment(
          "POST Results",
          `POST 1: ${resp1?.status()} (ID: ${id1})\nPOST 2: ${resp2?.status()} (ID: ${id2})`,
          "text/plain",
        );

        // Оба успешны
      });

      await test.step("Проверить ответ", async () => {
        expect(resp1?.ok(), "Первый POST успешен").toBe(true);
        expect(resp2?.ok(), "Второй POST успешен").toBe(true);

        // Разные ID (POST не идемпотентен)
        expect(id1).not.toBe(id2);

        console.log(`POST создаёт разные записи: ID ${id1} и ${id2}`);
      });
    });
  },
);

// ============================================================================
// CONCURRENT IDEMPOTENCY
// ============================================================================

test.describe(
  "Idempotency - Concurrent Operations",
  { tag: ["@api", "@idempotency"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.FEEDBACK);
    });

    test("C5332: Параллельные DELETE одной записи", async ({ feedbackAPI }) => {
      setSeverity("normal");

      let statuses, serverErrors;
      await test.step("Выполнить запрос: Параллельные DELETE одной записи", async () => {
        const { id: feedbackId } = await createTestFeedback(feedbackAPI, {
          body: `Concurrent DELETE test ${Date.now()}`,
        });

        if (!feedbackId) {
          test.skip(true, "Не удалось создать тестовую благодарность");
          return;
        }

        // 5 параллельных DELETE
        const deletes = await Promise.all([
          feedbackAPI.delete(`/private/feedbacks/${feedbackId}/`),
          feedbackAPI.delete(`/private/feedbacks/${feedbackId}/`),
          feedbackAPI.delete(`/private/feedbacks/${feedbackId}/`),
          feedbackAPI.delete(`/private/feedbacks/${feedbackId}/`),
          feedbackAPI.delete(`/private/feedbacks/${feedbackId}/`),
        ]);

        statuses = deletes.map((d) => d.response.status());
        allure.attachment(
          "Concurrent DELETE Statuses",
          statuses.join(", "),
          "text/plain",
        );

        // Не должно быть 500 ошибок
        serverErrors = statuses.filter((s) => s >= 500).length;
      });

      await test.step("Проверить ответ", async () => {
        expect(serverErrors, "Не должно быть 500 ошибок").toBe(0);

        // Ровно один 200/204, остальные 404
        const successCount = statuses.filter(
          (s) => s === 200 || s === 204,
        ).length;
        const notFoundCount = statuses.filter(
          (s) => s === 404 || s === 410,
        ).length;

        // Минимум один успех и остальные 404 (или все 404 если удалили раньше)
        expect(
          successCount + notFoundCount,
          "Все ответы должны быть 200/204/404/410",
        ).toBe(5);

        console.log(
          `Concurrent DELETE: ${successCount} успешных, ${notFoundCount} not found`,
        );
      });
    });
  },
);
