import { test } from "../../fixtures/auth.js";
import { SideMenu } from "../../../pages/SideMenu.js";
import { MyTeamPage } from "../../../pages/MyTeamPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

test.describe("Моя команда", { tag: ["@ui", "@regression"] }, () => {
  test.beforeEach(() => {
    markAsUITest(MODULES.MY_TEAM);
  });

  test(
    "C3669: Админ открывает раздел и видит базовые элементы",
    { tag: ["@smoke"] },
    async ({ adminAuth: page }, testInfo) => {
      setSeverity("critical");
      const sideMenu = new SideMenu(page, testInfo);
      const myTeamPage = new MyTeamPage(page, testInfo);

      await test.step('Открыть "Моя команда" через боковое меню', async () => {
        await sideMenu.openMyTeam();
        await myTeamPage.assertOpened();
      });

      await test.step("Проверить UI раздела без учёта данных", async () => {
        await myTeamPage.assertBaseLayout();
      });
    },
  );
});
