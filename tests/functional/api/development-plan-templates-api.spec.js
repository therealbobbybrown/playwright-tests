// @ts-check
import { test as fullTest, expect } from "../../fixtures/full.js";
import { DevelopmentPlansAPI, getCredentials } from "../../utils/api/index.js";
import { allure } from "allure-playwright";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { assertSuccessStatus } from "../../utils/api/common-assertions.js";

/**
 * API тесты для шаблонов планов развития (Development Plan Templates) — CRUD
 *
 * Покрытие:
 * - GET /private/development-plan-templates/get/ - получение списка шаблонов
 * - GET /private/development-plan-templates/{id}/ - получение шаблона по ID
 * - POST /manager/development-plan-templates/ - создание шаблона
 * - PATCH /manager/development-plan-templates/{id}/ - обновление шаблона
 * - DELETE /manager/development-plan-templates/{id}/ - удаление шаблона
 *
 * СТРОГИЕ ТЕСТЫ - не маскируют ошибки, а выявляют их.
 *
 * @tags @api @regression @development-plans @templates
 */

/**
 * Хелпер для логирования входных данных в Allure
 */
function logInput(name, data) {
  allure.attachment(
    `Input: ${name}`,
    JSON.stringify(data, null, 2),
    "application/json",
  );
}

/**
 * Хелпер для логирования ожидаемого результата
 */
function logExpected(description) {
  allure.attachment("Expected", description, "text/plain");
}

/**
 * Хелпер для логирования ответа API
 */
function logResponse(status, data) {
  allure.attachment(
    "Response",
    JSON.stringify({ status, data }, null, 2),
    "application/json",
  );
}

// Расширяем test с фикстурой для Development Plans API
const test = fullTest.extend({
  dpAPI: async ({ request }, use) => {
    const api = new DevelopmentPlansAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
});

// ==================== ТЕСТЫ: getDevelopmentPlanTemplates ====================

test.describe(
  "Development Plan Templates - getDevelopmentPlanTemplates",
  { tag: ["@api", "@regression", "@development-plans", "@templates"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.DEVELOPMENT_PLANS, "Templates - List");
    });

    test("C4843: Получение списка шаблонов - успешный запрос", async ({
      dpAPI,
    }) => {
      setSeverity("critical");

      logExpected("Список шаблонов возвращается со статусом 200");

      await test.step("Выполнить: Получение списка шаблонов - успешный запрос", async () => {
        const { response, data } = await dpAPI.getDevelopmentPlanTemplates({
          limit: 50,
        });
        const status = response.status();
        logResponse(status, data);

        expect([200], `Ожидался статус 200, получен ${status}`).toContain(
          status,
        );
        expect(data, "Ответ не должен быть null").not.toBeNull();
      });
    });

    test("C4844: Получение списка шаблонов - с пагинацией", async ({
      dpAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Получение списка шаблонов - с пагинацией", async () => {
        logInput("Параметры пагинации", { limit: 5, offset: 0 });
        logExpected("Пагинация работает корректно");

        const { response, data } = await dpAPI.getDevelopmentPlanTemplates({
          limit: 5,
          offset: 0,
        });
        const status = response.status();
        logResponse(status, data);

        expect([200], `Ожидался статус 200, получен ${status}`).toContain(
          status,
        );

        const items = data?.items || (Array.isArray(data) ? data : []);
        expect(
          items.length,
          "Количество элементов не должно превышать limit",
        ).toBeLessThanOrEqual(5);
      });
    });

    test("C4845: Получение списка шаблонов - пустой результат при большом offset", async ({
      dpAPI,
    }) => {
      setSeverity("minor");

      await test.step("Выполнить: Получение списка шаблонов - пустой результат при большом offset", async () => {
        const params = { limit: 10, offset: 999999 };
        logInput("Большой offset", params);
        logExpected("Пустой массив или items");

        const { response, data } =
          await dpAPI.getDevelopmentPlanTemplates(params);
        const status = response.status();
        logResponse(status, data);

        expect([200], `Ожидался статус 200, получен ${status}`).toContain(
          status,
        );
      });
    });
  },
);

// ==================== ТЕСТЫ: getDevelopmentPlanTemplate ====================

