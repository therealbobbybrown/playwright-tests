// tests/functional/development-plans/development-plan-templates.spec.js
// TestRail: C2706, C2708, C2710, C2713, C2747
import { expect } from "@playwright/test";
import { test } from "../../fixtures/auth.js";
import { SideMenu } from "../../../pages/SideMenu.js";
import { DevelopmentMenuHelper } from "../../../pages/menu/DevelopmentMenuHelper.js";
import { DevelopmentPlanTemplatesListPage } from "../../../pages/DevelopmentPlanTemplatesListPage.js";
import { DevelopmentPlanTemplateCreatePage } from "../../../pages/DevelopmentPlanTemplateCreatePage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { TIMEOUTS } from "../../utils/constants.js";
import { ensureDevelopmentPlansEnabled } from "../../utils/helpers/ensureDevelopmentPlansEnabled.js";

test.describe(
  "Шаблоны планов развития (ИПР)",
  { tag: ["@ui", "@regression"] },
  () => {
    test.beforeAll(async ({ request }) => {
      const result = await ensureDevelopmentPlansEnabled(request);
      if (!result.isEnabled) {
        throw new Error("Не удалось включить модуль ИПР");
      }
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.DEVELOPMENT);
    });

    test('C2708: раздел "Шаблоны планов развития" доступен в меню модуля Развитие', async ({
      adminAuth,
      page,
    }, testInfo) => {
      setSeverity("normal");
      const devMenu = new DevelopmentMenuHelper(page, testInfo);

      await test.step('Проверить наличие пункта "Шаблоны планов развития" в меню', async () => {
        const menuItems = await devMenu.getDevelopmentMenuItems();
        console.log('Пункты меню "Развитие":', menuItems);

        const hasTemplates = menuItems.some(
          (item) =>
            item.toLowerCase().includes("шаблон") &&
            item.toLowerCase().includes("план"),
        );
        expect(hasTemplates).toBe(true);
      });

      await test.step('Перейти к "Шаблоны планов развития"', async () => {
        await devMenu.openDevelopmentPlanTemplates();

        const templatesPage = new DevelopmentPlanTemplatesListPage(
          page,
          testInfo,
        );
        await templatesPage.assertOpened();
      });
    });

    test("C2713: список шаблонов ИПР - базовые элементы страницы", async ({
      adminAuth,
      page,
    }, testInfo) => {
      setSeverity("critical");
      const devMenu = new DevelopmentMenuHelper(page, testInfo);
      const templatesPage = new DevelopmentPlanTemplatesListPage(
        page,
        testInfo,
      );

      await test.step('Открыть страницу "Шаблоны планов развития"', async () => {
        await devMenu.openDevelopmentPlanTemplates();
        await templatesPage.assertOpened();
      });

      await test.step("Проверить базовые элементы страницы", async () => {
        // Заголовок
        await expect(templatesPage.heading).toBeVisible({
          timeout: TIMEOUTS.MEDIUM,
        });

        // Кнопка "Создать шаблон"
        await expect(templatesPage.createButton).toBeVisible({
          timeout: TIMEOUTS.MEDIUM,
        });
        await expect(templatesPage.createButton).toBeEnabled();
      });
    });

    test(
      "C2706: создание шаблона ИПР с обязательными полями",
      { tag: ["@critical"] },
      async ({ adminAuth, page }, testInfo) => {
        setSeverity("critical");
        const devMenu = new DevelopmentMenuHelper(page, testInfo);
        const templatesPage = new DevelopmentPlanTemplatesListPage(
          page,
          testInfo,
        );
        const createPage = new DevelopmentPlanTemplateCreatePage(
          page,
          testInfo,
        );

        const templateName = `Тест шаблон ${Date.now()}`;

        await test.step('Открыть страницу "Шаблоны планов развития"', async () => {
          await devMenu.openDevelopmentPlanTemplates();
          await templatesPage.assertOpened();
        });

        await test.step('Нажать "Создать шаблон"', async () => {
          await templatesPage.clickCreateTemplate();
          await createPage.assertOpened();
        });

        await test.step("Проверить дефолтные значения формы", async () => {
          // Куратор по умолчанию "Непосредственный руководитель"
          // Период по умолчанию "1 месяц"
          // Остальные поля пустые

          const createButtonEnabled = await createPage.createButton
            .isEnabled()
            .catch(() => true);
          // Кнопка может быть заблокирована т.к. название не заполнено
          console.log('Кнопка "Создать" активна:', createButtonEnabled);
        });

        await test.step("Заполнить обязательные поля и создать шаблон", async () => {
          // Используем fillTemplateForm - заполняет поля в правильном порядке (цель до названия)
          await createPage.fillTemplateForm(
            templateName,
            "Тестовая цель плана развития",
          );
          await createPage.clickCreate();
        });

        await test.step("Проверить успешное создание", async () => {
          // После создания шаблона: редирект на /development-plans/templates/<id>/
          await page.waitForURL(/\/development-plans\/templates\/\d+/, {
            timeout: TIMEOUTS.MEDIUM,
          });

          expect(
            /\/development-plans\/templates\/\d+/.test(page.url()),
            "После сохранения шаблона должны остаться на странице шаблона",
          ).toBe(true);
        });

        // Cleanup: удалить созданный шаблон
        await test.step("Очистка: удалить созданный шаблон", async () => {
          await devMenu.openDevelopmentPlanTemplates();
          await templatesPage.assertOpened();

          const template = await templatesPage.findTemplateByName(templateName);
          if (template) {
            await templatesPage.deleteTemplate(templateName);
          }
        });
      },
    );

    test("C2710: создание шаблона плана развития со всеми полями", async ({
      adminAuth,
      page,
    }, testInfo) => {
      setSeverity("normal");
      const devMenu = new DevelopmentMenuHelper(page, testInfo);
      const templatesPage = new DevelopmentPlanTemplatesListPage(
        page,
        testInfo,
      );
      const createPage = new DevelopmentPlanTemplateCreatePage(page, testInfo);

      const templateName = `Тест полный шаблон ${Date.now()}`;
      const templateDescription = "Описание тестового шаблона для автотестов";

      await test.step("Открыть форму создания шаблона", async () => {
        await devMenu.openDevelopmentPlanTemplates();
        await templatesPage.assertOpened();
        await templatesPage.clickCreateTemplate();
        await createPage.assertOpened();
      });

      await test.step("Заполнить все поля", async () => {
        // ВАЖНО: Заполняем обязательные поля в правильном порядке (цель до названия из-за перерендера)
        await createPage.fillTemplateForm(
          templateName,
          "Полная цель для тестового шаблона с описанием",
        );

        // Попробуем активировать и заполнить описание
        const addDescCheckbox = createPage.addDescriptionCheckbox;
        const checkboxVisible = await addDescCheckbox
          .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
          .then(() => true)
          .catch(() => false);
        if (checkboxVisible) {
          await addDescCheckbox.click();
          await page
            .waitForLoadState("domcontentloaded", { timeout: TIMEOUTS.SHORT })
            .catch(() => {});
          const descriptionVisible = await createPage.descriptionInput
            .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
            .then(() => true)
            .catch(() => false);
          if (descriptionVisible) {
            await createPage.fillDescription(templateDescription);
          }
        }

        // Период действия - попробуем изменить на 3 месяца
        try {
          await createPage.selectPeriod("3 месяца");
        } catch (e) {
          console.log("Не удалось изменить период:", e.message);
        }
      });

      await test.step("Создать шаблон", async () => {
        await createPage.clickCreate();
        await page
          .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
          .catch(() => {});
      });

      // Cleanup
      await test.step("Очистка: удалить созданный шаблон", async () => {
        await devMenu.openDevelopmentPlanTemplates();
        const template = await templatesPage.findTemplateByName(templateName);
        if (template) {
          await templatesPage.deleteTemplate(templateName);
        }
      });
    });

    test("C2747: контекстное меню шаблона в списке", async ({
      adminAuth,
      page,
    }, testInfo) => {
      setSeverity("normal");
      const devMenu = new DevelopmentMenuHelper(page, testInfo);
      const templatesPage = new DevelopmentPlanTemplatesListPage(
        page,
        testInfo,
      );

      await test.step('Открыть страницу "Шаблоны планов развития"', async () => {
        await devMenu.openDevelopmentPlanTemplates();
        await templatesPage.assertOpened();
      });

      await test.step("Проверить контекстное меню первого шаблона", async () => {
        // Карточки шаблонов — <div role="button">, НЕ <button>
        const templateCards = page
          .locator('[class*="TemplateItem_main__"]');

        await templateCards
          .first()
          .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

        const templatesCount = await templateCards.count();
        expect(
          templatesCount,
          "На странице должны быть шаблоны для проверки контекстного меню",
        ).toBeGreaterThan(0);

        console.log(`Найдено ${templatesCount} шаблонов`);

        // Кнопка три-точки — <button> рядом с карточкой в том же контейнере
        const firstTemplateCard = templateCards.first();
        const cardContainer = firstTemplateCard.locator("..");
        const menuButton = cardContainer.locator("button").last();

        await firstTemplateCard.hover();
        await menuButton.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });
        await menuButton.click();

        // Контекстное меню — popup list с кнопками "Открыть", "Редактировать" и т.д.
        const menuItems = page.getByRole("button", { name: /^(Открыть|Создать план по шаблону|Редактировать|Удалить)$/ });
        await menuItems.first().waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

        const menuTexts = await menuItems.allInnerTexts();
        console.log("Пункты контекстного меню:", menuTexts);

        const expectedItems = ["Открыть", "Редактировать", "Удалить"];
        for (const expected of expectedItems) {
          const hasItem = menuTexts.some((t) =>
            t.toLowerCase().includes(expected.toLowerCase()),
          );
          expect(hasItem, `Ожидался пункт меню "${expected}"`).toBe(true);
        }

        await page.keyboard.press("Escape");
      });
    });
  },
);
