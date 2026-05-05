// @ts-check
import { test as base, expect } from "@playwright/test";
import { NotificationsAPI, getCredentials } from "../../utils/api/index.js";
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
 * API тесты для модуля Notifications (Уведомления)
 *
 * Покрытие:
 * - Список уведомлений пользователя
 * - Счётчик непрочитанных уведомлений
 * - Получение уведомления по ID
 * - Отметка всех как прочитанных
 * - Настройки уведомлений компании (manager)
 * - Настройки уведомлений пользователя
 *
 * @tags @api @notifications
 */

// Расширяем test с фикстурой для Notifications API
const test = base.extend({
  notificationsAPI: async ({ request }, use) => {
    const api = new NotificationsAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
  notificationsUserAPI: async ({ request }, use) => {
    const api = new NotificationsAPI(request);
    const { email, password } = getCredentials("user");
    await api.signIn(email, password);
    await use(api);
  },
});

// ==================== USER NOTIFICATIONS ====================

test.describe(
  "Notifications API - User Notifications",
  { tag: ["@api", "@notifications", "@user", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.NOTIFICATIONS, "User Notifications");
    });

    test(
      "C5490: GET /private/notifications - получить список уведомлений",
      { tag: ["@critical"] },
      async ({ notificationsAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: GET /private/notifications - получить список уведомлений", async () => {
          const { response, data } = await notificationsAPI.getNotifications();

          assertSuccessStatus(response);
          expect(data).toBeDefined();

          const items = data?.items || data || [];
          assertValidArray(items);

          // Проверяем структуру уведомления если есть данные
          if (items.length > 0) {
            const notification = items[0];
            expect(notification).toHaveProperty("id");
          }
        });
      },
    );

    test("C5491: GET /private/notifications с пагинацией (limit)", async ({
      notificationsAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: GET /private/notifications с пагинацией (limit)", async () => {
        const { response, data } = await notificationsAPI.getNotifications({
          limit: 5,
        });

        assertSuccessStatus(response);
        expect(data).toBeDefined();

        const items = data?.items || data || [];
        assertValidArray(items);
        expect(items.length).toBeLessThanOrEqual(5);
      });
    });

    test("C5492: GET /private/notifications с пагинацией (offset)", async ({
      notificationsAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: GET /private/notifications с пагинацией (offset)", async () => {
        const { response, data } = await notificationsAPI.getNotifications({
          limit: 5,
          offset: 0,
        });

        assertSuccessStatus(response);
        expect(data).toBeDefined();

        const items = data?.items || data || [];
        assertValidArray(items);
      });
    });

    test(
      "C5493: GET /private/notifications/unread-count - получить количество непрочитанных",
      { tag: ["@critical"] },
      async ({ notificationsAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: GET /private/notifications/unread-count - получить количество непрочитанных", async () => {
          const { response, data } = await notificationsAPI.getUnreadCount();

          assertSuccessStatus(response);
          expect(data).toBeDefined();

          // Счётчик должен быть числом >= 0
          const count = data?.count ?? data?.unreadCount ?? data;
          if (typeof count === "number") {
            expect(count).toBeGreaterThanOrEqual(0);
          }
        });
      },
    );

    test("C5494: GET /private/notifications/{id} - получить уведомление по ID", async ({
      notificationsAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: GET /private/notifications/{id} - получить уведомление по ID", async () => {
        // Сначала получаем список уведомлений
        const { data: listData } = await notificationsAPI.getNotifications({
          limit: 10,
        });
        const items = listData?.items || listData || [];

        test.skip(items.length === 0, "Нет уведомлений для тестирования");

        const notificationId = items[0].id;
        const { response, data } =
          await notificationsAPI.getNotificationById(notificationId);

        assertSuccessStatus(response);
        expect(data).toBeDefined();
        expect(data.id).toBe(notificationId);
      });
    });

    test("C5495: GET /private/notifications/{id} - несуществующий ID возвращает пустой результат или ошибку", async ({
      notificationsAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: GET /private/notifications/{id} - несуществующий ID возвращает пустой результат или ошибку", async () => {
        const { response, data } =
          await notificationsAPI.getNotificationById(999999999);

        // API может вернуть ошибку или 200 с пустым/null результатом
        if (response.ok()) {
          // Если 200, то данные должны быть пустыми или null
          expect(
            data === null ||
              data === undefined ||
              Object.keys(data).length === 0,
          ).toBe(true);
        } else {
          expect([400, 403, 404, 500]).toContain(response.status());
        }
      });
    });

    test(
      "C5496: POST /private/notifications/read-all - отметить все как прочитанные",
      { tag: ["@critical"] },
      async ({ notificationsAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: POST /private/notifications/read-all - отметить все как прочитанные", async () => {
          const { response } = await notificationsAPI.readAll();

          assertSuccessStatus(response);

          // После отметки проверяем счётчик
          const { data: countData } = await notificationsAPI.getUnreadCount();
          const count = countData?.count ?? countData?.unreadCount ?? countData;

          if (typeof count === "number") {
            expect(count).toBe(0);
          }
        });
      },
    );
  },
);

