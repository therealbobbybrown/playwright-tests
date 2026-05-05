// tests/functional/performance-review/calibration/settings-negative-scenarios.spec.js
// Негативные сценарии: текстовые характеристики НЕ показываются при отсутствии предусловий

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
 * Негативные сценарии для текстовых характеристик
 *
 * Проверяем что текстовые характеристики НЕ показываются при отсутствии предусловий:
 * 1. Выключена калибровка → структура таблицы другая, характеристики недоступны
 * 2. Выключен тогл текстовых характеристик → чекбокс "только текст" сбрасывается/скрывается
 * 3. Включён "только текст", но потом выключили характеристики → в результатах числа видны
 * 4. Источник "все направления" + калибровка выключена → характеристики недоступны
 *
 * Проверяем во всех местах: таблица результатов, модалка калибровки, дашборд
 *
 * @tags @ui @calibration @negative @settings
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
  "Негативные сценарии: текстовые характеристики",
  {
    tag: [
      "@ui",
      "@calibration",
      "@negative",
      "@performance-review",
      "@regression",
    ],
  },
  () => {
    let testPrId;

    test.beforeAll(async ({ prSeed }) => {
      const timestamp = Date.now();
      const pr = await prSeed.seedActivePR({
        title: `NegativeScenarios ${timestamp}`,
        fillAssessments: true,
      });
      testPrId = pr.id;
      console.log(`✅ Создан PR для негативных тестов: ${testPrId}`);
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.CALIBRATION, "Negative Scenarios");
    });

    test("C3965: При выключенной калибровке структура таблицы другая — нет колонки калибровки", async ({
      adminAuth: page,
      prAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выключить калибровку через API", async () => {
        const { data: currentSettings } =
          await prAPI.getStatisticsSettings(testPrId);
        const newSettings = {
          ...currentSettings,
          settings: {
            ...currentSettings.settings,
            enableCalibration: false,
            enableResponsesOverwriting: false,
            enableCustomCharacteristics: true, // характеристики включены
            enableOnlyCustomCharacteristics: true, // только текст включён
          },
          characteristicSettings: [
            { upperBound: 50, title: "Низко", color: "#FF6B6B" },
            { upperBound: 80, title: "Средне", color: "#FFE66D" },
            { upperBound: 100, title: "Высоко", color: "#4ECDC4" },
          ],
        };
        await prAPI.updateStatisticsSettings(testPrId, newSettings);
        console.log(
          "✅ Калибровка выключена, характеристики включены через API",
        );
      });

      await test.step('Открыть вкладку "Результаты"', async () => {
        await page.goto(buildPRUrl(testPrId, { statisticsSettings: true }));
        await page.waitForLoadState("networkidle");

        const resultsTab = page.getByRole("button", { name: /^результаты$/i });
        await resultsTab.click();
        await page
          .locator("th, td, table")
          .first()
          .waitFor({ state: "visible", timeout: 10000 });
      });

      await test.step('Проверить: колонка "после калибровки" отсутствует', async () => {
        // Ищем колонку калибровки в заголовке таблицы
        const calibrationHeader = page
          .locator("th")
          .filter({ hasText: /после калибровки/i })
          .first();
        const hasCalibrationColumn = await calibrationHeader
          .waitFor({ state: "visible", timeout: 3000 })
          .then(() => true)
          .catch(() => false);

        console.log(
          `✅ Колонка "после калибровки": ${hasCalibrationColumn ? "есть" : "отсутствует"}`,
        );
        expect(
          hasCalibrationColumn,
          'При выключенной калибровке колонка "после калибровки" должна отсутствовать',
        ).toBe(false);
      });

      await test.step("Проверить: текстовые характеристики НЕ показываются (калибровка выключена)", async () => {
        // Текстовые бейджи в колонке итоговой оценки
        const textBadge = page
          .locator("td")
          .filter({ hasText: /^(Низко|Средне|Высоко)$/ })
          .first();
        const hasTextBadge = await textBadge
          .waitFor({ state: "visible", timeout: 2000 })
          .then(() => true)
          .catch(() => false);

        console.log(
          `✅ Текстовый бейдж в таблице: ${hasTextBadge ? "есть (не должен быть!)" : "отсутствует (ок)"}`,
        );
        expect(
          hasTextBadge,
          "При выключенной калибровке текстовые характеристики не должны показываться",
        ).toBe(false);
      });
    });

    test('C3966: При выключении тогла характеристик чекбокс "только текст" скрывается', async ({
      adminAuth: page,
      settingsModal,
      prAPI,
    }) => {
      setSeverity("normal");

      await test.step("Включить все настройки через API", async () => {
        // ВАЖНО: Используем URL с ?feature=statisticsSettings, т.к. без этого параметра
        // настройки enableCalibration/enableCustomCharacteristics не сохраняются корректно
        // и фронтенд не отображает секцию калибровки/характеристик
        const featureUrl = `/manager/performance-reviews/${testPrId}/statistics/settings/?feature=statisticsSettings`;
        const { data: currentSettings } = await prAPI.get(featureUrl);
        const newSettings = {
          ...currentSettings,
          settings: {
            ...(currentSettings?.settings || {}),
            // useOnlyHeadReceiver ОБЯЗАТЕЛЕН: секции калибровки/текстовых характеристик
            // рендерятся фронтендом ТОЛЬКО в режиме "Только из оценок руководителя"
            useOnlyHeadReceiver: true,
            enableCalibration: true,
            enableResponsesOverwriting: true,
            enableCustomCharacteristics: true,
            enableOnlyCustomCharacteristics: true,
          },
          characteristicSettings: [
            { threshold: 33, title: "Низко", category: "negative" },
            { threshold: 66, title: "Средне", category: "neutral" },
            { threshold: 100, title: "Высоко", category: "positive" },
          ],
        };
        const { response: updateResp } = await prAPI.post(
          featureUrl,
          newSettings,
        );
        if (!updateResp.ok()) {
          console.log(
            `⚠ API POST не удался (${updateResp.status()}) — настройки будут включены через UI`,
          );
        }
        console.log('✅ Включены характеристики и "только текст" через API');
      });

      await test.step("Открыть модалку настроек и включить характеристики через UI", async () => {
        await page.goto(buildPRUrl(testPrId, { statisticsSettings: true }));
        await page.waitForLoadState("networkidle");
        await settingsModal.open();

        // Убеждаемся, что источник = "Только руководитель".
        // API уже установил useOnlyHeadReceiver=true, но UI может не отразить это.
        const isManagerActive = await settingsModal.managerOnlyCard
          .evaluate((el) => el.classList.value.includes("button--active"))
          .catch(() => false);
        if (!isManagerActive) {
          await settingsModal.selectManagerOnly();
        }
        console.log(
          `  Источник "Руководитель" активен: ${isManagerActive || "установлен"}`,
        );

        // ОБЯЗАТЕЛЬНО: enableCalibration должен быть true, иначе тогл характеристик не рендерится.
        // API мог не сохранить настройку — проверяем и включаем через UI при необходимости.
        const calibrationEnabled = await settingsModal._isToggleEnabled(
          settingsModal.allowCalibrationToggle,
        );
        console.log(`  Разрешить калибровку (UI): ${calibrationEnabled}`);
        if (!calibrationEnabled) {
          await settingsModal.toggleCalibration(true);
          console.log("  → Калибровка включена через UI");
        }

        // Теперь ждём появления тогла характеристик
        await settingsModal.textCharacteristicsToggle
          .waitFor({ state: "attached", timeout: 10000 });

        // Включаем тогл характеристик через UI
        const textCharEnabled = await settingsModal._isToggleEnabled(
          settingsModal.textCharacteristicsToggle,
        );
        if (!textCharEnabled) {
          await settingsModal.toggleTextCharacteristics(true);
          await page.waitForLoadState("networkidle", { timeout: 3000 });
          // Добавляем характеристики если нет
          const count = await settingsModal.getCharacteristicsCount();
          if (count < 3) {
            for (let i = count; i < 3; i++) {
              await settingsModal.addCharacteristic();
            }
          }
        }
        console.log("✅ Характеристики включены через UI");
      });

      await test.step('Проверить начальное состояние: чекбокс "только текст" виден', async () => {
        const showOnlyToggle = settingsModal.showOnlyCustomToggle;
        const isVisible = await showOnlyToggle
          .waitFor({ state: "visible", timeout: 3000 })
          .then(() => true)
          .catch(() => false);
        console.log(`✅ Чекбокс "только текст" виден: ${isVisible}`);
        expect(
          isVisible,
          'Чекбокс "только текст" должен быть виден при включённых характеристиках',
        ).toBe(true);
      });

      await test.step("Выключить тогл текстовых характеристик", async () => {
        await settingsModal.toggleTextCharacteristics(false);
        await page.waitForLoadState("networkidle", { timeout: 3000 });
        console.log("✅ Тогл текстовых характеристик выключен");
      });

      await test.step('Проверить: чекбокс "только текст" скрыт', async () => {
        const showOnlyToggle = settingsModal.showOnlyCustomToggle;
        const isVisible = await showOnlyToggle
          .waitFor({ state: "visible", timeout: 2000 })
          .then(() => true)
          .catch(() => false);

        console.log(
          `✅ Чекбокс "только текст" после выключения характеристик: ${isVisible ? "виден" : "скрыт"}`,
        );
        expect(
          isVisible,
          'При выключенных характеристиках чекбокс "только текст" должен быть скрыт',
        ).toBe(false);
      });

      await settingsModal.close();
    });

    test("C3967: После выключения характеристик в таблице видны только числа", async ({
      adminAuth: page,
      prAPI,
    }) => {
      setSeverity("normal");

      await test.step("Сначала включить всё, потом выключить характеристики", async () => {
        // Включаем
        const { data: currentSettings } =
          await prAPI.getStatisticsSettings(testPrId);
        let newSettings = {
          ...currentSettings,
          settings: {
            ...currentSettings.settings,
            enableCalibration: true,
            enableResponsesOverwriting: true,
            enableCustomCharacteristics: true,
            enableOnlyCustomCharacteristics: true,
          },
          characteristicSettings: [
            { upperBound: 50, title: "Низко", color: "#FF6B6B" },
            { upperBound: 80, title: "Средне", color: "#FFE66D" },
            { upperBound: 100, title: "Высоко", color: "#4ECDC4" },
          ],
        };
        await prAPI.updateStatisticsSettings(testPrId, newSettings);
        console.log("✅ Всё включено");

        // Теперь выключаем характеристики
        const { data: updatedSettings } =
          await prAPI.getStatisticsSettings(testPrId);
        newSettings = {
          ...updatedSettings,
          settings: {
            ...updatedSettings.settings,
            enableCustomCharacteristics: false,
            enableOnlyCustomCharacteristics: false,
          },
        };
        await prAPI.updateStatisticsSettings(testPrId, newSettings);
        console.log("✅ Характеристики выключены");
      });

      await test.step('Открыть вкладку "Результаты"', async () => {
        await page.goto(buildPRUrl(testPrId, { statisticsSettings: true }));
        await page.waitForLoadState("networkidle");

        const resultsTab = page.getByRole("button", { name: /^результаты$/i });
        await resultsTab.click();
        await page
          .locator("td, th, table")
          .first()
          .waitFor({ state: "visible", timeout: 10000 });
      });

      await test.step("Проверить: в таблице только числовые оценки, без текстовых бейджей", async () => {
        // Проверяем отсутствие текстовых бейджей
        const textBadge = page
          .locator("text=/^(Низко|Средне|Высоко)$/")
          .first();
        const hasTextBadge = await textBadge
          .waitFor({ state: "visible", timeout: 2000 })
          .then(() => true)
          .catch(() => false);

        console.log(
          `✅ Текстовый бейдж: ${hasTextBadge ? "есть (не должен быть!)" : "отсутствует (ок)"}`,
        );
        expect(
          hasTextBadge,
          "При выключенных характеристиках текстовых бейджей быть не должно",
        ).toBe(false);
      });
    });

    test("C3968: Модалка калибровки недоступна при выключенной калибровке", async ({
      adminAuth: page,
      prAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выключить калибровку через API", async () => {
        const { data: currentSettings } =
          await prAPI.getStatisticsSettings(testPrId);
        const newSettings = {
          ...currentSettings,
          settings: {
            ...currentSettings.settings,
            enableCalibration: false,
            enableResponsesOverwriting: false,
          },
        };
        await prAPI.updateStatisticsSettings(testPrId, newSettings);
        console.log("✅ Калибровка выключена через API");
      });

      await test.step('Открыть вкладку "Результаты"', async () => {
        await page.goto(buildPRUrl(testPrId, { statisticsSettings: true }));
        await page.waitForLoadState("networkidle");

        const resultsTab = page.getByRole("button", { name: /^результаты$/i });
        await resultsTab.click();
        await page
          .locator("th, td, table")
          .first()
          .waitFor({ state: "visible", timeout: 10000 });
      });

      await test.step("Проверить: нет элементов для открытия модалки калибровки", async () => {
        // Ищем любые интерактивные элементы в колонке оценок (карандаш, кнопка, ссылка)
        const editButton = page
          .locator("button")
          .filter({
            has: page.locator('[class*="edit"], [class*="pencil"], svg'),
          })
          .filter({ hasNot: page.locator('[class*="settings"]') })
          .first();
        const hasEditButton = await editButton
          .waitFor({ state: "visible", timeout: 2000 })
          .then(() => true)
          .catch(() => false);

        // Также проверим что колонки "после калибровки" нет
        const calibrationColumn = page
          .locator("th")
          .filter({ hasText: /после калибровки/i })
          .first();
        const hasCalibrationColumn = await calibrationColumn
          .waitFor({ state: "visible", timeout: 2000 })
          .then(() => true)
          .catch(() => false);

        console.log(
          `ℹ️ Кнопка редактирования: ${hasEditButton ? "есть" : "нет"}`,
        );
        console.log(
          `ℹ️ Колонка калибровки: ${hasCalibrationColumn ? "есть" : "нет"}`,
        );

        // При выключенной калибровке модалка недоступна
        expect(
          hasCalibrationColumn,
          'При выключенной калибровке колонка "после калибровки" должна отсутствовать',
        ).toBe(false);
      });
    });

    test("C3969: Дашборд не показывает текстовые характеристики при выключенных настройках", async ({
      adminAuth: page,
      prAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выключить текстовые характеристики через API", async () => {
        const { data: currentSettings } =
          await prAPI.getStatisticsSettings(testPrId);
        const newSettings = {
          ...currentSettings,
          settings: {
            ...currentSettings.settings,
            useOnlyHeadReceiver: true,
            enableCalibration: true,
            enableResponsesOverwriting: true,
            enableCustomCharacteristics: false,
            enableOnlyCustomCharacteristics: false,
          },
        };
        await prAPI.updateStatisticsSettings(testPrId, newSettings);
        console.log("✅ Текстовые характеристики выключены через API");
      });

      await test.step('Открыть дашборд', async () => {
        const baseUrl = new URL(process.env.BASE_URL).origin;
        await page.goto(`${baseUrl}/ru/dashboard/`);
        await page.waitForLoadState("networkidle");
        await page
          .locator('[class*="content"], [class*="main"], main, [class*="card"]')
          .first()
          .waitFor({ state: "visible", timeout: 10000 });
      });

      await test.step("Проверить: в карточках сотрудников нет текстовых характеристик", async () => {
        // Ищем бейджи с текстовыми характеристиками
        const textBadge = page
          .locator('[class*="badge"], [class*="chip"]')
          .filter({ hasText: /^(Низко|Средне|Высоко)$/ })
          .first();
        const hasTextBadge = await textBadge
          .waitFor({ state: "visible", timeout: 3000 })
          .then(() => true)
          .catch(() => false);

        console.log(
          `✅ Текстовый бейдж на дашборде: ${hasTextBadge ? "есть (не должен быть!)" : "отсутствует (ок)"}`,
        );

        // При выключенных характеристиках бейджей быть не должно
        expect(
          hasTextBadge,
          "При выключенных характеристиках текстовых бейджей на дашборде быть не должно",
        ).toBe(false);
      });
    });
  },
);