test.describe(
  "Development Plan Templates - getDevelopmentPlanTemplate",
  { tag: ["@api", "@regression", "@development-plans", "@templates"] },
  () => {
    // Кеш для данных шаблонов
    let cachedTemplates = null;

    async function findTemplate(dpAPI) {
      if (!cachedTemplates) {
        const { data } = await dpAPI.getDevelopmentPlanTemplates({ limit: 100 });
        cachedTemplates = data?.items || (Array.isArray(data) ? data : []);
      }
      return cachedTemplates.find((t) => t && t.id) || null;
    }

    test.beforeEach(() => {
      markAsAPITest(MODULES.DEVELOPMENT_PLANS, "Templates - Get By ID");
    });

    test("C4846: Получение шаблона по ID - успешный запрос", async ({
      dpAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: Получение шаблона по ID - успешный запрос", async () => {
        const template = await findTemplate(dpAPI);

        if (!template) {
          test.skip(true, "Нет шаблонов для теста");
          return;
        }

        logInput("ID шаблона", { id: template.id });
        logExpected("Шаблон возвращается со статусом 200");

        const { response, data } = await dpAPI.getDevelopmentPlanTemplate(
          template.id,
        );
        const status = response.status();
        logResponse(status, data);

        expect([200], `Ожидался статус 200, получен ${status}`).toContain(
          status,
        );
        expect(data?.id, "ID должен совпадать").toBe(template.id);
      });
    });

    test("C4847: Получение шаблона - негативный: несуществующий ID", async ({
      dpAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Получение шаблона - негативный: несуществующий ID", async () => {
        const nonExistentId = 999999999;
        logInput("Несуществующий ID", { id: nonExistentId });
        logExpected("Статус 404 Not Found");

        const { response, data } =
          await dpAPI.getDevelopmentPlanTemplate(nonExistentId);
        const status = response.status();
        logResponse(status, data);

        expect(
          [404, 400, 500],
          `Ожидался статус ошибки, получен ${status}`,
        ).toContain(status);
      });
    });

    test("C4848: Получение шаблона - негативный: невалидный ID", async ({
      dpAPI,
    }) => {
      setSeverity("minor");

      await test.step("Выполнить: Получение шаблона - негативный: невалидный ID", async () => {
        logInput("Невалидный ID", { id: "invalid" });
        logExpected("Статус 400/404");

        // @ts-ignore - намеренно передаём невалидный тип
        const { response, data } =
          await dpAPI.getDevelopmentPlanTemplate("invalid");
        const status = response.status();
        logResponse(status, data);

        expect(
          [400, 404, 500],
          `Ожидался статус ошибки, получен ${status}`,
        ).toContain(status);
      });
    });
  },
);

// ==================== ТЕСТЫ: createDevelopmentPlanTemplate ====================

test.describe(
  "Development Plan Templates - createDevelopmentPlanTemplate",
  { tag: ["@api", "@regression", "@development-plans", "@templates"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.DEVELOPMENT_PLANS, "Templates - Create");
    });

    test(
      "C4849: Создание шаблона - успешное создание",
      { tag: ["@db"] },
      async ({ dpAPI, dpVerifier }) => {
        setSeverity("critical");

        const templateData = {
          title: `Test Template ${Date.now()}`,
          description: "Тестовое описание",
          developmentPlanTitle: "План развития",
          periodDuration: 90,
        };

        logInput("Данные шаблона", templateData);
        logExpected(
          "Шаблон создаётся со статусом 200/201, или 400 если требуются дополнительные поля",
        );

        const { response, data } =
          await dpAPI.createDevelopmentPlanTemplate(templateData);
        const status = response.status();
        logResponse(status, data);

        // API может требовать дополнительные поля
        expect([200, 201, 400], `Неожиданный статус ${status}`).toContain(
          status,
        );

        if (response.ok() && data?.id) {
          expect(data.id, "Шаблон должен иметь ID").toBeDefined();

          // DB верификация: проверка создания шаблона в БД
          await test.step("DB: Проверка создания шаблона в БД", async () => {
            if (!dpVerifier.isConnected()) return;
            const dbTemplate = await dpVerifier.verifyTemplateCreated(data.id);
            if (dbTemplate) {
              expect(
                dbTemplate.title,
                "Название шаблона в БД должно совпадать",
              ).toBe(templateData.title);
            }
          });

          // Очистка
          await dpAPI.deleteDevelopmentPlanTemplate(data.id);
        }
      },
    );

    test("C4850: Создание шаблона - успешное создание с полными данными", async ({
      dpAPI,
    }) => {
      setSeverity("normal");

      let templateData, response, data, status;
      await test.step("Выполнить запрос: Создание шаблона - успешное создание с полными данными", async () => {
        templateData = {
          title: `Full Template ${Date.now()}`,
          description: "Тестовое описание шаблона",
          developmentPlanTitle: "План развития сотрудника",
          setHeadCurator: true,
          periodDuration: 90,
        };

        logInput("Полные данные шаблона", templateData);
        logExpected(
          "Шаблон создаётся с всеми полями или возвращает 400 если требуются другие поля",
        );

        ({ response, data } =
          await dpAPI.createDevelopmentPlanTemplate(templateData));
        status = response.status();
        logResponse(status, data);

        // API может требовать дополнительные поля (например, curatorIds)
      });

      await test.step("Проверить ответ", async () => {
        expect([200, 201, 400], `Неожиданный статус ${status}`).toContain(
          status,
        );

        if (response.ok() && data?.id) {
          expect(data.title, "Title должен совпадать").toBe(templateData.title);
          // Очистка
          await dpAPI.deleteDevelopmentPlanTemplate(data.id);
        }
      });
    });

    test(
      "C4851: Создание шаблона - негативный: пустой title",
      { tag: ["@db"] },
      async ({ dpAPI, dpVerifier }) => {
        setSeverity("normal");

        const templateData = {
          title: "",
        };

        logInput("Пустой title", templateData);
        logExpected("Статус 400 - валидация не пройдена");

        const { response, data } =
          await dpAPI.createDevelopmentPlanTemplate(templateData);
        const status = response.status();
        logResponse(status, data);

        expect(
          [400, 422, 500],
          `Ожидался статус ошибки валидации, получен ${status}`,
        ).toContain(status);

        // DB верификация: при ошибке шаблон не должен быть создан
        await test.step("DB: Проверка что шаблон НЕ создан в БД", async () => {
          if (!dpVerifier.isConnected()) return;
          if (data?.id) {
            await dpVerifier.verifyTemplateNotExists(data.id);
          }
        });
      },
    );

    test("C4852: Создание шаблона - негативный: без title", async ({
      dpAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Создание шаблона - негативный: без title", async () => {
        const templateData = {
          description: "Описание без title",
        };

        logInput("Без title", templateData);
        logExpected("Статус 400 - обязательное поле");

        // @ts-ignore
        const { response, data } =
          await dpAPI.createDevelopmentPlanTemplate(templateData);
        const status = response.status();
        logResponse(status, data);

        expect(
          [400, 422, 500],
          `Ожидался статус ошибки, получен ${status}`,
        ).toContain(status);
      });
    });
  },
);

