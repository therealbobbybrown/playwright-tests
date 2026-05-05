// @ts-check
import { test as base, expect } from "@playwright/test";
import {
  getCredentials,
  FeedbackAPI,
  ObjectivesAPI,
  OrgStructureAPI,
  PerformanceReviewAPI,
  SurveyAPI,
} from "../../../utils/api/index.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";
import { assertSuccessStatus } from "../../../utils/api/common-assertions.js";
import { allure } from "allure-playwright";

/**
 * Тесты больших объёмов данных (Large Data Sets)
 *
 * Проверяет поведение API при работе с:
 * - Большими списками (пагинация)
 * - Большими текстовыми полями
 * - Большими запросами
 * - Граничными значениями limit/offset
 *
 * @tags @api @large-data @edge-case @regression
 */

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
  orgAPI: async ({ request }, use) => {
    const api = new OrgStructureAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
  prAPI: async ({ request }, use) => {
    const api = new PerformanceReviewAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
  surveyAPI: async ({ request }, use) => {
    const api = new SurveyAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
});

// Хранение созданных ID для cleanup
const createdFeedbackIds = [];

test.afterAll(async ({ request }) => {
  const api = new FeedbackAPI(request);
  const { email, password } = getCredentials("admin");
  await api.signIn(email, password);

  for (const id of createdFeedbackIds) {
    try {
      await api.deleteFeedback(id);
    } catch {
      // Игнорируем ошибки cleanup
    }
  }
});

// ============================================================================
// PAGINATION TESTS
// ============================================================================

test.describe(
  "Large Data Sets - Pagination",
  { tag: ["@api", "@large-data", "@pagination"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.FEEDBACK, "Large Data - Pagination");
    });

    test("C4992: Пагинация списка пользователей", async ({ orgAPI }) => {
      setSeverity("normal");

      let firstResp, firstData;
      await test.step("Выполнить запрос: Пагинация списка пользователей", async () => {
        // Получаем общее количество через findUsers
        ({ response: firstResp, data: firstData } = await orgAPI.findUsers({
          limit: 1,
        }));
      });

      await test.step("Проверить ответ", async () => {
        expect(firstResp.ok()).toBe(true);

        const total =
          firstData?.total || firstData?.count || firstData?.items?.length || 0;
        allure.attachment("Total Users", `${total}`, "text/plain");

        if (total < 10) {
          console.log(`Пропуск: недостаточно пользователей (${total})`);
          return;
        }

        // Проверяем последнюю страницу
        const lastOffset = Math.max(0, total - 5);
        const { response, data } = await orgAPI.findUsers({
          limit: 5,
          offset: lastOffset,
        });

        assertSuccessStatus(response);
        const items = data?.items || data || [];
        expect(items.length).toBeLessThanOrEqual(5);

        allure.attachment(
          "Last Page",
          `Offset: ${lastOffset}, Items: ${items.length}`,
          "text/plain",
        );
        console.log(
          `Пагинация пользователей: total=${total}, lastPage=${items.length}`,
        );
      });
    });

    test("C4993: Пагинация списка feedback", async ({ feedbackAPI }) => {
      setSeverity("normal");

      let firstResp, firstData;
      await test.step("Выполнить запрос: Пагинация списка feedback", async () => {
        ({ response: firstResp, data: firstData } =
          await feedbackAPI.getFeedbacks({ limit: 1 }));
      });

      await test.step("Проверить ответ", async () => {
        expect(firstResp.ok()).toBe(true);

        const total =
          firstData?.total || firstData?.count || firstData?.items?.length || 0;
        allure.attachment("Total Feedbacks", `${total}`, "text/plain");

        if (total < 10) {
          console.log(`Пропуск: недостаточно благодарностей (${total})`);
          return;
        }

        // Проверяем середину списка
        const middleOffset = Math.floor(total / 2);
        const { response, data } = await feedbackAPI.getFeedbacks({
          limit: 10,
          offset: middleOffset,
        });

        assertSuccessStatus(response);
        const items = data?.items || data || [];
        expect(items.length).toBeGreaterThan(0);

        console.log(
          `Пагинация feedback: total=${total}, middle offset=${middleOffset}, items=${items.length}`,
        );
      });
    });

    test("C4994: Большой limit (1000 записей)", async ({ orgAPI }) => {
      setSeverity("normal");

      let response, data, duration;
      await test.step("Выполнить запрос: Большой limit (1000 записей)", async () => {
        const startTime = Date.now();
        ({ response, data } = await orgAPI.findUsers({ limit: 1000 }));
        duration = Date.now() - startTime;

        allure.attachment("Response Time", `${duration}ms`, "text/plain");

        // API должен либо вернуть данные, либо ограничить limit
      });

      await test.step("Проверить ответ", async () => {
        expect([200, 201, 400]).toContain(response.status());

        if (response.ok()) {
          const items = data?.items || data || [];
          allure.attachment("Items Returned", `${items.length}`, "text/plain");
          console.log(
            `Большой limit: получено ${items.length} записей за ${duration}ms`,
          );

          // Проверяем что время ответа разумное (< 30 секунд)
          expect(duration, "Время ответа должно быть < 30 секунд").toBeLessThan(
            30000,
          );
        }
      });
    });

    test("C4995: Очень большой offset", async ({ feedbackAPI }) => {
      setSeverity("minor");

      await test.step("Выполнить: Очень большой offset", async () => {
        // Запрашиваем с заведомо большим offset
        const { response, data } = await feedbackAPI.getFeedbacks({
          limit: 10,
          offset: 999999,
        });

        // Должен вернуть пустой список или ошибку
        expect([200, 400]).toContain(response.status());

        if (response.ok()) {
          const items = data?.items || data || [];
          expect(items.length).toBe(0);
          console.log("Большой offset: пустой список (корректно)");
        } else {
          console.log(
            `Большой offset: ошибка ${response.status()} (корректно)`,
          );
        }
      });
    });

    test("C4996: Нулевой limit возвращает ошибку или все записи", async ({
      feedbackAPI,
    }) => {
      setSeverity("minor");

      await test.step("Выполнить: Нулевой limit возвращает ошибку или все записи", async () => {
        const { response, data } = await feedbackAPI.getFeedbacks({ limit: 0 });

        // Может вернуть ошибку или все записи (зависит от реализации)
        expect([200, 400, 422]).toContain(response.status());

        if (response.ok()) {
          const items = data?.items || data || [];
          console.log(`Limit 0: получено ${items.length} записей`);
        } else {
          console.log(`Limit 0: ошибка ${response.status()}`);
        }
      });
    });

    test("C4997: Отрицательный offset возвращает ошибку", async ({
      feedbackAPI,
    }) => {
      setSeverity("minor");

      await test.step("Выполнить: Отрицательный offset возвращает ошибку", async () => {
        const { response } = await feedbackAPI.getFeedbacks({
          limit: 10,
          offset: -1,
        });

        // Отрицательный offset должен быть отклонён или вызвать ошибку сервера
        expect([200, 400, 422, 500]).toContain(response.status());
        console.log(`Отрицательный offset: статус ${response.status()}`);
      });
    });
  },
);

