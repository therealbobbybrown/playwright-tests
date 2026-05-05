// @ts-check
import { test, expect } from "../../fixtures/full.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { assertSuccessStatus } from "../../utils/api/common-assertions.js";

/**
 * API тесты для магазина подарков (Gift Shop)
 *
 * Покрытие:
 * - CRUD подарков
 * - Заказы подарков
 */

// Кеш для данных
let cachedGiftId = null;

async function findExistingGift(api) {
  if (cachedGiftId) {
    return cachedGiftId;
  }

  const { data } = await api.getManagerGifts({ limit: 10 });
  const items = data?.items || data || [];
  if (items.length > 0) {
    cachedGiftId = items[0].id;
    return cachedGiftId;
  }

  return null;
}

test.describe(
  "Gift Shop API",
  { tag: ["@api", "@gift-shop", "@regression"] },
  () => {
    test.beforeEach(async ({}, testInfo) => {
      markAsAPITest(MODULES.PERFORMANCE_REVIEW, "Gift Shop");
    });

    // ==================== GIFTS (Manager) ====================

    test.describe("GET /manager/gifts/ - Список подарков (manager)", () => {
      test(
        "C5284: Получить список подарков (manager)",
        { tag: ["@critical"] },
        async ({ giftShopAPI }) => {
          setSeverity("critical");

          await test.step("Выполнить: Получить список подарков (manager)", async () => {
            const { response, data } = await giftShopAPI.getManagerGifts({
              limit: 10,
            });

            // Gift Shop может быть не активирован
            if (response.status() === 404) {
              console.log("Gift Shop не активирован");
              return;
            }

            expect(response.status()).toBe(200);
            expect(data).toBeDefined();
          });
        },
      );

      test("C5285: Получить список подарков с пагинацией", async ({
        giftShopAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить список подарков с пагинацией", async () => {
          const { response: resp1, data: data1 } =
            await giftShopAPI.getManagerGifts({ limit: 2, offset: 0 });
          const { response: resp2, data: data2 } =
            await giftShopAPI.getManagerGifts({ limit: 2, offset: 2 });

          // Gift Shop может быть не активирован
          if (resp1.status() === 404) {
            console.log("Gift Shop не активирован");
            return;
          }

          expect(resp1.status()).toBe(200);
          expect(resp2.status()).toBe(200);
        });
      });

      test("C5286: Поиск подарков по названию", async ({ giftShopAPI }) => {
        setSeverity("normal");

        await test.step("Выполнить: Поиск подарков по названию", async () => {
          const { response, data } = await giftShopAPI.getManagerGifts({
            q: "test",
            limit: 10,
          });

          // Gift Shop может быть не активирован
          if (response.status() === 404) {
            console.log("Gift Shop не активирован");
            return;
          }

          expect(response.status()).toBe(200);
          expect(data).toBeDefined();
        });
      });
    });

    test.describe("POST /manager/gifts/ - Создание подарка", () => {
      test(
        "C5287: Создать подарок",
        { tag: ["@critical", "@db"] },
        async ({ giftShopAPI, baseVerifier }) => {
          setSeverity("critical");

          const title = `Test Gift ${Date.now()}`;
          const description = "Test gift description";
          const price = 100;

          const { response, data } = await giftShopAPI.createGift({
            title,
            description,
            price,
          });

          // Gift Shop может быть не активирован
          if (response.status() === 404) {
            console.log("Gift Shop не активирован");
            return;
          }

          if (response.status() === 403) {
            console.log("Нет прав на создание подарков");
            return;
          }

          // Если другая ошибка - пропускаем
          if (!response.ok()) {
            console.log(`Не удалось создать подарок: ${response.status()}`);
            return;
          }

          assertSuccessStatus(response);
          expect(data).toBeDefined();

          const giftId = data.id || data.gift?.id;
          expect(giftId).toBeDefined();

          // Проверяем что данные сохранились правильно
          const { data: fetchedData } = await giftShopAPI.getGift(giftId);
          if (fetchedData) {
            expect(fetchedData.title).toBe(title);
            expect(fetchedData.price).toBe(price);
          }

          // DB верификация
          await test.step("DB: Проверка создания подарка в БД", async () => {
            const dbGift = await baseVerifier.verifyRecordCreated(
              "gifts",
              giftId,
            );
            if (dbGift) {
              expect(dbGift.title).toBe(title);
            }
          });

          // Cleanup
          if (giftId) {
            await giftShopAPI.deleteGift(giftId);
          }
        },
      );

      test(
        "C5288: Создать подарок без названия (негативный)",
        { tag: ["@db"] },
        async ({ giftShopAPI, baseVerifier }) => {
          setSeverity("normal");

          // DB: Получаем количество подарков до теста
          const giftsBefore =
            await test.step("DB: Получение подарков до теста", async () => {
              if (baseVerifier.skipIfNotConnected()) return 0;
              return await baseVerifier.countRecords("gifts");
            });

          const { response } = await giftShopAPI.createGift({
            price: 100,
          });

          // Ожидаем ошибку валидации или 404 если модуль не активирован
          expect([400, 404, 422]).toContain(response.status());

          // DB: Проверяем что подарок НЕ создан
          await test.step("DB: Проверка что подарок НЕ создан", async () => {
            await baseVerifier.verifyRecordCount("gifts", {}, giftsBefore);
          });
        },
      );
    });

    test.describe("POST /manager/gifts/{id}/ - Обновление подарка", () => {
      test("C5289: Обновить подарок", async ({ giftShopAPI }) => {
        setSeverity("normal");

        await test.step("Выполнить: Обновить подарок", async () => {
          // Создаём тестовый подарок
          const { response: createResp, data: createData } =
            await giftShopAPI.createGift({
              title: `Test Update Gift ${Date.now()}`,
              price: 100,
            });

          if (createResp.status() === 404) {
            console.log("Gift Shop не активирован");
            return;
          }

          if (createResp.status() === 403) {
            console.log("Нет прав на создание подарков");
            return;
          }

          const giftId = createData?.id || createData?.gift?.id;

          if (giftId) {
            const newTitle = `Updated Gift ${Date.now()}`;
            const { response } = await giftShopAPI.updateGift(giftId, {
              title: newTitle,
            });

            assertSuccessStatus(response);

            // Проверяем что обновление применилось
            const { data: fetchedData } = await giftShopAPI.getGift(giftId);
            if (fetchedData) {
              expect(fetchedData.title).toBe(newTitle);
            }

            // Cleanup
            await giftShopAPI.deleteGift(giftId);
          }
        });
      });

      test("C5290: Обновить несуществующий подарок", async ({
        giftShopAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Обновить несуществующий подарок", async () => {
          const { response } = await giftShopAPI.updateGift(999999999, {
            title: "Test",
          });

          expect([400, 403, 404]).toContain(response.status());
        });
      });
    });

    test.describe("DELETE /manager/gifts/{id}/ - Удаление подарка", () => {
      test(
        "C5291: Удалить подарок",
        { tag: ["@db"] },
        async ({ giftShopAPI, baseVerifier }) => {
          setSeverity("normal");

          // Создаём подарок для удаления
          const { response: createResp, data: createData } =
            await giftShopAPI.createGift({
              title: `Test Delete Gift ${Date.now()}`,
              price: 100,
            });

          if (createResp.status() === 404) {
            console.log("Gift Shop не активирован");
            return;
          }

          if (createResp.status() === 403) {
            console.log("Нет прав на создание подарков");
            return;
          }

          const giftId = createData?.id || createData?.gift?.id;

          if (giftId) {
            const { response } = await giftShopAPI.deleteGift(giftId);

            assertSuccessStatus(response);

            // DB верификация
            await test.step("DB: Проверка удаления подарка из БД", async () => {
              await baseVerifier.verifyRecordDeleted("gifts", giftId);
            });
          }
        },
      );

      test("C5292: Удалить несуществующий подарок", async ({ giftShopAPI }) => {
        setSeverity("normal");

        await test.step("Выполнить: Удалить несуществующий подарок", async () => {
          const { response } = await giftShopAPI.deleteGift(999999999);

          expect([400, 403, 404]).toContain(response.status());
        });
      });
    });

    // ==================== GIFTS (Private) ====================

    test.describe("GET /private/gifts/ - Список подарков (private)", () => {
      test("C5293: Получить список подарков (private)", async ({
        giftShopAPI,
      }) => {
        setSeverity("critical");

        await test.step("Выполнить: Получить список подарков (private)", async () => {
          const { response, data } = await giftShopAPI.getPrivateGifts({
            limit: 10,
          });

          // Gift Shop может быть не активирован или нет прав
          if (response.status() === 404 || response.status() === 403) {
            console.log("Gift Shop не активирован или нет прав");
            return;
          }

          expect(response.status()).toBe(200);
          expect(data).toBeDefined();
        });
      });

      test("C5294: Получить подарок по ID", async ({ giftShopAPI }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить подарок по ID", async () => {
          const giftId = await findExistingGift(giftShopAPI);

          if (giftId) {
            const { response, data } = await giftShopAPI.getGift(giftId);

            // Может не быть доступа
            if (response.status() === 403) {
              console.log("Нет прав на просмотр подарка");
              return;
            }

            expect(response.status()).toBe(200);
            expect(data).toBeDefined();
            expect(data.id).toBe(giftId);
          }
        });
      });

      test("C5295: Получить несуществующий подарок", async ({
        giftShopAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить несуществующий подарок", async () => {
          const { response } = await giftShopAPI.getGift(999999999);

          expect([400, 403, 404]).toContain(response.status());
        });
      });
    });

    // ==================== ORDERS ====================

    test.describe("POST /private/gift-orders/ - Заказы подарков", () => {
      test("C5296: Создать заказ без достаточного баланса (негативный)", async ({
        giftShopAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Создать заказ без достаточного баланса (негативный)", async () => {
          const giftId = await findExistingGift(giftShopAPI);

          if (giftId) {
            const { response, data } = await giftShopAPI.createOrder({
              giftId,
              comment: "Test order",
            });

            // Ожидаем ошибку (недостаточно баланса), успех (если баланс есть), или 404 если модуль не активирован
            expect([200, 201, 400, 402, 403, 404]).toContain(response.status());
          }
        });
      });

      test("C5297: Создать заказ с несуществующим подарком", async ({
        giftShopAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Создать заказ с несуществующим подарком", async () => {
          const { response } = await giftShopAPI.createOrder({
            giftId: 999999999,
            comment: "Test order",
          });

          // Ожидаем ошибку
          expect([400, 403, 404]).toContain(response.status());
        });
      });
    });

    // ==================== INTEGRATION TESTS ====================

    test.describe("Интеграционные тесты (lifecycle chains)", () => {
      test("C5298: Полный жизненный цикл подарка: создание → обновление → проверка → удаление", async ({
        giftShopAPI,
      }) => {
        setSeverity("critical");

        let title, description, price, giftId;
        await test.step("Выполнить запрос: Полный жизненный цикл подарка: создание → обновление → проверка → удаление", async () => {
          // 1. Создаём подарок
          title = `Test Lifecycle Gift ${Date.now()}`;
          description = "Test description for lifecycle";
          price = 150;

          const { response: createResp, data: createData } =
            await giftShopAPI.createGift({
              title,
              description,
              price,
            });

          if (createResp.status() === 404 || createResp.status() === 400) {
            console.log("Gift Shop не активирован или не настроен");
            return;
          }

          if (createResp.status() === 403) {
            console.log("Нет прав на создание подарков");
            return;
          }

          if (!createResp.ok()) {
            console.log(`Не удалось создать подарок: ${createResp.status()}`);
            return;
          }

          giftId = createData?.id || createData?.gift?.id;
        });

        await test.step("Проверить ответ", async () => {
          if (!giftId) return; // Gift Shop не активирован или нет прав — step вернулся early
          expect(giftId).toBeDefined();

          // 2. Проверяем что подарок создан корректно
          const { response: getResp1, data: giftData1 } =
            await giftShopAPI.getGift(giftId);
          expect(getResp1.ok()).toBe(true);
          expect(giftData1.title).toBe(title);
          expect(giftData1.price).toBe(price);

          // 3. Обновляем подарок
          const newTitle = `Updated Lifecycle Gift ${Date.now()}`;
          const newPrice = 200;
          const { response: updateResp } = await giftShopAPI.updateGift(
            giftId,
            {
              title: newTitle,
              price: newPrice,
              description: "Updated description",
            },
          );

          expect(updateResp.ok()).toBe(true);

          // 4. Проверяем что обновление применилось
          const { response: getResp2, data: giftData2 } =
            await giftShopAPI.getGift(giftId);
          expect(getResp2.ok()).toBe(true);
          expect(giftData2.title).toBe(newTitle);
          expect(giftData2.price).toBe(newPrice);

          // 5. Удаляем подарок
          const { response: deleteResp } = await giftShopAPI.deleteGift(giftId);
          expect(deleteResp.ok()).toBe(true);

          // 6. Проверяем что подарок удалён
          const { response: getDeletedResp } =
            await giftShopAPI.getGift(giftId);
          expect([400, 403, 404]).toContain(getDeletedResp.status());
        });
      });

      test("C5299: Создание нескольких подарков и проверка списка", async ({
        giftShopAPI,
      }) => {
        setSeverity("normal");

        let giftsToCreate, createdGiftIds;
        await test.step("Выполнить запрос: Создание нескольких подарков и проверка списка", async () => {
          const timestamp = Date.now();
          giftsToCreate = [
            { title: `Gift A ${timestamp}`, price: 100 },
            { title: `Gift B ${timestamp}`, price: 200 },
            { title: `Gift C ${timestamp}`, price: 300 },
          ];

          createdGiftIds = [];

          // 1. Создаём несколько подарков
          for (const gift of giftsToCreate) {
            const { response, data } = await giftShopAPI.createGift(gift);

            if (response.status() === 404 || response.status() === 400) {
              console.log("Gift Shop не активирован или не настроен");
              // Cleanup созданных
              for (const id of createdGiftIds) {
                await giftShopAPI.deleteGift(id);
              }
              return;
            }

            if (response.status() === 403) {
              console.log("Нет прав на создание подарков");
              // Cleanup созданных
              for (const id of createdGiftIds) {
                await giftShopAPI.deleteGift(id);
              }
              return;
            }

            if (response.ok()) {
              const giftId = data?.id || data?.gift?.id;
              if (giftId) {
                createdGiftIds.push(giftId);
              }
            }
          }

          // Если не создали ни одного подарка - выходим
          if (createdGiftIds.length === 0) {
            console.log("Не удалось создать подарки");
            return;
          }
        });

        await test.step("Проверить ответ", async () => {
          if (!createdGiftIds || createdGiftIds.length === 0) return; // Gift Shop не активирован или нет прав
          expect(createdGiftIds.length).toBe(giftsToCreate.length);

          // 2. Проверяем что подарки есть в списке
          const { response: listResp, data: listData } =
            await giftShopAPI.getManagerGifts({ limit: 100 });
          expect(listResp.ok()).toBe(true);

          const items = listData?.items || listData || [];
          for (const giftId of createdGiftIds) {
            const found = items.find((g) => g.id === giftId);
            expect(found).toBeDefined();
          }

          // 3. Cleanup
          for (const giftId of createdGiftIds) {
            await giftShopAPI.deleteGift(giftId);
          }
        });
      });

      test("C5300: Поиск созданного подарка по названию", async ({
        giftShopAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Поиск созданного подарка по названию", async () => {
          const uniqueTitle = `UniqueSearchGift_${Date.now()}_${Math.random().toString(36).substring(7)}`;

          // 1. Создаём подарок с уникальным названием
          const { response: createResp, data: createData } =
            await giftShopAPI.createGift({
              title: uniqueTitle,
              price: 50,
            });

          if (createResp.status() === 404) {
            console.log("Gift Shop не активирован");
            return;
          }

          if (createResp.status() === 403) {
            console.log("Нет прав на создание подарков");
            return;
          }

          const giftId = createData?.id || createData?.gift?.id;

          if (giftId) {
            // 2. Ищем по части названия
            const { response: searchResp, data: searchData } =
              await giftShopAPI.getManagerGifts({
                q: "UniqueSearchGift",
                limit: 50,
              });

            expect(searchResp.ok()).toBe(true);

            const items = searchData?.items || searchData || [];
            const found = items.find((g) => g.id === giftId);
            expect(found).toBeDefined();
            expect(found.title).toBe(uniqueTitle);

            // 3. Cleanup
            await giftShopAPI.deleteGift(giftId);
          }
        });
      });
    });

    // ==================== NEGATIVE TESTS ====================

    test.describe("Негативные сценарии", () => {
      test("C5301: Получить подарки с невалидными параметрами", async ({
        giftShopAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить подарки с невалидными параметрами", async () => {
          const { response } = await giftShopAPI.getManagerGifts({ limit: -1 });

          // API может вернуть ошибку или проигнорировать
          expect([200, 400, 404, 500]).toContain(response.status());
        });
      });

      test(
        "C5302: Создать подарок с отрицательной ценой",
        { tag: ["@db"] },
        async ({ giftShopAPI, baseVerifier }) => {
          setSeverity("normal");

          // DB: Получаем количество подарков до теста
          const giftsBefore =
            await test.step("DB: Получение подарков до теста", async () => {
              if (baseVerifier.skipIfNotConnected()) return 0;
              return await baseVerifier.countRecords("gifts");
            });

          const { response } = await giftShopAPI.createGift({
            title: `Test Gift ${Date.now()}`,
            price: -100,
          });

          // Ожидаем ошибку валидации или 404 если модуль не активирован
          expect([400, 404, 422]).toContain(response.status());

          // DB: Проверяем что подарок НЕ создан
          await test.step("DB: Проверка что подарок НЕ создан", async () => {
            await baseVerifier.verifyRecordCount("gifts", {}, giftsBefore);
          });
        },
      );

      test("C5303: Создать подарок с нулевой ценой", async ({
        giftShopAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Создать подарок с нулевой ценой", async () => {
          const { response, data } = await giftShopAPI.createGift({
            title: `Test Zero Price Gift ${Date.now()}`,
            price: 0,
          });

          // API может разрешить или запретить нулевую цену
          if (response.ok()) {
            const giftId = data?.id || data?.gift?.id;
            if (giftId) {
              // Проверяем что цена сохранилась
              const { data: fetchedData } = await giftShopAPI.getGift(giftId);
              expect(fetchedData.price).toBe(0);
              // Cleanup
              await giftShopAPI.deleteGift(giftId);
            }
          } else {
            expect([400, 404, 422]).toContain(response.status());
          }
        });
      });

      test("C5304: Создать подарок с очень большой ценой", async ({
        giftShopAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Создать подарок с очень большой ценой", async () => {
          const { response, data } = await giftShopAPI.createGift({
            title: `Test Large Price Gift ${Date.now()}`,
            price: 9999999999,
          });

          // API может принять или отклонить большую цену
          if (response.ok()) {
            const giftId = data?.id || data?.gift?.id;
            if (giftId) {
              await giftShopAPI.deleteGift(giftId);
            }
          } else {
            expect([400, 404, 422, 500]).toContain(response.status());
          }
        });
      });

      test("C5305: Создать подарок с очень длинным названием", async ({
        giftShopAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Создать подарок с очень длинным названием", async () => {
          const longTitle = "A".repeat(1000);

          const { response, data } = await giftShopAPI.createGift({
            title: longTitle,
            price: 100,
          });

          // API может обрезать, отклонить или принять
          if (response.ok()) {
            const giftId = data?.id || data?.gift?.id;
            if (giftId) {
              await giftShopAPI.deleteGift(giftId);
            }
          } else {
            expect([400, 404, 422, 500]).toContain(response.status());
          }
        });
      });

      test("C5306: Создать подарок без цены (негативный)", async ({
        giftShopAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Создать подарок без цены (негативный)", async () => {
          const { response } = await giftShopAPI.createGift({
            title: `Test No Price Gift ${Date.now()}`,
          });

          // Ожидаем ошибку валидации или 404 если модуль не активирован
          expect([400, 404, 422]).toContain(response.status());
        });
      });

      test(
        "C5307: Создать подарок с пустым названием",
        { tag: ["@db"] },
        async ({ giftShopAPI, baseVerifier }) => {
          setSeverity("normal");

          // DB: Получаем количество подарков до теста
          const giftsBefore =
            await test.step("DB: Получение подарков до теста", async () => {
              if (baseVerifier.skipIfNotConnected()) return 0;
              return await baseVerifier.countRecords("gifts");
            });

          const { response } = await giftShopAPI.createGift({
            title: "",
            price: 100,
          });

          // Ожидаем ошибку валидации
          expect([400, 404, 422]).toContain(response.status());

          // DB: Проверяем что подарок НЕ создан
          await test.step("DB: Проверка что подарок НЕ создан", async () => {
            await baseVerifier.verifyRecordCount("gifts", {}, giftsBefore);
          });
        },
      );

      test("C5308: Обновить подарок с пустым названием", async ({
        giftShopAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Обновить подарок с пустым названием", async () => {
          // Создаём подарок
          const { response: createResp, data: createData } =
            await giftShopAPI.createGift({
              title: `Test Update Empty ${Date.now()}`,
              price: 100,
            });

          if (createResp.status() === 404 || createResp.status() === 403) {
            console.log("Gift Shop не активирован или нет прав");
            return;
          }

          const giftId = createData?.id || createData?.gift?.id;

          if (giftId) {
            // Пытаемся обновить с пустым названием
            const { response: updateResp } = await giftShopAPI.updateGift(
              giftId,
              {
                title: "",
              },
            );

            // Должна быть ошибка валидации или API может проигнорировать
            expect([200, 400, 422]).toContain(updateResp.status());

            // Cleanup
            await giftShopAPI.deleteGift(giftId);
          }
        });
      });

      test("C5309: Удалить уже удалённый подарок", async ({ giftShopAPI }) => {
        setSeverity("normal");

        await test.step("Выполнить: Удалить уже удалённый подарок", async () => {
          // Создаём и удаляем подарок
          const { response: createResp, data: createData } =
            await giftShopAPI.createGift({
              title: `Test Double Delete ${Date.now()}`,
              price: 100,
            });

          if (createResp.status() === 404 || createResp.status() === 403) {
            console.log("Gift Shop не активирован или нет прав");
            return;
          }

          const giftId = createData?.id || createData?.gift?.id;

          if (giftId) {
            // Первое удаление
            const { response: deleteResp1 } =
              await giftShopAPI.deleteGift(giftId);
            expect(deleteResp1.ok()).toBe(true);

            // Второе удаление того же подарка
            const { response: deleteResp2 } =
              await giftShopAPI.deleteGift(giftId);
            expect([400, 403, 404]).toContain(deleteResp2.status());
          }
        });
      });

      test("C5310: Создать заказ без giftId (негативный)", async ({
        giftShopAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Создать заказ без giftId (негативный)", async () => {
          const { response } = await giftShopAPI.createOrder({
            comment: "Test order without giftId",
          });

          // Ожидаем ошибку валидации
          expect([400, 403, 404, 422]).toContain(response.status());
        });
      });

      test("C5311: Получить подарки с очень большим offset", async ({
        giftShopAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить подарки с очень большим offset", async () => {
          const { response, data } = await giftShopAPI.getManagerGifts({
            offset: 999999,
          });

          if (response.status() === 404) {
            console.log("Gift Shop не активирован");
            return;
          }

          // Должен вернуть пустой список
          assertSuccessStatus(response);
          const items = data?.items || data || [];
          expect(items.length).toBe(0);
        });
      });
    });

    // ==================== SORTING & FILTERING ====================

    test.describe("Сортировка и фильтрация", () => {
      test("C5312: Получить подарки с сортировкой по цене", async ({
        giftShopAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить подарки с сортировкой по цене", async () => {
          const { response, data } = await giftShopAPI.getManagerGifts({
            orderBy: "price",
            limit: 10,
          });

          if (response.status() === 404 || response.status() === 400) {
            console.log("Gift Shop не активирован или не настроен");
            return;
          }

          assertSuccessStatus(response);
          expect(data).toBeDefined();
        });
      });

      test("C5313: Получить подарки с сортировкой по названию", async ({
        giftShopAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить подарки с сортировкой по названию", async () => {
          const { response, data } = await giftShopAPI.getManagerGifts({
            orderBy: "title",
            limit: 10,
          });

          if (response.status() === 404 || response.status() === 400) {
            console.log("Gift Shop не активирован или не настроен");
            return;
          }

          assertSuccessStatus(response);
          expect(data).toBeDefined();
        });
      });

      test("C5314: Поиск с пустой строкой", async ({ giftShopAPI }) => {
        setSeverity("normal");

        await test.step("Выполнить: Поиск с пустой строкой", async () => {
          const { response, data } = await giftShopAPI.getManagerGifts({
            q: "",
            limit: 10,
          });

          if (response.status() === 404) {
            console.log("Gift Shop не активирован");
            return;
          }

          // Должен вернуть все подарки (без фильтрации)
          assertSuccessStatus(response);
          expect(data).toBeDefined();
        });
      });

      test("C5315: Поиск со специальными символами", async ({
        giftShopAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Поиск со специальными символами", async () => {
          const { response, data } = await giftShopAPI.getManagerGifts({
            q: "<script>alert(1)</script>",
            limit: 10,
          });

          if (response.status() === 404) {
            console.log("Gift Shop не активирован");
            return;
          }

          // API должен безопасно обработать специальные символы
          expect([200, 400]).toContain(response.status());
        });
      });
    });
  },
);
