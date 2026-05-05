// tests/functional/performance-review/resume/pr-resume-answers-integrity-api.spec.js
// API тест: Неприкосновенность данных после resume — ответы заполнивших не сбрасываются

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

/**
 * Снимок результатов: стабильные данные heatMapResults для каждого target user.
 * Использует getStableHeatmapSnapshot для защиты от cache race condition.
 */
async function getResultsSnapshot(prAPI, prId, revisionId, targetUsersIds) {
  // Дожидаемся стабильного кеша (2 одинаковых ответа подряд)
  const stableJson = await getStableHeatmapSnapshot(prAPI, prId, {
    targetUsersIds,
    revisionId,
  });
  const targetUsersMap = JSON.parse(stableJson);

  // Также получаем directions из последнего ответа
  const { response, data } = await prAPI.getStatisticsSummaryResults(prId, {
    targetUsersIds,
    revisionId,
  });
  assertSuccessStatus(response);

  // Сериализованный снимок каждого пользователя для точного сравнения
  const byUser = {};
  for (const uid of Object.keys(targetUsersMap)) {
    byUser[uid] = JSON.stringify(targetUsersMap[uid]);
  }

  return {
    byUser,
    directionsCount: data?.directions?.length ?? 0,
    heatUsersCount: Object.keys(targetUsersMap).length,
    raw: data,
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
  "PR Resume — Answers Integrity",
  { tag: ["@api", "@regression", "@performance-review", "@resume"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.PERFORMANCE_REVIEW, "Resume Answers Integrity");
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
      "C7397: Результаты заполнивших стабильны после resume без дозаполнения",
      { tag: ["@critical"] },
      async ({ prAPI, prSeed }) => {
        setSeverity("critical");
        test.setTimeout(180000);

        let prId, revisionId;
        let snapshotBefore;

        await test.step("Создать PR, заполнить все анкеты, остановить", async () => {
          const { seedHelper } = prSeed;
          const pr = await seedHelper.seedStoppedPR({
            fillAssessments: true,
            title: TestDataHelper.generateUniqueName("Целостность ответов (полная)"),
          });
          prId = pr.id;
          createdReviewId = prId;
          revisionId = pr.revisionId;
          expect(typeof prId).toBe("number");
          expect(prId).toBeGreaterThan(0);
          expect(typeof revisionId).toBe("number");
          expect(revisionId).toBeGreaterThan(0);
        });

        await test.step("Зафиксировать результаты до resume (snapshot)", async () => {
          const targetUsersIds = await getTargetUserIds(prAPI, prId);
          expect(targetUsersIds.length).toBeGreaterThan(0);

          snapshotBefore = await getResultsSnapshot(
            prAPI,
            prId,
            revisionId,
            targetUsersIds,
          );
          expect(snapshotBefore.heatUsersCount).toBeGreaterThan(0);
          expect(snapshotBefore.directionsCount).toBeGreaterThan(0);

          // У каждого пользователя должны быть данные в heatmap
          for (const [uid, serialized] of Object.entries(
            snapshotBefore.byUser,
          )) {
            expect(
              serialized.length,
              `User ${uid} должен иметь данные до resume`,
            ).toBeGreaterThan(2); // не пустой объект "{}"
          }

          console.log(
            `✓ Snapshot до resume: ${snapshotBefore.heatUsersCount} пользователей`,
          );
        });

        await test.step("Resume", async () => {
          const { response } = await prAPI.resume(prId);
          assertSuccessStatus(response);

          const { data: prData } = await prAPI.getById(prId);
          expect(prData.status).toBe("active");
        });

        await test.step("Результаты после resume идентичны snapshot — ни один score не изменился", async () => {
          const targetUsersIds = await getTargetUserIds(prAPI, prId);

          const snapshotAfter = await getResultsSnapshot(
            prAPI,
            prId,
            revisionId,
            targetUsersIds,
          );

          // Количество пользователей не изменилось
          expect(snapshotAfter.heatUsersCount).toBe(
            snapshotBefore.heatUsersCount,
          );
          expect(snapshotAfter.directionsCount).toBe(
            snapshotBefore.directionsCount,
          );

          // Данные каждого пользователя идентичны (побайтовое сравнение JSON)
          for (const [uid, beforeJson] of Object.entries(
            snapshotBefore.byUser,
          )) {
            const afterJson = snapshotAfter.byUser[uid];
            expect(
              afterJson,
              `User ${uid} должен присутствовать в результатах после resume`,
            ).toBeTruthy();
            expect(
              afterJson,
              `User ${uid}: данные heatmap изменились после resume`,
            ).toBe(beforeJson);
          }

          console.log("✓ Все данные heatmap идентичны после resume");
        });

        await test.step("Повторное завершение — результаты по-прежнему стабильны", async () => {
          const { response: stopResp } = await prAPI.stop(prId);
          assertSuccessStatus(stopResp);

          const targetUsersIds = await getTargetUserIds(prAPI, prId);
          const snapshotFinal = await getResultsSnapshot(
            prAPI,
            prId,
            revisionId,
            targetUsersIds,
          );

          for (const [uid, beforeJson] of Object.entries(
            snapshotBefore.byUser,
          )) {
            const finalJson = snapshotFinal.byUser[uid];
            expect(
              finalJson,
              `User ${uid} должен присутствовать после повторного завершения`,
            ).toBeTruthy();
            expect(
              finalJson,
              `User ${uid}: данные изменились после повторного завершения`,
            ).toBe(beforeJson);
          }

          console.log("✓ Финальные данные идентичны исходным");
        });
      },
    );

    test(
      "C7398: Прогресс заполнения не сбрасывается после resume",
      { tag: ["@critical"] },
      async ({ prAPI, prSeed }) => {
        setSeverity("critical");
        test.setTimeout(180000);

        let prId, revisionId;
        let progressBefore;

        await test.step("Создать PR, частично заполнить, остановить", async () => {
          const { seedHelper } = prSeed;
          const pr = await seedHelper.seedActivePR({
            fillAssessments: true,
            fillSettings: { skipChance: 50 },
            title: TestDataHelper.generateUniqueName("Целостность ответов (частичная)"),
          });
          prId = pr.id;
          createdReviewId = prId;
          revisionId = pr.revisionId;

          const { response: stopResp } = await prAPI.stop(prId);
          assertSuccessStatus(stopResp);
        });

        await test.step("Зафиксировать прогресс до resume", async () => {
          const targetUsersIds = await getTargetUserIds(prAPI, prId);

          const { response, data } = await prAPI.getTargetUsersProgress(prId, {
            revisionId,
            usersIds: targetUsersIds,
          });
          assertSuccessStatus(response);
          progressBefore = data;
          console.log(
            `✓ Прогресс до resume: ${JSON.stringify(progressBefore).substring(0, 200)}...`,
          );
        });

        await test.step("Resume", async () => {
          const { response } = await prAPI.resume(prId);
          assertSuccessStatus(response);
        });

        await test.step("Прогресс заполнения идентичен после resume", async () => {
          const targetUsersIds = await getTargetUserIds(prAPI, prId);

          const { response, data: progressAfter } =
            await prAPI.getTargetUsersProgress(prId, {
              revisionId,
              usersIds: targetUsersIds,
            });
          assertSuccessStatus(response);

          // Глубокое сравнение прогресса
          expect(JSON.stringify(progressAfter)).toBe(
            JSON.stringify(progressBefore),
          );
          console.log("✓ Прогресс заполнения идентичен после resume");
        });
      },
    );
  },
);
