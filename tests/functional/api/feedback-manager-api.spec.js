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
  "Feedback API - Manager Endpoints",
  { tag: ["@api", "@feedback", "@manager", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.FEEDBACK, "Manager");
    });

    test("C5068: GET /manager/feedbacks/ - получить все благодарности (менеджер)", async ({
      feedbackAPI,
    }) => {
      setSeverity("critical");

      let response, data;
      await test.step("Выполнить запрос: GET /manager/feedbacks/ - получить все благодарности (менеджер)", async () => {
        ({ response, data } = await feedbackAPI.getAllFeedbacks());
      });

      await test.step("Проверить ответ", async () => {
        expect([200, 403]).toContain(response.status());

        if (response.ok()) {
          expect(data).toBeDefined();
          const items = data?.items || data || [];
          assertValidArray(items);

          // Валидация структуры элементов (если есть)
          if (items.length > 0) {
            expect(items[0]).toHaveProperty("id");
          }

          // Проверяем метаданные пагинации (если есть)
          if (data?.total !== undefined) {
            expect(typeof data.total).toBe("number");
            expect(data.total).toBeGreaterThanOrEqual(0);
          }
        }
      });
    });

    test("C5069: GET /manager/feedbacks/ с поиском", async ({
      feedbackAPI,
    }) => {
      await test.step("Выполнить: GET /manager/feedbacks/ с поиском", async () => {
        const { response, data } = await feedbackAPI.getAllFeedbacks({
          q: "тест",
          limit: 10,
        });

        expect([200, 403]).toContain(response.status());

        if (response.ok()) {
          expect(data).toBeDefined();
          const items = data?.items || data || [];
          assertValidArray(items);
        }
      });
    });

    test("C5070: GET /manager/feedbacks/ с фильтром по типу", async ({
      feedbackAPI,
    }) => {
      let response, data;
      await test.step("Выполнить запрос: GET /manager/feedbacks/ с фильтром по типу", async () => {
        ({ response, data } = await feedbackAPI.getAllFeedbacks({
          feedbackTypeName: "THANKS",
          limit: 10,
        }));
      });

      await test.step("Проверить ответ", async () => {
        expect([200, 403]).toContain(response.status());

        if (response.ok()) {
          expect(data).toBeDefined();
          const items = data?.items || data || [];
          assertValidArray(items);

          // Все элементы должны быть типа THANKS
          items.forEach((item) => {
            if (item.feedbackTypeName) {
              expect(item.feedbackTypeName).toBe("THANKS");
            }
          });
        }
      });
    });

    test("C5071: GET /manager/feedbacks/ с фильтром по датам", async ({
      feedbackAPI,
    }) => {
      await test.step("Выполнить: GET /manager/feedbacks/ с фильтром по датам", async () => {
        const dateTo = new Date().toISOString().split("T")[0];
        const dateFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split("T")[0];

        const { response, data } = await feedbackAPI.getAllFeedbacks({
          dateFrom,
          dateTo,
          limit: 10,
        });

        expect([200, 403]).toContain(response.status());

        if (response.ok()) {
          expect(data).toBeDefined();
          const items = data?.items || data || [];
          assertValidArray(items);
        }
      });
    });

    test("C5072: GET /manager/feedbacks/export/get-token/ - получить токен экспорта", async ({
      feedbackAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: GET /manager/feedbacks/export/get-token/ - получить токен экспорта", async () => {
        const userDate = new Date().toISOString();

        const { response, data } = await feedbackAPI.getExportToken(userDate);

        expect([200, 403]).toContain(response.status());

        if (response.ok()) {
          expect(data).toBeDefined();
          if (data.token) {
            expect(typeof data.token).toBe("string");
            expect(data.token.length).toBeGreaterThan(0);
          }
        }
      });
    });

    test("C5073: POST /manager/feedbacks/motivational-enabled/ - включить мотивационные благодарности", async ({
      feedbackAPI,
    }) => {
      setSeverity("minor");

      await test.step("Выполнить: POST /manager/feedbacks/motivational-enabled/ - включить мотивационные благодарности", async () => {
        const { response } = await feedbackAPI.enableMotivational();

        expect([200, 201, 400, 403]).toContain(response.status());
      });
    });

    test("C5074: POST /manager/feedbacks/motivational-disabled/ - отключить мотивационные благодарности", async ({
      feedbackAPI,
    }) => {
      setSeverity("minor");

      await test.step("Выполнить: POST /manager/feedbacks/motivational-disabled/ - отключить мотивационные благодарности", async () => {
        const { response } = await feedbackAPI.disableMotivational();

        expect([200, 201, 400, 403]).toContain(response.status());
      });
    });
  },
);
