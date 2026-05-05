// tests/functional/performance-review/resume/pr-resume-cross-cycle-api.spec.js
// API тест: Кросс-цикловой resume — проверки через API (RESUME-060..062)
//
// ВАЖНО: Создание нового цикла доступно только через UI (кнопка "Создать новый цикл").
// API-метод createNewCycle отсутствует в PerformanceReviewAPI.
// Этот тест проверяет базовое поведение: stop → resume → revision та же.
// Для полного кросс-циклового теста используй pr-resume-cross-cycle-e2e.spec.js.

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
  "PR Resume - Cross-Cycle API",
  { tag: ["@api", "@regression", "@performance-review", "@resume"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.PERFORMANCE_REVIEW, "Resume Cross-Cycle");
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
      "C7414: Revision ID сохраняется через stop → resume → stop → resume",
      { tag: ["@critical"] },
      async ({ prAPI, prSeed }) => {
        setSeverity("critical");

        let prId;
        let originalRevisionId;

        await test.step("Создать PR, запустить, заполнить", async () => {
          const { seedHelper } = prSeed;
          const pr = await seedHelper.seedActivePR({
            fillAssessments: true,
            title: TestDataHelper.generateUniqueName("Стабильность ревизий"),
          });
          prId = pr.id;
          createdReviewId = prId;
          originalRevisionId = pr.revisionId;
          expect(typeof originalRevisionId).toBe("number");
          expect(originalRevisionId).toBeGreaterThan(0);
        });

        await test.step("Цикл: stop → resume × 3", async () => {
          for (let cycle = 1; cycle <= 3; cycle++) {
            // Stop
            const { response: stopResp } = await prAPI.stop(prId);
            assertSuccessStatus(stopResp);

            const { data: stoppedPR } = await prAPI.getById(prId);
            expect(["stopped", "complete"]).toContain(stoppedPR.status);

            // Resume
            const { response: resumeResp } = await prAPI.resume(prId);
            assertSuccessStatus(resumeResp);

            const { data: activePR } = await prAPI.getById(prId);
            expect(activePR.status).toBe("active");

            // Revision всё та же
            const { data: revision } = await prAPI.getLastRevision(prId);
            expect(revision.id).toBe(originalRevisionId);

            console.log(
              `✓ Цикл ${cycle}: stop → resume, revision=${revision.id}`,
            );
          }
        });

        await test.step("Результаты доступны после 3 циклов stop/resume", async () => {
          const targetUsersIds = await getTargetUserIds(prAPI, prId);
          expect(targetUsersIds.length).toBeGreaterThan(0);

          const { response: summResp, data: summData } =
            await prAPI.getStatisticsSummaryResults(prId, {
              targetUsersIds,
              revisionId: originalRevisionId,
            });
          assertSuccessStatus(summResp);
          expect(summData).toBeTruthy();
          expect(summData.heatMapResults).toBeTruthy();
          expect(summData.directions).toBeTruthy();
          expect(summData.directions.length).toBeGreaterThan(0);

          const heatUsers = Object.keys(
            summData.heatMapResults?.targetUsers || {},
          );
          expect(heatUsers.length).toBeGreaterThan(0);
          console.log(
            `✓ Результаты после 3 циклов: ${heatUsers.length} пользователей`,
          );
        });
      },
    );

    test(
      "C7415: Resume async PR — статус active, no re-launch",
      { tag: ["@critical"] },
      async ({ prAPI, prSeed }) => {
        setSeverity("critical");

        let prId;
        let revisionId;

        await test.step("Создать async PR и остановить", async () => {
          const { seedHelper } = prSeed;
          // Создаём async PR
          const pr = await seedHelper.seedStoppedPR({
            fillAssessments: true,
            title: TestDataHelper.generateUniqueName("Возобновление асинхронного"),
            isAsyncSteps: true,
          });
          prId = pr.id;
          createdReviewId = prId;
          revisionId = pr.revisionId;
        });

        await test.step("Resume async PR → active", async () => {
          const { response } = await prAPI.resume(prId);
          assertSuccessStatus(response);

          const { data: prData } = await prAPI.getById(prId);
          expect(prData.status).toBe("active");

          // Revision та же
          const { data: revision } = await prAPI.getLastRevision(prId);
          expect(typeof revisionId).toBe("number");
          expect(revisionId).toBeGreaterThan(0);
          expect(revision.id).toBe(revisionId);
          console.log(
            `✓ Async PR resumed: status=${prData.status}, revision=${revision.id}`,
          );
        });
      },
    );
  },
);
