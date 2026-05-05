// tests/feedback-send-thanks.spec.js
import { test } from "../../fixtures/auth.js";
import { SideMenu } from "../../../pages/SideMenu.js";
import { FeedbackAddPage } from "../../../pages/FeedbackAddPage.js";
import { FeedbackViewPage } from "../../../pages/FeedbackViewPage.js";
import { FeedbackSentPage } from "../../../pages/FeedbackSentPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

test.describe(
  "Фидбек — благодарность коллеге",
  { tag: ["@ui", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.FEEDBACK);
    });

    test(
      "C3608: Админ отправляет благодарность коллеге и видит её в карточке фидбека",
      { tag: ["@smoke", "@critical"] },
      async ({ adminAuth, page }, testInfo) => {
        setSeverity("critical");
        const sideMenu = new SideMenu(page, testInfo);
        const feedbackAddPage = new FeedbackAddPage(page, testInfo);
        const feedbackSentPage = new FeedbackSentPage(page, testInfo);
        const feedbackViewPage = new FeedbackViewPage(page, testInfo);

        const THANKS_TEXT =
          "Спасибо за помощь в запуске автотестов по модулю фидбека.";

        // 1. Открыть страницу "Дать фидбек" через боковое меню
        await test.step('Открыть страницу "Дать фидбек"', async () => {
          await sideMenu.openFeedbackAdd();
          await feedbackAddPage.assertOpened();
        });

        // 2. Заполнить благодарность: выбрать получателя и текст
        await test.step("Заполнить благодарность", async () => {
          await feedbackAddPage.fillThanks({
            body: THANKS_TEXT,
          });
        });

        // 3. Отправить фидбек
        await test.step("Отправить фидбек", async () => {
          await feedbackAddPage.submit();
        });

        // 4. Проверить экран "Фидбек отправлен"
        await test.step("Проверить, что фидбек отправлен", async () => {
          await feedbackSentPage.assertOpened();
        });

        // 5. Нажать "Перейти к фидбеку"
        await test.step("Перейти к карточке отправленного фидбека", async () => {
          await feedbackSentPage.goToFeedback();
          await feedbackViewPage.assertOpened();
        });

        // 6. Убедиться, что в теле фидбека наш текст
        await test.step("Проверить текст фидбека", async () => {
          // метод может быть assertBodyContains или аналогичный —
          // оставляем как в текущем PageObject
          await feedbackViewPage.assertBodyContains(THANKS_TEXT);
        });
      },
    );
  },
);
