// tests/profile-main-blocks.spec.js
import { test } from "../../fixtures/auth.js";
import { SideMenu } from "../../../pages/SideMenu.js";
import { ProfileMainPage } from "../../../pages/ProfileMainPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

test.describe("Профиль", { tag: ["@regression"] }, () => {
  test.beforeEach(() => {
    markAsUITest(MODULES.PROFILE);
  });

  test(
    'C3991: Админ открывает "Мой профиль" и видит набор блоков на вкладке "Главное" (без проверки содержимого)',
    { tag: ["@smoke", "@critical"] },
    async ({ adminAuth, page }, testInfo) => {
      setSeverity("critical");
      const sideMenu = new SideMenu(page, testInfo);
      const profileMainPage = new ProfileMainPage(page, testInfo);

      await test.step('Открыть "Мой профиль" через боковое меню', async () => {
        await sideMenu.openMyProfile();
      });

      await test.step("Проверить, что профиль открыт", async () => {
        await profileMainPage.assertOpened();
      });

      await test.step('Проверить вкладку "Главное" и состав блоков', async () => {
        await profileMainPage.assertMainTabActive();
        await profileMainPage.assertMainTabBlocksPresent();
      });
    },
  );
});
