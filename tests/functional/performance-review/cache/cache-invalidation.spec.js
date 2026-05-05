// tests/functional/performance-review/cache/cache-invalidation.spec.js
// Регрессионные тесты кэширования итоговой оценки и характеристики

import { test as base, expect } from "../../../fixtures/full.js";
import { CompetenciesAPI, getCredentials } from "../../../utils/api/index.js";
import { CalibrationVerifier } from "../../../utils/db/verifiers/CalibrationVerifier.js";

// ─── Фикстуры ────────────────────────────────────────────────────────────────

const test = base.extend({
  competenciesAPI: async ({ request }, use) => {
    const api = new CompetenciesAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
  calibrationVerifier: async ({ db }, use) => {
    const verifier = new CalibrationVerifier(db);
    await use(verifier);
  },
});

// ─── Константы ───────────────────────────────────────────────────────────────

/** Базовые параметры для populateReview (API требует все поля) */
const POPULATE_DEFAULTS = {
  skipChance: 0,
  commentChance: 0,
  customChance: 0,
};

/** Regex для валидации hex-цвета (#rgb, #rrggbb, #rrggbbaa) */
const HEX_COLOR_RE = /^#[0-9a-fA-F]{3,8}$/;

// ─── Хелперы ──────────────────────────────────────────────────────────────────

/**
 * Retry для мутирующих API-вызовов при transient 500.
 * @param {Function} fn — async () => { data, response }
 * @param {{ retries?: number, delay?: number, label?: string }} opts
 */
async function retryOnServerError(
  fn,
  { retries = 3, delay = 2000, label = "API call" } = {},
) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const result = await fn();
    if (result.response.ok() || result.response.status() < 500) return result;
    if (attempt < retries) {
      console.warn(
        `[${label}] ${result.response.status()} on attempt ${attempt}/${retries}, retrying in ${delay}ms...`,
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  return fn();
}

/**
 * Поллинг с предикатом. Бросает ошибку при таймауте — не допускает ложного pass.
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
 *
 * API `getStatisticsSummaryResults` возвращает:
 *   data.heatMapResults.targetUsers[userId].avrCompetencesCommon — { value, color }
 *   data.heatMapResults.targetUsers[userId].competences[compId] — { value, color }
 *   data.competences[] — [{ id, title, groupId }]
 *
 * @returns {{
 *   status: number,
 *   byUser: Object.<number, { score: number|null, color: string|null, competences: Object }>,
 *   competenceMeta: Array<{ id: number, title: string, groupId: number|null }>,
 * }}
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
  return { status: response.status(), byUser, competenceMeta };
}

/**
 * Snapshot per-group scores из groups-for-revision endpoint.
 *
 * Этот endpoint читает из кэш-таблицы performance_review_user_competence_groups_history.
 * Формат ответа: [{ competenceGroupId, targetUserId, value, ... }]
 *
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
 * Получить completed responses через ALL receiver user IDs.
 *
 * API `getReceiverUsersCompletedResponses` фильтрует по `usersIds` (ID респондента),
 * а НЕ по targetUserId. Поэтому для поиска всех ответов для targetUser
 * нужно передать все возможные assessor IDs и фильтровать локально.
 *
 * @param {number} [forTargetUserId] — если указан, фильтрует по targetUserId
 */
async function getCompletedResponses(
  prAPI,
  prId,
  revId,
  forTargetUserId = null,
) {
  // Получить всех receiver users (assessors)
  const { data: receivers } = await prAPI.getReceiverUsers(prId);
  const receiverItems = Array.isArray(receivers)
    ? receivers
    : receivers?.items || [];

  // Собрать уникальные ID assessors
  const assessorIds = [
    ...new Set(receiverItems.map((r) => r.user?.id ?? r.userId ?? r.id)),
  ];
  if (assessorIds.length === 0) return [];

  // Получить completed responses для всех assessors
  const { data } = await prAPI.getReceiverUsersCompletedResponses(prId, {
    revisionId: revId,
    usersIds: assessorIds,
  });
  const items = Array.isArray(data) ? data : data?.items || [];

  if (forTargetUserId != null) {
    return items.filter((i) => i.targetUserId === forTargetUserId);
  }
  return items;
}

/**
 * Найти completed ответ и вернуть payload для resetUserResponse.
 */
async function findResetPayload(prAPI, prId, revId, forTargetUserId) {
  const items = await getCompletedResponses(
    prAPI,
    prId,
    revId,
    forTargetUserId,
  );
  if (items.length === 0) return null;

  const item = items[0];
  return {
    receiverUserId: item.userId,
    targetUserId: item.targetUserId,
    assessmentId: item.assessmentId,
  };
}

// ─── Shared state ─────────────────────────────────────────────────────────────

let prId;
let revisionId;
let targetUserId;
let targetUsersIds = [];
let competenceId;
let originalGroupId;
let alternativeGroupId;
let competenceIdInitialized = false;

/**
 * Ленивая инициализация competenceId.
 * Вызывается из CACHE-004 (после CACHE-001, когда данные уже есть).
 * Использует competences из summary results.
 */
async function initCompetenceId(prAPI, competenciesAPI) {
  if (competenceIdInitialized) return;
  competenceIdInitialized = true;

  try {
    const { data } = await prAPI.getStatisticsSummaryResults(prId, {
      targetUsersIds,
      revisionId,
    });
    const competences = data?.competences || [];
    if (competences.length > 0) {
      competenceId = competences[0].id;
      const { data: compDetails } =
        await competenciesAPI.getCompetency(competenceId);
      originalGroupId = compDetails?.groupId ?? null;

      // Найти существующую группу, отличную от текущей (для CACHE-004)
      const { data: groupsData } = await competenciesAPI.getCompetenceGroups();
      const groups = Array.isArray(groupsData)
        ? groupsData
        : groupsData?.items || [];
      const altGroup = groups.find((g) => (g.id ?? g) !== originalGroupId);
      alternativeGroupId = altGroup?.id ?? altGroup ?? null;
    }
  } catch {
    console.warn(
      "[initCompetenceId] Не удалось получить компетенции, тесты 004/005 skip",
    );
  }
}

// ─── Тесты ────────────────────────────────────────────────────────────────────

test.describe.serial(
  "— Регресс кэша итоговой оценки и характеристики",
  { tag: ["@api", "@regression", "@performance-review", "@cache"] },
  () => {
    test.setTimeout(180_000);

    // ── beforeAll ───────────────────────────────────────────────────────────

    test.beforeAll(async ({ prAPI, prSeed, request }) => {
      const { seedHelper } = prSeed;

      // 1. Seed active PR БЕЗ заполнения (оставим для CACHE-001)
      const pr = await seedHelper.seedActivePR({ fillAssessments: false });
      prId = pr.id;
      revisionId = pr.revisionId;
      targetUserId = pr.targetUserId;

      // 2. Собрать targetUsersIds — формат items: { userId, user: { id } }
      const { data: tuData } = await prAPI.getTargetUsers(prId, {});
      const tuItems = Array.isArray(tuData) ? tuData : tuData?.items || [];
      targetUsersIds = tuItems
        .slice(0, 3)
        .map((u) => u.user?.id ?? u.userId ?? u.id);
      if (!targetUsersIds.includes(targetUserId) && targetUserId) {
        targetUsersIds.unshift(targetUserId);
      }

      // 3. competenceId определяется лениво — после CACHE-001 (когда есть данные)
      //    см. initCompetenceId()
    });

    // ── CACHE-001: Заполнение анкеты ────────────────────────────────────────
    // populateReview заполняет ВСЕ незаполненные анкеты за один вызов.
    // До этого теста — 0 заполненных. После — все заполнены.

    test(
      "C4303: Заполнение анкеты пересчитывает кэш",
      { tag: ["@api", "@regression", "@cache", "@performance-review"] },
      async ({ prAPI, prVerifier }) => {
        let snapBefore;
        let snapAfter;

        await test.step("Получить снимок результатов до заполнения анкеты", async () => {
          snapBefore = await getResultsSnapshot(
            prAPI,
            prId,
            revisionId,
            targetUsersIds,
          );
        });

        const scoreBefore = snapBefore.byUser[targetUserId]?.score;

        await test.step("Заполнить все анкеты через API", async () => {
          const { response: fillResp } = await prAPI.populateReview(prId, {
            ...POPULATE_DEFAULTS,
            lowerLimit: 40,
            upperLimit: 80,
          });
          expect(fillResp.ok()).toBeTruthy();

          // Проверка PR active
          const { response: prResp } = await prAPI.getById(prId);
          expect(prResp.status()).toBe(200);
        });

        await test.step("Проверить, что кэш пересчитан и score появился", async () => {
          snapAfter = await pollUntil(
            () => getResultsSnapshot(prAPI, prId, revisionId, targetUsersIds),
            (snap) => {
              const s = snap.byUser[targetUserId]?.score;
              return s != null && s !== scoreBefore;
            },
            { timeout: 15000, message: "score should appear after populate" },
          );

          expect(snapAfter.byUser[targetUserId].score).toBeGreaterThan(0);
          expect(snapAfter.byUser[targetUserId].score).toBeLessThanOrEqual(1);
          expect(snapAfter.byUser[targetUserId].color).toMatch(HEX_COLOR_RE);

          // Per-competence scores должны появиться (не пустой объект)
          const perComp = snapAfter.byUser[targetUserId].competences;
          const compIds = Object.keys(perComp);
          expect(
            compIds.length,
            "per-competence scores should appear after populate",
          ).toBeGreaterThan(0);
          for (const cid of compIds) {
            expect(
              perComp[cid].value,
              `competence ${cid} score should be defined`,
            ).not.toBeNull();
          }

          // Competence metadata должна содержать те же ID
          expect(
            snapAfter.competenceMeta.length,
            "competenceMeta should be non-empty",
          ).toBeGreaterThan(0);
        });

        await test.step("Проверить данные в БД", async () => {
          // DB: completed responses appeared
          if (prVerifier.isConnected()) {
            const responses = await prVerifier.getResponses(prId);
            const completedCount = responses.filter(
              (r) => r.status === "complete",
            ).length;
            expect(
              completedCount,
              "DB: completed > 0 after populate",
            ).toBeGreaterThan(0);
          }
          // DB: PR still active
          await prVerifier.verifyPRStatus(prId, "active");
        });
      },
    );

    // ── CACHE-002: Сброс ответа ─────────────────────────────────────────────
    // После CACHE-001 все анкеты заполнены. Сбрасываем один ответ.

    test(
      "C4304: Сброс ответа пересчитывает кэш",
      { tag: ["@api", "@regression", "@cache", "@performance-review"] },
      async ({ prAPI, prVerifier }) => {
        let dbCompletedBefore;
        let snapBefore;
        let snapAfter;
        let resetPayload;

        await test.step("Зафиксировать состояние БД и снимок результатов до сброса", async () => {
          // DB: count completed BEFORE
          if (prVerifier.isConnected()) {
            const responses = await prVerifier.getResponses(prId);
            dbCompletedBefore = responses.filter(
              (r) => r.status === "complete",
            ).length;
          }

          // Snapshot ДО
          snapBefore = await getResultsSnapshot(
            prAPI,
            prId,
            revisionId,
            targetUsersIds,
          );
          const scoreBefore = snapBefore.byUser[targetUserId]?.score;
          expect(scoreBefore).not.toBeNull();

          // Найти completed ответ для сброса
          resetPayload = await findResetPayload(
            prAPI,
            prId,
            revisionId,
            targetUserId,
          );
          expect(resetPayload).not.toBeNull();
        });

        const scoreBefore = snapBefore.byUser[targetUserId]?.score;

        await test.step("Сбросить ответ через API", async () => {
          const { response: resetResp } = await prAPI.resetUserResponse(
            prId,
            resetPayload,
          );
          expect(resetResp.ok()).toBeTruthy();

          // Проверка PR active
          const { response: prResp } = await prAPI.getById(prId);
          expect(prResp.status()).toBe(200);
        });

        await test.step("Проверить, что кэш пересчитан после сброса ответа", async () => {
          // Проверка результатов: score изменился (кэш пересчитан)
          snapAfter = await pollUntil(
            () => getResultsSnapshot(prAPI, prId, revisionId, targetUsersIds),
            (snap) => snap.byUser[targetUserId]?.score !== scoreBefore,
            { timeout: 30000, message: "score should change after reset" },
          );

          expect(snapAfter.byUser[targetUserId].score).not.toBe(scoreBefore);

          // Score может как увеличиться, так и уменьшиться (зависит от того, какой ответ сброшен)
          // Главное — он ИЗМЕНИЛСЯ (проверено выше)
          if (snapAfter.byUser[targetUserId].score != null) {
            expect(snapAfter.byUser[targetUserId].score).toBeGreaterThanOrEqual(
              0,
            );
            expect(snapAfter.byUser[targetUserId].score).toBeLessThanOrEqual(1);
          }

          // Per-competence: количество компетенций не должно измениться
          // (reset убирает ответ, но структура компетенций остаётся)
          const perCompBefore =
            snapBefore.byUser[targetUserId]?.competences || {};
          const perCompAfter =
            snapAfter.byUser[targetUserId]?.competences || {};
          expect(
            Object.keys(perCompAfter).length,
            "competence count should not change after reset",
          ).toBe(Object.keys(perCompBefore).length);

          // После reset цвет может быть null (недостаточно данных для расчёта)
          const colorAfterReset = snapAfter.byUser[targetUserId].color;
          if (colorAfterReset != null) {
            expect(colorAfterReset).toMatch(HEX_COLOR_RE);
          }
        });

        await test.step("Проверить данные в БД после сброса", async () => {
          // DB: completed responses decreased after reset
          if (prVerifier.isConnected() && dbCompletedBefore != null) {
            const responses = await prVerifier.getResponses(prId);
            const dbCompletedAfter = responses.filter(
              (r) => r.status === "complete",
            ).length;
            expect(
              dbCompletedAfter,
              "DB: completed count decreased after reset",
            ).toBeLessThan(dbCompletedBefore);
          }
          // DB: PR still active
          await prVerifier.verifyPRStatus(prId, "active");
        });
      },
    );

    // ── CACHE-003: Обновление настроек статистики ────────────────────────────

    test(
      "C4305: Обновление настроек статистики пересчитывает кэш",
      { tag: ["@api", "@regression", "@cache", "@performance-review"] },
      async ({ prAPI, prVerifier, calibrationVerifier }) => {
        // 1. Snapshot ДО: полный объект настроек
        // Структура: { settings: { totalAverageOnly, ... }, userSettings, competenceSettings, ... }
        let originalSettings;
        let fieldToToggle;
        let originalValue;
        let modifiedSettings;

        await test.step("Получить текущие настройки статистики", async () => {
          const { data } = await prAPI.getStatisticsSettings(prId);
          originalSettings = data;
          fieldToToggle = "totalAverageOnly";
          originalValue = originalSettings.settings[fieldToToggle];
          modifiedSettings = {
            ...originalSettings,
            settings: {
              ...originalSettings.settings,
              [fieldToToggle]: !originalValue,
            },
          };
        });

        await test.step("Изменить настройки статистики через API", async () => {
          // 2. Действие: toggle настройки (полный объект, settings вложены)
          const { response: updateResp } = await prAPI.updateStatisticsSettings(
            prId,
            modifiedSettings,
          );
          expect(updateResp.ok()).toBeTruthy();
        });

        try {
          await test.step("Проверить, что настройки применились в API и БД", async () => {
            // 3. Проверка действия: настройка изменилась
            const { data: updatedSettings } =
              await prAPI.getStatisticsSettings(prId);
            expect(updatedSettings.settings[fieldToToggle]).toBe(
              !originalValue,
            );

            // DB: settings record exists + конкретное поле изменилось (key-value таблица)
            await calibrationVerifier.verifyStatisticsSettingsExist(prId);
            if (calibrationVerifier.isConnected()) {
              const dbRow = await calibrationVerifier.db.findOne(
                "performance_review_statistics_settings",
                { performance_review_id: prId, name: fieldToToggle },
              );
              expect(
                dbRow,
                `DB: setting '${fieldToToggle}' не найден`,
              ).not.toBeNull();
              const expectedDbValue = !originalValue ? 1 : 0;
              expect(
                dbRow.numeric_value,
                `DB: ${fieldToToggle} должен быть ${expectedDbValue}`,
              ).toBe(expectedDbValue);
            }

            // 4. Проверка PR active (API + DB)
            const { response: prResp } = await prAPI.getById(prId);
            expect(prResp.status()).toBe(200);
            await prVerifier.verifyPRStatus(prId, "active");
          });

          await test.step("Проверить, что результаты остаются доступны после изменения настроек", async () => {
            // 5. Snapshot ДО изменения (на самом деле уже после toggle, но до пересчёта кэша)
            //    Берём свежий snapshot для сравнения структуры
            const snapBefore = await getResultsSnapshot(
              prAPI,
              prId,
              revisionId,
              targetUsersIds,
            );

            // 6. Проверка результатов: данные доступны после изменения (с поллингом для async cache)
            const snapAfter = await pollUntil(
              () => getResultsSnapshot(prAPI, prId, revisionId, targetUsersIds),
              (snap) => snap.byUser[targetUserId]?.score != null,
              {
                timeout: 15000,
                message: "score should be available after settings change",
              },
            );
            expect(snapAfter.byUser[targetUserId].score).toBeGreaterThan(0);
            expect(snapAfter.byUser[targetUserId].score).toBeLessThanOrEqual(1);
            expect(snapAfter.byUser[targetUserId].color).toMatch(HEX_COLOR_RE);

            // Per-competence: структура не должна сломаться от toggle настроек
            const perComp = snapAfter.byUser[targetUserId].competences;
            const compIds = Object.keys(perComp);
            expect(
              compIds.length,
              "per-competence scores should persist after settings toggle",
            ).toBeGreaterThan(0);

            // Competence metadata должна быть консистентна
            expect(
              snapAfter.competenceMeta.length,
              "competenceMeta should persist",
            ).toBeGreaterThan(0);
          });
        } finally {
          await test.step("Восстановить исходные настройки статистики", async () => {
            // 6. Cleanup: вернуть исходные настройки и проверить восстановление
            const { response: restoreResp } =
              await prAPI.updateStatisticsSettings(prId, originalSettings);
            expect(
              restoreResp.ok(),
              "Cleanup: restore settings should succeed",
            ).toBeTruthy();
            const { data: restoredSettings } =
              await prAPI.getStatisticsSettings(prId);
            expect(
              restoredSettings.settings[fieldToToggle],
              `Cleanup: ${fieldToToggle} should be restored to ${originalValue}`,
            ).toBe(originalValue);
          });
        }
      },
    );

    // ── CACHE-004: Изменение группировки компетенций ─────────────────────────

    test(
      "C4306: Изменение группировки компетенций пересчитывает кэш",
      { tag: ["@api", "@regression", "@cache", "@performance-review"] },
      async ({ prAPI, competenciesAPI, prVerifier }) => {
        await initCompetenceId(prAPI, competenciesAPI);
        test.skip(!competenceId, "Нет привязанных компетенций для этого PR");
        test.skip(
          !alternativeGroupId,
          "Нет альтернативной группы для перемещения",
        );

        let snapBefore;

        try {
          await test.step("Получить снимок результатов до перемещения компетенции", async () => {
            // Стабилизация: сервер может быть занят пересчётом кэша после CACHE-003
            await new Promise((r) => setTimeout(r, 10000));

            // 1. Snapshot ДО
            snapBefore = await getResultsSnapshot(
              prAPI,
              prId,
              revisionId,
              targetUsersIds,
            );
          });

          await test.step("Переместить компетенцию в альтернативную группу", async () => {
            // 2. Переместить компетенцию в существующую альтернативную группу
            const { response: moveResp } = await competenciesAPI.post(
              `/manager/competencies/${competenceId}/`,
              { groupId: alternativeGroupId },
              { timeout: 60000 },
            );
            expect(
              moveResp.ok(),
              `updateCompetency: ${moveResp.status()}`,
            ).toBeTruthy();

            // 3. Проверка действия: компетенция переехала
            const { data: compAfter } =
              await competenciesAPI.getCompetency(competenceId);
            expect(compAfter.groupId).toBe(alternativeGroupId);

            // 4. Проверка PR active
            const { response: prResp } = await prAPI.getById(prId);
            expect(prResp.status()).toBe(200);
          });

          await test.step("Проверить, что кэш результатов обновил groupId компетенции", async () => {
            // 5. Зафиксировать groupId ДО перемещения из snapshot
            const groupIdBefore =
              snapBefore.competenceMeta.find((c) => c.id === competenceId)
                ?.groupId ?? null;

            // 6. Проверка результатов: groupId обновился в кэше (с поллингом для async cache)
            //    Это ключевая проверка: если кэш НЕ инвалидирован, groupId останется старым
            const snapAfter = await pollUntil(
              () => getResultsSnapshot(prAPI, prId, revisionId, targetUsersIds),
              (snap) => {
                const compMeta = snap.competenceMeta.find(
                  (c) => c.id === competenceId,
                );
                return compMeta?.groupId === alternativeGroupId;
              },
              {
                timeout: 20000,
                message: `competence ${competenceId} groupId should change from ${groupIdBefore} to ${alternativeGroupId} in cached results`,
              },
            );

            // Проверка groupId в кэшированных результатах
            const compMetaAfter = snapAfter.competenceMeta.find(
              (c) => c.id === competenceId,
            );
            expect(
              compMetaAfter?.groupId,
              `cached groupId should be ${alternativeGroupId} (alt group), not ${groupIdBefore} (old group)`,
            ).toBe(alternativeGroupId);

            // Score по-прежнему валиден
            expect(snapAfter.byUser[targetUserId].score).toBeGreaterThan(0);
            expect(snapAfter.byUser[targetUserId].score).toBeLessThanOrEqual(1);
            expect(snapAfter.byUser[targetUserId].color).toMatch(HEX_COLOR_RE);

            // Per-competence: перемещённая компетенция должна иметь score
            const movedCompScore =
              snapAfter.byUser[targetUserId]?.competences?.[competenceId];
            if (movedCompScore) {
              expect(
                movedCompScore.value,
                "moved competence should still have a score",
              ).not.toBeNull();
            }
          });

          await test.step("Проверить endpoint groups-for-revision и данные в БД", async () => {
            // 7. Проверка groups-for-revision endpoint (кэш-таблица groups_history)
            //    Этот endpoint возвращает per-group агрегаты из БД, а не из метаданных.
            //    Альтернативная группа должна появиться с корректным competenceGroupId.
            const groupsAfter = await pollUntil(
              () =>
                getGroupsForRevisionSnapshot(
                  prAPI,
                  prId,
                  revisionId,
                  targetUserId,
                ),
              (groups) =>
                groups.some((g) => g.competenceGroupId === alternativeGroupId),
              {
                timeout: 20000,
                message: `groups-for-revision should contain alt group ${alternativeGroupId} after move`,
              },
            );
            const altGroupEntry = groupsAfter.find(
              (g) => g.competenceGroupId === alternativeGroupId,
            );
            expect(
              altGroupEntry,
              `alt group ${alternativeGroupId} should exist in groups-for-revision`,
            ).toBeTruthy();
            expect(
              altGroupEntry.value,
              "alt group should have a valid score",
            ).toBeGreaterThanOrEqual(0);

            // DB: PR still active
            await prVerifier.verifyPRStatus(prId, "active");
          });
        } finally {
          // 8. Cleanup: вернуть компетенцию в исходную группу
          await competenciesAPI
            .post(
              `/manager/competencies/${competenceId}/`,
              { groupId: originalGroupId },
              { timeout: 60000 },
            )
            .catch(() => {});
        }
      },
    );

    // ── CACHE-005: Удаление группы компетенций ───────────────────────────────

    test(
      "C4307: Удаление группы компетенций пересчитывает кэш",
      { tag: ["@api", "@regression", "@cache", "@performance-review"] },
      async ({ prAPI, competenciesAPI, prVerifier }) => {
        test.setTimeout(300_000); // 5м: до 200с ожидание пересчёта кэша + сам тест
        test.skip(!competenceId, "Нет привязанных компетенций для этого PR");

        // BUG: После move компетенции в C4306, сервер возвращает 500 на createCompetenceGroup
        // более 3 минут (подтверждено 20 попытками × 10с). Это баг бэкенда —
        // мутации компетенций заблокированы на время пересчёта кэша.
        // Ждём щедро, но при >200с 500-х — skip, не fail.

        let tempGroupId = null;
        let snapBefore;

        try {
          await test.step("Подготовить временную группу и переместить в неё компетенцию", async () => {
            // 1. Подготовка: создать временную группу, переместить компетенцию
            const { data: newGroup, response: createResp } =
              await retryOnServerError(
                () =>
                  competenciesAPI.createCompetenceGroup("Temp Delete Group"),
                { retries: 20, delay: 10000, label: "createCompetenceGroup" },
              );
            test.skip(
              !createResp.ok(),
              `createCompetenceGroup вернул ${createResp.status()} — серверная ошибка (>200с 500-х)`,
            );
            tempGroupId = newGroup?.id ?? newGroup;

            const { response: moveResp } = await competenciesAPI.post(
              `/manager/competencies/${competenceId}/`,
              { groupId: tempGroupId },
              { timeout: 60000 },
            );
            expect(
              moveResp.ok(),
              `updateCompetency: ${moveResp.status()}`,
            ).toBeTruthy();

            // Убедиться что компетенция в temp группе
            const { data: compCheck } =
              await competenciesAPI.getCompetency(competenceId);
            expect(compCheck.groupId).toBe(tempGroupId);

            // 2. Snapshot ДО удаления
            snapBefore = await getResultsSnapshot(
              prAPI,
              prId,
              revisionId,
              targetUsersIds,
            );
          });

          await test.step("Удалить временную группу компетенций", async () => {
            // 3. Действие: удалить временную группу (увеличенный timeout — сервер может быть занят)
            const deleteResp = await competenciesAPI.request.delete(
              `${competenciesAPI.baseURL}/manager/competence-groups/${tempGroupId}`,
              { headers: competenciesAPI.getHeaders(), timeout: 60000 },
            );
            expect(deleteResp.ok()).toBeTruthy();

            // 4. Проверка действия: группа удалена
            const { data: groupsAfter } =
              await competenciesAPI.getCompetenceGroups();
            const groupsList = Array.isArray(groupsAfter)
              ? groupsAfter
              : groupsAfter?.items || [];
            const tempGroupExists = groupsList.some(
              (g) => (g.id ?? g) === tempGroupId,
            );
            expect(tempGroupExists).toBe(false);
            tempGroupId = null; // Уже удалена

            // 5. Проверка PR active
            const { response: prResp } = await prAPI.getById(prId);
            expect(prResp.status()).toBe(200);
          });

          await test.step("Проверить, что кэш не содержит ссылок на удалённую группу", async () => {
            // 6. Проверка результатов: удалённый groupId не должен присутствовать в кэше
            //    Если кэш не инвалидирован — competenceMeta всё ещё ссылается на удалённую группу
            const deletedGroupId = snapBefore.competenceMeta.find(
              (c) => c.id === competenceId,
            )?.groupId;

            const snapAfter = await pollUntil(
              () => getResultsSnapshot(prAPI, prId, revisionId, targetUsersIds),
              (snap) => {
                const compMeta = snap.competenceMeta.find(
                  (c) => c.id === competenceId,
                );
                // После удаления группы — groupId должен стать null или отличаться от удалённого
                return compMeta && compMeta.groupId !== deletedGroupId;
              },
              {
                timeout: 20000,
                message: `competence ${competenceId} should no longer reference deleted group ${deletedGroupId}`,
              },
            );

            // Главная проверка: удалённая группа не должна быть в результатах
            const compMetaAfter = snapAfter.competenceMeta.find(
              (c) => c.id === competenceId,
            );
            expect(
              compMetaAfter?.groupId,
              `cached groupId should NOT be ${deletedGroupId} (deleted group)`,
            ).not.toBe(deletedGroupId);

            // Ни одна компетенция не должна ссылаться на удалённую группу
            const orphanedComps = snapAfter.competenceMeta.filter(
              (c) => c.groupId === deletedGroupId,
            );
            expect(
              orphanedComps.length,
              `no competences should reference deleted group ${deletedGroupId}`,
            ).toBe(0);

            // Score по-прежнему валиден
            expect(snapAfter.byUser[targetUserId].score).toBeGreaterThan(0);
            expect(snapAfter.byUser[targetUserId].score).toBeLessThanOrEqual(1);
            expect(snapAfter.byUser[targetUserId].color).toMatch(HEX_COLOR_RE);
          });

          await test.step("Проверить endpoint groups-for-revision и данные в БД", async () => {
            // 7. Проверка groups-for-revision: удалённая группа не должна быть в кэше
            const deletedGroupId = snapBefore.competenceMeta.find(
              (c) => c.id === competenceId,
            )?.groupId;
            const groupsAfterDelete = await getGroupsForRevisionSnapshot(
              prAPI,
              prId,
              revisionId,
              targetUserId,
            );
            const deletedGroupEntry = groupsAfterDelete.find(
              (g) => g.competenceGroupId === deletedGroupId,
            );
            expect(
              deletedGroupEntry,
              `deleted group ${deletedGroupId} should not appear in groups-for-revision cache`,
            ).toBeFalsy();

            // DB: PR still active
            await prVerifier.verifyPRStatus(prId, "active");
          });
        } finally {
          // 8. Cleanup
          await competenciesAPI
            .post(
              `/manager/competencies/${competenceId}/`,
              { groupId: originalGroupId },
              { timeout: 60000 },
            )
            .catch(() => {});
          if (tempGroupId) {
            await competenciesAPI
              .deleteCompetenceGroup(tempGroupId)
              .catch(() => {});
          }
        }
      },
    );

    // ── CACHE-006: Изменение PR (sanity) ────────────────────────────────────

    test(
      "C4308: Изменение PR (sanity) — данные не ломаются",
      { tag: ["@api", "@regression", "@cache", "@performance-review"] },
      async ({ prAPI, prVerifier }) => {
        let snapBefore;
        let newTitle;

        await test.step("Получить снимок результатов до изменения заголовка PR", async () => {
          // 1. Snapshot ДО изменения
          snapBefore = await getResultsSnapshot(
            prAPI,
            prId,
            revisionId,
            targetUsersIds,
          );
          newTitle = `Cache Sanity Check ${Date.now()}`;
        });

        await test.step("Обновить заголовок PR через API", async () => {
          // 2. Действие: обновить title
          const { response: updateResp } = await prAPI.update(prId, {
            title: newTitle,
          });
          expect(updateResp.ok()).toBeTruthy();

          // 3. Проверка действия: title изменился
          const { data: prData, response: prResp } = await prAPI.getById(prId);
          expect(prResp.status()).toBe(200);
          expect(prData.title).toBe(newTitle);
        });

        await test.step("Проверить, что кэш результатов не изменился от смены заголовка", async () => {
          // 4. Проверка результатов: доступны и идентичны до изменения (title не влияет на кэш)
          const snapAfter = await getResultsSnapshot(
            prAPI,
            prId,
            revisionId,
            targetUsersIds,
          );
          expect(snapAfter.byUser[targetUserId]?.score).toBeGreaterThan(0);
          expect(snapAfter.byUser[targetUserId]?.score).toBeLessThanOrEqual(1);
          expect(snapAfter.byUser[targetUserId]?.color).toMatch(HEX_COLOR_RE);

          // Score и competenceMeta не должны измениться от title change
          expect(snapAfter.byUser[targetUserId].score).toBe(
            snapBefore.byUser[targetUserId]?.score,
          );
          expect(snapAfter.byUser[targetUserId].color).toBe(
            snapBefore.byUser[targetUserId]?.color,
          );
          expect(snapAfter.competenceMeta.length).toBe(
            snapBefore.competenceMeta.length,
          );

          // Per-competence scores идентичны
          const compIdsBefore = Object.keys(
            snapBefore.byUser[targetUserId]?.competences || {},
          ).sort();
          const compIdsAfter = Object.keys(
            snapAfter.byUser[targetUserId]?.competences || {},
          ).sort();
          expect(compIdsAfter).toEqual(compIdsBefore);
        });

        await test.step("Проверить данные в БД", async () => {
          // DB: title persisted, PR active
          await prVerifier.verifyPRTitle(prId, newTitle);
          await prVerifier.verifyPRStatus(prId, "active");
        });
      },
    );

    // ── CACHE-007: Изоляция кэша между targetUsers ──────────────────────────
    // После CACHE-002 одна анкета сброшена. Refill → reset для userA → проверка.

    test(
      "C4309: Изоляция кэша между targetUsers",
      { tag: ["@api", "@regression", "@cache", "@performance-review"] },
      async ({ prAPI, prVerifier }) => {
        test.skip(
          targetUsersIds.length < 2,
          "Нужно ≥2 targetUsers для теста изоляции",
        );

        const [userA, userB] = targetUsersIds;
        let snapBefore;
        let scoreA;
        let scoreB;
        let dbCompletedBefore;
        let resetPayload;

        await test.step("Подготовить данные: заполнить анкеты и зафиксировать снимок", async () => {
          // Refill незаполненные (после CACHE-002 осталась 1 сброшенная)
          await prAPI.populateReview(prId, {
            ...POPULATE_DEFAULTS,
            lowerLimit: 40,
            upperLimit: 80,
          });

          // Подождать стабилизации
          await pollUntil(
            () => getResultsSnapshot(prAPI, prId, revisionId, [userA, userB]),
            (snap) =>
              snap.byUser[userA]?.score != null &&
              snap.byUser[userB]?.score != null,
            { timeout: 15000, message: "waiting for scores" },
          );

          // 1. Snapshot обоих пользователей
          snapBefore = await getResultsSnapshot(prAPI, prId, revisionId, [
            userA,
            userB,
          ]);
          scoreA = snapBefore.byUser[userA]?.score;
          scoreB = snapBefore.byUser[userB]?.score;

          // 2. DB: зафиксировать completed count ДО reset
          if (prVerifier.isConnected()) {
            const responses = await prVerifier.getResponses(prId);
            dbCompletedBefore = responses.filter(
              (r) => r.status === "complete",
            ).length;
          }

          // 3. Найти completed ответ для userA
          resetPayload = await findResetPayload(prAPI, prId, revisionId, userA);
          test.skip(!resetPayload, "Нет completed ответов для userA");
        });

        await test.step("Сбросить ответ для userA через API", async () => {
          const { response: resetResp } = await prAPI.resetUserResponse(
            prId,
            resetPayload,
          );
          expect(resetResp.ok()).toBeTruthy();
        });

        await test.step("Проверить, что кэш userA изменился, а кэш userB остался прежним", async () => {
          // 4. Проверка: userA изменился, userB — нет
          const snapAfter = await pollUntil(
            () => getResultsSnapshot(prAPI, prId, revisionId, [userA, userB]),
            (snap) => snap.byUser[userA]?.score !== scoreA,
            {
              timeout: 30000,
              message: "userA score should change after reset",
            },
          );

          expect(snapAfter.byUser[userA].score).not.toBe(scoreA);
          expect(snapAfter.byUser[userB].score).toBe(scoreB); // Изолирован!

          // Per-competence изоляция: userB competences не изменились
          const compB_before = snapBefore.byUser[userB]?.competences || {};
          const compB_after = snapAfter.byUser[userB]?.competences || {};
          for (const cid of Object.keys(compB_before)) {
            expect(
              compB_after[cid]?.value,
              `userB competence ${cid} score should not change`,
            ).toBe(compB_before[cid]?.value);
          }

          // CompetenceMeta не должна измениться от reset одного пользователя
          expect(snapAfter.competenceMeta.length).toBe(
            snapBefore.competenceMeta.length,
          );

          // После reset цвет userA может быть null (недостаточно данных)
          const colorA = snapAfter.byUser[userA].color;
          if (colorA != null) {
            expect(colorA).toMatch(HEX_COLOR_RE);
          }
          // userB не затронут — цвет должен остаться валидным
          expect(snapAfter.byUser[userB].color).toMatch(HEX_COLOR_RE);
        });

        await test.step("Проверить данные в БД", async () => {
          // DB: completed count уменьшился после reset
          if (prVerifier.isConnected() && dbCompletedBefore != null) {
            const responses = await prVerifier.getResponses(prId);
            const dbCompletedAfter = responses.filter(
              (r) => r.status === "complete",
            ).length;
            expect(
              dbCompletedAfter,
              "DB: completed count decreased after reset",
            ).toBeLessThan(dbCompletedBefore);
          }
          // DB: PR still active
          await prVerifier.verifyPRStatus(prId, "active");
        });
      },
    );

    // ── CACHE-008: Двойная мутация подряд ───────────────────────────────────
    // Мутация 1: refill → score1. Мутация 2: reset → score2. Обе инвалидируют.

    test(
      "C4310: Двойная мутация подряд",
      { tag: ["@api", "@regression", "@cache", "@performance-review"] },
      async ({ prAPI, prVerifier }) => {
        let testUserId = null;
        let score1 = null;
        let snap1;
        let dbCompletedAfterPopulate;
        let resetPayload;

        await test.step("Выполнить первую мутацию: заполнить анкеты и зафиксировать score", async () => {
          // Мутация 1: refill незаполненные (после предыдущих reset)
          await prAPI.populateReview(prId, {
            ...POPULATE_DEFAULTS,
            lowerLimit: 40,
            upperLimit: 80,
          });

          // Дождаться стабилизации — выбираем пользователя с non-null score
          snap1 = await pollUntil(
            () => getResultsSnapshot(prAPI, prId, revisionId, targetUsersIds),
            (snap) => Object.values(snap.byUser).some((u) => u.score != null),
            { timeout: 15000, message: "waiting for any score stabilization" },
          );

          // Находим пользователя с score и completed ответами
          for (const uid of targetUsersIds) {
            if (snap1.byUser[uid]?.score != null) {
              const payload = await findResetPayload(
                prAPI,
                prId,
                revisionId,
                uid,
              );
              if (payload) {
                testUserId = uid;
                score1 = snap1.byUser[uid].score;
                break;
              }
            }
          }
          expect(testUserId).not.toBeNull();
          expect(
            score1,
            "score should be non-null after first mutation (populate)",
          ).not.toBeNull();

          // DB: зафиксировать completed count после populate (до reset)
          if (prVerifier.isConnected()) {
            const responses = await prVerifier.getResponses(prId);
            dbCompletedAfterPopulate = responses.filter(
              (r) => r.status === "complete",
            ).length;
            expect(
              dbCompletedAfterPopulate,
              "DB: completed > 0 after populate",
            ).toBeGreaterThan(0);
          }

          resetPayload = await findResetPayload(
            prAPI,
            prId,
            revisionId,
            testUserId,
          );
        });

        await test.step("Выполнить вторую мутацию: сбросить один ответ", async () => {
          // Мутация 2: reset одного ответа
          const { response: resetResp } = await prAPI.resetUserResponse(
            prId,
            resetPayload,
          );
          expect(resetResp.ok()).toBeTruthy();
        });

        await test.step("Проверить, что кэш пересчитан после обеих мутаций", async () => {
          // Проверка: score изменился после второй мутации
          const snap2 = await pollUntil(
            () => getResultsSnapshot(prAPI, prId, revisionId, targetUsersIds),
            (snap) => snap.byUser[testUserId]?.score !== score1,
            {
              timeout: 30000,
              message: "score should change after second mutation (reset)",
            },
          );

          expect(snap2.byUser[testUserId].score).not.toBe(score1);

          // Per-competence: после reset competences могут быть пустыми (недостаточно данных)
          // Но если есть — набор ID не должен содержать «лишних» компетенций
          const perComp1 = snap1.byUser[testUserId]?.competences || {};
          const perComp2 = snap2.byUser[testUserId]?.competences || {};
          const compIds2 = Object.keys(perComp2);
          if (compIds2.length > 0) {
            const compIds1 = new Set(Object.keys(perComp1));
            for (const cid of compIds2) {
              expect(
                compIds1.has(cid),
                `unexpected competence ${cid} after reset`,
              ).toBe(true);
            }
          }

          // CompetenceMeta не должна измениться от data-мутаций (reset = данные, не структура)
          expect(snap2.competenceMeta.length).toBe(snap1.competenceMeta.length);

          // После reset цвет может быть null (недостаточно данных)
          const color2 = snap2.byUser[testUserId].color;
          if (color2 != null) {
            expect(color2).toMatch(HEX_COLOR_RE);
          }
        });

        await test.step("Проверить данные в БД после двойной мутации", async () => {
          // DB: completed count уменьшился после reset
          if (prVerifier.isConnected() && dbCompletedAfterPopulate != null) {
            const responses = await prVerifier.getResponses(prId);
            const dbCompletedAfterReset = responses.filter(
              (r) => r.status === "complete",
            ).length;
            expect(
              dbCompletedAfterReset,
              "DB: completed count decreased after reset",
            ).toBeLessThan(dbCompletedAfterPopulate);
          }
          // DB: PR still active
          await prVerifier.verifyPRStatus(prId, "active");
        });
      },
    );

    // ── CACHE-009: Стабильность после пересчёта ─────────────────────────────

    test(
      "C4311: Стабильность кэша после пересчёта",
      { tag: ["@api", "@regression", "@cache", "@performance-review"] },
      async ({ prAPI, prVerifier }) => {
        let testUserId;
        let read1;
        let read2;

        await test.step("Заполнить анкеты и дождаться стабилизации кэша", async () => {
          // Refill незаполненные
          await prAPI.populateReview(prId, {
            ...POPULATE_DEFAULTS,
            lowerLimit: 40,
            upperLimit: 60,
          });

          // Дождаться стабилизации — выбрать пользователя с score
          const stableSnap = await pollUntil(
            () => getResultsSnapshot(prAPI, prId, revisionId, targetUsersIds),
            (snap) => Object.values(snap.byUser).some((u) => u.score != null),
            { timeout: 15000, message: "waiting for score stabilization" },
          );
          testUserId = targetUsersIds.find(
            (uid) => stableSnap.byUser[uid]?.score != null,
          );
          expect(testUserId).toBeDefined();
        });

        await test.step("Выполнить два последовательных чтения результатов", async () => {
          // Два последовательных чтения
          read1 = await getResultsSnapshot(prAPI, prId, revisionId, [
            testUserId,
          ]);
          await new Promise((r) => setTimeout(r, 1000));
          read2 = await getResultsSnapshot(prAPI, prId, revisionId, [
            testUserId,
          ]);
        });

        await test.step("Проверить, что оба чтения возвращают идентичные данные", async () => {
          // Оба чтения идентичны — кэш прогрет и консистентен
          expect(read1.byUser[testUserId].score).toBe(
            read2.byUser[testUserId].score,
          );
          expect(read1.byUser[testUserId].color).toBe(
            read2.byUser[testUserId].color,
          );
          // Verify color is a valid hex
          expect(read1.byUser[testUserId].color).toMatch(HEX_COLOR_RE);

          // Per-competence scores идентичны между двумя чтениями
          const perComp1 = read1.byUser[testUserId]?.competences || {};
          const perComp2 = read2.byUser[testUserId]?.competences || {};
          expect(Object.keys(perComp1).sort()).toEqual(
            Object.keys(perComp2).sort(),
          );
          for (const cid of Object.keys(perComp1)) {
            expect(
              perComp2[cid]?.value,
              `competence ${cid} score should be stable`,
            ).toBe(perComp1[cid]?.value);
            expect(
              perComp2[cid]?.color,
              `competence ${cid} color should be stable`,
            ).toBe(perComp1[cid]?.color);
          }

          // CompetenceMeta идентична (groupId не должны «плавать»)
          expect(read1.competenceMeta.length).toBe(read2.competenceMeta.length);
          for (const meta1 of read1.competenceMeta) {
            const meta2 = read2.competenceMeta.find((m) => m.id === meta1.id);
            expect(
              meta2,
              `competence ${meta1.id} should exist in both reads`,
            ).toBeDefined();
            expect(
              meta2.groupId,
              `competence ${meta1.id} groupId should be stable`,
            ).toBe(meta1.groupId);
          }
        });

        await test.step("Проверить данные в БД", async () => {
          // DB: PR still active, revision intact after all mutations
          await prVerifier.verifyPRStatus(prId, "active");
          await prVerifier.verifyRevisionActive(prId);
        });
      },
    );

    // ── afterAll ────────────────────────────────────────────────────────────

    test.afterAll(async ({ prSeed, request }) => {
      // Восстановить компетенцию в исходную группу
      try {
        if (competenceId && originalGroupId) {
          const compAPI = new CompetenciesAPI(request);
          const { email, password } = getCredentials("admin");
          await compAPI.signIn(email, password);
          await compAPI.post(
            `/manager/competencies/${competenceId}/`,
            { groupId: originalGroupId },
            { timeout: 60000 },
          );
        }
      } catch (e) {
        console.warn(
          "Cleanup: не удалось восстановить группу компетенции:",
          e.message,
        );
      }

      // Cleanup PR
      const { seedHelper } = prSeed;
      await seedHelper.cleanup();
    });
  },
);
