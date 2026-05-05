// tests/feedback-history-and-statistics.spec.js
import { test } from "../../fixtures/auth.js";
import { SideMenu } from "../../../pages/SideMenu.js";
import { StatisticsPage } from "../../../pages/StatisticsPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

test.describe(
  "История и статистика — фидбек",
  { tag: ["@ui", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.FEEDBACK);
    });

    test('C4017: Раскрываем блоки; (где есть) mark==total; переходим в "Посмотреть ленту"; проверяем h1; возвращаемся назад', async ({
      adminAuth,
      page,
    }, testInfo) => {
      setSeverity("normal");
      const sideMenu = new SideMenu(page, testInfo);
      const statisticsPage = new StatisticsPage(page, testInfo);

      const feedbackTabs = [
        { title: "Полученный фидбек", h1: /Вам дали фидбек/i },
        { title: "Отправленный фидбек", h1: /Вы дали фидбек/i },
        { title: "Новый фидбек в компании", h1: /Новый фидбек в компании/i },
      ];

      const requestTabs = [
        { title: "Вы запросили фидбек", h1: /Вы запросили фидбек/i },
        { title: "У вас запросили фидбек", h1: /У вас запросили фидбек/i },
      ];

      await test.step('Открыть страницу "История и статистика"', async () => {
        await sideMenu.openFeedbackHistoryStatistics();
        await statisticsPage.assertOpened();
      });

      await test.step('Проверить наличие табов в секции "Фидбек"', async () => {
        const titles = await statisticsPage.getFeedbackTabTitles();
        const missing = feedbackTabs
          .map((t) => t.title)
          .filter((t) => !titles.includes(t));

        if (missing.length) {
          throw new Error(
            `Не нашли табы в секции "Фидбек": ${missing.join(", ")}. ` +
              `Доступные: ${titles.join(", ")}`,
          );
        }
      });

      await test.step('Проверить наличие табов в секции "Запросы на фидбек"', async () => {
        const titles = await statisticsPage.getRequestsTabTitles();
        const missing = requestTabs
          .map((t) => t.title)
          .filter((t) => !titles.includes(t));

        if (missing.length) {
          throw new Error(
            `Не нашли табы в секции "Запросы на фидбек": ${missing.join(", ")}. ` +
              `Доступные: ${titles.join(", ")}`,
          );
        }
      });

      // ---- ФИДБЕК ----
      for (const t of feedbackTabs) {
        await test.step(`Фидбек: "${t.title}" — mark == total`, async () => {
          await statisticsPage.assertFeedbackTabMarkMatchesChartTotal(t.title);
        });

        await test.step(`Фидбек: "${t.title}" — перейти в ленту и проверить h1`, async () => {
          await statisticsPage.openFeedFromFeedbackTabAndAssertHeader(
            t.title,
            t.h1,
          );
        });
      }

      // ---- ЗАПРОСЫ НА ФИДБЕК ----
      for (const t of requestTabs) {
        await test.step(`Запросы: "${t.title}" — (если есть) mark == total`, async () => {
          await statisticsPage.assertRequestsTabMarkMatchesChartTotalIfPresent(
            t.title,
          );
        });

        await test.step(`Запросы: "${t.title}" — перейти в ленту и проверить h1`, async () => {
          await statisticsPage.openFeedFromRequestsTabAndAssertHeader(
            t.title,
            t.h1,
          );
        });
      }
    });
  },
);
