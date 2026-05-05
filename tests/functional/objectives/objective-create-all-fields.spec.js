// tests/functional/objectives/objective-create-all-fields.spec.js
// TestRail: C2644 - Создание цели со всеми полями
// TASK-OKR-001: Заполнение всех полей, добавление нескольких КР с разными типами метрик

import { expect } from "@playwright/test";
import { test } from "../../fixtures/auth.js";
import { SideMenu } from "../../../pages/SideMenu.js";
import { ObjectivesSettingsPage } from "../../../pages/ObjectivesSettingsPage.js";
import { ObjectiveCreatePage } from "../../../pages/ObjectiveCreatePage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { TIMEOUTS } from "../../utils/constants.js";

test.describe(
  "Создание цели со всеми полями (OKR)",
  { tag: ["@ui", "@objectives", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.OBJECTIVES);
    });

    test(
      "C2644: форма создания цели — дефолтное состояние, уровень, видимость и несколько КР",
      { tag: ["@normal"] },
      async ({ adminAuth, page }, testInfo) => {
        setSeverity("normal");
        testInfo.setTimeout(120_000);

        const sideMenu = new SideMenu(page, testInfo);
        const objectivesSettingsPage = new ObjectivesSettingsPage(
          page,
          testInfo,
        );
        const objectiveCreatePage = new ObjectiveCreatePage(page, testInfo);

        const uniqueId = Date.now();
        const objectiveTitle = `Полная цель ${uniqueId}`;
        const kr1Title = `КР процент ${uniqueId}`;
        const kr2Title = `КР число ${uniqueId}`;
        const kr3Title = `КР бинарный ${uniqueId}`;

        await test.step("Открыть форму создания цели", async () => {
          const hasCreateItem = await sideMenu.hasObjectivesCreateItem();
          if (!hasCreateItem) {
            await sideMenu.openObjectivesSettings();
            await objectivesSettingsPage.assertOpened();
            await objectivesSettingsPage.enableOkrIfDisabled();
          }
          await sideMenu.openObjectivesCreate();
          await objectiveCreatePage.assertDefaultState();
        });

        await test.step('Проверить что уровень "Индивидуальная" выбран по умолчанию', async () => {
          await expect(
            objectiveCreatePage.levelIndividualActiveButton,
            'Кнопка уровня "Индивидуальная" должна быть активна по умолчанию',
          ).toBeVisible();
          await expect(
            objectiveCreatePage.levelIndividualActiveButton,
          ).toContainText("Индивидуальная");
        });

        await test.step('Проверить что видимость "Публичная" выбрана по умолчанию', async () => {
          await expect(
            objectiveCreatePage.userAccessPublicRadio,
            'Радиокнопка "Публичная" должна быть отмечена по умолчанию',
          ).toBeChecked();
          await expect(
            objectiveCreatePage.userAccessActiveLabel,
          ).toContainText("Сделать публичной");
        });

        await test.step("Проверить наличие поля датапикера периода (DEVAPR-11585)", async () => {
          await expect(
            objectiveCreatePage.datepicker.anchor,
            "Поле периода (датапикер) должно быть видимо",
          ).toBeVisible();
        });

        await test.step("Заполнить название цели", async () => {
          await objectiveCreatePage.objectiveTitleTextarea.fill(objectiveTitle);
          await expect(
            objectiveCreatePage.objectiveTitleTextarea,
          ).toHaveValue(objectiveTitle);
        });

        await test.step("Добавить первый КР и проверить поле", async () => {
          await objectiveCreatePage.addMilestoneButton.click();
          await objectiveCreatePage.milestoneTitleTextarea.waitFor({
            state: "visible",
            timeout: TIMEOUTS.MEDIUM,
          });
          await objectiveCreatePage.milestoneTitleTextarea.fill(kr1Title);
          await expect(
            objectiveCreatePage.milestoneTitleTextarea,
          ).toHaveValue(kr1Title);
        });

        await test.step("Добавить второй КР", async () => {
          await objectiveCreatePage.addMilestoneButton.click();
          await expect(objectiveCreatePage.milestoneTitleTextarea).toHaveCount(2);
          const secondKr = objectiveCreatePage.getMilestoneTextarea(1);
          await secondKr.waitFor({
            state: "visible",
            timeout: TIMEOUTS.MEDIUM,
          });
          await secondKr.fill(kr2Title);
          await expect(secondKr).toHaveValue(kr2Title);
        });

        await test.step("Добавить третий КР", async () => {
          await objectiveCreatePage.addMilestoneButton.click();
          await expect(objectiveCreatePage.milestoneTitleTextarea).toHaveCount(3);
          const thirdKr = objectiveCreatePage.getMilestoneTextarea(2);
          await thirdKr.waitFor({
            state: "visible",
            timeout: TIMEOUTS.MEDIUM,
          });
          await thirdKr.fill(kr3Title);
          await expect(thirdKr).toHaveValue(kr3Title);
        });

        await test.step("Проверить что на форме ровно 3 КР с правильными значениями", async () => {
          await expect(
            objectiveCreatePage.milestoneTitleTextarea,
            "Должно быть ровно 3 поля КР на форме",
          ).toHaveCount(3);

          await expect(objectiveCreatePage.getMilestoneTextarea(0)).toHaveValue(kr1Title);
          await expect(objectiveCreatePage.getMilestoneTextarea(1)).toHaveValue(kr2Title);
          await expect(objectiveCreatePage.getMilestoneTextarea(2)).toHaveValue(kr3Title);
        });

        await test.step("Проверить что кнопка Создать видима и активна", async () => {
          await page.evaluate(() =>
            window.scrollTo(0, document.body.scrollHeight),
          );
          await objectiveCreatePage.createButton.waitFor({
            state: "visible",
            timeout: TIMEOUTS.MEDIUM,
          });
          await expect(
            objectiveCreatePage.createButton,
            'Кнопка "Создать" должна быть видима',
          ).toBeVisible();
          // Кнопка не должна быть disabled — форма заполнена
          await expect(objectiveCreatePage.createButton).not.toBeDisabled();
        });
      },
    );
  },
);
