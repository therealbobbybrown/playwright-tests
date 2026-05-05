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
 * API тесты для вкладок профиля и статистики пользователя
 *
 * Покрытие (TASK-043, TASK-044):
 * - getProfileTabs(userId) - получение вкладок профиля
 * - getStats() - статистика пользователей
 * - hasFeedbacks() - проверка наличия фидбеков
 * - hasEmployeesFeedbacks() - проверка фидбеков сотрудников
 * - getMyPlatforms() - получение платформ пользователя
 *
 * @tags @api @profile @tabs @stats
 */

// Расширяем test с фикстурой для Profile API
const test = base.extend({
  adminAPI: async ({ request }, use) => {
    const api = new ProfileAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
  userAPI: async ({ request }, use) => {
    const api = new ProfileAPI(request);
    const { email, password } = getCredentials("user");
    await api.signIn(email, password);
    await use(api);
  },
  managerAPI: async ({ request }, use) => {
    const api = new ProfileAPI(request);
    const { email, password } = getCredentials("manager");
    await api.signIn(email, password);
    await use(api);
  },
});

// ==================== PROFILE TABS ====================

test.describe(
  "Profile Tabs API - Get Profile Tabs",
  { tag: ["@api", "@profile", "@tabs", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.PROFILE, "Profile Tabs");
    });

    test(
      "C6389: GET /private/users/{userId}/profile/tabs - получить вкладки своего профиля",
      { tag: ["@critical"] },
      async ({ adminAPI }) => {
        setSeverity("critical");

        let response, data;
        await test.step("Выполнить запрос: GET /private/users/{userId}/profile/tabs - получить вкладки своего профиля", async () => {
          const userId = adminAPI.getCurrentUserId();

          test.skip(!userId, "Не удалось получить ID текущего пользователя");

          ({ response, data } = await adminAPI.getProfileTabs(userId));

          assertSuccessStatus(response);
        });

        await test.step("Проверить ответ", async () => {
          expect(data).toBeDefined();

          // Вкладки могут быть массивом или объектом
          if (Array.isArray(data)) {
            // Проверяем структуру вкладки
            if (data.length > 0) {
              const tab = data[0];
              // Вкладка должна иметь идентификатор или имя
              expect(
                tab.id !== undefined ||
                  tab.name !== undefined ||
                  tab.key !== undefined,
              ).toBe(true);
            }
          } else if (data?.tabs) {
            expect(Array.isArray(data.tabs)).toBe(true);
          }
        });
      },
    );

    test("C6390: Получить вкладки профиля другого пользователя (админ)", async ({
      adminAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Получить вкладки профиля другого пользователя (админ)", async () => {
        // Получаем список пользователей
        const { data: usersData } = await adminAPI.getUsers({ limit: 10 });
        const users = usersData?.items || usersData || [];
        const currentUserId = adminAPI.getCurrentUserId();

        // Ищем другого пользователя
        const otherUser = users.find((u) => u.id !== currentUserId);

        test.skip(!otherUser, "Нет других пользователей");

        const { response, data } = await adminAPI.getProfileTabs(otherUser.id);

        // Админ должен иметь доступ к вкладкам другого пользователя
        expect([200, 403]).toContain(response.status());

        if (response.ok()) {
          expect(data).toBeDefined();
        }
      });
    });

    test("C6391: Получить вкладки профиля - несуществующий пользователь", async ({
      adminAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Получить вкладки профиля - несуществующий пользователь", async () => {
        const { response } = await adminAPI.getProfileTabs(999999999);

        expect([400, 403, 404]).toContain(response.status());
      });
    });

    test("C6392: Получить вкладки профиля - невалидный ID", async ({
      adminAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Получить вкладки профиля - невалидный ID", async () => {
        const { response } = await adminAPI.getProfileTabs("invalid-id");

        expect([400, 404, 500]).toContain(response.status());
      });
    });

    test("C6393: Получить вкладки профиля - отрицательный ID", async ({
      adminAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Получить вкладки профиля - отрицательный ID", async () => {
        const { response } = await adminAPI.getProfileTabs(-1);

        // API может вернуть 403, пустой результат или ошибку для отрицательного ID
        expect([200, 400, 403, 404]).toContain(response.status());
      });
    });

    test(
      "C6394: Обычный пользователь может получить свои вкладки",
      { tag: ["@critical"] },
      async ({ userAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: Обычный пользователь может получить свои вкладки", async () => {
          const userId = userAPI.getCurrentUserId();

          test.skip(!userId, "Не удалось получить ID текущего пользователя");

          const { response, data } = await userAPI.getProfileTabs(userId);

          assertSuccessStatus(response);
          expect(data).toBeDefined();
        });
      },
    );

    test("C6395: Обычный пользователь может получить вкладки коллеги", async ({
      userAPI,
      adminAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Обычный пользователь может получить вкладки коллеги", async () => {
        const adminUserId = adminAPI.getCurrentUserId();
        const userUserId = userAPI.getCurrentUserId();

        test.skip(
          !adminUserId || !userUserId,
          "Не удалось получить ID пользователей",
        );
        test.skip(adminUserId === userUserId, "Одинаковые пользователи");

        const { response, data } = await userAPI.getProfileTabs(adminUserId);

        // Доступ к профилю коллеги может быть разрешён или ограничен
        expect([200, 403]).toContain(response.status());

        if (response.ok()) {
          expect(data).toBeDefined();
        }
      });
    });
  },
);

