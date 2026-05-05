// tests/profile-development-plans-blocks.spec.js
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

  test('C3989: Админ открывает "Мой профиль" и видит набор элементов на вкладке "Развитие" (без проверки содержимого)', async ({
    adminAuth,
    page,
  }, testInfo) => {
    setSeverity("normal");
    const sideMenu = new SideMenu(page, testInfo);
    const profileMainPage = new ProfileMainPage(page, testInfo);

    await test.step('Открыть "Мой профиль" через боковое меню', async () => {
      await sideMenu.openMyProfile();
    });

    await test.step("Проверить, что страница профиля открылась", async () => {
      await profileMainPage.assertOpened();
    });

    await test.step('Перейти на вкладку "Развитие"', async () => {
      await profileMainPage.openDevelopmentTab();
    });

    await test.step('Проверить состав элементов на вкладке "Развитие" (без проверки содержимого)', async () => {
      await profileMainPage.assertDevelopmentTabBlocksPresent();
    });
  });
});
