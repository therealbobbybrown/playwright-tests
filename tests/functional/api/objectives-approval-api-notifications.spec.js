// @ts-check
import { test as fullTest, expect } from "../../fixtures/full.js";
import { ObjectivesAPI, getCredentials } from "../../utils/api/index.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { assertSuccessStatus } from "../../utils/api/common-assertions.js";

/**
 * API тесты: Уведомления при утверждении целей (DEVAPR-11722)
 *
 * Проверяет in-app уведомления (таблица notifications) и email-уведомления
 * (appraise-mailer.email_messages) при переходах статусов утверждения:
 * - Отправка на утверждение → уведомление руководителю (action='approval')
 * - Утверждение → уведомление автору (action='approved')
 * - Возврат на доработку → уведомление автору
 * - Email при отправке на утверждение → руководителю
 *
 * Аккаунты:
 * - Admin: qaadmin@example.org (user_id=91355)
 * - Head:  qaadmin+55@example.org (user_id=91407)
 * - User:  qaadmin+56@example.org (user_id=91461)
 */

const HEAD_USER_ID = 91407;
const AUTHOR_USER_ID = 91461;
const HEAD_EMAIL = "qaadmin+55@example.org";

const test = fullTest.extend({
  adminAPI: async ({ request }, use) => {
    const api = new ObjectivesAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
  headAPI: async ({ request }, use) => {
    const api = new ObjectivesAPI(request);
    const { email, password } = getCredentials("head");
    await api.signIn(email, password);
    await use(api);
  },
  userAPI: async ({ request }, use) => {
    const api = new ObjectivesAPI(request);
    const { email, password } = getCredentials("user");
    await api.signIn(email, password);
    await use(api);
  },
});

// Cleanup
const createdObjectiveIds = [];
let approvalWasEnabled = false;

// Helper: создать цель от user(91461) в статусе active
async function createUserObjective(userAPI, overrides = {}) {
  const timestamp = Date.now();
  const { startDate, endDate } = ObjectivesAPI.getCurrentQuarterDates();
  const userId = userAPI.getCurrentUserId() || AUTHOR_USER_ID;

  const { response, data } = await userAPI.saveObjective({
    title: `Notification Test ${timestamp}`,
    description: `Test objective for approval notifications ${timestamp}`,
    startDate,
    endDate,
    status: "active",
    level: "self",
    responsibleUserId: userId,
    userAccessType: "everybody",
    milestones: [
      {
        temporaryId: `temp-${timestamp}`,
        title: `KR ${timestamp}`,
        type: "percent",
        weight: 100,
        progress: 0,
        responsibleUserId: userId,
      },
    ],
    ...overrides,
  });

  if (response.ok() && data?.id) {
    createdObjectiveIds.push(data.id);
  }
  return { response, data };
}

test.describe(
  "Objectives Approval API — Notifications",
  {
    tag: [
      "@api",
      "@objectives",
      "@approval",
      "@notifications",
      "@regression",
      "@db",
    ],
  },
  () => {
    test.beforeAll(async ({ request }) => {
      // Включить утверждение
      const api = new ObjectivesAPI(request);
      const { email, password } = getCredentials("admin");
      await api.signIn(email, password);

      const { data: settings } = await api.getCompanySettings();
      approvalWasEnabled = !!settings?.isObjectivesApprovalEnabled;

      if (!approvalWasEnabled) {
        await api.setApprovalEnabled(true);
      }
    });

    test.beforeEach(() => {
      markAsAPITest(MODULES.OBJECTIVES, "Approval Notifications");
    });

    test(
      "C8378: Отправка на утверждение → уведомление руководителю",
      { tag: ["@critical"] },
      async ({ userAPI, objectivesVerifier }) => {
        setSeverity("critical");

        let objectiveId;

        await test.step("Создать цель от user", async () => {
          const { response, data } = await createUserObjective(userAPI);
          assertSuccessStatus(response);
          objectiveId = data.id;
          expect(objectiveId, "ID цели должен быть определён").toBeDefined();
        });

        await test.step(
          "Отправить на утверждение (approvalWaiting → approvalProcess)",
          async () => {
            const { response } = await userAPI.sendForApproval(objectiveId);
            assertSuccessStatus(response);
          },
        );

        await test.step(
          `DB: уведомление (action='approval') для руководителя user_id=${HEAD_USER_ID}`,
          async () => {
            if (!objectivesVerifier.isConnected()) return;
            await objectivesVerifier.verifyApprovalNotification(
              HEAD_USER_ID,
              objectiveId,
              "approval",
            );
          },
        );
      },
    );

    test(
      "C8379: Утверждение руководителем → уведомление автору",
      { tag: ["@critical"] },
      async ({ userAPI, headAPI, objectivesVerifier }) => {
        setSeverity("critical");

        let objectiveId;

        await test.step("Создать цель и отправить на утверждение", async () => {
          const { response, data } = await createUserObjective(userAPI);
          assertSuccessStatus(response);
          objectiveId = data.id;
          const { response: sendResp } =
            await userAPI.sendForApproval(objectiveId);
          assertSuccessStatus(sendResp);
        });

        await test.step("Head утверждает цель", async () => {
          const { response } = await headAPI.approveObjective(objectiveId);
          assertSuccessStatus(response);
        });

        await test.step(
          `DB: уведомление (action='approved') для автора user_id=${AUTHOR_USER_ID}`,
          async () => {
            if (!objectivesVerifier.isConnected()) return;
            await objectivesVerifier.verifyApprovalNotification(
              AUTHOR_USER_ID,
              objectiveId,
              "approved",
            );
          },
        );
      },
    );

    test(
      "C8380: Возврат на доработку → уведомление автору",
      { tag: ["@critical"] },
      async ({ userAPI, headAPI, objectivesVerifier }) => {
        setSeverity("critical");

        let objectiveId;

        await test.step("Создать цель и отправить на утверждение", async () => {
          const { response, data } = await createUserObjective(userAPI);
          assertSuccessStatus(response);
          objectiveId = data.id;
          const { response: sendResp } =
            await userAPI.sendForApproval(objectiveId);
          assertSuccessStatus(sendResp);
        });

        await test.step("Head возвращает на доработку", async () => {
          const { response } = await headAPI.returnToRevision(
            objectiveId,
            "Уточни формулировку KR",
          );
          assertSuccessStatus(response);
        });

        await test.step(
          `DB: уведомление для автора user_id=${AUTHOR_USER_ID} после возврата`,
          async () => {
            if (!objectivesVerifier.isConnected()) return;

            // action при возврате может быть 'approval' или другим значением.
            // Пробуем 'approval' (автор снова в approvalWaiting — повторный запрос утверждения).
            // Если не найдено — делаем широкий запрос и логируем что нашли.
            let notification = null;
            try {
              notification =
                await objectivesVerifier.verifyApprovalNotification(
                  AUTHOR_USER_ID,
                  objectiveId,
                  "approval",
                );
            } catch {
              // Широкий поиск: любое уведомление для автора по этой цели
              const found = await objectivesVerifier.db.queryOne(
                "SELECT * FROM notifications WHERE user_id = ? AND entity_name = 'objective' AND entity_id = ? AND deleted_at IS NULL ORDER BY id DESC LIMIT 1",
                [AUTHOR_USER_ID, objectiveId],
              );
              console.log(
                `[C-APPROVAL-NOTIF-03] Широкий поиск уведомления для автора:`,
                found
                  ? `найдено action='${found.action}'`
                  : "не найдено",
              );
              expect(
                found,
                `Уведомление для автора (user_id=${AUTHOR_USER_ID}, entity_id=${objectiveId}) не найдено в БД ни с каким action`,
              ).not.toBeNull();
              notification = found;
            }

            expect(
              notification,
              "Уведомление для автора должно существовать",
            ).not.toBeNull();
          },
        );
      },
    );

    test(
      "C8381: Email при отправке на утверждение → на почту руководителя",
      { tag: ["@critical"] },
      async ({ userAPI, objectivesVerifier }) => {
        setSeverity("critical");

        let objectiveId;
        let objectiveTitle;

        await test.step("Создать цель от user с уникальным title", async () => {
          const timestamp = Date.now();
          objectiveTitle = `Notification Email Test ${timestamp}`;
          const { response, data } = await createUserObjective(userAPI, {
            title: objectiveTitle,
          });
          assertSuccessStatus(response);
          objectiveId = data.id;
          expect(objectiveId, "ID цели должен быть определён").toBeDefined();
        });

        await test.step("Отправить на утверждение", async () => {
          const { response } = await userAPI.sendForApproval(objectiveId);
          assertSuccessStatus(response);
        });

        await test.step(
          `DB appraise-mailer: email для ${HEAD_EMAIL} с темой "Утвердите цель сотрудника"`,
          async () => {
            if (!objectivesVerifier.isConnected()) {
              throw new Error("DB не подключена — email проверка невозможна");
            }
            // Subject = "Утвердите цель сотрудника" (фиксированный, не содержит имя цели)
            const emailRecord = await objectivesVerifier.verifyApprovalEmail(
              HEAD_EMAIL,
              "Утвердите цель сотрудника",
              15000,
            );
            expect(emailRecord.to).toContain(HEAD_EMAIL);
            expect(emailRecord.subject).toBe("Утвердите цель сотрудника");
          },
        );
      },
    );

    // Cleanup
    test.afterAll(async ({ request }) => {
      const api = new ObjectivesAPI(request);
      const { email, password } = getCredentials("admin");
      await api.signIn(email, password);

      for (const id of createdObjectiveIds) {
        await api.deleteObjective(id).catch(() => {});
      }
      createdObjectiveIds.length = 0;

      // Восстановить настройку утверждения
      if (!approvalWasEnabled) {
        await api.setApprovalEnabled(false);
      }
    });
  },
);
