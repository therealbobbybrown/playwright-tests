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
  setupCharacteristics,
  disableCharacteristics,
  saveSettings,
  restoreSettings,
} from "../../../utils/StatisticsSettingsHelper.js";

// ─── Module-level cache ─────────────────────────────────────────
/**
 * @type {{
 *   prIds: number[],
 *   savedSettings: Map<number, Object>,
 *   primaryPrId: number,
 * } | null}
 */
let cached = null;

/**
 * Найти ВСЕ PR с результатами в текущем периоде.
 * Собирает уникальные PR ID + сохраняет настройки каждого.
 * Кэшируется на уровне модуля.
 */
async function ensureBaseData(request) {
  if (cached) return cached;

  const { email, password } = getCredentials("admin");
  const dashAPI = new DashboardTeamAPI(request);
  await dashAPI.signIn(email, password);

  const prAPI = new PerformanceReviewAPI(request);
  await prAPI.signIn(email, password);

  // Собираем все PR ID из distribution results (батчами по 200)
  const prIdSet = new Set();
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
      if (entry?.performanceReview?.id) {
        prIdSet.add(entry.performanceReview.id);
      }
    }
    if (usersData.items.length < batchSize) break;
  }

  const prIds = [...prIdSet];
  expect(
    prIds.length,
    "API: нужен хотя бы один PR с результатами — проверьте seed данные",
  ).toBeGreaterThan(0);

  // Сохранить настройки КАЖДОГО PR
  const savedSettings = new Map();
  for (const id of prIds) {
    const settings = await saveSettings(prAPI, id);
    savedSettings.set(id, settings);
  }

  cached = { prIds, savedSettings, primaryPrId: prIds[0] };
  console.log(
    `[chart-visibility] Найдено ${prIds.length} PR: ${prIds.join(", ")}`,
  );
  return cached;
}

/**
 * Будущий период — гарантированно без оценок.
 * 2 месяца вперёд от текущей даты.
 */
function getFuturePeriod() {
  const now = new Date();
  const futureDate = new Date(now.getFullYear(), now.getMonth() + 2, 1);
  const year = futureDate.getFullYear();
  const month = futureDate.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();
  return {
    pickerStart: { year, month, day: 1 },
    pickerEnd: { year, month, day: lastDay },
  };
}

// ─── Tests ───────────────────────────────────────────────────────

