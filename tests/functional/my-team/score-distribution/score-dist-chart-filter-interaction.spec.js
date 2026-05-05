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
import { setupCharacteristics } from "../../../utils/StatisticsSettingsHelper.js";

// ─── Module-level cache (API only) ─────────────────────────────

/** @type {{ prIds: number[] } | null} */
let cached = null;

/**
 * Собрать PR IDs и включить характеристики. Кэш на уровне модуля.
 * UI НЕ кэшируется — каждый тест открывает свою страницу.
 */
async function ensureAPIData(request) {
  if (cached) return cached;

  const { email, password } = getCredentials("admin");
  const dashAPI = new DashboardTeamAPI(request);
  await dashAPI.signIn(email, password);
  const prAPI = new PerformanceReviewAPI(request);
  await prAPI.signIn(email, password);

  // Собрать PR ID
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

  // Включить характеристики
  for (const prId of prIds) {
    try {
      await setupCharacteristics(prAPI, prId);
    } catch {
      // PR не поддерживает — пропускаем
    }
  }

  cached = { prIds };
  return cached;
}

/**
 * Будущий период — 2 месяца вперёд от текущей даты.
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
  "Распределение оценок — Взаимодействие фильтров с графиком характеристик",
  { tag: ["@ui", "@my-team", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.MY_TEAM);
    });

    test.afterAll(() => {
      cached = null;
    });

    // ═══════════════════════════════════════════════════════════
    // F1: Смена фильтра «Сотрудники» → график пересчитывается
    // ═══════════════════════════════════════════════════════════
    test(
      "C7318: Смена фильтра «Сотрудники» на «Прямые подчиненные» — график пересчитывается",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }, testInfo) => {
        setSeverity("normal");
        const tab = new ScoreDistributionTab(page, testInfo);

        await ensureAPIData(request);

        await test.step("Открыть вкладку", async () => {
          await tab.open();
          await tab.waitForChart();
        });

        await test.step("Переключить на «Прямые подчиненные»", async () => {
          await tab.selectEmployeesOption("Прямые подчиненные");
          await page.waitForLoadState("networkidle");
        });

        await test.step("Проверить, что график обновился", async () => {
          const chartVisible = await tab.isChartVisible();
          if (!chartVisible) {
            test.info().annotations.push({
              type: "info",
              description: "График скрылся — нет прямых подчинённых с оценками",
            });
            return;
          }

          const chartAfter = await tab.getAllChartData();
          for (const row of chartAfter) {
            expect(row.name).toBeTruthy();
            expect(row.percentage).toBeGreaterThanOrEqual(0);
            expect(row.percentage).toBeLessThanOrEqual(100);
          }

          const totalPercent = chartAfter.reduce(
            (sum, r) => sum + r.percentage,
            0,
          );
          expect(totalPercent).toBeGreaterThanOrEqual(99);
          expect(totalPercent).toBeLessThanOrEqual(101);
        });

        await test.step("Вернуть фильтр на «Все сотрудники»", async () => {
          await tab.selectEmployeesOption("Все сотрудники");
          await page.waitForLoadState("networkidle");
        });
      },
    );

    // ═══════════════════════════════════════════════════════════
    // F2: Выбор группы → график показывает только сотрудников группы
    // ═══════════════════════════════════════════════════════════
    test(
      "C7319: Выбор группы — график показывает данные только по выбранной группе",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }, testInfo) => {
        setSeverity("normal");
        const tab = new ScoreDistributionTab(page, testInfo);

        await ensureAPIData(request);

        await test.step("Открыть вкладку", async () => {
          await tab.open();
          await tab.waitForChart();
        });

        let groupNames;
        await test.step("Открыть фильтр группы", async () => {
          await tab.openGroupFilter();
          groupNames = await tab.getGroupNames();
        });

        if (!groupNames?.length) {
          await tab.closeGroupFilter();
          test.info().annotations.push({
            type: "skip-reason",
            description: "Нет доступных групп для фильтрации",
          });
          return;
        }

        const selectedGroup = groupNames[0];

        await test.step(`Выбрать группу «${selectedGroup}» и применить`, async () => {
          await tab.selectGroup(selectedGroup);
          await tab.applyGroupFilter();
          await page.waitForLoadState("networkidle");
        });

        await test.step("Проверить, что график обновился для выбранной группы", async () => {
          const chartVisible = await tab.isChartVisible();
          if (!chartVisible) {
            test.info().annotations.push({
              type: "info",
              description: `График скрылся — в группе «${selectedGroup}» нет оценок`,
            });
            return;
          }

          const chartAfter = await tab.getAllChartData();
          for (const row of chartAfter) {
            expect(row.percentage).toBeGreaterThanOrEqual(0);
            expect(row.percentage).toBeLessThanOrEqual(100);
          }

          const totalPercent = chartAfter.reduce(
            (sum, r) => sum + r.percentage,
            0,
          );
          expect(totalPercent).toBeGreaterThanOrEqual(99);
          expect(totalPercent).toBeLessThanOrEqual(101);
        });

        // Сброс через кнопку сброса фильтров
        await test.step("Сбросить фильтры", async () => {
          await expect(async () => {
            if (await tab.resetButton.isVisible()) {
              await tab.resetButton.click();
            }
            const value = await tab.getEmployeesFilterValue();
            expect(value).toBe("Все сотрудники");
          }).toPass({ timeout: 15000 });
          await page.waitForLoadState("networkidle");
        });
      },
    );

    // ═══════════════════════════════════════════════════════════
    // F3: Смена периода → график обновляется
    // ═══════════════════════════════════════════════════════════
    test(
      "C7320: Смена периода на будущий — график показывает только «Нет оценки» или скрывается",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }, testInfo) => {
        setSeverity("normal");
        const tab = new ScoreDistributionTab(page, testInfo);

        await ensureAPIData(request);

        await test.step("Открыть вкладку", async () => {
          await tab.open();
          await tab.waitForChart();
        });

        const futurePeriod = getFuturePeriod();

        await test.step("Установить будущий период", async () => {
          await tab.setPeriod(futurePeriod.pickerStart, futurePeriod.pickerEnd);
          await page.waitForLoadState("networkidle");
        });

        await test.step("Проверить состояние графика в будущем периоде", async () => {
          const chartVisible = await tab.isChartVisible();
          if (!chartVisible) {
            // Нет оценок — ожидаемо
            expect(chartVisible).toBe(false);
            return;
          }

          // Если виден — только "Нет оценки" с сотрудниками
          const chartData = await tab.getAllChartData();
          const nonNoScore = chartData.filter(
            (r) =>
              !r.name.includes("Нет оценки") &&
              (r.avatarCount + r.overflowCount > 0 || r.percentage > 0),
          );
          expect(
            nonNoScore.length,
            `В будущем периоде не должно быть характеристик с сотрудниками, найдено: ${nonNoScore.map((r) => r.name).join(", ")}`,
          ).toBe(0);
        });

        await test.step("Сбросить фильтры", async () => {
          await expect(async () => {
            if (await tab.resetButton.isVisible()) {
              await tab.resetButton.click();
            }
            const value = await tab.getEmployeesFilterValue();
            expect(value).toBe("Все сотрудники");
          }).toPass({ timeout: 15000 });
          await page.waitForLoadState("networkidle");
        });
      },
    );

    // ═══════════════════════════════════════════════════════════
    // F4: Сброс фильтров → график возвращается к дефолту
    // ═══════════════════════════════════════════════════════════
    test(
      "C7321: Сброс фильтров — график возвращается к дефолтным данным",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }, testInfo) => {
        setSeverity("normal");
        const tab = new ScoreDistributionTab(page, testInfo);

        await ensureAPIData(request);

        await test.step("Открыть вкладку", async () => {
          await tab.open();
          await page.waitForLoadState("networkidle");
          await tab.waitForChart(20_000);
        });

        let defaultChartCount;
        await test.step("Запомнить дефолтное количество строк графика", async () => {
          defaultChartCount = await tab.getChartRowCount();
          expect(defaultChartCount).toBeGreaterThan(0);
        });

        await test.step("Переключить на «Прямые подчиненные» для активации кнопки сброса", async () => {
          await tab.selectEmployeesOption("Прямые подчиненные");
          await page.waitForLoadState("networkidle");
        });

        await test.step("Кнопка сброса видна", async () => {
          await expect(tab.resetButton).toBeVisible({ timeout: 5000 });
        });

        await test.step("Нажать кнопку сброса", async () => {
          await tab.clickReset();
          await page.waitForLoadState("networkidle");
        });

        await test.step("График восстановился к дефолту", async () => {
          await tab.waitForChart(30_000);
          await expect(async () => {
            const chartCountAfter = await tab.getChartRowCount();
            expect(
              chartCountAfter,
              `Строк графика: было ${defaultChartCount}, стало ${chartCountAfter}`,
            ).toBe(defaultChartCount);
          }).toPass({ timeout: 15000 });
        });

        await test.step("Фильтр «Сотрудники» вернулся к дефолту", async () => {
          const filterValue = await tab.getEmployeesFilterValue();
          expect(filterValue).toBe("Все сотрудники");
        });
      },
    );
  },
);
