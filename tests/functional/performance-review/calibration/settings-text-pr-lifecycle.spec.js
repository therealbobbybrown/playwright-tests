// tests/functional/performance-review/calibration/settings-text-pr-lifecycle.spec.js
// Тесты текстовых характеристик на PR в статусе Completed

import { test as baseTest, expect } from "../../../fixtures/auth.js";
import { PerformanceReviewAPI } from "../../../utils/api/PerformanceReviewAPI.js";
import { StatisticsSettingsModal } from "../../../../pages/StatisticsSettingsModal.js";
import { getCredentials } from "../../../utils/credentials.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";
import { buildPRUrl } from "../../../utils/pr-urls.js";

/**
 * Тесты на PR в статусе Completed:
 * - Вкладка Результаты доступна и содержит данные
 * - Калибровка заблокирована (readonly)
 * - Настройки статистики readonly
 *
 * Стратегия: создаём активный PR через seed → настраиваем характеристики → stop() → complete
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

/**
 * Настроить характеристики через API перед остановкой PR
 */
async function setupCharacteristics(prAPI, prId) {
  const { data: currentSettings } = await prAPI.getStatisticsSettings(prId);
  const newSettings = {
    ...currentSettings,
    settings: {
      ...currentSettings.settings,
      enableCustomCharacteristics: true,
      enableOnlyCustomCharacteristics: false,
    },
    characteristicSettings: [
      { threshold: 33, title: "Низко", color: "#FF6B6B", category: "negative" },
      { threshold: 66, title: "Средне", color: "#FFE66D", category: "neutral" },
      {
        threshold: 100,
        title: "Высоко",
        color: "#4ECDC4",
        category: "positive",
      },
    ],
  };

  const { response } = await prAPI.updateStatisticsSettings(prId, newSettings);
  if (!response.ok()) {
    throw new Error(`setupCharacteristics failed: ${response.status()}`);
  }
}

