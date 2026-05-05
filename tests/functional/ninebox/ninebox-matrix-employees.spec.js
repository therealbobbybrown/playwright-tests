// @ts-check
import { expect } from "@playwright/test";
import { test } from "../../fixtures/auth.js";
import { NineBoxAPI, getCredentials } from "../../utils/api/index.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

/**
 * Гибридный тест: проверка наличия сотрудников в ячейках матрицы NineBox через API + UI
 */

test.describe(
  "NineBox матрица — сотрудники в ячейках",
  { tag: ["@ui", "@ninebox", "@regression"] },
  () => {
    let api;

    test.beforeEach(async ({ adminAuth: page }) => {
      markAsUITest(MODULES.NINE_BOX);

      api = new NineBoxAPI(page.request);
      const { email, password } = getCredentials("admin");
      await api.signIn(email, password);
      await api.ensureEnabled();
    });

    test(
      "C9379: Показать сотрудников в ячейках матрицы через API",
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("normal");

        let totalUsersInMatrix = 0;
        let matrixData;

        await test.step(
          "Получить данные матрицы через API",
          async () => {
            const { response, data } = await api.getManagerMatrix();
            expect(response.status(), "Матрица доступна (200)").toBe(200);
            expect(
              Array.isArray(data),
              "Ответ — 3D массив матрицы",
            ).toBe(true);
            expect(data.length, "Матрица содержит 3 строки").toBe(3);

            matrixData = data;
          },
        );

        await test.step(
          "Подсчитать сотрудников во всех ячейках",
          async () => {
            for (let row = 0; row < matrixData.length; row++) {
              expect(
                Array.isArray(matrixData[row]),
                `Строка ${row} — массив столбцов`,
              ).toBe(true);
              for (let col = 0; col < matrixData[row].length; col++) {
                const cell = matrixData[row][col];
                expect(
                  Array.isArray(cell),
                  `Ячейка [${row}][${col}] — массив сотрудников`,
                ).toBe(true);
                totalUsersInMatrix += cell.length;
              }
            }

            expect(
              totalUsersInMatrix,
              "Матрица должна содержать хотя бы 1 сотрудника",
            ).toBeGreaterThan(0);
          },
        );

        await test.step(
          "Проверить поисковый API и сверить total",
          async () => {
            const { response, data: searchData } = await api.searchManager({
              limit: 1000,
              actualize: false,
            });
            expect(response.status()).toBe(200);
            expect(searchData).toHaveProperty("items");
            expect(searchData).toHaveProperty("total");

            expect(
              searchData.total,
              "total в поиске должен совпадать с количеством сотрудников в матрице",
            ).toBe(totalUsersInMatrix);
          },
        );

        await test.step(
          "Проверить структуру данных сотрудника в самой заполненной ячейке",
          async () => {
            // Найти ячейку с наибольшим количеством сотрудников
            let maxUsers = [];
            let maxRow = 0;
            let maxCol = 0;

            for (let row = 0; row < matrixData.length; row++) {
              for (let col = 0; col < matrixData[row].length; col++) {
                if (matrixData[row][col].length > maxUsers.length) {
                  maxUsers = matrixData[row][col];
                  maxRow = row;
                  maxCol = col;
                }
              }
            }

            expect(
              maxUsers.length,
              `Ячейка [${maxRow}][${maxCol}] содержит сотрудников`,
            ).toBeGreaterThan(0);

            // Проверить структуру первого сотрудника
            const user = maxUsers[0];
            expect(user, "Объект сотрудника определён").toBeDefined();
            expect(
              user.userId,
              "userId должен быть числом > 0",
            ).toBeGreaterThan(0);
            expect(
              typeof user.yValue,
              "yValue должен быть числом",
            ).toBe("number");
            expect(
              typeof user.xValue,
              "xValue должен быть числом",
            ).toBe("number");
          },
        );

        await test.step(
          'Открыть страницу "Моя команда" и проверить загрузку',
          async () => {
            await page.goto("/ru/dashboard/");
            await page.waitForLoadState("domcontentloaded");
            await page
              .waitForLoadState("networkidle", { timeout: 10_000 })
              .catch(() => {});

            const heading = page.getByRole("heading", {
              name: "Моя команда",
              level: 1,
            });
            await heading.waitFor({ state: "visible", timeout: 15_000 });
            await expect(heading).toBeVisible();
          },
        );
      },
    );
  },
);
