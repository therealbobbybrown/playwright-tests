// tests/functional/performance-review/resume/pr-resume-reminders-api.spec.js
// API тест: после resume напоминания удаляются, уведомления и письма НЕ отправляются (DEVAPR-11754)

import { test as base, expect } from "../../../fixtures/full.js";
import {
  PerformanceReviewAPI,
  getCredentials,
} from "../../../utils/api/index.js";
import { TestDataHelper } from "../../../utils/TestDataHelper.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";
import { assertSuccessStatus } from "../../../utils/api/common-assertions.js";

const test = base.extend({
  prAPI: async ({ request }, use) => {
    const api = new PerformanceReviewAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
});

test.describe(
  "PR Resume — Напоминания удаляются после resume",
  { tag: ["@api", "@regression", "@performance-review", "@resume"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.PERFORMANCE_REVIEW, "Resume Reminders");
    });

    let createdReviewId = null;

    test.afterEach(async ({ prAPI }) => {
      if (createdReviewId) {
        try {
          await prAPI.stop(createdReviewId);
        } catch {
          /* ignore */
        }
        try {
          await prAPI.archive(createdReviewId);
          await prAPI.remove(createdReviewId);
        } catch {
          /* ignore */
        }
        createdReviewId = null;
      }
    });

    test(
      "C7446: После resume запланированные напоминания удаляются автоматически",
      { tag: ["@medium"] },
      async ({ prAPI, prSeed }) => {
        setSeverity("normal");
        test.setTimeout(180000);

        const { seedHelper } = prSeed;
        let prId, revisionId, remindId;

        await test.step(
          "Создать PR с enableReminds: true и запустить",
          async () => {
            const pr = await seedHelper.seedActivePR({
              title: TestDataHelper.generateUniqueName(
                "Напоминания возобновления",
              ),
              notificationsSchedule: {
                enableReminds: true,
                baseDate: new Date().toISOString(),
                repeatType: "everyWorkDay",
                timezoneOffset: new Date().getTimezoneOffset(),
              },
            });
            prId = pr.id;
            createdReviewId = prId;
            revisionId = pr.revisionId;

            expect(typeof prId).toBe("number");
            expect(prId).toBeGreaterThan(0);

            if (!revisionId) {
              const { data: revision } = await prAPI.getLastRevision(prId);
              revisionId = revision?.id;
            }
            expect(typeof revisionId).toBe("number");
            expect(revisionId).toBeGreaterThan(0);
            console.log(
              `PR ${prId} создан и запущен (revisionId=${revisionId})`,
            );
          },
        );

        await test.step("Создать напоминание", async () => {
          const { response, data } = await prAPI.createRemind({
            revisionId,
            title: "Test reminder before resume",
            body: "This reminder should be deleted after resume",
            scheduledAt: new Date(Date.now() + 86400000).toISOString(),
            type: "revision",
          });
          assertSuccessStatus(response);
          expect(data).toBeDefined();
          expect(typeof data.id).toBe("number");
          expect(data.id).toBeGreaterThan(0);
          remindId = data.id;
          console.log(`Напоминание создано: id=${remindId}`);
        });

        await test.step(
          "Проверить что напоминание существует до остановки",
          async () => {
            const { response, data } = await prAPI.getReminds({
              revisionId,
              limit: 50,
            });
            assertSuccessStatus(response);

            const items = data?.items || data || [];
            const found = items.find((r) => r.id === remindId);
            expect(
              found,
              `Напоминание id=${remindId} должно присутствовать до остановки`,
            ).toBeTruthy();
            console.log(
              `Напоминание найдено в списке (всего: ${items.length})`,
            );
          },
        );

        await test.step("Остановить PR", async () => {
          const { response } = await prAPI.stop(prId);
          assertSuccessStatus(response);

          const { data: prData } = await prAPI.getById(prId);
          expect(prData.status).toBe("complete");
          console.log(`PR ${prId} остановлен (status: complete)`);
        });

        await test.step("Resume PR", async () => {
          const { response } = await prAPI.resume(prId);
          assertSuccessStatus(response);

          const { data: prData } = await prAPI.getById(prId);
          expect(prData.status).toBe("active");
          console.log(`PR ${prId} возобновлён — статус: active`);
        });

        await test.step(
          "Проверить что напоминания удалены после resume",
          async () => {
            const { response, data } = await prAPI.getReminds({
              revisionId,
              limit: 50,
            });
            assertSuccessStatus(response);

            const items = data?.items || data || [];
            expect(
              items.length,
              "После resume все запланированные напоминания должны быть удалены",
            ).toBe(0);
            console.log(
              `После resume: ${items.length} напоминаний (ожидалось 0)`,
            );
          },
        );

        await test.step(
          "Проверить что enableReminds выключен после resume",
          async () => {
            const { data: prData } = await prAPI.getById(prId);
            expect(
              prData.notificationsSchedule?.enableReminds,
              "enableReminds должен быть false после resume",
            ).toBe(false);
            console.log(
              `enableReminds = ${prData.notificationsSchedule?.enableReminds}`,
            );
          },
        );

        await test.step("Завершить PR", async () => {
          const { response } = await prAPI.stop(prId);
          assertSuccessStatus(response);
          console.log(`PR ${prId} завершён`);
        });
      },
    );

    test(
      "C7459: После resume — DB: расписание отключено, уведомления и письма не отправлены",
      { tag: ["@medium"] },
      async ({ prAPI, prSeed, db }) => {
        setSeverity("normal");
        test.setTimeout(180000);

        const { seedHelper } = prSeed;
        let prId, revisionId;
        let targetUserIds = [];
        let resumeTimestamp;

        await test.step(
          "Создать PR с enableReminds: true и запустить",
          async () => {
            const pr = await seedHelper.seedActivePR({
              title: TestDataHelper.generateUniqueName("DB Resume Check"),
              notificationsSchedule: {
                enableReminds: true,
                baseDate: new Date().toISOString(),
                repeatType: "everyWorkDay",
                timezoneOffset: new Date().getTimezoneOffset(),
              },
            });
            prId = pr.id;
            createdReviewId = prId;
            revisionId = pr.revisionId;

            if (!revisionId) {
              const { data: revision } = await prAPI.getLastRevision(prId);
              revisionId = revision?.id;
            }
            expect(prId).toBeGreaterThan(0);
            expect(revisionId).toBeGreaterThan(0);
            console.log(`PR ${prId}, revision ${revisionId}`);
          },
        );

        await test.step("Получить user_id участников PR", async () => {
          const { data: tuData } = await prAPI.getTargetUsers(prId, {});
          const items = tuData?.items || tuData || [];
          targetUserIds = items.map(
            (tu) => tu.userId || tu.user_id || tu.id,
          );
          expect(
            targetUserIds.length,
            "PR должен иметь участников",
          ).toBeGreaterThan(0);
          console.log(`Участники: ${targetUserIds.join(", ")}`);
        });

        await test.step(
          "DB: проверить расписание включено до остановки",
          async () => {
            if (!db.isConnected()) {
              console.log("[DB] Пропуск: нет подключения");
              return;
            }
            const rows = await db.query(
              "SELECT enable_reminds, is_active, next_run_date FROM performance_review_notifications_schedules WHERE performance_review_id = ?",
              [prId],
            );
            expect(rows.length, "Расписание должно существовать").toBe(1);
            expect(rows[0].enable_reminds, "enable_reminds=1 до stop").toBe(1);
            expect(rows[0].is_active, "is_active=1 до stop").toBe(1);
            expect(
              rows[0].next_run_date,
              "next_run_date не null до stop",
            ).not.toBeNull();
            console.log("DB: расписание включено до stop");
          },
        );

        await test.step("Остановить и возобновить PR", async () => {
          const { response: stopResp } = await prAPI.stop(prId);
          assertSuccessStatus(stopResp);

          resumeTimestamp = new Date().toISOString();

          const { response: resumeResp } = await prAPI.resume(prId);
          assertSuccessStatus(resumeResp);

          const { data: prData } = await prAPI.getById(prId);
          expect(prData.status).toBe("active");
          console.log(`PR ${prId} resumed at ${resumeTimestamp}`);
        });

        await test.step(
          "DB: расписание отключено после resume",
          async () => {
            if (!db.isConnected()) {
              console.log("[DB] Пропуск: нет подключения");
              return;
            }
            const rows = await db.query(
              "SELECT enable_reminds, is_active, next_run_date FROM performance_review_notifications_schedules WHERE performance_review_id = ?",
              [prId],
            );
            expect(rows.length, "Расписание должно существовать").toBe(1);
            expect(
              rows[0].enable_reminds,
              "enable_reminds должен быть 0 после resume",
            ).toBe(0);
            expect(
              rows[0].is_active,
              "is_active должен быть 0 после resume",
            ).toBe(0);
            expect(
              rows[0].next_run_date,
              "next_run_date должен быть null после resume",
            ).toBeNull();
            console.log("DB: расписание отключено после resume");
          },
        );

        await test.step(
          "DB: уведомления (колокольчик) НЕ отправлены при resume",
          async () => {
            if (!db.isConnected()) {
              console.log("[DB] Пропуск: нет подключения");
              return;
            }
            // Проверяем что нет performanceReviewRevision уведомлений для этого revision
            const revisionNotifs = await db.query(
              "SELECT id, user_id, entity_name, created_at FROM notifications WHERE entity_id = ? AND entity_name = ? ORDER BY created_at DESC",
              [revisionId, "performanceReviewRevision"],
            );
            expect(
              revisionNotifs.length,
              "Не должно быть performanceReviewRevision уведомлений (resume не шлёт)",
            ).toBe(0);

            // Проверяем что нет новых ActionsRequest после resume (только от старта)
            const actionsAfterResume = await db.query(
              "SELECT id, user_id, created_at FROM notifications WHERE entity_id = ? AND entity_name = ? AND created_at > ?",
              [revisionId, "performanceReviewActionsRequest", resumeTimestamp],
            );
            expect(
              actionsAfterResume.length,
              "Не должно быть новых ActionsRequest уведомлений после resume",
            ).toBe(0);

            console.log(
              "DB: 0 уведомлений при resume (performanceReviewRevision=0, новых ActionsRequest=0)",
            );
          },
        );

        await test.step(
          "DB: email-письма НЕ отправлены при resume",
          async () => {
            if (!db.isConnected()) {
              console.log("[DB] Пропуск: нет подключения");
              return;
            }

            // Получаем email-адреса участников
            const userPlaceholders = targetUserIds.map(() => "?").join(", ");
            const userEmails = await db.query(
              `SELECT u.id, a.email FROM users u JOIN accounts a ON u.account_id = a.id WHERE u.id IN (${userPlaceholders})`,
              targetUserIds,
            );
            const emails = userEmails.map((u) => u.email).filter(Boolean);
            if (emails.length === 0) {
              console.log(
                "[DB] Нет email участников — пропуск проверки писем",
              );
              return;
            }

            // Проверяем что нет писем об оценке после resume
            let emailCount = 0;
            try {
              const emailPlaceholders = emails.map(() => "?").join(", ");
              const emailRows = await db.query(
                `SELECT id, \`to\`, subject, created_at FROM \`appraise-mailer\`.email_messages WHERE \`to\` IN (${emailPlaceholders}) AND subject LIKE ? AND created_at > ?`,
                [...emails, "%оценк%", resumeTimestamp],
              );
              emailCount = emailRows.length;
            } catch (e) {
              // appraise-mailer может быть недоступна — не фатально
              console.log(
                `[DB] appraise-mailer недоступна: ${e.message} — пропуск`,
              );
              return;
            }

            expect(
              emailCount,
              "Не должно быть email-писем об оценке после resume",
            ).toBe(0);
            console.log(
              `DB: 0 email-писем после resume (проверено ${emails.length} адресов)`,
            );
          },
        );

        await test.step("Завершить PR", async () => {
          const { response } = await prAPI.stop(prId);
          assertSuccessStatus(response);
          console.log(`PR ${prId} завершён`);
        });
      },
    );
  },
);