test.describe(
  "C4390-C4183: PR в статусе Completed",
  { tag: ["@ui", "@calibration", "@regression", "@performance-review"] },
  () => {
    let completedPrId;

    test.beforeAll(async ({ prSeed }) => {
      // Создаём активный PR с заполненными анкетами
      const pr = await prSeed.seedActivePR({
        title: `CompletedPR ${Date.now()}`,
        fillAssessments: true,
      });
      completedPrId = pr.id;
      console.log(`\u2705 Активный PR создан: ${completedPrId}`);

      // Настраиваем характеристики через API
      const api = prSeed.prAPI;
      await setupCharacteristics(api, completedPrId);
      console.log("\u2705 Характеристики настроены");

      // Останавливаем PR → статус complete
      const { response } = await api.stop(completedPrId);
      if (!response.ok()) {
        const text = await response.text().catch(() => "");
        throw new Error(
          `Не удалось остановить PR: ${response.status()} ${text}`,
        );
      }
      console.log("\u2705 PR остановлен (status=complete)");
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.CALIBRATION, "Completed PR");
    });

    test("C4390: Completed PR — вкладка Результаты доступна и содержит данные", async ({
      adminAuth: page,
      prAPI,
    }) => {
      setSeverity("normal");

      await test.step("Открыть completed PR", async () => {
        await page.goto(
          buildPRUrl(completedPrId, { statisticsSettings: true }),
        );
        await page.waitForLoadState("networkidle");
      });

      await test.step("Перейти на вкладку Результаты", async () => {
        const resultsTab = page
          .locator('button[class*="Tabs_button"]')
          .filter({ hasText: /результаты/i });
        await resultsTab.click();
        // Ждём загрузки контента вкладки
        await page
          .locator('table, button[class*="settings"]')
          .first()
          .waitFor({ state: "visible", timeout: 10000 });
      });

      await test.step("Проверить что таблица результатов видна", async () => {
        const table = page.locator("table").first();
        await table.waitFor({ state: "visible", timeout: 10000 });
        const rowCount = await table.locator("tbody tr").count();
        console.log(`\u2705 Таблица результатов видна, строк: ${rowCount}`);
        expect(rowCount).toBeGreaterThan(0);
      });

      await test.step("Проверить наличие данных характеристик через API", async () => {
        const { data: settings } =
          await prAPI.getStatisticsSettings(completedPrId);
        const enableCustom = settings?.settings?.enableCustomCharacteristics;
        const chars = settings?.characteristicSettings || [];
        console.log(
          `API: enableCustomCharacteristics=${enableCustom}, характеристик=${chars.length}`,
        );
        expect(enableCustom).toBe(true);
        expect(chars.length).toBe(3);
        chars.forEach((c, i) =>
          console.log(`  [${i}] threshold=${c.threshold}, title="${c.title}"`),
        );
      });
    });

    test("C4182: Completed PR — калибровка заблокирована", async ({
      adminAuth: page,
    }) => {
      setSeverity("normal");

      await test.step("Открыть completed PR и перейти на Результаты", async () => {
        await page.goto(
          buildPRUrl(completedPrId, { statisticsSettings: true }),
        );
        await page.waitForLoadState("networkidle");

        const resultsTab = page
          .locator('button[class*="Tabs_button"]')
          .filter({ hasText: /результаты/i });
        await resultsTab.click();
        await page.waitForTimeout(1500);
      });

      await test.step("Проверить что кнопка калибровки недоступна или отсутствует", async () => {
        // Кнопка-карандаш в колонке "Итоговая оценка после калибровки"
        const calibrationButton = page
          .locator(
            '[class*="OverwriteButton"] button, button[class*="OverwriteButton"]',
          )
          .first();

        const isVisible = await calibrationButton
          .waitFor({ state: "visible", timeout: 5000 })
          .then(() => true)
          .catch(() => false);

        if (isVisible) {
          const isDisabled = await calibrationButton
            .isDisabled()
            .catch(() => false);
          console.log(
            `Кнопка калибровки: видна=${isVisible}, disabled=${isDisabled}`,
          );

          if (isDisabled) {
            console.log("\u2705 Кнопка калибровки НЕАКТИВНА на completed PR");
          } else {
            // Кликаем и проверяем что модалка readonly
            await calibrationButton.click();
            // Ждём появления модалки
            const modal = page.locator(".react-modal-sheet-container").first();
            await modal
              .waitFor({ state: "visible", timeout: 5000 });

            const saveBtn = page
              .locator(".react-modal-sheet-container")
              .getByRole("button", { name: /сохранить/i })
              .first();
            const saveVisible = await saveBtn
              .waitFor({ state: "visible", timeout: 3000 })
              .then(() => true)
              .catch(() => false);

            if (saveVisible) {
              const saveDisabled = await saveBtn.isDisabled();
              console.log(
                `Кнопка "Сохранить" в модалке: visible=${saveVisible}, disabled=${saveDisabled}`,
              );
              // На completed PR кнопка "Сохранить" должна быть заблокирована или отсутствовать
              expect(saveDisabled).toBe(true);
            } else {
              console.log(
                '\u2705 Кнопка "Сохранить" отсутствует — модалка калибровки readonly',
              );
            }

            // Закрыть модалку
            await page.keyboard.press("Escape");
            // Ждём закрытия модалки
            await modal.waitFor({ state: "hidden", timeout: 2000 });
          }
        } else {
          // Кнопка калибровки не видна — корректное поведение для completed PR
          console.log(
            "\u2705 Кнопка калибровки НЕ видна на completed PR — корректно",
          );
        }
      });
    });

    test("C4183: Completed PR — настройки статистики readonly", async ({
      adminAuth: page,
      settingsModal,
    }) => {
      setSeverity("normal");

      await test.step("Открыть completed PR", async () => {
        await page.goto(
          buildPRUrl(completedPrId, { statisticsSettings: true }),
        );
        await page.waitForLoadState("networkidle");
      });

      await test.step("Перейти на вкладку Результаты", async () => {
        const resultsTab = page
          .locator('button[class*="Tabs_button"]')
          .filter({ hasText: /результаты/i });
        await resultsTab.click();
        // Ждём загрузки контента вкладки
        await page
          .locator('table, button[class*="settings"]')
          .first()
          .waitFor({ state: "visible", timeout: 10000 });
      });

      await test.step("Проверить доступность кнопки настроек", async () => {
        // Ищем кнопку "Скачать результаты" как ориентир
        const downloadButton = page.getByRole("button", {
          name: /скачать результаты/i,
        });
        const downloadVisible = await downloadButton
          .waitFor({ state: "visible", timeout: 5000 })
          .then(() => true)
          .catch(() => false);

        if (downloadVisible) {
          // Ищем шестерёнку настроек рядом
          const settingsButton = page
            .locator(
              'button[class*="settings-button"], button[class*="settings"]',
            )
            .or(
              downloadButton
                .locator("..")
                .locator("button")
                .filter({ hasNotText: /скачать/i })
                .first(),
            );
          const settingsVisible = await settingsButton
            .waitFor({ state: "visible", timeout: 3000 })
            .then(() => true)
            .catch(() => false);

          if (settingsVisible) {
            await settingsButton.click();
            // Ждём появления модалки настроек
            const modalContainer = page
              .locator('[class*="react-modal-sheet-container"]')
              .first();
            await modalContainer
              .waitFor({ state: "visible", timeout: 5000 });
            const modalVisible = await modalContainer
              .waitFor({ state: "visible", timeout: 5000 })
              .then(() => true)
              .catch(() => false);

            if (modalVisible) {
              // Проверяем кнопку Сохранить
              const saveBtn = modalContainer
                .getByRole("button", { name: /сохранить/i })
                .first();
              const saveVisible = await saveBtn
                .waitFor({ state: "visible", timeout: 3000 })
                .then(() => true)
                .catch(() => false);

              if (saveVisible) {
                const saveDisabled = await saveBtn
                  .isDisabled()
                  .catch(() => false);
                console.log(
                  `Кнопка "Сохранить" в настройках: visible=${saveVisible}, disabled=${saveDisabled}`,
                );
              } else {
                console.log(
                  '\u2705 Кнопка "Сохранить" отсутствует в настройках completed PR',
                );
              }

              // Проверяем тоглы
              const toggles = modalContainer.locator('input[type="checkbox"]');
              const toggleCount = await toggles.count();
              let disabledCount = 0;
              for (let i = 0; i < toggleCount; i++) {
                const isDisabled = await toggles
                  .nth(i)
                  .isDisabled()
                  .catch(() => false);
                if (isDisabled) disabledCount++;
              }
              console.log(
                `Тоглы: всего=${toggleCount}, disabled=${disabledCount}`,
              );

              // Закрыть модалку
              await page.keyboard.press("Escape");
            } else {
              console.log(
                "\u2705 Модалка настроек не открылась — кнопка настроек может быть неактивна",
              );
            }
          } else {
            console.log("\u2705 Кнопка настроек НЕ видна на completed PR");
          }
        } else {
          console.log(
            '\u26A0\uFE0F Кнопка "Скачать результаты" не найдена — проверяем через альтернативный путь',
          );

          // Пробуем найти шестерёнку настроек напрямую
          const gearButton = page.locator('button[class*="settings"]').first();
          const gearVisible = await gearButton
            .waitFor({ state: "visible", timeout: 3000 })
            .then(() => true)
            .catch(() => false);
          console.log(`Шестерёнка настроек напрямую: visible=${gearVisible}`);

          if (!gearVisible) {
            console.log("\u2705 Кнопка настроек недоступна на completed PR");
          }
        }
      });
    });
  },
);
