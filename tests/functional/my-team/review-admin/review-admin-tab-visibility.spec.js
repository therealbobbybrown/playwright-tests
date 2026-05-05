import { test, expect } from "../../../fixtures/auth.js";
import { MyTeamPage } from "../../../../pages/MyTeamPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";

test.describe(
  "Review Admin — Видимость вкладок на дашборде",
  { tag: ["@ui", "@my-team", "@regression", "@review-admin"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.MY_TEAM, "Review Admin Tab Visibility");
    });

    test(
      "C8072: Review admin видит только разрешённые вкладки",
      { tag: ["@smoke", "@critical"] },
      async ({ reviewAdminAuth: page }) => {
        setSeverity("critical");
        const myTeam = new MyTeamPage(page);
        await test.step('Открыть дашборд «Моя команда»', async () => {
          const origin = new URL(page.url()).origin;
          await page.goto(`${origin}/ru/dashboard/`);
          await page.waitForLoadState("domcontentloaded");
        });

        await test.step(
          'Проверить видимые вкладки: «Оценка команды» и «Распределение оценок»',
          async () => {
            await myTeam.assertOnlyAllowedTabs([
              "Оценка команды",
              "Распределение оценок",
            ]);
          },
        );

        await test.step('Вкладка «Планы развития» НЕ видна', async () => {
          await myTeam.assertDevelopmentPlansTabHidden();
        });
      },
    );
  },
);