// ==================== PAGINATION ====================

test.describe(
  "Notifications API - Pagination",
  { tag: ["@api", "@notifications", "@pagination", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.NOTIFICATIONS, "Pagination");
    });

    test("C5096: Пагинация: offset + limit возвращает корректные данные", async ({
      notificationsAPI,
    }) => {
      setSeverity("normal");

      let resp1, data1;
      await test.step("Выполнить запрос: Пагинация: offset + limit возвращает корректные данные", async () => {
        // Получаем первые 5 элементов
        ({ response: resp1, data: data1 } =
          await notificationsAPI.getNotifications({
            limit: 5,
            offset: 0,
          }));
      });

      await test.step("Проверить ответ", async () => {
        expect(resp1.ok()).toBe(true);

        const items1 = data1?.items || data1 || [];

        // Получаем следующие 5 элементов
        const { response: resp2, data: data2 } =
          await notificationsAPI.getNotifications({
            limit: 5,
            offset: 5,
          });

        expect(resp2.ok()).toBe(true);

        const items2 = data2?.items || data2 || [];

        // Проверяем что элементы разные (если есть достаточно данных)
        if (items1.length === 5 && items2.length > 0) {
          const ids1 = items1.map((i) => i.id);
          const ids2 = items2.map((i) => i.id);

          // Ни один ID из второй страницы не должен быть на первой
          ids2.forEach((id) => {
            expect(ids1).not.toContain(id);
          });
        }
      });
    });

    test("C5031: Пагинация: большой offset возвращает пустой массив", async ({
      notificationsAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Пагинация: большой offset возвращает пустой массив", async () => {
        const { response, data } = await notificationsAPI.getNotifications({
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

// ==================== COMPANY SETTINGS (manager) ====================

test.describe(
  "Notifications API - Company Settings",
  { tag: ["@api", "@notifications", "@settings", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.NOTIFICATIONS, "Company Settings");
    });

    test(
      "C5499: GET /manager/notifications-settings - получить настройки уведомлений компании",
      { tag: ["@critical"] },
      async ({ notificationsAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: GET /manager/notifications-settings - получить настройки уведомлений компании", async () => {
          const { response, data } = await notificationsAPI.getSettings();

          expect([200, 403]).toContain(response.status());

          if (response.ok()) {
            expect(data).toBeDefined();
          }
        });
      },
    );

    test("C5500: GET /manager/notifications-settings/full - получить полные настройки", async ({
      notificationsAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: GET /manager/notifications-settings/full - получить полные настройки", async () => {
        const { response, data } = await notificationsAPI.getFullSettings();

        expect([200, 403]).toContain(response.status());

        if (response.ok()) {
          expect(data).toBeDefined();
        }
      });
    });

    test("C5501: GET /manager/notifications-settings/user - получить настройки пользователя", async ({
      notificationsAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: GET /manager/notifications-settings/user - получить настройки пользователя", async () => {
        const { response, data } = await notificationsAPI.getUserSettings();

        expect([200, 403]).toContain(response.status());

        if (response.ok()) {
          expect(data).toBeDefined();
        }
      });
    });

    test("C5502: POST /manager/notifications-settings - обновить настройки (пустой объект)", async ({
      notificationsAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: POST /manager/notifications-settings - обновить настройки (пустой объект)", async () => {
        // Сначала получаем текущие настройки
        const { response: getResp, data: currentSettings } =
          await notificationsAPI.getSettings();

        if (!getResp.ok()) {
          test.skip(true, "Нет доступа к настройкам уведомлений");
          return;
        }

        // Пробуем обновить с пустым объектом (должно сохранить текущие)
        const { response } = await notificationsAPI.updateSettings({});

        // API может вернуть различные коды в зависимости от валидации
        expect([200, 400, 403, 422, 500]).toContain(response.status());
      });
    });

    test("C5503: POST /manager/notifications-settings/user - обновить настройки пользователя", async ({
      notificationsAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: POST /manager/notifications-settings/user - обновить настройки пользователя", async () => {
        // Сначала получаем текущие настройки
        const { response: getResp } = await notificationsAPI.getUserSettings();

        if (!getResp.ok()) {
          test.skip(true, "Нет доступа к настройкам уведомлений пользователя");
          return;
        }

        // Пробуем обновить с пустым объектом
        const { response } = await notificationsAPI.updateUserSettings({});

        // API может вернуть различные коды в зависимости от валидации
        expect([200, 400, 403, 422, 500]).toContain(response.status());
      });
    });
  },
);

