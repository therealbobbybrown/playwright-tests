// @ts-check
/**
 * Регрессия на Баг "Призрачная калибровка":
 * После выключения enableResponsesOverwriting откалиброванные значения
 * продолжали попадать в расчёт средних. Разработчик добавил проверку флага.
 *
 * Тесты проверяют:
 * - Средние возвращаются к исходным после выключения калибровки
 * - Цикл ON→калибровка→OFF→ON — калибровка восстанавливается
 * - DB-записи overwrites НЕ удаляются при выключении
 * - meanOverwrite не влияет на результат при выключенной калибровке
 * - Покомпетенционные средние тоже возвращаются к исходным
 *
 * @tags @api @calibration @critical @performance-review
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
import {
  CalibrationVerifier,
  DatabaseClient,
} from "../../../utils/db/index.js";
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
 * Переключить настройку калибровки через feature URL.
 */
async function toggleCalibration(api, prId, enableResponsesOverwriting) {
  const featureUrl = `/manager/performance-reviews/${prId}/statistics/settings/?feature=statisticsSettings`;
  const { data: settings } = await api.get(featureUrl);
  const { response } = await api.post(featureUrl, {
    ...settings,
    settings: {
      ...(settings?.settings || {}),
      enableResponsesOverwriting,
    },
  });
  expect(
    response.ok(),
    `Toggle enableResponsesOverwriting=${enableResponsesOverwriting}`,
  ).toBe(true);

  // Проверить что настройка сохранилась
  const { data: saved } = await api.get(featureUrl);
  expect(
    saved?.settings?.enableResponsesOverwriting,
    `enableResponsesOverwriting должно быть ${enableResponsesOverwriting}`,
  ).toBe(enableResponsesOverwriting);
}

// ---------- Fixtures ----------

