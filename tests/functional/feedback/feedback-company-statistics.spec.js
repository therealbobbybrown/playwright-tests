import { test } from "../../fixtures/auth.js";
import { SideMenu } from "../../../pages/SideMenu.js";
import { FeedbackCompanyStatisticsPage } from "../../../pages/FeedbackCompanyStatisticsPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

test.describe(
  "Фидбек — статистика компании",
  { tag: ["@ui", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.FEEDBACK);
    });

    test("C3600: Вкладки: состав полей без привязки к данным", async ({
      adminAuth: page,
    }, testInfo) => {
      setSeverity("normal");
      const sideMenu = new SideMenu(page, testInfo);
      const stats = new FeedbackCompanyStatisticsPage(page, testInfo);

      await test.step('Открыть "Статистика компании" (фидбек) через боковое меню', async () => {
        await sideMenu.openFeedbackStatistics();
        await stats.assertOpened();
      });

      await test.step("Вкладка 1 (Фидбек): состав полей", async () => {
        await stats.assertFeedbackTabFields();
      });

      await test.step("Вкладка 2 (Запросы фидбека): состав полей", async () => {
        await stats.assertRequestsTabFields();
      });

      await test.step("Toastify: клик (если есть) и проверка, что страница жива", async () => {
        await stats.clickToastifyIfPresent();
        await stats.assertOpened();
      });
    });
  },
);
