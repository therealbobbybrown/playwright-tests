// tests/functional/objectives/objective-without-kr-validation.spec.js
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
  "Цели — негативные сценарии: без ключевых результатов",
  { tag: ["@ui", "@negative", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.OBJECTIVES);
    });

    test("C3630: Нельзя создать цель без ключевых результатов", async ({
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

      await test.step("Заполнить название цели без добавления KR", async () => {
        // Заполняем название цели
        await objectiveCreatePage.objectiveTitleTextarea.fill(
          "Тестовая цель без KR",
        );

        // НЕ добавляем ключевой результат
      });

      await test.step('Нажать "Создать" и проверить ошибку об отсутствии KR', async () => {
        await objectiveCreatePage.createButton.click();

        // При отсутствии KR приложение показывает inline-сообщение в блоке KR
        const noKrErrorLocator = page
          .getByText("Для создания цели необходимо создать хотя бы один КР")
          .first();

        await noKrErrorLocator.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });

        await expect(noKrErrorLocator).toBeVisible();

        // Убеждаемся что остались на странице создания (цель не была создана)
        await expect(objectiveCreatePage.titleSpan).toBeVisible();
      });
    });
  },
);
