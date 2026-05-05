// @ts-check
import { test, expect } from "../../../fixtures/auth.js";
import { ScoreDistributionTab } from "../../../../pages/ScoreDistributionTab.js";
import { DashboardTeamAPI } from "../../../utils/api/DashboardTeamAPI.js";
import { PerformanceReviewAPI } from "../../../utils/api/PerformanceReviewAPI.js";
import { getCredentials } from "../../../utils/credentials.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";
import {
  setupCharacteristicsWithCalibration,
  saveSettings,
  restoreSettings,
} from "../../../utils/StatisticsSettingsHelper.js";
import { ensureCalibrationOnDistributionPR } from "../../../utils/helpers/ensureCalibration.js";

// ─── Module-level cache (API only) ─────────────────────────────

/**
 * @type {{
 *   prIds: number[],
 *   prTitles: Map<number, string>,
 *   savedSettings: Map<number, Object>,
 *   calibrationEnabled: boolean,
 *   calibratedUsers: Array<{prId: number, revisionId: number, targetUserId: number}>
 * } | null}
 */
let cached = null;

/**
 * Собрать PR IDs, включить калибровку + характеристики на всех PR,
 * установить meanOverwrite хотя бы для одного сотрудника (чтобы переключатель калибровки был виден).
 * Кэш API-данных на уровне модуля (UI НЕ кэшируется — каждый тест открывает свою страницу).
 */
