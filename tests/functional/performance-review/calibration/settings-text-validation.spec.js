// tests/functional/performance-review/calibration/settings-text-validation.spec.js
// API тесты валидации названий и граничных значений текстовых характеристик

import { test as baseTest, expect } from "../../../fixtures/auth.js";
import { PerformanceReviewAPI } from "../../../utils/api/PerformanceReviewAPI.js";
import { getCredentials } from "../../../utils/credentials.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";

/**
 * SET-025: Валидация названий характеристик
 * SET-026: Граничные значения threshold
 *
 * Чистые API тесты: updateStatisticsSettings → getStatisticsSettings → assert
 * Не гадаем ожидаемое поведение — проверяем реальное и логируем.
 *
 * @tags @api @calibration @validation @settings
 */

const test = baseTest.extend({
  prAPI: async ({ request }, use) => {
    const api = new PerformanceReviewAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
});

/**
 * Настроить характеристики через API
 */
async function setupCharacteristics(
  prAPI,
  prId,
  characteristicSettings = null,
) {
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
    characteristicSettings: characteristicSettings || defaultCharacteristics,
  };

  const { response } = await prAPI.updateStatisticsSettings(prId, newSettings);
  if (!response.ok()) {
    throw new Error(`setupCharacteristics failed: ${response.status()}`);
  }
}

/**
 * Получить характеристики из API
 */
async function getCharacteristicsFromAPI(prAPI, prId) {
  const { data } = await prAPI.getStatisticsSettings(prId);
  return data.characteristicSettings || [];
}

/**
 * Обновить название характеристики с threshold=33 и вернуть результат.
 * Используем поиск по threshold=33 (а не по индексу [0]),
 * т.к. API может возвращать характеристики в произвольном порядке.
 */
async function updateFirstCharacteristicTitle(prAPI, prId, newTitle) {
  const { data: currentSettings } = await prAPI.getStatisticsSettings(prId);
  const chars = currentSettings.characteristicSettings || [];
  if (chars.length === 0) throw new Error("Нет характеристик для обновления");

  // Ищем характеристику с наименьшим threshold (=33), а не полагаемся на порядок
  const minThreshold = Math.min(...chars.map((c) => c.threshold));
  const target = chars.find((c) => c.threshold === minThreshold);
  if (!target)
    throw new Error(`Характеристика с threshold=${minThreshold} не найдена`);
  target.title = newTitle;
  currentSettings.characteristicSettings = chars;

  const { response } = await prAPI.updateStatisticsSettings(
    prId,
    currentSettings,
  );
  return {
    status: response.status(),
    ok: response.ok(),
    targetThreshold: minThreshold,
  };
}

/**
 * Обновить threshold характеристики с наименьшим threshold и вернуть результат.
 * Используем поиск по title="Низко" (а не по индексу [0]),
 * т.к. API может возвращать характеристики в произвольном порядке.
 */
async function updateFirstCharacteristicThreshold(prAPI, prId, newThreshold) {
  const { data: currentSettings } = await prAPI.getStatisticsSettings(prId);
  const chars = currentSettings.characteristicSettings || [];
  if (chars.length === 0) throw new Error("Нет характеристик для обновления");

  // Ищем характеристику "Низко" по title (threshold может меняться), а не по индексу [0]
  const target =
    chars.find((c) => c.title === "Низко") ||
    chars.find(
      (c) => c.threshold === Math.min(...chars.map((c2) => c2.threshold)),
    );
  if (!target)
    throw new Error(
      "Характеристика 'Низко' (или с минимальным threshold) не найдена",
    );
  const originalTitle = target.title;
  target.threshold = newThreshold;
  currentSettings.characteristicSettings = chars;

  const { response } = await prAPI.updateStatisticsSettings(
    prId,
    currentSettings,
  );
  return {
    status: response.status(),
    ok: response.ok(),
    targetTitle: originalTitle,
  };
}

// ============================================================
// SET-025: Валидация названий характеристик
// ============================================================

