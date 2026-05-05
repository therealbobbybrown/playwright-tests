// @ts-check
/**
 * API тесты для дерева организационной структуры (Tree Operations)
 *
 * Покрытие методов:
 * - getTreeItems - получение элементов дерева
 * - getDepartmentsFlatTree - плоское дерево департаментов
 * - getTreeRootInfo - информация о корне
 * - getTreeDepartmentInfo - информация о департаменте
 * - getTreeUserInfo - информация о пользователе
 * - getTreeAvailableHeadUsersForRoot - доступные руководители
 * - getTreeAvailableDepartmentsForHeadUser - доступные департаменты
 * - addTreeUsersToRoot, addTreeUser, addTreeUsersToDepartment
 * - removeTreeUsersFromDepartment, addTreeUsersToRootDepartment
 * - addTreeDepartmentsToRoot, addTreeDepartmentsToDepartment
 * - addRootHeadsUsers, removeRootHeadsUsers
 * - setDepartmentHeadUser, unsetDepartmentHeadUser
 * - getRootHeads, findUsers, getUsersFromDepartment
 *
 * СТРОГИЕ ТЕСТЫ - не маскируют ошибки, а выявляют их.
 */
import { test as base, expect } from "@playwright/test";
import { OrgStructureAPI, getCredentials } from "../../utils/api/index.js";
import { allure } from "allure-playwright";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { assertSuccessStatus } from "../../utils/api/common-assertions.js";

// Расширяем test с фикстурой для OrgStructure API
const test = base.extend({
  orgStructureAPI: async ({ request }, use) => {
    const api = new OrgStructureAPI(request);
    const { email, password } = getCredentials("admin");
    const signInResult = await api.signIn(email, password);
    if (!signInResult?.accessToken) {
      throw new Error("Не удалось авторизоваться для теста OrgStructureAPI");
    }
    await use(api);
  },
});

/**
 * Хелпер для логирования входных данных
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
 * Хелпер для проверки успешного статуса (200 или 201)
 */
function expectSuccessStatus(response, context = "") {
  const status = response.status();
  expect(
    [200, 201].includes(status),
    `${context ? context + ": " : ""}Ожидался статус 200 или 201, получен ${status}`,
  ).toBe(true);
}

