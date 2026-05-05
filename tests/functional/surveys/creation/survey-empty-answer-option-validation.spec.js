// tests/functional/surveys/creation/survey-empty-answer-option-validation.spec.js
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
  "Опросы — негативные сценарии: пустой вариант ответа",
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

    test("C2975: Нельзя сохранить вопрос с пустым вариантом ответа", async ({
      adminAuth,
      page,
    }, testInfo) => {
      setSeverity("normal");
      const sideMenu = new SideMenu(page, testInfo);
      const surveysListPage = new SurveysListPage(page, testInfo);
      const constructorPage = new SurveyConstructorPage(page, testInfo);

      await test.step("Открыть список опросов", async () => {
        await sideMenu.openSurveysList();
        await surveysListPage.assertOpened();
      });

      await test.step("Создать новый опрос", async () => {
        await surveysListPage.createBlankSurveyFromList();
        await constructorPage.assertOpened();
        createdSurveyId = constructorPage.getSurveyIdFromUrl();
      });

      await test.step('Добавить вопрос типа "Один из списка"', async () => {
        await constructorPage.addQuestionWithType({
          title: "Тестовый вопрос",
          typeLabel: "Один из списка",
          listOptions: ["Вариант 1", "Вариант 2"],
        });
      });

      await test.step("Очистить вариант ответа и проверить валидацию", async () => {
        // Находим карточку вопроса
        const questionCard = constructorPage.questionCards.first();
        await questionCard.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });

        // Кликаем на карточку чтобы активировать режим редактирования
        await questionCard.click();

        // Находим поле варианта ответа
        const answerInput = questionCard
          .locator(
            'input[placeholder*="Вариант"], input[placeholder*="вариант"], textarea[placeholder*="Вариант"]',
          )
          .first()
          .or(
            questionCard
              .locator('[class*="Option"] input, [class*="option"] input')
              .first(),
          );

        await answerInput.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

        // Очищаем вариант ответа
        await answerInput.fill("");

        // Кликаем в другое место чтобы сработала валидация
        await page.mouse.click(10, 10);
        await page
          .waitForLoadState("networkidle", { timeout: 3_000 })
          .catch(() => {});

        // Проверяем наличие ошибки валидации (ожидаем, что UI показывает ошибку)
        const errorIndicator = page
          .locator('[class*="error"], [class*="Error"], [class*="invalid"]')
          .first();
        await expect(errorIndicator).toBeVisible({ timeout: TIMEOUTS.MEDIUM });

        // Проверяем что пустое значение не сохранилось — система должна восстановить значение
        const currentValue = await answerInput.inputValue().catch(() => "");
        expect(currentValue.trim()).not.toBe("");
      });
    });
  },
);
