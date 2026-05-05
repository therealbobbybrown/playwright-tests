import { test, expect } from "../../../fixtures/auth.js";
import { ScoreDistributionTab } from "../../../../pages/ScoreDistributionTab.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";

test.describe(
  "Распределение оценок — доступ и навигация",
  { tag: ["@ui", "@my-team", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.MY_TEAM);
    });

    test(
      "C7154: Админ видит вкладку «Распределение оценок» в дашборде «Моя команда»",
      { tag: ["@critical"] },
      async ({ adminAuth: page }) => {
        setSeverity("critical");

        const tab = new ScoreDistributionTab(page);
        const baseUrl = process.env.BASE_URL?.replace(/\/(ru\/)?login\/?$/, '') || '';

        await test.step("Открыть дашборд «Моя команда»", async () => {
          await page.goto(`${baseUrl}/ru/dashboard/`);
          await page.waitForLoadState("domcontentloaded");
        });

        await test.step("Проверить видимость вкладки «Распределение оценок»", async () => {
          await tab.assertTabVisible();
        });
      },
    );

    test(
      "C7155: Руководитель (manager) видит вкладку «Распределение оценок»",
      { tag: ["@critical"] },
      async ({ managerAuth: page }) => {
        setSeverity("critical");

        const tab = new ScoreDistributionTab(page);
        const baseUrl = process.env.BASE_URL?.replace(/\/(ru\/)?login\/?$/, '') || '';

        await test.step("Открыть дашборд «Моя команда»", async () => {
          await page.goto(`${baseUrl}/ru/dashboard/`);
          await page.waitForLoadState("domcontentloaded");
        });

        await test.step("Проверить видимость вкладки «Распределение оценок»", async () => {
          await tab.assertTabVisible();
        });
      },
    );

    test(
      "C7156: Head (только прямые подчинённые) видит вкладку",
      { tag: ["@critical"] },
      async ({ headAuth: page }) => {
        setSeverity("critical");

        const tab = new ScoreDistributionTab(page);
        const baseUrl = process.env.BASE_URL?.replace(/\/(ru\/)?login\/?$/, '') || '';

        await test.step("Открыть дашборд «Моя команда»", async () => {
          await page.goto(`${baseUrl}/ru/dashboard/`);
          await page.waitForLoadState("domcontentloaded");
        });

        await test.step("Проверить видимость вкладки «Распределение оценок»", async () => {
          await tab.assertTabVisible();
        });
      },
    );

    test(
      "C7157: Обычный сотрудник (без подчинённых) НЕ видит вкладку",
      { tag: ["@critical"] },
      async ({ userAuth: page }) => {
        setSeverity("critical");

        const tab = new ScoreDistributionTab(page);
        const baseUrl = process.env.BASE_URL?.replace(/\/(ru\/)?login\/?$/, '') || '';

        await test.step("Открыть дашборд «Моя команда»", async () => {
          await page.goto(`${baseUrl}/ru/dashboard/`);
          await page.waitForLoadState("domcontentloaded");
        });

        await test.step("Проверить, что вкладка «Распределение оценок» НЕ видна", async () => {
          await tab.assertTabNotVisible();
        });
      },
    );

    test(
      "C7158: Переключение на вкладку загружает фильтры и таблицу (за админа)",
      { tag: ["@critical"] },
      async ({ adminAuth: page }) => {
        setSeverity("critical");

        const tab = new ScoreDistributionTab(page);
        const baseUrl = process.env.BASE_URL?.replace(/\/(ru\/)?login\/?$/, '') || '';

        await test.step("Открыть дашборд «Моя команда»", async () => {
          await page.goto(`${baseUrl}/ru/dashboard/`);
          await page.waitForLoadState("domcontentloaded");
        });

        await test.step("Переключиться на вкладку «Распределение оценок»", async () => {
          await tab.switchToTab();
        });

        await test.step("Проверить загрузку фильтров и таблицы", async () => {
          await tab.assertBaseLayout();
        });
      },
    );

    test(
      "C7159: URL содержит ?tab=performanceReviewSummary после клика на вкладку",
      { tag: ["@critical"] },
      async ({ adminAuth: page }) => {
        setSeverity("critical");

        const tab = new ScoreDistributionTab(page);
        const baseUrl = process.env.BASE_URL?.replace(/\/(ru\/)?login\/?$/, '') || '';

        await test.step("Открыть дашборд «Моя команда»", async () => {
          await page.goto(`${baseUrl}/ru/dashboard/`);
          await page.waitForLoadState("domcontentloaded");
        });

        await test.step("Переключиться на вкладку «Распределение оценок»", async () => {
          await tab.switchToTab();
        });

        await test.step("Проверить URL содержит tab=performanceReviewSummary", async () => {
          expect(page.url()).toContain("tab=performanceReviewSummary");
        });
      },
    );
  },
);
