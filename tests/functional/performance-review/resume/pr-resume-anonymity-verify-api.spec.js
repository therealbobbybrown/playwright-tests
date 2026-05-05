// tests/functional/performance-review/resume/pr-resume-anonymity-verify-api.spec.js
// API тест: Верификация сохранения анонимности после resume (RESUME-052)

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

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const test = base.extend({
  prAPI: async ({ request }, use) => {
    const api = new PerformanceReviewAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
});

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

test.describe(
  "PR Resume — Anonymity Verification",
  { tag: ["@api", "@regression", "@performance-review", "@resume"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.PERFORMANCE_REVIEW, "Resume Anonymity Verify");
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

    // ========================================================================
    // RESUME-052: anonymityType 'anonymous' сохраняется после resume
    // ========================================================================

    test(
      "C7393: AnonymityType 'anonymous' сохраняется после resume",
      { tag: ["@critical"] },
      async ({ prAPI, prSeed }) => {
        setSeverity("critical");
        test.setTimeout(180000);

        const { seedHelper } = prSeed;
        let prId;

        await test.step("Создать anonymous PR, заполнить все анкеты и остановить", async () => {
          const pr = await seedHelper.seedStoppedPR({
            fillAssessments: true,
            title: TestDataHelper.generateUniqueName("Проверка анонимности"),
          });
          prId = pr.id;
          createdReviewId = prId;
          expect(typeof prId).toBe("number");
          expect(prId).toBeGreaterThan(0);

          // Проверить anonymityType до resume
          const { data: prData } = await prAPI.getById(prId);
          expect(prData.anonymityType).toBe("anonymous");
          expect(["stopped", "complete"]).toContain(prData.status);
          console.log(
            `✓ PR ${prId} создан, anonymityType: ${prData.anonymityType}, status: ${prData.status}`,
          );
        });

        await test.step("Resume — перевести PR в active", async () => {
          const { response } = await prAPI.resume(prId);
          assertSuccessStatus(response);

          const { data: prData } = await prAPI.getById(prId);
          expect(prData.status).toBe("active");
          console.log("✓ Resume: статус active");
        });

        await test.step("Проверить anonymityType сохранён после resume", async () => {
          const { data: prData } = await prAPI.getById(prId);
          expect(prData.anonymityType).toBe("anonymous");
          console.log(`✓ anonymityType после resume: ${prData.anonymityType}`);
        });

        await test.step("Дозаполнить (попытка) — 0 анкет допустимо", async () => {
          const filled = await seedHelper.fillQuestionnaires(prId);
          // Если все анкеты уже заполнены до stop, filled может быть 0 — это OK
          console.log(`✓ Дозаполнено после resume: ${filled} анкет`);
        });

        await test.step("Проверить anonymityType после дозаполнения", async () => {
          const { data: prData } = await prAPI.getById(prId);
          expect(prData.anonymityType).toBe("anonymous");
          console.log(
            `✓ anonymityType после дозаполнения: ${prData.anonymityType}`,
          );
        });

        await test.step("Повторно завершить — остановить PR", async () => {
          const { response } = await prAPI.stop(prId);
          assertSuccessStatus(response);

          const { data: prData } = await prAPI.getById(prId);
          expect(["stopped", "complete"]).toContain(prData.status);
          console.log(`✓ Повторно остановлен, статус: ${prData.status}`);
        });

        await test.step("Финальная проверка anonymityType после повторного завершения", async () => {
          const { data: prData } = await prAPI.getById(prId);
          expect(prData.anonymityType).toBe("anonymous");
          console.log(
            `✓ Финальный anonymityType: ${prData.anonymityType} (сохранён)`,
          );
        });
      },
    );

    // ========================================================================
    // RESUME-052b: anonymityType 'forAdminHead' сохраняется после resume
    // ========================================================================

    test(
      "C7394: AnonymityType 'forAdminHead' сохраняется после resume",
      { tag: ["@normal"] },
      async ({ prAPI, prSeed }) => {
        setSeverity("normal");
        test.setTimeout(180000);

        const { seedHelper } = prSeed;
        let prId;

        await test.step("Создать PR с anonymityType forAdminHead, заполнить, остановить", async () => {
          // seedDraftPR передаёт все опции в prAPI.create(), включая anonymityType
          const pr = await seedHelper.seedDraftPR({
            title: TestDataHelper.generateUniqueName("Для админа и рук-ля"),
            anonymityType: "forAdminHead",
          });
          prId = pr.id;
          createdReviewId = prId;

          await seedHelper.addTargetUsers(prId);
          await seedHelper.attachAssessments(prId);

          const { response: startResp } = await prAPI.start(prId);
          assertSuccessStatus(startResp);

          await seedHelper.fillQuestionnaires(prId);

          const { response: stopResp } = await prAPI.stop(prId);
          assertSuccessStatus(stopResp);

          console.log(
            `✓ PR ${prId} создан с anonymityType forAdminHead и остановлен`,
          );
        });

        await test.step("Проверить anonymityType до resume", async () => {
          const { data: prData } = await prAPI.getById(prId);
          expect(prData.anonymityType).toBe("forAdminHead");
          console.log(`✓ anonymityType до resume: ${prData.anonymityType}`);
        });

        await test.step("Resume — перевести PR в active", async () => {
          const { response } = await prAPI.resume(prId);
          assertSuccessStatus(response);

          const { data: prData } = await prAPI.getById(prId);
          expect(prData.status).toBe("active");
          console.log("✓ Resume: статус active");
        });

        await test.step("Проверить anonymityType сохранён после resume", async () => {
          const { data: prData } = await prAPI.getById(prId);
          expect(prData.anonymityType).toBe("forAdminHead");
          console.log(`✓ anonymityType после resume: ${prData.anonymityType}`);
        });

        await test.step("Завершить PR", async () => {
          const { response } = await prAPI.stop(prId);
          assertSuccessStatus(response);

          const { data: prData } = await prAPI.getById(prId);
          expect(["stopped", "complete"]).toContain(prData.status);
          console.log(`✓ PR остановлен, статус: ${prData.status}`);
        });
      },
    );
  },
);
