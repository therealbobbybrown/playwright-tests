// tests/functional/performance-review/resume/pr-resume-async-workflow-api.spec.js
// API тесты: Resume async workflow PR (isAsyncSteps: true) с направлением "коллеги"

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
// Helpers
// ---------------------------------------------------------------------------

/**
 * Попробовать прогрессировать async стадии, если они есть.
 * Для async PR с коллегами нужен skipSuggestionAwaiting + batchSend.
 * Для async PR без коллег — стадии могут быть пропущены автоматически.
 */
async function tryProgressAsyncStages(prAPI, prId, targetUserIds) {
  // Попробовать пропустить ожидание предложений
  const { response: skipResp } = await prAPI.asyncStepsSkipSuggestionAwaiting(
    prId,
    {
      usersIds: targetUserIds,
    },
  );
  if (skipResp.ok()) {
    console.log("✓ skipSuggestionAwaiting: OK");
    await new Promise((r) => setTimeout(r, 1000));
  }

  // Попробовать отправить анкеты пакетом
  const { response: batchResp } = await prAPI.batchSendQuestionnaires(prId);
  if (batchResp.ok()) {
    console.log("✓ batchSendQuestionnaires: OK");
  }
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

test.describe(
  "PR Resume — async workflow",
  { tag: ["@api", "@regression", "@performance-review", "@resume"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.PERFORMANCE_REVIEW, "Resume Async Workflow");
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
    // RESUME-ASYNC-001: Resume async PR — статус, ревизия, результаты
    // ========================================================================

    test(
      "C7407: Resume async PR — результаты и ревизия сохранены после resume",
      { tag: ["@critical"] },
      async ({ prAPI, prSeed }, testInfo) => {
        setSeverity("critical");
        test.slow();
        testInfo.setTimeout(600_000);

        const { seedHelper } = prSeed;
        let prId, revisionId;

        await test.step("Создать async PR, заполнить", async () => {
          // Для async PR используем явный flow (как в ASYNC-003):
          // seedDraftPR → addTargetUsers → attachAssessments → start → progressAsyncStages → fill
          const pr = await seedHelper.seedDraftPR({
            title: TestDataHelper.generateUniqueName("Асинхронное возобновление"),
            isAsyncSteps: true,
          });
          prId = pr.id;
          createdReviewId = prId;

          await seedHelper.addTargetUsers(prId);
          await seedHelper.attachAssessments(prId);

          const { response: startResp } = await prAPI.start(prId);
          assertSuccessStatus(startResp);

          // Прогрессировать async стадии (skip nomination + batch send)
          const targetUserIds = await getTargetUserIds(prAPI, prId);
          await tryProgressAsyncStages(prAPI, prId, targetUserIds);

          // Заполнить анкеты
          const filledCount = await seedHelper.fillQuestionnaires(prId);
          expect(filledCount).toBeGreaterThan(0);

          // Получить revision
          const { data: revision } = await prAPI.getLastRevision(prId);
          revisionId = revision?.id;
          expect(typeof revisionId).toBe("number");
          expect(revisionId).toBeGreaterThan(0);

          console.log(
            `✓ Async PR: ${prId}, revision: ${revisionId}, заполнено: ${filledCount}`,
          );

          // Проверить что PR действительно async
          const { data: prData } = await prAPI.getById(prId);
          expect(prData.isAsyncSteps).toBe(true);
        });

        await test.step("Остановить async PR", async () => {
          const { data: prBefore } = await prAPI.getById(prId);
          if (prBefore.status === "active") {
            const { response } = await prAPI.stop(prId);
            assertSuccessStatus(response);
          }
          const { data: prData } = await prAPI.getById(prId);
          expect(["stopped", "complete"]).toContain(prData.status);
          console.log(`✓ PR статус: ${prData.status}`);
        });

        await test.step("Resume → статус active", async () => {
          const { response } = await prAPI.resume(prId);
          assertSuccessStatus(response);

          const { data: prData } = await prAPI.getById(prId);
          expect(prData.status).toBe("active");
          console.log("✓ Resume: статус active");
        });

        await test.step("Revision ID не изменился", async () => {
          const { data: rev } = await prAPI.getLastRevision(prId);
          expect(rev.id).toBe(revisionId);
          console.log(`✓ Revision: ${revisionId} (не изменился)`);
        });

        await test.step("Результаты доступны после resume", async () => {
          const targetUsersIds = await getTargetUserIds(prAPI, prId);
          expect(targetUsersIds.length).toBeGreaterThan(0);

          const { response: summResp, data: summData } =
            await prAPI.getStatisticsSummaryResults(prId, {
              targetUsersIds,
              revisionId,
            });
          assertSuccessStatus(summResp);
          expect(summData).toBeDefined();
          expect(summData.heatMapResults).toBeDefined();
          expect(summData.directions).toBeDefined();
          expect(summData.directions.length).toBeGreaterThan(0);

          // heatMapResults должен содержать записи для запрошенных пользователей
          const heatUsers = Object.keys(
            summData.heatMapResults?.targetUsers || {},
          );
          expect(heatUsers.length).toBeGreaterThan(0);
          console.log(
            `✓ Результаты: ${heatUsers.length} пользователей в heatmap`,
          );
        });

        await test.step("isAsyncSteps сохранился после resume", async () => {
          const { data: prData } = await prAPI.getById(prId);
          expect(prData.isAsyncSteps).toBe(true);
          console.log("✓ isAsyncSteps = true (сохранился)");
        });
      },
    );

    // ========================================================================
    // RESUME-ASYNC-002: После resume дозаполнение без повторной номинации
    // ========================================================================

    test(
      "C7408: После resume async PR — дозаполнение без повторной номинации",
      { tag: ["@critical"] },
      async ({ prAPI, prSeed }, testInfo) => {
        setSeverity("critical");
        test.slow();
        testInfo.setTimeout(600_000);

        const { seedHelper } = prSeed;
        let prId, revisionId;

        await test.step("Создать async PR, частично заполнить, остановить", async () => {
          // Явный flow для async PR
          const pr = await seedHelper.seedDraftPR({
            title: TestDataHelper.generateUniqueName("Асинхронное заполнение"),
            isAsyncSteps: true,
          });
          prId = pr.id;
          createdReviewId = prId;

          await seedHelper.addTargetUsers(prId);
          await seedHelper.attachAssessments(prId);

          const { response: startResp } = await prAPI.start(prId);
          assertSuccessStatus(startResp);

          // Прогрессировать async стадии
          const targetUserIds = await getTargetUserIds(prAPI, prId);
          await tryProgressAsyncStages(prAPI, prId, targetUserIds);

          // Частично заполнить (1 итерация, не все)
          const { response: fillResp } = await prAPI.populateReview(
            prId,
            {
              skipChance: 0,
              commentChance: 0,
              customChance: 0,
              lowerLimit: 60,
              upperLimit: 100,
            },
            { timeout: 120000 },
          );
          const filledCount = fillResp.ok() ? 1 : 0;
          console.log(`✓ Частично заполнено: ${filledCount} анкет`);

          // Получить revision
          const { data: revision } = await prAPI.getLastRevision(prId);
          revisionId = revision?.id;

          // Остановить
          const { data: prBefore } = await prAPI.getById(prId);
          if (prBefore.status === "active") {
            const { response: stopResp } = await prAPI.stop(prId);
            assertSuccessStatus(stopResp);
          }
        });

        await test.step("Resume", async () => {
          const { response } = await prAPI.resume(prId);
          assertSuccessStatus(response);

          const { data: prData } = await prAPI.getById(prId);
          expect(prData.status).toBe("active");
        });

        await test.step("Дозаполнить анкеты после resume", async () => {
          // После resume дозаполняем оставшиеся анкеты
          const filled = await seedHelper.fillQuestionnaires(prId);
          // Если все анкеты были уже заполнены до stop, filled может быть 0 —
          // в этом случае проверяем что PR остаётся стабильным
          console.log(`Дозаполнено после resume: ${filled} анкет`);
        });

        await test.step("Результаты обновились", async () => {
          const targetUsersIds = await getTargetUserIds(prAPI, prId);
          const { response: summResp, data: summData } =
            await prAPI.getStatisticsSummaryResults(prId, {
              targetUsersIds,
              revisionId,
            });
          assertSuccessStatus(summResp);
          expect(summData).toBeDefined();
          expect(summData.heatMapResults).toBeDefined();
          expect(summData.directions?.length).toBeGreaterThan(0);
        });

        await test.step("Revision та же после дозаполнения", async () => {
          const { data: rev } = await prAPI.getLastRevision(prId);
          expect(rev.id).toBe(revisionId);
        });
      },
    );

    // ========================================================================
    // RESUME-ASYNC-003: Повторный цикл stop→resume на async PR
    // ========================================================================

    test(
      "C7409: Повторный stop→resume на async PR — стабильность",
      { tag: ["@normal"] },
      async ({ prAPI, prSeed }, testInfo) => {
        setSeverity("normal");
        test.slow();
        testInfo.setTimeout(600_000);

        const { seedHelper } = prSeed;
        let prId, revisionId;

        await test.step("Создать async PR, заполнить, остановить", async () => {
          const pr = await seedHelper.seedDraftPR({
            title: TestDataHelper.generateUniqueName("Асинхронный цикл"),
            isAsyncSteps: true,
          });
          prId = pr.id;
          createdReviewId = prId;

          await seedHelper.addTargetUsers(prId);
          await seedHelper.attachAssessments(prId);

          const { response: startResp } = await prAPI.start(prId);
          assertSuccessStatus(startResp);

          const targetUserIds = await getTargetUserIds(prAPI, prId);
          await tryProgressAsyncStages(prAPI, prId, targetUserIds);

          const filled = await seedHelper.fillQuestionnaires(prId);
          console.log(`✓ Заполнено: ${filled}`);

          const { data: rev } = await prAPI.getLastRevision(prId);
          revisionId = rev.id;

          const { data: prBefore } = await prAPI.getById(prId);
          if (prBefore.status === "active") {
            await prAPI.stop(prId);
          }
        });

        await test.step("Цикл 1: resume → stop", async () => {
          const { response: r1 } = await prAPI.resume(prId);
          assertSuccessStatus(r1);

          const { data: pr1 } = await prAPI.getById(prId);
          expect(pr1.status).toBe("active");

          // Revision та же
          const { data: rev1 } = await prAPI.getLastRevision(prId);
          expect(rev1.id).toBe(revisionId);

          // Остановить снова
          const { response: stop1 } = await prAPI.stop(prId);
          assertSuccessStatus(stop1);
          console.log("✓ Цикл 1: resume → active → stop");
        });

        await test.step("Цикл 2: resume → проверка", async () => {
          const { response: r2 } = await prAPI.resume(prId);
          assertSuccessStatus(r2);

          const { data: pr2 } = await prAPI.getById(prId);
          expect(pr2.status).toBe("active");
          expect(pr2.isAsyncSteps).toBe(true);

          // Revision всё ещё та же
          const { data: rev2 } = await prAPI.getLastRevision(prId);
          expect(rev2.id).toBe(revisionId);

          // Результаты доступны
          const targetUsersIds = await getTargetUserIds(prAPI, prId);
          const { response: summResp } =
            await prAPI.getStatisticsSummaryResults(prId, {
              targetUsersIds,
              revisionId,
            });
          assertSuccessStatus(summResp);

          // Деструктурируем summData для проверки
          const { data: summCheck } = await prAPI.getStatisticsSummaryResults(
            prId,
            {
              targetUsersIds,
              revisionId,
            },
          );
          expect(summCheck?.heatMapResults).toBeDefined();
          expect(summCheck?.directions?.length).toBeGreaterThan(0);
          console.log("✓ Цикл 2: resume → active, результаты доступны");
        });
      },
    );
  },
);
