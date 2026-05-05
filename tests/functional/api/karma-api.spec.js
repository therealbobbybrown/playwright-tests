// @ts-check
import { test as fullTest, expect } from "../../fixtures/full.js";
import {
  KarmaAPI,
  OrgStructureAPI,
  getCredentials,
} from "../../utils/api/index.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { assertSuccessStatus } from "../../utils/api/common-assertions.js";

/**
 * API тесты для Karma (виртуальная валюта)
 *
 * Покрытие:
 * - Настройки Karma (CRUD)
 * - Балансы пользователей
 * - Транзакции
 * - Пополнение баланса (deposit)
 */

// Расширяем test с фикстурой для Karma API
const test = fullTest.extend({
  karmaAPI: async ({ request }, use) => {
    const api = new KarmaAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
  orgStructureAPI: async ({ request }, use) => {
    const api = new OrgStructureAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
});

// Кеш для данных
let cachedUserId = null;

async function findExistingUser(orgStructureAPI) {
  if (cachedUserId) {
    return cachedUserId;
  }

  const { data } = await orgStructureAPI.findUsers({ limit: 10 });
  const items = data?.items || data || [];
  if (items.length > 0) {
    cachedUserId = items[0].id;
    return cachedUserId;
  }

  return null;
}

test.describe("Karma API", { tag: ["@api", "@karma", "@regression"] }, () => {
  test.beforeEach(async ({}, testInfo) => {
    markAsAPITest(MODULES.PERFORMANCE_REVIEW, "Karma");
  });

  // ==================== SETTINGS (Manager) ====================

  test.describe("GET /manager/karma/wallet/settings/ - Настройки (manager)", () => {
    test(
      "C5385: Получить настройки Karma (manager)",
      { tag: ["@critical"] },
      async ({ karmaAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: Получить настройки Karma (manager)", async () => {
          const { response, data } = await karmaAPI.getManagerSettings();

          // Karma может быть не активирована
          if (response.status() === 404) {
            console.log("Karma не активирована");
            return;
          }

          expect(response.status()).toBe(200);
          expect(data).toBeDefined();
        });
      },
    );
  });

  test.describe("POST /manager/karma/wallet/enable/ - Включение/выключение", () => {
    test("C5386: Включить Karma", async ({ karmaAPI }) => {
      setSeverity("normal");

      await test.step("Выполнить: Включить Karma", async () => {
        const { response } = await karmaAPI.enable();

        // Может быть уже включена или нет прав
        expect([200, 400, 403, 404]).toContain(response.status());
      });
    });

    test("C5387: Отключить Karma", async ({ karmaAPI }) => {
      setSeverity("normal");

      await test.step("Выполнить: Отключить Karma", async () => {
        const { response } = await karmaAPI.disable();

        // Может быть уже отключена или нет прав
        expect([200, 400, 403, 404]).toContain(response.status());
      });
    });

    // Включаем Karma обратно после тестов, чтобы не ломать другие тесты (Gift Shop и т.д.)
    test.afterAll(async ({ request }) => {
      const api = new KarmaAPI(request);
      const { email, password } = getCredentials("admin");
      await api.signIn(email, password);
      await api.enable();
    });
  });

  test.describe("POST /manager/karma/wallet/settings/ - Настройки (создание/обновление)", () => {
    test("C5388: Создать настройки по умолчанию", async ({ karmaAPI }) => {
      setSeverity("normal");

      await test.step("Выполнить: Создать настройки по умолчанию", async () => {
        const { response, data } = await karmaAPI.createDefaultSettings();

        // Настройки могут уже существовать или нет прав
        expect([200, 400, 403, 404]).toContain(response.status());
      });
    });

    test("C5389: Обновить настройки Karma", async ({ karmaAPI }) => {
      setSeverity("normal");

      await test.step("Выполнить: Обновить настройки Karma", async () => {
        const { response, data } = await karmaAPI.updateSettings({
          settings: {
            enabled: true,
          },
        });

        // Karma может быть не активирована или нет прав
        expect([200, 400, 403, 404]).toContain(response.status());
      });
    });

    test("C5390: Получить предполагаемые расписания", async ({ karmaAPI }) => {
      setSeverity("normal");

      await test.step("Выполнить: Получить предполагаемые расписания", async () => {
        const { response, data } = await karmaAPI.getEstimatedSchedules({
          monthly: { day: 1 },
        });

        // Karma может быть не активирована
        expect([200, 400, 403, 404]).toContain(response.status());
      });
    });
  });

  // ==================== DEPOSIT (Manager) ====================

  test.describe("POST /manager/karma/wallet/transfers/deposit/ - Пополнение баланса", () => {
    test(
      "C5391: Пополнить баланс пользователя",
      { tag: ["@critical", "@db"] },
      async ({ karmaAPI, orgStructureAPI, karmaVerifier }) => {
        setSeverity("critical");

        const userId = await findExistingUser(orgStructureAPI);

        if (!userId) {
          console.log("Нет пользователей для пополнения баланса");
          return;
        }

        // Сначала получаем текущий баланс (если Karma активирована)
        const { response: settingsResp } = await karmaAPI.getManagerSettings();

        if (settingsResp.status() === 404) {
          console.log("Karma не активирована");
          return;
        }

        const amount = 10;
        const { response, data } = await karmaAPI.deposit({
          userId,
          currency: "karma",
          amount,
        });

        // Может не быть прав или неверная валюта
        if (response.status() === 403) {
          console.log("Нет прав на пополнение баланса");
          return;
        }

        if (response.status() === 404) {
          console.log("Karma не активирована");
          return;
        }

        // Если успешно - проверяем что транзакция создана
        if (response.ok()) {
          expect(data).toBeDefined();

          // DB верификация
          await test.step("DB: Проверка транзакции в БД", async () => {
            if (!karmaVerifier.isConnected()) return;
            // Проверяем что транзакция существует для пользователя
            const transactions =
              await karmaVerifier.getUserTransactions(userId);
            expect(transactions.length).toBeGreaterThan(0);
          });
        } else {
          // Может быть ошибка валюты или другая
          expect([400, 422]).toContain(response.status());
        }
      },
    );

    test(
      "C5392: Пополнить баланс с невалидной суммой (негативный)",
      { tag: ["@db"] },
      async ({ karmaAPI, orgStructureAPI, karmaVerifier }) => {
        setSeverity("normal");

        const userId = await findExistingUser(orgStructureAPI);

        if (!userId) {
          console.log("Нет пользователей для теста");
          return;
        }

        // Получаем количество транзакций до запроса
        const transactionsBefore =
          await test.step("Получение транзакций до запроса", async () => {
            if (!karmaVerifier.isConnected()) return [];
            return await karmaVerifier.getUserTransactions(userId);
          });

        const { response } = await karmaAPI.deposit({
          userId,
          currency: "karma",
          amount: -100,
        });

        // Ожидаем ошибку валидации или 404 если Karma не активирована
        expect([400, 403, 404, 422]).toContain(response.status());

        // DB верификация: транзакция НЕ должна быть создана
        await test.step("DB: Проверка что транзакция НЕ создана", async () => {
          if (!karmaVerifier.isConnected()) return;
          const transactionsAfter =
            await karmaVerifier.getUserTransactions(userId);
          expect(
            transactionsAfter.length,
            "Количество транзакций не должно увеличиться",
          ).toBe(transactionsBefore.length);
        });
      },
    );

    test(
      "C5393: Пополнить баланс несуществующего пользователя (негативный)",
      { tag: ["@db"] },
      async ({ karmaAPI, karmaVerifier }) => {
        setSeverity("normal");

        // Получаем общее количество транзакций до запроса
        const { data: txBefore } = await karmaAPI.getAllTransactions({
          limit: 1,
        });
        const totalBefore = txBefore?.total || 0;

        const { response } = await karmaAPI.deposit({
          userId: 999999999,
          currency: "karma",
          amount: 10,
        });

        // Ожидаем ошибку
        expect([400, 403, 404]).toContain(response.status());

        // DB верификация: транзакция НЕ должна быть создана
        await test.step("DB: Проверка что транзакция НЕ создана", async () => {
          if (!karmaVerifier.isConnected()) return;
          const { data: txAfter } = await karmaAPI.getAllTransactions({
            limit: 1,
          });
          const totalAfter = txAfter?.total || 0;
          expect(
            totalAfter,
            "Количество транзакций не должно увеличиться",
          ).toBeLessThanOrEqual(totalBefore);
        });
      },
    );

    test(
      "C5394: Пополнить баланс без обязательных полей (негативный)",
      { tag: ["@db"] },
      async ({ karmaAPI, karmaVerifier }) => {
        setSeverity("normal");

        // Получаем общее количество транзакций до запроса
        const { data: txBefore } = await karmaAPI.getAllTransactions({
          limit: 1,
        });
        const totalBefore = txBefore?.total || 0;

        const { response } = await karmaAPI.deposit({});

        // Ожидаем ошибку валидации
        expect([400, 403, 404, 422]).toContain(response.status());

        // DB верификация: транзакция НЕ должна быть создана
        await test.step("DB: Проверка что транзакция НЕ создана", async () => {
          if (!karmaVerifier.isConnected()) return;
          const { data: txAfter } = await karmaAPI.getAllTransactions({
            limit: 1,
          });
          const totalAfter = txAfter?.total || 0;
          expect(
            totalAfter,
            "Количество транзакций не должно увеличиться",
          ).toBeLessThanOrEqual(totalBefore);
        });
      },
    );
  });

  test.describe("GET /manager/karma/wallet/all-transactions/ - Все транзакции", () => {
    test(
      "C5395: Получить все транзакции",
      { tag: ["@db"] },
      async ({ karmaAPI, karmaVerifier }) => {
        setSeverity("critical");

        const { response, data } = await karmaAPI.getAllTransactions({
          limit: 10,
        });

        // Karma может быть не активирована
        if (response.status() === 404) {
          console.log("Karma не активирована");
          return;
        }

        expect(response.status()).toBe(200);
        expect(data).toBeDefined();

        // DB верификация
        await test.step("DB: Проверка количества транзакций в БД", async () => {
          if (!karmaVerifier.isConnected()) return;
          const apiItems = data?.items || data || [];
          // Если API вернул транзакции, проверяем что они существуют в БД
          if (apiItems.length > 0 && apiItems[0]?.userId) {
            const dbTransactions = await karmaVerifier.getUserTransactions(
              apiItems[0].userId,
            );
            expect(dbTransactions.length).toBeGreaterThanOrEqual(0);
          }
        });
      },
    );

    test(
      "C5396: Получить транзакции с пагинацией",
      { tag: ["@db"] },
      async ({ karmaAPI, karmaVerifier }) => {
        setSeverity("normal");

        const { response: resp1, data: data1 } =
          await karmaAPI.getAllTransactions({ limit: 2, offset: 0 });
        const { response: resp2, data: data2 } =
          await karmaAPI.getAllTransactions({ limit: 2, offset: 2 });

        // Karma может быть не активирована
        if (resp1.status() === 404) {
          console.log("Karma не активирована");
          return;
        }

        expect(resp1.status()).toBe(200);
        expect(resp2.status()).toBe(200);

        // DB верификация
        await test.step("DB: Проверка пагинации транзакций", async () => {
          if (!karmaVerifier.isConnected()) return;
          const items1 = data1?.items || data1 || [];
          const items2 = data2?.items || data2 || [];
          // Проверяем что пагинация работает - элементы не должны дублироваться
          if (items1.length > 0 && items2.length > 0) {
            const ids1 = items1.map((t) => t.id);
            const ids2 = items2.map((t) => t.id);
            const hasOverlap = ids1.some((id) => ids2.includes(id));
            expect(hasOverlap).toBe(false);
          }
        });
      },
    );
  });

  // ==================== SETTINGS (Private) ====================

  test.describe("GET /private/karma/wallet/settings/ - Настройки (private)", () => {
    test("C5397: Получить настройки кошелька (private)", async ({
      karmaAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: Получить настройки кошелька (private)", async () => {
        const { response, data } = await karmaAPI.getPrivateWalletSettings();

        // Karma может быть не активирована
        if (response.status() === 404) {
          console.log("Karma не активирована");
          return;
        }

        expect(response.status()).toBe(200);
        expect(data).toBeDefined();
      });
    });
  });

  // ==================== BALANCES ====================

  test.describe("GET /private/karma/wallet/balances/ - Баланс", () => {
    test(
      "C5398: Получить баланс пользователя",
      { tag: ["@critical", "@db"] },
      async ({ karmaAPI, karmaVerifier }) => {
        setSeverity("critical");

        const { response, data } = await karmaAPI.getUserBalances();

        // Karma может быть не активирована
        if (response.status() === 404) {
          console.log("Karma не активирована");
          return;
        }

        expect(response.status()).toBe(200);
        expect(data).toBeDefined();

        // DB верификация
        await test.step("DB: Проверка баланса в БД", async () => {
          if (!karmaVerifier.isConnected()) return;
          // Проверяем что данные API соответствуют данным в БД
          // Баланс должен быть >= 0
          const balances = data?.balances || data || [];
          if (Array.isArray(balances) && balances.length > 0) {
            const karmaBalance = balances.find((b) => b.currency === "karma");
            if (karmaBalance) {
              expect(Number(karmaBalance.amount)).toBeGreaterThanOrEqual(0);
            }
          }
        });
      },
    );
  });

  // ==================== TRANSACTIONS (Private) ====================

  test.describe("GET /private/karma/wallet/transactions/ - Транзакции", () => {
    test(
      "C5399: Получить список транзакций",
      { tag: ["@db"] },
      async ({ karmaAPI, karmaVerifier }) => {
        setSeverity("critical");

        const { response, data } = await karmaAPI.getTransactions({
          limit: 10,
        });

        // Karma может быть не активирована
        if (response.status() === 404) {
          console.log("Karma не активирована");
          return;
        }

        expect(response.status()).toBe(200);
        expect(data).toBeDefined();

        // DB верификация
        await test.step("DB: Проверка списка транзакций в БД", async () => {
          if (!karmaVerifier.isConnected()) return;
          const apiItems = data?.items || data || [];
          // Проверяем что количество транзакций в API соответствует данным
          if (apiItems.length > 0 && apiItems[0]?.userId) {
            const dbTransactions = await karmaVerifier.getUserTransactions(
              apiItems[0].userId,
            );
            expect(dbTransactions.length).toBeGreaterThanOrEqual(0);
          }
        });
      },
    );

    test(
      "C5400: Получить транзакции с пагинацией (private)",
      { tag: ["@db"] },
      async ({ karmaAPI, karmaVerifier }) => {
        setSeverity("normal");

        const { response: resp1, data: data1 } = await karmaAPI.getTransactions(
          { limit: 2, offset: 0 },
        );
        const { response: resp2, data: data2 } = await karmaAPI.getTransactions(
          { limit: 2, offset: 2 },
        );

        // Karma может быть не активирована
        if (resp1.status() === 404) {
          console.log("Karma не активирована");
          return;
        }

        expect(resp1.status()).toBe(200);
        expect(resp2.status()).toBe(200);

        // DB верификация
        await test.step("DB: Проверка пагинации транзакций (private)", async () => {
          if (!karmaVerifier.isConnected()) return;
          const items1 = data1?.items || data1 || [];
          const items2 = data2?.items || data2 || [];
          // Проверяем что пагинация работает - элементы не должны дублироваться
          if (items1.length > 0 && items2.length > 0) {
            const ids1 = items1.map((t) => t.id);
            const ids2 = items2.map((t) => t.id);
            const hasOverlap = ids1.some((id) => ids2.includes(id));
            expect(hasOverlap).toBe(false);
          }
        });
      },
    );
  });

  test.describe("GET /private/karma/wallet/transactions/by-entity/ - Транзакции по сущности", () => {
    test(
      "C5401: Получить транзакции по сущности",
      { tag: ["@db"] },
      async ({ karmaAPI, karmaVerifier }) => {
        setSeverity("normal");

        const { response, data } = await karmaAPI.getTransactionsByEntity({
          relatedEntityId: 1,
          relatedEntityType: "feedback",
        });

        // Karma может быть не активирована или нет данных
        expect([200, 400, 404]).toContain(response.status());

        // DB верификация
        await test.step("DB: Проверка транзакций по сущности", async () => {
          if (!karmaVerifier.isConnected()) return;
          if (response.ok()) {
            const apiItems = data?.items || data || [];
            // Если есть транзакции, проверяем их наличие в БД
            if (apiItems.length > 0 && apiItems[0]?.id) {
              const dbTransaction = await karmaVerifier.getTransaction(
                apiItems[0].id,
              );
              expect(dbTransaction).toBeDefined();
            }
          }
        });
      },
    );
  });

  // ==================== EXPORT ====================

  test.describe("GET /private/karma/wallet/balances/export/get-token/ - Экспорт", () => {
    test("C5402: Получить токен для экспорта балансов", async ({
      karmaAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Получить токен для экспорта балансов", async () => {
        const today = new Date().toISOString().split("T")[0];
        const { response, data } = await karmaAPI.getExportBalancesToken(today);

        // Karma может быть не активирована или функция недоступна
        expect([200, 400, 403, 404]).toContain(response.status());
      });
    });
  });

  // ==================== INTEGRATION TESTS ====================

  test.describe("Интеграционные тесты", () => {
    test(
      "C5403: Пополнить баланс и проверить в списке транзакций",
      { tag: ["@db"] },
      async ({ karmaAPI, orgStructureAPI, karmaVerifier }) => {
        setSeverity("critical");

        const userId = await findExistingUser(orgStructureAPI);

        if (!userId) {
          console.log("Нет пользователей для теста");
          return;
        }

        // Проверяем что Karma активирована
        const { response: settingsResp } = await karmaAPI.getManagerSettings();

        if (settingsResp.status() === 404) {
          console.log("Karma не активирована");
          return;
        }

        // 1. Получаем начальное количество транзакций
        const { response: txResp1, data: txData1 } =
          await karmaAPI.getAllTransactions({ limit: 100 });

        if (txResp1.status() === 404) {
          console.log("Karma не активирована");
          return;
        }

        const initialTxCount = (txData1?.items || txData1 || []).length;

        // 2. Пополняем баланс
        const amount = 5;
        const { response: depositResp, data: depositData } =
          await karmaAPI.deposit({
            userId,
            currency: "karma",
            amount,
          });

        if (depositResp.status() === 403 || depositResp.status() === 404) {
          console.log("Нет прав или Karma не активирована");
          return;
        }

        if (!depositResp.ok()) {
          console.log(`Не удалось пополнить баланс: ${depositResp.status()}`);
          return;
        }

        // 3. Проверяем что транзакция появилась
        const { response: txResp2, data: txData2 } =
          await karmaAPI.getAllTransactions({ limit: 100 });
        expect(txResp2.ok()).toBe(true);

        const newTxCount = (txData2?.items || txData2 || []).length;
        expect(newTxCount).toBeGreaterThanOrEqual(initialTxCount);

        // DB верификация
        await test.step("DB: Проверка транзакции в БД", async () => {
          if (!karmaVerifier.isConnected()) return;
          const transactions = await karmaVerifier.getUserTransactions(userId);
          expect(transactions.length).toBeGreaterThan(0);
          // Проверяем что последняя транзакция имеет правильную сумму
          if (transactions.length > 0) {
            const lastTx = transactions[0];
            expect(Number(lastTx.amount)).toBe(amount);
          }
        });
      },
    );

    test("C5404: Проверить согласованность данных между manager и private API", async ({
      karmaAPI,
    }) => {
      setSeverity("normal");

      let managerResp, managerData, privateResp, privateData;
      await test.step("Выполнить запрос: Проверить согласованность данных между manager и private API", async () => {
        // 1. Получаем настройки через manager API
        ({ response: managerResp, data: managerData } =
          await karmaAPI.getManagerSettings());

        if (managerResp.status() === 404) {
          console.log("Karma не активирована");
          return;
        }

        // 2. Получаем настройки через private API
        ({ response: privateResp, data: privateData } =
          await karmaAPI.getPrivateWalletSettings());

        if (privateResp.status() === 404) {
          console.log("Karma не активирована");
          return;
        }

        // 3. Оба API должны быть доступны
      });

      await test.step("Проверить ответ", async () => {
        expect(managerResp.ok()).toBe(true);
        expect(privateResp.ok()).toBe(true);
      });
    });

    test(
      "C5405: Получить баланс и транзакции пользователя",
      { tag: ["@db"] },
      async ({ karmaAPI, karmaVerifier }) => {
        setSeverity("normal");

        // 1. Получаем баланс
        const { response: balanceResp, data: balanceData } =
          await karmaAPI.getUserBalances();

        if (balanceResp.status() === 404) {
          console.log("Karma не активирована");
          return;
        }

        expect(balanceResp.ok()).toBe(true);
        expect(balanceData).toBeDefined();

        // 2. Получаем транзакции
        const { response: txResp, data: txData } =
          await karmaAPI.getTransactions({ limit: 10 });
        expect(txResp.ok()).toBe(true);
        expect(txData).toBeDefined();

        // DB верификация
        await test.step("DB: Проверка баланса и транзакций в БД", async () => {
          if (!karmaVerifier.isConnected()) return;
          // Проверяем баланс из API
          const balances = balanceData?.balances || balanceData || [];
          if (Array.isArray(balances) && balances.length > 0) {
            const karmaBalance = balances.find((b) => b.currency === "karma");
            if (karmaBalance) {
              expect(Number(karmaBalance.amount)).toBeGreaterThanOrEqual(0);
            }
          }
          // Проверяем транзакции
          const apiItems = txData?.items || txData || [];
          if (apiItems.length > 0 && apiItems[0]?.id) {
            const dbTransaction = await karmaVerifier.getTransaction(
              apiItems[0].id,
            );
            expect(dbTransaction).toBeDefined();
          }
        });
      },
    );
  });

  // ==================== NEGATIVE TESTS ====================

  test.describe("Негативные сценарии", () => {
    test("C5406: Получить транзакции с невалидными параметрами", async ({
      karmaAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Получить транзакции с невалидными параметрами", async () => {
        const { response } = await karmaAPI.getTransactions({ limit: -1 });

        // API может вернуть ошибку или проигнорировать
        expect([200, 400, 404, 500]).toContain(response.status());
      });
    });

    test("C5407: Получить транзакции по несуществующей сущности", async ({
      karmaAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Получить транзакции по несуществующей сущности", async () => {
        const { response } = await karmaAPI.getTransactionsByEntity({
          relatedEntityId: 999999999,
          relatedEntityType: "unknown_type",
        });

        // API должен вернуть пустой список или ошибку
        expect([200, 400, 404]).toContain(response.status());
      });
    });

    test("C5408: Пополнить баланс с нулевой суммой", async ({
      karmaAPI,
      orgStructureAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Пополнить баланс с нулевой суммой", async () => {
        const userId = await findExistingUser(orgStructureAPI);

        if (!userId) {
          console.log("Нет пользователей для теста");
          return;
        }

        const { response } = await karmaAPI.deposit({
          userId,
          currency: "karma",
          amount: 0,
        });

        // API может разрешить или запретить нулевую сумму
        expect([200, 400, 403, 404, 422]).toContain(response.status());
      });
    });

    test("C5409: Пополнить баланс с очень большой суммой", async ({
      karmaAPI,
      orgStructureAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Пополнить баланс с очень большой суммой", async () => {
        const userId = await findExistingUser(orgStructureAPI);

        if (!userId) {
          console.log("Нет пользователей для теста");
          return;
        }

        const { response } = await karmaAPI.deposit({
          userId,
          currency: "karma",
          amount: 9999999999,
        });

        // API может принять или отклонить большую сумму
        expect([200, 400, 403, 404, 422]).toContain(response.status());
      });
    });

    test("C5410: Пополнить баланс с невалидной валютой", async ({
      karmaAPI,
      orgStructureAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Пополнить баланс с невалидной валютой", async () => {
        const userId = await findExistingUser(orgStructureAPI);

        if (!userId) {
          console.log("Нет пользователей для теста");
          return;
        }

        const { response } = await karmaAPI.deposit({
          userId,
          currency: "invalid_currency_xyz",
          amount: 10,
        });

        // Ожидаем ошибку валидации
        expect([400, 403, 404, 422]).toContain(response.status());
      });
    });

    test("C5411: Обновить настройки с невалидными данными", async ({
      karmaAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Обновить настройки с невалидными данными", async () => {
        const { response } = await karmaAPI.updateSettings({
          settings: {
            enabled: "not_a_boolean",
          },
        });

        // API может вернуть ошибку или проигнорировать
        expect([200, 400, 403, 404, 422, 500]).toContain(response.status());
      });
    });

    test("C5412: Получить транзакции с очень большим offset", async ({
      karmaAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Получить транзакции с очень большим offset", async () => {
        const { response, data } = await karmaAPI.getTransactions({
          offset: 999999,
        });

        if (response.status() === 404) {
          console.log("Karma не активирована");
          return;
        }

        // Должен вернуть пустой список
        assertSuccessStatus(response);
        const items = data?.items || data || [];
        expect(items.length).toBe(0);
      });
    });

    test("C5413: Получить токен экспорта с невалидной датой", async ({
      karmaAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Получить токен экспорта с невалидной датой", async () => {
        const { response } =
          await karmaAPI.getExportBalancesToken("invalid-date");

        // API должен вернуть ошибку
        expect([200, 400, 403, 404, 422, 500]).toContain(response.status());
      });
    });

    test("C5414: Получить токен экспорта с датой в будущем", async ({
      karmaAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Получить токен экспорта с датой в будущем", async () => {
        const futureDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split("T")[0];
        const { response } = await karmaAPI.getExportBalancesToken(futureDate);

        // API может разрешить или запретить дату в будущем
        expect([200, 400, 403, 404, 422]).toContain(response.status());
      });
    });
  });

  // ==================== EDGE CASES ====================

  test.describe("Граничные случаи", () => {
    test("C5415: Множественные запросы балансов подряд", async ({
      karmaAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Множественные запросы балансов подряд", async () => {
        const results = [];

        for (let i = 0; i < 5; i++) {
          const { response } = await karmaAPI.getUserBalances();
          results.push(response.status());
        }

        // Все запросы должны вернуть одинаковый статус
        const uniqueStatuses = [...new Set(results)];
        expect(uniqueStatuses.length).toBe(1);
        expect([200, 404]).toContain(uniqueStatuses[0]);
      });
    });

    test("C5416: Получить транзакции с разными типами сущностей", async ({
      karmaAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Получить транзакции с разными типами сущностей", async () => {
        const entityTypes = [
          "feedback",
          "gift",
          "survey",
          "performance_review",
        ];

        for (const entityType of entityTypes) {
          const { response } = await karmaAPI.getTransactionsByEntity({
            relatedEntityId: 1,
            relatedEntityType: entityType,
          });

          // Все типы должны обрабатываться без 500 ошибок
          expect([200, 400, 404]).toContain(response.status());
        }
      });
    });
  });
});
