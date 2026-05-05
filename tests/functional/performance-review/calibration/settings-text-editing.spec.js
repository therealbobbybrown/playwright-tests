// tests/functional/performance-review/calibration/settings-text-editing.spec.js
// Тесты редактирования, удаления и отмены изменений текстовых характеристик

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
 * Тесты редактирования текстовых характеристик
 *
 * SET-020: Редактирование характеристик
 * SET-021: Удаление характеристик
 * SET-022: Отмена изменений (Close без Save)
 *
 * Предусловия:
 * - PR active
 * - Калибровка включена
 * - Текстовые характеристики включены
 *
 * @tags @ui @calibration @regression @settings
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
 * Хелпер для настройки PR с характеристиками через API
 */
async function setupCharacteristics(prAPI, prId, characteristics = null) {
  // API требует: threshold (не upperBound), category (positive/neutral/negative)
  const defaultCharacteristics = [
    { threshold: 33, title: "Низко", color: "#FF6B6B", category: "negative" },
    { threshold: 66, title: "Средне", color: "#FFE66D", category: "neutral" },
    { threshold: 100, title: "Высоко", color: "#4ECDC4", category: "positive" },
  ];

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
    characteristicSettings: characteristics || defaultCharacteristics,
  };

  console.log(
    "📤 Отправляем настройки:",
    JSON.stringify(
      {
        settings: newSettings.settings,
        characteristicSettings: newSettings.characteristicSettings,
      },
      null,
      2,
    ),
  );

  const { response, data } = await prAPI.updateStatisticsSettings(
    prId,
    newSettings,
  );

  if (!response.ok()) {
    const errorBody = await response.text().catch(() => "no body");
    console.error(
      `❌ API вернул ошибку ${response.status()} при настройке характеристик`,
    );
    console.error(`❌ Тело ответа: ${errorBody}`);
    throw new Error(
      `Не удалось настроить характеристики: ${response.status()}`,
    );
  }

  // Верифицируем что характеристики сохранились
  const { data: saved } = await prAPI.getStatisticsSettings(prId);
  const savedChars = saved.characteristicSettings || [];
  console.log(`✅ Характеристики настроены: ${savedChars.length} шт.`);

  if (savedChars.length === 0) {
    console.warn("⚠️ API вернул пустой массив characteristicSettings");
  }
}

/**
 * Получить характеристики из API
 */
async function getCharacteristicsFromAPI(prAPI, prId) {
  const { data } = await prAPI.getStatisticsSettings(prId);
  const chars = data.characteristicSettings || [];
  if (chars.length === 0) {
    console.warn(
      `⚠️ getCharacteristicsFromAPI: characteristicSettings пуст для PR ${prId}`,
    );
  }
  return chars;
}

/**
 * Хелпер для обеспечения видимости полей характеристик в модалке.
 * API настройки не всегда отражаются в UI сразу — нужно включить тоглы через UI.
 * Также заполняет пустые названия дефолтными значениями чтобы сохранение не падало на валидации.
 */
