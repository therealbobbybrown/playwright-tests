// tests/functional/ninebox/ninebox-settings-add-competency.spec.js
import { test, expect } from "../../fixtures/auth.js";
import { NineBoxSettingsPage } from "../../../pages/NineBoxSettingsPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

test.describe(
  "NineBox — модалка выбора компетенций",
  { tag: ["@ui", "@ninebox", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.NINE_BOX);
    });

    test(
      "C9382: Открыть модалку выбора компетенций на оси Y",
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("normal");
        const settingsPage = new NineBoxSettingsPage(page, testInfo);

        await test.step("Открыть страницу настроек NineBox", async () => {
          await settingsPage.goto();
        });

        await test.step(
          'Нажать "Выбрать компетенции" на оси Y',
          async () => {
            await settingsPage.clickSelectYCompetencies();
          },
        );

        await test.step(
          "Проверить что модалка или выпадающий список открылся",
          async () => {
            const modal = page.locator(
              '[role="dialog"], [class*="modal"], [class*="Modal"], [class*="dropdown"], [class*="Dropdown"], [class*="popup"], [class*="Popup"]',
            );
            await expect(modal.first()).toBeVisible({ timeout: 5000 });
          },
        );
      },
    );
  },
);
