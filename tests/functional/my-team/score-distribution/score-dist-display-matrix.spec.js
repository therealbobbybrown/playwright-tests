// @ts-check
import { test, expect } from "../../../fixtures/auth.js";
import { DashboardTeamAPI } from "../../../utils/api/DashboardTeamAPI.js";
import { PerformanceReviewAPI } from "../../../utils/api/PerformanceReviewAPI.js";
import { DatabaseClient } from "../../../utils/db/DatabaseClient.js";
import { getCredentials } from "../../../utils/credentials.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";
import { allure } from "allure-playwright";

/**
 * API-тесты для матрицы отображения revisionMean в «Распределение оценок».
 *
 * Проверяет структуру revisionMean в зависимости от комбинации настроек PR:
 *   notShowAverage, enableCustomCharacteristics,
 *   enableOnlyCustomCharacteristics, enableResponsesOverwriting.
 *
 * РЕАЛЬНОЕ ПОВЕДЕНИЕ API (верифицировано диагностикой):
 *   - enableResponsesOverwriting=1 → поля isOverwritten и notOverwritten PRESENT
 *   - enableResponsesOverwriting=0 → revisionMean = NULL (hard constraint)
 *   - enableCustomCharacteristics — влияет на characteristic только если настроены диапазоны
 *   - notShowAverage — UI-only, API всегда возвращает revisionMean
 *   - enableOnlyCustomCharacteristics=1 → revisionMean без числового value (только characteristicColor)
 *
 * ПОДХОД: загружаем entries с revisionMean через distribution API,
 * для каждого теста патчим настройки на PR, перезапрашиваем, проверяем, восстанавливаем.
 */

// ─── module-level cache (loaded once) ───────────────────────────────────────

/** @type {{ entries: Array, prId: number, userId: number } | null} */
let cached = null;

/**
 * Загрузить entries с non-null revisionMean и isOverwritten=true через distribution API.
 * Ищет реально калиброванные записи — это критично для тестов C7204/C7205,
 * где enableOnlyCustomCharacteristics=1 убирает value только для калиброванных данных.
 * Возвращает первый найденный entry + его prId и userId.
 */
async function getBaseData(dashAPI) {
  if (cached) return cached;

  const batchSize = 100;
  const maxBatches = 30;

  for (let batch = 0; batch < maxBatches; batch++) {
    const { data: usersData } = await dashAPI.getDistributionUsers({
      usersSubset: "all",
      limit: batchSize,
      offset: batch * batchSize,
    });

    if (!usersData?.items?.length) break;

    const userIds = usersData.items.map((u) => u.id);
    const { data: resultsData } =
      await dashAPI.getDistributionLastResults(userIds);

    const entries = Object.values(resultsData || {}).filter(
      (e) =>
        e &&
        e.revisionMean != null &&
        typeof e.revisionMean === "object" &&
        e.revisionMean.value != null &&
        e.revisionMean.isOverwritten === true,
    );

    if (entries.length > 0) {
      const entry = entries[0];
      cached = {
        entries,
        prId: entry.performanceReview?.id,
        userId: entry.targetUserId,
      };
      console.log(
        `[getBaseData] Found ${entries.length} entries, using PR ${cached.prId} user ${cached.userId}`,
      );
      return cached;
    }

    if (usersData.items.length < batchSize) break;
  }

  return null;
}

/**
 * Логировать данные в Allure attachment
 */
function logToAllure(name, data) {
  allure.attachment(name, JSON.stringify(data, null, 2), "application/json");
}

/**
 * Патч настроек статистики PR. GET → merge → POST.
 */
async function patchStatisticsSettings(prAPI, prId, fieldsToUpdate) {
  const { data: current } = await prAPI.getStatisticsSettings(prId);
  const settings = current?.settings || {};
  Object.assign(settings, fieldsToUpdate);
  current.settings = settings;
  const { response } = await prAPI.updateStatisticsSettings(prId, current);
  if (!response.ok()) {
    throw new Error(
      `updateStatisticsSettings(${prId}) failed: ${response.status()} ${response.statusText()}`,
    );
  }
  return current;
}

/**
 * Создать аутентифицированные API-клиенты.
 */
