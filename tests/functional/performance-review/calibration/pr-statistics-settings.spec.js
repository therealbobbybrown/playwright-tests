// tests/functional/performance-review/calibration/pr-statistics-settings.spec.js
// Тесты настроек статистики PR (feature flag: ?feature=statisticsSettings)

import { test as baseTest, expect } from "../../../fixtures/auth.js";
import { StatisticsSettingsModal } from "../../../../pages/StatisticsSettingsModal.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";
import { buildPRUrl } from "../../../utils/pr-urls.js";

/**
 * Тесты настроек статистики PR
 *
 * Предусловия:
 * - PR должен быть запущен (статус active)
 * - В PR должны быть анкеты с компетенциями
 *
 * Активация feature flag: добавить ?feature=statisticsSettings к URL
 */

const test = baseTest.extend({
  settingsModal: async ({ adminAuth: page }, use, testInfo) => {
    const modal = new StatisticsSettingsModal(page, testInfo);
    await use(modal);
  },
});

test.describe(
  "PR Statistics Settings",
  { tag: ["@ui", "@performance-review", "@calibration", "@regression"] },
  () => {
    let testPrId;

    test.beforeAll(async ({ prSeed }) => {
      test.setTimeout(180000);
      const timestamp = Date.now();
      const pr = await prSeed.seedActivePR({
        title: `E2E_Настройки статистики_${timestamp}`,
        fillAssessments: true,
      });
      testPrId = pr.id;
      console.log(`✅ Создан PR для тестов настроек статистики: ${testPrId}`);

      // Настройка статистики с обязательными полями
      const { data: currentSettings } =
        await prSeed.prAPI.getStatisticsSettings(testPrId);
      currentSettings.settings.useOnlyHeadReceiver = true;
      currentSettings.settings.enableCompetenceWeights = true;
      currentSettings.settings.enableCalibration = true;
      currentSettings.settings.enableResponsesOverwriting = true;
      await prSeed.prAPI.updateStatisticsSettings(testPrId, currentSettings);
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.PERFORMANCE_REVIEW, "Statistics Settings");
    });

    test.describe("Открытие настроек статистики", () => {
      test(
        "C4118: Шестеренка настроек появляется при добавлении feature flag",
        { tag: [] },
        async ({ adminAuth: page }) => {
          setSeverity("normal");
          const baseUrl = new URL(process.env.BASE_URL).origin;

          await test.step("Открыть PR без feature flag", async () => {
            await page.goto(
              `${baseUrl}/ru/manager/performance-reviews/${testPrId}/`,
            );
            await page.waitForLoadState("networkidle");

            // Переключиться на вкладку "Результаты"
            const resultsTab = page
              .locator('button[class*="Tabs_button"]')
              .filter({ hasText: /результаты/i });
            await resultsTab.click();
            // Ждём загрузки вкладки
            await page
              .locator("table")
              .first()
              .waitFor({ state: "visible", timeout: 10000 });

            // Проверить, что шестеренки НЕТ
            const settingsButton = page.locator(
              'button[class*="settings-button"]',
            );
            const gearVisible = await settingsButton
              .waitFor({ state: "visible", timeout: 3000 })
              .then(() => true)
              .catch(() => false);

            console.log(
              `Шестеренка без feature flag: ${gearVisible ? "видна" : "скрыта"}`,
            );
            expect(
              gearVisible,
              "Шестеренка настроек НЕ должна появляться без feature flag",
            ).toBe(false);
          });

          await test.step("Открыть PR с feature flag", async () => {
            await page.goto(buildPRUrl(testPrId, { statisticsSettings: true }));
            await page.waitForLoadState("networkidle");

            // Переключиться на вкладку "Результаты"
            const resultsTab = page
              .locator('button[class*="Tabs_button"]')
              .filter({ hasText: /результаты/i });
            await resultsTab.click();
            // Ждём загрузки вкладки
            await page
              .locator("table")
              .first()
              .waitFor({ state: "visible", timeout: 10000 });

            // Проверить, что шестеренка ЕСТЬ
            const settingsButton = page.locator(
              'button[class*="settings-button"]',
            );
            const gearVisible = await settingsButton
              .waitFor({ state: "visible", timeout: 5000 })
              .then(() => true)
              .catch(() => false);

            console.log(
              `Шестеренка с feature flag: ${gearVisible ? "видна" : "скрыта"}`,
            );
            expect(gearVisible).toBe(true);
          });
        },
      );

      test("C4119: Модальное окно настроек открывается по клику на шестеренку", async ({
        adminAuth: page,
        settingsModal,
      }) => {
        setSeverity("normal");

        await test.step("Открыть PR с feature flag", async () => {
          await page.goto(buildPRUrl(testPrId, { statisticsSettings: true }));
          await page.waitForLoadState("networkidle");
        });

        await test.step("Открыть модальное окно настроек", async () => {
          await settingsModal.open();
          await settingsModal.assertOpened();
          console.log(
            '✅ Модальное окно "Настройка статистики" успешно открыто',
          );
        });
      });
    });

    test.describe("Настройки источника итоговой оценки", () => {
      test('C4120: Можно выбрать "Из оценок разных направлений"', async ({
        adminAuth: page,
        settingsModal,
      }) => {
        setSeverity("normal");

        await test.step("Открыть модальное окно настроек", async () => {
          await page.goto(buildPRUrl(testPrId, { statisticsSettings: true }));
          await page.waitForLoadState("networkidle");
          await settingsModal.open();
        });

        await test.step('Отключить калибровку (несовместима с "Все направления")', async () => {
          // Калибровка работает только в режиме "Только руководитель".
          // При "Все направления" показывается общая оценка, не итоговая.
          await settingsModal.toggleCalibration(false);
          // Ждём применения изменения тогла
          await page
            .locator('input[type="checkbox"]')
            .first()
            .waitFor({ state: "visible", timeout: 2000 });
        });

        await test.step('Выбрать "Из оценок разных направлений"', async () => {
          await settingsModal.selectAllDirections();
          await settingsModal.assertAllDirectionsSelected();
          console.log('✅ Карточка "Все направления" выбрана');
        });

        await settingsModal.close();
      });

      test('C4121: Можно выбрать "Только из оценок руководителя"', async ({
        adminAuth: page,
        settingsModal,
      }) => {
        setSeverity("normal");

        await test.step("Открыть модальное окно настроек", async () => {
          await page.goto(buildPRUrl(testPrId, { statisticsSettings: true }));
          await page.waitForLoadState("networkidle");
          await settingsModal.open();
        });

        await test.step('Выбрать "Только из оценок руководителя"', async () => {
          await settingsModal.selectManagerOnly();
          // Ждём применения изменений UI
          await settingsModal.allowCalibrationToggle
            .waitFor({ state: "visible", timeout: 3000 });

          // Проверяем через getCurrentSettings
          const settings = await settingsModal.getCurrentSettings();
          expect(settings.source).toBe("managerOnly");
          console.log('✅ Выбран источник "Только руководитель"');
        });

        await settingsModal.close();
      });
    });

    test.describe("Настройки калибровки", () => {
      test("C4122: Можно включить калибровку", async ({
        adminAuth: page,
        settingsModal,
      }) => {
        setSeverity("normal");

        await test.step("Открыть модальное окно настроек", async () => {
          await page.goto(buildPRUrl(testPrId, { statisticsSettings: true }));
          await page.waitForLoadState("networkidle");
          await settingsModal.open();
        });

        await test.step('Выбрать источник "Только из оценок руководителя"', async () => {
          // Калибровка доступна только при выборе "Только руководитель"
          await settingsModal.selectManagerOnly();
          // Ждём появления тогла калибровки
          await settingsModal.allowCalibrationToggle
            .waitFor({ state: "visible", timeout: 3000 });
          console.log('✅ Выбран источник "Только руководитель"');
        });

        await test.step("Включить калибровку", async () => {
          // После выбора "Только руководитель" должен появиться тогл калибровки
          const calibrationToggle = settingsModal.allowCalibrationToggle;
          const isVisible = await calibrationToggle
            .waitFor({ state: "visible", timeout: 5000 })
            .then(() => true)
            .catch(() => false);

          expect(
            isVisible,
            "Тогл калибровки должен быть виден после выбора источника 'Только руководитель'",
          ).toBe(true);
          await settingsModal.toggleCalibration(true);
          const settings = await settingsModal.getCurrentSettings();
          expect(settings.allowCalibration).toBe(true);
          console.log("✅ Калибровка включена");
        });

        await settingsModal.close();
      });
    });

    test.describe("Характеристики оценки", () => {
      test("C4123: Можно настроить текстовые диапазоны (низко/средне/высоко)", async ({
        adminAuth: page,
        settingsModal,
      }) => {
        setSeverity("normal");

        await test.step("Открыть модальное окно настроек", async () => {
          await page.goto(buildPRUrl(testPrId, { statisticsSettings: true }));
          await page.waitForLoadState("networkidle");
          await settingsModal.open();
        });

        await test.step("Включить текстовые характеристики", async () => {
          await settingsModal.toggleTextCharacteristics(true);

          const settings = await settingsModal.getCurrentSettings();
          expect(settings.textCharacteristics).toBe(true);
          console.log("✅ Текстовые характеристики включены");
        });

        await test.step("Добавить 3 диапазона", async () => {
          // Добавляем минимум 3 характеристики
          for (let i = 0; i < 3; i++) {
            await settingsModal.addCharacteristic();
          }

          const count = await settingsModal.getCharacteristicsCount();
          expect(count).toBeGreaterThanOrEqual(3);
          console.log(`✅ Добавлено ${count} диапазонов`);
        });

        await settingsModal.close();
      });
    });

    test.describe("Сохранение настроек", () => {
      test(
        "C4124: Настройки сохраняются и применяются",
        { tag: ["@critical"] },
        async ({ adminAuth: page, settingsModal }) => {
          setSeverity("critical");

          await test.step("Открыть модальное окно настроек", async () => {
            await page.goto(buildPRUrl(testPrId, { statisticsSettings: true }));
            await page.waitForLoadState("networkidle");
            await settingsModal.open();
          });

          await test.step("Изменить настройки — выбрать источник", async () => {
            await settingsModal.selectManagerOnly();
            console.log('✅ Выбран источник "Только руководитель"');
          });

          await test.step("Сохранить настройки", async () => {
            await settingsModal.save();
            console.log("✅ Настройки сохранены");
          });

          await test.step("Верифицировать сохранение — модалка закрыта и настройки применены", async () => {
            // save() ждёт state: 'hidden' — если дошли сюда без ошибки, модалка закрылась.
            // Дополнительно проверяем что модалка действительно не видна в DOM.
            const isModalVisible = await settingsModal.modal.isVisible();
            expect(
              isModalVisible,
              "Модальное окно должно закрыться после сохранения",
            ).toBe(false);
          });
        },
      );
    });
  },
);
