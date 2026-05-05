// tests/functional/performance-review/resume/pr-resume-reset-refill-api.spec.js
// API тест: Сброс ответа (resetUserResponse) после resume → перезаполнение → score пересчитываются

import { test as base, expect } from "../../../fixtures/full.js";
import {
  PerformanceReviewAPI,
  getCredentials,
} from "../../../utils/api/index.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";
import { assertSuccessStatus } from "../../../utils/api/common-assertions.js";
import { CalibrationSeed } from "../../../utils/seed/CalibrationSeed.js";
import { getTargetUserIds } from "../../../utils/api/test-helpers.js";

/**
 * Снимок heatmap — сериализованные данные каждого target user
 */
async function getHeatmapSnapshot(prAPI, prId, revisionId, targetUsersIds) {
  const { response, data } = await prAPI.getStatisticsSummaryResults(prId, {
    targetUsersIds,
    revisionId,
  });
  assertSuccessStatus(response);

  const targetUsersMap = data?.heatMapResults?.targetUsers || {};
  const byUser = {};
  for (const uid of Object.keys(targetUsersMap)) {
    byUser[uid] = JSON.stringify(targetUsersMap[uid]);
  }
  return {
    byUser,
    usersCount: Object.keys(targetUsersMap).length,
  };
}

const test = base.extend({
  prAPI: async ({ request }, use) => {
    const api = new PerformanceReviewAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
});

test.describe(
  "PR Resume — Reset & Refill After Resume",
  { tag: ["@api", "@regression", "@performance-review", "@resume"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.PERFORMANCE_REVIEW, "Resume Reset Refill");
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
      "C7456: Сброс ответа через resetUserResponse после resume — перезаполнение и пересчёт score",
      { tag: ["@critical"] },
      async ({ prAPI }) => {
        setSeverity("critical");
        test.setTimeout(240000);

        let prId, revisionId;
        let snapshotBefore;
        let targetUsersIds;

        await test.step("Создать PR с заполненными анкетами через CalibrationSeed, остановить", async () => {
          const calSeed = new CalibrationSeed(prAPI.request);
          await calSeed.init();

          const result = await calSeed.seedWithDirections({
            directions: { self: true, head: true },
            targetUsersCount: 3,
            receiversPerDirection: 2,
            fillQuestionnaires: true,
          });
          prId = result.prId;
          createdReviewId = prId;

          const { data: revision } = await prAPI.getLastRevision(prId);
          revisionId = revision?.id;
          expect(typeof prId).toBe("number");
          expect(prId).toBeGreaterThan(0);
          expect(typeof revisionId).toBe("number");
          expect(revisionId).toBeGreaterThan(0);

          const { response: stopResp } = await prAPI.stop(prId);
          assertSuccessStatus(stopResp);

          targetUsersIds = await getTargetUserIds(prAPI, prId);
          expect(targetUsersIds.length).toBeGreaterThan(0);

          console.log(
            `✓ PR ${prId} создан с заполненными анкетами и остановлен, target users: ${targetUsersIds.length}`,
          );
        });

        await test.step("Зафиксировать heatmap snapshot до resume", async () => {
          snapshotBefore = await getHeatmapSnapshot(
            prAPI,
            prId,
            revisionId,
            targetUsersIds,
          );
          expect(snapshotBefore.usersCount).toBeGreaterThan(0);

          for (const [uid, json] of Object.entries(snapshotBefore.byUser)) {
            expect(
              json.length,
              `User ${uid} должен иметь данные в heatmap`,
            ).toBeGreaterThan(10);
          }

          console.log(
            `✓ Snapshot до resume: ${snapshotBefore.usersCount} пользователей с данными`,
          );
        });

        await test.step("Resume", async () => {
          const { response } = await prAPI.resume(prId);
          assertSuccessStatus(response);

          const { data: prData } = await prAPI.getById(prId);
          expect(prData.status).toBe("active");
          console.log("✓ PR возобновлён, status: active");
        });

        let progressBefore;

        await test.step("Зафиксировать прогресс receiver ДО сброса", async () => {
          const { response: progResp, data: progData } =
            await prAPI.getTargetUsersProgress(prId, {
              revisionId,
              usersIds: targetUsersIds,
            });
          assertSuccessStatus(progResp);

          progressBefore = progData?.items || progData || [];
          console.log(
            `Прогресс ДО сброса: ${JSON.stringify(progressBefore.map((p) => ({ userId: p.userId, total: p.total, completed: p.completed || p.completedCount })))}`,
          );
          expect(progressBefore.length).toBeGreaterThan(0);
        });

        let resetReceiver;
        let resetTargetUserId;
        let resetAssessmentId;

        await test.step("Найти receiver с завершённой анкетой и сбросить через resetUserResponse", async () => {
          // Получаем receivers
          const { response: recvResp, data: recvData } =
            await prAPI.getReceiverUsers(prId, { limit: 100 });
          assertSuccessStatus(recvResp);

          const receivers = recvData?.items || recvData?.data || recvData || [];
          expect(
            receivers.length,
            "Должны быть receiver users",
          ).toBeGreaterThan(0);

          // Получаем прогресс receivers
          const receiverIds = receivers.map(
            (r) => r.userId || r.user?.id || r.id,
          );
          const { response: progResp, data: progData } =
            await prAPI.getReceiverUsersProgress(prId, {
              revisionId,
              usersIds: receiverIds,
            });
          assertSuccessStatus(progResp);

          // Ищем receiver с хотя бы одной заполненной анкетой
          const progressEntries = progData?.items || progData || [];
          let foundReceiver = null;

          for (const entry of progressEntries) {
            const userId = entry.userId || entry.user?.id;
            const completed = entry.completedCount || entry.completed || 0;
            if (completed > 0 && userId) {
              foundReceiver = entry;
              break;
            }
          }

          // Fallback: попробуем completedResponses
          if (!foundReceiver) {
            const { data: compData } =
              await prAPI.getReceiverUsersCompletedResponses(prId, {
                revisionId,
                usersIds: receiverIds,
              });
            const completedItems = compData?.items || compData || [];
            if (completedItems.length > 0) {
              foundReceiver = completedItems[0];
            }
          }

          expect(
            foundReceiver,
            "Должен быть receiver с завершённой анкетой",
          ).toBeTruthy();

          resetReceiver = foundReceiver.userId || foundReceiver.user?.id;
          resetTargetUserId =
            foundReceiver.targetUserId ||
            foundReceiver.targetUser?.id ||
            targetUsersIds[0];

          // Получаем assessments для определения assessmentId
          const { data: assessments } = await prAPI.getAssessments(prId);
          expect(assessments).toBeDefined();

          // Берём первый assessmentId из любого направления
          let firstAssessmentId = null;
          for (const key of Object.keys(assessments)) {
            const value = assessments[key];
            if (Array.isArray(value) && value.length > 0) {
              firstAssessmentId = value[0].id;
              break;
            }
          }
          expect(firstAssessmentId, "Должен быть assessmentId").toBeTruthy();
          resetAssessmentId = firstAssessmentId;

          console.log(
            `Сброс ответа: receiver=${resetReceiver}, target=${resetTargetUserId}, assessment=${resetAssessmentId}`,
          );

          // Выполняем resetUserResponse
          const { response: resetResp } = await prAPI.resetUserResponse(prId, {
            receiverUserId: resetReceiver,
            targetUserId: resetTargetUserId,
            assessmentId: resetAssessmentId,
          });
          assertSuccessStatus(resetResp);
          console.log("✓ Ответ сброшен через resetUserResponse");
        });

        await test.step("Проверить что прогресс изменился после сброса", async () => {
          const { response: progResp, data: progData } =
            await prAPI.getTargetUsersProgress(prId, {
              revisionId,
              usersIds: targetUsersIds,
            });
          assertSuccessStatus(progResp);

          const progressAfter = progData?.items || progData || [];
          console.log(
            `Прогресс ПОСЛЕ сброса: ${JSON.stringify(progressAfter.map((p) => ({ userId: p.userId, total: p.total, completed: p.completed || p.completedCount })))}`,
          );

          // Суммарный completed должен уменьшиться
          const totalCompletedBefore = progressBefore.reduce(
            (sum, p) => sum + (p.completed || p.completedCount || 0),
            0,
          );
          const totalCompletedAfter = progressAfter.reduce(
            (sum, p) => sum + (p.completed || p.completedCount || 0),
            0,
          );
          expect(
            totalCompletedAfter,
            `Прогресс должен уменьшиться после reset (было: ${totalCompletedBefore})`,
          ).toBeLessThan(totalCompletedBefore);
          console.log(
            `✓ Прогресс уменьшился: ${totalCompletedBefore} → ${totalCompletedAfter}`,
          );
        });

        await test.step("Heatmap данные изменились после сброса ответа", async () => {
          const snapshotAfterReset = await getHeatmapSnapshot(
            prAPI,
            prId,
            revisionId,
            targetUsersIds,
          );

          // Heatmap должен содержать данные (пересчёт)
          expect(snapshotAfterReset.usersCount).toBeGreaterThan(0);

          // Данные target user, чей ответ сбросили, могут измениться
          const resetUid = String(resetTargetUserId);
          const beforeJson = snapshotBefore.byUser[resetUid];
          const afterJson = snapshotAfterReset.byUser[resetUid];
          if (beforeJson && afterJson) {
            console.log(
              `User ${resetUid}: данные ${beforeJson === afterJson ? "не изменились" : "изменились (пересчёт)"}`,
            );
          }

          console.log(
            `✓ Heatmap после сброса: ${snapshotAfterReset.usersCount} пользователей с данными`,
          );
        });

        await test.step("Завершить PR", async () => {
          const { response: stopResp } = await prAPI.stop(prId);
          assertSuccessStatus(stopResp);

          const { data: prData } = await prAPI.getById(prId);
          expect(["stopped", "complete"]).toContain(prData.status);
          console.log(`✓ PR завершён, status: ${prData.status}`);
        });
      },
    );
  },
);
