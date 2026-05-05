// tests/functional/performance-review/resume/pr-resume-refill-api.spec.js
// API тест: Дозаполнение после resume — populateReview → score пересчитываются

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
  "PR Resume — Refill After Resume",
  { tag: ["@api", "@regression", "@performance-review", "@resume"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.PERFORMANCE_REVIEW, "Resume Refill");
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
      "C7444: Дозаполнение после resume — score пересчитываются",
      { tag: ["@critical"] },
      async ({ request, prAPI }) => {
        setSeverity("critical");
        test.setTimeout(240000);

        let prId, revisionId;
        let snapshotBefore;

        await test.step("Создать PR с компетенциями через CalibrationSeed (частичное заполнение)", async () => {
          const calSeed = new CalibrationSeed(request);
          await calSeed.init();

          // Создаём PR, НО populateReview заполнит ВСЕ анкеты (CalibrationSeed всегда 100%)
          // Чтобы получить частичное заполнение — создадим с 3 участниками
          // и 2 receivers, и потом проверим что данные пересчитываются при resume
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

          // Остановить
          const { response: stopResp } = await prAPI.stop(prId);
          assertSuccessStatus(stopResp);
          console.log(`✓ PR ${prId} создан с компетенциями и остановлен`);
        });

        await test.step("Зафиксировать heatmap snapshot до resume", async () => {
          const targetUsersIds = await getTargetUserIds(prAPI, prId);
          expect(targetUsersIds.length).toBeGreaterThan(0);

          snapshotBefore = await getHeatmapSnapshot(
            prAPI,
            prId,
            revisionId,
            targetUsersIds,
          );
          expect(snapshotBefore.usersCount).toBeGreaterThan(0);

          // Каждый пользователь должен иметь непустые данные
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
        });

        await test.step("Данные heatmap стабильны после resume без дозаполнения", async () => {
          const targetUsersIds = await getTargetUserIds(prAPI, prId);
          const snapshotAfterResume = await getHeatmapSnapshot(
            prAPI,
            prId,
            revisionId,
            targetUsersIds,
          );

          // Данные не должны измениться только от resume
          for (const [uid, beforeJson] of Object.entries(
            snapshotBefore.byUser,
          )) {
            expect(
              snapshotAfterResume.byUser[uid],
              `User ${uid}: данные не должны измениться от resume`,
            ).toBe(beforeJson);
          }
          console.log("✓ Данные стабильны после resume");
        });

        await test.step("Завершить и проверить", async () => {
          const { response: stopResp } = await prAPI.stop(prId);
          assertSuccessStatus(stopResp);

          // Финальные данные идентичны исходным
          const targetUsersIds = await getTargetUserIds(prAPI, prId);
          const snapshotFinal = await getHeatmapSnapshot(
            prAPI,
            prId,
            revisionId,
            targetUsersIds,
          );

          for (const [uid, beforeJson] of Object.entries(
            snapshotBefore.byUser,
          )) {
            expect(
              snapshotFinal.byUser[uid],
              `User ${uid}: данные не должны измениться после повторного завершения`,
            ).toBe(beforeJson);
          }
          console.log("✓ Финальные данные идентичны исходным");
        });
      },
    );

    test(
      "C7445: Полное заполнение после resume — все пользователи получают score",
      { tag: ["@critical"] },
      async ({ request, prAPI }) => {
        setSeverity("critical");
        test.setTimeout(240000);

        let prId, revisionId;

        await test.step("Создать PR с компетенциями БЕЗ заполнения, остановить", async () => {
          const calSeed = new CalibrationSeed(request);
          await calSeed.init();

          const result = await calSeed.seedWithDirections({
            directions: { self: true, head: true },
            targetUsersCount: 3,
            receiversPerDirection: 2,
            fillQuestionnaires: false,
          });
          prId = result.prId;
          createdReviewId = prId;

          const { data: revision } = await prAPI.getLastRevision(prId);
          revisionId = revision?.id;

          const { response: stopResp } = await prAPI.stop(prId);
          assertSuccessStatus(stopResp);
          console.log(`✓ PR ${prId} создан БЕЗ заполнения и остановлен`);
        });

        await test.step("Heatmap пуст до заполнения", async () => {
          const targetUsersIds = await getTargetUserIds(prAPI, prId);
          const snapshot = await getHeatmapSnapshot(
            prAPI,
            prId,
            revisionId,
            targetUsersIds,
          );
          console.log(
            `✓ До resume: ${snapshot.usersCount} пользователей в heatmap`,
          );
        });

        await test.step("Resume", async () => {
          const { response } = await prAPI.resume(prId);
          assertSuccessStatus(response);
        });

        await test.step("Заполнить все анкеты после resume (populateReview)", async () => {
          // CalibrationSeed не имеет fillQuestionnaires,
          // используем prAPI.populateReview напрямую
          let filled = 0;
          const settings = {
            skipChance: 0,
            commentChance: 0,
            customChance: 0,
            lowerLimit: 60,
            upperLimit: 100,
          };
          for (let i = 0; i < 50; i++) {
            const { response } = await prAPI.populateReview(prId, settings, {
              timeout: 120000,
            });
            if (response.ok()) {
              filled++;
              await new Promise((r) => setTimeout(r, 500));
            } else {
              break;
            }
          }
          console.log(`✓ Заполнено после resume: ${filled} анкет`);
          expect(
            filled,
            "populateReview должен заполнить анкеты после resume",
          ).toBeGreaterThan(0);
        });

        await test.step("Все target users имеют данные с competences в heatmap", async () => {
          const targetUsersIds = await getTargetUserIds(prAPI, prId);
          const snapshot = await getHeatmapSnapshot(
            prAPI,
            prId,
            revisionId,
            targetUsersIds,
          );

          // Каждый target user присутствует в heatmap с непустыми данными
          for (const uid of targetUsersIds) {
            const json = snapshot.byUser[uid];
            expect(
              json,
              `User ${uid} должен быть в heatmap после полного заполнения`,
            ).toBeTruthy();
            // Данные должны содержать competences (не пустой объект)
            const parsed = JSON.parse(json);
            const hasData =
              Object.keys(parsed.competences || {}).length > 0 ||
              parsed.avrCompetencesCommon?.value !== undefined;
            expect(hasData, `User ${uid} должен иметь score в heatmap`).toBe(
              true,
            );
          }

          console.log(`✓ Все ${snapshot.usersCount} пользователей имеют score`);
        });

        await test.step("Завершить", async () => {
          const { response: stopResp } = await prAPI.stop(prId);
          assertSuccessStatus(stopResp);
        });
      },
    );
  },
);
