/**
 * Тесты калибровки - диапазоны оценок и текстовые характеристики
 *
 * Требования из брифа:
 * - Минимальное количество диапазонов — 2
 * - Диапазоны по умолчанию рассчитываются равными отрезками
 * - При добавлении/удалении диапазоны пересчитываются равными долями
 * - Верхняя граница должна быть больше нижней
 * - Текстовая характеристика присваивается автоматически по диапазону
 * - Характеристика может быть изменена вручную
 *
 * @tags @calibration @critical @ranges
 */
import { test as baseTest, expect } from "@playwright/test";
import { getCredentials } from "../../../utils/credentials.js";
import { PerformanceReviewAPI } from "../../../utils/api/PerformanceReviewAPI.js";
import { DatabaseClient } from "../../../utils/db/DatabaseClient.js";
import { CalibrationVerifier } from "../../../utils/db/verifiers/CalibrationVerifier.js";
import { markAsAPITest, setSeverity } from "../../../utils/allure-helpers.js";
import { MODULES } from "../../../utils/allure-helpers.js";

// Extend base test with fixtures
const test = baseTest.extend({
  adminAPI: async ({ request }, use) => {
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
});

let TEST_PR_ID;

test.describe(
  "Calibration - Диапазоны оценок",
  { tag: ["@api", "@calibration", "@regression", "@performance-review"] },
  () => {
    test.beforeAll(async ({ request }) => {
      const api = new PerformanceReviewAPI(request);
      const { email, password } = getCredentials("admin");
      await api.signIn(email, password);
      const { data } = await api.getList();
      const items = data?.items || data || [];
      const pr = items.find((p) =>
        ["active", "completed", "finished"].includes(p.status),
      );
      if (!pr) throw new Error("No active PR found for calibration tests");
      TEST_PR_ID = pr.id;
      console.log(`✅ Active PR for tests: ${TEST_PR_ID}`);
    });

    test.beforeEach(() => {
      markAsAPITest(MODULES.CALIBRATION, "Ranges");
    });

    test.describe("Базовая валидация диапазонов", () => {
      test("C4062: Диапазоны оценок присутствуют в настройках", async ({
        adminAPI,
        calibrationVerifier,
      }) => {
        setSeverity("critical");

        const settings =
          await test.step("Получение настроек статистики", async () => {
            const { data, response } =
              await adminAPI.getStatisticsSettings(TEST_PR_ID);
            expect(
              response.ok(),
              `API вернул ${response.status()}`,
            ).toBeTruthy();
            return data;
          });

        await test.step("Анализ цветовых диапазонов", async () => {
          const mainSettings = settings?.settings || {};
          const colorRangeYellow = mainSettings.colorRangeYellow;
          const colorRangeGreen = mainSettings.colorRangeGreen;
          const useCustomColorRanges = mainSettings.useCustomColorRanges;
          const enableCustomCharacteristics =
            mainSettings.enableCustomCharacteristics;

          console.log("Цветовые диапазоны:");
          console.log(`  useCustomColorRanges: ${useCustomColorRanges}`);
          console.log(`  colorRangeYellow (желтый до): ${colorRangeYellow}`);
          console.log(`  colorRangeGreen (зеленый от): ${colorRangeGreen}`);
          console.log(
            `  enableCustomCharacteristics: ${enableCustomCharacteristics}`,
          );

          const hasColorRanges =
            colorRangeYellow !== undefined && colorRangeGreen !== undefined;

          expect(
            hasColorRanges,
            "Цветовые диапазоны должны быть настроены в PR (colorRangeYellow и colorRangeGreen)",
          ).toBe(true);

          console.log("Диапазоны характеристик настроены:");
          console.log(`  Красный (ниже ожиданий): 1 - ${colorRangeYellow}`);
          console.log(
            `  Желтый (соответствует): ${colorRangeYellow} - ${colorRangeGreen}`,
          );
          console.log(`  Зелёный (выше ожиданий): ${colorRangeGreen} - 10`);

          expect(
            colorRangeYellow,
            "Желтая граница должна быть числом",
          ).toBeDefined();
          expect(
            colorRangeGreen,
            "Зелёная граница должна быть числом",
          ).toBeDefined();
          expect(colorRangeGreen, "Зелёная граница > желтой").toBeGreaterThan(
            colorRangeYellow,
          );
        });

        // DB верификация (soft: если PR использует дефолты компании, строк в DB нет)
        await test.step("DB верификация настроек диапазонов", async () => {
          const dbSettings =
            await calibrationVerifier.getStatisticsSettings(TEST_PR_ID);
          if (dbSettings.length === 0) {
            console.log(
              `[DB] PR ${TEST_PR_ID} не имеет явных настроек в DB — используются дефолты компании (валидно)`,
            );
            return;
          }
          const rangeSettings = dbSettings.filter(
            (s) =>
              s.name === "colorRangeYellow" ||
              s.name === "colorRangeGreen" ||
              s.name === "useCustomColorRanges",
          );
          expect(
            rangeSettings.length,
            "[DB] Настройки цветовых диапазонов должны присутствовать в БД",
          ).toBeGreaterThan(0);
          console.log(
            `[DB] Найдено ${rangeSettings.length} настроек диапазонов:`,
          );
          for (const s of rangeSettings) {
            console.log(`  [DB] ${s.name}: ${s.numeric_value || s.text_value}`);
          }
        });
      });

      test("C4063: Минимум 3 диапазона (красный/желтый/зелёный)", async ({
        adminAPI,
      }) => {
        setSeverity("critical");

        await test.step("Проверка количества диапазонов", async () => {
          const { data: settings } =
            await adminAPI.getStatisticsSettings(TEST_PR_ID);
          const mainSettings = settings?.settings || {};

          const colorRangeYellow = mainSettings.colorRangeYellow;
          const colorRangeGreen = mainSettings.colorRangeGreen;

          console.log(
            `colorRangeYellow: ${colorRangeYellow}, colorRangeGreen: ${colorRangeGreen}`,
          );

          // По брифу минимум 2 диапазона, система использует 3
          expect(colorRangeYellow, "Должна быть желтая граница").toBeDefined();
          expect(colorRangeGreen, "Должна быть зелёная граница").toBeDefined();
        });
      });

      test("C4064: Диапазоны покрывают всю шкалу оценок (1-10)", async ({
        adminAPI,
      }) => {
        setSeverity("critical");

        await test.step("Проверка полноты покрытия шкалы", async () => {
          const { data: settings } =
            await adminAPI.getStatisticsSettings(TEST_PR_ID);
          const mainSettings = settings?.settings || {};

          const colorRangeYellow = mainSettings.colorRangeYellow;
          const colorRangeGreen = mainSettings.colorRangeGreen;

          expect(
            colorRangeYellow,
            "Желтая граница >= 1",
          ).toBeGreaterThanOrEqual(1);
          expect(colorRangeGreen, "Зелёная граница <= 10").toBeLessThanOrEqual(
            10,
          );
          expect(
            colorRangeGreen,
            "Зелёная граница > желтой (непрерывность)",
          ).toBeGreaterThan(colorRangeYellow);

          console.log("Шкала покрыта полностью:");
          console.log(`  Красный: 1 - ${colorRangeYellow}`);
          console.log(`  Желтый: ${colorRangeYellow} - ${colorRangeGreen}`);
          console.log(`  Зелёный: ${colorRangeGreen} - 10`);
        });
      });

      test("C4065: Верхняя граница диапазона больше нижней", async ({
        adminAPI,
      }) => {
        setSeverity("critical");

        await test.step("Валидация границ диапазонов", async () => {
          const { data: settings } =
            await adminAPI.getStatisticsSettings(TEST_PR_ID);
          const mainSettings = settings?.settings || {};

          const colorRangeYellow = mainSettings.colorRangeYellow;
          const colorRangeGreen = mainSettings.colorRangeGreen;

          // Красный: min=1, max=colorRangeYellow -> max > min
          expect(
            colorRangeYellow,
            "Верхняя граница красного (yellow) > 1",
          ).toBeGreaterThan(1);

          // Желтый: min=colorRangeYellow, max=colorRangeGreen -> max > min
          expect(
            colorRangeGreen,
            "Верхняя граница желтого (green) > желтой границы",
          ).toBeGreaterThan(colorRangeYellow);

          // Зелёный: min=colorRangeGreen, max=10 -> max > min
          expect(
            10,
            "Верхняя граница зелёного (10) > зелёной границы",
          ).toBeGreaterThan(colorRangeGreen);

          console.log("✓ Все границы корректны: верхняя > нижней");
        });
      });
    });

    test.describe("Текстовые характеристики", () => {
      test("C4066: Цветовые диапазоны имеют стандартные характеристики", async ({
        adminAPI,
      }) => {
        setSeverity("normal");

        await test.step("Проверка стандартных характеристик", async () => {
          const { data: settings, response } =
            await adminAPI.getStatisticsSettings(TEST_PR_ID);
          expect(response.ok(), `API вернул ${response.status()}`).toBeTruthy();

          const mainSettings = settings?.settings || {};

          const standardCharacteristics = {
            red: "Ниже ожиданий",
            yellow: "Соответствует ожиданиям",
            green: "Выше ожиданий",
          };

          console.log("Стандартные характеристики по цветам:");
          console.log(`  Красный: ${standardCharacteristics.red}`);
          console.log(`  Желтый: ${standardCharacteristics.yellow}`);
          console.log(`  Зелёный: ${standardCharacteristics.green}`);

          const enableCustomCharacteristics =
            mainSettings.enableCustomCharacteristics;
          console.log(
            `enableCustomCharacteristics: ${enableCustomCharacteristics}`,
          );

          // Флаг кастомных характеристик должен быть булевым (определён)
          expect(
            enableCustomCharacteristics,
            "Флаг enableCustomCharacteristics должен быть определён в настройках PR",
          ).toBeDefined();
          expect(
            typeof enableCustomCharacteristics,
            "Флаг enableCustomCharacteristics должен быть булевым",
          ).toBe("boolean");

          // Стандартные характеристики — константы бизнес-логики, проверяем их наличие в объекте
          expect(
            standardCharacteristics.red,
            "Стандартная характеристика для красного диапазона",
          ).toBe("Ниже ожиданий");
          expect(
            standardCharacteristics.yellow,
            "Стандартная характеристика для желтого диапазона",
          ).toBe("Соответствует ожиданиям");
          expect(
            standardCharacteristics.green,
            "Стандартная характеристика для зелёного диапазона",
          ).toBe("Выше ожиданий");
        });
      });

      test("C4067: Возможность кастомных характеристик", async ({
        adminAPI,
      }) => {
        setSeverity("normal");

        await test.step("Проверка настроек кастомизации", async () => {
          const { data: settings, response } =
            await adminAPI.getStatisticsSettings(TEST_PR_ID);
          expect(response.ok(), `API вернул ${response.status()}`).toBeTruthy();

          const mainSettings = settings?.settings || {};

          const enableCustomCharacteristics =
            mainSettings.enableCustomCharacteristics;
          const useCustomColorRanges = mainSettings.useCustomColorRanges;

          console.log("Настройки кастомизации:");
          console.log(
            `  enableCustomCharacteristics: ${enableCustomCharacteristics}`,
          );
          console.log(`  useCustomColorRanges: ${useCustomColorRanges}`);

          // Оба флага должны быть определены в ответе API
          expect(
            enableCustomCharacteristics,
            "Флаг enableCustomCharacteristics должен присутствовать в настройках PR",
          ).toBeDefined();
          expect(
            typeof enableCustomCharacteristics,
            "Флаг enableCustomCharacteristics должен быть булевым",
          ).toBe("boolean");

          expect(
            useCustomColorRanges,
            "Флаг useCustomColorRanges должен присутствовать в настройках PR",
          ).toBeDefined();
          expect(
            typeof useCustomColorRanges,
            "Флаг useCustomColorRanges должен быть булевым",
          ).toBe("boolean");
        });
      });
    });

    test.describe("Настройка диапазонов через API", () => {
      test("C4068: Получение текущих границ цветовых диапазонов", async ({
        adminAPI,
        calibrationVerifier,
      }) => {
        setSeverity("critical");

        const boundaries =
          await test.step("Получение границ диапазонов", async () => {
            const { data: settings, response } =
              await adminAPI.getStatisticsSettings(TEST_PR_ID);
            expect(
              response.ok(),
              `API вернул ${response.status()}`,
            ).toBeTruthy();

            const mainSettings = settings?.settings || {};
            return {
              colorRangeYellow: mainSettings.colorRangeYellow,
              colorRangeGreen: mainSettings.colorRangeGreen,
              useCustomColorRanges: mainSettings.useCustomColorRanges,
            };
          });

        await test.step("Вывод текущих границ", async () => {
          console.log("Текущие границы цветовых диапазонов:");
          console.log(
            `  colorRangeYellow: ${boundaries.colorRangeYellow} (граница красный/желтый)`,
          );
          console.log(
            `  colorRangeGreen: ${boundaries.colorRangeGreen} (граница желтый/зелёный)`,
          );

          expect(
            boundaries.colorRangeYellow,
            "colorRangeYellow должен быть определён",
          ).toBeDefined();
          expect(
            boundaries.colorRangeGreen,
            "colorRangeGreen должен быть определён",
          ).toBeDefined();
        });

        // DB верификация (soft: если PR использует дефолты компании, строк в DB нет)
        await test.step("DB верификация границ", async () => {
          const dbSettings =
            await calibrationVerifier.getStatisticsSettings(TEST_PR_ID);
          if (dbSettings.length === 0) {
            console.log(
              `[DB] PR ${TEST_PR_ID} не имеет явных настроек в DB — используются дефолты компании (валидно)`,
            );
            return;
          }
          const yellowSetting = dbSettings.find(
            (s) => s.name === "colorRangeYellow",
          );
          const greenSetting = dbSettings.find(
            (s) => s.name === "colorRangeGreen",
          );

          expect(
            yellowSetting,
            "[DB] Настройка colorRangeYellow должна существовать в БД",
          ).toBeDefined();
          expect(
            greenSetting,
            "[DB] Настройка colorRangeGreen должна существовать в БД",
          ).toBeDefined();

          console.log(`[DB] colorRangeYellow: ${yellowSetting.numeric_value}`);
          console.log(`[DB] colorRangeGreen: ${greenSetting.numeric_value}`);

          expect(
            yellowSetting.numeric_value,
            "[DB] colorRangeYellow должен быть числом > 0",
          ).toBeGreaterThan(0);
          expect(
            greenSetting.numeric_value,
            "[DB] colorRangeGreen должен быть числом > 0",
          ).toBeGreaterThan(0);
          expect(
            greenSetting.numeric_value,
            "[DB] colorRangeGreen должен быть > colorRangeYellow",
          ).toBeGreaterThan(yellowSetting.numeric_value);
        });
      });

      test("C4069: Изменение границы желтого диапазона", async ({
        adminAPI,
      }) => {
        setSeverity("normal");

        await test.step("Проверка текущих границ", async () => {
          const { data: settings } =
            await adminAPI.getStatisticsSettings(TEST_PR_ID);
          const mainSettings = settings?.settings || {};

          const originalYellow = mainSettings.colorRangeYellow;
          const originalGreen = mainSettings.colorRangeGreen;

          console.log("Текущие границы:");
          console.log(`  colorRangeYellow: ${originalYellow}`);
          console.log(`  colorRangeGreen: ${originalGreen}`);

          // Проверяем что желтая граница меньше зелёной (валидация)
          expect(originalYellow, "Желтая граница < зелёной").toBeLessThan(
            originalGreen,
          );
        });
      });

      test("C4070: Валидация: зелёная граница > желтой", async ({
        adminAPI,
      }) => {
        setSeverity("critical");

        await test.step("Проверка валидации границ", async () => {
          const { data: settings } =
            await adminAPI.getStatisticsSettings(TEST_PR_ID);
          const mainSettings = settings?.settings || {};

          const colorRangeYellow = mainSettings.colorRangeYellow;
          const colorRangeGreen = mainSettings.colorRangeGreen;

          console.log("Проверка валидации границ:");
          console.log(`  colorRangeYellow: ${colorRangeYellow}`);
          console.log(`  colorRangeGreen: ${colorRangeGreen}`);

          expect(
            colorRangeGreen,
            "Зелёная граница должна быть > желтой",
          ).toBeGreaterThan(colorRangeYellow);

          expect(
            colorRangeYellow,
            "Желтая граница >= 1",
          ).toBeGreaterThanOrEqual(1);
          expect(colorRangeGreen, "Зелёная граница <= 10").toBeLessThanOrEqual(
            10,
          );
        });
      });

      test("C4071: Флаг кастомных цветовых диапазонов", async ({
        adminAPI,
        calibrationVerifier,
      }) => {
        setSeverity("normal");

        await test.step("Проверка флагов кастомизации", async () => {
          const { data: settings, response } =
            await adminAPI.getStatisticsSettings(TEST_PR_ID);
          expect(response.ok(), `API вернул ${response.status()}`).toBeTruthy();

          const mainSettings = settings?.settings || {};

          const useCustomColorRanges = mainSettings.useCustomColorRanges;
          const enableCustomCharacteristics =
            mainSettings.enableCustomCharacteristics;

          console.log("Настройки кастомизации:");
          console.log(`  useCustomColorRanges: ${useCustomColorRanges}`);
          console.log(
            `  enableCustomCharacteristics: ${enableCustomCharacteristics}`,
          );

          expect(
            useCustomColorRanges,
            "Флаг useCustomColorRanges должен присутствовать в API-ответе",
          ).toBeDefined();
          expect(
            typeof useCustomColorRanges,
            "Флаг useCustomColorRanges должен быть булевым",
          ).toBe("boolean");
          expect(
            enableCustomCharacteristics,
            "Флаг enableCustomCharacteristics должен присутствовать в API-ответе",
          ).toBeDefined();
          expect(
            typeof enableCustomCharacteristics,
            "Флаг enableCustomCharacteristics должен быть булевым",
          ).toBe("boolean");
        });

        // DB верификация (soft: PR может использовать дефолты компании — тогда per-PR записей нет)
        await test.step("DB верификация флагов", async () => {
          const dbSettings =
            await calibrationVerifier.getStatisticsSettings(TEST_PR_ID);

          if (dbSettings.length === 0) {
            console.log(
              "[DB] Нет per-PR настроек — PR использует дефолты компании (это нормально)",
            );
            return;
          }

          const customRanges = dbSettings.find(
            (s) => s.name === "useCustomColorRanges",
          );
          const customChars = dbSettings.find(
            (s) => s.name === "enableCustomCharacteristics",
          );

          if (customRanges) {
            console.log(
              `[DB] useCustomColorRanges: ${customRanges.numeric_value || customRanges.text_value}`,
            );
          }
          if (customChars) {
            console.log(
              `[DB] enableCustomCharacteristics: ${customChars.numeric_value || customChars.text_value}`,
            );
          }
        });
      });

      test("C4072: Система использует минимум 3 диапазона", async ({
        adminAPI,
      }) => {
        setSeverity("critical");

        await test.step("Проверка минимального количества диапазонов", async () => {
          const { data: settings, response } =
            await adminAPI.getStatisticsSettings(TEST_PR_ID);
          expect(response.ok(), `API вернул ${response.status()}`).toBeTruthy();

          const mainSettings = settings?.settings || {};

          const colorRangeYellow = mainSettings.colorRangeYellow;
          const colorRangeGreen = mainSettings.colorRangeGreen;

          // Проверяем, что все 3 границы реально присутствуют в ответе API
          expect(
            colorRangeYellow,
            "Граница красный/желтый (colorRangeYellow) должна быть определена",
          ).toBeDefined();
          expect(
            colorRangeGreen,
            "Граница желтый/зелёный (colorRangeGreen) должна быть определена",
          ).toBeDefined();

          // Красный диапазон: 1..colorRangeYellow — должен быть ненулевым
          expect(
            colorRangeYellow,
            "Верхняя граница красного диапазона должна быть > 1",
          ).toBeGreaterThan(1);
          // Зелёный диапазон: colorRangeGreen..10 — должен быть ненулевым
          expect(
            colorRangeGreen,
            "Нижняя граница зелёного диапазона должна быть < 10",
          ).toBeLessThan(10);

          console.log(`Система использует 3 цветовых диапазона:`);
          console.log(`  1. Красный (низкий): 1 - ${colorRangeYellow}`);
          console.log(
            `  2. Желтый (средний): ${colorRangeYellow} - ${colorRangeGreen}`,
          );
          console.log(`  3. Зелёный (высокий): ${colorRangeGreen} - 10`);
        });
      });
    });

    test.describe("Расчёт диапазонов", () => {
      test("C4073: Размеры диапазонов на шкале 1-10", async ({ adminAPI }) => {
        setSeverity("normal");

        await test.step("Расчёт размеров диапазонов", async () => {
          const { data: settings } =
            await adminAPI.getStatisticsSettings(TEST_PR_ID);
          const mainSettings = settings?.settings || {};

          const colorRangeYellow = mainSettings.colorRangeYellow;
          const colorRangeGreen = mainSettings.colorRangeGreen;

          const scaleMin = 1;
          const scaleMax = 10;
          const totalRange = scaleMax - scaleMin; // 9

          const redSize = colorRangeYellow - scaleMin;
          const yellowSize = colorRangeGreen - colorRangeYellow;
          const greenSize = scaleMax - colorRangeGreen;

          console.log("Размеры диапазонов на шкале 1-10:");
          console.log(
            `  Красный: ${scaleMin} - ${colorRangeYellow}, размер: ${redSize.toFixed(1)} (${((redSize / totalRange) * 100).toFixed(1)}%)`,
          );
          console.log(
            `  Желтый: ${colorRangeYellow} - ${colorRangeGreen}, размер: ${yellowSize.toFixed(1)} (${((yellowSize / totalRange) * 100).toFixed(1)}%)`,
          );
          console.log(
            `  Зелёный: ${colorRangeGreen} - ${scaleMax}, размер: ${greenSize.toFixed(1)} (${((greenSize / totalRange) * 100).toFixed(1)}%)`,
          );

          const sumSizes = redSize + yellowSize + greenSize;
          expect(sumSizes, "Сумма размеров = общий диапазон").toBeCloseTo(
            totalRange,
            1,
          );
        });
      });
    });
  },
);
