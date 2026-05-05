// tests/functional/ninebox/ninebox-settings-enable.spec.js
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
    /** @type {boolean|null} */
    let wasEnabled = null;

    /** @type {NineBoxSettingsPage|null} */
    let settingsPage = null;

    test.beforeEach(() => {
      markAsUITest(MODULES.NINE_BOX);
    });

    test.afterEach(async () => {
      // Восстанавливаем исходное состояние
      if (settingsPage && wasEnabled !== null) {
        const currentlyEnabled = await settingsPage.isEnabled();
        if (wasEnabled && !currentlyEnabled) {
          await settingsPage.enableNineBox();
        } else if (!wasEnabled && currentlyEnabled) {
          await settingsPage.disableNineBox();
        }
      }
    });

    test(
      "C9332: Включить матрицу потенциала через UI",
      { tag: ["@critical"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("critical");
        settingsPage = new NineBoxSettingsPage(page, testInfo);

        await test.step("Перейти на страницу настроек", async () => {
          await settingsPage.goto();
        });

        await test.step(
          "Запомнить текущее состояние и подготовить к включению",
          async () => {
            wasEnabled = await settingsPage.isEnabled();
            if (wasEnabled) {
              await settingsPage.disableNineBox();
            }
          },
        );

        await test.step("Включить матрицу потенциала", async () => {
          await settingsPage.enableNineBox();
        });

        await test.step(
          "Проверить что матрица включена",
          async () => {
            const isEnabled = await settingsPage.isEnabled();
            expect(isEnabled, "Матрица должна быть включена").toBe(true);
          },
        );
      },
    );
  },
);