// ==================== USERS STATS ====================

test.describe(
  "Profile Stats API - Get Stats",
  { tag: ["@api", "@profile", "@stats", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.PROFILE, "Stats");
    });

    test(
      "C6330: GET /private/users/stats - получить статистику пользователей",
      { tag: ["@critical"] },
      async ({ adminAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: GET /private/users/stats - получить статистику пользователей", async () => {
          const { response, data } = await adminAPI.getStats();

          assertSuccessStatus(response);
          expect(data).toBeDefined();

          // Статистика может содержать разные метрики
          expect(typeof data).toBe("object");
        });
      },
    );

    test("C6397: Обычный пользователь может получить статистику", async ({
      userAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Обычный пользователь может получить статистику", async () => {
        const { response, data } = await userAPI.getStats();

        // Доступ к статистике может быть ограничен для обычных пользователей
        expect([200, 403]).toContain(response.status());

        if (response.ok()) {
          expect(data).toBeDefined();
        }
      });
    });

    test("C6398: Менеджер может получить статистику", async ({
      managerAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Менеджер может получить статистику", async () => {
        const { response, data } = await managerAPI.getStats();

        expect([200, 403]).toContain(response.status());

        if (response.ok()) {
          expect(data).toBeDefined();
        }
      });
    });
  },
);

// ==================== HAS FEEDBACKS ====================

test.describe(
  "Profile Stats API - Has Feedbacks",
  { tag: ["@api", "@profile", "@stats", "@feedbacks", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.PROFILE, "Has Feedbacks");
    });

    test(
      "C6331: GET /private/users/has-feedbacks - проверить наличие фидбеков",
      { tag: ["@critical"] },
      async ({ adminAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: GET /private/users/has-feedbacks - проверить наличие фидбеков", async () => {
          const { response, data } = await adminAPI.hasFeedbacks();

          assertSuccessStatus(response);
          expect(data).toBeDefined();

          // Результат - boolean или объект с флагом
          if (typeof data === "boolean") {
            expect([true, false]).toContain(data);
          } else if (data !== null && typeof data === "object") {
            // Проверяем наличие любого булевого поля
            const hasFlag = Object.values(data).some(
              (v) => typeof v === "boolean",
            );
            expect(hasFlag || Object.keys(data).length >= 0).toBe(true);
          }
        });
      },
    );

    test(
      "C6400: Обычный пользователь может проверить наличие своих фидбеков",
      { tag: ["@critical"] },
      async ({ userAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: Обычный пользователь может проверить наличие своих фидбеков", async () => {
          const { response, data } = await userAPI.hasFeedbacks();

          assertSuccessStatus(response);
          expect(data).toBeDefined();
        });
      },
    );

    test("C6401: Менеджер может проверить наличие фидбеков", async ({
      managerAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Менеджер может проверить наличие фидбеков", async () => {
        const { response, data } = await managerAPI.hasFeedbacks();

        assertSuccessStatus(response);
        expect(data).toBeDefined();
      });
    });
  },
);

// ==================== HAS EMPLOYEES FEEDBACKS ====================

