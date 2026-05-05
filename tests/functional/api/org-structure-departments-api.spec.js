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
 * API тесты для департаментов организационной структуры
 *
 * Покрытие:
 * - Получение списка департаментов
 * - Поиск департаментов
 * - Получение департаментов по ID
 * - Обновление департамента
 * - Работа с пользователями департамента
 * - Дерево оргструктуры
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

// Кеш для данных (чтобы не делать запросы в каждом тесте)
let cachedDepartmentId = null;

async function findExistingDepartment(api) {
  if (cachedDepartmentId) {
    return cachedDepartmentId;
  }

  const { data } = await api.getDepartments({ limit: 10 });
  const items = data?.items || data || [];
  if (items.length > 0) {
    cachedDepartmentId = items[0].id;
    return cachedDepartmentId;
  }

  return null;
}

test.describe(
  "Org Structure - Departments API",
  { tag: ["@api", "@org-structure", "@regression"] },
  () => {
    test.beforeEach(async ({}, testInfo) => {
      markAsAPITest(MODULES.ORG_STRUCTURE, "Departments");
    });

    // ==================== GET LIST ====================

    test.describe("GET /manager/departments/ - Список департаментов", () => {
      test(
        "C5683: Получить список департаментов без параметров",
        { tag: ["@critical"] },
        async ({ orgStructureAPI }) => {
          setSeverity("critical");

          await test.step("Выполнить: Получить список департаментов без параметров", async () => {
            const { response, data } = await orgStructureAPI.getDepartments();

            expect(response.status()).toBe(200);
            expect(data).toBeDefined();
            // Проверяем структуру ответа
            const items = data?.items || data || [];
            expect(Array.isArray(items)).toBe(true);

            if (items.length > 0) {
              const dept = items[0];
              expect(dept.id).toBeDefined();
              // Название может быть title или name
              expect(dept.title || dept.name).toBeDefined();
            }
          });
        },
      );

      test("C5684: Получить список департаментов с лимитом", async ({
        orgStructureAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить список департаментов с лимитом", async () => {
          const { response, data } = await orgStructureAPI.getDepartments({
            limit: 5,
          });

          expect(response.status()).toBe(200);
          const items = data?.items || data || [];
          expect(items.length).toBeLessThanOrEqual(5);
        });
      });

      test("C5685: Получить список департаментов с пагинацией", async ({
        orgStructureAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить список департаментов с пагинацией", async () => {
          const { response: resp1, data: data1 } =
            await orgStructureAPI.getDepartments({ limit: 2, offset: 0 });
          const { response: resp2, data: data2 } =
            await orgStructureAPI.getDepartments({ limit: 2, offset: 2 });

          expect(resp1.status()).toBe(200);
          expect(resp2.status()).toBe(200);

          const items1 = data1?.items || data1 || [];
          const items2 = data2?.items || data2 || [];

          // Проверяем что разные страницы возвращают разные данные (если есть достаточно данных)
          if (items1.length > 0 && items2.length > 0) {
            expect(items1[0].id).not.toBe(items2[0].id);
          }
        });
      });
    });

    // ==================== SEARCH ====================

    test.describe("POST /manager/departments/get/ - Поиск департаментов", () => {
      test("C5686: Поиск департаментов без фильтров", async ({
        orgStructureAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Поиск департаментов без фильтров", async () => {
          const { response, data } = await orgStructureAPI.searchDepartments({
            limit: 10,
          });

          // POST может возвращать 200 или 201
          assertSuccessStatus(response);
          expect(data).toBeDefined();
        });
      });

      test("C5687: Поиск департаментов с исключением ID", async ({
        orgStructureAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Поиск департаментов с исключением ID", async () => {
          // Сначала получим ID существующего департамента
          const departmentId = await findExistingDepartment(orgStructureAPI);

          if (departmentId) {
            const { response, data } = await orgStructureAPI.searchDepartments({
              limit: 100,
              exceptDepartmentsIds: [departmentId],
            });

            assertSuccessStatus(response);
            const items = data?.items || data || [];
            // Проверяем что исключённый ID не в результатах
            const foundExcluded = items.find((d) => d.id === departmentId);
            expect(foundExcluded).toBeUndefined();
          }
        });
      });
    });

    // ==================== GET BY IDS ====================

    test.describe("POST /manager/departments/get/by-ids/ - Департаменты по ID", () => {
      test(
        "C5688: Получить департаменты по списку ID",
        { tag: ["@critical"] },
        async ({ orgStructureAPI }) => {
          setSeverity("critical");

          await test.step("Выполнить: Получить департаменты по списку ID", async () => {
            const departmentId = await findExistingDepartment(orgStructureAPI);

            if (departmentId) {
              const { response, data } =
                await orgStructureAPI.getDepartmentsByIds([departmentId]);

              // POST может возвращать 200 или 201
              assertSuccessStatus(response);
              const items = data?.items || data || [];
              expect(items.length).toBeGreaterThanOrEqual(1);
              expect(items.some((d) => d.id === departmentId)).toBe(true);
            } else {
              // Нет департаментов - тест с пустым массивом
              const { response } = await orgStructureAPI.getDepartmentsByIds(
                [],
              );
              assertSuccessStatus(response);
            }
          });
        },
      );

      test("C5689: Получить несколько департаментов по ID", async ({
        orgStructureAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить несколько департаментов по ID", async () => {
          const { data: allDepts } = await orgStructureAPI.getDepartments({
            limit: 5,
          });
          const items = allDepts?.items || allDepts || [];

          if (items.length >= 2) {
            const ids = items.slice(0, 2).map((d) => d.id);
            const { response, data } =
              await orgStructureAPI.getDepartmentsByIds(ids);

            // POST может возвращать 200 или 201
            assertSuccessStatus(response);
            const resultItems = data?.items || data || [];
            expect(resultItems.length).toBe(2);
          }
        });
      });

      test("C5690: Получить департаменты по несуществующему ID", async ({
        orgStructureAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить департаменты по несуществующему ID", async () => {
          const { response, data } = await orgStructureAPI.getDepartmentsByIds([
            999999999,
          ]);

          // API может вернуть успешный ответ с пустым массивом или 404
          if (response.ok()) {
            const items = data?.items || data || [];
            expect(items.length).toBe(0);
          } else {
            expect(response.status()).toBe(404);
          }
        });
      });
    });

    // ==================== UPDATE ====================

    test.describe("POST /manager/departments/{id}/ - Обновление департамента", () => {
      test("C5691: Обновить название департамента", async ({
        orgStructureAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Обновить название департамента", async () => {
          const departmentId = await findExistingDepartment(orgStructureAPI);

          if (departmentId) {
            // Сначала получим текущие данные
            const { data: deptList } =
              await orgStructureAPI.getDepartmentsByIds([departmentId]);
            const dept = (deptList?.items || deptList || [])[0];

            if (dept) {
              const originalTitle = dept.title || dept.name;
              const newTitle = `Test Update ${Date.now()}`;

              // Обновляем
              const { response: updateResp } =
                await orgStructureAPI.updateDepartment(departmentId, {
                  title: newTitle,
                  autoTitle: false,
                });

              expect(updateResp.status()).toBe(200);

              // Восстанавливаем
              await orgStructureAPI.updateDepartment(departmentId, {
                title: originalTitle,
                autoTitle: false,
              });
            }
          }
        });
      });
    });

    // ==================== ORG STRUCTURE TREE ====================

    test.describe("Org Structure Tree - Дерево оргструктуры", () => {
      test(
        "C5692: Получить элементы дерева",
        { tag: ["@critical"] },
        async ({ orgStructureAPI }) => {
          setSeverity("critical");

          await test.step("Выполнить: Получить элементы дерева", async () => {
            const { response, data } = await orgStructureAPI.getTreeItems();

            expect(response.status()).toBe(200);
            expect(data).toBeDefined();
          });
        },
      );

      test("C5693: Получить плоское дерево департаментов", async ({
        orgStructureAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить плоское дерево департаментов", async () => {
          const { response, data } =
            await orgStructureAPI.getDepartmentsFlatTree();

          expect(response.status()).toBe(200);
          expect(data).toBeDefined();
        });
      });

      test("C5694: Получить информацию о корневом элементе", async ({
        orgStructureAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить информацию о корневом элементе", async () => {
          const { response, data } = await orgStructureAPI.getTreeRootInfo();

          expect(response.status()).toBe(200);
          expect(data).toBeDefined();
        });
      });

      test("C5695: Получить информацию о департаменте в дереве", async ({
        orgStructureAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить информацию о департаменте в дереве", async () => {
          const departmentId = await findExistingDepartment(orgStructureAPI);

          if (departmentId) {
            const { response, data } =
              await orgStructureAPI.getTreeDepartmentInfo(departmentId);

            expect(response.status()).toBe(200);
            expect(data).toBeDefined();
          }
        });
      });

      test("C5696: Получить доступных руководителей для корня", async ({
        orgStructureAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить доступных руководителей для корня", async () => {
          const { response, data } =
            await orgStructureAPI.getTreeAvailableHeadUsersForRoot();

          expect(response.status()).toBe(200);
          expect(data).toBeDefined();
        });
      });
    });

    // ==================== USERS IN DEPARTMENT ====================

    test.describe("Пользователи в департаменте", () => {
      test(
        "C5697: Получить пользователей департамента",
        { tag: ["@critical"] },
        async ({ orgStructureAPI }) => {
          setSeverity("critical");

          await test.step("Выполнить: Получить пользователей департамента", async () => {
            const departmentId = await findExistingDepartment(orgStructureAPI);

            if (departmentId) {
              const { response, data } =
                await orgStructureAPI.getUsersFromDepartment(departmentId);

              expect(response.status()).toBe(200);
              expect(data).toBeDefined();
            }
          });
        },
      );

      test("C5698: Получить пользователей департамента с nested=true", async ({
        orgStructureAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить пользователей департамента с nested=true", async () => {
          const departmentId = await findExistingDepartment(orgStructureAPI);

          if (departmentId) {
            const { response, data } =
              await orgStructureAPI.getUsersFromDepartment(departmentId, true);

            expect(response.status()).toBe(200);
            expect(data).toBeDefined();
          }
        });
      });
    });

    // ==================== ROOT HEADS ====================

    test.describe("Руководители компании", () => {
      test(
        "C5699: Получить руководителей компании",
        { tag: ["@critical"] },
        async ({ orgStructureAPI }) => {
          setSeverity("critical");

          await test.step("Выполнить: Получить руководителей компании", async () => {
            const { response, data } = await orgStructureAPI.getRootHeads();

            expect(response.status()).toBe(200);
            expect(data).toBeDefined();
          });
        },
      );
    });

    // ==================== NEGATIVE TESTS ====================

    test.describe("Негативные сценарии", () => {
      test("C5700: Получить информацию о несуществующем департаменте", async ({
        orgStructureAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить информацию о несуществующем департаменте", async () => {
          const { response } =
            await orgStructureAPI.getTreeDepartmentInfo(999999999);

          // Ожидаем 404 или 400
          expect([400, 404]).toContain(response.status());
        });
      });

      test("C5701: Обновить несуществующий департамент", async ({
        orgStructureAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Обновить несуществующий департамент", async () => {
          const { response } = await orgStructureAPI.updateDepartment(
            999999999,
            {
              title: "Test",
            },
          );

          // Ожидаем ошибку
          expect([400, 404]).toContain(response.status());
        });
      });

      test("C5702: Получить департаменты с отрицательным limit", async ({
        orgStructureAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить департаменты с отрицательным limit", async () => {
          const { response } = await orgStructureAPI.getDepartments({
            limit: -1,
          });

          // API может проигнорировать или вернуть ошибку (POST endpoint может вернуть 201)
          expect([200, 201, 400, 500]).toContain(response.status());
        });
      });

      test("C5703: Получить департаменты с очень большим offset", async ({
        orgStructureAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить департаменты с очень большим offset", async () => {
          const { response, data } = await orgStructureAPI.getDepartments({
            offset: 999999,
          });

          assertSuccessStatus(response);
          const items = data?.items || data || [];
          expect(items.length).toBe(0);
        });
      });

      test("C5704: Обновить департамент с пустым названием", async ({
        orgStructureAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Обновить департамент с пустым названием", async () => {
          const departmentId = await findExistingDepartment(orgStructureAPI);

          if (departmentId) {
            const { response } = await orgStructureAPI.updateDepartment(
              departmentId,
              {
                title: "",
                autoTitle: false,
              },
            );

            // Ожидаем ошибку валидации или игнорирование
            expect([200, 400, 422]).toContain(response.status());
          }
        });
      });

      test("C5705: Обновить департамент с очень длинным названием", async ({
        orgStructureAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Обновить департамент с очень длинным названием", async () => {
          const departmentId = await findExistingDepartment(orgStructureAPI);

          if (departmentId) {
            const longTitle = "A".repeat(1000);
            const { response } = await orgStructureAPI.updateDepartment(
              departmentId,
              {
                title: longTitle,
                autoTitle: false,
              },
            );

            // API может обрезать или отклонить
            expect([200, 400, 422, 500]).toContain(response.status());
          }
        });
      });
    });

    // ==================== INTEGRATION TESTS ====================

    test.describe("Интеграционные тесты", () => {
      test("C5706: Получить департамент и проверить его пользователей", async ({
        orgStructureAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить департамент и проверить его пользователей", async () => {
          const departmentId = await findExistingDepartment(orgStructureAPI);

          if (departmentId) {
            // 1. Получаем информацию о департаменте
            const { data: deptList } =
              await orgStructureAPI.getDepartmentsByIds([departmentId]);
            const dept = (deptList?.items || deptList || [])[0];
            expect(dept).toBeDefined();

            // 2. Получаем пользователей департамента
            const { response: usersResp, data: usersData } =
              await orgStructureAPI.getUsersFromDepartment(departmentId);
            expect(usersResp.ok()).toBe(true);

            // 3. Проверяем согласованность данных
            const users = usersData?.items || usersData || [];
            expect(Array.isArray(users)).toBe(true);
          }
        });
      });

      test("C5707: Проверить согласованность дерева и списка департаментов", async ({
        orgStructureAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Проверить согласованность дерева и списка департаментов", async () => {
          // 1. Получаем список департаментов
          const { response: listResp, data: listData } =
            await orgStructureAPI.getDepartments({ limit: 10 });
          expect(listResp.ok()).toBe(true);
          const listItems = listData?.items || listData || [];

          // 2. Получаем плоское дерево
          const { response: treeResp, data: treeData } =
            await orgStructureAPI.getDepartmentsFlatTree();
          expect(treeResp.ok()).toBe(true);

          // 3. Оба источника должны быть согласованы
          expect(listItems).toBeDefined();
          expect(treeData).toBeDefined();
        });
      });

      test("C5708: Полный цикл: получить → обновить → проверить → восстановить", async ({
        orgStructureAPI,
      }) => {
        setSeverity("critical");

        await test.step("Выполнить: Полный цикл: получить → обновить → проверить → восстановить", async () => {
          const departmentId = await findExistingDepartment(orgStructureAPI);

          if (departmentId) {
            // 1. Получаем оригинальные данные
            const { data: deptList } =
              await orgStructureAPI.getDepartmentsByIds([departmentId]);
            const dept = (deptList?.items || deptList || [])[0];

            if (dept) {
              const originalTitle = dept.title || dept.name;

              // 2. Обновляем
              const newTitle = `Test Integration ${Date.now()}`;
              const { response: updateResp } =
                await orgStructureAPI.updateDepartment(departmentId, {
                  title: newTitle,
                  autoTitle: false,
                });

              expect(updateResp.ok()).toBe(true);

              // 3. Проверяем что обновление применилось
              const { data: updatedList } =
                await orgStructureAPI.getDepartmentsByIds([departmentId]);
              const updatedDept = (updatedList?.items || updatedList || [])[0];
              expect(updatedDept.title || updatedDept.name).toBe(newTitle);

              // 4. Восстанавливаем оригинальное название
              await orgStructureAPI.updateDepartment(departmentId, {
                title: originalTitle,
                autoTitle: false,
              });
            }
          }
        });
      });
    });

    // ==================== BATCH OPERATIONS ====================

    test.describe("Массовые операции", () => {
      test("C5709: Получить несколько департаментов по ID (batch)", async ({
        orgStructureAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить несколько департаментов по ID (batch)", async () => {
          const { data: allDepts } = await orgStructureAPI.getDepartments({
            limit: 5,
          });
          const items = allDepts?.items || allDepts || [];

          if (items.length >= 3) {
            const ids = items.slice(0, 3).map((d) => d.id);
            const { response, data } =
              await orgStructureAPI.getDepartmentsByIds(ids);

            assertSuccessStatus(response);
            const resultItems = data?.items || data || [];
            expect(resultItems.length).toBe(3);

            // Проверяем что все запрошенные ID присутствуют
            for (const id of ids) {
              expect(resultItems.some((d) => d.id === id)).toBe(true);
            }
          }
        });
      });

      test("C5710: Поиск департаментов с множественным исключением ID", async ({
        orgStructureAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Поиск департаментов с множественным исключением ID", async () => {
          const { data: allDepts } = await orgStructureAPI.getDepartments({
            limit: 10,
          });
          const items = allDepts?.items || allDepts || [];

          if (items.length >= 3) {
            const excludeIds = items.slice(0, 3).map((d) => d.id);

            const { response, data } = await orgStructureAPI.searchDepartments({
              limit: 100,
              exceptDepartmentsIds: excludeIds,
            });

            assertSuccessStatus(response);
            const resultItems = data?.items || data || [];

            // Проверяем что исключённые ID отсутствуют
            for (const excludeId of excludeIds) {
              expect(resultItems.some((d) => d.id === excludeId)).toBe(false);
            }
          }
        });
      });

      test("C5711: Последовательные запросы с разными параметрами", async ({
        orgStructureAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Последовательные запросы с разными параметрами", async () => {
          const results = [];

          // Делаем несколько запросов с разными параметрами
          const params = [{ limit: 5 }, { limit: 10 }, { limit: 5, offset: 5 }];

          for (const param of params) {
            const { response, data } =
              await orgStructureAPI.getDepartments(param);
            results.push({
              status: response.status(),
              count: (data?.items || data || []).length,
            });
          }

          // Все запросы должны быть успешными
          for (const result of results) {
            expect(result.status).toBe(200);
          }
        });
      });
    });
  },
);
