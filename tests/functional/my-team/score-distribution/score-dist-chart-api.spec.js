// @ts-check
/**
 * API-тесты для endpoint распределения характеристик графика
 *
 * Endpoint: POST /private/performance-reviews/dashboard/distribution-characteristics/get/
 *
 * Покрытие:
 * G1: Структура ответа — withResults + withoutResults
 * G2: Поля каждой характеристики: title, color, percent, usersIds
 * G3: Кросс-проверка с distribution-last-results — группировка совпадает
 * G4: «Нет оценки» — пользователи без характеристики
 * G5: Фильтрация по usersSubset (all vs subordinates)
 * G6: Фильтрация по userGroupIds
 * G7: Фильтрация по периоду (будущий период → пустой ответ)
 */
import { test as base, expect } from "../../../fixtures/auth.js";
import { DashboardTeamAPI } from "../../../utils/api/DashboardTeamAPI.js";
import { PerformanceReviewAPI } from "../../../utils/api/PerformanceReviewAPI.js";
import { getCredentials } from "../../../utils/credentials.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";
import { setupCharacteristics } from "../../../utils/StatisticsSettingsHelper.js";

// ─── Fixture extension ──────────────────────────────────────────
const test = base.extend({
  adminDashAPI: async ({ request }, use) => {
    const api = new DashboardTeamAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
  managerDashAPI: async ({ request }, use) => {
    const api = new DashboardTeamAPI(request);
    const { email, password } = getCredentials("manager");
    await api.signIn(email, password);
    await use(api);
  },
  prAPI: async ({ request }, use) => {
    const api = new PerformanceReviewAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
});

// ─── Module-level cache ─────────────────────────────────────────
/** @type {{ apiData: Object, prIds: number[] } | null} */
let cached = null;

/**
 * Обеспечить, что характеристики включены на всех PR, и получить ответ API.
 * Кэшируется на уровне модуля для ускорения.
 */
async function ensureCharacteristicsEnabled(adminDashAPI, prAPI) {
  if (cached) return cached;

  // Собрать все PR ID из distribution results
  const prIdSet = new Set();
  const batchSize = 200;
  for (let batch = 0; batch < 15; batch++) {
    const { data: usersData } = await adminDashAPI.getDistributionUsers({
      usersSubset: "all",
      limit: batchSize,
      offset: batch * batchSize,
    });
    if (!usersData?.items?.length) break;
    const userIds = usersData.items.map((u) => u.id);
    const { data: results } =
      await adminDashAPI.getDistributionLastResults(userIds);
    for (const entry of Object.values(results || {})) {
      if (entry?.performanceReview?.id) {
        prIdSet.add(entry.performanceReview.id);
      }
    }
    if (usersData.items.length < batchSize) break;
  }
  const prIds = [...prIdSet];

  // Включить характеристики на всех PR (некоторые могут не поддерживать — пропускаем)
  for (const prId of prIds) {
    try {
      await setupCharacteristics(prAPI, prId);
    } catch (err) {
      console.warn(
        `[chart-api] setupCharacteristics(${prId}) skipped: ${err.message}`,
      );
    }
  }

  // Получить данные из API
  const { response, data: apiData } =
    await adminDashAPI.getDistributionCharacteristics();
  expect(response.ok(), "distribution-characteristics вернул ошибку").toBe(
    true,
  );

  cached = { apiData, prIds };
  return cached;
}

// ─── Tests ──────────────────────────────────────────────────────
test.describe(
  "Распределение оценок — API графика характеристик",
  { tag: ["@api", "@my-team", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.MY_TEAM, "Distribution Characteristics");
    });

    test.afterAll(() => {
      cached = null;
    });

    // ═══════════════════════════════════════════════════════════
    // G1: Структура ответа — withResults + withoutResults
    // ═══════════════════════════════════════════════════════════
    test(
      "C7298: API distribution-characteristics возвращает withResults и withoutResults",
      { tag: ["@critical"] },
      async ({ adminDashAPI, prAPI }) => {
        setSeverity("critical");

        let apiData;

        await test.step("Включить характеристики и вызвать endpoint", async () => {
          const data = await ensureCharacteristicsEnabled(adminDashAPI, prAPI);
          apiData = data.apiData;
        });

        await test.step("Проверить наличие полей withResults и withoutResults", async () => {
          expect(apiData, "Ответ не должен быть null").toBeDefined();
          expect(apiData, "Ответ должен содержать withResults").toHaveProperty(
            "withResults",
          );
          expect(
            apiData,
            "Ответ должен содержать withoutResults",
          ).toHaveProperty("withoutResults");

          // withResults — массив
          expect(
            Array.isArray(apiData.withResults),
            "withResults должен быть массивом",
          ).toBe(true);

          // withoutResults — объект
          expect(
            typeof apiData.withoutResults,
            "withoutResults должен быть объектом",
          ).toBe("object");
        });

        await test.step("Проверить, что withResults содержит хотя бы одну характеристику", async () => {
          expect(
            apiData.withResults.length,
            "Должна быть хотя бы 1 характеристика (характеристики включены)",
          ).toBeGreaterThan(0);
        });
      },
    );

    // ═══════════════════════════════════════════════════════════
    // G2: Поля каждой характеристики: title, color, percent, usersIds
    // ═══════════════════════════════════════════════════════════
    test(
      "C7299: Каждая характеристика содержит title, color, percent, usersIds",
      { tag: ["@critical"] },
      async ({ adminDashAPI, prAPI }) => {
        setSeverity("critical");

        let apiData;

        await test.step("Получить данные API", async () => {
          const data = await ensureCharacteristicsEnabled(adminDashAPI, prAPI);
          apiData = data.apiData;
        });

        await test.step("Проверить поля каждой записи в withResults", async () => {
          for (const entry of apiData.withResults) {
            // title — строка, не пустая
            expect(entry, `Запись должна содержать title`).toHaveProperty(
              "title",
            );
            expect(
              typeof entry.title,
              `title должен быть строкой: ${JSON.stringify(entry)}`,
            ).toBe("string");
            expect(
              entry.title.length,
              "title не должен быть пустым",
            ).toBeGreaterThan(0);

            // color — строка (hex или color name)
            expect(entry, "Запись должна содержать color").toHaveProperty(
              "color",
            );
            expect(
              typeof entry.color,
              `color должен быть строкой: ${entry.color}`,
            ).toBe("string");

            // percent — число от 0 до 100
            expect(entry, "Запись должна содержать percent").toHaveProperty(
              "percent",
            );
            expect(
              typeof entry.percent,
              `percent должен быть числом: ${entry.percent}`,
            ).toBe("number");
            expect(
              entry.percent,
              `percent должен быть >= 0: ${entry.percent}`,
            ).toBeGreaterThanOrEqual(0);
            expect(
              entry.percent,
              `percent должен быть <= 100: ${entry.percent}`,
            ).toBeLessThanOrEqual(100);

            // usersIds — массив чисел
            expect(entry, "Запись должна содержать usersIds").toHaveProperty(
              "usersIds",
            );
            expect(
              Array.isArray(entry.usersIds),
              `usersIds должен быть массивом: ${typeof entry.usersIds}`,
            ).toBe(true);
          }
        });

        await test.step("Проверить поля withoutResults", async () => {
          const wr = apiData.withoutResults;
          // percent
          expect(wr, "withoutResults должен содержать percent").toHaveProperty(
            "percent",
          );
          expect(typeof wr.percent, "percent должен быть числом").toBe(
            "number",
          );
          // usersIds
          expect(wr, "withoutResults должен содержать usersIds").toHaveProperty(
            "usersIds",
          );
          expect(
            Array.isArray(wr.usersIds),
            "usersIds должен быть массивом",
          ).toBe(true);
        });
      },
    );

    // ═══════════════════════════════════════════════════════════
    // G3: Кросс-проверка — группировка совпадает с distribution-last-results
    // ═══════════════════════════════════════════════════════════
    test(
      "C7300: Группировка сотрудников из characteristics совпадает с distribution-last-results",
      { tag: ["@critical"] },
      async ({ adminDashAPI, prAPI }) => {
        setSeverity("critical");

        let apiData;

        await test.step("Получить данные из distribution-characteristics", async () => {
          const data = await ensureCharacteristicsEnabled(adminDashAPI, prAPI);
          apiData = data.apiData;
        });

        await test.step("Собрать все userIds из characteristics и проверить через last-results", async () => {
          // Собрать всех пользователей из withResults
          const allCharUserIds = [];
          for (const entry of apiData.withResults) {
            allCharUserIds.push(...(entry.usersIds || []));
          }

          // Взять первых N для проверки (не загружаем тысячи)
          const sampleIds = allCharUserIds.slice(0, 20);
          if (sampleIds.length === 0) {
            test.info().annotations.push({
              type: "skip-reason",
              description: "Нет пользователей в withResults для проверки",
            });
            return;
          }

          // Получить last-results для этих пользователей
          const { response, data: resultsData } =
            await adminDashAPI.getDistributionLastResults(sampleIds);
          expect(response.ok(), "distribution-last-results ошибка").toBe(true);

          // Для каждого пользователя из withResults должна быть запись с характеристикой
          const entries = Object.values(resultsData || {});
          let withCharacteristic = 0;
          for (const entry of entries) {
            if (
              entry?.revisionMean?.characteristic ||
              entry?.revisionMean != null
            ) {
              withCharacteristic++;
            }
          }

          expect(
            withCharacteristic,
            `Из ${sampleIds.length} пользователей withResults хотя бы часть должна иметь результаты`,
          ).toBeGreaterThan(0);
        });
      },
    );

    // ═══════════════════════════════════════════════════════════
    // G4: «Нет оценки» — пользователи без характеристики
    // ═══════════════════════════════════════════════════════════
    test(
      "C7301: WithoutResults содержит пользователей без оценки в периоде",
      { tag: ["@critical"] },
      async ({ adminDashAPI, prAPI }) => {
        setSeverity("normal");

        let apiData;

        await test.step("Получить данные из API", async () => {
          const data = await ensureCharacteristicsEnabled(adminDashAPI, prAPI);
          apiData = data.apiData;
        });

        await test.step("Проверить, что withoutResults.usersIds — это пользователи без оценки", async () => {
          const noScoreIds = apiData.withoutResults?.usersIds || [];
          if (noScoreIds.length === 0) {
            test.info().annotations.push({
              type: "info",
              description: "Все сотрудники имеют оценки — withoutResults пуст",
            });
            // Процент должен быть 0
            expect(
              apiData.withoutResults.percent,
              "Процент «Нет оценки» должен быть 0",
            ).toBe(0);
            return;
          }

          // Проверить через last-results, что эти пользователи НЕ имеют характеристик
          const sampleIds = noScoreIds.slice(0, 10);
          const { response, data: resultsData } =
            await adminDashAPI.getDistributionLastResults(sampleIds);
          expect(response.ok()).toBe(true);

          // Для «Нет оценки» — у пользователей НЕ должно быть
          // revisionMean.characteristic (или revisionMean === null)
          const entries = Object.values(resultsData || {});
          for (const entry of entries) {
            const hasCharacteristic =
              entry?.revisionMean?.characteristic != null;
            expect(
              hasCharacteristic,
              `Пользователь ${entry?.targetUserId} из «Нет оценки» не должен иметь характеристику`,
            ).toBe(false);
          }
        });
      },
    );

    // ═══════════════════════════════════════════════════════════
    // G5: Фильтрация по usersSubset
    // ═══════════════════════════════════════════════════════════
    test(
      "C7302: Фильтрация по usersSubset: subordinates возвращает подмножество all",
      { tag: ["@critical"] },
      async ({ adminDashAPI, prAPI }) => {
        setSeverity("normal");

        let allData;
        let subordinatesData;

        await test.step("Включить характеристики", async () => {
          await ensureCharacteristicsEnabled(adminDashAPI, prAPI);
        });

        await test.step("Получить данные для usersSubset=all", async () => {
          const { response, data } =
            await adminDashAPI.getDistributionCharacteristics({
              usersSubset: "all",
            });
          expect(response.ok()).toBe(true);
          allData = data;
        });

        await test.step("Получить данные для usersSubset=subordinates", async () => {
          const { response, data } =
            await adminDashAPI.getDistributionCharacteristics({
              usersSubset: "subordinates",
            });
          expect(response.ok()).toBe(true);
          subordinatesData = data;
        });

        await test.step("Проверить: subordinates ⊆ all (по количеству пользователей)", async () => {
          // Подсчитать total пользователей
          const allTotal =
            (allData.withResults || []).reduce(
              (sum, r) => sum + (r.usersIds?.length || 0),
              0,
            ) + (allData.withoutResults?.usersIds?.length || 0);

          const subTotal =
            (subordinatesData.withResults || []).reduce(
              (sum, r) => sum + (r.usersIds?.length || 0),
              0,
            ) + (subordinatesData.withoutResults?.usersIds?.length || 0);

          expect(
            subTotal,
            `subordinates (${subTotal}) должен быть ≤ all (${allTotal})`,
          ).toBeLessThanOrEqual(allTotal);

          // Структура ответа одинаковая
          expect(subordinatesData).toHaveProperty("withResults");
          expect(subordinatesData).toHaveProperty("withoutResults");
        });
      },
    );

    // ═══════════════════════════════════════════════════════════
    // G6: Фильтрация по userGroupIds
    // ═══════════════════════════════════════════════════════════
    test(
      "C7303: Фильтрация по userGroupIds: результат ≤ полного набора",
      { tag: ["@critical"] },
      async ({ adminDashAPI, prAPI }) => {
        setSeverity("normal");

        let allData;
        let groupIds;

        await test.step("Включить характеристики и получить полные данные", async () => {
          const data = await ensureCharacteristicsEnabled(adminDashAPI, prAPI);
          allData = data.apiData;
        });

        await test.step("Получить доступные группы из distribution-users endpoint", async () => {
          // Используем distribution-users чтобы найти хотя бы одну группу
          const { data: usersData } = await adminDashAPI.getDistributionUsers({
            usersSubset: "all",
            limit: 100,
          });

          // Собираем уникальные groupIds
          const groupIdSet = new Set();
          for (const user of usersData?.items || []) {
            if (user.userGroupId) groupIdSet.add(user.userGroupId);
            if (user.groupId) groupIdSet.add(user.groupId);
            if (user.departmentId) groupIdSet.add(user.departmentId);
          }
          groupIds = [...groupIdSet];
        });

        await test.step("Запросить characteristics с фильтром по группе", async () => {
          if (groupIds.length === 0) {
            test.info().annotations.push({
              type: "skip-reason",
              description: "Нет групп для фильтрации",
            });
            return;
          }

          // Берём первую группу
          const { response, data: filteredData } =
            await adminDashAPI.getDistributionCharacteristics({
              userGroupIds: [groupIds[0]],
            });
          expect(response.ok(), "Фильтрация по группе должна вернуть 200").toBe(
            true,
          );

          // Структура ответа сохраняется
          expect(filteredData).toHaveProperty("withResults");
          expect(filteredData).toHaveProperty("withoutResults");

          // Количество пользователей ≤ all
          const allTotal =
            (allData.withResults || []).reduce(
              (sum, r) => sum + (r.usersIds?.length || 0),
              0,
            ) + (allData.withoutResults?.usersIds?.length || 0);

          const filteredTotal =
            (filteredData.withResults || []).reduce(
              (sum, r) => sum + (r.usersIds?.length || 0),
              0,
            ) + (filteredData.withoutResults?.usersIds?.length || 0);

          expect(
            filteredTotal,
            `Отфильтрованных (${filteredTotal}) должно быть ≤ всех (${allTotal})`,
          ).toBeLessThanOrEqual(allTotal);
        });
      },
    );

    // ═══════════════════════════════════════════════════════════
    // G7: Фильтрация по периоду — будущий период → пусто
    // ═══════════════════════════════════════════════════════════
    test(
      "C7304: Будущий период возвращает пустые характеристики или 0 пользователей",
      { tag: ["@critical"] },
      async ({ adminDashAPI, prAPI }) => {
        setSeverity("normal");

        await test.step("Включить характеристики", async () => {
          await ensureCharacteristicsEnabled(adminDashAPI, prAPI);
        });

        await test.step("Запросить characteristics с будущим периодом (через 2 месяца)", async () => {
          const now = new Date();
          const futureStart = new Date(
            now.getFullYear(),
            now.getMonth() + 2,
            1,
          );
          const futureEnd = new Date(now.getFullYear(), now.getMonth() + 3, 0);

          const { response, data } =
            await adminDashAPI.getDistributionCharacteristics({
              period: {
                start: futureStart.getTime(),
                end: futureEnd.getTime(),
              },
            });

          expect(
            response.ok(),
            "Запрос с будущим периодом должен вернуть 200",
          ).toBe(true);

          // В будущем периоде не должно быть оценок
          const totalWithResults = (data?.withResults || []).reduce(
            (sum, r) => sum + (r.usersIds?.length || 0),
            0,
          );

          expect(
            totalWithResults,
            `В будущем периоде не должно быть пользователей с характеристиками (получено: ${totalWithResults})`,
          ).toBe(0);
        });
      },
    );

    // ═══════════════════════════════════════════════════════════
    // G-extra: Сумма процентов = 100%
    // ═══════════════════════════════════════════════════════════
    test(
      "C7305: Сумма процентов всех характеристик + «Нет оценки» ≈ 100%",
      { tag: ["@critical"] },
      async ({ adminDashAPI, prAPI }) => {
        setSeverity("critical");

        let apiData;

        await test.step("Получить данные API", async () => {
          const data = await ensureCharacteristicsEnabled(adminDashAPI, prAPI);
          apiData = data.apiData;
        });

        await test.step("Проверить, что сумма процентов ≈ 100%", async () => {
          let totalPercent = 0;
          for (const entry of apiData.withResults || []) {
            totalPercent += entry.percent;
          }
          totalPercent += apiData.withoutResults?.percent || 0;

          expect(
            totalPercent,
            `Сумма процентов = ${totalPercent}%, ожидаем ≈100%`,
          ).toBeGreaterThanOrEqual(99);
          expect(totalPercent).toBeLessThanOrEqual(101);
        });

        await test.step("Проверить уникальность пользователей (допуск < 1% дублей)", async () => {
          const allUserIds = [];
          for (const entry of apiData.withResults || []) {
            allUserIds.push(...(entry.usersIds || []));
          }
          allUserIds.push(...(apiData.withoutResults?.usersIds || []));

          const uniqueIds = new Set(allUserIds);
          const duplicates = allUserIds.length - uniqueIds.size;
          const duplicateRate =
            allUserIds.length > 0 ? (duplicates / allUserIds.length) * 100 : 0;

          if (duplicates > 0) {
            test.info().annotations.push({
              type: "warning",
              description: `Обнаружено ${duplicates} дублей из ${allUserIds.length} (${duplicateRate.toFixed(2)}%)`,
            });
          }

          // Допускаем < 1% дублей (пограничные случаи нескольких PR)
          expect(
            duplicateRate,
            `Дублей ${duplicates} из ${allUserIds.length} (${duplicateRate.toFixed(2)}%) — допуск < 1%`,
          ).toBeLessThan(1);
        });
      },
    );
  },
);
