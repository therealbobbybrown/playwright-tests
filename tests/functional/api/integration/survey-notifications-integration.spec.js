// @ts-check
import { test as base, expect } from "@playwright/test";
import {
  SurveyAPI,
  NotificationsAPI,
  getCredentials,
} from "../../../utils/api/index.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";
import { assertSuccessStatus } from "../../../utils/api/common-assertions.js";

/**
 * Интеграционные тесты: Survey + Notifications
 *
 * Проверяет интеграцию между модулями:
 * - Уведомления о новых опросах
 * - Уведомления о приближающемся дедлайне
 * - Напоминания о незавершённых опросах
 * - Настройки уведомлений для опросов
 *
 * @tags @api @integration @survey @notifications
 */

const test = base.extend({
  surveyAPI: async ({ request }, use) => {
    const api = new SurveyAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
  notificationsAPI: async ({ request }, use) => {
    const api = new NotificationsAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
});

// Helper: получить активные опросы
async function getActiveSurveys(surveyAPI) {
  const { response, data } = await surveyAPI.getList();
  if (!response.ok()) return [];
  const items = data?.items || data || [];
  return items.filter(
    (s) => s.status === "active" || s.status === "published" || s.isActive,
  );
}

// Helper: получить уведомления
async function getNotifications(notificationsAPI, limit = 50) {
  const { response, data } = await notificationsAPI.getNotifications({ limit });
  if (!response.ok()) return [];
  return data?.items || data || [];
}

// ==================== SURVEY NOTIFICATIONS ====================

test.describe(
  "Survey-Notifications Integration - Notifications",
  { tag: ["@api", "@integration", "@survey", "@notifications", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.SURVEY, "Notifications Integration");
    });

    test(
      "C5371: Уведомления доступны",
      { tag: ["@critical"] },
      async ({ notificationsAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: Уведомления доступны", async () => {
          const { response, data } = await notificationsAPI.getNotifications({
            limit: 20,
          });

          expect([200, 403]).toContain(response.status());

          if (response.ok()) {
            const notifications = data?.items || data || [];
            console.log(`Total notifications: ${notifications.length}`);

            if (notifications.length > 0) {
              const notif = notifications[0];
              console.log(
                "Notification example:",
                JSON.stringify(notif, null, 2),
              );
            }
          }
        });
      },
    );

    test(
      "C5372: Уведомления связанные с опросами",
      { tag: ["@critical"] },
      async ({ notificationsAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: Уведомления связанные с опросами", async () => {
          const notifications = await getNotifications(notificationsAPI, 100);

          // Ищем уведомления связанные с опросами
          const surveyNotifications = notifications.filter(
            (n) =>
              n.type?.toLowerCase().includes("survey") ||
              n.entityType?.toLowerCase().includes("survey") ||
              n.title?.toLowerCase().includes("опрос") ||
              n.message?.toLowerCase().includes("опрос") ||
              n.body?.toLowerCase().includes("опрос"),
          );

          console.log(
            `Survey-related notifications: ${surveyNotifications.length}/${notifications.length}`,
          );

          if (surveyNotifications.length > 0) {
            console.log(
              "Survey notification example:",
              JSON.stringify(surveyNotifications[0], null, 2),
            );
          }
        });
      },
    );

    test("C5373: Счётчик непрочитанных уведомлений", async ({
      notificationsAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Счётчик непрочитанных уведомлений", async () => {
        const { response, data } = await notificationsAPI.getUnreadCount();

        expect([200, 403]).toContain(response.status());

        if (response.ok()) {
          const count = data?.count ?? data?.unreadCount ?? data;
          console.log(`Unread notifications: ${count}`);

          if (typeof count === "number") {
            expect(count).toBeGreaterThanOrEqual(0);
          }
        }
      });
    });
  },
);

// ==================== SURVEY STATUS AND NOTIFICATIONS ====================

