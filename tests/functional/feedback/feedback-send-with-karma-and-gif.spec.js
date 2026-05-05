// tests/feedback-send-feedback-with-karma-and-gif.spec.js
import { test } from "../../fixtures/auth.js";
import { SideMenu } from "../../../pages/SideMenu.js";
import { FeedbackAddPage } from "../../../pages/FeedbackAddPage.js";
import { FeedbackViewPage } from "../../../pages/FeedbackViewPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

test.describe(
  "Фидбек — фидбек с баллами, гифкой и доп. участниками",
  { tag: ["@ui", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.FEEDBACK);
    });

    test("C3609: Админ отправляет фидбек с баллами, гифкой и дополнительными получателями", async ({
      adminAuth,
      page,
    }, testInfo) => {
      setSeverity("normal");
      const sideMenu = new SideMenu(page, testInfo);
      const feedbackAddPage = new FeedbackAddPage(page, testInfo);
      const feedbackViewPage = new FeedbackViewPage(page, testInfo);

      const FEEDBACK_TEXT =
        "Спасибо за помощь в запуске автотестов по модулю фидбека (фидбек).";

      // 1. Открыть страницу "Дать фидбек"
      await test.step('Открыть страницу "Дать фидбек"', async () => {
        await sideMenu.openFeedbackAdd();
        await feedbackAddPage.assertOpened();
      });

      // 2. Переключиться на тип "Фидбек" и проверить заголовок "Ваш фидбек"
      await test.step('Переключиться на тип "Фидбек"', async () => {
        await feedbackAddPage.switchToFeedback();
      });

      // 3. Заполнить фидбек: выбрать получателя и текст
      await test.step("Заполнить фидбек", async () => {
        await feedbackAddPage.fillThanks({
          body: FEEDBACK_TEXT,
        });
      });

      // 4. Подарить 1 балл и проверить текст списания
      await test.step("Указать количество баллов", async () => {
        await feedbackAddPage.setKarmaPoints(1);
        await feedbackAddPage.assertKarmaDebitInfo(1);
      });

      // 5. Выбрать гифку и проверить, что превью появилось
      await test.step("Выбрать гифку", async () => {
        await feedbackAddPage.pickAnyGif();
        await feedbackAddPage.assertGifPreviewVisible();
      });

      // 6. Добавить дополнительных получателей (как во втором тесте)
      await test.step("Добавить дополнительных получателей", async () => {
        await feedbackAddPage.addAdditionalRecipients(2);
      });

      // 7. Отправить фидбек
      await test.step("Отправить фидбек", async () => {
        await feedbackAddPage.submit();
      });

      // 8. Проверить экран "Фидбек отправлен"
      await test.step("Проверить, что фидбек отправлен", async () => {
        await feedbackAddPage.assertFeedbackSent();
      });

      // 9. Перейти к карточке отправленного фидбека
      await test.step("Перейти к карточке фидбека", async () => {
        await feedbackAddPage.openLastFeedback();
        await feedbackViewPage.assertOpened();
      });

      // 10. Проверить текст фидбека
      await test.step("Проверить текст фидбека", async () => {
        await feedbackViewPage.assertBodyContains(FEEDBACK_TEXT);
      });
    });
  },
);
