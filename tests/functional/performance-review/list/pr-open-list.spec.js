// tests/functional/performance-review/list/open-list.spec.js
import { expect } from "@playwright/test";
import { test } from "../../../fixtures/auth.js";
import { SideMenu } from "../../../../pages/SideMenu.js";
import { PerformanceReviewsListPage } from "../../../../pages/PerformanceReviewsListPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";

test.describe(
  "Оценка сотрудников - список",
  { tag: ["@performance-review", "@list", "@regression", "@ui"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.PERFORMANCE_REVIEW, "List");
    });

    test(
      "C3041: Админ может открыть список оценок",
      { tag: ["@smoke", "@critical", "@ui"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("critical");
        const sideMenu = new SideMenu(page, testInfo);
        const listPage = new PerformanceReviewsListPage(page, testInfo);

        await test.step("Открыть список оценок через боковое меню", async () => {
          // TODO: Нужно добавить метод в SideMenu для открытия Performance Reviews
          // Пока открываем напрямую
          const baseUrl = new URL(process.env.BASE_URL).origin;
          await page.goto(
            new URL("/ru/manager/performance-reviews/", baseUrl).toString(),
          );
        });

        await test.step("Страница списка оценок открыта", async () => {
          await listPage.assertOpened();
        });

        await test.step('Кнопка "Запустить оценку" видна', async () => {
          await listPage.launchButton.waitFor({
            state: "visible",
            timeout: 10_000,
          });
        });
      },
    );

    test(
      "C3042: Админ может открыть модальное окно создания оценки",
      { tag: ["@high", "@ui"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("normal");
        const listPage = new PerformanceReviewsListPage(page, testInfo);

        await test.step("Открыть список оценок", async () => {
          const baseUrl = new URL(process.env.BASE_URL).origin;
          await page.goto(
            new URL("/ru/manager/performance-reviews/", baseUrl).toString(),
          );
          await listPage.assertOpened();
        });

        await test.step("Открыть модальное окно создания", async () => {
          await listPage.openCreateModal();
        });

        await test.step("Все типы оценок доступны для выбора", async () => {
          await expect(listPage.performanceReviewType).toBeVisible();
          await expect(listPage.survey360Type).toBeVisible();
          await expect(listPage.onboardingType).toBeVisible();
        });
      },
    );
  },
);
