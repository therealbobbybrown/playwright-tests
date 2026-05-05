/**
 * РЕГРЕССИОННЫЕ ТЕСТЫ: Текстовые характеристики (текущий функционал)
 *
 * Цель: Протестировать СУЩЕСТВУЮЩИЙ функционал "Указать текстовые характеристики"
 * Зачем:
 * 1. Убедиться что текущий функционал работает корректно
 * 2. Создать регрессионные тесты перед добавлением нового функционала (showOnlyTextCharacteristic)
 * 3. Использовать эти тесты как базу для тестов нового функционала
 *
 * Тестируем:
 * - Тогл "Указать текстовые характеристики для итоговой оценки" (enableCustomCharacteristics)
 * - Включение/выключение
 * - Сохранение и загрузка настройки
 * - API и DB верификация
 * - Появление/скрытие полей диапазонов
 *
 * @tags @ui @calibration @regression @settings @critical
 */
import { test as baseTest, expect } from "../../../fixtures/auth.js";
import { getCredentials } from "../../../utils/credentials.js";
import { PerformanceReviewAPI } from "../../../utils/api/PerformanceReviewAPI.js";
import { DatabaseClient } from "../../../utils/db/DatabaseClient.js";
import { CalibrationVerifier } from "../../../utils/db/verifiers/CalibrationVerifier.js";
import { StatisticsSettingsModal } from "../../../../pages/StatisticsSettingsModal.js";
import {
  markAsUITest,
  setSeverity,
  MODULES,
} from "../../../utils/allure-helpers.js";
import { buildPRUrl } from "../../../utils/pr-urls.js";

/**
 * Обновить одно поле в настройках статистики через API.
 * API ожидает ПОЛНЫЙ объект настроек — нельзя отправить только изменённое поле.
 * Поэтому: GET текущих настроек → изменение поля → POST полного объекта.
 *
 * @param {PerformanceReviewAPI} prAPI
 * @param {string} prId
 * @param {Object} fieldsToUpdate - поля для обновления, например { enableCustomCharacteristics: true }
 */
async function patchStatisticsSettings(prAPI, prId, fieldsToUpdate) {
  const { data: current } = await prAPI.getStatisticsSettings(prId);
  const settings = current?.settings || {};
  Object.assign(settings, fieldsToUpdate);
  current.settings = settings;
  const { response } = await prAPI.updateStatisticsSettings(prId, current);
  if (!response.ok()) {
    throw new Error(
      `updateStatisticsSettings failed: ${response.status()} ${response.statusText()}`,
    );
  }
}

