// @ts-check
/**
 * Тест на баг бэкенда: при шкале от 0 и всех ответах = 0 не считается итоговая оценка
 *
 * Баг бэкенда (подтверждено разработчиками):
 *   endpoint users-competencies-results/get НЕ ВКЛЮЧАЕТ пользователя в массив ответа
 *   когда его итоговый score=0. Фронтенд корректно обрабатывает value=0 (nullish coalescing),
 *   но т.к. бэкенд не отдаёт запись — фронтенд попадает в else-ветку и рисует "–".
 *
 * Сценарий:
 *   Анкета со шкалой 0-5 (rangeMin=0, тогл «Начинать шкалу с нуля»).
 *   Все вопросы — scale, привязаны к компетенциям.
 *   ВСЕ ответы = 0 → итоговая оценка должна быть 0 (не null / не отсутствовать).
 *
 * Стратегия заполнения:
 *   1. CalibrationSeed — компетенции, PR, target users, receivers, запуск
 *   2. Кастомная анкета: scale вопросы с rangeMin=0, rangeMax=5, competenceId
 *   3. Per-user fill: авторизация за каждого респондента → page/start → value=0
 *
 * Проверяется через endpoint users-competencies-results/get для трёх режимов:
 *   1. «Общая» — все направления, useOnlyHeadReceiver = false
 *   2. «Только руководитель» — useOnlyHeadReceiver = true
 *   3. «Калибровка» — useOnlyHeadReceiver + enableResponsesOverwriting
 *
 * @tags @api @calibration @critical @performance-review @regression
 */
import { test as baseTest, expect } from "@playwright/test";
import { request as playwrightRequest } from "@playwright/test";
import { randomUUID } from "crypto";
import {
  PerformanceReviewAPI,
  getCredentials,
  getTestUserPassword,
} from "../../../utils/api/index.js";
import { CalibrationSeed } from "../../../utils/seed/CalibrationSeed.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";

const test = baseTest.extend({
  adminAPI: async ({ request }, use) => {
    const api = new PerformanceReviewAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
});

let TEST_PR_ID;
let REVISION_ID;
let TARGET_USER_IDS = [];

// ────────────────────────────────────────────────────────────────
// Хелпер: создать анкету со шкалой 0-5 и привязкой к компетенциям
// ────────────────────────────────────────────────────────────────
async function createZeroScaleAssessment(assessmentsAPI, competencies) {
  const ASSESSMENT_NAME = `ZeroScale_Assessment_${Date.now()}`;

  const { response: createResp, data: assessment } =
    await assessmentsAPI.createAssessment();
  if (!createResp.ok()) {
    throw new Error(`Не удалось создать анкету: ${createResp.status()}`);
  }
  const assessmentId = assessment.id;
  const pageId = randomUUID();

  // Scale-вопросы с rangeMin=0 и competenceId
  const scaleQuestions = competencies.map((comp, index) => {
    const questionTempId = randomUUID();

    const stepLabels = [
      { temporaryId: randomUUID(), text: "Не проявляется", position: 0 },
      {
        temporaryId: randomUUID(),
        text: "Значительно ниже ожиданий",
        position: 1,
      },
      { temporaryId: randomUUID(), text: "Ниже ожиданий", position: 2 },
      {
        temporaryId: randomUUID(),
        text: "Соответствует ожиданиям",
        position: 3,
      },
      { temporaryId: randomUUID(), text: "Выше ожиданий", position: 4 },
      {
        temporaryId: randomUUID(),
        text: "Значительно выше ожиданий",
        position: 5,
      },
    ];

    return {
      temporaryId: questionTempId,
      type: "scale",
      title: `Оцените ${comp.title.toLowerCase()} сотрудника`,
      description: null,
      isRequired: true,
      allowComment: false,
      allowSkip: false,
      allowCustom: false,
      disallowStepNumbers: false,
      competenceId: comp.id,
      competenceIndicatorQuestionId: null,
      widget: "slider",
      rangeMin: 0,
      rangeMax: 5,
      rangeMinLabel: "0",
      rangeMaxLabel: "5",
      position: index + 1,
      commentHeader: null,
      isCommentRequired: false,
      commentRequiredFrom: null,
      commentRequiredTo: null,
      universalTitle: null,
      selectionLimit: null,
      updatedAnswerOptions: [],
      updatedRedirects: [],
      updatedStepLabels: stepLabels,
    };
  });

  const assessmentData = {
    title: ASSESSMENT_NAME,
    description: "Анкета со шкалой 0-5 для теста нулевых ответов",
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
        title: "Оценка компетенций",
        description: "",
        position: 1,
        updatedQuestions: scaleQuestions,
      },
    ],
    updatedArchivedQuestions: [],
  };

  const { response: updateResp } = await assessmentsAPI.updateAssessment(
    assessmentId,
    assessmentData,
  );
  if (!updateResp.ok()) {
    const errorText = await updateResp.text();
    throw new Error(
      `Не удалось обновить анкету: ${updateResp.status()} - ${errorText}`,
    );
  }

  console.log(
    `✓ Анкета "${ASSESSMENT_NAME}" (ID: ${assessmentId}, rangeMin=0, вопросов: ${scaleQuestions.length})`,
  );
  return assessmentId;
}

