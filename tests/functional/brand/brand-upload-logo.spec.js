// tests/brand-upload-logo.spec.js
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
  "Внешний вид - загрузка логотипа",
  { tag: ["@ui", "@regression"] },
  () => {
    let brandPage;

    test.beforeEach(() => {
      markAsUITest(MODULES.BRAND);
    });

    test.afterEach(async () => {
      if (!brandPage) return;
      try {
        await brandPage.removeLogoIfPresent();
      } catch {
        // Ignore cleanup errors
      }
    });

    test("C3655: Админ загружает логотип через настройки внешнего вида", async ({
      adminAuth,
      page,
    }, testInfo) => {
      setSeverity("normal");
      const sideMenu = new SideMenu(page, testInfo);
      brandPage = new BrandSettingsPage(page, testInfo);

      await test.step('Открыть страницу "Внешний вид"', async () => {
        await sideMenu.openBrandSettings();
        await brandPage.assertOpened();
      });

      await test.step("Удалить существующий логотип, если он установлен", async () => {
        await brandPage.removeLogoIfPresent();
      });

      await test.step("Загрузить новый логотип и увидеть уведомление", async () => {
        await brandPage.uploadLogo("tests/assets/logo-sample.png");
        await brandPage.waitLogoApplied();
        // Проверить, что кнопки управления логотипом видны (превью — не img, а CSS-фон)
        await expect(brandPage.logoDeleteButton).toBeVisible({
          timeout: 10_000,
        });
        await expect(brandPage.logoChangeButton).toBeVisible({
          timeout: 5_000,
        });
      });

      await test.step("Сделать скриншот с установленным логотипом", async () => {
        const shotPath = testInfo.outputPath("brand-logo-set.png");
        await page.screenshot({ path: shotPath, fullPage: true });
        await testInfo.attach("brand-logo-set", {
          path: shotPath,
          contentType: "image/png",
        });
      });

      await test.step("Удалить загруженный логотип", async () => {
        await brandPage.removeLogoIfPresent();
      });

      await test.step("Дождаться удаления, обновить и сделать финальный скриншот", async () => {
        await brandPage.waitLogoRemoved();
        // Проверить, что кнопки управления логотипом скрыты после удаления
        await expect(brandPage.logoDeleteButton).toBeHidden({
          timeout: 10_000,
        });
        await expect(brandPage.logoChangeButton).toBeHidden({ timeout: 5_000 });
        await page.reload({ waitUntil: "domcontentloaded" });
        await brandPage.assertOpened();
        const shotPath = testInfo.outputPath("brand-logo-removed.png");
        await page.screenshot({ path: shotPath, fullPage: true });
        await testInfo.attach("brand-logo-removed", {
          path: shotPath,
          contentType: "image/png",
        });
      });
    });
  },
);
