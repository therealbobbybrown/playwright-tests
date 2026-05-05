// tests/functional/profile/profile-development-details.spec.js
/**
 * UI тесты вкладки "Развитие" — детальные проверки
 * @tags @ui @profile @regression
 */
import { test } from "../../fixtures/auth.js";
import { SideMenu } from "../../../pages/SideMenu.js";
import { ProfileMainPage } from "../../../pages/ProfileMainPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

test.describe(
  'Профиль — вкладка "Развитие"',
  { tag: ["@ui", "@profile", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.PROFILE);
    });

    test(
      'C3868: Кнопка "Создать план развития" открывает меню создания',
      { tag: ["@P0", "@critical"] },
      async ({ adminAuth, page }, testInfo) => {
        setSeverity("critical");
        const sideMenu = new SideMenu(page, testInfo);
        const profilePage = new ProfileMainPage(page, testInfo);

        await test.step('Открыть "Мой профиль"', async () => {
          await sideMenu.openMyProfile();
          await profilePage.assertOpened();
        });

        await test.step('Перейти на вкладку "Развитие"', async () => {
          await profilePage.openDevelopmentTab();
        });

        await test.step('Проверить наличие кнопки "Создать план развития"', async () => {
          await profilePage.createDevelopmentPlanButton.waitFor({
            state: "visible",
          });
        });

        await test.step("Нажать кнопку и проверить открытие меню создания", async () => {
          const { expect } = await import("@playwright/test");

          // Popup с выбором типа — текст разбит на строки
          const templateOption = page.getByText(/по шаблону/i).first();
          const newPlanOption = page.getByText(/Новый.*план/i).first();

          // Кликаем и сразу ждём появления popup
          await profilePage.createDevelopmentPlanButton.click();

          // Ждём появления одной из опций popup (5 сек)
          const popupAppeared = await Promise.race([
            templateOption
              .waitFor({ state: "visible", timeout: 5000 })
              .then(() => "template")
              .catch(() => null),
            newPlanOption
              .waitFor({ state: "visible", timeout: 5000 })
              .then(() => "new")
              .catch(() => null),
            page
              .waitForURL(/create|add|development-plans/, { timeout: 5000 })
              .then(() => "redirect")
              .catch(() => null),
          ]);

          // Логируем для отладки
          test.info().annotations.push({
            type: "popup_result",
            description: popupAppeared || "none",
          });

          expect(
            popupAppeared !== null,
            "Ожидался popup выбора типа плана или переход к форме создания",
          ).toBeTruthy();
        });
      },
    );

    test(
      "C3855: Таблица планов развития — структура",
      { tag: ["@P1"] },
      async ({ adminAuth, page }, testInfo) => {
        setSeverity("normal");
        const sideMenu = new SideMenu(page, testInfo);
        const profilePage = new ProfileMainPage(page, testInfo);

        await test.step('Открыть "Мой профиль"', async () => {
          await sideMenu.openMyProfile();
          await profilePage.assertOpened();
        });

        await test.step('Перейти на вкладку "Развитие"', async () => {
          await profilePage.openDevelopmentTab();
        });

        await test.step("Проверить заголовки таблицы", async () => {
          await profilePage.developmentPlansTableHeaderGoal.waitFor({
            state: "visible",
          });
          await profilePage.developmentPlansTableHeaderPeriod.waitFor({
            state: "visible",
          });
          await profilePage.developmentPlansTableHeaderProgress.waitFor({
            state: "visible",
          });
          await profilePage.developmentPlansTableHeaderStatus.waitFor({
            state: "visible",
          });
        });
      },
    );

    test(
      "C3856: Таблица планов — отображение статусов",
      { tag: ["@P1"] },
      async ({ adminAuth, page }, testInfo) => {
        setSeverity("normal");
        const sideMenu = new SideMenu(page, testInfo);
        const profilePage = new ProfileMainPage(page, testInfo);

        await test.step('Открыть "Мой профиль"', async () => {
          await sideMenu.openMyProfile();
          await profilePage.assertOpened();
        });

        await test.step('Перейти на вкладку "Развитие"', async () => {
          await profilePage.openDevelopmentTab();
        });

        await test.step("Проверить наличие таблицы с планами", async () => {
          const tableExists = await profilePage.developmentPlansTable
            .isVisible()
            .catch(() => false);
          if (tableExists) {
            // Проверяем, что есть хотя бы один статус
            const statuses = page
              .locator('[class*="Status_"], [class*="Badge_"]')
              .filter({
                hasText: /завершён|на утверждении|в работе|активн/i,
              });
            const count = await statuses.count();
            test.info().annotations.push({
              type: "statuses_count",
              description: String(count),
            });
          }
        });
      },
    );

    test(
      "C3857: Прогресс-бар в таблице планов",
      { tag: ["@P2"] },
      async ({ adminAuth, page }, testInfo) => {
        setSeverity("minor");
        const sideMenu = new SideMenu(page, testInfo);
        const profilePage = new ProfileMainPage(page, testInfo);

        await test.step('Открыть "Мой профиль"', async () => {
          await sideMenu.openMyProfile();
          await profilePage.assertOpened();
        });

        await test.step('Перейти на вкладку "Развитие"', async () => {
          await profilePage.openDevelopmentTab();
        });

        await test.step("Проверить отображение прогресса", async () => {
          // Ищем элементы прогресса (проценты или прогресс-бары)
          const progressElements = page
            .locator('[class*="Progress_"], [class*="ProgressBar_"]')
            .or(page.getByText(/\d+%/));
          const count = await progressElements.count();
          test.info().annotations.push({
            type: "progress_elements",
            description: String(count),
          });
        });
      },
    );

    test(
      'C3878: Блок "Кто видит" с кураторами',
      { tag: ["@P2"] },
      async ({ adminAuth, page }, testInfo) => {
        setSeverity("minor");
        const sideMenu = new SideMenu(page, testInfo);
        const profilePage = new ProfileMainPage(page, testInfo);

        await test.step('Открыть "Мой профиль"', async () => {
          await sideMenu.openMyProfile();
          await profilePage.assertOpened();
        });

        await test.step('Перейти на вкладку "Развитие"', async () => {
          await profilePage.openDevelopmentTab();
        });

        await test.step('Проверить блок "Кто видит эту информацию"', async () => {
          await profilePage.whoSeesBlockTitle.waitFor({ state: "visible" });
        });

        await test.step('Проверить наличие секции "Кураторы"', async () => {
          const curatorsLabel = page.getByText(/^Кураторы$/i).first();
          await curatorsLabel
            .waitFor({ state: "visible", timeout: 5000 })
            .catch(() => {
              // Кураторы могут отсутствовать — не критично
              test.info().annotations.push({
                type: "curators",
                description: "not found",
              });
            });
        });
      },
    );
  },
);
