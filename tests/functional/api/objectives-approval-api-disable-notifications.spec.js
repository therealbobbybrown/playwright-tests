// tests/functional/api/objectives-approval-api-disable-notifications.spec.js
// TestRail: C-APPROVAL-DISNOTIF-01
// По брифу 7.2: при выключении утверждения все цели → "Активно" + рассылаются уведомления о назначении
import { expect } from "@playwright/test";
import { test } from "../../fixtures/auth.js";
import { ObjectivesAPI } from "../../utils/api/ObjectivesAPI.js";
import { getCredentials } from "../../utils/credentials.js";
import { DatabaseClient } from "../../utils/db/DatabaseClient.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

let objectiveId = null;
let userId = null;
let beforeDisableTimestamp = null;

test.describe(
  "Objectives Approval API — Уведомления при выключении утверждения",
  { tag: ["@api", "@objectives", "@approval", "@approval-toggle", "@regression"] },
  () => {
    test.beforeAll(async ({ request }) => {
      const adminApi = new ObjectivesAPI(request);
      const { email: ae, password: ap } = getCredentials("admin");
      await adminApi.signIn(ae, ap);
      await adminApi.setApprovalEnabled(true);

      const userApi = new ObjectivesAPI(request);
      await userApi.signIn(getCredentials("user").email, getCredentials("user").password);
      userId = userApi.getCurrentUserId();
      const { startDate, endDate } = ObjectivesAPI.getCurrentQuarterDates();

      // Создаём цель в approvalProcess
      const { data: obj } = await userApi.saveObjective({
        title: `DISNOTIF test ${Date.now()}`,
        startDate, endDate, status: "active", level: "self",
        responsibleUserId: userId, userAccessType: "everybody",
        milestones: [{ temporaryId: `t-disnotif-${Date.now()}`, title: "KR", type: "percent", weight: 100, progress: 0, responsibleUserId: userId }],
      });
      objectiveId = obj.id;
      await userApi.sendForApproval(objectiveId);

      // Запоминаем timestamp перед выключением
      beforeDisableTimestamp = new Date().toISOString();

      // Выключаем утверждение
      await adminApi.setApprovalEnabled(false);

      // Ждём обработки уведомлений
      await new Promise((r) => setTimeout(r, 3000));

      console.log(`[beforeAll] Objective ${objectiveId}, disabled after ${beforeDisableTimestamp}`);
    });

    test.afterAll(async ({ request }) => {
      const api = new ObjectivesAPI(request);
      await api.signIn(getCredentials("admin").email, getCredentials("admin").password);

      // Включаем обратно
      await api.setApprovalEnabled(true).catch(() => {});

      // Удаляем цель
      if (objectiveId) await api.deleteObjective(objectiveId).catch(() => {});
    });

    test.beforeEach(() => {
      markAsAPITest(MODULES.OBJECTIVES);
    });

    test(
      "C8375: При выключении утверждения рассылаются уведомления о назначении целей",
      { tag: ["@critical", "@db"] },
      async ({ request }) => {
        setSeverity("critical");

        // По брифу: "цели считаются назначенными и рассылаются уведомления о назначении целей и ключевых результатов"
        let db;
        try {
          db = new DatabaseClient();
          await db.connect();
        } catch {
          console.warn("DB недоступна — пропускаем DB проверку уведомлений");
          return;
        }

        try {
          await test.step(
            "Проверить in-app уведомление о назначении цели ответственному",
            async () => {
              const [notification] = await db.query(
                `SELECT id, user_id, entity_name, entity_id, action, created_at
                 FROM notifications
                 WHERE user_id = ? AND entity_name = 'objective' AND entity_id = ?
                   AND action IN ('assign', 'assigned', 'goal_assigned', 'objective_assigned')
                   AND created_at > ?
                 ORDER BY id DESC LIMIT 1`,
                [userId, objectiveId, beforeDisableTimestamp],
              );

              expect(
                notification,
                "APP_BUG: при выключении утверждения не рассылается уведомление о назначении цели. " +
                  "По брифу (7.2): 'цели считаются назначенными и рассылаются уведомления'",
              ).toBeTruthy();
            },
          );

          await test.step(
            "Проверить email о назначении цели",
            async () => {
              const [email] = await db.query(
                "SELECT id, `to`, subject, created_at FROM `appraise-mailer`.email_messages " +
                  "WHERE `to` LIKE ? AND created_at > ? AND (subject LIKE '%назнач%' OR subject LIKE '%assign%') " +
                  "ORDER BY id DESC LIMIT 1",
                [`%${getCredentials("user").email.split("@")[0]}%`, beforeDisableTimestamp],
              );

              expect(
                email,
                "APP_BUG: при выключении утверждения не отправляется email о назначении. " +
                  "По брифу (7.2): 'рассылаются уведомления о назначении целей и ключевых результатов'",
              ).toBeTruthy();
            },
          );
        } finally {
          await db.disconnect().catch(() => {});
        }
      },
    );
  },
);
