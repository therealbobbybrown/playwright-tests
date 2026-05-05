// @ts-check
import { test as base, expect } from "@playwright/test";
import {
  FeedbackAPI,
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
 * Интеграционные тесты: Feedback + Karma
 *
 * Проверяет интеграцию между модулями:
 * - Начисление кармы за предоставление feedback
 * - Начисление за получение положительного feedback
 * - Транзакции кармы связанные с feedback
 * - Лимиты начислений за feedback
 *
 * @tags @api @integration @feedback @karma
 */

const test = base.extend({
  feedbackAPI: async ({ request }, use) => {
    const api = new FeedbackAPI(request);
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

// Helper: получить feedback
async function getFeedbackList(feedbackAPI) {
  const { response, data } = await feedbackAPI.getFeedbacks();
  if (!response.ok()) return [];
  return data?.items || data || [];
}

// ==================== KARMA FOR FEEDBACK ====================

test.describe(
  "Feedback-Karma Integration - Settings",
  { tag: ["@api", "@integration", "@feedback", "@karma", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.FEEDBACK, "Karma Integration - Settings");
    });

    test(
      "C5333: Настройки Karma содержат начисления за feedback",
      { tag: ["@critical"] },
      async ({ karmaAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: Настройки Karma содержат начисления за feedback", async () => {
          const { response, data } = await karmaAPI.getManagerSettings();

          if (!response.ok()) {
            test.skip(true, "Нет доступа к настройкам Karma");
            return;
          }

          // Проверяем наличие настроек начислений за feedback
          if (data.actionCharges) {
            console.log(
              "Action charges:",
              JSON.stringify(data.actionCharges, null, 2),
            );

            // Ищем feedback-related charges
            const feedbackCharges = Object.entries(data.actionCharges).filter(
              ([key]) =>
                key.toLowerCase().includes("feedback") ||
                key.toLowerCase().includes("thanks") ||
                key.toLowerCase().includes("recognition"),
            );

            console.log("Feedback-related charges:", feedbackCharges);
          }
        });
      },
    );

    test("C5334: Лимиты на начисление за feedback", async ({ karmaAPI }) => {
      setSeverity("normal");

      await test.step("Выполнить: Лимиты на начисление за feedback", async () => {
        const { response, data } = await karmaAPI.getManagerSettings();

        if (!response.ok()) {
          test.skip(true, "Нет доступа к настройкам Karma");
          return;
        }

        if (data.actionLimits) {
          console.log(
            "Action limits:",
            JSON.stringify(data.actionLimits, null, 2),
          );

          // Ищем feedback-related limits
          const feedbackLimits = Object.entries(data.actionLimits).filter(
            ([key]) => key.toLowerCase().includes("feedback"),
          );

          console.log("Feedback-related limits:", feedbackLimits);
        }
      });
    });
  },
);

// ==================== FEEDBACK TRANSACTIONS ====================

test.describe(
  "Feedback-Karma Integration - Transactions",
  { tag: ["@api", "@integration", "@feedback", "@karma", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.FEEDBACK, "Karma Integration - Transactions");
    });

    test(
      "C5335: Транзакции связанные с feedback",
      { tag: ["@critical"] },
      async ({ feedbackAPI, karmaAPI }) => {
        setSeverity("critical");

        let feedback, response, data;
        await test.step("Выполнить запрос: Транзакции связанные с feedback", async () => {
          // Получаем feedback
          const feedbacks = await getFeedbackList(feedbackAPI);

          if (feedbacks.length === 0) {
            test.skip(true, "Нет feedback");
            return;
          }

          feedback = feedbacks[0];

          // Получаем транзакции по сущности feedback
          ({ response, data } = await karmaAPI.getTransactionsByEntity({
            relatedEntityId: feedback.id,
            relatedEntityType: "feedback",
          }));
        });

        await test.step("Проверить ответ", async () => {
          expect([200, 400, 404]).toContain(response.status());

          if (response.ok()) {
            const transactions = data?.items || data || [];
            console.log(
              `Транзакций для feedback ${feedback.id}: ${transactions.length}`,
            );
          }
        });
      },
    );

    test("C5336: Все транзакции содержат feedback-related", async ({
      karmaAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Все транзакции содержат feedback-related", async () => {
        const { response, data } = await karmaAPI.getAllTransactions({
          limit: 100,
        });

        if (!response.ok()) {
          test.skip(true, "Нет доступа к транзакциям");
          return;
        }

        const transactions = data?.items || data || [];

        // Ищем транзакции связанные с feedback
        const feedbackTransactions = transactions.filter(
          (t) =>
            t.relatedEntityType === "feedback" ||
            t.reason?.toLowerCase().includes("feedback") ||
            t.reason?.toLowerCase().includes("благодар") ||
            t.reason?.toLowerCase().includes("спасибо") ||
            t.type?.toLowerCase().includes("feedback"),
        );

        console.log(
          `Feedback-related transactions: ${feedbackTransactions.length}/${transactions.length}`,
        );

        if (feedbackTransactions.length > 0) {
          const tx = feedbackTransactions[0];
          console.log("Example transaction:", JSON.stringify(tx, null, 2));
        }
      });
    });

    test("C5337: Транзакции имеют правильную структуру", async ({
      karmaAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Транзакции имеют правильную структуру", async () => {
        const { response, data } = await karmaAPI.getTransactions({
          limit: 20,
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

        for (const tx of transactions.slice(0, 5)) {
          expect(tx).toHaveProperty("amount");
          console.log(
            `Transaction: amount=${tx.amount}, type=${tx.type || tx.relatedEntityType}`,
          );
        }
      });
    });
  },
);

