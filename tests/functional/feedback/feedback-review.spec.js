// tests/feedback-review.spec.js
import { test } from "../../fixtures/auth.js";
import { SideMenu } from "../../../pages/SideMenu.js";
import { FeedbackReviewPage } from "../../../pages/FeedbackReviewPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

test.describe("Фидбек — просмотр", { tag: ["@ui", "@regression"] }, () => {
  test.beforeEach(() => {
    markAsUITest(MODULES.FEEDBACK);
  });

  test("C3605: Страница: элементы (без привязки к данным)", async ({
    adminAuth: page,
  }, testInfo) => {
    setSeverity("normal");
    const sideMenu = new SideMenu(page, testInfo);
    const review = new FeedbackReviewPage(page, testInfo);

    await test.step('Открыть "Просмотр фидбека" через боковое меню', async () => {
      await sideMenu.openFeedbackView(); // или openFeedbackReview() — алиас оставил
      await review.assertOpened();
    });

    await test.step("Проверить элементы страницы", async () => {
      await review.assertUi();
    });
  });
});
