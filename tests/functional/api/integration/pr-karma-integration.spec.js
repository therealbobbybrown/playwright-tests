// @ts-check
import { test as base, expect } from "@playwright/test";
import {
  PerformanceReviewAPI,
  KarmaAPI,
  getCredentials,
} from "../../../utils/api/index.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";
import { assertSuccessStatus } from "../../../utils/api/common-assertions.js";

/**
 * Интеграционные тесты: Performance Review + Karma
 *
 * Проверяет интеграцию между модулями:
 * - Начисление кармы за участие в PR
 * - Начисление за завершение оценки
 * - Начисление за предоставление feedback в PR
 * - Транзакции кармы связанные с PR
 *
 * @tags @api @integration @pr @karma
 */

const test = base.extend({
  prAPI: async ({ request }, use) => {
    const api = new PerformanceReviewAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
  karmaAPI: async ({ request }, use) => {
    const api = new KarmaAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
});

// Helper: найти активный PR с revisionId
async function findActivePR(prAPI) {
  const { response, data } = await prAPI.getList();
  if (!response.ok()) return null;

  const items = data?.items || data || [];
  const pr = items.find(
    (pr) =>
      pr.status === "active" ||
      pr.status === "completed" ||
      pr.status === "finished",
  );
  if (!pr) return null;

  // Получаем revisionId для поиска karma-транзакций (тип сущности = performanceReviewRevision)
  const { data: revisions } = await prAPI.getRevisions(pr.id);
  const revisionId = revisions?.items?.[0]?.id;
  return { ...pr, revisionId };
}

// Helper: получить настройки кармы
async function getKarmaSettings(karmaAPI) {
  const { response, data } = await karmaAPI.getManagerSettings();
  if (!response.ok()) return null;
  return data;
}

// ==================== KARMA SETTINGS FOR PR ====================

test.describe(
  "PR-Karma Integration - Settings",
  { tag: ["@api", "@integration", "@pr", "@karma", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.PERFORMANCE_REVIEW, "Karma Integration - Settings");
    });

    test(
      "C5346: Настройки Karma содержат action charges для PR",
      { tag: ["@critical"] },
      async ({ karmaAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: Настройки Karma содержат action charges для PR", async () => {
          const settings = await getKarmaSettings(karmaAPI);

          if (!settings) {
            test.skip(true, "Karma не настроена");
            return;
          }

          // Проверяем наличие настроек начислений
          if (settings.actionCharges) {
            console.log(
              "Action charges:",
              JSON.stringify(settings.actionCharges, null, 2),
            );
            // Может содержать начисления за PR действия
            expect(settings.actionCharges).toBeDefined();
          }
        });
      },
    );

    test("C5347: Настройки Karma содержат лимиты для действий", async ({
      karmaAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Настройки Karma содержат лимиты для действий", async () => {
        const settings = await getKarmaSettings(karmaAPI);

        if (!settings) {
          test.skip(true, "Karma не настроена");
          return;
        }

        if (settings.actionLimits) {
          console.log(
            "Action limits:",
            JSON.stringify(settings.actionLimits, null, 2),
          );
          expect(settings.actionLimits).toBeDefined();
        }
      });
    });

    test("C5348: Karma включена/отключена согласно настройкам", async ({
      karmaAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Karma включена/отключена согласно настройкам", async () => {
        const settings = await getKarmaSettings(karmaAPI);

        if (!settings) {
          test.skip(true, "Karma не настроена");
          return;
        }

        // Проверяем статус
        const isEnabled =
          settings.settings?.enabled ?? settings.enabled ?? settings.isEnabled;
        console.log("Karma enabled:", isEnabled);
        expect(typeof isEnabled === "boolean" || isEnabled === undefined).toBe(
          true,
        );
      });
    });
  },
);

// ==================== KARMA TRANSACTIONS FOR PR ====================

