// tests/functional/home/home-todo-pr.spec.js
import { test, expect } from "../../fixtures/auth.js";
import { HomePage } from "../../../pages/HomePage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

test.describe(
  "Главная страница - Оценка персонала",
  { tag: ["@home", "@todolist", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.HOME, "Todo List");
    });

    test(
      "C3852: Карточка оценки персонала отображается при активной оценке",
      { tag: ["@regression", "@pr"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("normal");
        const homePage = new HomePage(page, testInfo);

        await test.step("Открыть главную страницу", async () => {
          await homePage.goto();
        });

        await test.step("Проверить карточку оценки", async () => {
          await expect(homePage.prCard).toBeVisible({ timeout: 10000 });
          await homePage.assertPRCard();
        });
      },
    );

    test(
      'C3987: Кнопка "Перейти к оценке" отображается',
      { tag: ["@regression", "@pr"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("normal");
        const homePage = new HomePage(page, testInfo);

        await test.step("Открыть главную страницу", async () => {
          await homePage.goto();
        });

        await test.step("Проверить кнопку перехода к оценке", async () => {
          await expect(homePage.prCard).toBeVisible({ timeout: 10000 });
          await homePage.assertGoToReviewButton();
        });
      },
    );

    test(
      "C3853: Прогресс заполнения анкет отображается",
      { tag: ["@regression", "@pr"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("normal");
        const homePage = new HomePage(page, testInfo);

        await test.step("Открыть главную страницу", async () => {
          await homePage.goto();
        });

        await test.step("Проверить прогресс заполнения анкет", async () => {
          await expect(homePage.prCard).toBeVisible({ timeout: 10000 });
          const progress = await homePage.getPRFormsProgress();
          expect(progress.filled).toBeGreaterThanOrEqual(0);
          expect(progress.total).toBeGreaterThan(0);
          expect(progress.filled).toBeLessThanOrEqual(progress.total);
        });
      },
    );

    test(
      'C3988: Клик на "Перейти к оценке" ведёт на страницу оценки',
      { tag: ["@regression", "@pr"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("normal");
        const homePage = new HomePage(page, testInfo);

        await test.step("Открыть главную страницу", async () => {
          await homePage.goto();
        });

        await test.step('Клик на "Перейти к оценке"', async () => {
          await expect(homePage.prCard).toBeVisible({ timeout: 10000 });
          await homePage.clickGoToReview();
        });
      },
    );
  },
);