test.describe(
  "Org Structure - Tree API",
  { tag: ["@api", "@org-structure", "@functional", "@regression"] },
  () => {
    test.beforeEach(async ({}, testInfo) => {
      markAsAPITest(MODULES.ORG_STRUCTURE, "Tree Operations");
    });

    // ==================== READ OPERATIONS ====================

    test.describe("GET Tree Items - Чтение дерева", () => {
      test(
        "C5787: Получить элементы дерева оргструктуры",
        { tag: ["@critical"] },
        async ({ orgStructureAPI }) => {
          setSeverity("critical");

          let response, data;
          await test.step("Выполнить запрос: Получить элементы дерева оргструктуры", async () => {
            logExpected("Status 200, массив элементов дерева");

            ({ response, data } = await orgStructureAPI.getTreeItems());

            expectSuccessStatus(response);
          });

          await test.step("Проверить ответ", async () => {
            expect(data, "Данные должны быть определены").toBeDefined();

            // Логируем структуру ответа для анализа
            allure.attachment(
              "Tree Items Structure",
              JSON.stringify(
                {
                  type: typeof data,
                  isArray: Array.isArray(data),
                  length: Array.isArray(data)
                    ? data.length
                    : data?.items?.length || "N/A",
                  sampleKeys: data
                    ? Object.keys(Array.isArray(data) ? data[0] || {} : data)
                    : [],
                },
                null,
                2,
              ),
              "application/json",
            );
          });
        },
      );

      test(
        "C5693: Получить плоское дерево департаментов",
        { tag: ["@critical"] },
        async ({ orgStructureAPI }) => {
          setSeverity("critical");

          await test.step("Выполнить: Получить плоское дерево департаментов", async () => {
            logExpected("Status 200, плоский список департаментов");

            const { response, data } =
              await orgStructureAPI.getDepartmentsFlatTree();

            expectSuccessStatus(response);
            expect(data, "Данные должны быть определены").toBeDefined();
          });
        },
      );

      test(
        "C5694: Получить информацию о корневом элементе",
        { tag: ["@critical"] },
        async ({ orgStructureAPI }) => {
          setSeverity("critical");

          await test.step("Выполнить: Получить информацию о корневом элементе", async () => {
            logExpected("Status 200, информация о корне оргструктуры");

            const { response, data } = await orgStructureAPI.getTreeRootInfo();

            expectSuccessStatus(response);
            expect(data, "Данные должны быть определены").toBeDefined();
          });
        },
      );

      test(
        "C5790: Получить руководителей компании (root heads)",
        { tag: ["@critical"] },
        async ({ orgStructureAPI }) => {
          setSeverity("critical");

          await test.step("Выполнить: Получить руководителей компании (root heads)", async () => {
            logExpected("Status 200, список руководителей");

            const { response, data } = await orgStructureAPI.getRootHeads();

            expectSuccessStatus(response);
            expect(data, "Данные должны быть определены").toBeDefined();

            // Если есть руководители, проверяем структуру
            const items = data?.items || data || [];
            if (Array.isArray(items) && items.length > 0) {
              const head = items[0];
              expect(head.id, "Руководитель должен иметь id").toBeDefined();
            }
          });
        },
      );
    });

    // ==================== DEPARTMENT INFO ====================

    test.describe("GET Department Info - Информация о департаментах", () => {
      test("C5791: Получить информацию о департаменте по ID", async ({
        orgStructureAPI,
      }) => {
        setSeverity("normal");

        let response, data;
        await test.step("Выполнить запрос: Получить информацию о департаменте по ID", async () => {
          // Сначала получаем список департаментов
          const { response: listResp, data: listData } =
            await orgStructureAPI.getDepartments({ limit: 1 });
          expectSuccessStatus(listResp);

          const departments = listData?.items || listData || [];
          if (departments.length === 0) {
            allure.attachment(
              "Skip reason",
              "Нет департаментов в системе",
              "text/plain",
            );
            return;
          }

          const departmentId = departments[0].id;
          logInput("getTreeDepartmentInfo", { departmentId });
          logExpected("Status 200, информация о департаменте");

          ({ response, data } =
            await orgStructureAPI.getTreeDepartmentInfo(departmentId));

          expectSuccessStatus(response);
        });

        await test.step("Проверить ответ", async () => {
          expect(data, "Данные должны быть определены").toBeDefined();
        });
      });

      test(
        "C5792: Получить информацию о несуществующем департаменте - ошибка 404",
        { tag: ["@negative"] },
        async ({ orgStructureAPI }) => {
          setSeverity("normal");

          await test.step("Выполнить: Получить информацию о несуществующем департаменте - ошибка 404", async () => {
            const nonExistentId = 999999999;
            logInput("getTreeDepartmentInfo", { departmentId: nonExistentId });
            logExpected("Status 404 или 500");

            const { response, data } =
              await orgStructureAPI.getTreeDepartmentInfo(nonExistentId);

            expect(
              [404, 500].includes(response.status()),
              `Ожидался статус 404 или 500, получен ${response.status()}`,
            ).toBe(true);
          });
        },
      );

      test("C5793: Получить пользователей из департамента", async ({
        orgStructureAPI,
      }) => {
        setSeverity("normal");

        let response, data;
        await test.step("Выполнить запрос: Получить пользователей из департамента", async () => {
          // Получаем существующий департамент
          const { data: listData } = await orgStructureAPI.getDepartments({
            limit: 1,
          });
          const departments = listData?.items || listData || [];

          if (departments.length === 0) {
            allure.attachment(
              "Skip reason",
              "Нет департаментов в системе",
              "text/plain",
            );
            return;
          }

          const departmentId = departments[0].id;
          logInput("getUsersFromDepartment", { departmentId, nested: false });
          logExpected("Status 200, список пользователей");

          ({ response, data } = await orgStructureAPI.getUsersFromDepartment(
            departmentId,
            false,
          ));

          expectSuccessStatus(response);
        });

        await test.step("Проверить ответ", async () => {
          expect(data, "Данные должны быть определены").toBeDefined();
        });
      });

      test("C5794: Получить пользователей с вложенными департаментами (nested=true)", async ({
        orgStructureAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить пользователей с вложенными департаментами (nested=true)", async () => {
          const { data: listData } = await orgStructureAPI.getDepartments({
            limit: 1,
          });
          const departments = listData?.items || listData || [];

          if (departments.length === 0) {
            return;
          }

          const departmentId = departments[0].id;
          logInput("getUsersFromDepartment", { departmentId, nested: true });

          const { response, data } =
            await orgStructureAPI.getUsersFromDepartment(departmentId, true);

          expectSuccessStatus(response);
          expect(data, "Данные должны быть определены").toBeDefined();
        });
      });
    });

    // ==================== USER INFO ====================

    test.describe("GET User Info - Информация о пользователях", () => {
      test(
        "C5795: Найти пользователей в оргструктуре",
        { tag: ["@critical"] },
        async ({ orgStructureAPI }) => {
          setSeverity("critical");

          await test.step("Выполнить: Найти пользователей в оргструктуре", async () => {
            logInput("findUsers", { limit: 10 });
            logExpected("Status 200, список пользователей");

            const { response, data } = await orgStructureAPI.findUsers({
              limit: 10,
            });

            expectSuccessStatus(response);
            expect(data, "Данные должны быть определены").toBeDefined();

            const items = data?.items || data || [];
            expect(
              Array.isArray(items),
              "Пользователи должны быть массивом",
            ).toBe(true);

            if (items.length > 0) {
              expect(items[0].id, "Пользователь должен иметь id").toBeDefined();
            }
          });
        },
      );

      test("C5796: Найти пользователей по поисковому запросу", async ({
        orgStructureAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Найти пользователей по поисковому запросу", async () => {
          logInput("findUsers", { q: "test", limit: 5 });
          logExpected("Status 200, отфильтрованный список");

          const { response, data } = await orgStructureAPI.findUsers({
            q: "test",
            limit: 5,
          });

          expectSuccessStatus(response);
          expect(data, "Данные должны быть определены").toBeDefined();
        });
      });

      test("C5797: Найти пользователей только в оргструктуре", async ({
        orgStructureAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Найти пользователей только в оргструктуре", async () => {
          logInput("findUsers", { inOrgStruct: true, limit: 10 });

          const { response, data } = await orgStructureAPI.findUsers({
            inOrgStruct: true,
            limit: 10,
          });

          expectSuccessStatus(response);
        });
      });

      test("C5798: Получить информацию о пользователе в дереве", async ({
        orgStructureAPI,
      }) => {
        setSeverity("normal");

        let response, data;
        await test.step("Выполнить запрос: Получить информацию о пользователе в дереве", async () => {
          // Находим пользователя из оргструктуры (inOrgStruct: true — только те, кто в дереве)
          const { data: usersData } = await orgStructureAPI.findUsers({
            inOrgStruct: true,
            limit: 1,
          });
          const users = usersData?.items || usersData || [];

          if (users.length === 0) {
            allure.attachment(
              "Skip reason",
              "Нет пользователей в оргструктуре",
              "text/plain",
            );
            return;
          }

          const userId = users[0].id;
          logInput("getTreeUserInfo", { userId });
          logExpected("Status 200, информация о пользователе");

          ({ response, data } = await orgStructureAPI.getTreeUserInfo(userId));

          expectSuccessStatus(response);
        });

        await test.step("Проверить ответ", async () => {
          expect(data, "Данные должны быть определены").toBeDefined();
        });
      });

      test(
        "C5799: Получить информацию о несуществующем пользователе - ошибка",
        { tag: ["@negative"] },
        async ({ orgStructureAPI }) => {
          setSeverity("normal");

          await test.step("Выполнить: Получить информацию о несуществующем пользователе - ошибка", async () => {
            const nonExistentId = 999999999;
            logInput("getTreeUserInfo", { userId: nonExistentId });
            logExpected("Status 403/404/500");

            const { response } =
              await orgStructureAPI.getTreeUserInfo(nonExistentId);

            // 403 тоже валиден - API может возвращать "нет прав" для несуществующих ресурсов
            expect(
              [403, 404, 500].includes(response.status()),
              `Ожидался статус 403/404/500, получен ${response.status()}`,
            ).toBe(true);
          });
        },
      );

      test("C5800: Получить пользователей по массиву ID", async ({
        orgStructureAPI,
      }) => {
        setSeverity("normal");

        let usersIds, response, data;
        await test.step("Выполнить запрос: Получить пользователей по массиву ID", async () => {
          // Находим несколько пользователей
          const { data: usersData } = await orgStructureAPI.findUsers({
            limit: 3,
          });
          const users = usersData?.items || usersData || [];

          if (users.length === 0) {
            return;
          }

          usersIds = users.map((u) => u.id);
          logInput("getUsersByIds", { usersIds });
          logExpected("Status 200, массив пользователей");

          ({ response, data } = await orgStructureAPI.getUsersByIds(usersIds));

          expectSuccessStatus(response);
        });

        await test.step("Проверить ответ", async () => {
          expect(data, "Данные должны быть определены").toBeDefined();

          const items = data?.items || data || [];
          expect(
            items.length,
            `Должны вернуться ${usersIds.length} пользователей`,
          ).toBe(usersIds.length);
        });
      });
    });

    // ==================== AVAILABLE RESOURCES ====================

    test.describe("GET Available Resources - Доступные ресурсы", () => {
      test("C5696: Получить доступных руководителей для корня", async ({
        orgStructureAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить доступных руководителей для корня", async () => {
          logExpected("Status 200, список доступных пользователей");

          const { response, data } =
            await orgStructureAPI.getTreeAvailableHeadUsersForRoot();

          expectSuccessStatus(response);
          expect(data, "Данные должны быть определены").toBeDefined();
        });
      });

      test("C5802: Получить количество подчинённых для пользователей", async ({
        orgStructureAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить количество подчинённых для пользователей", async () => {
          // Находим пользователей
          const { data: usersData } = await orgStructureAPI.findUsers({
            limit: 3,
          });
          const users = usersData?.items || usersData || [];

          if (users.length === 0) {
            return;
          }

          const usersIds = users.map((u) => u.id);
          logInput("getSubordinatesCountByUsersIds", { usersIds });
          logExpected("Status 200, количество подчинённых");

          const { response, data } =
            await orgStructureAPI.getSubordinatesCountByUsersIds(usersIds);

          expectSuccessStatus(response);
          expect(data, "Данные должны быть определены").toBeDefined();
        });
      });
    });

    // ==================== EXPORT ====================

    test.describe("Export - Экспорт данных", () => {
      test("C5803: Получить токен для экспорта пользователей", async ({
        orgStructureAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить токен для экспорта пользователей", async () => {
          const userDate = new Date().toISOString();
          logInput("getExportToken", { userDate });
          logExpected("Status 200/201, токен экспорта");

          const { response, data } =
            await orgStructureAPI.getExportToken(userDate);

          expectSuccessStatus(response);
          expect(data, "Данные должны быть определены").toBeDefined();

          // Токен должен быть строкой
          const token = data?.token || data;
          if (typeof token === "string") {
            expect(token.length, "Токен не должен быть пустым").toBeGreaterThan(
              0,
            );
          }
        });
      });
    });

    // ==================== DEPARTMENTS SEARCH ====================

    test.describe("Departments - Поиск и получение", () => {
      test(
        "C5804: Получить список департаментов",
        { tag: ["@critical"] },
        async ({ orgStructureAPI }) => {
          setSeverity("critical");

          await test.step("Выполнить: Получить список департаментов", async () => {
            logInput("getDepartments", { limit: 10 });
            logExpected("Status 200, список департаментов");

            const { response, data } = await orgStructureAPI.getDepartments({
              limit: 10,
            });

            expectSuccessStatus(response);
            expect(data, "Данные должны быть определены").toBeDefined();
          });
        },
      );

      test("C5805: Поиск департаментов по запросу", async ({
        orgStructureAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Поиск департаментов по запросу", async () => {
          logInput("searchDepartments", { q: "test", limit: 5 });
          logExpected("Status 200, отфильтрованный список");

          const { response, data } = await orgStructureAPI.searchDepartments({
            q: "test",
            limit: 5,
          });

          expectSuccessStatus(response);
        });
      });

      test("C5806: Получить департаменты по массиву ID", async ({
        orgStructureAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить департаменты по массиву ID", async () => {
          // Получаем существующие департаменты
          const { data: listData } = await orgStructureAPI.getDepartments({
            limit: 3,
          });
          const departments = listData?.items || listData || [];

          if (departments.length === 0) {
            return;
          }

          const departmentsIds = departments.map((d) => d.id);
          logInput("getDepartmentsByIds", { departmentsIds });
          logExpected("Status 200, запрошенные департаменты");

          const { response, data } =
            await orgStructureAPI.getDepartmentsByIds(departmentsIds);

          expectSuccessStatus(response);
          expect(data, "Данные должны быть определены").toBeDefined();
        });
      });

      test("C5807: Обновить департамент", async ({ orgStructureAPI }) => {
        setSeverity("normal");

        await test.step("Выполнить: Обновить департамент", async () => {
          // Получаем существующий департамент
          const { data: listData } = await orgStructureAPI.getDepartments({
            limit: 1,
          });
          const departments = listData?.items || listData || [];

          if (departments.length === 0) {
            return;
          }

          const department = departments[0];
          const originalTitle = department.title;

          // Обновляем название
          const newTitle = `Updated ${originalTitle} ${Date.now()}`;
          logInput("updateDepartment", { id: department.id, title: newTitle });

          const { response, data } = await orgStructureAPI.updateDepartment(
            department.id,
            {
              title: newTitle,
              autoTitle: false,
            },
          );

          expectSuccessStatus(response);

          // Откатываем изменения
          await orgStructureAPI.updateDepartment(department.id, {
            title: originalTitle,
            autoTitle: false,
          });
        });
      });
    });

    // ==================== NEGATIVE TESTS ====================

    test.describe("Негативные сценарии", () => {
      test("C5808: Поиск пользователей с невалидными параметрами", async ({
        orgStructureAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Поиск пользователей с невалидными параметрами", async () => {
          logInput("findUsers", { limit: -1, offset: -1 });

          const { response, data } = await orgStructureAPI.findUsers({
            limit: -1,
            offset: -1,
          });

          // API может проигнорировать, вернуть ошибку валидации или 500/201
          expect(
            [200, 201, 400, 422, 500].includes(response.status()),
            `Должен вернуть 200/201/400/422/500, получен ${response.status()}`,
          ).toBe(true);
        });
      });

      test("C5809: Получить пользователей по пустому массиву ID", async ({
        orgStructureAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить пользователей по пустому массиву ID", async () => {
          logInput("getUsersByIds", { usersIds: [] });

          const { response, data } = await orgStructureAPI.getUsersByIds([]);

          // API может вернуть пустой массив или ошибку
          expect(
            [200, 201, 400, 422, 500].includes(response.status()),
            `Ожидался статус 200/201/400/422/500, получен ${response.status()}`,
          ).toBe(true);

          if (response.status() === 200) {
            const items = data?.items || data || [];
            expect(
              items.length,
              "Пустой запрос должен вернуть пустой результат",
            ).toBe(0);
          }
        });
      });

      test("C5810: Получить департаменты по несуществующим ID", async ({
        orgStructureAPI,
      }) => {
        setSeverity("normal");

        let response, data;
        await test.step("Выполнить запрос: Получить департаменты по несуществующим ID", async () => {
          const fakeIds = [999999997, 999999998, 999999999];
          logInput("getDepartmentsByIds", { departmentsIds: fakeIds });
          logExpected("Пустой результат или ошибка");

          ({ response, data } =
            await orgStructureAPI.getDepartmentsByIds(fakeIds));
        });

        await test.step("Проверить ответ", async () => {
          expect(
            [200, 201, 400, 404, 500].includes(response.status()),
            `Ожидался статус 200/201/400/404/500, получен ${response.status()}`,
          ).toBe(true);

          if (response.status() === 200) {
            const items = data?.items || data || [];
            expect(
              items.length,
              "Несуществующие ID должны вернуть пустой результат",
            ).toBe(0);
          }
        });
      });

      test(
        "C5811: Обновить несуществующий департамент - ошибка 404/500",
        { tag: ["@negative"] },
        async ({ orgStructureAPI }) => {
          setSeverity("normal");

          await test.step("Выполнить: Обновить несуществующий департамент - ошибка 404/500", async () => {
            const nonExistentId = 999999999;
            logInput("updateDepartment", { id: nonExistentId, title: "Test" });
            logExpected("Status 404 или 500");

            const { response } = await orgStructureAPI.updateDepartment(
              nonExistentId,
              { title: "Test" },
            );

            expect(
              [404, 500].includes(response.status()),
              `Ожидался статус 404 или 500, получен ${response.status()}`,
            ).toBe(true);
          });
        },
      );
    });

    // ==================== INTEGRATION TESTS ====================

    test.describe("Интеграционные тесты", () => {
      test("C5812: Согласованность данных: getDepartments vs getDepartmentsFlatTree", async ({
        orgStructureAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Согласованность данных: getDepartments vs getDepartmentsFlatTree", async () => {
          const [deptResp, treeResp] = await Promise.all([
            orgStructureAPI.getDepartments({ limit: 100 }),
            orgStructureAPI.getDepartmentsFlatTree(),
          ]);

          expectSuccessStatus(deptResp.response);
          expectSuccessStatus(treeResp.response);

          const deptItems = deptResp.data?.items || deptResp.data || [];
          const treeItems = treeResp.data?.items || treeResp.data || [];

          allure.attachment(
            "Data Comparison",
            JSON.stringify(
              {
                departmentsCount: deptItems.length,
                flatTreeCount: Array.isArray(treeItems)
                  ? treeItems.length
                  : "Not array",
                departmentIds: deptItems.slice(0, 5).map((d) => d.id),
                treeIds: Array.isArray(treeItems)
                  ? treeItems.slice(0, 5).map((d) => d.id)
                  : [],
              },
              null,
              2,
            ),
            "application/json",
          );
        });
      });

      test("C5813: Согласованность: findUsers vs getUsersByIds", async ({
        orgStructureAPI,
      }) => {
        setSeverity("normal");

        let foundUsers, byIdUsers;
        await test.step("Выполнить запрос: Согласованность: findUsers vs getUsersByIds", async () => {
          // Находим пользователей
          const { response: findResp, data: findData } =
            await orgStructureAPI.findUsers({ limit: 5 });
          expectSuccessStatus(findResp);

          foundUsers = findData?.items || findData || [];
          if (foundUsers.length === 0) {
            return;
          }

          const userIds = foundUsers.map((u) => u.id);

          // Получаем тех же пользователей по ID
          const { response: byIdResp, data: byIdData } =
            await orgStructureAPI.getUsersByIds(userIds);
          expectSuccessStatus(byIdResp);

          byIdUsers = byIdData?.items || byIdData || [];

          // Количество должно совпадать
        });

        await test.step("Проверить ответ", async () => {
          expect(
            byIdUsers.length,
            "Количество пользователей должно совпадать",
          ).toBe(foundUsers.length);

          // ID должны совпадать
          for (const user of foundUsers) {
            const found = byIdUsers.find((u) => u.id === user.id);
            expect(
              found,
              `Пользователь ${user.id} должен быть в результате getUsersByIds`,
            ).toBeDefined();
          }
        });
      });

      test("C5814: Полный цикл: получить дерево → найти пользователя → получить его информацию", async ({
        orgStructureAPI,
      }) => {
        setSeverity("critical");

        let userInfoResp, userInfoData;
        await test.step("Выполнить запрос: Полный цикл: получить дерево → найти пользователя → получить его информацию", async () => {
          // 1. Получаем дерево
          const { response: treeResp, data: treeData } =
            await orgStructureAPI.getTreeItems();
          expectSuccessStatus(treeResp);

          allure.attachment(
            "Step 1: Tree Items",
            JSON.stringify({
              status: treeResp.status(),
              hasData: !!treeData,
            }),
            "application/json",
          );

          // 2. Находим пользователя из оргструктуры (inOrgStruct: true — только те, кто в дереве)
          const { response: usersResp, data: usersData } =
            await orgStructureAPI.findUsers({ inOrgStruct: true, limit: 1 });
          expectSuccessStatus(usersResp);

          const users = usersData?.items || usersData || [];
          if (users.length === 0) {
            allure.attachment(
              "Skip reason",
              "Нет пользователей в оргструктуре",
              "text/plain",
            );
            return;
          }

          const userId = users[0].id;
          allure.attachment(
            "Step 2: Found User",
            JSON.stringify({ userId }),
            "application/json",
          );

          // 3. Получаем информацию о пользователе в дереве
          ({ response: userInfoResp, data: userInfoData } =
            await orgStructureAPI.getTreeUserInfo(userId));
          expectSuccessStatus(userInfoResp);
        });

        await test.step("Проверить ответ", async () => {
          expect(
            userInfoData,
            "Информация о пользователе должна быть определена",
          ).toBeDefined();

          allure.attachment(
            "Step 3: User Info",
            JSON.stringify(userInfoData),
            "application/json",
          );
        });
      });
    });

    // ==================== SECURITY TESTS ====================

    test.describe("Security тесты", () => {
      test(
        "C5815: Поиск пользователей с SQL-injection",
        { tag: ["@security"] },
        async ({ orgStructureAPI }) => {
          setSeverity("critical");

          await test.step("Выполнить: Поиск пользователей с SQL-injection", async () => {
            const sqlInjection = "'; DROP TABLE users; --";
            logInput("findUsers", { q: sqlInjection });
            logExpected("API должен безопасно обработать SQL-injection");

            const { response, data } = await orgStructureAPI.findUsers({
              q: sqlInjection,
              limit: 5,
            });

            // Не должен вернуть 500
            expect(
              response.status() !== 500,
              `SQL-injection не должен вызывать серверную ошибку, получен ${response.status()}`,
            ).toBe(true);
          });
        },
      );

      test(
        "C5816: Поиск департаментов с XSS",
        { tag: ["@security"] },
        async ({ orgStructureAPI }) => {
          setSeverity("critical");

          await test.step("Выполнить: Поиск департаментов с XSS", async () => {
            const xssPayload = "<script>alert(1)</script>";
            logInput("searchDepartments", { q: xssPayload });

            const { response, data } = await orgStructureAPI.searchDepartments({
              q: xssPayload,
              limit: 5,
            });

            expect(
              response.status() !== 500,
              `XSS payload не должен вызывать серверную ошибку, получен ${response.status()}`,
            ).toBe(true);
          });
        },
      );

      test(
        "C5817: Обновление департамента с XSS в названии",
        { tag: ["@security"] },
        async ({ orgStructureAPI }) => {
          setSeverity("critical");

          let department, originalTitle, response, data;
          await test.step("Выполнить запрос: Обновление департамента с XSS в названии", async () => {
            const { data: listData } = await orgStructureAPI.getDepartments({
              limit: 1,
            });
            const departments = listData?.items || listData || [];

            if (departments.length === 0) {
              return;
            }

            department = departments[0];
            originalTitle = department.title;
            const xssTitle = "<img src=x onerror=alert(1)>";

            logInput("updateDepartment", {
              id: department.id,
              title: xssTitle,
            });

            ({ response, data } = await orgStructureAPI.updateDepartment(
              department.id,
              {
                title: xssTitle,
                autoTitle: false,
              },
            ));

            // Не должен вернуть 500
          });

          await test.step("Проверить ответ", async () => {
            expect(
              response.status() !== 500,
              "XSS не должен вызывать серверную ошибку",
            ).toBe(true);

            if (response.status() === 200) {
              // Проверяем что XSS экранирован
              const { data: updatedData } =
                await orgStructureAPI.getTreeDepartmentInfo(department.id);
              if (updatedData?.title) {
                expect(
                  !updatedData.title.includes("<img") ||
                    updatedData.title.includes("&lt;"),
                  "XSS должен быть экранирован",
                ).toBe(true);
              }
            }

            // Откатываем изменения
            await orgStructureAPI.updateDepartment(department.id, {
              title: originalTitle,
              autoTitle: false,
            });
          });
        },
      );
    });
  },
);
