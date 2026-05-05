// tests/functional/feedback/feedback-invalid-karma-points.spec.js
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
  "Фидбек — негативные сценарии: невалидные баллы",
  { tag: ["@ui", "@negative", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.FEEDBACK);
    });

    test("C3601: Нельзя подарить отрицательное количество баллов", async ({
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

      await test.step("Выбрать получателя и заполнить текст", async () => {
        await feedbackAddPage.selectAnyRecipient();
        await feedbackAddPage.fillBody("Тестовый фидбек для проверки баллов");
      });

      await test.step("Попробовать ввести отрицательное количество баллов", async () => {
        // Включаем "Подарить баллы"
        const karmaToggle = feedbackAddPage.karmaToggleButton;
        await karmaToggle.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        await karmaToggle.click();

        // Находим поле ввода баллов
        const karmaInput = page
          .locator('input#addFeedback__giftBonusAmount, input[type="number"]')
          .first();
        await karmaInput.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });

        // Пробуем ввести отрицательное число
        await karmaInput.fill("-100");

        // Получаем реальное значение
        const actualValue = await karmaInput.inputValue();
        console.log(`Попытка ввести: -100, реальное значение: "${actualValue}"`);

        // Поле type=number не должно принимать минус — проверяем конкретно
        expect(
          actualValue.includes("-"),
          `Поле баллов не должно принимать отрицательное значение, но содержит: "${actualValue}"`,
        ).toBe(false);
      });
    });

    test("C3602: Нельзя подарить баллов больше чем есть на балансе", async ({
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

      await test.step("Выбрать получателя и заполнить текст", async () => {
        await feedbackAddPage.selectAnyRecipient();
        await feedbackAddPage.fillBody("Тестовый фидбек для проверки баллов");
      });

      await test.step("Попробовать ввести очень большое количество баллов", async () => {
        const karmaToggle = feedbackAddPage.karmaToggleButton;
        await karmaToggle.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        await karmaToggle.click();

        const karmaInput = page
          .locator('input#addFeedback__giftBonusAmount, input[type="number"]')
          .first();
        await karmaInput.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });

        // Вводим очень большое число (99999999)
        await karmaInput.fill("99999999");

        // Пробуем отправить
        await feedbackAddPage.submitButton.click();

        // Должны остаться на странице добавления (ждём до 5с)
        await expect(page).toHaveURL(/\/feedbacks\/add\/?/, { timeout: 5_000 });

        // Экран "Фидбек отправлен" НЕ должен появиться
        const successScreen = page.getByText(/фидбек отправлен/i).first();
        await expect(
          successScreen,
          "Фидбек не должен отправиться с баллами больше баланса",
        ).not.toBeVisible({ timeout: 3_000 });
      });
    });
  },
);