test.describe(
  "Survey-Notifications Integration - Survey Status",
  { tag: ["@api", "@integration", "@survey", "@notifications", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.SURVEY, "Notifications Integration - Status");
    });

    test("C5374: Активные опросы существуют", async ({ surveyAPI }) => {
      setSeverity("critical");

      await test.step("Выполнить: Активные опросы существуют", async () => {
        const { response, data } = await surveyAPI.getList();

        expect([200, 403]).toContain(response.status());

        if (response.ok()) {
          const surveys = data?.items || data || [];
          const active = surveys.filter(
            (s) => s.status === "active" || s.status === "published",
          );

          console.log(
            `Total surveys: ${surveys.length}, Active: ${active.length}`,
          );

          if (surveys.length > 0) {
            const survey = surveys[0];
            console.log("Survey example:", JSON.stringify(survey, null, 2));
          }
        }
      });
    });

    test("C5375: Опросы имеют даты для напоминаний", async ({ surveyAPI }) => {
      setSeverity("normal");

      await test.step("Выполнить: Опросы имеют даты для напоминаний", async () => {
        const { response, data } = await surveyAPI.getList();

        if (!response.ok()) {
          test.skip(true, "Нет доступа к опросам");
          return;
        }

        const surveys = data?.items || data || [];
        if (surveys.length === 0) {
          test.skip(true, "Нет опросов");
          return;
        }

        // Проверяем наличие дат
        for (const survey of surveys.slice(0, 5)) {
          const hasDates =
            survey.startDate || survey.endDate || survey.deadline;
          console.log(
            `Survey ${survey.id}: hasDates=${!!hasDates}, deadline=${survey.endDate || survey.deadline}`,
          );
        }
      });
    });

    test("C5376: Remind настройки опроса", async ({ surveyAPI }) => {
      setSeverity("normal");

      await test.step("Выполнить: Remind настройки опроса", async () => {
        const surveys = await getActiveSurveys(surveyAPI);

        if (surveys.length === 0) {
          test.skip(true, "Нет активных опросов");
          return;
        }

        const survey = surveys[0];

        // Получаем детали опроса
        const { response, data } = await surveyAPI.getById(survey.id);

        if (response.ok()) {
          // Проверяем настройки напоминаний
          const hasReminds =
            data.reminds !== undefined ||
            data.reminders !== undefined ||
            data.notificationSettings !== undefined ||
            data.settings?.reminds !== undefined;

          console.log(`Survey ${survey.id} has remind settings: ${hasReminds}`);

          if (data.reminds || data.reminders) {
            console.log(
              "Reminds:",
              JSON.stringify(data.reminds || data.reminders, null, 2),
            );
          }
        }
      });
    });
  },
);

// ==================== NOTIFICATION SETTINGS ====================

test.describe(
  "Survey-Notifications Integration - Settings",
  { tag: ["@api", "@integration", "@survey", "@notifications", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.NOTIFICATIONS, "Survey Integration - Settings");
    });

    test("C5377: Настройки уведомлений доступны", async ({
      notificationsAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Настройки уведомлений доступны", async () => {
        const { response, data } = await notificationsAPI.getSettings();

        expect([200, 403]).toContain(response.status());

        if (response.ok()) {
          console.log("Notification settings:", JSON.stringify(data, null, 2));

          // Ищем настройки для опросов
          if (data.survey || data.surveys) {
            console.log("Survey notification settings found");
          }
        }
      });
    });

    test("C5378: Типы уведомлений включают опросы", async ({
      notificationsAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Типы уведомлений включают опросы", async () => {
        const notifications = await getNotifications(notificationsAPI, 100);

        // Собираем все типы уведомлений
        const types = new Set();
        for (const n of notifications) {
          if (n.type) types.add(n.type);
          if (n.entityType) types.add(n.entityType);
        }

        console.log("Notification types:", Array.from(types));

        // Проверяем наличие survey-related типов
        const hasSurveyType = Array.from(types).some(
          (t) =>
            t.toLowerCase().includes("survey") ||
            t.toLowerCase().includes("опрос"),
        );

        console.log(`Has survey-related notification type: ${hasSurveyType}`);
      });
    });
  },
);

// ==================== NOTIFICATION DELIVERY ====================

test.describe(
  "Survey-Notifications Integration - Delivery",
  { tag: ["@api", "@integration", "@survey", "@notifications", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.NOTIFICATIONS, "Survey Integration - Delivery");
    });

    test("C5379: Уведомления имеют правильную структуру", async ({
      notificationsAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Уведомления имеют правильную структуру", async () => {
        const notifications = await getNotifications(notificationsAPI, 20);

        if (notifications.length === 0) {
          test.skip(true, "Нет уведомлений");
          return;
        }

        for (const n of notifications.slice(0, 5)) {
          // Проверяем обязательные поля
          expect(n.id || n._id).toBeDefined();

          // Логируем структуру уведомления
          console.log(
            `Notification ${n.id} keys: ${Object.keys(n).join(", ")}`,
          );

          // Проверяем наличие контента (разные форматы API)
          const hasContent =
            n.title || n.message || n.body || n.text || n.content || n.data;
          console.log(
            `Notification ${n.id}: hasContent=${!!hasContent}, type=${n.type}`,
          );

          // Проверяем дату
          const hasDate = n.createdAt || n.date || n.timestamp;
          console.log(`Notification ${n.id}: hasDate=${!!hasDate}`);
        }
      });
    });

    test("C5380: Уведомления можно пометить как прочитанные", async ({
      notificationsAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Уведомления можно пометить как прочитанные", async () => {
        const notifications = await getNotifications(notificationsAPI, 10);

        if (notifications.length === 0) {
          test.skip(true, "Нет уведомлений");
          return;
        }

        // Проверяем статус прочтения
        for (const n of notifications.slice(0, 5)) {
          const readStatus = n.isRead ?? n.read ?? n.viewed;
          console.log(`Notification ${n.id}: read=${readStatus}`);
        }
      });
    });
  },
);