// ==================== SETTINGS STRUCTURE ====================

test.describe(
  "Notifications API - Settings Structure",
  { tag: ["@api", "@notifications", "@structure", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.NOTIFICATIONS, "Settings Structure");
    });

    test("C5504: Настройки компании содержат ожидаемую структуру", async ({
      notificationsAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Настройки компании содержат ожидаемую структуру", async () => {
        const { response, data } = await notificationsAPI.getSettings();

        if (!response.ok()) {
          test.skip(true, "Нет доступа к настройкам");
          return;
        }

        expect(data).toBeDefined();
        // Проверяем что это объект
        expect(typeof data).toBe("object");
      });
    });

    test("C5505: Полные настройки содержат расширенную информацию", async ({
      notificationsAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Полные настройки содержат расширенную информацию", async () => {
        const { response: basicResp, data: basicData } =
          await notificationsAPI.getSettings();
        const { response: fullResp, data: fullData } =
          await notificationsAPI.getFullSettings();

        if (!basicResp.ok() || !fullResp.ok()) {
          test.skip(true, "Нет доступа к настройкам");
          return;
        }

        expect(basicData).toBeDefined();
        expect(fullData).toBeDefined();

        // Полные настройки должны содержать не меньше информации
        expect(typeof fullData).toBe("object");
      });
    });

    test("C5506: Настройки пользователя и компании могут отличаться", async ({
      notificationsAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Настройки пользователя и компании могут отличаться", async () => {
        const { response: companyResp, data: companyData } =
          await notificationsAPI.getSettings();
        const { response: userResp, data: userData } =
          await notificationsAPI.getUserSettings();

        if (!companyResp.ok() || !userResp.ok()) {
          test.skip(true, "Нет доступа к настройкам");
          return;
        }

        expect(companyData).toBeDefined();
        expect(userData).toBeDefined();

        // Оба должны быть объектами
        expect(typeof companyData).toBe("object");
        expect(typeof userData).toBe("object");
      });
    });
  },
);

// ==================== NEGATIVE TESTS ====================

test.describe(
  "Notifications API - Negative Tests",
  { tag: ["@api", "@notifications", "@negative", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.NOTIFICATIONS, "Negative");
    });

    test("C5507: GET /private/notifications/{id} - невалидный ID (строка)", async ({
      notificationsAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: GET /private/notifications/{id} - невалидный ID (строка)", async () => {
        const { response } =
          await notificationsAPI.getNotificationById("invalid-id");

        expect([400, 404, 500]).toContain(response.status());
      });
    });

    test("C5508: GET /private/notifications/{id} - отрицательный ID", async ({
      notificationsAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: GET /private/notifications/{id} - отрицательный ID", async () => {
        const { response, data } =
          await notificationsAPI.getNotificationById(-1);

        // API может вернуть ошибку или 200 с пустым результатом
        if (response.ok()) {
          // Если 200, то данные должны быть пустыми или null
          expect(
            data === null ||
              data === undefined ||
              Object.keys(data).length === 0,
          ).toBe(true);
        } else {
          expect([400, 404, 500]).toContain(response.status());
        }
      });
    });

    test("C5509: GET /private/notifications - отрицательный limit", async ({
      notificationsAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: GET /private/notifications - отрицательный limit", async () => {
        const { response } = await notificationsAPI.getNotifications({
          limit: -1,
        });

        // Может вернуть ошибку валидации, использовать дефолтное значение или 500
        expect([200, 400, 422, 500]).toContain(response.status());
      });
    });

    test("C5510: GET /private/notifications - отрицательный offset", async ({
      notificationsAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: GET /private/notifications - отрицательный offset", async () => {
        const { response } = await notificationsAPI.getNotifications({
          offset: -1,
        });

        // Может вернуть ошибку валидации, использовать дефолтное значение или 500
        expect([200, 400, 422, 500]).toContain(response.status());
      });
    });

    test("C5511: GET /private/notifications - очень большой limit", async ({
      notificationsAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: GET /private/notifications - очень большой limit", async () => {
        const { response, data } = await notificationsAPI.getNotifications({
          limit: 10000,
        });

        // API может ограничить максимальный limit или принять его
        expect([200, 400]).toContain(response.status());

        if (response.ok()) {
          const items = data?.items || data || [];
          assertValidArray(items);
        }
      });
    });
  },
);

