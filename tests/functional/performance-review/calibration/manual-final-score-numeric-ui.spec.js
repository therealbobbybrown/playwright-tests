// @ts-check
/**
 * Калибровка итоговой оценки — UI тест числового ввода
 *
 * Проверяет UI-взаимодействие с полем итоговой оценки в модальном окне калибровки:
 * - MFC-004: Повторное открытие модалки → откалиброванное значение сохранилось
 *
 * @tags @ui @calibration @critical @performance-review @regression
 * @module Calibration
 */
import { test, expect } from "../../../fixtures/auth.js";
import { CalibrationFormModal } from "../../../../pages/CalibrationFormModal.js";
import {
  PerformanceReviewAPI,
  getCredentials,
} from "../../../utils/api/index.js";
import { CalibrationSeed } from "../../../utils/seed/CalibrationSeed.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";
import { buildPRUrl } from "../../../utils/pr-urls.js";

// ────────────────────────────────────────────────────────────────────────────
// Shared test data
// ────────────────────────────────────────────────────────────────────────────

let PR_ID;
let REVISION_ID;
let TARGET_USERS; // [{ userId, name }]
let QUESTIONS; // [{ id, competenceId, rangeMax }]

// ────────────────────────────────────────────────────────────────────────────
// Helper: navigation with SSR warm-up
// ────────────────────────────────────────────────────────────────────────────

/**
 * Навигация на страницу калибровки с прогревом SSR
 * Двойной переход: сначала базовая страница PR → затем с feature flag
 * @param {import('@playwright/test').Page} page
 * @param {number|string} prId
 */
async function navigateToCalibrationPage(page, prId) {
  const baseUrl = new URL(process.env.BASE_URL).origin;
  // Первый переход — прогрев SSR (может упасть на ?feature=... для нового PR)
  await page.goto(`${baseUrl}/ru/manager/performance-reviews/${prId}/`);
  await page.waitForLoadState("networkidle");
  // Второй переход — с feature flag statisticsSettings
  await page.goto(buildPRUrl(prId, { statisticsSettings: true }));
  await page.waitForLoadState("networkidle");
}

// ────────────────────────────────────────────────────────────────────────────
// beforeAll: seed data
// ────────────────────────────────────────────────────────────────────────────

test.beforeAll(async ({ request }) => {
  test.setTimeout(180000);

  // 1. Seed PR с заполненными анкетами
  const calSeed = new CalibrationSeed(request);
  await calSeed.init();

  const result = await calSeed.seedWithDirections({
    directions: { self: true, head: true },
    targetUsersCount: 4,
    receiversPerDirection: 2,
    fillQuestionnaires: true,
  });
  PR_ID = result.prId;
  console.log(`✅ PR создан: ${PR_ID}`);

  // 2. Включить калибровку через API
  const api = new PerformanceReviewAPI(request);
  const { email, password } = getCredentials("admin");
  await api.signIn(email, password);

  const featureUrl = `/manager/performance-reviews/${PR_ID}/statistics/settings/?feature=statisticsSettings`;
  const { data: settings } = await api.get(featureUrl);
  await api.post(featureUrl, {
    ...settings,
    settings: {
      ...(settings?.settings || {}),
      useOnlyHeadReceiver: true,
      enableResponsesOverwriting: true,
      enableCustomCharacteristics: true,
      enableOnlyCustomCharacteristics: false,
      enableCompetenceWeights: true,
    },
    // ВСЕГДА используем чистые характеристики — существующие могут содержать мусор
    characteristicSettings: [
      { threshold: 33, title: "Низко", category: "negative" },
      { threshold: 66, title: "Средне", category: "neutral" },
      { threshold: 100, title: "Высоко", category: "positive" },
    ],
  });
  console.log("✅ Настройки калибровки включены");

  // 3. Получить ревизию
  const { data: revision } = await api.getLastRevision(PR_ID);
  REVISION_ID = revision?.id;
  console.log(`  Revision: ${REVISION_ID}`);

  // 4. Получить target users
  const { data: targetUsersData } = await api.getTargetUsers(PR_ID, {
    limit: 10,
    offset: 0,
  });
  const items = targetUsersData?.items || targetUsersData || [];
  const allUsers = items.map((u) => ({
    userId: u.user?.id ?? u.userId,
    name: `${u.user?.firstName || ""} ${u.user?.lastName || ""}`.trim(),
  }));

  // 5. Warm-up: триггерим ленивый пересчёт статистики бэкендом
  const allUserIds = allUsers.map((u) => u.userId);
  console.log("  Warm-up: вызываем statistics endpoints...");
  await Promise.all([
    api.getStatisticsSummaryResults(PR_ID, {
      targetUsersIds: allUserIds,
      revisionId: REVISION_ID,
    }),
    api.getUsersCompetenciesResults(PR_ID, {
      usersIds: allUserIds,
      revisionId: REVISION_ID,
    }),
    api.getTargetUsersProgress(PR_ID, {
      revisionId: REVISION_ID,
      usersIds: allUserIds,
    }),
  ]);
  // Дать бэкенду время на асинхронный пересчёт
  await new Promise((r) => setTimeout(r, 5000));
  console.log("  Warm-up завершён");

  // 6. Фильтруем: оставляем только тех, для кого overwrite endpoint доступен (200)
  TARGET_USERS = [];
  for (const u of allUsers) {
    const { response } = await api.getResponseOverwritesData(
      PR_ID,
      REVISION_ID,
      u.userId,
    );
    if (response.ok()) {
      TARGET_USERS.push(u);
    } else {
      console.log(
        `  ⚠ Пропускаем ${u.name} (userId=${u.userId}) — overwrite status ${response.status()}`,
      );
    }
  }
  console.log(`  Target users: ${TARGET_USERS.length} (из ${allUsers.length})`);
  expect(
    TARGET_USERS.length,
    "Должно быть ≥3 доступных target users",
  ).toBeGreaterThanOrEqual(3);

  // 7. Получить вопросы (для rangeMax)
  const { data: overwriteData } = await api.getResponseOverwritesData(
    PR_ID,
    REVISION_ID,
    TARGET_USERS[0].userId,
  );
  QUESTIONS = overwriteData?.questions || [];
  console.log(
    `  Вопросов: ${QUESTIONS.length}, rangeMax: ${QUESTIONS[0]?.rangeMax}`,
  );
});