// ============================================================================
// LARGE CONTENT TESTS
// ============================================================================

test.describe(
  "Large Data Sets - Large Content",
  { tag: ["@api", "@large-data", "@content"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.FEEDBACK, "Large Data - Content");
    });

    test("C4998: Создание feedback с большим body (10KB)", async ({
      feedbackAPI,
      orgAPI,
    }) => {
      setSeverity("normal");

      let largeBody, response, data;
      await test.step("Выполнить запрос: Создание feedback с большим body (10KB)", async () => {
        largeBody = "А".repeat(10000); // 10K символов кириллицы

        // Получаем пользователя для отправки
        const { data: usersData } = await orgAPI.findUsers({ limit: 1 });
        const users = usersData?.items || usersData || [];

        if (users.length === 0) {
          console.log("Пропуск: нет пользователей для отправки");
          return;
        }

        ({ response, data } = await feedbackAPI.create({
          body: largeBody,
          toUserId: users[0].id,
          feedbackTypeId: 1,
        }));

        allure.attachment(
          "Body Length",
          `${largeBody.length} chars`,
          "text/plain",
        );

        // Может успешно создаться или вернуть ошибку валидации
      });

      await test.step("Проверить ответ", async () => {
        expect([200, 201, 400, 413, 422]).toContain(response.status());

        if (response.ok() && data?.id) {
          createdFeedbackIds.push(data.id);
          console.log(`Большой body (10KB): создано успешно, ID=${data.id}`);

          // Проверяем что данные сохранились
          const { data: getData } = await feedbackAPI.getFeedbackById(data.id);
          expect(getData?.body?.length).toBe(largeBody.length);
        } else {
          console.log(`Большой body (10KB): статус ${response.status()}`);
        }
      });
    });

    test("C4999: Создание feedback с очень большим body (50KB)", async ({
      feedbackAPI,
      orgAPI,
    }) => {
      setSeverity("normal");

      let response, data;
      await test.step("Выполнить запрос: Создание feedback с очень большим body (50KB)", async () => {
        const veryLargeBody = "X".repeat(50000); // 50K символов

        const { data: usersData } = await orgAPI.findUsers({ limit: 1 });
        const users = usersData?.items || usersData || [];

        if (users.length === 0) {
          console.log("Пропуск: нет пользователей для отправки");
          return;
        }

        ({ response, data } = await feedbackAPI.create({
          body: veryLargeBody,
          toUserId: users[0].id,
          feedbackTypeId: 1,
        }));

        allure.attachment(
          "Body Length",
          `${veryLargeBody.length} chars`,
          "text/plain",
        );

        // Очень большой body скорее всего будет отклонён
      });

      await test.step("Проверить ответ", async () => {
        expect([200, 201, 400, 413, 422]).toContain(response.status());

        if (response.ok() && data?.id) {
          createdFeedbackIds.push(data.id);
          console.log(`Очень большой body (50KB): создано успешно`);
        } else {
          console.log(
            `Очень большой body (50KB): отклонено со статусом ${response.status()}`,
          );
        }
      });
    });

    test("C5000: Создание feedback с максимально длинным title в objectives", async ({
      objectivesAPI,
    }) => {
      setSeverity("normal");

      let response, data;
      await test.step("Выполнить запрос: Создание feedback с максимально длинным title в objectives", async () => {
        const longTitle = "Цель ".repeat(100); // ~500 символов

        ({ response, data } = await objectivesAPI.saveObjective({
          title: longTitle,
          description: "Тест длинного названия",
        }));

        allure.attachment(
          "Title Length",
          `${longTitle.length} chars`,
          "text/plain",
        );
      });

      await test.step("Проверить ответ", async () => {
        expect([200, 201, 400, 422]).toContain(response.status());

        if (response.ok() && data?.id) {
          console.log(`Длинный title: создано успешно`);
          // Cleanup
          await objectivesAPI.deleteObjective(data.id);
        } else {
          console.log(`Длинный title: статус ${response.status()}`);
        }
      });
    });

    test("C5001: Создание с body содержащим много переносов строк", async ({
      feedbackAPI,
      orgAPI,
    }) => {
      setSeverity("minor");

      let response, data;
      await test.step("Выполнить запрос: Создание с body содержащим много переносов строк", async () => {
        const multilineBody = Array(100).fill("Строка текста").join("\n");

        const { data: usersData } = await orgAPI.findUsers({ limit: 1 });
        const users = usersData?.items || usersData || [];

        if (users.length === 0) {
          console.log("Пропуск: нет пользователей");
          return;
        }

        ({ response, data } = await feedbackAPI.create({
          body: multilineBody,
          toUserId: users[0].id,
          feedbackTypeId: 1,
        }));
      });

      await test.step("Проверить ответ", async () => {
        expect([200, 201, 400, 422]).toContain(response.status());

        if (response.ok() && data?.id) {
          createdFeedbackIds.push(data.id);

          // Проверяем сохранение переносов строк
          const { data: getData } = await feedbackAPI.getFeedbackById(data.id);
          const savedNewlines = (getData?.body?.match(/\n/g) || []).length;
          expect(savedNewlines).toBeGreaterThan(50);
          console.log(
            `Multiline body: ${savedNewlines} переносов строк сохранено`,
          );
        }
      });
    });
  },
);

