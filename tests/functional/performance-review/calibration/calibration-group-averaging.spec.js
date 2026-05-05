// @ts-check
/**
 * Регрессия на Баг "Двойной подсчёт в группах":
 * При useOnlyHeadReceiver: false компетенции внутри группы считались
 * и через группу, и индивидуально. Вместо avg(ГруппаА, standalone)
 * считалось avg(comp1_из_группы, comp2_из_группы, standalone).
 *
 * Тесты проверяют:
 * - Итоговое среднее = avg(group_avgs, standalone_scores), а НЕ avg(all_individual_scores)
 * - Group scores из API совпадают с расчётными
 * - Переключение useOnlyHeadReceiver влияет на результат
 * - Калибровка не ломает формулу расчёта по группам
 *
 * @tags @api @calibration @critical @performance-review
 * @module Calibration
 */
import { test as baseTest, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import {
  PerformanceReviewAPI,
  CompetenciesAPI,
  AssessmentsAPI,
  getCredentials,
} from "../../../utils/api/index.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";
import { CalibrationSeed } from "../../../utils/seed/CalibrationSeed.js";

// ---------- Хелперы ----------

/**
 * Поллинг с предикатом. Бросает ошибку при таймауте.
 */
async function pollUntil(
  getFn,
  predicate,
  { timeout = 60000, interval = 2000, message = "" } = {},
) {
  const deadline = Date.now() + timeout;
  let lastResult;
  while (Date.now() < deadline) {
    lastResult = await getFn();
    if (predicate(lastResult)) return lastResult;
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error(
    `pollUntil timeout (${timeout}ms): ${message || "predicate never became true"}\n` +
      `Last result: ${JSON.stringify(lastResult, null, 2).slice(0, 500)}`,
  );
}

/**
 * Snapshot результатов из heatMap.
 * @returns {{ byUser: Object, competenceMeta: Array }}
 */
async function getResultsSnapshot(prAPI, prId, revisionId, targetUsersIds) {
  const { data, response } = await prAPI.getStatisticsSummaryResults(prId, {
    targetUsersIds,
    revisionId,
  });
  expect(
    response.status(),
    "getStatisticsSummaryResults should return 201",
  ).toBe(201);
  const byUser = {};
  const targetUsersMap = data?.heatMapResults?.targetUsers || {};
  for (const uid of Object.keys(targetUsersMap)) {
    const userEntry = targetUsersMap[uid];
    byUser[Number(uid)] = {
      score: userEntry?.avrCompetencesCommon?.value ?? null,
      color: userEntry?.avrCompetencesCommon?.color ?? null,
      competences: userEntry?.competences || {},
    };
  }
  const competenceMeta = (data?.competences || []).map((c) => ({
    id: c.id,
    title: c.title,
    groupId: c.groupId ?? null,
  }));
  return { byUser, competenceMeta };
}

/**
 * Snapshot per-group scores из groups-for-revision endpoint.
 * @returns {Array<{ competenceGroupId: number, value: number }>}
 */
async function getGroupsForRevisionSnapshot(
  prAPI,
  prId,
  revisionId,
  targetUserId,
) {
  const { data, response } = await prAPI.getCompetenceGroupsForRevision(
    prId,
    revisionId,
    { usersIds: [targetUserId], actualize: false },
  );
  expect([200, 201], "getCompetenceGroupsForRevision should succeed").toContain(
    response.status(),
  );
  const items = Array.isArray(data) ? data : data?.items || [];
  return items.map((g) => ({
    competenceGroupId: g.competenceGroupId,
    value: g.value,
  }));
}

/**
 * Вычислить два варианта среднего:
 * - correct: avg(group_avgs, standalone_scores) — правильная формула
 * - buggy: avg(all_individual_scores) — баговая формула (двойной подсчёт)
 *
 * @param {Object} compScores - {compId: {value}} из heatMap
 * @param {Array} competenceMeta - [{id, title, groupId}]
 */
function computeAverages(compScores, competenceMeta) {
  const groups = {}; // groupId → [values]
  const standaloneValues = []; // [value, ...]
  const allValues = [];

  for (const meta of competenceMeta) {
    const entry = compScores[meta.id] ?? compScores[String(meta.id)];
    const value = entry?.value;
    if (value == null) continue;

    allValues.push(value);

    if (meta.groupId != null) {
      if (!groups[meta.groupId]) groups[meta.groupId] = [];
      groups[meta.groupId].push(value);
    } else {
      standaloneValues.push(value);
    }
  }

  // Правильная формула: каждая группа → одно среднее, standalone → как есть
  const components = [];
  for (const groupValues of Object.values(groups)) {
    components.push(
      groupValues.reduce((a, b) => a + b, 0) / groupValues.length,
    );
  }
  for (const sv of standaloneValues) {
    components.push(sv);
  }
  const correct =
    components.length > 0
      ? components.reduce((a, b) => a + b, 0) / components.length
      : null;

  // Баговая формула: все индивидуальные значения с равным весом
  const buggy =
    allValues.length > 0
      ? allValues.reduce((a, b) => a + b, 0) / allValues.length
      : null;

  return {
    correct,
    buggy,
    groupCount: Object.keys(groups).length,
    standaloneCount: standaloneValues.length,
    totalComps: allValues.length,
  };
}

/**
 * Переключить настройку статистики через feature URL.
 */
async function toggleSetting(api, prId, settingName, value) {
  const featureUrl = `/manager/performance-reviews/${prId}/statistics/settings/?feature=statisticsSettings`;
  const { data: settings } = await api.get(featureUrl);
  const { response } = await api.post(featureUrl, {
    ...settings,
    settings: {
      ...(settings?.settings || {}),
      [settingName]: value,
    },
  });
  expect(response.ok(), `Toggle ${settingName}=${value}`).toBe(true);

  const { data: saved } = await api.get(featureUrl);
  expect(
    saved?.settings?.[settingName],
    `${settingName} должно быть ${value}`,
  ).toBe(value);
}

// ---------- Fixtures ----------

const test = baseTest.extend({
  adminAPI: async ({ request }, use) => {
    const api = new PerformanceReviewAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
});

// ---------- Shared state ----------

let PR_ID;
let REVISION_ID;
let TARGET_USERS; // [{ userId, name }]
let COMP_IDS; // { comp1Id, comp2Id, comp3Id }
let GROUP_A_ID;

test.beforeAll(async ({ request }) => {
  test.setTimeout(480000);

  const { email, password } = getCredentials("admin");
  const suffix = `_GrpTest_${Date.now()}`;

  // ── 1. Кастомные компетенции: Группа A (comp1, comp2) + Standalone (comp3) ──

  const competenciesAPI = new CompetenciesAPI(request);
  await competenciesAPI.signIn(email, password);

  const { data: groupA, response: gResp } =
    await competenciesAPI.createCompetenceGroup(`ГруппаА${suffix}`);
  expect(gResp.ok(), "Создание группы A").toBe(true);
  GROUP_A_ID = groupA.id;

  const { data: comp1, response: c1r } = await competenciesAPI.createCompetency(
    {
      title: `НавыкA1${suffix}`,
      description: "Тест",
      emoji: "📋",
      groupId: GROUP_A_ID,
    },
  );
  expect(c1r.ok(), `Создание comp1 в группе A (status=${c1r.status()})`).toBe(
    true,
  );

  const { data: comp2, response: c2r } = await competenciesAPI.createCompetency(
    {
      title: `НавыкA2${suffix}`,
      description: "Тест",
      emoji: "✨",
      groupId: GROUP_A_ID,
    },
  );
  expect(c2r.ok(), "Создание comp2 в группе A").toBe(true);

  const { data: comp3, response: c3r } = await competenciesAPI.createCompetency(
    {
      title: `Автономный${suffix}`,
      description: "Standalone",
      emoji: "🎯",
    },
  );
  expect(c3r.ok(), "Создание standalone comp3").toBe(true);

  COMP_IDS = { comp1Id: comp1.id, comp2Id: comp2.id, comp3Id: comp3.id };
  const customCompetencies = [comp1, comp2, comp3];
  console.log(
    `✅ Компетенции: comp1=${comp1.id}, comp2=${comp2.id} (группа ${GROUP_A_ID}), standalone=${comp3.id}`,
  );

  // ── 2. Уникальная анкета с кастомными компетенциями ──

  const assessmentsAPI = new AssessmentsAPI(request);
  await assessmentsAPI.signIn(email, password);

  const { response: createResp, data: assessment } =
    await assessmentsAPI.createAssessment();
  expect(createResp.ok(), "Создание анкеты").toBe(true);
  const assessmentId = assessment.id;

  const pageId = randomUUID();
  const scaleQuestions = customCompetencies.map((comp, index) => ({
    temporaryId: randomUUID(),
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
    rangeMin: 1,
    rangeMax: 5,
    rangeMinLabel: "Низко",
    rangeMaxLabel: "Высоко",
    position: index + 1,
    commentHeader: null,
    isCommentRequired: false,
    commentRequiredFrom: null,
    commentRequiredTo: null,
    universalTitle: null,
    selectionLimit: null,
    updatedAnswerOptions: [],
    updatedRedirects: [],
    updatedStepLabels: [
      { temporaryId: randomUUID(), text: "Ниже ожиданий", position: 1 },
      { temporaryId: randomUUID(), text: "Ожидания", position: 2 },
      { temporaryId: randomUUID(), text: "Соответствует", position: 3 },
      { temporaryId: randomUUID(), text: "Выше ожиданий", position: 4 },
      { temporaryId: randomUUID(), text: "Превосходит", position: 5 },
    ],
  }));

  const assessmentData = {
    title: `GrpAvg_Test${suffix}`,
    description: "Анкета для тестов расчёта по группам",
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
  expect(updateResp.ok(), "Обновление анкеты с вопросами").toBe(true);
  console.log(`✅ Анкета: ${assessmentId} (${scaleQuestions.length} вопросов)`);

  // ── 3. CalibrationSeed для PR, target users, заполнение ──

  const calSeed = new CalibrationSeed(request);
  await calSeed.init();

  PR_ID = await calSeed.createPerformanceReview(assessmentId);
  console.log(`✅ PR: ${PR_ID}`);

  const { targetUsers } = await calSeed.addTargetUsers(PR_ID, 3);
  expect(targetUsers.length, "Должны быть target users").toBeGreaterThanOrEqual(
    1,
  );
  console.log(`✅ Target users: ${targetUsers.length}`);

  const revision = await calSeed.startPR(PR_ID);
  REVISION_ID = revision?.id;
  expect(REVISION_ID, "Ревизия должна быть создана").toBeTruthy();
  console.log(`✅ Revision: ${REVISION_ID}`);

  await calSeed.fillAllDirectionsQuestionnaires(
    PR_ID,
    revision,
    customCompetencies,
  );

  // ── 3. Настройки: useOnlyHeadReceiver=false (ключевой для бага), без весов ──

  const adminAPI = new PerformanceReviewAPI(request);
  await adminAPI.signIn(email, password);

  const featureUrl = `/manager/performance-reviews/${PR_ID}/statistics/settings/?feature=statisticsSettings`;
  const { data: settings } = await adminAPI.get(featureUrl);
  const { response: settResp } = await adminAPI.post(featureUrl, {
    ...settings,
    settings: {
      ...(settings?.settings || {}),
      useOnlyHeadReceiver: false,
      enableResponsesOverwriting: true,
      enableCompetenceWeights: false,
    },
  });
  expect(settResp.ok(), "Сохранение настроек").toBe(true);
  console.log(
    "✅ Настройки: useOnlyHeadReceiver=false, enableCompetenceWeights=false",
  );

  // ── 4. Target users из API ──

  const { data: targetUsersData } = await adminAPI.getTargetUsers(PR_ID, {
    limit: 10,
    offset: 0,
  });
  const items = targetUsersData?.items || targetUsersData || [];
  TARGET_USERS = items.map((u) => ({
    userId: u.user?.id ?? u.userId,
    name: `${u.user?.firstName || ""} ${u.user?.lastName || ""}`.trim(),
  }));
  expect(
    TARGET_USERS.length,
    "Должны быть target users",
  ).toBeGreaterThanOrEqual(1);

  // ── 5. Warm-up + ожидание scores ──

  const targetUserIds = TARGET_USERS.map((u) => u.userId);
  await Promise.all([
    adminAPI.getStatisticsSummaryResults(PR_ID, {
      targetUsersIds: targetUserIds,
      revisionId: REVISION_ID,
    }),
    adminAPI.getUsersCompetenciesResults(PR_ID, {
      usersIds: targetUserIds,
      revisionId: REVISION_ID,
    }),
  ]);
  await new Promise((r) => setTimeout(r, 5000));

  await pollUntil(
    () => getResultsSnapshot(adminAPI, PR_ID, REVISION_ID, targetUserIds),
    (snap) => targetUserIds.some((uid) => snap.byUser[uid]?.score != null),
    { timeout: 60000, message: "Scores не появились после warm-up" },
  );
  console.log("✅ Warm-up завершён, scores доступны");
});

// ==================== ТЕСТЫ ====================

test.describe(
  "Калибровка — расчёт средних по группам компетенций",
  {
    tag: [
      "@api",
      "@calibration",
      "@critical",
      "@regression",
      "@performance-review",
    ],
  },
  () => {
    test.describe.configure({ mode: "serial" });

    test.beforeEach(() => {
      markAsAPITest(MODULES.CALIBRATION, "Расчёт средних по группам");
    });

    test(
      "C7094: Компетенция в группе не считается дважды при расчёте среднего",
      {
        tag: ["@critical"],
      },
      async ({ adminAPI }) => {
        test.setTimeout(60000);
        setSeverity("critical");

        const targetUserIds = TARGET_USERS.map((u) => u.userId);
        let snap;
        let verifiedCount = 0;

        await test.step("Получить snapshot результатов из heatMap", async () => {
          snap = await getResultsSnapshot(
            adminAPI,
            PR_ID,
            REVISION_ID,
            targetUserIds,
          );
          const usersWithScores = targetUserIds.filter(
            (uid) => snap.byUser[uid]?.score != null,
          );
          expect(
            usersWithScores.length,
            "Минимум 2 users должны иметь scores",
          ).toBeGreaterThanOrEqual(2);
        });

        await test.step("Проверить формулу для каждого target user: actual ≈ avg(group_avgs, standalone)", async () => {
          for (const uid of targetUserIds) {
            const userScores = snap.byUser[uid];
            if (userScores?.score == null) continue;

            const { correct, buggy, groupCount, standaloneCount, totalComps } =
              computeAverages(userScores.competences, snap.competenceMeta);

            if (correct == null) continue;

            console.log(`  User ${uid}:`);
            console.log(
              `    actual=${userScores.score?.toFixed(4)}, correct=${correct.toFixed(4)}, buggy=${buggy?.toFixed(4)}`,
            );
            console.log(
              `    groups=${groupCount}, standalone=${standaloneCount}, totalComps=${totalComps}`,
            );

            // КЛЮЧЕВОЙ ASSERT: actual ≈ correct формула
            expect(
              userScores.score,
              `User ${uid}: totalScore должен = avg(group_avgs, standalone_scores), got ${userScores.score?.toFixed(4)}, expected ~${correct.toFixed(4)}`,
            ).toBeCloseTo(correct, 1);

            // Если формулы различаются, actual должен быть БЛИЖЕ к correct, чем к buggy
            if (buggy != null && Math.abs(correct - buggy) > 0.005) {
              const deltaToCorrect = Math.abs(userScores.score - correct);
              const deltaToBuggy = Math.abs(userScores.score - buggy);
              expect(
                deltaToCorrect,
                `User ${uid}: score ближе к правильной формуле (Δcorrect=${deltaToCorrect.toFixed(4)}, Δbuggy=${deltaToBuggy.toFixed(4)})`,
              ).toBeLessThan(deltaToBuggy);
            }

            verifiedCount++;
          }
        });

        await test.step("Проверить количество верифицированных пользователей", async () => {
          expect(
            verifiedCount,
            `Минимум 2 из ${targetUserIds.length} users должны быть проверены`,
          ).toBeGreaterThanOrEqual(2);
        });
      },
    );

    test(
      "C7095: Group score из API совпадает со средним покомпетенционных оценок",
      {
        tag: ["@regression"],
      },
      async ({ adminAPI }) => {
        test.setTimeout(60000);
        setSeverity("normal");

        const targetUser = TARGET_USERS[0];
        const targetUserIds = [targetUser.userId];
        let compScores;
        let groupEntries;

        await test.step("Получить покомпетенционные оценки из heatMap", async () => {
          const snap = await getResultsSnapshot(
            adminAPI,
            PR_ID,
            REVISION_ID,
            targetUserIds,
          );
          compScores = snap.byUser[targetUser.userId]?.competences || {};
        });

        await test.step("Получить group scores из groups-for-revision API", async () => {
          groupEntries = await getGroupsForRevisionSnapshot(
            adminAPI,
            PR_ID,
            REVISION_ID,
            targetUser.userId,
          );
          console.log(`  Group entries: ${JSON.stringify(groupEntries)}`);
          expect(
            groupEntries.length,
            "Должна быть хотя бы 1 группа",
          ).toBeGreaterThanOrEqual(1);
        });

        await test.step("Проверить: group A score = avg(comp1, comp2)", async () => {
          const groupAEntry = groupEntries.find(
            (g) => g.competenceGroupId === GROUP_A_ID,
          );
          expect(
            groupAEntry,
            `Группа A (${GROUP_A_ID}) должна быть в ответе groups endpoint`,
          ).toBeDefined();

          const comp1Value =
            compScores[COMP_IDS.comp1Id]?.value ??
            compScores[String(COMP_IDS.comp1Id)]?.value;
          const comp2Value =
            compScores[COMP_IDS.comp2Id]?.value ??
            compScores[String(COMP_IDS.comp2Id)]?.value;

          expect(
            comp1Value,
            "comp1 score должен существовать",
          ).not.toBeUndefined();
          expect(
            comp2Value,
            "comp2 score должен существовать",
          ).not.toBeUndefined();

          const expectedGroupA = (comp1Value + comp2Value) / 2;
          console.log(
            `  Группа A: API=${groupAEntry.value}, computed=${expectedGroupA.toFixed(4)} (comp1=${comp1Value}, comp2=${comp2Value})`,
          );

          expect(
            groupAEntry.value,
            "Group A score должен = avg(comp1, comp2)",
          ).toBeCloseTo(expectedGroupA, 1);
        });
      },
    );

    test(
      "C7096: Переключение useOnlyHeadReceiver влияет на расчёт среднего",
      {
        tag: ["@regression"],
      },
      async ({ adminAPI }) => {
        test.setTimeout(120000);
        setSeverity("normal");

        const targetUserIds = TARGET_USERS.map((u) => u.userId);

        let scoresBefore;

        await test.step("Зафиксировать scores (useOnlyHeadReceiver=false)", async () => {
          const snap = await getResultsSnapshot(
            adminAPI,
            PR_ID,
            REVISION_ID,
            targetUserIds,
          );
          scoresBefore = {};
          for (const uid of targetUserIds) {
            scoresBefore[uid] = snap.byUser[uid]?.score;
          }
          console.log(
            "  Before (useOnlyHeadReceiver=false):",
            JSON.stringify(scoresBefore),
          );
        });

        await test.step("Переключить useOnlyHeadReceiver: true", async () => {
          await toggleSetting(adminAPI, PR_ID, "useOnlyHeadReceiver", true);
        });

        await test.step("Подождать пересчёт — scores должны измениться", async () => {
          const snap = await pollUntil(
            () =>
              getResultsSnapshot(adminAPI, PR_ID, REVISION_ID, targetUserIds),
            (s) =>
              targetUserIds.some((uid) => {
                const before = scoresBefore[uid];
                const current = s.byUser[uid]?.score;
                return (
                  before != null &&
                  current != null &&
                  Math.abs(current - before) > 0.001
                );
              }),
            {
              timeout: 60000,
              interval: 3000,
              message: "Scores не изменились после toggle useOnlyHeadReceiver",
            },
          );

          const scoresAfter = {};
          for (const uid of targetUserIds) {
            scoresAfter[uid] = snap.byUser[uid]?.score;
          }
          console.log(
            "  After (useOnlyHeadReceiver=true):",
            JSON.stringify(scoresAfter),
          );

          const anyDifferent = targetUserIds.some(
            (uid) =>
              scoresBefore[uid] != null &&
              scoresAfter[uid] != null &&
              Math.abs(scoresBefore[uid] - scoresAfter[uid]) > 0.001,
          );
          expect(
            anyDifferent,
            "Хотя бы один score должен отличаться при toggle useOnlyHeadReceiver",
          ).toBe(true);
        });

        await test.step("Вернуть useOnlyHeadReceiver: false (cleanup)", async () => {
          await toggleSetting(adminAPI, PR_ID, "useOnlyHeadReceiver", false);
        });
      },
    );

    test(
      "C7097: Калибровка сохраняет правильную формулу расчёта по группам",
      {
        tag: ["@critical"],
      },
      async ({ adminAPI }) => {
        test.setTimeout(120000);
        setSeverity("critical");

        // Калибровка требует useOnlyHeadReceiver: true
        await toggleSetting(adminAPI, PR_ID, "useOnlyHeadReceiver", true);
        await toggleSetting(
          adminAPI,
          PR_ID,
          "enableResponsesOverwriting",
          true,
        );

        // Ждём пересчёт c useOnlyHeadReceiver=true
        // Выбираем user с head (не control group)
        const targetUser =
          TARGET_USERS.find((u) => u.userId !== TARGET_USERS[0]?.userId) ||
          TARGET_USERS[0];
        const targetUserIds = [targetUser.userId];

        await pollUntil(
          () => getResultsSnapshot(adminAPI, PR_ID, REVISION_ID, targetUserIds),
          (snap) => snap.byUser[targetUser.userId]?.score != null,
          {
            timeout: 30000,
            message: "Scores не появились после toggle settings",
          },
        );

        let scoreBefore;

        await test.step("Проверить формулу ДО калибровки", async () => {
          const snap = await getResultsSnapshot(
            adminAPI,
            PR_ID,
            REVISION_ID,
            targetUserIds,
          );
          const userScores = snap.byUser[targetUser.userId];
          expect(
            userScores?.score,
            `Score для user ${targetUser.userId} должен быть доступен`,
          ).not.toBeNull();

          const { correct } = computeAverages(
            userScores.competences,
            snap.competenceMeta,
          );
          expect(correct, "Правильное среднее вычислимо").not.toBeNull();

          console.log(
            `  До калибровки: actual=${userScores.score?.toFixed(4)}, correct=${correct.toFixed(4)}`,
          );
          expect(userScores.score, "Формула до калибровки верна").toBeCloseTo(
            correct,
            1,
          );

          scoreBefore = userScores.score;
        });

        await test.step("Откалибровать comp1 (увеличить ответы)", async () => {
          const { data: overwriteData, response: owResp } =
            await adminAPI.getResponseOverwritesData(
              PR_ID,
              REVISION_ID,
              targetUser.userId,
            );

          expect(
            owResp.ok(),
            `getResponseOverwritesData для user ${targetUser.userId} должен быть доступен (status=${owResp.status()}). ` +
              `Проверь: калибровка включена (useOnlyHeadReceiver=true, enableResponsesOverwriting=true)?`,
          ).toBe(true);

          const rangeMin = overwriteData?.questions?.[0]?.rangeMin || 1;

          // Ставим rangeMin ТОЛЬКО для comp1 — гарантированное изменение
          const overwrites = (overwriteData?.responsesData || []).map((rd) => {
            const question = overwriteData?.questions?.find(
              (q) => q.id === rd.questionId,
            );
            const isComp1 = question?.competenceId === COMP_IDS.comp1Id;
            return {
              responseId: rd.responseId,
              questionId: rd.questionId,
              answer: isComp1 ? rangeMin : rd.numericAnswer,
            };
          });

          const { response } = await adminAPI.overwriteResponsesValues(
            PR_ID,
            REVISION_ID,
            targetUser.userId,
            { overwrites, isLocked: false },
          );
          expect(response.status(), "Калибровка comp1").toBe(201);
        });

        await test.step("После калибровки — формула всё ещё правильная", async () => {
          // Ждём пересчёт
          const snap = await pollUntil(
            () =>
              getResultsSnapshot(adminAPI, PR_ID, REVISION_ID, targetUserIds),
            (s) => {
              const current = s.byUser[targetUser.userId]?.score;
              return current != null && Math.abs(current - scoreBefore) > 0.001;
            },
            { timeout: 30000, message: "Score не изменился после калибровки" },
          );

          const userScores = snap.byUser[targetUser.userId];
          const { correct, buggy } = computeAverages(
            userScores.competences,
            snap.competenceMeta,
          );

          console.log(
            `  После калибровки: actual=${userScores.score?.toFixed(4)}, correct=${correct?.toFixed(4)}, buggy=${buggy?.toFixed(4)}`,
          );

          expect(
            userScores.score,
            "Формула после калибровки верна",
          ).toBeCloseTo(correct, 1);

          // Дополнительно: если формулы различаются — actual ближе к correct
          if (
            correct != null &&
            buggy != null &&
            Math.abs(correct - buggy) > 0.005
          ) {
            const deltaToCorrect = Math.abs(userScores.score - correct);
            const deltaToBuggy = Math.abs(userScores.score - buggy);
            expect(
              deltaToCorrect,
              `Score ближе к правильной формуле после калибровки`,
            ).toBeLessThan(deltaToBuggy);
          }
        });
      },
    );
  },
);
