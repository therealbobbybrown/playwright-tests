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
      "C7469: A5: Наведение на аватар дольше 200 мс показывает тултип «Перейти в профиль»",
      { tag: ["@critical"] },
      async ({ managerAuth: page }, testInfo) => {
        setSeverity("normal");
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

        await test.step("Навести курсор на аватар", async () => {
          await myTeamPage.hoverEmployeeAvatar(employeeName);
        });

        await test.step("Проверить появление тултипа «Перейти в профиль»", async () => {
          const tooltipText = await myTeamPage.getTooltipText();
          expect(
            tooltipText,
            "Тултип должен содержать текст «Перейти в профиль»",
          ).toBe("Перейти в профиль");
        });
      },
    );
  },
);
