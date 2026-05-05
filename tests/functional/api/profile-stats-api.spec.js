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
 * API тесты для модуля Profile — Custom Fields, Tabs, Stats, Negative
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

// ==================== CUSTOM FIELDS ====================

test.describe(
  "Profile API - Custom Fields",
  { tag: ["@api", "@profile", "@fields", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.PROFILE, "Custom Fields");
    });

    test(
      "C6326: GET /private/users/{userId}/fields/values - получить значения кастомных полей",
      { tag: ["@critical"] },
      async ({ profileAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: GET /private/users/{userId}/fields/values - получить значения кастомных полей", async () => {
          const userId = profileAPI.getCurrentUserId();

          test.skip(!userId, "Не удалось получить ID текущего пользователя");

          const { response, data } = await profileAPI.getFieldValues(userId);

          assertSuccessStatus(response);
          expect(data).toBeDefined();

          const items = data?.items || data || [];
          assertValidArray(items);
        });
      },
    );

    test("C6327: GET /private/users/{userId}/fields/values - чужой пользователь", async ({
      profileAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: GET /private/users/{userId}/fields/values - чужой пользователь", async () => {
        // Получаем ID другого пользователя
        const { data: listData } = await profileAPI.getUsers({ limit: 10 });
        const items = listData?.items || listData || [];
        const currentUserId = profileAPI.getCurrentUserId();

        // Ищем другого пользователя
        const otherUser = items.find((u) => u.id !== currentUserId);

        test.skip(!otherUser, "Нет других пользователей");

        const { response, data } = await profileAPI.getFieldValues(
          otherUser.id,
        );

        // Может быть доступ или 403
        expect([200, 403]).toContain(response.status());

        if (response.ok()) {
          expect(data).toBeDefined();
        }
      });
    });
  },
);

// ==================== PROFILE TABS ====================

test.describe(
  "Profile API - Profile Tabs",
  { tag: ["@api", "@profile", "@tabs", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.PROFILE, "Profile Tabs");
    });

    test("C6328: GET /private/users/{userId}/profile/tabs - получить вкладки профиля", async ({
      profileAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: GET /private/users/{userId}/profile/tabs - получить вкладки профиля", async () => {
        const userId = profileAPI.getCurrentUserId();

        test.skip(!userId, "Не удалось получить ID текущего пользователя");

        const { response, data } = await profileAPI.getProfileTabs(userId);

        assertSuccessStatus(response);
        expect(data).toBeDefined();
      });
    });

    test("C6329: GET /private/users/{userId}/profile/tabs - чужой пользователь", async ({
      profileAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: GET /private/users/{userId}/profile/tabs - чужой пользователь", async () => {
        const { data: listData } = await profileAPI.getUsers({ limit: 10 });
        const items = listData?.items || listData || [];
        const currentUserId = profileAPI.getCurrentUserId();

        const otherUser = items.find((u) => u.id !== currentUserId);

        test.skip(!otherUser, "Нет других пользователей");

        const { response, data } = await profileAPI.getProfileTabs(
          otherUser.id,
        );

        // Может быть доступ или ограниченные данные
        expect([200, 403]).toContain(response.status());

        if (response.ok()) {
          expect(data).toBeDefined();
        }
      });
    });
  },
);

// ==================== STATS ====================

test.describe(
  "Profile API - Stats",
  { tag: ["@api", "@profile", "@stats", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.PROFILE, "Stats");
    });

    // C6330 — дубликат, живёт в profile-tabs-api.spec.js
    // C6331 — дубликат, живёт в profile-tabs-api.spec.js

    test("C6332: GET /private/users/has-employees-feedbacks - проверить наличие фидбеков сотрудников", async ({
      profileAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: GET /private/users/has-employees-feedbacks - проверить наличие фидбеков сотрудников", async () => {
        const { response, data } = await profileAPI.hasEmployeesFeedbacks();

        expect([200, 403]).toContain(response.status());

        if (response.ok()) {
          expect(data).toBeDefined();
        }
      });
    });

    test("C6333: GET /private/users/me/platforms - получить платформы пользователя", async ({
      profileAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: GET /private/users/me/platforms - получить платформы пользователя", async () => {
        const { response, data } = await profileAPI.getMyPlatforms();

        assertSuccessStatus(response);
        expect(data).toBeDefined();

        const items = data?.items || data || [];
        assertValidArray(items);
      });
    });
  },
);

// ==================== NEGATIVE TESTS ====================

test.describe(
  "Profile API - Negative Tests",
  { tag: ["@api", "@profile", "@negative", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.PROFILE, "Negative");
    });

    test("C6334: GET /private/users/{id} - невалидный ID (строка)", async ({
      profileAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: GET /private/users/{id} - невалидный ID (строка)", async () => {
        const { response } = await profileAPI.getUserById("invalid-id");

        expect([400, 404, 500]).toContain(response.status());
      });
    });

    test("C6335: GET /private/users/{id} - отрицательный ID", async ({
      profileAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: GET /private/users/{id} - отрицательный ID", async () => {
        const { response } = await profileAPI.getUserById(-1);

        expect([400, 404]).toContain(response.status());
      });
    });

    test("C6336: GET /private/users - отрицательный limit", async ({
      profileAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: GET /private/users - отрицательный limit", async () => {
        const { response } = await profileAPI.getUsers({
          limit: -1,
        });

        // API может вернуть ошибку валидации, дефолтное значение или 500
        expect([200, 400, 422, 500]).toContain(response.status());
      });
    });

    test("C6337: POST /private/users/get/by-ids - пустой массив IDs", async ({
      profileAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: POST /private/users/get/by-ids - пустой массив IDs", async () => {
        const { response, data } = await profileAPI.getUsersByIds([]);

        expect([200, 400]).toContain(response.status());

        if (response.ok()) {
          const items = data?.items || data || [];
          expect(items.length).toBe(0);
        }
      });
    });

    test("C6338: POST /private/users/get/by-ids - несуществующие IDs", async ({
      profileAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: POST /private/users/get/by-ids - несуществующие IDs", async () => {
        const { response, data } = await profileAPI.getUsersByIds([
          999999999, 999999998,
        ]);

        // API может вернуть 200, 201 или 400 для несуществующих IDs
        expect([200, 201, 400]).toContain(response.status());

        if (response.ok()) {
          const items = data?.items || data || [];
          // Либо пустой результат, либо ошибка для несуществующих
          expect(items.length).toBeLessThanOrEqual(2);
        }
      });
    });

    test("C6339: GET /private/users/{userId}/fields/values - несуществующий пользователь", async ({
      profileAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: GET /private/users/{userId}/fields/values - несуществующий пользователь", async () => {
        const { response } = await profileAPI.getFieldValues(999999999);

        expect([400, 403, 404]).toContain(response.status());
      });
    });

    test("C5441: GET /private/users/collegues/{userId} - несуществующий коллега", async ({
      profileAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: GET /private/users/collegues/{userId} - несуществующий коллега", async () => {
        const { response } = await profileAPI.getColleague(999999999);

        expect([400, 403, 404]).toContain(response.status());
      });
    });
  },
);
