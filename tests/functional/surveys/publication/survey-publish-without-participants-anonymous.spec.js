// tests/functional/surveys/publication/survey-publish-without-participants-anonymous.spec.js
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

    test('C4020: Анонимный опрос без участников показывает ошибку "Нужно минимум 3 сотрудника"', async ({
      adminAuth,
      page,
    }, testInfo) => {
      setSeverity("normal");
      const sideMenu = new SideMenu(page, testInfo);
      const surveysListPage = new SurveysListPage(page, testInfo);
      const constructorPage = new SurveyConstructorPage(page, testInfo);

      await test.step("Создать опрос и перейти к публикации", async () => {
        await sideMenu.openSurveysList();
        await surveysListPage.assertOpened();
        await surveysListPage.createBlankSurveyFromList();
        await constructorPage.assertOpened();
        createdSurveyId = constructorPage.getSurveyIdFromUrl();
        await constructorPage.changeTitleRandom(
          "Анонимный опрос без участников",
        );
        await constructorPage.goToPublicationSettings();
      });

      await test.step("Включить анонимность опроса", async () => {
        const anonymousToggleText = page
          .getByText("Сделать опрос анонимным")
          .first();
        await anonymousToggleText.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });

        const toggleContainer = anonymousToggleText
          .locator(
            'xpath=ancestor::*[.//input[@type="checkbox"] or .//*[@role="switch"]][1]',
          )
          .first();
        const checkbox = toggleContainer
          .locator('input[type="checkbox"]')
          .first();

        const isChecked = await checkbox.isChecked().catch(() => false);
        if (!isChecked) {
          await anonymousToggleText.click();
          await page
            .waitForLoadState("networkidle", { timeout: 3_000 })
            .catch(() => {});
        }
      });

      await test.step('Удалить чип "Все сотрудники" на странице', async () => {
        const chip = page
          .locator('[class*="Tag_tag"]')
          .filter({ hasText: /Все сотрудники/i })
          .first();

        await chip.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

        const deleteIcon = chip.locator('[class*="Tag_deleteIcon"]').first();
        await deleteIcon.click({ force: true });

        await chip.waitFor({ state: "hidden", timeout: TIMEOUTS.SHORT });
      });

      await test.step("Проверить валидацию: ошибка минимума участников", async () => {
        // После удаления чипа React обновляет state с задержкой —
        // ждём появления ошибки или блокировки кнопки с таймаутом
        const errorMessage = page
          .getByText(/нужно минимум 3 сотрудника/i)
          .first();

        // Ждём появления ошибки (приложение показывает её после удаления всех участников)
        await expect(errorMessage).toBeVisible({ timeout: TIMEOUTS.MEDIUM });

        // Дополнительно проверяем, что кнопка публикации заблокирована
        const publishButton = page
          .getByRole("button", { name: /опубликовать опрос/i })
          .first();
        await expect(publishButton).toBeDisabled({ timeout: TIMEOUTS.SHORT });
      });
    });
  },
);
