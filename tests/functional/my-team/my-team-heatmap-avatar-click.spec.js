import { test, expect } from "../../fixtures/auth.js";
import { SideMenu } from "../../../pages/SideMenu.js";
import { MyTeamPage } from "../../../pages/MyTeamPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

test.describe(
  "Моя команда — Переход в профиль через аватар в тепловой карте",
  { tag: ["@ui", "@my-team", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.MY_TEAM);
    });

    test(
      "C7464: Клик по аватару сотрудника в тепловой карте открывает его профиль",
      { tag: ["@critical"] },
      async ({ managerAuth: page }, testInfo) => {
        setSeverity("critical");
        const sideMenu = new SideMenu(page, testInfo);
        const myTeamPage = new MyTeamPage(page, testInfo);

        await test.step("Открыть «Моя команда» → вкладка «Оценка команды»", async () => {
          await sideMenu.openMyTeam();
          await myTeamPage.assertOpened();
          await myTeamPage.switchToTeamEvaluationTab();
        });

        await test.step("Найти аватар сотрудника в тепловой карте и кликнуть", async () => {
          await myTeamPage.clickHeatmapAvatar();
        });

        await test.step("Проверить переход в профиль", async () => {
          await page.waitForURL(/\/ru\/profile\/\d+/, { timeout: 10000 });
          expect(page.url()).toMatch(/\/ru\/profile\/\d+/);
        });
      },
    );
  },
);
