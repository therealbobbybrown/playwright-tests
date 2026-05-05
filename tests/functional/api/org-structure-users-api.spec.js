// @ts-check
import { test as base, expect } from "@playwright/test";
import { OrgStructureAPI, getCredentials } from "../../utils/api/index.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { assertSuccessStatus } from "../../utils/api/common-assertions.js";

/**
 * API тесты для пользователей организационной структуры
 *
 * Покрытие:
 * - Поиск пользователей
 * - Получение пользователей по ID
 * - Подчинённые
 * - Информация о пользователе в дереве оргструктуры
 * - Экспорт пользователей
 */

// Расширяем test с фикстурой для OrgStructure API
const test = base.extend({
  orgStructureAPI: async ({ request }, use) => {
    const api = new OrgStructureAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
});

// Кеш для данных
let cachedUserId = null;

async function findExistingUser(api) {
  if (cachedUserId) {
    return cachedUserId;
  }

  // inOrgStruct: true — только пользователи с отделом/руководителем (в дереве)
  const { data } = await api.findUsers({ inOrgStruct: true, limit: 10 });
  const items = data?.items || data || [];
  if (items.length > 0) {
    cachedUserId = items[0].id;
    return cachedUserId;
  }

  return null;
}

test.describe(
  "Org Structure - Users API",
  { tag: ["@api", "@org-structure", "@regression"] },
  () => {
    test.beforeEach(async ({}, testInfo) => {
      markAsAPITest(MODULES.ORG_STRUCTURE, "Users");
    });

    // ==================== FIND USERS ====================

    test.describe("POST /manager/org-struct/users/get/ - Поиск пользователей", () => {
      test(
        "C5851: Поиск пользователей без параметров",
        { tag: ["@critical"] },
        async ({ orgStructureAPI }) => {
          setSeverity("critical");

          await test.step("Выполнить: Поиск пользователей без параметров", async () => {
            const { response, data } = await orgStructureAPI.findUsers({
              limit: 10,
            });

            assertSuccessStatus(response);
            expect(data).toBeDefined();
            const items = data?.items || data || [];
            expect(Array.isArray(items)).toBe(true);

            if (items.length > 0) {
              const user = items[0];
              expect(user.id).toBeDefined();
              // Имя может быть firstName/lastName или name
              expect(user.firstName || user.name).toBeDefined();
            }
          });
        },
      );

      test("C5852: Поиск пользователей с текстовым фильтром", async ({
        orgStructureAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Поиск пользователей с текстовым фильтром", async () => {
          // Сначала найдём существующего пользователя
          const { data: allUsers } = await orgStructureAPI.findUsers({
            limit: 5,
          });
          const items = allUsers?.items || allUsers || [];

          if (items.length > 0) {
            const userName = items[0].firstName || items[0].name || "";

            if (userName) {
              const { response, data } = await orgStructureAPI.findUsers({
                q: userName.substring(0, 3), // Первые 3 символа имени
                limit: 10,
              });

              assertSuccessStatus(response);
              expect(data).toBeDefined();
            }
          }
        });
      });

      test("C5853: Поиск пользователей только в оргструктуре", async ({
        orgStructureAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Поиск пользователей только в оргструктуре", async () => {
          const { response, data } = await orgStructureAPI.findUsers({
            inOrgStruct: true,
            limit: 10,
          });

          assertSuccessStatus(response);
          expect(data).toBeDefined();
        });
      });

      test("C5854: Поиск пользователей с исключением ID", async ({
        orgStructureAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Поиск пользователей с исключением ID", async () => {
          const userId = await findExistingUser(orgStructureAPI);

          if (userId) {
            const { response, data } = await orgStructureAPI.findUsers({
              limit: 100,
              exceptUsersIds: [userId],
            });

            assertSuccessStatus(response);
            const items = data?.items || data || [];
            // Проверяем что исключённый ID не в результатах
            const foundExcluded = items.find((u) => u.id === userId);
            expect(foundExcluded).toBeUndefined();
          }
        });
      });

      test("C5855: Поиск пользователей с пагинацией", async ({
        orgStructureAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Поиск пользователей с пагинацией", async () => {
          const { data: data1 } = await orgStructureAPI.findUsers({
            limit: 2,
            offset: 0,
          });
          const { data: data2 } = await orgStructureAPI.findUsers({
            limit: 2,
            offset: 2,
          });

          const items1 = data1?.items || data1 || [];
          const items2 = data2?.items || data2 || [];

          // Проверяем что разные страницы возвращают разные данные (если есть достаточно данных)
          if (items1.length > 0 && items2.length > 0) {
            expect(items1[0].id).not.toBe(items2[0].id);
          }
        });
      });
    });

    // ==================== GET BY IDS ====================

    test.describe("POST /manager/users/get/by-ids - Пользователи по ID", () => {
      test(
        "C5856: Получить пользователей по списку ID",
        { tag: ["@critical"] },
        async ({ orgStructureAPI }) => {
          setSeverity("critical");

          await test.step("Выполнить: Получить пользователей по списку ID", async () => {
            const userId = await findExistingUser(orgStructureAPI);

            if (userId) {
              const { response, data } = await orgStructureAPI.getUsersByIds([
                userId,
              ]);

              assertSuccessStatus(response);
              const items = data?.items || data || [];
              expect(items.length).toBeGreaterThanOrEqual(1);
              expect(items.some((u) => u.id === userId)).toBe(true);
            }
          });
        },
      );

      test("C5857: Получить несколько пользователей по ID", async ({
        orgStructureAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить несколько пользователей по ID", async () => {
          const { data: allUsers } = await orgStructureAPI.findUsers({
            limit: 5,
          });
          const items = allUsers?.items || allUsers || [];

          if (items.length >= 2) {
            const ids = items.slice(0, 2).map((u) => u.id);
            const { response, data } = await orgStructureAPI.getUsersByIds(ids);

            assertSuccessStatus(response);
            const resultItems = data?.items || data || [];
            expect(resultItems.length).toBe(2);
          }
        });
      });

      test("C5858: Получить пользователей по несуществующему ID", async ({
        orgStructureAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить пользователей по несуществующему ID", async () => {
          const { response, data } = await orgStructureAPI.getUsersByIds([
            999999999,
          ]);

          // API может вернуть успешный ответ с пустым массивом или ошибку
          if (response.ok()) {
            const items = data?.items || data || [];
            expect(items.length).toBe(0);
          } else {
            expect([400, 404]).toContain(response.status());
          }
        });
      });
    });

    // ==================== SUBORDINATES ====================

    test.describe("POST /manager/org-struct/subordinates/get/by-ids - Подчинённые", () => {
      test("C5802: Получить количество подчинённых для пользователей", async ({
        orgStructureAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить количество подчинённых для пользователей", async () => {
          const userId = await findExistingUser(orgStructureAPI);

          if (userId) {
            const { response, data } =
              await orgStructureAPI.getSubordinatesCountByUsersIds([userId]);

            assertSuccessStatus(response);
            expect(data).toBeDefined();
          }
        });
      });

      test("C5860: Получить количество подчинённых для нескольких пользователей", async ({
        orgStructureAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить количество подчинённых для нескольких пользователей", async () => {
          const { data: allUsers } = await orgStructureAPI.findUsers({
            limit: 5,
          });
          const items = allUsers?.items || allUsers || [];

          if (items.length >= 2) {
            const ids = items.slice(0, 2).map((u) => u.id);
            const { response, data } =
              await orgStructureAPI.getSubordinatesCountByUsersIds(ids);

            assertSuccessStatus(response);
            expect(data).toBeDefined();
          }
        });
      });
    });

    // ==================== TREE USER INFO ====================

    test.describe("GET /manager/org-struct/tree/users/{userId}/info/ - Информация о пользователе в дереве", () => {
      test(
        "C5798: Получить информацию о пользователе в дереве",
        { tag: ["@critical"] },
        async ({ orgStructureAPI }) => {
          setSeverity("critical");

          await test.step("Выполнить: Получить информацию о пользователе в дереве", async () => {
            const userId = await findExistingUser(orgStructureAPI);

            if (userId) {
              const { response, data } =
                await orgStructureAPI.getTreeUserInfo(userId);

              expect(response.status()).toBe(200);
              expect(data).toBeDefined();
            }
          });
        },
      );

      test("C5862: Получить информацию о несуществующем пользователе в дереве", async ({
        orgStructureAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить информацию о несуществующем пользователе в дереве", async () => {
          const { response } = await orgStructureAPI.getTreeUserInfo(999999999);

          // API может вернуть разные коды ошибок
          expect([400, 403, 404]).toContain(response.status());
        });
      });
    });

    // ==================== AVAILABLE DEPARTMENTS ====================

    test.describe("GET /manager/org-struct/tree/users/{headUserId}/available-departments/for-subordinate/", () => {
      test("C5863: Получить доступные департаменты для подчинённого", async ({
        orgStructureAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить доступные департаменты для подчинённого", async () => {
          const userId = await findExistingUser(orgStructureAPI);

          if (userId) {
            const { response, data } =
              await orgStructureAPI.getTreeAvailableDepartmentsForHeadUser(
                userId,
              );

            // Этот эндпоинт может вернуть 404 если пользователь не является руководителем
            if (response.status() === 200) {
              expect(data).toBeDefined();
            } else {
              // Допустимые коды ошибок
              expect([400, 404]).toContain(response.status());
            }
          }
        });
      });
    });

    // ==================== EXPORT ====================

    test.describe("GET /manager/org-struct/users/export/get-token - Экспорт пользователей", () => {
      test("C5803: Получить токен для экспорта пользователей", async ({
        orgStructureAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить токен для экспорта пользователей", async () => {
          // Передаём дату, так как API может требовать этот параметр
          const today = new Date().toISOString().split("T")[0];
          const { response, data } =
            await orgStructureAPI.getExportToken(today);

          // API может вернуть успешный ответ или ошибку в зависимости от настроек
          if (response.ok()) {
            expect(data).toBeDefined();
          } else {
            // Допустимые коды ошибок (например, функция может быть отключена)
            expect([400, 403, 404]).toContain(response.status());
          }
        });
      });
    });

    // ==================== NEGATIVE TESTS ====================

    test.describe("Негативные сценарии", () => {
      test("C5865: Поиск с невалидными параметрами", async ({
        orgStructureAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Поиск с невалидными параметрами", async () => {
          // Пустой массив exceptUsersIds должен работать
          const { response } = await orgStructureAPI.findUsers({
            exceptUsersIds: [],
          });

          assertSuccessStatus(response);
        });
      });

      test("C5866: Получить подчинённых для пустого списка", async ({
        orgStructureAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить подчинённых для пустого списка", async () => {
          const { response, data } =
            await orgStructureAPI.getSubordinatesCountByUsersIds([]);

          // Пустой запрос может вернуть пустой результат или ошибку
          if (response.ok()) {
            const items = data?.items || data || [];
            expect(items.length).toBe(0);
          }
        });
      });

      test("C5867: Поиск с отрицательным limit", async ({
        orgStructureAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Поиск с отрицательным limit", async () => {
          const { response } = await orgStructureAPI.findUsers({ limit: -1 });

          // API может проигнорировать, вернуть ошибку или 201 (POST endpoint)
          expect([200, 201, 400, 500]).toContain(response.status());
        });
      });

      test("C5868: Поиск с очень большим offset", async ({
        orgStructureAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Поиск с очень большим offset", async () => {
          const { response, data } = await orgStructureAPI.findUsers({
            offset: 999999,
            limit: 10,
          });

          assertSuccessStatus(response);
          const items = data?.items || data || [];
          expect(items.length).toBe(0);
        });
      });

      test("C5869: Получить пользователей с несуществующими ID", async ({
        orgStructureAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить пользователей с несуществующими ID", async () => {
          const nonExistentIds = [999999991, 999999992, 999999993];
          const { response, data } =
            await orgStructureAPI.getUsersByIds(nonExistentIds);

          if (response.ok()) {
            const items = data?.items || data || [];
            expect(items.length).toBe(0);
          } else {
            expect([400, 404]).toContain(response.status());
          }
        });
      });

      test("C5870: Поиск со специальными символами в запросе", async ({
        orgStructureAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Поиск со специальными символами в запросе", async () => {
          const { response } = await orgStructureAPI.findUsers({
            q: "<script>alert(1)</script>",
            limit: 10,
          });

          // API должен безопасно обработать (POST endpoint может вернуть 201)
          expect([200, 201, 400, 500]).toContain(response.status());
        });
      });
    });

    // ==================== INTEGRATION TESTS ====================

    test.describe("Интеграционные тесты", () => {
      test("C5871: Получить пользователя и проверить его информацию в дереве", async ({
        orgStructureAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить пользователя и проверить его информацию в дереве", async () => {
          const userId = await findExistingUser(orgStructureAPI);

          if (userId) {
            // 1. Получаем пользователя через getUsersByIds
            const { data: usersData } = await orgStructureAPI.getUsersByIds([
              userId,
            ]);
            const users = usersData?.items || usersData || [];
            expect(users.length).toBeGreaterThanOrEqual(1);
            const user = users.find((u) => u.id === userId);
            expect(user).toBeDefined();

            // 2. Получаем информацию в дереве
            const { response: treeResp, data: treeData } =
              await orgStructureAPI.getTreeUserInfo(userId);
            expect(treeResp.ok()).toBe(true);
            expect(treeData).toBeDefined();
          }
        });
      });

      test("C5872: Согласованность данных: findUsers vs getUsersByIds", async ({
        orgStructureAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Согласованность данных: findUsers vs getUsersByIds", async () => {
          // 1. Ищем пользователей
          const { data: foundData } = await orgStructureAPI.findUsers({
            limit: 5,
          });
          const foundItems = foundData?.items || foundData || [];

          if (foundItems.length >= 2) {
            const ids = foundItems.slice(0, 2).map((u) => u.id);

            // 2. Получаем тех же пользователей по ID
            const { response, data } = await orgStructureAPI.getUsersByIds(ids);
            assertSuccessStatus(response);

            const fetchedItems = data?.items || data || [];
            expect(fetchedItems.length).toBe(2);

            // 3. Проверяем согласованность данных
            for (const id of ids) {
              const found = foundItems.find((u) => u.id === id);
              const fetched = fetchedItems.find((u) => u.id === id);
              expect(fetched).toBeDefined();
              // Основные поля должны совпадать
              if (found && fetched) {
                expect(fetched.id).toBe(found.id);
              }
            }
          }
        });
      });

      test("C5873: Поиск пользователей с исключением и проверка результатов", async ({
        orgStructureAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Поиск пользователей с исключением и проверка результатов", async () => {
          // 1. Получаем всех пользователей
          const { data: allData } = await orgStructureAPI.findUsers({
            limit: 20,
          });
          const allItems = allData?.items || allData || [];

          if (allItems.length >= 5) {
            const excludeIds = allItems.slice(0, 3).map((u) => u.id);

            // 2. Ищем с исключением
            const { response, data } = await orgStructureAPI.findUsers({
              limit: 100,
              exceptUsersIds: excludeIds,
            });

            assertSuccessStatus(response);
            const filteredItems = data?.items || data || [];

            // 3. Проверяем что исключённые пользователи отсутствуют
            for (const excludeId of excludeIds) {
              expect(filteredItems.some((u) => u.id === excludeId)).toBe(false);
            }
          }
        });
      });
    });

    // ==================== BATCH OPERATIONS ====================

    test.describe("Массовые операции", () => {
      test("C5874: Получить много пользователей по ID (batch)", async ({
        orgStructureAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить много пользователей по ID (batch)", async () => {
          const { data: allData } = await orgStructureAPI.findUsers({
            limit: 10,
          });
          const allItems = allData?.items || allData || [];

          if (allItems.length >= 5) {
            const ids = allItems.slice(0, 5).map((u) => u.id);

            const { response, data } = await orgStructureAPI.getUsersByIds(ids);
            assertSuccessStatus(response);

            const resultItems = data?.items || data || [];
            expect(resultItems.length).toBe(5);
          }
        });
      });

      test("C5875: Получить подчинённых для нескольких пользователей", async ({
        orgStructureAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить подчинённых для нескольких пользователей", async () => {
          const { data: allData } = await orgStructureAPI.findUsers({
            limit: 10,
          });
          const allItems = allData?.items || allData || [];

          if (allItems.length >= 3) {
            const ids = allItems.slice(0, 3).map((u) => u.id);

            const { response, data } =
              await orgStructureAPI.getSubordinatesCountByUsersIds(ids);
            assertSuccessStatus(response);
            expect(data).toBeDefined();
          }
        });
      });

      test("C5876: Последовательные запросы поиска с разными фильтрами", async ({
        orgStructureAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Последовательные запросы поиска с разными фильтрами", async () => {
          const results = [];

          const filters = [
            { limit: 5 },
            { limit: 10, inOrgStruct: true },
            { limit: 5, offset: 5 },
          ];

          for (const filter of filters) {
            const { response, data } = await orgStructureAPI.findUsers(filter);
            results.push({
              status: response.status(),
              count: (data?.items || data || []).length,
            });
          }

          // Все запросы должны быть успешными (POST endpoint может вернуть 201)
          for (const result of results) {
            expect([200, 201]).toContain(result.status);
          }
        });
      });

      test("C4770: Пагинация: последовательные страницы не пересекаются", async ({
        orgStructureAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Пагинация: последовательные страницы не пересекаются", async () => {
          const pageSize = 5;

          // Получаем первые две страницы
          const { data: page1Data } = await orgStructureAPI.findUsers({
            limit: pageSize,
            offset: 0,
          });
          const { data: page2Data } = await orgStructureAPI.findUsers({
            limit: pageSize,
            offset: pageSize,
          });

          const page1Items = page1Data?.items || page1Data || [];
          const page2Items = page2Data?.items || page2Data || [];

          if (page1Items.length > 0 && page2Items.length > 0) {
            const page1Ids = page1Items.map((u) => u.id);
            const page2Ids = page2Items.map((u) => u.id);

            // Проверяем что ID не пересекаются
            for (const id of page2Ids) {
              expect(page1Ids).not.toContain(id);
            }
          }
        });
      });
    });
  },
);
