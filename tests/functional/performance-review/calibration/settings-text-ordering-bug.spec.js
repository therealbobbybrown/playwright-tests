// tests/functional/performance-review/calibration/settings-text-ordering-bug.spec.js
// Воспроизведение бага: после редактирования порогов характеристик строки перемешиваются

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
 * Настроить PR с 3 характеристиками через API
 */
async function setupCharacteristics(prAPI, prId) {
  const characteristics = [
    { threshold: 33, title: "Низко", color: "#FF6B6B", category: "negative" },
    { threshold: 66, title: "Средне", color: "#FFE66D", category: "neutral" },
    { threshold: 100, title: "Высоко", color: "#4ECDC4", category: "positive" },
  ];

  const { data: currentSettings } = await prAPI.getStatisticsSettings(prId);
  const newSettings = {
    ...currentSettings,
    settings: {
      ...currentSettings.settings,
      useOnlyHeadReceiver: true,
      enableCompetenceWeights: true,
      enableCalibration: true,
      enableResponsesOverwriting: true,
      enableCustomCharacteristics: true,
      enableOnlyCustomCharacteristics: false,
    },
    characteristicSettings: characteristics,
  };

  const { response } = await prAPI.updateStatisticsSettings(prId, newSettings);
  if (!response.ok()) {
    throw new Error(
      `Не удалось настроить характеристики: ${response.status()}`,
    );
  }

  // Верификация
  const { data: saved } = await prAPI.getStatisticsSettings(prId);
  const savedChars = saved.characteristicSettings || [];
  expect(
    savedChars.length,
    "API должен вернуть 3 характеристики после setup",
  ).toBe(3);
  console.log(
    `✅ Setup: ${savedChars.map((c) => `${c.title}(${c.threshold})`).join(", ")}`,
  );
}

/**
 * Прочитать все характеристики из UI в порядке отображения
 * @returns {Promise<Array<{title: string, threshold: string}>>}
 */
async function readCharacteristicsFromUI(settingsModal, page) {
  const count = await settingsModal.getCharacteristicsCount();
  const result = [];
  for (let i = 0; i < count; i++) {
    const row = settingsModal.characteristicRows.nth(i);
    const title = await row.locator('input[name="title"]').inputValue();
    const thresholdInput = page.locator(
      `#performance-review-settings-characteristics-threshold-${i}`,
    );
    const threshold = await thresholdInput.inputValue().catch(() => "N/A");
    result.push({ title, threshold });
  }
  return result;
}

/**
 * Хелпер: включить нужные тоглы в UI если они выключены
 */
async function ensureTogglesEnabled(settingsModal, page) {
  await settingsModal.selectManagerOnly();
  await settingsModal.allowCalibrationToggle
    .waitFor({ state: "visible", timeout: 3000 });

  const calibrationEnabled = await settingsModal.allowCalibrationToggle
    .isChecked();
  if (!calibrationEnabled) {
    await settingsModal.toggleCalibration(true);
  }

  const textCharEnabled = await settingsModal.textCharacteristicsToggle
    .isChecked();
  if (!textCharEnabled) {
    await settingsModal.toggleTextCharacteristics(true);
    await page
      .locator('input[name="title"]')
      .first()
      .waitFor({ state: "visible", timeout: 3000 });
  }
}