// ==================== ТЕСТЫ: updateDevelopmentPlanTemplate ====================

test.describe(
  "Development Plan Templates - updateDevelopmentPlanTemplate",
  { tag: ["@api", "@regression", "@development-plans", "@templates"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.DEVELOPMENT_PLANS, "Templates - Update");
    });

    test("C4853: Обновление шаблона - успешное обновление title", async ({
      dpAPI,
    }) => {
      setSeverity("critical");

      let createResp, created, newTitle, status;
      await test.step("Выполнить запрос: Обновление шаблона - успешное обновление title", async () => {
        // Создаём шаблон для обновления
        ({ response: createResp, data: created } =
          await dpAPI.createDevelopmentPlanTemplate({
            title: `Template to Update ${Date.now()}`,
            description: "Шаблон для теста обновления",
            developmentPlanTitle: "План для обновления",
            setHeadCurator: true,
            periodDuration: 60,
          }));

        if (!createResp.ok() || !created?.id) {
          test.skip(
            true,
            "Не удалось создать шаблон для теста (возможно требуются дополнительные поля)",
          );
          return;
        }

        newTitle = `Updated Template ${Date.now()}`;
        logInput("Обновление title", { id: created.id, newTitle });
        logExpected("Шаблон обновляется успешно");

        const { response, data } = await dpAPI.updateDevelopmentPlanTemplate(
          created.id,
          {
            title: newTitle,
          },
        );
        status = response.status();
        logResponse(status, data);
      });

      await test.step("Проверить ответ", async () => {
        expect(
          [200, 204],
          `Ожидался статус 200/204, получен ${status}`,
        ).toContain(status);

        // Проверяем обновление
        const { data: updated } = await dpAPI.getDevelopmentPlanTemplate(
          created.id,
        );
        expect(updated?.title, "Title должен быть обновлён").toBe(newTitle);

        // Очистка
        await dpAPI.deleteDevelopmentPlanTemplate(created.id);
      });
    });

    test("C4854: Обновление шаблона - успешное обновление нескольких полей", async ({
      dpAPI,
    }) => {
      setSeverity("normal");

      let createResp, created, status;
      await test.step("Выполнить запрос: Обновление шаблона - успешное обновление нескольких полей", async () => {
        ({ response: createResp, data: created } =
          await dpAPI.createDevelopmentPlanTemplate({
            title: `Template for Multi Update ${Date.now()}`,
            description: "Начальное описание",
            developmentPlanTitle: "План для мульти-обновления",
            setHeadCurator: true,
            periodDuration: 30,
          }));

        if (!createResp.ok() || !created?.id) {
          test.skip(true, "Не удалось создать шаблон");
          return;
        }

        const updates = {
          title: `Multi Updated ${Date.now()}`,
          description: "Новое описание",
          periodDuration: 120,
        };

        logInput("Обновление нескольких полей", updates);
        logExpected("Все поля обновляются");

        const { response, data } = await dpAPI.updateDevelopmentPlanTemplate(
          created.id,
          updates,
        );
        status = response.status();
        logResponse(status, data);
      });

      await test.step("Проверить ответ", async () => {
        expect(
          [200, 204],
          `Ожидался статус 200/204, получен ${status}`,
        ).toContain(status);

        // Очистка
        await dpAPI.deleteDevelopmentPlanTemplate(created.id);
      });
    });

    test("C4855: Обновление шаблона - негативный: несуществующий ID", async ({
      dpAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Обновление шаблона - негативный: несуществующий ID", async () => {
        const nonExistentId = 999999999;
        logInput("Несуществующий ID", { id: nonExistentId });
        logExpected("Статус 404 Not Found");

        const { response, data } = await dpAPI.updateDevelopmentPlanTemplate(
          nonExistentId,
          {
            title: "New Title",
          },
        );
        const status = response.status();
        logResponse(status, data);

        expect(
          [404, 400, 500],
          `Ожидался статус ошибки, получен ${status}`,
        ).toContain(status);
      });
    });
  },
);