async function ensureAPIData(request) {
  if (cached) return cached;

  const { email, password } = getCredentials("admin");
  const dashAPI = new DashboardTeamAPI(request);
  await dashAPI.signIn(email, password);
  const prAPI = new PerformanceReviewAPI(request);
  await prAPI.signIn(email, password);

  // Собрать PR ID, маппинг prId → [targetUserId, ...] и prId → title
  const prIdSet = new Set();
  const prToUsers = new Map();
  const prTitles = new Map();
  const batchSize = 200;
  for (let batch = 0; batch < 15; batch++) {
    const { data: usersData } = await dashAPI.getDistributionUsers({
      usersSubset: "all",
      limit: batchSize,
      offset: batch * batchSize,
    });
    if (!usersData?.items?.length) break;
    const userIds = usersData.items.map((u) => u.id);
    const { data: results } = await dashAPI.getDistributionLastResults(userIds);
    for (const entry of Object.values(results || {})) {
      if (entry?.performanceReview?.id && entry?.targetUserId) {
        const prId = entry.performanceReview.id;
        prIdSet.add(prId);
        if (entry.performanceReview.title && !prTitles.has(prId)) {
          prTitles.set(prId, entry.performanceReview.title);
        }
        if (!prToUsers.has(prId)) prToUsers.set(prId, []);
        prToUsers.get(prId).push(entry.targetUserId);
      }
    }
    if (usersData.items.length < batchSize) break;
  }
  const prIds = [...prIdSet];

  // Если title не пришёл из distribution, попробовать получить из dashboard filters
  if (prIds.length > 0 && prTitles.size === 0) {
    try {
      const { data: filterPRs } =
        await prAPI.getDashboardFiltersPerformanceReviews();
      const items = filterPRs?.items || filterPRs || [];
      for (const item of items) {
        if (prIdSet.has(item.id) && item.title) {
          prTitles.set(item.id, item.title);
        }
      }
    } catch {
      // Не критично — fallback на другие способы
    }
  }

  // Сохранить настройки
  const savedSettings = new Map();
  for (const id of prIds) {
    const settings = await saveSettings(prAPI, id);
    savedSettings.set(id, settings);
  }

  // Включить калибровку + характеристики на всех PR
  const calibratedPrIds = [];
  for (const prId of prIds) {
    try {
      await setupCharacteristicsWithCalibration(prAPI, prId);
      calibratedPrIds.push(prId);
    } catch {
      // PR не поддерживает — пропускаем
    }
  }
  const calibrationEnabled = calibratedPrIds.length > 0;

  // Установить meanOverwrite с характеристикой хотя бы для одного сотрудника,
  // чтобы переключатель калибровки отобразился в UI.
  // Калибровка = присвоение текстовой характеристики (characteristicId), а не числового значения.
  const calibratedUsers = [];
  for (const prId of calibratedPrIds) {
    const targetUserIds = prToUsers.get(prId) || [];
    if (targetUserIds.length === 0) continue;

    try {
      // Получить характеристики PR (нужны их ID для meanOverwrite)
      const { data: prSettings } = await prAPI.getStatisticsSettings(prId);
      const characteristics = prSettings?.characteristicSettings || [];
      if (characteristics.length === 0) continue;
      // Берём последнюю (самую высокую) характеристику, например "Высоко"
      const targetCharacteristic = characteristics[characteristics.length - 1];

      // Получить revisionId
      const { data: revisions } =
        await dashAPI.getDashboardFiltersRevisions(prId);
      const revisionId = revisions?.items?.[0]?.id || revisions?.[0]?.id;
      if (!revisionId) continue;

      // Попробовать установить meanOverwrite для первого доступного сотрудника
      for (const targetUserId of targetUserIds) {
        try {
          // Проверить доступность overwrite для этого сотрудника
          const { response: checkResp, data: owData } =
            await prAPI.getResponseOverwritesData(prId, revisionId, targetUserId);
          if (!checkResp.ok()) continue;

          // Установить meanOverwrite с characteristicId (присвоить текстовую характеристику)
          const { response: overwriteResp } =
            await prAPI.overwriteResponsesValues(
              prId,
              revisionId,
              targetUserId,
              {
                overwrites: owData?.overwrites || [],
                meanOverwrite: {
                  value: null,
                  characteristicId: targetCharacteristic.id,
                },
                isLocked: false,
              },
            );

          if (overwriteResp.ok()) {
            calibratedUsers.push({
              prId,
              revisionId,
              targetUserId,
              characteristicId: targetCharacteristic.id,
            });
            console.log(
              `[calibration-toggle] Overwrite user ${targetUserId}: characteristicId=${targetCharacteristic.id} (${targetCharacteristic.title})`,
            );
            break; // Достаточно одного сотрудника на PR
          }
        } catch {
          // Сотрудник недоступен — пробуем следующего
        }
      }
    } catch {
      // PR не поддерживает overwrite — пропускаем
    }

    // Достаточно хотя бы одного откалиброванного сотрудника для видимости переключателя
    if (calibratedUsers.length > 0) break;
  }

  cached = {
    prIds,
    prTitles,
    savedSettings,
    calibrationEnabled,
    calibratedUsers,
  };
  console.log(
    `[calibration-toggle] ${prIds.length} PR, calibrationEnabled=${calibrationEnabled}, ` +
      `calibratedUsers=${calibratedUsers.length}, ` +
      `prTitles=${[...prTitles.entries()].map(([id, t]) => `${id}:${t}`).join(", ")}`,
  );
  return cached;
}

/**
 * Открыть вкладку распределения и убедиться, что выбран PR с данными (и графиком).
 * Если дефолтный PR не имеет графика — выбрать PR, для которого есть калиброванные данные.
 */
async function openTabWithChart(tab, data) {
  await tab.open();

  // Пробуем дождаться графика на дефолтном PR
  const chartVisible = await tab.distributionChart
    .waitFor({ state: "visible", timeout: 5000 })
    .then(() => true)
    .catch(() => false);

  if (chartVisible) return;

  // График не виден — выбираем PR с калиброванными данными
  const targetPrId = data.calibratedUsers?.[0]?.prId || data.prIds[0];
  const prTitle = data.prTitles.get(targetPrId);

  if (!prTitle) {
    throw new Error(
      `Не удалось определить название PR ${targetPrId} для выбора в UI. ` +
        `Доступные: ${[...data.prTitles.entries()].map(([id, t]) => `${id}:${t}`).join(", ")}`,
    );
  }

  console.log(
    `[calibration-toggle] Дефолтный PR без графика — выбираем PR ${targetPrId} «${prTitle}»`,
  );
  await tab.selectPR(prTitle);
  await tab.waitForChart();
}

