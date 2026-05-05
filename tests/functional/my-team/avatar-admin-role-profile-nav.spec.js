import { test, expect } from "../../fixtures/auth.js";
import { SideMenu } from "../../../pages/SideMenu.js";
import { MyTeamPage } from "../../../pages/MyTeamPage.js";
import { ProfileMainPage } from "../../../pages/ProfileMainPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

test.describe(
  "Моя команда — Роль ADMIN видит аватары с навигацией в профиль",
  { tag: ["@ui", "@my-team", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.MY_TEAM);
    });

    test(
      "C7487: Администратор может кликнуть по аватару сотрудника и перейти в его профиль",
      { tag: ["@critical"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("critical");
        const sideMenu = new SideMenu(page, testInfo);
        const myTeamPage = new MyTeamPage(page, testInfo);
        const profilePage = new ProfileMainPage(page, testInfo);

        let employeeName;

        await test.step("Открыть «Моя команда» от имени администратора", async () => {
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

        await test.step("Кликнуть по аватару сотрудника", async () => {
          await myTeamPage.clickEmployeeAvatar(employeeName);
        });

        await test.step("Проверить переход в профиль сотрудника", async () => {
          await page.waitForURL(/\/ru\/profile\/\d+/, { timeout: 10000 });
          expect(page.url()).toMatch(/\/ru\/profile\/\d+/);
          await profilePage.assertProfileBelongsTo(employeeName);
        });
      },
    );
  },
);
