// @ts-check
import { expect } from "@playwright/test";
import {
  test,
  getThanksTypeId,
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
  "Feedback API - Types",
  { tag: ["@api", "@feedback", "@types", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.FEEDBACK, "Types");
    });

    test("C5044: GET /private/feedback-types/ - получить список типов благодарностей", async ({
      feedbackAPI,
    }) => {
      setSeverity("critical");
      let response, data, items, firstType;

      await test.step("Отправить GET /private/feedback-types/", async () => {
        const result = await feedbackAPI.getFeedbackTypes();
        response = result.response;
        data = result.data;
      });

      await test.step("Проверить статус ответа: 200 OK", async () => {
        assertSuccessStatus(response);
      });

      await test.step("Проверить наличие данных в ответе", async () => {
        expect(data).toBeDefined();
      });

      await test.step("Извлечь массив типов благодарностей", async () => {
        items = data?.items || data || [];
        assertValidArray(items);
      });

      await test.step("Проверить что список типов не пустой (length > 0)", async () => {
        expect(items.length).toBeGreaterThan(0);
      });

      await test.step("Проверить наличие поля id у первого типа", async () => {
        firstType = items[0];
        expect(firstType).toHaveProperty("id");
      });

      await test.step("Проверить наличие поля name у первого типа", async () => {
        expect(firstType).toHaveProperty("name");
      });

      await test.step("Проверить тип поля id (string или number)", async () => {
        expect(
          typeof firstType.id === "string" || typeof firstType.id === "number",
        ).toBe(true);
      });

      await test.step("Проверить тип поля name (string)", async () => {
        expect(typeof firstType.name).toBe("string");
      });
    });

    test("C5045: Каждый тип содержит обязательные поля", async ({
      feedbackAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: Каждый тип содержит обязательные поля", async () => {
        const { data } = await feedbackAPI.getFeedbackTypes();
        const items = data?.items || data || [];

        // Проверяем что есть хотя бы один тип
        expect(items.length).toBeGreaterThan(0);

        // Каждый тип должен иметь id и name
        for (const type of items) {
          expect(type.id).toBeDefined();
          expect(type.name).toBeDefined();
        }
      });
    });

    test("C5046: GET /private/feedback-types/{id}/ - получить тип по ID", async ({
      feedbackAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: GET /private/feedback-types/{id}/ - получить тип по ID", async () => {
        // Получаем список типов
        const { data: listData } = await feedbackAPI.getFeedbackTypes();
        const items = listData?.items || listData || [];
        test.skip(items.length === 0, "Нет типов благодарностей в системе");

        const typeId = items[0].id;
        const { response, data } =
          await feedbackAPI.getFeedbackTypeById(typeId);

        expect(
          response.ok(),
          `Ожидается 2xx, получено: ${response.status()}`,
        ).toBeTruthy();
        expect(data).toHaveProperty("id", typeId);
        expect(data).toHaveProperty("name");
      });
    });

    test("C5047: GET /private/feedback-types/{id}/ - несуществующий ID возвращает 404", async ({
      feedbackAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: GET /private/feedback-types/{id}/ - несуществующий ID возвращает 404", async () => {
        const { response } = await feedbackAPI.getFeedbackTypeById(999999999);
        expect(response.status()).toBe(404);
      });
    });
  },
);
