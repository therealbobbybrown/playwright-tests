// @ts-check
import { test, expect } from "../../fixtures/full.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { assertSuccessStatus } from "../../utils/api/common-assertions.js";
import { NineBoxSeedHelper } from "../../utils/seed/index.js";
import { getCredentials } from "../../utils/api/index.js";

/**
 * API тесты для NineBox матрицы (переработанные)
 *
 * Покрытие:
 * - Настройки NineBox (manager, private) — структура ответа
 * - Обновление настроек — cellsTitles, enable/disable
 * - Матрица NineBox (manager, protected) — 3D array структура
 * - Поиск в матрице — пагинация, фильтры, координаты
 * - Доступные департаменты
 * - Негативные сценарии
 * - Интеграционные тесты
 */

// Seed данные — создаются один раз для всех тестов
let seedHelper;
let originalSettings;

test.describe(
  "NineBox API",
  { tag: ["@api", "@ninebox", "@regression"] },
  () => {
    // Serial mode: enable/disable тесты меняют глобальное состояние NineBox,
    // параллельный запуск вызывает flaky (403 вместо 200)
    test.describe.configure({ mode: "serial" });
    test.beforeEach(async ({ nineBoxAPI }, testInfo) => {
      markAsAPITest(MODULES.NINE_BOX, "NineBox API");
      // Гарантировать что NineBox включён перед каждым тестом
      await nineBoxAPI.ensureEnabled();
    });

    // ==================== SETTINGS ====================

    test.describe("GET /manager/ninebox-settings/ — Настройки (manager)", () => {
      test(
        "C5458: Получить настройки NineBox (manager) — проверить структуру ответа",
        { tag: ["@critical", "@smoke"] },
        async ({ nineBoxAPI }) => {
          setSeverity("critical");

          let response, data;
          await test.step("Выполнить запрос: Получить настройки NineBox (manager)", async () => {
            ({ response, data } = await nineBoxAPI.getManagerSettings());
          });

          await test.step("Проверить ответ", async () => {
            expect(response.status(), "Статус должен быть 200").toBe(200);
            expect(data, "Ответ должен содержать данные").toBeDefined();

            // Обязательные поля
            expect(data).toHaveProperty("id");
            expect(data).toHaveProperty("matrixSize");
            expect(data).toHaveProperty("cellsTitles");
            expect(data).toHaveProperty("isEnabled");
            expect(data).toHaveProperty("competences");
            expect(data).toHaveProperty("companyId");

            // Типы полей
            expect(typeof data.id, "id должен быть числом").toBe("number");
            expect(typeof data.matrixSize, "matrixSize должен быть числом").toBe("number");
            expect(typeof data.isEnabled, "isEnabled должен быть boolean").toBe("boolean");
            expect(typeof data.companyId, "companyId должен быть числом").toBe("number");
            expect(Array.isArray(data.cellsTitles), "cellsTitles должен быть массивом").toBe(true);
            expect(Array.isArray(data.competences), "competences должен быть массивом").toBe(true);


            // Структура cellsTitles
            const { cellsTitles, matrixSize } = data;
            expect(cellsTitles.length, `cellsTitles должен иметь ${matrixSize} строк`).toBe(matrixSize);
            for (const row of cellsTitles) {
              expect(Array.isArray(row), "Каждая строка cellsTitles должна быть массивом").toBe(true);
              expect(row.length, `Строка должна иметь ${matrixSize} столбцов`).toBe(matrixSize);
              for (const title of row) {
                expect(typeof title, "Каждое название ячейки должно быть строкой").toBe("string");
              }
            }

            // Структура competences
            expect(
              data.competences.length,
              "Должны быть настроены компетенции для проверки структуры",
            ).toBeGreaterThan(0);

            for (const comp of data.competences) {
              expect(comp).toHaveProperty("id");
              expect(comp).toHaveProperty("axis");
              expect(comp).toHaveProperty("competence");
              expect(comp).toHaveProperty("competenceId");
              expect(["x", "y"], `axis должен быть 'x' или 'y', получено '${comp.axis}'`).toContain(comp.axis);
              expect(typeof comp.id, "id должен быть числом").toBe("number");
              expect(typeof comp.competenceId, "competenceId должен быть числом").toBe("number");
              expect(comp.competence).toHaveProperty("id");
              expect(comp.competence).toHaveProperty("title");
              expect(typeof comp.competence.id, "competence.id должен быть числом").toBe("number");
              expect(typeof comp.competence.title, "competence.title должен быть строкой").toBe("string");
              expect(comp.competence.title.length, "competence.title не должен быть пустым").toBeGreaterThan(0);
            }
          });
        },
      );

      test("C5459: Получить настройки NineBox (private) — проверить структуру ответа", async ({
        nineBoxAPI,
      }) => {
        setSeverity("normal");

        let managerResp, managerData, privateResp, privateData;
        await test.step("Выполнить запрос: Получить настройки manager и private", async () => {
          ({ response: managerResp, data: managerData } =
            await nineBoxAPI.getManagerSettings());
          ({ response: privateResp, data: privateData } =
            await nineBoxAPI.getPrivateSettings());
        });

        await test.step("Проверить ответ", async () => {
          expect(privateResp.status(), "Private settings: статус 200").toBe(200);
          expect(privateData).toBeDefined();

          expect(privateData.matrixSize, "matrixSize должен совпадать").toBe(managerData.matrixSize);
          expect(privateData.isEnabled, "isEnabled должен совпадать").toBe(managerData.isEnabled);
          expect(privateData.cellsTitles, "cellsTitles должны совпадать").toEqual(managerData.cellsTitles);
          expect(privateData.companyId, "companyId должен совпадать").toBe(managerData.companyId);
        });
      });
    });

    test.describe("POST /manager/ninebox-settings/ — Обновление настроек", () => {
      test("C5460: Обновить названия ячеек матрицы", async ({ nineBoxAPI, nineboxVerifier }) => {
        setSeverity("normal");

        // Сохраняем текущие настройки для восстановления
        const { data: before } = await nineBoxAPI.getManagerSettings();
        const originalTitles = before.cellsTitles;
        const companyId = before.companyId;
        const xIds = before.competences.filter((c) => c.axis === "x").map((c) => c.competenceId);
        const yIds = before.competences.filter((c) => c.axis === "y").map((c) => c.competenceId);

        const customTitles = [
          ["Тест-Low-Low", "Тест-Low-Mid", "Тест-Low-High"],
          ["Тест-Mid-Low", "Тест-Mid-Mid", "Тест-Mid-High"],
          ["Тест-High-Low", "Тест-High-Mid", "Тест-High-High"],
        ];

        try {
          await test.step("Выполнить запрос: Обновить cellsTitles", async () => {
            const { response } = await nineBoxAPI.updateSettings({
              matrixSize: before.matrixSize,
              cellsTitles: customTitles,
              xCompetenciesIds: xIds,
              yCompetenciesIds: yIds,
            });

            expect(response.status(), "Обновление должно вернуть 200").toBe(200);
          });

          await test.step("Проверить: Названия ячеек обновились", async () => {
            const { data: after } = await nineBoxAPI.getManagerSettings();
            expect(after.cellsTitles, "cellsTitles должны совпадать с отправленными").toEqual(customTitles);
          });

          await test.step("DB: Проверить cellsTitles в БД", async () => {
            await nineboxVerifier.verifyCellsTitles(companyId, customTitles);
          });
        } finally {
          // Восстановить оригинальные cellsTitles
          await nineBoxAPI.updateSettings({
            matrixSize: before.matrixSize,
            cellsTitles: originalTitles,
            xCompetenciesIds: xIds,
            yCompetenciesIds: yIds,
          });
        }
      });
    });

    test.describe("POST /manager/ninebox-settings/enable|disable — Включение/выключение", () => {
      test("C5461: Включить NineBox — проверить изменение состояния", async ({
        nineBoxAPI,
        nineboxVerifier,
      }) => {
        setSeverity("normal");

        // Запоминаем начальное состояние
        const { data: before } = await nineBoxAPI.getManagerSettings();
        const companyId = before.companyId;
        const wasEnabled = before.isEnabled;

        // Если уже включён — отключаем, потом включаем
        if (wasEnabled) {
          await nineBoxAPI.disable();
        }

        await test.step("Выполнить запрос: Включить NineBox", async () => {
          const { response } = await nineBoxAPI.enable();
          expect(response.status(), "Enable должен вернуть 200").toBe(200);
        });

        await test.step("Проверить: NineBox включён", async () => {
          const { data } = await nineBoxAPI.getManagerSettings();
          expect(data.isEnabled, "isEnabled должен быть true").toBe(true);
        });

        await test.step("DB: Проверить isEnabled в БД", async () => {
          await nineboxVerifier.verifyEnabled(companyId);
        });

        // NineBox остаётся включён — безопасно для параллельных тестов
      });

      test("C5462: Отключить NineBox — проверить изменение состояния", async ({
        nineBoxAPI,
        nineboxVerifier,
      }) => {
        setSeverity("normal");

        const { data: before } = await nineBoxAPI.getManagerSettings();
        const companyId = before.companyId;

        // Если не включён — включаем, потом отключаем
        if (!before.isEnabled) {
          await nineBoxAPI.enable();
        }

        try {
          await test.step("Выполнить запрос: Отключить NineBox", async () => {
            const { response } = await nineBoxAPI.disable();
            expect(response.status(), "Disable должен вернуть 200").toBe(200);
          });

          await test.step("Проверить: NineBox отключён", async () => {
            const { data } = await nineBoxAPI.getManagerSettings();
            expect(data.isEnabled, "isEnabled должен быть false").toBe(false);
          });

          await test.step("DB: Проверить isEnabled=0 в БД", async () => {
            await nineboxVerifier.verifyDisabled(companyId);
          });
        } finally {
          // Всегда восстанавливать NineBox в enabled — другие тесты зависят от этого
          await nineBoxAPI.enable();
        }
      });
    });

    // ==================== MATRIX (Manager) ====================

    test.describe("POST /manager/ninebox/get/ — Матрица (manager)", () => {
      test(
        "C5463: Получить матрицу NineBox (manager) — проверить 3D структуру",
        { tag: ["@critical"] },
        async ({ nineBoxAPI }) => {
          setSeverity("critical");

          // Убедиться что NineBox включён
          const settings = await nineBoxAPI.ensureEnabled();

          let response, data;
          await test.step("Выполнить запрос: Получить матрицу NineBox (manager)", async () => {
            ({ response, data } = await nineBoxAPI.getManagerMatrix());
            // Защита от гонки: параллельный тест мог отключить NineBox
            if (response.status() === 403) {
              await nineBoxAPI.ensureEnabled();
              ({ response, data } = await nineBoxAPI.getManagerMatrix());
            }
          });

          await test.step("Проверить ответ", async () => {
            expect(response.status(), "Статус должен быть 200").toBe(200);
            expect(Array.isArray(data), "Ответ должен быть массивом (матрица)").toBe(true);

            const matrixSize = settings.matrixSize;
            expect(data.length, `Матрица должна иметь ${matrixSize} строк`).toBe(matrixSize);

            for (let row = 0; row < matrixSize; row++) {
              expect(Array.isArray(data[row]), `Строка ${row} должна быть массивом`).toBe(true);
              expect(data[row].length, `Строка ${row} должна иметь ${matrixSize} ячеек`).toBe(matrixSize);

              for (let col = 0; col < matrixSize; col++) {
                expect(Array.isArray(data[row][col]), `Ячейка [${row}][${col}] должна быть массивом`).toBe(true);
              }
            }

            // Проверить структуру пользователей в ячейках
            const allUsers = [];
            for (const row of data) {
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

        },
      );

      test("C5464: Получить матрицу с фильтром по userIds", async ({ nineBoxAPI }) => {
        setSeverity("normal");

        await nineBoxAPI.ensureEnabled();

        // Сначала получим матрицу без фильтра, чтобы знать userId
        const { data: fullMatrix } = await nineBoxAPI.getManagerMatrix();
        const allUserIds = [];
        for (const row of fullMatrix) {
          for (const cell of row) {
            for (const user of cell) {
              allUserIds.push(user.userId);
            }
          }
        }

        expect(
          allUserIds.length,
          "Матрица должна содержать пользователей для проверки фильтрации по userIds",
        ).toBeGreaterThan(0);

        const filterIds = allUserIds.slice(0, 2);
        let response, data;
        await test.step("Выполнить запрос: Получить матрицу с фильтром по userIds", async () => {
          ({ response, data } = await nineBoxAPI.getManagerMatrix({
            usersIds: filterIds,
          }));
        });

        await test.step("Проверить ответ", async () => {
          expect(response.status()).toBe(200);

          // Собрать всех пользователей из фильтрованной матрицы
          const filteredUserIds = [];
          for (const row of data) {
            for (const cell of row) {
              for (const user of cell) {
                filteredUserIds.push(user.userId);
              }
            }
          }

          // Каждый пользователь должен быть из запрошенных
          for (const uid of filteredUserIds) {
            expect(filterIds, `userId ${uid} должен быть в запрошенных`).toContain(uid);
          }
        });
      });
    });

    // ==================== SEARCH (Manager) ====================

    test.describe("POST /manager/ninebox/search/get/ — Поиск (manager)", () => {
      test(
        "C5465: Поиск в матрице NineBox — проверить пагинацию",
        { tag: ["@critical"] },
        async ({ nineBoxAPI }) => {
          setSeverity("critical");

          await nineBoxAPI.ensureEnabled();

          let response, data;
          await test.step("Выполнить запрос: Поиск в матрице NineBox", async () => {
            ({ response, data } = await nineBoxAPI.searchManager({
              limit: 10,
              actualize: false,
            }));
          });

          await test.step("Проверить ответ", async () => {
            expect(response.status(), "Статус должен быть 200").toBe(200);
            expect(data).toHaveProperty("items");
            expect(data).toHaveProperty("limit");
            expect(data).toHaveProperty("offset");
            expect(data).toHaveProperty("total");
            expect(Array.isArray(data.items), "items должен быть массивом").toBe(true);
            expect(typeof data.total, "total должен быть числом").toBe("number");
            expect(data.items.length, "items.length <= limit").toBeLessThanOrEqual(10);

            expect(
              data.items.length,
              "Матрица должна содержать данные для проверки структуры элементов",
            ).toBeGreaterThan(0);

            for (const item of data.items) {
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
        },
      );

      test("C5466: Поиск с фильтром по координатам ячейки", async ({ nineBoxAPI }) => {
        setSeverity("normal");

        await nineBoxAPI.ensureEnabled();

        // Сначала найдём ячейку с данными
        const { data: allData } = await nineBoxAPI.searchManager({
          limit: 50,
          actualize: false,
        });

        expect(
          allData.items.length,
          "Матрица должна содержать данные для проверки координат",
        ).toBeGreaterThan(0);

        const targetCoord = allData.items[0];

        let response, data;
        await test.step(`Выполнить запрос: Поиск по координатам [${targetCoord.xCoord}, ${targetCoord.yCoord}]`, async () => {
          ({ response, data } = await nineBoxAPI.searchManager({
            limit: 50,
            actualize: false,
            xCoord: targetCoord.xCoord,
            yCoord: targetCoord.yCoord,
          }));
        });

        await test.step("Проверить ответ", async () => {
          expect(response.status()).toBe(200);

          for (const item of data.items) {
            expect(item.xCoord, "xCoord должен совпадать с фильтром").toBe(targetCoord.xCoord);
            expect(item.yCoord, "yCoord должен совпадать с фильтром").toBe(targetCoord.yCoord);
          }
        });
      });

      test("C5467: Поиск с текстовым запросом", async ({ nineBoxAPI }) => {
        setSeverity("normal");

        await nineBoxAPI.ensureEnabled();

        let response, data;
        await test.step("Выполнить запрос: Поиск с текстовым запросом q='test'", async () => {
          ({ response, data } = await nineBoxAPI.searchManager({
            limit: 10,
            actualize: false,
            q: "test",
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
      });
    });

    // ==================== MATRIX (Protected) ====================

    test.describe("POST /protected/ninebox/get/ — Матрица (protected)", () => {
      test("C5468: Получить матрицу NineBox (protected) — 3D массив", async ({
        nineBoxAPI,
      }) => {
        setSeverity("normal");

        const settings = await nineBoxAPI.ensureEnabled();

        let response, data;
        await test.step("Выполнить запрос: Получить protected матрицу с usersSubset=all", async () => {
          ({ response, data } = await nineBoxAPI.getProtectedMatrix({
            usersSubset: "all",
          }));
        });

        await test.step("Проверить ответ", async () => {
          expect(response.status(), "Статус 200").toBe(200);
          expect(Array.isArray(data), "Ответ — 3D массив").toBe(true);

          const matrixSize = settings.matrixSize;
          expect(data.length, `${matrixSize} строк`).toBe(matrixSize);
        });
      });

      test("C5469: Получить матрицу с фильтром по департаментам", async ({
        nineBoxAPI,
      }) => {
        setSeverity("normal");

        await nineBoxAPI.ensureEnabled();

        const settings = await nineBoxAPI.ensureEnabled();

        let response, data;
        await test.step("Выполнить запрос: Получить матрицу с фильтром по департаментам", async () => {
          ({ response, data } = await nineBoxAPI.getProtectedMatrix({
            usersSubset: "all",
            departmentsIds: [],
          }));
        });

        await test.step("Проверить ответ", async () => {
          expect(response.status()).toBe(200);
          expect(Array.isArray(data), "Ответ должен быть массивом (матрица)").toBe(true);

          const matrixSize = settings.matrixSize;
          expect(data.length, `Матрица должна иметь ${matrixSize} строк`).toBe(matrixSize);

          for (let row = 0; row < matrixSize; row++) {
            expect(Array.isArray(data[row]), `Строка ${row} должна быть массивом`).toBe(true);
            expect(data[row].length, `Строка ${row} должна иметь ${matrixSize} ячеек`).toBe(matrixSize);
          }
        });
      });
    });

    test.describe("POST /protected/ninebox/search/get/ — Поиск (protected)", () => {
      test("C5470: Поиск в матрице NineBox (protected)", async ({
        nineBoxAPI,
      }) => {
        setSeverity("normal");

        await nineBoxAPI.ensureEnabled();

        let response, data;
        await test.step("Выполнить запрос: Поиск в матрице NineBox (protected)", async () => {
          ({ response, data } = await nineBoxAPI.searchProtected({
            limit: 10,
            actualize: false,
            usersSubset: "all",
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
          expect(data.total, "total должен быть >= 0").toBeGreaterThanOrEqual(0);
          expect(data.items.length, "items.length <= limit").toBeLessThanOrEqual(10);
        });
      });
    });

    test.describe("POST /protected/ninebox/available-departments/search/get/ — Департаменты", () => {
      test("C5471: Получить доступные департаменты — проверить структуру", async ({
        nineBoxAPI,
      }) => {
        setSeverity("normal");

        await nineBoxAPI.ensureEnabled();

        let response, data;
        await test.step("Выполнить запрос: Получить доступные департаменты", async () => {
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
            expect(typeof dept.id, "id — число").toBe("number");
            expect(typeof dept.title, "title — строка").toBe("string");
            expect(dept.title.length, "title не должен быть пустым").toBeGreaterThan(0);
          }
        });
      });

      test("C5472: Поиск департаментов по названию", async ({ nineBoxAPI }) => {
        setSeverity("normal");

        await nineBoxAPI.ensureEnabled();

        let response, data;
        await test.step("Выполнить запрос: Поиск департаментов по названию", async () => {
          ({ response, data } = await nineBoxAPI.getAvailableDepartments({
            limit: 10,
            actualize: false,
            usersSubset: "all",
            q: "test",
          }));
        });

        await test.step("Проверить ответ", async () => {
          expect(response.status()).toBe(200);
          expect(data).toHaveProperty("items");
          expect(data).toHaveProperty("total");
          expect(data).toHaveProperty("limit");
          expect(Array.isArray(data.items), "items должен быть массивом").toBe(true);
          expect(typeof data.total, "total должен быть числом").toBe("number");
          expect(data.total, "total должен быть >= 0").toBeGreaterThanOrEqual(0);
          expect(data.items.length, "items.length <= limit").toBeLessThanOrEqual(10);
        });
      });
    });

    // ==================== NEGATIVE TESTS ====================

    test.describe("Негативные сценарии", () => {
      test("C5473: Поиск с невалидными координатами", async ({
        nineBoxAPI,
      }) => {
        setSeverity("normal");

        await nineBoxAPI.ensureEnabled();

        let response, data;
        await test.step("Выполнить запрос: Поиск с отрицательными координатами", async () => {
          ({ response, data } = await nineBoxAPI.searchManager({
            xCoord: -1,
            yCoord: -1,
            limit: 10,
            actualize: false,
          }));
        });

        await test.step("Проверить ответ", async () => {
          // API может вернуть 200 с пустым списком или 400
          expect([200, 400]).toContain(response.status());
          if (response.status() === 200) {
            expect(data.items.length, "Не должно быть результатов").toBe(0);
          }
        });
      });

      test("C5474: Обновить настройки с невалидным размером матрицы (100)", async ({
        nineBoxAPI,
      }) => {
        setSeverity("normal");

        let response;
        await test.step("Выполнить запрос: Обновить настройки с matrixSize=100", async () => {
          ({ response } = await nineBoxAPI.updateSettings({
            matrixSize: 100,
          }));
        });

        await test.step("Проверить ответ", async () => {
          expect(response.status(), "Невалидный matrixSize должен вернуть 400").toBe(400);
        });
      });

      test("C5475: Поиск с координатами вне диапазона матрицы", async ({
        nineBoxAPI,
      }) => {
        setSeverity("normal");

        await nineBoxAPI.ensureEnabled();

        let response, data;
        await test.step("Выполнить запрос: Поиск с координатами 999,999", async () => {
          ({ response, data } = await nineBoxAPI.searchManager({
            xCoord: 999,
            yCoord: 999,
            limit: 10,
            actualize: false,
          }));
        });

        await test.step("Проверить ответ", async () => {
          if (response.status() === 200) {
            expect(data.items.length, "Не должно быть результатов за пределами матрицы").toBe(0);
          } else {
            expect(response.status()).toBe(400);
          }
        });
      });

      test("C5476: Обновить настройки с отрицательным размером матрицы", async ({
        nineBoxAPI,
      }) => {
        setSeverity("normal");

        let response;
        await test.step("Выполнить запрос: Обновить настройки с matrixSize=-1", async () => {
          ({ response } = await nineBoxAPI.updateSettings({
            matrixSize: -1,
          }));
        });

        await test.step("Проверить ответ", async () => {
          expect(response.status()).toBe(400);
        });
      });

      test("C5477: Обновить настройки с нулевым размером матрицы", async ({
        nineBoxAPI,
      }) => {
        setSeverity("normal");

        let response;
        await test.step("Выполнить запрос: Обновить настройки с matrixSize=0", async () => {
          ({ response } = await nineBoxAPI.updateSettings({
            matrixSize: 0,
          }));
        });

        await test.step("Проверить ответ", async () => {
          expect(response.status()).toBe(400);
        });
      });

      test("C5478: Поиск с пустым текстовым запросом", async ({
        nineBoxAPI,
      }) => {
        setSeverity("normal");

        await nineBoxAPI.ensureEnabled();

        // Получить baseline — полный поиск без q
        const { data: baseline } = await nineBoxAPI.searchManager({
          limit: 10,
          actualize: false,
        });

        let response, data;
        await test.step("Выполнить запрос: Поиск с пустым текстовым запросом q=''", async () => {
          ({ response, data } = await nineBoxAPI.searchManager({
            limit: 10,
            actualize: false,
            q: "",
          }));
        });

        await test.step("Проверить ответ", async () => {
          expect(response.status()).toBe(200);
          expect(data).toHaveProperty("items");
          expect(data).toHaveProperty("total");
          expect(Array.isArray(data.items), "items должен быть массивом").toBe(true);
          expect(typeof data.total, "total должен быть числом").toBe("number");
          expect(
            data.total,
            "Пустой q должен вернуть столько же результатов, сколько без q",
          ).toBe(baseline.total);
        });
      });

      test("C5315: Поиск со специальными символами (XSS)", async ({ nineBoxAPI }) => {
        setSeverity("normal");

        await nineBoxAPI.ensureEnabled();

        let response, data;
        await test.step("Выполнить запрос: Поиск с XSS payload", async () => {
          ({ response, data } = await nineBoxAPI.searchManager({
            limit: 10,
            actualize: false,
            q: '<script>alert(1)</script>',
          }));
        });

        await test.step("Проверить ответ", async () => {
          expect(response.status(), "API должен безопасно обработать XSS").toBe(200);
          expect(data).toHaveProperty("items");
          expect(data).toHaveProperty("total");
          expect(Array.isArray(data.items), "items должен быть массивом").toBe(true);
          expect(typeof data.total, "total должен быть числом").toBe("number");
        });
      });

      test("C5480: Получить матрицу с очень большим списком userIds", async ({
        nineBoxAPI,
      }) => {
        setSeverity("normal");

        await nineBoxAPI.ensureEnabled();

        const settings = await nineBoxAPI.ensureEnabled();

        const largeUserIds = Array.from({ length: 100 }, (_, i) => i + 1);
        let response, data;
        await test.step("Выполнить запрос: Получить матрицу с 100 userIds", async () => {
          ({ response, data } = await nineBoxAPI.getManagerMatrix({
            usersIds: largeUserIds,
          }));
        });

        await test.step("Проверить ответ", async () => {
          expect(response.status()).toBe(200);
          expect(Array.isArray(data), "Ответ должен быть массивом").toBe(true);

          const matrixSize = settings.matrixSize;
          expect(data.length, `Матрица должна иметь ${matrixSize} строк`).toBe(matrixSize);

          for (let row = 0; row < matrixSize; row++) {
            expect(Array.isArray(data[row]), `Строка ${row} должна быть массивом`).toBe(true);
            expect(data[row].length, `Строка ${row} должна иметь ${matrixSize} ячеек`).toBe(matrixSize);
            for (let col = 0; col < matrixSize; col++) {
              expect(Array.isArray(data[row][col]), `Ячейка [${row}][${col}] должна быть массивом`).toBe(true);
            }
          }
        });
      });

      test("C9336: Получить матрицу при отключённом NineBox — ожидаем 403", async ({
        nineBoxAPI,
      }) => {
        setSeverity("normal");

        const { data: settings } = await nineBoxAPI.getManagerSettings();
        if (settings.isEnabled) {
          await nineBoxAPI.disable();
        }

        try {
          let response, data;
          await test.step("Выполнить запрос: Получить матрицу при отключённом NineBox", async () => {
            ({ response, data } = await nineBoxAPI.getManagerMatrix());
          });

          await test.step("Проверить ответ", async () => {
            expect(response.status(), "Disabled NineBox должен вернуть 403").toBe(403);
            const errorText = typeof data === 'string' ? data : JSON.stringify(data);
            expect(errorText.toLowerCase(), "Ответ 403 должен содержать 'disabled'").toContain('disabled');
          });
        } finally {
          // Всегда восстанавливать NineBox в enabled — другие тесты зависят от этого
          await nineBoxAPI.enable();
        }
      });
    });

    // ==================== INTEGRATION TESTS ====================

    test.describe("Интеграционные тесты", () => {
      test(
        "C5481: Согласованность настроек manager и private API",
        { tag: ["@critical"] },
        async ({ nineBoxAPI }) => {
          setSeverity("critical");

          // Стабилизировать состояние перед сравнением
          await nineBoxAPI.ensureEnabled();

          let mResp, mData, pResp, pData;
          await test.step("Выполнить запрос: Получить настройки manager и private", async () => {
            ({ response: mResp, data: mData } = await nineBoxAPI.getManagerSettings());
            ({ response: pResp, data: pData } = await nineBoxAPI.getPrivateSettings());
          });

          await test.step("Проверить: Все поля совпадают", async () => {
            expect(mResp.status()).toBe(200);
            expect(pResp.status()).toBe(200);

            expect(pData.matrixSize).toBe(mData.matrixSize);
            expect(pData.isEnabled).toBe(mData.isEnabled);
            expect(pData.cellsTitles).toEqual(mData.cellsTitles);
            expect(pData.companyId).toBe(mData.companyId);
            expect(pData.competences.length).toBe(mData.competences.length);
          });
        },
      );

      test("C5482: Получить матрицу и выполнить поиск — согласованность данных", async ({
        nineBoxAPI,
      }) => {
        setSeverity("normal");

        await nineBoxAPI.ensureEnabled();

        let matrix, search;
        await test.step("Выполнить запрос: Получить матрицу и результаты поиска", async () => {
          ({ data: matrix } = await nineBoxAPI.getManagerMatrix());
          ({ data: search } = await nineBoxAPI.searchManager({
            limit: 100,
            actualize: false,
          }));
        });

        await test.step("Проверить: Количество пользователей в матрице совпадает с total в поиске", async () => {
          let matrixUserCount = 0;
          for (const row of matrix) {
            for (const cell of row) {
              matrixUserCount += cell.length;
            }
          }
          expect(matrixUserCount, "Количество пользователей должно совпадать").toBe(search.total);
        });
      });

      test("C5483: Проверить все координаты матрицы 3x3", async ({
        nineBoxAPI,
      }) => {
        setSeverity("normal");

        const settings = await nineBoxAPI.ensureEnabled();
        const matrixSize = settings.matrixSize;

        // Если matrixSize != 3 (другой тест мог изменить), восстановить
        if (matrixSize !== 3) {
          console.log(`matrixSize=${matrixSize}, восстанавливаем до 3`);
          const xIds = settings.competences.filter((c) => c.axis === "x").map((c) => c.competenceId);
          const yIds = settings.competences.filter((c) => c.axis === "y").map((c) => c.competenceId);
          await nineBoxAPI.updateSettings({
            matrixSize: 3,
            cellsTitles: [["R0C0","R0C1","R0C2"],["R1C0","R1C1","R1C2"],["R2C0","R2C1","R2C2"]],
            xCompetenciesIds: xIds,
            yCompetenciesIds: yIds,
          });
        }

        let totalUsersAcrossCells = 0;

        await test.step(`Выполнить запрос: Поиск по каждой из ${matrixSize * matrixSize} ячеек`, async () => {
          for (let x = 0; x < matrixSize; x++) {
            for (let y = 0; y < matrixSize; y++) {
              const { response, data } = await nineBoxAPI.searchManager({
                xCoord: x,
                yCoord: y,
                limit: 100,
                actualize: false,
              });
              expect(response.status(), `Ячейка [${x},${y}] должна быть доступна`).toBe(200);
              expect(Array.isArray(data.items), `items для ячейки [${x},${y}] — массив`).toBe(true);
              expect(typeof data.total, `total для ячейки [${x},${y}] — число`).toBe("number");

              // Все элементы в ячейке должны иметь корректные координаты
              for (const item of data.items) {
                expect(item.xCoord, `xCoord для ячейки [${x},${y}]`).toBe(x);
                expect(item.yCoord, `yCoord для ячейки [${x},${y}]`).toBe(y);
              }
              totalUsersAcrossCells += data.total;
            }
          }
        });

        await test.step("Проверить: Сумма пользователей по ячейкам совпадает с общим total", async () => {
          const { data: allSearch } = await nineBoxAPI.searchManager({
            limit: 1,
            actualize: false,
          });
          expect(
            totalUsersAcrossCells,
            "Сумма total по всем ячейкам должна совпадать с общим total",
          ).toBe(allSearch.total);
        });
      });

      test("C5484: Manager vs protected матрица — согласованность", async ({
        nineBoxAPI,
      }) => {
        setSeverity("normal");

        await nineBoxAPI.ensureEnabled();

        let mMatrix, pMatrix;
        await test.step("Выполнить запрос: Получить manager и protected матрицы", async () => {
          ({ data: mMatrix } = await nineBoxAPI.getManagerMatrix());
          ({ data: pMatrix } = await nineBoxAPI.getProtectedMatrix({
            usersSubset: "all",
          }));
        });

        await test.step("Проверить: Матрицы имеют одинаковую размерность и данные", async () => {
          expect(mMatrix.length, "Количество строк должно совпадать").toBe(pMatrix.length);
          for (let i = 0; i < mMatrix.length; i++) {
            expect(mMatrix[i].length, `Строка ${i}: количество ячеек совпадает`).toBe(pMatrix[i].length);
          }

          // Подсчёт пользователей
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
            countUsers(mMatrix),
            "Количество пользователей в manager и protected матрицах (usersSubset=all) должно совпадать",
          ).toBe(countUsers(pMatrix));
        });
      });

      test("C5485: Поиск в manager и protected API — сравнение", async ({ nineBoxAPI }) => {
        setSeverity("normal");

        await nineBoxAPI.ensureEnabled();

        let mSearch, pSearch;
        await test.step("Выполнить запрос: Поиск через manager и protected API", async () => {
          ({ data: mSearch } = await nineBoxAPI.searchManager({
            limit: 50,
            actualize: false,
          }));
          ({ data: pSearch } = await nineBoxAPI.searchProtected({
            limit: 50,
            actualize: false,
            usersSubset: "all",
          }));
        });

        await test.step("Проверить ответ", async () => {
          expect(mSearch).toHaveProperty("items");
          expect(mSearch).toHaveProperty("total");
          expect(mSearch).toHaveProperty("limit");
          expect(mSearch).toHaveProperty("offset");
          expect(pSearch).toHaveProperty("items");
          expect(pSearch).toHaveProperty("total");
          expect(pSearch).toHaveProperty("limit");
          expect(pSearch).toHaveProperty("offset");
          expect(Array.isArray(mSearch.items), "manager items — массив").toBe(true);
          expect(Array.isArray(pSearch.items), "protected items — массив").toBe(true);
          expect(typeof mSearch.total, "manager total — число").toBe("number");
          expect(typeof pSearch.total, "protected total — число").toBe("number");
          expect(mSearch.total, "manager total >= 0").toBeGreaterThanOrEqual(0);
          expect(pSearch.total, "protected total >= 0").toBeGreaterThanOrEqual(0);
          expect(
            pSearch.total,
            "Protected total (usersSubset=all) должен совпадать с manager total",
          ).toBe(mSearch.total);
        });
      });
    });

    // ==================== EDGE CASES ====================

    test.describe("Граничные случаи", () => {
      test("C5486: Множественные запросы настроек подряд — стабильность", async ({
        nineBoxAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: 5 запросов настроек подряд и проверить стабильность", async () => {
          const results = [];
          for (let i = 0; i < 5; i++) {
            const { response, data } = await nineBoxAPI.getManagerSettings();
            results.push({ status: response.status(), isEnabled: data.isEnabled, matrixSize: data.matrixSize });
          }

          const statuses = [...new Set(results.map((r) => r.status))];
          expect(statuses.length, "Все запросы должны вернуть одинаковый статус").toBe(1);
          expect(statuses[0]).toBe(200);

          // Данные также стабильны
          const sizes = [...new Set(results.map((r) => r.matrixSize))];
          expect(sizes.length, "matrixSize стабилен").toBe(1);

          const enabledStates = [...new Set(results.map((r) => r.isEnabled))];
          expect(enabledStates.length, "isEnabled стабилен").toBe(1);
        });
      });

      test("C5487: Поиск с разными параметрами пагинации", async ({
        nineBoxAPI,
      }) => {
        setSeverity("normal");

        await nineBoxAPI.ensureEnabled();

        const limits = [1, 5, 10, 50];

        // Получить baseline total для кросс-проверки
        const { data: baseline } = await nineBoxAPI.searchManager({
          limit: 1,
          actualize: false,
        });
        const expectedTotal = baseline.total;

        await test.step("Выполнить: Поиск с разными параметрами пагинации и проверить стабильность", async () => {
          for (const limit of limits) {
            const { response, data } = await nineBoxAPI.searchManager({
              limit,
              actualize: false,
            });

            expect(response.status()).toBe(200);
            expect(data.items.length, `items.length <= ${limit}`).toBeLessThanOrEqual(limit);
            expect(data.limit, `data.limit должен быть ${limit}`).toBe(limit);
            expect(data.total, `total должен быть стабильным (${expectedTotal})`).toBe(expectedTotal);
            expect(Array.isArray(data.items), "items должен быть массивом").toBe(true);
          }
        });
      });

      test("C5488: Пагинация offset — нет пересечения страниц", async ({
        nineBoxAPI,
      }) => {
        setSeverity("normal");

        await nineBoxAPI.ensureEnabled();

        let { response: r1, data: page1 } = await nineBoxAPI.searchManager({
          limit: 5,
          offset: 0,
          actualize: false,
        });
        // Защита от гонки: параллельный тест мог отключить NineBox
        if (r1.status() === 403) {
          await nineBoxAPI.ensureEnabled();
          ({ response: r1, data: page1 } = await nineBoxAPI.searchManager({
            limit: 5, offset: 0, actualize: false,
          }));
        }
        const { data: page2 } = await nineBoxAPI.searchManager({
          limit: 5,
          offset: 5,
          actualize: false,
        });

        await test.step("Проверить: Страницы не пересекаются", async () => {
          expect(
            page1.items.length,
            "Первая страница должна содержать данные для проверки пагинации",
          ).toBeGreaterThan(0);

          // total должен быть одинаковым на обеих страницах
          expect(
            page1.total,
            "total на первой и второй страницах должен совпадать",
          ).toBe(page2.total);

          if (page1.total > 5) {
            // Достаточно данных для двух страниц — проверяем пересечение
            expect(
              page2.items.length,
              `Вторая страница должна содержать данные (total=${page1.total} > offset=5)`,
            ).toBeGreaterThan(0);

            const ids1 = new Set(page1.items.map((i) => i.targetUserId));
            const ids2 = page2.items.map((i) => i.targetUserId);
            for (const id of ids2) {
              expect(ids1.has(id), `targetUserId ${id} не должен быть на первой странице`).toBe(false);
            }
          } else {
            // Данных <= 5 — вторая страница должна быть пустой
            expect(
              page2.items.length,
              `total=${page1.total} <= offset=5, вторая страница должна быть пустой`,
            ).toBe(0);
          }
        });
      });

      test("C5489: Включить и выключить NineBox последовательно", async ({
        nineBoxAPI,
      }) => {
        setSeverity("normal");

        // Привести в известное состояние: отключено
        const { data: initial } = await nineBoxAPI.getManagerSettings();
        if (initial.isEnabled) {
          await nineBoxAPI.disable();
        }

        await test.step("Выполнить: Enable → Disable → Enable и проверить смену состояния", async () => {
          // Enable (из disabled)
          const { response: enableResp } = await nineBoxAPI.enable();
          expect(enableResp.status(), "Enable должен вернуть 200").toBe(200);
          const { data: afterEnable } = await nineBoxAPI.getManagerSettings();
          expect(afterEnable.isEnabled, "isEnabled должен быть true после enable").toBe(true);

          // Disable (из enabled)
          const { response: disableResp } = await nineBoxAPI.disable();
          expect(disableResp.status(), "Disable должен вернуть 200").toBe(200);
          const { data: afterDisable } = await nineBoxAPI.getManagerSettings();
          expect(afterDisable.isEnabled, "isEnabled должен быть false после disable").toBe(false);

          // Enable обратно (из disabled)
          const { response: reEnableResp } = await nineBoxAPI.enable();
          expect(reEnableResp.status(), "Re-enable должен вернуть 200").toBe(200);
          const { data: afterReEnable } = await nineBoxAPI.getManagerSettings();
          expect(afterReEnable.isEnabled, "isEnabled должен быть true после re-enable").toBe(true);
        });
      });
    });
  },
);