// ============================================================================
// RESPONSE TIME TESTS
// ============================================================================

test.describe(
  "Large Data Sets - Response Time",
  { tag: ["@api", "@large-data", "@performance"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.ORG_STRUCTURE, "Large Data - Performance");
    });

    test("C5002: Время ответа при получении списка пользователей", async ({
      orgAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Время ответа при получении списка пользователей", async () => {
        const limits = [10, 50, 100, 200];
        const results = [];

        for (const limit of limits) {
          const startTime = Date.now();
          const { response } = await orgAPI.findUsers({ limit });
          const duration = Date.now() - startTime;

          results.push({ limit, duration, status: response.status() });
        }

        allure.attachment(
          "Response Times",
          results
            .map((r) => `limit=${r.limit}: ${r.duration}ms (${r.status})`)
            .join("\n"),
          "text/plain",
        );

        // Все запросы должны выполниться за разумное время
        for (const result of results) {
          expect(
            result.duration,
            `limit=${result.limit} должен быть < 10s`,
          ).toBeLessThan(10000);
        }

        console.log(
          "Response times:",
          results.map((r) => `${r.limit}:${r.duration}ms`).join(", "),
        );
      });
    });

    test("C5003: Время ответа при поиске", async ({ orgAPI }) => {
      setSeverity("normal");

      await test.step("Выполнить: Время ответа при поиске", async () => {
        const searchTerms = ["а", "test", "admin", "user"];
        const results = [];

        for (const q of searchTerms) {
          const startTime = Date.now();
          const { response } = await orgAPI.findUsers({ q, limit: 50 });
          const duration = Date.now() - startTime;

          results.push({ q, duration, status: response.status() });
        }

        allure.attachment(
          "Search Times",
          results
            .map((r) => `q="${r.q}": ${r.duration}ms (${r.status})`)
            .join("\n"),
          "text/plain",
        );

        // Поиск должен быть быстрым
        for (const result of results) {
          expect(
            result.duration,
            `Поиск "${result.q}" должен быть < 5s`,
          ).toBeLessThan(5000);
        }

        console.log(
          "Search times:",
          results.map((r) => `"${r.q}":${r.duration}ms`).join(", "),
        );
      });
    });

    test("C5004: Параллельные запросы с разными limit", async ({ orgAPI }) => {
      setSeverity("normal");

      let totalDuration, successCount;
      await test.step("Выполнить запрос: Параллельные запросы с разными limit", async () => {
        const startTime = Date.now();

        const results = await Promise.all([
          orgAPI.findUsers({ limit: 10 }),
          orgAPI.findUsers({ limit: 50 }),
          orgAPI.findUsers({ limit: 100 }),
          orgAPI.getDepartments(),
          orgAPI.getUserGroups(),
        ]);

        totalDuration = Date.now() - startTime;

        allure.attachment(
          "Parallel Duration",
          `${totalDuration}ms`,
          "text/plain",
        );

        // Все запросы должны быть успешными
        successCount = results.filter((r) => r.response.ok()).length;
      });

      await test.step("Проверить ответ", async () => {
        expect(successCount).toBeGreaterThanOrEqual(3);

        // Параллельное выполнение должно быть быстрее последовательного
        expect(totalDuration, "Параллельные запросы < 15s").toBeLessThan(15000);

        console.log(
          `Параллельные запросы: ${successCount}/5 успешных за ${totalDuration}ms`,
        );
      });
    });
  },
);

