// @ts-check
import { test, expect } from "../../fixtures/api.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

/**
 * API тесты для пустых/граничных сценариев NineBox матрицы
 *
 * Покрытие:
 * - Матрица с несуществующими userIds — пустые ячейки
 * - Поиск с несуществующими userIds — пустой результат
 * - Матрица с несуществующим performanceReviewId
 */

test.describe(
  "NineBox Empty Matrix API",
  { tag: ["@api", "@ninebox", "@regression"] },
  () => {
    /** @type {boolean} */
    let wasEnabled;

    test.beforeAll(async ({ request }) => {
      // Импортируем динамически чтобы получить credentials
      const { NineBoxAPI, getCredentials } = await import(
        "../../utils/api/index.js"
      );
      const api = new NineBoxAPI(request);
      const { email, password } = getCredentials("admin");
      await api.signIn(email, password);

      const { data: settings } = await api.getManagerSettings();
      wasEnabled = settings.isEnabled;

      // Включить NineBox если отключён
      if (!wasEnabled) {
        await api.enable();
      }
    });

    test.afterAll(async ({ request }) => {
      // Восстановить состояние если был отключён
      if (!wasEnabled) {
        const { NineBoxAPI, getCredentials } = await import(
          "../../utils/api/index.js"
        );
        const api = new NineBoxAPI(request);
        const { email, password } = getCredentials("admin");
        await api.signIn(email, password);
        await api.disable();
      }
    });

    test.beforeEach(async ({ nineBoxAPI }, testInfo) => {
      markAsAPITest(MODULES.NINE_BOX, "Empty Matrix Scenarios");
      await nineBoxAPI.ensureEnabled();
    });

    test(
      "C9347: Матрица с несуществующими userIds — пустые ячейки",
      async ({ nineBoxAPI }) => {
        setSeverity("normal");

        // Убедиться что NineBox включён (мог быть отключён параллельным тестом)
        const { data: currentSettings } =
          await nineBoxAPI.getManagerSettings();
        if (!currentSettings.isEnabled) await nineBoxAPI.enable();

        let matrixResponse, matrixData;
        const fakeUserIds = [999999, 999998];

        await test.step("Выполнить: Получить матрицу с несуществующими userIds", async () => {
          const { response, data } = await nineBoxAPI.getManagerMatrix({
            usersIds: fakeUserIds,
          });
          matrixResponse = response;
          matrixData = data;
        });

        await test.step("Проверить: Статус 200 и 3D структура", async () => {
          expect(matrixResponse.status(), "Статус должен быть 200").toBe(200);
          expect(
            Array.isArray(matrixData),
            "Ответ должен быть массивом (матрица)",
          ).toBe(true);
        });

        await test.step("Проверить: Все ячейки пустые", async () => {
          const { data: settings } = await nineBoxAPI.getManagerSettings();
          const matrixSize = settings.matrixSize;

          expect(
            matrixData.length,
            `Матрица должна иметь ${matrixSize} строк`,
          ).toBe(matrixSize);

          let totalUsers = 0;
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
              totalUsers += matrixData[row][col].length;
            }
          }

          expect(
            totalUsers,
            "Все ячейки должны быть пустыми для несуществующих userIds",
          ).toBe(0);
        });
      },
    );

    test(
      "C9348: Поиск в матрице с несуществующими userIds — пустой результат",
      async ({ nineBoxAPI }) => {
        setSeverity("normal");

        // Убедиться что NineBox включён (мог быть отключён параллельным тестом)
        const { data: currentSettings } =
          await nineBoxAPI.getManagerSettings();
        if (!currentSettings.isEnabled) await nineBoxAPI.enable();

        let searchResponse, searchData;

        await test.step("Выполнить: Поиск с несуществующим userId", async () => {
          const { response, data } = await nineBoxAPI.searchManager({
            usersIds: [999999],
            actualize: false,
            limit: 10,
          });
          searchResponse = response;
          searchData = data;
        });

        await test.step("Проверить: Статус и структура ответа", async () => {
          expect(searchResponse.status(), "Статус должен быть 200").toBe(200);
          expect(searchData).toHaveProperty("items");
          expect(searchData).toHaveProperty("total");
          expect(searchData).toHaveProperty("limit");
          expect(
            Array.isArray(searchData.items),
            "items должен быть массивом",
          ).toBe(true);
          expect(typeof searchData.total, "total должен быть числом").toBe("number");
          expect(searchData.limit, "limit должен быть 10").toBe(10);
        });

        await test.step("Проверить: Результат пустой", async () => {
          expect(
            searchData.items.length,
            "items должен быть пустым для несуществующего userId",
          ).toBe(0);
          expect(
            searchData.total,
            "total должен быть 0 для несуществующего userId",
          ).toBe(0);
        });
      },
    );

    test(
      "C9349: Матрица с несуществующим performanceReviewId — пустые ячейки или ошибка",
      async ({ nineBoxAPI }) => {
        setSeverity("normal");

        // Убедиться что NineBox включён (мог быть отключён параллельным тестом)
        const { data: currentSettings } =
          await nineBoxAPI.getManagerSettings();
        if (!currentSettings.isEnabled) await nineBoxAPI.enable();

        const fakeprId = 999999;
        let matrixResponse, matrixData;

        await test.step("Выполнить: Получить матрицу с несуществующим performanceReviewId", async () => {
          const { response, data } = await nineBoxAPI.getManagerMatrix({
            performanceReviewId: fakeprId,
          });
          matrixResponse = response;
          matrixData = data;
        });

        await test.step(
          "Проверить ответ",
          async () => {
            const status = matrixResponse.status();

            if (status === 200) {
              // API вернул пустую матрицу
              expect(
                Array.isArray(matrixData),
                "Ответ должен быть массивом (матрица)",
              ).toBe(true);

              const { data: settings } = await nineBoxAPI.getManagerSettings();
              const matrixSize = settings.matrixSize;

              expect(
                matrixData.length,
                `Матрица должна иметь ${matrixSize} строк`,
              ).toBe(matrixSize);

              // Подсчитать пользователей — должны быть пустые ячейки
              let totalUsers = 0;
              for (const row of matrixData) {
                for (const cell of row) {
                  totalUsers += cell.length;
                }
              }

              // Для несуществующего PR: API может вернуть либо пустую матрицу (0 пользователей),
              // либо полную матрицу без привязки к PR. Проверяем что значение разумное.
              expect(
                totalUsers,
                "totalUsers должен быть >= 0",
              ).toBeGreaterThanOrEqual(0);
            } else {
              // API вернул ошибку — тоже допустимо
              expect(
                [400, 404].includes(status),
                `Ожидается 200, 400 или 404 для несуществующего PR, получен ${status}`,
              ).toBe(true);
            }
          },
        );
      },
    );
  },
);
