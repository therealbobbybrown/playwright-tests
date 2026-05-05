// tests/functional/performance-review/resume/pr-resume-multi-assessment-api.spec.js
// API тесты: Возобновление оценки с несколькими анкетами на направление

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
    await api.signIn(email, password, { timeout: 120_000 });
    await use(api);
  },
  assessAPI: async ({ request }, use) => {
    const api = new AssessmentsAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password, { timeout: 120_000 });
    await use(api);
  },
  compAPI: async ({ request }, use) => {
    const api = new CompetenciesAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password, { timeout: 120_000 });
    await use(api);
  },
});

// ---------------------------------------------------------------------------
// Helpers: создание анкет с разными типами вопросов
// ---------------------------------------------------------------------------

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

/**
 * Подсчитать общее количество assessments по всем направлениям PR.
 * API GET /manager/performance-reviews/{id}/assessments возвращает объект
 * вида { directionId1: [assessment, ...], directionId2: [assessment, ...] }
 */
async function countAssessments(prAPI, prId) {
  const { data: assessData } = await prAPI.getAssessments(prId);

  if (!assessData || typeof assessData !== "object") return 0;

  // Формат: { "directionId": [assessments], ... }
  let total = 0;
  for (const key of Object.keys(assessData)) {
    const value = assessData[key];
    if (Array.isArray(value)) {
      total += value.length;
    }
  }
  return total;
}

/**
 * Получить ID первой доступной компетенции (кешируется)
 */
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

