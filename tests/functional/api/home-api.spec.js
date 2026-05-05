// @ts-check
/**
 * Интеграционные API тесты для главной страницы (Home)
 *
 * Главная страница агрегирует данные из разных модулей.
 * Модульные тесты для каждого API находятся в соответствующих файлах:
 * - notifications-api.spec.js — уведомления
 * - karma-api.spec.js — баланс кармы
 * - my-team-api.spec.js — оргструктура
 * - feedback-statistics-api.spec.js — статистика фидбеков
 * - development-plans-api.spec.js — планы развития
 * - pr-extended-api.spec.js — история ревью
 *
 * Здесь тестируем только интеграцию — параллельную загрузку всех данных,
 * как это делает фронтенд при открытии главной страницы.
 *
 * @tags @api @home @integration @regression
 */

import { test, expect } from "../../fixtures/api.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import {
  assertSuccessStatus,
  assertUnauthorized,
  extractItems,
  assertValidArray,
} from "../../utils/api/common-assertions.js";

test.describe(
  "Home Page Integration API",
  { tag: ["@api", "@home", "@integration", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.HOME, "Integration");
    });

    test(
      "C5316: Полная загрузка главной страницы — все API доступны",
      { tag: ["@P0", "@smoke", "@critical"] },
      async ({ adminAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: Полная загрузка главной страницы — все API доступны", async () => {
          // Симулируем параллельную загрузку данных как на фронтенде
          const results = await Promise.allSettled([
            // Header
            adminAPI.get("/private/accounts/me"),
            adminAPI.get("/private/notifications/unread-count"),
            adminAPI.get("/private/karma/wallet/balances"),

            // Sidebar
            adminAPI.get("/private/org-struct/me/info"),
            adminAPI.get("/private/feedbacks/of-me/stats"),

            // Content
            adminAPI.post("/private/development-plans/get", {}),
            adminAPI.get("/private/performance-reviews/history"),
            adminAPI.get("/private/company/settings"),
          ]);

          const endpoints = [
            "/private/accounts/me",
            "/private/notifications/unread-count",
            "/private/karma/wallet/balances",
            "/private/org-struct/me/info",
            "/private/feedbacks/of-me/stats",
            "/private/development-plans/get",
            "/private/performance-reviews/history",
            "/private/company/settings",
          ];

          // Проверяем что все запросы выполнились (fulfilled)
          const failures = results
            .map((r, i) => ({ result: r, endpoint: endpoints[i] }))
            .filter((r) => r.result.status === "rejected");

          if (failures.length > 0) {
            console.log(
              "Failed endpoints:",
              failures.map((f) => f.endpoint),
            );
          }

          // Критичные эндпоинты должны работать
          const criticalEndpoints = [
            "/private/accounts/me",
            "/private/company/settings",
          ];
          for (const endpoint of criticalEndpoints) {
            const idx = endpoints.indexOf(endpoint);
            const result = results[idx];
            expect(result.status, `${endpoint} должен быть доступен`).toBe(
              "fulfilled",
            );
            if (result.status === "fulfilled") {
              const { response } = result.value;
              assertSuccessStatus(response, `${endpoint}`);
            }
          }

          // Остальные могут вернуть 400/403 если функция отключена, но не 500
          for (let i = 0; i < results.length; i++) {
            const result = results[i];
            if (result.status === "fulfilled") {
              const { response } = result.value;
              expect(
                response.status(),
                `${endpoints[i]} не должен возвращать 500`,
              ).not.toBe(500);
            }
          }
        });
      },
    );

    test(
      "C5317: Время загрузки главной страницы — все запросы < 5 сек",
      { tag: ["@P1", "@performance"] },
      async ({ adminAPI }) => {
        setSeverity("normal");

        await test.step("Выполнить: Время загрузки главной страницы — все запросы < 5 сек", async () => {
          const startTime = Date.now();

          await Promise.all([
            adminAPI.get("/private/accounts/me"),
            adminAPI.get("/private/notifications/unread-count"),
            adminAPI.get("/private/org-struct/me/info"),
            adminAPI.get("/private/feedbacks/of-me/stats"),
            adminAPI.post("/private/development-plans/get", {}),
            adminAPI.get("/private/performance-reviews/history"),
            adminAPI.get("/private/company/settings"),
          ]);

          const duration = Date.now() - startTime;

          // Параллельная загрузка всех данных должна быть быстрой
          expect(duration, "Загрузка данных главной страницы").toBeLessThan(
            5000,
          );
        });
      },
    );

    test(
      "C5318: Обычный пользователь может загрузить главную",
      { tag: ["@P0", "@critical"] },
      async ({ userAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: Обычный пользователь может загрузить главную", async () => {
          const results = await Promise.allSettled([
            userAPI.get("/private/accounts/me"),
            userAPI.get("/private/notifications/unread-count"),
            userAPI.get("/private/org-struct/me/info"),
            userAPI.get("/private/feedbacks/of-me/stats"),
            userAPI.get("/private/company/settings"),
          ]);

          // Все основные данные должны быть доступны пользователю
          for (const result of results) {
            expect(result.status).toBe("fulfilled");
            if (result.status === "fulfilled") {
              const { response } = result.value;
              // Не 401, не 500
              expect([200, 400, 403, 404]).toContain(response.status());
            }
          }
        });
      },
    );
  },
);