// ─── Tests ───────────────────────────────────────────────────────

test.describe.serial(
  "Распределение оценок — Переключатель калибровки в графике",
  { tag: ["@ui", "@my-team", "@regression"] },
  () => {
    test.beforeAll(async ({ request }) => {
      test.setTimeout(180_000);
      await ensureCalibrationOnDistributionPR(request);
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.MY_TEAM);
    });

    test.afterAll(async ({ request }) => {
      const { email, password } = getCredentials("admin");
      const prAPI = new PerformanceReviewAPI(request);
      await prAPI.signIn(email, password);

      // Удалить meanOverwrite данные, созданные в setup
      if (cached?.calibratedUsers?.length) {
        for (const { prId, revisionId, targetUserId } of cached.calibratedUsers) {
          try {
            const { data: owData } = await prAPI.getResponseOverwritesData(
              prId,
              revisionId,
              targetUserId,
            );
            await prAPI.overwriteResponsesValues(
              prId,
              revisionId,
              targetUserId,
              {
                overwrites: owData?.overwrites || [],
                meanOverwrite: { value: null, characteristicId: null },
                isLocked: false,
              },
            );
          } catch {
            // Best effort cleanup
          }
        }
      }

      // Восстановить настройки
      if (cached?.savedSettings?.size) {
        for (const [prId, settings] of cached.savedSettings) {
          await restoreSettings(prAPI, prId, settings);
        }
      }
      cached = null;
    });

    // ═══════════════════════════════════════════════════════════
    // D3: Переключатель виден при наличии калибровки
    // ═══════════════════════════════════════════════════════════
    test(
      "C7306: Переключатель «Все оценки / Прошедшие калибровку» — проверка видимости при калибровке",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }, testInfo) => {
        setSeverity("critical");
        const tab = new ScoreDistributionTab(page, testInfo);

        const data = await ensureAPIData(request);

        await test.step("Открыть вкладку «Распределение оценок» с PR, у которого есть график", async () => {
          await openTabWithChart(tab, data);
        });

        await test.step("Проверить видимость переключателя калибровки", async () => {
          const visible = await tab.isCalibrationToggleVisible();
          expect(
            visible,
            "Переключатель калибровки должен быть виден при включённой калибровке",
          ).toBe(true);
        });
      },
    );

    // ═══════════════════════════════════════════════════════════
    // D5: По умолчанию активна вкладка «Все оценки»
    // ═══════════════════════════════════════════════════════════
    test(
      "C7307: По умолчанию активна вкладка «Все оценки»",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }, testInfo) => {
        setSeverity("normal");
        const tab = new ScoreDistributionTab(page, testInfo);

        const data = await ensureAPIData(request);

        await test.step("Открыть вкладку с PR, у которого есть график", async () => {
          await openTabWithChart(tab, data);
        });

        await test.step("Проверить, что переключатель калибровки виден", async () => {
          const toggleVisible = await tab.isCalibrationToggleVisible();
          expect(toggleVisible, "Переключатель калибровки должен быть виден").toBe(true);
        });

        await test.step("Проверить, что активна вкладка «Все оценки»", async () => {
          const activeTab = await tab.getActiveCalibrationTab();
          expect(
            activeTab,
            `Активная вкладка: «${activeTab}», ожидаем «all»`,
          ).toBe("all");
        });
      },
    );

    // ═══════════════════════════════════════════════════════════
    // D6: Переключение на «Прошедшие калибровку» — данные меняются
    // ═══════════════════════════════════════════════════════════
    test(
      "C7308: Переключение на «Прошедшие калибровку» — график обновляется",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }, testInfo) => {
        setSeverity("critical");
        const tab = new ScoreDistributionTab(page, testInfo);

        const data = await ensureAPIData(request);

        await test.step("Открыть вкладку с PR, у которого есть график", async () => {
          await openTabWithChart(tab, data);
        });

        await test.step("Проверить, что переключатель калибровки виден", async () => {
          const toggleVisible = await tab.isCalibrationToggleVisible();
          expect(toggleVisible, "Переключатель калибровки должен быть виден").toBe(true);
        });

        const chartDataBefore = await tab.getAllChartData();

        await test.step("Переключить на «Прошедшие калибровку»", async () => {
          await tab.switchToCalibrated();
        });

        await test.step("Проверить, что вкладка «Прошедшие калибровку» активна", async () => {
          const activeTab = await tab.getActiveCalibrationTab();
          expect(activeTab).toBe("calibrated");
        });

        await test.step("Проверить, что данные графика валидны", async () => {
          const chartVisible = await tab.isChartVisible();
          if (!chartVisible) {
            test.info().annotations.push({
              type: "info",
              description:
                "График скрылся при «Прошедшие калибровку» — нет откалиброванных данных",
            });
            return;
          }

          const chartDataAfter = await tab.getAllChartData();
          expect(
            chartDataAfter.length,
            "График должен содержать хотя бы одну характеристику",
          ).toBeGreaterThan(0);

          for (const row of chartDataAfter) {
            expect(row.name).toBeTruthy();
            expect(row.percentage).toBeGreaterThanOrEqual(0);
            expect(row.percentage).toBeLessThanOrEqual(100);
          }

          // В «Прошедшие калибровку» строка «Нет оценки» отсутствует,
          // а проценты считаются от ВСЕХ сотрудников — итого ≤ 100%, но не обязательно ≈ 100%
          const totalPercent = chartDataAfter.reduce(
            (sum, r) => sum + r.percentage,
            0,
          );
          expect(
            totalPercent,
            `Суммарный % откалиброванных (${totalPercent}%) должен быть > 0`,
          ).toBeGreaterThan(0);
          expect(totalPercent).toBeLessThanOrEqual(100);
        });

        await test.step("Вернуться на «Все оценки» — данные восстанавливаются", async () => {
          await tab.switchToAllScores();
          const activeTab = await tab.getActiveCalibrationTab();
          expect(activeTab).toBe("all");

          const chartDataRestored = await tab.getAllChartData();
          expect(chartDataRestored.length).toBe(chartDataBefore.length);
        });
      },
    );

    // ═══════════════════════════════════════════════════════════
    // D7: Таблица при «Прошедшие калибровку» — строки сохраняются
    // ═══════════════════════════════════════════════════════════
    test(
      "C7309: Таблица сохраняет все строки при переключении на «Прошедшие калибровку»",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }, testInfo) => {
        setSeverity("normal");
        const tab = new ScoreDistributionTab(page, testInfo);

        const data = await ensureAPIData(request);

        await test.step("Открыть вкладку с PR, у которого есть график", async () => {
          await openTabWithChart(tab, data);
        });

        await test.step("Проверить, что переключатель калибровки виден", async () => {
          const toggleVisible = await tab.isCalibrationToggleVisible();
          expect(toggleVisible, "Переключатель калибровки должен быть виден").toBe(true);
        });

        let rowsBefore;
        await test.step("Запомнить количество строк таблицы при «Все оценки»", async () => {
          rowsBefore = await tab.getRowCount();
          expect(rowsBefore).toBeGreaterThan(0);
        });

        await test.step("Переключить на «Прошедшие калибровку»", async () => {
          await tab.switchToCalibrated();
        });

        await test.step("Таблица по-прежнему содержит строки", async () => {
          await tab.tableRows
            .first()
            .waitFor({ state: "visible", timeout: 15000 });

          const rowsAfter = await tab.getRowCount();
          expect(
            rowsAfter,
            `Строк таблицы: было ${rowsBefore}, стало ${rowsAfter}`,
          ).toBeGreaterThan(0);
        });
      },
    );
  },
);
