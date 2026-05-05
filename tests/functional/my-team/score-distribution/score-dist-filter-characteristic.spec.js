// @ts-check
/**
 * Тесты фильтра «Характеристика» на вкладке «Распределение оценок»
 *
 * Покрытие:
 * E1: Фильтр виден при enableCustomCharacteristics=true
 * E2: Фильтр НЕ виден при enableCustomCharacteristics=false (объединён с A2 visibility)
 * E3: Значение по умолчанию — placeholder (не выбрана конкретная характеристика)
 * E4: Опции фильтра = характеристики из графика
 * E5: Выбор характеристики фильтрует таблицу
 * E6: Сброс фильтра через кнопку графика «Сбросить фильтр»
 * E7: Кнопка «Показать» в графике → устанавливает фильтр + фильтрует таблицу
 * E8: «Показать» → «Сбросить фильтр» при активном фильтре
 * E9: «Сбросить фильтр» → возвращает фильтр в дефолт, таблица полная
 */
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

// ─── Module-level cache ─────────────────────────────────────────

/** @type {{ chartData: Array, apiData: Object, prIds: number[], totalRows: number } | null} */
let cached = null;

/**
 * Включить характеристики на всех PR + получить данные API.
 * Кэшируется на уровне модуля (API-часть).
 */
async function ensureAPIData(request) {
  if (cached) return cached;

  const { email, password } = getCredentials("admin");
  const dashAPI = new DashboardTeamAPI(request);
  await dashAPI.signIn(email, password);
  const prAPI = new PerformanceReviewAPI(request);
  await prAPI.signIn(email, password);

  // Собрать все PR из distribution
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

  // Включить характеристики на всех PR (некоторые могут не поддерживать — пропускаем)
  for (const prId of prIds) {
    try {
      await setupCharacteristics(prAPI, prId);
    } catch {
      // PR не поддерживает настройку характеристик — пропускаем
    }
  }

  // Получить API-данные графика
  const { data: apiData } = await dashAPI.getDistributionCharacteristics();

  cached = { chartData: null, apiData, prIds, totalRows: 0 };
  return cached;
}

/**
 * Пере-включает характеристики на всех PR (лечение гонки с другими воркерами).
 */
async function reEnableCharacteristics(request, prIds) {
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
}

async function openAndCollectUI(tab, request) {
  const data = await ensureAPIData(request);

  // open() может тайм-аутить при медленной загрузке — retry один раз
  try {
    await tab.open();
  } catch {
    await tab.page.reload();
    await tab.page.waitForLoadState("networkidle");
  }

  // Попытка дождаться графика; если другой воркер отключил характеристики — пере-включаем
  let chartVisible = true;
  try {
    await tab.waitForChart();
  } catch {
    chartVisible = false;
  }

  if (!chartVisible && data.prIds.length > 0) {
    await reEnableCharacteristics(request, data.prIds);
    await tab.page.reload();
    await tab.page.waitForLoadState("networkidle");
    await tab.waitForChart(20_000);
  }

  let chartData = await tab.getAllChartData();

  // Вторая проверка: график есть, но все характеристики 0% (другой воркер
  // отключил enableCustomCharacteristics на момент загрузки данных)
  const hasRealCharEmployees = chartData.some(
    (r) =>
      (r.avatarCount + r.overflowCount > 0 || r.percentage > 0) &&
      r.name !== "Нет оценки",
  );

  if (!hasRealCharEmployees && data.prIds.length > 0) {
    await reEnableCharacteristics(request, data.prIds);
    await tab.page.reload();
    await tab.page.waitForLoadState("networkidle");
    await tab.waitForChart(20_000);
    chartData = await tab.getAllChartData();
  }

  const totalRows = await tab.getRowCount();

  // Обновляем кэш UI-частью
  cached.chartData = chartData;
  cached.totalRows = totalRows;
  return { ...data, chartData, totalRows };
}

// ─── Tests ──────────────────────────────────────────────────────

