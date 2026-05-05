import { test, expect } from "../../fixtures/auth.js";
import { SideMenu } from "../../../pages/SideMenu.js";
import { MyTeamPage } from "../../../pages/MyTeamPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

test.describe(
  "Моя команда — Hover-эффекты аватара в карте компетенций",
  { tag: ["@ui", "@my-team", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.MY_TEAM);
    });

    test(
      "C7463: B3: Наведение на аватар в карте компетенций показывает hover-эффекты",
      { tag: ["@critical"] },
      async ({ managerAuth: page }, testInfo) => {
        setSeverity("normal");
        const sideMenu = new SideMenu(page, testInfo);
        const myTeamPage = new MyTeamPage(page, testInfo);

        await test.step("Открыть «Моя команда» → вкладка «Оценка команды»", async () => {
          await sideMenu.openMyTeam();
          await myTeamPage.assertOpened();
          await myTeamPage.switchToTeamEvaluationTab();
        });

        let avatarLocator;

        await test.step("Навести курсор на аватар сотрудника в тепловой карте", async () => {
          avatarLocator = await myTeamPage.hoverHeatmapAvatar();
        });

        await test.step("Проверить затемнение аватара при наведении", async () => {
          const hasHoverEffect = await myTeamPage.checkAvatarHoverEffect(avatarLocator);
          expect(
            hasHoverEffect,
            "При наведении на аватар в карте компетенций должно быть затемнение",
          ).toBe(true);
        });

        await test.step("Проверить тултип «Перейти в профиль»", async () => {
          const tooltipText = await myTeamPage.getTooltipText("Перейти в профиль");
          expect(
            tooltipText,
            "Тултип должен содержать текст «Перейти в профиль»",
          ).toBe("Перейти в профиль");
        });
      },
    );
  },
);
