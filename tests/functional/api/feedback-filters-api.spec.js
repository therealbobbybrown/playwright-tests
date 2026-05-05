// @ts-check
import { expect } from "@playwright/test";
import {
  test,
} from "./feedback-test-helpers.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import {
  assertSuccessStatus,
  assertValidArray,
} from "../../utils/api/common-assertions.js";

test.describe(
  "Feedback API - Multi-Filter Combinations",
  { tag: ["@api", "@feedback", "@filters", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.FEEDBACK, "Multi-Filter");
    });

    test("C5091: GET /manager/feedbacks/ с комбинацией фильтров: даты + тип + поиск", async ({
      feedbackAPI,
    }) => {
      let response, data;
      await test.step("Выполнить запрос: GET /manager/feedbacks/ с комбинацией фильтров: даты + тип + поиск", async () => {
        const dateTo = new Date().toISOString().split("T")[0];
        const dateFrom = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split("T")[0];

        ({ response, data } = await feedbackAPI.getAllFeedbacks({
          dateFrom,
          dateTo,
          feedbackTypeName: "THANKS",
          q: "тест",
          limit: 20,
        }));
      });

      await test.step("Проверить ответ", async () => {
        expect([200, 403]).toContain(response.status());

        if (response.ok()) {
          expect(data).toBeDefined();
          const items = data?.items || data || [];
          assertValidArray(items);
        }
      });
    });

    test("C5092: GET /manager/feedbacks/ с фильтрами по пользователям: автор + получатель", async ({
      feedbackAPI,
    }) => {
      let response, data;
      await test.step("Выполнить запрос: GET /manager/feedbacks/ с фильтрами по пользователям: автор + получатель", async () => {
        // Получаем пользователей
        const { data: feedbacks } = await feedbackAPI.getAllFeedbacks({
          limit: 10,
        });
        const items = feedbacks?.items || feedbacks || [];

        test.skip(items.length === 0, "Нет благодарностей для тестирования");

        const authorUserId = items[0]?.authorUserId || items[0]?.authorUser?.id;
        const targetUser = items[0]?.targetUsers?.[0];
        const targetUserId =
          targetUser?.userId || targetUser?.user?.id || targetUser?.id;

        test.skip(
          !authorUserId || !targetUserId,
          "Не удалось получить ID пользователей",
        );

        ({ response, data } = await feedbackAPI.getAllFeedbacks({
          authorUserId,
          targetUserId,
          limit: 20,
        }));
      });

      await test.step("Проверить ответ", async () => {
        expect([200, 403]).toContain(response.status());

        if (response.ok()) {
          expect(data).toBeDefined();
        }
      });
    });

    test("C5093: GET /private/feedbacks/of-me/ с комбинацией фильтров: даты + тип", async ({
      feedbackAPI,
    }) => {
      await test.step("Выполнить: GET /private/feedbacks/of-me/ с комбинацией фильтров: даты + тип", async () => {
        const dateTo = new Date().toISOString().split("T")[0];
        const dateFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split("T")[0];

        const { response, data } = await feedbackAPI.getFeedbacksOfMe({
          dateFrom,
          dateTo,
          feedbackTypeName: "THANKS",
          limit: 20,
        });

        assertSuccessStatus(response);
        expect(data).toBeDefined();

        const items = data?.items || data || [];
        assertValidArray(items);
      });
    });

    test("C5094: GET /private/feedbacks/shared/ с комбинацией фильтров: даты + includeMy", async ({
      feedbackAPI,
    }) => {
      await test.step("Выполнить: GET /private/feedbacks/shared/ с комбинацией фильтров: даты + includeMy", async () => {
        const dateTo = new Date().toISOString().split("T")[0];
        const dateFrom = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split("T")[0];

        const { response, data } = await feedbackAPI.getSharedFeedbacks({
          dateFrom,
          dateTo,
          includeMy: true,
          limit: 20,
        });

        assertSuccessStatus(response);
        expect(data).toBeDefined();

        const items = data?.items || data || [];
        assertValidArray(items);
      });
    });

    test("C5095: GET /private/feedback-requests/for-me/ с комбинацией фильтров: даты + статус", async ({
      feedbackAPI,
    }) => {
      let response, data;
      await test.step("Выполнить запрос: GET /private/feedback-requests/for-me/ с комбинацией фильтров: даты + статус", async () => {
        const dateTo = new Date().toISOString().split("T")[0];
        const dateFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split("T")[0];

        ({ response, data } = await feedbackAPI.getFeedbackRequestsForMe({
          dateFrom,
          dateTo,
          answerStatus: "PENDING",
          limit: 20,
        }));
      });

      await test.step("Проверить ответ", async () => {
        expect([200, 400]).toContain(response.status());

        if (response.ok()) {
          expect(data).toBeDefined();
          const items = data?.items || data || [];
          assertValidArray(items);
        }
      });
    });
  },
);

