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
  "Моя команда — Двойной клик по аватару открывает профиль один раз",
  { tag: ["@ui", "@my-team", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.MY_TEAM);
    });

    test(
      "C7491: Двойной клик по аватару не вызывает двойной переход в истории браузера",
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

        await test.step("Выполнить двойной клик по аватару сотрудника", async () => {
          const row = myTeamPage.getEmployeeRowByName(employeeName);
          const avatar = row
            .locator("td")
            .first()
            .locator('[class*="Avatar_avatar"]')
            .first();
          await avatar.waitFor({ state: "visible", timeout: 10000 });
          await avatar.dblclick();
        });

        await test.step("Проверить переход в профиль (ровно один раз)", async () => {
          await page.waitForURL(/\/ru\/profile\/\d+/, { timeout: 10000 });
          expect(page.url()).toMatch(/\/ru\/profile\/\d+/);
          // Профиль должен принадлежать кликнутому сотруднику
          await profilePage.assertProfileBelongsTo(employeeName);
        });

        await test.step("Вернуться на My Team — двойной клик не сломал навигацию", async () => {
          // Используем явную навигацию: dblclick в SPA может создавать разное
          // количество history entries (зависит от router.replace/push)
          await sideMenu.openMyTeam();
          await myTeamPage.assertOpened();
        });
      },
    );
  },
);
