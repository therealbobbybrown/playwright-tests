// tests/functional/surveys/management/survey-copy.spec.js
// Копирование опроса из списка
import { expect } from "@playwright/test";
import { test } from "../../../fixtures/auth.js";
import { SideMenu } from "../../../../pages/SideMenu.js";
import { SurveysListPage } from "../../../../pages/SurveysListPage.js";
import { SurveyConstructorPage } from "../../../../pages/SurveyConstructorPage.js";
import { SurveyAPI, getCredentials } from "../../../utils/api/index.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";

test.describe("Копирование опроса", { tag: ["@ui", "@regression"] }, () => {
  let createdSurveyId = null;
  let copyTitle = null;

  test.beforeEach(() => {
    markAsUITest(MODULES.SURVEYS);
  });

  test.afterEach(async ({ request }) => {
    // Очищаем оба опроса: оригинал и копию
    const api = new SurveyAPI(request);
    const { email, password } = getCredentials("admin");
    try {
      await api.signIn(email, password);
      if (createdSurveyId) {
        await api.stop(createdSurveyId).catch(() => {});
        await api.remove(createdSurveyId).catch(() => {});
      }
      // Копия: ищем и удаляем через API поиск не нужен — просто best-effort
    } catch {
      // best-effort cleanup
    }
    createdSurveyId = null;
    copyTitle = null;
  });

  test("C2977: Копирование опроса из списка", async ({
    adminAuth,
    page,
  }, testInfo) => {
    setSeverity("normal");
    const sideMenu = new SideMenu(page, testInfo);
    const surveysListPage = new SurveysListPage(page, testInfo);
    const constructorPage = new SurveyConstructorPage(page, testInfo);

    let originalTitle;

    await test.step("Создать черновик опроса для копирования", async () => {
      await sideMenu.openSurveysList();
      await surveysListPage.assertOpened();
      await surveysListPage.createBlankSurveyFromList();
      await constructorPage.assertOpened();
      createdSurveyId = constructorPage.getSurveyIdFromUrl();
      originalTitle = await constructorPage.changeTitleRandom(
        "Опрос для копирования",
      );
      await constructorPage.waitForAutosave();
    });

    await test.step("Вернуться к списку опросов", async () => {
      await sideMenu.openSurveysList();
      await surveysListPage.assertOpened();
    });

    await test.step('Скопировать опрос через "Создать копию"', async () => {
      copyTitle = await surveysListPage.copySurveyByTitle(originalTitle);
    });

    await test.step("Проверить, что копия появилась в списке с корректным названием", async () => {
      // copySurveyByTitle уже дождался появления карточки копии,
      // но делаем явный assert через expect для строгой проверки
      await surveysListPage.assertOpened();
      await surveysListPage._applySearchFilter(copyTitle);
      const copyCard = surveysListPage._surveyCardByTitle(copyTitle);
      await expect(copyCard).toBeVisible();
      // Название копии должно начинаться с "Копия"
      expect(copyTitle).toMatch(/^Копия /);
      // Название копии должно содержать оригинальный заголовок
      expect(copyTitle).toContain(originalTitle);
    });
  });
});
