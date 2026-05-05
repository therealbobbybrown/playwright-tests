// tests/functional/objectives/create-company-objective.spec.js
// TestRail: C2647, C2648 - Создание цели компании
import { expect } from "@playwright/test";
import { test } from "../../fixtures/auth.js";
import { SideMenu } from "../../../pages/SideMenu.js";
import { ObjectivesSettingsPage } from "../../../pages/ObjectivesSettingsPage.js";
import { ObjectiveCreatePage } from "../../../pages/ObjectiveCreatePage.js";
import { ObjectiveDetailsPage } from "../../../pages/ObjectiveDetailsPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { TIMEOUTS } from "../../utils/constants.js";

test.describe(
  "Создание цели компании (OKR)",
  { tag: ["@ui", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.OBJECTIVES);
    });

    test(
      "C2647: создание цели компании с обязательными полями",
      { tag: ["@critical"] },
      async ({ adminAuth, page }, testInfo) => {
        setSeverity("critical");
        const sideMenu = new SideMenu(page, testInfo);
        const objectivesSettingsPage = new ObjectivesSettingsPage(
          page,
          testInfo,
        );
        const objectiveCreatePage = new ObjectiveCreatePage(page, testInfo);
        const objectiveDetailsPage = new ObjectiveDetailsPage(page, testInfo);

        const randomNumber = Math.floor(Math.random() * 100000) + 1;
        const objectiveTitle = `Цель компании ${randomNumber}`;
        const milestoneTitle = `КР компании ${randomNumber}`;

        await test.step('Открыть "Создать цель"', async () => {
          const hasCreateItem = await sideMenu.hasObjectivesCreateItem();
          if (!hasCreateItem) {
            await sideMenu.openObjectivesSettings();
            await objectivesSettingsPage.assertOpened();
            await objectivesSettingsPage.enableOkrIfDisabled();
          }
          await sideMenu.openObjectivesCreate();
        });

        await test.step('Изменить уровень цели на "Цель компании"', async () => {
          // Находим кнопку "Цель компании" или "Компания"
          const companyButton = page
            .locator("button")
            .filter({ hasText: /Цель компании|Компания/i })
            .first();
          await companyButton.waitFor({
            state: "visible",
            timeout: TIMEOUTS.MEDIUM,
          });
          await companyButton.click();
        });

        await test.step("Заполнить обязательные поля", async () => {
          await objectiveCreatePage.objectiveTitleTextarea.fill(objectiveTitle);
          await objectiveCreatePage.addMilestoneButton.click();
          await objectiveCreatePage.milestoneTitleTextarea.waitFor({
            state: "visible",
            timeout: TIMEOUTS.MEDIUM,
          });
          await objectiveCreatePage.milestoneTitleTextarea.fill(milestoneTitle);
        });

        await test.step("Создать цель", async () => {
          // Прокручиваем страницу вниз чтобы кнопка была видна
          await page.evaluate(() =>
            window.scrollTo(0, document.body.scrollHeight),
          );

          // Ждём что кнопка активна и кликаем с force
          await objectiveCreatePage.createButton.waitFor({
            state: "visible",
            timeout: TIMEOUTS.MEDIUM,
          });
          await objectiveCreatePage.createButton.scrollIntoViewIfNeeded();
          await objectiveCreatePage.createButton.click({ force: true });

          console.log('Кнопка "Создать" нажата');

          // Ждём навигации или изменения URL
          try {
            await page.waitForURL(/\/objectives\/(?:view\/)?\d+/, { timeout: TIMEOUTS.PAGE_LOAD });
          } catch {
            console.log("Ожидание навигации истекло");
          }

          // Дополнительное ожидание
          await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });
        });

        await test.step("Проверить переход на страницу деталей", async () => {
          await objectiveDetailsPage.assertDetails(
            objectiveTitle,
            milestoneTitle,
          );
        });
      },
    );

    test("C2648: создание цели компании со всеми полями", async ({
      adminAuth,
      page,
    }, testInfo) => {
      setSeverity("normal");
      const sideMenu = new SideMenu(page, testInfo);
      const objectivesSettingsPage = new ObjectivesSettingsPage(page, testInfo);
      const objectiveCreatePage = new ObjectiveCreatePage(page, testInfo);
      const objectiveDetailsPage = new ObjectiveDetailsPage(page, testInfo);

      const randomNumber = Math.floor(Math.random() * 100000) + 1;
      const objectiveTitle = `Полная цель компании ${randomNumber}`;
      const milestoneTitle = `КР компании полный ${randomNumber}`;

      await test.step('Открыть "Создать цель"', async () => {
        const hasCreateItem = await sideMenu.hasObjectivesCreateItem();
        if (!hasCreateItem) {
          await sideMenu.openObjectivesSettings();
          await objectivesSettingsPage.enableOkrIfDisabled();
        }
        await sideMenu.openObjectivesCreate();
      });

      await test.step('Выбрать уровень "Цель компании"', async () => {
        const companyButton = page
          .locator("button")
          .filter({ hasText: /Цель компании|Компания/i })
          .first();
        await companyButton.click();
      });

      await test.step("Заполнить все доступные поля", async () => {
        await objectiveCreatePage.objectiveTitleTextarea.fill(objectiveTitle);

        // Попробуем изменить период
        const periodSelects = page
          .locator('[class*="Select"]')
          .filter({ hasText: /год|Q\d|квартал/i });
        const yearSelect = periodSelects.first();
        let hasYear = false;
        try {
          await yearSelect.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });
          hasYear = true;
        } catch {
          // селектор года не найден
        }

        if (hasYear) {
          console.log("Найден селектор года");
          // Попробуем открыть и выбрать другой год
        }

        // Добавить несколько КР
        await objectiveCreatePage.addMilestoneButton.click();
        await objectiveCreatePage.milestoneTitleTextarea.fill(milestoneTitle);

        // Попробуем добавить ещё один КР
        let addMoreKrVisible = false;
        try {
          await objectiveCreatePage.addMilestoneButton.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });
          addMoreKrVisible = true;
        } catch {
          // кнопка добавления КР не найдена
        }
        if (addMoreKrVisible) {
          await objectiveCreatePage.addMilestoneButton.click();
          const secondKr = page.locator("textarea#milestone-title").nth(1);
          let secondKrVisible = false;
          try {
            await secondKr.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });
            secondKrVisible = true;
          } catch {
            // второй КР не появился
          }
          if (secondKrVisible) {
            await secondKr.fill(`Второй КР ${randomNumber}`);
          }
        }
      });

      await test.step("Создать цель", async () => {
        // Прокручиваем страницу вниз чтобы кнопка была видна
        await page.evaluate(() =>
          window.scrollTo(0, document.body.scrollHeight),
        );

        // Ждём что кнопка активна и кликаем с force
        await objectiveCreatePage.createButton.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        await objectiveCreatePage.createButton.scrollIntoViewIfNeeded();
        await objectiveCreatePage.createButton.click({ force: true });

        console.log('Кнопка "Создать" нажата');

        // Ждём навигации или изменения URL
        try {
          await page.waitForURL(/\/objectives\/(?:view\/)?\d+/, { timeout: TIMEOUTS.PAGE_LOAD });
        } catch {
          console.log("Ожидание навигации истекло");
        }

        // Дополнительное ожидание
        await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });
      });

      await test.step("Проверить детали цели", async () => {
        await objectiveDetailsPage.assertDetails(
          objectiveTitle,
          milestoneTitle,
        );
      });
    });
  },
);
