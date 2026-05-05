// tests/functional/objectives/objective-empty-kr-validation.spec.js
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
  "Цели — негативные сценарии: пустой ключевой результат",
  { tag: ["@ui", "@negative", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.OBJECTIVES);
    });

    test("C3620: Нельзя создать цель с пустым ключевым результатом", async ({
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

      await test.step("Заполнить название цели и добавить пустой KR", async () => {
        // Заполняем название цели
        await objectiveCreatePage.objectiveTitleTextarea.fill("Тестовая цель");

        // Добавляем ключевой результат, но оставляем его пустым
        await objectiveCreatePage.addMilestoneButton.click();
        await objectiveCreatePage.milestoneTitleTextarea.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        await objectiveCreatePage.milestoneTitleTextarea.fill("");
      });

      await test.step('Нажать "Создать" и проверить ошибку валидации пустого KR', async () => {
        await objectiveCreatePage.createButton.click();

        // При пустом KR приложение показывает inline-ошибку под полем KR
        // и toast "Ошибка при сохранении"
        const krErrorLocator = page
          .getByText("Название не должно быть пустым")
          .first();

        await krErrorLocator.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });

        await expect(krErrorLocator).toBeVisible();

        // Убеждаемся что остались на странице создания (цель не была создана)
        await expect(objectiveCreatePage.titleSpan).toBeVisible();
      });
    });
  },
);
