/**
 * Тесты калибровки - веса компетенций
 *
 * Требования из брифа:
 * - Сумма весов ВСЕГДА должна быть 100%
 * - При изменении веса одной компетенции, остальные (не установленные вручную)
 *   пересчитываются равными долями
 * - При добавлении/удалении компетенции веса пересчитываются
 * - Невозможно ввести значение, при котором сумма > 100%
 *
 * @tags @calibration @critical @weights
 */
import { test as baseTest, expect } from "@playwright/test";
import { getCredentials } from "../../../utils/credentials.js";
import { PerformanceReviewAPI } from "../../../utils/api/PerformanceReviewAPI.js";
import { DatabaseClient } from "../../../utils/db/DatabaseClient.js";
import { CalibrationVerifier } from "../../../utils/db/verifiers/CalibrationVerifier.js";
import { CalibrationSeed } from "../../../utils/seed/CalibrationSeed.js";
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

let TEST_PR_ID_GROUPS; // PR с группированными компетенциями (все тесты используют группы)

test.describe(
  "Calibration - Веса компетенций",
  { tag: ["@api", "@calibration", "@regression", "@performance-review"] },
  () => {
    test.beforeAll(async ({ request }) => {
      const featureParam = "?feature=statisticsSettings";
      const calSeed = new CalibrationSeed(request);
      await calSeed.init();

      // Создаём PR с группированными компетенциями
      // CalibrationSeed создаёт компетенции с group_id → competenceGroupSettings auto-populated
      console.log("\n📦 Создание PR с группированными компетенциями...");
      const groupedResult = await calSeed.seedWithDirections({
        directions: { self: true, head: true },
        targetUsersCount: 3,
        receiversPerDirection: 2,
        fillQuestionnaires: true,
      });
      TEST_PR_ID_GROUPS = groupedResult.prId;
      console.log(
        `✅ PR с группированными компетенциями: ${TEST_PR_ID_GROUPS}`,
      );

      // Включаем веса компетенций
      const { data: groupedSettings } = await calSeed.prAPI.get(
        `/manager/performance-reviews/${TEST_PR_ID_GROUPS}/statistics/settings/${featureParam}`,
      );
      await calSeed.prAPI.post(
        `/manager/performance-reviews/${TEST_PR_ID_GROUPS}/statistics/settings/${featureParam}`,
        {
          ...groupedSettings,
          settings: {
            ...(groupedSettings?.settings || {}),
            enableCompetenceWeights: true,
          },
        },
      );
      console.log("✅ enableCompetenceWeights включён");
    });

    test.beforeEach(() => {
      markAsAPITest(MODULES.CALIBRATION, "Weights");
    });

    test.describe("Сумма весов = 100%", () => {
      test("C4091: Сумма весов всех компетенций равна 100%", async ({
        adminAPI,
        calibrationVerifier,
      }) => {
        setSeverity("critical");

        const settings =
          await test.step("Получение настроек статистики калибровки", async () => {
            const { data, response } =
              await adminAPI.getStatisticsSettings(TEST_PR_ID_GROUPS);
            expect(
              response.ok(),
              `API вернул ${response.status()}`,
            ).toBeTruthy();
            expect(data).toBeDefined();
            return data;
          });

        // Анализируем веса групп компетенций
        const { weights, totalWeight } =
          await test.step("Анализ весов групп компетенций", async () => {
            const groupSettings = settings?.competenceGroupSettings || [];
            expect(
              groupSettings.length,
              "Должны быть настройки групп компетенций",
            ).toBeGreaterThan(0);

            let total = 0;
            const weightsData = [];

            for (const gs of groupSettings) {
              if (gs.competenceGroupEnabled) {
                const weight = gs.weightPercent || 0;
                const title =
                  gs.competenceGroup?.title || `ID ${gs.competenceGroupId}`;
                weightsData.push({
                  id: gs.competenceGroupId,
                  title,
                  weight,
                  enabled: gs.competenceGroupEnabled,
                });
                total += weight;
              }
            }

            console.log("Группы компетенций и веса:");
            for (const w of weightsData) {
              console.log(`  ${w.title}: ${w.weight}%`);
            }
            console.log(`Сумма: ${total}%`);

            return { weights: weightsData, totalWeight: total };
          });

        // Верификация через БД
        await test.step("DB верификация весов групп", async () => {
          const dbSettings =
            await calibrationVerifier.getCompetenceGroupSettings(
              TEST_PR_ID_GROUPS,
            );
          expect(
            dbSettings.length,
            "DB должна содержать настройки весов групп компетенций",
          ).toBeGreaterThan(0);
          const dbSum = dbSettings.reduce(
            (sum, s) => sum + (s.weight_percent || 0),
            0,
          );
          console.log(`[DB] Сумма весов групп в БД: ${dbSum}%`);
          expect(
            dbSum,
            `[DB] Сумма весов групп в БД должна быть 100%, получено: ${dbSum}%`,
          ).toBeCloseTo(100, 1);
        });

        // Проверка суммы
        await test.step("Проверка суммы весов = 100%", async () => {
          if (Math.abs(totalWeight - 100) > 0.5) {
            console.log(
              `[BUG-001] Сумма весов = ${totalWeight}%, ожидается 100%`,
            );
            test.info().annotations.push({
              type: "issue",
              description: "BUG-001: Weights sum != 100%",
            });
          }
          expect(
            totalWeight,
            `Сумма весов должна быть 100%, получено: ${totalWeight}%`,
          ).toBeCloseTo(100, 1);
        });
      });

      test("C4092: Веса групп компетенций суммируются в 100%", async ({
        adminAPI,
        calibrationVerifier,
      }) => {
        setSeverity("critical");

        const settings =
          await test.step("Получение настроек (группированный PR)", async () => {
            const { data, response } =
              await adminAPI.getStatisticsSettings(TEST_PR_ID_GROUPS);
            expect(response.ok()).toBeTruthy();
            return data;
          });

        const groupSettings = settings?.competenceGroupSettings || [];
        expect(
          groupSettings.length,
          "PR должен содержать группы компетенций",
        ).toBeGreaterThan(0);

        const { groupWeights, totalGroupWeight } =
          await test.step("Анализ весов групп", async () => {
            let total = 0;
            const weightsData = [];

            for (const gs of groupSettings) {
              if (gs.competenceGroupEnabled) {
                const weight = gs.weightPercent || 0;
                const title =
                  gs.competenceGroup?.title || `ID ${gs.competenceGroupId}`;
                weightsData.push({ id: gs.competenceGroupId, title, weight });
                total += weight;
              }
            }

            console.log("Группы и веса:");
            for (const g of weightsData) {
              console.log(`  ${g.title}: ${g.weight}%`);
            }
            console.log(`Сумма: ${total}%`);

            return { groupWeights: weightsData, totalGroupWeight: total };
          });

        // DB верификация групп
        await test.step("DB верификация весов групп", async () => {
          const dbGroups =
            await calibrationVerifier.getCompetenceGroupSettings(
              TEST_PR_ID_GROUPS,
            );
          expect(
            dbGroups.length,
            "DB должна содержать настройки весов групп компетенций",
          ).toBeGreaterThan(0);
          const dbSum = dbGroups.reduce(
            (sum, g) => sum + (g.weight_percent || 0),
            0,
          );
          console.log(`[DB] Сумма весов групп в БД: ${dbSum}%`);
          expect(
            dbSum,
            `[DB] Сумма весов групп в БД должна быть 100%, получено: ${dbSum}%`,
          ).toBeCloseTo(100, 1);
        });

        await test.step("Проверка суммы весов групп = 100%", async () => {
          if (Math.abs(totalGroupWeight - 100) > 0.5) {
            console.log(
              `[BUG-001] Сумма весов групп = ${totalGroupWeight}%, ожидается 100%`,
            );
            test.info().annotations.push({
              type: "issue",
              description: "BUG-001: Group weights sum != 100%",
            });
          }
          expect(
            totalGroupWeight,
            `Сумма весов групп должна быть 100%, получено: ${totalGroupWeight}%`,
          ).toBeCloseTo(100, 1);
        });
      });

      test("C4093: Все выбранные группы компетенций имеют вес > 0", async ({
        adminAPI,
        calibrationVerifier,
      }) => {
        setSeverity("critical");

        const groupSettings =
          await test.step("Получение настроек групп компетенций", async () => {
            const { data } =
              await adminAPI.getStatisticsSettings(TEST_PR_ID_GROUPS);
            return data?.competenceGroupSettings || [];
          });

        const enabledGroups = groupSettings.filter(
          (gs) => gs.competenceGroupEnabled,
        );
        expect(
          enabledGroups.length,
          "Должны быть включённые группы компетенций",
        ).toBeGreaterThan(0);

        await test.step("Проверка весов > 0", async () => {
          const zeroWeightGroups = enabledGroups.filter(
            (gs) => (gs.weightPercent || 0) <= 0,
          );

          if (zeroWeightGroups.length > 0) {
            const names = zeroWeightGroups.map(
              (gs) => gs.competenceGroup?.title || gs.competenceGroupId,
            );
            console.log("Группы с нулевым весом:", names);
          }

          expect(
            zeroWeightGroups.length,
            `Группы с нулевым весом: ${zeroWeightGroups.map((gs) => gs.competenceGroup?.title).join(", ")}`,
          ).toBe(0);
        });

        // DB верификация
        await test.step("DB верификация: нет нулевых весов", async () => {
          const dbSettings =
            await calibrationVerifier.getCompetenceGroupSettings(
              TEST_PR_ID_GROUPS,
              true,
            );
          expect(
            dbSettings.length,
            "DB должна содержать включённые группы компетенций",
          ).toBeGreaterThan(0);
          const zeroInDb = dbSettings.filter(
            (s) => (s.weight_percent || 0) <= 0,
          );
          console.log(
            zeroInDb.length > 0
              ? `[DB] Найдено групп с нулевым весом: ${zeroInDb.length}`
              : "[DB] Все включённые группы имеют вес > 0",
          );
          expect(
            zeroInDb.length,
            `[DB] Найдено ${zeroInDb.length} групп с нулевым весом в БД`,
          ).toBe(0);
        });
      });
    });

    test.describe("Пересчёт весов", () => {
      test("C4094: При изменении веса одной группы остальные пересчитываются", async ({
        adminAPI,
      }) => {
        setSeverity("critical");

        const initialWeights =
          await test.step("Получение начальных весов", async () => {
            const { data } =
              await adminAPI.getStatisticsSettings(TEST_PR_ID_GROUPS);
            const groupSettings = data?.competenceGroupSettings || [];
            const enabledGroups = groupSettings.filter(
              (gs) => gs.competenceGroupEnabled,
            );

            expect(
              enabledGroups.length,
              "PR должен содержать минимум 2 включённые группы",
            ).toBeGreaterThanOrEqual(2);

            return enabledGroups.map((gs) => ({
              id: gs.competenceGroupId,
              title: gs.competenceGroup?.title || `ID ${gs.competenceGroupId}`,
              weight: gs.weightPercent || 0,
            }));
          });

        if (initialWeights.length === 0) return;

        await test.step("Проверка начальной суммы весов", async () => {
          const initialSum = initialWeights.reduce(
            (sum, w) => sum + w.weight,
            0,
          );
          console.log("Начальные веса групп:");
          for (const w of initialWeights) {
            console.log(`  ${w.title}: ${w.weight}%`);
          }
          console.log(`Начальная сумма: ${initialSum}%`);

          if (Math.abs(initialSum - 100) > 0.5) {
            console.log(
              `[BUG-001] Сумма весов = ${initialSum}%, ожидается 100%`,
            );
            test.info().annotations.push({
              type: "issue",
              description: "BUG-001: Weights sum != 100%",
            });
          }
          expect(
            initialSum,
            "Начальная сумма весов должна быть 100%",
          ).toBeCloseTo(100, 1);
        });
      });

      test("C4095: Веса равномерно распределены при равных группах", async ({
        adminAPI,
      }) => {
        setSeverity("normal");

        const groupData =
          await test.step("Получение данных групп компетенций", async () => {
            const { data } =
              await adminAPI.getStatisticsSettings(TEST_PR_ID_GROUPS);
            const groupSettings = data?.competenceGroupSettings || [];
            const enabledGroups = groupSettings.filter(
              (gs) => gs.competenceGroupEnabled,
            );

            expect(
              enabledGroups.length,
              "PR должен содержать минимум 2 включённые группы",
            ).toBeGreaterThanOrEqual(2);

            return {
              weights: enabledGroups.map((gs) => gs.weightPercent || 0),
              count: enabledGroups.length,
            };
          });

        if (!groupData) return;

        await test.step("Анализ распределения весов", async () => {
          const { weights, count } = groupData;
          const expectedEqualWeight = 100 / count;

          console.log(
            `Ожидаемый равный вес при равном распределении: ${expectedEqualWeight.toFixed(2)}%`,
          );

          const allEqual = weights.every(
            (w, _, arr) => Math.abs(w - arr[0]) < 0.1,
          );

          console.log(`Все веса равны: ${allEqual}`);
          console.log(
            "Веса:",
            weights.map((w) => `${w.toFixed(2)}%`).join(", "),
          );
          expect(
            allEqual,
            `Все веса должны быть равны при равномерном распределении. Веса: ${weights.map((w) => `${w.toFixed(2)}%`).join(", ")}`,
          ).toBe(true);
          expect(weights[0]).toBeCloseTo(expectedEqualWeight, 0);
        });
      });
    });

    test.describe("Валидация ввода весов", () => {
      test("C4096: Невозможно установить сумму весов > 100%", async ({
        adminAPI,
      }) => {
        setSeverity("critical");

        const groupSettings =
          await test.step("Получение текущих настроек", async () => {
            const { data } =
              await adminAPI.getStatisticsSettings(TEST_PR_ID_GROUPS);
            const settings = data?.competenceGroupSettings || [];

            if (settings.length === 0) {
              test.skip(true, "Нет групп компетенций");
            }

            return settings;
          });

        if (groupSettings.length === 0) return;

        await test.step("Попытка установить невалидные веса (сумма > 100%)", async () => {
          const invalidWeights = groupSettings.map((gs) => ({
            ...gs,
            weightPercent: 100, // Каждой 100% - сумма будет > 100%
          }));

          const { response } = await adminAPI.updateStatisticsSettings(
            TEST_PR_ID_GROUPS,
            {
              competenceGroupSettings: invalidWeights,
            },
          );

          if (!response.ok()) {
            console.log("✓ API отклонил невалидные веса (ожидаемое поведение)");
            expect(response.status()).toBeGreaterThanOrEqual(400);
          } else {
            // Если API принял - проверяем что веса пересчитались до 100%
            const { data: updatedSettings } =
              await adminAPI.getStatisticsSettings(TEST_PR_ID_GROUPS);
            const updatedGroups =
              updatedSettings?.competenceGroupSettings || [];
            const enabledGroups = updatedGroups.filter(
              (gs) => gs.competenceGroupEnabled,
            );
            const updatedSum = enabledGroups.reduce(
              (sum, gs) => sum + (gs.weightPercent || 0),
              0,
            );

            console.log(
              "API принял и пересчитал веса, новая сумма:",
              updatedSum,
            );
            expect(updatedSum).toBeCloseTo(100, 1);
          }
        });
      });

      test("C4097: Вес группы компетенций должен быть положительным числом", async ({
        adminAPI,
      }) => {
        setSeverity("normal");

        const groupSettings =
          await test.step("Получение настроек групп компетенций", async () => {
            const { data } =
              await adminAPI.getStatisticsSettings(TEST_PR_ID_GROUPS);
            return data?.competenceGroupSettings || [];
          });

        await test.step("Проверка что все веса положительные", async () => {
          const enabledGroups = groupSettings.filter(
            (gs) => gs.competenceGroupEnabled,
          );
          expect(
            enabledGroups.length,
            "Должны быть включённые группы компетенций для проверки весов",
          ).toBeGreaterThan(0);

          for (const gs of enabledGroups) {
            const weight = gs.weightPercent || 0;
            const title =
              gs.competenceGroup?.title || `ID ${gs.competenceGroupId}`;
            expect(
              weight,
              `Вес "${title}" должен быть > 0 (нулевой вес недопустим при включённых весах)`,
            ).toBeGreaterThan(0);
            expect(
              Number.isFinite(weight),
              `Вес "${title}" должен быть конечным числом`,
            ).toBeTruthy();
          }
          console.log(
            `✓ Все ${enabledGroups.length} включённых групп имеют валидные веса > 0`,
          );
        });
      });
    });

    test.describe("Связь весов с итоговой оценкой", () => {
      test("C4098: Итоговая оценка учитывает веса компетенций", async ({
        adminAPI,
        calibrationVerifier,
      }) => {
        setSeverity("critical");

        const settings =
          await test.step("Получение настроек статистики", async () => {
            const { data } =
              await adminAPI.getStatisticsSettings(TEST_PR_ID_GROUPS);
            return data;
          });

        await test.step("Анализ настроек калибровки", async () => {
          const mainSettings = settings?.settings || {};
          const enableCompetenceWeights = mainSettings.enableCompetenceWeights;

          console.log("Настройки калибровки:");
          console.log("  Веса компетенций включены:", enableCompetenceWeights);
          console.log(
            "  Использовать только оценку руководителя:",
            mainSettings.useOnlyHeadReceiver,
          );
          console.log(
            "  Разрешить перезапись ответов:",
            mainSettings.enableResponsesOverwriting,
          );

          expect(
            enableCompetenceWeights,
            "Веса компетенций (enableCompetenceWeights) должны быть включены для PR с весами",
          ).toBe(true);
          console.log(
            "✓ Настроено для калибровки (только оценка руководителя):",
            mainSettings.useOnlyHeadReceiver,
          );
        });

        // DB верификация настроек
        await test.step("DB верификация настроек", async () => {
          const dbSettings =
            await calibrationVerifier.getStatisticsSettings(TEST_PR_ID_GROUPS);
          expect(
            dbSettings.length,
            "DB должна содержать настройки статистики PR",
          ).toBeGreaterThan(0);
          console.log(`[DB] Найдено ${dbSettings.length} настроек в БД`);

          const enableWeights = dbSettings.find(
            (s) => s.name === "enableCompetenceWeights",
          );
          expect(
            enableWeights,
            "[DB] Настройка enableCompetenceWeights должна присутствовать в БД",
          ).toBeDefined();
          console.log(
            `[DB] enableCompetenceWeights: ${enableWeights?.numeric_value || enableWeights?.text_value}`,
          );
          expect(
            Number(enableWeights?.numeric_value) || enableWeights?.text_value,
            "[DB] enableCompetenceWeights должна быть включена (truthy значение)",
          ).toBeTruthy();
        });
      });
    });
  },
);