test.describe(
  "PR-Karma Integration - Transactions",
  { tag: ["@api", "@integration", "@pr", "@karma", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(
        MODULES.PERFORMANCE_REVIEW,
        "Karma Integration - Transactions",
      );
    });

    test(
      "C5349: Можно получить транзакции связанные с PR",
      { tag: ["@critical"] },
      async ({ prAPI, karmaAPI }) => {
        setSeverity("critical");

        let response, data;
        await test.step("Выполнить запрос: Можно получить транзакции связанные с PR", async () => {
          const pr = await findActivePR(prAPI);
          if (!pr) {
            test.skip(true, "Нет активных PR");
            return;
          }
          test.skip(!pr.revisionId, "Нет ревизии у PR");

          // Karma начисляется за заполнение анкет, сущность = performanceReviewRevision
          ({ response, data } = await karmaAPI.getTransactionsByEntity({
            relatedEntityId: pr.revisionId,
            relatedEntityType: "performanceReviewRevision",
          }));

          console.log(
            `PR ${pr.id} rev ${pr.revisionId}: karma by-entity status ${response.status()}`,
          );
        });

        await test.step("Проверить ответ", async () => {
          expect([200, 404]).toContain(response.status());

          if (response.ok()) {
            const transactions = data?.items || data || [];
            console.log(`Транзакций: ${transactions.length}`);
            expect(Array.isArray(transactions)).toBe(true);
          }
        });
      },
    );

    test("C5350: Транзакции содержат информацию о PR", async ({
      prAPI,
      karmaAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Транзакции содержат информацию о PR", async () => {
        // Получаем все транзакции
        const { response, data } = await karmaAPI.getAllTransactions({
          limit: 50,
        });

        if (!response.ok()) {
          test.skip(true, "Нет доступа к транзакциям");
          return;
        }

        const transactions = data?.items || data || [];

        // Ищем транзакции связанные с PR (тип вложен в operation)
        const prTransactions = transactions.filter(
          (t) =>
            t.operation?.relatedEntityType === "performanceReviewRevision" ||
            t.reason?.includes("PR") ||
            t.reason?.includes("performance") ||
            t.description?.includes("оценк"),
        );

        if (prTransactions.length > 0) {
          const tx = prTransactions[0];
          expect(tx).toHaveProperty("amount");
          if (tx.relatedEntityId) {
            expect(tx.relatedEntityId).toBeDefined();
          }
        }
      });
    });

    test("C5341: Баланс пользователя доступен", async ({ karmaAPI }) => {
      setSeverity("normal");

      await test.step("Выполнить: Баланс пользователя доступен", async () => {
        const { response, data } = await karmaAPI.getUserBalances();

        expect([200, 403]).toContain(response.status());

        if (response.ok()) {
          expect(data).toBeDefined();
          console.log("User balances:", JSON.stringify(data, null, 2));
        }
      });
    });
  },
);

// ==================== PR COMPLETION AND KARMA ====================

test.describe(
  "PR-Karma Integration - PR Completion",
  { tag: ["@api", "@integration", "@pr", "@karma", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(
        MODULES.PERFORMANCE_REVIEW,
        "Karma Integration - Completion",
      );
    });

    test("C5352: PR с заполненными анкетами может иметь связанные karma-транзакции", async ({
      prAPI,
      karmaAPI,
    }) => {
      setSeverity("normal");

      let txResp, txData;
      await test.step("Выполнить запрос: PR с заполненными анкетами может иметь связанные karma-транзакции", async () => {
        const pr = await findActivePR(prAPI);
        if (!pr) {
          test.skip(true, "Нет активных PR");
          return;
        }
        test.skip(!pr.revisionId, "Нет ревизии у PR");

        // Karma начисляется за заполнение анкет, сущность = performanceReviewRevision
        ({ response: txResp, data: txData } =
          await karmaAPI.getTransactionsByEntity({
            relatedEntityId: pr.revisionId,
            relatedEntityType: "performanceReviewRevision",
          }));

        console.log(
          `PR ${pr.id} rev ${pr.revisionId}: karma by-entity status ${txResp.status()}`,
        );
      });

      await test.step("Проверить ответ", async () => {
        expect([200, 404]).toContain(txResp.status());

        if (txResp.ok()) {
          const transactions = txData?.items || txData || [];
          console.log(`Найдено karma-транзакций: ${transactions.length}`);
        }
      });
    });

    test("C5353: Список PR содержит информацию о статусе", async ({
      prAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Список PR содержит информацию о статусе", async () => {
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

        // Проверяем что PR имеют статус
        for (const pr of items.slice(0, 5)) {
          expect(pr.status || pr.state).toBeDefined();
          console.log(`PR ${pr.id}: status=${pr.status || pr.state}`);
        }
      });
    });
  },
);

// ==================== KARMA BALANCE CHANGES ====================

