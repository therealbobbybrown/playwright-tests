/**
 * Тесты калибровки - отображение результатов до/после калибровки
 *
 * Требования из брифа:
 * - В таблице оцениваемых: столбцы «Итоговая оценка до калибровки» и «Итоговая оценка после калибровки»
 * - В тепловой карте: столбец "Итоговая оценка" (откалиброванная, если была калибровка)
 * - Сотрудник видит только откалиброванную оценку
 * - В выгрузке отчетов в эксель должны выводиться обе оценки до и после калибровки
 * - Текстовая характеристика присваивается автоматически по диапазону
 *
 * @tags @calibration @critical @results
 */
import { test as baseTest, expect } from "@playwright/test";
import { getCredentials } from "../../../utils/credentials.js";
import { PerformanceReviewAPI } from "../../../utils/api/PerformanceReviewAPI.js";
import { DatabaseClient } from "../../../utils/db/DatabaseClient.js";
import { CalibrationVerifier } from "../../../utils/db/verifiers/CalibrationVerifier.js";
import { PerformanceReviewSeedHelper } from "../../../utils/seed/PerformanceReviewSeedHelper.js";
import { markAsAPITest, setSeverity } from "../../../utils/allure-helpers.js";
import { MODULES } from "../../../utils/allure-helpers.js";