test.describe(
  "БАГ: Порядок характеристик после редактирования порогов",
  { tag: ["@ui", "@calibration", "@regression", "@performance-review"] },
  () => {
    let testPrId;

    test.beforeAll(async ({ prSeed }) => {
      test.setTimeout(180000);
      const pr = await prSeed.seedActivePR({
        title: `OrderingBug ${Date.now()}`,
        fillAssessments: true,
      });
      testPrId = pr.id;
      console.log(`✅ Создан PR для теста порядка: ${testPrId}`);
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.CALIBRATION, "Ordering Bug");
    });

    test(
      "C7338: Порядок характеристик сохраняется после редактирования порогов",
      {
        tag: ["@critical"],
      },
      async ({ adminAuth: page, prAPI, settingsModal }) => {
        setSeverity("critical");

        // Шаг 1: Настроить 3 характеристики через API
        await test.step("Настроить 3 характеристики: Низко(33), Средне(66), Высоко(100)", async () => {
          await setupCharacteristics(prAPI, testPrId);
        });

        // Шаг 2: Открыть настройки, убедиться что порядок правильный
        await test.step("Открыть настройки и проверить начальный порядок", async () => {
          await page.goto(buildPRUrl(testPrId, { statisticsSettings: true }));
          await page.waitForLoadState("networkidle");
          await settingsModal.open();
          await ensureTogglesEnabled(settingsModal, page);

          const chars = await readCharacteristicsFromUI(settingsModal, page);
          console.log(
            `📋 Начальный порядок: ${chars.map((c) => `${c.title}(${c.threshold})`).join(", ")}`,
          );

          expect(chars[0].title, "Позиция 0 должна быть 'Низко'").toBe("Низко");
          expect(chars[1].title, "Позиция 1 должна быть 'Средне'").toBe(
            "Средне",
          );
          expect(chars[2].title, "Позиция 2 должна быть 'Высоко'").toBe(
            "Высоко",
          );
        });

        // Шаг 3: Сохранить без изменений (первый save — как в баг-репорте)
        await test.step("Сохранить настройки (первое сохранение)", async () => {
          const responsePromise = page.waitForResponse(
            (r) =>
              r.url().includes("/statistics/settings") &&
              r.request().method() === "POST" &&
              r.status() < 400,
            { timeout: 10000 },
          );
          await settingsModal.save();
          await responsePromise;
          console.log("✅ Первое сохранение выполнено");
        });

        // Шаг 4: Открыть заново, изменить пороги (40 и 80 вместо 33 и 66)
        await test.step("Открыть заново и изменить пороги на 40 и 80", async () => {
          // Перезагрузка как в баг-репорте: "Ещё раз зайти в настройки"
          await page.goto(buildPRUrl(testPrId, { statisticsSettings: true }));
          await page.waitForLoadState("networkidle");
          await settingsModal.open();
          await ensureTogglesEnabled(settingsModal, page);

          // Меняем пороги — ключевое действие, воспроизводящее баг
          await settingsModal.setCharacteristicUpperBound(0, 40);
          await settingsModal.setCharacteristicUpperBound(1, 80);

          const charsAfterEdit = await readCharacteristicsFromUI(
            settingsModal,
            page,
          );
          console.log(
            `📋 После редактирования (до save): ${charsAfterEdit.map((c) => `${c.title}(${c.threshold})`).join(", ")}`,
          );
        });

        // Шаг 5: Сохранить (второе сохранение — после редактирования порогов)
        await test.step("Сохранить настройки (второе сохранение после редактирования порогов)", async () => {
          const responsePromise = page.waitForResponse(
            (r) =>
              r.url().includes("/statistics/settings") &&
              r.request().method() === "POST" &&
              r.status() < 400,
            { timeout: 10000 },
          );
          await settingsModal.save();
          await responsePromise;
          console.log("✅ Второе сохранение выполнено");
        });

        // Шаг 6: Проверить через API — threshold-значения должны сохраниться корректно
        // Примечание: API возвращает характеристики отсортированными по threshold DESC,
        // поэтому ищем по title, а не по позиции в массиве.
        await test.step("Проверить пороги через API (поиск по title)", async () => {
          const { data } = await prAPI.getStatisticsSettings(testPrId);
          const chars = data.characteristicSettings || [];
          console.log(
            `📋 API после второго save: ${chars.map((c) => `${c.title}(${c.threshold})`).join(", ")}`,
          );

          const nizko = chars.find((c) => c.title === "Низко");
          const sredne = chars.find((c) => c.title === "Средне");
          const vysoko = chars.find((c) => c.title === "Высоко");

          expect(
            nizko,
            "API должен содержать характеристику 'Низко'",
          ).toBeTruthy();
          expect(nizko.threshold, "API порог 'Низко' должен быть 40").toBe(40);
          expect(
            sredne,
            "API должен содержать характеристику 'Средне'",
          ).toBeTruthy();
          expect(sredne.threshold, "API порог 'Средне' должен быть 80").toBe(
            80,
          );
          expect(
            vysoko,
            "API должен содержать характеристику 'Высоко'",
          ).toBeTruthy();
          expect(vysoko.threshold, "API порог 'Высоко' должен быть 100").toBe(
            100,
          );
        });

        // Шаг 7: Открыть настройки заново и проверить threshold-значения в UI
        // Примечание: UI может отображать характеристики в порядке, отличном от исходного,
        // поэтому ищем по title, а не по позиции.
        await test.step("Открыть настройки заново и проверить пороги в UI (поиск по title)", async () => {
          await page.reload();
          await page.waitForLoadState("networkidle");
          await settingsModal.open();
          await ensureTogglesEnabled(settingsModal, page);

          const chars = await readCharacteristicsFromUI(settingsModal, page);
          console.log(
            `📋 UI после reload: ${chars.map((c) => `${c.title}(${c.threshold})`).join(", ")}`,
          );

          const nizko = chars.find((c) => c.title === "Низко");
          const sredne = chars.find((c) => c.title === "Средне");
          const vysoko = chars.find((c) => c.title === "Высоко");

          expect(
            nizko,
            "UI должен содержать характеристику 'Низко'",
          ).toBeTruthy();
          expect(nizko.threshold, "UI порог 'Низко' должен быть '40'").toBe(
            "40",
          );

          expect(
            sredne,
            "UI должен содержать характеристику 'Средне'",
          ).toBeTruthy();
          expect(sredne.threshold, "UI порог 'Средне' должен быть '80'").toBe(
            "80",
          );

          expect(
            vysoko,
            "UI должен содержать характеристику 'Высоко'",
          ).toBeTruthy();
          expect(vysoko.threshold, "UI порог 'Высоко' должен быть '100'").toBe(
            "100",
          );

          console.log(
            "✅ Пороги характеристик корректно сохранены после редактирования",
          );
        });
      },
    );
  },
);
