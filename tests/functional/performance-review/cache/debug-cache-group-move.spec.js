/**
 * Диагностический скрипт: проверяет ВСЕ endpoints после перемещения компетенции между группами.
 *
 * Цель: найти, какой именно endpoint/кэш НЕ инвалидируется при перемещении.
 *
 * Проверяемые endpoints:
 *   1. summary-results/get           — heatMap (competenceMeta[].groupId)
 *   2. .../groups                     — группы компетенций для ревизии
 *   3. .../of-revision/{revId}        — статистика по компетенциям
 *   4. .../of-user/{uid}/of-revision  — статистика для конкретного пользователя
 *   5. .../users-competencies-results — агрегированные результаты
 *
 * Проверяемые DB-таблицы:
 *   - performance_review_user_competence_groups_history
 *   - performance_review_user_competences_history
 *   - performance_review_user_competences_mean_history_meta (invalidate)
 *
 * Использование:
 *   npx.cmd playwright test scripts/debug-cache-group-move.js --project=regression
 */

import { test as base, expect } from "../../../fixtures/full.js";
import { CompetenciesAPI, getCredentials } from "../../../utils/api/index.js";
import { CalibrationVerifier } from "../../../utils/db/verifiers/CalibrationVerifier.js";

const test = base.extend({
  competenciesAPI: async ({ request }, use) => {
    const api = new CompetenciesAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
  calibrationVerifier: async ({ db }, use) => {
    await use(new CalibrationVerifier(db));
  },
});

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Вызвать все 5 endpoints и собрать результаты в один объект.
 */
async function collectAllEndpoints(
  prAPI,
  prId,
  revisionId,
  targetUserId,
  targetUsersIds,
) {
  const results = {};

  // 1. summary-results/get
  try {
    const { data, response } = await prAPI.getStatisticsSummaryResults(prId, {
      targetUsersIds,
      revisionId,
    });
    results.summaryResults = {
      status: response.status(),
      competenceMeta: (data?.competences || []).map((c) => ({
        id: c.id,
        title: c.title,
        groupId: c.groupId,
      })),
      userScore:
        data?.heatMapResults?.targetUsers?.[targetUserId]?.avrCompetencesCommon,
      userCompetences:
        data?.heatMapResults?.targetUsers?.[targetUserId]?.competences,
    };
  } catch (e) {
    results.summaryResults = { error: e.message };
  }

  // 2. groups for revision (requires usersIds + actualize)
  try {
    const { data, response } = await prAPI.getCompetenceGroupsForRevision(
      prId,
      revisionId,
      { usersIds: [targetUserId], actualize: false },
    );
    const groups = Array.isArray(data)
      ? data
      : data?.items || data?.groups || [];
    results.groupsForRevision = {
      status: response.status(),
      groups: groups.map((g) => ({
        id: g.id,
        title: g.title,
        competenceIds: (g.competences || []).map((c) => c.id ?? c),
      })),
      raw: JSON.stringify(data).slice(0, 3000),
    };
  } catch (e) {
    results.groupsForRevision = { error: e.message };
  }

  // 3. competence statistics for revision (requires usersIds + actualize)
  try {
    const { data, response } = await prAPI.getCompetenceStatisticsForRevision(
      prId,
      revisionId,
      { usersIds: [targetUserId], actualize: false },
    );
    const items = Array.isArray(data) ? data : data?.items || [];
    results.compStatsForRevision = {
      status: response.status(),
      items: items.slice(0, 20).map((c) => ({
        id: c.id ?? c.competenceId,
        groupId: c.groupId ?? c.competenceGroupId ?? c.group_id,
        title: c.title,
        value: c.value,
      })),
      raw: JSON.stringify(data).slice(0, 3000),
    };
  } catch (e) {
    results.compStatsForRevision = { error: e.message };
  }

  // 4. competence statistics for user (GET, query params)
  try {
    const { data, response } = await prAPI.getCompetenceStatisticsForUser(
      targetUserId,
      revisionId,
      {},
    );
    // This endpoint returns user-level aggregate, structure may vary
    results.compStatsForUser = {
      status: response.status(),
      raw: JSON.stringify(data).slice(0, 3000),
    };
  } catch (e) {
    results.compStatsForUser = { error: e.message };
  }

  // 5. users-competencies-results (requires revisionId in payload)
  try {
    const { data, response } = await prAPI.getUsersCompetenciesResults(prId, {
      targetUsersIds,
      revisionId,
    });
    results.usersCompResults = {
      status: response.status(),
      raw: JSON.stringify(data).slice(0, 3000),
    };
  } catch (e) {
    results.usersCompResults = { error: e.message };
  }

  return results;
}

/**
 * Собрать данные из DB-кэш таблиц.
 */
async function collectDBCache(db, prId, revisionId, targetUserId) {
  const results = {};

  try {
    // groups_history — кэш по группам
    const groupsHistory = await db.query(
      `SELECT competence_group_id, value, is_removed
       FROM performance_review_user_competence_groups_history
       WHERE performance_review_revision_id = ? AND target_user_id = ?`,
      [revisionId, targetUserId],
    );
    results.groupsHistory = groupsHistory;
  } catch (e) {
    results.groupsHistory = { error: e.message };
  }

  try {
    // competences_history — кэш по компетенциям
    const compHistory = await db.query(
      `SELECT competence_id, value, is_removed
       FROM performance_review_user_competences_history
       WHERE performance_review_revision_id = ? AND target_user_id = ?`,
      [revisionId, targetUserId],
    );
    results.compHistory = compHistory;
  } catch (e) {
    results.compHistory = { error: e.message };
  }

  try {
    // meta — текущий invalidate status
    const meta = await db.query(
      `SELECT invalidate, invalidate_buffer, is_processing, last_update_time
       FROM performance_review_user_competences_mean_history_meta
       WHERE company_id = 1`,
    );
    results.meanMeta = meta?.[0] || null;
  } catch (e) {
    results.meanMeta = { error: e.message };
  }

  return results;
}

test.describe(
  "Диагностика: кэш при перемещении компетенции между группами",
  { tag: ["@api", "@performance-review", "@regression"] },
  () => {
    test.setTimeout(180_000);

    test("C7088: Проверка всех endpoints до/после перемещения компетенции", async ({
      prAPI,
      prSeed,
      competenciesAPI,
      db,
    }) => {
      const { seedHelper } = prSeed;
      let tempGroupId = null;
      let competenceId = null;
      let originalGroupId = null;

      try {
        let prId;
        let revisionId;
        let targetUserId;
        let targetUsersIds;
        let scores;
        let before;
        let dbBefore;
        let afterImmediate;
        let dbAfterImmediate;
        let after5s;
        let dbAfter5s;
        let after15s;
        let dbAfter15s;

        await test.step("Подготовить PR с заполненными анкетами и дождаться scores", async () => {
          // ═══════════════════════════════════════════════════════════════
          // 1. SETUP: Seed PR + заполнить анкеты
          // ═══════════════════════════════════════════════════════════════
          console.log("\n═══ SETUP ═══");
          const pr = await seedHelper.seedActivePR({ fillAssessments: true });
          prId = pr.id;
          revisionId = pr.revisionId;
          targetUserId = pr.targetUserId;
          console.log(
            `PR: ${prId}, Revision: ${revisionId}, Target: ${targetUserId}`,
          );

          // Собрать targetUsersIds
          const { data: tuData } = await prAPI.getTargetUsers(prId, {});
          const tuItems = Array.isArray(tuData) ? tuData : tuData?.items || [];
          targetUsersIds = tuItems
            .slice(0, 3)
            .map((u) => u.user?.id ?? u.userId ?? u.id);
          if (!targetUsersIds.includes(targetUserId))
            targetUsersIds.unshift(targetUserId);
          console.log(`TargetUsers: ${JSON.stringify(targetUsersIds)}`);

          // Дождаться появления scores
          for (let i = 0; i < 10; i++) {
            const { data } = await prAPI.getStatisticsSummaryResults(prId, {
              targetUsersIds,
              revisionId,
            });
            const userEntry = data?.heatMapResults?.targetUsers?.[targetUserId];
            if (userEntry?.avrCompetencesCommon?.value != null) {
              scores = data;
              break;
            }
            await sleep(2000);
          }
          expect(scores, "scores should appear after populate").toBeTruthy();

          // Выбрать компетенцию для перемещения
          const competences = scores?.competences || [];
          expect(competences.length, "должны быть компетенции").toBeGreaterThan(
            0,
          );
          competenceId = competences[0].id;
          originalGroupId = competences[0].groupId;
          console.log(
            `Компетенция: ${competenceId} (${competences[0].title}), group: ${originalGroupId}`,
          );
        });

        await test.step("Собрать снимок всех endpoints и DB-кэша до перемещения", async () => {
          // ═══════════════════════════════════════════════════════════════
          // 2. SNAPSHOT ДО перемещения — все 5 endpoints + DB
          // ═══════════════════════════════════════════════════════════════
          console.log("\n═══ SNAPSHOT ДО ПЕРЕМЕЩЕНИЯ ═══");
          before = await collectAllEndpoints(
            prAPI,
            prId,
            revisionId,
            targetUserId,
            targetUsersIds,
          );
          dbBefore = await collectDBCache(db, prId, revisionId, targetUserId);

          console.log(
            "1. summary-results competenceMeta groupIds:",
            JSON.stringify(
              before.summaryResults.competenceMeta?.map(
                (c) => `${c.id}→g${c.groupId}`,
              ),
            ),
          );
          console.log(
            "2. groups for revision status:",
            before.groupsForRevision.status,
          );
          console.log(
            "2. groups for revision RAW:",
            before.groupsForRevision.raw,
          );
          console.log(
            "3. comp stats for revision status:",
            before.compStatsForRevision.status,
          );
          console.log(
            "3. comp stats for revision RAW:",
            before.compStatsForRevision.raw,
          );
          console.log(
            "4. comp stats for user status:",
            before.compStatsForUser.status,
          );
          console.log(
            "4. comp stats for user RAW:",
            before.compStatsForUser.raw,
          );
          console.log(
            "5. users-comp-results status:",
            before.usersCompResults.status,
          );
          console.log(
            "5. users-comp-results RAW:",
            before.usersCompResults.raw,
          );
          console.log(
            "DB groups_history:",
            JSON.stringify(dbBefore.groupsHistory),
          );
          console.log("DB mean_meta:", JSON.stringify(dbBefore.meanMeta));
        });

        await test.step("Создать новую группу и переместить компетенцию", async () => {
          // ═══════════════════════════════════════════════════════════════
          // 3. ДЕЙСТВИЕ: создать группу + переместить компетенцию
          // ═══════════════════════════════════════════════════════════════
          console.log("\n═══ ПЕРЕМЕЩЕНИЕ КОМПЕТЕНЦИИ ═══");
          const { data: newGroup, response: createResp } =
            await competenciesAPI.createCompetenceGroup(`DiagCacheGroup_${Date.now()}`);
          expect(createResp.ok()).toBeTruthy();
          tempGroupId = newGroup?.id ?? newGroup;
          console.log(`Новая группа: ${tempGroupId}`);

          const { response: moveResp } = await competenciesAPI.updateCompetency(
            competenceId,
            { groupId: tempGroupId },
          );
          expect(moveResp.ok()).toBeTruthy();

          // Верификация перемещения через API компетенций
          const { data: compAfter } =
            await competenciesAPI.getCompetency(competenceId);
          expect(compAfter.groupId).toBe(tempGroupId);
          console.log(
            `Компетенция ${competenceId} перемещена: group ${originalGroupId} → ${tempGroupId}`,
          );

          // ═══════════════════════════════════════════════════════════════
          // 3.5 DB SNAPSHOT СРАЗУ ПОСЛЕ MOVE, ДО ВЫЗОВА API endpoints
          // (чтобы понять: кэш обновляет move или API-вызов)
          // ═══════════════════════════════════════════════════════════════
          console.log("\n═══ DB SNAPSHOT СРАЗУ ПОСЛЕ MOVE (до API) ═══");
          const dbAfterMove = await collectDBCache(
            db,
            prId,
            revisionId,
            targetUserId,
          );
          const newGroupInDBAfterMove = dbAfterMove.groupsHistory?.some?.(
            (g) => g.competence_group_id === tempGroupId,
          );
          console.log(
            "DB groups_history:",
            JSON.stringify(dbAfterMove.groupsHistory),
          );
          console.log("DB mean_meta:", JSON.stringify(dbAfterMove.meanMeta));
          console.log(
            `Новая группа ${tempGroupId} в DB groups_history? ${newGroupInDBAfterMove ? "✅ ДА (move обновил кэш)" : "❌ НЕТ (кэш не обновлён move)"}`,
          );
          console.log(
            `DB mean_meta.invalidate: ${dbAfterMove.meanMeta?.invalidate}`,
          );
        });

        await test.step("Собрать снимки endpoints сразу после перемещения (0с и 5с)", async () => {
          // ═══════════════════════════════════════════════════════════════
          // 4. СРАЗУ ПОСЛЕ — snapshot (кэш ещё может быть стардый)
          // ═══════════════════════════════════════════════════════════════
          console.log("\n═══ SNAPSHOT СРАЗУ ПОСЛЕ (0с) ═══");
          afterImmediate = await collectAllEndpoints(
            prAPI,
            prId,
            revisionId,
            targetUserId,
            targetUsersIds,
          );
          dbAfterImmediate = await collectDBCache(
            db,
            prId,
            revisionId,
            targetUserId,
          );

          const immGroupId = afterImmediate.summaryResults.competenceMeta?.find(
            (c) => c.id === competenceId,
          )?.groupId;
          console.log(
            `1. summary-results: comp ${competenceId} groupId = ${immGroupId} (ожидаем ${tempGroupId})`,
          );
          console.log(
            `   ${immGroupId === tempGroupId ? "✅ FRESH" : "❌ STALE"}`,
          );

          console.log(
            "2. groups for revision status:",
            afterImmediate.groupsForRevision.status,
          );
          console.log(
            "2. groups for revision RAW:",
            afterImmediate.groupsForRevision.raw,
          );

          console.log(
            "3. comp stats for revision status:",
            afterImmediate.compStatsForRevision.status,
          );
          console.log(
            "3. comp stats for revision RAW:",
            afterImmediate.compStatsForRevision.raw,
          );
          const immCompStatGroup =
            afterImmediate.compStatsForRevision.items?.find(
              (c) => (c.id ?? c.competenceId) === competenceId,
            );
          console.log(
            `3. comp ${competenceId} groupId = ${immCompStatGroup?.groupId} (ожидаем ${tempGroupId})`,
          );
          console.log(
            `   ${immCompStatGroup?.groupId === tempGroupId ? "✅ FRESH" : "❌ STALE"}`,
          );

          console.log(
            "4. comp stats for user status:",
            afterImmediate.compStatsForUser.status,
          );
          console.log(
            "4. comp stats for user RAW:",
            afterImmediate.compStatsForUser.raw,
          );

          console.log(
            "5. users-comp-results status:",
            afterImmediate.usersCompResults.status,
          );
          console.log(
            "5. users-comp-results RAW:",
            afterImmediate.usersCompResults.raw,
          );
          console.log(
            "DB groups_history:",
            JSON.stringify(dbAfterImmediate.groupsHistory),
          );
          console.log(
            "DB mean_meta invalidate:",
            dbAfterImmediate.meanMeta?.invalidate,
          );

          // ═══════════════════════════════════════════════════════════════
          // 5. ЧЕРЕЗ 5с — snapshot (кэш должен обновиться)
          // ═══════════════════════════════════════════════════════════════
          console.log("\n═══ SNAPSHOT ЧЕРЕЗ 5с ═══");
          await sleep(5000);
          after5s = await collectAllEndpoints(
            prAPI,
            prId,
            revisionId,
            targetUserId,
            targetUsersIds,
          );
          dbAfter5s = await collectDBCache(db, prId, revisionId, targetUserId);

          const g5sId = after5s.summaryResults.competenceMeta?.find(
            (c) => c.id === competenceId,
          )?.groupId;
          console.log(
            `1. summary-results: comp ${competenceId} groupId = ${g5sId} (ожидаем ${tempGroupId})`,
          );
          console.log(`   ${g5sId === tempGroupId ? "✅ FRESH" : "❌ STALE"}`);

          console.log(
            "2. groups for revision status:",
            after5s.groupsForRevision.status,
          );
          console.log(
            "2. groups for revision RAW:",
            after5s.groupsForRevision.raw,
          );
          const newGroupInResponse = after5s.groupsForRevision.groups?.find(
            (g) => g.id === tempGroupId,
          );
          const oldGroupInResponse = after5s.groupsForRevision.groups?.find(
            (g) => g.id === originalGroupId,
          );
          if (after5s.groupsForRevision.groups?.length > 0) {
            console.log(
              `   Новая группа ${tempGroupId} содержит comp ${competenceId}? ${newGroupInResponse?.competenceIds?.includes(competenceId) ? "✅ YES" : "❌ NO"}`,
            );
            console.log(
              `   Старая группа ${originalGroupId} содержит comp ${competenceId}? ${oldGroupInResponse?.competenceIds?.includes(competenceId) ? "❌ STALE" : "✅ REMOVED"}`,
            );
          }

          console.log(
            "3. comp stats for revision status:",
            after5s.compStatsForRevision.status,
          );
          console.log(
            "3. comp stats for revision RAW:",
            after5s.compStatsForRevision.raw,
          );

          console.log(
            "4. comp stats for user RAW:",
            after5s.compStatsForUser.raw,
          );

          console.log(
            "5. users-comp-results status:",
            after5s.usersCompResults.status,
          );
          console.log(
            "5. users-comp-results RAW:",
            after5s.usersCompResults.raw,
          );

          console.log(
            "DB groups_history:",
            JSON.stringify(dbAfter5s.groupsHistory),
          );
          console.log(
            "DB mean_meta invalidate:",
            dbAfter5s.meanMeta?.invalidate,
          );
        });

        await test.step("Собрать финальный снимок через 15с и проверить инвалидацию кэша", async () => {
          // ═══════════════════════════════════════════════════════════════
          // 6. ЧЕРЕЗ 15с — финальный snapshot
          // ═══════════════════════════════════════════════════════════════
          console.log("\n═══ SNAPSHOT ЧЕРЕЗ 15с ═══");
          await sleep(10000);
          after15s = await collectAllEndpoints(
            prAPI,
            prId,
            revisionId,
            targetUserId,
            targetUsersIds,
          );
          dbAfter15s = await collectDBCache(db, prId, revisionId, targetUserId);

          const g15sId = after15s.summaryResults.competenceMeta?.find(
            (c) => c.id === competenceId,
          )?.groupId;
          console.log(
            `1. summary-results: comp ${competenceId} groupId = ${g15sId}`,
          );
          console.log(`   ${g15sId === tempGroupId ? "✅ FRESH" : "❌ STALE"}`);

          console.log(
            "2. groups for revision status:",
            after15s.groupsForRevision.status,
          );
          console.log(
            "2. groups for revision RAW:",
            after15s.groupsForRevision.raw,
          );
          const newGroup15 = after15s.groupsForRevision.groups?.find(
            (g) => g.id === tempGroupId,
          );
          const oldGroup15 = after15s.groupsForRevision.groups?.find(
            (g) => g.id === originalGroupId,
          );
          if (after15s.groupsForRevision.groups?.length > 0) {
            console.log(
              `   Новая группа ${tempGroupId}: comp ${competenceId}? ${newGroup15?.competenceIds?.includes(competenceId) ? "✅ YES" : "❌ NO"}`,
            );
            console.log(
              `   Старая группа ${originalGroupId}: comp ${competenceId}? ${oldGroup15?.competenceIds?.includes(competenceId) ? "❌ STALE" : "✅ REMOVED"}`,
            );
          }

          console.log(
            "3. comp stats for revision RAW:",
            after15s.compStatsForRevision.raw,
          );
          console.log(
            "4. comp stats for user RAW:",
            after15s.compStatsForUser.raw,
          );
          console.log(
            "5. users-comp-results RAW:",
            after15s.usersCompResults.raw,
          );

          console.log(
            "DB groups_history:",
            JSON.stringify(dbAfter15s.groupsHistory),
          );
          console.log("DB mean_meta:", JSON.stringify(dbAfter15s.meanMeta));

          // ═══════════════════════════════════════════════════════════════
          // 7. СВОДКА
          // ═══════════════════════════════════════════════════════════════
          console.log("\n═══════════════════════════════════");
          console.log("  СВОДКА ПОСЛЕ 15с");
          console.log("═══════════════════════════════════");

          // Анализ endpoint 2 (groups for revision)
          const groupsOk = after15s.groupsForRevision.status === 200;
          const compInNewGroup =
            newGroup15?.competenceIds?.includes(competenceId) ?? false;
          const compNotInOldGroup =
            !oldGroup15?.competenceIds?.includes(competenceId);

          // Анализ endpoint 3 (comp stats for revision) — ищем groupId в items
          const cs15 = after15s.compStatsForRevision.items?.find(
            (c) => (c.id ?? c.competenceId) === competenceId,
          );
          const compStatsGroupOk = cs15?.groupId === tempGroupId;

          // DB invalidation check
          const invalidateTriggered = dbAfter15s.meanMeta?.invalidate !== "{}";
          const newGroupInDB = dbAfter15s.groupsHistory?.some?.(
            (g) => g.competence_group_id === tempGroupId,
          );

          const checks = [
            {
              name: "summary-results/get (competenceMeta.groupId)",
              fresh: g15sId === tempGroupId,
            },
            { name: "groups-for-revision (status 200)", fresh: groupsOk },
            {
              name: "groups-for-revision (comp in new group)",
              fresh: compInNewGroup,
            },
            {
              name: "groups-for-revision (comp NOT in old group)",
              fresh: compNotInOldGroup,
            },
            {
              name: "comp-stats-for-revision (groupId updated)",
              fresh: compStatsGroupOk,
            },
            {
              name: "DB groups_history (new group exists)",
              fresh: newGroupInDB,
            },
            {
              name: "DB mean_meta.invalidate (triggered)",
              fresh: invalidateTriggered,
            },
          ];
          for (const check of checks) {
            console.log(`  ${check.fresh ? "✅" : "❌"} ${check.name}`);
          }
          const staleCount = checks.filter((c) => !c.fresh).length;
          console.log(`\n  Итого: ${staleCount} проблем из ${checks.length}`);
        });
      } finally {
        // Cleanup
        if (competenceId && originalGroupId) {
          await competenciesAPI
            .updateCompetency(competenceId, { groupId: originalGroupId })
            .catch(() => {});
        }
        if (tempGroupId) {
          await competenciesAPI
            .deleteCompetenceGroup(tempGroupId)
            .catch(() => {});
        }
        await seedHelper.cleanup();
      }
    });
  },
);
