import { test } from "../../fixtures/auth.js";
import { SideMenu } from "../../../pages/SideMenu.js";
import { FeedbackOfEmployeesPage } from "../../../pages/FeedbackOfEmployeesPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

test.describe(
  "Фидбек — фидбек на моих сотрудников",
  { tag: ["@ui", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.FEEDBACK);
    });

    test(
      "C3603: Открытие страницы и базовые элементы без привязки к данным",
      { tag: ["@smoke", "@critical"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("critical");
        const sideMenu = new SideMenu(page, testInfo);
        const feed = new FeedbackOfEmployeesPage(page, testInfo);

        await test.step('Перейти в "Фидбек на моих сотрудников" через боковое меню', async () => {
          await sideMenu.openFeedbackOfEmployees(); // <-- ВАЖНО: не openFeedbackReview
          await feed.assertOpened();
        });

        await test.step("Проверить базовые элементы страницы (без данных)", async () => {
          await feed.assertBaseElementsWithoutData();
        });
      },
    );
  },
);
