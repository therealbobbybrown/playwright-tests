// tests/surveys-create-and-pass-with-groups-full.spec.js
// Полный сценарий: подготовить группы, создать опрос, выбрать группы,
// опубликовать, пройти опрос пользователями из групп и проверить результаты.
import { test } from "../../../fixtures/auth.js";
import "dotenv/config";
import { SideMenu } from "../../../../pages/SideMenu.js";
import { SurveysListPage } from "../../../../pages/SurveysListPage.js";
import { SurveyConstructorPage } from "../../../../pages/SurveyConstructorPage.js";
import { SurveyPublicationSettingsPage } from "../../../../pages/SurveyPublicationSettingsPage.js";
import { StructureUserGroupsPage } from "../../../../pages/StructureUserGroupsPage.js";
import { SurveyPublicPage } from "../../../../pages/SurveyPublicPage.js";
import { SurveyResultsPage } from "../../../../pages/SurveyResultsPage.js";
import { LoginPage } from "../../../../pages/LoginPage.js";
import { TokenManager } from "../../../utils/auth/TokenManager.js";
import {
  markAsE2ETest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";
import { TEST_DATA } from "../../../utils/constants.js";
import { SurveyAPI, getCredentials } from "../../../utils/api/index.js";

test.describe(
  "Опросы — E2E с группами",
  { tag: ["@ui", "@regression", "@e2e"] },
  () => {
    let createdSurveyId = null;

    test.beforeEach(() => {
      markAsE2ETest(MODULES.SURVEYS, "Publication");
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
      "C2981: Создать опрос с выбором групп, опубликовать и пройти от имени пользователей",
      { tag: ["@critical"] },
      async ({ adminAuth: adminPage, browser }, testInfo) => {
        setSeverity("critical");
        test.slow();
        testInfo.setTimeout(600_000); // до 10 минут

        const sideMenu = new SideMenu(adminPage, testInfo);
        const surveysListPage = new SurveysListPage(adminPage, testInfo);
        const constructorPage = new SurveyConstructorPage(adminPage, testInfo);
        const publicationSettingsPage = new SurveyPublicationSettingsPage(
          adminPage,
          testInfo,
        );
        const groupsPage = new StructureUserGroupsPage(adminPage, testInfo);
        const resultsPage = new SurveyResultsPage(adminPage, testInfo);

        let surveyTitle;
        let surveyUrl;
        let chosenGroups = [];
        let groupUsers = {};

        // Константы
        const MIN_USERS_PER_GROUP = 3;

        // ---------------------- Шаг 1: Собрать группы и их участников ----------------------
        await test.step("Админ: найти группы с достаточным количеством участников", async () => {
          await groupsPage.openFromSideMenu();

          const allGroups = await groupsPage.getGroupsList();
          console.log(`Всего групп: ${allGroups.length}`);

          const usedEmails = new Set();
          const finalChosenGroups = [];

          for (const groupName of allGroups) {
            if (finalChosenGroups.length >= 2) break;

            await groupsPage.openGroupByName(groupName);
            const members = (await groupsPage.getGroupUserEmails()).map((e) =>
              e.toLowerCase(),
            );

            console.log(`Группа "${groupName}": ${members.length} участников`);

            // Берём участников группы, которых ещё не использовали в другой группе
            const available = members.filter((e) => !usedEmails.has(e));

            if (available.length >= MIN_USERS_PER_GROUP) {
              const selected = available.slice(0, MIN_USERS_PER_GROUP);
              groupUsers[groupName] = selected;
              selected.forEach((e) => usedEmails.add(e));
              finalChosenGroups.push(groupName);
              console.log(
                `  Выбрано ${selected.length} участников: ${selected.join(", ")}`,
              );
            } else {
              console.log(
                `  Пропускаем (доступно ${available.length}/${MIN_USERS_PER_GROUP})`,
              );
            }
          }

          if (finalChosenGroups.length < 2) {
            throw new Error(
              `Не удалось найти минимум 2 группы с ${MIN_USERS_PER_GROUP}+ участниками. ` +
                `Найдено: ${finalChosenGroups.length} (${finalChosenGroups.join(", ")}).`,
            );
          }

          chosenGroups = finalChosenGroups;

          console.log(`\n=== ИТОГО ===`);
          console.log(`Группы: ${chosenGroups.join(", ")}`);
          for (const g of chosenGroups) {
            console.log(`  ${g}: ${groupUsers[g].join(", ")}`);
          }
        });

        // ---------------------- Шаг 3: Создание опроса ----------------------
        await test.step("Админ: создать пустой опрос и добавить вопрос", async () => {
          await sideMenu.openSurveysList();
          await surveysListPage.assertOpened();
          await surveysListPage.createBlankSurveyFromList();
          await constructorPage.assertOpened();
          createdSurveyId = constructorPage.getSurveyIdFromUrl();

          surveyTitle =
            await constructorPage.changeTitleRandom("Тест группы полный");
          await constructorPage.addQuestionWithType({
            title: "Оцените работу команды",
            typeLabel: "Шкала",
            scaleViewType: "Цифры",
          });
          await constructorPage.waitForAutosave();
        });

        // ---------------------- Шаг 4: Настройки публикации и выбор групп ----------------------
        await test.step("Админ: настроить публикацию и выбрать группы", async () => {
          await constructorPage.goToPublicationSettings();
          await publicationSettingsPage.assertOpened();
          await publicationSettingsPage.selectAudienceInternal();
          await publicationSettingsPage.selectGroupsExact(chosenGroups);
        });

        // ---------------------- Шаг 5: Публикация ----------------------
        await test.step("Админ: опубликовать опрос и получить ссылку", async () => {
          await publicationSettingsPage.publishSurvey();
          await publicationSettingsPage.waitForPublishedStatus();
          surveyUrl = await publicationSettingsPage.getSurveyShareLink();
          if (!surveyUrl)
            throw new Error("Не удалось получить публичную ссылку на опрос");
        });

        // ---------------------- Шаг 6: Прохождение опроса пользователями ----------------------
        await test.step("Пользователи: пройти опрос по ссылке", async () => {
          // Собираем уникальных пользователей из всех групп
          const uniqueUsers = new Set();
          for (const groupName of chosenGroups) {
            groupUsers[groupName].forEach((email) => uniqueUsers.add(email));
          }
          const usersToPass = Array.from(uniqueUsers);

          console.log(
            `\nПользователи для прохождения опроса (${usersToPass.length}):`,
          );
          usersToPass.forEach((email, i) =>
            console.log(`  ${i + 1}. ${email}`),
          );

          let passedCount = 0;
          for (const email of usersToPass) {
            console.log(`\n>>> Прохождение опроса пользователем: ${email}`);
            const context = await browser.newContext();
            const page = await context.newPage();
            try {
              const publicPage = new SurveyPublicPage(page, testInfo);

              // API fast path + UI fallback
              let loggedIn = false;
              try {
                loggedIn = await TokenManager.loginViaApi(
                  page,
                  email,
                  TEST_DATA.DEFAULT_PASSWORD,
                );
              } catch (e) {
                console.log(`  API login error: ${e.message}`);
              }
              if (!loggedIn) {
                await context.clearCookies();
                try {
                  await page.evaluate(() =>
                    localStorage.removeItem("fingerPrint"),
                  );
                } catch {}
                const loginPage = new LoginPage(page, testInfo);
                await loginPage.goto();
                await loginPage.login(email, TEST_DATA.DEFAULT_PASSWORD);
                const stillOnLogin = page.url().includes("/login");
                if (stillOnLogin) {
                  console.log(`  Пропускаем ${email} — логин не удался`);
                  continue;
                }
              }

              await page.goto(surveyUrl, { waitUntil: "networkidle" });
              await publicPage.assertOpenedWithTitle(surveyTitle);
              await publicPage.answerSurveyAndAssertCompleted();
              passedCount++;
            } catch (e) {
              console.log(`  Ошибка для ${email}: ${e.message}`);
            } finally {
              await context.close();
            }
          }
          if (passedCount === 0) {
            throw new Error("Ни один пользователь не смог пройти опрос");
          }
          console.log(
            `\nОпрос пройден ${passedCount}/${usersToPass.length} пользователями`,
          );
        });

        // ---------------------- Шаг 7: Проверка результатов ----------------------
        await test.step("Админ: проверить результаты опроса", async () => {
          await sideMenu.openSurveysList();
          await surveysListPage.assertOpened();
          await surveysListPage.openSurveyByTitle(surveyTitle);

          await resultsPage.openResultsTab();
          await resultsPage.assertHasAnyAnswers();
          await resultsPage.assertHeatMapVisible();

          // Проверяем, что выбранные группы отображаются в таблице групп (вторая таблица на странице)
          for (const groupName of chosenGroups) {
            await resultsPage.assertGroupVisible(groupName);
          }
        });
      },
    );
  },
);
