import { test, expect } from "../../fixtures/auth.js";
import { SideMenu } from "../../../pages/SideMenu.js";
import { MyTeamPage } from "../../../pages/MyTeamPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

test.describe(
  "Моя команда — Hover-эффекты аватара в таблице",
  { tag: ["@ui", "@my-team", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.MY_TEAM);
    });

    test(
      "C7470: A7: Наведение на строку вне аватара не затемняет аватар и не показывает тултип",
      { tag: ["@critical"] },
      async ({ managerAuth: page }, testInfo) => {
        setSeverity("critical");
        const sideMenu = new SideMenu(page, testInfo);
        const myTeamPage = new MyTeamPage(page, testInfo);

        let employeeName;

        await test.step("Открыть «Моя команда»", async () => {
          await sideMenu.openMyTeam();
          await myTeamPage.assertOpened();
        });

        await test.step("Получить имя первого сотрудника", async () => {
          const names = await myTeamPage.getAllEmployeeNames();
          expect(
            names.length,
            "В таблице должен быть хотя бы один сотрудник",
          ).toBeGreaterThan(0);
          employeeName = names[0];
        });

        await test.step("Навести курсор на ячейку строки вне зоны аватара (вторая колонка)", async () => {
          const row = myTeamPage.getEmployeeRowByName(employeeName);
          const secondCell = row.locator("td").nth(1);
          await secondCell.waitFor({ state: "visible", timeout: 10000 });
          await secondCell.hover();
        });

        await test.step("Проверить, что тултип «Перейти в профиль» НЕ появился", async () => {
          const tooltip = page
            .locator('[role="tooltip"]')
            .filter({ hasText: "Перейти в профиль" })
            .first();
          const tooltipVisible = await tooltip.isVisible();
          expect(
            tooltipVisible,
            "Тултип «Перейти в профиль» не должен появляться при hover вне аватара",
          ).toBe(false);
        });

        await test.step("Проверить, что аватар НЕ затемнён при hover вне аватара", async () => {
          const row = myTeamPage.getEmployeeRowByName(employeeName);
          const employeeCell = row.locator("td").first();

          // overlay аватара не должен быть видим
          const overlay = employeeCell
            .locator(
              '[class*="overlay"], [class*="Overlay"], [class*="hover"], [class*="dim"]',
            )
            .first();
          const overlayVisible = await overlay.isVisible();

          expect(
            overlayVisible,
            "Overlay аватара не должен быть виден при hover на строку вне зоны аватара",
          ).toBe(false);
        });
      },
    );
  },
);