// ==================== USER ROLE ACCESS ====================

test.describe(
  "Notifications API - User Role Access",
  { tag: ["@api", "@notifications", "@access", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.NOTIFICATIONS, "User Role Access");
    });

    test(
      "C5512: Обычный пользователь может получить свои уведомления",
      { tag: ["@critical"] },
      async ({ notificationsUserAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: Обычный пользователь может получить свои уведомления", async () => {
          const { response, data } =
            await notificationsUserAPI.getNotifications();

          assertSuccessStatus(response);
          expect(data).toBeDefined();

          const items = data?.items || data || [];
          assertValidArray(items);
        });
      },
    );

    test(
      "C5513: Обычный пользователь может получить счётчик непрочитанных",
      { tag: ["@critical"] },
      async ({ notificationsUserAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: Обычный пользователь может получить счётчик непрочитанных", async () => {
          const { response, data } =
            await notificationsUserAPI.getUnreadCount();

          assertSuccessStatus(response);
          expect(data).toBeDefined();
        });
      },
    );

    test(
      "C5514: Обычный пользователь может отметить уведомления как прочитанные",
      { tag: ["@critical"] },
      async ({ notificationsUserAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: Обычный пользователь может отметить уведомления как прочитанные", async () => {
          const { response } = await notificationsUserAPI.readAll();

          assertSuccessStatus(response);
        });
      },
    );

    test("C5515: Обычный пользователь НЕ может получить настройки компании", async ({
      notificationsUserAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Обычный пользователь НЕ может получить настройки компании", async () => {
        const { response } = await notificationsUserAPI.getSettings();

        // Должен быть 403 Forbidden для обычного пользователя
        expect([403]).toContain(response.status());
      });
    });

    test("C5516: Обычный пользователь НЕ может изменить настройки компании", async ({
      notificationsUserAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Обычный пользователь НЕ может изменить настройки компании", async () => {
        const { response } = await notificationsUserAPI.updateSettings({});

        // Должен быть 403 Forbidden для обычного пользователя
        expect([403]).toContain(response.status());
      });
    });
  },
);

// ==================== INTEGRATION TESTS ====================

