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
  "Моя команда — Верификация userId при переходе в профиль через аватар",
  { tag: ["@ui", "@my-team", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.MY_TEAM);
    });

    test(
      "C7462: K1: Клик по аватару открывает профиль с корректным userId сотрудника",
      { tag: ["@critical"] },
      async ({ managerAuth: page }, testInfo) => {
        setSeverity("critical");
        const sideMenu = new SideMenu(page, testInfo);
        const myTeamPage = new MyTeamPage(page, testInfo);
        const profilePage = new ProfileMainPage(page, testInfo);

        let employeeName;
        let expectedUserId;

        await test.step("Открыть «Моя команда»", async () => {
          await sideMenu.openMyTeam();
          await myTeamPage.assertOpened();
        });

        await test.step("Получить имя первого сотрудника из таблицы", async () => {
          const names = await myTeamPage.getAllEmployeeNames();
          expect(
            names.length,
            "В таблице должен быть хотя бы один сотрудник",
          ).toBeGreaterThan(0);
          employeeName = names[0];
        });

        await test.step("Извлечь ожидаемый userId из ссылки аватара", async () => {
          const row = myTeamPage.getEmployeeRowByName(employeeName);
          const employeeCell = row.locator("td").first();
          const profileLink = employeeCell
            .locator('a[href*="/profile/"]')
            .first();

          await profileLink.waitFor({ state: "attached", timeout: 10000 });
          const href = await profileLink.getAttribute("href");

          expect(
            href,
            "Ссылка на профиль должна присутствовать в ячейке аватара",
          ).toBeTruthy();

          const match = href.match(/\/profile\/(\d+)/);
          expect(
            match,
            `Ссылка «${href}» не содержит числового userId в формате /profile/<id>`,
          ).toBeTruthy();

          expectedUserId = match[1];
          expect(
            expectedUserId,
            "Извлечённый userId не должен быть пустым",
          ).toBeTruthy();
        });

        await test.step("Кликнуть по аватару сотрудника", async () => {
          await myTeamPage.clickEmployeeAvatar(employeeName);
        });

        await test.step("Проверить, что URL профиля содержит именно тот userId", async () => {
          await page.waitForURL(/\/ru\/profile\/\d+/, { timeout: 10000 });

          const actualUrl = page.url();
          const actualMatch = actualUrl.match(/\/profile\/(\d+)/);

          expect(
            actualMatch,
            `URL после перехода «${actualUrl}» не содержит числового userId`,
          ).toBeTruthy();

          const actualUserId = actualMatch[1];

          expect(
            actualUserId,
            `Ожидался userId ${expectedUserId} (из ссылки аватара), но в URL оказался ${actualUserId}`,
          ).toBe(expectedUserId);
        });

        await test.step("Проверить, что в профиле отображается имя нужного сотрудника", async () => {
          await profilePage.assertProfileBelongsTo(
            employeeName,
            expectedUserId,
          );
        });
      },
    );
  },
);
