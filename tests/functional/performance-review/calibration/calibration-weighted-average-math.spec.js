// @ts-check
/**
 * Математическая верификация формулы взвешенного среднего.
 *
 * Существующие тесты проверяют что веса сумма=100% и оценки "в диапазоне",
 * но НИКОГДА не проверяют что finalScore = Σ(groupScore × weight%) / Σ(weight%).
 *
 * Тесты проверяют:
 * - Итоговая оценка = взвешенное среднее групп по формуле
 * - Изменение весов → пересчёт итоговой по новой формуле
 *
 * @tags @api @calibration @performance-review
 * @module Calibration
 */
import { test as baseTest, expect } from "@playwright/test";
import {
  PerformanceReviewAPI,
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
 * Получить веса групп из settings API.
 * @returns {Array<{groupId: number, title: string, weight: number, enabled: boolean}>}
 */
async function getGroupWeights(api, prId) {
  const { data } = await api.getStatisticsSettings(prId);
  const groupSettings = data?.competenceGroupSettings || [];
  return groupSettings.map((gs) => ({
    groupId: gs.competenceGroupId,
    title: gs.competenceGroup?.title || `ID ${gs.competenceGroupId}`,
    weight: gs.weightPercent || 0,
    enabled: !!gs.competenceGroupEnabled,
  }));
}

/**
 * Вычислить взвешенное среднее из group scores и весов.
 * formula: Σ(groupScore × weight) / Σ(weights)
 *
 * @param {Array<{competenceGroupId: number, value: number}>} groupScores
 * @param {Array<{groupId: number, weight: number, enabled: boolean}>} weights
 * @returns {{expected: number|null, weightSum: number, components: Array}}
 */
function computeWeightedAverage(groupScores, weights) {
  const enabledWeights = weights.filter((w) => w.enabled);
  const components = [];
  let weightedSum = 0;
  let weightSum = 0;

  for (const w of enabledWeights) {
    const groupScore = groupScores.find(
      (gs) => gs.competenceGroupId === w.groupId,
    );
    if (groupScore == null || groupScore.value == null) continue;

    const contribution = groupScore.value * w.weight;
    weightedSum += contribution;
    weightSum += w.weight;
    components.push({
      groupId: w.groupId,
      title: w.title,
      score: groupScore.value,
      weight: w.weight,
      contribution,
    });
  }

  const expected = weightSum > 0 ? weightedSum / weightSum : null;
  return { expected, weightSum, components };
}

/**
 * Изменить веса групп через feature URL.
 * @param {Object} api - PerformanceReviewAPI
 * @param {string|number} prId - ID PR
 * @param {Object} newWeights - {groupId: weight%} — новые веса для указанных групп
 */
async function changeGroupWeights(api, prId, newWeights) {
  const featureUrl = `/manager/performance-reviews/${prId}/statistics/settings/?feature=statisticsSettings`;
  const { data: settings } = await api.get(featureUrl);

  const updatedGroupSettings = (settings?.competenceGroupSettings || []).map(
    (gs) => ({
      ...gs,
      weightPercent: newWeights[gs.competenceGroupId] ?? gs.weightPercent,
    }),
  );

  const { response } = await api.post(featureUrl, {
    ...settings,
    competenceGroupSettings: updatedGroupSettings,
  });
  expect(response.ok(), "Изменение весов групп").toBe(true);
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
let TARGET_USERS;

test.beforeAll(async ({ request }) => {
  test.setTimeout(180000);

  // 1. Seed PR с 6 компетенциями в 2 группах (стандартный CalibrationSeed)
  const calSeed = new CalibrationSeed(request);
  await calSeed.init();

  const result = await calSeed.seedWithDirections({
    directions: { self: true, head: true },
    targetUsersCount: 3,
    receiversPerDirection: 2,
    fillQuestionnaires: true,
  });
  PR_ID = result.prId;
  console.log(`✅ PR создан: ${PR_ID}`);

  // 2. Включить взвешенные компетенции + калибровку
  const api = new PerformanceReviewAPI(request);
  const { email, password } = getCredentials("admin");
  await api.signIn(email, password);

  const featureUrl = `/manager/performance-reviews/${PR_ID}/statistics/settings/?feature=statisticsSettings`;
  const { data: settings } = await api.get(featureUrl);
  await api.post(featureUrl, {
    ...settings,
    settings: {
      ...(settings?.settings || {}),
      useOnlyHeadReceiver: true,
      enableResponsesOverwriting: true,
      enableCompetenceWeights: true,
    },
  });
  console.log("✅ Настройки: enableCompetenceWeights=true");

  // 3. Получить ревизию
  const { data: revision } = await api.getLastRevision(PR_ID);
  REVISION_ID = revision?.id;

  // 4. Target users
  const { data: targetUsersData } = await api.getTargetUsers(PR_ID, {
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

  // 5. Warm-up
  const targetUserIds = TARGET_USERS.map((u) => u.userId);
  await Promise.all([
    api.getStatisticsSummaryResults(PR_ID, {
      targetUsersIds: targetUserIds,
      revisionId: REVISION_ID,
    }),
    api.getUsersCompetenciesResults(PR_ID, {
      usersIds: targetUserIds,
      revisionId: REVISION_ID,
    }),
  ]);
  await new Promise((r) => setTimeout(r, 5000));

  await pollUntil(
    () => getResultsSnapshot(api, PR_ID, REVISION_ID, targetUserIds),
    (snap) => targetUserIds.some((uid) => snap.byUser[uid]?.score != null),
    { timeout: 60000, message: "Scores не появились после warm-up" },
  );
  console.log("✅ Warm-up завершён, scores доступны");
});

// ==================== ТЕСТЫ ====================

test.describe(
  "Калибровка — математическая верификация взвешенного среднего",
  {
    tag: ["@api", "@calibration", "@regression", "@performance-review"],
  },
  () => {
    test.describe.configure({ mode: "serial" });

    test.beforeEach(() => {
      markAsAPITest(MODULES.CALIBRATION, "Взвешенное среднее");
    });

    test(
      "C7098: Итоговая оценка = взвешенное среднее групп по формуле",
      {
        tag: ["@critical"],
      },
      async ({ adminAPI }) => {
        test.setTimeout(60000);
        setSeverity("critical");

        const targetUser = TARGET_USERS[0];
        const targetUserIds = [targetUser.userId];
        let actualScore;
        let groupScores;
        let weights;

        await test.step("Получить итоговый score из heatMap", async () => {
          const snap = await getResultsSnapshot(
            adminAPI,
            PR_ID,
            REVISION_ID,
            targetUserIds,
          );
          actualScore = snap.byUser[targetUser.userId]?.score;
          expect(
            actualScore,
            "Итоговый score должен существовать",
          ).not.toBeNull();
        });

        await test.step("Получить group scores из API", async () => {
          groupScores = await getGroupsForRevisionSnapshot(
            adminAPI,
            PR_ID,
            REVISION_ID,
            targetUser.userId,
          );
          expect(
            groupScores.length,
            "Seed создаёт 2 группы — должны быть group scores для обеих",
          ).toBeGreaterThanOrEqual(2);
          console.log(`  Group scores: ${JSON.stringify(groupScores)}`);
        });

        await test.step("Получить веса групп из настроек", async () => {
          weights = await getGroupWeights(adminAPI, PR_ID);
          const enabledWeights = weights.filter((w) => w.enabled);
          expect(
            enabledWeights.length,
            "Должны быть минимум 2 включённые группы с весами",
          ).toBeGreaterThanOrEqual(2);

          console.log("  Веса групп:");
          for (const w of enabledWeights) {
            console.log(`    ${w.title}: ${w.weight}%`);
          }
        });

        await test.step("Проверить формулу: actual ≈ Σ(groupScore × weight) / Σweight", async () => {
          const { expected, weightSum, components } = computeWeightedAverage(
            groupScores,
            weights,
          );
          expect(
            expected,
            "Ожидаемое взвешенное среднее должно быть вычислимо",
          ).not.toBeNull();

          console.log("  Компоненты формулы:");
          for (const c of components) {
            console.log(
              `    ${c.title}: score=${c.score?.toFixed(4)} × weight=${c.weight}% = ${c.contribution.toFixed(4)}`,
            );
          }
          console.log(`  Σ весов: ${weightSum}%`);
          console.log(`  Actual: ${actualScore.toFixed(4)}`);
          console.log(
            `  Expected (Σ(score×weight)/Σweight): ${expected.toFixed(4)}`,
          );

          // КЛЮЧЕВОЙ ASSERT
          expect(
            actualScore,
            `Итоговая оценка = Σ(groupScore × weight) / Σweight: actual=${actualScore.toFixed(4)}, expected=${expected.toFixed(4)}`,
          ).toBeCloseTo(expected, 1);
        });
      },
    );

    test(
      "C7099: Формула верифицируется для нескольких пользователей",
      {
        tag: ["@regression"],
      },
      async ({ adminAPI }) => {
        test.setTimeout(60000);
        setSeverity("normal");

        const targetUserIds = TARGET_USERS.map((u) => u.userId);
        let snap;
        let weights;
        let verifiedCount = 0;

        await test.step("Получить snapshot всех пользователей и веса групп", async () => {
          snap = await getResultsSnapshot(
            adminAPI,
            PR_ID,
            REVISION_ID,
            targetUserIds,
          );
          weights = await getGroupWeights(adminAPI, PR_ID);
          const usersWithScores = targetUserIds.filter(
            (uid) => snap.byUser[uid]?.score != null,
          );
          expect(
            usersWithScores.length,
            "Минимум 2 users должны иметь scores",
          ).toBeGreaterThanOrEqual(2);
        });

        await test.step("Проверить формулу взвешенного среднего для каждого target user", async () => {
          for (const uid of targetUserIds) {
            const actualScore = snap.byUser[uid]?.score;
            if (actualScore == null) continue;

            const groupScores = await getGroupsForRevisionSnapshot(
              adminAPI,
              PR_ID,
              REVISION_ID,
              uid,
            );
            if (groupScores.length === 0) continue;

            const { expected, components } = computeWeightedAverage(
              groupScores,
              weights,
            );
            if (expected == null) continue;

            console.log(
              `  User ${uid}: actual=${actualScore.toFixed(4)}, expected=${expected.toFixed(4)}, groups=${components.length}`,
            );

            expect(actualScore, `User ${uid}: формула верна`).toBeCloseTo(
              expected,
              1,
            );

            verifiedCount++;
          }
        });

        await test.step("Проверить количество верифицированных пользователей", async () => {
          expect(
            verifiedCount,
            `Формула проверена минимум для 2 из ${targetUserIds.length} пользователей`,
          ).toBeGreaterThanOrEqual(2);
        });
      },
    );

    test(
      "C7100: Изменение весов → итоговая оценка пересчитывается по новой формуле",
      {
        tag: ["@critical"],
      },
      async ({ adminAPI }) => {
        test.setTimeout(120000);
        setSeverity("critical");

        const targetUser = TARGET_USERS[0];
        const targetUserIds = [targetUser.userId];

        let scoreBefore;
        let weightsBefore;

        await test.step("Зафиксировать текущий score и веса", async () => {
          const snap = await getResultsSnapshot(
            adminAPI,
            PR_ID,
            REVISION_ID,
            targetUserIds,
          );
          scoreBefore = snap.byUser[targetUser.userId]?.score;
          expect(scoreBefore, "Score до изменения весов").not.toBeNull();

          weightsBefore = await getGroupWeights(adminAPI, PR_ID);
          const enabled = weightsBefore.filter((w) => w.enabled);
          expect(enabled.length, "Минимум 2 группы").toBeGreaterThanOrEqual(2);

          console.log(`  Текущий score: ${scoreBefore?.toFixed(4)}`);
          console.log(
            `  Текущие веса: ${enabled.map((w) => `${w.title}=${w.weight}%`).join(", ")}`,
          );
        });

        await test.step("Изменить веса групп (70%/30%)", async () => {
          const enabled = weightsBefore.filter((w) => w.enabled);
          // Первая группа: 70%, вторая: 30%
          const newWeights = {};
          enabled.forEach((w, i) => {
            newWeights[w.groupId] = i === 0 ? 70 : 30;
          });

          await changeGroupWeights(adminAPI, PR_ID, newWeights);

          // Verify
          const updatedWeights = await getGroupWeights(adminAPI, PR_ID);
          const updatedEnabled = updatedWeights.filter((w) => w.enabled);
          console.log(
            `  Новые веса: ${updatedEnabled.map((w) => `${w.title}=${w.weight}%`).join(", ")}`,
          );
        });

        await test.step("Подождать пересчёт — score должен измениться", async () => {
          const snap = await pollUntil(
            () =>
              getResultsSnapshot(adminAPI, PR_ID, REVISION_ID, targetUserIds),
            (s) => {
              const current = s.byUser[targetUser.userId]?.score;
              return current != null && Math.abs(current - scoreBefore) > 0.001;
            },
            {
              timeout: 60000,
              interval: 3000,
              message: "Score не изменился после смены весов",
            },
          );

          const scoreAfter = snap.byUser[targetUser.userId]?.score;
          console.log(
            `  Score после: ${scoreAfter?.toFixed(4)} (был ${scoreBefore?.toFixed(4)})`,
          );

          expect(
            scoreAfter,
            "Score должен измениться при изменении весов",
          ).not.toBeCloseTo(scoreBefore, 2);
        });

        await test.step("Проверить формулу с новыми весами", async () => {
          const snapAfter = await getResultsSnapshot(
            adminAPI,
            PR_ID,
            REVISION_ID,
            targetUserIds,
          );
          const scoreAfter = snapAfter.byUser[targetUser.userId]?.score;

          const groupScores = await getGroupsForRevisionSnapshot(
            adminAPI,
            PR_ID,
            REVISION_ID,
            targetUser.userId,
          );
          const newWeights = await getGroupWeights(adminAPI, PR_ID);
          const { expected, components } = computeWeightedAverage(
            groupScores,
            newWeights,
          );

          console.log("  Формула с новыми весами:");
          for (const c of components) {
            console.log(
              `    ${c.title}: ${c.score?.toFixed(4)} × ${c.weight}% = ${c.contribution.toFixed(4)}`,
            );
          }
          console.log(
            `  Actual: ${scoreAfter?.toFixed(4)}, Expected: ${expected?.toFixed(4)}`,
          );

          expect(
            scoreAfter,
            "Score соответствует формуле с новыми весами",
          ).toBeCloseTo(expected, 1);
        });

        await test.step("Вернуть исходные веса (cleanup)", async () => {
          const restoreWeights = {};
          for (const w of weightsBefore.filter((w) => w.enabled)) {
            restoreWeights[w.groupId] = w.weight;
          }
          await changeGroupWeights(adminAPI, PR_ID, restoreWeights);
        });
      },
    );
  },
);
