import { test, expect } from "../../../fixtures/auth.js";
import { MyTeamPage } from "../../../../pages/MyTeamPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";

test.describe(
  "Review Admin — Прямые ссылки на скрытые вкладки",
  { tag: ["@ui", "@my-team", "@regression", "@review-admin"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.MY_TEAM, "Review Admin Direct Links");
    });

    test(
      "C8062: Прямой переход на ?tab=developmentPlans не показывает скрытую вкладку",
      { tag: ["@smoke", "@critical"] },
      async ({ reviewAdminAuth: page }) => {
        setSeverity("critical");
        const myTeam = new MyTeamPage(page);

        await test.step(
          'Перейти напрямую на вкладку «Планы развития» через URL',
          async () => {
            const origin = new URL(page.url()).origin;
            await page.goto(
              `${origin}/ru/dashboard/?tab=developmentPlans`,
            );
            await page.waitForLoadState("domcontentloaded");
          },
        );

        await test.step('Вкладка «Планы развития» НЕ видна', async () => {
          await myTeam.assertDevelopmentPlansTabHidden();
        });

        await test.step(
          'Видны только разрешённые вкладки: «Оценка команды» и «Распределение оценок»',
          async () => {
            await myTeam.assertOnlyAllowedTabs([
              "Оценка команды",
              "Распределение оценок",
            ]);
          },
        );
      },
    );
  },
);
