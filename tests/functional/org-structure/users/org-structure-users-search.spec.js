// tests/functional/org-structure/users/org-structure-users-search.spec.js
import { test } from "../../../fixtures/auth.js";
import { expect } from "@playwright/test";
import { StructureUsersPage } from "../../../../pages/StructureUsersPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";

test.describe(
  "Орг. структура - поиск сотрудников",
  { tag: ["@ui", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.ORG_STRUCTURE);
    });

    test(
      "C8209: Админ ищет сотрудника по имени и находит его в таблице",
      { tag: ["@smoke"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("normal");
        const usersPage = new StructureUsersPage(page, testInfo);

        await test.step('Открыть "Список сотрудников" через боковое меню', async () => {
          await usersPage.openFromSideMenu();
        });

        await test.step("Дождаться загрузки таблицы со строками", async () => {
          await usersPage.table.waitFor({ state: "visible" });
          await usersPage.tableRows.first().waitFor({ state: "visible" });
        });

        let partialName;
        await test.step("Получить имя из первой строки таблицы", async () => {
          const fullName = (
            await usersPage.tableRows
              .first()
              .locator("td")
              .first()
              .textContent()
          ).trim();
          expect(fullName.length).toBeGreaterThan(0);
          // берём первые 4 символа как поисковый запрос
          partialName = fullName.slice(0, 4);
        });

        await test.step("Ввести часть имени в строку поиска", async () => {
          await usersPage.searchInput.fill(partialName);
          await page.waitForLoadState("networkidle").catch(() => null);
        });

        await test.step("Проверить, что таблица содержит результаты поиска с нужным именем", async () => {
          await usersPage.table.waitFor({ state: "visible" });
          const rowCount = await usersPage.tableRows.count();
          expect(rowCount).toBeGreaterThan(0);

          const firstResultText = (
            await usersPage.tableRows
              .first()
              .locator("td")
              .first()
              .textContent()
          ).trim();
          expect(firstResultText.toLowerCase()).toContain(
            partialName.toLowerCase(),
          );
        });
      },
    );
  },
);
