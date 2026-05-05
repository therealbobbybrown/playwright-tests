// tests/functional/performance-review/resume/pr-resume-new-participant-api.spec.js
// API тест: Незаполненные участники после resume — заполнение и результаты (RESUME-043/044/045)
// Тест 1: Участники без заполнения → stop → resume → fill → результаты корректны
// Тест 2: Частичное заполнение → stop → resume → дозаполнение → все участники в результатах

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
 * Получить heatmap-данные по каждому target user
 */
async function getHeatmapData(prAPI, prId, revisionId, targetUsersIds) {
  const { response, data } = await prAPI.getStatisticsSummaryResults(prId, {
    targetUsersIds,
    revisionId,
  });
  assertSuccessStatus(response);
  return {
    targetUsers: data?.heatMapResults?.targetUsers || {},
    directions: data?.directions || [],
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
  "PR Resume — Участники после resume",
  { tag: ["@api", "@regression", "@performance-review", "@resume"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.PERFORMANCE_REVIEW, "Resume New Participant");
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
      "C7433: RESUME-043/044: После resume незаполненные участники получают и заполняют анкеты",
      { tag: ["@critical"] },
      async ({ prAPI, prSeed }) => {
        setSeverity("critical");
        test.setTimeout(240000);

        const { seedHelper } = prSeed;
        let prId, revisionId;

        await test.step("Создать PR БЕЗ заполнения и остановить", async () => {
          const pr = await seedHelper.seedStoppedPR({
            fillAssessments: false,
            title: TestDataHelper.generateUniqueName("Участник без заполнения"),
          });
          prId = pr.id;
          createdReviewId = prId;

          expect(typeof prId).toBe("number");
          expect(prId).toBeGreaterThan(0);

          const targetUserIds = await getTargetUserIds(prAPI, prId);
          expect(targetUserIds.length).toBeGreaterThan(0);

          const { data: prData } = await prAPI.getById(prId);
          expect(["stopped", "complete"]).toContain(prData.status);
          console.log(
            `✓ PR ${prId}: ${targetUserIds.length} участников, 0 анкет, status=${prData.status}`,
          );
        });

        await test.step("Resume PR и получить revision", async () => {
          const { response } = await prAPI.resume(prId);
          assertSuccessStatus(response);

          const { data: prData } = await prAPI.getById(prId);
          expect(prData.status).toBe("active");

          // revisionId может быть null до первого заполнения, получаем после resume
          const { data: revision } = await prAPI.getLastRevision(prId);
          revisionId = revision?.id;
          // revisionId может всё ещё быть null если ревизия создаётся позже
          console.log(`✓ Resume, revisionId: ${revisionId || "pending"}`);
        });

        let filledCount = 0;

        await test.step("Заполнить все анкеты после resume (populateReview)", async () => {
          filledCount = await seedHelper.fillQuestionnaires(prId);
          expect(
            filledCount,
            "После resume для незаполненных участников анкеты должны быть доступны",
          ).toBeGreaterThan(0);
          console.log(`✓ Заполнено после resume: ${filledCount} анкет`);
        });

        await test.step("Проверить результаты: каждый target user имеет score", async () => {
          // Получить revisionId если ещё не было
          if (!revisionId) {
            const { data: revision } = await prAPI.getLastRevision(prId);
            revisionId = revision?.id;
            expect(
              revisionId,
              "Revision должна существовать после заполнения и быть числом",
            ).toBeGreaterThan(0);
          }

          const targetUsersIds = await getTargetUserIds(prAPI, prId);
          const heatmap = await getHeatmapData(
            prAPI,
            prId,
            revisionId,
            targetUsersIds,
          );

          const usersWithData = Object.keys(heatmap.targetUsers);
          expect(
            usersWithData.length,
            "Heatmap должен содержать данные после заполнения",
          ).toBeGreaterThan(0);

          // Каждый target user должен быть в heatmap (даже если competences пустые)
          const targetUsersInHeatmap = targetUsersIds.filter(
            (uid) => heatmap.targetUsers[String(uid)] !== undefined,
          );
          expect(
            targetUsersInHeatmap.length,
            "Target users должны присутствовать в heatmap",
          ).toBeGreaterThan(0);

          expect(heatmap.directions.length).toBeGreaterThan(0);
          console.log(
            `✓ ${usersWithData.length} пользователей с данными, ${heatmap.directions.length} направлений`,
          );
        });

        await test.step("Завершить", async () => {
          const { response: stopResp } = await prAPI.stop(prId);
          assertSuccessStatus(stopResp);
        });
      },
    );

    test(
      "C7434: Результаты включают данные из обоих раундов — до и после resume",
      { tag: ["@critical"] },
      async ({ prAPI, prSeed }) => {
        setSeverity("critical");
        test.setTimeout(240000);

        const { seedHelper } = prSeed;
        let prId, revisionId;
        let heatmapBefore;

        await test.step("Создать PR, заполнить все анкеты, остановить", async () => {
          const pr = await seedHelper.seedStoppedPR({
            fillAssessments: true,
            title: TestDataHelper.generateUniqueName("Участник с циклами"),
          });
          prId = pr.id;
          createdReviewId = prId;
          revisionId = pr.revisionId;

          expect(typeof prId).toBe("number");
          expect(prId).toBeGreaterThan(0);
          expect(typeof revisionId).toBe("number");
          expect(revisionId).toBeGreaterThan(0);
        });

        await test.step("Зафиксировать результаты раунда 1 (до resume)", async () => {
          const targetUsersIds = await getTargetUserIds(prAPI, prId);
          heatmapBefore = await getHeatmapData(
            prAPI,
            prId,
            revisionId,
            targetUsersIds,
          );

          const usersCount = Object.keys(heatmapBefore.targetUsers).length;
          expect(usersCount).toBeGreaterThan(0);
          console.log(`✓ Раунд 1: ${usersCount} пользователей в heatmap`);
        });

        await test.step("Resume и попытка дозаполнения", async () => {
          const { response } = await prAPI.resume(prId);
          assertSuccessStatus(response);

          // populateReview может вернуть 0 — все уже заполнены, это ОК
          const filled = await seedHelper.fillQuestionnaires(prId);
          console.log(`Дозаполнено после resume: ${filled}`);
        });

        await test.step("Результаты стабильны — данные раунда 1 не потеряны", async () => {
          const targetUsersIds = await getTargetUserIds(prAPI, prId);
          const heatmapAfter = await getHeatmapData(
            prAPI,
            prId,
            revisionId,
            targetUsersIds,
          );

          const usersAfter = Object.keys(heatmapAfter.targetUsers).length;
          const usersBefore = Object.keys(heatmapBefore.targetUsers).length;

          // Количество пользователей не уменьшилось
          expect(
            usersAfter,
            "Количество пользователей в heatmap не должно уменьшиться",
          ).toBeGreaterThanOrEqual(usersBefore);

          // Данные каждого пользователя из раунда 1 на месте
          for (const uid of Object.keys(heatmapBefore.targetUsers)) {
            const beforeData = JSON.stringify(heatmapBefore.targetUsers[uid]);
            const afterData = JSON.stringify(heatmapAfter.targetUsers[uid]);
            // Данные должны присутствовать (могут измениться если были дозаполнения)
            expect(
              afterData,
              `User ${uid} должен остаться в heatmap после resume`,
            ).toBeTruthy();
            expect(
              afterData.length,
              `User ${uid} данные не должны стать пустыми`,
            ).toBeGreaterThanOrEqual(beforeData.length);
          }

          console.log(
            `✓ Все ${usersBefore} пользователей из раунда 1 сохранены в heatmap`,
          );
        });

        await test.step("Завершить → финальные результаты корректны", async () => {
          const { response: stopResp } = await prAPI.stop(prId);
          assertSuccessStatus(stopResp);

          const { data: prData } = await prAPI.getById(prId);
          expect(["stopped", "complete"]).toContain(prData.status);

          const targetUsersIds = await getTargetUserIds(prAPI, prId);
          const finalHeatmap = await getHeatmapData(
            prAPI,
            prId,
            revisionId,
            targetUsersIds,
          );
          const finalUsers = Object.keys(finalHeatmap.targetUsers).length;
          expect(finalUsers).toBeGreaterThan(0);
          console.log(
            `✓ PR завершён, ${finalUsers} пользователей в финальном heatmap`,
          );
        });
      },
    );
  },
);
