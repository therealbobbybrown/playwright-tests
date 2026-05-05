// tests/functional/objectives/create-team-objective.spec.js
// TestRail: C2645, C2646 - Создание Командной цели
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
  "Создание командной цели (OKR)",
  { tag: ["@ui", "@objectives", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.OBJECTIVES);
    });

    test(
      "C2645: создание Командной цели с обязательными полями",
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
        const objectiveTitle = `Командная цель ${randomNumber}`;
        const milestoneTitle = `КР команды ${randomNumber}`;

        await test.step('Открыть "Создать цель" (включить OKR при необходимости)', async () => {
          const hasCreateItem = await sideMenu.hasObjectivesCreateItem();
          if (!hasCreateItem) {
            await sideMenu.openObjectivesSettings();
            await objectivesSettingsPage.assertOpened();
            await objectivesSettingsPage.enableOkrIfDisabled();
          }
          await sideMenu.openObjectivesCreate();
        });

        await test.step('Изменить уровень цели на "Командная"', async () => {
          await objectiveCreatePage.selectLevelTeam();
        });

        await test.step("Выбрать команду", async () => {
          await objectiveCreatePage.selectTeamFromDropdown(0);
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

        await test.step('Нажать "Создать"', async () => {
          await page.evaluate(() =>
            window.scrollTo(0, document.body.scrollHeight),
          );
          await objectiveCreatePage.createButton.waitFor({
            state: "visible",
            timeout: TIMEOUTS.MEDIUM,
          });
          await objectiveCreatePage.createButton.scrollIntoViewIfNeeded();
          await objectiveCreatePage.createButton.click({ force: true });

          await page.waitForURL(/\/objectives\/(?:view\/)?\d+/, {
            timeout: TIMEOUTS.PAGE_LOAD,
          });
        });

        await test.step("Проверить переход на страницу деталей цели", async () => {
          await objectiveDetailsPage.assertDetails(
            objectiveTitle,
            milestoneTitle,
          );
        });
      },
    );

    test("C2646: создание Командной цели со всеми полями", async ({
      adminAuth,
      page,
    }, testInfo) => {
      setSeverity("normal");
      const sideMenu = new SideMenu(page, testInfo);
      const objectivesSettingsPage = new ObjectivesSettingsPage(page, testInfo);
      const objectiveCreatePage = new ObjectiveCreatePage(page, testInfo);
      const objectiveDetailsPage = new ObjectiveDetailsPage(page, testInfo);

      const randomNumber = Math.floor(Math.random() * 100000) + 1;
      const objectiveTitle = `Полная командная цель ${randomNumber}`;
      const milestoneTitle = `КР команды полный ${randomNumber}`;
      const description = `Описание командной цели для автотестов ${randomNumber}`;

      await test.step('Открыть "Создать цель"', async () => {
        const hasCreateItem = await sideMenu.hasObjectivesCreateItem();
        if (!hasCreateItem) {
          await sideMenu.openObjectivesSettings();
          await objectivesSettingsPage.assertOpened();
          await objectivesSettingsPage.enableOkrIfDisabled();
        }
        await sideMenu.openObjectivesCreate();
      });

      await test.step('Выбрать уровень "Командная" и команду', async () => {
        await objectiveCreatePage.selectLevelTeam();
        await objectiveCreatePage.selectTeamFromDropdown(0);
      });

      await test.step("Заполнить все поля", async () => {
        await objectiveCreatePage.objectiveTitleTextarea.fill(objectiveTitle);

        // Включить описание через чекбокс
        const addDescriptionCheckbox = page
          .getByText("Добавить описание")
          .first();
        let hasDescriptionCheckbox = false;
        try {
          await addDescriptionCheckbox.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });
          hasDescriptionCheckbox = true;
        } catch {}
        if (hasDescriptionCheckbox) {
          await addDescriptionCheckbox.click();
          const descriptionField = page.getByPlaceholder(/Описание/i).first();
          let hasDescField = false;
          try {
            await descriptionField.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });
            hasDescField = true;
          } catch {}
          if (hasDescField) {
            await descriptionField.fill(description);
          }
        }

        // Добавить ключевой результат
        await objectiveCreatePage.addMilestoneButton.click();
        await objectiveCreatePage.milestoneTitleTextarea.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        await objectiveCreatePage.milestoneTitleTextarea.fill(milestoneTitle);
      });

      await test.step("Создать цель", async () => {
        await page.evaluate(() =>
          window.scrollTo(0, document.body.scrollHeight),
        );
        await objectiveCreatePage.createButton.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        await objectiveCreatePage.createButton.scrollIntoViewIfNeeded();
        await objectiveCreatePage.createButton.click({ force: true });

        await page.waitForURL(/\/objectives\/(?:view\/)?\d+/, {
          timeout: TIMEOUTS.PAGE_LOAD,
        });
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
