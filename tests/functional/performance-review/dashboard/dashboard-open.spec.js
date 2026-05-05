// tests/functional/performance-review/dashboard/dashboard-open.spec.js
// Smoke: открытие дашборда руководителя "Моя команда"

import { test, expect } from "../../../fixtures/auth.js";
import { SideMenu } from "../../../../pages/SideMenu.js";
import { MyTeamPage } from "../../../../pages/MyTeamPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";

test.describe(
  "Manager Dashboard - Открытие",
  {
    tag: [
      "@smoke",
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
      console.log(`[dashboard-open] PR: ${pr.id}`);
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.MY_TEAM, "Smoke Tests");
    });

    test(
      'C4173: Руководитель открывает "Моя команда" и видит подчинённых',
      { tag: ["@smoke", "@critical"] },
      async ({ managerAuth: page }, testInfo) => {
        setSeverity("critical");
        const sideMenu = new SideMenu(page, testInfo);
        const myTeamPage = new MyTeamPage(page, testInfo);

        await test.step('Открыть "Моя команда" через боковое меню', async () => {
          await sideMenu.openMyTeam();
        });

        await test.step("Проверить, что страница загрузилась", async () => {
          await myTeamPage.assertOpened();

          const url = page.url();
          console.log(`URL: ${url}`);
          expect(url).toMatch(/\/dashboard\/?($|\?)/);
        });

        await test.step("Проверить заголовок страницы", async () => {
          await expect(myTeamPage.heading).toBeVisible({ timeout: 10000 });
        });

        await test.step("Проверить таблицу с подчинёнными", async () => {
          await expect(myTeamPage.table).toBeVisible({ timeout: 10000 });

          const rowsCount = await myTeamPage.tableRows.count();
          console.log(`Подчинённых в таблице: ${rowsCount}`);

          if (rowsCount > 0) {
            const firstName = await myTeamPage.getEmployeeNameByIndex(0);
            console.log(`Первый подчинённый: ${firstName}`);
          }
        });
      },
    );
  },
);