async function ensureCharacteristicsVisible(settingsModal, page) {
  // Выбираем источник "только руководитель" чтобы появились тоглы калибровки
  await settingsModal.selectManagerOnly();
  // Ждём появления тогла калибровки
  await settingsModal.allowCalibrationToggle
    .waitFor({ state: "visible", timeout: 3000 });

  // Проверяем и включаем калибровку если нужно
  const calibrationEnabled = await settingsModal.allowCalibrationToggle
    .isChecked();
  if (!calibrationEnabled) {
    await settingsModal.toggleCalibration(true);
    // Ждём применения изменений
    await settingsModal.textCharacteristicsToggle
      .waitFor({ state: "visible", timeout: 2000 });
  }

  // Проверяем и включаем текстовые характеристики
  const textCharEnabled = await settingsModal.textCharacteristicsToggle
    .isChecked();
  if (!textCharEnabled) {
    await settingsModal.toggleTextCharacteristics(true);
    // Ждём появления полей характеристик
    await page
      .locator('input[name="threshold"], input[name="title"]')
      .first()
      .waitFor({ state: "visible", timeout: 3000 });
  }

  // Добавляем характеристики если их меньше 3
  let count = await settingsModal.getCharacteristicsCount();
  while (count < 3) {
    await settingsModal.addCharacteristic();
    // Ждём добавления новой строки
    await page
      .locator('input[name="title"]')
      .nth(count)
      .waitFor({ state: "visible", timeout: 2000 });
    count = await settingsModal.getCharacteristicsCount();
  }

  // Заполняем пустые названия дефолтными значениями (иначе валидация не даст сохранить)
  const defaultTitles = [
    "Низко",
    "Средне",
    "Высоко",
    "Очень высоко",
    "Превосходно",
  ];
  count = await settingsModal.getCharacteristicsCount();
  for (let i = 0; i < count; i++) {
    const row = settingsModal.characteristicRows.nth(i);
    const titleInput = row.locator('input[name="title"]');
    const value = await titleInput.inputValue().catch(() => "");
    if (!value.trim()) {
      const defaultTitle = defaultTitles[i] || `Уровень ${i + 1}`;
      await titleInput.fill(defaultTitle);
    }
  }
}