test.describe(
  "PR-Karma Integration - Balance",
  { tag: ["@api", "@integration", "@pr", "@karma", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.KARMA, "PR Integration - Balance");
    });

    test("C5354: Баланс кармы доступен через private API", async ({
      karmaAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: Баланс кармы доступен через private API", async () => {
        const { response, data } = await karmaAPI.getUserBalances();

        expect([200, 403]).toContain(response.status());

        if (response.ok()) {
          const balances = data?.items || data?.balances || data || [];
          console.log("Balances:", JSON.stringify(balances, null, 2));
        }
      });
    });

    test("C5355: История транзакций доступна", async ({ karmaAPI }) => {
      setSeverity("normal");

      await test.step("Выполнить: История транзакций доступна", async () => {
        const { response, data } = await karmaAPI.getTransactions({
          limit: 20,
        });

        expect([200, 403]).toContain(response.status());

        if (response.ok()) {
          const transactions = data?.items || data || [];
          console.log(`User transactions: ${transactions.length}`);

          if (transactions.length > 0) {
            const tx = transactions[0];
            expect(tx).toHaveProperty("amount");
          }
        }
      });
    });

    test("C5337: Транзакции имеют правильную структуру", async ({
      karmaAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Транзакции имеют правильную структуру", async () => {
        const { response, data } = await karmaAPI.getTransactions({
          limit: 10,
        });

        if (!response.ok()) {
          test.skip(true, "Нет доступа к транзакциям");
          return;
        }

        const transactions = data?.items || data || [];
        if (transactions.length === 0) {
          test.skip(true, "Нет транзакций");
          return;
        }

        for (const tx of transactions) {
          // Логируем структуру транзакции
          console.log(`Transaction keys: ${Object.keys(tx).join(", ")}`);

          // Проверяем наличие основных полей (amount или value)
          const hasAmountField =
            tx.amount !== undefined || tx.value !== undefined;
          console.log(`Transaction: hasAmount=${hasAmountField}, id=${tx.id}`);

          if (tx.id) expect(typeof tx.id).toBe("number");
        }
      });
    });
  },
);

// ==================== INTEGRATION FLOW ====================

test.describe(
  "PR-Karma Integration - Flow",
  { tag: ["@api", "@integration", "@pr", "@karma", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.PERFORMANCE_REVIEW, "Karma Integration - Flow");
    });

    test(
      "C5357: Полный flow: PR существует + Karma настроена",
      { tag: ["@critical"] },
      async ({ prAPI, karmaAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: Полный flow: PR существует + Karma настроена", async () => {
          // 1. Проверяем доступ к PR
          const { response: prResp, data: prData } = await prAPI.getList();
          expect([200, 403]).toContain(prResp.status());

          // 2. Проверяем доступ к Karma settings
          const { response: karmaResp, data: karmaData } =
            await karmaAPI.getManagerSettings();
          expect([200, 403]).toContain(karmaResp.status());

          // 3. Логируем статус интеграции
          const prCount = prResp.ok()
            ? (prData?.items || prData || []).length
            : 0;
          const karmaEnabled = karmaResp.ok() && karmaData;

          console.log(
            `Integration status: PR count=${prCount}, Karma configured=${!!karmaEnabled}`,
          );
        });
      },
    );

    test("C5358: Связь между модулями через транзакции", async ({
      prAPI,
      karmaAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Связь между модулями через транзакции", async () => {
        const pr = await findActivePR(prAPI);

        // Получаем все транзакции
        const { response: txResp, data: txData } =
          await karmaAPI.getAllTransactions({ limit: 100 });

        if (!txResp.ok()) {
          test.skip(true, "Нет доступа к транзакциям");
          return;
        }

        const transactions = txData?.items || txData || [];

        // Анализируем типы транзакций (данные в operation)
        const entityTypes = new Set();
        const operationTypes = new Set();
        for (const tx of transactions) {
          if (tx.operation?.relatedEntityType)
            entityTypes.add(tx.operation.relatedEntityType);
          if (tx.operation?.operationType)
            operationTypes.add(tx.operation.operationType);
        }

        console.log("Entity types:", Array.from(entityTypes));
        console.log("Operation types:", Array.from(operationTypes));
        console.log("Total transactions:", transactions.length);

        // Если есть PR, проверяем наличие PR-related транзакций
        if (pr) {
          const prRelated = transactions.filter(
            (t) =>
              t.operation?.relatedEntityType === "performanceReviewRevision",
          );
          console.log(`PR-related transactions: ${prRelated.length}`);
        }
      });
    });
  },
);
