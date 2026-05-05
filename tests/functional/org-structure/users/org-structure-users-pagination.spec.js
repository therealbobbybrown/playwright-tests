// tests/org-structure-users-pagination.spec.js
import { test } from "../../../fixtures/auth.js";
import { expect } from "@playwright/test";
import { StructureUsersPage } from "../../../../pages/StructureUsersPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";

test.describe(
  "Орг. структура - пагинация списка сотрудников",
  { tag: ["@ui", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.ORG_STRUCTURE);
    });

    test(
      "C8208: Админ переключает страницу в списке сотрудников и видит другие записи",
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("normal");
        const usersPage = new StructureUsersPage(page, testInfo);

        await test.step('Открыть страницу "Список сотрудников" через боковое меню', async () => {
          await usersPage.openFromSideMenu();
        });

        await test.step("Дождаться загрузки строк таблицы", async () => {
          await usersPage.tableRows.first().waitFor({ state: "visible" });
        });

        /** Извлечь имя из первой ячейки строки (пропуская аватар-букву) */
        async function getNameFromRow(row) {
          const cell = row.locator("td").first();
          const fullText = (await cell.innerText()).trim();
          const lines = fullText.split("\n").map((l) => l.trim()).filter(Boolean);
          return lines.find((l) => l.length > 2 && !l.includes("@")) || lines[1] || lines[0];
        }

        let firstName1;
        await test.step("Запомнить имя первой записи на странице 1", async () => {
          firstName1 = await getNameFromRow(usersPage.tableRows.first());
          expect(firstName1.length).toBeGreaterThan(0);
        });

        await test.step("Перейти на вторую страницу", async () => {
          const paginationLink = page.locator('a[href*="page=2"]').first();
          await paginationLink.scrollIntoViewIfNeeded();
          await paginationLink.click();
          await page.waitForURL(/page=2/, { timeout: 10000 });
        });

        await test.step("Дождаться загрузки строк второй страницы", async () => {
          await usersPage.tableRows.first().waitFor({ state: "visible" });
          await page.waitForLoadState("networkidle").catch(() => {});
        });

        await test.step("Проверить, что на второй странице отображаются другие записи", async () => {
          const firstName2 = await getNameFromRow(usersPage.tableRows.first());
          expect(firstName2.length).toBeGreaterThan(0);
          expect(
            firstName2,
            `Имя на стр.2 («${firstName2}») должно отличаться от стр.1 («${firstName1}»)`,
          ).not.toBe(firstName1);
        });
      },
    );
  },
);