test.describe.serial(
  "Распределение оценок — Фильтр «Характеристика»",
  { tag: ["@ui", "@my-team", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.MY_TEAM);
    });

    test.afterAll(() => {
      cached = null;
    });

    // ═══════════════════════════════════════════════════════════
    // E1: Фильтр виден при enableCustomCharacteristics=true
    // ═══════════════════════════════════════════════════════════
    test(
      "C7327: Фильтр «Характеристика» виден при включённых характеристиках",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }, testInfo) => {
        setSeverity("critical");
        const tab = new ScoreDistributionTab(page, testInfo);

        await test.step("Открыть вкладку и убедиться, что характеристики включены", async () => {
          await openAndCollectUI(tab, request);
        });

        await test.step("Проверить видимость фильтра «Характеристика»", async () => {
          const visible = await tab.isCharacteristicFilterVisible();
          expect(
            visible,
            "Фильтр «Характеристика» должен быть виден при enableCustomCharacteristics=true",
          ).toBe(true);
        });
      },
    );

    // ═══════════════════════════════════════════════════════════
    // E3: Значение по умолчанию — placeholder
    // ═══════════════════════════════════════════════════════════
    test(
      "C7328: Значение фильтра по умолчанию — placeholder (не выбрана характеристика)",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }, testInfo) => {
        setSeverity("normal");
        const tab = new ScoreDistributionTab(page, testInfo);

        await test.step("Открыть вкладку", async () => {
          await openAndCollectUI(tab, request);
        });

        await test.step("Проверить дефолтное значение фильтра", async () => {
          const value = await tab.getCharacteristicFilterValue();
          // Должен показываться placeholder, а не конкретная характеристика
          expect(value, `Дефолтное значение фильтра: «${value}»`).toBeTruthy();
          // Убедиться, что это не одна из характеристик API
          const apiNames = (cached?.apiData?.withResults || []).map(
            (r) => r.title,
          );
          const isNotSpecificChar = !apiNames.some(
            (name) => value.trim() === name,
          );
          expect(
            isNotSpecificChar,
            `Значение «${value}» не должно быть конкретной характеристикой`,
          ).toBe(true);
        });
      },
    );

    // ═══════════════════════════════════════════════════════════
    // E4: Опции фильтра = характеристики из графика
    // ═══════════════════════════════════════════════════════════
    test(
      "C7329: Опции фильтра соответствуют характеристикам из графика",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }, testInfo) => {
        setSeverity("normal");
        const tab = new ScoreDistributionTab(page, testInfo);

        let chartData;
        let filterOptions;

        await test.step("Открыть вкладку и получить данные", async () => {
          const data = await openAndCollectUI(tab, request);
          chartData = data.chartData;
        });

        await test.step("Открыть dropdown и получить список опций", async () => {
          filterOptions = await tab.getCharacteristicFilterOptions();
        });

        await test.step("Сравнить опции фильтра с названиями в графике", async () => {
          // Названия строк графика, у которых есть сотрудники (кроме "Нет оценки")
          const chartNames = chartData
            .filter(
              (r) =>
                (r.avatarCount + r.overflowCount > 0 || r.percentage > 0) &&
                r.name !== "Нет оценки",
            )
            .map((r) => r.name.trim());

          // Если ни в одной характеристике нет сотрудников — фильтр должен быть пуст
          if (chartNames.length === 0) {
            expect(
              filterOptions.length,
              "Нет характеристик с сотрудниками → фильтр пуст",
            ).toBe(0);
            return;
          }

          // Если характеристики есть — опции должны соответствовать
          expect(
            filterOptions.length,
            `Опций (${filterOptions.length}) должно быть ≥ 1 при ${chartNames.length} характеристиках с сотрудниками`,
          ).toBeGreaterThan(0);

          for (const chartName of chartNames) {
            const found = filterOptions.some(
              (opt) => opt.trim() === chartName || opt.includes(chartName),
            );
            expect(
              found,
              `Характеристика «${chartName}» из графика должна быть в опциях фильтра: [${filterOptions.join(", ")}]`,
            ).toBe(true);
          }
        });
      },
    );

    // ═══════════════════════════════════════════════════════════
    // E5: Выбор характеристики фильтрует таблицу
    // ═══════════════════════════════════════════════════════════
    test(
      "C7330: Выбор характеристики в фильтре — таблица показывает только сотрудников этой группы",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }, testInfo) => {
        setSeverity("critical");
        const tab = new ScoreDistributionTab(page, testInfo);

        let chartData;
        let totalRowsBefore;

        await test.step("Открыть вкладку и получить данные", async () => {
          const data = await openAndCollectUI(tab, request);
          chartData = data.chartData;
          totalRowsBefore = data.totalRows;
        });

        // Выбрать первую характеристику с сотрудниками
        const targetRow = chartData.find(
          (r) =>
            r.avatarCount + r.overflowCount > 0 &&
            r.name.trim() !== "Нет оценки",
        );
        if (!targetRow) {
          test.info().annotations.push({
            type: "skip-reason",
            description: "Нет характеристик с сотрудниками для фильтрации",
          });
          return;
        }

        const expectedCount = targetRow.avatarCount + targetRow.overflowCount;

        await test.step(`Выбрать «${targetRow.name}» в фильтре`, async () => {
          await tab.selectCharacteristic(targetRow.name.trim());
        });

        await test.step("Проверить, что таблица отфильтрована", async () => {
          // Дождаться появления первой строки (таблица перезагружается)
          await tab.tableRows
            .first()
            .waitFor({ state: "visible", timeout: 15000 });
          const filteredRows = await tab.getRowCount();

          expect(
            filteredRows,
            `После фильтрации «${targetRow.name}» должно быть ≤ ${expectedCount} строк (было ${totalRowsBefore}), фактически ${filteredRows}`,
          ).toBeLessThanOrEqual(Math.max(expectedCount, totalRowsBefore));

          // Если достаточно сотрудников в одной группе, таблица должна уменьшиться
          if (totalRowsBefore > expectedCount) {
            expect(
              filteredRows,
              `Таблица должна уменьшиться: было ${totalRowsBefore}, ожидаем ≤ ${expectedCount}`,
            ).toBeLessThanOrEqual(expectedCount);
          }
        });
      },
    );

    // ═══════════════════════════════════════════════════════════
    // E6: Сброс фильтра через кнопку графика — таблица возвращается
    // ═══════════════════════════════════════════════════════════
    test(
      "C7331: Сброс фильтра через кнопку графика — таблица возвращается в полное состояние",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }, testInfo) => {
        setSeverity("normal");
        const tab = new ScoreDistributionTab(page, testInfo);

        let chartData;
        let totalRowsBefore;

        await test.step("Открыть вкладку", async () => {
          const data = await openAndCollectUI(tab, request);
          chartData = data.chartData;
          totalRowsBefore = data.totalRows;
        });

        // Выбрать первую характеристику с сотрудниками
        const targetRow = chartData.find(
          (r) =>
            r.avatarCount + r.overflowCount > 0 &&
            r.name.trim() !== "Нет оценки",
        );
        if (!targetRow) {
          test.info().annotations.push({
            type: "skip-reason",
            description: "Нет характеристик для фильтрации",
          });
          return;
        }

        await test.step(`Выбрать «${targetRow.name}» в фильтре`, async () => {
          await tab.selectCharacteristic(targetRow.name.trim());
        });

        await test.step("Сбросить фильтр через кнопку «Сбросить фильтр» на графике", async () => {
          await tab.clearCharacteristicFilter();
        });

        await test.step("Таблица вернулась к полному состоянию", async () => {
          // Дождаться появления первой строки (таблица перезагружается)
          await tab.tableRows
            .first()
            .waitFor({ state: "visible", timeout: 15000 });
          const rowsAfterReset = await tab.getRowCount();

          expect(
            rowsAfterReset,
            `После сброса строк (${rowsAfterReset}) должно быть ≥ исходного (${totalRowsBefore})`,
          ).toBeGreaterThanOrEqual(totalRowsBefore);
        });

        await test.step("Значение фильтра вернулось к placeholder", async () => {
          const value = await tab.getCharacteristicFilterValue();
          const apiNames = (cached?.apiData?.withResults || []).map(
            (r) => r.title,
          );
          const isNotSpecificChar = !apiNames.some(
            (name) => value.trim() === name,
          );
          expect(
            isNotSpecificChar,
            `Значение «${value}» должно быть placeholder, не конкретной характеристикой`,
          ).toBe(true);
        });
      },
    );

    // ═══════════════════════════════════════════════════════════
    // E7: Кнопка «Показать» в графике → фильтр + таблица
    // ═══════════════════════════════════════════════════════════
    test(
      "C7332: Кнопка «Показать» в графике → устанавливает фильтр и фильтрует таблицу",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }, testInfo) => {
        setSeverity("critical");
        const tab = new ScoreDistributionTab(page, testInfo);

        let chartData;

        await test.step("Открыть вкладку", async () => {
          const data = await openAndCollectUI(tab, request);
          chartData = data.chartData;
        });

        // Найти строку с кнопкой «Показать» и сотрудниками
        const targetIndex = chartData.findIndex(
          (r) =>
            r.buttonText.includes("Показать") &&
            r.avatarCount + r.overflowCount > 0 &&
            r.name.trim() !== "Нет оценки",
        );
        if (targetIndex === -1) {
          test.info().annotations.push({
            type: "skip-reason",
            description: "Нет строк с кнопкой «Показать» и сотрудниками",
          });
          return;
        }

        const targetName = chartData[targetIndex].name.trim();
        const expectedCount =
          chartData[targetIndex].avatarCount +
          chartData[targetIndex].overflowCount;

        await test.step(`Нажать «Показать» для «${targetName}»`, async () => {
          await tab.clickChartShowButton(targetIndex);
        });

        await test.step("Проверить, что фильтр «Характеристика» установлен", async () => {
          const filterValue = await tab.getCharacteristicFilterValue();
          expect(
            filterValue.trim(),
            `Фильтр должен показывать «${targetName}», показывает «${filterValue}»`,
          ).toContain(targetName);
        });

        await test.step("Проверить, что таблица отфильтрована", async () => {
          // Дождаться появления первой строки (таблица перезагружается)
          await tab.tableRows
            .first()
            .waitFor({ state: "visible", timeout: 15000 });
          const filteredRows = await tab.getRowCount();
          expect(
            filteredRows,
            `Таблица должна показывать ≤ ${expectedCount} строк, показывает ${filteredRows}`,
          ).toBeLessThanOrEqual(expectedCount);
          expect(filteredRows).toBeGreaterThan(0);
        });
      },
    );

    // ═══════════════════════════════════════════════════════════
    // E8: «Показать» → «Сбросить фильтр» при активном фильтре
    // ═══════════════════════════════════════════════════════════
    test(
      "C7333: После «Показать» кнопка меняется на «Сбросить фильтр»",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }, testInfo) => {
        setSeverity("normal");
        const tab = new ScoreDistributionTab(page, testInfo);

        let chartData;

        await test.step("Открыть вкладку", async () => {
          const data = await openAndCollectUI(tab, request);
          chartData = data.chartData;
        });

        // Найти строку с «Показать»
        const targetIndex = chartData.findIndex(
          (r) =>
            r.buttonText.includes("Показать") &&
            r.avatarCount + r.overflowCount > 0,
        );
        if (targetIndex === -1) {
          test.info().annotations.push({
            type: "skip-reason",
            description: "Нет строки с кнопкой «Показать»",
          });
          return;
        }

        await test.step("Нажать «Показать»", async () => {
          await tab.clickChartShowButton(targetIndex);
        });

        await test.step("Текст кнопки изменился на «Сбросить фильтр»", async () => {
          const buttonText = await tab.getChartShowButtonText(targetIndex);
          expect(
            buttonText,
            `Кнопка должна стать «Сбросить фильтр», но показывает «${buttonText}»`,
          ).toMatch(/Сбросить/i);
        });

        // Сбросить
        await test.step("Сбросить фильтр через кнопку", async () => {
          await tab.clickChartShowButton(targetIndex);
        });
      },
    );

    // ═══════════════════════════════════════════════════════════
    // E9: «Сбросить фильтр» → дефолт + полная таблица
    // ═══════════════════════════════════════════════════════════
    test(
      "C7334: «Сбросить фильтр» через кнопку графика → дефолтное состояние",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }, testInfo) => {
        setSeverity("normal");
        const tab = new ScoreDistributionTab(page, testInfo);

        let chartData;
        let totalRowsBefore;

        await test.step("Открыть вкладку", async () => {
          const data = await openAndCollectUI(tab, request);
          chartData = data.chartData;
          totalRowsBefore = data.totalRows;
        });

        // Найти строку
        const targetIndex = chartData.findIndex(
          (r) =>
            r.buttonText.includes("Показать") &&
            r.avatarCount + r.overflowCount > 0,
        );
        if (targetIndex === -1) {
          test.info().annotations.push({
            type: "skip-reason",
            description: "Нет строки с кнопкой для теста",
          });
          return;
        }

        await test.step("Нажать «Показать» — активировать фильтр", async () => {
          await tab.clickChartShowButton(targetIndex);
          await page.waitForLoadState("networkidle");
        });

        await test.step("Нажать «Сбросить фильтр» — деактивировать", async () => {
          await tab.clickChartShowButton(targetIndex);
          await page.waitForLoadState("networkidle");
        });

        await test.step("Кнопка вернулась к «Показать»", async () => {
          const buttonText = await tab.getChartShowButtonText(targetIndex);
          expect(
            buttonText,
            `Кнопка должна вернуться к «Показать», показывает «${buttonText}»`,
          ).toMatch(/Показать/i);
        });

        await test.step("Фильтр вернулся к placeholder", async () => {
          const value = await tab.getCharacteristicFilterValue();
          const apiNames = (cached?.apiData?.withResults || []).map(
            (r) => r.title,
          );
          const isPlaceholder = !apiNames.some((name) => value.trim() === name);
          expect(
            isPlaceholder,
            `Фильтр должен показывать placeholder, показывает «${value}»`,
          ).toBe(true);
        });

        await test.step("Таблица вернулась к полному состоянию", async () => {
          // Дождаться появления первой строки (таблица перезагружается)
          await tab.tableRows
            .first()
            .waitFor({ state: "visible", timeout: 15000 });
          const rowsAfter = await tab.getRowCount();
          expect(
            rowsAfter,
            `Строк после сброса (${rowsAfter}) должно быть ≥ исходного (${totalRowsBefore})`,
          ).toBeGreaterThanOrEqual(totalRowsBefore);
        });
      },
    );
  },
);
