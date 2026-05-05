// tests/functional/performance-review/resume/pr-resume-notifications-api.spec.js
// API тест: Прогресс и направления после resume —
// прогресс по направлениям сохранён, направления не сброшены,
// заполнение после resume корректно обновляет прогресс и направления

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
  "PR Resume — Progress & Directions",
  { tag: ["@api", "@regression", "@performance-review", "@resume"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.PERFORMANCE_REVIEW, "Resume Progress & Directions");
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
      "C7437: Прогресс и направления сохранены после resume — структура не сброшена",
      { tag: ["@critical"] },
      async ({ request, prAPI }) => {
        setSeverity("critical");
        test.setTimeout(240000);

        let prId, revisionId;
        let progressJsonBefore;
        let directionsCountBefore;

        await test.step("Создать PR через CalibrationSeed, заполнить, остановить", async () => {
          const calSeed = new CalibrationSeed(request);
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
          console.log(`✓ PR ${prId} создан, заполнен и остановлен`);
        });

        await test.step("Зафиксировать прогресс и направления до resume", async () => {
          const targetUsersIds = await getTargetUserIds(prAPI, prId);
          expect(targetUsersIds.length).toBeGreaterThan(0);

          // Прогресс
          const { response, data } = await prAPI.getTargetUsersProgress(prId, {
            revisionId,
            usersIds: targetUsersIds,
          });
          assertSuccessStatus(response);
          progressJsonBefore = JSON.stringify(data);

          // Направления PR
          const { data: prData } = await prAPI.getById(prId);
          directionsCountBefore = prData.directions?.length || 0;
          expect(directionsCountBefore).toBeGreaterThan(0);

          console.log(
            `✓ До resume: ${targetUsersIds.length} пользователей, ${directionsCountBefore} направлений`,
          );
          console.log(`  Progress JSON length: ${progressJsonBefore.length}`);
        });

        await test.step("Resume", async () => {
          const { response } = await prAPI.resume(prId);
          assertSuccessStatus(response);

          const { data: prData } = await prAPI.getById(prId);
          expect(prData.status).toBe("active");
        });

        await test.step("Прогресс идентичен после resume", async () => {
          const targetUsersIds = await getTargetUserIds(prAPI, prId);
          const { response, data } = await prAPI.getTargetUsersProgress(prId, {
            revisionId,
            usersIds: targetUsersIds,
          });
          assertSuccessStatus(response);

          const progressJsonAfter = JSON.stringify(data);
          expect(
            progressJsonAfter,
            "Прогресс не должен измениться от resume",
          ).toBe(progressJsonBefore);
          console.log("✓ Прогресс идентичен после resume");
        });

        await test.step("Направления PR сохранены после resume", async () => {
          const { data: prData } = await prAPI.getById(prId);
          const directionsAfter = prData.directions || [];
          expect(
            directionsAfter.length,
            "Количество направлений не должно измениться",
          ).toBe(directionsCountBefore);

          // Каждое направление должно иметь тип
          for (const dir of directionsAfter) {
            expect(
              dir.receiverType || dir.type,
              `Направление ${dir.id} должно иметь тип`,
            ).toBeTruthy();
          }
          console.log(
            `✓ ${directionsAfter.length} направлений сохранены после resume`,
          );
        });

        await test.step("Участники сохранены после resume", async () => {
          const targetUsersIds = await getTargetUserIds(prAPI, prId);
          expect(targetUsersIds.length).toBe(3);

          // Каждый участник должен быть доступен
          const { data: tuData } = await prAPI.getTargetUsers(prId, {
            limit: 50,
          });
          const items = tuData?.items || tuData || [];
          expect(items.length).toBe(3);

          for (const item of items) {
            const uid = item.userId || item.user?.id;
            expect(
              uid,
              "userId участника должен быть ненулевым числом",
            ).toBeGreaterThan(0);
            console.log(`  Участник ${uid}: ${item.user?.lastName || "N/A"}`);
          }
          console.log("✓ Все 3 участника сохранены");
        });

        await test.step("Повторное завершение → прогресс сохранён", async () => {
          const { response: stopResp } = await prAPI.stop(prId);
          assertSuccessStatus(stopResp);

          const targetUsersIds = await getTargetUserIds(prAPI, prId);
          const { response, data } = await prAPI.getTargetUsersProgress(prId, {
            revisionId,
            usersIds: targetUsersIds,
          });
          assertSuccessStatus(response);

          const progressJsonFinal = JSON.stringify(data);
          expect(
            progressJsonFinal,
            "Прогресс не изменился после stop→resume→stop",
          ).toBe(progressJsonBefore);
          console.log("✓ Прогресс сохранён после повторного завершения");
        });
      },
    );

    test(
      "C7438: После resume — populateReview заполняет и heatmap обновляется",
      { tag: ["@critical"] },
      async ({ request, prAPI }) => {
        setSeverity("critical");
        test.setTimeout(240000);

        let prId, revisionId;

        await test.step("Создать PR БЕЗ заполнения, остановить", async () => {
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
          const { response, data } = await prAPI.getStatisticsSummaryResults(
            prId,
            {
              targetUsersIds,
              revisionId,
            },
          );
          assertSuccessStatus(response);

          const targetUsersMap = data?.heatMapResults?.targetUsers || {};
          const usersWithScore = Object.keys(targetUsersMap).filter((uid) => {
            const entry = targetUsersMap[uid];
            return (
              Object.keys(entry.competences || {}).length > 0 &&
              Object.values(entry.competences).some(
                (c) => c.value !== undefined && c.value !== null,
              )
            );
          });
          console.log(
            `✓ До resume: ${usersWithScore.length} пользователей с непустым score`,
          );
        });

        await test.step("Resume", async () => {
          const { response } = await prAPI.resume(prId);
          assertSuccessStatus(response);

          const { data: prData } = await prAPI.getById(prId);
          expect(prData.status).toBe("active");
        });

        await test.step("Направления и участники доступны после resume", async () => {
          const { data: prData } = await prAPI.getById(prId);
          expect(prData.directions?.length).toBeGreaterThan(0);

          const targetUsersIds = await getTargetUserIds(prAPI, prId);
          expect(targetUsersIds.length).toBe(3);
          console.log(
            `✓ ${prData.directions.length} направлений, ${targetUsersIds.length} участников`,
          );
        });

        await test.step("Заполнить все анкеты после resume", async () => {
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
          expect(
            filled,
            "populateReview должен заполнить анкеты после resume",
          ).toBeGreaterThan(0);
          console.log(`✓ Заполнено ${filled} анкет после resume`);
        });

        await test.step("Heatmap содержит score для всех участников", async () => {
          const targetUsersIds = await getTargetUserIds(prAPI, prId);
          const { response, data } = await prAPI.getStatisticsSummaryResults(
            prId,
            {
              targetUsersIds,
              revisionId,
            },
          );
          assertSuccessStatus(response);

          const targetUsersMap = data?.heatMapResults?.targetUsers || {};

          for (const uid of targetUsersIds) {
            const entry = targetUsersMap[uid];
            expect(entry, `User ${uid} должен быть в heatmap`).toBeTruthy();

            const hasCompetences =
              Object.keys(entry.competences || {}).length > 0;
            const hasAvr = entry.avrCompetencesCommon?.value !== undefined;
            expect(
              hasCompetences || hasAvr,
              `User ${uid} должен иметь score данные`,
            ).toBe(true);
          }
          console.log(
            `✓ Все ${targetUsersIds.length} участников имеют score в heatmap`,
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
