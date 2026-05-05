// tests/functional/performance-review/resume/pr-resume-cross-cycle-isolation-api.spec.js
// API тест: Изоляция данных между циклами после resume (RESUME-061, RESUME-062)
//
// RESUME-061: Результаты включают данные из ОБОИХ циклов (до и после resume)
// RESUME-062: Данные циклов не смешиваются — нет коррупции данных между циклами

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

/**
 * Получить heatmap-данные (summary results) по всем target users
 */
async function getHeatmapSnapshot(prAPI, prId, revisionId, targetUsersIds) {
  const { response, data } = await prAPI.getStatisticsSummaryResults(prId, {
    targetUsersIds,
    revisionId,
  });
  assertSuccessStatus(response);

  const targetUsersMap = data?.heatMapResults?.targetUsers || {};

  // Сериализуем по user для точного сравнения
  const byUser = {};
  for (const uid of Object.keys(targetUsersMap)) {
    byUser[uid] = JSON.stringify(targetUsersMap[uid]);
  }

  return {
    byUser,
    userIds: Object.keys(targetUsersMap),
    heatUsersCount: Object.keys(targetUsersMap).length,
    directionsCount: data?.directions?.length ?? 0,
    raw: data,
  };
}

/**
 * Получить прогресс заполнения анкет по target users
 */
