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
  "Опросы — создание пустого опроса со всеми типами вопросов",
  { tag: ["@ui", "@regression"] },
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
      "C2951: Админ создаёт пустой опрос (не из шаблона) и добавляет все типы вопросов",
      { tag: ["@critical"] },
      async ({ adminAuth, page }, testInfo) => {
        setSeverity("critical");
        const sideMenu = new SideMenu(page, testInfo);
        const surveysListPage = new SurveysListPage(page, testInfo);
        const constructorPage = new SurveyConstructorPage(page, testInfo);

        await test.step('Открыть список "Опросы"', async () => {
          await sideMenu.openSurveysList();
          await surveysListPage.assertOpened();
        });

        await test.step("Создать пустой опрос (не из шаблона) и открыть конструктор", async () => {
          await surveysListPage.createBlankSurveyFromList();
          await constructorPage.assertOpened();
          createdSurveyId = constructorPage.getSurveyIdFromUrl();
        });

        await test.step("Переименовать опрос (чтобы было видно, что создали)", async () => {
          await constructorPage.changeTitleRandom("Пустой опрос");
        });

        await test.step("Добавить все типы вопросов", async () => {
          await constructorPage.addAllQuestionTypes();
        });

        await test.step("Проверить, что заголовки всех вопросов видны на странице", async () => {
          const titles = [
            "Q1 — Один из списка",
            "Q2 — Несколько из списка",
            "Q3 — Шкала (Цифры)",
            "Q4 — Шкала (Звезды)",
            "Q5 — Шкала (Текст)",
            "Q6 — NPS",
            "Q7 — Длинный ответ",
            "Q8 — Краткий ответ",
          ];

          for (const t of titles) {
            await expect(
              page.getByText(t, { exact: false }).first(),
            ).toBeVisible({
              timeout: 10_000,
            });
          }
        });

        await test.step("Дождаться финального автосохранения", async () => {
          await constructorPage.waitForAutosave();
        });

        await test.step("Перейти к настройкам публикации", async () => {
          await constructorPage.goToPublicationSettings();
        });
      },
    );
  },
);