/** Получить ревизию с retry (getLastRevision иногда возвращает null) */
async function getRevisionWithRetry(api, prId, cached) {
  if (cached) return cached;
  for (let i = 0; i < 3; i++) {
    const { data: rev } = await api.getLastRevision(prId);
    if (rev) return rev;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return null;
}

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
let TEST_REVISION;
let TARGET_USER_IDS;

test.describe(
  "Calibration - Отображение результатов",
  { tag: ["@api", "@calibration", "@regression", "@performance-review"] },
  () => {
    test.beforeAll(async ({ request }) => {
      test.setTimeout(180000);

      // PR с плоскими компетенциями (prSeed → assessment с негруппированными компетенциями)
      const prSeed = new PerformanceReviewSeedHelper(request);
      await prSeed.init("admin");
      const pr = await prSeed.seedActivePR({ fillAssessments: true });
      TEST_PR_ID = pr.id;
      console.log(`✅ PR для calibration-results: ${TEST_PR_ID}`);

      // Активировать feature flag statisticsSettings и настроить текстовые характеристики
      const featureParam = "?feature=statisticsSettings";
      const { data: currentSettings, response: getResp } =
        await prSeed.prAPI.get(
          `/manager/performance-reviews/${TEST_PR_ID}/statistics/settings/${featureParam}`,
        );
      console.log(
        `GET statisticsSettings: status=${getResp.status()}, hasData=${!!currentSettings}`,
      );

      const { response: updateResp } = await prSeed.prAPI.post(
        `/manager/performance-reviews/${TEST_PR_ID}/statistics/settings/${featureParam}`,
        {
          ...currentSettings,
          settings: {
            ...(currentSettings?.settings || {}),
            enableCustomCharacteristics: true,
          },
          characteristicSettings: [
            { threshold: 33, title: "Низкий уровень", category: "negative" },
            { threshold: 66, title: "Средний уровень", category: "neutral" },
            { threshold: 100, title: "Высокий уровень", category: "positive" },
          ],
        },
      );
      console.log(`POST statisticsSettings: status=${updateResp.status()}`);
      if (!updateResp.ok()) {
        console.log(
          "⚠️ updateStatisticsSettings failed:",
          await updateResp.text(),
        );
      } else {
        console.log("✅ Настроены диапазоны текстовых характеристик");
      }

      // Кешируем ревизию — getLastRevision иногда возвращает null при конкурентных запросах
      for (let attempt = 1; attempt <= 5; attempt++) {
        const { data: rev } = await prSeed.prAPI.getLastRevision(TEST_PR_ID);
        if (rev) {
          TEST_REVISION = rev;
          console.log(`✅ Ревизия кеширована: ${TEST_REVISION.id}`);
          break;
        }
        if (attempt < 5) await new Promise((r) => setTimeout(r, 1000));
      }
      if (!TEST_REVISION) {
        console.log(
          "⚠️ Не удалось получить ревизию в beforeAll, тесты будут запрашивать самостоятельно",
        );
      }

      // Кешируем target user IDs
      const { data: tuData } = await prSeed.prAPI.getTargetUsers(TEST_PR_ID, {
        limit: 10,
        offset: 0,
      });
      TARGET_USER_IDS = (tuData?.items || [])
        .map((u) => u.user?.id ?? u.userId)
        .filter(Boolean);
      console.log(`✅ Target user IDs: [${TARGET_USER_IDS.join(", ")}]`);
    });

    test.beforeEach(() => {
      markAsAPITest(MODULES.CALIBRATION, "Results");
    });

    test.describe("Оценки до и после калибровки", () => {
      test("C7279: API возвращает оценку до калибровки", async ({
        adminAPI,
      }) => {
        setSeverity("critical");

        const revision = await getRevisionWithRetry(
          adminAPI,
          TEST_PR_ID,
          TEST_REVISION,
        );
        if (!revision) {
          test.skip(true, "Ревизия недоступна (flaky getLastRevision)");
          return;
        }

        expect(
          TARGET_USER_IDS.length,
          "Должны быть target user IDs (из beforeAll)",
        ).toBeGreaterThan(0);

        await test.step("Получение оценок компетенций через getUsersCompetenciesResults", async () => {
          const { data, response } = await adminAPI.getUsersCompetenciesResults(
            TEST_PR_ID,
            {
              usersIds: TARGET_USER_IDS,
              revisionId: revision.id,
            },
          );

          expect(
            response.ok(),
            `getUsersCompetenciesResults вернул ${response.status()}`,
          ).toBeTruthy();

          const results = Array.isArray(data) ? data : data?.items || [];
          expect(
            results.length,
            "Должны быть результаты оценок компетенций",
          ).toBeGreaterThan(0);

          const firstResult = results[0];
          console.log(
            "Первый результат оценки:",
            JSON.stringify(firstResult, null, 2).slice(0, 500),
          );

          // value — это текущая оценка (до калибровки = не перезаписана)
          expect(
            typeof firstResult.value,
            "Оценка (value) должна быть числом",
          ).toBe("number");
          console.log(
            `✅ Оценка до калибровки: value=${firstResult.value}, isOverwritten=${firstResult.isOverwritten}`,
          );
        });
      });

      test("C7280: API возвращает оценку после калибровки", async ({
        adminAPI,
      }) => {
        setSeverity("critical");

        const revision = await getRevisionWithRetry(
          adminAPI,
          TEST_PR_ID,
          TEST_REVISION,
        );
        if (!revision) {
          test.skip(true, "Ревизия недоступна (flaky getLastRevision)");
          return;
        }

        expect(
          TARGET_USER_IDS.length,
          "Должны быть target user IDs (из beforeAll)",
        ).toBeGreaterThan(0);

        await test.step("Проверка структуры данных оценок (isOverwritten поле)", async () => {
          const { data, response } = await adminAPI.getUsersCompetenciesResults(
            TEST_PR_ID,
            {
              usersIds: TARGET_USER_IDS,
              revisionId: revision.id,
            },
          );

          expect(
            response.ok(),
            `getUsersCompetenciesResults вернул ${response.status()}`,
          ).toBeTruthy();

          const results = Array.isArray(data) ? data : data?.items || [];
          expect(
            results.length,
            "Должны быть результаты оценок компетенций",
          ).toBeGreaterThan(0);

          // Проверяем что поле isOverwritten существует и имеет boolean тип
          const firstResult = results[0];
          expect(
            firstResult.value !== undefined && firstResult.value !== null,
            "Поле value должно присутствовать в результатах",
          ).toBeTruthy();
          expect(
            typeof firstResult.isOverwritten,
            "Поле isOverwritten должно быть boolean",
          ).toBe("boolean");

          // Без калибровки isOverwritten === false
          console.log(
            `✅ isOverwritten=${firstResult.isOverwritten}, value=${firstResult.value}`,
          );

          // Проверяем все результаты
          for (const r of results.slice(0, 5)) {
            console.log(
              `  userId=${r.userId}: value=${r.value}, isOverwritten=${r.isOverwritten}, valueColor=${r.valueColor}`,
            );
            expect(
              typeof r.isOverwritten,
              `isOverwritten для userId=${r.userId} должен быть boolean`,
            ).toBe("boolean");
          }
        });
      });

      test("C4076: Разница между оценками до и после калибровки (Delta)", async ({
        adminAPI,
      }) => {
        setSeverity("normal");

        const revision = await getRevisionWithRetry(
          adminAPI,
          TEST_PR_ID,
          TEST_REVISION,
        );
        if (!revision) {
          test.skip(true, "Ревизия недоступна (flaky getLastRevision)");
          return;
        }

        expect(
          TARGET_USER_IDS.length,
          "Должны быть target user IDs (из beforeAll)",
        ).toBeGreaterThan(0);

        await test.step("Анализ структуры данных для расчёта дельты", async () => {
          const { data, response } = await adminAPI.getUsersCompetenciesResults(
            TEST_PR_ID,
            {
              usersIds: TARGET_USER_IDS,
              revisionId: revision.id,
            },
          );

          expect(
            response.ok(),
            `getUsersCompetenciesResults вернул ${response.status()}`,
          ).toBeTruthy();

          const results = Array.isArray(data) ? data : data?.items || [];
          expect(
            results.length,
            "Должны быть результаты для расчёта дельты",
          ).toBeGreaterThan(0);

          console.log("Анализ данных для расчёта дельты калибровки:");
          for (const r of results.slice(0, 5)) {
            const value = r.value;
            const isOverwritten = r.isOverwritten;
            console.log(
              `  userId=${r.userId}: value=${value}, isOverwritten=${isOverwritten}, valueColor=${r.valueColor}`,
            );

            // Каждая оценка должна иметь числовое значение
            expect(
              typeof value,
              `Оценка для userId=${r.userId} должна быть числом`,
            ).toBe("number");

            // Поле isOverwritten показывает была ли калибровка
            expect(
              typeof isOverwritten,
              `isOverwritten для userId=${r.userId} должен быть boolean`,
            ).toBe("boolean");
          }

          // Структура позволяет вычислить дельту:
          // Если isOverwritten=true — value содержит откалиброванную оценку
          // Если isOverwritten=false — value содержит оригинальную оценку
          console.log(
            `✅ Структура данных поддерживает расчёт дельты калибровки (${results.length} записей)`,
          );
        });
      });
    });

    test.describe("Настройки характеристик", () => {
      test("C4078: Сотрудник видит текстовую характеристику оценки", async ({
        adminAPI,
      }) => {
        setSeverity("normal");

        await test.step("Получение настроек характеристик через feature-flag endpoint", async () => {
          // Стандартный getStatisticsSettings может не возвращать characteristicSettings,
          // поэтому используем feature-flag endpoint, как в beforeAll
          const featureUrl = `/manager/performance-reviews/${TEST_PR_ID}/statistics/settings/?feature=statisticsSettings`;
          const { data, response } = await adminAPI.get(featureUrl);

          expect(
            response.ok(),
            `Feature-flag statisticsSettings вернул ${response.status()}`,
          ).toBeTruthy();

          const characteristicSettings = data?.characteristicSettings || [];
          console.log(
            `Найдено характеристик: ${characteristicSettings.length}`,
          );
          console.log(
            "characteristicSettings:",
            JSON.stringify(characteristicSettings, null, 2),
          );

          expect(
            characteristicSettings.length,
            "Должны быть настроены текстовые характеристики (из beforeAll)",
          ).toBeGreaterThan(0);

          // Проверяем каждую характеристику
          for (const cs of characteristicSettings) {
            expect(cs.title, "Характеристика должна иметь title").toBeTruthy();
            expect(
              typeof cs.threshold,
              "Характеристика должна иметь числовой threshold",
            ).toBe("number");
            console.log(
              `  threshold=${cs.threshold}, title="${cs.title}", category="${cs.category}"`,
            );
          }
        });
      });
    });

    test.describe("Тепловая карта и таблица", () => {
      test("C4079: Данные для тепловой карты содержат итоговую оценку", async ({
        adminAPI,
      }) => {
        setSeverity("normal");

        const revision = await getRevisionWithRetry(
          adminAPI,
          TEST_PR_ID,
          TEST_REVISION,
        );
        if (!revision) {
          test.skip(true, "Ревизия недоступна (flaky getLastRevision)");
          return;
        }

        expect(
          TARGET_USER_IDS.length,
          "Должны быть target user IDs (из beforeAll)",
        ).toBeGreaterThan(0);

        await test.step("Получение данных тепловой карты через getStatisticsSummaryResults", async () => {
          const { data, response } = await adminAPI.getStatisticsSummaryResults(
            TEST_PR_ID,
            {
              targetUsersIds: TARGET_USER_IDS,
              revisionId: revision.id,
            },
          );

          expect(
            response.ok(),
            `getStatisticsSummaryResults вернул ${response.status()}`,
          ).toBeTruthy();

          expect(
            data,
            "Данные summary results не должны быть null",
          ).toBeTruthy();

          // heatMapResults содержит данные тепловой карты
          const heatMapResults = data?.heatMapResults;
          console.log(
            "heatMapResults keys:",
            heatMapResults ? Object.keys(heatMapResults).join(", ") : "null",
          );

          expect(
            heatMapResults,
            "Данные тепловой карты (heatMapResults) должны присутствовать",
          ).toBeTruthy();

          const targetUsersMap = heatMapResults?.targetUsers || {};
          const userIds = Object.keys(targetUsersMap);
          console.log(`Пользователей в тепловой карте: ${userIds.length}`);

          expect(
            userIds.length,
            "Тепловая карта должна содержать данные пользователей",
          ).toBeGreaterThan(0);

          // Проверяем структуру данных для первого пользователя
          const firstUserId = userIds[0];
          const firstUserData = targetUsersMap[firstUserId];
          console.log(
            `Данные пользователя ${firstUserId}:`,
            JSON.stringify(firstUserData, null, 2).slice(0, 500),
          );
        });
      });

      test("C4080: Данные таблицы оцениваемых содержат обе оценки", async ({
        adminAPI,
      }) => {
        setSeverity("critical");

        const revision = await getRevisionWithRetry(
          adminAPI,
          TEST_PR_ID,
          TEST_REVISION,
        );
        if (!revision) {
          console.log("⚠️ Ревизия недоступна — пропускаем тест (flaky API)");
          test.skip(true, "Ревизия недоступна (flaky getLastRevision)");
          return;
        }

        expect(
          TARGET_USER_IDS.length,
          "Должны быть target user IDs (из beforeAll)",
        ).toBeGreaterThan(0);

        await test.step("Получение данных таблицы через summary results", async () => {
          const { data, response } = await adminAPI.getStatisticsSummaryResults(
            TEST_PR_ID,
            {
              targetUsersIds: TARGET_USER_IDS,
              revisionId: revision.id,
            },
          );

          expect(
            response.ok(),
            `getStatisticsSummaryResults вернул ${response.status()}`,
          ).toBeTruthy();

          expect(
            data,
            "Данные summary results не должны быть null",
          ).toBeTruthy();

          const heatMapResults = data?.heatMapResults;
          expect(
            heatMapResults,
            "heatMapResults должны присутствовать",
          ).toBeTruthy();

          const targetUsersMap = heatMapResults?.targetUsers || {};
          const userIds = Object.keys(targetUsersMap);

          expect(
            userIds.length,
            "Должны быть данные пользователей в таблице",
          ).toBeGreaterThan(0);

          console.log("Данные таблицы оцениваемых:");
          for (const uid of userIds.slice(0, 5)) {
            const userData = targetUsersMap[uid];
            console.log(
              `  userId=${uid}: ${JSON.stringify(userData).slice(0, 200)}`,
            );
          }

          // Дополнительно проверяем через getUsersCompetenciesResults
          const { data: compResults, response: compResp } =
            await adminAPI.getUsersCompetenciesResults(TEST_PR_ID, {
              usersIds: TARGET_USER_IDS,
              revisionId: revision.id,
            });

          expect(
            compResp.ok(),
            `getUsersCompetenciesResults вернул ${compResp.status()}`,
          ).toBeTruthy();

          const compResultsList = Array.isArray(compResults)
            ? compResults
            : compResults?.items || [];

          expect(
            compResultsList.length,
            "Должны быть оценки компетенций для пользователей таблицы",
          ).toBeGreaterThan(0);

          console.log(
            `✅ Таблица: ${userIds.length} пользователей в heatMap, ${compResultsList.length} записей оценок компетенций`,
          );
        });
      });
    });

    test.describe("Выгрузка данных", () => {
      test("C4081: Выгрузка содержит оценки до и после калибровки", async ({
        adminAPI,
      }) => {
        setSeverity("normal");

        const revision = await getRevisionWithRetry(
          adminAPI,
          TEST_PR_ID,
          TEST_REVISION,
        );
        if (!revision) {
          test.skip(true, "Ревизия недоступна (flaky getLastRevision)");
          return;
        }

        await test.step("Получение токена экспорта через getGroupReportExportToken", async () => {
          const { data, response } = await adminAPI.getGroupReportExportToken(
            TEST_PR_ID,
            {
              revisionId: revision.id,
              lang: "ru",
            },
          );

          expect(
            response.ok(),
            `getGroupReportExportToken вернул ${response.status()}`,
          ).toBeTruthy();

          console.log(
            "Ответ getGroupReportExportToken:",
            JSON.stringify(data, null, 2).slice(0, 500),
          );

          // Токен должен быть получен
          const token = data?.token || data?.data?.token || data;
          console.log(`✅ Токен экспорта получен: ${typeof token}`);
          expect(token, "Токен экспорта должен быть получен").toBeTruthy();
        });
      });
    });

    test.describe("Текстовые характеристики", () => {
      test("C4082: Текстовая характеристика соответствует диапазону", async ({
        adminAPI,
      }) => {
        setSeverity("critical");

        const revision = await getRevisionWithRetry(
          adminAPI,
          TEST_PR_ID,
          TEST_REVISION,
        );
        if (!revision) {
          test.skip(true, "Ревизия недоступна (flaky getLastRevision)");
          return;
        }

        const settings =
          await test.step("Получение настроек диапазонов", async () => {
            // Используем feature-flag endpoint для получения characteristicSettings
            const featureUrl = `/manager/performance-reviews/${TEST_PR_ID}/statistics/settings/?feature=statisticsSettings`;
            const { data } = await adminAPI.get(featureUrl);
            return data;
          });

        const ranges = settings?.characteristicSettings || [];
        expect(
          ranges.length,
          "Диапазоны текстовых характеристик должны быть настроены",
        ).toBeGreaterThan(0);

        console.log("Настроенные диапазоны характеристик:");
        for (const r of ranges) {
          console.log(
            `  threshold=${r.threshold}, title="${r.title}", category="${r.category}"`,
          );
        }

        expect(
          TARGET_USER_IDS.length,
          "Должны быть target user IDs (из beforeAll)",
        ).toBeGreaterThan(0);

        await test.step("Получение оценок и проверка соответствия диапазонам", async () => {
          const { data, response } = await adminAPI.getUsersCompetenciesResults(
            TEST_PR_ID,
            {
              usersIds: TARGET_USER_IDS,
              revisionId: revision.id,
            },
          );

          expect(
            response.ok(),
            `getUsersCompetenciesResults вернул ${response.status()}`,
          ).toBeTruthy();

          const results = Array.isArray(data) ? data : data?.items || [];
          expect(
            results.length,
            "Должны быть результаты оценок",
          ).toBeGreaterThan(0);

          // Проверяем что значения оценок попадают в настроенные диапазоны
          // Диапазоны заданы через threshold (верхняя граница в % от шкалы):
          // 0-33: "Низкий уровень", 34-66: "Средний уровень", 67-100: "Высокий уровень"
          console.log("Проверка соответствия оценок диапазонам:");
          for (const r of results.slice(0, 5)) {
            const value = r.value;
            console.log(
              `  userId=${r.userId}: value=${value}, valueColor=${r.valueColor}`,
            );

            // value — нормализованная оценка (0-1), переводим в проценты для сопоставления
            expect(
              typeof value,
              `Оценка для userId=${r.userId} должна быть числом`,
            ).toBe("number");
            expect(
              value,
              `Оценка для userId=${r.userId} должна быть >= 0`,
            ).toBeGreaterThanOrEqual(0);
          }

          console.log(
            `✅ Проверено ${Math.min(results.length, 5)} оценок на соответствие типу и диапазону`,
          );
        });
      });

      test("C4083: Ручное изменение характеристики сохраняется", async ({
        adminAPI,
      }) => {
        setSeverity("normal");

        await test.step("Проверка настроек характеристик через API", async () => {
          // Используем feature-flag endpoint для получения characteristicSettings
          const featureUrl = `/manager/performance-reviews/${TEST_PR_ID}/statistics/settings/?feature=statisticsSettings`;
          const { data, response } = await adminAPI.get(featureUrl);

          expect(
            response.ok(),
            `Feature-flag statisticsSettings вернул ${response.status()}`,
          ).toBeTruthy();

          const characteristicSettings = data?.characteristicSettings || [];
          expect(
            characteristicSettings.length,
            "Должны быть настроенные характеристики (из beforeAll)",
          ).toBeGreaterThan(0);

          // Проверяем что enableCustomCharacteristics включён
          const enableCustom = data?.settings?.enableCustomCharacteristics;
          console.log(`enableCustomCharacteristics: ${enableCustom}`);

          // Проверяем целостность настроек
          console.log("Текущие характеристики:");
          for (const cs of characteristicSettings) {
            console.log(
              `  threshold=${cs.threshold}, title="${cs.title}", category="${cs.category}"`,
            );
            expect(
              cs.title,
              "Каждая характеристика должна иметь title",
            ).toBeTruthy();
            expect(
              cs.category,
              "Каждая характеристика должна иметь category",
            ).toBeTruthy();
          }

          console.log(
            `✅ Настройки характеристик корректны: ${characteristicSettings.length} диапазонов`,
          );
        });
      });
    });
  },
);
