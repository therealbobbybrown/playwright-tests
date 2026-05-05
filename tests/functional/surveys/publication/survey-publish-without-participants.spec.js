// tests/functional/surveys/publication/survey-publish-without-participants.spec.js
import { expect } from "@playwright/test";
import { test } from "../../../fixtures/auth.js";
import { SideMenu } from "../../../../pages/SideMenu.js";
import { SurveysListPage } from "../../../../pages/SurveysListPage.js";
import { SurveyConstructorPage } from "../../../../pages/SurveyConstructorPage.js";
import { SurveyPublicationSettingsPage } from "../../../../pages/SurveyPublicationSettingsPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";
import { TIMEOUTS } from "../../../utils/constants.js";
import { SurveyAPI, getCredentials } from "../../../utils/api/index.js";

test.describe(
  "Опросы — валидация публикации",
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

    test('C4021: Неанонимный опрос без участников показывает ошибку "Выберите получателей"', async ({
      adminAuth,
      page,
    }, testInfo) => {
      setSeverity("normal");
      const sideMenu = new SideMenu(page, testInfo);
      const surveysListPage = new SurveysListPage(page, testInfo);
      const constructorPage = new SurveyConstructorPage(page, testInfo);
      const publicationSettingsPage = new SurveyPublicationSettingsPage(
        page,
        testInfo,
      );

      await test.step("Создать опрос и перейти к публикации", async () => {
        await sideMenu.openSurveysList();
        await surveysListPage.assertOpened();
        await surveysListPage.createBlankSurveyFromList();
        await constructorPage.assertOpened();
        createdSurveyId = constructorPage.getSurveyIdFromUrl();
        await constructorPage.changeTitleRandom(
          "Неанонимный опрос без участников",
        );
        await constructorPage.goToPublicationSettings();
      });

      await test.step("Выключить анонимность опроса", async () => {
        await publicationSettingsPage.ensureAnonymousOff();
      });

      await test.step('Удалить чип "Все сотрудники" на странице', async () => {
        await publicationSettingsPage.removeAllEmployeesChipFromPage();
      });

      await test.step('Нажать "Опубликовать опрос"', async () => {
        const publishButton = page
          .getByRole("button", { name: /опубликовать опрос/i })
          .first();
        await publishButton.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        await publishButton.click();

        await page
          .waitForLoadState("networkidle", { timeout: 3_000 })
          .catch(() => {});
      });

      await test.step('Проверить сообщение об ошибке "Выберите получателей"', async () => {
        const errorMessage = page.getByText(/выберите получателей/i).first();
        await expect(errorMessage).toBeVisible({ timeout: TIMEOUTS.MEDIUM });
      });
    });
  },
);