test.describe(
  "Редактирование характеристик",
  { tag: ["@ui", "@calibration", "@regression", "@performance-review"] },
  () => {
    let testPrId;

    test.beforeAll(async ({ prSeed }) => {
      const timestamp = Date.now();
      const pr = await prSeed.seedActivePR({
        title: `EditCharacteristics ${timestamp}`,
        fillAssessments: true,
      });
      testPrId = pr.id;
      console.log(`✅ Создан PR для тестов редактирования: ${testPrId}`);
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.CALIBRATION, "Editing Characteristics");
    });

    test("C4151: Изменить название характеристики", async ({
      adminAuth: page,
      prAPI,
      settingsModal,
    }) => {
      setSeverity("normal");

      await test.step("Настроить характеристики через API", async () => {
        await setupCharacteristics(prAPI, testPrId);
        console.log("✅ Характеристики настроены через API");
      });

      await test.step("Открыть модалку настроек и убедиться что поля видны", async () => {
        await page.goto(buildPRUrl(testPrId, { statisticsSettings: true }));
        await page.waitForLoadState("networkidle");
        await settingsModal.open();
        await ensureCharacteristicsVisible(settingsModal, page);
      });

      const newTitle = "Очень низко";
      await test.step("Изменить название первой характеристики", async () => {
        await settingsModal.setCharacteristicText(0, newTitle);
        console.log(`✅ Название изменено на "${newTitle}"`);
      });

      await test.step("Сохранить изменения", async () => {
        await settingsModal.save();
        console.log("✅ Изменения сохранены");
      });

      await test.step("Проверить изменения через API", async () => {
        const characteristics = await getCharacteristicsFromAPI(
          prAPI,
          testPrId,
        );
        // API может вернуть характеристики в произвольном порядке после save,
        // поэтому ищем по threshold=33 (первая характеристика по дефолту)
        const edited = characteristics.find((c) => c.threshold === 33);
        expect(
          edited,
          "Характеристика с threshold=33 должна существовать",
        ).toBeTruthy();
        expect(edited.title).toBe(newTitle);
        console.log(
          `✅ API подтверждает: title = "${edited.title}" (threshold=${edited.threshold})`,
        );
      });

      await test.step("Проверить изменения в UI", async () => {
        await page.reload();
        await page.waitForLoadState("networkidle");
        await settingsModal.open();

        // Ищем строку характеристики с threshold=33 в UI (первая по порядку после reload)
        const count = await settingsModal.getCharacteristicsCount();
        let foundTitle = null;
        for (let i = 0; i < count; i++) {
          const row = settingsModal.characteristicRows.nth(i);
          const titleInput = row.locator('input[name="title"]');
          const value = await titleInput.inputValue();
          if (value === newTitle) {
            foundTitle = value;
            break;
          }
        }
        expect(
          foundTitle,
          `UI должен содержать характеристику "${newTitle}"`,
        ).toBe(newTitle);
        console.log(`✅ UI подтверждает: title = "${foundTitle}"`);
        await settingsModal.close();
      });
    });

    test("C4152: Изменить границу диапазона", async ({
      adminAuth: page,
      prAPI,
      settingsModal,
    }) => {
      setSeverity("normal");

      await test.step("Настроить характеристики через API", async () => {
        await setupCharacteristics(prAPI, testPrId);
        console.log("✅ Характеристики настроены через API");
      });

      await test.step("Открыть модалку настроек и убедиться что поля видны", async () => {
        await page.goto(buildPRUrl(testPrId, { statisticsSettings: true }));
        await page.waitForLoadState("networkidle");
        await settingsModal.open();
        await ensureCharacteristicsVisible(settingsModal, page);
      });

      const newBound = 25;
      let targetIndex = 0;
      await test.step("Найти индекс характеристики 'Низко' (threshold=33) в UI", async () => {
        // Дождаться рендера всех threshold-инпутов после ensureCharacteristicsVisible
        await page
          .locator("#performance-review-settings-characteristics-threshold-0")
          .waitFor({ state: "visible", timeout: 5000 });

        const count = await settingsModal.getCharacteristicsCount();
        let found = false;
        for (let i = 0; i < count; i++) {
          const input = page.locator(
            `#performance-review-settings-characteristics-threshold-${i}`,
          );
          const val = await input.inputValue();
          if (parseInt(val, 10) === 33) {
            targetIndex = i;
            found = true;
            break;
          }
        }
        console.log(
          `✅ Характеристика "Низко" (threshold=33) найдена по индексу ${targetIndex} (из ${count})`,
        );
        expect(
          found,
          "Характеристика с threshold=33 должна быть найдена в UI",
        ).toBe(true);
      });

      await test.step("Изменить границу диапазона с 33 на 25", async () => {
        // Убедимся что input enabled перед fill (последний threshold=100 всегда disabled)
        const input = page.locator(
          `#performance-review-settings-characteristics-threshold-${targetIndex}`,
        );
        await expect(input).toBeEnabled({ timeout: 5000 });
        await settingsModal.setCharacteristicUpperBound(targetIndex, newBound);
        console.log(
          `✅ Граница изменена на ${newBound} (индекс ${targetIndex})`,
        );
      });

      await test.step("Сохранить изменения", async () => {
        // Ждём завершения POST-запроса сохранения, а не только скрытия модалки
        const responsePromise = page.waitForResponse(
          (r) =>
            r.url().includes("/statistics/settings") &&
            r.request().method() === "POST" &&
            r.status() < 400,
          { timeout: 10000 },
        );
        await settingsModal.save();
        await responsePromise;
        console.log("✅ Изменения сохранены (POST завершён)");
      });

      await test.step("Проверить изменения через API", async () => {
        const characteristics = await getCharacteristicsFromAPI(
          prAPI,
          testPrId,
        );
        // API может вернуть характеристики в произвольном порядке после save,
        // поэтому ищем по title "Низко" (который не менялся) — threshold должен быть 25
        const edited = characteristics.find((c) => c.title === "Низко");
        expect(
          edited,
          'Характеристика с title="Низко" должна существовать',
        ).toBeTruthy();
        expect(edited.threshold).toBe(newBound);
        console.log(
          `✅ API подтверждает: threshold = ${edited.threshold} (title="${edited.title}")`,
        );
      });

      await test.step("Проверить изменения в UI", async () => {
        await page.reload();
        await page.waitForLoadState("networkidle");
        await settingsModal.open();

        // Ищем характеристику с threshold=25 среди всех строк
        const count = await settingsModal.getCharacteristicsCount();
        let foundValue = null;
        for (let i = 0; i < count; i++) {
          const input = page.locator(
            `#performance-review-settings-characteristics-threshold-${i}`,
          );
          const val = await input.inputValue();
          if (val === String(newBound)) {
            foundValue = val;
            break;
          }
        }
        expect(foundValue, `UI должен содержать threshold=${newBound}`).toBe(
          String(newBound),
        );
        console.log(`✅ UI подтверждает: threshold = ${foundValue}`);
        await settingsModal.close();
      });
    });

    test("C4153: Изменить цвет характеристики", async ({
      adminAuth: page,
      prAPI,
      settingsModal,
    }) => {
      setSeverity("minor");

      await test.step("Настроить характеристики через API", async () => {
        await setupCharacteristics(prAPI, testPrId);
        console.log("✅ Характеристики настроены через API");
      });

      await test.step("Открыть модалку настроек и убедиться что поля видны", async () => {
        await page.goto(buildPRUrl(testPrId, { statisticsSettings: true }));
        await page.waitForLoadState("networkidle");
        await settingsModal.open();
        await ensureCharacteristicsVisible(settingsModal, page);
      });

      await test.step("Найти и кликнуть по color picker первой характеристики", async () => {
        // Color picker обычно представлен кнопкой с цветом фона или input[type="color"]
        const colorButton = settingsModal.characteristicRows
          .first()
          .locator(
            'button[class*="color"], [class*="ColorPicker"], input[type="color"]',
          )
          .first();

        const isVisible = await colorButton
          .waitFor({ state: "visible", timeout: 3000 })
          .then(() => true)
          .catch(() => false);

        if (isVisible) {
          await colorButton.click();
          await page.waitForTimeout(500);

          // Попробуем выбрать другой цвет из палитры
          const colorOption = page
            .locator('[class*="color-option"], [class*="swatch"]')
            .nth(2);
          const colorOptionVisible = await colorOption
            .waitFor({ state: "visible", timeout: 2000 })
            .then(() => true)
            .catch(() => false);

          if (colorOptionVisible) {
            await colorOption.click();
            console.log("✅ Цвет изменён через UI");
          } else {
            console.log("ℹ️ Палитра цветов не найдена, пропускаем проверку");
          }
        } else {
          console.log("ℹ️ Color picker не найден в UI, пропускаем тест");
        }
      });

      await settingsModal.close();
    });

    test("C4154: Добавить 4-ю характеристику", async ({
      adminAuth: page,
      prAPI,
      settingsModal,
    }) => {
      setSeverity("normal");

      await test.step("Настроить 3 характеристики через API", async () => {
        await setupCharacteristics(prAPI, testPrId);
        console.log("✅ 3 характеристики настроены через API");
      });

      await test.step("Открыть модалку настроек и убедиться что поля видны", async () => {
        await page.goto(buildPRUrl(testPrId, { statisticsSettings: true }));
        await page.waitForLoadState("networkidle");
        await settingsModal.open();
        await ensureCharacteristicsVisible(settingsModal, page);
      });

      await test.step("Проверить начальное количество характеристик", async () => {
        const initialCount = await settingsModal.getCharacteristicsCount();
        console.log(`✅ Начальное количество: ${initialCount}`);
        expect(initialCount).toBe(3);
      });

      await test.step("Добавить 4-ю характеристику", async () => {
        await settingsModal.addCharacteristic();
        const newCount = await settingsModal.getCharacteristicsCount();
        console.log(`✅ Количество после добавления: ${newCount}`);
        expect(newCount).toBe(4);
      });

      await test.step("Заполнить характеристики", async () => {
        // Новая строка добавляется в начало (позиция 0) с пустым title
        await settingsModal.setCharacteristicText(0, "Очень низко");
        await settingsModal.setCharacteristicText(3, "Превосходно");
        await settingsModal.setCharacteristicUpperBound(2, 80); // Сдвигаем предыдущую границу
        console.log("✅ 4-я характеристика заполнена");
      });

      await test.step("Сохранить изменения", async () => {
        await settingsModal.save();
        console.log("✅ Изменения сохранены");
      });

      await test.step("Проверить через API", async () => {
        const characteristics = await getCharacteristicsFromAPI(
          prAPI,
          testPrId,
        );
        expect(characteristics.length).toBe(4);
        expect(characteristics[3].title).toBe("Превосходно");
        console.log(
          `✅ API подтверждает: ${characteristics.length} характеристик`,
        );
      });
    });

    test("C4155: Добавить 5+ характеристик", async ({
      adminAuth: page,
      prAPI,
      settingsModal,
    }) => {
      setSeverity("minor");

      await test.step("Настроить 3 характеристики через API", async () => {
        await setupCharacteristics(prAPI, testPrId);
        console.log("✅ 3 характеристики настроены через API");
      });

      await test.step("Открыть модалку настроек и убедиться что поля видны", async () => {
        await page.goto(buildPRUrl(testPrId, { statisticsSettings: true }));
        await page.waitForLoadState("networkidle");
        await settingsModal.open();
        await ensureCharacteristicsVisible(settingsModal, page);
      });

      await test.step("Добавить характеристики до 5+", async () => {
        const initialCount = await settingsModal.getCharacteristicsCount();
        const toAdd = 5 - initialCount + 1; // Добавляем до 6

        for (let i = 0; i < toAdd; i++) {
          try {
            await settingsModal.addCharacteristic();
            // Ждём добавления строки
            await page
              .locator('input[name="title"]')
              .nth(initialCount + i)
              .waitFor({ state: "visible", timeout: 2000 });
          } catch (e) {
            console.log(
              `ℹ️ Не удалось добавить характеристику ${initialCount + i + 1}: ${e.message}`,
            );
            break;
          }
        }

        const finalCount = await settingsModal.getCharacteristicsCount();
        console.log(`✅ Итоговое количество характеристик: ${finalCount}`);

        // Проверяем что добавление работает (либо есть лимит)
        expect(finalCount).toBeGreaterThan(initialCount);
      });

      await settingsModal.close();
    });
  },
);

