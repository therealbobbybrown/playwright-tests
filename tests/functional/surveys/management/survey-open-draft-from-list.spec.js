// tests/surveys-open-draft-from-list.spec.js
import { test } from "../../../fixtures/auth.js";
import { SideMenu } from "../../../../pages/SideMenu.js";
import { SurveysListPage } from "../../../../pages/SurveysListPage.js";
import { SurveyConstructorPage } from "../../../../pages/SurveyConstructorPage.js";
import { SurveyPublicationSettingsPage } from "../../../../pages/SurveyPublicationSettingsPage.js";
import { SurveyPublicPage } from "../../../../pages/SurveyPublicPage.js";
import { SurveyResultsPage } from "../../../../pages/SurveyResultsPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";

test.describe(
  "Опросы — черновик, публикация и прохождение по публичной ссылке",
  { tag: ["@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.SURVEYS, "Management");
    });

    test(
      "C2979: Админ открывает опрос-черновик, настраивает публикацию, публикует и проходит опрос по ссылке",
      { tag: ["@critical"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("critical");
        // Увеличиваем таймаут только для этого теста
        test.slow(); // помечаем как долгий, чтобы глобальный таймаут не поджимал
        testInfo.setTimeout(150_000); // можно 180_000, если потребуется

        const sideMenu = new SideMenu(page, testInfo);
        const surveysListPage = new SurveysListPage(page, testInfo);
        const constructorPage = new SurveyConstructorPage(page, testInfo);
        const publicationSettingsPage = new SurveyPublicationSettingsPage(
          page,
          testInfo,
        );
        const publicPage = new SurveyPublicPage(page, testInfo);
        const resultsPage = new SurveyResultsPage(page, testInfo);

        let surveyTitle;

        await test.step('Открыть страницу "Опросы" через боковое меню', async () => {
          await sideMenu.openSurveysList();
          await surveysListPage.assertOpened();
        });

        await test.step('Открыть первый опрос со статусом "Черновик" из списка (или создать новый)', async () => {
          await surveysListPage.openFirstDraftSurveyOrCreate();
        });

        await test.step("Убедиться, что открыт конструктор опроса", async () => {
          await constructorPage.assertOpened();
        });

        await test.step("Запомнить название опроса из конструктора", async () => {
          surveyTitle = await constructorPage.getTitleText();
        });

        await test.step("Перейти к настройкам публикации из конструктора", async () => {
          await constructorPage.goToPublicationSettings();
          await publicationSettingsPage.assertOpened();
        });

        // Для готового черновика не проверяем дефолтные настройки,
        // только переключаем аудиторию на нужный режим.

        await test.step('Переключить аудиторию на "Все, у кого ссылка"', async () => {
          await publicationSettingsPage.selectAudiencePublicLink();
        });

        await test.step('Проверить, что блок "Кто участвует в опросе" не отображается', async () => {
          await publicationSettingsPage.assertParticipantsBlockHidden();
        });

        await test.step('Нажать кнопку "Опубликовать опрос"', async () => {
          await publicationSettingsPage.publishSurvey();
        });

        await test.step("Проверить, что опрос запущен и собирает ответы", async () => {
          await publicationSettingsPage.assertSurveyStartedAndCollecting();
        });

        await test.step("Скопировать ссылку на опрос и перейти по ней", async () => {
          await publicationSettingsPage.openSurveyShareLink();
        });

        await test.step("Проверить, что публичная страница опроса открыта с тем же названием", async () => {
          await publicPage.assertOpenedWithTitle(surveyTitle);
        });

        await test.step("Пройти опрос по публичной ссылке до конца", async () => {
          await publicPage.answerSurveyAndAssertCompleted();
        });

        // -------- проверка результатов --------

        await test.step('Вернуться в раздел "Опросы" прямым переходом по URL', async () => {
          const surveysUrl = new URL(
            "/ru/manager/company/surveys/",
            process.env.BASE_URL,
          ).toString();

          await page.goto(surveysUrl, { waitUntil: "networkidle" });
          await surveysListPage.assertOpened();
        });

        await test.step("Найти пройденный опрос по названию и открыть его карточку", async () => {
          await surveysListPage.openSurveyByTitle(surveyTitle);
        });

        await test.step('Открыть вкладку "Результаты" и убедиться, что есть ответы', async () => {
          await resultsPage.openResultsTab();
          await resultsPage.assertHasAnyAnswers();
        });
      },
    );
  },
);
