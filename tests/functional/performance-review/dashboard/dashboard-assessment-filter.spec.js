// tests/functional/performance-review/dashboard/dashboard-assessment-filter.spec.js
// C4178: фильтр "Выберите оценку" на дашборде

import { test, expect } from "../../../fixtures/auth.js";
import { SideMenu } from "../../../../pages/SideMenu.js";
import { MyTeamPage } from "../../../../pages/MyTeamPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";

test.describe(
  'Manager Dashboard - Фильтр "Выберите оценку"',
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
      console.log(`[dashboard-assessment-filter] PR: ${pr.id}`);
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.MY_TEAM, "Smoke Tests");
    });

    test(
      'C4178: Фильтр "Выберите оценку" доступен',
      { tag: [] },
      async ({ managerAuth: page }, testInfo) => {
        setSeverity("minor");
        const sideMenu = new SideMenu(page, testInfo);
        const myTeamPage = new MyTeamPage(page, testInfo);

        await test.step('Открыть "Моя команда"', async () => {
          await sideMenu.openMyTeam();
          await myTeamPage.assertOpened();
        });

        await test.step("Проверить фильтр оценок", async () => {
          await expect(myTeamPage.assessmentSelect).toBeVisible({
            timeout: 5000,
          });

          const currentValue = await myTeamPage.getSelectedAssessment();
          console.log(`Текущее значение фильтра: ${currentValue}`);
        });
      },
    );
  },
);
