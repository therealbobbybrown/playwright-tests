import { DashboardTeamAPI } from "../api/DashboardTeamAPI.js";
import { PerformanceReviewAPI } from "../api/PerformanceReviewAPI.js";
import { getCredentials } from "../credentials.js";
import { CalibrationSeed } from "../seed/CalibrationSeed.js";

/**
 * Находит PR из данных распределения оценок и включает на нём калибровку
 * (`enableResponsesOverwriting: true`), если она ещё не включена.
 *
 * Если данных распределения нет (нет пользователей или нет результатов),
 * автоматически создаёт seed-данные через CalibrationSeed.
 *
 * Включает калибровку на ВСЕХ найденных PR (не только первом),
 * и ВСЕГДА делает warm-up (даже если настройка уже стоит).
 *
 * @param {import('@playwright/test').APIRequestContext} request
 * @returns {Promise<{prId: number, enabled: boolean}>}
 */
export async function ensureCalibrationOnDistributionPR(request) {
  const adminCreds = getCredentials("admin");

  // 1. Проверить, есть ли сотрудники с revisionMean в distribution
  const dashAPI = new DashboardTeamAPI(request);
  await dashAPI.signIn(adminCreds.email, adminCreds.password);

  const hasExistingData = await checkDistributionData(dashAPI);

  if (hasExistingData) {
    // Данные есть — включаем калибровку на ВСЕХ найденных PR
    return enableCalibrationOnExistingPRs(request, dashAPI);
  }

  // 2. Данных нет — создаём seed
  console.log(
    "[ensureCalibration] Нет данных в distribution — создаём seed через CalibrationSeed",
  );
  const calSeed = new CalibrationSeed(request);
  await calSeed.init();

  const result = await calSeed.seedWithDirections({
    directions: { self: true, head: true },
    targetUsersCount: 3,
    receiversPerDirection: 2,
    fillQuestionnaires: true,
  });

  console.log(`[ensureCalibration] Seed создан: PR ${result.prId}`);

  // 3. Включить калибровку на созданном PR
  const prAPI = new PerformanceReviewAPI(request);
  await prAPI.signIn(adminCreds.email, adminCreds.password);

  const { data: settingsData } = await prAPI.getStatisticsSettings(result.prId);
  const { response: settResp } = await prAPI.updateStatisticsSettings(
    result.prId,
    {
      ...settingsData,
      settings: {
        ...(settingsData?.settings || {}),
        enableResponsesOverwriting: true,
        useOnlyHeadReceiver: true,
      },
    },
  );

  if (!settResp.ok()) {
    console.log(
      `[ensureCalibration] PR ${result.prId}: не удалось включить калибровку (${settResp.status()})`,
    );
    return { prId: result.prId, enabled: false };
  }

  console.log(`[ensureCalibration] PR ${result.prId}: калибровка включена`);

  // 4. Warm-up — триггерим пересчёт
  const { data: revision } = await prAPI.getLastRevision(result.prId);
  if (revision) {
    const { data: targetUsersData } = await prAPI.getTargetUsers(result.prId, {
      limit: 100,
    });
    const targetUserIds = (targetUsersData?.items || targetUsersData || []).map(
      (u) => u.user?.id ?? u.userId,
    );

    await Promise.allSettled([
      prAPI.getStatisticsSummaryResults(result.prId, {
        targetUsersIds: targetUserIds,
        revisionId: revision.id,
      }),
      prAPI.getUsersCompetenciesResults(result.prId, {
        usersIds: targetUserIds,
        revisionId: revision.id,
      }),
    ]);

    // Ждём пересчёт
    await new Promise((r) => setTimeout(r, 5000));
    console.log(`[ensureCalibration] PR ${result.prId}: warm-up завершён`);
  }

  return { prId: result.prId, enabled: true };
}

/**
 * Проверяет, есть ли в distribution сотрудники с revisionMean
 * И хотя бы один из них isOverwritable (карандаш будет виден).
 *
 * Возвращает false если:
 * - Нет пользователей
 * - Нет результатов с revisionMean
 * - Нет overwritable пользователей (тогда pencil не покажется)
 */
async function checkDistributionData(dashAPI) {
  const { data: usersData } = await dashAPI.getDistributionUsers({
    usersSubset: "all",
    limit: 100,
    offset: 0,
  });
  const users = usersData?.items || [];
  if (!users.length) return false;

  const userIds = users.map((u) => u.id);
  const { data: resultsData } =
    await dashAPI.getDistributionLastResults(userIds);

  // Проверяем, есть ли хотя бы один overwritable пользователь с revisionMean
  let hasOverwritable = false;
  for (const entry of Object.values(resultsData || {})) {
    if (
      entry?.revisionMean != null &&
      entry?.responseOverwritable?.isOverwritable === true
    ) {
      hasOverwritable = true;
      break;
    }
  }

  if (hasOverwritable) return true;

  // Если есть пользователи с revisionMean но ни один не overwritable —
  // всё равно пробуем включить калибровку и warm-up (может помочь)
  const prIds = new Set();
  for (const entry of Object.values(resultsData || {})) {
    if (entry?.performanceReview?.id) prIds.add(entry.performanceReview.id);
  }

  return prIds.size > 0;
}

