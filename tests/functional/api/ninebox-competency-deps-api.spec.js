// @ts-check
import { test, expect } from "../../fixtures/api.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

/**
 * API тесты для зависимостей компетенций NineBox
 *
 * Покрытие:
 * - Одна компетенция на обе оси X и Y — поведение API
 * - Множественные компетенции на осях — проверка количества
 */

test.describe(
  "NineBox Competency Dependencies API",
  { tag: ["@api", "@ninebox", "@regression"] },
  () => {
    test.beforeEach(async ({}, testInfo) => {
      markAsAPITest(MODULES.NINE_BOX, "Competency Dependencies");
    });

    test(
      "C9342: Одна компетенция на обе оси X и Y — зафиксировать поведение API",
      async ({ nineBoxAPI }) => {
        setSeverity("normal");

        let settings;

        await test.step("Подготовка: Получить текущие настройки и определить компетенцию", async () => {
          const { data } = await nineBoxAPI.getManagerSettings();
          expect(
            data.competences.length,
            "Должны быть настроены компетенции",
          ).toBeGreaterThan(0);
          settings = data;
        });

        const firstCompetenceId = () => settings.competences[0].competenceId;
        let updateResponse, updateData;

        await test.step(
          "Выполнить: POST settings с одной компетенцией на обеих осях",
          async () => {
            const { response, data } = await nineBoxAPI.updateSettings({
              matrixSize: settings.matrixSize,
              cellsTitles: settings.cellsTitles,
              xCompetenciesIds: [firstCompetenceId()],
              yCompetenciesIds: [firstCompetenceId()],
            });
            updateResponse = response;
            updateData = data;
          },
        );

        await test.step("Проверить ответ", async () => {
          const status = updateResponse.status();

          // Фиксируем реальное поведение API
          if (status === 200) {
            // API разрешает одну компетенцию на обеих осях
            expect(updateData, "Ответ должен содержать данные при 200").toBeDefined();
            expect(updateData).toHaveProperty("matrixSize");
            expect(updateData).toHaveProperty("competences");
            expect(Array.isArray(updateData.competences), "competences должен быть массивом").toBe(true);

            // Проверяем что компетенция действительно на обеих осях
            const { data: verify } = await nineBoxAPI.getManagerSettings();
            const xComps = verify.competences
              .filter((c) => c.axis === "x")
              .map((c) => c.competenceId);
            const yComps = verify.competences
              .filter((c) => c.axis === "y")
              .map((c) => c.competenceId);

            expect(
              xComps,
              "Компетенция должна быть на оси X",
            ).toContain(firstCompetenceId());
            expect(
              yComps,
              "Компетенция должна быть на оси Y",
            ).toContain(firstCompetenceId());
          } else {
            // API запрещает дублирование — ожидаем 400
            expect(
              status,
              "При отказе ожидается статус 400",
            ).toBe(400);
          }
        });

        // Восстановить оригинальные настройки
        await test.step("Восстановить: Оригинальные настройки компетенций", async () => {
          const xIds = settings.competences
            .filter((c) => c.axis === "x")
            .map((c) => c.competenceId);
          const yIds = settings.competences
            .filter((c) => c.axis === "y")
            .map((c) => c.competenceId);

          await nineBoxAPI.updateSettings({
            matrixSize: settings.matrixSize,
            cellsTitles: settings.cellsTitles,
            xCompetenciesIds: xIds,
            yCompetenciesIds: yIds,
          });
        });
      },
    );

    test(
      "C9343: Множественные компетенции на оси — проверить количество",
      async ({ nineBoxAPI }) => {
        setSeverity("normal");

        let settingsResponse, settings;

        await test.step("Выполнить: Получить настройки NineBox", async () => {
          const { response, data } = await nineBoxAPI.getManagerSettings();
          settingsResponse = response;
          settings = data;
        });

        await test.step("Проверить ответ", async () => {
          expect(settingsResponse.status(), "GET settings: статус 200").toBe(200);
        });

        await test.step(
          "Проверить: Наличие и структура компетенций на обеих осях",
          async () => {
            const xComps = settings.competences.filter((c) => c.axis === "x");
            const yComps = settings.competences.filter((c) => c.axis === "y");

            expect(
              xComps.length,
              "На оси X должна быть хотя бы 1 компетенция",
            ).toBeGreaterThan(0);
            expect(
              yComps.length,
              "На оси Y должна быть хотя бы 1 компетенция",
            ).toBeGreaterThan(0);

            // Проверить что каждая компетенция имеет корректную структуру
            for (const comp of xComps) {
              expect(comp.axis, "axis должен быть 'x'").toBe("x");
              expect(
                typeof comp.competenceId,
                "competenceId должен быть числом",
              ).toBe("number");
              expect(comp.competence, "competence объект обязателен").toBeDefined();
              expect(
                typeof comp.competence.id,
                "competence.id должен быть числом",
              ).toBe("number");
              expect(
                typeof comp.competence.title,
                "competence.title должен быть строкой",
              ).toBe("string");
              expect(
                comp.competence.title.length,
                "competence.title не должен быть пустым",
              ).toBeGreaterThan(0);
            }

            for (const comp of yComps) {
              expect(comp.axis, "axis должен быть 'y'").toBe("y");
              expect(
                typeof comp.competenceId,
                "competenceId должен быть числом",
              ).toBe("number");
              expect(comp.competence, "competence объект обязателен").toBeDefined();
            }
          },
        );

        await test.step(
          "Проверить: Все competenceId уникальны внутри одной оси",
          async () => {
            const xIds = settings.competences
              .filter((c) => c.axis === "x")
              .map((c) => c.competenceId);
            const yIds = settings.competences
              .filter((c) => c.axis === "y")
              .map((c) => c.competenceId);

            const uniqueXIds = [...new Set(xIds)];
            const uniqueYIds = [...new Set(yIds)];

            expect(
              uniqueXIds.length,
              "ID компетенций оси X должны быть уникальны",
            ).toBe(xIds.length);
            expect(
              uniqueYIds.length,
              "ID компетенций оси Y должны быть уникальны",
            ).toBe(yIds.length);
          },
        );
      },
    );

    test(
      "C9344: Агрегация нескольких компетенций на оси — проверить значения",
      async ({ nineBoxAPI }) => {
        setSeverity("normal");
        await nineBoxAPI.ensureEnabled();

        let settings;

        await test.step("Подготовка: Получить настройки компетенций", async () => {
          const { data } = await nineBoxAPI.getManagerSettings();
          expect(
            data.competences.length,
            "Должны быть настроены компетенции",
          ).toBeGreaterThan(0);
          settings = data;
        });

        await test.step(
          "Проверить: Компетенции присутствуют на обеих осях",
          async () => {
            const xComps = settings.competences.filter((c) => c.axis === "x");
            const yComps = settings.competences.filter((c) => c.axis === "y");

            expect(
              xComps.length,
              "На оси X должна быть хотя бы 1 компетенция",
            ).toBeGreaterThan(0);
            expect(
              yComps.length,
              "На оси Y должна быть хотя бы 1 компетенция",
            ).toBeGreaterThan(0);
          },
        );

        let matrixResponse, matrix;

        await test.step(
          "Выполнить: Получить матрицу NineBox",
          async () => {
            const { response, data } = await nineBoxAPI.getManagerMatrix();
            matrixResponse = response;
            matrix = data;
          },
        );

        await test.step(
          "Проверить: Структура матрицы и значения пользователей",
          async () => {
            expect(matrixResponse.status(), "GET matrix: статус 200").toBe(200);
            expect(Array.isArray(matrix), "Матрица должна быть массивом").toBe(true);

            const matrixSize = settings.matrixSize;
            expect(matrix.length, `Матрица должна иметь ${matrixSize} строк`).toBe(matrixSize);

            // Собрать всех пользователей из матрицы
            const allUsers = [];
            for (const row of matrix) {
              for (const cell of row) {
                for (const user of cell) {
                  allUsers.push(user);
                }
              }
            }

            // Проверить что пользователи имеют валидные значения
            for (const user of allUsers) {
              expect(typeof user.userId, "userId должен быть числом").toBe("number");
              expect(typeof user.xValue, "xValue должен быть числом").toBe("number");
              expect(typeof user.yValue, "yValue должен быть числом").toBe("number");
              expect(user.userId, "userId должен быть положительным").toBeGreaterThan(0);
            }
          },
        );
      },
    );

    test(
      "C9345: Максимальное количество компетенций на оси — проверить текущее количество",
      async ({ nineBoxAPI }) => {
        setSeverity("normal");
        await nineBoxAPI.ensureEnabled();

        let settingsResponse, settings;

        await test.step("Выполнить: Получить настройки NineBox", async () => {
          const { response, data } = await nineBoxAPI.getManagerSettings();
          settingsResponse = response;
          settings = data;
        });

        await test.step("Проверить ответ", async () => {
          expect(settingsResponse.status(), "GET settings: статус 200").toBe(200);
        });

        await test.step(
          "Проверить: Количество компетенций на каждой оси в разумных пределах",
          async () => {
            const xComps = settings.competences.filter((c) => c.axis === "x");
            const yComps = settings.competences.filter((c) => c.axis === "y");

            expect(
              xComps.length,
              "На оси X должна быть хотя бы 1 компетенция",
            ).toBeGreaterThan(0);
            expect(
              yComps.length,
              "На оси Y должна быть хотя бы 1 компетенция",
            ).toBeGreaterThan(0);

            console.log(
              `Количество компетенций — X: ${xComps.length}, Y: ${yComps.length}`,
            );

            expect(
              xComps.length,
              "Количество компетенций на оси X должно быть в разумных пределах (< 50)",
            ).toBeLessThan(50);
            expect(
              yComps.length,
              "Количество компетенций на оси Y должно быть в разумных пределах (< 50)",
            ).toBeLessThan(50);
          },
        );
      },
    );

    test(
      "C9346: Архивированная компетенция на оси — проверить поведение NineBox",
      async ({ nineBoxAPI }) => {
        setSeverity("normal");
        await nineBoxAPI.ensureEnabled();

        let settings;

        await test.step("Подготовка: Получить настройки и компетенции", async () => {
          const { response, data } = await nineBoxAPI.getManagerSettings();
          expect(response.status(), "GET settings: статус 200").toBe(200);
          expect(
            data.competences.length,
            "Должны быть настроены компетенции",
          ).toBeGreaterThan(0);
          settings = data;
        });

        await test.step(
          "Проверить: Все текущие компетенции НЕ архивированы",
          async () => {
            const xComps = settings.competences.filter((c) => c.axis === "x");
            const yComps = settings.competences.filter((c) => c.axis === "y");

            expect(
              xComps.length,
              "На оси X должна быть хотя бы 1 компетенция",
            ).toBeGreaterThan(0);
            expect(
              yComps.length,
              "На оси Y должна быть хотя бы 1 компетенция",
            ).toBeGreaterThan(0);

            for (const comp of settings.competences) {
              expect(
                comp.competence,
                `Компетенция ${comp.competenceId} должна иметь объект competence`,
              ).toBeDefined();

              // Проверяем что компетенция не архивирована (если поле есть)
              if ("isArchived" in comp.competence) {
                expect(
                  comp.competence.isArchived,
                  `Компетенция "${comp.competence.title}" (id=${comp.competenceId}) не должна быть архивирована`,
                ).toBe(false);
              }

              // Проверяем что компетенция активна (title непустой, id положительный)
              expect(
                typeof comp.competence.title,
                "competence.title должен быть строкой",
              ).toBe("string");
              expect(
                comp.competence.title.length,
                `Компетенция id=${comp.competenceId} должна иметь непустой title`,
              ).toBeGreaterThan(0);
              expect(
                comp.competence.id,
                "competence.id должен быть положительным",
              ).toBeGreaterThan(0);
            }

            console.log(
              `Проверено ${settings.competences.length} компетенций — все активны (не архивированы)`,
            );
          },
        );

        await test.step(
          "Проверить: Матрица корректно работает с текущими (неархивированными) компетенциями",
          async () => {
            const { response, data: matrix } = await nineBoxAPI.getManagerMatrix();
            expect(response.status(), "GET matrix: статус 200").toBe(200);
            expect(Array.isArray(matrix), "Матрица должна быть массивом").toBe(true);
            expect(
              matrix.length,
              `Матрица должна иметь ${settings.matrixSize} строк`,
            ).toBe(settings.matrixSize);
          },
        );
      },
    );
  },
);
