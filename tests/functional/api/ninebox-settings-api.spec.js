// @ts-check
import { test, expect } from "../../fixtures/full.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

/**
 * API тесты для настроек NineBox
 *
 * Покрытие:
 * - Обновление компетенций осей X и Y с верификацией через GET
 * - Переключение enable/disable/enable — корректная смена состояния
 * - Обновление cellsTitles — кастомные названия сохраняются
 */

test.describe(
  "NineBox Settings API",
  { tag: ["@api", "@ninebox", "@regression"] },
  () => {
    // Serial mode: updateSettings тесты меняют глобальное состояние,
    // параллельный запуск вызывает flaky (перезапись настроек)
    test.describe.configure({ mode: "serial" });

    test.beforeEach(async ({}, testInfo) => {
      markAsAPITest(MODULES.NINE_BOX, "Settings Updates");
    });

    test(
      "C9374: Обновить компетенции осей X и Y — проверить ответ и повторный GET",
      async ({ nineBoxAPI, nineboxVerifier }) => {
        setSeverity("critical");

        // Получить текущие настройки
        const { response: getResp, data: before } =
          await nineBoxAPI.getManagerSettings();
        expect(getResp.status(), "GET settings: статус 200").toBe(200);
        expect(
          before.competences.length,
          "Должны быть настроены компетенции",
        ).toBeGreaterThan(0);

        const xCompsBefore = before.competences
          .filter((c) => c.axis === "x")
          .map((c) => c.competenceId);
        const yCompsBefore = before.competences
          .filter((c) => c.axis === "y")
          .map((c) => c.competenceId);

        expect(
          xCompsBefore.length,
          "Должна быть хотя бы 1 компетенция на оси X",
        ).toBeGreaterThan(0);
        expect(
          yCompsBefore.length,
          "Должна быть хотя бы 1 компетенция на оси Y",
        ).toBeGreaterThan(0);

        let postResp, postData;
        await test.step(
          "Выполнить запрос: Обновить настройки с теми же компетенциями",
          async () => {
            ({ response: postResp, data: postData } =
              await nineBoxAPI.updateSettings({
                matrixSize: before.matrixSize,
                cellsTitles: before.cellsTitles,
                xCompetenciesIds: xCompsBefore,
                yCompetenciesIds: yCompsBefore,
              }));
          },
        );

        await test.step("Проверить ответ", async () => {
          expect(postResp.status(), "POST settings: статус 200").toBe(200);
          expect(postData, "POST должен вернуть данные").toBeDefined();
          expect(postData).toHaveProperty("matrixSize");
          expect(postData).toHaveProperty("cellsTitles");
          expect(postData).toHaveProperty("competences");
          expect(postData).toHaveProperty("isEnabled");
          expect(postData).toHaveProperty("id");
          expect(postData.matrixSize, "matrixSize должен совпадать с отправленным").toBe(before.matrixSize);
          expect(postData.cellsTitles, "cellsTitles должны совпадать с отправленными").toEqual(before.cellsTitles);
          expect(Array.isArray(postData.competences), "competences — массив").toBe(true);
          expect(postData.competences.length, "Количество компетенций должно совпадать").toBe(before.competences.length);
        });

        await test.step(
          "Проверить: Компетенции совпадают с отправленными через повторный GET",
          async () => {
            const { response: verifyResp, data: after } =
              await nineBoxAPI.getManagerSettings();

            expect(verifyResp.status(), "Повторный GET: статус 200").toBe(200);

            const xCompsAfter = after.competences
              .filter((c) => c.axis === "x")
              .map((c) => c.competenceId)
              .sort();
            const yCompsAfter = after.competences
              .filter((c) => c.axis === "y")
              .map((c) => c.competenceId)
              .sort();

            expect(
              xCompsAfter,
              "Компетенции оси X должны совпадать",
            ).toEqual([...xCompsBefore].sort());
            expect(
              yCompsAfter,
              "Компетенции оси Y должны совпадать",
            ).toEqual([...yCompsBefore].sort());

            // Проверить структуру competences в ответе
            expect(
              after.competences.length,
              "Должны быть настроены компетенции для проверки структуры",
            ).toBeGreaterThan(0);

            for (const comp of after.competences) {
              expect(comp).toHaveProperty("id");
              expect(comp).toHaveProperty("axis");
              expect(comp).toHaveProperty("competence");
              expect(comp).toHaveProperty("competenceId");
              expect(typeof comp.id, "id должен быть числом").toBe("number");
              expect(typeof comp.competenceId, "competenceId должен быть числом").toBe("number");
              expect(
                ["x", "y"],
                `axis должен быть 'x' или 'y', получено '${comp.axis}'`,
              ).toContain(comp.axis);
              expect(comp.competence).toHaveProperty("id");
              expect(comp.competence).toHaveProperty("title");
              expect(typeof comp.competence.id, "competence.id должен быть числом").toBe("number");
              expect(typeof comp.competence.title, "competence.title должен быть строкой").toBe("string");
              expect(comp.competence.title.length, "competence.title не должен быть пустым").toBeGreaterThan(0);
            }
          },
        );

        await test.step("DB: Проверить компетенции осей в БД", async () => {
          const companyId = before.companyId;
          await nineboxVerifier.verifyAxisCompetencies(companyId, "x", xCompsBefore);
          await nineboxVerifier.verifyAxisCompetencies(companyId, "y", yCompsBefore);
        });
      },
    );

    test(
      "C9375: Переключить enable→disable→enable — состояние меняется",
      async ({ nineBoxAPI }) => {
        setSeverity("critical");

        // Запомнить начальное состояние
        const { data: initial } = await nineBoxAPI.getManagerSettings();
        const wasEnabled = initial.isEnabled;

        try {
          // Шаг 1: Убедиться что NineBox включён
          if (!wasEnabled) {
            await nineBoxAPI.enable();
          }

          await test.step("Подготовка: Убедиться что NineBox включён", async () => {
            const { data } = await nineBoxAPI.getManagerSettings();
            expect(data.isEnabled, "isEnabled должен быть true").toBe(true);
          });

          // Шаг 2: Отключить
          await test.step("Выполнить запрос: Отключить NineBox", async () => {
            const { response, data: disableData } = await nineBoxAPI.disable();
            expect(response.status(), "Disable: статус 200").toBe(200);
            expect(disableData, "Disable должен вернуть данные").toBeDefined();
          });

          await test.step(
            "Проверить: NineBox отключён после disable",
            async () => {
              const { data } = await nineBoxAPI.getManagerSettings();
              expect(data.isEnabled, "isEnabled должен быть false").toBe(false);
            },
          );

          // Шаг 3: Включить обратно
          await test.step("Выполнить запрос: Включить NineBox обратно", async () => {
            const { response, data: enableData } = await nineBoxAPI.enable();
            expect(response.status(), "Enable: статус 200").toBe(200);
            expect(enableData, "Enable должен вернуть данные").toBeDefined();
          });

          await test.step(
            "Проверить: NineBox включён после повторного enable",
            async () => {
              const { data } = await nineBoxAPI.getManagerSettings();
              expect(data.isEnabled, "isEnabled должен быть true").toBe(true);
            },
          );
        } finally {
          // Всегда оставлять NineBox включённым — другие тесты зависят от этого
          const { data: finalState } = await nineBoxAPI.getManagerSettings();
          if (!finalState.isEnabled) {
            await nineBoxAPI.enable();
          }
        }
      },
    );

    test(
      "C9376: Обновить cellsTitles — кастомные названия сохраняются",
      async ({ nineBoxAPI, nineboxVerifier }) => {
        setSeverity("normal");

        // Запомнить оригинальные настройки
        const { data: before } = await nineBoxAPI.getManagerSettings();
        const originalTitles = before.cellsTitles;
        const xIds = before.competences
          .filter((c) => c.axis === "x")
          .map((c) => c.competenceId);
        const yIds = before.competences
          .filter((c) => c.axis === "y")
          .map((c) => c.competenceId);

        const customTitles = [
          ["Кастом-Верх-Лев", "Кастом-Верх-Сред", "Кастом-Верх-Прав"],
          ["Кастом-Сред-Лев", "Кастом-Сред-Сред", "Кастом-Сред-Прав"],
          ["Кастом-Низ-Лев", "Кастом-Низ-Сред", "Кастом-Низ-Прав"],
        ];

        try {
          await test.step("Выполнить запрос: Обновить cellsTitles кастомными значениями", async () => {
            const { response } = await nineBoxAPI.updateSettings({
              matrixSize: before.matrixSize,
              cellsTitles: customTitles,
              xCompetenciesIds: xIds,
              yCompetenciesIds: yIds,
            });

            expect(response.status(), "Обновление cellsTitles: статус 200").toBe(
              200,
            );
          });

          await test.step(
            "Проверить: Названия ячеек совпадают с отправленными",
            async () => {
              const { data: after } = await nineBoxAPI.getManagerSettings();
              expect(
                after.cellsTitles,
                "cellsTitles должны совпадать с кастомными",
              ).toEqual(customTitles);

              // Проверить каждую ячейку отдельно для информативности
              for (let row = 0; row < customTitles.length; row++) {
                for (let col = 0; col < customTitles[row].length; col++) {
                  expect(
                    after.cellsTitles[row][col],
                    `Ячейка [${row}][${col}] должна быть "${customTitles[row][col]}"`,
                  ).toBe(customTitles[row][col]);
                }
              }
            },
          );

          await test.step("DB: Проверить cellsTitles в БД", async () => {
            await nineboxVerifier.verifyCellsTitles(before.companyId, customTitles);
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
      },
    );

    test(
      "C9377: Изменить размер матрицы 3->4 и проверить структуру",
      async ({ nineBoxAPI }) => {
        setSeverity("normal");

        // Запомнить оригинальные настройки для восстановления
        const { data: before } = await nineBoxAPI.getManagerSettings();
        const originalMatrixSize = before.matrixSize;
        const originalTitles = before.cellsTitles;
        const xIds = before.competences
          .filter((c) => c.axis === "x")
          .map((c) => c.competenceId);
        const yIds = before.competences
          .filter((c) => c.axis === "y")
          .map((c) => c.competenceId);

        // Создать 4x4 cellsTitles
        const titles4x4 = [
          ["4x4-R0C0", "4x4-R0C1", "4x4-R0C2", "4x4-R0C3"],
          ["4x4-R1C0", "4x4-R1C1", "4x4-R1C2", "4x4-R1C3"],
          ["4x4-R2C0", "4x4-R2C1", "4x4-R2C2", "4x4-R2C3"],
          ["4x4-R3C0", "4x4-R3C1", "4x4-R3C2", "4x4-R3C3"],
        ];

        try {
          await test.step("Выполнить запрос: Обновить настройки с matrixSize=4", async () => {
            const { response, data } = await nineBoxAPI.updateSettings({
              matrixSize: 4,
              cellsTitles: titles4x4,
              xCompetenciesIds: xIds,
              yCompetenciesIds: yIds,
            });

            expect(response.status(), "POST settings с matrixSize=4: статус 200").toBe(200);
            expect(data, "Ответ должен содержать данные").toBeDefined();
          });

          await test.step(
            "Проверить: GET settings возвращает matrixSize=4 и 4x4 cellsTitles",
            async () => {
              const { response, data: after } = await nineBoxAPI.getManagerSettings();
              expect(response.status(), "GET settings: статус 200").toBe(200);
              expect(after.matrixSize, "matrixSize должен быть 4").toBe(4);
              expect(
                after.cellsTitles,
                "cellsTitles должны совпадать с 4x4 массивом",
              ).toEqual(titles4x4);
              expect(
                after.cellsTitles.length,
                "cellsTitles должен иметь 4 строки",
              ).toBe(4);
              for (let row = 0; row < 4; row++) {
                expect(
                  after.cellsTitles[row].length,
                  `Строка ${row} должна иметь 4 колонки`,
                ).toBe(4);
              }
            },
          );

          await test.step(
            "Проверить: GET matrix с matrixSize=4 — зафиксировать поведение",
            async () => {
              const { response, data: matrix } = await nineBoxAPI.getManagerMatrix();
              const status = response.status();

              if (status === 200) {
                // API поддерживает matrixSize=4 для матрицы
                expect(Array.isArray(matrix), "Матрица должна быть массивом").toBe(true);
                expect(matrix.length, "Матрица должна иметь 4 строки").toBe(4);
                for (let row = 0; row < 4; row++) {
                  expect(
                    Array.isArray(matrix[row]),
                    `Строка ${row} должна быть массивом`,
                  ).toBe(true);
                  expect(
                    matrix[row].length,
                    `Строка ${row} должна иметь 4 колонки`,
                  ).toBe(4);
                }
              } else {
                // API не поддерживает matrixSize=4 для get matrix — фиксируем как 400
                expect(
                  status,
                  "При неподдержке matrixSize=4 ожидается 400",
                ).toBe(400);
                console.log(
                  "API: matrixSize=4 сохраняется в settings, но GET matrix возвращает 400 — " +
                    "размер матрицы ограничен серверной валидацией при построении",
                );
              }
            },
          );
        } finally {
          // Восстановить оригинальные настройки
          await nineBoxAPI.updateSettings({
            matrixSize: originalMatrixSize,
            cellsTitles: originalTitles,
            xCompetenciesIds: xIds,
            yCompetenciesIds: yIds,
          });
        }
      },
    );

    // TODO: Item 9 — Уведомления при enable/disable NineBox
    // Требуется ручная проверка через DB (SELECT * FROM notifications WHERE ...)
    // В автотесте невозможно проверить без DB-верификатора для notifications.
    // Создать NineBoxNotificationsVerifier при необходимости.

    test(
      "C9378: Конкурентные модификации настроек — last-write-wins",
      async ({ nineBoxAPI }) => {
        setSeverity("normal");

        // Запомнить оригинальные настройки для восстановления
        const { data: before } = await nineBoxAPI.getManagerSettings();
        const originalTitles = before.cellsTitles;
        const xIds = before.competences
          .filter((c) => c.axis === "x")
          .map((c) => c.competenceId);
        const yIds = before.competences
          .filter((c) => c.axis === "y")
          .map((c) => c.competenceId);

        const matrixSize = before.matrixSize;

        // Создать два набора кастомных cellsTitles
        const titlesA = Array.from({ length: matrixSize }, (_, row) =>
          Array.from({ length: matrixSize }, (_, col) => `TitlesA-R${row}C${col}`),
        );
        const titlesB = Array.from({ length: matrixSize }, (_, row) =>
          Array.from({ length: matrixSize }, (_, col) => `TitlesB-R${row}C${col}`),
        );

        try {
          let responseA, responseB;

          await test.step(
            "Выполнить: Отправить два обновления одновременно (Promise.all)",
            async () => {
              const [resultA, resultB] = await Promise.all([
                nineBoxAPI.updateSettings({
                  matrixSize,
                  cellsTitles: titlesA,
                  xCompetenciesIds: xIds,
                  yCompetenciesIds: yIds,
                }),
                nineBoxAPI.updateSettings({
                  matrixSize,
                  cellsTitles: titlesB,
                  xCompetenciesIds: xIds,
                  yCompetenciesIds: yIds,
                }),
              ]);
              responseA = resultA.response;
              responseB = resultB.response;
            },
          );

          await test.step(
            "Проверить: Оба запроса вернули 200 (нет 500 ошибок)",
            async () => {
              expect(
                responseA.status(),
                "Запрос A не должен вернуть серверную ошибку",
              ).toBe(200);
              expect(
                responseB.status(),
                "Запрос B не должен вернуть серверную ошибку",
              ).toBe(200);
            },
          );

          await test.step(
            "Проверить: Сохранён один из двух наборов (не смешанный/повреждённый)",
            async () => {
              const { data: after } = await nineBoxAPI.getManagerSettings();
              const savedTitles = after.cellsTitles;

              const matchesA = JSON.stringify(savedTitles) === JSON.stringify(titlesA);
              const matchesB = JSON.stringify(savedTitles) === JSON.stringify(titlesB);

              expect(
                matchesA || matchesB,
                `Сохранённые titles должны полностью совпадать с titlesA или titlesB, получено: ${JSON.stringify(savedTitles)}`,
              ).toBe(true);

              console.log(
                `Конкурентные обновления: победил набор ${matchesA ? "A" : "B"} (last-write-wins)`,
              );
            },
          );
        } finally {
          // Восстановить оригинальные настройки
          await nineBoxAPI.updateSettings({
            matrixSize: before.matrixSize,
            cellsTitles: originalTitles,
            xCompetenciesIds: xIds,
            yCompetenciesIds: yIds,
          });
        }
      },
    );
  },
);