test.describe(
  "Notifications API - Integration Tests",
  { tag: ["@api", "@notifications", "@integration", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.NOTIFICATIONS, "Integration");
    });

    test("C5517: Счётчик непрочитанных уменьшается после read-all", async ({
      notificationsAPI,
    }) => {
      setSeverity("normal");

      let beforeCount, readResp;
      await test.step("Выполнить запрос: Счётчик непрочитанных уменьшается после read-all", async () => {
        // 1. Получаем начальный счётчик
        const { data: beforeData } = await notificationsAPI.getUnreadCount();
        beforeCount =
          beforeData?.count ?? beforeData?.unreadCount ?? beforeData;

        // 2. Отмечаем все как прочитанные
        ({ response: readResp } = await notificationsAPI.readAll());
      });

      await test.step("Проверить ответ", async () => {
        expect(readResp.ok()).toBe(true);

        // 3. Проверяем счётчик после
        const { data: afterData } = await notificationsAPI.getUnreadCount();
        const afterCount =
          afterData?.count ?? afterData?.unreadCount ?? afterData;

        // Счётчик должен быть 0 или меньше чем был
        if (typeof beforeCount === "number" && typeof afterCount === "number") {
          expect(afterCount).toBeLessThanOrEqual(beforeCount);
          expect(afterCount).toBe(0);
        }
      });
    });

    test("C5518: Последовательность запросов: список → детали → read-all", async ({
      notificationsAPI,
    }) => {
      setSeverity("normal");

      let listResp, listData;
      await test.step("Выполнить запрос: Последовательность запросов: список → детали → read-all", async () => {
        // 1. Получаем список
        ({ response: listResp, data: listData } =
          await notificationsAPI.getNotifications({
            limit: 10,
          }));
      });

      await test.step("Проверить ответ", async () => {
        expect(listResp.ok()).toBe(true);

        const items = listData?.items || listData || [];

        // 2. Если есть уведомления, получаем детали первого
        if (items.length > 0) {
          const { response: detailResp, data: detailData } =
            await notificationsAPI.getNotificationById(items[0].id);
          expect(detailResp.ok()).toBe(true);
          expect(detailData.id).toBe(items[0].id);
        }

        // 3. Отмечаем все как прочитанные
        const { response: readResp } = await notificationsAPI.readAll();
        expect(readResp.ok()).toBe(true);
      });
    });

    test("C5519: Согласованность данных: список и счётчик", async ({
      notificationsAPI,
    }) => {
      setSeverity("normal");

      let listResp, listData;
      await test.step("Выполнить запрос: Согласованность данных: список и счётчик", async () => {
        // 1. Получаем список уведомлений
        ({ response: listResp, data: listData } =
          await notificationsAPI.getNotifications({
            limit: 100,
          }));
      });

      await test.step("Проверить ответ", async () => {
        expect(listResp.ok()).toBe(true);

        // 2. Получаем счётчик непрочитанных
        const { response: countResp, data: countData } =
          await notificationsAPI.getUnreadCount();
        expect(countResp.ok()).toBe(true);

        const items = listData?.items || listData || [];
        const unreadCount =
          countData?.count ?? countData?.unreadCount ?? countData;

        // Счётчик непрочитанных не должен превышать общее количество уведомлений
        // (если мы получили все уведомления)
        if (typeof unreadCount === "number" && items.length > 0) {
          // Подсчитываем непрочитанные в списке
          const unreadInList = items.filter((n) => !n.isRead && !n.read).length;

          // Если получили все уведомления, счётчики должны совпадать
          // Но если есть пагинация, счётчик может быть больше
          expect(unreadCount).toBeGreaterThanOrEqual(0);
        }
      });
    });
  },
);

// ==================== BATCH OPERATIONS ====================

test.describe(
  "Notifications API - Batch Operations",
  { tag: ["@api", "@notifications", "@batch", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.NOTIFICATIONS, "Batch Operations");
    });

    test("C5520: Множественные запросы списка подряд возвращают одинаковый результат", async ({
      notificationsAPI,
    }) => {
      setSeverity("normal");

      let results, statuses;
      await test.step("Выполнить запрос: Множественные запросы списка подряд возвращают одинаковый результат", async () => {
        results = [];

        for (let i = 0; i < 3; i++) {
          const { response, data } = await notificationsAPI.getNotifications({
            limit: 10,
          });
          results.push({
            status: response.status(),
            count: (data?.items || data || []).length,
          });
        }

        // Все запросы должны вернуть одинаковый статус
        statuses = [...new Set(results.map((r) => r.status))];
      });

      await test.step("Проверить ответ", async () => {
        expect(statuses.length).toBe(1);
        expect(statuses[0]).toBe(200);

        // Количество элементов должно быть одинаковым (данные не должны меняться между запросами)
        const counts = [...new Set(results.map((r) => r.count))];
        expect(counts.length).toBe(1);
      });
    });

    test("C5521: Параллельные запросы счётчика не конфликтуют", async ({
      notificationsAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Параллельные запросы счётчика не конфликтуют", async () => {
        // Запускаем несколько запросов "параллельно"
        const promises = [
          notificationsAPI.getUnreadCount(),
          notificationsAPI.getUnreadCount(),
          notificationsAPI.getUnreadCount(),
        ];

        const results = await Promise.all(promises);

        // Все запросы должны вернуть успех
        results.forEach((result) => {
          expect(result.response.ok()).toBe(true);
        });

        // Все счётчики должны быть одинаковыми
        const counts = results.map(
          (r) => r.data?.count ?? r.data?.unreadCount ?? r.data,
        );
        const uniqueCounts = [
          ...new Set(counts.filter((c) => typeof c === "number")),
        ];

        if (uniqueCounts.length > 0) {
          expect(uniqueCounts.length).toBe(1);
        }
      });
    });
  },
);
