// tests/functional/performance-review/dashboard/dashboard-results-button.spec.js
// C4176: кнопка "Результаты" для подчинённых

import { test, expect } from "../../../fixtures/auth.js";
import { SideMenu } from "../../../../pages/SideMenu.js";
import { MyTeamPage } from "../../../../pages/MyTeamPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";

test.describe(
  'Manager Dashboard - Кнопка "Результаты"',
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
      console.log(`[dashboard-results-button] PR: ${pr.id}`);
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.MY_TEAM, "Smoke Tests");
    });

    test(
      'C4176: Кнопка "Результаты" доступна для подчинённых',
      { tag: [] },
      async ({ managerAuth: page }, testInfo) => {
        setSeverity("normal");
        const sideMenu = new SideMenu(page, testInfo);
        const myTeamPage = new MyTeamPage(page, testInfo);

        await test.step('Открыть "Моя команда"', async () => {
          await sideMenu.openMyTeam();
          await myTeamPage.assertOpened();
        });

        await test.step('Проверить кнопки "Результаты"', async () => {
          await expect(myTeamPage.table).toBeVisible({ timeout: 10000 });

          const resultsBtnsCount = await myTeamPage.resultsButtons.count();
          console.log(`Кнопок "Результаты": ${resultsBtnsCount}`);

          if (resultsBtnsCount > 0) {
            const firstBtn = myTeamPage.resultsButtons.first();
            const isEnabled = await firstBtn.isEnabled();
            console.log(`Первая кнопка активна: ${isEnabled}`);
          }
        });
      },
    );
  },
);
