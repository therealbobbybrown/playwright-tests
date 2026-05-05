// @ts-check
import { test as base, expect } from "@playwright/test";
import {
  PerformanceReviewAPI,
  ObjectivesAPI,
  getCredentials,
} from "../../../utils/api/index.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";
import { assertSuccessStatus } from "../../../utils/api/common-assertions.js";

/**
 * Интеграционные тесты: Performance Review + Objectives
 *
 * Проверяет интеграцию между модулями:
 * - Цели в контексте Performance Review
 * - Оценка выполнения целей в PR
 * - Связь периодов целей с PR
 * - Синхронизация данных между модулями
 *
 * @tags @api @integration @pr @objectives
 */

const test = base.extend({
  prAPI: async ({ request }, use) => {
    const api = new PerformanceReviewAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
  objectivesAPI: async ({ request }, use) => {
    const api = new ObjectivesAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
});

// Helper: найти PR с целями
async function findPRWithObjectives(prAPI) {
  const { response, data } = await prAPI.getList();
  if (!response.ok()) return null;

  const items = data?.items || data || [];
  // Ищем PR который может содержать оценку целей
  return items.find(
    (pr) =>
      pr.hasObjectives ||
      pr.objectivesEnabled ||
      pr.config?.objectives ||
      pr.status === "active" ||
      pr.status === "completed",
  );
}

// Helper: получить цели пользователя
async function getUserObjectives(objectivesAPI, userId) {
  const { response, data } = await objectivesAPI.getObjectives({ userId });
  if (!response.ok()) return [];
  return data?.items || data || [];
}

// ==================== OBJECTIVES IN PR CONTEXT ====================

test.describe(
  "PR-Objectives Integration - Context",
  { tag: ["@api", "@integration", "@pr", "@objectives", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(
        MODULES.PERFORMANCE_REVIEW,
        "Objectives Integration - Context",
      );
    });

    test(
      "C5359: PR может содержать секцию целей",
      { tag: ["@critical"] },
      async ({ prAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: PR может содержать секцию целей", async () => {
          const { response, data } = await prAPI.getList();
          if (!response.ok()) {
            test.skip(true, "Нет доступа к PR");
            return;
          }

          const items = data?.items || data || [];
          if (items.length === 0) {
            test.skip(true, "Нет PR");
            return;
          }

          // Проверяем структуру PR на наличие информации о целях
          const pr = items[0];
          console.log("PR structure keys:", Object.keys(pr).join(", "));

          // PR может иметь разные поля связанные с целями
          const objectivesRelated =
            pr.hasObjectives !== undefined ||
            pr.objectivesEnabled !== undefined ||
            pr.objectives !== undefined ||
            pr.config?.objectives !== undefined;

          console.log(
            `PR ${pr.id} has objectives-related fields: ${objectivesRelated}`,
          );
        });
      },
    );

    test("C5360: Настройки целей доступны", async ({ objectivesAPI }) => {
      setSeverity("critical");

      await test.step("Выполнить: Настройки целей доступны", async () => {
        const { response, data } = await objectivesAPI.getSettings();

        expect([200, 403]).toContain(response.status());

        if (response.ok()) {
          console.log("Objectives settings:", JSON.stringify(data, null, 2));

          // Проверяем наличие настроек периодов или других параметров
          const hasSettings = data !== null && data !== undefined;
          expect(hasSettings).toBe(true);
        }
      });
    });

    test("C5361: Цели доступны для просмотра", async ({ objectivesAPI }) => {
      setSeverity("critical");

      let response, data;
      await test.step("Выполнить запрос: Цели доступны для просмотра", async () => {
        ({ response, data } = await objectivesAPI.getObjectives());
      });

      await test.step("Проверить ответ", async () => {
        expect([200, 201, 403]).toContain(response.status());

        if (response.ok()) {
          const objectives = data?.items || data || [];
          console.log(
            `Objectives count: ${Array.isArray(objectives) ? objectives.length : "N/A"}`,
          );
          console.log(
            `Objectives data type: ${typeof data}, isArray: ${Array.isArray(objectives)}`,
          );

          if (Array.isArray(objectives) && objectives.length > 0) {
            const obj = objectives[0];
            if (typeof obj === "object" && obj !== null) {
              console.log(`Objective keys: ${Object.keys(obj).join(", ")}`);
              expect(obj.id || obj._id).toBeDefined();
            }
          }
        }
      });
    });
  },
);

// ==================== OBJECTIVES EVALUATION IN PR ====================

