// tests/surveys-create-from-template.spec.js
import { expect } from "@playwright/test";
import { test } from "../../../fixtures/auth.js";
import { SideMenu } from "../../../../pages/SideMenu.js";
import { SurveysTemplatesPage } from "../../../../pages/SurveysTemplatesPage.js";
import { SurveyTemplatePage } from "../../../../pages/SurveyTemplatePage.js";
import { SurveyConstructorPage } from "../../../../pages/SurveyConstructorPage.js";
import { SurveysListPage } from "../../../../pages/SurveysListPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";

test.describe(
  "Опросы — создание по шаблону",
  { tag: ["@ui", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.SURVEYS, "Creation");
    });

    test(
      "C2973: Создание опроса по случайному шаблону, автосохранение и проверка через список",
      { tag: ["@smoke", "@critical"] },
      async ({ adminAuth, page }, testInfo) => {
        setSeverity("critical");
        const sideMenu = new SideMenu(page, testInfo);
        const templatesPage = new SurveysTemplatesPage(page, testInfo);
        const templatePage = new SurveyTemplatePage(page, testInfo);
        const constructorPage = new SurveyConstructorPage(page, testInfo);
        const surveysListPage = new SurveysListPage(page, testInfo);

        await test.step('Открыть "Создать опрос" через боковое меню', async () => {
          await sideMenu.openSurveysCreate();
          await templatesPage.assertOpened();
          await templatesPage.assertTitleIsCorrect();
        });

        await test.step("Выбрать случайный шаблон и перейти в конструктор", async () => {
          await templatesPage.openRandomTemplate();
          await templatePage.assertOpened();
          await templatePage.clickUseTemplate();
          await constructorPage.assertOpened();
        });

        const initialPagesCount =
          await test.step("Запомнить количество страниц", async () =>
            constructorPage.getPagesCount());

        const newTitle =
          await test.step("Изменить заголовок и дождаться автосохранения", async () => {
            const t = await constructorPage.changeTitleToTemplateRandom();
            await constructorPage.waitForAutosave();
            return t;
          });

        await test.step("Проверить заголовок в конструкторе", async () => {
          const titleOnPage = await constructorPage.getTitleText();
          expect(titleOnPage).toContain(newTitle);
        });

        await test.step("Открыть список опросов", async () => {
          await sideMenu.openSurveysList();
          await surveysListPage.assertOpened();
        });

        await test.step("Открыть созданный опрос и сверить данные", async () => {
          await surveysListPage.openSurveyByTitle(newTitle);

          await constructorPage.assertOpened();

          const reopenedTitle = await constructorPage.getTitleText();
          const reopenedPagesCount = await constructorPage.getPagesCount();

          expect(reopenedTitle).toContain(newTitle);
          expect(reopenedPagesCount).toBe(initialPagesCount);
        });
      },
    );
  },
);
