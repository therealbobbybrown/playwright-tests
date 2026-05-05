// tests/functional/development-plans/development-plan-empty-name-validation.spec.js
import { expect } from "@playwright/test";
import { test } from "../../fixtures/auth.js";
import { SideMenu } from "../../../pages/SideMenu.js";
import { MyTeamPage } from "../../../pages/MyTeamPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { TIMEOUTS } from "../../utils/constants.js";

test.describe(
  "Планы развития — негативные сценарии: валидация названия",
  { tag: ["@ui", "@negative", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.DEVELOPMENT);
    });

    test("C3545: Нельзя создать план развития с пустым названием", async ({
      adminAuth,
      page,
    }, testInfo) => {
      setSeverity("normal");
      const sideMenu = new SideMenu(page, testInfo);
      const myTeamPage = new MyTeamPage(page, testInfo);

      await test.step('Открыть "Моя команда" через боковое меню', async () => {
        await sideMenu.openMyTeam();
        await myTeamPage.assertOpened();
      });

      await test.step('Перейти на вкладку "Планы развития"', async () => {
        await myTeamPage.openDevelopmentPlansTab();
      });

      await test.step('Нажать "Создать план развития"', async () => {
        await myTeamPage.devPlansCreateButton.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        await myTeamPage.devPlansCreateButton.click();

        // Если есть шаблоны — появится popup с выбором типа плана
        // Если шаблонов нет — сразу откроется форма создания
        const newPlanOption = page
          .getByRole("button", { name: /новый.*план развития/i })
          .first();
        const popupVisible = await newPlanOption
          .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
          .then(() => true)
          .catch(() => false);

        if (popupVisible) {
          await newPlanOption.click();
        }
      });

      await test.step("Проверить, что нельзя сохранить план с пустым названием", async () => {
        // Ждём появления формы создания (может быть модалкой или страницей)
        await page
          .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
          .catch(() => {});

        // Ждём появления поля ввода цели плана (первое текстовое поле в форме)
        const goalInput = page
          .locator('textarea[placeholder*="Например"]')
          .or(page.getByPlaceholder(/Цель плана развития|Освоить основные/i))
          .first();

        await goalInput.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
        console.log("Форма создания плана открыта");

        // Находим кнопку создания
        const createButton = page
          .getByRole("button", { name: /^создать$/i })
          .first();
        await createButton.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });

        // Проверяем, заблокирована ли кнопка (по умолчанию должна быть заблокирована)
        const isDisabled = await createButton.isDisabled().catch(() => false);

        console.log(`Кнопка "Создать" заблокирована: ${isDisabled}`);

        // Кнопка должна быть заблокирована, пока не заполнены обязательные поля
        expect(isDisabled).toBe(true);
      });
    });
  },
);
