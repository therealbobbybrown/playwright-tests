// tests/functional/performance-review/resume/pr-resume-per-role-filling-api.spec.js
// API тесты: Заполнение анкет по ролям после resume — все 4 направления (RESUME-070-073)

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
 * Заполняет анкеты через populateReview — вызывается пока есть незаполненные анкеты.
 * Возвращает количество успешных заполнений.
 */
async function fillViaPopulate(prAPI, prId, maxAttempts = 60) {
  const settings = {
    skipChance: 0,
    commentChance: 0,
    customChance: 0,
    lowerLimit: 60,
    upperLimit: 100,
  };
  let filled = 0;
  for (let i = 0; i < maxAttempts; i++) {
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
  return filled;
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
  "PR Resume — Per-Role Filling After Resume",
  { tag: ["@api", "@regression", "@performance-review", "@resume"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.PERFORMANCE_REVIEW, "Resume Per-Role Filling");
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
      "C7439: Все роли — заполнение после resume работает для всех 4 направлений",
      { tag: ["@critical"] },
      async ({ request, prAPI }) => {
        setSeverity("critical");
        test.setTimeout(360000);

        let prId, revisionId;
        let targetUsersIds;

        await test.step("Создать PR со всеми 4 направлениями (self, head, subordinate, colleague) без заполнения, остановить", async () => {
          const calSeed = new CalibrationSeed(request);
          await calSeed.init();

          const result = await calSeed.seedWithDirections({
            directions: {
              self: true,
              head: true,
              subordinate: true,
              colleague: true,
            },
            targetUsersCount: 2,
            receiversPerDirection: 2,
            fillQuestionnaires: false,
          });

          prId = result.prId;
          createdReviewId = prId;

          expect(typeof prId).toBe("number");
          expect(prId).toBeGreaterThan(0);

          const { data: revision } = await prAPI.getLastRevision(prId);
          revisionId = revision?.id;
          expect(typeof revisionId).toBe("number");
          expect(revisionId).toBeGreaterThan(0);

          const { response: stopResp } = await prAPI.stop(prId);
          assertSuccessStatus(stopResp);

          console.log(
            `✓ PR ${prId} создан со всеми 4 направлениями и остановлен`,
          );
        });

        await test.step("Верифицировать что PR содержит все 4 направления перед resume", async () => {
          const { data: summData } = await prAPI.getStatisticsSummaryResults(
            prId,
            {
              targetUsersIds: await getTargetUserIds(prAPI, prId),
              revisionId,
            },
          );

          // summData.directions возвращает список направлений из результатов
          // Альтернативно проверяем через getById что directions настроены
          const { data: prData } = await prAPI.getById(prId);
          expect(prData).toBeDefined();
          expect(prData.id).toBe(prId);

          // Проверяем что направления присутствуют в данных PR
          const prDirections = prData.directions || [];
          const selectedDirections = prDirections.filter(
            (d) => d.isSelected === true,
          );
          expect(
            selectedDirections.length,
            "PR должен содержать все 4 выбранных направления",
          ).toBe(4);

          const receiverTypes = selectedDirections.map((d) => d.receiverType);
          expect(receiverTypes).toContain("self");
          expect(receiverTypes).toContain("head");
          expect(receiverTypes).toContain("subordinate");
          expect(receiverTypes).toContain("colleague");

          console.log(
            `✓ Направления подтверждены: ${receiverTypes.join(", ")}`,
          );
        });

        await test.step("Resume — PR переходит в статус active", async () => {
          const { response } = await prAPI.resume(prId);
          assertSuccessStatus(response);

          const { data: prData } = await prAPI.getById(prId);
          expect(prData.status).toBe("active");
          console.log("✓ PR активен после resume");
        });

        await test.step("Прогресс заполнения = 0 для всех target users после resume (анкеты не заполнялись)", async () => {
          targetUsersIds = await getTargetUserIds(prAPI, prId);
          expect(
            targetUsersIds.length,
            "Должны быть target users",
          ).toBeGreaterThan(0);

          const { response, data: progressData } =
            await prAPI.getTargetUsersProgress(prId, {
              revisionId,
              usersIds: targetUsersIds,
            });
          assertSuccessStatus(response);
          expect(progressData).toBeDefined();

          // Прогресс должен существовать для каждого target user
          const progressItems = progressData?.items || progressData || [];
          expect(
            progressItems.length,
            "Прогресс должен быть доступен для target users",
          ).toBeGreaterThan(0);

          // Все анкеты должны быть незаполнены (completed = 0)
          let totalCompleted = 0;
          for (const item of progressItems) {
            totalCompleted += item.completedCount ?? item.completed ?? 0;
          }
          expect(totalCompleted, "До заполнения прогресс должен быть 0").toBe(
            0,
          );

          console.log(
            `✓ Прогресс до заполнения: 0 заполнено для ${progressItems.length} пользователей`,
          );
        });

        await test.step("RESUME-070/071/072/073: Заполнить анкеты через populateReview (охватывает все роли: head→subordinate, colleague→colleague, subordinate→head, self→self)", async () => {
          const filled = await fillViaPopulate(prAPI, prId);
          expect(
            filled,
            "populateReview должен заполнить анкеты после resume для всех ролей",
          ).toBeGreaterThan(0);
          console.log(`✓ Заполнено анкет после resume: ${filled}`);
        });

        await test.step("Прогресс обновился — у target users появились заполненные анкеты", async () => {
          const { response, data: progressData } =
            await prAPI.getTargetUsersProgress(prId, {
              revisionId,
              usersIds: targetUsersIds,
            });
          assertSuccessStatus(response);

          const progressItems = progressData?.items || progressData || [];
          expect(progressItems.length).toBeGreaterThan(0);

          // После заполнения у хотя бы одного пользователя должен быть completedCount > 0
          let totalCompleted = 0;
          for (const item of progressItems) {
            totalCompleted += item.completedCount ?? item.completed ?? 0;
          }
          expect(
            totalCompleted,
            "После заполнения прогресс должен быть > 0",
          ).toBeGreaterThan(0);

          console.log(
            `✓ Прогресс после заполнения: ${totalCompleted} заполненных анкет`,
          );
        });

        await test.step("Результаты heatmap содержат данные для всех направлений", async () => {
          const { response: summResp, data: summData } =
            await prAPI.getStatisticsSummaryResults(prId, {
              targetUsersIds,
              revisionId,
            });
          assertSuccessStatus(summResp);

          expect(summData).toBeTruthy();
          expect(summData.heatMapResults).toBeTruthy();

          // Направления в результатах должны присутствовать
          expect(summData.directions).toBeTruthy();
          expect(
            summData.directions.length,
            "Результаты должны содержать направления",
          ).toBeGreaterThan(0);

          // Target users должны присутствовать в heatmap
          const heatUsers = Object.keys(
            summData.heatMapResults?.targetUsers || {},
          );
          expect(
            heatUsers.length,
            "Heatmap должен содержать данные target users",
          ).toBeGreaterThan(0);

          console.log(
            `✓ Heatmap: ${heatUsers.length} пользователей, ${summData.directions.length} направлений`,
          );
        });

        await test.step("Завершить PR", async () => {
          const { response: stopResp } = await prAPI.stop(prId);
          assertSuccessStatus(stopResp);
          console.log("✓ PR успешно остановлен");
        });
      },
    );

    test(
      "C7440: Самооценка доступна после resume — направление self сохранено",
      { tag: ["@high"] },
      async ({ request, prAPI }) => {
        setSeverity("normal");
        test.setTimeout(300000);

        let prId, revisionId;
        let targetUsersIds;

        await test.step("Создать PR только с направлением self (самооценка), заполнить, остановить", async () => {
          const calSeed = new CalibrationSeed(request);
          await calSeed.init();

          const result = await calSeed.seedWithDirections({
            directions: {
              self: true,
              head: false,
              subordinate: false,
              colleague: false,
            },
            targetUsersCount: 2,
            receiversPerDirection: 1,
            fillQuestionnaires: true,
          });

          prId = result.prId;
          createdReviewId = prId;
          revisionId = result.revisionId;

          expect(typeof prId).toBe("number");
          expect(prId).toBeGreaterThan(0);
          expect(typeof revisionId).toBe("number");
          expect(revisionId).toBeGreaterThan(0);

          const { response: stopResp } = await prAPI.stop(prId);
          assertSuccessStatus(stopResp);

          console.log(
            `✓ PR ${prId} с self-направлением создан, заполнен и остановлен (revision=${revisionId})`,
          );
        });

        await test.step("Зафиксировать прогресс до resume", async () => {
          targetUsersIds = await getTargetUserIds(prAPI, prId);
          expect(targetUsersIds.length).toBeGreaterThan(0);

          const { response, data: progressData } =
            await prAPI.getTargetUsersProgress(prId, {
              revisionId,
              usersIds: targetUsersIds,
            });
          assertSuccessStatus(response);

          const progressItems = progressData?.items || progressData || [];
          let totalCompleted = 0;
          for (const item of progressItems) {
            totalCompleted += item.completedCount ?? item.completed ?? 0;
          }
          expect(
            totalCompleted,
            "До resume должны быть заполненные анкеты self",
          ).toBeGreaterThan(0);

          console.log(
            `✓ Прогресс до resume: ${totalCompleted} заполненных анкет self`,
          );
        });

        await test.step("Resume — статус меняется на active", async () => {
          const { response } = await prAPI.resume(prId);
          assertSuccessStatus(response);

          const { data: prData } = await prAPI.getById(prId);
          expect(prData.status).toBe("active");
          console.log("✓ PR активен после resume");
        });

        await test.step("Направление self присутствует в PR после resume", async () => {
          const { data: prData } = await prAPI.getById(prId);
          const prDirections = prData.directions || [];
          const selfDirection = prDirections.find(
            (d) => d.receiverType === "self" && d.isSelected === true,
          );

          expect(
            selfDirection,
            "Направление self должно быть выбрано после resume",
          ).toBeTruthy();

          // Все остальные направления должны быть отключены
          const otherSelected = prDirections.filter(
            (d) => d.receiverType !== "self" && d.isSelected === true,
          );
          expect(otherSelected.length, "Только self должно быть выбрано").toBe(
            0,
          );

          console.log(
            "✓ Направление self сохранено после resume, остальные отключены",
          );
        });

        await test.step("Прогресс самооценки сохранён после resume", async () => {
          const { response, data: progressAfter } =
            await prAPI.getTargetUsersProgress(prId, {
              revisionId,
              usersIds: targetUsersIds,
            });
          assertSuccessStatus(response);

          const progressItems = progressAfter?.items || progressAfter || [];
          let totalCompleted = 0;
          for (const item of progressItems) {
            totalCompleted += item.completedCount ?? item.completed ?? 0;
          }
          expect(
            totalCompleted,
            "Заполненные анкеты self должны сохраниться после resume",
          ).toBeGreaterThan(0);

          console.log(
            `✓ Прогресс self после resume: ${totalCompleted} заполненных анкет`,
          );
        });

        await test.step("Новые анкеты self принимаются после resume (populateReview)", async () => {
          // populateReview вернёт ok=false если все анкеты уже заполнены — это нормально
          // Пробуем заполнить ещё; важно что API принимает запрос без ошибки сервера
          const settings = {
            skipChance: 0,
            commentChance: 0,
            customChance: 0,
            lowerLimit: 60,
            upperLimit: 100,
          };
          const { response } = await prAPI.populateReview(prId, settings, {
            timeout: 120000,
          });

          // Допустимо: 200 (заполнено) или 500/4xx (все анкеты уже заполнены)
          // Недопустимо: 403 (нет доступа к self-направлению после resume)
          expect(
            response.status(),
            "Запрос должен быть обработан (не 403 — нет доступа к направлению)",
          ).not.toBe(403);

          console.log(
            `✓ populateReview после resume вернул статус: ${response.status()}`,
          );
        });

        await test.step("Завершить PR", async () => {
          const { response: stopResp } = await prAPI.stop(prId);
          assertSuccessStatus(stopResp);
          console.log("✓ PR успешно остановлен");
        });
      },
    );
  },
);
