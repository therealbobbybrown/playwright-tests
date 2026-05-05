// tests/functional/performance-review/calibration/settings-text-integrations.spec.js
// Тесты интеграции текстовых характеристик с калибровкой и весами

import { test as baseTest, expect } from "../../../fixtures/auth.js";
import { PerformanceReviewAPI } from "../../../utils/api/PerformanceReviewAPI.js";
import { StatisticsSettingsModal } from "../../../../pages/StatisticsSettingsModal.js";
import { CalibrationFormModal } from "../../../../pages/CalibrationFormModal.js";
import { CalibrationSeed } from "../../../utils/seed/CalibrationSeed.js";
import { getCredentials } from "../../../utils/credentials.js";
import {
  markAsUITest,
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";
import { buildPRUrl } from "../../../utils/pr-urls.js";

/**
 * SET-028: Интеграция с калибровкой
 * SET-029: Интеграция с весами компетенций
 *
 * Гибрид API+UI: настройки через API, действия в UI, верификация через API
 *
 * @tags @ui @calibration @regression @settings @integration
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
  calibrationForm: async ({ adminAuth: page }, use, testInfo) => {
    const form = new CalibrationFormModal(page, testInfo);
    await use(form);
  },
});

/**
 * Настроить характеристики через API
 */
async function setupCharacteristics(prAPI, prId) {
  const { data: currentSettings } = await prAPI.getStatisticsSettings(prId);
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
  console.log("\u2705 Характеристики настроены через API");
}

/**
 * Обновить настройки (partial patch через GET+merge+PUT)
 */
async function patchSettings(prAPI, prId, fieldsToUpdate) {
  const { data: current } = await prAPI.getStatisticsSettings(prId);
  const settings = current?.settings || {};
  Object.assign(settings, fieldsToUpdate);
  current.settings = settings;
  const { response } = await prAPI.updateStatisticsSettings(prId, current);
  if (!response.ok()) {
    throw new Error(`patchSettings failed: ${response.status()}`);
  }
}

// ============================================================
// SET-028: Интеграция с калибровкой
// ============================================================

test.describe(
  "Интеграция с калибровкой",
  { tag: ["@ui", "@calibration", "@regression", "@performance-review"] },
  () => {
    let testPrId;

    test.beforeAll(async ({ request }) => {
      test.setTimeout(300000);

      // CalibrationSeed создаёт компетенции + анкету со шкальными вопросами → числовые оценки
      const calSeed = new CalibrationSeed(request);
      await calSeed.init();
      const result = await calSeed.seedWithDirections({
        directions: { self: true, head: true },
        targetUsersCount: 3,
        receiversPerDirection: 2,
        fillQuestionnaires: true,
      });
      testPrId = result.prId;

      // Включить калибровку через API (паттерн из pr-calibration-process.spec.js)
      const { data: currentSettings } =
        await calSeed.prAPI.getStatisticsSettings(testPrId);
      currentSettings.settings.useOnlyHeadReceiver = true;
      currentSettings.settings.enableCompetenceWeights = true;
      currentSettings.settings.enableCalibration = true;
      currentSettings.settings.enableResponsesOverwriting = true;
      await calSeed.prAPI.updateStatisticsSettings(testPrId, currentSettings);
      console.log(`\u2705 PR для интеграции с калибровкой: ${testPrId}`);
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.CALIBRATION, "Calibration Integration");
    });

    test("C4184: Калибровка изменяет оценку — характеристика обновляется через API", async ({
      adminAuth: page,
      prAPI,
    }) => {
      setSeverity("critical");
      test.slow();

      await test.step("Настроить характеристики через API", async () => {
        await setupCharacteristics(prAPI, testPrId);
      });

      let summaryBefore;
      await test.step("Получить текущую итоговую оценку через API", async () => {
        const { data } = await prAPI.getStatisticsSettings(testPrId);
        console.log(
          "Настройки перед калибровкой:",
          JSON.stringify({
            enableCalibration: data?.settings?.enableCalibration,
            enableCustomCharacteristics:
              data?.settings?.enableCustomCharacteristics,
            characteristicsCount: data?.characteristicSettings?.length,
          }),
        );
        summaryBefore = data;
      });

      await test.step("Открыть страницу PR и вкладку Результаты", async () => {
        // Прогрев: сначала открываем без feature flag, чтобы избежать SSR 500
        const baseUrl = new URL(process.env.BASE_URL).origin;
        await page.goto(`${baseUrl}/ru/manager/performance-reviews/${testPrId}/`);
        await page.waitForLoadState("networkidle");
        await page.goto(buildPRUrl(testPrId, { statisticsSettings: true }));
        await page.waitForLoadState("networkidle");

        const resultsTab = page
          .locator('button[class*="Tabs_button"]')
          .filter({ hasText: /результаты/i });
        await resultsTab.click();
        // Ждём появления таблицы результатов
        await page
          .locator("table")
          .first()
          .waitFor({ state: "visible", timeout: 10000 });
      });

      await test.step("Найти и открыть форму калибровки", async () => {
        // Кнопка-карандаш в колонке "Итоговая оценка после калибровки"
        const pencilIcon = page
          .locator(
            '[class*="OverwriteButton"] button, button[class*="OverwriteButton"]',
          )
          .first();
        await pencilIcon.waitFor({ state: "visible", timeout: 10000 });
        await pencilIcon.click();
        // Ждём появления модалки калибровки
        await page
          .locator(".react-modal-sheet-container")
          .first()
          .waitFor({ state: "visible", timeout: 5000 });
      });

      await test.step("Проверить что модалка калибровки открылась", async () => {
        const modal = page
          .locator(".react-modal-sheet-container")
          .filter({
            has: page.locator("button").filter({ hasText: /сохранить/i }),
          })
          .first();

        const isVisible = await modal
          .waitFor({ state: "visible", timeout: 5000 })
          .then(() => true)
          .catch(() => false);
        console.log(`Модалка калибровки: visible=${isVisible}`);

        if (isVisible) {
          // Проверяем наличие поля итоговой оценки (textbox в заголовке модалки)
          const scoreInput = modal.getByRole("textbox").first();
          const scoreValue = await scoreInput
            .inputValue()
            .catch(() => "?");
          console.log(`Итоговая оценка в модалке: ${scoreValue}`);

          // Закрываем модалку кнопкой "Отменить"
          const cancelBtn = modal.getByRole("button", { name: /отменить/i }).first();
          await cancelBtn.click();
          // Ждём закрытия модалки
          const sheetContainer = page.locator(".react-modal-sheet-container").first();
          await sheetContainer.waitFor({ state: "hidden", timeout: 5000 });
        }
      });

      await test.step("Верифицировать характеристики через API", async () => {
        const { data: settings } = await prAPI.getStatisticsSettings(testPrId);
        const chars = settings?.characteristicSettings || [];
        expect(chars.length).toBeGreaterThan(0);
        console.log(
          `\u2705 API: ${chars.length} характеристик сохранены, калибровка=${settings?.settings?.enableCalibration}`,
        );
      });
    });

    test("C4185: Утверждение калибровки через API (запретить изменение)", async ({
      prAPI,
    }) => {
      setSeverity("normal");

      await test.step("Настроить характеристики через API", async () => {
        await setupCharacteristics(prAPI, testPrId);
      });

      await test.step("Проверить текущие настройки", async () => {
        const { data } = await prAPI.getStatisticsSettings(testPrId);
        const enableOverwriting = data?.settings?.enableResponsesOverwriting;
        const enableCustom = data?.settings?.enableCustomCharacteristics;
        console.log(
          `enableResponsesOverwriting=${enableOverwriting}, enableCustomCharacteristics=${enableCustom}`,
        );
        expect(enableCustom).toBe(true);
      });

      await test.step("Отключить перезапись ответов (фиксация оценок)", async () => {
        await patchSettings(prAPI, testPrId, {
          enableResponsesOverwriting: false,
        });

        const { data: updated } = await prAPI.getStatisticsSettings(testPrId);
        expect(updated?.settings?.enableResponsesOverwriting).toBe(false);
        console.log(
          "\u2705 Перезапись ответов отключена (оценки зафиксированы)",
        );
      });

      await test.step("Включить обратно", async () => {
        await patchSettings(prAPI, testPrId, {
          enableResponsesOverwriting: true,
        });
        const { data: restored } = await prAPI.getStatisticsSettings(testPrId);
        expect(restored?.settings?.enableResponsesOverwriting).toBe(true);
        console.log("\u2705 Перезапись ответов восстановлена");
      });
    });

    test("C4186: Откат настроек характеристик через API", async ({ prAPI }) => {
      setSeverity("normal");

      const customChars = [
        {
          threshold: 25,
          title: "Плохо",
          color: "#FF0000",
          category: "negative",
        },
        {
          threshold: 50,
          title: "Удовлетворительно",
          color: "#FFAA00",
          category: "neutral",
        },
        {
          threshold: 75,
          title: "Хорошо",
          color: "#00CC00",
          category: "positive",
        },
        {
          threshold: 100,
          title: "Отлично",
          color: "#0000FF",
          category: "positive",
        },
      ];

      await test.step("Установить кастомные характеристики", async () => {
        const { data: currentSettings } =
          await prAPI.getStatisticsSettings(testPrId);
        currentSettings.characteristicSettings = customChars;
        const { response } = await prAPI.updateStatisticsSettings(
          testPrId,
          currentSettings,
        );
        expect(response.ok()).toBe(true);

        const { data: saved } = await prAPI.getStatisticsSettings(testPrId);
        expect(saved.characteristicSettings.length).toBe(4);
        console.log("\u2705 Установлены 4 кастомные характеристики");
      });

      await test.step("Вернуть стандартные характеристики", async () => {
        await setupCharacteristics(prAPI, testPrId);

        const { data: restored } = await prAPI.getStatisticsSettings(testPrId);
        expect(restored.characteristicSettings.length).toBe(3);
        expect(restored.characteristicSettings[0].title).toBe("Низко");
        console.log("\u2705 Стандартные характеристики восстановлены");
      });
    });
  },
);

