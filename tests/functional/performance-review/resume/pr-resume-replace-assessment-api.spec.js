// tests/functional/performance-review/resume/pr-resume-replace-assessment-api.spec.js
// API тест: Замена анкеты направления после resume (RESUME-051)

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
// Helpers
// ---------------------------------------------------------------------------

/**
 * Подсчитать общее количество анкет в PR (по всем directions)
 */
async function countAssessments(prAPI, prId) {
  const { data } = await prAPI.getAssessments(prId);
  let count = 0;
  if (data && typeof data === "object") {
    for (const dirId of Object.keys(data)) {
      const assessments = data[dirId];
      if (Array.isArray(assessments)) count += assessments.length;
    }
  }
  return count;
}

/**
 * Создать анкету с scale-вопросом и вернуть её ID.
 * Анкета должна содержать хотя бы один заполняемый вопрос,
 * иначе populateReview не сможет её обработать.
 * @param {Object} assessAPI - AssessmentsAPI instance
 * @param {string} title - Название анкеты
 * @param {number|null} competenceId - ID компетенции для привязки к вопросу
 */
async function createTestAssessment(assessAPI, title, competenceId = null) {
  const { response: createResp, data } = await assessAPI.createAssessment();
  assertSuccessStatus(createResp);
  const assessmentId = data?.id;
  if (!assessmentId) {
    throw new Error(
      `createTestAssessment: не удалось получить ID анкеты из ответа. title=${title}`,
    );
  }

  const { response: updateResp } = await assessAPI.updateAssessment(
    assessmentId,
    {
      title,
      description: `Замена анкеты: ${title}`,
      theme: {
        id: 1,
        type: "color",
        mediaId: 1,
        media: { id: 1, color: "#8dd8bf" },
      },
      themeSettings: {},
      updatedPages: [
        {
          temporaryId: randomUUID(),
          title: "Оценка",
          description: "",
          position: 1,
          updatedQuestions: [
            {
              temporaryId: randomUUID(),
              type: "scale",
              title: "Общая оценка сотрудника",
              description: null,
              isRequired: true,
              allowComment: false,
              allowSkip: false,
              allowCustom: false,
              disallowStepNumbers: false,
              competenceId,
              widget: "slider",
              rangeMin: 1,
              rangeMax: 5,
              rangeMinLabel: "Низко",
              rangeMaxLabel: "Высоко",
              position: 1,
              updatedAnswerOptions: [],
              updatedRedirects: [],
              updatedStepLabels: [
                { temporaryId: randomUUID(), text: "1", position: 1 },
                { temporaryId: randomUUID(), text: "2", position: 2 },
                { temporaryId: randomUUID(), text: "3", position: 3 },
                { temporaryId: randomUUID(), text: "4", position: 4 },
                { temporaryId: randomUUID(), text: "5", position: 5 },
              ],
            },
          ],
        },
      ],
      updatedArchivedQuestions: [],
    },
  );
  assertSuccessStatus(updateResp);

  return assessmentId;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

test.describe(
  "PR Resume — Replace Assessment",
  { tag: ["@api", "@regression", "@performance-review", "@resume"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.PERFORMANCE_REVIEW, "Resume Replace Assessment");
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

    // ========================================================================
    // RESUME-051: Замена анкеты направления после resume
    // ========================================================================

    test(
      "C7447: Замена анкеты направления после resume",
      { tag: ["@medium"] },
      async ({ prAPI, assessAPI, compAPI, prSeed }, testInfo) => {
        setSeverity("normal");
        testInfo.setTimeout(240000);

        const { seedHelper } = prSeed;
        let prId;
        let selfDirectionId;
        let originalAssessmentIds;
        let newAssessmentId;
        let competenceId;

        // ----------------------------------------------------------------
        await test.step("Создать PR, заполнить и остановить", async () => {
          const pr = await seedHelper.seedStoppedPR({
            fillAssessments: true,
            title: TestDataHelper.generateUniqueName("Замена анкеты"),
          });
          prId = pr.id;
          createdReviewId = prId;

          expect(typeof prId).toBe("number");
          expect(prId).toBeGreaterThan(0);
          console.log(`✓ PR создан и остановлен: ${prId}`);
        });

        // ----------------------------------------------------------------
        await test.step("Запомнить текущие анкеты", async () => {
          // Получить конфиг PR для нахождения self-направления
          const { data: prData } = await prAPI.getById(prId);
          const directions = prData?.directions || [];
          expect(
            directions.length,
            "PR должен содержать directions",
          ).toBeGreaterThan(0);

          const selfDirection = directions.find(
            (d) => d.receiverType === "self" && d.isSelected,
          );
          expect(
            selfDirection,
            "В PR должно быть выбрано самооценочное направление (receiverType=self)",
          ).toBeTruthy();

          selfDirectionId = selfDirection.id;
          console.log(`✓ Self direction ID: ${selfDirectionId}`);

          // Получить текущие анкеты PR
          const { data: assessmentsData } = await prAPI.getAssessments(prId);
          const dirAssessments = assessmentsData?.[selfDirectionId];
          expect(
            Array.isArray(dirAssessments) && dirAssessments.length > 0,
            `Направление ${selfDirectionId} должно иметь хотя бы одну анкету`,
          ).toBe(true);

          originalAssessmentIds = dirAssessments.map((a) => a.id || a);
          console.log(
            `✓ Исходные анкеты self-направления: [${originalAssessmentIds.join(", ")}]`,
          );
        });

        // ----------------------------------------------------------------
        await test.step("Resume PR", async () => {
          const { response } = await prAPI.resume(prId);
          assertSuccessStatus(response);

          const { data: prData } = await prAPI.getById(prId);
          expect(prData.status).toBe("active");
          console.log("✓ Resume: статус active");
        });

        // ----------------------------------------------------------------
        await test.step("Получить компетенцию и создать новую анкету B", async () => {
          // Получить любую существующую компетенцию для привязки к вопросу
          const { data: compData } = await compAPI.getCompetencies({
            limit: 5,
          });
          const comps = compData?.items || compData || [];
          if (comps.length > 0) {
            competenceId = comps[0].id;
            console.log(
              `✓ Компетенция для анкеты: id=${competenceId} (${comps[0].title})`,
            );
          }

          const title = TestDataHelper.generateUniqueName("Замена анкеты (новая)");
          newAssessmentId = await createTestAssessment(
            assessAPI,
            title,
            competenceId,
          );
          expect(typeof newAssessmentId).toBe("number");
          expect(newAssessmentId).toBeGreaterThan(0);
          console.log(
            `✓ Новая анкета B создана: ID=${newAssessmentId} (${title}), competenceId=${competenceId}`,
          );
        });

        // ----------------------------------------------------------------
        await test.step("Заменить анкету: удалить старую, добавить новую", async () => {
          const { response } = await prAPI.setAssessments(prId, {
            directionId: selfDirectionId,
            assessmentsIds: [newAssessmentId],
          });
          assertSuccessStatus(response);
          console.log(
            `✓ Анкета заменена: direction=${selfDirectionId}, новая анкета=${newAssessmentId}`,
          );
        });

        // ----------------------------------------------------------------
        await test.step("Проверить замену", async () => {
          const { data: assessmentsData } = await prAPI.getAssessments(prId);
          const dirAssessments = assessmentsData?.[selfDirectionId];

          expect(
            Array.isArray(dirAssessments),
            `Направление ${selfDirectionId} должно содержать список анкет`,
          ).toBe(true);

          const currentIds = dirAssessments.map((a) => a.id || a);

          expect(
            currentIds,
            `Направление должно содержать ровно новую анкету ${newAssessmentId}`,
          ).toContain(newAssessmentId);

          // Убедиться, что старые анкеты убраны
          for (const oldId of originalAssessmentIds) {
            expect(
              currentIds,
              `Старая анкета ${oldId} не должна присутствовать после замены`,
            ).not.toContain(oldId);
          }

          expect(
            currentIds.length,
            "После замены должна быть ровно 1 анкета",
          ).toBe(1);

          console.log(
            `✓ Замена подтверждена: self-направление содержит только анкету ${newAssessmentId}`,
          );
        });

        // ----------------------------------------------------------------
        await test.step("Завершить", async () => {
          const { response } = await prAPI.stop(prId);
          assertSuccessStatus(response);
          console.log("✓ PR остановлен");
        });

        // ----------------------------------------------------------------
        await test.step("Проверить что PR завершился корректно", async () => {
          const { data: prData } = await prAPI.getById(prId);
          expect(
            ["stopped", "complete"],
            `PR должен быть в статусе stopped/complete, получен: ${prData.status}`,
          ).toContain(prData.status);
          console.log(`✓ PR завершён корректно: статус=${prData.status}`);
        });
      },
    );
  },
);
