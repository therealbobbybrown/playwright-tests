// tests/functional/development-plans/dev-plan-create-from-pr.spec.js
// TestRail: C2738, C2742, C4218 - Создание ИПР из результатов оценки (Performance Review)

import { expect } from "@playwright/test";
import { test } from "../../fixtures/auth.js";
import { SideMenu } from "../../../pages/SideMenu.js";
import { MyTeamPage } from "../../../pages/MyTeamPage.js";
import { EmployeeResultsModal } from "../../../pages/EmployeeResultsModal.js";
import { PerformanceReviewsListPage } from "../../../pages/PerformanceReviewsListPage.js";
import { PerformanceReviewConfigPage } from "../../../pages/PerformanceReviewConfigPage.js";
import { DevelopmentMenuHelper } from "../../../pages/menu/DevelopmentMenuHelper.js";
import { DevelopmentPlanTemplatesListPage } from "../../../pages/DevelopmentPlanTemplatesListPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { TIMEOUTS } from "../../utils/constants.js";

test.describe(
  "Создание ИПР из результатов Performance Review",
  { tag: ["@ui", "@development-plans", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.DEVELOPMENT);
    });

    test(
      "C2738: Создание ИПР по шаблону из результатов оценки сотрудника",
      { tag: ["@regression"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("normal");

        const devMenu = new DevelopmentMenuHelper(page, testInfo);
        const templatesPage = new DevelopmentPlanTemplatesListPage(
          page,
          testInfo,
        );
        const prListPage = new PerformanceReviewsListPage(page, testInfo);
        const configPage = new PerformanceReviewConfigPage(page, testInfo);
        const modal = new EmployeeResultsModal(page, testInfo);

        // Шаг 1: Проверить наличие шаблонов
        let hasTemplates = false;
        await test.step("Проверить наличие шаблонов ИПР", async () => {
          await devMenu.openDevelopmentPlanTemplates();
          await templatesPage.assertOpened();
          const count = await templatesPage.getTemplatesCount();
          hasTemplates = count > 0;
          console.log(`Шаблонов: ${count}`);
        });

        // Шаг 2: Перейти к списку оценок и найти завершённую
        await test.step('Открыть "Оценка сотрудников" и выбрать завершённую оценку', async () => {
          const baseUrl = process.env.BASE_URL;
          await page.goto(
            new URL("/ru/manager/performance-reviews/", baseUrl).toString(),
          );
          await prListPage.assertOpened();

          // Фильтруем по завершённым
          await prListPage.switchTab("completed");

          // Кликаем на первую завершённую оценку
          // Карточки содержат link overlay с числовым ID в href
          const cardLink = page
            .locator('a[href*="/manager/performance-reviews/"][class*="link"]')
            .first();
          await cardLink.waitFor({
            state: "visible",
            timeout: TIMEOUTS.MEDIUM,
          });
          await cardLink.click();
          await page.waitForURL(/\/manager\/performance-reviews\/\d+/, {
            timeout: TIMEOUTS.NAVIGATION,
          });
        });

        // Шаг 3: Перейти на вкладку "Результаты"
        await test.step('Перейти на вкладку "Результаты"', async () => {
          await configPage.goToResultsTab();
        });

        // Шаг 4: Открыть модалку результатов первого сотрудника
        await test.step('Открыть модалку результатов сотрудника', async () => {
          // Нижняя таблица с оцениваемыми — кнопки "Результаты"
          const resultsButton = page
            .locator('button[class*="BorderedButton"]')
            .filter({ hasText: /^результаты$/i })
            .first();
          await resultsButton.waitFor({
            state: "visible",
            timeout: TIMEOUTS.MEDIUM,
          });
          await resultsButton.click();
          await modal.assertModalOpened();
        });

        // Шаг 5: Проверить кнопку "Создать план развития"
        await test.step('Проверить кнопку "Создать план развития"', async () => {
          await expect(modal.createPlanButton).toBeVisible({
            timeout: TIMEOUTS.MEDIUM,
          });
          console.log('Кнопка "Создать план развития" найдена в модалке');

          const employeeName = await modal.getEmployeeName();
          console.log(`Модалка открыта для сотрудника: ${employeeName}`);
        });

        // Шаг 6: Нажать кнопку и проверить реакцию
        await test.step('Нажать "Создать план развития" и проверить результат', async () => {
          await modal.createPlanButton.click();

          if (hasTemplates) {
            // Если есть шаблоны, должен появиться попап с выбором
            const templateOption = page
              .locator('button[class*="AddDevelopmentPlanButton_button"]')
              .first();
            const popupVisible = await templateOption
              .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
              .then(() => true)
              .catch(() => false);

            if (popupVisible) {
              console.log("Попап с выбором типа плана открыт (есть шаблоны)");
              // Проверяем что в попапе есть вариант "по шаблону"
              const byTemplateButton = page
                .locator('button[class*="AddDevelopmentPlanButton_button"]')
                .filter({ hasText: /шаблону/i })
                .first();
              await expect(byTemplateButton).toBeVisible({
                timeout: TIMEOUTS.SHORT,
              });
            } else {
              // Прямой редирект — план уже существует
              await page.waitForURL(/development-plan/, {
                timeout: TIMEOUTS.URL_CHANGE,
              });
              console.log("Прямой редирект на страницу плана развития");
            }
          } else {
            // Без шаблонов — прямой редирект
            await page.waitForURL(/development-plan/, {
              timeout: TIMEOUTS.URL_CHANGE,
            });
            console.log("Редирект на создание плана (без шаблонов)");
          }
        });
      },
    );

    test(
      "C2742: Создание ИПР без шаблонов из результатов оценки",
      { tag: ["@regression"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("normal");

        const configPage = new PerformanceReviewConfigPage(page, testInfo);
        const modal = new EmployeeResultsModal(page, testInfo);

        // Шаг 1: Перейти напрямую к завершённой оценке через список
        await test.step("Открыть завершённую оценку", async () => {
          const baseUrl = process.env.BASE_URL;
          await page.goto(
            new URL("/ru/manager/performance-reviews/", baseUrl).toString(),
          );

          const heading = page
            .getByRole("heading", { name: /оценка сотрудников/i })
            .first();
          await heading.waitFor({
            state: "visible",
            timeout: TIMEOUTS.MEDIUM,
          });

          // Фильтруем завершённые
          const completedTab = page
            .getByRole("button", { name: /завершенные/i })
            .first();
          await completedTab.waitFor({
            state: "visible",
            timeout: TIMEOUTS.SHORT,
          });
          await completedTab.click();
          await page
            .waitForLoadState("domcontentloaded", { timeout: TIMEOUTS.SHORT })
            .catch(() => {});

          // Кликаем на первую завершённую оценку
          const cardLink = page
            .locator('a[href*="/manager/performance-reviews/"][class*="link"]')
            .first();
          await cardLink.waitFor({
            state: "visible",
            timeout: TIMEOUTS.MEDIUM,
          });
          await cardLink.click();
          await page.waitForURL(/\/manager\/performance-reviews\/\d+/, {
            timeout: TIMEOUTS.NAVIGATION,
          });
        });

        // Шаг 2: Перейти на вкладку "Результаты"
        await test.step('Перейти на вкладку "Результаты"', async () => {
          await configPage.goToResultsTab();
        });

        // Шаг 3: Открыть модалку результатов сотрудника
        await test.step('Открыть модалку результатов сотрудника', async () => {
          const resultsButton = page
            .locator('button[class*="BorderedButton"]')
            .filter({ hasText: /^результаты$/i })
            .first();
          await resultsButton.waitFor({
            state: "visible",
            timeout: TIMEOUTS.MEDIUM,
          });
          await resultsButton.click();
          await modal.assertModalOpened();
        });

        // Шаг 4: Проверить наличие кнопки "Создать план развития"
        await test.step('Проверить кнопку "Создать план развития"', async () => {
          await expect(modal.createPlanButton).toBeVisible({
            timeout: TIMEOUTS.MEDIUM,
          });
          const employeeName = await modal.getEmployeeName();
          console.log(
            `Кнопка "Создать план развития" найдена для: ${employeeName}`,
          );
        });

        // Шаг 5: Нажать и проверить редирект
        await test.step('Нажать "Создать план развития"', async () => {
          await modal.clickCreateDevelopmentPlan("new");

          const currentUrl = page.url();
          expect(currentUrl).toMatch(/development-plan/i);
          console.log(
            "Редирект на страницу создания плана развития выполнен",
          );
        });
      },
    );

    test(
      'C4218: Создание ИПР из "Моя команда" - "Оценка команды"',
      { tag: ["@regression"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("normal");

        const sideMenu = new SideMenu(page, testInfo);
        const myTeamPage = new MyTeamPage(page, testInfo);
        const modal = new EmployeeResultsModal(page, testInfo);

        // Шаг 1: Открыть "Моя команда"
        await test.step('Открыть "Моя команда"', async () => {
          await sideMenu.openMyTeam();
          await myTeamPage.assertOpened();
        });

        // Шаг 2: Убедиться что вкладка "Оценка команды" активна (она дефолтная)
        await test.step('Проверить вкладку "Оценка команды"', async () => {
          await myTeamPage.switchToTeamEvaluationTab();
        });

        // Шаг 3: Проверить наличие сотрудников
        await test.step("Проверить наличие сотрудников", async () => {
          const count = await myTeamPage.getEmployeesCount();
          expect(count).toBeGreaterThan(0);
          console.log(`Сотрудников в таблице: ${count}`);
        });

        // Шаг 4: Нажать "Результаты" для первого сотрудника — открывается модалка
        await test.step('Нажать "Результаты" для первого сотрудника', async () => {
          await myTeamPage.clickResultsForEmployee(0);
          await modal.assertModalOpened();
        });

        // Шаг 5: Проверить кнопку "Создать план развития" в модалке
        await test.step('Проверить кнопку "Создать план развития" в модалке', async () => {
          await expect(modal.createPlanButton).toBeVisible({
            timeout: TIMEOUTS.MEDIUM,
          });
          const employeeName = await modal.getEmployeeName();
          console.log(
            `Кнопка "Создать план развития" найдена для: ${employeeName}`,
          );
        });

        // Шаг 6: Нажать и проверить редирект
        await test.step('Нажать "Создать план развития" и проверить редирект', async () => {
          await modal.clickCreateDevelopmentPlan("new");

          const currentUrl = page.url();
          expect(currentUrl).toMatch(/development-plan/i);
          console.log(
            "Редирект на страницу создания плана развития выполнен",
          );
        });
      },
    );
  },
);