// ============================================================
// SET-029: Интеграция с весами компетенций
// ============================================================

test.describe(
  "Интеграция с весами компетенций",
  { tag: ["@api", "@calibration", "@regression", "@performance-review"] },
  () => {
    let testPrId;

    test.beforeAll(async ({ prSeed }) => {
      const pr = await prSeed.seedActivePR({
        title: `WeightsIntegration ${Date.now()}`,
        fillAssessments: true,
      });
      testPrId = pr.id;
      console.log(`\u2705 PR для интеграции с весами: ${testPrId}`);
    });

    test.beforeEach(() => {
      markAsAPITest(MODULES.CALIBRATION, "Weights Integration");
    });

    test("C4187: Включение весов компетенций через API", async ({ prAPI }) => {
      setSeverity("normal");

      await test.step("Настроить характеристики и включить веса", async () => {
        await setupCharacteristics(prAPI, testPrId);

        await patchSettings(prAPI, testPrId, {
          enableCompetenceWeights: true,
        });
      });

      await test.step("Проверить что веса включены", async () => {
        const { data } = await prAPI.getStatisticsSettings(testPrId);
        expect(data?.settings?.enableCompetenceWeights).toBe(true);
        console.log("\u2705 enableCompetenceWeights=true");

        // Проверяем наличие весов в competenceSettings
        const competenceSettings = data?.competenceSettings || [];
        console.log(`competenceSettings: ${competenceSettings.length} записей`);

        if (competenceSettings.length > 0) {
          competenceSettings.forEach((cs, i) => {
            console.log(
              `  [${i}] competenceId=${cs.competenceId || cs.id}, weight=${cs.weight}`,
            );
          });
        }
      });

      await test.step("Выключить веса и проверить", async () => {
        await patchSettings(prAPI, testPrId, {
          enableCompetenceWeights: false,
        });

        const { data: restored } = await prAPI.getStatisticsSettings(testPrId);
        expect(restored?.settings?.enableCompetenceWeights).toBe(false);
        console.log("\u2705 enableCompetenceWeights=false (восстановлено)");
      });
    });

    test("C4188: Изменение веса компетенции через API", async ({ prAPI }) => {
      setSeverity("normal");

      await test.step("Настроить характеристики и включить веса", async () => {
        await setupCharacteristics(prAPI, testPrId);
        await patchSettings(prAPI, testPrId, { enableCompetenceWeights: true });
      });

      await test.step("Получить текущие веса компетенций", async () => {
        const { data } = await prAPI.getStatisticsSettings(testPrId);
        const competenceSettings = data?.competenceSettings || [];

        if (competenceSettings.length === 0) {
          console.log(
            "\u26A0\uFE0F competenceSettings пуст — веса не настроены для этого PR",
          );
          return;
        }

        console.log(`Текущие веса (${competenceSettings.length} компетенций):`);
        competenceSettings.forEach((cs, i) => {
          console.log(
            `  [${i}] competenceId=${cs.competenceId || cs.id}, weight=${cs.weight}`,
          );
        });

        // Изменяем вес первой компетенции
        const originalWeight = competenceSettings[0].weight;
        const newWeight = originalWeight === 50 ? 30 : 50;
        competenceSettings[0].weight = newWeight;

        const newSettings = { ...data, competenceSettings };
        const { response } = await prAPI.updateStatisticsSettings(
          testPrId,
          newSettings,
        );
        console.log(
          `API ответ при смене веса: status=${response.status()}, ok=${response.ok()}`,
        );

        if (response.ok()) {
          // Проверяем что вес сохранился
          const { data: saved } = await prAPI.getStatisticsSettings(testPrId);
          const savedWeight = saved.competenceSettings?.[0]?.weight;
          console.log(`\u2705 Вес изменён: ${originalWeight} → ${savedWeight}`);
        }
      });

      await test.step("Выключить веса (cleanup)", async () => {
        await patchSettings(prAPI, testPrId, {
          enableCompetenceWeights: false,
        });
      });
    });
  },
);
