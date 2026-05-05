import { test, expect } from "../../fixtures/auth.js";
import { SideMenu } from "../../../pages/SideMenu.js";
import { MyTeamPage } from "../../../pages/MyTeamPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

test.describe(
  "Моя команда — Keyboard accessibility аватара (Tab + Enter)",
  { tag: ["@ui", "@my-team", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.MY_TEAM);
    });

    test(
      "C7492: Аватар-ссылка доступна с клавиатуры — Tab фокусирует, Enter переходит в профиль",
      { tag: ["@critical"] },
      async ({ managerAuth: page }, testInfo) => {
        setSeverity("critical");
        const sideMenu = new SideMenu(page, testInfo);
        const myTeamPage = new MyTeamPage(page, testInfo);

        let profileHref = null;

        await test.step("Открыть «Моя команда»", async () => {
          await sideMenu.openMyTeam();
          await myTeamPage.assertOpened();
        });

        await test.step("Перебирать Tab пока не окажемся на ссылке профиля", async () => {
          for (let i = 0; i < 30; i++) {
            await page.keyboard.press("Tab");
            const href = await page.evaluate(
              () => document.activeElement?.href || "",
            );
            if (/\/ru\/profile\/\d+/.test(href)) {
              profileHref = href;
              break;
            }
          }

          expect(
            profileHref,
            "Аватар-ссылка должна быть доступна через Tab (проверьте tabindex у <a> в таблице)",
          ).toBeTruthy();
        });

        await test.step("Проверить URL сфокусированной ссылки", async () => {
          expect(profileHref).toMatch(/\/ru\/profile\/\d+/);
        });

        await test.step("Нажать Enter и проверить переход в профиль", async () => {
          await page.keyboard.press("Enter");
          await page.waitForURL(/\/ru\/profile\/\d+/, { timeout: 10000 });
          expect(page.url()).toMatch(/\/ru\/profile\/\d+/);
        });
      },
    );
  },
);
