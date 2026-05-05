// tests/functional/performance-review/resume/pr-resume-dashboard-tasks-api.spec.js
// API тест: RESUME-074 — видимость оценки на дашборде после resume

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
  "PR Resume — Видимость задач на дашборде после resume",
  { tag: ["@api", "@regression", "@performance-review", "@resume"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.PERFORMANCE_REVIEW, "Resume Dashboard Tasks");
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
      "C7418: Возобновлённый PR появляется в списке активных оценок на дашборде",
      { tag: ["@medium"] },
      async ({ prAPI, prSeed }) => {
        setSeverity("normal");
        test.setTimeout(180000);

        const { seedHelper } = prSeed;
        let prId, prTitle, revisionId, targetUserIds;

        await test.step("Создать PR с незаполненными анкетами и остановить", async () => {
          prTitle = TestDataHelper.generateUniqueName("Задачи дашборда");
          // Создаём PR без заполнения анкет — оценки остаются незавершёнными
          const pr = await seedHelper.seedStoppedPR({
            fillAssessments: false,
            title: prTitle,
          });
          prId = pr.id;
          createdReviewId = prId;
          expect(typeof prId).toBe("number");
          expect(prId).toBeGreaterThan(0);
          console.log(`✓ PR ${prId} (${prTitle}) создан и остановлен`);
        });

        await test.step("Проверить, что PR присутствует в общем списке до resume", async () => {
          const { response, data } = await prAPI.getList();
          assertSuccessStatus(response);

          const items = data?.items || data || [];
          const found = items.find((pr) => pr.id === prId);
          expect(
            found,
            `PR id=${prId} должен присутствовать в списке оценок`,
          ).toBeTruthy();
          // Статус остановленного PR в list API может быть "stopped" или "complete"
          const stoppedStatuses = ["stopped", "complete"];
          expect(
            stoppedStatuses,
            `Статус PR до resume должен быть одним из: ${stoppedStatuses.join(", ")}`,
          ).toContain(found.status);
          console.log(
            `✓ PR ${prId} найден в списке со статусом: ${found.status}`,
          );
        });

        await test.step("Resume PR", async () => {
          const { response } = await prAPI.resume(prId);
          assertSuccessStatus(response);
          console.log(`✓ PR ${prId} возобновлён`);
        });

        await test.step("Получить revisionId после resume", async () => {
          const { data: revision } = await prAPI.getLastRevision(prId);
          expect(revision).toBeDefined();
          revisionId = revision.id;
          expect(typeof revisionId).toBe("number");
          expect(revisionId).toBeGreaterThan(0);
          console.log(`✓ revisionId после resume: ${revisionId}`);
        });

        await test.step("Проверить статус PR через getById — должен быть active", async () => {
          const { response, data: prData } = await prAPI.getById(prId);
          assertSuccessStatus(response);

          expect(
            prData.status,
            "Статус PR после resume должен быть active",
          ).toBe("active");
          expect(
            prData.title,
            "Заголовок PR должен соответствовать созданному",
          ).toBe(prTitle);
          console.log(
            `✓ PR ${prId} — статус: ${prData.status}, заголовок: ${prData.title}`,
          );
        });

        await test.step("Проверить, что возобновлённый PR появляется в списке активных оценок", async () => {
          const { response, data } = await prAPI.getList();
          assertSuccessStatus(response);

          const items = data?.items || data || [];
          const found = items.find((pr) => pr.id === prId);
          expect(
            found,
            `PR id=${prId} должен присутствовать в списке после resume`,
          ).toBeTruthy();
          expect(
            found.status,
            "Статус PR после resume в списке должен быть active",
          ).toBe("active");
          expect(
            found.title,
            "Заголовок PR в списке должен быть корректным",
          ).toBe(prTitle);
          console.log(
            `✓ PR ${prId} найден в списке активных оценок — статус: ${found.status}`,
          );
        });

        await test.step("Получить target users для проверки прогресса незаполненных анкет", async () => {
          const { response, data: tuData } = await prAPI.getTargetUsers(prId, {
            limit: 50,
          });
          assertSuccessStatus(response);

          const items = tuData?.items || tuData || [];
          expect(
            items.length,
            "У resumed PR должен быть хотя бы один target user",
          ).toBeGreaterThan(0);

          targetUserIds = items.map((u) => u.userId || u.user?.id || u.id);
          console.log(
            `✓ Target users (${items.length}): ${targetUserIds.join(", ")}`,
          );
        });

        await test.step("Проверить прогресс незаполненных анкет через API дашборда", async () => {
          // Структура записи прогресса:
          // { targetUserId, total, completed, selfTotal, selfCompleted, selfSkipped, skipped }
          const { response, data: progressData } =
            await prAPI.getTargetUsersProgress(prId, {
              revisionId,
              usersIds: targetUserIds,
            });
          assertSuccessStatus(response);

          const items = progressData?.items || progressData || [];
          expect(
            items.length,
            "Прогресс должен содержать записи по target users",
          ).toBeGreaterThan(0);

          // Все записи должны содержать поле targetUserId
          for (const entry of items) {
            expect(
              entry.targetUserId,
              "Каждая запись прогресса должна содержать targetUserId",
            ).toBeGreaterThan(0);
          }

          // Анкеты не были заполнены — completed < total для всех записей
          const hasIncomplete = items.some(
            (entry) => entry.completed < entry.total,
          );
          expect(
            hasIncomplete,
            "После resume без заполнения анкет хотя бы одна запись должна иметь completed < total",
          ).toBe(true);

          console.log(
            `✓ Прогресс получен: ${items.length} записей, есть незаполненные анкеты: ${hasIncomplete}`,
          );
          for (const entry of items.slice(0, 3)) {
            console.log(
              `  - targetUserId=${entry.targetUserId}: completed=${entry.completed}/${entry.total}, selfCompleted=${entry.selfCompleted}/${entry.selfTotal}`,
            );
          }
        });

        await test.step("Завершить PR", async () => {
          const { response } = await prAPI.stop(prId);
          assertSuccessStatus(response);
          console.log(`✓ PR ${prId} завершён`);
        });
      },
    );
  },
);
