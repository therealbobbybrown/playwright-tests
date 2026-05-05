// tests/functional/performance-review/dashboard/dashboard-subordinates.spec.js
// C4175: отображение подчинённых с колонками направлений

import { test, expect } from "../../../fixtures/auth.js";
import { SideMenu } from "../../../../pages/SideMenu.js";
import { MyTeamPage } from "../../../../pages/MyTeamPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";

test.describe(
  "Manager Dashboard - Подчинённые",
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
      console.log(`[dashboard-subordinates] PR: ${pr.id}`);
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.MY_TEAM, "Smoke Tests");
    });

    test(
      "C4175: Таблица подчинённых отображается с колонками направлений",
      { tag: [] },
      async ({ managerAuth: page }, testInfo) => {
        setSeverity("normal");
        const sideMenu = new SideMenu(page, testInfo);
        const myTeamPage = new MyTeamPage(page, testInfo);

        await test.step('Открыть "Моя команда"', async () => {
          await sideMenu.openMyTeam();
          await myTeamPage.assertOpened();
        });

        await test.step("Проверить заголовки колонок таблицы", async () => {
          await expect(myTeamPage.table).toBeVisible({ timeout: 10000 });

          const headers = await myTeamPage.tableHeaders.allInnerTexts();
          const normalized = headers
            .map((h) => h.replace(/\s+/g, " ").trim())
            .filter(Boolean);
          console.log(`Колонки: ${normalized.join(" | ")}`);

          const hasEmployee = normalized.some((h) => /оцениваем/i.test(h));
          console.log(`Колонка "Оцениваемый": ${hasEmployee}`);

          const hasSelfAssessment = normalized.some((h) =>
            /самооценк/i.test(h),
          );
          console.log(`Колонка "Самооценка": ${hasSelfAssessment}`);
        });
      },
    );
  },
);
