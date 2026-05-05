// tests/smoke/api/manager.api.spec.js
// Smoke тесты для менеджерских эндпоинтов

import { test, expect } from "../../fixtures/api.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { assertSuccessStatus } from "../../utils/api/common-assertions.js";

test.describe("Manager API Endpoints", { tag: ["@api", "@regression"] }, () => {
  test.beforeEach(() => {
    markAsAPITest(MODULES.SETTINGS, "Manager API Smoke");
  });

  test.describe("Company Management", { tag: ["@regression"] }, () => {
    test(
      "C4510: GET /manager/company - данные компании",
      { tag: ["@smoke", "@critical"] },
      async ({ adminAPI }) => {
        setSeverity("critical");

        let response, data;

        await test.step("Отправить GET /manager/company (авторизован как admin)", async () => {
          const result = await adminAPI.get("/manager/company");
          response = result.response;
          data = result.data;
        });

        await test.step("Проверить статус ответа: 200 OK", async () => {
          expect(response.status()).toBe(200);
        });

        await test.step("Проверить наличие обязательного поля: id", async () => {
          expect(data).toHaveProperty("id");
        });

        await test.step("Проверить тип поля name: string (если присутствует)", async () => {
          if (data.name !== undefined) {
            expect(typeof data.name).toBe("string");
          }
        });
      },
    );

    test(
      "C4511: GET /manager/company/settings - настройки компании",
      { tag: ["@critical"] },
      async ({ adminAPI }) => {
        setSeverity("critical");

        let response, data;

        await test.step("Отправить GET /manager/company/settings (авторизован как admin)", async () => {
          const result = await adminAPI.get("/manager/company/settings");
          response = result.response;
          data = result.data;
        });

        await test.step("Проверить статус ответа: 200 OK", async () => {
          expect(response.status()).toBe(200);
        });

        await test.step("Проверить наличие данных в ответе", async () => {
          expect(data).toBeDefined();
        });

        await test.step("Проверить тип ответа: object", async () => {
          expect(typeof data).toBe("object");
        });
      },
    );
  });

  test.describe("Departments", { tag: ["@regression"] }, () => {
    test(
      "C4512: GET /manager/departments - список отделов",
      { tag: ["@smoke", "@critical"] },
      async ({ adminAPI }) => {
        setSeverity("critical");

        let response, data, items;

        await test.step("Отправить GET /manager/departments (авторизован как admin)", async () => {
          const result = await adminAPI.get("/manager/departments");
          response = result.response;
          data = result.data;
        });

        await test.step("Проверить статус ответа: 200 OK", async () => {
          expect(response.status()).toBe(200);
        });

        await test.step("Проверить формат ответа: массив или объект", async () => {
          expect(Array.isArray(data) || typeof data === "object").toBe(true);
        });

        await test.step("Извлечь список отделов из ответа", async () => {
          items = Array.isArray(data) ? data : data?.items || [];
          expect(Array.isArray(items)).toBe(true);
        });

        await test.step("Проверить структуру элемента отдела: наличие поля id (если отделы есть)", async () => {
          if (items.length > 0) {
            expect(items[0]).toHaveProperty("id");
          }
        });
      },
    );
  });

  test.describe("Users", { tag: ["@regression"] }, () => {
    test(
      "C4513: GET /manager/users - список пользователей",
      { tag: ["@smoke", "@critical"] },
      async ({ adminAPI }) => {
        setSeverity("critical");

        let response, data, items;

        await test.step("Отправить GET /manager/users (авторизован как admin)", async () => {
          const result = await adminAPI.get("/manager/users");
          response = result.response;
          data = result.data;
        });

        await test.step("Проверить статус ответа: 200 OK", async () => {
          expect(response.status()).toBe(200);
        });

        await test.step("Извлечь список пользователей из ответа", async () => {
          items = Array.isArray(data) ? data : data?.items || [];
          expect(Array.isArray(items)).toBe(true);
        });

        await test.step("Проверить структуру элемента пользователя: наличие поля id (если пользователи есть)", async () => {
          if (items.length > 0) {
            expect(items[0]).toHaveProperty("id");
          }
        });

        await test.step("Проверить тип поля email: string (если поле присутствует)", async () => {
          if (items.length > 0 && items[0].email !== undefined) {
            expect(typeof items[0].email).toBe("string");
          }
        });
      },
    );
  });

  test.describe("User Groups", { tag: ["@regression"] }, () => {
    test(
      "C4514: GET /manager/user-groups - группы пользователей",
      { tag: ["@critical"] },
      async ({ adminAPI }) => {
        setSeverity("critical");

        let response, data, items;

        await test.step("Отправить GET /manager/user-groups (авторизован как admin)", async () => {
          const result = await adminAPI.get("/manager/user-groups");
          response = result.response;
          data = result.data;
        });

        await test.step("Проверить статус ответа: 200 OK", async () => {
          expect(response.status()).toBe(200);
        });

        await test.step("Извлечь список групп из ответа", async () => {
          items = Array.isArray(data) ? data : data?.items || [];
          expect(Array.isArray(items)).toBe(true);
        });

        await test.step("Проверить структуру элемента группы: наличие поля id (если группы есть)", async () => {
          if (items.length > 0) {
            expect(items[0]).toHaveProperty("id");
          }
        });

        await test.step("Проверить тип поля name: string (если поле присутствует)", async () => {
          if (items.length > 0 && items[0].name !== undefined) {
            expect(typeof items[0].name).toBe("string");
          }
        });
      },
    );
  });

  test.describe("Roles", { tag: ["@regression"] }, () => {
    test(
      "C4515: GET /manager/roles - роли",
      { tag: ["@smoke", "@critical"] },
      async ({ adminAPI }) => {
        setSeverity("critical");

        let response, data, items;

        await test.step("Отправить GET /manager/roles (авторизован как admin)", async () => {
          const result = await adminAPI.get("/manager/roles");
          response = result.response;
          data = result.data;
        });

        await test.step("Проверить статус ответа: 200 OK", async () => {
          expect(response.status()).toBe(200);
        });

        await test.step("Извлечь список ролей из ответа", async () => {
          items = Array.isArray(data) ? data : data?.items || [];
          expect(Array.isArray(items)).toBe(true);
        });

        await test.step("Проверить структуру элемента роли: наличие поля id (если роли есть)", async () => {
          if (items.length > 0) {
            expect(items[0]).toHaveProperty("id");
          }
        });

        await test.step("Проверить тип поля name: string (если поле присутствует)", async () => {
          if (items.length > 0 && items[0].name !== undefined) {
            expect(typeof items[0].name).toBe("string");
          }
        });
      },
    );

    test(
      "C4516: GET /manager/permissions - права доступа",
      { tag: ["@critical"] },
      async ({ adminAPI }) => {
        setSeverity("critical");

        let response, data;

        await test.step("Отправить GET /manager/permissions (авторизован как admin)", async () => {
          const result = await adminAPI.get("/manager/permissions");
          response = result.response;
          data = result.data;
        });

        await test.step("Проверить статус ответа: 200 OK", async () => {
          expect(response.status()).toBe(200);
        });

        await test.step("Проверить формат ответа: массив или объект", async () => {
          expect(Array.isArray(data) || typeof data === "object").toBe(true);
        });
      },
    );
  });

  test.describe("Surveys", { tag: ["@regression"] }, () => {
    test(
      "C4517: GET /manager/surveys - список опросов",
      { tag: ["@smoke", "@critical"] },
      async ({ adminAPI }) => {
        setSeverity("critical");

        let response, data, items;

        await test.step("Отправить GET /manager/surveys (авторизован как admin)", async () => {
          const result = await adminAPI.get("/manager/surveys");
          response = result.response;
          data = result.data;
        });

        await test.step("Проверить статус ответа: 200 OK", async () => {
          expect(response.status()).toBe(200);
        });

        await test.step("Извлечь список опросов из ответа", async () => {
          items = Array.isArray(data) ? data : data?.items || [];
          expect(Array.isArray(items)).toBe(true);
        });

        await test.step("Проверить структуру элемента опроса: наличие поля id (если опросы есть)", async () => {
          if (items.length > 0) {
            expect(items[0]).toHaveProperty("id");
          }
        });
      },
    );

    test("C4518: GET /manager/surveys/templates - шаблоны опросов", async ({
      adminAPI,
    }) => {
      setSeverity("normal");

      let response, data, items;

      await test.step("Отправить GET /manager/surveys/templates (авторизован как admin)", async () => {
        const result = await adminAPI.get("/manager/surveys/templates");
        response = result.response;
        data = result.data;
      });

      await test.step("Проверить статус ответа: 200 OK", async () => {
        expect(response.status()).toBe(200);
      });

      await test.step("Извлечь список шаблонов из ответа", async () => {
        items = Array.isArray(data) ? data : data?.items || [];
        expect(Array.isArray(items)).toBe(true);
      });
    });
  });

  test.describe("Performance Reviews", { tag: ["@regression"] }, () => {
    test(
      "C4519: GET /manager/performance-reviews - список оценок",
      { tag: ["@smoke", "@critical"] },
      async ({ adminAPI }) => {
        setSeverity("critical");

        let response, data, items;

        await test.step("Отправить GET /manager/performance-reviews (авторизован как admin)", async () => {
          const result = await adminAPI.get("/manager/performance-reviews");
          response = result.response;
          data = result.data;
        });

        await test.step("Проверить статус ответа: 200 OK", async () => {
          expect(response.status()).toBe(200);
        });

        await test.step("Извлечь список оценок из ответа", async () => {
          items = Array.isArray(data) ? data : data?.items || [];
          expect(Array.isArray(items)).toBe(true);
        });

        await test.step("Проверить структуру элемента оценки: наличие поля id (если оценки есть)", async () => {
          if (items.length > 0) {
            expect(items[0]).toHaveProperty("id");
          }
        });
      },
    );
  });

  test.describe("Feedbacks", { tag: ["@regression"] }, () => {
    test(
      "C4520: GET /manager/feedbacks - список фидбеков",
      { tag: ["@smoke", "@critical"] },
      async ({ adminAPI }) => {
        setSeverity("critical");

        let response, data, items;

        await test.step("Отправить GET /manager/feedbacks (авторизован как admin)", async () => {
          const result = await adminAPI.get("/manager/feedbacks");
          response = result.response;
          data = result.data;
        });

        await test.step("Проверить статус ответа: 200 OK", async () => {
          expect(response.status()).toBe(200);
        });

        await test.step("Извлечь список фидбеков из ответа", async () => {
          items = Array.isArray(data) ? data : data?.items || [];
          expect(Array.isArray(items)).toBe(true);
        });
      },
    );
  });

  test.describe("Competencies", { tag: ["@regression"] }, () => {
    test(
      "C4521: GET /manager/competencies - список компетенций",
      { tag: ["@critical"] },
      async ({ adminAPI }) => {
        setSeverity("critical");

        let response, data, items;

        await test.step("Отправить GET /manager/competencies (авторизован как admin)", async () => {
          const result = await adminAPI.get("/manager/competencies");
          response = result.response;
          data = result.data;
        });

        await test.step("Проверить статус ответа: 200 OK", async () => {
          expect(response.status()).toBe(200);
        });

        await test.step("Извлечь список компетенций из ответа", async () => {
          items = Array.isArray(data) ? data : data?.items || [];
          expect(Array.isArray(items)).toBe(true);
        });
      },
    );

    test("C4522: GET /manager/competence-scales - шкалы компетенций", async ({
      adminAPI,
    }) => {
      setSeverity("normal");

      let response, data, items;

      await test.step("Отправить GET /manager/competence-scales (авторизован как admin)", async () => {
        const result = await adminAPI.get("/manager/competence-scales");
        response = result.response;
        data = result.data;
      });

      await test.step("Проверить статус ответа: 200 OK", async () => {
        expect(response.status()).toBe(200);
      });

      await test.step("Извлечь список шкал из ответа", async () => {
        items = Array.isArray(data) ? data : data?.items || [];
        expect(Array.isArray(items)).toBe(true);
      });
    });
  });

  test.describe("Gifts", { tag: ["@regression"] }, () => {
    test(
      "C4523: GET /manager/gifts - список подарков",
      { tag: ["@critical"] },
      async ({ adminAPI }) => {
        setSeverity("critical");

        let response, data, items;

        await test.step("Отправить GET /manager/gifts (авторизован как admin)", async () => {
          const result = await adminAPI.get("/manager/gifts");
          response = result.response;
          data = result.data;
        });

        await test.step("Проверить статус ответа: 200 OK", async () => {
          expect(response.status()).toBe(200);
        });

        await test.step("Извлечь список подарков из ответа", async () => {
          items = Array.isArray(data) ? data : data?.items || [];
          expect(Array.isArray(items)).toBe(true);
        });
      },
    );
  });

  test.describe("Invite Links", { tag: ["@regression"] }, () => {
    test(
      "C4524: GET /manager/invite-links - ссылки приглашения",
      { tag: ["@critical"] },
      async ({ adminAPI }) => {
        setSeverity("critical");

        let response, data, items;

        await test.step("Отправить GET /manager/invite-links (авторизован как admin)", async () => {
          const result = await adminAPI.get("/manager/invite-links");
          response = result.response;
          data = result.data;
        });

        await test.step("Проверить статус ответа: 200 OK", async () => {
          expect(response.status()).toBe(200);
        });

        await test.step("Извлечь список ссылок из ответа", async () => {
          items = Array.isArray(data) ? data : data?.items || [];
          expect(Array.isArray(items)).toBe(true);
        });
      },
    );
  });
});
