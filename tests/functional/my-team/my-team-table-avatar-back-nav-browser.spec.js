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
  "Моя команда — Навигация назад после перехода в профиль через аватар",
  { tag: ["@ui", "@my-team", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.MY_TEAM);
    });

    test(
      "C7467: A9: Клик по аватару → профиль → кнопка «Назад» браузера → возврат на «Моя команда»",
      { tag: ["@critical"] },
      async ({ managerAuth: page }, testInfo) => {
        setSeverity("critical");
        const sideMenu = new SideMenu(page, testInfo);
        const myTeamPage = new MyTeamPage(page, testInfo);
        const profilePage = new ProfileMainPage(page, testInfo);

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

        await test.step("Кликнуть по аватару сотрудника", async () => {
          await myTeamPage.clickEmployeeAvatar(employeeName);
        });

        await test.step("Проверить переход в профиль сотрудника", async () => {
          await page.waitForURL(/\/ru\/profile\/\d+/, { timeout: 10000 });
          expect(page.url()).toMatch(/\/ru\/profile\/\d+/);
          await profilePage.assertProfileBelongsTo(employeeName);
        });

        await test.step("Нажать «Назад» в браузере", async () => {
          await page.goBack();
        });

        await test.step("Проверить возврат на страницу «Моя команда»", async () => {
          await myTeamPage.assertOpened();
        });
      },
    );
  },
);
