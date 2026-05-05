// tests/functional/performance-review/resume/pr-resume-api.spec.js
// API тесты: Возобновление оценки (Resume) — базовые проверки через API

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
import { getTargetUserIds } from "../../../utils/api/test-helpers.js";

const test = base.extend({
  prAPI: async ({ request }, use) => {
    const api = new PerformanceReviewAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
});

test.describe(
  "PR Resume API",
  { tag: ["@api", "@regression", "@performance-review", "@resume"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.PERFORMANCE_REVIEW, "Resume");
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
      "C7399: Resume → статус меняется на активный",
      { tag: ["@critical"] },
      async ({ prAPI, prSeed }) => {
        setSeverity("critical");

        let prId;
        let revisionIdBefore;

        await test.step("Создать PR, запустить, заполнить и остановить", async () => {
          const { seedHelper } = prSeed;
          const pr = await seedHelper.seedStoppedPR({
            fillAssessments: true,
            title: TestDataHelper.generateUniqueName("Возобновление ревью (API)"),
          });
          prId = pr.id;
          createdReviewId = prId;
          revisionIdBefore = pr.revisionId;

          expect(typeof prId).toBe("number");
          expect(prId).toBeGreaterThan(0);
          expect(typeof revisionIdBefore).toBe("number");
          expect(revisionIdBefore).toBeGreaterThan(0);

          // Проверяем что PR остановлен (или автозавершён, если все анкеты заполнены)
          const { data: prData } = await prAPI.getById(prId);
          expect(["stopped", "complete"]).toContain(prData.status);
        });

        await test.step("Resume → статус active", async () => {
          const { response } = await prAPI.resume(prId);
          assertSuccessStatus(response);

          const { data: prData } = await prAPI.getById(prId);
          expect(prData.status).toBe("active");
        });

        await test.step("RESUME-003: Revision ID не изменился после resume", async () => {
          const { data: revision } = await prAPI.getLastRevision(prId);
          expect(revision.id).toBe(revisionIdBefore);
        });

        await test.step("RESUME-006: Повторное завершение и повторный resume", async () => {
          // Остановить
          const { response: stopResp } = await prAPI.stop(prId);
          assertSuccessStatus(stopResp);

          const { data: stoppedPR } = await prAPI.getById(prId);
          expect(["stopped", "complete"]).toContain(stoppedPR.status);

          // Повторный resume
          const { response: resumeResp2 } = await prAPI.resume(prId);
          assertSuccessStatus(resumeResp2);

          const { data: activePR } = await prAPI.getById(prId);
          expect(activePR.status).toBe("active");

          // Revision всё ещё та же
          const { data: revision } = await prAPI.getLastRevision(prId);
          expect(revision.id).toBe(revisionIdBefore);
        });
      },
    );

    test(
      "C7400: После resume заполнение пересчитывает результаты",
      { tag: ["@critical"] },
      async ({ prAPI, prSeed }) => {
        setSeverity("critical");

        let prId;

        await test.step("Создать PR, запустить (без заполнения) и остановить", async () => {
          const { seedHelper } = prSeed;
          const pr = await seedHelper.seedStoppedPR({
            fillAssessments: false,
            title: TestDataHelper.generateUniqueName("Возобновление заполнения"),
          });
          prId = pr.id;
          createdReviewId = prId;
          expect(typeof prId).toBe("number");
          expect(prId).toBeGreaterThan(0);
        });

        await test.step("Resume", async () => {
          const { response } = await prAPI.resume(prId);
          assertSuccessStatus(response);
        });

        await test.step("Заполнить анкеты через populateReview после resume", async () => {
          const { seedHelper: filler } = prSeed;
          const filled = await filler.fillQuestionnaires(prId);
          expect(filled).toBeGreaterThan(0);
          console.log(`Заполнено анкет после resume: ${filled}`);
        });

        await test.step("Проверить что результаты доступны", async () => {
          const { data: revision } = await prAPI.getLastRevision(prId);
          expect(revision).toBeDefined();
          expect(typeof revision.id).toBe("number");
          expect(revision.id).toBeGreaterThan(0);

          const targetUsersIds = await getTargetUserIds(prAPI, prId);
          expect(targetUsersIds.length).toBeGreaterThan(0);

          const { response: summResp, data: summData } =
            await prAPI.getStatisticsSummaryResults(prId, {
              targetUsersIds,
              revisionId: revision.id,
            });
          assertSuccessStatus(summResp);

          // Результаты должны содержать данные
          expect(summData).toBeTruthy();
          expect(summData.heatMapResults).toBeTruthy();
          expect(summData.directions).toBeTruthy();
          expect(summData.directions.length).toBeGreaterThan(0);
        });
      },
    );

    test(
      "C7401: Результаты содержат данные из обоих раундов",
      { tag: ["@critical"] },
      async ({ prAPI, prSeed }) => {
        setSeverity("critical");

        let prId;
        let revisionId;

        await test.step("Создать PR, запустить, частично заполнить, остановить", async () => {
          const { seedHelper } = prSeed;
          const pr = await seedHelper.seedActivePR({
            fillAssessments: true,
            fillSettings: { skipChance: 50 },
            title: TestDataHelper.generateUniqueName("Возобновление циклов"),
          });
          prId = pr.id;
          createdReviewId = prId;
          revisionId = pr.revisionId;

          const { response: stopResp } = await prAPI.stop(prId);
          assertSuccessStatus(stopResp);
        });

        let filledAfterResume = 0;

        await test.step("Resume и дозаполнить оставшиеся анкеты", async () => {
          const { response } = await prAPI.resume(prId);
          assertSuccessStatus(response);

          const { seedHelper: sh } = prSeed;
          filledAfterResume = await sh.fillQuestionnaires(prId);
          console.log(`Дозаполнено после resume: ${filledAfterResume}`);
        });

        await test.step("Проверить что все ответы учтены в результатах", async () => {
          const targetUsersIds = await getTargetUserIds(prAPI, prId);
          const { response: summResp, data: summData } =
            await prAPI.getStatisticsSummaryResults(prId, {
              targetUsersIds,
              revisionId,
            });
          assertSuccessStatus(summResp);

          // Результаты не должны быть пустыми
          expect(summData).toBeTruthy();
          expect(summData.heatMapResults).toBeTruthy();
          expect(summData.directions).toBeTruthy();
          expect(summData.directions.length).toBeGreaterThan(0);

          // heatMapResults должен содержать данные по target users
          const heatUsers = Object.keys(
            summData.heatMapResults?.targetUsers || {},
          );
          expect(heatUsers.length).toBeGreaterThan(0);
          console.log(
            `✓ Результаты: ${heatUsers.length} пользователей в heatmap`,
          );
        });
      },
    );

    test.describe("Негативные сценарии Resume", () => {
      test(
        "C7402: Resume на draft PR — ошибка",
        { tag: ["@negative"] },
        async ({ prAPI }) => {
          setSeverity("normal");

          await test.step("Создать draft PR и попробовать resume", async () => {
            const title = TestDataHelper.generateUniqueName("Возобновление черновика");
            const { data: created } = await prAPI.create({
              title,
              // ВАЖНО: все 4 направления обязательны, иначе SSR падает с 500
              directions: [
                {
                  id: null,
                  receiverType: "self",
                  isSelected: true,
                  title: null,
                  description: null,
                },
                {
                  id: null,
                  receiverType: "head",
                  isSelected: true,
                  title: null,
                  description: null,
                },
                {
                  id: null,
                  receiverType: "subordinate",
                  isSelected: false,
                  title: null,
                  description: null,
                },
                {
                  id: null,
                  receiverType: "colleague",
                  isSelected: false,
                  title: null,
                  description: null,
                },
              ],
              anonymityType: "notAnonymous",
              workflowType: "basic",
              notificationsSchedule: {
                enableReminds: false,
                baseDate: new Date().toISOString(),
                repeatType: "noRepeat",
                timezoneOffset: 0,
              },
              isApprovalStep: false,
              isAsyncSteps: false,
              isAsyncStepsSelfResponseStep: false,
            });
            createdReviewId = created.id;

            const { response } = await prAPI.resume(created.id);
            expect(response.ok()).toBe(false);
            expect([400, 403, 409]).toContain(response.status());
          });
        },
      );

      test(
        "C7403: Resume на active PR — ошибка",
        { tag: ["@negative"] },
        async ({ prAPI, prSeed }) => {
          setSeverity("normal");

          await test.step("Создать активный PR и попробовать resume", async () => {
            const { seedHelper } = prSeed;
            const pr = await seedHelper.seedActivePR({
              title: TestDataHelper.generateUniqueName("Возобновление активного"),
            });
            createdReviewId = pr.id;

            const { response } = await prAPI.resume(pr.id);
            expect(response.ok()).toBe(false);
            expect([400, 403, 409]).toContain(response.status());
          });
        },
      );

      test(
        "C7404: Resume на archived PR — ошибка",
        { tag: ["@negative"] },
        async ({ prAPI, prSeed, prVerifier }) => {
          setSeverity("normal");

          await test.step("Создать stopped PR, архивировать, попробовать resume", async () => {
            const { seedHelper } = prSeed;
            const pr = await seedHelper.seedStoppedPR({
              title: TestDataHelper.generateUniqueName("Возобновление архивного"),
            });
            createdReviewId = pr.id;

            const { response: archiveResp } = await prAPI.archive(pr.id);
            assertSuccessStatus(archiveResp);

            // Верифицировать архивацию через DB
            await prVerifier.verifyPRArchived(pr.id);

            const { response } = await prAPI.resume(pr.id);
            expect(response.ok()).toBe(false);
            // 404 — archived PR не виден для resume endpoint
            expect([400, 403, 404, 409]).toContain(response.status());
          });
        },
      );
    });
  },
);