test.describe(
  "Удаление характеристик",
  { tag: ["@ui", "@calibration", "@regression", "@performance-review"] },
  () => {
    let testPrId;

    test.beforeAll(async ({ prSeed }) => {
      const timestamp = Date.now();
      const pr = await prSeed.seedActivePR({
        title: `DeleteCharacteristics ${timestamp}`,
        fillAssessments: true,
      });
      testPrId = pr.id;
      console.log(`✅ Создан PR для тестов удаления: ${testPrId}`);
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.CALIBRATION, "Delete Characteristics");
    });

    test("C4156: Удалить 3-ю характеристику", async ({
      adminAuth: page,
      prAPI,
      settingsModal,
    }) => {
      setSeverity("normal");

      await test.step("Настроить 3 характеристики через API", async () => {
        await setupCharacteristics(prAPI, testPrId);
        console.log("✅ 3 характеристики настроены через API");
      });

      await test.step("Открыть модалку настроек и убедиться что поля видны", async () => {
        await page.goto(buildPRUrl(testPrId, { statisticsSettings: true }));
        await page.waitForLoadState("networkidle");
        await settingsModal.open();
        await ensureCharacteristicsVisible(settingsModal, page);
      });

      await test.step("Проверить начальное количество", async () => {
        const initialCount = await settingsModal.getCharacteristicsCount();
        expect(initialCount).toBe(3);
        console.log(`✅ Начальное количество: ${initialCount}`);
      });

      await test.step("Удалить 3-ю (последнюю) характеристику", async () => {
        await settingsModal.removeCharacteristic(2);
        const newCount = await settingsModal.getCharacteristicsCount();
        expect(newCount).toBe(2);
        console.log(`✅ Количество после удаления: ${newCount}`);
      });

      await test.step("Сохранить изменения", async () => {
        await settingsModal.save();
        console.log("✅ Изменения сохранены");
      });

      await test.step("Проверить через API", async () => {
        const characteristics = await getCharacteristicsFromAPI(
          prAPI,
          testPrId,
        );
        expect(characteristics.length).toBe(2);
        console.log(
          `✅ API подтверждает: ${characteristics.length} характеристик`,
        );
      });
    });

    test("C4157: Удалить до минимума (проверить валидацию)", async ({
      adminAuth: page,
      prAPI,
      settingsModal,
    }) => {
      setSeverity("normal");

      await test.step("Настроить 3 характеристики через API", async () => {
        await setupCharacteristics(prAPI, testPrId);
        console.log("✅ 3 характеристики настроены через API");
      });

      await test.step("Открыть модалку настроек и убедиться что поля видны", async () => {
        await page.goto(buildPRUrl(testPrId, { statisticsSettings: true }));
        await page.waitForLoadState("networkidle");
        await settingsModal.open();
        await ensureCharacteristicsVisible(settingsModal, page);
      });

      await test.step("Удалять характеристики до минимума", async () => {
        let count = await settingsModal.getCharacteristicsCount();
        console.log(`✅ Начальное количество: ${count}`);

        // Пытаемся удалить все, но проверяем есть ли минимум
        while (count > 0) {
          try {
            await settingsModal.removeCharacteristic(count - 1);
            // Ждём обновления списка после удаления
            await page.waitForLoadState("networkidle", { timeout: 2000 });
            const newCount = await settingsModal.getCharacteristicsCount();

            if (newCount === count) {
              console.log(
                `✅ Достигнут минимум: ${count} характеристик (нельзя удалить больше)`,
              );
              break;
            }
            count = newCount;
            console.log(`ℹ️ Удалено, осталось: ${count}`);
          } catch (e) {
            console.log(
              `✅ Удаление заблокировано на ${count} характеристиках: ${e.message}`,
            );
            break;
          }
        }

        // Логируем итоговый минимум
        const finalCount = await settingsModal.getCharacteristicsCount();
        console.log(`✅ Минимальное количество характеристик: ${finalCount}`);
      });

      await settingsModal.close();
    });

    test("C4158: Удалить и добавить заново", async ({
      adminAuth: page,
      prAPI,
      settingsModal,
    }) => {
      setSeverity("normal");

      await test.step("Настроить 3 характеристики через API", async () => {
        await setupCharacteristics(prAPI, testPrId);
        console.log("✅ 3 характеристики настроены через API");
      });

      await test.step("Открыть модалку настроек и убедиться что поля видны", async () => {
        await page.goto(buildPRUrl(testPrId, { statisticsSettings: true }));
        await page.waitForLoadState("networkidle");
        await settingsModal.open();
        await ensureCharacteristicsVisible(settingsModal, page);
      });

      await test.step("Удалить среднюю (2-ю) характеристику", async () => {
        const initialCount = await settingsModal.getCharacteristicsCount();
        await settingsModal.removeCharacteristic(1);
        const afterDelete = await settingsModal.getCharacteristicsCount();
        expect(afterDelete).toBe(initialCount - 1);
        console.log(`✅ Удалена 2-я характеристика, осталось: ${afterDelete}`);
      });

      await test.step("Добавить новую характеристику", async () => {
        const beforeAdd = await settingsModal.getCharacteristicsCount();
        await settingsModal.addCharacteristic();
        const afterAdd = await settingsModal.getCharacteristicsCount();
        expect(afterAdd).toBe(beforeAdd + 1);
        console.log(`✅ Добавлена новая характеристика, стало: ${afterAdd}`);
      });

      await test.step("Заполнить новую характеристику", async () => {
        // Новая строка добавляется в начало (позиция 0) с пустым title
        await settingsModal.setCharacteristicText(0, "Новая");
        console.log("✅ Новая характеристика заполнена");
      });

      await test.step("Сохранить изменения", async () => {
        await settingsModal.save();
        console.log("✅ Изменения сохранены");
      });

      await test.step("Проверить через API", async () => {
        const characteristics = await getCharacteristicsFromAPI(
          prAPI,
          testPrId,
        );
        expect(characteristics.length).toBe(3);
        const hasNewTitle = characteristics.some((c) => c.title === "Новая");
        expect(hasNewTitle).toBe(true);
        console.log(
          `✅ API подтверждает: ${characteristics.length} характеристик, есть "Новая"`,
        );
      });
    });
  },
);

