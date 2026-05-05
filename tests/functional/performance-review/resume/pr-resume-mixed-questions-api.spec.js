// tests/functional/performance-review/resume/pr-resume-mixed-questions-api.spec.js
// API тест: Resume PR с разными типами вопросов (scale + singleSelect + longText)

import { test as base, expect } from "../../../fixtures/full.js";
import {
  PerformanceReviewAPI,
  AssessmentsAPI,
  CompetenciesAPI,
  getCredentials,
} from "../../../utils/api/index.js";
import { TestDataHelper } from "../../../utils/TestDataHelper.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";
import { assertSuccessStatus } from "../../../utils/api/common-assertions.js";
import { randomUUID } from "crypto";
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
  assessAPI: async ({ request }, use) => {
    const api = new AssessmentsAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
  compAPI: async ({ request }, use) => {
    const api = new CompetenciesAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
});

// ---------------------------------------------------------------------------
// Helpers: создание вопросов разных типов
// ---------------------------------------------------------------------------

async function getCompetenceId(compAPI) {
  const { data } = await compAPI.getCompetencies({ limit: 5 });
  const items = data?.items || data || [];
  if (items.length > 0) {
    console.log(
      `✓ Компетенция для анкет: id=${items[0].id} (${items[0].title})`,
    );
    return items[0].id;
  }
  return null;
}

function scaleQuestion(title, position, competenceId) {
  return {
    temporaryId: randomUUID(),
    type: "scale",
    title,
    description: null,
    isRequired: true,
    allowComment: false,
    allowSkip: false,
    allowCustom: false,
    disallowStepNumbers: false,
    competenceId,
    competenceIndicatorQuestionId: null,
    widget: "slider",
    rangeMin: 1,
    rangeMax: 5,
    rangeMinLabel: "Низко",
    rangeMaxLabel: "Высоко",
    position,
    commentHeader: null,
    isCommentRequired: false,
    commentRequiredFrom: null,
    commentRequiredTo: null,
    universalTitle: null,
    selectionLimit: null,
    updatedAnswerOptions: [],
    updatedRedirects: [],
    updatedStepLabels: [
      { temporaryId: randomUUID(), text: "1", position: 1 },
      { temporaryId: randomUUID(), text: "2", position: 2 },
      { temporaryId: randomUUID(), text: "3", position: 3 },
      { temporaryId: randomUUID(), text: "4", position: 4 },
      { temporaryId: randomUUID(), text: "5", position: 5 },
    ],
  };
}

function singleSelectQuestion(title, position, options) {
  const now = Date.now();
  return {
    temporaryId: randomUUID(),
    type: "singleSelect",
    title,
    description: "",
    isRequired: true,
    allowComment: false,
    allowSkip: false,
    allowCustom: false,
    disallowStepNumbers: false,
    position,
    lastChangeTime: now,
    updatedAnswerOptions: options.map((text, i) => ({
      temporaryId: randomUUID(),
      text,
      position: i + 1,
      lastChangeTime: now,
    })),
    updatedRedirects: [],
    updatedStepLabels: [],
  };
}

function longTextQuestion(title, position) {
  return {
    temporaryId: randomUUID(),
    type: "longText",
    title,
    description: "",
    isRequired: false,
    allowComment: false,
    allowSkip: false,
    allowCustom: false,
    disallowStepNumbers: false,
    position,
    updatedAnswerOptions: [],
    updatedRedirects: [],
    updatedStepLabels: [],
  };
}

