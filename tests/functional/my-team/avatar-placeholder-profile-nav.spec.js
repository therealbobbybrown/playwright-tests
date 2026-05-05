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
  "Моя команда — Переход в профиль через аватар-заглушку (без фото)",
  { tag: ["@ui", "@my-team", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.MY_TEAM);
    });

    test(
      "C7461: Аватар без фото (заглушка с инициалами) кликабелен и открывает профиль",
      { tag: ["@critical"] },
      async ({ managerAuth: page }, testInfo) => {
        setSeverity("normal");
        const sideMenu = new SideMenu(page, testInfo);
        const myTeamPage = new MyTeamPage(page, testInfo);
        const profilePage = new ProfileMainPage(page, testInfo);

        await test.step("Открыть «Моя команда»", async () => {
          await sideMenu.openMyTeam();
          await myTeamPage.assertOpened();
        });

        let employeeName;

        await test.step("Найти сотрудника с аватаром-заглушкой (без фото)", async () => {
          const { row } = myTeamPage.getPlaceholderAvatarRow();

          const rowCount = await row.count();
          expect(
            rowCount,
            "В таблице должен быть хотя бы один сотрудник с аватаром-заглушкой (без фото). " +
              "Если все сотрудники имеют фото — добавьте пользователя без аватара в seed.",
          ).toBeGreaterThan(0);
          await row.first().waitFor({ state: "visible", timeout: 5000 });

          employeeName = await myTeamPage.getEmployeeNameFromRow(row);
          expect(
            employeeName,
            "Имя сотрудника должно быть непустым",
          ).toBeTruthy();
        });

        expect(
          employeeName,
          "Имя сотрудника с аватаром-заглушкой должно быть получено",
        ).toBeTruthy();

        await test.step("Кликнуть по аватару-заглушке сотрудника", async () => {
          const { avatar } = myTeamPage.getPlaceholderAvatarRow();
          await avatar.click();
        });

        await test.step("Проверить переход в профиль сотрудника", async () => {
          await page.waitForURL(/\/ru\/profile\/\d+/, { timeout: 10000 });
          expect(page.url()).toMatch(/\/ru\/profile\/\d+/);
          await profilePage.assertProfileBelongsTo(employeeName);
        });
      },
    );
  },
);
