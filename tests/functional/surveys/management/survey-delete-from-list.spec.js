// tests/surveys-delete-from-list.spec.js
import { test } from "../../../fixtures/auth.js";
import { SideMenu } from "../../../../pages/SideMenu.js";
import { SurveysListPage } from "../../../../pages/SurveysListPage.js";
import { SurveyConstructorPage } from "../../../../pages/SurveyConstructorPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";

test.describe(
  "Опросы - удаление черновика из списка",
  { tag: ["@ui", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.SURVEYS, "Management");
    });

    test("C2978: Админ может создать и удалить черновик опроса из списка", async ({
      adminAuth: page,
    }, testInfo) => {
      setSeverity("normal");
      const sideMenu = new SideMenu(page, testInfo);
      const surveysListPage = new SurveysListPage(page, testInfo);
      const constructorPage = new SurveyConstructorPage(page, testInfo);

      await test.step('Открыть страницу "Опросы"', async () => {
        await sideMenu.openSurveysList();
        await surveysListPage.assertOpened();
      });

      const surveyTitle =
        await test.step("Создать пустой черновик и задать заголовок", async () => {
          await surveysListPage.createBlankSurveyFromList();
          await constructorPage.assertOpened();
          return constructorPage.changeTitleToRandom("Опрос на удаление");
        });

      await test.step("Вернуться в список опросов", async () => {
        await sideMenu.openSurveysList();
        await surveysListPage.assertOpened();
      });

      await test.step("Удалить созданный опрос", async () => {
        await surveysListPage.deleteSurveyByTitle(surveyTitle);
        await surveysListPage.assertSurveyAbsent(surveyTitle);
      });
    });
  },
);