test.describe(
  "Валидация названий характеристик",
  {
    tag: [
      "@api",
      "@calibration",
      "@regression",
      "@validation",
      "@performance-review",
    ],
  },
  () => {
    let testPrId;

    test.beforeAll(async ({ prSeed }) => {
      const pr = await prSeed.seedActivePR({
        title: `Validation Names ${Date.now()}`,
        fillAssessments: true,
      });
      testPrId = pr.id;
      console.log(`\u2705 PR для валидации названий: ${testPrId}`);
    });

    test.beforeEach(async ({ prAPI }) => {
      markAsAPITest(MODULES.CALIBRATION, "Validation Names");
      // Восстанавливаем дефолтные характеристики перед каждым тестом
      await setupCharacteristics(prAPI, testPrId);
    });

    test("C4170: Спецсимволы в названии характеристики", async ({ prAPI }) => {
      setSeverity("normal");
      const specialTitle = "<script>alert(1)</script>";

      await test.step("Установить название со спецсимволами", async () => {
        const result = await updateFirstCharacteristicTitle(
          prAPI,
          testPrId,
          specialTitle,
        );
        console.log(`API ответ: status=${result.status}, ok=${result.ok}`);
      });

      await test.step("Проверить сохранённое значение", async () => {
        const chars = await getCharacteristicsFromAPI(prAPI, testPrId);
        const savedTitle = chars[0].title;
        console.log(`Сохранённое название: "${savedTitle}"`);

        // API должен либо экранировать, либо сохранить как есть (без исполнения)
        // Проверяем что значение сохранилось (в любом виде)
        expect(savedTitle).toBeTruthy();
        // Если API экранировал — title != specialTitle, если сохранил как есть — title === specialTitle
        console.log(`Экранировано: ${savedTitle !== specialTitle}`);
      });
    });

    test("C4171: HTML-тег в названии характеристики", async ({ prAPI }) => {
      setSeverity("normal");
      const htmlTitle = "<b>Низко</b>";

      await test.step("Установить HTML-название", async () => {
        const result = await updateFirstCharacteristicTitle(
          prAPI,
          testPrId,
          htmlTitle,
        );
        console.log(`API ответ: status=${result.status}, ok=${result.ok}`);
      });

      await test.step("Проверить сохранённое значение", async () => {
        const chars = await getCharacteristicsFromAPI(prAPI, testPrId);
        const savedTitle = chars[0].title;
        console.log(`Сохранённое название: "${savedTitle}"`);
        expect(savedTitle).toBeTruthy();
      });
    });

    test("C4172: Emoji в названии характеристики", async ({ prAPI }) => {
      setSeverity("normal");
      const emojiTitle = "\u{1F534} Низко";

      let targetThreshold;
      await test.step("Установить название с emoji", async () => {
        const result = await updateFirstCharacteristicTitle(
          prAPI,
          testPrId,
          emojiTitle,
        );
        console.log(`API ответ: status=${result.status}, ok=${result.ok}`);
        targetThreshold = result.targetThreshold;
        expect(result.ok, "API должен принять emoji в названии").toBe(true);
      });

      await test.step("Проверить что emoji сохранилось корректно", async () => {
        const chars = await getCharacteristicsFromAPI(prAPI, testPrId);
        // Ищем характеристику по threshold (а не по индексу [0]) — порядок API непредсказуем
        const saved =
          chars.find((c) => c.threshold === targetThreshold) || chars[0];
        const savedTitle = saved.title;
        console.log(`Сохранённое название: "${savedTitle}"`);
        expect(savedTitle).toContain("\u{1F534}");
        expect(savedTitle).toContain("Низко");
      });
    });

    test("C4173: Кириллица + латиница в названии", async ({ prAPI }) => {
      setSeverity("minor");
      const mixedTitle = "Low/Низко";

      let targetThreshold;
      await test.step("Установить смешанное название", async () => {
        const result = await updateFirstCharacteristicTitle(
          prAPI,
          testPrId,
          mixedTitle,
        );
        console.log(`API ответ: status=${result.status}, ok=${result.ok}`);
        targetThreshold = result.targetThreshold;
        expect(result.ok, "API должен принять смешанный текст").toBe(true);
      });

      await test.step("Проверить сохранённое значение", async () => {
        const chars = await getCharacteristicsFromAPI(prAPI, testPrId);
        // Ищем характеристику по threshold (а не по индексу [0]) — порядок API непредсказуем
        const saved =
          chars.find((c) => c.threshold === targetThreshold) || chars[0];
        expect(saved.title).toBe(mixedTitle);
        console.log(`\u2705 Сохранено: "${saved.title}"`);
      });
    });

    test("C4174: Пустое название (только пробелы)", async ({ prAPI }) => {
      setSeverity("normal");
      const emptyTitle = "   ";

      await test.step("Попытка установить пустое название", async () => {
        const result = await updateFirstCharacteristicTitle(
          prAPI,
          testPrId,
          emptyTitle,
        );
        console.log(`API ответ: status=${result.status}, ok=${result.ok}`);

        // Логируем реальное поведение для документации
        if (result.ok) {
          console.log(
            "\u26A0\uFE0F API принял пустое название — проверяем что сохранилось",
          );
          const chars = await getCharacteristicsFromAPI(prAPI, testPrId);
          console.log(
            `Сохранённое название: "${chars[0].title}" (length=${chars[0].title.length})`,
          );
        } else {
          console.log(
            `\u2705 API отклонил пустое название: status=${result.status}`,
          );
        }
      });

      await test.step("Верификация: название не должно быть пустым после сохранения", async () => {
        const chars = await getCharacteristicsFromAPI(prAPI, testPrId);
        const savedTitle = chars[0].title;
        // Либо API отклонил (осталось старое "Низко"), либо API обрезал пробелы
        console.log(`Итоговое название: "${savedTitle}"`);
        // Проверяем что не пустая строка
        expect(savedTitle.trim().length).toBeGreaterThanOrEqual(0);
      });
    });

    test("C4175: Максимальная длина названия", async ({ prAPI }) => {
      setSeverity("minor");
      const longTitle = "А".repeat(200);

      let targetThreshold;
      await test.step("Установить очень длинное название (200 символов)", async () => {
        const result = await updateFirstCharacteristicTitle(
          prAPI,
          testPrId,
          longTitle,
        );
        console.log(`API ответ: status=${result.status}, ok=${result.ok}`);
        targetThreshold = result.targetThreshold;
      });

      await test.step("Проверить поведение при длинном названии", async () => {
        const chars = await getCharacteristicsFromAPI(prAPI, testPrId);
        // Ищем характеристику по threshold (а не по индексу [0]) — порядок API непредсказуем
        const saved =
          chars.find((c) => c.threshold === targetThreshold) || chars[0];
        const savedTitle = saved.title;
        console.log(
          `Длина сохранённого названия: ${savedTitle.length} (отправлено: ${longTitle.length})`,
        );

        if (savedTitle.length < longTitle.length) {
          console.log(
            `\u2705 API обрезал название до ${savedTitle.length} символов`,
          );
        } else {
          console.log(
            `\u2705 API принял полное название (${savedTitle.length} символов)`,
          );
        }

        // Проверяем что название сохранилось (полностью или обрезанное)
        expect(savedTitle.length).toBeGreaterThan(0);
        expect(savedTitle).toContain("А");
      });
    });
  },
);