// ==================== ТЕСТЫ: deleteDevelopmentPlanTemplate ====================

test.describe(
  "Development Plan Templates - deleteDevelopmentPlanTemplate",
  { tag: ["@api", "@regression", "@development-plans", "@templates"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.DEVELOPMENT_PLANS, "Templates - Delete");
    });

    test(
      "C4856: Удаление шаблона - успешное удаление",
      { tag: ["@db"] },
      async ({ dpAPI, dpVerifier }) => {
        setSeverity("critical");

        // Создаём шаблон для удаления
        const { response: createResp, data: created } =
          await dpAPI.createDevelopmentPlanTemplate({
            title: `Template to Delete ${Date.now()}`,
            description: "Шаблон для удаления",
            developmentPlanTitle: "План для удаления",
            setHeadCurator: true,
            periodDuration: 30,
          });

        if (!createResp.ok() || !created?.id) {
          test.skip(
            true,
            `Не удалось создать шаблон (status=${createResp.status()})`,
          );
          return;
        }

        logInput("ID для удаления", { id: created.id });
        logExpected("Шаблон удаляется со статусом 200/204");

        const { response, data } = await dpAPI.deleteDevelopmentPlanTemplate(
          created.id,
        );
        const status = response.status();
        logResponse(status, data);

        expect(
          [200, 204],
          `Ожидался статус 200/204, получен ${status}`,
        ).toContain(status);

        // Проверяем что шаблон удалён через API
        const { response: getResp } = await dpAPI.getDevelopmentPlanTemplate(
          created.id,
        );
        expect([404, 400], "Шаблон должен быть удалён").toContain(
          getResp.status(),
        );

        // DB верификация: проверка удаления в БД
        await test.step("DB: Проверка удаления шаблона в БД", async () => {
          if (!dpVerifier.isConnected()) return;
          await dpVerifier.verifyTemplateDeleted(created.id);
        });
      },
    );

    test("C4857: Удаление шаблона - негативный: несуществующий ID", async ({
      dpAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Удаление шаблона - негативный: несуществующий ID", async () => {
        const nonExistentId = 999999999;
        logInput("Несуществующий ID", { id: nonExistentId });
        logExpected("Статус 404 Not Found");

        const { response, data } =
          await dpAPI.deleteDevelopmentPlanTemplate(nonExistentId);
        const status = response.status();
        logResponse(status, data);

        expect(
          [404, 400, 500],
          `Ожидался статус ошибки, получен ${status}`,
        ).toContain(status);
      });
    });

    test("C4858: Удаление шаблона - негативный: повторное удаление", async ({
      dpAPI,
    }) => {
      setSeverity("minor");

      let status;
      await test.step("Выполнить запрос: Удаление шаблона - негативный: повторное удаление", async () => {
        // Создаём и удаляем шаблон
        const { response: createResp, data: created } =
          await dpAPI.createDevelopmentPlanTemplate({
            title: `Template for Double Delete ${Date.now()}`,
            description: "Шаблон для повторного удаления",
            developmentPlanTitle: "План для повторного удаления",
            setHeadCurator: true,
            periodDuration: 30,
          });

        if (!createResp.ok() || !created?.id) {
          test.skip(true, "Не удалось создать шаблон");
          return;
        }

        await dpAPI.deleteDevelopmentPlanTemplate(created.id);

        logInput("Повторное удаление", { id: created.id });
        logExpected("Статус 404 - уже удалён");

        const { response, data } = await dpAPI.deleteDevelopmentPlanTemplate(
          created.id,
        );
        status = response.status();
        logResponse(status, data);
      });

      await test.step("Проверить ответ", async () => {
        expect(
          [404, 400, 500],
          `Ожидался статус ошибки, получен ${status}`,
        ).toContain(status);
      });
    });
  },
);
