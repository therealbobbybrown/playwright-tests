// tests/functional/api/concurrency/parallel-operations.spec.js
// TASK-API-009: Тесты конкурентности
// Тесты параллельных операций для проверки стабильности API
// @api @concurrency @regression

import { test, expect } from "../../../fixtures/api.js";
import {
  markAsAPITest,
  setSeverity,
  allure,
  MODULES,
} from "../../../utils/allure-helpers.js";
import { assertSuccessStatus } from "../../../utils/api/common-assertions.js";
import {
  getThanksTypeId,
  getTargetUserId,
  getCurrentUserId,
  getCurrentPeriod,
  safeDeleteFeedback,
  safeDeleteObjective,
} from "../../../utils/api/test-helpers.js";

// ============================================================================
// FEEDBACK CONCURRENCY TESTS
// ============================================================================

test.describe(
  "Concurrency - Feedback",
  { tag: ["@api", "@concurrency"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.FEEDBACK, "Concurrency");
    });

    // Хранилище для cleanup
    const createdFeedbackIds = [];

    test.afterEach(async ({ feedbackAPI }) => {
      // Cleanup созданных благодарностей
      for (const id of createdFeedbackIds) {
        await safeDeleteFeedback(feedbackAPI, id);
      }
      createdFeedbackIds.length = 0;
    });

    test("C4777: Параллельное создание благодарностей", async ({
      feedbackAPI,
    }) => {
      setSeverity("critical");

      let successCount, serverErrors;
      await test.step("Выполнить запрос: Параллельное создание благодарностей", async () => {
        const feedbackTypeId = await getThanksTypeId(feedbackAPI);
        const targetUserId = await getTargetUserId(feedbackAPI);

        if (!feedbackTypeId || !targetUserId) {
          test.skip();
          return;
        }

        const timestamp = Date.now();
        const createPayload = (index) => ({
          body: `Concurrent Feedback ${timestamp} - ${index}`,
          targets: [{ targetType: "user", entityId: targetUserId }],
          feedbackTypeId,
          userAccessType: "selective",
          usersWithAccess: [],
        });

        // Параллельное создание 5 благодарностей
        const results = await Promise.all([
          feedbackAPI.create(createPayload(1)),
          feedbackAPI.create(createPayload(2)),
          feedbackAPI.create(createPayload(3)),
          feedbackAPI.create(createPayload(4)),
          feedbackAPI.create(createPayload(5)),
        ]);

        // Собираем ID для cleanup
        for (const { data } of results) {
          if (data?.id) createdFeedbackIds.push(data.id);
        }

        // Логируем результаты
        const statuses = results.map((r) => r.response.status());
        allure.attachment(
          "Response Statuses",
          JSON.stringify(statuses),
          "application/json",
        );

        // Проверяем результаты
        successCount = results.filter((r) => r.response.ok()).length;
        serverErrors = results.filter((r) => r.response.status() >= 500).length;

        allure.attachment("Success Count", `${successCount}/5`, "text/plain");
        allure.attachment("Server Errors", `${serverErrors}`, "text/plain");

        // Не должно быть серверных ошибок
      });

      await test.step("Проверить ответ", async () => {
        expect(serverErrors, "Не должно быть серверных ошибок (5xx)").toBe(0);

        // Хотя бы одно создание должно быть успешным
        expect(
          successCount,
          "Минимум одно создание должно быть успешным",
        ).toBeGreaterThanOrEqual(1);
      });
    });

    test("C4778: Параллельное чтение одной благодарности", async ({
      feedbackAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить запрос: Параллельное чтение одной благодарности", async () => {
        const feedbackTypeId = await getThanksTypeId(feedbackAPI);
        const targetUserId = await getTargetUserId(feedbackAPI);

        if (!feedbackTypeId || !targetUserId) {
          test.skip();
          return;
        }

        // Создаём тестовую благодарность
        const { response: createResp, data: created } =
          await feedbackAPI.create({
            body: `Read Concurrency Test ${Date.now()}`,
            targets: [{ targetType: "user", entityId: targetUserId }],
            feedbackTypeId,
            userAccessType: "selective",
            usersWithAccess: [],
          });

        if (!createResp.ok() || !created?.id) {
          test.skip();
          return;
        }

        createdFeedbackIds.push(created.id);

        // Параллельное чтение 10 раз
        const results = await Promise.all([
          feedbackAPI.getById(created.id),
          feedbackAPI.getById(created.id),
          feedbackAPI.getById(created.id),
          feedbackAPI.getById(created.id),
          feedbackAPI.getById(created.id),
          feedbackAPI.getById(created.id),
          feedbackAPI.getById(created.id),
          feedbackAPI.getById(created.id),
          feedbackAPI.getById(created.id),
          feedbackAPI.getById(created.id),
        ]);

        const statuses = results.map((r) => r.response.status());
        allure.attachment(
          "Response Statuses",
          JSON.stringify(statuses),
          "application/json",
        );

        // Все чтения должны быть успешными
        for (const { response } of results) {
          expect(
            response.ok(),
            `Чтение должно быть успешным, получен ${response.status()}`,
          ).toBe(true);
        }

        // Все должны вернуть одинаковые данные
        const bodies = results.map((r) => r.data?.body);
        const uniqueBodies = [...new Set(bodies)];
      });

      await test.step("Проверить ответ", async () => {
        expect(
          uniqueBodies.length,
          "Все чтения должны вернуть одинаковые данные",
        ).toBe(1);
      });
    });

    test("C4779: Чтение во время создания комментариев", async ({
      feedbackAPI,
    }) => {
      setSeverity("normal");

      let results, serverErrors;
      await test.step("Выполнить запрос: Чтение во время создания комментариев", async () => {
        const feedbackTypeId = await getThanksTypeId(feedbackAPI);
        const targetUserId = await getTargetUserId(feedbackAPI);

        if (!feedbackTypeId || !targetUserId) {
          test.skip();
          return;
        }

        // Создаём тестовую благодарность
        const { response: createResp, data: created } =
          await feedbackAPI.create({
            body: `Comment Concurrency Test ${Date.now()}`,
            targets: [{ targetType: "user", entityId: targetUserId }],
            feedbackTypeId,
            userAccessType: "selective",
            usersWithAccess: [],
          });

        if (!createResp.ok() || !created?.id) {
          test.skip();
          return;
        }

        createdFeedbackIds.push(created.id);

        // Параллельно читаем и создаём комментарии
        const timestamp = Date.now();
        results = await Promise.all([
          feedbackAPI.getById(created.id),
          feedbackAPI.createComment(created.id, `Comment 1 ${timestamp}`),
          feedbackAPI.getById(created.id),
          feedbackAPI.createComment(created.id, `Comment 2 ${timestamp}`),
          feedbackAPI.getById(created.id),
        ]);

        const statuses = results.map((r) => r.response.status());
        allure.attachment(
          "Response Statuses",
          JSON.stringify(statuses),
          "application/json",
        );

        // Проверяем что нет серверных ошибок
        serverErrors = results.filter((r) => r.response.status() >= 500).length;
      });

      await test.step("Проверить ответ", async () => {
        expect(serverErrors, "Не должно быть серверных ошибок").toBe(0);

        // Чтения должны быть успешными
        const reads = [results[0], results[2], results[4]];
        for (const { response } of reads) {
          expect(response.ok(), `Чтение должно быть успешным`).toBe(true);
        }
      });
    });
  },
);

