// @ts-check
import { test, expect } from "../../fixtures/full.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

/**
 * Негативные API тесты для NineBox матрицы
 *
 * Покрытие:
 * - Невалидный matrixSize (0, -1, 100)
 * - Невалидные competencyIds
 * - Координаты вне диапазона
 * - XSS в поисковом запросе
 * - cellsTitles несовпадающего размера
 * - Матрица при отключённом NineBox
 */

test.describe(
  "NineBox Negative API",
  { tag: ["@api", "@ninebox", "@regression"] },
  () => {
    // Serial mode: disable тесты меняют глобальное состояние NineBox,
    // параллельный запуск вызывает flaky (403 вместо 200)
    test.describe.configure({ mode: "serial" });

    test.beforeEach(async ({ nineBoxAPI }, testInfo) => {
      markAsAPITest(MODULES.NINE_BOX, "NineBox Negative");
      await nineBoxAPI.ensureEnabled();
    });

    // ==================== VALIDATION: matrixSize ====================

    test.describe("Валидация matrixSize", () => {
      test("C9353: Обновить настройки с matrixSize=100 — ожидаем 400", async ({
        nineBoxAPI,
      }) => {
        setSeverity("normal");

        let response, data;
        await test.step("Выполнить запрос: Обновить настройки с matrixSize=100", async () => {
          ({ response, data } = await nineBoxAPI.updateSettings({
            matrixSize: 100,
          }));
        });

        await test.step("Проверить ответ", async () => {
          expect(
            response.status(),
            "matrixSize=100 должен вернуть ошибку валидации",
          ).toBe(400);
          expect(data, "Ответ 400 должен содержать информацию об ошибке").toBeDefined();
        });
      });

      test("C9354: Обновить настройки с matrixSize=0 — ожидаем 400", async ({
        nineBoxAPI,
      }) => {
        setSeverity("normal");

        let response, data;
        await test.step("Выполнить запрос: Обновить настройки с matrixSize=0", async () => {
          ({ response, data } = await nineBoxAPI.updateSettings({
            matrixSize: 0,
          }));
        });

        await test.step("Проверить ответ", async () => {
          expect(response.status(), "matrixSize=0 должен вернуть 400").toBe(
            400,
          );
          expect(data, "Ответ 400 должен содержать информацию об ошибке").toBeDefined();
        });
      });

      test("C9355: Обновить настройки с matrixSize=-1 — ожидаем 400", async ({
        nineBoxAPI,
      }) => {
        setSeverity("normal");

        let response, data;
        await test.step("Выполнить запрос: Обновить настройки с matrixSize=-1", async () => {
          ({ response, data } = await nineBoxAPI.updateSettings({
            matrixSize: -1,
          }));
        });

        await test.step("Проверить ответ", async () => {
          expect(response.status(), "matrixSize=-1 должен вернуть 400").toBe(
            400,
          );
          expect(data, "Ответ 400 должен содержать информацию об ошибке").toBeDefined();
        });
      });
    });

    // ==================== VALIDATION: competencyIds ====================

    test.describe("Валидация competencyIds", () => {
      test(
        "C9356: Обновить настройки с несуществующими competencyIds — ожидаем ошибку",
        async ({ nineBoxAPI }) => {
          setSeverity("normal");

          let response, data;
          await test.step("Выполнить запрос: Обновить настройки с несуществующими competencyIds", async () => {
            ({ response, data } = await nineBoxAPI.updateSettings({
              matrixSize: 3,
              xCompetenciesIds: [999999],
              yCompetenciesIds: [999998],
            }));
          });

          await test.step("Проверить ответ", async () => {
            expect(
              [400, 404],
              `Несуществующие competencyIds: статус ${response.status()}`,
            ).toContain(response.status());
            expect(data, "Ответ ошибки должен содержать информацию").toBeDefined();
          });
        },
      );

      test(
        "C9357: Обновить настройки с пустыми competenciesIds — определить поведение",
        async ({ nineBoxAPI }) => {
          setSeverity("normal");

          const { data: before } = await nineBoxAPI.getManagerSettings();

          let response, data;
          await test.step("Выполнить запрос: Обновить настройки с пустыми competenciesIds", async () => {
            ({ response, data } = await nineBoxAPI.updateSettings({
              matrixSize: before.matrixSize,
              cellsTitles: before.cellsTitles,
              xCompetenciesIds: [],
              yCompetenciesIds: [],
            }));
          });

          await test.step("Проверить ответ", async () => {
            // API может разрешить пустые оси (200) или вернуть ошибку (400)
            expect(
              [200, 400],
              "Пустые competenciesIds: статус 200 или 400",
            ).toContain(response.status());

            if (response.status() === 200) {
              // Если разрешено — восстановить оригинальные настройки
              const xIds = before.competences
                .filter((c) => c.axis === "x")
                .map((c) => c.competenceId);
              const yIds = before.competences
                .filter((c) => c.axis === "y")
                .map((c) => c.competenceId);
              await nineBoxAPI.updateSettings({
                matrixSize: before.matrixSize,
                cellsTitles: before.cellsTitles,
                xCompetenciesIds: xIds,
                yCompetenciesIds: yIds,
              });
            }
          });
        },
      );
    });

    // ==================== VALIDATION: координаты поиска ====================

    test.describe("Валидация координат поиска", () => {
      test(
        "C9358: Поиск с координатами вне диапазона — пустой результат или ошибка",
        async ({ nineBoxAPI }) => {
          setSeverity("normal");

          const { data: settings } = await nineBoxAPI.getManagerSettings();
          if (!settings.isEnabled) await nineBoxAPI.enable();

          let response, data;
          await test.step("Выполнить запрос: Поиск с координатами вне диапазона (999,999)", async () => {
            ({ response, data } = await nineBoxAPI.searchManager({
              xCoord: 999,
              yCoord: 999,
              limit: 10,
              actualize: false,
            }));
          });

          await test.step("Проверить ответ", async () => {
            if (response.status() === 200) {
              expect(data.items.length, "Вне диапазона — 0 результатов").toBe(
                0,
              );
            } else {
              expect(response.status()).toBe(400);
            }
          });
        },
      );

      test(
        "C9359: Поиск с отрицательными координатами — пустой результат или ошибка",
        async ({ nineBoxAPI }) => {
          setSeverity("normal");

          const { data: settings } = await nineBoxAPI.getManagerSettings();
          if (!settings.isEnabled) await nineBoxAPI.enable();

          let response, data;
          await test.step("Выполнить запрос: Поиск с отрицательными координатами (-1,-1)", async () => {
            ({ response, data } = await nineBoxAPI.searchManager({
              xCoord: -1,
              yCoord: -1,
              limit: 10,
              actualize: false,
            }));
          });

          await test.step("Проверить ответ", async () => {
            if (response.status() === 200) {
              expect(
                data.items.length,
                "Отрицательные координаты — 0 результатов",
              ).toBe(0);
            } else {
              expect(response.status()).toBe(400);
            }
          });
        },
      );
    });

    // ==================== XSS ====================

    test.describe("Безопасность", () => {
      test("C9360: XSS в поисковом запросе — безопасная обработка", async ({
        nineBoxAPI,
      }) => {
        setSeverity("normal");

        const { data: settings } = await nineBoxAPI.getManagerSettings();
        if (!settings.isEnabled) await nineBoxAPI.enable();

        const xssPayloads = [
          '<script>alert(1)</script>',
          '"><img src=x onerror=alert(1)>',
          "'; DROP TABLE ninebox_cache; --",
        ];

        for (const payload of xssPayloads) {
          let response, data;
          await test.step(
            `Выполнить запрос: Поиск с XSS payload "${payload.slice(0, 30)}..."`,
            async () => {
              ({ response, data } = await nineBoxAPI.searchManager({
                limit: 10,
                actualize: false,
                q: payload,
              }));
            },
          );

          await test.step("Проверить ответ", async () => {
            expect(
              response.status(),
              "API должен безопасно обработать XSS/SQL injection",
            ).toBe(200);
            expect(data).toHaveProperty("items");
            expect(data).toHaveProperty("total");
            expect(Array.isArray(data.items), "items должен быть массивом").toBe(true);
            expect(typeof data.total, "total должен быть числом").toBe("number");
          });
        }

      });
    });

    // ==================== cellsTitles ====================

    test.describe("Валидация cellsTitles", () => {
      test(
        "C9361: cellsTitles несовпадающего размера (2x2 для matrixSize=3) — ожидаем 400",
        async ({ nineBoxAPI }) => {
          setSeverity("normal");

          const { data: before } = await nineBoxAPI.getManagerSettings();
          const xIds = before.competences
            .filter((c) => c.axis === "x")
            .map((c) => c.competenceId);
          const yIds = before.competences
            .filter((c) => c.axis === "y")
            .map((c) => c.competenceId);

          let response, data;
          await test.step("Выполнить запрос: Обновить настройки с cellsTitles 2x2 для matrixSize=3", async () => {
            ({ response, data } = await nineBoxAPI.updateSettings({
              matrixSize: 3,
              cellsTitles: [
                ["A", "B"],
                ["C", "D"],
              ],
              xCompetenciesIds: xIds,
              yCompetenciesIds: yIds,
            }));
          });

          await test.step("Проверить ответ", async () => {
            expect(
              response.status(),
              "2x2 titles для 3x3 матрицы — ошибка",
            ).toBe(400);
            expect(data, "Ответ 400 должен содержать информацию об ошибке").toBeDefined();
          });
        },
      );
    });

    // ==================== Disabled NineBox ====================

    test.describe("Отключённый NineBox", () => {
      test(
        "C9362: Получить матрицу при отключённом NineBox — ожидаем 403",
        async ({ nineBoxAPI }) => {
          setSeverity("normal");

          const { data: settings } = await nineBoxAPI.getManagerSettings();
          if (settings.isEnabled) await nineBoxAPI.disable();

          try {
            let matrixResponse, matrixData, searchResponse, searchData;
            await test.step("Выполнить запрос: Получить матрицу и выполнить поиск при отключённом NineBox", async () => {
              ({ response: matrixResponse, data: matrixData } = await nineBoxAPI.getManagerMatrix());
              ({ response: searchResponse, data: searchData } = await nineBoxAPI.searchManager({
                limit: 10,
                actualize: false,
              }));
            });

            await test.step("Проверить: Оба запроса возвращают 403", async () => {
              expect(
                matrixResponse.status(),
                "Disabled NineBox: матрица недоступна",
              ).toBe(403);
              expect(matrixData, "Ответ 403 должен содержать данные об ошибке").toBeDefined();
              const matrixErrorText = typeof matrixData === 'string' ? matrixData : JSON.stringify(matrixData);
              expect(matrixErrorText.toLowerCase(), "Ошибка матрицы должна содержать 'disabled'").toContain('disabled');

              expect(
                searchResponse.status(),
                "Disabled NineBox: поиск недоступен",
              ).toBe(403);
              expect(searchData, "Ответ 403 должен содержать данные об ошибке").toBeDefined();
              const searchErrorText = typeof searchData === 'string' ? searchData : JSON.stringify(searchData);
              expect(searchErrorText.toLowerCase(), "Ошибка поиска должна содержать 'disabled'").toContain('disabled');
            });
          } finally {
            // Всегда восстанавливать NineBox в enabled — другие тесты зависят от этого
            await nineBoxAPI.enable();
          }
        },
      );

      test(
        "C9363: Protected матрица при отключённом NineBox — ожидаем 403",
        async ({ nineBoxAPI }) => {
          setSeverity("normal");

          const { data: settings } = await nineBoxAPI.getManagerSettings();
          if (settings.isEnabled) await nineBoxAPI.disable();

          try {
            let response, data;
            await test.step(
              "Выполнить запрос: Получить protected матрицу при отключённом NineBox",
              async () => {
                ({ response, data } = await nineBoxAPI.getProtectedMatrix({
                  usersSubset: "all",
                }));
              },
            );

            await test.step("Проверить ответ", async () => {
              expect(response.status()).toBe(403);
              const errorText = typeof data === 'string' ? data : JSON.stringify(data);
              expect(errorText.toLowerCase(), "Ответ 403 должен содержать 'disabled'").toContain('disabled');
            });
          } finally {
            // Всегда восстанавливать NineBox в enabled — другие тесты зависят от этого
            await nineBoxAPI.enable();
          }
        },
      );
    });
  },
);
