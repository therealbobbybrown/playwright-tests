// tests/functional/feedback/feedback-validation-no-recipient.spec.js
import { expect } from "@playwright/test";
import { test } from "../../fixtures/auth.js";
import { SideMenu } from "../../../pages/SideMenu.js";
import { FeedbackAddPage } from "../../../pages/FeedbackAddPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

test.describe(
  "Фидбек — негативные сценарии: без получателя",
  { tag: ["@ui", "@negative", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.FEEDBACK);
    });

    test("C3612: Нельзя отправить фидбек без выбора получателя", async ({
      adminAuth,
      page,
    }, testInfo) => {
      setSeverity("normal");
      const sideMenu = new SideMenu(page, testInfo);
      const feedbackAddPage = new FeedbackAddPage(page, testInfo);

      const THANKS_TEXT = "Тестовое сообщение для проверки валидации";

      await test.step('Открыть страницу "Дать фидбек"', async () => {
        await sideMenu.openFeedbackAdd();
        await feedbackAddPage.assertOpened();
      });

      await test.step("Заполнить текст, но НЕ выбирать получателя", async () => {
        // Получателя НЕ выбираем
        await feedbackAddPage.fillBody(THANKS_TEXT);
      });

      await test.step("Попробовать отправить и проверить, что фидбек не отправляется", async () => {
        const submitBtn = feedbackAddPage.submitButton;
        await submitBtn.waitFor({ state: "visible", timeout: 10_000 });

        // Кнопка должна быть заблокирована без выбранного получателя
        const isDisabled = await submitBtn.isDisabled();
        if (!isDisabled) {
          await submitBtn.click();
        }

        // Должны остаться на странице добавления фидбека (ждём до 5с)
        await expect(page).toHaveURL(/\/feedbacks\/add\/?/, { timeout: 5_000 });

        // Экран "Фидбек отправлен" НЕ должен появиться
        const sentHeading = page.getByText(/Фидбек отправлен/i).first();
        await expect(
          sentHeading,
          "Фидбек не должен отправиться без получателя",
        ).not.toBeVisible({ timeout: 3_000 });
      });
    });
  },
);