// ────────────────────────────────────────────────────────────────
// Хелпер: извлечь вопросы из ответа page/start
// Формат ответа: {nextPageToken, nextPage: {questions}, isLast, revision, userResponse}
// ────────────────────────────────────────────────────────────────
function extractQuestions(pageData) {
  return (
    pageData?.nextPage?.questions ||
    pageData?.questions ||
    pageData?.assessment?.pages?.[0]?.questions ||
    []
  );
}

// ────────────────────────────────────────────────────────────────
// Хелпер: заполнить ВСЕ анкеты нулями от имени пользователей
//
// Формат ответа (найден перехватом реальных запросов фронтенда):
//   POST /private/performance-reviews/{prId}/{alias}/{revUserId}/answer/
//   Body: { [questionId]: { action: "answer", values: [{ value: 0, cantAnswer: false }] } }
// ────────────────────────────────────────────────────────────────
async function fillAllQuestionnairesWithZeros(prAPI, prId, revisionAlias) {
  const baseURL = process.env.API_BASE_URL || process.env.BASE_URL;
  const testPassword = getTestUserPassword();

  const { data: receiversData } = await prAPI.getReceiverUsers(prId, {
    limit: 200,
  });
  const receivers = receiversData?.items || [];

  const userEmails = new Map();
  for (const r of receivers) {
    const email = r.user?.account?.email;
    if (email && !userEmails.has(email)) {
      userEmails.set(
        email,
        `${r.user?.firstName || ""} ${r.user?.lastName || ""}`.trim(),
      );
    }
  }

  console.log(`  Уникальных респондентов: ${userEmails.size}`);
  let totalFilled = 0;

  for (const [email, userName] of userEmails) {
    let userCtx;
    try {
      userCtx = await playwrightRequest.newContext({ baseURL, timeout: 60000 });
      const userAPI = new PerformanceReviewAPI(userCtx);

      const { response: authResp } = await userAPI.signIn(email, testPassword);
      if (!authResp.ok()) {
        console.log(`  ⚠️ Auth failed for ${userName}: ${authResp.status()}`);
        await userCtx.dispose();
        continue;
      }

      const { data, response } = await userAPI.get(
        `/private/performance-reviews/${prId}/${revisionAlias}/revision-users`,
      );

      if (!response.ok()) {
        console.log(`  ⚠️ ${userName}: revision-users ${response.status()}`);
        await userCtx.dispose();
        continue;
      }

      const items = data?.items || data || [];

      for (const item of items) {
        const revisionUserId = item.id;
        if (item.response?.status === "complete") continue;

        // POST page/start — создаёт response record + возвращает вопросы
        const { data: pageData, response: pageResp } = await userAPI.post(
          `/private/performance-reviews/${prId}/${revisionAlias}/${revisionUserId}/answer/page/start`,
          {},
        );

        if (!pageResp.ok()) {
          console.log(
            `    ⚠️ page/start ${pageResp.status()} для ${userName} revUserId=${revisionUserId}`,
          );
          continue;
        }

        const questions = extractQuestions(pageData);
        if (questions.length === 0) {
          console.log(
            `    ⚠️ 0 вопросов для ${userName} revUserId=${revisionUserId}`,
          );
          continue;
        }

        // Формируем ответы в формате фронтенда
        const answers = {};
        for (const q of questions) {
          const qId = q.id || q.temporaryId;
          answers[qId] = {
            action: "answer",
            values: [{ value: 0, cantAnswer: false }],
          };
        }

        // POST /answer/ — отправляет все ответы одним запросом
        const { response: answerResp } = await userAPI.post(
          `/private/performance-reviews/${prId}/${revisionAlias}/${revisionUserId}/answer/`,
          answers,
        );

        if (answerResp.ok() || answerResp.status() === 201) {
          totalFilled++;
          console.log(
            `    ✓ ${userName}: revUserId=${revisionUserId} → value=0 (${questions.length} вопросов)`,
          );
        } else {
          const errBody = await answerResp.text().catch(() => "");
          console.log(
            `    ✗ ${userName}: ${answerResp.status()} ${errBody.substring(0, 150)}`,
          );
        }
      }

      await userCtx.dispose();
    } catch (e) {
      console.log(`  ⚠️ Ошибка для ${userName}: ${e.message}`);
      if (userCtx) await userCtx.dispose();
    }
  }

  console.log(`  Заполнено анкет с value=0: ${totalFilled}`);
  return totalFilled;
}

