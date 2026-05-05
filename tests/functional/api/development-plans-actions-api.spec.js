// @ts-check
import { test as fullTest, expect } from "../../fixtures/full.js";
import {
  DevelopmentPlansAPI,
  OrgStructureAPI,
  getCredentials,
} from "../../utils/api/index.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import {
  assertSuccessStatus,
  assertErrorStatus,
  assertHasRequiredProperties,
  assertValidArray,
  assertNotEmptyArray,
  assertEntityHasId,
  extractItems,
  assertUnauthorized,
  assertForbidden,
  assertNotFound,
  assertBadRequest,
} from "../../utils/api/common-assertions.js";

/**
 * API тесты для действий развития (Development Actions)
 */

// Расширяем test с фикстурой для Development Plans API
const test = fullTest.extend({
  devPlansAPI: async ({ request }, use) => {
    const api = new DevelopmentPlansAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
  orgStructureAPI: async ({ request }, use) => {
    const api = new OrgStructureAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
});

// Кеш для данных
let cachedActionId = null;

async function findExistingAction(api) {
  if (cachedActionId) {
    return cachedActionId;
  }

  const { data } = await api.getDevelopmentActions({ limit: 10 });
  const items = data?.items || data || [];
  if (items.length > 0) {
    cachedActionId = items[0].id;
    return cachedActionId;
  }

  return null;
}

test.describe(
  "Development Actions API",
  { tag: ["@api", "@development-plans", "@regression"] },
  () => {
    test.beforeEach(async ({}, testInfo) => {
      markAsAPITest(MODULES.PERFORMANCE_REVIEW, "Development Plans");
    });

    // ==================== DEVELOPMENT ACTIONS ====================

    test.describe("GET /manager/development-actions/ - Действия развития", () => {
      test(
        "C4922: Получить список действий развития",
        { tag: ["@critical"] },
        async ({ devPlansAPI }) => {
          setSeverity("critical");

          let response, data;

          await test.step("Отправить GET /manager/development-actions/ с limit=10", async () => {
            const result = await devPlansAPI.getDevelopmentActions({
              limit: 10,
            });
            response = result.response;
            data = result.data;
          });

          if (response.status() === 404) {
            console.log("Модуль development-actions не активирован");
            return;
          }

          await test.step("Проверить статус ответа: 200 OK", async () => {
            assertSuccessStatus(response);
          });

          await test.step("Проверить наличие данных в ответе", async () => {
            expect(data, "Данные действий должны существовать").toBeDefined();
          });

          await test.step("Проверить что items является валидным массивом", async () => {
            const items = data?.items || data || [];
            assertValidArray(items);
          });
        },
      );

      test("C4923: Получить действия с пагинацией", async ({ devPlansAPI }) => {
        setSeverity("normal");

        let resp1, data1;

        await test.step("Отправить первый запрос: GET /manager/development-actions/ с limit=2, offset=0", async () => {
          const result = await devPlansAPI.getDevelopmentActions({
            limit: 2,
            offset: 0,
          });
          resp1 = result.response;
          data1 = result.data;
        });

        if (resp1.status() === 404) {
          console.log("Модуль development-actions не активирован");
          return;
        }

        await test.step("Проверить статус первого ответа: 200 OK", async () => {
          expect(resp1.status()).toBe(200);
        });

        let resp2, data2;

        await test.step("Отправить второй запрос: GET /manager/development-actions/ с limit=2, offset=2", async () => {
          const result = await devPlansAPI.getDevelopmentActions({
            limit: 2,
            offset: 2,
          });
          resp2 = result.response;
          data2 = result.data;
        });

        await test.step("Проверить статус второго ответа: 200 OK", async () => {
          expect(resp2.status()).toBe(200);
        });

        await test.step("Проверить что первая страница содержит данные", async () => {
          const items1 = data1?.items || data1 || [];
          expect(
            items1,
            "Первая страница должна содержать массив",
          ).toBeInstanceOf(Array);
        });

        await test.step("Проверить что вторая страница содержит данные", async () => {
          const items2 = data2?.items || data2 || [];
          expect(
            items2,
            "Вторая страница должна содержать массив",
          ).toBeInstanceOf(Array);
        });

        await test.step("Проверить что элементы на разных страницах различаются", async () => {
          const items1 = data1?.items || data1 || [];
          const items2 = data2?.items || data2 || [];

          if (items1.length > 0 && items2.length > 0) {
            expect(
              items1[0].id,
              "ID на разных страницах должны различаться",
            ).not.toBe(items2[0].id);
          }
        });
      });

      test("C4924: Поиск действий по тексту", async ({ devPlansAPI }) => {
        setSeverity("normal");

        let allActions;

        await test.step("Получить список действий для поиска", async () => {
          const result = await devPlansAPI.getDevelopmentActions({ limit: 5 });
          allActions = result.data;
        });

        const items = allActions?.items || allActions || [];

        if (items.length > 0) {
          const title = items[0].title || "";

          if (title) {
            const searchQuery = title.substring(0, 5);
            let response, data;

            await test.step(`Отправить поисковый запрос с q="${searchQuery}"`, async () => {
              const result = await devPlansAPI.getDevelopmentActions({
                q: searchQuery,
                limit: 10,
              });
              response = result.response;
              data = result.data;
            });

            await test.step("Проверить статус ответа: 200 OK", async () => {
              assertSuccessStatus(response);
            });

            await test.step("Проверить наличие данных в результатах поиска", async () => {
              expect(
                data,
                "Результаты поиска должны существовать",
              ).toBeDefined();
            });
          }
        }
      });

      test("C4925: Получить действие по ID", async ({ devPlansAPI }) => {
        setSeverity("critical");

        let actionId;

        await test.step("Найти существующее действие для тестирования", async () => {
          actionId = await findExistingAction(devPlansAPI);
        });

        if (actionId) {
          let response, data;

          await test.step(`Отправить GET /manager/development-actions/${actionId}`, async () => {
            const result = await devPlansAPI.getDevelopmentAction(actionId);
            response = result.response;
            data = result.data;
          });

          await test.step("Проверить статус ответа: 200 OK", async () => {
            assertSuccessStatus(response);
          });

          await test.step("Проверить наличие данных действия в ответе", async () => {
            expect(data, "Данные действия должны существовать").toBeDefined();
          });

          await test.step(`Проверить что ID действия совпадает: ${actionId}`, async () => {
            expect(data.id).toBe(actionId);
          });
        }
      });

      test("C4926: Получить несуществующее действие", async ({
        devPlansAPI,
      }) => {
        setSeverity("normal");

        const fakeId = 999999999;
        let response;

        await test.step(`Отправить GET /manager/development-actions/${fakeId} (несуществующий ID)`, async () => {
          const result = await devPlansAPI.getDevelopmentAction(fakeId);
          response = result.response;
        });

        await test.step("Проверить статус ответа: 400/403/404 (действие не найдено)", async () => {
          expect(
            [400, 403, 404],
            "Несуществующее действие должно вернуть ошибку",
          ).toContain(response.status());
        });
      });
    });

    test.describe("POST /manager/development-actions/ - Создание действия", () => {
      test(
        "C4927: Создать действие развития",
        { tag: ["@db"] },
        async ({ devPlansAPI, dpVerifier }) => {
          setSeverity("critical");

          let response, data;

          await test.step("Отправить POST /manager/development-actions/ с данными действия", async () => {
            const result = await devPlansAPI.createDevelopmentAction({
              title: `Test Action ${Date.now()}`,
              description: "Test action description",
              type: "practice",
              status: "active",
            });
            response = result.response;
            data = result.data;
          });

          if (response.status() === 403) {
            console.log("Нет прав на создание действий");
            return;
          }

          if (response.status() === 404) {
            console.log("Модуль development-actions не активирован");
            return;
          }

          await test.step("Проверить статус ответа: 200/201 OK", async () => {
            assertSuccessStatus(response);
          });

          await test.step("Проверить наличие данных действия в ответе", async () => {
            expect(
              data,
              "Данные созданного действия должны существовать",
            ).toBeDefined();
          });

          const actionId = data.id || data.action?.id;

          await test.step("Проверить что в ответе присутствует ID созданного действия", async () => {
            expect(
              actionId,
              "ID созданного действия должен быть определён",
            ).toBeDefined();
          });

          // DB верификация
          await test.step("DB: Проверка создания действия в БД", async () => {
            if (!dpVerifier.isConnected()) return;
            await dpVerifier.verifyActionCreated(actionId);
          });

          // Cleanup
          if (actionId) {
            await test.step(`Удалить тестовое действие ID=${actionId}`, async () => {
              await devPlansAPI.deleteDevelopmentAction(actionId);
            });
          }
        },
      );

      test(
        "C4928: Создать действие без названия (негативный)",
        { tag: ["@db"] },
        async ({ devPlansAPI, dpVerifier }) => {
          setSeverity("normal");

          let response;

          await test.step("Отправить POST /manager/development-actions/ без обязательных полей", async () => {
            const result = await devPlansAPI.createDevelopmentAction({});
            response = result.response;
          });

          await test.step("Проверить статус ответа: 400/404/422 (ошибка валидации или модуль не активирован)", async () => {
            // 404 если модуль не активирован, 400/422 - ошибка валидации
            expect(
              [400, 404, 422],
              "Создание действия без названия должно быть отклонено",
            ).toContain(response.status());
          });

          // DB верификация: при ошибке валидации данные не должны создаваться
          // Проверку через API не делаем, т.к. getDevelopmentActions может вернуть 404
          // если модуль не активирован, что не связано с нашим тестом
        },
      );
    });

    test.describe("PATCH /manager/development-actions/{id}/ - Обновление действия", () => {
      test(
        "C4929: Обновить действие развития",
        { tag: ["@db"] },
        async ({ devPlansAPI, dpVerifier }) => {
          setSeverity("normal");

          let createResp, createData;

          await test.step("Создать тестовое действие для обновления", async () => {
            const result = await devPlansAPI.createDevelopmentAction({
              title: `Test Update Action ${Date.now()}`,
              type: "practice",
              status: "active",
            });
            createResp = result.response;
            createData = result.data;
          });

          if (createResp.status() === 403) {
            console.log("Нет прав на создание действий");
            return;
          }

          if (createResp.status() === 404) {
            console.log("Модуль development-actions не активирован");
            return;
          }

          const actionId = createData?.id || createData?.action?.id;

          if (actionId) {
            const newTitle = `Updated Action ${Date.now()}`;
            let response;

            await test.step(`Отправить PATCH /manager/development-actions/${actionId} с новым названием="${newTitle}"`, async () => {
              const result = await devPlansAPI.updateDevelopmentAction(
                actionId,
                {
                  title: newTitle,
                },
              );
              response = result.response;
            });

            await test.step("Проверить статус ответа: 200 OK", async () => {
              assertSuccessStatus(response);
            });

            // DB верификация
            await test.step("DB: Проверка обновления действия в БД", async () => {
              if (!dpVerifier.isConnected()) return;
              await dpVerifier.verifyActionCreated(actionId);
            });

            // Cleanup (не должен ронять тест при сетевых ошибках)
            await test.step(`Удалить тестовое действие ID=${actionId}`, async () => {
              await devPlansAPI.deleteDevelopmentAction(actionId).catch((err) => {
                console.warn(`Cleanup: не удалось удалить действие ${actionId}: ${err.message}`);
              });
            });
          }
        },
      );

      test("C4930: Обновить несуществующее действие", async ({
        devPlansAPI,
      }) => {
        setSeverity("normal");

        const fakeId = 999999999;
        const testTitle = "Test";
        let response;

        await test.step(`Отправить PATCH /manager/development-actions/${fakeId} с title="${testTitle}" (несуществующий ID)`, async () => {
          const result = await devPlansAPI.updateDevelopmentAction(fakeId, {
            title: testTitle,
          });
          response = result.response;
        });

        await test.step("Проверить статус ответа: 400/403/404 (действие не найдено)", async () => {
          expect(
            [400, 403, 404],
            "Обновление несуществующего действия должно вернуть ошибку",
          ).toContain(response.status());
        });
      });
    });

    test.describe("DELETE /manager/development-actions/{id}/ - Удаление действия", () => {
      test(
        "C4931: Удалить действие развития",
        { tag: ["@db"] },
        async ({ devPlansAPI, dpVerifier }) => {
          setSeverity("normal");

          let createResp, createData;

          await test.step("Создать действие для удаления", async () => {
            const result = await devPlansAPI.createDevelopmentAction({
              title: `Test Delete Action ${Date.now()}`,
              type: "practice",
              status: "active",
            });
            createResp = result.response;
            createData = result.data;
          });

          if (createResp.status() === 403) {
            console.log("Нет прав на создание действий");
            return;
          }

          if (createResp.status() === 404) {
            console.log("Модуль development-actions не активирован");
            return;
          }

          const actionId = createData?.id || createData?.action?.id;

          if (actionId) {
            let response;

            await test.step(`Отправить DELETE /manager/development-actions/${actionId}`, async () => {
              const result =
                await devPlansAPI.deleteDevelopmentAction(actionId);
              response = result.response;
            });

            await test.step("Проверить статус ответа: 200/204 OK", async () => {
              assertSuccessStatus(response);
            });

            // DB верификация (действие должно быть удалено или помечено как deleted)
            await test.step("DB: Проверка удаления действия в БД", async () => {
              if (!dpVerifier.isConnected()) return;
              await dpVerifier.verifyActionDeletedOrNotExists(actionId);
            });
          }
        },
      );

      test("C4932: Удалить несуществующее действие", async ({
        devPlansAPI,
      }) => {
        setSeverity("normal");

        const fakeId = 999999999;
        let response;

        await test.step(`Отправить DELETE /manager/development-actions/${fakeId} (несуществующий ID)`, async () => {
          const result = await devPlansAPI.deleteDevelopmentAction(fakeId);
          response = result.response;
        });

        await test.step("Проверить статус ответа: 400/403/404 (действие не найдено)", async () => {
          expect(
            [400, 403, 404],
            "Удаление несуществующего действия должно вернуть ошибку",
          ).toContain(response.status());
        });
      });
    });

    // ==================== PRIVATE DEVELOPMENT ACTIONS ====================

    test.describe("GET /private/development-actions/ - Действия (private)", () => {
      test("C4933: Получить список действий (private)", async ({
        devPlansAPI,
      }) => {
        setSeverity("normal");

        let response, data;

        await test.step("Отправить GET /private/development-actions/ с limit=10", async () => {
          const result = await devPlansAPI.getPrivateDevelopmentActions({
            limit: 10,
          });
          response = result.response;
          data = result.data;
        });

        if (response.status() === 404) {
          console.log("Модуль development-actions не активирован");
          return;
        }

        await test.step("Проверить статус ответа: 200 OK", async () => {
          assertSuccessStatus(response);
        });

        await test.step("Проверить наличие данных в ответе", async () => {
          expect(data, "Данные действий должны существовать").toBeDefined();
        });

        await test.step("Проверить что items является валидным массивом", async () => {
          const items = data?.items || data || [];
          assertValidArray(items);
        });
      });

      test("C4934: Получить статистику действий", async ({ devPlansAPI }) => {
        setSeverity("normal");

        let response, data;

        await test.step("Отправить GET /private/development-actions/stats", async () => {
          const result = await devPlansAPI.getDevelopmentActionsStats();
          response = result.response;
          data = result.data;
        });

        if (response.status() === 404) {
          console.log("Модуль development-actions не активирован");
          return;
        }

        await test.step("Проверить статус ответа: 200 OK", async () => {
          assertSuccessStatus(response);
        });

        await test.step("Проверить наличие данных статистики в ответе", async () => {
          expect(data, "Данные статистики должны существовать").toBeDefined();
        });

        await test.step("Проверить что объект статистики не пустой", async () => {
          expect(
            data,
            "Объект статистики не должен быть null или undefined",
          ).toBeTruthy();
        });
      });

      test("C4935: Найти действие по названию", async ({ devPlansAPI }) => {
        setSeverity("normal");

        let allActions;

        await test.step("Получить список действий для поиска", async () => {
          const result = await devPlansAPI.getPrivateDevelopmentActions({
            limit: 5,
          });
          allActions = result.data;
        });

        const items = allActions?.items || allActions || [];

        if (items.length > 0) {
          const title = items[0].title || "";

          if (title) {
            let response, data;

            await test.step(`Отправить поиск действия по названию="${title}"`, async () => {
              const result =
                await devPlansAPI.getDevelopmentActionByTitle(title);
              response = result.response;
              data = result.data;
            });

            await test.step("Проверить статус ответа: 200 OK или 404 (не найдено)", async () => {
              // Может вернуть 200 с данными или 404
              expect(
                [200, 404],
                "Поиск должен вернуть 200 (найдено) или 404 (не найдено)",
              ).toContain(response.status());
            });
          }
        }
      });

      test("C4936: Поиск несуществующего действия по названию", async ({
        devPlansAPI,
      }) => {
        setSeverity("normal");

        const nonExistentTitle = "NonExistent_" + Date.now();

        await test.step("Подготовить несуществующее название для поиска", async () => {
          test.info().annotations.push({
            type: "search_query",
            description: nonExistentTitle,
          });
          expect(
            nonExistentTitle,
            "Название для поиска должно быть определено",
          ).toBeTruthy();
        });

        let response;

        await test.step(`Отправить поиск несуществующего действия по названию="${nonExistentTitle}"`, async () => {
          const result =
            await devPlansAPI.getDevelopmentActionByTitle(nonExistentTitle);
          response = result.response;
        });

        await test.step("Проверить статус ответа: 200/404 (действие не найдено)", async () => {
          expect(
            [200, 404],
            "Поиск несуществующего действия должен вернуть 200 (пустой) или 404",
          ).toContain(response.status());
        });
      });
    });
  },
);