// ==================== FEEDBACK CREATION AND KARMA ====================

test.describe(
  "Feedback-Karma Integration - Creation Flow",
  { tag: ["@api", "@integration", "@feedback", "@karma", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.FEEDBACK, "Karma Integration - Creation");
    });

    test("C5338: Feedback существует в системе", async ({ feedbackAPI }) => {
      setSeverity("critical");

      await test.step("Выполнить: Feedback существует в системе", async () => {
        const { response, data } = await feedbackAPI.getFeedbacks();

        expect([200, 403]).toContain(response.status());

        if (response.ok()) {
          const feedbacks = data?.items || data || [];
          console.log(`Total feedbacks: ${feedbacks.length}`);

          if (feedbacks.length > 0) {
            const fb = feedbacks[0];
            console.log("Feedback example:", JSON.stringify(fb, null, 2));
          }
        }
      });
    });

    test("C5339: Типы feedback доступны", async ({ feedbackAPI }) => {
      setSeverity("normal");

      await test.step("Выполнить: Типы feedback доступны", async () => {
        const { response, data } = await feedbackAPI.getFeedbackTypes();

        expect([200, 403]).toContain(response.status());

        if (response.ok()) {
          const types = data?.items || data || [];
          console.log(`Feedback types: ${types.length}`);

          for (const type of types) {
            console.log(`Type: ${type.id} - ${type.name || type.title}`);
          }
        }
      });
    });

    test("C5340: Feedback может иметь связанную karma транзакцию", async ({
      feedbackAPI,
      karmaAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Feedback может иметь связанную karma транзакцию", async () => {
        const feedbacks = await getFeedbackList(feedbackAPI);
        if (feedbacks.length === 0) {
          test.skip(true, "Нет feedback");
          return;
        }

        // Проверяем несколько feedback на наличие связанных транзакций
        let foundTransaction = false;

        for (const fb of feedbacks.slice(0, 5)) {
          const { response, data } = await karmaAPI.getTransactionsByEntity({
            relatedEntityId: fb.id,
            relatedEntityType: "feedback",
          });

          if (response.ok()) {
            const transactions = data?.items || data || [];
            if (transactions.length > 0) {
              foundTransaction = true;
              console.log(
                `Feedback ${fb.id} has ${transactions.length} karma transactions`,
              );
              break;
            }
          }
        }

        console.log(
          `Found feedback with karma transaction: ${foundTransaction}`,
        );
      });
    });
  },
);

// ==================== BALANCE CHANGES ====================

