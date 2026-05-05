// tests/functional/ninebox/ninebox-settings-disable.spec.js
import { test, expect } from "../../fixtures/auth.js";
import { NineBoxSettingsPage } from "../../../pages/NineBoxSettingsPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

test.describe(
  "NineBox — отключение матрицы потенциала",
  { tag: ["@ui", "@ninebox", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.NINE_BOX);
    });

    test(
      "C9384: Отключить матрицу потенциала через UI",
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("normal");
        const settingsPage = new NineBoxSettingsPage(page, testInfo);

        await test.step("Открыть страницу настроек NineBox", async () => {
          await settingsPage.goto();
        });

        const wasEnabled = await settingsPage.isEnabled();

        await test.step(
          "Убедиться что NineBox включён перед отключением",
          async () => {
            if (!wasEnabled) {
              await settingsPage.enableNineBox();
            }
            await expect(settingsPage.disableButton).toBeVisible();
          },
        );

        await test.step("Отключить матрицу потенциала", async () => {
          await settingsPage.disableNineBox();
        });

        await test.step(
          "Проверить что кнопка Включить видна (NineBox отключён)",
          async () => {
            await expect(settingsPage.enableButton).toBeVisible();
          },
        );

        await test.step("Восстановить исходное состояние", async () => {
          if (wasEnabled) {
            await settingsPage.enableNineBox();
          }
        });
      },
    );
  },
);
