// tests/surveys-open-templates-from-list.spec.js
import { test } from "../../../fixtures/auth.js";
import { SideMenu } from "../../../../pages/SideMenu.js";
import { SurveysListPage } from "../../../../pages/SurveysListPage.js";
import { SurveysTemplatesPage } from "../../../../pages/SurveysTemplatesPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";

test.describe(
  "Опросы — переход к шаблонам из списка",
  { tag: ["@ui", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.SURVEYS, "Creation");
    });

    test('C4019: Через кнопку "Создать опрос" открыть список шаблонов', async ({
      adminAuth,
      page,
    }, testInfo) => {
      setSeverity("normal");
      const sideMenu = new SideMenu(page, testInfo);
      const surveysListPage = new SurveysListPage(page, testInfo);
      const templatesPage = new SurveysTemplatesPage(page, testInfo);

      await test.step('Открыть страницу "Опросы" через боковое меню', async () => {
        await sideMenu.openSurveysList();
        await surveysListPage.assertOpened();
      });

      await test.step('Нажать "Создать опрос" и выбрать "Опрос из шаблона"', async () => {
        await surveysListPage.openCreateFromTemplatePopup();
      });

      await test.step("Проверить страницу списка шаблонов опросов", async () => {
        await templatesPage.assertOpened();
        await templatesPage.assertTitleIsCorrect();
        await templatesPage.assertHasTemplates();
      });
    });
  },
);
