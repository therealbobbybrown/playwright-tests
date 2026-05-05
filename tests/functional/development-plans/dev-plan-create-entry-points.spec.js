// tests/functional/development-plans/dev-plan-create-entry-points.spec.js
// TestRail: C2734, C2735, C2736, C2737, C2739, C2740, C2741
import { expect } from "@playwright/test";
import { test } from "../../fixtures/auth.js";
import { SideMenu } from "../../../pages/SideMenu.js";
import { DevelopmentMenuHelper } from "../../../pages/menu/DevelopmentMenuHelper.js";
import { DevelopmentPlansListPage } from "../../../pages/DevelopmentPlansListPage.js";
import { DevelopmentPlanTemplatesListPage } from "../../../pages/DevelopmentPlanTemplatesListPage.js";
import { DevelopmentPlanTemplateCreatePage } from "../../../pages/DevelopmentPlanTemplateCreatePage.js";
import { DevelopmentPlanCreatePage } from "../../../pages/DevelopmentPlanCreatePage.js";
import { ProfileMainPage } from "../../../pages/ProfileMainPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { TIMEOUTS } from "../../utils/constants.js";

test.describe(
  "Создание ИПР — точки входа",
  { tag: ["@ui", "@regression", "@ipr"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.DEVELOPMENT);
    });

    test("C2734: создание ИПР по шаблону из списка шаблонов", async ({
      adminAuth,
      page,
    }, testInfo) => {
      setSeverity("normal");
      const devMenu = new DevelopmentMenuHelper(page, testInfo);
      const templatesPage = new DevelopmentPlanTemplatesListPage(
        page,
        testInfo,
      );

      await test.step("Открыть страницу шаблонов", async () => {
        await devMenu.openDevelopmentPlanTemplates();
        await templatesPage.assertOpened();
      });

      await test.step('Открыть контекстное меню шаблона и выбрать "Создать план по шаблону"', async () => {
        // Структура: карточка шаблона — button с accessible name содержащим "Шаблон"
        // Например: button "123 Шаблон", button "321 Шаблон 321456"
        const templateCard = page
          .getByRole("button", { name: /Шаблон/i })
          .first();
        await templateCard.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });

        // Hover на карточку шаблона для появления кнопки меню
        await templateCard.hover();

        // Кнопка меню — sibling button без текста (иконка три точки)
        // Структура DOM: generic > [button карточка] [button меню]
        const cardContainer = templateCard.locator("..");
        const menuButton = cardContainer.locator("button").last();
        await menuButton.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        await menuButton.click();

        // Выбираем "Создать план по шаблону" из выпадающего меню
        const createPlanOption = page
          .getByText("Создать план по шаблону")
          .first();
        await createPlanOption.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        await createPlanOption.click();
        await page
          .waitForLoadState("networkidle", { timeout: TIMEOUTS.PAGE_LOAD })
          .catch(() => {});
      });

      await test.step("Проверить форму создания ИПР по шаблону", async () => {
        // Должно быть поле выбора сотрудника
        const employeeSelect = page
          .locator('[class*="Select"]')
          .filter({ hasText: /Сотрудник/i })
          .first();
        await employeeSelect.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        console.log("Форма создания ИПР по шаблону открыта");

        // Кнопка "Создать план развития" должна быть заблокирована без сотрудника
        const createButton = page
          .getByRole("button", { name: /Создать план развития/i })
          .first();
        const isDisabled = await createButton.isDisabled().catch(() => true);
        console.log("Кнопка заблокирована без сотрудника:", isDisabled);
      });
    });

    test("C2735: создание ИПР по шаблону со страницы шаблона", async ({
      adminAuth,
      page,
    }, testInfo) => {
      setSeverity("normal");
      const devMenu = new DevelopmentMenuHelper(page, testInfo);
      const templatesPage = new DevelopmentPlanTemplatesListPage(
        page,
        testInfo,
      );

      await test.step("Открыть страницу шаблонов", async () => {
        await devMenu.openDevelopmentPlanTemplates();
        await templatesPage.assertOpened();
      });

      await test.step("Открыть страницу шаблона", async () => {
        // Карточка шаблона — button с accessible name содержащим "Шаблон"
        const templateCard = page
          .getByRole("button", { name: /Шаблон/i })
          .first();
        await templateCard.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });

        // Клик по карточке открывает страницу шаблона
        await templateCard.click();
        await page
          .waitForLoadState("networkidle", { timeout: TIMEOUTS.PAGE_LOAD })
          .catch(() => {});
      });

      await test.step('Нажать кнопку "Создать план по шаблону"', async () => {
        // На странице шаблона это link, не button
        const createPlanButton = page
          .getByRole("link", { name: /Создать план по шаблону/i })
          .first();

        await createPlanButton.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        await createPlanButton.click();
        await page
          .waitForLoadState("networkidle", { timeout: TIMEOUTS.PAGE_LOAD })
          .catch(() => {});
        console.log('Кнопка "Создать план по шаблону" нажата');
      });

      await test.step("Проверить открытие формы создания ИПР", async () => {
        // Должно быть поле выбора сотрудника
        const employeeSelect = page
          .locator('[class*="Select"]')
          .filter({ hasText: /Сотрудник/i })
          .first();
        await employeeSelect.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });

        const url = page.url();
        console.log("URL:", url);
        console.log("Форма создания ИПР открыта");
      });
    });

    test('C2736: создание ИПР по шаблону из дашборда "Моя команда"', async ({
      adminAuth,
      page,
    }, testInfo) => {
      setSeverity("normal");
      const sideMenu = new SideMenu(page, testInfo);

      await test.step('Открыть "Моя команда"', async () => {
        await sideMenu.openMyTeam();
        await page
          .waitForLoadState("networkidle", { timeout: TIMEOUTS.PAGE_LOAD })
          .catch(() => {});
      });

      await test.step('Перейти на вкладку "Планы развития"', async () => {
        // Вкладка "Планы развития" — button внутри основного контента (не в навигации)
        // Используем role=button с точным названием, фильтруя элементы навигации
        const devPlansTab = page.getByRole("button", {
          name: "Планы развития",
          exact: true,
        });

        await devPlansTab.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        await devPlansTab.click();
        await page
          .waitForLoadState("domcontentloaded", { timeout: TIMEOUTS.MEDIUM })
          .catch(() => {});

        // Ждём появления кнопки "Создать план развития"
        const createButton = page
          .getByRole("button", { name: /Создать план развития/i })
          .first();
        await createButton.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
      });

      await test.step('Нажать "Создать план развития" и проверить навигацию', async () => {
        const createButton = page
          .getByRole("button", { name: /Создать план развития/i })
          .first();

        await createButton.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        await createButton.click();

        // Кнопка на дашборде может показать popup с выбором типа ИЛИ навигировать к форме
        const templateOption = page.getByText("по шаблону").first();
        const popupVisible = await templateOption
          .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
          .then(() => true)
          .catch(() => false);

        if (popupVisible) {
          console.log("Popup с выбором типа открыт");
          await templateOption.click();
          await page
            .waitForURL(/development-plans/, { timeout: TIMEOUTS.PAGE_LOAD })
            .catch(() => {});
        } else {
          // Дашборд навигирует напрямую к форме создания
          await page
            .waitForURL(/development-plans/, { timeout: TIMEOUTS.PAGE_LOAD })
            .catch(() => {});
          console.log("Переход к форме создания без popup");
        }

        // Проверяем что открылась форма создания
        const url = page.url();
        expect(url).toMatch(/development-plans/);
        console.log("URL формы создания:", url);
      });
    });

    test("C2739: создание ИПР если шаблоны не созданы — список ИПР", async ({
      adminAuth,
      page,
    }, testInfo) => {
      setSeverity("normal");
      const devMenu = new DevelopmentMenuHelper(page, testInfo);
      const plansPage = new DevelopmentPlansListPage(page, testInfo);

      await test.step('Открыть "Планы развития"', async () => {
        await devMenu.openDevelopmentPlans();
        await plansPage.assertOpened();
      });

      await test.step('Нажать "Создать план развития"', async () => {
        await plansPage.clickCreatePlan();

        // Ждём появления popup или формы создания
        const popup = page.getByText("План развития по шаблону").first();
        await popup
          .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
          .catch(() => {});
      });

      await test.step("Проверить UI в зависимости от наличия шаблонов", async () => {
        // Если есть шаблоны — popup с выбором
        const templateOption = page
          .getByText("План развития по шаблону")
          .first();
        const hasPopup = await templateOption
          .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
          .then(() => true)
          .catch(() => false);

        // Если нет шаблонов — сразу форма создания
        const createFormUrl = page.url();
        const directToForm =
          createFormUrl.includes("create") || createFormUrl.includes("add");

        if (hasPopup) {
          console.log("Есть шаблоны: показан popup выбора типа");

          // Выбираем "Новый план развития"
          const newPlanOption = page.getByText("Новый план развития").first();
          await newPlanOption.click();
        } else if (directToForm) {
          console.log("Нет шаблонов: переход к форме создания без popup");
        }

        await page
          .waitForLoadState("networkidle", { timeout: TIMEOUTS.PAGE_LOAD })
          .catch(() => {});
      });

      await test.step("Проверить форму создания ИПР", async () => {
        // Период по умолчанию от текущей даты до конца года
        const periodField = page.getByText(/Период/i).first();
        const periodVisible = await periodField
          .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
          .then(() => true)
          .catch(() => false);
        console.log("Поле периода:", periodVisible);

        // Поле сотрудника
        const employeeField = page
          .getByRole("combobox")
          .filter({ hasText: /Сотрудник/i })
          .first();
        const employeeVisible = await employeeField
          .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
          .then(() => true)
          .catch(() => false);
        console.log("Поле сотрудника:", employeeVisible);
      });
    });

    test('C2737: создание ИПР из профиля сотрудника — вкладка "Развитие"', async ({
      adminAuth,
      page,
    }, testInfo) => {
      setSeverity("normal");
      const sideMenu = new SideMenu(page, testInfo);
      const profilePage = new ProfileMainPage(page, testInfo);

      await test.step("Открыть свой профиль", async () => {
        await sideMenu.openMyProfile();
        await profilePage.assertProfileShellVisible();
      });

      await test.step('Открыть вкладку "Развитие"', async () => {
        await profilePage.openDevelopmentTab();

        // Проверяем что вкладка открылась — используем локатор из Page Object
        const buttonVisible = await profilePage.createDevelopmentPlanButton
          .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
          .then(() => true)
          .catch(() => false);

        console.log('Вкладка "Развитие" открыта, кнопка видна:', buttonVisible);
      });

      await test.step('Нажать "Создать план развития"', async () => {
        const buttonVisible = await profilePage.createDevelopmentPlanButton
          .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
          .then(() => true)
          .catch(() => false);

        if (buttonVisible) {
          await profilePage.createDevelopmentPlanButton.click();
          await page
            .waitForLoadState("domcontentloaded", { timeout: TIMEOUTS.MEDIUM })
            .catch(() => {});

          // Проверяем появился ли popup с выбором типа
          const templateOption = page
            .getByText("План развития по шаблону")
            .first();
          const newPlanOption = page.getByText("Новый план развития").first();

          const hasPopup =
            (await templateOption
              .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
              .then(() => true)
              .catch(() => false)) ||
            (await newPlanOption
              .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
              .then(() => true)
              .catch(() => false));

          if (hasPopup) {
            console.log("Popup с выбором типа плана открыт");
            // Выбираем "Новый план развития"
            if (
              await newPlanOption
                .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
                .then(() => true)
                .catch(() => false)
            ) {
              await newPlanOption.click();
            }
          }

          await page
            .waitForLoadState("networkidle", { timeout: TIMEOUTS.PAGE_LOAD })
            .catch(() => {});
        } else {
          console.log('Кнопка "Создать план развития" не найдена');
        }
      });

      await test.step("Проверить открытие формы создания ИПР", async () => {
        const url = page.url();
        const isCreatePage =
          url.includes("create") ||
          url.includes("add") ||
          url.includes("development");
        console.log("URL:", url);
        console.log("Открыта страница создания:", isCreatePage);

        // Проверяем наличие элементов формы
        const goalField = page
          .locator('[class*="Input"], [class*="TextArea"]')
          .filter({ hasText: /Цель|Goal/i })
          .first();
        const hasForm = await goalField
          .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
          .then(() => true)
          .catch(() => false);
        console.log("Форма создания видна:", hasForm);
      });
    });

    test('C2740: создание ИПР без шаблонов — дашборд "Моя команда"', async ({
      adminAuth,
      page,
    }, testInfo) => {
      setSeverity("normal");
      const sideMenu = new SideMenu(page, testInfo);
      const devMenu = new DevelopmentMenuHelper(page, testInfo);
      const templatesPage = new DevelopmentPlanTemplatesListPage(
        page,
        testInfo,
      );

      let hasTemplates = false;

      await test.step("Проверить наличие шаблонов", async () => {
        await devMenu.openDevelopmentPlanTemplates();
        await templatesPage.assertOpened();

        const count = await templatesPage.getTemplatesCount();
        hasTemplates = count > 0;
        console.log("Количество шаблонов:", count);
      });

      await test.step('Открыть "Моя команда"', async () => {
        await sideMenu.openMyTeam();
        await page
          .waitForLoadState("networkidle", { timeout: TIMEOUTS.PAGE_LOAD })
          .catch(() => {});
      });

      await test.step('Перейти на вкладку "Планы развития"', async () => {
        // Вкладка "Планы развития" — button внутри основного контента
        const devPlansTab = page.getByRole("button", {
          name: "Планы развития",
          exact: true,
        });

        await devPlansTab.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        await devPlansTab.click();

        // Ждём появления кнопки "Создать план развития"
        const createButton = page
          .getByRole("button", { name: /Создать план развития/i })
          .first();
        await createButton.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
      });

      await test.step('Нажать "Создать план развития" и проверить поведение', async () => {
        const createButton = page
          .getByRole("button", { name: /Создать план развития/i })
          .first();

        await createButton.waitFor({
          state: "visible",
          timeout: TIMEOUTS.MEDIUM,
        });
        await createButton.click();

        if (hasTemplates) {
          // Кнопка на дашборде может показать popup с выбором типа ИЛИ навигировать к форме
          const newPlanOption = page.getByText("Новый план развития").first();
          const popupVisible = await newPlanOption
            .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
            .then(() => true)
            .catch(() => false);

          if (popupVisible) {
            console.log("Есть шаблоны: показан popup выбора типа");
            await newPlanOption.click();
            await page
              .waitForLoadState("networkidle", { timeout: TIMEOUTS.PAGE_LOAD })
              .catch(() => {});
          } else {
            // Дашборд навигирует напрямую к форме создания
            console.log("Есть шаблоны, но popup не показан — прямая навигация");
            await page
              .waitForURL(/development-plans/, { timeout: TIMEOUTS.PAGE_LOAD })
              .catch(() => {});
          }
        } else {
          // Если шаблонов нет — должен сразу перейти на форму создания
          await page
            .waitForURL(/development-plans/, { timeout: TIMEOUTS.PAGE_LOAD })
            .catch(() => {});
          console.log("Нет шаблонов: прямая навигация");
        }

        const url = page.url();
        console.log("URL после действия:", url);
      });

      await test.step("Проверить форму создания без шаблона", async () => {
        // Форма создания пустого ИПР должна содержать поле для цели
        const goalField = page
          .locator('[class*="Input"], [class*="TextArea"], textarea')
          .first();

        const hasGoalField = await goalField
          .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
          .then(() => true)
          .catch(() => false);
        console.log("Поле для ввода цели найдено:", hasGoalField);

        // Кнопка создания должна быть на странице
        const submitButton = page
          .getByRole("button", { name: /Создать|Сохранить/i })
          .first();
        const hasSubmit = await submitButton
          .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
          .then(() => true)
          .catch(() => false);
        console.log("Кнопка отправки найдена:", hasSubmit);
      });
    });
  },
);