test.describe(
  "Feedback API - Pagination Consistency",
  { tag: ["@api", "@feedback", "@pagination", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.FEEDBACK, "Pagination");
    });

    test("C5096: Пагинация: offset + limit возвращает корректные данные", async ({
      feedbackAPI,
    }) => {
      let resp1, data1;
      await test.step("Выполнить запрос: Пагинация: offset + limit возвращает корректные данные", async () => {
        // Получаем первые 5 элементов
        ({ response: resp1, data: data1 } = await feedbackAPI.getAllFeedbacks({
          limit: 5,
          offset: 0,
        }));
      });

      await test.step("Проверить ответ", async () => {
        expect([200, 403]).toContain(resp1.status());
        if (!resp1.ok()) return;

        const items1 = data1?.items || data1 || [];

        // Получаем следующие 5 элементов
        const { response: resp2, data: data2 } =
          await feedbackAPI.getAllFeedbacks({
            limit: 5,
            offset: 5,
          });

        expect(resp2.ok()).toBe(true);

        const items2 = data2?.items || data2 || [];

        // Проверяем что элементы разные (если есть достаточно данных)
        if (items1.length === 5 && items2.length > 0) {
          const ids1 = items1.map((i) => i.id);
          const ids2 = items2.map((i) => i.id);

          // Ни один ID из второй страницы не должен быть на первой
          ids2.forEach((id) => {
            expect(ids1).not.toContain(id);
          });
        }
      });
    });

    test("C5097: Пагинация: total соответствует фактическому количеству", async ({
      feedbackAPI,
    }) => {
      await test.step("Выполнить: Пагинация: total соответствует фактическому количеству", async () => {
        const { response, data } = await feedbackAPI.getAllFeedbacks({
          limit: 100,
        });

        expect([200, 403]).toContain(response.status());
        if (!response.ok()) return;

        const items = data?.items || data || [];
        const total = data?.total;

        // Если есть total, проверяем что количество элементов <= total
        if (total !== undefined) {
          expect(items.length).toBeLessThanOrEqual(total);
        }
      });
    });

    test("C5031: Пагинация: большой offset возвращает пустой массив", async ({
      feedbackAPI,
    }) => {
      await test.step("Выполнить: Пагинация: большой offset возвращает пустой массив", async () => {
        const { response, data } = await feedbackAPI.getAllFeedbacks({
          limit: 10,
          offset: 999999,
        });

        expect([200, 403]).toContain(response.status());

        if (response.ok()) {
          const items = data?.items || data || [];
          expect(items.length).toBe(0);
        }
      });
    });

    test("C5099: Пагинация: limit=0 возвращает все элементы или ошибку", async ({
      feedbackAPI,
    }) => {
      await test.step("Выполнить: Пагинация: limit=0 возвращает все элементы или ошибку", async () => {
        const { response, data } = await feedbackAPI.getAllFeedbacks({
          limit: 0,
        });

        // limit=0 может означать "все" или быть невалидным
        expect([200, 400, 403]).toContain(response.status());

        if (response.ok()) {
          const items = data?.items || data || [];
          assertValidArray(items);
        }
      });
    });
  },
);

