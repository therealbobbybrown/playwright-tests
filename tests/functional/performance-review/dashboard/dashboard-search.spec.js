// tests/functional/performance-review/dashboard/dashboard-search.spec.js
// C4177: поле поиска на дашборде

import { test, expect } from "../../../fixtures/auth.js";
import { SideMenu } from "../../../../pages/SideMenu.js";
import { MyTeamPage } from "../../../../pages/MyTeamPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";

test.describe(
  "Manager Dashboard - Поиск",
  {
    tag: [
      "@dashboard",
      "@my-team",
      "@performance-review",
      "@regression",
      "@ui",
    ],
  },
  () => {
    test.beforeAll(async ({ prSeed }) => {
      const pr = await prSeed.seedActivePR({ fillAssessments: true });
      console.log(`[dashboard-search] PR: ${pr.id}`);
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.MY_TEAM, "Smoke Tests");
    });

    test(
      "C4177: Поле поиска работает",
      { tag: [] },
      async ({ managerAuth: page }, testInfo) => {
        setSeverity("minor");
        const sideMenu = new SideMenu(page, testInfo);
        const myTeamPage = new MyTeamPage(page, testInfo);

        await test.step('Открыть "Моя команда"', async () => {
          await sideMenu.openMyTeam();
          await myTeamPage.assertOpened();
        });

        await test.step("Проверить поле поиска", async () => {
          await expect(myTeamPage.searchInput).toBeVisible({ timeout: 5000 });
          await myTeamPage.searchEmployee("Тест");
          await myTeamPage.clearSearch();
          console.log("Поиск работает");
        });
      },
    );
  },
);