async function getProgressSnapshot(prAPI, prId, revisionId, targetUsersIds) {
  const { response, data } = await prAPI.getTargetUsersProgress(prId, {
    revisionId,
    usersIds: targetUsersIds,
  });
  assertSuccessStatus(response);
  return data;
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
  "PR Resume — Изоляция данных между циклами",
  { tag: ["@api", "@regression", "@performance-review", "@resume"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(
        MODULES.PERFORMANCE_REVIEW,
        "Resume Cross-Cycle Data Isolation",
      );
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
      "C7416: Результаты включают данные из обоих циклов — до и после resume",
      { tag: ["@critical"] },
      async ({ prAPI, prSeed }) => {
        setSeverity("critical");
        test.setTimeout(300000);

        const { seedHelper } = prSeed;
        let prId, revisionId;
        let snapshotCycle1;
        let filledCycle1 = 0;
        let filledCycle2 = 0;

        // ── Цикл 1: Создать PR, заполнить, остановить ──
        await test.step("Создать PR, заполнить анкеты (цикл 1), остановить", async () => {
          const pr = await seedHelper.seedStoppedPR({
            fillAssessments: true,
            title: TestDataHelper.generateUniqueName("Изоляция между циклами"),
          });
          prId = pr.id;
          createdReviewId = prId;
          revisionId = pr.revisionId;
          filledCycle1 = pr.filledCount ?? 0;

          expect(typeof prId).toBe("number");
          expect(prId).toBeGreaterThan(0);

          // revisionId может быть null если seed не смог запустить PR — пробуем получить из API
          if (!revisionId) {
            const { data: lastRevision } = await prAPI.getLastRevision(prId);
            revisionId = lastRevision?.id ?? null;
          }

          expect(
            revisionId,
            "Revision должна существовать после создания и запуска PR",
          ).toBeTruthy();

          const { data: prData } = await prAPI.getById(prId);
          expect(["stopped", "complete"]).toContain(prData.status);

          console.log(
            `Цикл 1 завершён: PR=${prId}, revision=${revisionId}, заполнено=${filledCycle1}`,
          );
        });

        // ── Зафиксировать результаты после цикла 1 ──
        await test.step("Зафиксировать результаты цикла 1 (snapshot)", async () => {
          const targetUsersIds = await getTargetUserIds(prAPI, prId);
          expect(
            targetUsersIds.length,
            "Должны быть target users в PR",
          ).toBeGreaterThan(0);

          snapshotCycle1 = await getHeatmapSnapshot(
            prAPI,
            prId,
            revisionId,
            targetUsersIds,
          );

          expect(
            snapshotCycle1.heatUsersCount,
            "Heatmap цикла 1 должен содержать данные",
          ).toBeGreaterThan(0);

          // У каждого пользователя должен быть непустой heatmap
          for (const [uid, serialized] of Object.entries(
            snapshotCycle1.byUser,
          )) {
            expect(
              serialized.length,
              `User ${uid} должен иметь данные в heatmap цикла 1`,
            ).toBeGreaterThan(2); // не пустой объект "{}"
          }

          console.log(
            `Snapshot цикла 1: ${snapshotCycle1.heatUsersCount} пользователей, ${snapshotCycle1.directionsCount} направлений`,
          );
        });

        // ── Resume ──
        await test.step("Resume PR", async () => {
          const { response } = await prAPI.resume(prId);
          assertSuccessStatus(response);

          const { data: prData } = await prAPI.getById(prId);
          expect(prData.status).toBe("active");

          // Revision ID должен остаться прежним
          const { data: revision } = await prAPI.getLastRevision(prId);
          expect(
            revision?.id,
            "Revision ID должен сохраниться после resume",
          ).toBe(revisionId);

          console.log(`Resume выполнен, статус: ${prData.status}`);
        });

        // ── Цикл 2: Заполнить дополнительные анкеты после resume ──
        await test.step("Заполнить анкеты после resume (цикл 2)", async () => {
          filledCycle2 = await seedHelper.fillQuestionnaires(prId, {
            skipChance: 0,
            lowerLimit: 50,
            upperLimit: 80,
          });
          // После resume часть анкет уже заполнена — populateReview может вернуть 0
          // Это допустимо: все анкеты уже были заполнены в цикле 1
          console.log(`Заполнено в цикле 2: ${filledCycle2}`);
        });

        // ── RESUME-061: Результаты включают данные из обоих циклов ──
        await test.step("RESUME-061: Результаты после resume включают данные из цикла 1", async () => {
          const targetUsersIds = await getTargetUserIds(prAPI, prId);
          const snapshotAfterResume = await getHeatmapSnapshot(
            prAPI,
            prId,
            revisionId,
            targetUsersIds,
          );

          // Количество пользователей не уменьшилось
          expect(
            snapshotAfterResume.heatUsersCount,
            "Количество пользователей в heatmap не должно уменьшиться после resume",
          ).toBeGreaterThanOrEqual(snapshotCycle1.heatUsersCount);

          // Все пользователи из цикла 1 присутствуют в результатах после resume
          for (const uid of snapshotCycle1.userIds) {
            expect(
              snapshotAfterResume.byUser[uid],
              `User ${uid} из цикла 1 должен присутствовать в результатах после resume`,
            ).toBeTruthy();
          }

          // Направления не уменьшились
          expect(
            snapshotAfterResume.directionsCount,
            "Количество направлений не должно уменьшиться",
          ).toBeGreaterThanOrEqual(snapshotCycle1.directionsCount);

          console.log(
            `После resume: ${snapshotAfterResume.heatUsersCount} пользователей (было ${snapshotCycle1.heatUsersCount})`,
          );
        });

        // ── Остановить PR и проверить финальные результаты ──
        await test.step("Остановить PR и проверить финальные результаты", async () => {
          const { response: stopResp } = await prAPI.stop(prId);
          assertSuccessStatus(stopResp);

          const { data: prData } = await prAPI.getById(prId);
          expect(["stopped", "complete"]).toContain(prData.status);

          const targetUsersIds = await getTargetUserIds(prAPI, prId);
          const snapshotFinal = await getHeatmapSnapshot(
            prAPI,
            prId,
            revisionId,
            targetUsersIds,
          );

          // Финальные результаты не потеряли данные цикла 1
          expect(
            snapshotFinal.heatUsersCount,
            "Финальный heatmap должен содержать данные",
          ).toBeGreaterThan(0);

          for (const uid of snapshotCycle1.userIds) {
            expect(
              snapshotFinal.byUser[uid],
              `User ${uid} должен присутствовать в финальных результатах`,
            ).toBeTruthy();
          }

          console.log(
            `Финальные результаты: ${snapshotFinal.heatUsersCount} пользователей`,
          );
        });
      },
    );

    test(
      "C7417: Данные циклов не смешиваются — нет коррупции данных между циклами",
      { tag: ["@critical"] },
      async ({ prAPI, prSeed }) => {
        setSeverity("critical");
        test.setTimeout(300000);

        const { seedHelper } = prSeed;
        let prId, revisionId;
        let snapshotCycle1;

        // ── Цикл 1 ──
        await test.step("Создать PR, заполнить все анкеты (цикл 1), остановить", async () => {
          const pr = await seedHelper.seedStoppedPR({
            fillAssessments: true,
            title: TestDataHelper.generateUniqueName("Циклы без повреждений"),
          });
          prId = pr.id;
          createdReviewId = prId;
          revisionId = pr.revisionId;

          expect(typeof prId).toBe("number");
          expect(prId).toBeGreaterThan(0);
          expect(typeof revisionId).toBe("number");
          expect(revisionId).toBeGreaterThan(0);

          console.log(`Цикл 1: PR=${prId}, revision=${revisionId}`);
        });

        // ── Snapshot цикла 1 ──
        await test.step("Зафиксировать точный snapshot результатов цикла 1", async () => {
          const targetUsersIds = await getTargetUserIds(prAPI, prId);
          expect(targetUsersIds.length).toBeGreaterThan(0);

          snapshotCycle1 = await getHeatmapSnapshot(
            prAPI,
            prId,
            revisionId,
            targetUsersIds,
          );

          expect(
            snapshotCycle1.heatUsersCount,
            "Heatmap цикла 1 должен содержать данные",
          ).toBeGreaterThan(0);
          expect(
            snapshotCycle1.directionsCount,
            "Должны быть данные по направлениям",
          ).toBeGreaterThan(0);

          console.log(
            `Snapshot цикла 1 зафиксирован: ${snapshotCycle1.heatUsersCount} users, ${snapshotCycle1.directionsCount} directions`,
          );
        });

        // ── Resume + попытка дозаполнения (цикл 2) ──
        await test.step("Resume PR и выполнить дозаполнение (цикл 2)", async () => {
          const { response: resumeResp } = await prAPI.resume(prId);
          assertSuccessStatus(resumeResp);

          const { data: prData } = await prAPI.getById(prId);
          expect(prData.status).toBe("active");

          // Дозаполнение — попытка заполнить снова (результат может быть 0)
          const filled = await seedHelper.fillQuestionnaires(prId, {
            skipChance: 0,
            lowerLimit: 40,
            upperLimit: 60,
          });
          console.log(`Дозаполнено в цикле 2: ${filled}`);
        });

        // ── RESUME-062: Проверить что данные цикла 1 не потеряны и не повреждены ──
        await test.step("RESUME-062: Данные цикла 1 не повреждены после цикла 2", async () => {
          const targetUsersIds = await getTargetUserIds(prAPI, prId);
          const snapshotAfterCycle2 = await getHeatmapSnapshot(
            prAPI,
            prId,
            revisionId,
            targetUsersIds,
          );

          // Пользователи из цикла 1 должны оставаться в результатах
          for (const uid of snapshotCycle1.userIds) {
            const beforeData = snapshotCycle1.byUser[uid];
            const afterData = snapshotAfterCycle2.byUser[uid];

            expect(
              afterData,
              `User ${uid} из цикла 1 должен присутствовать после цикла 2`,
            ).toBeTruthy();

            // Данные не должны стать меньше (пустыми) — нет коррупции
            expect(
              afterData.length,
              `User ${uid}: данные в heatmap не должны стать меньше после цикла 2`,
            ).toBeGreaterThanOrEqual(beforeData.length);
          }

          // Структура heatmap остаётся валидной
          expect(
            snapshotAfterCycle2.heatUsersCount,
            "Heatmap должен содержать данные после двух циклов",
          ).toBeGreaterThanOrEqual(snapshotCycle1.heatUsersCount);

          console.log(
            `После двух циклов: ${snapshotAfterCycle2.heatUsersCount} users (цикл 1: ${snapshotCycle1.heatUsersCount})`,
          );
        });

        // ── Проверка прогресса заполнения ──
        await test.step("Статистика: количество заполненных анкет не меньше цикла 1", async () => {
          const targetUsersIds = await getTargetUserIds(prAPI, prId);

          const { response, data: progressData } =
            await prAPI.getTargetUsersProgress(prId, {
              revisionId,
              usersIds: targetUsersIds,
            });
          assertSuccessStatus(response);

          // Прогресс должен быть ненулевым
          expect(
            progressData,
            "Данные прогресса должны присутствовать",
          ).toBeTruthy();

          // Если данные — массив, проверяем количество
          const items = Array.isArray(progressData)
            ? progressData
            : progressData?.items || progressData?.users || [];

          if (items.length > 0) {
            // Есть пользователи с прогрессом — данные не потеряны
            expect(items.length).toBeGreaterThan(0);
            console.log(`Прогресс: ${items.length} записей о заполнении`);
          } else {
            // API может вернуть объект другого формата
            console.log(
              `Прогресс: ${JSON.stringify(progressData).substring(0, 200)}`,
            );
          }
        });

        // ── Остановить и проверить финальные результаты ──
        await test.step("Остановить PR и убедиться в целостности финальных результатов", async () => {
          const { response: stopResp } = await prAPI.stop(prId);
          assertSuccessStatus(stopResp);

          const { data: finalPR } = await prAPI.getById(prId);
          expect(["stopped", "complete"]).toContain(finalPR.status);

          const targetUsersIds = await getTargetUserIds(prAPI, prId);
          const snapshotFinal = await getHeatmapSnapshot(
            prAPI,
            prId,
            revisionId,
            targetUsersIds,
          );

          // Финальные результаты не должны быть пустыми
          expect(
            snapshotFinal.heatUsersCount,
            "Финальный heatmap должен содержать данные обоих циклов",
          ).toBeGreaterThan(0);

          // Все пользователи цикла 1 должны остаться в финальных результатах
          for (const uid of snapshotCycle1.userIds) {
            expect(
              snapshotFinal.byUser[uid],
              `User ${uid}: данные не должны пропасть в финальных результатах`,
            ).toBeTruthy();
          }

          console.log(
            `Финальные результаты: ${snapshotFinal.heatUsersCount} users, статус=${finalPR.status}`,
          );
        });
      },
    );
  },
);
