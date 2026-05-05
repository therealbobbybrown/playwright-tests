import { test } from "../../fixtures/auth.js";
import { expect } from "@playwright/test";
import { StructureConstructorPage } from "../../../pages/StructureConstructorPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

test.describe(
  "Орг. структура — конструктор: поиск сотрудника",
  { tag: ["@ui", "@regression", "@smoke"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.ORG_STRUCTURE);
    });

    test(
      "C8196: Админ ищет сотрудника в дереве структуры",
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("normal");
        const constructorPage = new StructureConstructorPage(page, testInfo);

        await test.step("Открыть страницу конструктора через боковое меню", async () => {
          await constructorPage.openFromSideMenu();
        });

        await test.step("Нажать кнопку поиска", async () => {
          await constructorPage.searchButton.click();
        });

        await test.step("Дождаться появления модального окна поиска", async () => {
          await page
            .locator('[class*="UserSearchModal_modal"]')
            .waitFor({ state: "visible", timeout: 5000 });
        });

        await test.step('Ввести имя сотрудника "Isla" в поле поиска', async () => {
          const textbox = page.getByRole("textbox").first();
          await textbox.waitFor({ state: "visible", timeout: 5000 });
          await textbox.fill("Isla");
        });

        await test.step("Проверить наличие результата с именем сотрудника", async () => {
          // Узел дерева — button с текстом, содержащим "Isla"
          const result = page.locator('[class*="User_user"] button:has-text("Isla")').first()
            .or(page.locator('button:has-text("Isla 54288")').first());
          // Ждём появления результата (поиск загружает данные)
          await result.waitFor({ state: "visible", timeout: 15000 });
          await expect(result).toBeVisible();
        });

        await test.step("Закрыть модальное окно поиска", async () => {
          const overlay = page.locator('[class*="UserSearchModal_overlay"]');
          // Клик по overlay закрывает модалку
          await overlay.click({ force: true });
          await overlay.waitFor({ state: "hidden", timeout: 5000 });
        });
      },
    );
  },
);
