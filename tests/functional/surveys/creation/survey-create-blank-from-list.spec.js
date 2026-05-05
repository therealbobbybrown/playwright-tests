// tests/surveys-create-blank-from-list.spec.js
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
import { SurveyAPI, getCredentials } from "../../../utils/api/index.js";

test.describe(
  "Опросы — создание пустого опроса",
  { tag: ["@surveys", "@creation", "@regression"] },
  () => {
    let createdSurveyId = null;

    test.beforeEach(() => {
      markAsUITest(MODULES.SURVEYS, "Creation");
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

    test(
      "C2972: Админ может создать пустой опрос из списка, дождаться автосохранения и открыть его повторно",
      { tag: ["@critical", "@ui"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("critical");
        const sideMenu = new SideMenu(page, testInfo);
        const surveysListPage = new SurveysListPage(page, testInfo);
        const constructorPage = new SurveyConstructorPage(page, testInfo);

        await test.step('Открыть страницу "Опросы" через боковое меню', async () => {
          await sideMenu.openSurveysList();
          await surveysListPage.assertOpened();
        });

        await test.step("Создать новый пустой опрос (не из шаблона)", async () => {
          await surveysListPage.createBlankSurveyFromList();
          await constructorPage.assertOpened();
          createdSurveyId = constructorPage.getSurveyIdFromUrl();
        });

        const initialPagesCount =
          await test.step("Запомнить количество страниц", async () => {
            return constructorPage.getPagesCount();
          });

        const newTitle =
          await test.step("Изменить заголовок и дождаться автосохранения", async () => {
            const t = await constructorPage.changeTitleToRandom("Пустой опрос");
            await constructorPage.waitForAutosave();
            return t;
          });

        await test.step("Проверить заголовок в конструкторе", async () => {
          const titleOnPage = await constructorPage.getTitleText();
          expect(titleOnPage).toContain(newTitle);
        });

        await test.step("Вернуться в список опросов", async () => {
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