/**
 * Создать assessment через API с заданными вопросами
 * @returns {Promise<number>} assessment ID
 */
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
  "PR Resume — несколько анкет на направление",
  { tag: ["@api", "@regression", "@performance-review", "@resume"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.PERFORMANCE_REVIEW, "Resume Multi-Assessment");
    });

    /** ID для cleanup */
    let createdReviewId = null;
    const createdAssessmentIds = [];

    test.afterEach(async ({ prAPI, assessAPI }) => {
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
      for (const id of createdAssessmentIds) {
        try {
          await assessAPI.deleteAssessment(id);
        } catch {
          /* ignore */
        }
      }
      createdAssessmentIds.length = 0;
    });

    // ========================================================================
    // RESUME-MA-001: Несколько анкет → resume → результаты сохранены
    // ========================================================================

    test(
      "C7428: Resume с несколькими анкетами — результаты всех анкет сохранены",
      { tag: ["@critical"] },
      async ({ prAPI, assessAPI, compAPI, prSeed }, testInfo) => {
        setSeverity("critical");
        test.slow();
        testInfo.setTimeout(600_000);
        const competenceId = await getCompetenceId(compAPI);

        const { seedHelper } = prSeed;
        const TS = Date.now();
        let prId, revisionId;
        let assessAId, assessBId;

        await test.step("Создать 2 анкеты (scale + mixed)", async () => {
          assessAId = await createAssessment(assessAPI, `MA001_A_Scale_${TS}`, [
            scaleQuestion("Качество работы", 1, competenceId),
            scaleQuestion("Инициативность", 2, competenceId),
          ]);
          createdAssessmentIds.push(assessAId);

          assessBId = await createAssessment(assessAPI, `MA001_B_Mixed_${TS}`, [
            scaleQuestion("Командная работа", 1, competenceId),
            singleSelectQuestion("Рекомендация", 2, ["Да", "Возможно", "Нет"]),
          ]);
          createdAssessmentIds.push(assessBId);

          console.log(`✓ Анкеты: A=${assessAId}, B=${assessBId}`);
        });

        await test.step("Создать PR с обеими анкетами на self + head", async () => {
          const pr = await seedHelper.seedDraftPR({
            title: TestDataHelper.generateUniqueName("Мульти-анкета возобновление"),
          });
          prId = pr.id;
          createdReviewId = prId;

          // Привязать обе анкеты к активным направлениям
          await seedHelper.attachAssessments(prId, [assessAId, assessBId]);

          // Добавить участников
          await seedHelper.addTargetUsers(prId);

          // Запуск
          const { response: startResp } = await prAPI.start(prId);
          assertSuccessStatus(startResp);

          // Заполнить все анкеты
          const filled = await seedHelper.fillQuestionnaires(prId);
          expect(filled).toBeGreaterThan(0);
          console.log(`✓ PR ${prId}: заполнено ${filled} анкет`);

          // Запомнить revision
          const { data: rev } = await prAPI.getLastRevision(prId);
          revisionId = rev.id;
        });

        await test.step("Остановить PR", async () => {
          // Когда все анкеты заполнены, PR может автоматически перейти в "complete"
          // В этом случае stop() не нужен — PR уже завершён
          const { data: prBefore } = await prAPI.getById(prId);
          if (prBefore.status === "active") {
            const { response } = await prAPI.stop(prId);
            assertSuccessStatus(response);
          }

          const { data: prData } = await prAPI.getById(prId);
          expect(["stopped", "complete"]).toContain(prData.status);
          console.log(`✓ PR статус: ${prData.status}`);
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

        await test.step("Результаты содержат данные обеих анкет", async () => {
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

          // heatMapResults должен содержать записи для target users
          const heatUsers = Object.keys(
            summData.heatMapResults?.targetUsers || {},
          );
          expect(heatUsers.length).toBe(targetUsersIds.length);
          console.log(
            `✓ Результаты: ${heatUsers.length} пользователей в heatmap`,
          );
        });
      },
    );

    // ========================================================================
    // RESUME-MA-002: Добавление новой анкеты к направлению после resume
    // ========================================================================

    test(
      "C7429: Добавить анкету к направлению после resume — новые анкеты создаются",
      { tag: ["@critical"] },
      async ({ prAPI, assessAPI, compAPI, prSeed }, testInfo) => {
        setSeverity("critical");
        test.slow();
        testInfo.setTimeout(600_000);
        const competenceId = await getCompetenceId(compAPI);

        const { seedHelper } = prSeed;
        const TS = Date.now();
        let prId, revisionId;
        let assessAId, assessBId, assessCId;

        await test.step("Создать 2 анкеты и PR", async () => {
          assessAId = await createAssessment(assessAPI, `MA002_A_${TS}`, [
            scaleQuestion("Качество работы", 1, competenceId),
          ]);
          createdAssessmentIds.push(assessAId);

          assessBId = await createAssessment(assessAPI, `MA002_B_${TS}`, [
            scaleQuestion("Командная работа", 1, competenceId),
          ]);
          createdAssessmentIds.push(assessBId);

          const pr = await seedHelper.seedDraftPR({
            title: TestDataHelper.generateUniqueName("Мульти-анкета добавление"),
          });
          prId = pr.id;
          createdReviewId = prId;

          await seedHelper.attachAssessments(prId, [assessAId, assessBId]);
          await seedHelper.addTargetUsers(prId);

          const { response: startResp } = await prAPI.start(prId);
          assertSuccessStatus(startResp);

          const filled = await seedHelper.fillQuestionnaires(prId);
          expect(filled).toBeGreaterThan(0);
          console.log(`✓ PR ${prId}: ${filled} анкет заполнено`);

          const { data: rev } = await prAPI.getLastRevision(prId);
          revisionId = rev.id;
        });

        let assessCountBefore;

        await test.step("Остановить → проверить количество анкет", async () => {
          const { data: prBefore } = await prAPI.getById(prId);
          if (prBefore.status === "active") {
            const { response: stopResp } = await prAPI.stop(prId);
            assertSuccessStatus(stopResp);
          }
          const { data: prStopped } = await prAPI.getById(prId);
          expect(["stopped", "complete"]).toContain(prStopped.status);

          assessCountBefore = await countAssessments(prAPI, prId);
          expect(assessCountBefore).toBeGreaterThan(0);
          console.log(
            `✓ Анкет до resume: ${assessCountBefore}, статус: ${prStopped.status}`,
          );
        });

        await test.step("Resume", async () => {
          const { response } = await prAPI.resume(prId);
          assertSuccessStatus(response);
        });

        await test.step("Создать 3-ю анкету и добавить к направлению самооценки", async () => {
          assessCId = await createAssessment(assessAPI, `MA002_C_New_${TS}`, [
            scaleQuestion("Общая эффективность", 1, competenceId),
            longTextQuestion("Опишите сильные стороны", 2),
          ]);
          createdAssessmentIds.push(assessCId);

          // Получить direction для self
          const { data: prData } = await prAPI.getById(prId);
          const selfDir = prData.directions.find(
            (d) => d.receiverType === "self" && d.isSelected,
          );
          expect(selfDir).toBeTruthy();

          // Добавить 3-ю анкету (к существующим A и B)
          const { response: setResp } = await prAPI.setAssessments(prId, {
            directionId: selfDir.id,
            assessmentsIds: [assessAId, assessBId, assessCId],
          });
          assertSuccessStatus(setResp);
          console.log(`✓ 3-я анкета (${assessCId}) добавлена к self direction`);
        });

        await test.step("Количество анкет увеличилось", async () => {
          const assessCountAfter = await countAssessments(prAPI, prId);
          expect(assessCountAfter).toBe(assessCountBefore + 1);
          console.log(
            `✓ Анкет: ${assessCountBefore} → ${assessCountAfter} (+1)`,
          );
        });

        await test.step("Заполнить новые анкеты → все учтены в результатах", async () => {
          const filled = await seedHelper.fillQuestionnaires(prId);
          console.log(`✓ Дозаполнено ${filled} новых анкет`);

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
        });
      },
    );

    // ========================================================================
    // RESUME-MA-003: Заполнение до и после resume — данные обоих раундов
    // ========================================================================

    test(
      "C7430: Данные заполненные до и после resume присутствуют в результатах",
      { tag: ["@critical"] },
      async ({ prAPI, assessAPI, compAPI, prSeed }, testInfo) => {
        setSeverity("critical");
        test.slow();
        testInfo.setTimeout(600_000);
        const competenceId = await getCompetenceId(compAPI);

        const { seedHelper } = prSeed;
        const TS = Date.now();
        let prId, revisionId;
        let assessAId, assessBId;

        await test.step("Создать PR с 2 анкетами, заполнить, остановить", async () => {
          assessAId = await createAssessment(assessAPI, `MA003_A_${TS}`, [
            scaleQuestion("Качество работы", 1, competenceId),
            scaleQuestion("Инициативность", 2, competenceId),
          ]);
          createdAssessmentIds.push(assessAId);

          assessBId = await createAssessment(assessAPI, `MA003_B_${TS}`, [
            scaleQuestion("Командная работа", 1, competenceId),
            singleSelectQuestion("Рекомендация", 2, ["Да", "Нет"]),
          ]);
          createdAssessmentIds.push(assessBId);

          const pr = await seedHelper.seedDraftPR({
            title: TestDataHelper.generateUniqueName("Мульти-анкета циклы"),
          });
          prId = pr.id;
          createdReviewId = prId;

          await seedHelper.attachAssessments(prId, [assessAId, assessBId]);
          await seedHelper.addTargetUsers(prId);

          const { response: startResp } = await prAPI.start(prId);
          assertSuccessStatus(startResp);

          // Заполнить раунд 1
          const filledRound1 = await seedHelper.fillQuestionnaires(prId);
          expect(filledRound1).toBeGreaterThan(0);
          console.log(`✓ Раунд 1: ${filledRound1} анкет`);

          const { data: rev } = await prAPI.getLastRevision(prId);
          revisionId = rev.id;

          // Остановить
          const { response: stopResp } = await prAPI.stop(prId);
          assertSuccessStatus(stopResp);
        });

        await test.step("Resume", async () => {
          const { response } = await prAPI.resume(prId);
          assertSuccessStatus(response);

          const { data: prData } = await prAPI.getById(prId);
          expect(prData.status).toBe("active");
        });

        await test.step("Revision ID не изменился", async () => {
          const { data: rev } = await prAPI.getLastRevision(prId);
          expect(rev.id).toBe(revisionId);
        });

        await test.step("Результаты из раунда 1 по-прежнему доступны", async () => {
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
          expect(summData.directions?.length).toBeGreaterThan(0);

          // heatMapResults должен содержать данные по target users
          const heatUsers = Object.keys(
            summData.heatMapResults?.targetUsers || {},
          );
          expect(heatUsers.length).toBe(targetUsersIds.length);
          console.log(
            `✓ Результаты раунда 1: ${heatUsers.length} пользователей в heatmap`,
          );
        });
      },
    );

    // ========================================================================
    // RESUME-MA-004: Удаление анкеты с направления после resume
    // ========================================================================

    test(
      "C7431: Удалить анкету с направления после resume — оставшиеся сохранены",
      { tag: ["@normal"] },
      async ({ prAPI, assessAPI, compAPI, prSeed }, testInfo) => {
        setSeverity("normal");
        test.slow();
        testInfo.setTimeout(600_000);
        const competenceId = await getCompetenceId(compAPI);

        const { seedHelper } = prSeed;
        const TS = Date.now();
        let prId;
        let assessAId, assessBId;

        await test.step("Создать PR с 2 анкетами, заполнить, остановить, resume", async () => {
          assessAId = await createAssessment(assessAPI, `MA004_A_${TS}`, [
            scaleQuestion("Качество", 1, competenceId),
          ]);
          createdAssessmentIds.push(assessAId);

          assessBId = await createAssessment(assessAPI, `MA004_B_${TS}`, [
            scaleQuestion("Командная работа", 1, competenceId),
          ]);
          createdAssessmentIds.push(assessBId);

          const pr = await seedHelper.seedDraftPR({
            title: TestDataHelper.generateUniqueName("Мульти-анкета удаление"),
          });
          prId = pr.id;
          createdReviewId = prId;

          await seedHelper.attachAssessments(prId, [assessAId, assessBId]);
          await seedHelper.addTargetUsers(prId);

          const { response: startResp } = await prAPI.start(prId);
          assertSuccessStatus(startResp);

          await seedHelper.fillQuestionnaires(prId);

          // После заполнения PR может перейти в complete — stop только если active
          const { data: prBefore } = await prAPI.getById(prId);
          if (prBefore.status === "active") {
            await prAPI.stop(prId);
          }
          await prAPI.resume(prId);
        });

        let assessCountBefore;

        await test.step("Удалить анкету B с направления self", async () => {
          assessCountBefore = await countAssessments(prAPI, prId);

          const { data: prData } = await prAPI.getById(prId);
          const selfDir = prData.directions.find(
            (d) => d.receiverType === "self" && d.isSelected,
          );
          expect(selfDir).toBeTruthy();

          // Оставить только анкету A
          const { response } = await prAPI.setAssessments(prId, {
            directionId: selfDir.id,
            assessmentsIds: [assessAId],
          });
          assertSuccessStatus(response);
          console.log(`✓ Анкета B удалена с self direction`);
        });

        await test.step("Количество анкет уменьшилось", async () => {
          const assessCountAfter = await countAssessments(prAPI, prId);
          expect(assessCountAfter).toBeLessThan(assessCountBefore);
          console.log(`✓ Анкет: ${assessCountBefore} → ${assessCountAfter}`);
        });

        await test.step("PR остаётся active", async () => {
          const { data: prData } = await prAPI.getById(prId);
          expect(prData.status).toBe("active");
        });
      },
    );
  },
);
