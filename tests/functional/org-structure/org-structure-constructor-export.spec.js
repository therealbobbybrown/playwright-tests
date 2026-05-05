import { test } from "../../fixtures/auth.js";
import { expect } from "@playwright/test";
import { StructureConstructorPage } from "../../../pages/StructureConstructorPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

test.describe(
  "Орг. структура — конструктор: экспорт",
  { tag: ["@ui", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.ORG_STRUCTURE);
    });

    test(
      "C8195: Админ скачивает экспорт структуры компании",
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("normal");
        const constructorPage = new StructureConstructorPage(page, testInfo);

        await test.step("Открыть страницу конструктора через боковое меню", async () => {
          await constructorPage.openFromSideMenu();
        });

        await test.step('Нажать кнопку "Скачать" и перехватить открытие новой вкладки', async () => {
          const [exportPage] = await Promise.all([
            page.context().waitForEvent("page", { timeout: 10000 }),
            constructorPage.exportButton.click(),
          ]);

          await test.step("Проверить URL страницы экспорта", async () => {
            await exportPage.waitForLoadState("domcontentloaded", {
              timeout: 15000,
            });
            const exportUrl = decodeURIComponent(exportPage.url());
            expect(exportUrl).toContain("/download/");
            expect(exportUrl).toContain("export/xlsx");
          });

          await test.step("Закрыть вкладку экспорта", async () => {
            await exportPage.close();
          });
        });
      },
    );
  },
);
