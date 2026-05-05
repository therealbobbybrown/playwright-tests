// tests/functional/surveys/creation/survey-default-survey-title-on-clear.spec.js
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

    test("C2974: При очистке заголовка опроса система восстанавливает дефолтное значение", async ({
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

      await test.step("Запомнить дефолтный заголовок опроса", async () => {
        const titleText = await constructorPage.getTitleText();
        console.log(`Дефолтный заголовок опроса: "${titleText}"`);
      });

      await test.step("Очистить заголовок опроса", async () => {
        const titleEditable = constructorPage.titleEditable;
        await titleEditable.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        await titleEditable.click();

        // Выделяем всё и удаляем
        await page.keyboard.press("Control+A");
        await page.keyboard.press("Backspace");

        // Кликаем вне заголовка чтобы сохранить
        await page.mouse.click(10, 10);
        await page
          .waitForLoadState("networkidle", { timeout: 3_000 })
          .catch(() => {});
      });

      await test.step("Проверить, что заголовок опроса восстановлен на дефолтное значение", async () => {
        // Ждём автосохранения
        await constructorPage.waitForAutosave();

        const currentTitle = await constructorPage.getTitleText();
        console.log(
          `Текущий заголовок опроса после очистки: "${currentTitle}"`,
        );

        // Система должна восстановить точное дефолтное значение
        expect(currentTitle).toBe("Новый опрос");
      });
    });
  },
);
