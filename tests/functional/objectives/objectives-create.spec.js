// tests/objective-create.spec.js
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

test.describe("Создание цели", { tag: ["@ui", "@regression"] }, () => {
  test.beforeEach(() => {
    markAsUITest(MODULES.OBJECTIVES);
  });

  test(
    "C3635: Админ создаёт цель с одним ключевым результатом",
    { tag: ["@critical"] },
    async ({ adminAuth, page }, testInfo) => {
      setSeverity("critical");
      const sideMenu = new SideMenu(page, testInfo);
      const objectivesSettingsPage = new ObjectivesSettingsPage(page, testInfo);
      const objectiveCreatePage = new ObjectiveCreatePage(page, testInfo);
      const objectiveDetailsPage = new ObjectiveDetailsPage(page, testInfo);

      await test.step('Открыть "Создать цель" через меню, включая OKR при необходимости', async () => {
        const hasCreateItem = await sideMenu.hasObjectivesCreateItem();

        if (!hasCreateItem) {
          await sideMenu.openObjectivesSettings();
          await objectivesSettingsPage.assertOpened();
          await objectivesSettingsPage.enableOkrIfDisabled();
        }

        await sideMenu.openObjectivesCreate();
      });

      await test.step('Проверить дефолтное состояние формы "Создать цель"', async () => {
        await objectiveCreatePage.assertDefaultState();
      });

      // Генерируем случайное число 1..100000
      const randomNumber = Math.floor(Math.random() * 100000) + 1;
      const objectiveTitle = `Цель ${randomNumber}`;
      const milestoneTitle = `Результат ${randomNumber}`;

      await test.step("Заполнить цель и ключевой результат и создать", async () => {
        await objectiveCreatePage.fillAndCreateObjective(
          objectiveTitle,
          milestoneTitle,
        );
      });

      await test.step('Проверить страницу "Детали цели" и совпадение названий', async () => {
        await objectiveDetailsPage.assertDetails(
          objectiveTitle,
          milestoneTitle,
        );
      });
    },
  );
});
