// tests/feedback-send-thanks-with-karma-and-gif.spec.js
import { test } from "../../fixtures/auth.js";
import { SideMenu } from "../../../pages/SideMenu.js";
import { FeedbackAddPage } from "../../../pages/FeedbackAddPage.js";
import { FeedbackSentPage } from "../../../pages/FeedbackSentPage.js";
import { FeedbackViewPage } from "../../../pages/FeedbackViewPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

test.describe(
  "Фидбек — благодарность с баллами и гифкой",
  { tag: ["@ui", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.FEEDBACK);
    });

    test("C3607: Админ отправляет благодарность с баллами и гифкой нескольким коллегам", async ({
      adminAuth,
      page,
    }, testInfo) => {
      setSeverity("normal");
      const sideMenu = new SideMenu(page, testInfo);
      const feedbackAddPage = new FeedbackAddPage(page, testInfo);
      const feedbackSentPage = new FeedbackSentPage(page, testInfo);
      const feedbackViewPage = new FeedbackViewPage(page, testInfo);

      const THANKS_TEXT =
        "Спасибо за помощь в запуске автотестов по модулю фидбека.";

      // 1. Открыть страницу "Дать фидбек"
      await test.step('Открыть страницу "Дать фидбек"', async () => {
        await sideMenu.openFeedbackAdd();
        await feedbackAddPage.assertOpened();
      });

      // 2. Заполнить благодарность (поле "Кому" + текст)
      await test.step("Заполнить благодарность", async () => {
        await feedbackAddPage.fillThanks({ body: THANKS_TEXT });
      });

      // 3. Подарить 1 балл и проверить текст "Будет списано 1 💎"
      await test.step("Подарить 1 балл", async () => {
        await feedbackAddPage.setKarmaPoints(1);
        await feedbackAddPage.assertKarmaDebitInfo(1);
      });

      // 4. Выбрать гифку и проверить, что превью появилось
      await test.step("Добавить гифку", async () => {
        await feedbackAddPage.pickAnyGif();
        await feedbackAddPage.assertGifPreviewVisible();
      });

      // 5. Добавить ещё получателей через "Кому ещё отправите"
      await test.step("Добавить дополнительных получателей", async () => {
        // выберем минимум двух дополнительных, если есть
        await feedbackAddPage.addAdditionalRecipients(2);
      });

      // 6. Отправить фидбек
      await test.step("Отправить фидбек", async () => {
        await feedbackAddPage.submit();
      });

      // 7. Проверить экран "Фидбек отправлен"
      await test.step('Проверить экран "Фидбек отправлен"', async () => {
        await feedbackSentPage.assertOpened();
      });

      // 8. Перейти к карточке фидбека
      await test.step("Перейти к карточке отправленного фидбека", async () => {
        await feedbackSentPage.goToFeedback();
        await feedbackViewPage.assertOpened();
      });

      // 9. Проверить, что текст фидбека совпадает
      await test.step("Проверить текст фидбека", async () => {
        await feedbackViewPage.assertBodyContains(THANKS_TEXT);
      });
    });
  },
);
