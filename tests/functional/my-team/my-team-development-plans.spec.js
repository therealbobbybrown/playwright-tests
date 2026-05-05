import { test } from "../../fixtures/auth.js";
import { SideMenu } from "../../../pages/SideMenu.js";
import { MyTeamPage } from "../../../pages/MyTeamPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { ensureDevelopmentPlansEnabled } from "../../utils/helpers/ensureDevelopmentPlansEnabled.js";

test.describe(
  "Моя команда — Планы развития",
  { tag: ["@ui", "@regression"] },
  () => {
    test.beforeAll(async ({ request }) => {
      const result = await ensureDevelopmentPlansEnabled(request);
      if (!result.isEnabled) {
        throw new Error("Не удалось включить модуль ИПР");
      }
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.MY_TEAM);
    });

    test(
      'C3992: Админ открывает вкладку "Планы развития" и видит базовые элементы',
      { tag: [] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("critical");
        const sideMenu = new SideMenu(page, testInfo);
        const myTeamPage = new MyTeamPage(page, testInfo);

        await test.step('Открыть "Моя команда" через боковое меню', async () => {
          await sideMenu.openMyTeam();
          await myTeamPage.assertOpened();
        });

        await test.step('Проверить UI вкладки "Планы развития" без учёта данных', async () => {
          await myTeamPage.assertDevelopmentPlansLayout();
        });
      },
    );
  },
);
