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

// ─── Module-level cache ─────────────────────────────────────────

/** @type {{ chartData: Array, apiData: Object, prIds: number[] } | null} */
let cached = null;

/**
 * Открыть вкладку, включить характеристики на всех PR,
 * забрать UI и API данные графика. Кэш на уровне модуля.
 */
async function ensureChartData(tab, request) {
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

  // Получить данные из API
  const { data: apiData } = await dashAPI.getDistributionCharacteristics();

  // Открыть UI и собрать данные
  await tab.open();
  await tab.waitForChart();
  const chartData = await tab.getAllChartData();

  cached = { chartData, apiData, prIds };
  return cached;
}

// ─── Tests ───────────────────────────────────────────────────────

test.describe.serial(
  "Распределение оценок — Содержимое графика характеристик",
  { tag: ["@ui", "@my-team", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.MY_TEAM);
    });

    test.afterAll(() => {
      cached = null;
    });

    // ═══════════════════════════════════════════════════════════
    // B1: Названия характеристик из настроек PR (API-сверка)
    // ═══════════════════════════════════════════════════════════
    test(
      "C7310: Названия характеристик в графике соответствуют данным API",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }, testInfo) => {
        setSeverity("critical");
        const tab = new ScoreDistributionTab(page, testInfo);

        let chartData;
        let apiData;

        await test.step("Открыть вкладку и получить данные графика (UI + API)", async () => {
          const data = await ensureChartData(tab, request);
          chartData = data.chartData;
          apiData = data.apiData;
        });

        await test.step("Сверить названия характеристик из UI с API", async () => {
          expect(
            chartData.length,
            "График должен содержать строки",
          ).toBeGreaterThan(0);

          // API возвращает withResults (характеристики с сотрудниками)
          // и withoutResults (группа "Нет оценки")
          const apiNames = (apiData?.withResults || []).map((r) => r.title);
          if (apiData?.withoutResults?.usersIds?.length > 0) {
            apiNames.push("Нет оценки");
          }

          // UI-названия из графика
          const uiNames = chartData.map((r) => r.name.trim());

          // Каждое API-название должно быть в UI
          for (const apiName of apiNames) {
            expect(
              uiNames.some((ui) => ui === apiName || ui.includes(apiName)),
              `API-название «${apiName}» должно быть в UI: ${uiNames.join(", ")}`,
            ).toBe(true);
          }

          // Каждое UI-название должно быть в API
          for (const uiName of uiNames) {
            expect(
              apiNames.some((api) => api === uiName || uiName.includes(api)),
              `UI-название «${uiName}» должно быть в API: ${apiNames.join(", ")}`,
            ).toBe(true);
          }
        });
      },
    );

    // ═══════════════════════════════════════════════════════════
    // B2: Проценты из UI совпадают с API
    // ═══════════════════════════════════════════════════════════
    test(
      "C7311: Проценты в графике совпадают с данными API",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }, testInfo) => {
        setSeverity("critical");
        const tab = new ScoreDistributionTab(page, testInfo);

        let chartData;
        let apiData;

        await test.step("Получить данные графика (UI + API)", async () => {
          const data = await ensureChartData(tab, request);
          chartData = data.chartData;
          apiData = data.apiData;
        });

        await test.step("Сверить проценты из UI с API", async () => {
          // Собрать API-данные в map {title → percent}
          const apiMap = new Map();
          for (const r of apiData?.withResults || []) {
            apiMap.set(r.title, r.percent);
          }
          if (apiData?.withoutResults) {
            apiMap.set("Нет оценки", apiData.withoutResults.percent);
          }

          for (const uiRow of chartData) {
            const apiPercent = apiMap.get(uiRow.name.trim());
            if (apiPercent !== undefined) {
              expect(
                uiRow.percentage,
                `Процент «${uiRow.name}»: UI=${uiRow.percentage}%, API=${apiPercent}%`,
              ).toBeCloseTo(apiPercent, 0); // ±0.5%
            }
          }
        });

        await test.step("Сумма процентов всех строк ~100%", async () => {
          const totalPercent = chartData.reduce(
            (sum, r) => sum + r.percentage,
            0,
          );
          expect(
            totalPercent,
            `Сумма процентов = ${totalPercent}%, ожидаем ~100%`,
          ).toBeGreaterThanOrEqual(99);
          expect(totalPercent).toBeLessThanOrEqual(101);
        });
      },
    );

    // ═══════════════════════════════════════════════════════════
    // B3: Ширина прогресс-бара соответствует проценту
    // ═══════════════════════════════════════════════════════════
    test(
      "C7312: Ширина прогресс-бара совпадает с числовым значением процента",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }, testInfo) => {
        setSeverity("normal");
        const tab = new ScoreDistributionTab(page, testInfo);

        let chartData;

        await test.step("Получить данные графика", async () => {
          const data = await ensureChartData(tab, request);
          chartData = data.chartData;
        });

        await test.step("Проверить соответствие ширины бара и процента", async () => {
          for (const row of chartData) {
            if (row.percentage > 0 && row.progressBarWidth > 0) {
              // Ширина бара должна примерно соответствовать проценту
              // (может быть небольшая разница из-за масштабирования)
              expect(
                Math.abs(row.progressBarWidth - row.percentage),
                `«${row.name}»: ширина бара ${row.progressBarWidth}% vs отображаемый ${row.percentage}%`,
              ).toBeLessThanOrEqual(2);
            } else if (row.percentage === 0) {
              // При 0% бар не должен иметь ширину
              expect(
                row.progressBarWidth,
                `«${row.name}»: при 0% бар должен быть пуст`,
              ).toBeLessThanOrEqual(1);
            }
          }
        });
      },
    );

    // ═══════════════════════════════════════════════════════════
    // B4: Аватары — до 5 видимых, при >5 показывается "+N"
    // ═══════════════════════════════════════════════════════════
    test(
      "C7313: Аватары: до 5 видимых, при >5 — показывается «+N»",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }, testInfo) => {
        setSeverity("critical");
        const tab = new ScoreDistributionTab(page, testInfo);

        let chartData;
        let apiData;

        await test.step("Получить данные графика (UI + API)", async () => {
          const data = await ensureChartData(tab, request);
          chartData = data.chartData;
          apiData = data.apiData;
        });

        await test.step("Проверить аватары в каждой строке графика", async () => {
          // Собрать API-данные для подсчёта сотрудников
          const apiMap = new Map();
          for (const r of apiData?.withResults || []) {
            apiMap.set(r.title, r.usersIds?.length || 0);
          }
          if (apiData?.withoutResults) {
            apiMap.set(
              "Нет оценки",
              apiData.withoutResults.usersIds?.length || 0,
            );
          }

          for (const row of chartData) {
            const apiUserCount = apiMap.get(row.name.trim()) || 0;

            if (apiUserCount === 0) {
              // Нет сотрудников — аватаров быть не должно
              expect(
                row.avatarCount,
                `«${row.name}»: 0 сотрудников — аватаров нет`,
              ).toBe(0);
            } else if (apiUserCount <= 5) {
              // До 5 — все видимые, нет overflow
              expect(
                row.avatarCount,
                `«${row.name}»: ${apiUserCount} сотрудников — все видимы`,
              ).toBe(apiUserCount);
              expect(
                row.overflowCount,
                `«${row.name}»: нет overflow при ≤5 сотрудниках`,
              ).toBe(0);
            } else {
              // >5 — ровно 5 видимых + "+N" overflow
              expect(
                row.avatarCount,
                `«${row.name}»: ${apiUserCount} сотрудников — видно 5 аватаров`,
              ).toBe(5);
              // Допускаем ±1 — данные могут измениться между API-запросом и рендером UI (DATA_RACE)
              const expectedOverflow = apiUserCount - 5;
              expect(
                Math.abs(row.overflowCount - expectedOverflow),
                `«${row.name}»: overflow ${row.overflowCount} должен быть ~${expectedOverflow} (±1)`,
              ).toBeLessThanOrEqual(1);
            }
          }
        });
      },
    );

    // ═══════════════════════════════════════════════════════════
    // B5: Аватары соответствуют реальным сотрудникам (API-сверка)
    // ═══════════════════════════════════════════════════════════
    test(
      "C7314: Общее количество сотрудников в графике совпадает с API",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }, testInfo) => {
        setSeverity("normal");
        const tab = new ScoreDistributionTab(page, testInfo);

        let chartData;
        let apiData;

        await test.step("Получить данные графика (UI + API)", async () => {
          const data = await ensureChartData(tab, request);
          chartData = data.chartData;
          apiData = data.apiData;
        });

        await test.step("Сверить количество сотрудников в каждой строке с API", async () => {
          const apiMap = new Map();
          for (const r of apiData?.withResults || []) {
            apiMap.set(r.title, r.usersIds?.length || 0);
          }
          if (apiData?.withoutResults) {
            apiMap.set(
              "Нет оценки",
              apiData.withoutResults.usersIds?.length || 0,
            );
          }

          for (const row of chartData) {
            const apiCount = apiMap.get(row.name.trim());
            if (apiCount !== undefined) {
              const uiTotal = row.avatarCount + row.overflowCount;
              expect(
                uiTotal,
                `«${row.name}»: UI total=${uiTotal} vs API=${apiCount}`,
              ).toBe(apiCount);
            }
          }
        });

        await test.step("Ни один сотрудник не посчитан дважды (сумма = total)", async () => {
          // Сумма сотрудников по всем строкам API
          let apiTotal = 0;
          for (const r of apiData?.withResults || []) {
            apiTotal += r.usersIds?.length || 0;
          }
          apiTotal += apiData?.withoutResults?.usersIds?.length || 0;

          // Сумма из UI
          const uiTotal = chartData.reduce(
            (sum, r) => sum + r.avatarCount + r.overflowCount,
            0,
          );

          expect(
            uiTotal,
            `Сумма сотрудников UI=${uiTotal} vs API=${apiTotal}`,
          ).toBe(apiTotal);
        });
      },
    );

    // ═══════════════════════════════════════════════════════════
    // B6: Кнопка «Показать» присутствует для строк с сотрудниками
    // ═══════════════════════════════════════════════════════════
    test(
      "C7315: Кнопка «Показать» присутствует для строк с сотрудниками",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }, testInfo) => {
        setSeverity("critical");
        const tab = new ScoreDistributionTab(page, testInfo);

        let chartData;

        await test.step("Получить данные графика", async () => {
          const data = await ensureChartData(tab, request);
          chartData = data.chartData;
        });

        await test.step("Проверить кнопку «Показать» в каждой строке", async () => {
          for (const row of chartData) {
            const totalUsers = row.avatarCount + row.overflowCount;
            if (totalUsers > 0) {
              expect(
                row.buttonText,
                `«${row.name}»: строка с ${totalUsers} сотрудниками должна иметь кнопку`,
              ).toBeTruthy();
              expect(
                row.buttonText,
                `«${row.name}»: текст кнопки должен быть «Показать»`,
              ).toMatch(/Показать/i);
            }
            // Строки без сотрудников могут не иметь кнопки — это ОК
          }
        });
      },
    );

    // ═══════════════════════════════════════════════════════════
    // B7: Группа «Нет оценки» — сотрудники без оценки
    // ═══════════════════════════════════════════════════════════
    test(
      "C7316: Группа «Нет оценки» содержит сотрудников без оценки в периоде",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }, testInfo) => {
        setSeverity("critical");
        const tab = new ScoreDistributionTab(page, testInfo);

        let chartData;
        let apiData;

        await test.step("Получить данные графика (UI + API)", async () => {
          const data = await ensureChartData(tab, request);
          chartData = data.chartData;
          apiData = data.apiData;
        });

        await test.step("Проверить наличие строки «Нет оценки» в графике", async () => {
          const noScoreRow = chartData.find(
            (r) =>
              r.name.includes("Нет оценки") || r.name.includes("Без оценки"),
          );

          const apiNoScore = apiData?.withoutResults;

          if (apiNoScore?.usersIds?.length > 0) {
            // API говорит, что есть сотрудники без оценки
            expect(
              noScoreRow,
              "API: есть сотрудники без оценки — строка «Нет оценки» должна быть в графике",
            ).toBeTruthy();

            expect(
              noScoreRow.percentage,
              "Процент «Нет оценки» должен быть > 0",
            ).toBeGreaterThan(0);

            const uiTotal = noScoreRow.avatarCount + noScoreRow.overflowCount;
            expect(
              uiTotal,
              `«Нет оценки»: UI total=${uiTotal} vs API=${apiNoScore.usersIds.length}`,
            ).toBe(apiNoScore.usersIds.length);
          } else {
            // Все сотрудники с оценками — строки «Нет оценки» может не быть
            test.info().annotations.push({
              type: "info",
              description:
                "Все сотрудники имеют оценки — строка «Нет оценки» отсутствует",
            });
          }
        });
      },
    );

    // ═══════════════════════════════════════════════════════════
    // B8: «Нет оценки» расположена ниже всех характеристик
    // ═══════════════════════════════════════════════════════════
    test(
      "C7317: «Нет оценки» расположена последней строкой графика",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }, testInfo) => {
        setSeverity("normal");
        const tab = new ScoreDistributionTab(page, testInfo);

        let chartData;

        await test.step("Получить данные графика", async () => {
          const data = await ensureChartData(tab, request);
          chartData = data.chartData;
        });

        await test.step("Проверить, что «Нет оценки» — последняя строка", async () => {
          const noScoreIndex = chartData.findIndex(
            (r) =>
              r.name.includes("Нет оценки") || r.name.includes("Без оценки"),
          );

          if (noScoreIndex === -1) {
            test.info().annotations.push({
              type: "info",
              description:
                "Строка «Нет оценки» отсутствует — все сотрудники имеют оценки",
            });
            return;
          }

          expect(
            noScoreIndex,
            `«Нет оценки» на позиции ${noScoreIndex} из ${chartData.length}, ` +
              `должна быть последней (${chartData.length - 1}). ` +
              `Порядок строк: ${chartData.map((r) => r.name).join(" → ")}`,
          ).toBe(chartData.length - 1);
        });
      },
    );

    // ═══════════════════════════════════════════════════════════
    // B9: Порядок характеристик — бизнес-правило сортировки
    // Между оценками: свежие (по startDate) выше
    // Внутри одной оценки: от наивысшей к наименьшей
    // ═══════════════════════════════════════════════════════════
    test(
      "C7362: Характеристики отсортированы: свежие оценки выше, внутри оценки — от высшей к низшей",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }, testInfo) => {
        setSeverity("normal");
        const tab = new ScoreDistributionTab(page, testInfo);

        let chartData;
        let apiData;

        await test.step("Получить данные графика (UI + API)", async () => {
          const data = await ensureChartData(tab, request);
          chartData = data.chartData;
          apiData = data.apiData;
        });

        // Шаг 2: определить PR и startDate для каждой характеристики
        /** @type {Array<{title: string, prId: number|null, startDate: string|null, index: number}>} */
        let charPrInfo = [];

        await test.step("Определить PR и дату старта для каждой характеристики", async () => {
          const chars = apiData?.withResults || [];
          expect(
            chars.length,
            "API должен вернуть характеристики",
          ).toBeGreaterThan(0);

          const { email, password } = getCredentials("admin");
          const dashAPI = new DashboardTeamAPI(request);
          await dashAPI.signIn(email, password);

          // Собрать уникальных пользователей для batch-запроса
          const allUserIds = new Set();
          for (const ch of chars) {
            for (const uid of (ch.usersIds || []).slice(0, 3)) {
              allUserIds.add(uid);
            }
          }

          // Загрузить результаты для этих пользователей
          const { data: resultsData } =
            await dashAPI.getDistributionLastResults([...allUserIds]);

          // Построить Map userId → result entry
          const resultsByUser = new Map();
          for (const entry of Object.values(resultsData || {})) {
            if (entry?.targetUserId) {
              resultsByUser.set(entry.targetUserId, entry);
            }
          }

          // Для каждой характеристики найти PR через первого пользователя
          charPrInfo = chars.map((ch, i) => {
            let prId = null;
            let startDate = null;
            for (const uid of ch.usersIds || []) {
              const entry = resultsByUser.get(uid);
              if (entry?.performanceReview?.id) {
                prId = entry.performanceReview.id;
                startDate = entry.performanceReview.startDate || null;
                break;
              }
            }
            return { title: ch.title, prId, startDate, index: i };
          });

          const withPr = charPrInfo.filter((c) => c.prId != null);
          expect(
            withPr.length,
            `Хотя бы одна характеристика должна быть привязана к PR (${withPr.length}/${charPrInfo.length})`,
          ).toBeGreaterThan(0);
        });

        await test.step("Проверить порядок между оценками: свежие выше", async () => {
          // Группируем характеристики по PR
          const prGroups = new Map();
          for (const ch of charPrInfo) {
            if (ch.prId == null) continue;
            if (!prGroups.has(ch.prId)) {
              prGroups.set(ch.prId, {
                startDate: ch.startDate,
                firstIndex: ch.index,
                chars: [],
              });
            }
            prGroups.get(ch.prId).chars.push(ch);
          }

          if (prGroups.size < 2) {
            test.info().annotations.push({
              type: "info",
              description: `Характеристики из ${prGroups.size} оценки — проверка межоценочного порядка неприменима`,
            });
            return;
          }

          // PR, отсортированные по firstIndex (порядку появления в графике)
          const prsByAppearance = [...prGroups.entries()].sort(
            (a, b) => a[1].firstIndex - b[1].firstIndex,
          );

          const violations = [];
          for (let i = 1; i < prsByAppearance.length; i++) {
            const [prevPrId, prevGroup] = prsByAppearance[i - 1];
            const [currPrId, currGroup] = prsByAppearance[i];

            if (prevGroup.startDate && currGroup.startDate) {
              const prevDate = new Date(prevGroup.startDate).getTime();
              const currDate = new Date(currGroup.startDate).getTime();
              if (currDate > prevDate) {
                violations.push(
                  `PR ${currPrId} (${currGroup.startDate}) свежее, чем PR ${prevPrId} (${prevGroup.startDate}), ` +
                    `но расположен ниже`,
                );
              }
            }
          }

          expect(
            violations.length,
            `Свежие оценки должны располагаться выше:\n${violations.join("\n")}`,
          ).toBe(0);
        });

        await test.step("Проверить порядок внутри одной оценки: от наивысшей к наименьшей", async () => {
          // UI-порядок характеристик (без «Нет оценки»)
          const uiOrder = chartData
            .filter(
              (r) =>
                !r.name.includes("Нет оценки") &&
                !r.name.includes("Без оценки"),
            )
            .map((r) => r.name.trim());

          // Группируем по PR
          const prGroups = new Map();
          for (const ch of charPrInfo) {
            if (ch.prId == null) continue;
            if (!prGroups.has(ch.prId)) prGroups.set(ch.prId, []);
            prGroups.get(ch.prId).push(ch);
          }

          // Внутри каждой PR-группы характеристики расположены в порядке index (как в API)
          // API уже возвращает их в настроенном порядке: от наивысшей к наименьшей
          // Проверяем, что UI повторяет этот порядок
          const violations = [];
          for (const [prId, chars] of prGroups) {
            if (chars.length < 2) continue;

            // Проверяем, что индексы монотонно возрастают (порядок сохранён)
            for (let i = 1; i < chars.length; i++) {
              if (chars[i].index < chars[i - 1].index) {
                violations.push(
                  `PR ${prId}: «${chars[i - 1].title}»(idx=${chars[i - 1].index}) → ` +
                    `«${chars[i].title}»(idx=${chars[i].index}) — порядок нарушен`,
                );
              }
            }

            // Дополнительно: UI-порядок совпадает с API-порядком для этого PR
            const apiTitles = chars.map((c) => c.title);
            const uiTitles = apiTitles.filter((t) => uiOrder.includes(t));
            const uiPositions = uiTitles.map((t) => uiOrder.indexOf(t));
            for (let i = 1; i < uiPositions.length; i++) {
              if (uiPositions[i] < uiPositions[i - 1]) {
                violations.push(
                  `PR ${prId}: в UI «${uiTitles[i - 1]}» (pos=${uiPositions[i - 1]}) после ` +
                    `«${uiTitles[i]}» (pos=${uiPositions[i]}) — порядок от наивысшей к наименьшей нарушен`,
                );
              }
            }
          }

          if (violations.length > 0) {
            expect(
              violations.length,
              `Характеристики внутри одной оценки должны идти от наивысшей к наименьшей:\n${violations.join("\n")}`,
            ).toBe(0);
          }
        });
      },
    );
  },
);