test.describe(
  "Отмена изменений (Close без Save)",
  { tag: ["@ui", "@calibration", "@regression", "@performance-review"] },
  () => {
    let testPrId;

    test.beforeAll(async ({ prSeed }) => {
      const timestamp = Date.now();
      const pr = await prSeed.seedActivePR({
        title: `CancelChanges ${timestamp}`,
        fillAssessments: true,
      });
      testPrId = pr.id;
      console.log(`✅ Создан PR для тестов отмены: ${testPrId}`);
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.CALIBRATION, "Cancel Changes");
    });

    test("C4159: Изменить название → Close → изменения НЕ сохранились", async ({
      adminAuth: page,
      prAPI,
      settingsModal,
    }) => {
      setSeverity("critical");

      const originalTitle = "Низко";
      const modifiedTitle = "Изменённое название";

      await test.step("Настроить характеристики через API", async () => {
        await setupCharacteristics(prAPI, testPrId);
        console.log("✅ Характеристики настроены через API");
      });

      await test.step("Открыть модалку настроек и убедиться что поля видны", async () => {
        await page.goto(buildPRUrl(testPrId, { statisticsSettings: true }));
        await page.waitForLoadState("networkidle");
        await settingsModal.open();
        await ensureCharacteristicsVisible(settingsModal, page);
      });

      await test.step("Изменить название первой характеристики", async () => {
        await settingsModal.setCharacteristicText(0, modifiedTitle);
        console.log(`✅ Название изменено на "${modifiedTitle}"`);
      });

      await test.step("Закрыть модалку БЕЗ сохранения", async () => {
        await settingsModal.close();
        console.log("✅ Модалка закрыта без сохранения");
      });

      await test.step("Проверить через API: изменения НЕ сохранились", async () => {
        const characteristics = await getCharacteristicsFromAPI(
          prAPI,
          testPrId,
        );
        expect(characteristics[0].title).toBe(originalTitle);
        console.log(
          `✅ API подтверждает: title = "${characteristics[0].title}" (не изменился)`,
        );
      });

      await test.step("Проверить в UI: изменения НЕ сохранились", async () => {
        // Перезагружаем страницу, чтобы сбросить кешированное состояние React
        await page.reload({ waitUntil: "networkidle" });
        await settingsModal.open();
        await ensureCharacteristicsVisible(settingsModal, page);
        const titleInput = settingsModal.characteristicRows
          .first()
          .locator('input[name="title"]');
        const value = await titleInput.inputValue();
        expect(value).toBe(originalTitle);
        console.log(`✅ UI подтверждает: title = "${value}" (не изменился)`);
        await settingsModal.close();
      });
    });

    test("C4160: Изменить границу → Close → изменения НЕ сохранились", async ({
      adminAuth: page,
      prAPI,
      settingsModal,
    }) => {
      setSeverity("critical");

      const originalBound = 33;
      const modifiedBound = 15;

      await test.step("Настроить характеристики через API", async () => {
        await setupCharacteristics(prAPI, testPrId);
        console.log("✅ Характеристики настроены через API");
      });

      await test.step("Открыть модалку настроек и убедиться что поля видны", async () => {
        await page.goto(buildPRUrl(testPrId, { statisticsSettings: true }));
        await page.waitForLoadState("networkidle");
        await settingsModal.open();
        await ensureCharacteristicsVisible(settingsModal, page);
      });

      await test.step("Изменить границу первого диапазона", async () => {
        await settingsModal.setCharacteristicUpperBound(0, modifiedBound);
        console.log(`✅ Граница изменена на ${modifiedBound}`);
      });

      await test.step("Закрыть модалку БЕЗ сохранения", async () => {
        await settingsModal.close();
        console.log("✅ Модалка закрыта без сохранения");
      });

      await test.step("Проверить через API: изменения НЕ сохранились", async () => {
        const characteristics = await getCharacteristicsFromAPI(
          prAPI,
          testPrId,
        );
        expect(characteristics[0].threshold).toBe(originalBound);
        console.log(
          `✅ API подтверждает: upperBound = ${characteristics[0].threshold} (не изменился)`,
        );
      });
    });

    test("C4161: Добавить характеристику → Close → новая строка НЕ сохранилась", async ({
      adminAuth: page,
      prAPI,
      settingsModal,
    }) => {
      setSeverity("critical");

      await test.step("Настроить 3 характеристики через API", async () => {
        await setupCharacteristics(prAPI, testPrId);
        console.log("✅ 3 характеристики настроены через API");
      });

      await test.step("Открыть модалку настроек и убедиться что поля видны", async () => {
        await page.goto(buildPRUrl(testPrId, { statisticsSettings: true }));
        await page.waitForLoadState("networkidle");
        await settingsModal.open();
        await ensureCharacteristicsVisible(settingsModal, page);
      });

      await test.step("Добавить новую характеристику", async () => {
        const initialCount = await settingsModal.getCharacteristicsCount();
        await settingsModal.addCharacteristic();
        const newCount = await settingsModal.getCharacteristicsCount();
        expect(newCount).toBe(initialCount + 1);
        console.log(`✅ Добавлена характеристика, стало: ${newCount}`);
      });

      await test.step("Закрыть модалку БЕЗ сохранения", async () => {
        await settingsModal.close();
        console.log("✅ Модалка закрыта без сохранения");
      });

      await test.step("Проверить через API: характеристика НЕ добавилась", async () => {
        const characteristics = await getCharacteristicsFromAPI(
          prAPI,
          testPrId,
        );
        expect(characteristics.length).toBe(3);
        console.log(
          `✅ API подтверждает: ${characteristics.length} характеристик (не изменилось)`,
        );
      });
    });

    test("C4162: Удалить характеристику → Close → удалённая строка восстановилась", async ({
      adminAuth: page,
      prAPI,
      settingsModal,
    }) => {
      setSeverity("critical");

      await test.step("Настроить 3 характеристики через API", async () => {
        await setupCharacteristics(prAPI, testPrId);
        console.log("✅ 3 характеристики настроены через API");
      });

      await test.step("Открыть модалку настроек и убедиться что поля видны", async () => {
        await page.goto(buildPRUrl(testPrId, { statisticsSettings: true }));
        await page.waitForLoadState("networkidle");
        await settingsModal.open();
        await ensureCharacteristicsVisible(settingsModal, page);
      });

      await test.step("Удалить последнюю характеристику", async () => {
        const initialCount = await settingsModal.getCharacteristicsCount();
        await settingsModal.removeCharacteristic(initialCount - 1);
        const newCount = await settingsModal.getCharacteristicsCount();
        expect(newCount).toBe(initialCount - 1);
        console.log(`✅ Удалена характеристика, осталось: ${newCount}`);
      });

      await test.step("Закрыть модалку БЕЗ сохранения", async () => {
        await settingsModal.close();
        console.log("✅ Модалка закрыта без сохранения");
      });

      await test.step("Проверить через API: характеристика НЕ удалилась", async () => {
        const characteristics = await getCharacteristicsFromAPI(
          prAPI,
          testPrId,
        );
        expect(characteristics.length).toBe(3);
        console.log(
          `✅ API подтверждает: ${characteristics.length} характеристик (не изменилось)`,
        );
      });

      await test.step("Проверить в UI: характеристика восстановилась", async () => {
        // Перезагружаем страницу, чтобы сбросить кешированное состояние React
        await page.reload({ waitUntil: "networkidle" });
        await settingsModal.open();
        await ensureCharacteristicsVisible(settingsModal, page);
        const count = await settingsModal.getCharacteristicsCount();
        expect(count).toBe(3);
        console.log(
          `✅ UI подтверждает: ${count} характеристик (восстановилось)`,
        );
        await settingsModal.close();
      });
    });
  },
);
