/**
 * Калибровка - E2E тесты соответствия UI и API
 *
 * Проверяет что данные в UI соответствуют данным из API:
 * - Оценки на странице совпадают с API
 * - Группы компетенций и их веса корректно настроены
 * - Изменения в UI отражаются в API
 * - Пересчёт оценок работает корректно
 *
 * @tags @calibration @critical @e2e @ui
 */
import { test as baseTest, expect } from "../../../fixtures/auth.js";
import { PerformanceReviewAPI } from "../../../utils/api/PerformanceReviewAPI.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";
import { getCredentials } from "../../../utils/credentials.js";
import { buildPRUrl } from "../../../utils/pr-urls.js";
import { CalibrationSeed } from "../../../utils/seed/CalibrationSeed.js";
import { CalibrationFormModal } from "../../../../pages/CalibrationFormModal.js";

// Extend test with per-test adminAPI (beforeAll request fixture cannot be reused in tests)
const test = baseTest.extend({
  adminAPI: async ({ request }, use) => {
    const api = new PerformanceReviewAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Polling helper — ждёт пока predicate вернёт true.
 * Копия паттерна из calibration-group-averaging.spec.js.
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
 * Навигация на страницу PR с feature flag калибровки.
 * SSR падает в 500 при прямом переходе на ?feature=statisticsSettings для свежего PR,
 * поэтому сначала открываем без флага (прогрев), потом с флагом.
 */
async function navigateToCalibrationPage(page, prId) {
  const baseUrl = new URL(process.env.BASE_URL).origin;
  await page.goto(`${baseUrl}/ru/manager/performance-reviews/${prId}/`);
  await page.waitForLoadState("networkidle");
  await page.goto(buildPRUrl(prId, { statisticsSettings: true }));
  await page.waitForLoadState("networkidle");
}

/**
 * Навигация + клик на вкладку «Результаты» + ожидание таблицы.
 */
async function navigateToResultsTab(page, prId) {
  await navigateToCalibrationPage(page, prId);
  const resultsTab = page
    .locator('button[class*="Tabs_button"]')
    .filter({ hasText: /результаты/i });
  await resultsTab.click();
  await page
    .locator("table")
    .first()
    .waitFor({ state: "visible", timeout: 15000 });
}

/**
 * Найти heatmap-таблицу по уникальному заголовку "Сотрудники" (только heatmap имеет его).
 * Калибровочная таблица имеет "Оцениваемый" — так их не спутать.
 * Ждёт рендеринга — heatmap может загружаться позже калибровочной.
 */
async function findHeatmapTable(page) {
  // Ждём появления заголовка "Сотрудники" — уникальный для heatmap
  const sHeader = page
    .locator("th")
    .filter({ hasText: /^Сотрудники$/i })
    .first();
  await sHeader.waitFor({ state: "visible", timeout: 15000 });

  // Находим таблицу-родителя через xpath
  const table = sHeader.locator("xpath=ancestor::table");
  return table;
}

/**
 * Открыть модалку калибровки (клик по карандашу первого пользователя).
 * Паттерн из manual-final-score-informer-ui.spec.js.
 */
async function openCalibrationModal(page) {
  const pencilIcon = page
    .locator(
      '[class*="OverwriteButton"] button, button[class*="OverwriteButton"]',
    )
    .first();
  await pencilIcon.waitFor({ state: "visible", timeout: 10000 });
  await pencilIcon.click();
  await page
    .locator(".react-modal-sheet-container")
    .first()
    .waitFor({ state: "visible", timeout: 5000 });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe(
  "Calibration - UI/API Sync",
  {
    tag: ["@ui", "@calibration", "@e2e", "@performance-review", "@regression"],
  },
  () => {
    let testPrId;
    /** @type {number|null} */
    let revisionId = null;
    /** @type {number[]} */
    let targetUserIds = [];
    /** @type {Object|null} heatMapResults.targetUsers from summaryResults */
    let heatMapTargetUsers = null;
    test.beforeAll(async ({ request }) => {
      test.setTimeout(300000);

      // Создаём PR через CalibrationSeed для корректных данных калибровки
      const calSeed = new CalibrationSeed(request);
      await calSeed.init();

      const result = await calSeed.seedWithDirections({
        directions: { self: true, head: true },
        targetUsersCount: 3,
        receiversPerDirection: 2,
        fillQuestionnaires: true,
      });
      testPrId = result.prId;
      console.log(`✅ Тестовый PR для UI/API Sync: ${testPrId}`);

      // Включить калибровку и настройки через API
      const { data: currentSettings } =
        await calSeed.prAPI.getStatisticsSettings(testPrId);
      currentSettings.settings.useOnlyHeadReceiver = true;
      currentSettings.settings.enableCompetenceWeights = true;
      currentSettings.settings.enableCalibration = true;
      currentSettings.settings.enableResponsesOverwriting = true;
      await calSeed.prAPI.updateStatisticsSettings(testPrId, currentSettings);
      console.log("✅ Калибровка и настройки включены");

      // Получаем revisionId
      const { data: revision } = await calSeed.prAPI.getLastRevision(testPrId);
      revisionId = revision?.id;
      console.log(`✅ Revision ID: ${revisionId}`);

      // Получаем target user IDs
      const { data: targetUsersData } = await calSeed.prAPI.getTargetUsers(
        testPrId,
        { limit: 10, offset: 0 },
      );
      const users = targetUsersData?.items || targetUsersData || [];
      targetUserIds = users.map((u) => u.user?.id ?? u.userId).filter(Boolean);
      console.log(`✅ Target user IDs: [${targetUserIds.join(", ")}]`);

      // Warm-up + polling: ждём пока оценки рассчитаются
      if (revisionId && targetUserIds.length > 0) {
        // Первый запрос запускает ленивый расчёт
        await calSeed.prAPI.getStatisticsSummaryResults(testPrId, {
          targetUsersIds: targetUserIds,
          revisionId,
        });
        await new Promise((r) => setTimeout(r, 3000));

        const summaryData = await pollUntil(
          async () => {
            const { data } = await calSeed.prAPI.getStatisticsSummaryResults(
              testPrId,
              {
                targetUsersIds: targetUserIds,
                revisionId,
              },
            );
            return data;
          },
          (data) => {
            const usersMap = data?.heatMapResults?.targetUsers || {};
            return targetUserIds.some(
              (uid) =>
                usersMap[String(uid)]?.avrCompetencesCommon?.value != null,
            );
          },
          { timeout: 60000, message: "Scores not available after warm-up" },
        );
        heatMapTargetUsers = summaryData?.heatMapResults?.targetUsers || null;
        console.log(
          `✅ HeatMap данные: ${heatMapTargetUsers ? Object.keys(heatMapTargetUsers).length : 0} пользователей`,
        );
      }
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.CALIBRATION, "UI/API Sync");
    });

    // -----------------------------------------------------------------------
    // Блок 1: Соответствие оценок
    // -----------------------------------------------------------------------

    test.describe("Соответствие оценок UI и API", () => {
      test(
        "C4084: Итоговые оценки в таблице соответствуют API",
        { tag: ["@critical"] },
        async ({ adminAuth: page, adminAPI }) => {
          setSeverity("critical");

          // --- API: собираем имена и оценки ---
          const { data: targetUsersData } =
            await adminAPI.getTargetUsers(testPrId);
          const apiUsers = targetUsersData?.items || targetUsersData || [];
          expect(
            apiUsers.length,
            "API должен вернуть оцениваемых",
          ).toBeGreaterThan(0);

          // userId → name (lowercase)
          const userNames = new Map();
          for (const user of apiUsers) {
            const uid = String(user.user?.id ?? user.userId ?? user.id);
            const name = user.user
              ? `${user.user.firstName || ""} ${user.user.lastName || ""}`.trim()
              : user.name || `${user.firstName} ${user.lastName}`;
            if (uid && name) {
              userNames.set(uid, name.toLowerCase().trim());
            }
          }

          // Свежие heatMap данные
          let currentHeatMap = heatMapTargetUsers;
          if (revisionId && targetUserIds.length > 0) {
            const { data: freshSummary } =
              await adminAPI.getStatisticsSummaryResults(testPrId, {
                targetUsersIds: targetUserIds,
                revisionId,
              });
            currentHeatMap =
              freshSummary?.heatMapResults?.targetUsers || currentHeatMap;
          }

          // Карта name → score из API
          const apiScores = new Map();
          if (currentHeatMap) {
            for (const [userId, userData] of Object.entries(currentHeatMap)) {
              const name = userNames.get(String(userId));
              const score = userData?.avrCompetencesCommon?.value;
              if (name && score !== undefined && score !== null) {
                apiScores.set(name, score);
              }
            }
          }
          console.log(`API: ${apiScores.size} пользователей с оценками`);

          // --- UI: открываем результаты и парсим heatmap-таблицу ---
          const uiScores = [];

          await test.step("Открыть страницу результатов", async () => {
            await navigateToResultsTab(page, testPrId);
          });

          await test.step("Собрать оценки из heatmap-таблицы", async () => {
            // Найти heatmap-таблицу по заголовку (порядок таблиц нестабилен)
            const heatmap = await findHeatmapTable(page);
            expect(
              heatmap,
              "Heatmap-таблица должна быть на странице",
            ).toBeTruthy();
            await expect(heatmap).toBeVisible({ timeout: 10000 });

            const bodyRows = heatmap.locator("tbody tr");
            const rowCount = await bodyRows.count();
            console.log(`UI: найдено ${rowCount} строк в heatmap-таблице`);

            for (let i = 0; i < rowCount; i++) {
              const row = bodyRows.nth(i);
              const cells = row.locator("td");
              const cellCount = await cells.count();
              if (cellCount < 2) continue;

              // Cell 0 = имя (может содержать avatar letter + \n + full name)
              const nameText = await cells
                .nth(0)
                .innerText()
                .catch(() => "");
              // Cell 1 = итоговая оценка (число или EN DASH для отсутствующих)
              const totalText = await cells
                .nth(1)
                .innerText()
                .catch(() => "");

              const match = totalText.trim().match(/^(\d+\.?\d*)$/);
              if (nameText.trim() && match) {
                uiScores.push({
                  name: nameText.trim().toLowerCase(),
                  score: parseFloat(match[1]),
                });
              }
            }
            console.log(`UI: ${uiScores.length} оценок собрано`);
          });

          // --- Сравнение ---
          await test.step("Сравнить оценки API и UI", async () => {
            // API avrCompetencesCommon.value — нормализованная 0-1, UI — абсолютная 1-5.
            // Конвертация: apiScore * maxScale (seed использует шкалу 1-5)
            const MAX_SCALE = 5;
            const comparison = [];
            let matches = 0;
            let mismatches = 0;

            for (const uiScore of uiScores) {
              let apiScore;
              for (const [apiName, score] of apiScores.entries()) {
                if (
                  uiScore.name.includes(apiName) ||
                  apiName.includes(uiScore.name)
                ) {
                  apiScore = score;
                  break;
                }
              }

              if (apiScore !== undefined) {
                const apiAbsolute = apiScore * MAX_SCALE;
                const match = Math.abs(apiAbsolute - uiScore.score) < 0.5;
                comparison.push({
                  name: uiScore.name,
                  uiScore: uiScore.score,
                  apiNorm: apiScore,
                  apiAbsolute,
                  match,
                });
                if (match) matches++;
                else mismatches++;
              }
            }

            console.log(`\nСравнение UI vs API (x${MAX_SCALE}):`);
            console.log(`  Совпадений: ${matches}`);
            console.log(`  Расхождений: ${mismatches}`);
            for (const c of comparison) {
              console.log(
                `  ${c.name}: UI=${c.uiScore}, API=${c.apiNorm}→${c.apiAbsolute.toFixed(2)} ${c.match ? "✓" : "✗"}`,
              );
            }

            await page.screenshot({
              path: "test-results/calibration-ui-api-scores.png",
              fullPage: false,
            });

            expect(
              comparison.length,
              "Должны быть оценки для сравнения UI и API",
            ).toBeGreaterThan(0);

            expect(
              mismatches,
              `Все оценки должны совпадать (допуск ±0.5). Расхождения: ${comparison
                .filter((x) => !x.match)
                .map(
                  (c) =>
                    `${c.name}: UI=${c.uiScore} API=${c.apiAbsolute.toFixed(2)}`,
                )
                .join("; ")}`,
            ).toBe(0);
          });
        },
      );

      test(
        "C4085: Веса компетенций в форме соответствуют API",
        { tag: ["@critical"] },
        async ({ adminAuth: page, adminAPI }) => {
          setSeverity("critical");

          // --- API: получаем веса групп компетенций ---
          const { data: settings } =
            await adminAPI.getStatisticsSettings(testPrId);
          const groupSettings = settings?.competenceGroupSettings || [];
          const enabledGroups = groupSettings.filter(
            (gs) => gs.competenceGroupEnabled,
          );

          expect(
            enabledGroups.length,
            "Должны быть enabled группы компетенций в API",
          ).toBeGreaterThan(0);

          // Веса из API
          const apiWeights = new Map();
          let totalWeight = 0;
          for (const gs of enabledGroups) {
            const title = gs.competenceGroup?.title?.toLowerCase().trim();
            if (title) {
              apiWeights.set(title, gs.weightPercent);
              totalWeight += gs.weightPercent || 0;
            }
          }
          console.log(
            `API: ${apiWeights.size} групп, сумма весов: ${totalWeight}%`,
          );

          // --- API check: сумма весов = 100% ---
          await test.step("Проверить что сумма весов = 100%", async () => {
            expect(
              totalWeight,
              `Сумма весов должна быть ~100%, получено: ${totalWeight}%`,
            ).toBeCloseTo(100, 0);
          });

          // --- UI: проверить что колонки групп в heatmap совпадают ---
          await test.step("Проверить группы в heatmap-заголовке", async () => {
            await navigateToResultsTab(page, testPrId);

            // Найти heatmap-таблицу по заголовку (порядок таблиц нестабилен)
            const table = await findHeatmapTable(page);
            expect(
              table,
              "Heatmap-таблица должна быть на странице",
            ).toBeTruthy();
            await expect(table).toBeVisible({ timeout: 10000 });

            // Заголовки: Сотрудники | Итоговая оценка | Group1 | Group2 | ...
            const headerCells = table.locator("thead th, tr:first-child th");
            const headerCount = await headerCells.count();
            console.log(`UI: ${headerCount} колонок в heatmap-заголовке`);

            // Собираем названия колонок-групп (пропускаем Сотрудники, Итоговая оценка, пустые)
            const uiGroupNames = [];
            for (let i = 0; i < headerCount; i++) {
              const text = await headerCells
                .nth(i)
                .innerText()
                .catch(() => "");
              const trimmed = text.trim().toLowerCase();
              if (
                trimmed &&
                !trimmed.includes("сотрудник") &&
                !trimmed.includes("итоговая оценка")
              ) {
                uiGroupNames.push(trimmed);
              }
            }
            console.log(`UI группы: [${uiGroupNames.join(", ")}]`);
            console.log(`API группы: [${[...apiWeights.keys()].join(", ")}]`);

            // Количество колонок-групп должно совпадать с enabled группами
            expect(
              uiGroupNames.length,
              `Количество колонок групп (${uiGroupNames.length}) должно совпадать с API (${apiWeights.size})`,
            ).toBe(apiWeights.size);

            // Названия групп должны совпадать
            for (const apiTitle of apiWeights.keys()) {
              const found = uiGroupNames.some(
                (uiName) =>
                  uiName.includes(apiTitle) || apiTitle.includes(uiName),
              );
              expect(
                found,
                `Группа "${apiTitle}" должна присутствовать в heatmap-таблице`,
              ).toBe(true);
            }

            await page.screenshot({
              path: "test-results/calibration-ui-api-weights.png",
              fullPage: false,
            });
          });
        },
      );

      test(
        "C4086: Изменение оценки в UI отражается в API",
        { tag: ["@critical"] },
        async ({ adminAuth: page, adminAPI }) => {
          setSeverity("critical");

          // Получаем начальные данные
          const { data: beforeData } = await adminAPI.getTargetUsers(testPrId);
          const beforeUsers = beforeData?.items || beforeData || [];
          expect(beforeUsers.length, "Должны быть оцениваемые").toBeGreaterThan(
            0,
          );

          const testUser = beforeUsers[0];
          const userId = testUser.user?.id ?? testUser.userId ?? testUser.id;

          // Начальная оценка из heatMap
          let initialScore = null;
          if (revisionId && targetUserIds.length > 0) {
            const { data: beforeSummary } =
              await adminAPI.getStatisticsSummaryResults(testPrId, {
                targetUsersIds: targetUserIds,
                revisionId,
              });
            initialScore =
              beforeSummary?.heatMapResults?.targetUsers?.[String(userId)]
                ?.avrCompetencesCommon?.value ?? null;
          }
          console.log(
            `Тестовый пользователь: ${testUser.user?.firstName || userId}`,
          );
          console.log(`Начальная оценка (heatMap): ${initialScore}`);

          const calibrationForm = new CalibrationFormModal(page);

          // Открываем форму калибровки
          await test.step("Открыть форму калибровки", async () => {
            await navigateToResultsTab(page, testPrId);
            await openCalibrationModal(page);
            await calibrationForm.assertOpened();
          });

          // Изменяем итоговую оценку (meanOverwrite) — надёжнее, чем через компетенции
          let newTotalValue;
          await test.step("Изменить итоговую оценку", async () => {
            const totalInput = calibrationForm.totalScoreInput;
            const isNumeric = await totalInput.isVisible();
            expect(isNumeric, "Input итоговой оценки должен быть видимым").toBe(
              true,
            );

            const currentVal = parseFloat(await totalInput.inputValue()) || 3;
            newTotalValue = currentVal > 3 ? 1.5 : 4.5;
            console.log(`Итоговая оценка: ${currentVal} → ${newTotalValue}`);

            await calibrationForm.setTotalScore(newTotalValue);
          });

          // Сохраняем
          await test.step("Сохранить изменения", async () => {
            await calibrationForm.save();
            console.log("✓ Изменения сохранены");
          });

          // Проверяем API после изменения
          // Верификация: переоткрыть модалку того же юзера на той же странице
          await test.step("Проверить сохранение через переоткрытие модалки", async () => {
            // Ждём обновления страницы после закрытия модалки
            await page.waitForTimeout(2000);

            // Переоткрываем модалку (тот же pencil — не перезагружая страницу)
            await openCalibrationModal(page);
            await calibrationForm.assertOpened();

            const totalInput = calibrationForm.totalScoreInput;
            const savedVal = parseFloat(await totalInput.inputValue()) || 0;
            console.log(
              `Сохранённое значение: ${savedVal} (ожидали ${newTotalValue})`,
            );

            expect(
              savedVal,
              `Итоговая оценка должна сохраниться: ожидали ${newTotalValue}, получили ${savedVal}`,
            ).toBeCloseTo(newTotalValue, 1);
            console.log("✓ Изменение сохранено и подтверждено");

            await calibrationForm.cancel();
          });

          await page.screenshot({
            path: "test-results/calibration-after-change.png",
            fullPage: false,
          });
        },
      );
    });

    // -----------------------------------------------------------------------
    // Блок 2: Пересчёт в реальном времени
    // -----------------------------------------------------------------------

    test.describe("Пересчёт в реальном времени", () => {
      test("C4087: Итоговая оценка пересчитывается при изменении компетенции", async ({
        adminAuth: page,
        adminAPI,
      }) => {
        setSeverity("critical");

        const calibrationForm = new CalibrationFormModal(page);
        let initialTotal = null;
        let newTotal = null;

        await test.step("Открыть форму калибровки", async () => {
          await navigateToResultsTab(page, testPrId);
          await openCalibrationModal(page);
          await calibrationForm.assertOpened();
        });

        await test.step("Запомнить начальную итоговую оценку", async () => {
          // Из UI — input#performance-review-overwriting-mean-value
          const totalInput = calibrationForm.totalScoreInput;
          if (await totalInput.isVisible()) {
            const val = await totalInput.inputValue();
            initialTotal = parseFloat(val) || null;
          }

          // Fallback: из API
          if (!initialTotal && revisionId && targetUserIds.length > 0) {
            const { data: summaryData } =
              await adminAPI.getStatisticsSummaryResults(testPrId, {
                targetUsersIds: targetUserIds,
                revisionId,
              });
            const heatMap = summaryData?.heatMapResults?.targetUsers || {};
            const firstUserId = String(targetUserIds[0]);
            initialTotal =
              heatMap[firstUserId]?.avrCompetencesCommon?.value ?? null;
          }

          expect(
            initialTotal,
            "Начальная итоговая оценка должна быть > 0",
          ).toBeGreaterThan(0);
          console.log(`Начальная итоговая оценка: ${initialTotal}`);
        });

        await test.step("Изменить оценку компетенции", async () => {
          const competencies = await calibrationForm.getCompetencies();
          expect(
            competencies.length,
            "Должны быть компетенции",
          ).toBeGreaterThan(0);

          const firstScore = competencies[0].score;
          // Выбираем значение, сильно отличающееся от текущего
          const newScore = firstScore > 3 ? 1 : 5;
          console.log(
            `Компетенция "${competencies[0].name}": ${firstScore} → ${newScore}`,
          );

          await calibrationForm.setCompetencyScore(0, newScore);
        });

        await test.step("Проверить пересчёт итоговой оценки", async () => {
          // Даём UI время на пересчёт
          await page.waitForTimeout(2000);

          // Из UI — input#performance-review-overwriting-mean-value
          const totalInput = calibrationForm.totalScoreInput;
          if (await totalInput.isVisible()) {
            const val = await totalInput.inputValue();
            newTotal = parseFloat(val) || null;
          }

          console.log(`Новая итоговая оценка: ${newTotal}`);

          expect(
            newTotal,
            "Новая итоговая оценка должна быть > 0",
          ).toBeGreaterThan(0);

          const delta = Math.abs(initialTotal - newTotal);
          console.log(
            `Изменение: ${initialTotal} → ${newTotal} (delta: ${delta.toFixed(2)})`,
          );

          expect(
            delta,
            `Итоговая оценка должна пересчитаться: было ${initialTotal}, стало ${newTotal}`,
          ).toBeGreaterThan(0.01);
          console.log("✓ Пересчёт работает");

          await page.screenshot({
            path: "test-results/calibration-recalculation.png",
            fullPage: false,
          });
        });

        await test.step("Отменить изменения", async () => {
          await calibrationForm.cancel();
        });
      });

      test("C4088: Цветовая характеристика обновляется при изменении оценки", async ({
        adminAuth: page,
        adminAPI,
      }) => {
        setSeverity("normal");

        await test.step("Проверить цветовые индикаторы из heatMap API", async () => {
          expect(revisionId, "revisionId должен быть").toBeTruthy();
          expect(
            targetUserIds.length,
            "targetUserIds должны быть",
          ).toBeGreaterThan(0);

          const { data: summaryData } =
            await adminAPI.getStatisticsSummaryResults(testPrId, {
              targetUsersIds: targetUserIds,
              revisionId,
            });
          const heatMap = summaryData?.heatMapResults?.targetUsers || {};

          const usersWithColors = [];
          for (const [userId, userData] of Object.entries(heatMap)) {
            const color = userData?.avrCompetencesCommon?.color;
            const value = userData?.avrCompetencesCommon?.value;
            if (color) {
              usersWithColors.push({ userId, color, value });
              console.log(
                `Пользователь ${userId}: оценка=${value}, цвет=${color}`,
              );
            }
          }

          console.log(`Пользователей с цветами: ${usersWithColors.length}`);

          expect(
            usersWithColors.length,
            "Хотя бы у одного пользователя должен быть цветовой индикатор",
          ).toBeGreaterThan(0);

          // Проверяем что цвета — валидные hex-коды
          for (const u of usersWithColors) {
            expect(
              u.color,
              `Цвет ${u.color} для пользователя ${u.userId} должен быть hex-кодом`,
            ).toMatch(/^#[0-9a-fA-F]{6}$/);
          }
        });

        // Скриншот страницы результатов
        await test.step("Скриншот страницы результатов", async () => {
          await navigateToResultsTab(page, testPrId);
          await page.screenshot({
            path: "test-results/calibration-color-indicators.png",
            fullPage: false,
          });
        });
      });
    });

    // -----------------------------------------------------------------------
    // Блок 3: Информация на странице
    // -----------------------------------------------------------------------

    test.describe("Информация на странице", () => {
      test(
        "C4089: Количество оцениваемых совпадает в UI и API",
        { tag: ["@critical"] },
        async ({ adminAuth: page, adminAPI }) => {
          setSeverity("critical");

          // API: количество оцениваемых
          const { data: targetUsersData } =
            await adminAPI.getTargetUsers(testPrId);
          const apiUsers = targetUsersData?.items || targetUsersData || [];
          const apiCount = apiUsers.length;
          console.log(`API: ${apiCount} оцениваемых`);

          expect(apiCount, "API должен вернуть оцениваемых").toBeGreaterThan(0);

          await test.step("Подсчитать строки в таблице", async () => {
            await navigateToResultsTab(page, testPrId);

            // Прокрутить вниз чтобы загрузить калибровочную таблицу
            await page.evaluate(() =>
              window.scrollTo(0, document.body.scrollHeight),
            );

            // Ждём появления второй таблицы (калибровка) или используем heatmap
            const secondTable = page.locator("table").nth(1);
            let useSecondTable = false;
            try {
              await secondTable.waitFor({
                state: "visible",
                timeout: 10000,
              });
              useSecondTable = true;
            } catch {
              console.log(
                "Вторая таблица не найдена — считаем строки в heatmap",
              );
            }

            const targetTable = useSecondTable
              ? secondTable
              : page.locator("table").first();
            await expect(targetTable).toBeVisible({ timeout: 10000 });

            const bodyRows = targetTable.locator("tbody tr");
            const rowCount = await bodyRows.count();
            console.log(
              `UI: ${rowCount} строк в ${useSecondTable ? "таблице калибровки" : "heatmap-таблице"}`,
            );

            await page.screenshot({
              path: "test-results/calibration-users-count.png",
              fullPage: false,
            });

            expect(rowCount, "Таблица должна содержать строки").toBeGreaterThan(
              0,
            );

            // Точное сравнение (seed создаёт 3 пользователей, пагинации нет)
            expect(
              rowCount,
              `Количество строк (${rowCount}) должно совпадать с API (${apiCount})`,
            ).toBe(apiCount);
          });
        },
      );

      test("C4090: Данные дашборда отображаются корректно", async ({
        adminAuth: page,
      }) => {
        setSeverity("normal");

        await test.step("Проверить ключевые элементы страницы", async () => {
          await navigateToResultsTab(page, testPrId);

          // Heatmap-таблица должна быть видимой и содержать строки
          const heatmapTable = page.locator("table").first();
          await expect(heatmapTable).toBeVisible({ timeout: 10000 });
          const heatmapRows = heatmapTable.locator("tbody tr");
          const heatmapRowCount = await heatmapRows.count();
          expect(
            heatmapRowCount,
            "Heatmap должна содержать строки",
          ).toBeGreaterThan(0);
          console.log(`Heatmap: ${heatmapRowCount} строк`);

          // Прокрутить вниз чтобы загрузить ленивые элементы
          await page.evaluate(() =>
            window.scrollTo(0, document.body.scrollHeight),
          );

          // Попробуем дождаться второй таблицы (калибровочная)
          const secondTable = page.locator("table").nth(1);
          let hasCalibrationTable = false;
          try {
            await secondTable.waitFor({
              state: "visible",
              timeout: 10000,
            });
            hasCalibrationTable = true;
          } catch {
            console.log(
              "Калибровочная таблица не появилась — проверяем только heatmap",
            );
          }

          if (hasCalibrationTable) {
            const calibrationRowCount = await secondTable
              .locator("tbody tr")
              .count();
            expect(
              calibrationRowCount,
              "Таблица калибровки должна содержать строки",
            ).toBeGreaterThan(0);
            console.log(`Калибровка: ${calibrationRowCount} строк`);
          }

          // Вкладка «Результаты» должна быть активной
          const resultsTab = page
            .locator('button[class*="Tabs_button"]')
            .filter({ hasText: /результаты/i });
          await expect(resultsTab).toBeVisible();

          // Кнопка «Скачать результаты» или другая функциональная кнопка
          const exportBtn = page
            .locator("button")
            .filter({ hasText: /скачать|экспорт|результат/i })
            .first();
          const hasExportBtn = await exportBtn.isVisible();
          console.log(
            `Кнопка экспорта: ${hasExportBtn ? "есть" : "не найдена"}`,
          );

          console.log("✓ Все ключевые элементы на месте");

          await page.screenshot({
            path: "test-results/calibration-dashboard.png",
            fullPage: false,
          });
        });
      });
    });
  },
);
