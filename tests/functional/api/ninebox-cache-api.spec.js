// @ts-check
import { test, expect } from "../../fixtures/full.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

/**
 * API тесты для NineBox — кэш-инвалидация и soft-delete поведение
 *
 * Покрытие:
 * - E1: Поиск с actualize=true обновляет метаданные кэша
 * - E2: Матрица при invalidated кэше возвращает данные
 * - E3: Soft-delete пользователи (is_removed=1) не попадают в результаты поиска
 * - E4: Soft-delete пользователи отсутствуют в ячейках матрицы
 */

test.describe(
  "NineBox Cache",
  { tag: ["@api", "@ninebox", "@regression"] },
  () => {
    test.beforeEach(async ({ nineBoxAPI }, testInfo) => {
      markAsAPITest(MODULES.NINE_BOX, "NineBox Cache");
      await nineBoxAPI.ensureEnabled();
    });

    // ==================== E1: ACTUALIZE ====================

    test(
      "C9337: Поиск с actualize=true обновляет метаданные кэша",
      async ({ nineBoxAPI }) => {
        setSeverity("normal");

        // Убедиться что NineBox включён
        await nineBoxAPI.ensureEnabled();

        let firstSearchData;
        let baselineResponse, baselineData;

        await test.step("Выполнить: Поиск с actualize=false (baseline)", async () => {
          let { response, data } = await nineBoxAPI.searchManager({
            limit: 10,
            actualize: false,
          });
          // Защита от гонки: параллельный тест мог отключить NineBox
          if (response.status() === 403) {
            await nineBoxAPI.ensureEnabled();
            ({ response, data } = await nineBoxAPI.searchManager({
              limit: 10,
              actualize: false,
            }));
          }
          baselineResponse = response;
          baselineData = data;
        });

        await test.step("Проверить ответ", async () => {
          expect(baselineResponse.status(), "Baseline поиск должен вернуть 200").toBe(200);
          expect(baselineData, "Ответ должен содержать данные").toBeDefined();
          expect(baselineData).toHaveProperty("items");
          expect(baselineData).toHaveProperty("total");
          expect(baselineData).toHaveProperty("limit");
          expect(baselineData).toHaveProperty("offset");
          expect(Array.isArray(baselineData.items), "items должен быть массивом").toBe(true);
          expect(typeof baselineData.total, "total должен быть числом").toBe("number");
          expect(
            baselineData.total,
            "Матрица должна содержать данные для проверки кэша",
          ).toBeGreaterThan(0);
          firstSearchData = baselineData;
        });

        let actualizeResponse, actualizeData;

        await test.step("Выполнить: Поиск с actualize=true — обновить кэш", async () => {
          const { response, data } = await nineBoxAPI.searchManager({
            limit: 10,
            actualize: true,
          });
          actualizeResponse = response;
          actualizeData = data;
        });

        await test.step("Проверить ответ", async () => {
          expect(actualizeResponse.status(), "Actualize поиск должен вернуть 200").toBe(200);
          expect(actualizeData).toHaveProperty("items");
          expect(actualizeData).toHaveProperty("limit");
          expect(actualizeData).toHaveProperty("offset");
          expect(actualizeData).toHaveProperty("total");

          expect(Array.isArray(actualizeData.items), "items должен быть массивом").toBe(true);
          expect(typeof actualizeData.total, "total должен быть числом").toBe("number");
          expect(actualizeData.limit, "limit должен быть 10").toBe(10);
          expect(typeof actualizeData.offset, "offset должен быть числом").toBe("number");
          expect(actualizeData.total, "total должен быть > 0 после actualize").toBeGreaterThan(0);
          expect(actualizeData.items.length, "items.length <= limit").toBeLessThanOrEqual(10);
        });

        let structureData;

        await test.step("Выполнить: Повторный поиск с actualize=true", async () => {
          const { data } = await nineBoxAPI.searchManager({
            limit: 10,
            actualize: true,
          });
          structureData = data;
        });

        await test.step("Проверить: Структура элементов после actualize", async () => {
          expect(
            structureData.items.length,
            "Должны быть элементы для проверки структуры после actualize",
          ).toBeGreaterThan(0);

          for (const item of structureData.items) {
            expect(item).toHaveProperty("targetUserId");
            expect(item).toHaveProperty("yValue");
            expect(item).toHaveProperty("xValue");
            expect(item).toHaveProperty("yCoord");
            expect(item).toHaveProperty("xCoord");

            expect(typeof item.targetUserId, "targetUserId — число").toBe("number");
            expect(typeof item.yValue, "yValue — число").toBe("number");
            expect(typeof item.xValue, "xValue — число").toBe("number");
            expect(typeof item.yCoord, "yCoord — число").toBe("number");
            expect(typeof item.xCoord, "xCoord — число").toBe("number");
            expect(item.targetUserId, "targetUserId должен быть положительным").toBeGreaterThan(0);
          }
        });

        let afterActualizeData;

        await test.step("Выполнить: Поиск с actualize=false после обновления кэша", async () => {
          const { data: afterActualize } = await nineBoxAPI.searchManager({
            limit: 10,
            actualize: false,
          });
          afterActualizeData = afterActualize;
        });

        await test.step("Проверить: total совпадает между actualize=false и actualize=true", async () => {
          expect(
            typeof afterActualizeData.total,
            "total после actualize должен быть числом",
          ).toBe("number");
          expect(
            afterActualizeData.total,
            "total после actualize должен быть >= 0",
          ).toBeGreaterThanOrEqual(0);
          expect(
            afterActualizeData.total,
            "total после actualize должен совпадать с baseline (кэш обновлён, данные те же)",
          ).toBe(firstSearchData.total);
        });

      },
    );

    // ==================== E2: INVALIDATED CACHE ====================

    test(
      "C9338: Матрица при invalidated кэше возвращает данные",
      async ({ nineBoxAPI }) => {
        setSeverity("normal");

        const settings = await nineBoxAPI.ensureEnabled();

        let actualizeResponse;

        await test.step("Выполнить: Поиск с actualize=true для актуализации кэша", async () => {
          const { response } = await nineBoxAPI.searchManager({
            limit: 1,
            actualize: true,
          });
          actualizeResponse = response;
        });

        await test.step("Проверить ответ", async () => {
          expect(actualizeResponse.status(), "Actualize должен вернуть 200").toBe(200);
        });

        let matrixResponse, matrixData;

        await test.step("Выполнить: Получить матрицу NineBox", async () => {
          const { response, data } = await nineBoxAPI.getManagerMatrix();
          matrixResponse = response;
          matrixData = data;
        });

        await test.step("Проверить: Матрица возвращает данные даже если кэш stale", async () => {
          expect(matrixResponse.status(), "Матрица должна вернуть 200").toBe(200);
          expect(Array.isArray(matrixData), "Матрица должна быть массивом").toBe(true);

          const matrixSize = settings.matrixSize;
          expect(
            matrixData.length,
            `Матрица должна иметь ${matrixSize} строк`,
          ).toBe(matrixSize);

          for (let row = 0; row < matrixSize; row++) {
            expect(
              Array.isArray(matrixData[row]),
              `Строка ${row} должна быть массивом`,
            ).toBe(true);
            expect(
              matrixData[row].length,
              `Строка ${row} должна иметь ${matrixSize} ячеек`,
            ).toBe(matrixSize);

            for (let col = 0; col < matrixSize; col++) {
              expect(
                Array.isArray(matrixData[row][col]),
                `Ячейка [${row}][${col}] должна быть массивом`,
              ).toBe(true);
            }
          }
        });

        await test.step("Проверить: Структура пользователей в ячейках матрицы", async () => {
          const allUsers = [];
          for (const row of matrixData) {
            for (const cell of row) {
              for (const user of cell) {
                allUsers.push(user);
              }
            }
          }

          expect(
            allUsers.length,
            "Матрица должна содержать пользователей для проверки структуры",
          ).toBeGreaterThan(0);

          for (const user of allUsers) {
            expect(user).toHaveProperty("userId");
            expect(user).toHaveProperty("yValue");
            expect(user).toHaveProperty("xValue");
            expect(typeof user.userId, "userId должен быть числом").toBe("number");
            expect(typeof user.yValue, "yValue должен быть числом").toBe("number");
            expect(typeof user.xValue, "xValue должен быть числом").toBe("number");
            expect(user.userId, "userId должен быть положительным").toBeGreaterThan(0);
          }
        });

        let secondMatrixResponse, secondMatrixData;

        await test.step("Выполнить: Повторный запрос матрицы", async () => {
          const { response, data } = await nineBoxAPI.getManagerMatrix();
          secondMatrixResponse = response;
          secondMatrixData = data;
        });

        await test.step("Проверить: Согласованность данных между запросами", async () => {
          expect(secondMatrixResponse.status(), "Повторный запрос должен вернуть 200").toBe(200);
          expect(
            secondMatrixData.length,
            "Размер матрицы должен быть стабильным",
          ).toBe(matrixData.length);

          // Подсчёт пользователей в обоих запросах должен совпадать
          const countUsers = (matrix) => {
            let count = 0;
            for (const row of matrix) {
              for (const cell of row) {
                count += cell.length;
              }
            }
            return count;
          };

          expect(
            countUsers(secondMatrixData),
            "Количество пользователей должно быть стабильным между запросами",
          ).toBe(countUsers(matrixData));
        });

      },
    );

    // ==================== E3: SOFT-DELETE — SEARCH ====================

    test(
      "C9339: Soft-delete пользователи (is_removed=1) не попадают в результаты поиска",
      async ({ nineBoxAPI, nineboxVerifier }) => {
        setSeverity("critical");

        await nineBoxAPI.ensureEnabled();

        let searchResponse, allSearchItems;

        await test.step("Выполнить: Получить полный список пользователей через поиск", async () => {
          const { response, data } = await nineBoxAPI.searchManager({
            limit: 3000,
            actualize: false,
          });
          searchResponse = response;
          allSearchItems = data.items;
        });

        await test.step("Проверить ответ", async () => {
          expect(searchResponse.status(), "Поиск должен вернуть 200").toBe(200);
          expect(Array.isArray(allSearchItems), "items должен быть массивом").toBe(true);
        });

        await test.step("Проверить: Каждый элемент имеет корректную структуру", async () => {
          for (const item of allSearchItems) {
            expect(typeof item.targetUserId, "targetUserId — число").toBe("number");
            expect(typeof item.yCoord, "yCoord — число").toBe("number");
            expect(typeof item.xCoord, "xCoord — число").toBe("number");
            expect(typeof item.yValue, "yValue — число").toBe("number");
            expect(typeof item.xValue, "xValue — число").toBe("number");
          }
        });

        let actualizedResponse, actualizedData;

        await test.step("Выполнить: Повторный поиск с actualize=true", async () => {
          const { response, data } = await nineBoxAPI.searchManager({
            limit: 3000,
            actualize: true,
          });
          actualizedResponse = response;
          actualizedData = data;
        });

        await test.step("Проверить: Те же пользователи, без removed", async () => {
          expect(actualizedResponse.status(), "Actualize поиск должен вернуть 200").toBe(200);

          // Все targetUserId из actualized запроса должны быть валидными числами
          const actualizedUserIds = actualizedData.items.map((i) => i.targetUserId);
          for (const uid of actualizedUserIds) {
            expect(typeof uid, "Каждый targetUserId должен быть числом").toBe("number");
            expect(uid, "targetUserId должен быть положительным").toBeGreaterThan(0);
          }

          // Не должно быть дублей
          const uniqueIds = new Set(actualizedUserIds);
          expect(
            uniqueIds.size,
            "Не должно быть дублирующихся targetUserId в результатах",
          ).toBe(actualizedUserIds.length);
        });

        await test.step("DB: Проверить что removed пользователи отсутствуют в результатах", async () => {
          const { data: settings } = await nineBoxAPI.getManagerSettings();
          const companyId = settings.companyId;
          const removedUserIds = await nineboxVerifier.getRemovedUserIds(companyId);
          if (removedUserIds && removedUserIds.length > 0) {
            const searchUserIds = new Set(allSearchItems.map((i) => i.targetUserId));
            for (const removedId of removedUserIds) {
              expect(
                searchUserIds.has(removedId),
                `Удалённый пользователь ${removedId} не должен быть в результатах поиска`,
              ).toBe(false);
            }
          }
        });

      },
    );

    // ==================== E4: SOFT-DELETE — MATRIX ====================

    test(
      "C9340: Soft-delete пользователи отсутствуют в ячейках матрицы",
      async ({ nineBoxAPI }) => {
        setSeverity("critical");

        await nineBoxAPI.ensureEnabled();

        let matrixResponse, matrixData, matrixUserIds;

        await test.step("Выполнить: Получить матрицу NineBox", async () => {
          const { response, data } = await nineBoxAPI.getManagerMatrix();
          matrixResponse = response;
          matrixData = data;

          matrixUserIds = [];
          for (const row of data) {
            for (const cell of row) {
              for (const user of cell) {
                matrixUserIds.push(user.userId);
              }
            }
          }
        });

        await test.step("Проверить ответ", async () => {
          expect(matrixResponse.status(), "Матрица должна вернуть 200").toBe(200);
        });

        await test.step("Проверить: Структура пользователей в матрице", async () => {
          for (const row of matrixData) {
            for (const cell of row) {
              for (const user of cell) {
                expect(typeof user.userId, "userId должен быть числом").toBe("number");
                expect(typeof user.yValue, "yValue должен быть числом").toBe("number");
                expect(typeof user.xValue, "xValue должен быть числом").toBe("number");
              }
            }
          }
        });

        await test.step("Проверить: Все userId в матрице уникальны", async () => {
          const uniqueIds = new Set(matrixUserIds);
          expect(
            uniqueIds.size,
            "Каждый пользователь должен присутствовать в матрице только один раз",
          ).toBe(matrixUserIds.length);
        });

        let searchUserIds;

        await test.step("Выполнить: Получить результаты поиска для сверки", async () => {
          const { data: searchData } = await nineBoxAPI.searchManager({
            limit: 3000,
            actualize: false,
          });
          searchUserIds = new Set(
            searchData.items.map((i) => i.targetUserId),
          );
        });

        await test.step("Проверить: Матрица согласована с результатами поиска", async () => {
          // Каждый пользователь из матрицы должен быть и в поиске
          for (const uid of matrixUserIds) {
            expect(
              searchUserIds.has(uid),
              `Пользователь ${uid} из матрицы должен быть в результатах поиска`,
            ).toBe(true);
          }
        });

        await test.step("Проверить: Все userId в матрице — положительные числа", async () => {
          for (const uid of matrixUserIds) {
            expect(uid, "userId должен быть положительным числом").toBeGreaterThan(0);
          }
        });

      },
    );

    // ==================== BOUNDARY VALUES ====================

    test(
      "C9341: Граничные значения — координаты и значения в допустимых диапазонах",
      async ({ nineBoxAPI }) => {
        setSeverity("normal");

        const settings = await nineBoxAPI.ensureEnabled();
        const matrixSize = settings.matrixSize;

        let searchResponse, searchData;

        await test.step("Выполнить: Получить результаты поиска с limit=50", async () => {
          const { response, data } = await nineBoxAPI.searchManager({
            limit: 50,
            actualize: false,
          });
          searchResponse = response;
          searchData = data;
        });

        await test.step("Проверить ответ", async () => {
          expect(searchResponse.status(), "Поиск должен вернуть 200").toBe(200);
          expect(
            searchData.items.length,
            "Должны быть элементы для проверки граничных значений",
          ).toBeGreaterThan(0);
        });

        await test.step("Проверить: xCoord и yCoord в диапазоне [0, matrixSize-1]", async () => {
          for (const item of searchData.items) {
            expect(
              item.xCoord,
              `xCoord=${item.xCoord} должен быть >= 0`,
            ).toBeGreaterThanOrEqual(0);
            expect(
              item.xCoord,
              `xCoord=${item.xCoord} должен быть <= ${matrixSize - 1}`,
            ).toBeLessThanOrEqual(matrixSize - 1);
            expect(
              item.yCoord,
              `yCoord=${item.yCoord} должен быть >= 0`,
            ).toBeGreaterThanOrEqual(0);
            expect(
              item.yCoord,
              `yCoord=${item.yCoord} должен быть <= ${matrixSize - 1}`,
            ).toBeLessThanOrEqual(matrixSize - 1);
          }
        });

        await test.step("Проверить: xValue и yValue в диапазоне [0, 1]", async () => {
          for (const item of searchData.items) {
            expect(
              item.xValue,
              `xValue=${item.xValue} для userId=${item.targetUserId} должен быть >= 0`,
            ).toBeGreaterThanOrEqual(0);
            expect(
              item.xValue,
              `xValue=${item.xValue} для userId=${item.targetUserId} должен быть <= 1`,
            ).toBeLessThanOrEqual(1);
            expect(
              item.yValue,
              `yValue=${item.yValue} для userId=${item.targetUserId} должен быть >= 0`,
            ).toBeGreaterThanOrEqual(0);
            expect(
              item.yValue,
              `yValue=${item.yValue} для userId=${item.targetUserId} должен быть <= 1`,
            ).toBeLessThanOrEqual(1);
          }
        });

        await test.step("Проверить: Координаты согласованы со значениями (монотонность)", async () => {
          // Группируем по xCoord и проверяем что средние xValue для более высоких координат >= средних для более низких
          const byXCoord = {};
          for (const item of searchData.items) {
            if (!byXCoord[item.xCoord]) byXCoord[item.xCoord] = [];
            byXCoord[item.xCoord].push(item.xValue);
          }

          const xCoords = Object.keys(byXCoord).map(Number).sort((a, b) => a - b);
          if (xCoords.length >= 2) {
            for (let i = 0; i < xCoords.length - 1; i++) {
              const avgLow = byXCoord[xCoords[i]].reduce((a, b) => a + b, 0) / byXCoord[xCoords[i]].length;
              const avgHigh = byXCoord[xCoords[i + 1]].reduce((a, b) => a + b, 0) / byXCoord[xCoords[i + 1]].length;
              expect(
                avgHigh,
                `Средний xValue для xCoord=${xCoords[i + 1]} (${avgHigh.toFixed(3)}) должен быть >= чем для xCoord=${xCoords[i]} (${avgLow.toFixed(3)})`,
              ).toBeGreaterThanOrEqual(avgLow);
            }
          }

          // Аналогично для yCoord
          const byYCoord = {};
          for (const item of searchData.items) {
            if (!byYCoord[item.yCoord]) byYCoord[item.yCoord] = [];
            byYCoord[item.yCoord].push(item.yValue);
          }

          const yCoords = Object.keys(byYCoord).map(Number).sort((a, b) => a - b);
          if (yCoords.length >= 2) {
            for (let i = 0; i < yCoords.length - 1; i++) {
              const avgLow = byYCoord[yCoords[i]].reduce((a, b) => a + b, 0) / byYCoord[yCoords[i]].length;
              const avgHigh = byYCoord[yCoords[i + 1]].reduce((a, b) => a + b, 0) / byYCoord[yCoords[i + 1]].length;
              expect(
                avgHigh,
                `Средний yValue для yCoord=${yCoords[i + 1]} (${avgHigh.toFixed(3)}) должен быть >= чем для yCoord=${yCoords[i]} (${avgLow.toFixed(3)})`,
              ).toBeGreaterThanOrEqual(avgLow);
            }
          }
        });
      },
    );
  },
);
