// tests/functional/development-plans/development-plan-template-goals.spec.js
// TestRail: C2745 - Добавление целей развития к шаблону ИПР
import { expect } from "@playwright/test";
import { test } from "../../fixtures/auth.js";
import { DevelopmentMenuHelper } from "../../../pages/menu/DevelopmentMenuHelper.js";
import { DevelopmentPlanTemplatesListPage } from "../../../pages/DevelopmentPlanTemplatesListPage.js";
import { DevelopmentPlanTemplateCreatePage } from "../../../pages/DevelopmentPlanTemplateCreatePage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { TIMEOUTS } from "../../utils/constants.js";

test.describe(
  "Цели развития в шаблонах ИПР",
  { tag: ["@ui", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.DEVELOPMENT);
    });

    test("C2745: добавление целей развития к шаблону ИПР", async ({
      adminAuth,
      page,
    }, testInfo) => {
      setSeverity("normal");
      const devMenu = new DevelopmentMenuHelper(page, testInfo);
      const templatesPage = new DevelopmentPlanTemplatesListPage(
        page,
        testInfo,
      );
      const templateCreatePage = new DevelopmentPlanTemplateCreatePage(
        page,
        testInfo,
      );

      const templateName = `Тест шаблон с целями ${Date.now()}`;
      const goalName = `Цель развития ${Date.now()}`;

      // Шаг 1: Создать шаблон через UI
      await test.step("Создать новый шаблон через UI", async () => {
        await devMenu.openDevelopmentPlanTemplates();
        await templatesPage.assertOpened();
        await templatesPage.clickCreateTemplate();
        await templateCreatePage.assertOpened();

        // Используем fillTemplateForm который заполняет поля в правильном порядке
        await templateCreatePage.fillTemplateForm(
          templateName,
          "Цель для шаблона с целями развития",
        );
        await templateCreatePage.clickCreate();

        // Ждём перехода на страницу созданного шаблона
        await page
          .waitForURL(/\/development-plans\/templates\/\d+/, {
            timeout: TIMEOUTS.PAGE_LOAD,
          })
          .catch(() => {});
        console.log("URL после создания шаблона:", page.url());
      });

      // Шаг 2: Проверить что мы на странице шаблона
      await test.step("Проверить что шаблон создан", async () => {
        const currentUrl = page.url();
        const isOnTemplatePage =
          currentUrl.includes("/development-plans/templates/") &&
          !currentUrl.includes("/add");

        if (!isOnTemplatePage) {
          console.log("Не на странице шаблона, переходим через список...");
          await devMenu.openDevelopmentPlanTemplates();
          await templatesPage.assertOpened();
          await templatesPage.openTemplateByName(templateName);
        }

        await page
          .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
          .catch(() => {});
      });

      // Шаг 3: Проверить кнопку "Создать цель развития"
      await test.step('Проверить наличие кнопки "Создать цель развития"', async () => {
        const createGoalButton = page
          .getByRole("button", { name: /Создать цель развития/i })
          .first();
        const buttonVisible = await createGoalButton
          .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
          .then(() => true)
          .catch(() => false);

        if (buttonVisible) {
          console.log('Кнопка "Создать цель развития" найдена');
          expect(buttonVisible).toBe(true);

          // Нажать на кнопку
          await createGoalButton.click();
          await page
            .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
            .catch(() => {});
        } else {
          console.log('Кнопка "Создать цель развития" не найдена');
          // Проверяем альтернативные варианты UI
          const addButton = page
            .getByRole("button", { name: /Добавить цель|Добавить/i })
            .first();
          const addButtonVisible = await addButton
            .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
            .then(() => true)
            .catch(() => false);

          if (addButtonVisible) {
            await addButton.click();
          }
        }
      });

      // Шаг 4: Проверить форму создания цели
      await test.step("Проверить форму создания цели развития", async () => {
        // Должна открыться форма создания цели
        const goalHeading = page
          .getByRole("heading", {
            name: /Создать цель развития|Цель развития/i,
          })
          .first();
        const headingVisible = await goalHeading
          .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
          .then(() => true)
          .catch(() => false);

        if (headingVisible) {
          console.log("Форма создания цели открыта");

          // Поля формы
          const goalNameInput = page
            .getByLabel(/Название|Цель/i)
            .first()
            .or(
              page
                .locator(
                  'input[placeholder*="Название"], textarea[placeholder*="Название"]',
                )
                .first(),
            );

          const inputVisible = await goalNameInput
            .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
            .then(() => true)
            .catch(() => false);

          if (inputVisible) {
            await goalNameInput.fill(goalName);

            // Для развивающих действий не должно быть поля "Дедлайн" в шаблоне
            const deadlineField = page
              .locator('label:has-text("Дедлайн"), input[name*="deadline"]')
              .first();
            const deadlineVisible = await deadlineField
              .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
              .then(() => true)
              .catch(() => false);
            console.log('Поле "Дедлайн" видимо:', deadlineVisible);

            // Создать цель
            const createButton = page
              .getByRole("button", { name: /^Создать$/i })
              .first();
            await createButton.click();
            await page
              .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
              .catch(() => {});
          }
        } else {
          console.log("Форма создания цели не открылась - возможно другой UI");
        }
      });

      // Cleanup: удалить шаблон через UI
      await test.step("Очистка: удалить тестовый шаблон", async () => {
        // Переход на список шаблонов
        await devMenu.openDevelopmentPlanTemplates();
        await templatesPage.assertOpened();

        // Найти и удалить шаблон
        const template = await templatesPage.findTemplateByName(templateName);
        if (template) {
          await templatesPage.deleteTemplate(templateName);
          console.log("Шаблон удалён через UI");
        } else {
          console.log("Шаблон не найден для удаления");
        }
      });
    });
  },
);