const test = baseTest.extend({
  prAPI: async ({ request }, use) => {
    const api = new PerformanceReviewAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
  dbClient: async ({}, use) => {
    const db = new DatabaseClient();
    try {
      await db.connect();
    } catch (error) {
      console.log(
        "[DB] Connection failed, DB verification will be skipped:",
        error.message,
      );
    }
    await use(db);
    if (db.isConnected()) {
      await db.disconnect();
    }
  },
  calibrationVerifier: async ({ dbClient }, use) => {
    const verifier = new CalibrationVerifier(dbClient);
    await use(verifier);
  },
  settingsModal: async ({ adminAuth: page }, use) => {
    const modal = new StatisticsSettingsModal(page);
    await use(modal);
  },
});

test.describe(
  "РЕГРЕСС: Текстовые характеристики (текущий функционал)",
  { tag: ["@ui", "@calibration", "@regression", "@performance-review"] },
  () => {
    /** @type {string} */
    let testPrId;

    test.beforeAll(async ({ prSeed }) => {
      test.setTimeout(180000);
      // fillAssessments: true — без анкет с компетенциями секции калибровки не появляются в модалке
      const pr = await prSeed.seedActivePR({
        title: "Regression - Text Characteristics",
        fillAssessments: true,
      });
      testPrId = pr.id;
      console.log(`✅ Создан тестовый PR для регрессии: ${testPrId}`);

      // Предварительная настройка — включаем компетенции и калибровку.
      // useOnlyHeadReceiver = true ОБЯЗАТЕЛЕН: секции калибровки/текстовых характеристик
      // рендерятся фронтендом ТОЛЬКО в режиме "Только из оценок руководителя".
      const { data: currentSettings } =
        await prSeed.prAPI.getStatisticsSettings(testPrId);
      currentSettings.settings.useOnlyHeadReceiver = true;
      currentSettings.settings.enableCompetenceWeights = true;
      currentSettings.settings.enableCalibration = true;
      currentSettings.settings.enableResponsesOverwriting = true;
      await prSeed.prAPI.updateStatisticsSettings(testPrId, currentSettings);
    });

    test.beforeEach(async ({ adminAuth: page }) => {
      markAsUITest(
        MODULES.CALIBRATION,
        "Settings Modal - Text Characteristics",
      );

      // Навигация на страницу PR с feature flag
      await page.goto(buildPRUrl(testPrId, { statisticsSettings: true }));
      await page.waitForLoadState("networkidle");
    });

    test('C4149: Тогл "Указать текстовые характеристики" виден в модальном окне', async ({
      settingsModal,
    }) => {
      setSeverity("critical");

      await test.step("Открыть модальное окно настроек", async () => {
        await settingsModal.open();
      });

      await test.step('Проверить что секция "Характеристики оценки" видна', async () => {
        const characteristicsLabel = settingsModal.modal.getByText(
          "Характеристики оценки",
        );
        await expect(characteristicsLabel).toBeVisible();
      });

      await test.step('Проверить что тогл "Указать текстовые характеристики" виден', async () => {
        // Проверяем видимость toggler-группы (обёртка тогла)
        const togglerGroup = settingsModal.textCharacteristicsToggle.locator(
          'xpath=ancestor::*[contains(@class,"toggler-group")]',
        );
        await expect(togglerGroup).toBeVisible();

        console.log(
          '✅ Тогл "Указать текстовые характеристики" виден в секции "Характеристики оценки"',
        );
      });
    });

    test('C3907: Можно включить тогл "Указать текстовые характеристики"', async ({
      adminAuth: page,
      prAPI,
      settingsModal,
    }) => {
      setSeverity("critical");

      await test.step("Предусловие: Выключить текстовые характеристики через API", async () => {
        await patchStatisticsSettings(prAPI, testPrId, {
          enableCalibration: true,
          enableCustomCharacteristics: false,
        });
        console.log(
          "✅ Предусловие: enableCalibration = true, enableCustomCharacteristics = false",
        );
      });

      await test.step("Перезагрузить страницу и открыть настройки", async () => {
        await page.reload();
        await page.waitForLoadState("networkidle");
        await settingsModal.open();
      });

      await test.step("Проверить что тогл выключен", async () => {
        const isEnabled = await settingsModal._isToggleEnabled(
          settingsModal.textCharacteristicsToggle,
        );
        expect(isEnabled, "Тогл должен быть выключен изначально").toBe(false);
        console.log("✅ Тогл выключен (начальное состояние)");
      });

      await test.step("Включить тогл текстовых характеристик", async () => {
        await settingsModal.toggleTextCharacteristics(true);

        const isEnabled = await settingsModal._isToggleEnabled(
          settingsModal.textCharacteristicsToggle,
        );
        expect(isEnabled, "Тогл должен быть включен после клика").toBe(true);
        console.log("✅ Тогл успешно включен");
      });

      await test.step("Добавить 3 характеристики и проверить поля диапазонов", async () => {
        // Характеристики не создаются автоматически — нужно добавить минимум 3
        await settingsModal.addCharacteristic();
        await settingsModal.addCharacteristic();
        await settingsModal.addCharacteristic();

        const boundInputs = page.locator('input[name="threshold"]');
        const boundCount = await boundInputs.count();
        console.log(`Найдено полей границ диапазонов: ${boundCount}`);

        expect(
          boundCount,
          "Должны появиться поля для границ диапазонов (минимум 3)",
        ).toBeGreaterThanOrEqual(3);
      });
    });

    test('C3908: Можно выключить тогл "Указать текстовые характеристики"', async ({
      adminAuth: page,
      prAPI,
      settingsModal,
    }) => {
      setSeverity("critical");

      await test.step("Предусловие: Включить текстовые характеристики через API", async () => {
        await patchStatisticsSettings(prAPI, testPrId, {
          enableCalibration: true,
          enableCustomCharacteristics: true,
        });
        console.log(
          "✅ Предусловие: enableCalibration = true, enableCustomCharacteristics = true",
        );
      });

      await test.step("Перезагрузить страницу и открыть настройки", async () => {
        await page.reload();
        await page.waitForLoadState("networkidle");
        await settingsModal.open();
      });

      await test.step("Проверить что тогл включен", async () => {
        const isEnabled = await settingsModal._isToggleEnabled(
          settingsModal.textCharacteristicsToggle,
        );
        expect(isEnabled, "Тогл должен быть включен изначально").toBe(true);
        console.log("✅ Тогл включен (начальное состояние)");
      });

      await test.step("Выключить тогл текстовых характеристик", async () => {
        await settingsModal.toggleTextCharacteristics(false);

        const isEnabled = await settingsModal._isToggleEnabled(
          settingsModal.textCharacteristicsToggle,
        );
        expect(isEnabled, "Тогл должен быть выключен после клика").toBe(false);
        console.log("✅ Тогл успешно выключен");
      });
    });

    test("C4150: Настройка сохраняется через API", async ({
      adminAuth: page,
      prAPI,
      settingsModal,
    }) => {
      setSeverity("critical");

      await test.step("Предусловие: Выключить текстовые характеристики", async () => {
        await patchStatisticsSettings(prAPI, testPrId, {
          enableCustomCharacteristics: false,
        });
      });

      await test.step("Открыть настройки", async () => {
        await page.reload();
        await page.waitForLoadState("networkidle");
        await settingsModal.open();
      });

      await test.step("Включить текстовые характеристики", async () => {
        await settingsModal.toggleTextCharacteristics(true);
      });

      await test.step("Сохранить настройки", async () => {
        await settingsModal.save();

        // Ждём закрытия модалки после сохранения
        await settingsModal.modal
          .waitFor({ state: "hidden", timeout: 5000 });
        console.log("✅ Настройки сохранены через UI");
      });

      await test.step("Проверить через API что настройка сохранилась", async () => {
        const { data } = await prAPI.getStatisticsSettings(testPrId);
        const settings = data?.settings || {};

        expect(
          settings.enableCustomCharacteristics,
          "enableCustomCharacteristics должно быть true в API",
        ).toBe(true);
        console.log("✅ API: enableCustomCharacteristics = true");
      });
    });

    test("C3910: Настройка загружается после перезагрузки страницы", async ({
      adminAuth: page,
      prAPI,
      settingsModal,
    }) => {
      setSeverity("critical");

      await test.step("Предусловие: Установить enableCustomCharacteristics=true через API", async () => {
        await patchStatisticsSettings(prAPI, testPrId, {
          enableCalibration: true,
          enableCustomCharacteristics: true,
        });
        console.log(
          "✅ API: enableCalibration = true, enableCustomCharacteristics = true",
        );
      });

      await test.step("Перезагрузить страницу", async () => {
        await page.reload();
        await page.waitForLoadState("networkidle");
      });

      await test.step("Открыть настройки", async () => {
        await settingsModal.open();
      });

      await test.step("Проверить что тогл включен после загрузки", async () => {
        // Ждём инициализации формы и загрузки настроек
        await settingsModal.textCharacteristicsToggle.waitFor({
          state: "visible",
          timeout: 5000,
        });

        const isEnabled = await settingsModal._isToggleEnabled(
          settingsModal.textCharacteristicsToggle,
        );
        expect(
          isEnabled,
          "Тогл должен быть включен после перезагрузки (настройка загрузилась из API)",
        ).toBe(true);
        console.log("✅ Настройка корректно загружена после перезагрузки");
      });
    });

    test("C3911: DB верификация - настройка сохраняется в БД", async ({
      prAPI,
      calibrationVerifier,
      dbClient,
    }) => {
      setSeverity("critical");

      await test.step("Проверка подключения к БД", async () => {
        const isConnected = dbClient.isConnected();
        if (!isConnected) {
          console.log("⚠️ БД недоступна, тест будет пропущен");
          test.skip(true, "БД недоступна");
          return;
        }
        console.log("✅ Подключение к БД установлено");
      });

      await test.step("Установить enableCustomCharacteristics=true через API", async () => {
        await patchStatisticsSettings(prAPI, testPrId, {
          enableCalibration: true,
          enableCustomCharacteristics: true,
        });
        console.log(
          "✅ API: enableCalibration = true, enableCustomCharacteristics = true",
        );
      });

      await test.step("Проверить запись в БД", async () => {
        const dbSettings =
          await calibrationVerifier.getStatisticsSettings(testPrId);

        const customChars = dbSettings.find(
          (s) => s.name === "enableCustomCharacteristics",
        );

        expect(
          customChars,
          "Запись enableCustomCharacteristics должна существовать в БД",
        ).toBeDefined();

        const value =
          customChars.numeric_value !== null
            ? customChars.numeric_value
            : customChars.text_value;
        expect(value, "Значение в БД должно быть 1 (true)").toBe(1);

        console.log("✅ DB: enableCustomCharacteristics запись найдена");
        console.log(`   ID: ${customChars.id}, Value: ${value}`);
      });

      await test.step("Установить enableCustomCharacteristics=false через API", async () => {
        await patchStatisticsSettings(prAPI, testPrId, {
          enableCustomCharacteristics: false,
        });
        console.log("✅ API: enableCustomCharacteristics = false");
      });

      await test.step("Проверить обновление в БД", async () => {
        const dbSettings =
          await calibrationVerifier.getStatisticsSettings(testPrId);
        const customChars = dbSettings.find(
          (s) => s.name === "enableCustomCharacteristics",
        );

        const value =
          customChars.numeric_value !== null
            ? customChars.numeric_value
            : customChars.text_value;
        expect(value, "Значение в БД должно быть 0 (false)").toBe(0);

        console.log("✅ DB: enableCustomCharacteristics обновлено на 0");
      });
    });

    test("C3912: Полный цикл - включить, сохранить, перезагрузить, проверить", async ({
      adminAuth: page,
      prAPI,
      settingsModal,
    }) => {
      setSeverity("blocker");

      await test.step("Предусловие: Выключить текстовые характеристики", async () => {
        await patchStatisticsSettings(prAPI, testPrId, {
          enableCustomCharacteristics: false,
        });
        await page.reload();
        await page.waitForLoadState("networkidle");
      });

      await test.step("Открыть настройки и включить тогл", async () => {
        await settingsModal.open();

        await settingsModal.toggleTextCharacteristics(true);
        console.log("✅ Тогл включен");
      });

      await test.step("Сохранить настройки", async () => {
        await settingsModal.save();
        // Ждём закрытия модалки после сохранения
        await settingsModal.modal
          .waitFor({ state: "hidden", timeout: 5000 });
        console.log("✅ Настройки сохранены");
      });

      await test.step("Полная перезагрузка страницы", async () => {
        await page.goto(buildPRUrl(testPrId, { statisticsSettings: true }));
        await page.waitForLoadState("networkidle");
        console.log("✅ Страница перезагружена");
      });

      await test.step("Открыть настройки снова и проверить состояние", async () => {
        await settingsModal.open();
        // Ждём инициализации формы настроек
        await settingsModal.textCharacteristicsToggle.waitFor({
          state: "visible",
          timeout: 5000,
        });

        const isEnabled = await settingsModal._isToggleEnabled(
          settingsModal.textCharacteristicsToggle,
        );
        expect(
          isEnabled,
          "Тогл должен остаться включенным после полного цикла reload",
        ).toBe(true);

        console.log(
          "✅ ПОЛНЫЙ ЦИКЛ УСПЕШЕН: настройка сохранилась и загрузилась",
        );
      });

      await test.step("Верификация через API", async () => {
        const { data } = await prAPI.getStatisticsSettings(testPrId);
        const settings = data?.settings || {};

        expect(settings.enableCustomCharacteristics).toBe(true);
        console.log("✅ API подтверждает: enableCustomCharacteristics = true");
      });
    });

    test("C3913: При выключении тогла диапазоны скрываются", async ({
      adminAuth: page,
      prAPI,
      settingsModal,
    }) => {
      setSeverity("normal");

      await test.step("Предусловие: Включить текстовые характеристики", async () => {
        await patchStatisticsSettings(prAPI, testPrId, {
          enableCalibration: true,
          enableCustomCharacteristics: true,
        });
        await page.reload();
        await page.waitForLoadState("networkidle");
      });

      await test.step("Открыть настройки", async () => {
        await settingsModal.open();
        // Ждём инициализации формы настроек
        await settingsModal.textCharacteristicsToggle.waitFor({
          state: "visible",
          timeout: 5000,
        });
      });

      await test.step("Добавить 3 характеристики и проверить что диапазоны видны", async () => {
        // Характеристики не создаются автоматически — добавляем минимум 3
        await settingsModal.addCharacteristic();
        await settingsModal.addCharacteristic();
        await settingsModal.addCharacteristic();

        const boundInputs = page.locator('input[name="threshold"]');
        const boundCount = await boundInputs.count();

        console.log(`Диапазоны видны: ${boundCount} полей`);
        expect(
          boundCount,
          "Диапазоны должны быть видны",
        ).toBeGreaterThanOrEqual(3);
      });

      await test.step("Выключить тогл", async () => {
        await settingsModal.toggleTextCharacteristics(false);
        // Ждём анимации скрытия диапазонов
        await page
          .locator('input[name="threshold"]')
          .first()
          .waitFor({ state: "hidden", timeout: 2000 });
      });

      await test.step("Проверить что диапазоны скрылись", async () => {
        const boundInputs = page.locator('input[name="threshold"]');
        const boundCount = await boundInputs.count();

        console.log(`После выключения тогла: ${boundCount} полей`);
        expect(
          boundCount,
          "Диапазоны должны скрыться после выключения тогла",
        ).toBe(0);
      });
    });
  },
);
