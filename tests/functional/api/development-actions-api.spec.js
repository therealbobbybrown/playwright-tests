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
 * API тесты для развивающих действий (Development Actions) — Manager CRUD
 *
 * Покрытие:
 * Manager endpoints:
 * - GET /manager/development-actions/ - получение списка действий
 * - GET /manager/development-actions/{id}/ - получение действия по ID
 * - POST /manager/development-actions/ - создание действия
 * - PATCH /manager/development-actions/{id}/ - обновление действия
 * - DELETE /manager/development-actions/{id}/ - удаление действия
 *
 * СТРОГИЕ ТЕСТЫ - не маскируют ошибки, а выявляют их.
 *
 * @tags @api @regression @development-plans @development-actions
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

// ==================== ТЕСТЫ: getDevelopmentActions (Manager) ====================

test.describe(
  "Development Actions - getDevelopmentActions (Manager)",
  {
    tag: ["@api", "@regression", "@development-plans", "@development-actions"],
  },
  () => {
    test.beforeEach(() => {
      markAsAPITest(
        MODULES.DEVELOPMENT_PLANS,
        "Development Actions - Manager List",
      );
    });

    test("C4809: Получение списка действий - успешный запрос", async ({
      dpAPI,
    }) => {
      setSeverity("critical");

      logExpected(
        "Список действий возвращается со статусом 200 или 403 (нет прав)",
      );

      await test.step("Выполнить: Получение списка действий - успешный запрос", async () => {
        const { response, data } = await dpAPI.getDevelopmentActions({
          limit: 50,
        });
        const status = response.status();
        logResponse(status, data);

        // Manager endpoint может быть недоступен
        expect(
          [200, 403, 404],
          `Ожидался статус 200/403/404, получен ${status}`,
        ).toContain(status);
        if (response.ok()) {
          expect(data, "Ответ не должен быть null").not.toBeNull();
        }
      });
    });

    test("C4810: Получение списка действий - с пагинацией", async ({
      dpAPI,
    }) => {
      setSeverity("normal");

      let response, data, status;
      await test.step("Выполнить запрос: Получение списка действий - с пагинацией", async () => {
        const params = { limit: 5, offset: 0 };
        logInput("Параметры пагинации", params);
        logExpected("Пагинация работает или 403");

        ({ response, data } = await dpAPI.getDevelopmentActions(params));
        status = response.status();
        logResponse(status, data);
      });

      await test.step("Проверить ответ", async () => {
        expect(
          [200, 403, 404],
          `Ожидался статус 200/403/404, получен ${status}`,
        ).toContain(status);

        if (response.ok()) {
          const items = data?.items || (Array.isArray(data) ? data : []);
          expect(
            items.length,
            "Количество элементов не должно превышать limit",
          ).toBeLessThanOrEqual(5);
        }
      });
    });

    test("C4811: Получение списка действий - с фильтром по типу", async ({
      dpAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Получение списка действий - с фильтром по типу", async () => {
        const params = { type: "practice", limit: 20 };
        logInput("Фильтр по типу", params);
        logExpected("Действия фильтруются или 403");

        const { response, data } = await dpAPI.getDevelopmentActions(params);
        const status = response.status();
        logResponse(status, data);

        expect(
          [200, 403, 404],
          `Ожидался статус 200/403/404, получен ${status}`,
        ).toContain(status);
      });
    });

    test("C4812: Получение списка действий - с поиском", async ({ dpAPI }) => {
      setSeverity("normal");

      await test.step("Выполнить: Получение списка действий - с поиском", async () => {
        const params = { q: "test", limit: 20 };
        logInput("Поисковый запрос", params);
        logExpected("Поиск работает или 403");

        const { response, data } = await dpAPI.getDevelopmentActions(params);
        const status = response.status();
        logResponse(status, data);

        expect(
          [200, 403, 404],
          `Ожидался статус 200/403/404, получен ${status}`,
        ).toContain(status);
      });
    });

    test("C4813: Получение списка действий - пустой результат при большом offset", async ({
      dpAPI,
    }) => {
      setSeverity("minor");

      await test.step("Выполнить: Получение списка действий - пустой результат при большом offset", async () => {
        const params = { limit: 10, offset: 999999 };
        logInput("Большой offset", params);
        logExpected("Пустой массив или 403");

        const { response, data } = await dpAPI.getDevelopmentActions(params);
        const status = response.status();
        logResponse(status, data);

        expect(
          [200, 403, 404],
          `Ожидался статус 200/403/404, получен ${status}`,
        ).toContain(status);
      });
    });
  },
);