/**
 * Включает калибровку на ВСЕХ PR из distribution и делает warm-up.
 *
 * Паттерн из рабочего score-dist-calibration-lock-manager.spec.js:
 *   1. Собрать все PR ID из distribution results
 *   2. Включить enableResponsesOverwriting на КАЖДОМ PR
 *   3. ВСЕГДА делать warm-up (даже если настройка уже стояла)
 *   4. Per-user проверка overwritable через getResponseOverwritesData
 */
async function enableCalibrationOnExistingPRs(request, dashAPI) {
  const adminCreds = getCredentials("admin");

  const { data: usersData } = await dashAPI.getDistributionUsers({
    usersSubset: "all",
    limit: 100,
    offset: 0,
  });
  const users = usersData?.items || [];
  const userIds = users.map((u) => u.id);
  const { data: resultsData } =
    await dashAPI.getDistributionLastResults(userIds);

  // Собрать уникальные PR ID
  const prIds = new Set();
  for (const entry of Object.values(resultsData || {})) {
    if (entry?.performanceReview?.id) prIds.add(entry.performanceReview.id);
  }

  if (!prIds.size) return { prId: null, enabled: false };

  const prAPI = new PerformanceReviewAPI(request);
  await prAPI.signIn(adminCreds.email, adminCreds.password);

  let enabledPrId = null;

  // Включаем калибровку на КАЖДОМ PR (не return после первого!)
  for (const prId of prIds) {
    try {
      const { data: settingsData } = await prAPI.getStatisticsSettings(prId);
      const alreadyEnabled = settingsData?.settings?.enableResponsesOverwriting;

      if (!alreadyEnabled) {
        const { response: settResp } = await prAPI.updateStatisticsSettings(
          prId,
          {
            ...settingsData,
            settings: {
              ...(settingsData?.settings || {}),
              enableResponsesOverwriting: true,
              useOnlyHeadReceiver: true,
            },
          },
        );

        if (!settResp.ok()) {
          console.log(
            `[ensureCalibration] PR ${prId}: не удалось включить (${settResp.status()})`,
          );
          continue;
        }
        console.log(`[ensureCalibration] PR ${prId}: калибровка включена`);
      } else {
        console.log(`[ensureCalibration] PR ${prId}: калибровка уже включена`);
      }

      // ВСЕГДА делаем warm-up (даже если калибровка уже была включена)
      const { data: revision } = await prAPI.getLastRevision(prId);
      if (revision) {
        const targetUserIds = Object.values(resultsData || {})
          .filter((e) => e?.performanceReview?.id === prId)
          .map((e) => e.targetUserId)
          .filter(Boolean);

        if (targetUserIds.length > 0) {
          await Promise.allSettled([
            prAPI.getStatisticsSummaryResults(prId, {
              targetUsersIds: targetUserIds,
              revisionId: revision.id,
            }),
            prAPI.getTargetUsersProgress(prId, {
              revisionId: revision.id,
              usersIds: targetUserIds,
            }),
            prAPI.getUsersCompetenciesResults(prId, {
              usersIds: targetUserIds,
              revisionId: revision.id,
            }),
          ]);
          console.log(
            `[ensureCalibration] PR ${prId}: warm-up (${targetUserIds.length} users)`,
          );
        }
      }

      if (!enabledPrId) enabledPrId = prId;
    } catch (err) {
      console.log(`[ensureCalibration] PR ${prId}: ошибка — ${err.message}`);
      continue;
    }
  }

  // Ждём пересчёт после обработки всех PR
  if (enabledPrId) {
    await new Promise((r) => setTimeout(r, 3000));
    console.log(
      `[ensureCalibration] Обработано ${prIds.size} PR, warm-up завершён`,
    );
  }

  // Перепроверяем: есть ли overwritable пользователи после warm-up
  const { data: freshResults } =
    await dashAPI.getDistributionLastResults(userIds);
  let hasOverwritable = false;
  for (const entry of Object.values(freshResults || {})) {
    if (
      entry?.revisionMean != null &&
      entry?.responseOverwritable?.isOverwritable === true
    ) {
      hasOverwritable = true;
      console.log(
        `[ensureCalibration] Overwritable user found: ${entry.targetUserId}`,
      );
      break;
    }
  }

  if (!hasOverwritable) {
    console.log(
      "[ensureCalibration] Нет overwritable users после warm-up — данные не пригодны для pencil-тестов",
    );
  }

  return { prId: enabledPrId, enabled: !!enabledPrId && hasOverwritable };
}
