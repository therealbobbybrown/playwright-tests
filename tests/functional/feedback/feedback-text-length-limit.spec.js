// tests/functional/feedback/feedback-text-length-limit.spec.js
import { expect } from "@playwright/test";
import { test } from "../../fixtures/auth.js";
import { SideMenu } from "../../../pages/SideMenu.js";
import { FeedbackAddPage } from "../../../pages/FeedbackAddPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { TIMEOUTS } from "../../utils/constants.js";

test.describe(
  "Фидбек — негативные сценарии: лимит текста",
  { tag: ["@ui", "@negative", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.FEEDBACK);
    });

    test("C3610: Нельзя отправить фидбек с текстом больше лимита символов", async ({
      adminAuth,
      page,
    }, testInfo) => {
      setSeverity("normal");
      const sideMenu = new SideMenu(page, testInfo);
      const feedbackAddPage = new FeedbackAddPage(page, testInfo);

      await test.step('Открыть страницу "Дать фидбек"', async () => {
        await sideMenu.openFeedbackAdd();
        await feedbackAddPage.assertOpened();
      });

      await test.step("Выбрать получателя", async () => {
        await feedbackAddPage.selectAnyRecipient();
      });

      await test.step("Ввести очень длинный текст и попробовать отправить", async () => {
        const textarea = feedbackAddPage.bodyTextarea;
        await textarea.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

        // Генерируем текст длиной больше maxlength (10001 символов)
        const veryLongText = "А".repeat(10001);

        // Пробуем ввести через JavaScript чтобы обойти maxlength
        await textarea.evaluate((el, text) => {
          el.value = text;
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        }, veryLongText);

        // Получаем реальное значение в поле
        const actualValue = await textarea.inputValue();
        const actualLength = actualValue.length;

        console.log(`Попытка ввести: 10001 символов`);
        console.log(`Реально введено: ${actualLength} символов`);

        if (actualLength <= 10000) {
          // Текст обрезан до maxlength — валидация на уровне HTML работает
          expect(actualLength).toBeLessThanOrEqual(10000);
        } else {
          // Текст введён через evaluate (обход maxlength) — проверяем серверную валидацию
          await feedbackAddPage.submitButton.click();

          // Должны остаться на странице добавления (ждём до 5с)
          await expect(page).toHaveURL(/\/feedbacks\/add\/?/, { timeout: 5_000 });

          // Экран "Фидбек отправлен" НЕ должен появиться
          const successScreen = page.getByText(/фидбек отправлен/i).first();
          await expect(
            successScreen,
            "Фидбек не должен отправиться с текстом больше лимита",
          ).not.toBeVisible({ timeout: 3_000 });
        }
      });
    });
  },
);