// ────────────────────────────────────────────────────────────────
// Хелпер: получить итоговые оценки через users-competencies-results API
// Это тот же endpoint, который UI использует для отрисовки «Общая оценка»
// POST /protected/.../users-competencies-results/get
// Payload: { usersIds: [...], revisionId }
// Ответ: [{ userId, value, isOverwritten, valueColor, characteristicColor, notOverwritten }]
// ────────────────────────────────────────────────────────────────
async function getScores(adminAPI, prId, revisionId, targetUsersIds) {
  const { data, response } = await adminAPI.getUsersCompetenciesResults(prId, {
    usersIds: targetUsersIds,
    revisionId,
  });

  expect(
    response.status(),
    `users-competencies-results API должен вернуть 201`,
  ).toBe(201);

  const items = Array.isArray(data) ? data : [];
  const result = {};

  for (const uid of targetUsersIds) {
    const entry = items.find(
      (item) => item.userId === uid || item.userId === String(uid),
    );
    result[uid] = {
      score: entry?.value ?? null,
      isOverwritten: entry?.isOverwritten ?? false,
      color: entry?.valueColor ?? null,
      hasData: entry != null,
    };
  }

  return result;
}

// ────────────────────────────────────────────────────────────────
// Хелпер: переключить режим statisticsSettings
// ────────────────────────────────────────────────────────────────
async function switchMode(adminAPI, prId, mode) {
  const { data: current } = await adminAPI.getStatisticsSettings(prId);

  const modeSettings = {
    общая: {
      useOnlyHeadReceiver: false,
      enableResponsesOverwriting: false,
      totalAverageOnly: false,
    },
    руководитель: {
      useOnlyHeadReceiver: true,
      enableCompetenceWeights: true,
      enableResponsesOverwriting: false,
    },
    калибровка: {
      useOnlyHeadReceiver: true,
      enableCompetenceWeights: true,
      enableResponsesOverwriting: true,
    },
  };

  const { response } = await adminAPI.updateStatisticsSettings(prId, {
    ...current,
    settings: {
      ...(current?.settings || {}),
      ...modeSettings[mode],
    },
  });

  expect(response.ok(), `Переключение на режим "${mode}"`).toBeTruthy();
}

// ====================================================================
// ТЕСТЫ
// ====================================================================