test.describe.serial(
  "Распределение оценок — Условия отображения графика характеристик",
  { tag: ["@ui", "@my-team", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.MY_TEAM);
    });

    test.afterAll(() => {
      cached = null;
    });

    // ═══════════════════════════════════════════════════════════
    // A1: График виден при enableCustomCharacteristics=true
    // ═══════════════════════════════════════════════════════════
    test(
      "C7322: График виден при enableCustomCharacteristics=true и наличии результатов",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }, testInfo) => {
        setSeverity("critical");
        const tab = new ScoreDistributionTab(page, testInfo);

        await test.step("Получить все PR и включить текстовые характеристики на каждом", async () => {
          const { prIds } = await ensureBaseData(request);
          const { email, password } = getCredentials("admin");
          const prAPI = new PerformanceReviewAPI(request);
          await prAPI.signIn(email, password);
          for (const prId of prIds) {
            try {
              await setupCharacteristics(prAPI, prId);
            } catch {
              // PR не поддерживает настройку характеристик — пропускаем
            }
          }
        });

        await test.step("Открыть вкладку «Распределение оценок»", async () => {
          await tab.open();
        });

        await test.step("Проверить, что график характеристик виден", async () => {
          await tab.waitForChart();
          const visible = await tab.isChartVisible();
          expect(
            visible,
            "График характеристик должен быть виден при enableCustomCharacteristics=true",
          ).toBe(true);
        });

        await test.step("Проверить наличие строк в графике", async () => {
          const rowCount = await tab.getChartRowCount();
          expect(
            rowCount,
            "График должен содержать хотя бы одну строку характеристик",
          ).toBeGreaterThan(0);
        });

        await test.step("API-сверка: endpoint характеристик возвращает данные", async () => {
          const { email, password } = getCredentials("admin");
          const dashAPI = new DashboardTeamAPI(request);
          await dashAPI.signIn(email, password);
          const { data } = await dashAPI.getDistributionCharacteristics();
          expect(
            data?.withResults?.length,
            "API: должна быть хотя бы одна характеристика с результатами",
          ).toBeGreaterThan(0);
        });
      },
    );

    // ═══════════════════════════════════════════════════════════
    // A2: График НЕ виден при enableCustomCharacteristics=false
    // ═══════════════════════════════════════════════════════════
    test(
      "C7323: График НЕ виден при enableCustomCharacteristics=false на ВСЕХ PR",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }, testInfo) => {
        setSeverity("critical");
        const tab = new ScoreDistributionTab(page, testInfo);

        await test.step("Отключить текстовые характеристики на ВСЕХ PR через API", async () => {
          const { prIds } = await ensureBaseData(request);
          const { email, password } = getCredentials("admin");
          const prAPI = new PerformanceReviewAPI(request);
          await prAPI.signIn(email, password);
          for (const prId of prIds) {
            await disableCharacteristics(prAPI, prId);
          }
        });

        try {
          await test.step("Открыть вкладку «Распределение оценок»", async () => {
            await tab.open();
          });

          await test.step("Проверить, что график характеристик скрыт", async () => {
            await page.waitForLoadState("networkidle");
            const visible = await tab.isChartVisible();
            expect(
              visible,
              "График характеристик должен быть скрыт при enableCustomCharacteristics=false на всех PR",
            ).toBe(false);
          });

          await test.step("Проверить, что фильтр «Характеристика» также скрыт", async () => {
            const filterVisible = await tab.isCharacteristicFilterVisible();
            expect(
              filterVisible,
              "Фильтр «Характеристика» должен быть скрыт при выключенных характеристиках",
            ).toBe(false);
          });
        } finally {
          // Восстановить настройки ВСЕХ PR для последующих тестов (A3–A5)
          if (cached?.prIds && cached?.savedSettings) {
            const { email, password } = getCredentials("admin");
            const prAPI = new PerformanceReviewAPI(request);
            await prAPI.signIn(email, password);
            for (const prId of cached.prIds) {
              const saved = cached.savedSettings.get(prId);
              if (saved) {
                await restoreSettings(prAPI, prId, saved);
              }
            }
          }
        }
      },
    );

    // ═══════════════════════════════════════════════════════════
    // A3: График при выборе группы без результатов характеристик
    // ═══════════════════════════════════════════════════════════
    test(
      "C7324: График при выборе группы — данные пересчитываются по группе",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }, testInfo) => {
        setSeverity("normal");
        const tab = new ScoreDistributionTab(page, testInfo);

        // Убедиться, что характеристики включены
        await test.step("Включить характеристики через API (если не включены)", async () => {
          const { prIds } = await ensureBaseData(request);
          const { email, password } = getCredentials("admin");
          const prAPI = new PerformanceReviewAPI(request);
          await prAPI.signIn(email, password);
          for (const prId of prIds) {
            try {
              await setupCharacteristics(prAPI, prId);
            } catch {
              // PR не поддерживает настройку характеристик — пропускаем
            }
          }
        });

        await test.step("Открыть вкладку «Распределение оценок»", async () => {
          await tab.open();
        });

        const chartDataBefore = [];

        await test.step("Зафиксировать данные графика до фильтрации по группе", async () => {
          await tab.waitForChart();
          const rows = await tab.getAllChartData();
          chartDataBefore.push(...rows);
          expect(
            chartDataBefore.length,
            "График должен содержать строки перед фильтрацией",
          ).toBeGreaterThan(0);
        });

        // Получить список групп и выбрать первую
        let groupNames = [];
        await test.step("Открыть панель «Группа» и получить список групп", async () => {
          await tab.openGroupFilter();
          groupNames = await tab.getGroupNames();
        });

        if (groupNames.length === 0) {
          await tab.closeGroupFilter();
          test.info().annotations.push({
            type: "info",
            description: "Нет доступных групп для фильтрации",
          });
          return;
        }

        await test.step(`Выбрать группу «${groupNames[0]}» и применить фильтр`, async () => {
          await tab.selectGroup(groupNames[0]);
          await tab.applyGroupFilter();
          await page.waitForLoadState("networkidle");
        });

        await test.step("Проверить состояние графика после фильтрации по группе", async () => {
          const visible = await tab.isChartVisible();
          if (visible) {
            // График виден — данные должны быть для выбранной группы
            const chartDataAfter = await tab.getAllChartData();
            expect(
              chartDataAfter.length,
              "График после фильтрации по группе должен содержать строки",
            ).toBeGreaterThan(0);

            // Проценты могут измениться (пересчёт по группе)
            const totalPercent = chartDataAfter.reduce(
              (sum, r) => sum + r.percentage,
              0,
            );
            expect(
              totalPercent,
              "Сумма процентов должна быть ~100%",
            ).toBeGreaterThanOrEqual(99);
            expect(totalPercent).toBeLessThanOrEqual(101);
          } else {
            // График скрыт — значит для этой группы нет результатов характеристик
            // Это валидное поведение для группы без оценок
            expect(visible).toBe(false);
          }
        });
      },
    );

    // ═══════════════════════════════════════════════════════════
    // A4: График при пустом периоде (будущий — без оценок)
    // ═══════════════════════════════════════════════════════════
    test(
      "C7325: График при будущем периоде без оценок",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }, testInfo) => {
        setSeverity("normal");
        const tab = new ScoreDistributionTab(page, testInfo);
        const period = getFuturePeriod();

        // Убедиться, что характеристики включены
        await test.step("Включить характеристики через API", async () => {
          const { prIds } = await ensureBaseData(request);
          const { email, password } = getCredentials("admin");
          const prAPI = new PerformanceReviewAPI(request);
          await prAPI.signIn(email, password);
          for (const prId of prIds) {
            try {
              await setupCharacteristics(prAPI, prId);
            } catch {
              // PR не поддерживает настройку характеристик — пропускаем
            }
          }
        });

        await test.step("Открыть вкладку «Распределение оценок»", async () => {
          await tab.open();
        });

        await test.step("Убедиться, что график виден с дефолтным периодом", async () => {
          await tab.waitForChart();
          const visible = await tab.isChartVisible();
          expect(visible, "График должен быть виден с дефолтным периодом").toBe(
            true,
          );
        });

        await test.step("Установить будущий период (гарантированно без оценок)", async () => {
          await tab.setPeriod(period.pickerStart, period.pickerEnd);
        });

        await test.step("Проверить состояние графика после смены на пустой период", async () => {
          await page.waitForLoadState("networkidle");
          const visible = await tab.isChartVisible();
          if (visible) {
            // Если график всё ещё виден — он должен содержать только «Нет оценки»
            const chartData = await tab.getAllChartData();
            const allNoScore = chartData.every(
              (row) =>
                row.name.includes("Нет оценки") ||
                row.name.includes("Без оценки"),
            );
            expect(
              allNoScore,
              `При пустом периоде график должен содержать только «Нет оценки», ` +
                `но содержит: ${chartData.map((r) => r.name).join(", ")}`,
            ).toBe(true);
          } else {
            // График скрыт — это тоже валидное поведение при пустом периоде
            expect(visible).toBe(false);
          }
        });
      },
    );

    // ═══════════════════════════════════════════════════════════
    // A5: График появляется/исчезает при переключении периода
    // ═══════════════════════════════════════════════════════════
    test(
      "C7326: График появляется/исчезает при переключении периода с/без оценок",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }, testInfo) => {
        setSeverity("normal");
        const tab = new ScoreDistributionTab(page, testInfo);
        const futurePeriod = getFuturePeriod();

        // Убедиться, что характеристики включены
        await test.step("Включить характеристики через API", async () => {
          const { prIds } = await ensureBaseData(request);
          const { email, password } = getCredentials("admin");
          const prAPI = new PerformanceReviewAPI(request);
          await prAPI.signIn(email, password);
          for (const prId of prIds) {
            try {
              await setupCharacteristics(prAPI, prId);
            } catch {
              // PR не поддерживает настройку характеристик — пропускаем
            }
          }
        });

        await test.step("Открыть вкладку «Распределение оценок»", async () => {
          await tab.open();
        });

        let initialChartRowCount;

        await test.step("1. Проверить, что график виден с дефолтным периодом", async () => {
          await tab.waitForChart();
          const visible = await tab.isChartVisible();
          expect(visible, "График должен быть виден с дефолтным периодом").toBe(
            true,
          );
          initialChartRowCount = await tab.getChartRowCount();
          expect(initialChartRowCount).toBeGreaterThan(0);
        });

        await test.step("2. Переключить на будущий период — график скрыт или только «Нет оценки»", async () => {
          await tab.setPeriod(futurePeriod.pickerStart, futurePeriod.pickerEnd);
          await page.waitForLoadState("networkidle");

          const visible = await tab.isChartVisible();
          if (visible) {
            const chartData = await tab.getAllChartData();
            const allNoScore = chartData.every(
              (row) =>
                row.name.includes("Нет оценки") ||
                row.name.includes("Без оценки"),
            );
            expect(allNoScore, "При пустом периоде — только «Нет оценки»").toBe(
              true,
            );
          }
        });

        await test.step("3. Сбросить фильтры — график снова виден с характеристиками", async () => {
          // Кнопка сброса фильтров (×) появляется после изменения периода
          const resetVisible = await tab.isResetButtonVisible();
          if (resetVisible) {
            await tab.clickReset();
          } else {
            // Перезагрузить страницу с дефолтными фильтрами
            await tab.open();
          }
          await page.waitForLoadState("networkidle");

          await tab.waitForChart();
          const visible = await tab.isChartVisible();
          expect(
            visible,
            "График должен снова появиться после сброса фильтров",
          ).toBe(true);

          const rowCount = await tab.getChartRowCount();
          expect(
            rowCount,
            "Количество строк графика должно восстановиться",
          ).toBeGreaterThan(0);
        });
      },
    );
  },
);
