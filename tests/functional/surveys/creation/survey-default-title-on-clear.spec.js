// tests/functional/surveys/creation/survey-default-title-on-clear.spec.js
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
  "Опросы — дефолтные значения",
  { tag: ["@ui", "@regression"] },
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

    test('C4018: При очистке заголовка вопроса система восстанавливает дефолтное значение "Вопрос"', async ({
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

      await test.step("Открыть первый вопрос и очистить заголовок", async () => {
        const firstCard = constructorPage.questionCards.first();
        await firstCard.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
        await firstCard.click();

        const titleField = firstCard
          .getByPlaceholder("Вопрос")
          .first()
          .or(
            firstCard
              .locator('textarea[id^="question-edit-"][id$="__title"]')
              .first(),
          );

        await titleField.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        await titleField.fill("");

        // Кликаем вне карточки чтобы сохранить
        await page.mouse.click(10, 10);
        await page
          .waitForLoadState("networkidle", { timeout: 3_000 })
          .catch(() => {});
      });

      await test.step("Проверить, что заголовок восстановлен на дефолтное значение", async () => {
        const firstCard = constructorPage.questionCards.first();
        await firstCard.click();

        const titleField = firstCard
          .getByPlaceholder("Вопрос")
          .first()
          .or(
            firstCard
              .locator('textarea[id^="question-edit-"][id$="__title"]')
              .first(),
          );

        await titleField.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });

        const currentValue = await titleField.inputValue();
        expect(currentValue).toBe("Вопрос");
      });
    });
  },
);
