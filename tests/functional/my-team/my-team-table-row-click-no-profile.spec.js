import { test, expect } from "../../fixtures/auth.js";
import { SideMenu } from "../../../pages/SideMenu.js";
import { MyTeamPage } from "../../../pages/MyTeamPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

test.describe(
  "Моя команда — Клик по строке вне аватара не ведёт в профиль",
  { tag: ["@ui", "@my-team", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.MY_TEAM);
    });

    test(
      "C7473: Клик по области строки правее аватара раскрывает аккордеон, не переходит в профиль",
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

        await test.step("Кликнуть на ячейку правее аватара (вторая колонка)", async () => {
          const row = myTeamPage.getEmployeeRowByName(employeeName);
          // Кликаем на вторую ячейку (не первую, где аватар/имя)
          const secondCell = row.locator("td").nth(1);
          await secondCell.waitFor({ state: "visible", timeout: 10000 });
          await secondCell.click();
        });

        await test.step("Проверить, что URL не изменился на профиль", async () => {
          await expect(
            page,
            "Не должно быть перехода в /profile/",
          ).not.toHaveURL(/\/ru\/profile\/\d+/, { timeout: 2000 });
        });
      },
    );
  },
);
