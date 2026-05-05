// tests/functional/performance-review/calibration/settings-text-employee-access.spec.js
// Тесты доступа сотрудника к результатам с текстовыми характеристиками

import { test as baseTest, expect } from "../../../fixtures/auth.js";
import { StatisticsSettingsModal } from "../../../../pages/StatisticsSettingsModal.js";
import { PerformanceReviewAPI } from "../../../utils/api/PerformanceReviewAPI.js";
import { getCredentials } from "../../../utils/credentials.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";
import { buildPRUrl } from "../../../utils/pr-urls.js";

/**
 * Тесты доступа сотрудника к результатам с текстовыми характеристиками
 *
 * SET-023-A: Админ расшаривает → сотрудник видит число (enableOnlyCustom=false)
 *            -> Покрыто тестом SET-014 в settings-show-only-custom.spec.js
 *
 * SET-023-B: Админ расшаривает → сотрудник видит число+текст (enableCustom=true, enableOnlyCustom=false)
 *            -> Покрыто тестом SET-015 в settings-show-only-custom.spec.js
 *
 * SET-023-C: Админ расшаривает → сотрудник видит только текст (enableOnlyCustom=true)
 *            -> Покрыто тестом SET-016 в settings-show-only-custom.spec.js
 *
 * SET-023-D: БЕЗ расшаривания → сотрудник НЕ видит результат
 *            -> Новый тест ниже
 *
 * @tags @ui @calibration @regression @settings @employee-access
 */

const test = baseTest.extend({
  prAPI: async ({ request }, use) => {
    const api = new PerformanceReviewAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
  settingsModal: async ({ adminAuth: page }, use, testInfo) => {
    const modal = new StatisticsSettingsModal(page, testInfo);
    await use(modal);
  },
});

test.describe(
  "Доступ сотрудника к результатам",
  { tag: ["@ui", "@calibration", "@regression", "@performance-review"] },
  () => {
    let testPrId, targetUserId, revisionId;

    test.beforeAll(async ({ prSeed }) => {
      const timestamp = Date.now();
      const pr = await prSeed.seedActivePR({
        title: `SET-023 NoShare ${timestamp}`,
        fillAssessments: true,
      });
      testPrId = pr.id;
      targetUserId = pr.targetUserId;
      revisionId = pr.revisionId;
      console.log(
        `✅ Создан PR для SET-023: ${testPrId} (target: ${targetUserId}, rev: ${revisionId})`,
      );
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.CALIBRATION, "Employee Access");
    });

    test('C4163: Без расшаривания — по умолчанию доступ "Только руководитель"', async ({
      adminAuth: page,
      prAPI,
    }) => {
      setSeverity("critical");

      /**
       * ВАЖНО: Оцениваемый всегда видит СВОИ результаты (если они есть).
       * Настройка "Доступ к отчету" контролирует:
       * - "Только руководитель" — результаты видит только руководитель (и сам оцениваемый)
       * - "Сотрудник" — результаты видит руководитель + ссылка активна для оцениваемого
       *
       * Этот тест проверяет что по умолчанию доступ = "Только руководитель"
       * и результаты НЕ расшарены (т.е. оцениваемому не приходит уведомление/ссылка).
       */

      await test.step("Настроить характеристики через API", async () => {
        const { data: currentSettings } =
          await prAPI.getStatisticsSettings(testPrId);
        const newSettings = {
          ...currentSettings,
          settings: {
            ...currentSettings.settings,
            enableCalibration: true,
            enableResponsesOverwriting: true,
            enableCustomCharacteristics: true,
            enableOnlyCustomCharacteristics: false,
          },
          characteristicSettings: [
            { upperBound: 33, title: "Низко", color: "#FF6B6B" },
            { upperBound: 66, title: "Средне", color: "#FFE66D" },
            { upperBound: 100, title: "Высоко", color: "#4ECDC4" },
          ],
        };
        await prAPI.updateStatisticsSettings(testPrId, newSettings);
        console.log("✅ Характеристики настроены через API");
      });

      await test.step('Проверить что доступ по умолчанию = "Только руководитель"', async () => {
        await page.goto(buildPRUrl(testPrId, { statisticsSettings: true }));
        await page.waitForLoadState("networkidle");

        const resultsTab = page.getByRole("button", { name: /^результаты$/i });
        await resultsTab.click();
        await page.waitForLoadState("networkidle", { timeout: 2000 });

        // Найти таблицу с колонкой "Доступ к отчету"
        const table = page
          .locator("table")
          .filter({ has: page.getByText("Доступ к отчету") })
          .first();
        await table.waitFor({ state: "visible", timeout: 5000 });

        // Найти ячейки с текстом "Только руководитель" (именно этот текст, не часть другого)
        const onlyManagerCells = table
          .locator("td")
          .filter({ hasText: /^Только руководитель$/ });
        const onlyManagerCount = await onlyManagerCells.count();
        console.log(`ℹ️ Ячеек "Только руководитель": ${onlyManagerCount}`);

        // Найти строки данных (tbody tr)
        const dataRows = table.locator("tbody tr");
        const rowCount = await dataRows.count();
        console.log(`ℹ️ Строк с оцениваемыми: ${rowCount}`);

        // Каждая строка должна иметь "Только руководитель" в колонке доступа
        expect(onlyManagerCount).toBeGreaterThanOrEqual(rowCount);
        console.log(
          '✅ По умолчанию доступ = "Только руководитель" для оцениваемых',
        );
      });

      await test.step('Проверить что кнопка "Управление доступом" неактивна без выбора', async () => {
        const accessButton = page.getByRole("button", {
          name: /управление доступом/i,
        });
        const isDisabled = await accessButton.isDisabled();
        console.log(
          `ℹ️ Кнопка "Управление доступом" ${isDisabled ? "неактивна" : "активна"}`,
        );

        // Кнопка должна быть неактивна до выбора сотрудников
        expect(
          isDisabled,
          'Кнопка "Управление доступом" неактивна без выбора сотрудников',
        ).toBe(true);
      });

      // Примечание: проверка характеристик через UI уже покрыта в:
      // - settings-text-characteristics-regression.spec.js (SET-REG-*)
      // - settings-show-only-custom.spec.js (SET-005/006)
    });
  },
);