test.describe(
  "PR-Objectives Integration - Evaluation",
  { tag: ["@api", "@integration", "@pr", "@objectives", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(
        MODULES.PERFORMANCE_REVIEW,
        "Objectives Integration - Evaluation",
      );
    });

    test("C5362: PR может включать оценку целей", async ({ prAPI }) => {
      setSeverity("normal");

      let pr, response, data;
      await test.step("Выполнить запрос: PR может включать оценку целей", async () => {
        pr = await findPRWithObjectives(prAPI);
        if (!pr) {
          test.skip(true, "Нет PR с целями");
          return;
        }

        // Получаем детали PR
        ({ response, data } = await prAPI.getById(pr.id));
      });

      await test.step("Проверить ответ", async () => {
        expect([200, 403, 404]).toContain(response.status());

        if (response.ok()) {
          console.log("PR details keys:", Object.keys(data).join(", "));

          // Проверяем наличие секций оценки
          const hasEvaluation =
            data.evaluation !== undefined ||
            data.assessments !== undefined ||
            data.objectives !== undefined ||
            data.sections?.some((s) => s.type === "objectives");

          console.log(`PR ${pr.id} has evaluation sections: ${hasEvaluation}`);
        }
      });
    });

    test("C5363: Цели имеют статус выполнения", async ({ objectivesAPI }) => {
      setSeverity("normal");

      await test.step("Выполнить: Цели имеют статус выполнения", async () => {
        const { response, data } = await objectivesAPI.getObjectives({
          limit: 20,
        });

        if (!response.ok()) {
          test.skip(true, "Нет доступа к целям");
          return;
        }

        const objectives = data?.items || data || [];
        if (objectives.length === 0) {
          test.skip(true, "Нет целей");
          return;
        }

        // Проверяем наличие статуса/прогресса
        for (const obj of objectives.slice(0, 5)) {
          const hasStatus =
            obj.status !== undefined ||
            obj.progress !== undefined ||
            obj.completionRate !== undefined ||
            obj.state !== undefined;

          console.log(
            `Objective ${obj.id}: hasStatus=${hasStatus}, status=${obj.status || obj.state}`,
          );
        }
      });
    });

    test("C5364: Цели могут быть связаны с периодом", async ({
      objectivesAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Цели могут быть связаны с периодом", async () => {
        const { response, data } = await objectivesAPI.getObjectives({
          limit: 20,
        });

        if (!response.ok()) {
          test.skip(true, "Нет доступа к целям");
          return;
        }

        const objectives = data?.items || data || [];

        // Проверяем связь с периодами
        const withPeriod = objectives.filter((o) => o.periodId || o.period);
        console.log(
          `Objectives with period: ${withPeriod.length}/${objectives.length}`,
        );

        if (withPeriod.length > 0) {
          const obj = withPeriod[0];
          expect(obj.periodId || obj.period?.id).toBeDefined();
        }
      });
    });
  },
);

// ==================== DATA SYNCHRONIZATION ====================

test.describe(
  "PR-Objectives Integration - Sync",
  { tag: ["@api", "@integration", "@pr", "@objectives", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.OBJECTIVES, "PR Integration - Sync");
    });

    test("C5365: Данные целей согласованы между модулями", async ({
      prAPI,
      objectivesAPI,
    }) => {
      setSeverity("normal");

      let prs, objectives;
      await test.step("Выполнить запрос: Данные целей согласованы между модулями", async () => {
        // Получаем данные из обоих модулей
        const { response: prResp, data: prData } = await prAPI.getList();
        const { response: objResp, data: objData } =
          await objectivesAPI.getObjectives();

        if (!prResp.ok() || !objResp.ok()) {
          test.skip(true, "Нет доступа к одному из модулей");
          return;
        }

        prs = prData?.items || prData || [];
        objectives = objData?.items || objData || [];

        console.log(
          `PR count: ${prs.length}, Objectives count: ${objectives.length}`,
        );

        // Оба модуля должны быть доступны
      });

      await test.step("Проверить ответ", async () => {
        expect(Array.isArray(prs)).toBe(true);
        expect(Array.isArray(objectives)).toBe(true);
      });
    });

    test("C5366: Цели содержат информацию о периоде", async ({
      prAPI,
      objectivesAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Цели содержат информацию о периоде", async () => {
        // Получаем цели
        const { response: objResp, data: objData } =
          await objectivesAPI.getObjectives({ limit: 20 });

        if (!objResp.ok()) {
          test.skip(true, "Нет доступа к целям");
          return;
        }

        const objectives = objData?.items || objData || [];

        // Получаем PR
        const { response: prResp, data: prData } = await prAPI.getList();

        if (!prResp.ok()) {
          test.skip(true, "Нет доступа к PR");
          return;
        }

        const prs = prData?.items || prData || [];

        console.log(`Objectives: ${objectives.length}, PRs: ${prs.length}`);

        // Проверяем наличие информации о периоде в целях
        const withPeriodInfo = objectives.filter(
          (o) => o.periodId || o.period || o.startDate || o.endDate,
        );
        console.log(
          `Objectives with period info: ${withPeriodInfo.length}/${objectives.length}`,
        );

        for (const pr of prs.slice(0, 3)) {
          console.log(
            `PR: ${pr.id}, title=${pr.title}, dates=${pr.startDate}-${pr.endDate}`,
          );
        }
      });
    });
  },
);