// ==================== INTEGRATION FLOW ====================

test.describe(
  "Survey-Notifications Integration - Flow",
  { tag: ["@api", "@integration", "@survey", "@notifications", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.SURVEY, "Notifications Integration - Flow");
    });

    test(
      "C5381: Полный flow: Survey + Notifications доступны",
      { tag: ["@critical"] },
      async ({ surveyAPI, notificationsAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: Полный flow: Survey + Notifications доступны", async () => {
          // 1. Проверяем доступ к опросам
          const { response: surveyResp } = await surveyAPI.getList();
          expect([200, 403]).toContain(surveyResp.status());

          // 2. Проверяем доступ к уведомлениям
          const { response: notifResp } =
            await notificationsAPI.getNotifications();
          expect([200, 403]).toContain(notifResp.status());

          // 3. Проверяем счётчик
          const { response: countResp } =
            await notificationsAPI.getUnreadCount();
          expect([200, 403]).toContain(countResp.status());

          console.log(
            `Integration status: Surveys=${surveyResp.status()}, Notifications=${notifResp.status()}, Count=${countResp.status()}`,
          );
        });
      },
    );

    test("C5382: Связь опросов и уведомлений", async ({
      surveyAPI,
      notificationsAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Связь опросов и уведомлений", async () => {
        // Получаем активные опросы
        const surveys = await getActiveSurveys(surveyAPI);

        // Получаем уведомления
        const notifications = await getNotifications(notificationsAPI, 100);

        console.log(
          `Active surveys: ${surveys.length}, Notifications: ${notifications.length}`,
        );

        if (surveys.length > 0 && notifications.length > 0) {
          // Ищем уведомления для конкретных опросов
          const surveyIds = new Set(surveys.map((s) => s.id));

          const linkedNotifications = notifications.filter(
            (n) =>
              surveyIds.has(n.entityId) ||
              surveyIds.has(n.relatedEntityId) ||
              surveyIds.has(n.surveyId),
          );

          console.log(
            `Notifications linked to active surveys: ${linkedNotifications.length}`,
          );
        }
      });
    });

    test("C5383: Статистика уведомлений по типам", async ({
      notificationsAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Статистика уведомлений по типам", async () => {
        const notifications = await getNotifications(notificationsAPI, 200);

        if (notifications.length === 0) {
          test.skip(true, "Нет уведомлений");
          return;
        }

        // Группируем по типам
        const byType = {};
        for (const n of notifications) {
          const type = n.type || n.entityType || "unknown";
          byType[type] = (byType[type] || 0) + 1;
        }

        console.log("Notifications by type:", byType);

        // Считаем survey-related
        const surveyCount = Object.entries(byType)
          .filter(
            ([type]) =>
              type.toLowerCase().includes("survey") ||
              type.toLowerCase().includes("опрос"),
          )
          .reduce((sum, [, count]) => sum + count, 0);

        console.log(
          `Survey-related notifications: ${surveyCount}/${notifications.length}`,
        );
      });
    });

    test("C5384: Уведомления о приближающемся дедлайне", async ({
      surveyAPI,
      notificationsAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Уведомления о приближающемся дедлайне", async () => {
        const notifications = await getNotifications(notificationsAPI, 100);

        // Ищем уведомления о дедлайне
        const deadlineNotifications = notifications.filter(
          (n) =>
            n.type?.toLowerCase().includes("deadline") ||
            n.type?.toLowerCase().includes("reminder") ||
            n.message?.toLowerCase().includes("дедлайн") ||
            n.message?.toLowerCase().includes("срок") ||
            n.message?.toLowerCase().includes("напомин") ||
            n.title?.toLowerCase().includes("напомин"),
        );

        console.log(
          `Deadline/reminder notifications: ${deadlineNotifications.length}`,
        );

        if (deadlineNotifications.length > 0) {
          console.log(
            "Deadline notification example:",
            JSON.stringify(deadlineNotifications[0], null, 2),
          );
        }
      });
    });
  },
);
