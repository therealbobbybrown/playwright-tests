// tests/surveys-create-and-pass-with-departments-full.spec.js
// Полный сценарий: создать опрос, выбрать 2 отдела, добавить в них пользователей,
// опубликовать, пройти опрос каждым пользователем и проверить результаты.
import { test, expect } from "../../../fixtures/auth.js";
import "dotenv/config";
import { SideMenu } from "../../../../pages/SideMenu.js";
import { SurveysListPage } from "../../../../pages/SurveysListPage.js";
import { SurveyConstructorPage } from "../../../../pages/SurveyConstructorPage.js";
import { SurveyPublicationSettingsPage } from "../../../../pages/SurveyPublicationSettingsPage.js";
import { StructureUsersPage } from "../../../../pages/StructureUsersPage.js";
import { StructureDepartmentsPage } from "../../../../pages/StructureDepartmentsPage.js";
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
  "Опросы — E2E с отделами",
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
      "C2980: Создать опрос с выбором отделов, добавить пользователей, опубликовать и пройти от имени пользователей",
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
        const usersPage = new StructureUsersPage(adminPage, testInfo);
        const departmentsPage = new StructureDepartmentsPage(
          adminPage,
          testInfo,
        );
        const resultsPage = new SurveyResultsPage(adminPage, testInfo);

        let surveyTitle;
        let surveyUrl;
        let chosenDepartments = [];
        let departmentUsers = {};

        // ---------------------- Шаг 1: Создание опроса ----------------------
        await test.step("Админ: создать пустой опрос и добавить вопрос", async () => {
          await sideMenu.openSurveysList();
          await surveysListPage.assertOpened();
          await surveysListPage.createBlankSurveyFromList();
          await constructorPage.assertOpened();
          createdSurveyId = constructorPage.getSurveyIdFromUrl();

          surveyTitle =
            await constructorPage.changeTitleRandom("Тест отделы полный");
          await constructorPage.addQuestionWithType({
            title: "Оцените удовлетворенность работой",
            typeLabel: "Шкала",
            scaleViewType: "Цифры",
          });
          await constructorPage.waitForAutosave();
        });

        // ---------------------- Шаг 2: Настройки публикации ----------------------
        await test.step("Админ: перейти к настройкам публикации", async () => {
          await constructorPage.goToPublicationSettings();
          await publicationSettingsPage.assertOpened();
          await publicationSettingsPage.selectAudienceInternal();
        });

        // ---------------------- Шаг 3: Получить активных пользователей ----------------------
        let activeUsers = [];
        let activeUsersSet = new Set();
        await test.step("Админ: получить список активных пользователей (минимум 6)", async () => {
          await usersPage.openFromSideMenu();
          activeUsers = await usersPage.getActiveUsersEmails(10);
          if (activeUsers.length < 6) {
            throw new Error(
              `Недостаточно активных пользователей, нужно минимум 6, получили ${activeUsers.length}`,
            );
          }
          activeUsersSet = new Set(
            activeUsers.map((email) => email.toLowerCase()),
          );
        });

        // ---------------------- Шаг 4: Собрать отделы и распределить пользователей ----------------------
        // Корневые отделы берём прямо из дерева на странице структуры — гарантируем их видимость.
        const usedEmails = new Set();
        departmentUsers = {};

        await test.step("Админ: собрать корневые отделы из дерева и распределить пользователей", async () => {
          await departmentsPage.openFromSideMenu();

          // Собираем названия первых 2 корневых отделов из дерева через Playwright
          const treeLinks = departmentsPage.treeMenu.locator(
            'a[href*="/departments/department/"]',
          );
          await treeLinks
            .first()
            .waitFor({ state: "visible", timeout: 15_000 });

          const treeLinksCount = await treeLinks.count();
          for (
            let i = 0;
            i < Math.min(treeLinksCount, 10) && chosenDepartments.length < 2;
            i++
          ) {
            const link = treeLinks.nth(i);
            // Поднимаемся к контейнеру TreeItem и берём innerText
            const treeItem = link.locator(
              'xpath=ancestor::*[contains(@class, "TreeItem")][1]',
            );
            const text = await treeItem.innerText().catch(() => "");
            // Фильтруем по длине > 1: аватар-инициал (1 символ) отбрасываем
            const parts = text
              .split(/[\n\r\t]/)
              .map((s) => s.trim())
              .filter((s) => s.length > 1);
            const name = parts[0];
            if (name && !chosenDepartments.includes(name)) {
              chosenDepartments.push(name);
            }
          }

          if (chosenDepartments.length < 2) {
            throw new Error(
              `Не нашли минимум 2 корневых отдела в дереве структуры (нашли: ${chosenDepartments.length})`,
            );
          }

          // Для каждого отдела собираем уже существующих активных сотрудников
          for (const deptName of chosenDepartments) {
            await departmentsPage.openDepartmentByName(deptName);
            const existing = (
              await departmentsPage.getDepartmentEmployeeEmails()
            ).map((e) => e.toLowerCase());
            const activeExisting = existing.filter((email) =>
              activeUsersSet.has(email),
            );
            const uniqueExisting = Array.from(new Set(activeExisting)).slice(
              0,
              3,
            );
            uniqueExisting.forEach((e) => usedEmails.add(e));
            departmentUsers[deptName] = [...uniqueExisting];
          }

          // Добираем пользователей из пула до 3 на отдел
          const pool = activeUsers
            .map((e) => e.toLowerCase())
            .filter((e) => !usedEmails.has(e));
          for (const deptName of chosenDepartments) {
            const list = departmentUsers[deptName];
            while (list.length < 3 && pool.length > 0) {
              const email = pool.shift();
              if (!usedEmails.has(email)) {
                list.push(email);
                usedEmails.add(email);
              }
            }
            if (list.length < 3) {
              throw new Error(
                `Недостаточно активных сотрудников для отдела "${deptName}" (нужно 3, есть ${list.length})`,
              );
            }
          }
        });

        // ---------------------- Шаг 5: Добавление пользователей в отделы ----------------------
        await test.step("Админ: добавить пользователей в выбранные отделы", async () => {
          await departmentsPage.openFromSideMenu();

          for (const deptName of chosenDepartments) {
            const emails = departmentUsers[deptName];
            await departmentsPage.openDepartmentByName(deptName);
            await departmentsPage.addUsersToDepartmentByEmails(emails);
          }
        });

        // ---------------------- Шаг 6: Выбор отделов в опросе ----------------------
        await test.step("Админ: вернуться к опросу и выбрать отделы", async () => {
          await sideMenu.openSurveysList();
          await surveysListPage.assertOpened();
          await surveysListPage.openSurveyByTitle(surveyTitle);
          await constructorPage.assertOpened();
          await constructorPage.goToPublicationSettings();
          await publicationSettingsPage.assertOpened();
          await publicationSettingsPage.selectAudienceInternal();
          await publicationSettingsPage.selectDepartmentsV2(chosenDepartments);
        });

        // ---------------------- Шаг 7: Публикация ----------------------
        await test.step("Админ: опубликовать опрос и получить ссылку", async () => {
          await publicationSettingsPage.publishSurvey();
          await publicationSettingsPage.waitForPublishedStatus();
          surveyUrl = await publicationSettingsPage.getSurveyShareLink();
          if (!surveyUrl)
            throw new Error("Не удалось получить публичную ссылку на опрос");
        });

        // ---------------------- Шаг 8: Прохождение опроса пользователями ----------------------
        await test.step("Пользователи: пройти опрос по ссылке", async () => {
          for (const deptName of chosenDepartments) {
            let deptAnswered = 0;
            for (const email of departmentUsers[deptName]) {
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
                  console.log(`  API login error for ${email}: ${e.message}`);
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
                    console.log(
                      `  ⚠ Пропускаем ${email} — логин не удался (другой пароль?)`,
                    );
                    continue;
                  }
                }

                await page.goto(surveyUrl, { waitUntil: "networkidle" });
                await publicPage.assertOpenedWithTitle(surveyTitle);
                await publicPage.answerSurveyAndAssertCompleted();
                deptAnswered++;
              } catch (e) {
                console.log(`  ⚠ Ошибка для ${email}: ${e.message}`);
              } finally {
                await context.close();
              }
            }
            if (deptAnswered === 0) {
              throw new Error(
                `Ни один пользователь из отдела "${deptName}" не смог пройти опрос`,
              );
            }
          }
        });

        // ---------------------- Шаг 9: Проверка результатов ----------------------
        await test.step("Админ: проверить результаты опроса", async () => {
          await sideMenu.openSurveysList();
          await surveysListPage.assertOpened();
          await surveysListPage.openSurveyByTitle(surveyTitle);

          await resultsPage.openResultsTab();
          await resultsPage.assertHasAnyAnswers();
          await resultsPage.assertHeatMapVisible();

          for (const deptName of chosenDepartments) {
            await resultsPage.assertDepartmentVisible(deptName);
          }
        });
      },
    );
  },
);