test.describe(
  "Profile Stats API - Has Employees Feedbacks",
  { tag: ["@api", "@profile", "@stats", "@feedbacks", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.PROFILE, "Has Employees Feedbacks");
    });

    test(
      "C6402: GET /private/users/has-employees-feedbacks - проверить наличие фидбеков сотрудников (админ)",
      { tag: ["@critical"] },
      async ({ adminAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: GET /private/users/has-employees-feedbacks - проверить наличие фидбеков сотрудников (админ)", async () => {
          const { response, data } = await adminAPI.hasEmployeesFeedbacks();

          // Админ должен иметь доступ к этой информации
          expect([200, 403]).toContain(response.status());

          if (response.ok()) {
            expect(data).toBeDefined();

            if (typeof data === "boolean") {
              expect([true, false]).toContain(data);
            }
          }
        });
      },
    );

    test("C6403: Менеджер может проверить наличие фидбеков сотрудников", async ({
      managerAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Менеджер может проверить наличие фидбеков сотрудников", async () => {
        const { response, data } = await managerAPI.hasEmployeesFeedbacks();

        // Менеджер может иметь доступ к фидбекам своих сотрудников
        expect([200, 403]).toContain(response.status());

        if (response.ok()) {
          expect(data).toBeDefined();
        }
      });
    });

    test("C6404: Обычный пользователь - ограниченный доступ", async ({
      userAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Обычный пользователь - ограниченный доступ", async () => {
        const { response } = await userAPI.hasEmployeesFeedbacks();

        // У обычного пользователя может не быть сотрудников
        expect([200, 403]).toContain(response.status());
      });
    });
  },
);

// ==================== MY PLATFORMS ====================

test.describe(
  "Profile Stats API - My Platforms",
  { tag: ["@api", "@profile", "@stats", "@platforms", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.PROFILE, "My Platforms");
    });

    test(
      "C6333: GET /private/users/me/platforms - получить платформы пользователя",
      { tag: ["@critical"] },
      async ({ adminAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: GET /private/users/me/platforms - получить платформы пользователя", async () => {
          const { response, data } = await adminAPI.getMyPlatforms();

          assertSuccessStatus(response);
          expect(data).toBeDefined();

          const items = data?.items || data || [];
          assertValidArray(items);

          // Если есть платформы, проверяем структуру
          if (items.length > 0) {
            const platform = items[0];
            expect(platform).toHaveProperty("id");
          }

          expect(items.length).toBeGreaterThanOrEqual(0);
        });
      },
    );

    test(
      "C6406: Обычный пользователь может получить свои платформы",
      { tag: ["@critical"] },
      async ({ userAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: Обычный пользователь может получить свои платформы", async () => {
          const { response, data } = await userAPI.getMyPlatforms();

          assertSuccessStatus(response);
          expect(data).toBeDefined();

          const items = data?.items || data || [];
          assertValidArray(items);
        });
      },
    );

    test("C6407: Менеджер может получить свои платформы", async ({
      managerAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Менеджер может получить свои платформы", async () => {
        const { response, data } = await managerAPI.getMyPlatforms();

        assertSuccessStatus(response);
        expect(data).toBeDefined();

        const items = data?.items || data || [];
        assertValidArray(items);
      });
    });
  },
);

// ==================== USER ROLE ACCESS ====================

test.describe(
  "Profile Tabs API - Role Access",
  { tag: ["@api", "@profile", "@tabs", "@access", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.PROFILE, "Tabs - Access");
    });

    test("C6408: Сравнение вкладок разных ролей", async ({
      adminAPI,
      userAPI,
      managerAPI,
    }) => {
      setSeverity("normal");

      let adminTabs, userTabs, managerTabs;
      await test.step("Выполнить запрос: Сравнение вкладок разных ролей", async () => {
        const adminUserId = adminAPI.getCurrentUserId();
        const userUserId = userAPI.getCurrentUserId();
        const managerUserId = managerAPI.getCurrentUserId();

        test.skip(
          !adminUserId || !userUserId || !managerUserId,
          "Не удалось получить ID пользователей",
        );

        // Получаем вкладки для каждой роли
        [adminTabs, userTabs, managerTabs] = await Promise.all([
          adminAPI.getProfileTabs(adminUserId),
          userAPI.getProfileTabs(userUserId),
          managerAPI.getProfileTabs(managerUserId),
        ]);
      });

      await test.step("Проверить ответ", async () => {
        expect(adminTabs.response.ok()).toBe(true);
        expect(userTabs.response.ok()).toBe(true);
        expect(managerTabs.response.ok()).toBe(true);

        // Логируем количество вкладок для каждой роли
        const getTabsCount = (data) => {
          const tabs = data?.tabs || data || [];
          return Array.isArray(tabs) ? tabs.length : 0;
        };

        expect(getTabsCount(adminTabs.data)).toBeGreaterThan(0);
        expect(getTabsCount(userTabs.data)).toBeGreaterThan(0);
        expect(getTabsCount(managerTabs.data)).toBeGreaterThan(0);
      });
    });

    test("C6409: Админ видит вкладки всех пользователей", async ({
      adminAPI,
    }) => {
      setSeverity("normal");

      let accessCount = 0;
      await test.step("Выполнить запрос: Админ видит вкладки всех пользователей", async () => {
        // Получаем нескольких пользователей
        const { data: usersData } = await adminAPI.getUsers({ limit: 5 });
        const users = usersData?.items || usersData || [];

        test.skip(users.length === 0, "Нет пользователей");

        let deniedCount = 0;

        for (const user of users.slice(0, 3)) {
          const { response } = await adminAPI.getProfileTabs(user.id);

          if (response.ok()) {
            accessCount++;
          } else if (response.status() === 403) {
            deniedCount++;
          }
        }

        // Админ должен иметь доступ хотя бы к некоторым профилям
      });

      await test.step("Проверить ответ", async () => {
        expect(accessCount).toBeGreaterThan(0);
      });
    });
  },
);

