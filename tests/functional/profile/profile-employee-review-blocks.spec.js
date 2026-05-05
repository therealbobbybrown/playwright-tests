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

  test('C3990: Вкладка "Оценка сотрудника" — состав блоков (без проверки содержимого)', async ({
    adminAuth,
    page,
  }, testInfo) => {
    setSeverity("normal");
    const sideMenu = new SideMenu(page, testInfo);
    const profilePage = new ProfileMainPage(page, testInfo);

    await test.step('Открыть "Мой профиль"', async () => {
      await sideMenu.openMyProfile();
      await profilePage.assertOpened();
    });

    const available = await profilePage.isEmployeeReviewTabAvailable();
    test.skip(
      !available,
      'Вкладка "Оценка сотрудника" недоступна на этом стенде (фича-флаг/права).',
    );

    await test.step('Открыть вкладку "Оценка сотрудника"', async () => {
      await profilePage.openEmployeeReviewTab();
    });

    await test.step("Проверить основные блоки", async () => {
      await profilePage.assertEmployeeReviewTabBlocksPresent();
    });
  });
});
