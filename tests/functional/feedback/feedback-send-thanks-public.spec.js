// tests/feedback-send-thanks-public.spec.js
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
  "Фидбек — публичная благодарность с баллами и гифкой",
  { tag: ["@ui", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.FEEDBACK);
    });

    test("C3606: Админ отправляет публичную благодарность и её видят все сотрудники", async ({
      adminAuth,
      page,
    }, testInfo) => {
      setSeverity("normal");
      const sideMenu = new SideMenu(page, testInfo);
      const feedbackAddPage = new FeedbackAddPage(page, testInfo);
      const feedbackViewPage = new FeedbackViewPage(page, testInfo);

      const THANKS_TEXT =
        "Спасибо за помощь в запуске автотестов по модулю фидбека (публично).";

      // 1. Открыть страницу "Дать фидбек"
      await test.step('Открыть страницу "Дать фидбек"', async () => {
        await sideMenu.openFeedbackAdd();
        await feedbackAddPage.assertOpened();
      });

      // 2. Заполнить благодарность: получатель + текст
      await test.step("Заполнить благодарность", async () => {
        await feedbackAddPage.fillThanks({ body: THANKS_TEXT });
      });

      // 3. Подарить 1 балл и проверить текст списания
      await test.step("Подарить баллы", async () => {
        await feedbackAddPage.setKarmaPoints(1);
        await feedbackAddPage.assertKarmaDebitInfo(1);
      });

      // 4. Добавить гифку
      await test.step("Добавить гифку", async () => {
        await feedbackAddPage.pickAnyGif();
        await feedbackAddPage.assertGifPreviewVisible();
      });

      // 5. Сделать фидбек публичным и убедиться, что блок "Другие люди" скрыт
      await test.step("Сделать фидбек публичным", async () => {
        await feedbackAddPage.setPublicVisibility();
        await feedbackAddPage.assertAdditionalRecipientsSectionHidden();
      });

      // 6. Отправить фидбек
      await test.step("Отправить фидбек", async () => {
        await feedbackAddPage.submit();
      });

      // 7. Проверить экран "Фидбек отправлен"
      await test.step('Проверить экран "Фидбек отправлен"', async () => {
        await feedbackAddPage.assertFeedbackSent();
      });

      // 8. Перейти к карточке фидбека
      await test.step("Перейти к карточке фидбека", async () => {
        await feedbackAddPage.openLastFeedback();
        await feedbackViewPage.assertOpened();
      });

      // 9. Проверить текст фидбека
      await test.step("Проверить текст фидбека", async () => {
        await feedbackViewPage.assertBodyContains(THANKS_TEXT);
      });

      // 10. Проверить, что фидбек публичный (вкладка "Участники" -> "Все сотрудники компании")
      await test.step("Проверить, что фидбек видят все сотрудники", async () => {
        await feedbackViewPage.openParticipantsTab();
        await feedbackViewPage.assertAllCompanyMemberVisible();
      });
    });
  },
);
