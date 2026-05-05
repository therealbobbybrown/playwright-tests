// tests/functional/ninebox/ninebox-settings-open.spec.js
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
      "C9333: Открыть страницу настроек матрицы 9-box",
      { tag: ["@smoke", "@critical"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("critical");
        const settingsPage = new NineBoxSettingsPage(page, testInfo);

        await test.step("Перейти на страницу настроек", async () => {
          await settingsPage.goto();
        });

        await test.step(
          "Проверить видимость всех секций",
          async () => {
            await settingsPage.assertAllSectionsVisible();
          },
        );

        await test.step(
          "Проверить подписи осей в сетке категорий",
          async () => {
            await settingsPage.assertAxisLabelsVisible();
          },
        );
      },
    );
  },
);
