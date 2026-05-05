// tests/smoke/api/private.api.spec.js
// Smoke тесты для приватных эндпоинтов

import { test, expect } from "../../fixtures/api.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { assertSuccessStatus } from "../../utils/api/common-assertions.js";

test.describe("Private API Endpoints", { tag: ["@api", "@regression"] }, () => {
  test.beforeEach(() => {
    markAsAPITest(MODULES.SETTINGS, "Private API Smoke");
  });

  test.describe("Company", { tag: ["@regression"] }, () => {
    test(
      "C4525: GET /private/company/settings - настройки компании",
      { tag: ["@critical"] },
      async ({ adminAPI }) => {
        setSeverity("critical");
        let response, data;

        await test.step("Отправить GET /private/company/settings (авторизован как admin)", async () => {
          const result = await adminAPI.get("/private/company/settings");
          response = result.response;
          data = result.data;
        });

        await test.step("Проверить статус ответа: 200 OK", async () => {
          expect(response.status()).toBe(200);
        });

        await test.step("Проверить что settings является объектом", async () => {
          expect(typeof data).toBe("object");
        });

        await test.step("Проверить что settings определён (не null/undefined)", async () => {
          expect(data).toBeDefined();
        });
      },
    );

    test("C4526: GET /private/company/admin-email - email администратора", async ({
      adminAPI,
    }) => {
      setSeverity("normal");
      let response, data;

      await test.step("Отправить GET /private/company/admin-email (авторизован как admin)", async () => {
        const result = await adminAPI.get("/private/company/admin-email");
        response = result.response;
        data = result.data;
      });

      await test.step("Проверить статус ответа: 200 OK", async () => {
        expect(response.status()).toBe(200);
      });

      await test.step("Проверить формат admin-email (строка или объект с полем email)", async () => {
        // Email может быть строкой напрямую или объектом с email
        if (typeof data === "string") {
          expect(data.length).toBeGreaterThan(0);
        } else if (data?.email !== undefined) {
          expect(typeof data.email).toBe("string");
        }
      });
    });
  });

  test.describe("Users", { tag: ["@regression"] }, () => {
    test(
      "C4527: GET /private/users - список пользователей",
      { tag: ["@critical"] },
      async ({ adminAPI }) => {
        setSeverity("critical");
        let response, data;

        await test.step("Отправить GET /private/users (авторизован как admin)", async () => {
          const result = await adminAPI.get("/private/users");
          response = result.response;
          data = result.data;
        });

        await test.step("Проверить статус ответа: 200 OK", async () => {
          expect(response.status()).toBe(200);
        });

        await test.step("Проверить что ответ содержит массив или объект с items", async () => {
          expect(Array.isArray(data) || data.items).toBeTruthy();
        });

        await test.step("Проверить структуру элементов списка пользователей: наличие поля id", async () => {
          const items = Array.isArray(data) ? data : data?.items || [];
          if (items.length > 0) {
            expect(items[0]).toHaveProperty("id");
          }
        });
      },
    );

    test("C4528: GET /private/users/stats - статистика пользователей", async ({
      adminAPI,
    }) => {
      setSeverity("normal");
      let response, data;

      await test.step("Отправить GET /private/users/stats (авторизован как admin)", async () => {
        const result = await adminAPI.get("/private/users/stats");
        response = result.response;
        data = result.data;
      });

      await test.step("Проверить статус ответа: 200 OK", async () => {
        expect(response.status()).toBe(200);
      });

      await test.step("Проверить что stats является объектом", async () => {
        expect(typeof data).toBe("object");
      });

      await test.step("Проверить что stats определён (не null/undefined)", async () => {
        expect(data).toBeDefined();
      });

      await test.step("Проверить поле total: тип number, значение >= 0", async () => {
        if (data.total !== undefined) {
          expect(typeof data.total).toBe("number");
          expect(data.total).toBeGreaterThanOrEqual(0);
        }
      });

      await test.step("Проверить поле active: тип number", async () => {
        if (data.active !== undefined) {
          expect(typeof data.active).toBe("number");
        }
      });
    });
  });

  test.describe("Departments", { tag: ["@regression"] }, () => {
    test(
      "C4529: GET /private/departments - список отделов",
      { tag: ["@critical"] },
      async ({ adminAPI }) => {
        setSeverity("critical");
        let response, data;

        await test.step("Отправить GET /private/departments (авторизован как admin)", async () => {
          const result = await adminAPI.get("/private/departments");
          response = result.response;
          data = result.data;
        });

        await test.step("Проверить статус ответа: 200 OK", async () => {
          expect(response.status()).toBe(200);
        });

        await test.step("Проверить что departments — массив или объект с items", async () => {
          const items = Array.isArray(data) ? data : data?.items || [];
          expect(Array.isArray(items)).toBe(true);
        });

        await test.step("Проверить структуру элементов списка отделов: наличие поля id", async () => {
          const items = Array.isArray(data) ? data : data?.items || [];
          if (items.length > 0) {
            expect(items[0]).toHaveProperty("id");
          }
        });
      },
    );
  });

  test.describe("Org Structure", { tag: ["@regression"] }, () => {
    test(
      "C4530: GET /private/org-struct/departments/flat-tree - дерево отделов",
      { tag: ["@critical"] },
      async ({ adminAPI }) => {
        setSeverity("critical");
        let response, data;

        await test.step("Отправить GET /private/org-struct/departments/flat-tree (авторизован как admin)", async () => {
          const result = await adminAPI.get(
            "/private/org-struct/departments/flat-tree",
          );
          response = result.response;
          data = result.data;
        });

        await test.step("Проверить статус ответа: 200 OK", async () => {
          expect(response.status()).toBe(200);
        });

        await test.step("Проверить что flat-tree — массив или объект с items", async () => {
          const items = Array.isArray(data) ? data : data?.items || [];
          expect(Array.isArray(items)).toBe(true);
        });
      },
    );

    test(
      "C4531: GET /private/org-struct/me/info - информация о текущем пользователе в оргструктуре",
      { tag: ["@critical"] },
      async ({ adminAPI }) => {
        setSeverity("critical");
        let response, data;

        await test.step("Отправить GET /private/org-struct/me/info (авторизован как admin)", async () => {
          const result = await adminAPI.get("/private/org-struct/me/info");
          response = result.response;
          data = result.data;
        });

        await test.step("Проверить статус ответа: 200 OK", async () => {
          expect(response.status()).toBe(200);
        });

        await test.step("Проверить что me/info является объектом", async () => {
          expect(typeof data).toBe("object");
        });

        await test.step("Проверить что me/info определён (не null/undefined)", async () => {
          expect(data).toBeDefined();
        });

        await test.step("Проверить поле id: тип string или number", async () => {
          if (data.id !== undefined) {
            expect(
              typeof data.id === "string" || typeof data.id === "number",
            ).toBe(true);
          }
        });
      },
    );
  });

  test.describe("Roles", { tag: ["@regression"] }, () => {
    test(
      "C4532: GET /private/roles - список ролей",
      { tag: ["@critical"] },
      async ({ adminAPI }) => {
        setSeverity("critical");
        let response, data;

        await test.step("Отправить GET /private/roles (авторизован как admin)", async () => {
          const result = await adminAPI.get("/private/roles");
          response = result.response;
          data = result.data;
        });

        await test.step("Проверить статус ответа: 200 OK", async () => {
          expect(response.status()).toBe(200);
        });

        await test.step("Проверить что roles — массив или объект с items", async () => {
          const items = Array.isArray(data) ? data : data?.items || [];
          expect(Array.isArray(items)).toBe(true);
        });

        await test.step("Проверить структуру элементов списка ролей: наличие поля id", async () => {
          const items = Array.isArray(data) ? data : data?.items || [];
          if (items.length > 0) {
            expect(items[0]).toHaveProperty("id");
          }
        });
      },
    );
  });

  test.describe("Notifications", { tag: ["@regression"] }, () => {
    test(
      "C4533: GET /private/notifications/unread-count - количество непрочитанных уведомлений",
      { tag: ["@critical"] },
      async ({ adminAPI }) => {
        setSeverity("critical");
        let response, data;

        await test.step("Отправить GET /private/notifications/unread-count (авторизован как admin)", async () => {
          const result = await adminAPI.get(
            "/private/notifications/unread-count",
          );
          response = result.response;
          data = result.data;
        });

        await test.step("Проверить статус ответа: 200 OK", async () => {
          expect(response.status()).toBe(200);
        });

        await test.step("Проверить формат unread-count: число или объект с count/unreadCount, значение >= 0", async () => {
          // Количество непрочитанных может быть числом напрямую или объектом с count
          if (typeof data === "number") {
            expect(data).toBeGreaterThanOrEqual(0);
          } else if (data?.count !== undefined) {
            expect(typeof data.count).toBe("number");
            expect(data.count).toBeGreaterThanOrEqual(0);
          } else if (data?.unreadCount !== undefined) {
            expect(typeof data.unreadCount).toBe("number");
            expect(data.unreadCount).toBeGreaterThanOrEqual(0);
          }
        });
      },
    );
  });
});
