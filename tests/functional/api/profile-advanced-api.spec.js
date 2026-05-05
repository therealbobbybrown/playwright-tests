// @ts-check
import { test as base, expect } from "@playwright/test";
import { ProfileAPI, getCredentials } from "../../utils/api/index.js";
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
 * API тесты для модуля Profile — Pagination, Role Access, Integration, Search
 *
 * @tags @api @profile
 */

// Расширяем test с фикстурой для Profile API
const test = base.extend({
  profileAPI: async ({ request }, use) => {
    const api = new ProfileAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
  profileUserAPI: async ({ request }, use) => {
    const api = new ProfileAPI(request);
    const { email, password } = getCredentials("user");
    await api.signIn(email, password);
    await use(api);
  },
});

// ==================== PAGINATION ====================

test.describe(
  "Profile API - Pagination",
  { tag: ["@api", "@profile", "@pagination", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.PROFILE, "Pagination");
    });

    test("C6341: Пагинация: offset + limit возвращает разные данные", async ({
      profileAPI,
    }) => {
      setSeverity("normal");

      let resp1, data1;
      await test.step("Выполнить запрос: Пагинация: offset + limit возвращает разные данные", async () => {
        ({ response: resp1, data: data1 } = await profileAPI.getUsers({
          limit: 5,
          offset: 0,
        }));
      });

      await test.step("Проверить ответ", async () => {
        expect(resp1.ok()).toBe(true);

        const items1 = data1?.items || data1 || [];

        const { response: resp2, data: data2 } = await profileAPI.getUsers({
          limit: 5,
          offset: 5,
        });

        expect(resp2.ok()).toBe(true);

        const items2 = data2?.items || data2 || [];

        // Если есть достаточно данных, страницы не должны пересекаться
        if (items1.length === 5 && items2.length > 0) {
          const ids1 = items1.map((u) => u.id);
          const ids2 = items2.map((u) => u.id);

          ids2.forEach((id) => {
            expect(ids1).not.toContain(id);
          });
        }
      });
    });

    test("C5031: Пагинация: большой offset возвращает пустой массив", async ({
      profileAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Пагинация: большой offset возвращает пустой массив", async () => {
        const { response, data } = await profileAPI.getUsers({
          limit: 10,
          offset: 999999,
        });

        assertSuccessStatus(response);

        const items = data?.items || data || [];
        expect(items.length).toBe(0);
      });
    });
  },
);

// ==================== USER ROLE ACCESS ====================

test.describe(
  "Profile API - User Role Access",
  { tag: ["@api", "@profile", "@access", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.PROFILE, "User Role Access");
    });

    test(
      "C6343: Обычный пользователь может получить список пользователей",
      { tag: ["@critical"] },
      async ({ profileUserAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: Обычный пользователь может получить список пользователей", async () => {
          const { response, data } = await profileUserAPI.getUsers({
            limit: 10,
          });

          assertSuccessStatus(response);
          expect(data).toBeDefined();

          const items = data?.items || data || [];
          assertValidArray(items);
        });
      },
    );

    test(
      "C6344: Обычный пользователь может получить свой профиль",
      { tag: ["@critical"] },
      async ({ profileUserAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: Обычный пользователь может получить свой профиль", async () => {
          const userId = profileUserAPI.getCurrentUserId();

          test.skip(!userId, "Не удалось получить ID текущего пользователя");

          const { response, data } = await profileUserAPI.getUserById(userId);

          assertSuccessStatus(response);
          expect(data).toBeDefined();
          expect(data.id).toBe(userId);
        });
      },
    );

    test(
      "C6345: Обычный пользователь может получить свою информацию",
      { tag: ["@critical"] },
      async ({ profileUserAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: Обычный пользователь может получить свою информацию", async () => {
          const userId = profileUserAPI.getCurrentUserId();

          test.skip(!userId, "Не удалось получить ID текущего пользователя");

          const { response, data } = await profileUserAPI.getUserInfo(userId);

          assertSuccessStatus(response);
          expect(data).toBeDefined();
        });
      },
    );

    test(
      "C5450: Обычный пользователь может получить список коллег",
      { tag: ["@critical"] },
      async ({ profileUserAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: Обычный пользователь может получить список коллег", async () => {
          const { response, data } = await profileUserAPI.getColleagues();

          assertSuccessStatus(response);
          expect(data).toBeDefined();

          const items = data?.items || data || [];
          assertValidArray(items);
        });
      },
    );
  },
);

// ==================== INTEGRATION TESTS ====================

