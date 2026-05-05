// tests/functional/performance-review/resume/pr-resume-anonymous-api.spec.js
// API тест: Resume анонимной оценки — anonymityType сохраняется, анонимность ответов не нарушена

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
import {
  getTargetUserIds,
  getStableHeatmapSnapshot,
} from "../../../utils/api/test-helpers.js";

const test = base.extend({
  prAPI: async ({ request }, use) => {
    const api = new PerformanceReviewAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
});

test.describe(
  "PR Resume — Anonymous Assessment",
  { tag: ["@api", "@regression", "@performance-review", "@resume"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.PERFORMANCE_REVIEW, "Resume Anonymous");
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
      "C7395: AnonymityType сохраняется после resume",
      { tag: ["@critical"] },
      async ({ prAPI, prSeed }) => {
        setSeverity("critical");
        test.setTimeout(180000);

        const { seedHelper } = prSeed;
        let prId, revisionId;

        await test.step("Создать анонимную оценку, заполнить, остановить", async () => {
          const pr = await seedHelper.seedStoppedPR({
            fillAssessments: true,
            anonymityType: "anonymous",
            title: TestDataHelper.generateUniqueName("Анонимное возобновление"),
          });
          prId = pr.id;
          createdReviewId = prId;
          revisionId = pr.revisionId;

          // Подтвердить что PR анонимный
          const { data: prData } = await prAPI.getById(prId);
          expect(prData.anonymityType).toBe("anonymous");
          console.log(`✓ PR создан: anonymityType=${prData.anonymityType}`);
        });

        await test.step("Resume", async () => {
          const { response } = await prAPI.resume(prId);
          assertSuccessStatus(response);
        });

        await test.step("anonymityType остался 'anonymous' после resume", async () => {
          const { data: prData } = await prAPI.getById(prId);
          expect(prData.status).toBe("active");
          expect(prData.anonymityType).toBe("anonymous");
          console.log(`✓ После resume: anonymityType=${prData.anonymityType}`);
        });

        await test.step("Повторное завершение — anonymityType сохранён", async () => {
          const { response: stopResp } = await prAPI.stop(prId);
          assertSuccessStatus(stopResp);

          const { data: prData } = await prAPI.getById(prId);
          expect(prData.anonymityType).toBe("anonymous");
          console.log(
            `✓ После повторного завершения: anonymityType=${prData.anonymityType}`,
          );
        });
      },
    );

    test(
      "C7396: Результаты анонимной оценки после resume — анонимность не нарушена",
      { tag: ["@critical"] },
      async ({ prAPI, prSeed }) => {
        setSeverity("critical");
        test.setTimeout(180000);

        const { seedHelper } = prSeed;
        let prId, revisionId;

        await test.step("Создать анонимную оценку, заполнить, остановить", async () => {
          const pr = await seedHelper.seedStoppedPR({
            fillAssessments: true,
            anonymityType: "anonymous",
            title: TestDataHelper.generateUniqueName("Анонимные результаты"),
          });
          prId = pr.id;
          createdReviewId = prId;
          revisionId = pr.revisionId;
        });

        let snapshotBefore;

        await test.step("Зафиксировать результаты до resume (стабильный snapshot)", async () => {
          const targetUsersIds = await getTargetUserIds(prAPI, prId);
          snapshotBefore = await getStableHeatmapSnapshot(prAPI, prId, {
            targetUsersIds,
            revisionId,
          });
          expect(snapshotBefore.length).toBeGreaterThan(2);
        });

        await test.step("Resume", async () => {
          const { response } = await prAPI.resume(prId);
          assertSuccessStatus(response);
        });

        await test.step("Результаты идентичны после resume — данные heatmap не изменились", async () => {
          const targetUsersIds = await getTargetUserIds(prAPI, prId);
          const snapshotAfter = await getStableHeatmapSnapshot(prAPI, prId, {
            targetUsersIds,
            revisionId,
          });

          expect(
            snapshotAfter,
            "Heatmap данные не должны измениться после resume без дозаполнения",
          ).toBe(snapshotBefore);
          console.log("✓ Результаты анонимной оценки идентичны после resume");
        });

        await test.step("anonymityType сохранён", async () => {
          const { data: prData } = await prAPI.getById(prId);
          expect(prData.anonymityType).toBe("anonymous");
        });
      },
    );
  },
);