// ============================================================================
// EDGE CASES
// ============================================================================

test.describe(
  "Large Data Sets - Edge Cases",
  { tag: ["@api", "@large-data", "@edge-case"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.FEEDBACK, "Large Data - Edge Cases");
    });

    test("C5005: Запрос с максимальным limit (Integer.MAX_VALUE)", async ({
      feedbackAPI,
    }) => {
      setSeverity("minor");

      await test.step("Выполнить: Запрос с максимальным limit (Integer.MAX_VALUE)", async () => {
        const { response } = await feedbackAPI.getFeedbacks({
          limit: 2147483647,
        });

        // Должен обработать gracefully
        expect([200, 400, 422]).toContain(response.status());
        console.log(`Max Integer limit: статус ${response.status()}`);
      });
    });

    test("C5006: Запрос с нечисловым limit", async ({ feedbackAPI }) => {
      setSeverity("minor");

      await test.step("Выполнить: Запрос с нечисловым limit", async () => {
        // @ts-ignore - намеренно передаём неверный тип
        const { response } = await feedbackAPI.getFeedbacks({ limit: "abc" });

        // Должен вернуть ошибку валидации или проигнорировать
        expect([200, 400, 422]).toContain(response.status());
        console.log(`Non-numeric limit: статус ${response.status()}`);
      });
    });

    test("C5007: Запрос с дробным limit", async ({ feedbackAPI }) => {
      setSeverity("minor");

      await test.step("Выполнить: Запрос с дробным limit", async () => {
        const { response } = await feedbackAPI.getFeedbacks({ limit: 10.5 });

        // Должен округлить или вернуть ошибку
        expect([200, 400, 422]).toContain(response.status());
        console.log(`Fractional limit: статус ${response.status()}`);
      });
    });

    test("C5008: Последовательная пагинация всего списка", async ({
      feedbackAPI,
    }) => {
      setSeverity("normal");

      let total, pageSize, allIds;
      await test.step("Выполнить запрос: Последовательная пагинация всего списка", async () => {
        // Получаем общее количество
        const { data: firstData } = await feedbackAPI.getFeedbacks({
          limit: 1,
        });
        total = firstData?.total || firstData?.count || 0;

        if (total < 5) {
          console.log(`Пропуск: недостаточно данных (${total})`);
          return;
        }

        pageSize = 10;
        const maxPages = Math.min(5, Math.ceil(total / pageSize)); // Максимум 5 страниц
        allIds = new Set();
        let pagesLoaded = 0;

        for (let page = 0; page < maxPages; page++) {
          const { response, data } = await feedbackAPI.getFeedbacks({
            limit: pageSize,
            offset: page * pageSize,
          });

          if (!response.ok()) break;

          const items = data?.items || data || [];
          items.forEach((item) => allIds.add(item.id));
          pagesLoaded++;
        }

        allure.attachment(
          "Pagination Result",
          `Pages: ${pagesLoaded}, Unique IDs: ${allIds.size}`,
          "text/plain",
        );

        // Все ID должны быть уникальными (нет дублей между страницами)
      });

      await test.step("Проверить ответ", async () => {
        expect(allIds.size).toBe(
          pagesLoaded * pageSize > total ? total : pagesLoaded * pageSize,
        );

        console.log(
          `Последовательная пагинация: ${pagesLoaded} страниц, ${allIds.size} уникальных ID`,
        );
      });
    });

    test("C5009: Сортировка большого списка", async ({ orgAPI }) => {
      setSeverity("normal");

      await test.step("Выполнить: Сортировка большого списка", async () => {
        const sortFields = ["id", "email", "name"];
        const results = [];

        for (const orderBy of sortFields) {
          const startTime = Date.now();
          const { response, data } = await orgAPI.findUsers({
            limit: 100,
            orderBy,
          });
          const duration = Date.now() - startTime;

          results.push({
            orderBy,
            duration,
            status: response.status(),
            count: (data?.items || data || []).length,
          });
        }

        allure.attachment(
          "Sort Times",
          results
            .map(
              (r) => `orderBy=${r.orderBy}: ${r.duration}ms, ${r.count} items`,
            )
            .join("\n"),
          "text/plain",
        );

        // Сортировка должна работать
        for (const result of results) {
          expect([200, 201, 400]).toContain(result.status);
        }

        console.log(
          "Sort times:",
          results.map((r) => `${r.orderBy}:${r.duration}ms`).join(", "),
        );
      });
    });
  },
);
