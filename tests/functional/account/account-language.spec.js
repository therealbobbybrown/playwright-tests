// tests/functional/account/account-language.spec.js
import { expect } from "@playwright/test";
import { test } from "../../fixtures/auth.js";
import { AccountSettingsPage } from "../../../pages/AccountSettingsPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

test.describe(
  "Управление аккаунтом — язык интерфейса",
  { tag: ["@ui", "@regression"] },
  () => {
    let initialCode;
    let accountSettings;

    test.beforeEach(() => {
      markAsUITest(MODULES.ACCOUNT);
    });

    test.afterEach(async ({ adminAuth: page }, testInfo) => {
      if (!initialCode || !accountSettings) return;
      try {
        const currentCode = await accountSettings.getLanguageCodeFromValue();
        if (currentCode !== initialCode) {
          await accountSettings.changeLanguage(initialCode);
        }
      } catch {
        // страница могла быть закрыта — пропускаем cleanup
      }
    });

    test("C7504: Админ меняет язык интерфейса", async ({
      adminAuth: page,
    }, testInfo) => {
      setSeverity("normal");
      accountSettings = new AccountSettingsPage(page, testInfo);

      await test.step("Открыть управление аккаунтом через аватар", async () => {
        await accountSettings.openFromHeader();
      });

      let initialText;
      await test.step("Считать текущий язык", async () => {
        initialText = await accountSettings.getLanguageValueText();
        initialCode = await accountSettings.getLanguageCodeFromValue();
      });

      const targetCode = initialCode === "ru" ? "en" : "ru";

      await test.step(`Переключить язык на ${targetCode}`, async () => {
        await accountSettings.changeLanguage(targetCode);
      });

      await test.step("Проверить, что язык изменился", async () => {
        await accountSettings.waitForLanguageApplied(targetCode);

        const newCode = await accountSettings.getLanguageCodeFromValue();
        const newText = await accountSettings.getLanguageValueText();

        expect(newCode).toBe(targetCode);
        const expectedText = targetCode === "en" ? "English" : "Русский";
        expect(newText).toBe(expectedText);

        await testInfo.attach("language-after", {
          body: await page.screenshot({ fullPage: true }),
          contentType: "image/png",
        });
      });
    });
  },
);
