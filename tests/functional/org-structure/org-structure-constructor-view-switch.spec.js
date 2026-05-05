import { test } from "../../fixtures/auth.js";
import { expect } from "@playwright/test";
import { StructureConstructorPage } from "../../../pages/StructureConstructorPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

test.describe(
  "Орг. структура — конструктор: переключение вида",
  { tag: ["@ui", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.ORG_STRUCTURE);
    });

    test(
      "C8198: Админ переключает вид через меню и переходит на список сотрудников",
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("normal");
        const constructorPage = new StructureConstructorPage(page, testInfo);

        await test.step("Открыть страницу конструктора через боковое меню", async () => {
          await constructorPage.openFromSideMenu();
        });

        await test.step("Нажать кнопку переключения вида", async () => {
          await constructorPage.viewSelectButton.click();
        });

        await test.step('Дождаться выпадающего меню и нажать "Список сотрудников"', async () => {
          const usersLink = page.locator(
            '[class*="ViewSelect"] a[href*="/users/"]',
          );
          await usersLink.waitFor({ state: "visible", timeout: 5000 });
          await usersLink.click();
        });

        await test.step("Проверить переход на страницу списка сотрудников", async () => {
          await page.waitForURL(/\/structure\/users/, { timeout: 15000 });
          await expect(page).toHaveURL(/\/structure\/users/);
          // Breadcrumb содержит "Сотрудники и позиции"
          await expect(
            page.getByText(/Сотрудники/i).first(),
          ).toBeVisible({ timeout: 10000 });
        });
      },
    );
  },
);