// ============================================================================
// OBJECTIVES CONCURRENCY TESTS
// ============================================================================

test.describe(
  "Concurrency - Objectives",
  { tag: ["@api", "@concurrency"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.OBJECTIVES, "Concurrency");
    });

    // Хранилище для cleanup
    const createdObjectiveIds = [];

    test.afterEach(async ({ objectivesAPI }) => {
      // Cleanup созданных целей
      for (const id of createdObjectiveIds) {
        await safeDeleteObjective(objectivesAPI, id);
      }
      createdObjectiveIds.length = 0;
    });

    test("C4780: Параллельное создание целей", async ({ objectivesAPI }) => {
      setSeverity("critical");

      await test.step("Выполнить запрос: Параллельное создание целей", async () => {
        const userId = await getCurrentUserId(objectivesAPI);
        const { periodYear, periodQ } = getCurrentPeriod();

        if (!userId) {
          test.skip();
          return;
        }

        const timestamp = Date.now();
        const createPayload = (index) => ({
          title: `Concurrent Objective ${timestamp} - ${index}`,
          description: `Test objective for concurrency ${index}`,
          periodYear,
          periodQ,
          status: "draft",
          level: "self",
          responsibleUserId: userId,
          userAccessType: "everybody",
          milestones: [
            {
              temporaryId: `temp-${timestamp}-${index}`,
              title: `Milestone ${index}`,
              type: "percent",
              weight: 100,
              progress: 0,
              responsibleUserId: userId,
            },
          ],
        });

        // Параллельное создание 5 целей
        const results = await Promise.all([
          objectivesAPI.saveObjective(createPayload(1)),
          objectivesAPI.saveObjective(createPayload(2)),
          objectivesAPI.saveObjective(createPayload(3)),
          objectivesAPI.saveObjective(createPayload(4)),
          objectivesAPI.saveObjective(createPayload(5)),
        ]);

        // Собираем ID для cleanup
        for (const { data } of results) {
          if (data?.id) createdObjectiveIds.push(data.id);
        }

        const statuses = results.map((r) => r.response.status());
        allure.attachment(
          "Response Statuses",
          JSON.stringify(statuses),
          "application/json",
        );

        const successCount = results.filter((r) => r.response.ok()).length;
        const serverErrors = results.filter(
          (r) => r.response.status() >= 500,
        ).length;

        allure.attachment("Success Count", `${successCount}/5`, "text/plain");
        allure.attachment("Server Errors", `${serverErrors}`, "text/plain");

        // Не должно быть серверных ошибок
      });

      await test.step("Проверить ответ", async () => {
        expect(serverErrors, "Не должно быть серверных ошибок (5xx)").toBe(0);

        // Хотя бы одно создание должно быть успешным
        expect(
          successCount,
          "Минимум одно создание должно быть успешным",
        ).toBeGreaterThanOrEqual(1);
      });
    });

    test("C4781: Параллельное обновление одной цели", async ({
      objectivesAPI,
    }) => {
      setSeverity("critical");

      let results;
      await test.step("Выполнить запрос: Параллельное обновление одной цели", async () => {
        const userId = await getCurrentUserId(objectivesAPI);
        const { periodYear, periodQ } = getCurrentPeriod();

        if (!userId) {
          test.skip();
          return;
        }

        // Создаём тестовую цель
        const timestamp = Date.now();
        const { response: createResp, data: created } =
          await objectivesAPI.saveObjective({
            title: `Update Concurrency Test ${timestamp}`,
            description: "Test objective for update concurrency",
            periodYear,
            periodQ,
            status: "draft",
            level: "self",
            responsibleUserId: userId,
            userAccessType: "everybody",
            milestones: [
              {
                temporaryId: `temp-${timestamp}`,
                title: "Milestone 1",
                type: "percent",
                weight: 100,
                progress: 0,
                responsibleUserId: userId,
              },
            ],
          });

        if (!createResp.ok() || !created?.id) {
          test.skip();
          return;
        }

        createdObjectiveIds.push(created.id);

        // Параллельное обновление одной цели с разными данными
        results = await Promise.all([
          objectivesAPI.saveObjective({
            id: created.id,
            title: `Updated Title 1 ${timestamp}`,
            description: created.description,
            periodYear,
            periodQ,
            status: "draft",
            level: "self",
            responsibleUserId: userId,
            userAccessType: "everybody",
            milestones: created.milestones,
          }),
          objectivesAPI.saveObjective({
            id: created.id,
            title: `Updated Title 2 ${timestamp}`,
            description: created.description,
            periodYear,
            periodQ,
            status: "draft",
            level: "self",
            responsibleUserId: userId,
            userAccessType: "everybody",
            milestones: created.milestones,
          }),
          objectivesAPI.saveObjective({
            id: created.id,
            title: `Updated Title 3 ${timestamp}`,
            description: created.description,
            periodYear,
            periodQ,
            status: "draft",
            level: "self",
            responsibleUserId: userId,
            userAccessType: "everybody",
            milestones: created.milestones,
          }),
        ]);

        const statuses = results.map((r) => r.response.status());
        allure.attachment(
          "Response Statuses",
          JSON.stringify(statuses),
          "application/json",
        );

        // Проверяем что нет серверных ошибок
        const serverErrors = results.filter(
          (r) => r.response.status() >= 500,
        ).length;
      });

      await test.step("Проверить ответ", async () => {
        expect(
          serverErrors,
          "Не должно быть серверных ошибок при параллельном обновлении",
        ).toBe(0);

        // Допустимые статусы: 200/201 (успех), 409 (конфликт), 400 (валидация)
        for (const { response } of results) {
          expect(
            [200, 201, 400, 409].includes(response.status()),
            `Статус должен быть 200/201, 400 или 409, получен: ${response.status()}`,
          ).toBe(true);
        }
      });
    });

    test("C4782: Чтение во время обновления", async ({ objectivesAPI }) => {
      setSeverity("normal");

      let results;
      await test.step("Выполнить запрос: Чтение во время обновления", async () => {
        const userId = await getCurrentUserId(objectivesAPI);
        const { periodYear, periodQ } = getCurrentPeriod();

        if (!userId) {
          test.skip();
          return;
        }

        // Создаём тестовую цель
        const timestamp = Date.now();
        const { response: createResp, data: created } =
          await objectivesAPI.saveObjective({
            title: `Read During Write Test ${timestamp}`,
            description: "Test objective for read/write concurrency",
            periodYear,
            periodQ,
            status: "draft",
            level: "self",
            responsibleUserId: userId,
            userAccessType: "everybody",
            milestones: [
              {
                temporaryId: `temp-${timestamp}`,
                title: "Milestone 1",
                type: "percent",
                weight: 100,
                progress: 0,
                responsibleUserId: userId,
              },
            ],
          });

        if (!createResp.ok() || !created?.id) {
          test.skip();
          return;
        }

        createdObjectiveIds.push(created.id);

        // Параллельно читаем и обновляем
        results = await Promise.all([
          objectivesAPI.getObjectiveById(created.id),
          objectivesAPI.saveObjective({
            id: created.id,
            title: `Updated During Read ${timestamp}`,
            description: created.description,
            periodYear,
            periodQ,
            status: "draft",
            level: "self",
            responsibleUserId: userId,
            userAccessType: "everybody",
            milestones: created.milestones,
          }),
          objectivesAPI.getObjectiveById(created.id),
          objectivesAPI.getObjectiveById(created.id),
        ]);

        const statuses = results.map((r) => r.response.status());
        allure.attachment(
          "Response Statuses",
          JSON.stringify(statuses),
          "application/json",
        );

        // Проверяем что нет серверных ошибок
        const serverErrors = results.filter(
          (r) => r.response.status() >= 500,
        ).length;
      });

      await test.step("Проверить ответ", async () => {
        expect(serverErrors, "Не должно быть серверных ошибок").toBe(0);

        // Чтения должны быть успешными (индексы 0, 2, 3)
        const reads = [results[0], results[2], results[3]];
        for (const { response } of reads) {
          expect(response.ok(), `Чтение должно быть успешным`).toBe(true);
        }
      });
    });
  },
);

