// tests/brand-settings.spec.js
import { expect } from "@playwright/test";
import { test } from "../../fixtures/auth.js";
import { SideMenu } from "../../../pages/SideMenu.js";
import { BrandSettingsPage } from "../../../pages/BrandSettingsPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

test.describe(
  "Настройки внешнего вида",
  { tag: ["@ui", "@regression"] },
  () => {
    let initialToggleState;
    let brandPage;

    test.beforeEach(() => {
      markAsUITest(MODULES.BRAND);
    });

    test.afterEach(async ({ page }) => {
      if (initialToggleState === undefined || !brandPage) return;
      try {
        const current = await brandPage.isFeedbackToggleOn();
        if (current !== initialToggleState) {
          await brandPage.setFeedbackMenuVisibility(initialToggleState);
          await page.reload({ waitUntil: "domcontentloaded" });
        }
      } catch {
        // Ignore cleanup errors
      }
    });

    test('C4241: Админ открывает страницу "Внешний вид" и видит основные элементы', async ({
      adminAuth,
      page,
    }, testInfo) => {
      setSeverity("normal");
      const sideMenu = new SideMenu(page, testInfo);
      brandPage = new BrandSettingsPage(page, testInfo);

      await test.step('Открыть страницу "Внешний вид" через боковое меню', async () => {
        await sideMenu.openBrandSettings();
        await brandPage.assertOpened();
        initialToggleState = await brandPage.isFeedbackToggleOn();
      });

      await test.step("Проверить основные элементы страницы", async () => {
        await brandPage.assertMainElementsVisible();
      });

      await test.step('Выключить пункт "Фидбек" в меню и проверить, что он скрыт', async () => {
        await brandPage.setFeedbackMenuVisibility(false);
        await page.reload({ waitUntil: "domcontentloaded" });
        await brandPage.assertOpened();
        // Используем toBeHidden — ждёт до таймаута вместо мгновенной проверки
        await expect(sideMenu.feedbackMenuItem.first()).toBeHidden({
          timeout: 10_000,
        });
      });

      await test.step('Включить пункт "Фидбек" в меню и проверить, что он виден', async () => {
        await brandPage.setFeedbackMenuVisibility(true);
        await page.reload({ waitUntil: "domcontentloaded" });
        await brandPage.assertOpened();
        // Используем toBeVisible — ждёт до таймаута вместо мгновенной проверки
        await expect(sideMenu.feedbackMenuItem.first()).toBeVisible({
          timeout: 10_000,
        });
      });
    });
  },
);
