// tests/smoke/api/health.api.spec.js
// Smoke тесты для проверки доступности API

import { test, expect } from "../../fixtures/api.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { assertSuccessStatus } from "../../utils/api/common-assertions.js";

test.describe(
  "API Health Check",
  { tag: ["@api", "@critical", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.HOME, "Health Check");
    });

    test(
      "C4507: GET /health - API доступен",
      { tag: ["@smoke", "@critical"] },
      async ({ apiClient }) => {
        setSeverity("critical");
        let response;
        let data;

        await test.step("Отправить GET /health", async () => {
          const result = await apiClient.get("/health");
          response = result.response;
          data = result.data;
        });

        await test.step("Проверить статус ответа: 200 OK", async () => {
          expect(response.status()).toBe(200);
        });

        await test.step("Проверить тело ответа: не пустое", async () => {
          expect(data).toBeDefined();
        });
      },
    );

    test(
      "C4508: GET /status - статус API",
      { tag: ["@critical"] },
      async ({ apiClient }) => {
        setSeverity("critical");
        let response;
        let data;

        await test.step("Отправить GET /status", async () => {
          const result = await apiClient.get("/status");
          response = result.response;
          data = result.data;
        });

        await test.step("Проверить статус ответа: 200 OK", async () => {
          expect(response.status()).toBe(200);
        });

        await test.step("Проверить тело ответа: не пустое", async () => {
          expect(data).toBeDefined();
        });
      },
    );

    test("C4509: GET /exceptions - список исключений (требует авторизации или публичный)", async ({
      apiClient,
    }) => {
      setSeverity("normal");
      let response;
      let status;

      await test.step("Отправить GET /exceptions", async () => {
        const result = await apiClient.get("/exceptions");
        response = result.response;
        status = response.status();
      });

      await test.step("Проверить статус ответа: 200, 401 или 403", async () => {
        // Может вернуть 200 или 401 в зависимости от настроек
        expect([200, 401, 403]).toContain(status);
      });

      await test.step("Проверить корректность статуса: один из допустимых значений", async () => {
        expect(status).toBeGreaterThanOrEqual(200);
        expect(status).toBeLessThan(500);
      });
    });
  },
);
