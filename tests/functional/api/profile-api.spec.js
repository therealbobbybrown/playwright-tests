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
 * API тесты для модуля Profile — Users List, User Info, Colleagues
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

// ==================== USERS LIST ====================

test.describe(
  "Profile API - Users List",
  { tag: ["@api", "@profile", "@users", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.PROFILE, "Users List");
    });

    test(
      "C6313: GET /private/users - получить список пользователей",
      { tag: ["@critical"] },
      async ({ profileAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: GET /private/users - получить список пользователей", async () => {
          const { response, data } = await profileAPI.getUsers();

          assertSuccessStatus(response);
          expect(data).toBeDefined();

          const items = data?.items || data || [];
          assertValidArray(items);
          expect(items.length).toBeGreaterThan(0);

          // Проверяем структуру пользователя
          const user = items[0];
          expect(user).toHaveProperty("id");
        });
      },
    );

    test("C6314: GET /private/users с пагинацией (limit)", async ({
      profileAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: GET /private/users с пагинацией (limit)", async () => {
        const { response, data } = await profileAPI.getUsers({
          limit: 5,
        });

        assertSuccessStatus(response);
        expect(data).toBeDefined();

        const items = data?.items || data || [];
        assertValidArray(items);
        expect(items.length).toBeLessThanOrEqual(5);
      });
    });

    test("C6315: GET /private/users с поиском", async ({ profileAPI }) => {
      setSeverity("normal");

      await test.step("Выполнить: GET /private/users с поиском", async () => {
        const { response, data } = await profileAPI.getUsers({
          q: "test",
          limit: 10,
        });

        assertSuccessStatus(response);
        expect(data).toBeDefined();

        const items = data?.items || data || [];
        assertValidArray(items);
      });
    });

    test("C6316: GET /private/users/simple - получить упрощённый список", async ({
      profileAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: GET /private/users/simple - получить упрощённый список", async () => {
        const { response, data } = await profileAPI.getSimpleUsers();

        assertSuccessStatus(response);
        expect(data).toBeDefined();

        const items = data?.items || data || [];
        assertValidArray(items);
      });
    });

    test(
      "C6317: GET /private/users/{id} - получить пользователя по ID",
      { tag: ["@critical"] },
      async ({ profileAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: GET /private/users/{id} - получить пользователя по ID", async () => {
          // Сначала получаем список пользователей
          const { data: listData } = await profileAPI.getUsers({ limit: 10 });
          const items = listData?.items || listData || [];

          test.skip(items.length === 0, "Нет пользователей");

          const userId = items[0].id;
          const { response, data } = await profileAPI.getUserById(userId);

          assertSuccessStatus(response);
          expect(data).toBeDefined();
          expect(data.id).toBe(userId);
        });
      },
    );

    test("C6318: GET /private/users/{id} - несуществующий ID возвращает 404", async ({
      profileAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: GET /private/users/{id} - несуществующий ID возвращает 404", async () => {
        const { response } = await profileAPI.getUserById(999999999);

        expect([400, 403, 404]).toContain(response.status());
      });
    });

    test(
      "C6319: POST /private/users/get/by-ids - получить пользователей по IDs",
      { tag: ["@critical"] },
      async ({ profileAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: POST /private/users/get/by-ids - получить пользователей по IDs", async () => {
          // Получаем несколько ID
          const { data: listData } = await profileAPI.getUsers({ limit: 3 });
          const items = listData?.items || listData || [];

          test.skip(items.length === 0, "Нет пользователей");

          const ids = items.map((u) => u.id);
          const { response, data } = await profileAPI.getUsersByIds(ids);

          assertSuccessStatus(response);
          expect(data).toBeDefined();

          const resultItems = data?.items || data || [];
          assertValidArray(resultItems);
          expect(resultItems.length).toBe(ids.length);
        });
      },
    );
  },
);

// ==================== USER INFO ====================

test.describe(
  "Profile API - User Info",
  { tag: ["@api", "@profile", "@info", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.PROFILE, "User Info");
    });

    test(
      "C6320: GET /private/users/{id}/info - получить информацию о пользователе",
      { tag: ["@critical"] },
      async ({ profileAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: GET /private/users/{id}/info - получить информацию о пользователе", async () => {
          const userId = profileAPI.getCurrentUserId();

          test.skip(!userId, "Не удалось получить ID текущего пользователя");

          const { response, data } = await profileAPI.getUserInfo(userId);

          assertSuccessStatus(response);
          expect(data).toBeDefined();
        });
      },
    );

    test("C6321: GET /private/users/{id}/info - несуществующий пользователь", async ({
      profileAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: GET /private/users/{id}/info - несуществующий пользователь", async () => {
        const { response } = await profileAPI.getUserInfo(999999999);

        expect([400, 403, 404]).toContain(response.status());
      });
    });

    test("C6322: POST /private/users/{id}/info - обновить информацию (пустой объект)", async ({
      profileAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: POST /private/users/{id}/info - обновить информацию (пустой объект)", async () => {
        const userId = profileAPI.getCurrentUserId();

        test.skip(!userId, "Не удалось получить ID текущего пользователя");

        const { response } = await profileAPI.updateUserInfo(userId, {});

        // Пустое обновление может быть принято (200/201) или отклонено (400/403)
        expect([200, 201, 400, 403]).toContain(response.status());
      });
    });
  },
);

// ==================== COLLEAGUES ====================

test.describe(
  "Profile API - Colleagues",
  { tag: ["@api", "@profile", "@colleagues", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.PROFILE, "Colleagues");
    });

    test(
      "C5438: GET /private/users/collegues - получить список коллег",
      { tag: ["@critical"] },
      async ({ profileAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: GET /private/users/collegues - получить список коллег", async () => {
          const { response, data } = await profileAPI.getColleagues();

          assertSuccessStatus(response);
          expect(data).toBeDefined();

          const items = data?.items || data || [];
          assertValidArray(items);
        });
      },
    );

    test("C5439: POST /private/users/collegues/get - получить коллег (оптимизированный)", async ({
      profileAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: POST /private/users/collegues/get - получить коллег (оптимизированный)", async () => {
        const { response, data } = await profileAPI.getColleaguesOptimized({});

        assertSuccessStatus(response);
        expect(data).toBeDefined();

        const items = data?.items || data || [];
        assertValidArray(items);
      });
    });

    test("C5440: GET /private/users/collegues/{userId} - получить информацию о коллеге", async ({
      profileAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: GET /private/users/collegues/{userId} - получить информацию о коллеге", async () => {
        // Получаем список коллег
        const { data: colleaguesData } = await profileAPI.getColleagues();
        const items = colleaguesData?.items || colleaguesData || [];

        test.skip(items.length === 0, "Нет коллег");

        const colleagueId = items[0].id;
        const { response, data } = await profileAPI.getColleague(colleagueId);

        assertSuccessStatus(response);
        expect(data).toBeDefined();
        expect(data.id).toBe(colleagueId);
      });
    });
  },
);
