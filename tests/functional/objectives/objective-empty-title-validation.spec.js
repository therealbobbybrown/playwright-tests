// tests/functional/objectives/objective-empty-title-validation.spec.js
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
  "Цели — негативные сценарии: пустое название",
  { tag: ["@ui", "@negative", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.OBJECTIVES);
    });

    test("C3621: Нельзя создать цель с пустым названием", async ({
      adminAuth,
      page,
    }, testInfo) => {
      setSeverity("normal");
      const sideMenu = new SideMenu(page, testInfo);
      const objectivesSettingsPage = new ObjectivesSettingsPage(page, testInfo);
      const objectiveCreatePage = new ObjectiveCreatePage(page, testInfo);

      await test.step("Открыть страницу создания цели", async () => {
        const hasCreateItem = await sideMenu.hasObjectivesCreateItem();

        if (!hasCreateItem) {
          await sideMenu.openObjectivesSettings();
          await objectivesSettingsPage.assertOpened();
          await objectivesSettingsPage.enableOkrIfDisabled();
        }

        await sideMenu.openObjectivesCreate();
        await objectiveCreatePage.titleSpan.waitFor({
          state: "visible",
          timeout: TIMEOUTS.PAGE_LOAD,
        });
      });

      await test.step("Оставить название цели пустым и добавить KR", async () => {
        // Оставляем название цели пустым
        await objectiveCreatePage.objectiveTitleTextarea.fill("");

        // Добавляем ключевой результат
        await objectiveCreatePage.addMilestoneButton.click();
        await objectiveCreatePage.milestoneTitleTextarea.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        await objectiveCreatePage.milestoneTitleTextarea.fill(
          "Тестовый результат",
        );
      });

      await test.step('Нажать "Создать" и проверить ошибку валидации пустого названия', async () => {
        await objectiveCreatePage.createButton.click();

        // Ожидаем появления inline-ошибки с конкретным текстом
        const formErrorLocator = page
          .getByText("Название не должно быть пустым")
          .first();

        await formErrorLocator.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });

        await expect(formErrorLocator).toBeVisible();

        // Убеждаемся что остались на странице создания (цель не была создана)
        await expect(objectiveCreatePage.titleSpan).toBeVisible();
      });
    });
  },
);