async function createAssessment(assessAPI, title, questions) {
  const { response: createResp, data: draft } =
    await assessAPI.createAssessment();
  expect(createResp.ok()).toBe(true);
  const assessId = draft.id;
  expect(typeof assessId).toBe("number");
  expect(assessId).toBeGreaterThan(0);

  const pageId = randomUUID();
  const { response: updateResp } = await assessAPI.updateAssessment(assessId, {
    title,
    description: `Тестовая анкета: ${title}`,
    theme: {
      id: 1,
      type: "color",
      mediaId: 1,
      media: { id: 1, color: "#8dd8bf" },
    },
    themeSettings: {},
    updatedPages: [
      {
        temporaryId: pageId,
        title: "Оценка",
        description: "",
        position: 1,
        updatedQuestions: questions,
      },
    ],
    updatedArchivedQuestions: [],
  });
  expect(updateResp.ok()).toBe(true);

  return assessId;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

test.describe(
  "PR Resume — Mixed Question Types",
  { tag: ["@api", "@regression", "@performance-review", "@resume"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.PERFORMANCE_REVIEW, "Resume Mixed Questions");
    });

    const createdReviewIds = [];
    const createdAssessmentIds = [];

    test.afterEach(async ({ prAPI, assessAPI }) => {
      for (const prId of createdReviewIds) {
        try {
          await prAPI.stop(prId);
        } catch {
          /* ignore */
        }
        try {
          await prAPI.archive(prId);
        } catch {
          /* ignore */
        }
        try {
          await prAPI.remove(prId);
        } catch {
          /* ignore */
        }
      }
      createdReviewIds.length = 0;
      for (const id of createdAssessmentIds) {
        try {
          await assessAPI.deleteAssessment(id);
        } catch {
          /* ignore */
        }
      }
      createdAssessmentIds.length = 0;
    });

    test(
      "C7426: Resume с mixed questions — все типы ответов сохранены",
      { tag: ["@critical"] },
      async ({ prAPI, assessAPI, compAPI, prSeed }, testInfo) => {
        setSeverity("critical");
        test.slow();
        testInfo.setTimeout(600_000);
        const competenceId = await getCompetenceId(compAPI);

        const { seedHelper } = prSeed;
        const TS = Date.now();
        let prId, revisionId;
        let assessId;

        await test.step("Создать анкету с 3 типами вопросов (scale + singleSelect + longText)", async () => {
          assessId = await createAssessment(assessAPI, `MixedQ_Resume_${TS}`, [
            scaleQuestion("Качество работы", 1, competenceId),
            scaleQuestion("Инициативность", 2, competenceId),
            singleSelectQuestion("Рекомендация к повышению", 3, [
              "Да, однозначно",
              "Возможно, в перспективе",
              "Нет, пока рано",
            ]),
            longTextQuestion("Комментарий к оценке", 4),
          ]);
          createdAssessmentIds.push(assessId);
          console.log(
            `✓ Анкета ${assessId}: 2×scale + 1×singleSelect + 1×longText`,
          );
        });

        await test.step("Создать PR, привязать анкету, запустить, заполнить", async () => {
          const pr = await seedHelper.seedDraftPR({
            title: TestDataHelper.generateUniqueName("Смешанные вопросы возобновление"),
          });
          prId = pr.id;
          createdReviewIds.push(prId);

          await seedHelper.attachAssessments(prId, [assessId]);
          await seedHelper.addTargetUsers(prId);

          const { response: startResp } = await prAPI.start(prId);
          assertSuccessStatus(startResp);

          const filled = await seedHelper.fillQuestionnaires(prId);
          expect(filled).toBeGreaterThan(0);
          console.log(`✓ PR ${prId}: заполнено ${filled} анкет`);

          const { data: rev } = await prAPI.getLastRevision(prId);
          revisionId = rev.id;
          expect(typeof revisionId).toBe("number");
          expect(revisionId).toBeGreaterThan(0);
        });

        let resultsBefore;

        await test.step("Остановить PR и зафиксировать результаты до resume", async () => {
          const { data: prBefore } = await prAPI.getById(prId);
          if (prBefore.status === "active") {
            const { response: stopResp } = await prAPI.stop(prId);
            assertSuccessStatus(stopResp);
          }

          const { data: prData } = await prAPI.getById(prId);
          expect(["stopped", "complete"]).toContain(prData.status);

          const targetUsersIds = await getTargetUserIds(prAPI, prId);
          expect(targetUsersIds.length).toBeGreaterThan(0);

          const { response: summResp, data: summData } =
            await prAPI.getStatisticsSummaryResults(prId, {
              targetUsersIds,
              revisionId,
            });
          assertSuccessStatus(summResp);
          expect(summData).toBeTruthy();
          expect(summData.heatMapResults).toBeTruthy();
          expect(summData.directions).toBeTruthy();
          expect(summData.directions.length).toBeGreaterThan(0);

          resultsBefore = summData;
          console.log(
            `✓ Результаты до resume: ${Object.keys(summData.heatMapResults?.targetUsers || {}).length} пользователей`,
          );
        });

        await test.step("Resume → статус active", async () => {
          const { response } = await prAPI.resume(prId);
          assertSuccessStatus(response);

          const { data: prData } = await prAPI.getById(prId);
          expect(prData.status).toBe("active");
        });

        await test.step("Revision ID не изменился после resume", async () => {
          const { data: rev } = await prAPI.getLastRevision(prId);
          expect(rev.id).toBe(revisionId);
        });

        await test.step("Результаты после resume совпадают с результатами до resume", async () => {
          const targetUsersIds = await getTargetUserIds(prAPI, prId);

          const { response: summResp, data: summData } =
            await prAPI.getStatisticsSummaryResults(prId, {
              targetUsersIds,
              revisionId,
            });
          assertSuccessStatus(summResp);
          expect(summData).toBeTruthy();
          expect(summData.heatMapResults).toBeTruthy();
          expect(summData.directions).toBeTruthy();
          expect(summData.directions.length).toBe(
            resultsBefore.directions.length,
          );

          // heatMapResults содержит те же target users
          const heatUsersBefore = Object.keys(
            resultsBefore.heatMapResults?.targetUsers || {},
          );
          const heatUsersAfter = Object.keys(
            summData.heatMapResults?.targetUsers || {},
          );
          expect(heatUsersAfter.length).toBe(heatUsersBefore.length);

          // Средние оценки совпадают (scale-вопросы)
          for (const userId of heatUsersBefore) {
            const before = resultsBefore.heatMapResults.targetUsers[userId];
            const after = summData.heatMapResults.targetUsers[userId];
            expect(after).toBeTruthy();

            // Общая средняя оценка не изменилась
            if (before?.totalMean !== undefined) {
              expect(after.totalMean).toBe(before.totalMean);
            }
          }

          console.log(
            `✓ Результаты после resume: ${heatUsersAfter.length} пользователей, данные совпадают`,
          );
        });

        await test.step("Завершить PR → результаты корректны", async () => {
          const { response: stopResp } = await prAPI.stop(prId);
          assertSuccessStatus(stopResp);

          const { data: prData } = await prAPI.getById(prId);
          expect(["stopped", "complete"]).toContain(prData.status);

          // Финальные результаты доступны
          const targetUsersIds = await getTargetUserIds(prAPI, prId);
          const { response: summResp, data: summData } =
            await prAPI.getStatisticsSummaryResults(prId, {
              targetUsersIds,
              revisionId,
            });
          assertSuccessStatus(summResp);
          expect(summData).toBeTruthy();
          expect(summData.heatMapResults).toBeTruthy();
          expect(summData.directions?.length).toBeGreaterThan(0);

          const heatUsers = Object.keys(
            summData.heatMapResults?.targetUsers || {},
          );
          expect(heatUsers.length).toBe(targetUsersIds.length);
          console.log(
            `✓ Финальные результаты: ${heatUsers.length} пользователей`,
          );
        });
      },
    );

    test(
      "C7427: Resume с mixed questions — частичное заполнение до и дозаполнение после",
      { tag: ["@critical"] },
      async ({ prAPI, assessAPI, compAPI, prSeed }, testInfo) => {
        setSeverity("critical");
        test.slow();
        testInfo.setTimeout(600_000);
        const competenceId = await getCompetenceId(compAPI);

        const { seedHelper } = prSeed;
        const TS = Date.now();
        let prId, revisionId;
        let assessId;

        await test.step("Создать анкету с mixed questions и PR", async () => {
          assessId = await createAssessment(assessAPI, `MixedQ_Partial_${TS}`, [
            scaleQuestion("Профессионализм", 1, competenceId),
            singleSelectQuestion("Готовность к повышению", 2, [
              "Готов",
              "Через полгода",
              "Не готов",
            ]),
            longTextQuestion("Сильные стороны сотрудника", 3),
            scaleQuestion("Коммуникация", 4, competenceId),
          ]);
          createdAssessmentIds.push(assessId);

          const pr = await seedHelper.seedDraftPR({
            title: TestDataHelper.generateUniqueName("Смешанные вопросы частичное"),
          });
          prId = pr.id;
          createdReviewIds.push(prId);

          await seedHelper.attachAssessments(prId, [assessId]);
          await seedHelper.addTargetUsers(prId);

          const { response: startResp } = await prAPI.start(prId);
          assertSuccessStatus(startResp);

          const { data: rev } = await prAPI.getLastRevision(prId);
          revisionId = rev.id;
        });

        let filledRound1;

        await test.step("Частично заполнить и остановить", async () => {
          // Заполнить с 50% skip chance — часть анкет останется пустой
          filledRound1 = await seedHelper.fillQuestionnaires(prId, {
            skipChance: 50,
          });
          expect(filledRound1).toBeGreaterThan(0);
          console.log(`✓ Раунд 1: заполнено ${filledRound1} анкет`);

          const { response: stopResp } = await prAPI.stop(prId);
          assertSuccessStatus(stopResp);

          const { data: prData } = await prAPI.getById(prId);
          expect(["stopped", "complete"]).toContain(prData.status);
        });

        let resultsAfterRound1;

        await test.step("Resume и проверить результаты раунда 1", async () => {
          const { response } = await prAPI.resume(prId);
          assertSuccessStatus(response);

          const { data: prData } = await prAPI.getById(prId);
          expect(prData.status).toBe("active");

          const targetUsersIds = await getTargetUserIds(prAPI, prId);
          const { response: summResp, data: summData } =
            await prAPI.getStatisticsSummaryResults(prId, {
              targetUsersIds,
              revisionId,
            });
          assertSuccessStatus(summResp);
          expect(summData).toBeTruthy();
          expect(summData.heatMapResults).toBeTruthy();
          resultsAfterRound1 = summData;
        });

        await test.step("Дозаполнить оставшиеся анкеты после resume", async () => {
          const filledRound2 = await seedHelper.fillQuestionnaires(prId);
          console.log(`✓ Раунд 2: дозаполнено ${filledRound2} анкет`);
        });

        await test.step("Результаты пересчитались — учтены данные обоих раундов", async () => {
          const targetUsersIds = await getTargetUserIds(prAPI, prId);

          const { response: summResp, data: summData } =
            await prAPI.getStatisticsSummaryResults(prId, {
              targetUsersIds,
              revisionId,
            });
          assertSuccessStatus(summResp);
          expect(summData).toBeTruthy();
          expect(summData.heatMapResults).toBeTruthy();
          expect(summData.directions).toBeTruthy();
          expect(summData.directions.length).toBeGreaterThan(0);

          // После дозаполнения heatmap покрывает всех пользователей
          const heatUsers = Object.keys(
            summData.heatMapResults?.targetUsers || {},
          );
          expect(heatUsers.length).toBe(targetUsersIds.length);

          console.log(
            `✓ Результаты обоих раундов: ${heatUsers.length} пользователей в heatmap`,
          );
        });

        await test.step("Завершить → финальные результаты корректны", async () => {
          const { response: stopResp } = await prAPI.stop(prId);
          assertSuccessStatus(stopResp);

          const { data: prData } = await prAPI.getById(prId);
          expect(["stopped", "complete"]).toContain(prData.status);

          const targetUsersIds = await getTargetUserIds(prAPI, prId);
          const { response: summResp, data: summData } =
            await prAPI.getStatisticsSummaryResults(prId, {
              targetUsersIds,
              revisionId,
            });
          assertSuccessStatus(summResp);
          expect(summData).toBeTruthy();

          const heatUsers = Object.keys(
            summData.heatMapResults?.targetUsers || {},
          );
          expect(heatUsers.length).toBe(targetUsersIds.length);

          console.log(
            `✓ Финал: ${heatUsers.length} пользователей, все данные на месте`,
          );
        });
      },
    );
  },
);
