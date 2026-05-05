import { test, expect } from "../../../fixtures/auth.js";
import { DashboardTeamAPI } from "../../../utils/api/DashboardTeamAPI.js";
import { PerformanceReviewAPI } from "../../../utils/api/PerformanceReviewAPI.js";
import { PerformanceReviewSeedHelper } from "../../../utils/seed/PerformanceReviewSeedHelper.js";
import { DatabaseClient } from "../../../utils/db/DatabaseClient.js";
import { getCredentials } from "../../../utils/credentials.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";

test.describe(
  "Распределение оценок — Кейс Фёдорова: PR без собранных результатов",
  { tag: ["@api", "@my-team", "@regression"] },
  () => {
    test.beforeAll(async ({ request }) => {
      test.setTimeout(300_000);

      // Проверяем, есть ли уже подходящие данные: сотрудник с PR с результатами
      // И PR без результатов. Если нет — создаём активный PR (без остановки,
      // т.е. без mean_history) чтобы гарантировать наличие PR без результатов.
      const db = new DatabaseClient();
      let needsSeed = false;

      try {
        await db.connect();

        // Ищем сотрудника, участвующего в 2+ PR за 6 месяцев,
        // где в одном PR есть mean_history, а в другом — нет
        const candidates = await db.query(
          `SELECT mh.target_user_id
           FROM performance_review_user_competences_mean_history mh
           JOIN performance_review_revisions rev ON rev.id = mh.performance_review_revision_id
           JOIN performance_reviews pr ON pr.id = rev.performance_review_id
           WHERE pr.deleted_at IS NULL
             AND pr.is_archived = 0
             AND pr.status = 'complete'
             AND mh.is_removed = 0
             AND mh.value IS NOT NULL
             AND rev.date_start >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
           LIMIT 5`,
        );

        if (candidates.length === 0) {
          // Нет ни одного сотрудника с mean_history — нужен полный seed
          console.log("  [beforeAll] Нет сотрудников с mean_history — создаём stopped PR...");
          const seed = new PerformanceReviewSeedHelper(request);
          await seed.init("admin");
          await seed.seedStoppedPR({ fillAssessments: true });
          console.log("  [beforeAll] Stopped PR создан (mean_history появится)");
        }

        // Теперь проверяем наличие PR БЕЗ mean_history для этих сотрудников
        const withBoth = await db.query(
          `SELECT DISTINCT mh.target_user_id
           FROM performance_review_user_competences_mean_history mh
           JOIN performance_review_revisions rev ON rev.id = mh.performance_review_revision_id
           JOIN performance_reviews pr ON pr.id = rev.performance_review_id
           JOIN performance_review_revisions_users ru
             ON ru.target_user_id = mh.target_user_id
           JOIN performance_review_revisions rev2 ON rev2.id = ru.performance_review_revision_id
           JOIN performance_reviews pr2 ON pr2.id = rev2.performance_review_id
           LEFT JOIN performance_review_user_competences_mean_history mh2
             ON mh2.target_user_id = ru.target_user_id
             AND mh2.performance_review_revision_id = rev2.id
             AND mh2.is_removed = 0
           WHERE pr.deleted_at IS NULL
             AND pr.is_archived = 0
             AND pr.status = 'complete'
             AND mh.is_removed = 0
             AND mh.value IS NOT NULL
             AND rev.date_start >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
             AND pr2.deleted_at IS NULL
             AND pr2.is_archived = 0
             AND pr2.status IN ('active', 'complete')
             AND rev2.date_start >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
             AND ru.is_removed = 0
             AND mh2.performance_review_revision_id IS NULL
           LIMIT 1`,
        );

        if (withBoth.length === 0) {
          needsSeed = true;
          console.log("  [beforeAll] Нет сотрудника с PR без mean_history — нужен seed активного PR");
        }
      } finally {
        if (db.isConnected()) await db.disconnect();
      }

      if (needsSeed) {
        // Создаём активный PR (НЕ останавливаем) — он не будет иметь mean_history
        const seed = new PerformanceReviewSeedHelper(request);
        await seed.init("admin");
        const pr = await seed.seedActivePR({ fillAssessments: true });
        console.log(`  [beforeAll] Создан активный PR ${pr.id} (без mean_history, filledCount=${pr.filledCount})`);
      }
    });

    test.beforeEach(() => {
      markAsAPITest(MODULES.MY_TEAM);
    });

    test(
      "C7198: API пропускает PR без собранного результата и возвращает предыдущий",
      { tag: ["@api", "@critical"] },
      async ({ request }) => {
        setSeverity("critical");

        const dashboardApi = new DashboardTeamAPI(request);
        const { email, password } = getCredentials("admin");
        await dashboardApi.signIn(email, password);

        let targetUserId;
        let prWithResults;
        let prWithoutResults;
        let returnedPrId;

        await test.step("Найти в БД сотрудника с PR, где есть результаты, и PR без результатов", async () => {
          // ── 1. DB: найти сотрудника, участвующего в 2+ PR за последние 6 месяцев ──
          //    где в одном PR есть mean_history (результаты собраны),
          //    а в другом (более позднем) PR — результаты НЕ собраны
          const db = new DatabaseClient();

          try {
            await db.connect();

            // Шаг A: Найти всех сотрудников с mean_history в complete PRs
            const usersWithResults = await db.query(
              `SELECT DISTINCT
                 mh.target_user_id,
                 pr.id AS pr_id,
                 pr.title AS pr_title,
                 rev.date_start,
                 rev.id AS revision_id
               FROM performance_review_user_competences_mean_history mh
               JOIN performance_review_revisions rev ON rev.id = mh.performance_review_revision_id
               JOIN performance_reviews pr ON pr.id = rev.performance_review_id
               WHERE pr.deleted_at IS NULL
                 AND pr.is_archived = 0
                 AND pr.status = 'complete'
                 AND mh.is_removed = 0
                 AND mh.value IS NOT NULL
                 AND rev.date_start >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
               ORDER BY mh.target_user_id, rev.date_start DESC`,
            );

            // Шаг B: Найти сотрудников в active/recent PRs, где у них НЕТ mean_history
            //        (результаты не собраны)
            const usersWithoutResults = await db.query(
              `SELECT DISTINCT
                 ru.target_user_id,
                 pr.id AS pr_id,
                 pr.title AS pr_title,
                 pr.status,
                 rev.date_start,
                 rev.id AS revision_id
               FROM performance_review_revisions_users ru
               JOIN performance_review_revisions rev ON rev.id = ru.performance_review_revision_id
               JOIN performance_reviews pr ON pr.id = rev.performance_review_id
               LEFT JOIN performance_review_user_competences_mean_history mh
                 ON mh.target_user_id = ru.target_user_id
                 AND mh.performance_review_revision_id = rev.id
                 AND mh.is_removed = 0
               WHERE pr.deleted_at IS NULL
                 AND pr.is_archived = 0
                 AND pr.status IN ('active', 'complete')
                 AND rev.date_start >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
                 AND ru.target_user_id IS NOT NULL
                 AND ru.is_removed = 0
                 AND mh.performance_review_revision_id IS NULL
               ORDER BY rev.date_start DESC`,
            );

            // Шаг C: Найти пересечение — сотрудник с обоими случаями
            const usersWithResultsMap = new Map();
            for (const row of usersWithResults) {
              if (!usersWithResultsMap.has(row.target_user_id)) {
                usersWithResultsMap.set(row.target_user_id, []);
              }
              usersWithResultsMap.get(row.target_user_id).push({
                prId: row.pr_id,
                prTitle: row.pr_title,
                dateStart: row.date_start,
                revisionId: row.revision_id,
              });
            }

            // Ищем сотрудника, который есть в обоих списках
            for (const row of usersWithoutResults) {
              if (usersWithResultsMap.has(row.target_user_id)) {
                // Найден! У этого сотрудника есть PR с результатами И PR без результатов
                targetUserId = row.target_user_id;

                // PR без результатов (текущий row)
                prWithoutResults = {
                  prId: row.pr_id,
                  prTitle: row.pr_title,
                  status: row.status,
                  dateStart: row.date_start,
                  revisionId: row.revision_id,
                };

                // PR с результатами — берём последний (самый новый) из available
                const prHistory = usersWithResultsMap.get(targetUserId);
                prWithResults = prHistory[0];

                break;
              }
            }
          } finally {
            if (db.isConnected()) await db.disconnect();
          }

          // beforeAll гарантирует наличие данных — если не найден, это ошибка seed
          if (!targetUserId || !prWithResults || !prWithoutResults) {
            throw new Error(
              "Не найден сотрудник с PR с результатами (mean_history) и другим PR без результатов. " +
              "beforeAll должен был создать seed-данные — проверьте логи seed.",
            );
          }

          console.log(
            `  Найден сотрудник ${targetUserId}:`,
            `\n    PR с результатами:    ${prWithResults.prId} "${prWithResults.prTitle}" (date_start=${new Date(prWithResults.dateStart).toISOString().split("T")[0]})`,
            `\n    PR без результатов:   ${prWithoutResults.prId} "${prWithoutResults.prTitle}" (status=${prWithoutResults.status}, date_start=${new Date(prWithoutResults.dateStart).toISOString().split("T")[0]})`,
          );
        });

        await test.step("Проверить, что API возвращает PR с результатами, а не PR без результатов", async () => {
          if (!targetUserId) return; // test was skipped in previous step

          // ── 2. API: вызвать distribution-last-results для этого сотрудника ──
          const { data: resultsData } =
            await dashboardApi.getDistributionLastResults([targetUserId]);

          const entry = Object.values(resultsData || {}).find(
            (r) => r.targetUserId === targetUserId,
          );

          // ── 3. ОЖИДАНИЕ: API должен вернуть PR с результатами, а НЕ PR без результатов ──
          expect(
            entry?.performanceReview?.id,
            `API должен вернуть PR для user ${targetUserId}`,
          ).toBeTruthy();

          returnedPrId = entry.performanceReview.id;
          console.log(
            `  API distribution-last-results → PR ${returnedPrId} "${entry.performanceReview.title}"`,
          );

          // CRITICAL: API не должен вернуть PR без результатов
          expect(
            returnedPrId,
            `API вернул PR ${returnedPrId} — это PR БЕЗ результатов (${prWithoutResults.prId}). API должен был пропустить его и вернуть PR с результатами!`,
          ).not.toBe(prWithoutResults.prId);

          console.log(
            `  ✓ API НЕ вернул PR без результатов (${prWithoutResults.prId}) — пропустил его корректно`,
          );
        });

        await test.step("Верифицировать через БД наличие mean_history у возвращённого PR и отсутствие у PR без результатов", async () => {
          if (!returnedPrId) return; // test was skipped in previous step

          // ── 4. DB-верификация: вернутый PR действительно имеет mean_history для target_user_id ──
          const dbVerify = new DatabaseClient();
          try {
            await dbVerify.connect();
            const meanHistoryRows = await dbVerify.query(
              `SELECT
                 mh.performance_review_id,
                 mh.performance_review_revision_id,
                 mh.target_user_id,
                 mh.value,
                 mh.is_removed,
                 rev.date_start
               FROM performance_review_user_competences_mean_history mh
               JOIN performance_review_revisions rev ON rev.id = mh.performance_review_revision_id
               WHERE rev.performance_review_id = ?
                 AND mh.target_user_id = ?
                 AND mh.is_removed = 0
                 AND mh.value IS NOT NULL`,
              [returnedPrId, targetUserId],
            );

            expect(
              meanHistoryRows.length,
              `КРИТИЧЕСКИЙ БАГ: PR ${returnedPrId} из API НЕ имеет mean_history для user ${targetUserId}!\n` +
                `API должен возвращать только PR с собранными результатами (mean_history).`,
            ).toBeGreaterThan(0);

            console.log(
              `  ✓ DB: PR ${returnedPrId} имеет ${meanHistoryRows.length} mean_history записей для user ${targetUserId}`,
              `\n    date_start = ${meanHistoryRows[0].date_start}`,
            );
          } finally {
            if (dbVerify.isConnected()) await dbVerify.disconnect();
          }

          // ── 5. Проверка что PR БЕЗ результатов действительно НЕ имеет mean_history ──
          const dbVerify2 = new DatabaseClient();
          try {
            await dbVerify2.connect();
            const noMeanHistory = await dbVerify2.query(
              `SELECT mh.performance_review_id, mh.target_user_id
               FROM performance_review_user_competences_mean_history mh
               JOIN performance_review_revisions rev ON rev.id = mh.performance_review_revision_id
               WHERE rev.performance_review_id = ?
                 AND mh.target_user_id = ?
                 AND mh.is_removed = 0`,
              [prWithoutResults.prId, targetUserId],
            );

            expect(
              noMeanHistory.length,
              `PR ${prWithoutResults.prId} НЕ должен иметь mean_history для user ${targetUserId} (это тестовое условие)`,
            ).toBe(0);

            console.log(
              `  ✓ DB: PR ${prWithoutResults.prId} не имеет mean_history для user ${targetUserId} (ожидаемо)`,
            );
          } finally {
            if (dbVerify2.isConnected()) await dbVerify2.disconnect();
          }

          console.log(
            `\n  ✅ ТЕСТ ПРОЙДЕН: API корректно пропускает PR без результатов и возвращает PR с результатами`,
          );
        });
      },
    );

    test(
      "C7199: Когда API возвращает revisionMean с оценкой, она подтверждается mean_history в БД",
      { tag: ["@api", "@critical"] },
      async ({ request }) => {
        setSeverity("critical");
        test.setTimeout(120_000);

        const api = new DashboardTeamAPI(request);
        const { email, password } = getCredentials("admin");
        await api.signIn(email, password);

        await test.step("Включить калибровку на distribution PR через ensureCalibration", async () => {
          const { ensureCalibrationOnDistributionPR } = await import(
            "../../../utils/helpers/ensureCalibration.js"
          );
          const result = await ensureCalibrationOnDistributionPR(request);
          console.log(
            `  ensureCalibration: prId=${result.prId}, enabled=${result.enabled}`,
          );
        });

        await test.step("Получить distribution данные из API и сверить revisionMean с DB", async () => {
          // ── 1. Получить distribution users из API ──
          const { data: usersData } = await api.getDistributionUsers({
            usersSubset: "all",
            limit: 100,
          });
          const users = usersData?.items || [];
          expect(users.length, "Должны быть сотрудники в distribution").toBeGreaterThan(0);

          const userIds = users.map((u) => u.id);
          const { data: resultsData } =
            await api.getDistributionLastResults(userIds);

          const entries = Object.values(resultsData || {});
          expect(entries.length, "API должен вернуть данные").toBeGreaterThan(0);

          // ── 2. Проверка: каждый entry с revisionMean.value → mean_history в DB ──
          let pairsWithScore = 0;
          let pairsWithoutScore = 0;
          const failedPairs = [];

          const db = new DatabaseClient();
          try {
            await db.connect();

            for (const entry of entries) {
              if (!entry.performanceReview?.id) continue;

              if (entry.revisionMean?.value != null) {
                pairsWithScore++;

                const rows = await db.query(
                  `SELECT COUNT(*) AS cnt
                   FROM performance_review_user_competences_mean_history mh
                   JOIN performance_review_revisions rev ON rev.id = mh.performance_review_revision_id
                   WHERE rev.performance_review_id = ?
                     AND mh.target_user_id = ?
                     AND mh.is_removed = 0
                     AND mh.value IS NOT NULL`,
                  [entry.performanceReview.id, entry.targetUserId],
                );

                if (!rows[0]?.cnt || rows[0].cnt === 0) {
                  failedPairs.push({
                    userId: entry.targetUserId,
                    prId: entry.performanceReview.id,
                    prTitle: entry.performanceReview.title,
                    value: entry.revisionMean.value,
                  });
                }
              } else {
                pairsWithoutScore++;
              }
            }
          } finally {
            if (db.isConnected()) await db.disconnect();
          }

          console.log(
            `  API: ${entries.length} entries, ${pairsWithScore} с оценкой, ${pairsWithoutScore} без оценки`,
          );

          expect(
            pairsWithScore,
            "Должна быть хотя бы 1 пара с revisionMean.value — калибровка должна быть включена и данные mean_history должны существовать",
          ).toBeGreaterThan(0);

          if (failedPairs.length > 0) {
            const details = failedPairs
              .map(
                (p) =>
                  `  - user ${p.userId} → PR ${p.prId} "${p.prTitle}" (value=${p.value})`,
              )
              .join("\n");
            console.error(`\n  ❌ Пары без mean_history:\n${details}`);
          }

          expect(
            failedPairs.length,
            `${failedPairs.length} пар с revisionMean.value не имеют mean_history в БД`,
          ).toBe(0);

          console.log(
            `\n  ✅ Все ${pairsWithScore} пар с revisionMean.value подтверждены mean_history в БД`,
          );
        });
      },
    );
  },
);
