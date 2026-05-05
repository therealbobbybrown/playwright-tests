// tests/functional/ninebox/ninebox-settings-autosave.spec.js
import { test, expect } from "../../fixtures/auth.js";
import { NineBoxSettingsPage } from "../../../pages/NineBoxSettingsPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

test.describe(
  "NineBox — индикатор автосохранения",
  { tag: ["@ui", "@ninebox", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.NINE_BOX);
    });

    test(
      "C9383: Проверить индикатор Сохранено на странице",
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("normal");
        const settingsPage = new NineBoxSettingsPage(page, testInfo);

        await test.step("Открыть страницу настроек NineBox", async () => {
          await settingsPage.goto();
        });

        await test.step(
          'Проверить что индикатор "Сохранено" отображается',
          async () => {
            await settingsPage.waitForSaved();
            await expect(settingsPage.savedIndicator).toBeVisible();
          },
        );
      },
    );
  },
);
