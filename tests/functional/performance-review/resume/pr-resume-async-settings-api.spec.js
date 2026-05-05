// tests/functional/performance-review/resume/pr-resume-async-settings-api.spec.js
// API тест: Resume сохраняет async-настройки PR
//
// Три тогла async workflow (скриншот UI "Спросить сотрудников"):
// 1. isApprovalStep — "Отправлять список коллег на проверку руководителям"
// 2. isAsyncSteps — "Разрешить ранний доступ к анкетам" (async workflow)
// 3. isAsyncStepsSelfResponseStep — "Показывать самооценку коллегам"
//
// Тест: создать async PR со всеми 3 тоглами → stop → resume → все настройки сохранены

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
 * Попробовать прогрессировать async стадии
 */
async function tryProgressAsyncStages(prAPI, prId, targetUserIds) {
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

  const { response: batchResp } = await prAPI.batchSendQuestionnaires(prId);
  if (batchResp.ok()) {
    console.log("✓ batchSendQuestionnaires: OK");
  }
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
  "PR Resume — Async Settings Preserved",
  { tag: ["@api", "@regression", "@performance-review", "@resume"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.PERFORMANCE_REVIEW, "Resume Async Settings");
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
      "C7405: Все async-настройки (3 тогла) сохранены после resume",
      { tag: ["@critical"] },
      async ({ prAPI, prSeed }) => {
        setSeverity("critical");
        test.setTimeout(240000);

        const { seedHelper } = prSeed;
        let prId;

        await test.step("Создать async PR со всеми 3 тоглами включёнными", async () => {
          const pr = await seedHelper.seedDraftPR({
            title: TestDataHelper.generateUniqueName("Асинхронные настройки"),
            isAsyncSteps: true,
            isApprovalStep: true,
            isAsyncStepsSelfResponseStep: true,
            directions: [
              {
                id: null,
                receiverType: "self",
                isSelected: true,
                title: null,
                description: null,
              },
              {
                id: null,
                receiverType: "head",
                isSelected: true,
                title: null,
                description: null,
              },
              {
                id: null,
                receiverType: "subordinate",
                isSelected: false,
                title: null,
                description: null,
              },
              {
                id: null,
                receiverType: "colleague",
                isSelected: true,
                title: null,
                description: null,
              },
            ],
          });
          prId = pr.id;
          createdReviewId = prId;

          // Проверить что все 3 настройки установлены
          const { data: prData } = await prAPI.getById(prId);
          expect(prData.isAsyncSteps).toBe(true);
          expect(prData.isApprovalStep).toBe(true);
          expect(prData.isAsyncStepsSelfResponseStep).toBe(true);
          console.log(
            `✓ PR ${prId}: isAsyncSteps=true, isApprovalStep=true, isAsyncStepsSelfResponseStep=true`,
          );
        });

        await test.step("Добавить участников, запустить", async () => {
          await seedHelper.addTargetUsers(prId);
          await seedHelper.attachAssessments(prId);

          const { response: startResp } = await prAPI.start(prId);
          assertSuccessStatus(startResp);

          // Прогрессировать async стадии (skip nomination + batch send)
          const targetUserIds = await getTargetUserIds(prAPI, prId);
          await tryProgressAsyncStages(prAPI, prId, targetUserIds);
          console.log(`✓ PR запущен, ${targetUserIds.length} участников`);
        });

        await test.step("Остановить", async () => {
          const { data: prBefore } = await prAPI.getById(prId);
          if (prBefore.status === "active") {
            const { response } = await prAPI.stop(prId);
            assertSuccessStatus(response);
          }
          const { data: prData } = await prAPI.getById(prId);
          expect(["stopped", "complete"]).toContain(prData.status);
        });

        await test.step("Проверить настройки ДО resume (после stop)", async () => {
          const { data: prData } = await prAPI.getById(prId);
          expect(prData.isAsyncSteps).toBe(true);
          expect(prData.isApprovalStep).toBe(true);
          expect(prData.isAsyncStepsSelfResponseStep).toBe(true);
          console.log("✓ Настройки сохранены после stop");
        });

        await test.step("Resume", async () => {
          const { response } = await prAPI.resume(prId);
          assertSuccessStatus(response);

          const { data: prData } = await prAPI.getById(prId);
          expect(prData.status).toBe("active");
        });

        await test.step("Все 3 async-настройки сохранены ПОСЛЕ resume", async () => {
          const { data: prData } = await prAPI.getById(prId);

          expect(
            prData.isAsyncSteps,
            "isAsyncSteps должен остаться true после resume",
          ).toBe(true);
          expect(
            prData.isApprovalStep,
            "isApprovalStep должен остаться true после resume",
          ).toBe(true);
          expect(
            prData.isAsyncStepsSelfResponseStep,
            "isAsyncStepsSelfResponseStep должен остаться true после resume",
          ).toBe(true);

          console.log(
            `✓ После resume: isAsyncSteps=${prData.isAsyncSteps}, isApprovalStep=${prData.isApprovalStep}, isAsyncStepsSelfResponseStep=${prData.isAsyncStepsSelfResponseStep}`,
          );
        });

        await test.step("Направления и участники доступны после resume", async () => {
          const { data: prData } = await prAPI.getById(prId);
          const selectedDirs = (prData.directions || []).filter(
            (d) => d.isSelected,
          );
          expect(selectedDirs.length).toBeGreaterThanOrEqual(2);

          // Проверить что colleague направление всё ещё selected
          const colleagueDir = (prData.directions || []).find(
            (d) => d.receiverType === "colleague",
          );
          expect(
            colleagueDir?.isSelected,
            "Направление colleague должно остаться выбранным",
          ).toBe(true);

          const targetUserIds = await getTargetUserIds(prAPI, prId);
          expect(targetUserIds.length).toBeGreaterThan(0);
          console.log(
            `✓ ${selectedDirs.length} направлений, ${targetUserIds.length} участников`,
          );
        });

        await test.step("Завершить", async () => {
          const { response: stopResp } = await prAPI.stop(prId);
          assertSuccessStatus(stopResp);
        });
      },
    );

    test(
      "C7406: Повторный stop→resume не сбрасывает async-настройки",
      { tag: ["@normal"] },
      async ({ prAPI, prSeed }) => {
        setSeverity("normal");
        test.setTimeout(240000);

        const { seedHelper } = prSeed;
        let prId;

        await test.step("Создать async PR, запустить", async () => {
          const pr = await seedHelper.seedDraftPR({
            title: TestDataHelper.generateUniqueName("Стабильность асинхронных настроек"),
            isAsyncSteps: true,
            isApprovalStep: true,
            isAsyncStepsSelfResponseStep: true,
            directions: [
              {
                id: null,
                receiverType: "self",
                isSelected: true,
                title: null,
                description: null,
              },
              {
                id: null,
                receiverType: "head",
                isSelected: true,
                title: null,
                description: null,
              },
              {
                id: null,
                receiverType: "subordinate",
                isSelected: false,
                title: null,
                description: null,
              },
              {
                id: null,
                receiverType: "colleague",
                isSelected: true,
                title: null,
                description: null,
              },
            ],
          });
          prId = pr.id;
          createdReviewId = prId;

          await seedHelper.addTargetUsers(prId);
          await seedHelper.attachAssessments(prId);

          const { response: startResp } = await prAPI.start(prId);
          assertSuccessStatus(startResp);

          const targetUserIds = await getTargetUserIds(prAPI, prId);
          await tryProgressAsyncStages(prAPI, prId, targetUserIds);
        });

        // Цикл 1: stop → resume
        await test.step("Цикл 1: stop → resume", async () => {
          const { response: stopResp } = await prAPI.stop(prId);
          assertSuccessStatus(stopResp);

          const { response: resumeResp } = await prAPI.resume(prId);
          assertSuccessStatus(resumeResp);

          const { data } = await prAPI.getById(prId);
          expect(data.status).toBe("active");
          expect(data.isAsyncSteps).toBe(true);
          expect(data.isApprovalStep).toBe(true);
          expect(data.isAsyncStepsSelfResponseStep).toBe(true);
          console.log("✓ Цикл 1: настройки сохранены");
        });

        // Цикл 2: stop → resume
        await test.step("Цикл 2: stop → resume", async () => {
          const { response: stopResp } = await prAPI.stop(prId);
          assertSuccessStatus(stopResp);

          const { response: resumeResp } = await prAPI.resume(prId);
          assertSuccessStatus(resumeResp);

          const { data } = await prAPI.getById(prId);
          expect(data.status).toBe("active");
          expect(data.isAsyncSteps).toBe(true);
          expect(data.isApprovalStep).toBe(true);
          expect(data.isAsyncStepsSelfResponseStep).toBe(true);
          console.log("✓ Цикл 2: настройки сохранены");
        });

        await test.step("Финальный stop", async () => {
          const { response: stopResp } = await prAPI.stop(prId);
          assertSuccessStatus(stopResp);
        });
      },
    );
  },
);
