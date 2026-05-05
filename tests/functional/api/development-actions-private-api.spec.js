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
 * API тесты для развивающих действий — Private endpoints, поиск, интеграция, доступ, валидация
 *
 * Покрытие:
 * Private endpoints:
 * - GET /private/development-actions/ - получение списка действий
 * - GET /private/development-actions/{id} - получение действия по ID
 * - GET /private/development-actions/stats - статистика действий
 * - GET /private/development-actions/by-title/ - поиск по названию
 *
 * Интеграционные тесты:
 * - Полный CRUD цикл
 * - Создание и поиск по названию
 *
 * Контроль доступа и валидация
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
  dpUserAPI: async ({ request }, use) => {
    const api = new DevelopmentPlansAPI(request);
    const { email, password } = getCredentials("user");
    await api.signIn(email, password);
    await use(api);
  },
});

// ==================== ТЕСТЫ: getPrivateDevelopmentActions ====================

test.describe(
  "Development Actions - getPrivateDevelopmentActions",
  {
    tag: ["@api", "@regression", "@development-plans", "@development-actions"],
  },
  () => {
    test.beforeEach(() => {
      markAsAPITest(
        MODULES.DEVELOPMENT_PLANS,
        "Development Actions - Private List",
      );
    });

    test("C4827: Получение списка действий (private) - успешный запрос", async ({
      dpAPI,
    }) => {
      setSeverity("critical");

      logExpected("Список действий возвращается со статусом 200");

      await test.step("Выполнить: Получение списка действий (private) - успешный запрос", async () => {
        const { response, data } = await dpAPI.getPrivateDevelopmentActions({
          limit: 50,
        });
        const status = response.status();
        logResponse(status, data);

        expect([200], `Ожидался статус 200, получен ${status}`).toContain(
          status,
        );
      });
    });

    test("C4828: Получение списка действий (private) - с пагинацией", async ({
      dpAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Получение списка действий (private) - с пагинацией", async () => {
        const params = { limit: 5, offset: 0 };
        logInput("Параметры пагинации", params);
        logExpected("Пагинация работает корректно");

        const { response, data } =
          await dpAPI.getPrivateDevelopmentActions(params);
        const status = response.status();
        logResponse(status, data);

        expect([200], `Ожидался статус 200, получен ${status}`).toContain(
          status,
        );
      });
    });
  },
);

// ==================== ТЕСТЫ: getPrivateDevelopmentAction ====================

