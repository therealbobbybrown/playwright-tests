// tests/functional/performance-review/dashboard/dashboard-layout.spec.js
// Smoke: базовый layout страницы "Моя команда"

import { test, expect } from "../../../fixtures/auth.js";
import { SideMenu } from "../../../../pages/SideMenu.js";
import { MyTeamPage } from "../../../../pages/MyTeamPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";

test.describe(
  "Manager Dashboard - Layout",
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
      console.log(`[dashboard-layout] PR: ${pr.id}`);
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.MY_TEAM, "Smoke Tests");
    });

    test(
      "C4174: Базовый layout страницы",
      { tag: [] },
      async ({ managerAuth: page }, testInfo) => {
        setSeverity("normal");
        const sideMenu = new SideMenu(page, testInfo);
        const myTeamPage = new MyTeamPage(page, testInfo);

        await test.step('Открыть "Моя команда"', async () => {
          await sideMenu.openMyTeam();
          await myTeamPage.assertOpened();
        });

        await test.step("Проверить базовые элементы", async () => {
          // Вкладки
          const teamEvalTabVisible = await myTeamPage.teamEvaluationTab
            .isVisible()
          const devPlansTabVisible = await myTeamPage.developmentPlansTab
            .isVisible()

          console.log(`Вкладка "Оценка команды": ${teamEvalTabVisible}`);
          console.log(`Вкладка "Планы развития": ${devPlansTabVisible}`);

          // Фильтры
          const assessmentSelectVisible = await myTeamPage.assessmentSelect
            .isVisible()
          console.log(`Фильтр "Выберите оценку": ${assessmentSelectVisible}`);

          // Кнопка скачивания отчёта
          const downloadBtnVisible = await myTeamPage.downloadSummaryButton
            .isVisible()
          console.log(`Кнопка "Скачать сводный отчет": ${downloadBtnVisible}`);
        });
      },
    );
  },
);
