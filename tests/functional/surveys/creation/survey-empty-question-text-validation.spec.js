// tests/functional/surveys/creation/survey-empty-question-text-validation.spec.js
import { expect } from "@playwright/test";
import { test } from "../../../fixtures/auth.js";
import { SideMenu } from "../../../../pages/SideMenu.js";
import { SurveysListPage } from "../../../../pages/SurveysListPage.js";
import { SurveyConstructorPage } from "../../../../pages/SurveyConstructorPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";
import { TIMEOUTS } from "../../../utils/constants.js";
import { SurveyAPI, getCredentials } from "../../../utils/api/index.js";

test.describe(
  "Опросы — негативные сценарии: валидация текста вопроса",
  { tag: ["@ui", "@negative", "@regression"] },
  () => {
    let createdSurveyId = null;

    test.beforeEach(() => {
      markAsUITest(MODULES.SURVEYS);
    });

    test.afterEach(async ({ request }) => {
      if (!createdSurveyId) return;
      try {
        const api = new SurveyAPI(request);
        const { email, password } = getCredentials("admin");
        await api.signIn(email, password);
        await api.stop(createdSurveyId).catch(() => {});
        await api.remove(createdSurveyId);
      } catch {
        // best-effort cleanup
      }
      createdSurveyId = null;
    });

    test("C2976: Нельзя сохранить вопрос с пустым текстом", async ({
      adminAuth,
      page,
    }, testInfo) => {
      setSeverity("normal");
      const sideMenu = new SideMenu(page, testInfo);
      const surveysListPage = new SurveysListPage(page, testInfo);
      const constructorPage = new SurveyConstructorPage(page, testInfo);

      await test.step('Открыть список "Опросы"', async () => {
        await sideMenu.openSurveysList();
        await surveysListPage.assertOpened();
      });

      await test.step("Создать пустой опрос", async () => {
        await surveysListPage.createBlankSurveyFromList();
        await constructorPage.assertOpened();
        createdSurveyId = constructorPage.getSurveyIdFromUrl();
      });

      await test.step("Добавить вопрос с текстом", async () => {
        await constructorPage.addQuestionWithType({
          title: "Тестовый вопрос для очистки",
          typeLabel: "Один из списка",
          listOptions: ["Вариант 1", "Вариант 2"],
        });
      });

      await test.step("Очистить текст вопроса и проверить валидацию", async () => {
        // Находим карточку вопроса
        const questionCard = constructorPage.questionCards.first();
        await questionCard.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });

        // Кликаем на карточку чтобы активировать режим редактирования
        await questionCard.click();

        // Находим поле текста вопроса
        const questionTextInput = questionCard
          .locator('textarea, input[type="text"], [contenteditable="true"]')
          .first();

        await questionTextInput.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

        // Очищаем текст вопроса
        await questionTextInput.click();
        await page.keyboard.press("Control+A");
        await page.keyboard.press("Backspace");

        // Кликаем в другое место для blur и автосохранения
        await page.mouse.click(10, 10);
        await page
          .waitForLoadState("networkidle", { timeout: 3_000 })
          .catch(() => {});

        // Проверяем наличие ошибки валидации (ожидаем, что UI показывает ошибку)
        const errorIndicator = page
          .locator(
            '[class*="error"], [class*="Error"], [class*="invalid"], [class*="required"]',
          )
          .first();
        await expect(errorIndicator).toBeVisible({ timeout: TIMEOUTS.MEDIUM });

        // Проверяем что пустой текст не сохранился — система должна восстановить значение
        const currentText = await questionTextInput
          .inputValue()
          .catch(() => questionTextInput.innerText().catch(() => ""));
        expect(currentText.trim()).not.toBe("");
      });
    });
  },
);
