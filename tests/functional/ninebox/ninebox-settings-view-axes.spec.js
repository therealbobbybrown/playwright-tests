// tests/functional/ninebox/ninebox-settings-view-axes.spec.js
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
      "C9334: Отобразить компетенции на осях матрицы",
      { tag: ["@critical"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("critical");
        const settingsPage = new NineBoxSettingsPage(page, testInfo);

        await test.step("Перейти на страницу настроек", async () => {
          await settingsPage.goto();
        });

        await test.step(
          "Проверить компетенции на оси Y (Потенциал)",
          async () => {
            const yCompetencies = await settingsPage.getYAxisCompetencies();
            expect(
              yCompetencies.length,
              "Ось Y должна содержать хотя бы 1 компетенцию",
            ).toBeGreaterThanOrEqual(1);
            for (const name of yCompetencies) {
              expect(name, "Название компетенции не должно быть пустым").toBeTruthy();
            }
          },
        );

        await test.step(
          "Проверить компетенции на оси X (Производительность)",
          async () => {
            const xCompetencies = await settingsPage.getXAxisCompetencies();
            expect(
              xCompetencies.length,
              "Ось X должна содержать хотя бы 1 компетенцию",
            ).toBeGreaterThanOrEqual(1);
            for (const name of xCompetencies) {
              expect(name, "Название компетенции не должно быть пустым").toBeTruthy();
            }
          },
        );
      },
    );
  },
);