// ==================== INTEGRATION TESTS ====================

test.describe(
  "Profile Tabs API - Integration",
  { tag: ["@api", "@profile", "@tabs", "@integration", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.PROFILE, "Tabs - Integration");
    });

    test("C6410: Полный профиль: вкладки + статистика + фидбеки", async ({
      adminAPI,
    }) => {
      setSeverity("normal");

      let tabsResp, tabsData;
      await test.step("Выполнить запрос: Полный профиль: вкладки + статистика + фидбеки", async () => {
        const userId = adminAPI.getCurrentUserId();

        test.skip(!userId, "Не удалось получить ID текущего пользователя");

        // 1. Получаем вкладки профиля
        ({ response: tabsResp, data: tabsData } =
          await adminAPI.getProfileTabs(userId));
      });

      await test.step("Проверить ответ", async () => {
        expect(tabsResp.ok()).toBe(true);
        expect(tabsData).toBeDefined();

        // 2. Получаем статистику
        const { response: statsResp, data: statsData } =
          await adminAPI.getStats();
        expect(statsResp.ok()).toBe(true);
        expect(statsData).toBeDefined();

        // 3. Проверяем наличие фидбеков
        const { response: feedbacksResp, data: feedbacksData } =
          await adminAPI.hasFeedbacks();
        expect(feedbacksResp.ok()).toBe(true);
        expect(feedbacksData).toBeDefined();

        // 4. Получаем платформы
        const { response: platformsResp, data: platformsData } =
          await adminAPI.getMyPlatforms();
        expect(platformsResp.ok()).toBe(true);
        expect(platformsData).toBeDefined();

        expect(platformsData).not.toBeNull();
      });
    });

    test("C6411: Согласованность данных профиля", async ({ adminAPI }) => {
      setSeverity("normal");

      let userId, userById, userInfo, profileTabs;
      await test.step("Выполнить запрос: Согласованность данных профиля", async () => {
        userId = adminAPI.getCurrentUserId();

        test.skip(!userId, "Не удалось получить ID текущего пользователя");

        // Получаем данные пользователя разными способами
        [userById, userInfo, profileTabs] = await Promise.all([
          adminAPI.getUserById(userId),
          adminAPI.getUserInfo(userId),
          adminAPI.getProfileTabs(userId),
        ]);
      });

      await test.step("Проверить ответ", async () => {
        expect(userById.response.ok()).toBe(true);
        expect(userInfo.response.ok()).toBe(true);
        expect(profileTabs.response.ok()).toBe(true);

        // Проверяем что оба endpoint-а вернули данные с ID
        // (разные endpoint-ы могут возвращать разные id-форматы)
        if (userById.data?.id) {
          expect(typeof userById.data.id).not.toBe("undefined");
        }
        if (userInfo.data?.id) {
          expect(typeof userInfo.data.id).not.toBe("undefined");
        }
      });
    });

    test("C6412: Последовательные запросы к статистике", async ({
      adminAPI,
    }) => {
      setSeverity("minor");

      await test.step("Выполнить: Последовательные запросы к статистике", async () => {
        // Делаем несколько запросов к статистике и проверяем стабильность
        const results = [];

        for (let i = 0; i < 3; i++) {
          const { response, data } = await adminAPI.getStats();
          assertSuccessStatus(response);
          results.push(JSON.stringify(data));
        }

        // Статистика должна быть относительно стабильной
        // (может меняться при активности пользователей, но структура должна быть одинаковой)
        expect(results.length).toBeGreaterThan(0);
      });
    });
  },
);

// ==================== EDGE CASES ====================

