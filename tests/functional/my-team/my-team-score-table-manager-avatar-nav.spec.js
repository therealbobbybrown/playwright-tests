// tests/functional/my-team/my-team-score-table-manager-avatar-nav.spec.js
// TestRail: C7499
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
  "Моя команда — Переход в профиль через аватар менеджера в колонке оценки",
  { tag: ["@ui", "@my-team", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.MY_TEAM);
    });

    test(
      "C7493: Клик по аватару менеджера в колонке «Оценка руководителя» открывает профиль менеджера",
      { tag: ["@critical"] },
      async ({ managerAuth: page }, testInfo) => {
        setSeverity("critical");
        const sideMenu = new SideMenu(page, testInfo);
        const myTeamPage = new MyTeamPage(page, testInfo);
        const profilePage = new ProfileMainPage(page, testInfo);

        let managerName;
        let managerAvatarFound = false;

        await test.step("Открыть «Моя команда»", async () => {
          await sideMenu.openMyTeam();
          await myTeamPage.assertOpened();
        });

        await test.step("Найти аватар менеджера в колонке «Оценка руководителя» и кликнуть", async () => {
          // Ищем ссылку-аватар в ячейках НЕ первого столбца (первый — оцениваемый)
          // Структура ячейки: [status text] + <a href="/ru/profile/ID/"> (аватар менеджера)
          const managerAvatarLink = page
            .locator(
              '[class*="Table_table"] tbody tr td:not(:first-child) a[href*="/ru/profile/"]',
            )
            .first();

          await managerAvatarLink.waitFor({ state: "visible", timeout: 10000 });

          managerAvatarFound = true;

          // Получаем имя из текста ссылки (минуя статус "Пройдена")
          const linkText = (await managerAvatarLink.textContent()).trim();
          // Фильтруем статусные слова
          const lines = linkText
            .split("\n")
            .map((l) => l.trim())
            .filter(
              (l) => l.length > 2 && !/^пройдена$|^не пройдена$/i.test(l),
            );
          managerName = lines[0] || "";
          console.log(`Имя менеджера из ячейки: "${managerName}"`);

          await managerAvatarLink.click();
        });

        await test.step("Проверить переход в профиль менеджера", async () => {
          await page.waitForURL(/\/ru\/profile\/\d+/, { timeout: 10000 });
          expect(page.url()).toMatch(/\/ru\/profile\/\d+/);
          if (managerName) {
            await profilePage.assertProfileBelongsTo(managerName);
          }
        });
      },
    );
  },
);