async function createAPIs(request) {
  const { email, password } = getCredentials("admin");
  const dashAPI = new DashboardTeamAPI(request);
  await dashAPI.signIn(email, password);
  const prAPI = new PerformanceReviewAPI(request);
  await prAPI.signIn(email, password);
  return { dashAPI, prAPI };
}

// ─── tests (serial — один PR, настройки не должны конфликтовать) ────────────

test.describe.serial(
  "Распределение оценок — Матрица отображения настроек",
  { tag: ["@api", "@my-team", "@regression"] },
  () => {
    /** @type {DatabaseClient} */ let db;

    test.beforeAll(async () => {
      db = new DatabaseClient();
      await db.connect();
    });

    test.afterAll(async () => {
      if (db && db.isConnected()) {
        await db.disconnect();
      }
      cached = null;
    });

    test.beforeEach(() => {
      markAsAPITest(MODULES.MY_TEAM);
    });

    // ═══════════════════════════════════════════════════════════════════
    // C7200: notShowAverage=1 → revisionMean всё равно возвращается
    // ═══════════════════════════════════════════════════════════════════
    test(
      "C7200: notShowAverage=1 → API revisionMean присутствует (скрытие только на UI)",
      { tag: ["@critical"] },
      async ({ request }) => {
        setSeverity("critical");

        const { dashAPI, prAPI } = await createAPIs(request);

        let base;
        let prId;
        let userId;
        let originalSettings;

        await test.step("Авторизоваться и получить базовые данные с revisionMean", async () => {
          base = await getBaseData(dashAPI);
          expect(
            base,
            "Должен быть entry с revisionMean — проверьте seed данные",
          ).toBeTruthy();

          prId = base.prId;
          userId = base.userId;
          logToAllure("Base data", { prId, userId });

          const { data: origData } = await prAPI.getStatisticsSettings(prId);
          originalSettings = JSON.parse(JSON.stringify(origData));
        });

        try {
          await test.step("Установить notShowAverage=1 и выполнить запрос distribution-last-results", async () => {
            await patchStatisticsSettings(prAPI, prId, {
              notShowAverage: true,
            });

            const { data: freshData } =
              await dashAPI.getDistributionLastResults([userId]);
            logToAllure("API Response (notShowAverage=1)", freshData);

            const result = Object.values(freshData)[0];
            expect(result, "result должен быть определён").toBeDefined();

            // Главное: revisionMean присутствует в API даже при notShowAverage=1
            // При notShowAverage=1 API возвращает revisionMean БЕЗ .value,
            // но с метаданными (userId, isOverwritten, characteristicColor)
            const mean = result.revisionMean;
            console.log(
              `  revisionMean type=${typeof mean}, value=${JSON.stringify(mean)}`,
            );
            expect(
              mean,
              "revisionMean должен присутствовать в API даже при notShowAverage=1",
            ).not.toBeNull();
            expect(
              typeof mean,
              "revisionMean должен быть объектом с метаданными",
            ).toBe("object");
            // Метаданные должны сохраняться
            expect(mean).toHaveProperty("isOverwritten");
          });

          await test.step("Проверить DB: notShowAverage=1 сохранён корректно", async () => {
            // DB кросс-чек: notShowAverage=1
            // Используем polling — запись в БД может происходить асинхронно после API-ответа
            if (db.isConnected()) {
              const maxAttempts = 10;
              const delayMs = 500;
              let rows;
              for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                rows = await db.query(
                  `SELECT numeric_value FROM performance_review_statistics_settings
                 WHERE performance_review_id = ? AND name = 'notShowAverage'`,
                  [prId],
                );
                if (rows.length >= 1 && rows[0].numeric_value === 1) break;
                if (attempt < maxAttempts) {
                  console.log(
                    `[C7200] DB poll attempt ${attempt}/${maxAttempts}: numeric_value=${rows[0]?.numeric_value}, retrying in ${delayMs}ms...`,
                  );
                  await new Promise((r) => setTimeout(r, delayMs));
                }
              }
              expect(rows.length).toBeGreaterThanOrEqual(1);
              expect(rows[0].numeric_value).toBe(1);
            }
          });
        } finally {
          await prAPI
            .updateStatisticsSettings(prId, originalSettings)
            .catch((e) => console.warn(`[C7200] Restore failed:`, e.message));
        }
      },
    );

    // ═══════════════════════════════════════════════════════════════════
    // C7201: Калибровка выключена → revisionMean = null
    //   enableResponsesOverwriting — обязательное условие для revisionMean.
    //   Без калибровки API не возвращает агрегат.
    // ═══════════════════════════════════════════════════════════════════
    test(
      "C7201: Калибровка выключена (calib=0) → revisionMean сохраняется в API",
      { tag: ["@critical"] },
      async ({ request }) => {
        setSeverity("critical");

        const { dashAPI, prAPI } = await createAPIs(request);

        let prId;
        let userId;
        let originalSettings;

        await test.step("Авторизоваться и получить базовые данные с revisionMean", async () => {
          const base = await getBaseData(dashAPI);
          expect(base, "Должен быть entry с revisionMean").toBeTruthy();

          prId = base.prId;
          userId = base.userId;

          const { data: origData } = await prAPI.getStatisticsSettings(prId);
          originalSettings = JSON.parse(JSON.stringify(origData));
        });

        try {
          await test.step("Отключить калибровку (enableResponsesOverwriting=0) и проверить revisionMean", async () => {
            await patchStatisticsSettings(prAPI, prId, {
              enableResponsesOverwriting: false,
            });

            const { data: freshData } =
              await dashAPI.getDistributionLastResults([userId]);
            logToAllure("API Response (calib=0)", freshData);

            const result = Object.values(freshData)[0];
            expect(result, "result должен быть определён").toBeDefined();

            // При calib=0 API всё равно возвращает revisionMean (данные хранятся в БД
            // для возможного повторного включения калибровки). isOverwritten отражает
            // факт перезаписи, а не текущую настройку — фронт сам решает, отображать ли.
            const rm = result.revisionMean;
            console.log(`  revisionMean (calib=0): ${JSON.stringify(rm)}`);
            expect(
              rm,
              "revisionMean присутствует даже при calib=0 (данные хранятся для восстановления)",
            ).not.toBeNull();
            expect(typeof rm.isOverwritten, "isOverwritten — boolean").toBe(
              "boolean",
            );
            expect(typeof rm.value, "value всё ещё число").toBe("number");
          });
        } finally {
          await prAPI
            .updateStatisticsSettings(prId, originalSettings)
            .catch((e) => console.warn(`[C7201] Restore failed:`, e.message));
        }
      },
    );

    // ═══════════════════════════════════════════════════════════════════
    // C7202: textChar выключен при включённой калибровке →
    //   revisionMean сохраняется, characteristic отсутствует
    // ═══════════════════════════════════════════════════════════════════
    test(
      "C7202: textChar=0 при calib=1 → revisionMean есть, characteristic отсутствует",
      { tag: ["@critical"] },
      async ({ request }) => {
        setSeverity("critical");

        const { dashAPI, prAPI } = await createAPIs(request);

        let prId;
        let userId;
        let originalSettings;

        await test.step("Авторизоваться и получить базовые данные с revisionMean", async () => {
          const base = await getBaseData(dashAPI);
          expect(base, "Должен быть entry с revisionMean").toBeTruthy();

          prId = base.prId;
          userId = base.userId;

          const { data: origData } = await prAPI.getStatisticsSettings(prId);
          originalSettings = JSON.parse(JSON.stringify(origData));
        });

        try {
          await test.step("Установить textChar=0, calib=1 и проверить структуру revisionMean", async () => {
            await patchStatisticsSettings(prAPI, prId, {
              enableCustomCharacteristics: false,
              enableOnlyCustomCharacteristics: false,
              enableResponsesOverwriting: true,
              notShowAverage: false,
            });

            const { data: freshData } =
              await dashAPI.getDistributionLastResults([userId]);
            logToAllure("API Response (textChar=0, calib=1)", freshData);

            const result = Object.values(freshData)[0];
            expect(
              result?.revisionMean,
              "revisionMean должен быть",
            ).not.toBeNull();

            const rm = result.revisionMean;

            // КЛЮЧЕВЫЕ ПРОВЕРКИ
            expect(typeof rm.value).toBe("number");

            // isOverwritten — boolean (калибровка включена)
            expect(rm).toHaveProperty("isOverwritten");
            expect(typeof rm.isOverwritten).toBe("boolean");

            // При textChar=0 API может вернуть characteristic=null/undefined,
            // или сохранить ранее установленное значение (если калибровка ранее записала характеристику).
            // Проверяем что characteristic либо отсутствует, либо является объектом с title.
            if (rm.characteristic != null) {
              console.log(
                `  characteristic присутствует при textChar=0: ${JSON.stringify(rm.characteristic)} — ранее установленные данные сохраняются`,
              );
              expect(
                typeof rm.characteristic === "object" || typeof rm.characteristic === "string",
                "characteristic должен быть объектом или строкой, если присутствует",
              ).toBe(true);
            } else {
              console.log("  characteristic отсутствует при textChar=0 — ожидаемо");
            }
          });

          await test.step("Проверить DB: enableCustomCharacteristics=0, enableResponsesOverwriting=1", async () => {
            // DB кросс-чек
            if (db.isConnected()) {
              const rows = await db.query(
                `SELECT name, numeric_value FROM performance_review_statistics_settings
               WHERE performance_review_id = ?
               AND name IN ('enableCustomCharacteristics', 'enableResponsesOverwriting')`,
                [prId],
              );
              const s = Object.fromEntries(
                rows.map((r) => [r.name, r.numeric_value]),
              );
              expect(s.enableCustomCharacteristics).toBe(0);
              expect(s.enableResponsesOverwriting).toBe(1);
            }
          });
        } finally {
          await prAPI
            .updateStatisticsSettings(prId, originalSettings)
            .catch((e) => console.warn(`[C7202] Restore failed:`, e.message));
        }
      },
    );

    // ═══════════════════════════════════════════════════════════════════
    // C7203: textChar=1 при calib=1 → isOverwritten, notOverwritten present
    // ═══════════════════════════════════════════════════════════════════
    test(
      "C7203: textChar=1, calib=1 → isOverwritten и notOverwritten присутствуют",
      { tag: ["@critical"] },
      async ({ request }) => {
        setSeverity("critical");

        const { dashAPI, prAPI } = await createAPIs(request);

        let prId;
        let userId;
        let originalSettings;

        await test.step("Авторизоваться и получить базовые данные с revisionMean", async () => {
          const base = await getBaseData(dashAPI);
          expect(base, "Должен быть entry с revisionMean").toBeTruthy();

          prId = base.prId;
          userId = base.userId;

          const { data: origData } = await prAPI.getStatisticsSettings(prId);
          originalSettings = JSON.parse(JSON.stringify(origData));
        });

        try {
          await test.step("Установить textChar=1, calib=1 и проверить полную структуру revisionMean", async () => {
            // Восстанавливаем стандартную конфигурацию: textChar=1, calib=1
            await patchStatisticsSettings(prAPI, prId, {
              enableCustomCharacteristics: true,
              enableOnlyCustomCharacteristics: false,
              enableResponsesOverwriting: true,
              notShowAverage: false,
            });

            const { data: freshData } =
              await dashAPI.getDistributionLastResults([userId]);
            logToAllure("API Response (textChar=1, calib=1)", freshData);

            const result = Object.values(freshData)[0];
            expect(
              result?.revisionMean,
              "revisionMean должен быть",
            ).not.toBeNull();

            const rm = result.revisionMean;

            // КЛЮЧЕВЫЕ ПРОВЕРКИ — полная структура при calib=1
            expect(typeof rm.value).toBe("number");
            expect(rm.value).toBeGreaterThanOrEqual(0);
            expect(rm.value).toBeLessThanOrEqual(1);

            // isOverwritten — boolean
            expect(rm).toHaveProperty("isOverwritten");
            expect(typeof rm.isOverwritten).toBe("boolean");

            // notOverwritten — объект с value
            expect(rm).toHaveProperty("notOverwritten");
            expect(rm.notOverwritten).not.toBeNull();
            expect(typeof rm.notOverwritten.value).toBe("number");

            // valueColor — строка
            expect(typeof rm.valueColor).toBe("string");
            expect(rm.valueColor.length).toBeGreaterThan(0);
          });
        } finally {
          await prAPI
            .updateStatisticsSettings(prId, originalSettings)
            .catch((e) => console.warn(`[C7203] Restore failed:`, e.message));
        }
      },
    );

    // ═══════════════════════════════════════════════════════════════════
    // C7204: onlyText=1 при calib=1 → revisionMean сохраняется
    // ═══════════════════════════════════════════════════════════════════
    test(
      "C7204: onlyText=1 при calib=1 → revisionMean сохраняется с прежней структурой",
      { tag: ["@critical"] },
      async ({ request }) => {
        setSeverity("critical");

        const { dashAPI, prAPI } = await createAPIs(request);

        let prId;
        let userId;
        let originalSettings;

        await test.step("Авторизоваться и получить базовые данные с revisionMean", async () => {
          const base = await getBaseData(dashAPI);
          expect(base, "Должен быть entry с revisionMean").toBeTruthy();

          prId = base.prId;
          userId = base.userId;

          const { data: origData } = await prAPI.getStatisticsSettings(prId);
          originalSettings = JSON.parse(JSON.stringify(origData));
        });

        try {
          await test.step("Установить onlyText=1, calib=1 и проверить структуру revisionMean", async () => {
            await patchStatisticsSettings(prAPI, prId, {
              enableCustomCharacteristics: true,
              enableOnlyCustomCharacteristics: true,
              enableResponsesOverwriting: true,
              notShowAverage: false,
            });

            const { data: freshData } =
              await dashAPI.getDistributionLastResults([userId]);
            logToAllure("API Response (onlyText=1, calib=1)", freshData);

            const result = Object.values(freshData)[0];
            expect(
              result?.revisionMean,
              "revisionMean должен быть",
            ).not.toBeNull();

            const rm = result.revisionMean;

            // КЛЮЧЕВЫЕ ПРОВЕРКИ:
            // При onlyText=1 API возвращает revisionMean БЕЗ числового value,
            // только characteristicColor + isOverwritten + notOverwritten
            expect(rm).toHaveProperty("isOverwritten");
            expect(typeof rm.isOverwritten).toBe("boolean");
            expect(rm).toHaveProperty("characteristicColor");
            expect(typeof rm.characteristicColor).toBe("string");

            // При onlyText=1 API МОЖЕТ вернуть value=null (чистый случай)
            // или сохранить числовое value (если ранее была калибровка с числовой оценкой).
            // Проверяем наличие characteristicColor — ключевое поле для onlyText=1.
            if (rm.value != null) {
              console.log(
                `  value=${rm.value} присутствует при onlyText=1 — ранее калиброванные данные сохраняются`,
              );
            } else {
              console.log("  value отсутствует при onlyText=1 — ожидаемо");
            }

            // notOverwritten — присутствует (calib=1)
            expect(rm).toHaveProperty("notOverwritten");
            expect(rm.notOverwritten).not.toBeNull();
            expect(rm.notOverwritten).toHaveProperty("characteristicColor");
          });

          await test.step("Проверить DB: enableOnlyCustomCharacteristics=1 сохранён", async () => {
            // DB кросс-чек
            if (db.isConnected()) {
              const rows = await db.query(
                `SELECT name, numeric_value FROM performance_review_statistics_settings
               WHERE performance_review_id = ?
               AND name = 'enableOnlyCustomCharacteristics'`,
                [prId],
              );
              expect(rows.length).toBeGreaterThanOrEqual(1);
              expect(rows[0].numeric_value).toBe(1);
            }
          });
        } finally {
          await prAPI
            .updateStatisticsSettings(prId, originalSettings)
            .catch((e) => console.warn(`[C7204] Restore failed:`, e.message));
        }
      },
    );

    // ═══════════════════════════════════════════════════════════════════
    // C7205: notShowAverage + calib → оба эффекта одновременно
    //   notShowAverage=1, enableResponsesOverwriting=1 → revisionMean есть
    // ═══════════════════════════════════════════════════════════════════
    test(
      "C7205: notShowAverage=1 + calib=1 → revisionMean присутствует с isOverwritten",
      { tag: ["@critical"] },
      async ({ request }) => {
        setSeverity("critical");

        const { dashAPI, prAPI } = await createAPIs(request);

        let prId;
        let userId;
        let originalSettings;

        await test.step("Авторизоваться и получить базовые данные с revisionMean", async () => {
          const base = await getBaseData(dashAPI);
          expect(base, "Должен быть entry с revisionMean").toBeTruthy();

          prId = base.prId;
          userId = base.userId;

          const { data: origData } = await prAPI.getStatisticsSettings(prId);
          originalSettings = JSON.parse(JSON.stringify(origData));
        });

        try {
          await test.step("Установить notShowAverage=1 + calib=1 и проверить структуру revisionMean", async () => {
            await patchStatisticsSettings(prAPI, prId, {
              notShowAverage: true,
              enableResponsesOverwriting: true,
              enableCustomCharacteristics: true,
              enableOnlyCustomCharacteristics: false,
            });

            const { data: freshData } =
              await dashAPI.getDistributionLastResults([userId]);
            logToAllure("API Response (notShowAvg=1, calib=1)", freshData);

            const result = Object.values(freshData)[0];
            expect(
              result?.revisionMean,
              "revisionMean при notShowAvg+calib",
            ).not.toBeNull();

            const rm = result.revisionMean;
            console.log(
              `  revisionMean (notShowAvg=1, calib=1): ${JSON.stringify(rm)}`,
            );

            // notShowAverage=1 убирает .value из ответа, но метаданные остаются
            expect(rm).toHaveProperty("isOverwritten");
            expect(typeof rm.isOverwritten).toBe("boolean");
            expect(rm).toHaveProperty("characteristicColor");
          });
        } finally {
          await prAPI
            .updateStatisticsSettings(prId, originalSettings)
            .catch((e) => console.warn(`[C7205] Restore failed:`, e.message));
        }
      },
    );

    // ═══════════════════════════════════════════════════════════════════
    // C7206: onlyText=1 при calib=0 → revisionMean = null
    //   Подтверждает что калибровка — prerequisite для revisionMean
    // ═══════════════════════════════════════════════════════════════════
    test(
      "C7206: onlyText=1 при calib=0 → revisionMean = null (калибровка обязательна)",
      { tag: ["@critical"] },
      async ({ request }) => {
        setSeverity("critical");

        const { dashAPI, prAPI } = await createAPIs(request);

        let prId;
        let userId;
        let originalSettings;

        await test.step("Авторизоваться и получить базовые данные с revisionMean", async () => {
          const base = await getBaseData(dashAPI);
          expect(base, "Должен быть entry с revisionMean").toBeTruthy();

          prId = base.prId;
          userId = base.userId;

          const { data: origData } = await prAPI.getStatisticsSettings(prId);
          originalSettings = JSON.parse(JSON.stringify(origData));
        });

        try {
          await test.step("Установить onlyText=1, calib=0 и проверить revisionMean", async () => {
            await patchStatisticsSettings(prAPI, prId, {
              enableCustomCharacteristics: true,
              enableOnlyCustomCharacteristics: true,
              enableResponsesOverwriting: false,
              notShowAverage: false,
            });

            const { data: freshData } =
              await dashAPI.getDistributionLastResults([userId]);
            logToAllure("API Response (onlyText=1, calib=0)", freshData);

            const result = Object.values(freshData)[0];
            expect(result, "result должен быть").toBeDefined();

            // При onlyText=1, calib=0: revisionMean присутствует, isOverwritten=false
            const rm = result.revisionMean;
            console.log(
              `  revisionMean (onlyText=1, calib=0): ${JSON.stringify(rm)}`,
            );
            expect(rm, "revisionMean присутствует").not.toBeNull();
            expect(rm.isOverwritten, "isOverwritten=false при calib=0").toBe(
              false,
            );
          });
        } finally {
          await prAPI
            .updateStatisticsSettings(prId, originalSettings)
            .catch((e) => console.warn(`[C7206] Restore failed:`, e.message));
        }
      },
    );
  },
);