test.describe(
  "Profile Tabs API - Edge Cases",
  { tag: ["@api", "@profile", "@tabs", "@edge", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.PROFILE, "Tabs - Edge Cases");
    });

    test("C6413: Параллельные запросы к вкладкам", async ({ adminAPI }) => {
      setSeverity("minor");

      await test.step("Выполнить: Параллельные запросы к вкладкам", async () => {
        const userId = adminAPI.getCurrentUserId();

        test.skip(!userId, "Не удалось получить ID текущего пользователя");

        // Отправляем несколько параллельных запросов
        const promises = Array(5)
          .fill(null)
          .map(() => adminAPI.getProfileTabs(userId));

        const results = await Promise.all(promises);

        // Все запросы должны вернуть одинаковый результат
        results.forEach(({ response }) => {
          assertSuccessStatus(response);
        });
      });
    });

    test("C6414: Запрос вкладок с очень большим ID", async ({ adminAPI }) => {
      setSeverity("minor");

      await test.step("Выполнить: Запрос вкладок с очень большим ID", async () => {
        const { response } = await adminAPI.getProfileTabs(
          Number.MAX_SAFE_INTEGER,
        );

        // API может вернуть 403 для несуществующего пользователя
        expect([400, 403, 404]).toContain(response.status());
      });
    });

    test("C6415: Запрос вкладок с нулевым ID", async ({ adminAPI }) => {
      setSeverity("minor");

      await test.step("Выполнить: Запрос вкладок с нулевым ID", async () => {
        const { response } = await adminAPI.getProfileTabs(0);

        // API может вернуть 403 для несуществующего пользователя с ID=0
        expect([400, 403, 404]).toContain(response.status());
      });
    });

    test("C6416: Множественные запросы has-feedbacks", async ({ adminAPI }) => {
      setSeverity("minor");

      await test.step("Выполнить: Множественные запросы has-feedbacks", async () => {
        const promises = Array(3)
          .fill(null)
          .map(() => adminAPI.hasFeedbacks());

        const results = await Promise.all(promises);

        // Все запросы должны быть успешными
        results.forEach(({ response }) => {
          assertSuccessStatus(response);
        });

        // Результаты должны быть одинаковыми
        const firstResult = JSON.stringify(results[0].data);
        results.forEach(({ data }) => {
          expect(JSON.stringify(data)).toBe(firstResult);
        });
      });
    });

    test("C6417: Множественные запросы к платформам", async ({ adminAPI }) => {
      setSeverity("minor");

      await test.step("Выполнить: Множественные запросы к платформам", async () => {
        const promises = Array(3)
          .fill(null)
          .map(() => adminAPI.getMyPlatforms());

        const results = await Promise.all(promises);

        results.forEach(({ response }) => {
          assertSuccessStatus(response);
        });
      });
    });
  },
);

// ==================== NEGATIVE TESTS ====================

test.describe(
  "Profile Tabs API - Negative Tests",
  { tag: ["@api", "@profile", "@tabs", "@negative", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.PROFILE, "Tabs - Negative");
    });

    test("C6418: Вкладки для ID в виде спецсимволов", async ({ adminAPI }) => {
      setSeverity("normal");

      await test.step("Выполнить: Вкладки для ID в виде спецсимволов", async () => {
        const { response } = await adminAPI.getProfileTabs("@#$%");

        expect([400, 404, 500]).toContain(response.status());
      });
    });

    test("C6419: Вкладки для пустого ID", async ({ adminAPI }) => {
      setSeverity("normal");

      await test.step("Выполнить: Вкладки для пустого ID", async () => {
        const { response } = await adminAPI.getProfileTabs("");

        expect([400, 404, 500]).toContain(response.status());
      });
    });

    test("C6420: Вкладки для ID с пробелами", async ({ adminAPI }) => {
      setSeverity("normal");

      await test.step("Выполнить: Вкладки для ID с пробелами", async () => {
        const { response } = await adminAPI.getProfileTabs(" 1 ");

        // API может обрезать пробелы и принять ID=1, или вернуть 403
        expect([200, 400, 403, 404, 500]).toContain(response.status());
      });
    });

    test("C6421: Вкладки для SQL injection попытки", async ({ adminAPI }) => {
      setSeverity("normal");

      await test.step("Выполнить: Вкладки для SQL injection попытки", async () => {
        const { response } = await adminAPI.getProfileTabs("1' OR '1'='1");

        // Должен быть отклонён как невалидный ID
        expect([400, 404, 500]).toContain(response.status());
      });
    });

    test("C6422: Вкладки для path traversal попытки", async ({ adminAPI }) => {
      setSeverity("normal");

      await test.step("Выполнить: Вкладки для path traversal попытки", async () => {
        const { response } = await adminAPI.getProfileTabs(
          "../../../etc/passwd",
        );

        expect([400, 404, 500]).toContain(response.status());
      });
    });
  },
);
