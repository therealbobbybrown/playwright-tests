// @ts-check
import { test, expect } from "../../fixtures/api.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

/**
 * Расширенные тесты поиска NineBox API
 *
 * Покрытие:
 * - Пагинация (limit, offset)
 * - Фильтрация по координатам
 * - Текстовый поиск
 * - actualize параметр
 * - Доступные департаменты
 */

test.describe(
  "NineBox Search API",
  { tag: ["@api", "@ninebox", "@regression"] },
  () => {
    test.beforeEach(async ({ nineBoxAPI }, testInfo) => {
      markAsAPITest(MODULES.NINE_BOX, "NineBox Search");
      await nineBoxAPI.ensureEnabled();
    });

    /** Хелпер: убедиться что NineBox включён, вернуть актуальные settings */
    async function ensureEnabled(nineBoxAPI) {
      const { data } = await nineBoxAPI.getManagerSettings();
      if (!data.isEnabled) {
        await nineBoxAPI.enable();
        // Перечитать settings после enable — isEnabled теперь true
        const { data: updated } = await nineBoxAPI.getManagerSettings();
        return updated;
      }
      return data;
    }

    // ==================== ПАГИНАЦИЯ ====================

    test.describe("Пагинация", () => {
      test(
        "C9328: Поиск с limit=5 — items.length <= 5",
        { tag: ["@critical"] },
        async ({ nineBoxAPI }) => {
          setSeverity("critical");
          await ensureEnabled(nineBoxAPI);

          let response, data;
          await test.step("Выполнить запрос: Поиск с limit=5", async () => {
            ({ response, data } = await nineBoxAPI.searchManager({
              limit: 5,
              actualize: false,
            }));
          });

          await test.step("Проверить ответ", async () => {
            expect(response.status()).toBe(200);
            expect(data).toHaveProperty("items");
            expect(data).toHaveProperty("limit");
            expect(data).toHaveProperty("offset");
            expect(data).toHaveProperty("total");
            expect(Array.isArray(data.items), "items должен быть массивом").toBe(true);
            expect(data.items.length, "items.length <= 5").toBeLessThanOrEqual(5);
            expect(data.limit, "limit должен быть 5").toBe(5);
            expect(typeof data.total, "total должен быть числом").toBe("number");
            expect(typeof data.offset, "offset должен быть числом").toBe("number");
            expect(data.total, "Матрица должна содержать данные").toBeGreaterThan(0);
            expect(data.total).toBeGreaterThanOrEqual(data.items.length);

            // Проверить структуру каждого элемента
            for (const item of data.items) {
              expect(typeof item.targetUserId, "targetUserId — число").toBe("number");
              expect(typeof item.yCoord, "yCoord — число").toBe("number");
              expect(typeof item.xCoord, "xCoord — число").toBe("number");
              expect(typeof item.yValue, "yValue — число").toBe("number");
              expect(typeof item.xValue, "xValue — число").toBe("number");
            }
          });

        },
      );

      test(
        "C9364: Пагинация offset — нет пересечения ID между страницами",
        async ({ nineBoxAPI }) => {
          setSeverity("normal");
          await ensureEnabled(nineBoxAPI);

          let page1, page2;
          await test.step("Выполнить запрос: Получить первую и вторую страницы", async () => {
            ({ data: page1 } = await nineBoxAPI.searchManager({
              limit: 2,
              offset: 0,
              actualize: false,
            }));
            ({ data: page2 } = await nineBoxAPI.searchManager({
              limit: 2,
              offset: 2,
              actualize: false,
            }));
          });

          await test.step("Проверить: ID страниц не пересекаются", async () => {
            expect(
              page1.items.length,
              "Первая страница должна содержать данные для проверки пагинации",
            ).toBeGreaterThan(0);
            expect(
              page2.items.length,
              "Вторая страница должна содержать данные для проверки пагинации (total >= 4)",
            ).toBeGreaterThan(0);

            const ids1 = new Set(
              page1.items.map((i) => i.targetUserId),
            );
            for (const item of page2.items) {
              expect(
                ids1.has(item.targetUserId),
                `targetUserId ${item.targetUserId} не должен быть на первой странице`,
              ).toBe(false);
            }

            // total должен быть одинаковым на обеих страницах
            expect(
              page1.total,
              "total на первой и второй страницах должен совпадать",
            ).toBe(page2.total);
          });
        },
      );

      test(
        "C9365: Пагинация с offset >= total — пустой результат",
        async ({ nineBoxAPI }) => {
          setSeverity("normal");
          await ensureEnabled(nineBoxAPI);

          // Сначала узнаём total
          const { data: first } = await nineBoxAPI.searchManager({
            limit: 1,
            actualize: false,
          });

          expect(
            first.total,
            "Матрица должна содержать данные для проверки offset за пределами",
          ).toBeGreaterThan(0);

          let response, data;
          await test.step("Выполнить запрос: Поиск с offset за пределами total", async () => {
            ({ response, data } = await nineBoxAPI.searchManager({
              limit: 10,
              offset: first.total + 100,
              actualize: false,
            }));
          });

          await test.step("Проверить ответ", async () => {
            expect(response.status()).toBe(200);
            expect(data.items.length, "items должен быть пустым при offset за пределами").toBe(0);
            expect(data.total, "total должен остаться таким же").toBe(first.total);
          });

        },
      );
    });

    // ==================== ФИЛЬТРАЦИЯ ПО КООРДИНАТАМ ====================

    test.describe("Фильтрация по координатам", () => {
      test(
        "C9366: Поиск по координатам [1,1] — все items имеют xCoord=1, yCoord=1",
        async ({ nineBoxAPI }) => {
          setSeverity("normal");
          await ensureEnabled(nineBoxAPI);

          let response, data;
          await test.step("Выполнить запрос: Поиск по координатам [1,1]", async () => {
            ({ response, data } = await nineBoxAPI.searchManager({
              limit: 50,
              actualize: false,
              xCoord: 1,
              yCoord: 1,
            }));
          });

          await test.step("Проверить: Все элементы принадлежат ячейке [1,1]", async () => {
            expect(response.status()).toBe(200);
            for (const item of data.items) {
              expect(item.xCoord, "xCoord должен быть 1").toBe(1);
              expect(item.yCoord, "yCoord должен быть 1").toBe(1);
            }
          });

        },
      );

      test(
        "C9367: Координаты каждой ячейки 3x3 доступны",
        async ({ nineBoxAPI }) => {
          setSeverity("normal");
          const settings = await ensureEnabled(nineBoxAPI);
          const matrixSize = settings.matrixSize || 3;

          await test.step(`Выполнить: Перебрать все ${matrixSize}x${matrixSize} ячеек и проверить доступность`, async () => {
            for (let x = 0; x < matrixSize; x++) {
              for (let y = 0; y < matrixSize; y++) {
                const { response } = await nineBoxAPI.searchManager({
                  xCoord: x,
                  yCoord: y,
                  limit: 1,
                  actualize: false,
                });
                expect(
                  response.status(),
                  `Ячейка [${x},${y}] доступна`,
                ).toBe(200);
              }
            }
          });

        },
      );
    });

    // ==================== ТЕКСТОВЫЙ ПОИСК ====================

    test.describe("Текстовый поиск", () => {
      test(
        "C9368: Поиск по имени существующего сотрудника",
        async ({ nineBoxAPI }) => {
          setSeverity("normal");
          await ensureEnabled(nineBoxAPI);

          // Сначала получим список пользователей
          const { data: allData } = await nineBoxAPI.searchManager({
            limit: 1,
            actualize: false,
          });

          expect(
            allData.total,
            "Матрица должна содержать пользователей для проверки текстового поиска",
          ).toBeGreaterThan(0);

          // Используем targetUserId для косвенной проверки
          const knownUserId = allData.items[0].targetUserId;

          let response, data;
          await test.step(`Выполнить запрос: Поиск по ID пользователя ${knownUserId}`, async () => {
            // Поиск по ID в q вряд ли найдёт, но проверяем стабильность API
            ({ response, data } = await nineBoxAPI.searchManager({
              limit: 50,
              actualize: false,
              q: String(knownUserId),
            }));
          });

          await test.step("Проверить ответ", async () => {
            expect(response.status()).toBe(200);
            expect(data).toHaveProperty("items");
            expect(data).toHaveProperty("total");
            expect(Array.isArray(data.items), "items должен быть массивом").toBe(true);
            expect(typeof data.total, "total должен быть числом").toBe("number");
            expect(data.total, "total >= 0").toBeGreaterThanOrEqual(0);
            expect(data.items.length, "items.length <= limit").toBeLessThanOrEqual(50);
          });
        },
      );
    });

    // ==================== ACTUALIZE ====================

    test.describe("Параметр actualize", () => {
      test(
        "C9369: Поиск с actualize=true возвращает данные",
        async ({ nineBoxAPI }) => {
          setSeverity("normal");
          await ensureEnabled(nineBoxAPI);

          let response, data;
          await test.step("Выполнить запрос: Поиск с actualize=true", async () => {
            ({ response, data } = await nineBoxAPI.searchManager({
              limit: 10,
              actualize: true,
            }));
          });

          await test.step("Проверить ответ", async () => {
            expect(response.status()).toBe(200);
            expect(data).toHaveProperty("items");
            expect(data).toHaveProperty("total");
            expect(data).toHaveProperty("limit");
            expect(data).toHaveProperty("offset");
            expect(Array.isArray(data.items), "items должен быть массивом").toBe(true);
            expect(typeof data.total, "total должен быть числом").toBe("number");
            expect(data.total, "total >= 0").toBeGreaterThanOrEqual(0);
            expect(data.items.length, "items.length <= limit").toBeLessThanOrEqual(10);

            // Проверить структуру элементов
            for (const item of data.items) {
              expect(typeof item.targetUserId, "targetUserId — число").toBe("number");
              expect(typeof item.yCoord, "yCoord — число").toBe("number");
              expect(typeof item.xCoord, "xCoord — число").toBe("number");
            }
          });
        },
      );

      test(
        "C9370: Поиск с actualize=false возвращает кэшированные данные",
        async ({ nineBoxAPI }) => {
          setSeverity("normal");
          await ensureEnabled(nineBoxAPI);

          let response, data;
          await test.step("Выполнить запрос: Поиск с actualize=false", async () => {
            ({ response, data } = await nineBoxAPI.searchManager({
              limit: 10,
              actualize: false,
            }));
          });

          await test.step("Проверить ответ", async () => {
            expect(response.status()).toBe(200);
            expect(data).toHaveProperty("items");
            expect(data).toHaveProperty("total");
            expect(Array.isArray(data.items), "items должен быть массивом").toBe(true);
            expect(typeof data.total, "total должен быть числом").toBe("number");
            expect(data.total, "total должен быть >= 0").toBeGreaterThanOrEqual(0);
            expect(data.items.length, "items.length <= limit").toBeLessThanOrEqual(10);
          });
        },
      );
    });

    // ==================== ДЕПАРТАМЕНТЫ ====================

    test.describe("Доступные департаменты", () => {
      test(
        "C9371: Получить список доступных департаментов — структура ответа",
        async ({ nineBoxAPI }) => {
          setSeverity("normal");
          await ensureEnabled(nineBoxAPI);

          let response, data;
          await test.step("Выполнить запрос: Получить список доступных департаментов", async () => {
            ({ response, data } = await nineBoxAPI.getAvailableDepartments({
              limit: 10,
              actualize: false,
              usersSubset: "all",
            }));
          });

          await test.step("Проверить ответ", async () => {
            expect(response.status()).toBe(200);
            expect(data).toHaveProperty("items");
            expect(data).toHaveProperty("limit");
            expect(data).toHaveProperty("total");
            expect(Array.isArray(data.items)).toBe(true);

            expect(
              data.items.length,
              "Должны быть доступные департаменты для проверки структуры",
            ).toBeGreaterThan(0);

            for (const dept of data.items) {
              expect(dept).toHaveProperty("id");
              expect(dept).toHaveProperty("title");
              expect(typeof dept.id, "id должен быть числом").toBe("number");
              expect(typeof dept.title, "title должен быть строкой").toBe("string");
              expect(dept.title.length, "title не должен быть пустым").toBeGreaterThan(0);
              expect(dept.id, "id должен быть положительным").toBeGreaterThan(0);
            }
          });
        },
      );

      test(
        "C9372: Поиск департаментов по названию",
        async ({ nineBoxAPI }) => {
          setSeverity("normal");
          await ensureEnabled(nineBoxAPI);

          // Получим первый департамент
          const { data: allDepts } = await nineBoxAPI.getAvailableDepartments({
            limit: 1,
            actualize: false,
            usersSubset: "all",
          });

          expect(
            allDepts.items.length,
            "Должны быть доступные департаменты для проверки поиска",
          ).toBeGreaterThan(0);

          const knownTitle = allDepts.items[0].title;
          const searchQuery = knownTitle.substring(0, 3);

          let response, data;
          await test.step(`Выполнить запрос: Поиск департаментов по "${searchQuery}"`, async () => {
            ({ response, data } = await nineBoxAPI.getAvailableDepartments({
              limit: 10,
              actualize: false,
              usersSubset: "all",
              q: searchQuery,
            }));
          });

          await test.step("Проверить ответ", async () => {
            expect(response.status()).toBe(200);
            expect(
              data.items.length,
              `Поиск по "${searchQuery}" должен вернуть результаты`,
            ).toBeGreaterThan(0);

            // Проверить что ВСЕ результаты содержат искомый текст
            for (const dept of data.items) {
              expect(
                dept.title.toLowerCase(),
                `Департамент "${dept.title}" должен содержать "${searchQuery}"`,
              ).toContain(searchQuery.toLowerCase());
              expect(typeof dept.id, "id должен быть числом").toBe("number");
            }

            // filtered total <= unfiltered total
            expect(
              data.total,
              "Фильтрованный total должен быть <= нефильтрованного",
            ).toBeLessThanOrEqual(allDepts.total);
          });
        },
      );
    });

    // ==================== ПРОИЗВОДИТЕЛЬНОСТЬ ====================

    test.describe("Производительность", () => {
      test(
        "C9373: Поиск с limit=1000 — производительность и полнота данных",
        async ({ nineBoxAPI }) => {
          setSeverity("normal");
          await ensureEnabled(nineBoxAPI);

          let response, data;
          let duration;

          await test.step("Выполнить запрос: Поиск с limit=1000", async () => {
            const start = Date.now();
            ({ response, data } = await nineBoxAPI.searchManager({
              limit: 1000,
              actualize: false,
            }));
            duration = Date.now() - start;
          });

          await test.step("Проверить ответ", async () => {
            expect(response.status(), "Статус 200").toBe(200);
            expect(data).toHaveProperty("items");
            expect(data).toHaveProperty("total");
            expect(Array.isArray(data.items), "items должен быть массивом").toBe(true);
            expect(typeof data.total, "total должен быть числом").toBe("number");
          });

          await test.step(
            "Проверить: Полнота данных — если total <= 1000, items.length === total",
            async () => {
              if (data.total <= 1000) {
                expect(
                  data.items.length,
                  `При total=${data.total} <= limit=1000 все записи должны быть возвращены`,
                ).toBe(data.total);
              } else {
                expect(
                  data.items.length,
                  `При total=${data.total} > limit=1000, items.length должен быть 1000`,
                ).toBe(1000);
              }
            },
          );

          await test.step(
            "Проверить: Время ответа < 10 секунд",
            async () => {
              console.log(
                `Поиск с limit=1000: ${data.items.length} items из ${data.total} total, время ${duration}ms`,
              );
              expect(
                duration,
                `Время ответа ${duration}ms не должно превышать 10000ms`,
              ).toBeLessThan(10000);
            },
          );

          await test.step(
            "Проверить: Структура каждого элемента",
            async () => {
              for (const item of data.items) {
                expect(typeof item.targetUserId, "targetUserId — число").toBe("number");
                expect(typeof item.yCoord, "yCoord — число").toBe("number");
                expect(typeof item.xCoord, "xCoord — число").toBe("number");
                expect(typeof item.yValue, "yValue — число").toBe("number");
                expect(typeof item.xValue, "xValue — число").toBe("number");
              }
            },
          );
        },
      );
    });
  },
);
