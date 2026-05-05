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

/** Компания админа */
const ADMIN_COMPANY_ID = 999;

test.describe(
  "Распределение оценок — Архивные PR не учитываются",
  { tag: ["@api", "@my-team", "@regression"] },
  () => {
    /** PR ID, который будет архивирован в тесте (для cleanup) */
    let archivedPrId = null;
    /** ID seed-PR для cleanup */
    let seededPrId = null;

    test.beforeAll(async ({ request }) => {
      test.setTimeout(180_000);

      // Проверяем наличие данных: user с 2+ complete PR с mean_history
      const db = new DatabaseClient();
      let needsSeed = true;
      try {
        await db.connect();
        const rows = await db.query(
          `SELECT mh.target_user_id, COUNT(DISTINCT pr.id) AS pr_count
           FROM performance_review_user_competences_mean_history mh
           JOIN performance_review_revisions rev ON rev.id = mh.performance_review_revision_id
           JOIN performance_reviews pr ON pr.id = rev.performance_review_id
           JOIN users u ON u.id = mh.target_user_id
           WHERE pr.is_archived = 0 AND pr.deleted_at IS NULL AND pr.status = 'complete'
             AND mh.is_removed = 0 AND mh.value IS NOT NULL
             AND u.company_id = ?
             AND rev.date_start >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
           GROUP BY mh.target_user_id
           HAVING pr_count >= 2
           LIMIT 1`,
          [ADMIN_COMPANY_ID],
        );
        needsSeed = rows.length === 0;
      } finally {
        if (db.isConnected()) await db.disconnect();
      }

      if (needsSeed) {
        console.log("  [seed] Нет юзера с 2+ complete PR — создаём stopped PR...");
        const seed = new PerformanceReviewSeedHelper(request);
        await seed.init("admin");
        const pr = await seed.seedStoppedPR({ fillAssessments: true });
        seededPrId = pr.id;
        console.log(`  [seed] ✓ Создан stopped PR ${pr.id} (filledCount=${pr.filledCount})`);
      }
    });

    test.afterAll(async ({ request }) => {
      const api = new PerformanceReviewAPI(request);
      const { email, password } = getCredentials("admin");
      await api.signIn(email, password);

      // Cleanup: восстановить PR если он был архивирован
      if (archivedPrId) {
        try {
          const { response } = await api.restore(archivedPrId);
          console.log(
            `  [cleanup] Restore PR ${archivedPrId}: status=${response.status()}`,
          );
        } catch (err) {
          console.error(
            `  [cleanup] ОШИБКА restore PR ${archivedPrId}: ${err.message}`,
          );
        }
      }
    });

    test.beforeEach(() => {
      markAsAPITest(MODULES.MY_TEAM);
    });

    test(
      "C7242: Архивированный PR исключается из distribution-last-results — archive → проверка → restore",
      { tag: ["@api", "@critical"] },
      async ({ request }) => {
        setSeverity("critical");

        const dashboardApi = new DashboardTeamAPI(request);
        const prApi = new PerformanceReviewAPI(request);
        const { email, password } = getCredentials("admin");
        await dashboardApi.signIn(email, password);
        await prApi.signIn(email, password);

        let targetUserId;
        let latestPrId;
        let secondPrId;
        let beforeEntry;

        await test.step("Найти через DB сотрудника с 2+ complete PR и получить данные через API до архивации", async () => {
          const db = new DatabaseClient();
          try {
            await db.connect();

            const rows = await db.query(
              `SELECT
                 mh.target_user_id,
                 pr.id AS pr_id,
                 rev.date_start
               FROM performance_review_user_competences_mean_history mh
               JOIN performance_review_revisions rev ON rev.id = mh.performance_review_revision_id
               JOIN performance_reviews pr ON pr.id = rev.performance_review_id
               JOIN users u ON u.id = mh.target_user_id
               WHERE pr.is_archived = 0
                 AND pr.deleted_at IS NULL
                 AND pr.status = 'complete'
                 AND mh.is_removed = 0
                 AND mh.value IS NOT NULL
                 AND u.company_id = ${ADMIN_COMPANY_ID}
                 AND rev.date_start >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
               ORDER BY mh.target_user_id, rev.date_start DESC`,
            );

            // Группируем по target_user_id, находим первого с 2+ PR
            const byUser = new Map();
            for (const row of rows) {
              if (!byUser.has(row.target_user_id)) {
                byUser.set(row.target_user_id, []);
              }
              const prIds = byUser.get(row.target_user_id);
              if (!prIds.includes(row.pr_id)) {
                prIds.push(row.pr_id);
              }
            }

            for (const [userId, prIds] of byUser) {
              if (prIds.length >= 2) {
                targetUserId = userId;
                latestPrId = prIds[0];
                secondPrId = prIds[1];
                break;
              }
            }
          } finally {
            if (db.isConnected()) await db.disconnect();
          }

          expect(
            targetUserId,
            "DB: не найден сотрудник с 2+ complete PR с mean_history (company 538) — seed не сработал?",
          ).toBeTruthy();

          console.log(
            `  Сотрудник ${targetUserId}: последний PR=${latestPrId}, второй PR=${secondPrId}`,
          );

          // API ДО архивации: distribution-last-results возвращает PR
          const { data: beforeResults } =
            await dashboardApi.getDistributionLastResults([targetUserId]);
          beforeEntry = Object.values(beforeResults || {}).find(
            (r) => r.targetUserId === targetUserId,
          );

          expect(
            beforeEntry?.performanceReview?.id,
            `API до архивации: должен вернуть PR для user ${targetUserId}`,
          ).toBeTruthy();

          const beforePrId = beforeEntry.performanceReview.id;
          console.log(
            `  ДО архивации: API → PR ${beforePrId} "${beforeEntry.performanceReview.title}"`,
          );
        });

        await test.step("Архивировать последний PR сотрудника", async () => {
          // Запоминаем для cleanup
          archivedPrId = latestPrId;

          // ── 3. Архивируем последний PR ──
          console.log(`  Архивируем PR ${latestPrId}...`);
          const { response: archiveResp } = await prApi.archive(latestPrId);
          expect(
            archiveResp.ok(),
            `Archive PR ${latestPrId}: ожидался 2xx, получен ${archiveResp.status()}`,
          ).toBe(true);

          console.log(`  ✓ PR ${latestPrId} заархивирован`);
        });

        await test.step("Проверить через API что архивный PR исключён из результатов", async () => {
          // ── 4. API ПОСЛЕ архивации: distribution-last-results НЕ должен вернуть архивный PR ──
          const { data: afterResults } =
            await dashboardApi.getDistributionLastResults([targetUserId]);
          const afterEntry = Object.values(afterResults || {}).find(
            (r) => r.targetUserId === targetUserId,
          );

          if (afterEntry?.performanceReview?.id) {
            // API вернул PR — он должен быть НЕ архивным
            expect(
              afterEntry.performanceReview.id,
              `ПОСЛЕ архивации API вернул тот же PR ${latestPrId} — архивные PR должны исключаться!`,
            ).not.toBe(latestPrId);

            console.log(
              `  ПОСЛЕ архивации: API → PR ${afterEntry.performanceReview.id} "${afterEntry.performanceReview.title}" (не архивный) — ✓`,
            );
          } else {
            // API не вернул PR — тоже допустимо (если все PR этого юзера архивированы)
            console.log(
              `  ПОСЛЕ архивации: API → нет результата для user ${targetUserId} — ✓ (архивный PR исключён)`,
            );
          }
        });

        await test.step("Проверить через DB что PR действительно is_archived=1", async () => {
          // ── 5. DB-верификация: PR действительно is_archived = 1 ──
          const dbCheck = new DatabaseClient();
          try {
            await dbCheck.connect();
            const [prRow] = await dbCheck.query(
              "SELECT id, is_archived, status FROM performance_reviews WHERE id = ?",
              [latestPrId],
            );
            expect(
              prRow.is_archived,
              `PR ${latestPrId} должен быть is_archived=1`,
            ).toBe(1);
          } finally {
            if (dbCheck.isConnected()) await dbCheck.disconnect();
          }
        });

        await test.step("Восстановить PR и проверить что он снова появляется в API", async () => {
          // ── 6. Restore PR (в рамках теста, до afterAll) ──
          console.log(`  Восстанавливаем PR ${latestPrId}...`);
          const { response: restoreResp } = await prApi.restore(latestPrId);
          expect(
            restoreResp.ok(),
            `Restore PR ${latestPrId}: ожидался 2xx, получен ${restoreResp.status()}`,
          ).toBe(true);

          // ── 7. API ПОСЛЕ restore: PR снова возвращается ──
          const { data: restoredResults } =
            await dashboardApi.getDistributionLastResults([targetUserId]);
          const restoredEntry = Object.values(restoredResults || {}).find(
            (r) => r.targetUserId === targetUserId,
          );

          expect(
            restoredEntry?.performanceReview?.id,
            `ПОСЛЕ restore API должен снова вернуть PR для user ${targetUserId}`,
          ).toBeTruthy();

          console.log(
            `  ПОСЛЕ restore: API → PR ${restoredEntry.performanceReview.id} "${restoredEntry.performanceReview.title}" — ✓`,
          );

          // Cleanup отметка — PR уже восстановлен
          archivedPrId = null;
        });
      },
    );

    test(
      "C7197: Все PR из distribution-last-results имеют is_archived=0 в DB",
      { tag: ["@api", "@critical"] },
      async ({ request }) => {
        setSeverity("critical");

        const api = new DashboardTeamAPI(request);
        const { email, password } = getCredentials("admin");
        await api.signIn(email, password);

        const allPrIds = new Set();

        await test.step("Собрать PR из API для нескольких батчей сотрудников", async () => {
          // ── 1. Собираем PR из API для нескольких батчей сотрудников ──
          const batchSize = 100;

          for (let batch = 0; batch < 5; batch++) {
            const { data: usersData } = await api.getDistributionUsers({
              usersSubset: "all",
              limit: batchSize,
              offset: batch * batchSize,
            });

            if (!usersData?.items?.length) break;

            const userIds = usersData.items.map((u) => u.id);
            const { data: resultsData } =
              await api.getDistributionLastResults(userIds);

            for (const entry of Object.values(resultsData || {})) {
              if (entry.performanceReview?.id) {
                allPrIds.add(entry.performanceReview.id);
              }
            }
          }

          expect(
            allPrIds.size,
            "API должен вернуть хотя бы один PR",
          ).toBeGreaterThan(0);

          console.log(`  API: собрано ${allPrIds.size} уникальных PR ID`);
        });

        await test.step("Проверить через DB что все PR из API имеют is_archived=0", async () => {
          // ── 2. DB-проверка: каждый PR имеет is_archived = 0 ──
          const db = new DatabaseClient();
          try {
            await db.connect();
            const prIdArray = [...allPrIds];
            const placeholders = prIdArray.map(() => "?").join(", ");
            const prs = await db.query(
              `SELECT id, title, is_archived, status
               FROM performance_reviews
               WHERE id IN (${placeholders}) AND deleted_at IS NULL`,
              prIdArray,
            );

            for (const pr of prs) {
              expect(
                pr.is_archived,
                `PR ${pr.id} "${pr.title}" (status=${pr.status}) из API имеет is_archived=${pr.is_archived} — должен быть 0`,
              ).toBe(0);
            }

            // Все ID найдены
            const foundIds = new Set(prs.map((p) => p.id));
            for (const prId of prIdArray) {
              expect(
                foundIds.has(prId),
                `PR ${prId} из API отсутствует в DB`,
              ).toBe(true);
            }

            console.log(
              `  ✓ Все ${prs.length} PR из API имеют is_archived = 0`,
            );
          } finally {
            if (db.isConnected()) await db.disconnect();
          }
        });
      },
    );
  },
);
