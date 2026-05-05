import { test, expect } from "../../fixtures/auth.js";
import { SideMenu } from "../../../pages/SideMenu.js";
import { AccountSettingsPage } from "../../../pages/AccountSettingsPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

test.describe(
  "Исключение: Аватар в хидере приложения НЕ ведёт в профиль",
  { tag: ["@ui", "@my-team", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.MY_TEAM);
    });

    test(
      "C7459: Клик по собственному аватару в шапке приложения открывает меню, а не профиль",
      { tag: ["@critical"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("critical");
        const sideMenu = new SideMenu(page, testInfo);
        const accountPage = new AccountSettingsPage(page, testInfo);

        await test.step("Открыть любую страницу приложения", async () => {
          await sideMenu.openMyTeam();
          await page.waitForLoadState("networkidle");
        });

        await test.step("Кликнуть на аватар в хидере (шапке) приложения", async () => {
          await accountPage.headerAvatarButton.waitFor({
            state: "visible",
            timeout: 10000,
          });
          await accountPage.headerAvatarButton.click();
        });

        await test.step("Проверить, что НЕ произошёл переход в профиль", async () => {
          await expect(
            page,
            "Клик по аватару в хидере НЕ должен переходить в /profile/",
          ).not.toHaveURL(/\/ru\/profile\/\d+/, { timeout: 2000 });
        });

        await test.step("Проверить, что открылось меню/настройки", async () => {
          // После клика на аватар в шапке должно открыться меню с «Управление аккаунтом»
          await expect(
            accountPage.manageAccountLink,
            "Меню должно содержать ссылку «Управление аккаунтом»",
          ).toBeVisible({ timeout: 3000 });
        });
      },
    );
  },
);