// ============================================================================
// MIXED CONCURRENCY TESTS
// ============================================================================

test.describe(
  "Concurrency - Mixed Operations",
  { tag: ["@api", "@concurrency"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest("API", "Mixed Concurrency");
    });

    test("C4783: Параллельные операции на разных модулях", async ({
      feedbackAPI,
      objectivesAPI,
    }) => {
      setSeverity("normal");

      let results;
      await test.step("Выполнить запрос: Параллельные операции на разных модулях", async () => {
        const feedbackTypeId = await getThanksTypeId(feedbackAPI);
        const targetUserId = await getTargetUserId(feedbackAPI);
        const userId = await getCurrentUserId(objectivesAPI);
        const { periodYear, periodQ } = getCurrentPeriod();

        if (!feedbackTypeId || !targetUserId || !userId) {
          test.skip();
          return;
        }

        const timestamp = Date.now();

        // Параллельные операции на разных модулях
        results = await Promise.all([
          // Feedback операции
          feedbackAPI.create({
            body: `Mixed Concurrency Feedback ${timestamp}`,
            targets: [{ targetType: "user", entityId: targetUserId }],
            feedbackTypeId,
            userAccessType: "selective",
            usersWithAccess: [],
          }),
          // Objectives операции
          objectivesAPI.saveObjective({
            title: `Mixed Concurrency Objective ${timestamp}`,
            description: "Test objective for mixed concurrency",
            periodYear,
            periodQ,
            status: "draft",
            level: "self",
            responsibleUserId: userId,
            userAccessType: "everybody",
            milestones: [
              {
                temporaryId: `temp-${timestamp}`,
                title: "Milestone 1",
                type: "percent",
                weight: 100,
                progress: 0,
                responsibleUserId: userId,
              },
            ],
          }),
          // Ещё Feedback
          feedbackAPI.create({
            body: `Mixed Concurrency Feedback 2 ${timestamp}`,
            targets: [{ targetType: "user", entityId: targetUserId }],
            feedbackTypeId,
            userAccessType: "selective",
            usersWithAccess: [],
          }),
        ]);

        // Cleanup
        if (results[0].data?.id)
          await safeDeleteFeedback(feedbackAPI, results[0].data.id);
        if (results[1].data?.id)
          await safeDeleteObjective(objectivesAPI, results[1].data.id);
        if (results[2].data?.id)
          await safeDeleteFeedback(feedbackAPI, results[2].data.id);

        const statuses = results.map((r) => r.response.status());
        allure.attachment(
          "Response Statuses",
          JSON.stringify(statuses),
          "application/json",
        );

        // Проверяем что нет серверных ошибок
        const serverErrors = results.filter(
          (r) => r.response.status() >= 500,
        ).length;
      });

      await test.step("Проверить ответ", async () => {
        expect(serverErrors, "Не должно быть серверных ошибок").toBe(0);

        // Все операции должны завершиться успешно
        for (const { response } of results) {
          expect(
            response.ok(),
            `Операция должна быть успешной, получен ${response.status()}`,
          ).toBe(true);
        }
      });
    });

    test("C4784: Нагрузка 50 параллельных запросов на чтение", async ({
      feedbackAPI,
    }) => {
      setSeverity("normal");

      let REQUEST_COUNT, duration, successCount, serverErrors;
      await test.step("Выполнить запрос: Нагрузка 50 параллельных запросов на чтение", async () => {
        const feedbackTypeId = await getThanksTypeId(feedbackAPI);
        const targetUserId = await getTargetUserId(feedbackAPI);

        if (!feedbackTypeId || !targetUserId) {
          test.skip();
          return;
        }

        // Создаём тестовую благодарность
        const { response: createResp, data: created } =
          await feedbackAPI.create({
            body: `Load Test Feedback ${Date.now()}`,
            targets: [{ targetType: "user", entityId: targetUserId }],
            feedbackTypeId,
            userAccessType: "selective",
            usersWithAccess: [],
          });

        if (!createResp.ok() || !created?.id) {
          test.skip();
          return;
        }

        REQUEST_COUNT = 50;

        // 50 параллельных запросов на чтение
        const requests = Array(REQUEST_COUNT)
          .fill(null)
          .map(() => feedbackAPI.getById(created.id));

        const startTime = Date.now();
        const results = await Promise.all(requests);
        duration = Date.now() - startTime;

        // Cleanup
        await safeDeleteFeedback(feedbackAPI, created.id);

        const statuses = results.map((r) => r.response.status());
        successCount = results.filter((r) => r.response.ok()).length;
        serverErrors = results.filter((r) => r.response.status() >= 500).length;
        const avgTime = Math.round(duration / REQUEST_COUNT);

        allure.attachment(
          "Total Duration",
          `${duration}ms for ${REQUEST_COUNT} requests`,
          "text/plain",
        );
        allure.attachment("Avg Time Per Request", `${avgTime}ms`, "text/plain");
        allure.attachment(
          "Success Rate",
          `${successCount}/${REQUEST_COUNT}`,
          "text/plain",
        );
        allure.attachment("Server Errors", `${serverErrors}`, "text/plain");

        // Не должно быть серверных ошибок
      });

      await test.step("Проверить ответ", async () => {
        expect(
          serverErrors,
          "Не должно быть серверных ошибок при нагрузке",
        ).toBe(0);

        // Минимум 90% запросов должны быть успешными
        const minSuccess = Math.floor(REQUEST_COUNT * 0.9);
        expect(
          successCount,
          `Минимум 90% запросов должны быть успешными`,
        ).toBeGreaterThanOrEqual(minSuccess);

        // Время выполнения разумное (< 30 сек для 50 запросов)
        expect(
          duration,
          "Время выполнения не должно превышать 30 секунд",
        ).toBeLessThan(30000);
      });
    });

    test("C4785: Нагрузка 100 параллельных запросов смешанных операций", async ({
      feedbackAPI,
    }) => {
      setSeverity("critical");

      let REQUEST_COUNT, requests;
      await test.step("Выполнить запрос: Нагрузка 100 параллельных запросов смешанных операций", async () => {
        const feedbackTypeId = await getThanksTypeId(feedbackAPI);
        const targetUserId = await getTargetUserId(feedbackAPI);

        if (!feedbackTypeId || !targetUserId) {
          test.skip();
          return;
        }

        // Создаём несколько тестовых благодарностей для разнообразия
        const timestamp = Date.now();
        const setupResults = await Promise.all([
          feedbackAPI.create({
            body: `Load Test 1 ${timestamp}`,
            targets: [{ targetType: "user", entityId: targetUserId }],
            feedbackTypeId,
            userAccessType: "selective",
            usersWithAccess: [],
          }),
          feedbackAPI.create({
            body: `Load Test 2 ${timestamp}`,
            targets: [{ targetType: "user", entityId: targetUserId }],
            feedbackTypeId,
            userAccessType: "selective",
            usersWithAccess: [],
          }),
          feedbackAPI.create({
            body: `Load Test 3 ${timestamp}`,
            targets: [{ targetType: "user", entityId: targetUserId }],
            feedbackTypeId,
            userAccessType: "selective",
            usersWithAccess: [],
          }),
        ]);

        const createdIds = setupResults
          .filter((r) => r.data?.id)
          .map((r) => r.data.id);

        if (createdIds.length === 0) {
          test.skip();
          return;
        }

        REQUEST_COUNT = 100;

        // 100 параллельных запросов: чтение + списки
        requests = Array(REQUEST_COUNT)
          .fill(null)
          .map((_, i) => {
            // Чередуем типы запросов
            if (i % 3 === 0) {
              // Чтение конкретной записи
              return feedbackAPI.getById(createdIds[i % createdIds.length]);
            } else if (i % 3 === 1) {
              // Получение списка благодарностей
              return feedbackAPI.getFeedbacks({ limit: 10 });
            } else {
              // Получение типов
              return feedbackAPI.getFeedbackTypes();
            }
          });

        const startTime = Date.now();
        const results = await Promise.all(requests);
        const duration = Date.now() - startTime;

        // Cleanup
        for (const id of createdIds) {
          await safeDeleteFeedback(feedbackAPI, id);
        }

        const successCount = results.filter((r) => r.response.ok()).length;
        const serverErrors = results.filter(
          (r) => r.response.status() >= 500,
        ).length;
        const clientErrors = results.filter(
          (r) => r.response.status() >= 400 && r.response.status() < 500,
        ).length;
        const avgTime = Math.round(duration / REQUEST_COUNT);
        const rps = Math.round((REQUEST_COUNT / duration) * 1000);

        allure.attachment("Total Duration", `${duration}ms`, "text/plain");
        allure.attachment("Requests Per Second", `${rps} RPS`, "text/plain");
        allure.attachment("Avg Time Per Request", `${avgTime}ms`, "text/plain");
        allure.attachment(
          "Success Count",
          `${successCount}/${REQUEST_COUNT}`,
          "text/plain",
        );
        allure.attachment(
          "Server Errors (5xx)",
          `${serverErrors}`,
          "text/plain",
        );
        allure.attachment(
          "Client Errors (4xx)",
          `${clientErrors}`,
          "text/plain",
        );

        // Не должно быть серверных ошибок
      });

      await test.step("Проверить ответ", async () => {
        expect(
          serverErrors,
          "Не должно быть серверных ошибок (5xx) при нагрузке",
        ).toBe(0);

        // Минимум 85% запросов должны быть успешными (с учётом возможных 429)
        const minSuccess = Math.floor(REQUEST_COUNT * 0.85);
        expect(
          successCount,
          `Минимум 85% запросов должны быть успешными`,
        ).toBeGreaterThanOrEqual(minSuccess);

        // Время выполнения разумное (< 60 сек для 100 запросов)
        expect(
          duration,
          "Время выполнения не должно превышать 60 секунд",
        ).toBeLessThan(60000);

        console.log(
          `Load test: ${REQUEST_COUNT} requests in ${duration}ms (${rps} RPS, avg ${avgTime}ms)`,
        );
      });
    });
  },
);