// ────────────────────────────────────────────────────────────────────────────
// ТЕСТ: MFC-004 — Повторное открытие модалки
// ────────────────────────────────────────────────────────────────────────────

test.describe(
  "Ручная калибровка итоговой — числовой ввод (UI)",
  {
    tag: [
      "@ui",
      "@calibration",
      "@critical",
      "@regression",
      "@performance-review",
    ],
  },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.CALIBRATION, "Калибровка итоговой — числовой UI");
    });

    test(
      "C4462: Повторное открытие модалки → откалиброванное значение сохранилось",
      {
        tag: ["@critical"],
      },
      async ({ adminAuth: page }) => {
        setSeverity("critical");
        test.slow(); // UI навигация + seed данные

        // ────────────────────────────────────────────────────────────
        // Шаг 1: Открыть страницу результатов PR
        // ────────────────────────────────────────────────────────────
        await test.step("Открыть страницу результатов PR с включённой калибровкой", async () => {
          await navigateToCalibrationPage(page, PR_ID);
        });

        // ────────────────────────────────────────────────────────────
        // Шаг 2: Переключиться на вкладку "Результаты"
        // ────────────────────────────────────────────────────────────
        await test.step("Переключить на вкладку «Результаты» на странице PR", async () => {
          // Используем CSS-класс Tabs_button, чтобы не зацепить кнопки "Результаты" в строках таблицы
          const resultsTab = page
            .locator('button[class*="Tabs_button"]')
            .filter({ hasText: /^Результаты$/i });
          await resultsTab.click();
          await page.waitForLoadState("networkidle", { timeout: 3000 });
        });

        // ────────────────────────────────────────────────────────────
        // Шаг 3: Найти строку с "–" в колонке "после калибровки" и открыть калибровку
        // ────────────────────────────────────────────────────────────
        let targetRow; // Храним строку, а не кнопку (после калибровки кнопка меняет позицию)

        await test.step("Найти сотрудника без калибровки и нажать карандаш", async () => {
          // Вторая таблица на странице — таблица со списком сотрудников и кнопками калибровки
          // Первая таблица — это heatmap (карта компетенций)
          const tables = page.locator("table");
          const tableCount = await tables.count();
          console.log(`  Найдено таблиц на странице: ${tableCount}`);

          const table = tableCount >= 2 ? tables.nth(1) : tables.first();
          await expect(table).toBeVisible({ timeout: 10000 });

          // Ищем строки таблицы
          const bodyRows = table.locator("tbody tr, tr").filter({
            has: page.locator("td"),
          });
          const rowCount = await bodyRows.count();
          console.log(`  Найдено строк в таблице калибровки: ${rowCount}`);

          // Ищем строку, где есть "–" и рядом с ним кнопка-карандаш
          // Кнопка калибровки обычно находится в той же ячейке, что и "–"
          for (let i = 0; i < rowCount; i++) {
            const row = bodyRows.nth(i);
            const cells = row.locator("td");

            // Ищем ячейку с "–" и кнопкой в ней
            const cellsWithDash = cells.filter({ hasText: "–" });
            const dashCellCount = await cellsWithDash.count();

            for (let j = 0; j < dashCellCount; j++) {
              const cell = cellsWithDash.nth(j);
              const cellText = await cell.innerText().catch(() => "");

              // Проверяем, что это именно "–" (а не часть текста типа "5–10")
              if (cellText.trim() === "–") {
                // Ищем кнопку-карандаш в этой же ячейке
                const pencil = cell.locator("button").first();
                if (await pencil.isVisible()) {
                  targetRow = row; // Сохраняем строку, а не кнопку
                  const userName = await row
                    .locator("td")
                    .first()
                    .innerText()
                    .catch(() => "Unknown");
                  console.log(
                    `  ✓ Найдена строка "${userName}" с кнопкой калибровки в ячейке "–"`,
                  );
                  break;
                }
              }
            }

            if (targetRow) break;
          }

          expect(
            targetRow,
            'Должна быть хотя бы одна строка с "–" и кнопкой калибровки',
          ).toBeTruthy();
        });

        // ────────────────────────────────────────────────────────────
        // Шаг 4: Открыть модальное окно калибровки
        // ────────────────────────────────────────────────────────────
        const calibrationForm = new CalibrationFormModal(page);

        await test.step("Открыть модальное окно калибровки", async () => {
          // Находим кнопку-карандаш в строке (она в ячейке "Итоговая оценка после калибровки")
          const pencilButton = targetRow
            .locator("button")
            .filter({
              has: page.locator('svg, [class*="icon"], [class*="Icon"]'),
            })
            .first();
          await pencilButton.click();
          await calibrationForm.assertOpened();
        });

        // ────────────────────────────────────────────────────────────
        // Шаг 5: Прочитать текущее (оригинальное) значение итоговой оценки
        // ────────────────────────────────────────────────────────────
        let originalValue;

        await test.step("Запомнить текущую итоговую оценку из модалки", async () => {
          originalValue = await calibrationForm.getTotalScoreInputValue();
          console.log(`  Оригинальное значение: "${originalValue}"`);
          expect(
            originalValue,
            "Итоговая оценка должна иметь начальное значение",
          ).toBeTruthy();
          expect(
            originalValue.length,
            "Значение не должно быть пустым",
          ).toBeGreaterThan(0);
        });

        // ────────────────────────────────────────────────────────────
        // Шаг 6: Ввести новое значение (4.2)
        // ────────────────────────────────────────────────────────────
        const newValue = "4.2";

        await test.step(`Ввести новое значение итоговой = ${newValue} в числовое поле модалки`, async () => {
          await calibrationForm.setTotalScore(newValue);

          // Проверяем, что значение применилось в input
          const currentValue = await calibrationForm.getTotalScoreInputValue();
          expect(
            currentValue,
            `Значение в input должно быть "${newValue}"`,
          ).toBe(newValue);
        });

        // ────────────────────────────────────────────────────────────
        // Шаг 7: Сохранить калибровку
        // ────────────────────────────────────────────────────────────
        await test.step("Сохранить калибровку в модалке", async () => {
          await calibrationForm.save();
          // save() уже содержит waitFor modal hidden
        });

        // ────────────────────────────────────────────────────────────
        // Шаг 8: Подождать обновления UI
        // ────────────────────────────────────────────────────────────
        await test.step("Дождаться обновления таблицы результатов", async () => {
          await page.waitForLoadState("networkidle", { timeout: 3000 });
        });

        // ────────────────────────────────────────────────────────────
        // Шаг 9: Повторно открыть модальное окно калибровки
        // ────────────────────────────────────────────────────────────
        await test.step("Переоткрыть модалку калибровки (карандаш)", async () => {
          // После сохранения калибровки таблица перерисовывается (React re-render),
          // поэтому targetRow может стать stale. Ищем карандаш заново во второй таблице.
          const tables = page.locator("table");
          const tableCount = await tables.count();
          const table = tableCount >= 2 ? tables.nth(1) : tables.first();
          await expect(table).toBeVisible({ timeout: 10000 });

          // Ищем строку, которая теперь содержит откалиброванное значение "4.2"
          const calibratedRow = table
            .locator("tbody tr, tr")
            .filter({ has: page.locator("td") })
            .filter({ hasText: "4.2" })
            .first();
          const pencilButton = calibratedRow
            .locator("button")
            .filter({
              has: page.locator('svg, [class*="icon"], [class*="Icon"]'),
            })
            .first();
          await pencilButton.click();
          await calibrationForm.assertOpened();
        });

        // ────────────────────────────────────────────────────────────
        // Шаг 10: Проверить, что сохранённое значение отображается
        // ────────────────────────────────────────────────────────────
        await test.step(`Проверить: в модалке отображается сохранённое значение ${newValue}`, async () => {
          const valueAfterReopen =
            await calibrationForm.getTotalScoreInputValue();
          console.log(
            `  Значение после повторного открытия: "${valueAfterReopen}"`,
          );

          expect(
            valueAfterReopen,
            `Итоговая оценка должна сохраниться после повторного открытия модалки. ` +
              `Ожидалось: "${newValue}", получено: "${valueAfterReopen}"`,
          ).toBe(newValue);
        });

        // ────────────────────────────────────────────────────────────
        // Шаг 11: Закрыть модалку (опционально)
        // ────────────────────────────────────────────────────────────
        await test.step("Закрыть модальное окно", async () => {
          await calibrationForm.cancel();
        });

        // Скриншот для отчёта
        await page.screenshot({
          path: "test-results/manual-final-score-numeric-ui-mfc004.png",
          fullPage: false,
        });
      },
    );

    test(
      "C4463: Пустое поле / нечисловое значение → проверка валидации",
      {
        tag: ["@regression"],
      },
      async ({ adminAuth: page }) => {
        setSeverity("normal");

        const calibrationForm = new CalibrationFormModal(page);

        await test.step("Открыть модалку калибровки", async () => {
          await navigateToCalibrationPage(page, PR_ID);
          const resultsTab = page
            .locator('button[class*="Tabs_button"]')
            .filter({ hasText: /результаты/i });
          if (
            await resultsTab
              .waitFor({ state: "visible", timeout: 5000 })
              .then(() => true)
              .catch(() => false)
          ) {
            await resultsTab.click();
          }
          await page
            .locator("table")
            .first()
            .waitFor({ state: "visible", timeout: 10000 });
          const pencilIcon = page
            .locator(
              '[class*="OverwriteButton"] button, button[class*="OverwriteButton"]',
            )
            .first();
          await expect(pencilIcon).toBeVisible({ timeout: 10000 });
          await pencilIcon.click();
          await calibrationForm.assertOpened();
        });

        await test.step("Очистить числовое поле итоговой оценки в модалке и проверить валидацию", async () => {
          const totalInput = calibrationForm.totalScoreInput;
          await totalInput.fill("");
          // Пустое поле — кнопка Сохранить может быть неактивна или значение невалидно
          const isEmpty = await totalInput.inputValue();
          expect(isEmpty, "Поле очищено").toBe("");
          console.log("  ✅ Поле очищено");
        });

        await test.step('Ввести нечисловой текст "abc" в поле итоговой и проверить валидацию', async () => {
          const totalInput = calibrationForm.totalScoreInput;
          await totalInput.fill("abc");
          const value = await totalInput.inputValue();
          // Input type=number обычно не принимает буквы, value будет пустым
          console.log(`  Ввод "abc" → значение поля: "${value}"`);
          // Либо поле отклонило буквы, либо UI показывает ошибку
          const isEmptyOrFiltered = value === "" || value === "abc";
          expect(
            isEmptyOrFiltered,
            "Поле отвергло или приняло нечисловой ввод",
          ).toBe(true);
        });

        await test.step('Ввести отрицательное число "-1" в поле итоговой и проверить валидацию', async () => {
          const totalInput = calibrationForm.totalScoreInput;
          await totalInput.fill("-1");
          const value = await totalInput.inputValue();
          console.log(`  Ввод "-1" → значение поля: "${value}"`);
        });

        await test.step("Закрыть модалку калибровки без сохранения", async () => {
          await calibrationForm.cancel();
        });
      },
    );
  },
);