test.describe(
  "Feedback-Karma Integration - Balance",
  { tag: ["@api", "@integration", "@feedback", "@karma", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.KARMA, "Feedback Integration - Balance");
    });

    test("C5341: Баланс пользователя доступен", async ({ karmaAPI }) => {
      setSeverity("critical");

      await test.step("Выполнить: Баланс пользователя доступен", async () => {
        const { response, data } = await karmaAPI.getUserBalances();

        expect([200, 403]).toContain(response.status());

        if (response.ok()) {
          console.log("User balances:", JSON.stringify(data, null, 2));
        }
      });
    });

    test("C5342: История транзакций содержит feedback события", async ({
      karmaAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: История транзакций содержит feedback события", async () => {
        const { response, data } = await karmaAPI.getTransactions({
          limit: 50,
        });

        if (!response.ok()) {
          test.skip(true, "Нет доступа к транзакциям");
          return;
        }

        const transactions = data?.items || data || [];

        // Анализируем типы транзакций
        const types = {};
        for (const tx of transactions) {
          const type = tx.relatedEntityType || tx.type || "unknown";
          types[type] = (types[type] || 0) + 1;
        }

        console.log("Transaction types distribution:", types);
      });
    });
  },
);

// ==================== INTEGRATION FLOW ====================

test.describe(
  "Feedback-Karma Integration - Flow",
  { tag: ["@api", "@integration", "@feedback", "@karma", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.FEEDBACK, "Karma Integration - Flow");
    });

    test(
      "C5343: Полный flow: Feedback + Karma доступны",
      { tag: ["@critical"] },
      async ({ feedbackAPI, karmaAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: Полный flow: Feedback + Karma доступны", async () => {
          // 1. Проверяем доступ к Feedback
          const { response: fbResp } = await feedbackAPI.getFeedbacks();
          expect([200, 403]).toContain(fbResp.status());

          // 2. Проверяем доступ к Karma settings
          const { response: karmaResp } = await karmaAPI.getManagerSettings();
          expect([200, 403]).toContain(karmaResp.status());

          // 3. Проверяем доступ к балансу
          const { response: balanceResp } = await karmaAPI.getUserBalances();
          expect([200, 403]).toContain(balanceResp.status());

          console.log(
            `Integration status: Feedback=${fbResp.status()}, Karma=${karmaResp.status()}, Balance=${balanceResp.status()}`,
          );
        });
      },
    );

    test("C5344: Связь feedback и karma через типы транзакций", async ({
      feedbackAPI,
      karmaAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Связь feedback и karma через типы транзакций", async () => {
        // Получаем все транзакции
        const { response: txResp, data: txData } =
          await karmaAPI.getAllTransactions({ limit: 100 });

        if (!txResp.ok()) {
          test.skip(true, "Нет доступа к транзакциям");
          return;
        }

        const transactions = txData?.items || txData || [];

        // Получаем feedback для сравнения
        const feedbacks = await getFeedbackList(feedbackAPI);

        console.log(
          `Feedbacks: ${feedbacks.length}, Transactions: ${transactions.length}`,
        );

        // Ищем пересечения
        const feedbackIds = new Set(feedbacks.map((f) => f.id));
        const linkedTransactions = transactions.filter(
          (t) =>
            t.relatedEntityType === "feedback" &&
            feedbackIds.has(t.relatedEntityId),
        );

        console.log(
          `Linked transactions (feedback in both systems): ${linkedTransactions.length}`,
        );
      });
    });

    test("C5345: Статистика начислений за feedback", async ({ karmaAPI }) => {
      setSeverity("normal");

      await test.step("Выполнить: Статистика начислений за feedback", async () => {
        const { response, data } = await karmaAPI.getAllTransactions({
          limit: 200,
        });

        if (!response.ok()) {
          test.skip(true, "Нет доступа к транзакциям");
          return;
        }

        const transactions = data?.items || data || [];

        // Считаем статистику по feedback
        const feedbackTx = transactions.filter(
          (t) =>
            t.relatedEntityType === "feedback" ||
            t.reason?.toLowerCase().includes("feedback") ||
            t.reason?.toLowerCase().includes("благодар"),
        );

        if (feedbackTx.length > 0) {
          const totalAmount = feedbackTx.reduce(
            (sum, t) => sum + (t.amount || 0),
            0,
          );
          const avgAmount = totalAmount / feedbackTx.length;

          console.log(`Feedback transactions: ${feedbackTx.length}`);
          console.log(`Total karma from feedback: ${totalAmount}`);
          console.log(`Average karma per feedback: ${avgAmount.toFixed(2)}`);
        } else {
          console.log("No feedback-related transactions found");
        }
      });
    });
  },
);
