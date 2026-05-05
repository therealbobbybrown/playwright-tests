import { test } from "../../fixtures/auth.js";
import { expect } from "@playwright/test";
import { StructureConstructorPage } from "../../../pages/StructureConstructorPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

test.describe(
  "Орг. структура — конструктор: навигация по дереву",
  { tag: ["@ui", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.ORG_STRUCTURE);
    });

    test(
      "C8197: Админ сворачивает и раскрывает ветку дерева",
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("normal");
        const constructorPage = new StructureConstructorPage(page, testInfo);

        await test.step("Открыть страницу конструктора через боковое меню", async () => {
          await constructorPage.openFromSideMenu();
        });

        await test.step("Дождаться загрузки дерева (наличие раскрытых узлов)", async () => {
          await page
            .locator('[class*="User_userOpen"]')
            .first()
            .waitFor({ state: "visible", timeout: 15000 });
        });

        let openBefore;
        let toggler;

        await test.step("Подсчитать количество раскрытых узлов до сворачивания", async () => {
          openBefore = await page.locator('[class*="User_userOpen"]').count();
          expect(openBefore).toBeGreaterThan(0);
        });

        await test.step("Найти кнопку сворачивания первого раскрытого узла", async () => {
          const firstOpenNode = page.locator('[class*="User_userOpen"]').first();
          toggler = firstOpenNode
            .locator('[class*="Toggler_toggler"]')
            .first();
          await toggler.scrollIntoViewIfNeeded();
        });

        await test.step("Нажать кнопку сворачивания", async () => {
          await toggler.click();
          // Ждём изменения количества раскрытых узлов
          await expect
            .poll(() => page.locator('[class*="User_userOpen"]').count(), {
              timeout: 5000,
            })
            .toBeLessThan(openBefore);
        });

        let openAfter;

        await test.step("Проверить, что количество раскрытых узлов уменьшилось (ветка свёрнута)", async () => {
          openAfter = await page.locator('[class*="User_userOpen"]').count();
          expect(openAfter).toBeLessThan(openBefore);
        });

        await test.step("Нажать кнопку раскрытия для восстановления ветки", async () => {
          // После collapse нужно заново найти toggler — элемент мог перерендериться
          const firstOpenAfterCollapse = page
            .locator('[class*="User_userOpen"]')
            .first();
          const newToggler = firstOpenAfterCollapse
            .locator('[class*="Toggler_toggler"]')
            .first();
          await newToggler.scrollIntoViewIfNeeded();
          const countBeforeExpand = await page
            .locator('[class*="User_userOpen"]')
            .count();
          await newToggler.click();
          // Ждём изменения
          await expect
            .poll(() => page.locator('[class*="User_userOpen"]').count(), {
              timeout: 5000,
            })
            .not.toBe(countBeforeExpand);
        });

        await test.step("Проверить, что количество узлов изменилось после раскрытия", async () => {
          const openAfterExpand = await page
            .locator('[class*="User_userOpen"]')
            .count();
          // Количество открытых узлов должно отличаться от collapsed-состояния
          expect(openAfterExpand).not.toBe(openAfter);
        });
      },
    );
  },
);
