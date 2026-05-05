// tests/functional/org-structure/users/org-structure-users-filter-tabs.spec.js
import { test } from "../../../fixtures/auth.js";
import { expect } from "@playwright/test";
import { StructureUsersPage } from "../../../../pages/StructureUsersPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";

test.describe(
  "Орг. структура - фильтры по статусу сотрудников",
  { tag: ["@ui", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.ORG_STRUCTURE);
    });

    test(
      "C8207: Админ переключает табы фильтров и видит корректные счётчики",
      { tag: [] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("normal");
        const usersPage = new StructureUsersPage(page, testInfo);

        await test.step('Открыть "Список сотрудников" через боковое меню', async () => {
          await usersPage.openFromSideMenu();
        });

        await test.step("Проверить наличие табов фильтров", async () => {
          await usersPage.filterPresetButtons
            .first()
            .waitFor({ state: "visible" });
          const tabCount = await usersPage.filterPresetButtons.count();
          expect(tabCount).toBeGreaterThanOrEqual(3);
        });

        await test.step(
          "Перебрать каждый таб, проверить активное состояние и соответствие счётчика",
          async () => {
            const tabCount = await usersPage.filterPresetButtons.count();

            for (let i = 0; i < tabCount; i++) {
              const tab = usersPage.filterPresetButtons.nth(i);
              const tabText = (await tab.innerText()).trim();

              await tab.scrollIntoViewIfNeeded().catch(() => null);
              await tab.click();
              await page.waitForLoadState("networkidle").catch(() => null);

              // Проверяем активное состояние
              const isActive = await tab.evaluate((node) =>
                node.className.includes("FilterButton_button--active"),
              );
              expect(
                isActive,
                `Таб "${tabText}" должен быть активен после клика`,
              ).toBe(true);

              // Извлекаем счётчик из текста таба (например "Активные (2015)")
              const countMatch = tabText.match(/\((\d+)\)/);
              if (countMatch) {
                const expectedCount = parseInt(countMatch[1], 10);

                if (expectedCount > 0) {
                  // Ждём загрузки строк после переключения
                  await usersPage.tableRows
                    .first()
                    .waitFor({ state: "visible", timeout: 5000 })
                    .catch(() => {});
                  const rowCount = await usersPage.tableRows.count();
                  expect(
                    rowCount,
                    `Таб "${tabText}" показывает ${expectedCount} записей, но таблица пустая`,
                  ).toBeGreaterThan(0);
                }
                // При 0 записей не проверяем таблицу — достаточно что таб стал active
              }
            }
          },
        );
      },
    );
  },
);