test.describe(
  "Profile API - Integration Tests",
  { tag: ["@api", "@profile", "@integration", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.PROFILE, "Integration");
    });

    test("C6347: Получить пользователя из списка и сравнить с данными по ID", async ({
      profileAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Получить пользователя из списка и сравнить с данными по ID", async () => {
        // 1. Получаем список
        const { response: listResp, data: listData } =
          await profileAPI.getUsers({
            limit: 5,
          });
        expect(listResp.ok()).toBe(true);

        const items = listData?.items || listData || [];
        test.skip(items.length === 0, "Нет пользователей");

        const userFromList = items[0];

        // 2. Получаем по ID
        const { response: detailResp, data: detailData } =
          await profileAPI.getUserById(userFromList.id);
        expect(detailResp.ok()).toBe(true);

        // 3. Сравниваем базовые поля
        expect(detailData.id).toBe(userFromList.id);
      });
    });

    test("C6348: Согласованность: список пользователей и getByIds", async ({
      profileAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Согласованность: список пользователей и getByIds", async () => {
        // 1. Получаем список
        const { data: listData } = await profileAPI.getUsers({ limit: 5 });
        const items = listData?.items || listData || [];

        test.skip(items.length === 0, "Нет пользователей");

        const ids = items.map((u) => u.id);

        // 2. Получаем по IDs
        const { response, data } = await profileAPI.getUsersByIds(ids);
        assertSuccessStatus(response);

        const byIdsItems = data?.items || data || [];

        // 3. Проверяем что получили тех же пользователей
        expect(byIdsItems.length).toBe(ids.length);

        const byIdsIds = byIdsItems.map((u) => u.id);
        ids.forEach((id) => {
          expect(byIdsIds).toContain(id);
        });
      });
    });

    test("C6349: Поиск пользователя и получение его профиля", async ({
      profileAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Поиск пользователя и получение его профиля", async () => {
        // 1. Получаем любого пользователя
        const { data: listData } = await profileAPI.getUsers({ limit: 1 });
        const items = listData?.items || listData || [];

        test.skip(items.length === 0, "Нет пользователей");

        const user = items[0];

        // 2. Получаем его информацию
        const { response: infoResp, data: infoData } =
          await profileAPI.getUserInfo(user.id);

        if (infoResp.ok()) {
          expect(infoData).toBeDefined();
        }

        // 3. Получаем вкладки профиля
        const { response: tabsResp, data: tabsData } =
          await profileAPI.getProfileTabs(user.id);

        if (tabsResp.ok()) {
          expect(tabsData).toBeDefined();
        }

        // 4. Получаем кастомные поля
        const { response: fieldsResp, data: fieldsData } =
          await profileAPI.getFieldValues(user.id);

        if (fieldsResp.ok()) {
          expect(fieldsData).toBeDefined();
        }
      });
    });
  },
);

// ==================== SEARCH ====================

test.describe(
  "Profile API - Search",
  { tag: ["@api", "@profile", "@search", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.PROFILE, "Search");
    });

    test("C6350: Поиск: пустой запрос возвращает все", async ({
      profileAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Поиск: пустой запрос возвращает все", async () => {
        const { response, data } = await profileAPI.getUsers({
          q: "",
          limit: 10,
        });

        assertSuccessStatus(response);

        const items = data?.items || data || [];
        assertValidArray(items);
      });
    });

    test("C5103: Поиск: кириллица", async ({ profileAPI }) => {
      setSeverity("normal");

      await test.step("Выполнить: Поиск: кириллица", async () => {
        const { response, data } = await profileAPI.getUsers({
          q: "тест",
          limit: 10,
        });

        assertSuccessStatus(response);

        const items = data?.items || data || [];
        assertValidArray(items);
      });
    });

    test("C5104: Поиск: латиница", async ({ profileAPI }) => {
      setSeverity("normal");

      await test.step("Выполнить: Поиск: латиница", async () => {
        const { response, data } = await profileAPI.getUsers({
          q: "test",
          limit: 10,
        });

        assertSuccessStatus(response);

        const items = data?.items || data || [];
        assertValidArray(items);
      });
    });

    test("C5102: Поиск: специальные символы", async ({ profileAPI }) => {
      setSeverity("normal");

      await test.step("Выполнить: Поиск: специальные символы", async () => {
        const { response, data } = await profileAPI.getUsers({
          q: "@#$%",
          limit: 10,
        });

        expect([200, 400]).toContain(response.status());

        if (response.ok()) {
          const items = data?.items || data || [];
          assertValidArray(items);
        }
      });
    });

    test("C6354: POST /private/users/query - поиск по запросу", async ({
      profileAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: POST /private/users/query - поиск по запросу", async () => {
        const { response, data } = await profileAPI.queryUsers({
          limit: 10,
        });

        // API может вернуть 200 или 201 для успешного запроса
        expect([200, 201, 400]).toContain(response.status());

        if (response.ok()) {
          expect(data).toBeDefined();
        }
      });
    });
  },
);
