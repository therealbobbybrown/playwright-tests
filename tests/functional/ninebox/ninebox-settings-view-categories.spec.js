// tests/functional/ninebox/ninebox-settings-view-categories.spec.js
import { expect } from "@playwright/test";
import { test } from "../../fixtures/auth.js";
import { NineBoxSettingsPage } from "../../../pages/NineBoxSettingsPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

test.describe(
  "Настройки матрицы потенциала 9-box",
  { tag: ["@ui", "@ninebox", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.NINE_BOX);
    });

    test(
      "C9335: Отобразить сетку категорий 3x3 с названиями",
      { tag: ["@critical"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("critical");
        const settingsPage = new NineBoxSettingsPage(page, testInfo);

        await test.step("Перейти на страницу настроек", async () => {
          await settingsPage.goto();
        });

        await test.step(
          "Проверить структуру матрицы 3x3",
          async () => {
            const cellTitles = await settingsPage.getAllCellTitles();
            expect(
              cellTitles.length,
              "Матрица должна содержать 3 строки",
            ).toBe(3);
            for (let row = 0; row < cellTitles.length; row++) {
              expect(
                cellTitles[row].length,
                `Строка ${row} должна содержать 3 столбца`,
              ).toBe(3);
            }
          },
        );

        await test.step(
          "Проверить что все названия ячеек непустые",
          async () => {
            const cellTitles = await settingsPage.getAllCellTitles();
            for (let row = 0; row < cellTitles.length; row++) {
              for (let col = 0; col < cellTitles[row].length; col++) {
                expect(
                  cellTitles[row][col],
                  `Ячейка [${row},${col}] должна иметь непустое название`,
                ).toBeTruthy();
              }
            }
          },
        );
      },
    );
  },
);