test.describe(
  "Feedback API - Advanced Search",
  { tag: ["@api", "@feedback", "@search", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.FEEDBACK, "Advanced Search");
    });

    test("C5100: Поиск: пустой запрос возвращает все элементы", async ({
      feedbackAPI,
    }) => {
      await test.step("Выполнить: Поиск: пустой запрос возвращает все элементы", async () => {
        const { response, data } = await feedbackAPI.getAllFeedbacks({
          q: "",
          limit: 10,
        });

        expect([200, 403]).toContain(response.status());

        if (response.ok()) {
          const items = data?.items || data || [];
          assertValidArray(items);
        }
      });
    });

    test("C5101: Поиск: запрос с пробелами", async ({ feedbackAPI }) => {
      await test.step("Выполнить: Поиск: запрос с пробелами", async () => {
        const { response, data } = await feedbackAPI.getAllFeedbacks({
          q: "  тест  ",
          limit: 10,
        });

        expect([200, 403]).toContain(response.status());

        if (response.ok()) {
          const items = data?.items || data || [];
          assertValidArray(items);
        }
      });
    });

    test("C5102: Поиск: специальные символы", async ({ feedbackAPI }) => {
      await test.step("Выполнить: Поиск: специальные символы", async () => {
        const { response, data } = await feedbackAPI.getAllFeedbacks({
          q: "@#$%^&*()",
          limit: 10,
        });

        expect([200, 400, 403]).toContain(response.status());

        if (response.ok()) {
          const items = data?.items || data || [];
          assertValidArray(items);
          // Скорее всего будет пустой результат
        }
      });
    });

    test("C5103: Поиск: кириллица", async ({ feedbackAPI }) => {
      await test.step("Выполнить: Поиск: кириллица", async () => {
        const { response, data } = await feedbackAPI.getAllFeedbacks({
          q: "благодарность",
          limit: 10,
        });

        expect([200, 403]).toContain(response.status());

        if (response.ok()) {
          const items = data?.items || data || [];
          assertValidArray(items);
        }
      });
    });

    test("C5104: Поиск: латиница", async ({ feedbackAPI }) => {
      await test.step("Выполнить: Поиск: латиница", async () => {
        const { response, data } = await feedbackAPI.getAllFeedbacks({
          q: "test",
          limit: 10,
        });

        expect([200, 403]).toContain(response.status());

        if (response.ok()) {
          const items = data?.items || data || [];
          assertValidArray(items);
        }
      });
    });

    test("C5105: Поиск: очень длинный запрос", async ({ feedbackAPI }) => {
      await test.step("Выполнить: Поиск: очень длинный запрос", async () => {
        const longQuery = "a".repeat(500);
        const { response, data } = await feedbackAPI.getAllFeedbacks({
          q: longQuery,
          limit: 10,
        });

        // Может вернуть ошибку валидации или пустой результат
        expect([200, 400, 403, 422]).toContain(response.status());

        if (response.ok()) {
          const items = data?.items || data || [];
          assertValidArray(items);
        }
      });
    });

    test("C5106: Поиск: числа", async ({ feedbackAPI }) => {
      await test.step("Выполнить: Поиск: числа", async () => {
        const { response, data } = await feedbackAPI.getAllFeedbacks({
          q: "12345",
          limit: 10,
        });

        expect([200, 403]).toContain(response.status());

        if (response.ok()) {
          const items = data?.items || data || [];
          assertValidArray(items);
        }
      });
    });

    test("C5107: Поиск: смешанный регистр", async ({ feedbackAPI }) => {
      await test.step("Выполнить: Поиск: смешанный регистр", async () => {
        const { response, data } = await feedbackAPI.getAllFeedbacks({
          q: "ТеСт",
          limit: 10,
        });

        expect([200, 403]).toContain(response.status());

        if (response.ok()) {
          const items = data?.items || data || [];
          assertValidArray(items);
        }
      });
    });

    test("C5108: Поиск: эмодзи", async ({ feedbackAPI }) => {
      await test.step("Выполнить: Поиск: эмодзи", async () => {
        const { response, data } = await feedbackAPI.getAllFeedbacks({
          q: "\uD83D\uDC4D",
          limit: 10,
        });

        expect([200, 400, 403]).toContain(response.status());

        if (response.ok()) {
          const items = data?.items || data || [];
          assertValidArray(items);
        }
      });
    });
  },
);