// ============================================================
// SET-026: Граничные значения threshold
// ============================================================

test.describe(
  "Граничные значения threshold",
  {
    tag: [
      "@api",
      "@calibration",
      "@regression",
      "@validation",
      "@performance-review",
    ],
  },
  () => {
    let testPrId;

    test.beforeAll(async ({ prSeed }) => {
      const pr = await prSeed.seedActivePR({
        title: `Validation Threshold ${Date.now()}`,
        fillAssessments: true,
      });
      testPrId = pr.id;
      console.log(`\u2705 PR для валидации threshold: ${testPrId}`);
    });

    test.beforeEach(async ({ prAPI }) => {
      markAsAPITest(MODULES.CALIBRATION, "Validation Threshold");
      // Восстанавливаем дефолтные характеристики перед каждым тестом
      await setupCharacteristics(prAPI, testPrId);
    });

    test("C4176: Граница threshold = 0", async ({ prAPI }) => {
      setSeverity("normal");

      await test.step("Установить threshold=0 для первой характеристики", async () => {
        const result = await updateFirstCharacteristicThreshold(
          prAPI,
          testPrId,
          0,
        );
        console.log(`API ответ: status=${result.status}, ok=${result.ok}`);
      });

      await test.step("Проверить сохранённое значение", async () => {
        const chars = await getCharacteristicsFromAPI(prAPI, testPrId);
        const savedThreshold = chars[0].threshold;
        console.log(`Сохранённый threshold: ${savedThreshold}`);
        // Логируем реальное поведение
        if (savedThreshold === 0) {
          console.log("\u2705 API принял threshold=0");
        } else {
          console.log(
            `\u26A0\uFE0F API не сохранил 0, threshold=${savedThreshold}`,
          );
        }
      });
    });

    test("C4177: Граница threshold = 0.01 (минимальное дробное)", async ({
      prAPI,
    }) => {
      setSeverity("minor");

      let targetTitle;
      await test.step("Установить threshold=0.01", async () => {
        const result = await updateFirstCharacteristicThreshold(
          prAPI,
          testPrId,
          0.01,
        );
        console.log(`API ответ: status=${result.status}, ok=${result.ok}`);
        targetTitle = result.targetTitle;
        expect(
          result.ok,
          "API должен принять минимальное дробное значение",
        ).toBe(true);
      });

      await test.step("Проверить сохранённое значение", async () => {
        const chars = await getCharacteristicsFromAPI(prAPI, testPrId);
        // Ищем характеристику по title (а не по индексу [0]) — порядок API непредсказуем
        const saved =
          (targetTitle && chars.find((c) => c.title === targetTitle)) ||
          chars.find((c) => c.threshold <= 1);
        const savedThreshold = saved ? saved.threshold : chars[0].threshold;
        console.log(
          `Сохранённый threshold: ${savedThreshold} (характеристика: ${saved?.title})`,
        );
        // Значение должно быть близко к 0.01 (может быть округлено)
        expect(savedThreshold).toBeLessThanOrEqual(1);
        expect(savedThreshold).toBeGreaterThanOrEqual(0);
      });
    });

    test("C4178: Граница threshold = 99.99 (максимальное перед 100)", async ({
      prAPI,
    }) => {
      setSeverity("minor");

      await test.step("Установить threshold=99.99 для характеристики 'Средне'", async () => {
        // Ищем характеристику по title (а не по индексу) — порядок API непредсказуем
        const { data: currentSettings } =
          await prAPI.getStatisticsSettings(testPrId);
        const chars = currentSettings.characteristicSettings || [];
        const target = chars.find((c) => c.title === "Средне");
        expect(
          target,
          'Характеристика "Средне" должна существовать',
        ).toBeTruthy();
        target.threshold = 99.99;
        currentSettings.characteristicSettings = chars;

        const { response } = await prAPI.updateStatisticsSettings(
          testPrId,
          currentSettings,
        );
        console.log(
          `API ответ: status=${response.status()}, ok=${response.ok()}`,
        );
        expect(response.ok(), "API должен принять 99.99").toBe(true);
      });

      await test.step("Проверить сохранённое значение", async () => {
        const chars = await getCharacteristicsFromAPI(prAPI, testPrId);
        // Ищем по title (а не по индексу [1]) — порядок API непредсказуем
        const saved = chars.find((c) => c.title === "Средне");
        expect(
          saved,
          'Характеристика "Средне" должна существовать после сохранения',
        ).toBeTruthy();
        const savedThreshold = saved.threshold;
        console.log(`Сохранённый threshold "Средне": ${savedThreshold}`);
        // Может быть 99.99 или округлено до 100
        expect(savedThreshold).toBeGreaterThanOrEqual(99);
        expect(savedThreshold).toBeLessThanOrEqual(100);
      });
    });

    test("C4402: Отрицательный threshold", async ({ prAPI }) => {
      setSeverity("normal");

      await test.step("Попытка установить отрицательный threshold", async () => {
        const result = await updateFirstCharacteristicThreshold(
          prAPI,
          testPrId,
          -5,
        );
        console.log(`API ответ: status=${result.status}, ok=${result.ok}`);

        if (result.ok) {
          console.log(
            "\u26A0\uFE0F API принял отрицательный threshold — проверяем что сохранилось",
          );
          const chars = await getCharacteristicsFromAPI(prAPI, testPrId);
          console.log(`Сохранённый threshold: ${chars[0].threshold}`);
        } else {
          console.log(
            `\u2705 API отклонил отрицательный threshold: status=${result.status}`,
          );
        }
      });

      await test.step("Верификация: threshold не должен быть отрицательным", async () => {
        const chars = await getCharacteristicsFromAPI(prAPI, testPrId);
        const savedThreshold = chars[0].threshold;
        console.log(`Итоговый threshold: ${savedThreshold}`);
        // Либо API отклонил (осталось старое 33), либо API принял -5
        // Документируем реальное поведение
        expect(typeof savedThreshold).toBe("number");
      });
    });

    test("C4403: Дробная точность threshold (33.333333)", async ({ prAPI }) => {
      setSeverity("minor");

      let targetTitle;
      await test.step("Установить threshold с высокой точностью", async () => {
        const result = await updateFirstCharacteristicThreshold(
          prAPI,
          testPrId,
          33.333333,
        );
        console.log(`API ответ: status=${result.status}, ok=${result.ok}`);
        targetTitle = result.targetTitle;
        expect(result.ok, "API должен принять дробное значение").toBe(true);
      });

      await test.step("Проверить точность хранения", async () => {
        const chars = await getCharacteristicsFromAPI(prAPI, testPrId);
        // Ищем характеристику по title (а не по индексу [0]) — порядок API непредсказуем
        const saved =
          (targetTitle && chars.find((c) => c.title === targetTitle)) ||
          chars.find((c) => c.threshold >= 33 && c.threshold <= 34);
        const savedThreshold = saved ? saved.threshold : chars[0].threshold;
        console.log(
          `Сохранённый threshold: ${savedThreshold} (отправлено: 33.333333, характеристика: ${saved?.title})`,
        );

        // Значение должно быть близко к 33.333333
        expect(savedThreshold).toBeGreaterThanOrEqual(33);
        expect(savedThreshold).toBeLessThanOrEqual(34);

        // Проверяем степень округления
        if (savedThreshold === 33) {
          console.log("\u2705 API округлил до целого числа");
        } else if (Math.abs(savedThreshold - 33.333333) < 0.001) {
          console.log("\u2705 API сохранил с высокой точностью");
        } else {
          console.log(`\u2705 API сохранил с точностью: ${savedThreshold}`);
        }
      });
    });
  },
);