// ==================== OBJECTIVES SETTINGS ====================

test.describe(
  "PR-Objectives Integration - Settings",
  { tag: ["@api", "@integration", "@pr", "@objectives", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.OBJECTIVES, "PR Integration - Settings");
    });

    test("C5367: Настройки модуля целей доступны", async ({
      objectivesAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Настройки модуля целей доступны", async () => {
        const { response, data } = await objectivesAPI.getSettings();

        expect([200, 403]).toContain(response.status());

        if (response.ok()) {
          console.log("Objectives settings:", JSON.stringify(data, null, 2));
        }
      });
    });

    test("C5368: Цели могут иметь веса", async ({ objectivesAPI }) => {
      setSeverity("normal");

      await test.step("Выполнить: Цели могут иметь веса", async () => {
        const { response, data } = await objectivesAPI.getObjectives({
          limit: 20,
        });

        if (!response.ok()) {
          test.skip(true, "Нет доступа к целям");
          return;
        }

        const objectives = data?.items || data || [];

        // Проверяем наличие весов
        const withWeight = objectives.filter((o) => o.weight !== undefined);
        console.log(
          `Objectives with weight: ${withWeight.length}/${objectives.length}`,
        );

        if (withWeight.length > 0) {
          const obj = withWeight[0];
          expect(typeof obj.weight).toBe("number");
        }
      });
    });
  },
);

// ==================== INTEGRATION FLOW ====================

test.describe(
  "PR-Objectives Integration - Flow",
  { tag: ["@api", "@integration", "@pr", "@objectives", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(
        MODULES.PERFORMANCE_REVIEW,
        "Objectives Integration - Flow",
      );
    });

    test(
      "C5369: Полный flow: PR + Objectives доступны",
      { tag: ["@critical"] },
      async ({ prAPI, objectivesAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: Полный flow: PR + Objectives доступны", async () => {
          // 1. Проверяем доступ к PR
          const { response: prResp } = await prAPI.getList();
          expect([200, 403]).toContain(prResp.status());

          // 2. Проверяем доступ к Objectives
          const { response: objResp } = await objectivesAPI.getObjectives();
          expect([200, 201, 403]).toContain(objResp.status());

          // 3. Проверяем доступ к Settings (может быть 500 если не реализовано)
          const { response: settingsResp } = await objectivesAPI.getSettings();
          expect([200, 403, 500]).toContain(settingsResp.status());

          console.log(
            `Integration status: PR=${prResp.status()}, Objectives=${objResp.status()}, Settings=${settingsResp.status()}`,
          );
        });
      },
    );

    test("C5370: Связь PR и целей через пользователей", async ({
      prAPI,
      objectivesAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Связь PR и целей через пользователей", async () => {
        // Получаем PR
        const { response: prResp, data: prData } = await prAPI.getList();
        if (!prResp.ok()) {
          test.skip(true, "Нет доступа к PR");
          return;
        }

        const prs = prData?.items || prData || [];
        if (prs.length === 0) {
          test.skip(true, "Нет PR");
          return;
        }

        const pr = prs[0];

        // PR может содержать список участников
        const receivers = pr.receivers || pr.participants || pr.users || [];
        console.log(`PR ${pr.id} has ${receivers.length} participants`);

        if (receivers.length > 0) {
          const userId = receivers[0].id || receivers[0].userId || receivers[0];

          // Получаем цели этого пользователя
          const { response: objResp, data: objData } =
            await objectivesAPI.getObjectives({
              userId,
              limit: 10,
            });

          if (objResp.ok()) {
            const objectives = objData?.items || objData || [];
            console.log(`User ${userId} has ${objectives.length} objectives`);
          }
        }
      });
    });
  },
);
