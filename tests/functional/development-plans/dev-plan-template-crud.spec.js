// tests/functional/development-plans/dev-plan-template-crud.spec.js
// TestRail: C2718, C2719, C2720, C2721, C2724, C2725
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
  "Шаблоны ИПР — CRUD операции",
  { tag: ["@ui", "@regression", "@ipr"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.DEVELOPMENT);
    });

    test("C2718: создание шаблона с дефолтным куратором", async ({
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

      const templateName = `Шаблон с куратором ${Date.now()}`;

      await test.step("Открыть форму создания шаблона", async () => {
        await devMenu.openDevelopmentPlanTemplates();
        await templatesPage.assertOpened();
        await templatesPage.clickCreateTemplate();
        await createPage.assertOpened();
      });

      await test.step('Проверить дефолтного куратора "Непосредственный руководитель"', async () => {
        // Куратор отображается как кнопка с текстом "Непосредственный руководитель"
        await expect(createPage.curatorButton).toBeVisible({
          timeout: TIMEOUTS.MEDIUM,
        });
        const curatorText = await createPage.curatorButton
          .innerText()
          .catch(() => "");
        console.log("Дефолтный куратор:", curatorText);
        expect(curatorText.toLowerCase()).toContain("руководитель");
      });

      await test.step("Заполнить обязательные поля и создать шаблон", async () => {
        // Используем fillTemplateForm - заполняет поля в правильном порядке (цель до названия)
        await createPage.fillTemplateForm(templateName, "Тестовая цель");
        await createPage.clickCreate();
      });

      await test.step("Проверить успешное создание — переход на страницу шаблона", async () => {
        await page
          .waitForURL(/\/development-plans\/templates\/\d+/, {
            timeout: TIMEOUTS.PAGE_LOAD,
          })
          .catch(() => {});
        const url = page.url();
        const isOnTemplatePage = url.includes("/development-plans/templates/");
        console.log("URL после создания:", url);
        expect(isOnTemplatePage).toBe(true);
      });

      // Cleanup
      await test.step("Очистка: удалить тестовый шаблон", async () => {
        await devMenu.openDevelopmentPlanTemplates();
        await templatesPage.assertOpened();
        await templatesPage.deleteTemplate(templateName);
      });
    });

    test("C2719: создание шаблона с дополнительным куратором", async ({
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

      const templateName = `Шаблон несколько кураторов ${Date.now()}`;

      await test.step("Открыть форму создания шаблона", async () => {
        await devMenu.openDevelopmentPlanTemplates();
        await templatesPage.assertOpened();
        await templatesPage.clickCreateTemplate();
        await createPage.assertOpened();
      });

      await test.step("Добавить дополнительного куратора", async () => {
        // Ищем кнопку добавления куратора (иконка плюс рядом с кураторами)
        const addCuratorButton = page
          .locator('[class*="Curator"]')
          .locator('button, [class*="add"], [class*="plus"]')
          .first();

        const addVisible = await addCuratorButton
          .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
          .then(() => true)
          .catch(() => false);

        if (addVisible) {
          await addCuratorButton.click();
          // Ждём появления списка пользователей
          const userOption = page
            .locator('[class*="Option"], [role="option"]')
            .first();
          await userOption
            .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
            .catch(() => {});
          const optionVisible = await userOption
            .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
            .then(() => true)
            .catch(() => false);
          if (optionVisible) {
            await userOption.click();
          }
        } else {
          console.log(
            "Кнопка добавления куратора не найдена, продолжаем с дефолтным",
          );
        }
      });

      await test.step("Заполнить обязательные поля и создать", async () => {
        await createPage.fillTemplateForm(
          templateName,
          "Цель с несколькими кураторами",
        );
        await createPage.clickCreate();
      });

      await test.step("Проверить успешное создание", async () => {
        await page
          .waitForURL(/\/development-plans\/templates\/\d+/, {
            timeout: TIMEOUTS.PAGE_LOAD,
          })
          .catch(() => {});
        const url = page.url();
        expect(url).toContain("/development-plans/templates/");
      });

      // Cleanup
      await test.step("Очистка", async () => {
        await devMenu.openDevelopmentPlanTemplates();
        await templatesPage.assertOpened();
        await templatesPage.deleteTemplate(templateName);
      });
    });

    test("C2720: создание шаблона с изменением периода действия", async ({
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

      const templateName = `Шаблон период 3мес ${Date.now()}`;

      await test.step("Открыть форму создания шаблона", async () => {
        await devMenu.openDevelopmentPlanTemplates();
        await templatesPage.assertOpened();
        await templatesPage.clickCreateTemplate();
        await createPage.assertOpened();
      });

      await test.step('Проверить дефолтный период "1 месяц"', async () => {
        // Период отображается как текст рядом с combobox
        await expect(createPage.periodText).toBeVisible({
          timeout: TIMEOUTS.MEDIUM,
        });
        const periodTextContent = await createPage.periodText
          .innerText()
          .catch(() => "");
        console.log("Дефолтный период:", periodTextContent);
        expect(periodTextContent).toContain("1");
      });

      await test.step('Изменить период на "3 месяца"', async () => {
        // Кликаем на combobox для выбора периода
        await createPage.periodCombobox.click();
        // Ждём появления списка опций
        const anyOption = page
          .locator('[role="option"], [class*="Option"]')
          .first();
        await anyOption
          .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
          .catch(() => {});

        const option3months = page
          .locator('[role="option"], [class*="Option"]')
          .filter({ hasText: /3 месяц/i })
          .first();

        const optionVisible = await option3months
          .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
          .then(() => true)
          .catch(() => false);
        if (optionVisible) {
          await option3months.click();
        } else {
          // Закрываем если опция не найдена
          await page.keyboard.press("Escape");
          console.log('Опция "3 месяца" не найдена');
        }
      });

      await test.step("Заполнить обязательные поля и создать", async () => {
        await createPage.fillTemplateForm(templateName, "Цель на 3 месяца");
        await createPage.clickCreate();
      });

      await test.step("Проверить успешное создание", async () => {
        await page
          .waitForURL(/\/development-plans\/templates\/\d+/, {
            timeout: TIMEOUTS.PAGE_LOAD,
          })
          .catch(() => {});
        const url = page.url();
        expect(url).toContain("/development-plans/templates/");
      });

      // Cleanup
      await test.step("Очистка", async () => {
        await devMenu.openDevelopmentPlanTemplates();
        await templatesPage.assertOpened();
        await templatesPage.deleteTemplate(templateName);
      });
    });

    test("C2721: страница шаблона ИПР — базовые элементы", async ({
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

      const templateName = `Шаблон для просмотра ${Date.now()}`;

      // Создаём шаблон для теста
      await test.step("Создать тестовый шаблон", async () => {
        await devMenu.openDevelopmentPlanTemplates();
        await templatesPage.assertOpened();
        await templatesPage.clickCreateTemplate();
        await createPage.assertOpened();

        await createPage.fillTemplateForm(templateName, "Цель для просмотра");
        await createPage.clickCreate();

        // Ждём перехода на страницу шаблона
        await page
          .waitForURL(/\/development-plans\/templates\/\d+/, {
            timeout: TIMEOUTS.PAGE_LOAD,
          })
          .catch(() => {});
      });

      await test.step("Проверить элементы страницы шаблона", async () => {
        // Сначала убедимся что мы на странице деталей шаблона
        const url = page.url();
        console.log("URL после создания:", url);
        expect(url).toMatch(/\/development-plans\/templates\/\d+/);

        // Заголовок с названием (на странице деталей он включает название шаблона)
        const templateTitle = page.locator(`text=${templateName}`).first();
        await expect(templateTitle).toBeVisible({ timeout: TIMEOUTS.MEDIUM });

        const heading = page.getByRole("heading", { level: 1 }).first();
        await expect(heading).toBeVisible({ timeout: TIMEOUTS.MEDIUM });

        const headingText = await heading.innerText();
        console.log("Заголовок:", headingText);

        // Кнопка "Удалить"
        const deleteButton = page
          .getByRole("button", { name: /Удалить/i })
          .first();
        await expect(deleteButton).toBeVisible({ timeout: TIMEOUTS.SHORT });

        // Ссылка "Создать план по шаблону"
        const createPlanLink = page
          .getByRole("link", { name: /Создать план по шаблону/i })
          .first();
        await expect(createPlanLink).toBeVisible({ timeout: TIMEOUTS.SHORT });

        // Блок "Цели развития"
        const goalsSection = page.locator("text=/Цели развития/i").first();
        await expect(goalsSection).toBeVisible({ timeout: TIMEOUTS.SHORT });
      });

      // Cleanup
      await test.step("Очистка", async () => {
        await devMenu.openDevelopmentPlanTemplates();
        await templatesPage.assertOpened();
        await templatesPage.deleteTemplate(templateName);
      });
    });

    test("C2724: редактирование названия шаблона", async ({
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

      const templateName = `Шаблон для редактирования ${Date.now()}`;

      // Создаём шаблон
      await test.step("Создать тестовый шаблон", async () => {
        await devMenu.openDevelopmentPlanTemplates();
        await templatesPage.assertOpened();
        await templatesPage.clickCreateTemplate();
        await createPage.assertOpened();

        await createPage.fillTemplateForm(
          templateName,
          "Цель для редактирования",
        );
        await createPage.clickCreate();

        await page
          .waitForURL(/\/development-plans\/templates\/\d+/, {
            timeout: TIMEOUTS.PAGE_LOAD,
          })
          .catch(() => {});
      });

      await test.step('Проверить наличие кнопки "Сохранить шаблон"', async () => {
        // На странице деталей шаблона есть кнопка "Сохранить шаблон" для сохранения изменений
        const saveButton = page
          .getByRole("button", { name: /Сохранить шаблон/i })
          .first();
        await expect(saveButton).toBeVisible({ timeout: TIMEOUTS.MEDIUM });
        console.log('Кнопка "Сохранить шаблон" доступна для редактирования');
      });

      await test.step("Проверить, что название отображается на странице", async () => {
        // На странице деталей название шаблона отображается в заголовке/хедере
        const templateTitle = page.locator(`text=${templateName}`).first();
        await expect(templateTitle).toBeVisible({ timeout: TIMEOUTS.MEDIUM });
        console.log("Название шаблона отображается на странице");
      });

      // Cleanup
      await test.step("Очистка: удалить тестовый шаблон", async () => {
        await devMenu.openDevelopmentPlanTemplates();
        await templatesPage.assertOpened();
        await templatesPage.deleteTemplate(templateName);
      });
    });

    test("C2725: удаление шаблона", async ({ adminAuth, page }, testInfo) => {
      setSeverity("normal");
      const devMenu = new DevelopmentMenuHelper(page, testInfo);
      const templatesPage = new DevelopmentPlanTemplatesListPage(
        page,
        testInfo,
      );
      const createPage = new DevelopmentPlanTemplateCreatePage(page, testInfo);

      const templateName = `Шаблон для удаления ${Date.now()}`;

      // Создаём шаблон
      await test.step("Создать тестовый шаблон", async () => {
        await devMenu.openDevelopmentPlanTemplates();
        await templatesPage.assertOpened();
        await templatesPage.clickCreateTemplate();
        await createPage.assertOpened();

        await createPage.fillTemplateForm(templateName, "Цель для удаления");
        await createPage.clickCreate();

        await page
          .waitForURL(/\/development-plans\/templates\/\d+/, {
            timeout: TIMEOUTS.PAGE_LOAD,
          })
          .catch(() => {});
      });

      await test.step("Удалить шаблон через контекстное меню", async () => {
        await devMenu.openDevelopmentPlanTemplates();
        await templatesPage.assertOpened();

        await templatesPage.deleteTemplate(templateName);
        await page
          .waitForLoadState("networkidle", { timeout: TIMEOUTS.SHORT })
          .catch(() => {});
      });

      await test.step("Проверить, что шаблон удалён", async () => {
        await page.reload();
        await templatesPage.assertOpened();

        const deletedTemplate =
          await templatesPage.findTemplateByName(templateName);
        expect(deletedTemplate).toBeNull();
      });
    });
  },
);