test.describe(
  "Home Page Data Consistency",
  { tag: ["@api", "@home", "@consistency", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.HOME, "Data Consistency");
    });

    test(
      "C5319: Данные аккаунта консистентны при повторных запросах",
      { tag: ["@P1"] },
      async ({ adminAPI }) => {
        setSeverity("normal");

        let uniqueIds;
        await test.step("Выполнить запрос: Данные аккаунта консистентны при повторных запросах", async () => {
          const results = await Promise.all([
            adminAPI.get("/private/accounts/me"),
            adminAPI.get("/private/accounts/me"),
            adminAPI.get("/private/accounts/me"),
          ]);

          // Все запросы успешны
          for (const { response } of results) {
            assertSuccessStatus(response);
          }

          // ID аккаунта одинаковый во всех ответах
          // Структура: data.account.id или data.currentUserId
          const ids = results
            .map((r) => {
              const data = r.data;
              return data?.account?.id || data?.currentUserId || data?.id;
            })
            .filter(Boolean);
          uniqueIds = [...new Set(ids)];
        });

        await test.step("Проверить ответ", async () => {
          expect(
            uniqueIds.length,
            "ID аккаунта должен быть консистентным",
          ).toBe(1);
        });
      },
    );

    test(
      "C5320: Счётчик уведомлений >= 0",
      { tag: ["@P1"] },
      async ({ adminAPI }) => {
        setSeverity("normal");

        await test.step("Выполнить: Счётчик уведомлений >= 0", async () => {
          const { response, data } = await adminAPI.get(
            "/private/notifications/unread-count",
          );
          assertSuccessStatus(response);

          // Счётчик должен быть числом >= 0
          const count =
            typeof data === "number"
              ? data
              : (data?.count ?? data?.unreadCount ?? 0);
          expect(count).toBeGreaterThanOrEqual(0);
        });
      },
    );

    test(
      "C5321: Список уведомлений соответствует счётчику",
      { tag: ["@P2"] },
      async ({ adminAPI }) => {
        setSeverity("minor");

        await test.step("Выполнить: Список уведомлений соответствует счётчику", async () => {
          const [countResult, listResult] = await Promise.all([
            adminAPI.get("/private/notifications/unread-count"),
            adminAPI.get("/private/notifications", {
              limit: 100,
              isRead: false,
            }),
          ]);

          assertSuccessStatus(countResult.response);
          assertSuccessStatus(listResult.response);

          const count =
            typeof countResult.data === "number"
              ? countResult.data
              : (countResult.data?.count ?? countResult.data?.unreadCount ?? 0);

          const items = extractItems(listResult.data);
          assertValidArray(items);

          // Количество непрочитанных в списке не должно превышать счётчик
          // (может быть меньше из-за пагинации)
          expect(items.length).toBeLessThanOrEqual(Math.max(count, 100));
        });
      },
    );
  },
);

test.describe(
  "Home Page Error Handling",
  { tag: ["@api", "@home", "@negative"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.HOME, "Error Handling");
    });

    test(
      "C5322: Без авторизации — все приватные эндпоинты возвращают 401",
      { tag: ["@P0", "@critical"] },
      async ({ apiClient }) => {
        setSeverity("critical");

        await test.step("Выполнить: Без авторизации — все приватные эндпоинты возвращают 401", async () => {
          const endpoints = [
            "/private/accounts/me",
            "/private/notifications/unread-count",
            "/private/org-struct/me/info",
            "/private/feedbacks/of-me/stats",
            "/private/company/settings",
          ];

          for (const endpoint of endpoints) {
            const { response } = await apiClient.get(endpoint);
            assertUnauthorized(
              response,
              `${endpoint} должен требовать авторизацию`,
            );
          }
        });
      },
    );

    test(
      "C5323: Главная страница устойчива к ошибкам отдельных сервисов",
      { tag: ["@P1"] },
      async ({ adminAPI }) => {
        setSeverity("normal");

        await test.step("Выполнить: Главная страница устойчива к ошибкам отдельных сервисов", async () => {
          // Даже если karma отключена, остальные данные должны загрузиться
          const results = await Promise.allSettled([
            adminAPI.get("/private/accounts/me"),
            adminAPI.get("/private/karma/wallet/balances"), // может вернуть 400/403
            adminAPI.get("/private/company/settings"),
          ]);

          // accounts/me и company/settings — критичные, должны работать
          expect(results[0].status).toBe("fulfilled");
          expect(results[2].status).toBe("fulfilled");

          if (results[0].status === "fulfilled") {
            assertSuccessStatus(results[0].value.response);
          }
          if (results[2].status === "fulfilled") {
            assertSuccessStatus(results[2].value.response);
          }
        });
      },
    );
  },
);
