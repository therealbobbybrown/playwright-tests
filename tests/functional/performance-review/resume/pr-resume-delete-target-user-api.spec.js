// tests/functional/performance-review/resume/pr-resume-delete-target-user-api.spec.js
// API тест: Resume после удаления участника из остановленного PR
//
// Сценарий: создать PR с 3 участниками → заполнить → остановить →
// удалить одного участника → resume → данные оставшихся 2 участников сохранены

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

const test = base.extend({
  prAPI: async ({ request }, use) => {
    const api = new PerformanceReviewAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
});

test.describe(
  "PR Resume — Удаление участника",
  { tag: ["@api", "@regression", "@performance-review", "@resume"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.PERFORMANCE_REVIEW, "Resume Delete Target User");
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
      "C7419: Resume после удаления участника — данные оставшихся сохранены",
      { tag: ["@critical"] },
      async ({ request, prAPI }) => {
        setSeverity("critical");
        test.setTimeout(240000);

        let prId, revisionId;
        let allUserIds;
        let deletedUserId;
        let remainingUserIds;
        let heatmapBeforeDelete;

        await test.step("Создать PR с 3 участниками, заполнить, остановить", async () => {
          const calSeed = new CalibrationSeed(request);
          await calSeed.init();

          const result = await calSeed.seedWithDirections({
            directions: { self: true, head: true },
            targetUsersCount: 3,
            receiversPerDirection: 2,
            fillQuestionnaires: true,
          });
          prId = result.prId;
          revisionId = result.revisionId;
          createdReviewId = prId;

          expect(typeof prId).toBe("number");
          expect(prId).toBeGreaterThan(0);
          expect(typeof revisionId).toBe("number");
          expect(revisionId).toBeGreaterThan(0);

          allUserIds = await getTargetUserIds(prAPI, prId);
          expect(allUserIds.length).toBe(3);

          const { response: stopResp } = await prAPI.stop(prId);
          assertSuccessStatus(stopResp);
          console.log(
            `✓ PR ${prId} создан с 3 участниками, заполнен, остановлен`,
          );
        });

        await test.step("Зафиксировать heatmap до удаления участника", async () => {
          const { response, data } = await prAPI.getStatisticsSummaryResults(
            prId,
            {
              targetUsersIds: allUserIds,
              revisionId,
            },
          );
          assertSuccessStatus(response);

          heatmapBeforeDelete = data?.heatMapResults?.targetUsers || {};
          const usersInHeatmap = Object.keys(heatmapBeforeDelete);
          expect(usersInHeatmap.length).toBeGreaterThan(0);
          console.log(
            `✓ Heatmap до удаления: ${usersInHeatmap.length} пользователей`,
          );
        });

        await test.step("Удалить одного участника из остановленного PR", async () => {
          deletedUserId = allUserIds[allUserIds.length - 1];
          remainingUserIds = allUserIds.filter((id) => id !== deletedUserId);
          expect(remainingUserIds.length).toBe(2);

          const { response: deleteResp } = await prAPI.deleteTargetUser(
            prId,
            deletedUserId,
          );
          assertSuccessStatus(deleteResp);

          // Проверить что участников стало 2
          const currentUserIds = await getTargetUserIds(prAPI, prId);
          expect(currentUserIds.length).toBe(2);
          expect(currentUserIds).not.toContain(deletedUserId);
          console.log(
            `✓ Участник ${deletedUserId} удалён, осталось ${currentUserIds.length}`,
          );
        });

        await test.step("Resume", async () => {
          const { response } = await prAPI.resume(prId);
          assertSuccessStatus(response);

          const { data: prData } = await prAPI.getById(prId);
          expect(prData.status).toBe("active");
          console.log("✓ PR возобновлён, статус active");
        });

        await test.step("После resume: участников 2, удалённый отсутствует", async () => {
          const currentUserIds = await getTargetUserIds(prAPI, prId);
          expect(currentUserIds.length).toBe(2);
          expect(currentUserIds).not.toContain(deletedUserId);

          for (const uid of remainingUserIds) {
            expect(
              currentUserIds,
              `Участник ${uid} должен остаться в PR`,
            ).toContain(uid);
          }
          console.log("✓ 2 участника на месте, удалённый отсутствует");
        });

        await test.step("Heatmap оставшихся участников сохранён после resume", async () => {
          const { response, data } = await prAPI.getStatisticsSummaryResults(
            prId,
            {
              targetUsersIds: remainingUserIds,
              revisionId,
            },
          );
          assertSuccessStatus(response);

          const heatmapAfter = data?.heatMapResults?.targetUsers || {};

          for (const uid of remainingUserIds) {
            const uidStr = String(uid);
            const before = heatmapBeforeDelete[uidStr];
            const after = heatmapAfter[uidStr];

            expect(
              after,
              `Участник ${uid} должен быть в heatmap после resume`,
            ).toBeTruthy();

            // Компетенции сохранены
            const beforeCompCount = Object.keys(
              before?.competences || {},
            ).length;
            const afterCompCount = Object.keys(after?.competences || {}).length;
            expect(afterCompCount).toBe(beforeCompCount);
          }
          console.log(
            `✓ Heatmap оставшихся ${remainingUserIds.length} участников сохранён`,
          );
        });

        await test.step("Завершить", async () => {
          const { response: stopResp } = await prAPI.stop(prId);
          assertSuccessStatus(stopResp);
        });
      },
    );
  },
);