test.describe(
  "Нулевые ответы в итоговой оценке (шкала 0-5)",
  {
    tag: [
      "@api",
      "@calibration",
      "@critical",
      "@performance-review",
      "@regression",
    ],
  },
  () => {
    test.describe.configure({ mode: "serial" });

    test.beforeAll(async ({ request }) => {
      if (TEST_PR_ID) return;

      // 1. Инициализация
      const calSeed = new CalibrationSeed(request);
      await calSeed.init();

      // 2. Компетенции
      console.log("1️⃣ Создание компетенций...");
      const groups = await calSeed.createCompetenceGroups();
      const competencies = await calSeed.createCompetencies(groups);
      if (competencies.length === 0)
        throw new Error("Не удалось создать компетенции");
      console.log(`  ✓ ${competencies.length} компетенций`);

      // 3. Кастомная анкета с rangeMin=0
      console.log("\n2️⃣ Создание анкеты со шкалой 0-5...");
      const assessmentId = await createZeroScaleAssessment(
        calSeed.assessmentsAPI,
        competencies,
      );

      // 4. PR с self + head
      console.log("\n3️⃣ Создание PR...");
      const directionsConfig = {
        self: true,
        head: true,
        subordinate: false,
        colleague: false,
        custom: [],
      };
      const prId = await calSeed.createPRWithDirections(
        assessmentId,
        directionsConfig,
      );
      TEST_PR_ID = prId;
      console.log(`  ✓ PR ID: ${TEST_PR_ID}`);

      // 5. Target users
      console.log("\n4️⃣ Добавление target users...");
      const { targetUsers, allUsers } = await calSeed.addTargetUsers(prId, 3);
      if (targetUsers.length === 0)
        throw new Error("Не удалось добавить target users");

      // 6. Receivers
      console.log("\n5️⃣ Назначение receivers...");
      await calSeed.assignReceiversForDirections(
        prId,
        targetUsers,
        allUsers,
        directionsConfig,
        2,
      );

      // 7. Запуск PR
      console.log("\n6️⃣ Запуск PR...");
      const revision = await calSeed.startPR(prId);
      if (!revision) throw new Error("Не удалось запустить PR");
      REVISION_ID = revision.id;
      const revisionAlias = revision.alias || String(revision.id);
      console.log(`  ✓ Revision ID: ${REVISION_ID}, alias: ${revisionAlias}`);

      // 8. Target user IDs
      const { data: tuData } = await calSeed.prAPI.getTargetUsers(prId);
      const tUsers = tuData?.items || tuData || [];
      TARGET_USER_IDS = tUsers.map((u) => u.user?.id ?? u.userId);
      if (TARGET_USER_IDS.length === 0) throw new Error("No target users");
      console.log(`  ✓ Target users: ${TARGET_USER_IDS.length}`);

      // 9. Заполнение per-user с value=0
      console.log("\n7️⃣ Заполнение анкет с value=0 (per-user fill)...");
      const filled = await fillAllQuestionnairesWithZeros(
        calSeed.prAPI,
        prId,
        revisionAlias,
      );
      if (filled === 0)
        throw new Error("Не удалось заполнить ни одной анкеты с value=0");
      console.log(`  ✓ Заполнено: ${filled}`);

      // 10. Настройки статистики
      const { data: currentSettings } =
        await calSeed.prAPI.getStatisticsSettings(prId);
      await calSeed.prAPI.updateStatisticsSettings(prId, {
        ...currentSettings,
        settings: {
          ...(currentSettings?.settings || {}),
          enableCompetenceWeights: true,
        },
      });
      console.log("\n✅ PR готов к проверке.");
    });

    test.beforeEach(() => {
      markAsAPITest(MODULES.CALIBRATION, "Zero Score");
    });

    // ── Тест 1: Общая ─────────────────────────────────────────
    test(
      "C4441: Итоговая «Общая» содержит 0 при всех нулевых ответах",
      { tag: ["@critical"] },
      async ({ adminAPI }) => {
        setSeverity("critical");

        await test.step("Переключить на режим «Общая»", async () => {
          await switchMode(adminAPI, TEST_PR_ID, "общая");
        });

        await test.step("Получить итоговые оценки и проверить", async () => {
          const scores = await getScores(
            adminAPI,
            TEST_PR_ID,
            REVISION_ID,
            TARGET_USER_IDS,
          );

          console.log("\nИтоговая (Общая):");
          for (const uid of TARGET_USER_IDS) {
            const s = scores[uid];
            console.log(
              `  User ${uid}: score=${s.score}, color=${s.color}, isOverwritten=${s.isOverwritten}, hasData=${s.hasData}`,
            );

            expect(
              s.hasData,
              `User ${uid}: данные должны присутствовать в users-competencies-results`,
            ).toBeTruthy();
            expect(
              s.score,
              `User ${uid}: итоговая оценка не должна быть null (БАГ: нулевые ответы не попадают в итоговую)`,
            ).not.toBeNull();
            expect(
              typeof s.score,
              `User ${uid}: итоговая оценка должна быть числом`,
            ).toBe("number");
            expect(
              s.score,
              `User ${uid}: итоговая при всех ответах=0 должна быть 0`,
            ).toBe(0);
          }
        });
      },
    );

    // ── Тест 2: Только руководитель ───────────────────────────
    test(
      "C4442: Итоговая «Только руководитель» содержит 0 при всех нулевых ответах",
      { tag: ["@critical"] },
      async ({ adminAPI }) => {
        setSeverity("critical");

        await test.step("Переключить на режим «Только руководитель»", async () => {
          await switchMode(adminAPI, TEST_PR_ID, "руководитель");
        });

        await test.step("Получить итоговые оценки и проверить", async () => {
          const scores = await getScores(
            adminAPI,
            TEST_PR_ID,
            REVISION_ID,
            TARGET_USER_IDS,
          );

          console.log("\nИтоговая (Только руководитель):");
          let usersWithScore = 0;
          for (const uid of TARGET_USER_IDS) {
            const s = scores[uid];
            console.log(
              `  User ${uid}: score=${s.score}, color=${s.color}, isOverwritten=${s.isOverwritten}, hasData=${s.hasData}`,
            );

            // В режиме "только руководитель" у пользователей без руководителя-оценщика score=null — ожидаемо
            if (s.score !== null) {
              usersWithScore++;
              expect(
                typeof s.score,
                `User ${uid}: итоговая оценка должна быть числом`,
              ).toBe("number");
              expect(
                s.score,
                `User ${uid}: итоговая при всех ответах=0 должна быть 0`,
              ).toBe(0);
            }
          }
          expect(
            usersWithScore,
            "Хотя бы один пользователь должен иметь оценку руководителя",
          ).toBeGreaterThan(0);
        });
      },
    );

    // ── Тест 3: Калибровка ────────────────────────────────────
    test(
      "C4443: Итоговая «Калибровка» содержит 0 при всех нулевых ответах",
      { tag: ["@critical"] },
      async ({ adminAPI }) => {
        setSeverity("critical");

        await test.step("Переключить на режим «Калибровка»", async () => {
          await switchMode(adminAPI, TEST_PR_ID, "калибровка");
        });

        await test.step("Получить итоговые оценки и проверить", async () => {
          const scores = await getScores(
            adminAPI,
            TEST_PR_ID,
            REVISION_ID,
            TARGET_USER_IDS,
          );

          console.log("\nИтоговая (Калибровка):");
          let usersWithScore = 0;
          for (const uid of TARGET_USER_IDS) {
            const s = scores[uid];
            console.log(
              `  User ${uid}: score=${s.score}, color=${s.color}, isOverwritten=${s.isOverwritten}, hasData=${s.hasData}`,
            );

            if (s.score !== null) {
              usersWithScore++;
              expect(
                typeof s.score,
                `User ${uid}: итоговая оценка должна быть числом`,
              ).toBe("number");
              expect(
                s.score,
                `User ${uid}: итоговая при всех ответах=0 должна быть 0`,
              ).toBe(0);
            }
          }
          expect(
            usersWithScore,
            "Хотя бы один пользователь должен иметь оценку в режиме калибровки",
          ).toBeGreaterThan(0);
        });
      },
    );
  },
);