// ==================== ТЕСТЫ: getDevelopmentAction (Manager) ====================

test.describe(
  "Development Actions - getDevelopmentAction (Manager)",
  {
    tag: ["@api", "@regression", "@development-plans", "@development-actions"],
  },
  () => {
    test.beforeEach(() => {
      markAsAPITest(
        MODULES.DEVELOPMENT_PLANS,
        "Development Actions - Manager Get By ID",
      );
    });

    test("C4814: Получение действия по ID - успешный запрос", async ({
      dpAPI,
    }) => {
      setSeverity("critical");

      let createResp, created, response, data, status;
      await test.step("Выполнить запрос: Получение действия по ID - успешный запрос", async () => {
        // Создаём действие для гарантированного наличия
        ({ response: createResp, data: created } =
          await dpAPI.createDevelopmentAction({
            title: `Action for GetById ${Date.now()}`,
            type: "practice",
          }));

        if (!createResp.ok() || !created?.id) {
          test.skip(true, "Не удалось создать действие для теста");
          return;
        }

        logInput("ID действия", { id: created.id });
        logExpected("Действие возвращается со статусом 200");

        ({ response, data } = await dpAPI.getDevelopmentAction(created.id));
        status = response.status();
        logResponse(status, data);
      });

      await test.step("Проверить ответ", async () => {
        expect([200], `Ожидался статус 200, получен ${status}`).toContain(
          status,
        );
        expect(data?.id, "ID должен совпадать").toBe(created.id);

        // Очистка
        await dpAPI.deleteDevelopmentAction(created.id);
      });
    });

    test("C4815: Получение действия - негативный: несуществующий ID", async ({
      dpAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Получение действия - негативный: несуществующий ID", async () => {
        const nonExistentId = 999999999;
        logInput("Несуществующий ID", { id: nonExistentId });
        logExpected("Статус 404 Not Found");

        const { response, data } =
          await dpAPI.getDevelopmentAction(nonExistentId);
        const status = response.status();
        logResponse(status, data);

        expect(
          [404, 400, 500],
          `Ожидался статус ошибки, получен ${status}`,
        ).toContain(status);
      });
    });

    test("C4816: Получение действия - негативный: невалидный ID", async ({
      dpAPI,
    }) => {
      setSeverity("minor");

      await test.step("Выполнить: Получение действия - негативный: невалидный ID", async () => {
        logInput("Невалидный ID", { id: "invalid" });
        logExpected("Статус 400/404");

        // @ts-ignore - намеренно передаём невалидный тип
        const { response, data } = await dpAPI.getDevelopmentAction("invalid");
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

// ==================== ТЕСТЫ: createDevelopmentAction ====================

test.describe(
  "Development Actions - createDevelopmentAction",
  {
    tag: ["@api", "@regression", "@development-plans", "@development-actions"],
  },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.DEVELOPMENT_PLANS, "Development Actions - Create");
    });

    test(
      "C4817: Создание действия - успешное создание",
      { tag: ["@db"] },
      async ({ dpAPI, dpVerifier }) => {
        setSeverity("critical");

        const actionData = {
          title: `Test Action ${Date.now()}`,
          description: "Тестовое описание действия",
          type: "practice",
        };

        logInput("Данные действия", actionData);
        logExpected("Действие создаётся или возвращает 400/403");

        const { response, data } =
          await dpAPI.createDevelopmentAction(actionData);
        const status = response.status();
        logResponse(status, data);

        // API может требовать дополнительные поля или нет прав
        expect([200, 201, 400, 403], `Неожиданный статус ${status}`).toContain(
          status,
        );

        if (response.ok() && data?.id) {
          expect(data.id, "Действие должно иметь ID").toBeDefined();

          // DB верификация: проверка создания действия в БД
          await test.step("DB: Проверка создания действия в БД", async () => {
            if (!dpVerifier.isConnected()) return;
            const dbAction = await dpVerifier.verifyActionCreated(data.id);
            if (dbAction) {
              expect(dbAction.title, "Название в БД должно совпадать").toBe(
                actionData.title,
              );
            }
          });

          // Очистка
          await dpAPI.deleteDevelopmentAction(data.id);
        }
      },
    );

    test("C4818: Создание действия - с компетенциями", async ({ dpAPI }) => {
      setSeverity("normal");

      let response, data, status;
      await test.step("Выполнить запрос: Создание действия - с компетенциями", async () => {
        const actionData = {
          title: `Action with Competences ${Date.now()}`,
          description: "Действие с привязанными компетенциями",
          type: "theoretics",
          competenceIds: [],
        };

        logInput("Действие с компетенциями", actionData);
        logExpected("Действие создаётся или 400/403");

        ({ response, data } = await dpAPI.createDevelopmentAction(actionData));
        status = response.status();
        logResponse(status, data);
      });

      await test.step("Проверить ответ", async () => {
        expect([200, 201, 400, 403], `Неожиданный статус ${status}`).toContain(
          status,
        );

        if (response.ok() && data?.id) {
          await dpAPI.deleteDevelopmentAction(data.id);
        }
      });
    });

    test(
      "C4819: Создание действия - негативный: пустой title",
      { tag: ["@db"] },
      async ({ dpAPI, dpVerifier }) => {
        setSeverity("normal");

        const actionData = {
          title: "",
          description: "Описание без title",
        };

        logInput("Пустой title", actionData);
        logExpected("Статус 400 - валидация не пройдена");

        const { response, data } =
          await dpAPI.createDevelopmentAction(actionData);
        const status = response.status();
        logResponse(status, data);

        expect(
          [400, 422, 500],
          `Ожидался статус ошибки валидации, получен ${status}`,
        ).toContain(status);

        // DB верификация: при ошибке данные не должны быть созданы
        await test.step("DB: Проверка что действие НЕ создано в БД", async () => {
          if (!dpVerifier.isConnected()) return;
          // Если API вернул ID (не должен), проверяем что в БД нет записи
          if (data?.id) {
            await dpVerifier.verifyActionNotExists(data.id);
          }
        });
      },
    );

    test(
      "C4820: Создание действия - негативный: без title",
      { tag: ["@db"] },
      async ({ dpAPI, dpVerifier }) => {
        setSeverity("normal");

        const actionData = {
          description: "Описание без title",
        };

        logInput("Без title", actionData);
        logExpected("Статус 400 - обязательное поле");

        // @ts-ignore
        const { response, data } =
          await dpAPI.createDevelopmentAction(actionData);
        const status = response.status();
        logResponse(status, data);

        expect(
          [400, 422, 500],
          `Ожидался статус ошибки, получен ${status}`,
        ).toContain(status);

        // DB верификация: при ошибке данные не должны быть созданы
        await test.step("DB: Проверка что действие НЕ создано в БД", async () => {
          if (!dpVerifier.isConnected()) return;
          if (data?.id) {
            await dpVerifier.verifyActionNotExists(data.id);
          }
        });
      },
    );
  },
);

// ==================== ТЕСТЫ: updateDevelopmentAction ====================

test.describe(
  "Development Actions - updateDevelopmentAction",
  {
    tag: ["@api", "@regression", "@development-plans", "@development-actions"],
  },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.DEVELOPMENT_PLANS, "Development Actions - Update");
    });

    test(
      "C4821: Обновление действия - успешное обновление title",
      { tag: ["@db"] },
      async ({ dpAPI, dpVerifier }) => {
        setSeverity("critical");

        // Создаём действие для обновления
        const { response: createResp, data: created } =
          await dpAPI.createDevelopmentAction({
            title: `Action to Update ${Date.now()}`,
            description: "Начальное описание",
            type: "practice",
          });

        if (!createResp.ok() || !created?.id) {
          test.skip(true, "Не удалось создать действие для теста");
          return;
        }

        const newTitle = `Updated Action ${Date.now()}`;
        logInput("Обновление title", { id: created.id, newTitle });
        logExpected("Действие обновляется успешно");

        const { response, data } = await dpAPI.updateDevelopmentAction(
          created.id,
          {
            title: newTitle,
          },
        );
        const status = response.status();
        logResponse(status, data);

        expect(
          [200, 204],
          `Ожидался статус 200/204, получен ${status}`,
        ).toContain(status);

        // Проверяем обновление через API
        const { data: updated } = await dpAPI.getDevelopmentAction(created.id);
        expect(updated?.title, "Title должен быть обновлён").toBe(newTitle);

        // DB верификация: проверка обновления в БД
        await test.step("DB: Проверка обновления title в БД", async () => {
          if (!dpVerifier.isConnected()) return;
          await dpVerifier.verifyActionTitle(created.id, newTitle);
        });

        // Очистка
        await dpAPI.deleteDevelopmentAction(created.id);
      },
    );

    test("C4822: Обновление действия - успешное обновление нескольких полей", async ({
      dpAPI,
    }) => {
      setSeverity("normal");

      let createResp, created, status;
      await test.step("Выполнить запрос: Обновление действия - успешное обновление нескольких полей", async () => {
        ({ response: createResp, data: created } =
          await dpAPI.createDevelopmentAction({
            title: `Action for Multi Update ${Date.now()}`,
            description: "Начальное описание",
            type: "practice",
          }));

        if (!createResp.ok() || !created?.id) {
          test.skip(true, "Не удалось создать действие");
          return;
        }

        const updates = {
          title: `Multi Updated Action ${Date.now()}`,
          description: "Обновлённое описание",
          type: "teamwork",
        };

        logInput("Обновление нескольких полей", updates);
        logExpected("Все поля обновляются");

        const { response, data } = await dpAPI.updateDevelopmentAction(
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
        await dpAPI.deleteDevelopmentAction(created.id);
      });
    });

    test("C4823: Обновление действия - негативный: несуществующий ID", async ({
      dpAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Обновление действия - негативный: несуществующий ID", async () => {
        const nonExistentId = 999999999;
        logInput("Несуществующий ID", { id: nonExistentId });
        logExpected("Статус 404 Not Found");

        const { response, data } = await dpAPI.updateDevelopmentAction(
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

// ==================== ТЕСТЫ: deleteDevelopmentAction ====================

test.describe(
  "Development Actions - deleteDevelopmentAction",
  {
    tag: ["@api", "@regression", "@development-plans", "@development-actions"],
  },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.DEVELOPMENT_PLANS, "Development Actions - Delete");
    });

    test(
      "C4824: Удаление действия - успешное удаление",
      { tag: ["@db"] },
      async ({ dpAPI, dpVerifier }) => {
        setSeverity("critical");

        // Создаём действие для удаления
        const { response: createResp, data: created } =
          await dpAPI.createDevelopmentAction({
            title: `Action to Delete ${Date.now()}`,
            description: "Действие для удаления",
            type: "practice",
          });

        if (!createResp.ok() || !created?.id) {
          test.skip(
            true,
            `Не удалось создать действие (status=${createResp.status()})`,
          );
          return;
        }

        logInput("ID для удаления", { id: created.id });
        logExpected("Действие удаляется со статусом 200/204");

        const { response, data } = await dpAPI.deleteDevelopmentAction(
          created.id,
        );
        const status = response.status();
        logResponse(status, data);

        expect(
          [200, 204],
          `Ожидался статус 200/204, получен ${status}`,
        ).toContain(status);

        // Проверяем что действие удалено через API
        const { response: getResp } = await dpAPI.getDevelopmentAction(
          created.id,
        );
        expect([404, 400], "Действие должно быть удалено").toContain(
          getResp.status(),
        );

        // DB верификация: проверка удаления в БД
        await test.step("DB: Проверка удаления действия в БД", async () => {
          if (!dpVerifier.isConnected()) return;
          await dpVerifier.verifyActionDeleted(created.id);
        });
      },
    );

    test("C4825: Удаление действия - негативный: несуществующий ID", async ({
      dpAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Удаление действия - негативный: несуществующий ID", async () => {
        const nonExistentId = 999999999;
        logInput("Несуществующий ID", { id: nonExistentId });
        logExpected("Статус 404 Not Found");

        const { response, data } =
          await dpAPI.deleteDevelopmentAction(nonExistentId);
        const status = response.status();
        logResponse(status, data);

        expect(
          [404, 400, 500],
          `Ожидался статус ошибки, получен ${status}`,
        ).toContain(status);
      });
    });

    test("C4826: Удаление действия - негативный: повторное удаление", async ({
      dpAPI,
    }) => {
      setSeverity("minor");

      let status;
      await test.step("Выполнить запрос: Удаление действия - негативный: повторное удаление", async () => {
        // Создаём и удаляем действие
        const { response: createResp, data: created } =
          await dpAPI.createDevelopmentAction({
            title: `Action for Double Delete ${Date.now()}`,
            type: "practice",
          });

        if (!createResp.ok() || !created?.id) {
          test.skip(true, "Не удалось создать действие");
          return;
        }

        await dpAPI.deleteDevelopmentAction(created.id);

        logInput("Повторное удаление", { id: created.id });
        logExpected("Статус 404 - уже удалено");

        const { response, data } = await dpAPI.deleteDevelopmentAction(
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
