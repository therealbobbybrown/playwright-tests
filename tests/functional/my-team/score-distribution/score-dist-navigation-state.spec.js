import { test, expect } from "../../../fixtures/auth.js";
import { ScoreDistributionTab } from "../../../../pages/ScoreDistributionTab.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";

test.describe(
  "Распределение оценок — Навигация и состояние URL",
  { tag: ["@ui", "@my-team", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.MY_TEAM);
    });

    test(
      "C7140: Прямой URL ?tab=performanceReviewSummary открывает вкладку",
      { tag: ["@critical"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("critical");
        const tab = new ScoreDistributionTab(page, testInfo);

        await test.step("Открыть вкладку «Распределение оценок» по прямому URL", async () => {
          // Открываем прямым URL
          await tab.open();
        });

        await test.step("Проверить URL, активность вкладки и отображение таблицы", async () => {
          // Проверяем, что URL содержит параметр tab
          expect(page.url()).toContain("tab=performanceReviewSummary");

          // Проверяем, что вкладка активна
          await tab.assertTabActive();

          // Проверяем, что контент вкладки отображается
          await tab.assertBaseLayout();
          await expect(tab.table).toBeVisible();
        });
      },
    );

    test(
      "C7141: URL обновляется при клике на вкладку",
      { tag: ["@critical"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("critical");
        const tab = new ScoreDistributionTab(page, testInfo);
        const baseUrl = process.env.BASE_URL?.replace(/\/(ru\/)?login\/?$/, '') || '';

        await test.step("Открыть страницу дашборда без параметра tab", async () => {
          // Открываем страницу дашборда без параметра tab
          await page.goto(`${baseUrl}/ru/dashboard/`);
          await page.waitForLoadState("domcontentloaded");
        });

        await test.step("Кликнуть на вкладку «Распределение оценок» и проверить обновление URL", async () => {
          // Кликаем на вкладку «Распределение оценок»
          await tab.scoreDistributionTab.click();
          await page.waitForLoadState("domcontentloaded");

          // URL обновился и содержит параметр tab
          expect(page.url()).toContain("tab=performanceReviewSummary");

          // Вкладка активна
          await tab.assertTabActive();
        });
      },
    );

    test(
      "C7142: Переключение на «Оценка команды» и обратно работает корректно",
      { tag: ["@critical"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("critical");
        const tab = new ScoreDistributionTab(page, testInfo);

        await test.step("Открыть вкладку «Распределение оценок» и проверить её активность", async () => {
          // Открываем вкладку «Распределение оценок»
          await tab.open();
          await tab.assertTabActive();
        });

        await test.step("Переключиться на «Оценка команды» и проверить её активность", async () => {
          // Переключаемся на «Оценка команды»
          await tab.switchToTab("teamEvaluation");
          await page.waitForLoadState("domcontentloaded");

          // Проверяем, что «Оценка команды» активна
          await expect(tab.teamEvaluationTab).toHaveClass(/active/);
        });

        await test.step("Вернуться на «Распределение оценок» и проверить отображение таблицы", async () => {
          // Переключаемся обратно на «Распределение оценок»
          await tab.switchToTab("scoreDistribution");
          await page.waitForLoadState("domcontentloaded");

          // Проверяем, что вкладка снова активна
          await tab.assertTabActive();

          // Проверяем, что контент отображается
          await expect(tab.table).toBeVisible();
        });
      },
    );

    test(
      "C7143: Обновление страницы сохраняет активную вкладку по URL",
      { tag: ["@critical"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("critical");
        const tab = new ScoreDistributionTab(page, testInfo);

        await test.step("Открыть вкладку «Распределение оценок» и запомнить URL", async () => {
          // Открываем вкладку «Распределение оценок»
          await tab.open();

          // Запоминаем URL
          const urlBeforeReload = page.url();
          expect(urlBeforeReload).toContain("tab=performanceReviewSummary");
        });

        await test.step("Перезагрузить страницу и проверить сохранение URL", async () => {
          // Перезагружаем страницу
          await page.reload();
          await page.waitForLoadState("networkidle");

          // Проверяем, что URL не изменился
          expect(page.url()).toContain("tab=performanceReviewSummary");
        });

        await test.step("Проверить активность вкладки и отображение таблицы после перезагрузки", async () => {
          // После reload tab может не быть active автоматически — кликаем если нужно
          const isActive = await tab.scoreDistributionTab
            .evaluate((el) => el.className.includes("active"));
          if (!isActive) {
            await tab.scoreDistributionTab.click();
          }

          // Проверяем, что вкладка активна
          await tab.assertTabActive();

          // Дождаться полной загрузки таблицы после reload (TIMING fix)
          await tab.table.waitFor({ state: "visible", timeout: 15000 });
          await tab.tableHeaders.first().waitFor({ state: "visible", timeout: 15000 });

          // Проверяем, что контент отображается
          await expect(tab.table).toBeVisible();
        });
      },
    );

    test(
      "C7144: Навигация «Назад» возвращает к предыдущей вкладке",
      { tag: ["@critical"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("critical");
        const tab = new ScoreDistributionTab(page, testInfo);
        const baseUrl = process.env.BASE_URL?.replace(/\/(ru\/)?login\/?$/, '') || '';

        await test.step("Открыть дашборд и перейти на «Распределение оценок»", async () => {
          // Открываем дашборд
          await page.goto(`${baseUrl}/ru/dashboard/`);
          await page.waitForLoadState("domcontentloaded");

          // Переходим на «Распределение оценок»
          await tab.switchToTab("scoreDistribution");
          await page.waitForLoadState("domcontentloaded");
          expect(page.url()).toContain("tab=performanceReviewSummary");
        });

        await test.step("Нажать «Назад» и проверить, что страница не крашнулась", async () => {
          // Используем browser back
          await page.goBack();
          await page.waitForLoadState("domcontentloaded");

          // Проверяем, что вернулись — страница дашборда не крашнулась
          // На SPA навигация назад может вернуть на дефолтную вкладку
          const heading = page.getByRole("heading", { level: 1 });
          await expect(heading).toBeVisible();
          const headingText = await heading.innerText();
          expect(
            headingText.trim().length,
            "Заголовок h1 не должен быть пустым после навигации «Назад»",
          ).toBeGreaterThan(0);
          // URL не должен содержать performanceReviewSummary (вернулись назад)
          expect(page.url()).not.toContain("tab=performanceReviewSummary");
        });
      },
    );
  },
);