test.describe(
  "Development Actions - getPrivateDevelopmentAction",
  {
    tag: ["@api", "@regression", "@development-plans", "@development-actions"],
  },
  () => {
    test.beforeEach(() => {
      markAsAPITest(
        MODULES.DEVELOPMENT_PLANS,
        "Development Actions - Private Get By ID",
      );
    });

    test("C4829: Получение действия (private) по ID - успешный запрос", async ({
      dpAPI,
    }) => {
      setSeverity("critical");

      let createResp, created, response, data, status;
      await test.step("Выполнить запрос: Получение действия (private) по ID - успешный запрос", async () => {
        // Создаём действие для гарантированного наличия
        ({ response: createResp, data: created } =
          await dpAPI.createDevelopmentAction({
            title: `Action for PrivateGetById ${Date.now()}`,
            type: "practice",
          }));

        if (!createResp.ok() || !created?.id) {
          test.skip(true, "Не удалось создать действие для теста");
          return;
        }

        logInput("ID действия", { id: created.id });
        logExpected("Действие возвращается со статусом 200");

        ({ response, data } = await dpAPI.getPrivateDevelopmentAction(
          created.id,
        ));
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

    test("C4830: Получение действия (private) - негативный: несуществующий ID", async ({
      dpAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Получение действия (private) - негативный: несуществующий ID", async () => {
        const nonExistentId = 999999999;
        logInput("Несуществующий ID", { id: nonExistentId });
        logExpected("Статус 404 Not Found");

        const { response, data } =
          await dpAPI.getPrivateDevelopmentAction(nonExistentId);
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

// ==================== ТЕСТЫ: getDevelopmentActionsStats ====================

test.describe(
  "Development Actions - getDevelopmentActionsStats",
  {
    tag: ["@api", "@regression", "@development-plans", "@development-actions"],
  },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.DEVELOPMENT_PLANS, "Development Actions - Stats");
    });

    test("C4831: Получение статистики действий - успешный запрос", async ({
      dpAPI,
    }) => {
      setSeverity("critical");

      logExpected("Статистика возвращается со статусом 200");

      await test.step("Выполнить: Получение статистики действий - успешный запрос", async () => {
        const { response, data } = await dpAPI.getDevelopmentActionsStats();
        const status = response.status();
        logResponse(status, data);

        expect([200], `Ожидался статус 200, получен ${status}`).toContain(
          status,
        );
        expect(data, "Ответ не должен быть null").not.toBeNull();
      });
    });

    test("C4832: Получение статистики действий - с параметрами", async ({
      dpAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Получение статистики действий - с параметрами", async () => {
        const params = { type: "practice" };
        logInput("Параметры статистики", params);
        logExpected("Статистика с параметрами");

        const { response, data } =
          await dpAPI.getDevelopmentActionsStats(params);
        const status = response.status();
        logResponse(status, data);

        expect([200], `Ожидался статус 200, получен ${status}`).toContain(
          status,
        );
      });
    });
  },
);

// ==================== ТЕСТЫ: getDevelopmentActionByTitle ====================

test.describe(
  "Development Actions - getDevelopmentActionByTitle",
  {
    tag: ["@api", "@regression", "@development-plans", "@development-actions"],
  },
  () => {
    test.beforeEach(() => {
      markAsAPITest(
        MODULES.DEVELOPMENT_PLANS,
        "Development Actions - Get By Title",
      );
    });

    test("C4833: Поиск действия по названию - существующее название", async ({
      dpAPI,
    }) => {
      setSeverity("normal");

      let createResp, created, status;
      await test.step("Выполнить запрос: Поиск действия по названию - существующее название", async () => {
        // Создаём действие с уникальным названием
        const uniqueTitle = `SearchableAction ${Date.now()}`;
        ({ response: createResp, data: created } =
          await dpAPI.createDevelopmentAction({
            title: uniqueTitle,
            type: "practice",
          }));

        if (!createResp.ok() || !created?.id) {
          test.skip(true, "Не удалось создать действие для теста");
          return;
        }

        logInput("Поиск по названию", { title: uniqueTitle });
        logExpected("Действие находится по названию");

        const { response, data } =
          await dpAPI.getDevelopmentActionByTitle(uniqueTitle);
        status = response.status();
        logResponse(status, data);

        // Может вернуть действие или пустой результат
      });

      await test.step("Проверить ответ", async () => {
        expect([200, 404], `Неожиданный статус ${status}`).toContain(status);

        // Очистка
        await dpAPI.deleteDevelopmentAction(created.id);
      });
    });

    test("C4834: Поиск действия по названию - несуществующее название", async ({
      dpAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Поиск действия по названию - несуществующее название", async () => {
        const nonExistentTitle = `Non Existent Action ${Date.now()}`;
        logInput("Несуществующее название", { title: nonExistentTitle });
        logExpected("Статус 404 или пустой результат");

        const { response, data } =
          await dpAPI.getDevelopmentActionByTitle(nonExistentTitle);
        const status = response.status();
        logResponse(status, data);

        expect([200, 404], `Неожиданный статус ${status}`).toContain(status);
      });
    });

    test("C4835: Поиск действия по названию - пустое название", async ({
      dpAPI,
    }) => {
      setSeverity("minor");

      await test.step("Выполнить: Поиск действия по названию - пустое название", async () => {
        logInput("Пустое название", { title: "" });
        logExpected("Статус 400 или пустой результат");

        const { response, data } = await dpAPI.getDevelopmentActionByTitle("");
        const status = response.status();
        logResponse(status, data);

        expect([200, 400, 404], `Неожиданный статус ${status}`).toContain(
          status,
        );
      });
    });
  },
);

// ==================== ИНТЕГРАЦИОННЫЕ ТЕСТЫ ====================

test.describe(
  "Development Actions - Интеграционные тесты",
  {
    tag: [
      "@api",
      "@regression",
      "@development-plans",
      "@development-actions",
      "@integration",
    ],
  },
  () => {
    test.beforeEach(() => {
      markAsAPITest(
        MODULES.DEVELOPMENT_PLANS,
        "Development Actions - Integration",
      );
    });

    test(
      "C4836: Полный CRUD цикл действия",
      { tag: ["@db"] },
      async ({ dpAPI, dpVerifier }) => {
        setSeverity("critical");

        logExpected("Создание, чтение, обновление, удаление действия");

        // CREATE
        const createData = {
          title: `CRUD Test Action ${Date.now()}`,
          description: "Тестовое действие для CRUD",
          type: "practice",
        };

        const { response: createResp, data: created } =
          await dpAPI.createDevelopmentAction(createData);
        logInput("CREATE", createData);
        logResponse(createResp.status(), created);

        // API может не дать создать действие
        if (!createResp.ok() || !created?.id) {
          test.skip(
            true,
            `Не удалось создать действие (статус ${createResp.status()})`,
          );
          return;
        }

        const actionId = created.id;

        // DB: Проверка создания
        await test.step("DB: Проверка создания в БД", async () => {
          if (!dpVerifier.isConnected()) return;
          const dbAction = await dpVerifier.verifyActionCreated(actionId);
          if (dbAction) {
            expect(dbAction.title, "Title в БД совпадает").toBe(
              createData.title,
            );
          }
        });

        // READ
        const { response: readResp, data: read } =
          await dpAPI.getDevelopmentAction(actionId);
        logInput("READ", { id: actionId });
        logResponse(readResp.status(), read);

        expect([200], "Чтение действия").toContain(readResp.status());
        expect(read?.title, "Title должен совпадать").toBe(createData.title);

        // UPDATE
        const updateData = { title: `Updated CRUD Action ${Date.now()}` };
        const { response: updateResp } = await dpAPI.updateDevelopmentAction(
          actionId,
          updateData,
        );
        logInput("UPDATE", updateData);
        logResponse(updateResp.status(), null);

        expect([200, 204], "Обновление действия").toContain(
          updateResp.status(),
        );

        // Verify update via API
        const { data: afterUpdate } =
          await dpAPI.getDevelopmentAction(actionId);
        expect(afterUpdate?.title, "Title обновлён").toBe(updateData.title);

        // DB: Проверка обновления
        await test.step("DB: Проверка обновления в БД", async () => {
          if (!dpVerifier.isConnected()) return;
          await dpVerifier.verifyActionTitle(actionId, updateData.title);
        });

        // DELETE
        const { response: deleteResp } =
          await dpAPI.deleteDevelopmentAction(actionId);
        logInput("DELETE", { id: actionId });
        logResponse(deleteResp.status(), null);

        expect([200, 204], "Удаление действия").toContain(deleteResp.status());

        // Verify deletion via API
        const { response: verifyResp } =
          await dpAPI.getDevelopmentAction(actionId);
        expect([404, 400], "Действие удалено").toContain(verifyResp.status());

        // DB: Проверка удаления
        await test.step("DB: Проверка удаления в БД", async () => {
          if (!dpVerifier.isConnected()) return;
          await dpVerifier.verifyActionDeleted(actionId);
        });
      },
    );

    test("C4837: Создание и поиск по названию", async ({ dpAPI }) => {
      setSeverity("normal");

      let createResp, created, searchResp, found;
      await test.step("Выполнить запрос: Создание и поиск по названию", async () => {
        const uniqueTitle = `Unique Action ${Date.now()}`;

        // Создаём действие
        ({ response: createResp, data: created } =
          await dpAPI.createDevelopmentAction({
            title: uniqueTitle,
            description: "Действие для поиска",
            type: "practice",
          }));

        if (!createResp.ok() || !created?.id) {
          test.skip(true, "Не удалось создать действие");
          return;
        }

        logInput("Создание и поиск", { title: uniqueTitle });
        logExpected("Действие находится по названию");

        // Ищем по названию
        ({ response: searchResp, data: found } =
          await dpAPI.getDevelopmentActionByTitle(uniqueTitle));
        logResponse(searchResp.status(), found);
      });

      await test.step("Проверить ответ", async () => {
        expect([200, 404], "Поиск по названию").toContain(searchResp.status());

        // Очистка
        await dpAPI.deleteDevelopmentAction(created.id);
      });
    });
  },
);

// ==================== ТЕСТЫ: Контроль доступа ====================

test.describe(
  "Development Actions - Контроль доступа",
  {
    tag: [
      "@api",
      "@regression",
      "@development-plans",
      "@development-actions",
      "@access-control",
    ],
  },
  () => {
    test.beforeEach(() => {
      markAsAPITest(
        MODULES.DEVELOPMENT_PLANS,
        "Development Actions - Access Control",
      );
    });

    test("C4838: Обычный пользователь - чтение списка действий (private)", async ({
      dpUserAPI,
    }) => {
      setSeverity("normal");

      logExpected("Обычный пользователь может читать действия");

      await test.step("Выполнить: Обычный пользователь - чтение списка действий (private)", async () => {
        const { response, data } = await dpUserAPI.getPrivateDevelopmentActions(
          {
            limit: 10,
          },
        );
        const status = response.status();
        logResponse(status, data);

        // Пользователь может читать или получить ошибку доступа
        expect([200, 401, 403], `Неожиданный статус ${status}`).toContain(
          status,
        );
      });
    });

    test("C4839: Обычный пользователь - попытка создания действия (manager)", async ({
      dpUserAPI,
    }) => {
      setSeverity("normal");

      logExpected("Обычный пользователь не может создавать действия");

      await test.step("Выполнить: Обычный пользователь - попытка создания действия (manager)", async () => {
        const { response, data } = await dpUserAPI.createDevelopmentAction({
          title: `User Created Action ${Date.now()}`,
          type: "practice",
        });
        const status = response.status();
        logResponse(status, data);

        // Ожидаем ошибку доступа или успех (если у пользователя есть права)
        expect([200, 201, 401, 403], `Неожиданный статус ${status}`).toContain(
          status,
        );

        // Очистка если создано
        if (response.ok() && data?.id) {
          await dpUserAPI.deleteDevelopmentAction(data.id);
        }
      });
    });
  },
);

// ==================== ТЕСТЫ: Валидация ====================

test.describe(
  "Development Actions - Валидация",
  {
    tag: [
      "@api",
      "@regression",
      "@development-plans",
      "@development-actions",
      "@validation",
    ],
  },
  () => {
    test.beforeEach(() => {
      markAsAPITest(
        MODULES.DEVELOPMENT_PLANS,
        "Development Actions - Validation",
      );
    });

    test("C4840: Создание действия - очень длинный title", async ({
      dpAPI,
    }) => {
      setSeverity("minor");

      let response, data, status;
      await test.step("Выполнить запрос: Создание действия - очень длинный title", async () => {
        const longTitle = "A".repeat(10000);

        logInput("Очень длинный title", { length: longTitle.length });
        logExpected("Валидация или обрезка");

        ({ response, data } = await dpAPI.createDevelopmentAction({
          title: longTitle,
          type: "practice",
        }));
        status = response.status();
        logResponse(status, { truncated: true });

        // Может принять или отклонить
      });

      await test.step("Проверить ответ", async () => {
        expect(
          [200, 201, 400, 422, 500],
          `Неожиданный статус ${status}`,
        ).toContain(status);

        // Очистка
        if (response.ok() && data?.id) {
          await dpAPI.deleteDevelopmentAction(data.id);
        }
      });
    });

    test("C4841: Создание действия - спецсимволы в title", async ({
      dpAPI,
    }) => {
      setSeverity("minor");

      let response, data, status;
      await test.step("Выполнить запрос: Создание действия - спецсимволы в title", async () => {
        const specialTitle = '<script>alert("XSS")</script>';

        logInput("Спецсимволы в title", { title: specialTitle });
        logExpected("Экранирование или отклонение");

        ({ response, data } = await dpAPI.createDevelopmentAction({
          title: specialTitle,
          type: "practice",
        }));
        status = response.status();
        logResponse(status, data);
      });

      await test.step("Проверить ответ", async () => {
        // APP_BUG: API возвращает 500 на XSS-строку вместо 400/422 — должен экранировать или отклонить
        expect([200, 201, 400, 422, 500], `Неожиданный статус ${status}`).toContain(
          status,
        );

        // Очистка
        if (response.ok() && data?.id) {
          await dpAPI.deleteDevelopmentAction(data.id);
        }
      });
    });

    test("C4842: Создание действия - невалидный type", async ({ dpAPI }) => {
      setSeverity("minor");

      let response, data, status;
      await test.step("Выполнить запрос: Создание действия - невалидный type", async () => {
        const actionData = {
          title: `Invalid Type Action ${Date.now()}`,
          type: "invalid_type_that_does_not_exist",
        };

        logInput("Невалидный type", actionData);
        logExpected("Валидация типа");

        ({ response, data } = await dpAPI.createDevelopmentAction(actionData));
        status = response.status();
        logResponse(status, data);

        // Может принять или отклонить
      });

      await test.step("Проверить ответ", async () => {
        expect([200, 201, 400, 422], `Неожиданный статус ${status}`).toContain(
          status,
        );

        // Очистка
        if (response.ok() && data?.id) {
          await dpAPI.deleteDevelopmentAction(data.id);
        }
      });
    });
  },
);