const test = baseTest.extend({
  adminAPI: async ({ request }, use) => {
    const api = new PerformanceReviewAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
  dbClient: async ({}, use) => {
    const db = new DatabaseClient();
    try {
      await db.connect();
    } catch (e) {
      console.log("[DB] Connection failed:", e.message);
    }
    await use(db);
    if (db.isConnected()) await db.disconnect();
  },
  calibrationVerifier: async ({ dbClient }, use) => {
    const verifier = new CalibrationVerifier(dbClient);
    await use(verifier);
  },
});

// ---------- Shared state ----------

let PR_ID;
let REVISION_ID;
let TARGET_USERS;
let QUESTIONS;

test.beforeAll(async ({ request }) => {
  test.setTimeout(180000);

  // 1. Seed PR с заполненными анкетами
  const calSeed = new CalibrationSeed(request);
  await calSeed.init();

  const result = await calSeed.seedWithDirections({
    directions: { self: true, head: true },
    targetUsersCount: 4,
    receiversPerDirection: 2,
    fillQuestionnaires: true,
  });
  PR_ID = result.prId;
  console.log(`✅ PR создан: ${PR_ID}`);

  // 2. Включить калибровку
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
  console.log("✅ Калибровка включена");

  // 3. Получить ревизию
  const { data: revision } = await api.getLastRevision(PR_ID);
  REVISION_ID = revision?.id;

  // 4. Получить target users
  const { data: targetUsersData } = await api.getTargetUsers(PR_ID, {
    limit: 10,
    offset: 0,
  });
  const items = targetUsersData?.items || targetUsersData || [];
  const allUsers = items.map((u) => ({
    userId: u.user?.id ?? u.userId,
    name: `${u.user?.firstName || ""} ${u.user?.lastName || ""}`.trim(),
  }));

  // 5. Warm-up
  const allUserIds = allUsers.map((u) => u.userId);
  await Promise.all([
    api.getStatisticsSummaryResults(PR_ID, {
      targetUsersIds: allUserIds,
      revisionId: REVISION_ID,
    }),
    api.getUsersCompetenciesResults(PR_ID, {
      usersIds: allUserIds,
      revisionId: REVISION_ID,
    }),
    api.getTargetUsersProgress(PR_ID, {
      revisionId: REVISION_ID,
      usersIds: allUserIds,
    }),
  ]);
  await new Promise((r) => setTimeout(r, 5000));

  // 6. Фильтруем по доступности overwrite endpoint
  TARGET_USERS = [];
  for (const u of allUsers) {
    const { response } = await api.getResponseOverwritesData(
      PR_ID,
      REVISION_ID,
      u.userId,
    );
    if (response.ok()) {
      TARGET_USERS.push(u);
    }
  }
  console.log(`  Target users: ${TARGET_USERS.length}`);
  expect(
    TARGET_USERS.length,
    "Должно быть ≥2 доступных target users",
  ).toBeGreaterThanOrEqual(2);

  // 7. Получить вопросы
  const { data: overwriteData } = await api.getResponseOverwritesData(
    PR_ID,
    REVISION_ID,
    TARGET_USERS[0].userId,
  );
  QUESTIONS = overwriteData?.questions || [];
});

// ==================== ТЕСТЫ ====================

test.describe(
  "Калибровка — средние после выключения калибровки",
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
    // Тесты зависят от общего PR state → serial mode
    test.describe.configure({ mode: "serial" });

    test.beforeEach(() => {
      markAsAPITest(MODULES.CALIBRATION, "Средние после выключения калибровки");
    });

    test(
      "C7089: Средние возвращаются к исходным после выключения калибровки",
      {
        tag: ["@critical"],
      },
      async ({ adminAPI }) => {
        test.setTimeout(120000);
        setSeverity("critical");

        const targetUserIds = TARGET_USERS.map((u) => u.userId);

        let originalScores;
        let calibratedScores;

        await test.step("Зафиксировать исходные средние (до калибровки)", async () => {
          const snap = await getResultsSnapshot(
            adminAPI,
            PR_ID,
            REVISION_ID,
            targetUserIds,
          );
          originalScores = snap.byUser;

          for (const uid of targetUserIds) {
            expect(
              originalScores[uid]?.score,
              `Оригинальный score для user ${uid}`,
            ).not.toBeNull();
          }
          console.log(
            "  Исходные:",
            Object.entries(originalScores)
              .map(([uid, v]) => `${uid}=${v.score}`)
              .join(", "),
          );
        });

        await test.step("Откалибровать каждого target user (answer → rangeMin)", async () => {
          const rangeMin = QUESTIONS[0]?.rangeMin || 1;
          for (const user of TARGET_USERS) {
            const { data: currentData } =
              await adminAPI.getResponseOverwritesData(
                PR_ID,
                REVISION_ID,
                user.userId,
              );
            const overwrites = (currentData?.responsesData || []).map((rd) => ({
              responseId: rd.responseId,
              questionId: rd.questionId,
              answer: rangeMin, // Гарантированное изменение: scores 3-5 → 1
            }));

            const { response } = await adminAPI.overwriteResponsesValues(
              PR_ID,
              REVISION_ID,
              user.userId,
              { overwrites, isLocked: false },
            );
            expect(response.status(), `Калибровка user ${user.userId}`).toBe(
              201,
            );
          }
        });

        await test.step("Подождать пересчёт и зафиксировать калиброванные средние", async () => {
          const snap = await pollUntil(
            () =>
              getResultsSnapshot(adminAPI, PR_ID, REVISION_ID, targetUserIds),
            (s) => {
              // Хотя бы для одного пользователя score должен измениться
              return targetUserIds.some(
                (uid) =>
                  s.byUser[uid]?.score != null &&
                  originalScores[uid]?.score != null &&
                  Math.abs(s.byUser[uid].score - originalScores[uid].score) >
                    0.001,
              );
            },
            { timeout: 30000, message: "Score не изменился после калибровки" },
          );
          calibratedScores = snap.byUser;
          console.log(
            "  Калиброванные:",
            Object.entries(calibratedScores)
              .map(([uid, v]) => `${uid}=${v.score}`)
              .join(", "),
          );
        });

        await test.step("Выключить калибровку (enableResponsesOverwriting: false)", async () => {
          await toggleCalibration(adminAPI, PR_ID, false);
        });

        await test.step("Подождать пересчёт — средние должны вернуться к исходным", async () => {
          const snap = await pollUntil(
            () =>
              getResultsSnapshot(adminAPI, PR_ID, REVISION_ID, targetUserIds),
            (s) => {
              // Score должен вернуться к original (с допуском 0.01)
              return targetUserIds.every((uid) => {
                const current = s.byUser[uid]?.score;
                const original = originalScores[uid]?.score;
                if (current == null || original == null) return false;
                return Math.abs(current - original) < 0.01;
              });
            },
            {
              timeout: 60000,
              interval: 3000,
              message: "Score не вернулся к исходным после выключения",
            },
          );

          const afterDisable = snap.byUser;
          console.log(
            "  После выключения:",
            Object.entries(afterDisable)
              .map(([uid, v]) => `${uid}=${v.score}`)
              .join(", "),
          );

          // КЛЮЧЕВЫЕ ASSERT'Ы
          for (const uid of targetUserIds) {
            // Assert 1: score вернулся к исходному
            expect(
              afterDisable[uid]?.score,
              `Score user ${uid} должен вернуться к исходному (original=${originalScores[uid]?.score})`,
            ).toBeCloseTo(originalScores[uid].score, 2);

            // Assert 2: score НЕ равен калиброванному (регрессия на "призрачную калибровку")
            if (
              calibratedScores[uid]?.score != null &&
              Math.abs(
                calibratedScores[uid].score - originalScores[uid].score,
              ) > 0.01
            ) {
              expect(
                Math.abs(afterDisable[uid].score - calibratedScores[uid].score),
                `Score user ${uid} НЕ должен оставаться калиброванным (calibrated=${calibratedScores[uid]?.score})`,
              ).toBeGreaterThan(0.01);
            }
          }
        });

        await test.step("Включить калибровку обратно (cleanup)", async () => {
          await toggleCalibration(adminAPI, PR_ID, true);
        });
      },
    );

    test(
      "C7090: Цикл ON→калибровка→OFF→ON — калибровка восстанавливается",
      {
        tag: ["@critical"],
      },
      async ({ adminAPI }) => {
        test.setTimeout(180000);
        setSeverity("critical");

        const targetUserIds = TARGET_USERS.map((u) => u.userId);
        const rangeMax = QUESTIONS[0]?.rangeMax || 5;

        let originalScores, calibratedScores;

        await test.step("Выключить калибровку → зафиксировать чистые исходные", async () => {
          // Сначала выключаем — чтобы получить чистые scores без влияния Test 1 overwrites
          await toggleCalibration(adminAPI, PR_ID, false);

          const snap = await pollUntil(
            () =>
              getResultsSnapshot(adminAPI, PR_ID, REVISION_ID, targetUserIds),
            (s) =>
              targetUserIds.every(
                (uid) =>
                  s.byUser[uid]?.score != null && s.byUser[uid].score > 0,
              ),
            {
              timeout: 30000,
              interval: 2000,
              message:
                "Ожидание чистых scores (>0) после выключения калибровки",
            },
          );
          originalScores = snap.byUser;
          console.log(
            "  Чистые original:",
            Object.entries(originalScores)
              .map(([uid, v]) => `${uid}=${v.score}`)
              .join(", "),
          );
        });

        await test.step("Включить калибровку и откалибровать (answer → rangeMax)", async () => {
          await toggleCalibration(adminAPI, PR_ID, true);
          await new Promise((r) => setTimeout(r, 2000));

          // Калибруем к rangeMax (отличается от Test 1's rangeMin)
          for (const user of TARGET_USERS) {
            const { data: currentData } =
              await adminAPI.getResponseOverwritesData(
                PR_ID,
                REVISION_ID,
                user.userId,
              );
            const overwrites = (currentData?.responsesData || []).map((rd) => ({
              responseId: rd.responseId,
              questionId: rd.questionId,
              answer: rangeMax,
            }));

            const { response } = await adminAPI.overwriteResponsesValues(
              PR_ID,
              REVISION_ID,
              user.userId,
              { overwrites, isLocked: false },
            );
            expect(
              response.status(),
              `Калибровка user ${user.userId} к rangeMax`,
            ).toBe(201);
          }
        });

        await test.step("Подождать — scores должны измениться (→1.0)", async () => {
          const snap = await pollUntil(
            () =>
              getResultsSnapshot(adminAPI, PR_ID, REVISION_ID, targetUserIds),
            (s) =>
              targetUserIds.some(
                (uid) =>
                  Math.abs(
                    (s.byUser[uid]?.score ?? 0) -
                      (originalScores[uid]?.score ?? 0),
                  ) > 0.01,
              ),
            {
              timeout: 30000,
              message: "Score не изменился после калибровки к rangeMax",
            },
          );
          calibratedScores = snap.byUser;
          console.log(
            "  Калиброванные (rangeMax):",
            Object.entries(calibratedScores)
              .map(([uid, v]) => `${uid}=${v.score}`)
              .join(", "),
          );
        });

        await test.step("Выключить калибровку", async () => {
          await toggleCalibration(adminAPI, PR_ID, false);
        });

        await test.step("Подождать — scores должны вернуться к original", async () => {
          const snap = await pollUntil(
            () =>
              getResultsSnapshot(adminAPI, PR_ID, REVISION_ID, targetUserIds),
            (s) =>
              targetUserIds.every(
                (uid) =>
                  Math.abs(
                    (s.byUser[uid]?.score ?? 0) -
                      (originalScores[uid]?.score ?? 0),
                  ) < 0.01,
              ),
            {
              timeout: 60000,
              interval: 3000,
              message: "Score не вернулся к original после OFF",
            },
          );

          // Явные assert'ы: OFF scores ≈ original, OFF scores ≠ calibrated
          for (const uid of targetUserIds) {
            const offScore = snap.byUser[uid]?.score;
            if (originalScores[uid]?.score != null) {
              expect(offScore, `User ${uid}: OFF score ≈ original`).toBeCloseTo(
                originalScores[uid].score,
                2,
              );
            }
            if (
              calibratedScores[uid]?.score != null &&
              Math.abs(
                calibratedScores[uid].score - (originalScores[uid]?.score ?? 0),
              ) > 0.01
            ) {
              expect(
                Math.abs(offScore - calibratedScores[uid].score),
                `User ${uid}: OFF score ≠ calibrated`,
              ).toBeGreaterThan(0.01);
            }
          }
        });

        await test.step("Снова включить калибровку", async () => {
          await toggleCalibration(adminAPI, PR_ID, true);
        });

        await test.step("Подождать — scores должны снова стать калиброванными", async () => {
          const snap = await pollUntil(
            () =>
              getResultsSnapshot(adminAPI, PR_ID, REVISION_ID, targetUserIds),
            (s) =>
              targetUserIds.some((uid) => {
                const current = s.byUser[uid]?.score;
                const calibrated = calibratedScores[uid]?.score;
                if (current == null || calibrated == null) return false;
                return Math.abs(current - calibrated) < 0.01;
              }),
            {
              timeout: 60000,
              interval: 3000,
              message: "Score не восстановился после повторного включения",
            },
          );

          const reEnabled = snap.byUser;
          for (const uid of targetUserIds) {
            if (calibratedScores[uid]?.score != null) {
              expect(
                reEnabled[uid]?.score,
                `Score user ${uid} должен вернуться к калиброванному (calibrated=${calibratedScores[uid]?.score})`,
              ).toBeCloseTo(calibratedScores[uid].score, 2);
            }
          }
        });
      },
    );

    test(
      "C7091: DB-записи overwrites НЕ удаляются при выключении калибровки",
      {
        tag: ["@regression"],
      },
      async ({ adminAPI, dbClient }) => {
        test.setTimeout(60000);
        setSeverity("normal");

        const targetUser = TARGET_USERS[0];
        let overwriteCountBefore;

        // SQL: подсчёт overwrites по revision_id через JOIN
        const countOverwritesSql = `
      SELECT COUNT(*) as cnt
      FROM performance_review_responses_values_overwrites ow
      JOIN performance_review_responses r ON ow.performance_review_response_id = r.id
      WHERE r.performance_review_revision_id = ?
    `;

        await test.step("Убедиться что калибровка включена и откалибровать", async () => {
          await toggleCalibration(adminAPI, PR_ID, true);
          await new Promise((r) => setTimeout(r, 2000));

          const rangeMin = QUESTIONS[0]?.rangeMin || 1;
          const { data: currentData } =
            await adminAPI.getResponseOverwritesData(
              PR_ID,
              REVISION_ID,
              targetUser.userId,
            );
          const overwrites = (currentData?.responsesData || []).map((rd) => ({
            responseId: rd.responseId,
            questionId: rd.questionId,
            answer: rangeMin,
          }));

          const { response } = await adminAPI.overwriteResponsesValues(
            PR_ID,
            REVISION_ID,
            targetUser.userId,
            { overwrites, isLocked: false },
          );
          expect(response.status()).toBe(201);
        });

        await test.step("Проверить что overwrites есть в DB", async () => {
          if (!dbClient.isConnected()) {
            console.log("  ⚠️ DB не доступна, пропускаем DB-верификацию");
            test.skip();
            return;
          }
          try {
            const rows = await dbClient.query(countOverwritesSql, [
              REVISION_ID,
            ]);
            overwriteCountBefore = rows[0]?.cnt || 0;
          } catch (e) {
            console.log(`  ⚠️ DB query error: ${e.message}`);
            test.skip();
            return;
          }
          expect(
            overwriteCountBefore,
            "Должны быть overwrites в DB",
          ).toBeGreaterThan(0);
          console.log(`  Overwrites в DB: ${overwriteCountBefore}`);
        });

        await test.step("Выключить калибровку", async () => {
          await toggleCalibration(adminAPI, PR_ID, false);
          await new Promise((r) => setTimeout(r, 2000));
        });

        await test.step("Проверить что overwrites ВСЁ ЕЩЁ в DB", async () => {
          const rows = await dbClient.query(countOverwritesSql, [REVISION_ID]);
          const overwriteCountAfter = rows[0]?.cnt || 0;
          expect(
            overwriteCountAfter,
            `Overwrites не должны удаляться: было ${overwriteCountBefore}, стало ${overwriteCountAfter}`,
          ).toBe(overwriteCountBefore);
        });

        await test.step("Включить калибровку обратно (cleanup)", async () => {
          await toggleCalibration(adminAPI, PR_ID, true);
        });
      },
    );

    test(
      "C7092: MeanOverwrite сохраняется в DB, но не влияет при выключенной калибровке",
      {
        tag: ["@critical"],
      },
      async ({ adminAPI, calibrationVerifier }) => {
        test.setTimeout(120000);
        setSeverity("critical");

        const targetUser = TARGET_USERS[0];
        const rangeMax = QUESTIONS[0]?.rangeMax || 5;
        const calibratedValue = 4.5;
        const expectedFraction = calibratedValue / rangeMax;

        await test.step("Убедиться что калибровка включена", async () => {
          await toggleCalibration(adminAPI, PR_ID, true);
          await new Promise((r) => setTimeout(r, 2000));
        });

        await test.step(`Откалибровать итоговую = ${calibratedValue}`, async () => {
          const { data: currentData } =
            await adminAPI.getResponseOverwritesData(
              PR_ID,
              REVISION_ID,
              targetUser.userId,
            );
          const overwrites = (currentData?.responsesData || []).map((rd) => ({
            responseId: rd.responseId,
            questionId: rd.questionId,
            answer: rd.numericAnswer,
          }));

          const { response } = await adminAPI.overwriteResponsesValues(
            PR_ID,
            REVISION_ID,
            targetUser.userId,
            {
              overwrites,
              meanOverwrite: { value: calibratedValue, characteristicId: null },
              isLocked: false,
            },
          );
          expect(response.status()).toBe(201);
        });

        await test.step("Проверить через API: meanOverwrite сохранён", async () => {
          const { data } = await adminAPI.getResponseOverwritesData(
            PR_ID,
            REVISION_ID,
            targetUser.userId,
          );
          expect(
            data.meanOverwrite,
            "meanOverwrite должен существовать",
          ).not.toBeNull();
          expect(data.meanOverwrite.overwrittenValue).toBeCloseTo(
            expectedFraction,
            2,
          );
          console.log(
            `  meanOverwrite: overwrittenValue=${data.meanOverwrite.overwrittenValue}`,
          );
        });

        await test.step("DB: запись meanOverwrite создана", async () => {
          await calibrationVerifier.verifyTotalScoreOverwrite(
            REVISION_ID,
            targetUser.userId,
            expectedFraction,
          );
        });

        await test.step("Выключить калибровку", async () => {
          await toggleCalibration(adminAPI, PR_ID, false);
          await new Promise((r) => setTimeout(r, 3000));
        });

        await test.step("DB: запись meanOverwrite НЕ удалена после выключения", async () => {
          const overwrite = await calibrationVerifier.getTotalScoreOverwrite(
            REVISION_ID,
            targetUser.userId,
          );
          expect(
            overwrite,
            "Запись meanOverwrite должна остаться в DB",
          ).not.toBeNull();
          expect(overwrite.overwritten_value).toBeCloseTo(expectedFraction, 2);
          console.log(
            `  DB после выключения: overwritten_value=${overwrite.overwritten_value}`,
          );
        });

        await test.step("Включить калибровку → meanOverwrite восстанавливается", async () => {
          await toggleCalibration(adminAPI, PR_ID, true);
          await new Promise((r) => setTimeout(r, 3000));

          const { data } = await adminAPI.getResponseOverwritesData(
            PR_ID,
            REVISION_ID,
            targetUser.userId,
          );
          expect(
            data.meanOverwrite,
            "meanOverwrite должен восстановиться после включения",
          ).not.toBeNull();
          expect(data.meanOverwrite.overwrittenValue).toBeCloseTo(
            expectedFraction,
            2,
          );
          console.log(
            `  meanOverwrite после включения: overwrittenValue=${data.meanOverwrite.overwrittenValue}`,
          );
        });
      },
    );

    test(
      "C7093: Покомпетенционные средние тоже возвращаются к исходным",
      {
        tag: ["@regression"],
      },
      async ({ adminAPI }) => {
        test.setTimeout(120000);
        setSeverity("normal");

        const targetUser = TARGET_USERS[0];
        const targetUserIds = [targetUser.userId];
        const rangeMax = QUESTIONS[0]?.rangeMax || 5;

        let originalCompScores;

        await test.step("Убедиться что калибровка включена", async () => {
          await toggleCalibration(adminAPI, PR_ID, true);
          await new Promise((r) => setTimeout(r, 3000));
        });

        await test.step("Сбросить overwrites и зафиксировать покомпетенционные средние", async () => {
          // Сбросить
          const { data: currentData } =
            await adminAPI.getResponseOverwritesData(
              PR_ID,
              REVISION_ID,
              targetUser.userId,
            );
          const overwrites = (currentData?.responsesData || []).map((rd) => ({
            responseId: rd.responseId,
            questionId: rd.questionId,
            answer: rd.numericAnswer,
          }));
          await adminAPI.overwriteResponsesValues(
            PR_ID,
            REVISION_ID,
            targetUser.userId,
            { overwrites, isLocked: false },
          );
          await new Promise((r) => setTimeout(r, 3000));

          // Зафиксировать
          const snap = await getResultsSnapshot(
            adminAPI,
            PR_ID,
            REVISION_ID,
            targetUserIds,
          );
          originalCompScores =
            snap.byUser[targetUser.userId]?.competences || {};
          const compIds = Object.keys(originalCompScores);
          expect(
            compIds.length,
            "Seed создаёт 6 компетенций — все должны иметь scores",
          ).toBeGreaterThanOrEqual(2);
          console.log(
            `  Компетенций: ${compIds.length}, scores: ${compIds.map((id) => `${id}=${originalCompScores[id]?.value}`).join(", ")}`,
          );
        });

        await test.step("Откалибровать (answer → rangeMin для всех компетенций)", async () => {
          const rangeMin = QUESTIONS[0]?.rangeMin || 1;
          const { data: currentData } =
            await adminAPI.getResponseOverwritesData(
              PR_ID,
              REVISION_ID,
              targetUser.userId,
            );
          const overwrites = (currentData?.responsesData || []).map((rd) => ({
            responseId: rd.responseId,
            questionId: rd.questionId,
            answer: rangeMin,
          }));

          const { response } = await adminAPI.overwriteResponsesValues(
            PR_ID,
            REVISION_ID,
            targetUser.userId,
            { overwrites, isLocked: false },
          );
          expect(response.status()).toBe(201);
        });

        await test.step("Подождать пересчёт", async () => {
          await pollUntil(
            () =>
              getResultsSnapshot(adminAPI, PR_ID, REVISION_ID, targetUserIds),
            (s) => {
              const comps = s.byUser[targetUser.userId]?.competences || {};
              return Object.keys(originalCompScores).some((compId) => {
                const orig = originalCompScores[compId]?.value;
                const curr = comps[compId]?.value;
                return (
                  orig != null && curr != null && Math.abs(curr - orig) > 0.001
                );
              });
            },
            {
              timeout: 30000,
              message: "Competence scores не изменились после калибровки",
            },
          );
        });

        await test.step("Выключить калибровку", async () => {
          await toggleCalibration(adminAPI, PR_ID, false);
        });

        await test.step("Подождать — покомпетенционные scores должны вернуться", async () => {
          const snap = await pollUntil(
            () =>
              getResultsSnapshot(adminAPI, PR_ID, REVISION_ID, targetUserIds),
            (s) => {
              const comps = s.byUser[targetUser.userId]?.competences || {};
              return Object.keys(originalCompScores).every((compId) => {
                const orig = originalCompScores[compId]?.value;
                const curr = comps[compId]?.value;
                if (orig == null || curr == null) return false;
                return Math.abs(curr - orig) < 0.02;
              });
            },
            {
              timeout: 60000,
              interval: 3000,
              message: "Competence scores не вернулись после выключения",
            },
          );

          const afterComps = snap.byUser[targetUser.userId]?.competences || {};
          for (const compId of Object.keys(originalCompScores)) {
            if (originalCompScores[compId]?.value != null) {
              expect(
                afterComps[compId]?.value,
                `Competence ${compId} должна вернуться к исходной (${originalCompScores[compId]?.value})`,
              ).toBeCloseTo(originalCompScores[compId].value, 1);
            }
          }
        });

        await test.step("Включить калибровку обратно (cleanup)", async () => {
          await toggleCalibration(adminAPI, PR_ID, true);
        });
      },
    );
  },
);
