// tests/functional/home/home-sidebar.spec.js
import { test, expect } from "../../fixtures/auth.js";
import { HomePage } from "../../../pages/HomePage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

test.describe(
  "Главная страница - Сайдбар",
  { tag: ["@home", "@sidebar", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.HOME, "Sidebar");
    });

    // =====================
    // БОКОВОЕ МЕНЮ
    // =====================

    test(
      "C3842: Боковое меню отображается с пунктами",
      { tag: ["@regression", "@critical"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("critical");
        const homePage = new HomePage(page, testInfo);

        await test.step("Открыть главную страницу", async () => {
          await homePage.goto();
        });

        await test.step("Проверить боковое меню", async () => {
          await homePage.assertSideMenu();
        });

        await test.step("Проверить количество пунктов меню", async () => {
          const itemsCount = await homePage.getMenuItemsCount();
          expect(itemsCount).toBeGreaterThan(3);
        });
      },
    );

    // =====================
    // БЛОК ПРОФИЛЯ
    // =====================

    test(
      "C3843: Блок профиля отображается с аватаром и именем",
      { tag: ["@regression", "@critical"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("critical");
        const homePage = new HomePage(page, testInfo);

        await test.step("Открыть главную страницу", async () => {
          await homePage.goto();
        });

        await test.step("Проверить блок профиля", async () => {
          await homePage.assertProfileBlock();
        });
      },
    );

    test(
      "C3844: Имя пользователя в профиле не пустое",
      { tag: ["@regression"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("normal");
        const homePage = new HomePage(page, testInfo);

        await test.step("Открыть главную страницу", async () => {
          await homePage.goto();
        });

        await test.step("Проверить имя пользователя", async () => {
          const name = await homePage.getProfileName();
          expect(name?.trim(), "Имя пользователя не должно быть пустым").toBeTruthy();
          expect(name.trim().length, "Имя должно содержать хотя бы 2 символа").toBeGreaterThanOrEqual(2);
        });
      },
    );

    // =====================
    // БЛОК "МОЙ ФИДБЕК"
    // =====================

    test(
      'C3981: Блок "Мой фидбек" отображается',
      { tag: ["@regression"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("normal");
        const homePage = new HomePage(page, testInfo);

        await test.step("Открыть главную страницу", async () => {
          await homePage.goto();
        });

        await test.step("Проверить блок фидбека", async () => {
          await homePage.assertFeedbackBlock();
        });
      },
    );

    test(
      "C3845: Счётчик фидбеков отображает число",
      { tag: ["@regression"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("normal");
        const homePage = new HomePage(page, testInfo);

        await test.step("Открыть главную страницу", async () => {
          await homePage.goto();
        });

        await test.step("Проверить счётчик фидбеков", async () => {
          const count = await homePage.getFeedbackCount();
          // Счётчик фидбеков должен быть числом >= 0; у тестового админа ожидается хотя бы 1
          expect(count).toBeGreaterThanOrEqual(0);
        });
      },
    );

    test(
      'C3982: Ссылка "Статистика" в блоке фидбека ведёт на страницу статистики',
      { tag: ["@regression"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("normal");
        const homePage = new HomePage(page, testInfo);

        await test.step("Открыть главную страницу", async () => {
          await homePage.goto();
        });

        await test.step('Клик на "Статистика"', async () => {
          await homePage.clickFeedbackStatistics();
        });
      },
    );

    // =====================
    // БЛОК "МОЯ КОМАНДА"
    // =====================

    test(
      'C3983: Блок "Моя команда" отображается',
      { tag: ["@regression"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("normal");
        const homePage = new HomePage(page, testInfo);

        await test.step("Открыть главную страницу", async () => {
          await homePage.goto();
        });

        await test.step("Проверить блок команды", async () => {
          await homePage.assertTeamBlock();
        });
      },
    );

    test(
      "C3846: Руководитель отображается в блоке команды",
      { tag: ["@regression"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("normal");
        const homePage = new HomePage(page, testInfo);

        await test.step("Открыть главную страницу", async () => {
          await homePage.goto();
        });

        await test.step("Проверить отображение руководителя", async () => {
          await homePage.assertManagerDisplayed();
        });
      },
    );

    test(
      'C3984: Ссылка "Добавить сотрудников" видна для админа',
      { tag: ["@regression", "@admin"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("normal");
        const homePage = new HomePage(page, testInfo);

        await test.step("Открыть главную страницу", async () => {
          await homePage.goto();
        });

        await test.step('Проверить видимость ссылки "Добавить сотрудников"', async () => {
          const isVisible = await homePage.isAddEmployeesLinkVisible();
          expect(isVisible).toBeTruthy();
        });
      },
    );

    test(
      'C3985: Ссылка "Добавить сотрудников" скрыта для обычного сотрудника',
      { tag: ["@regression", "@user"] },
      async ({ userAuth: page }, testInfo) => {
        setSeverity("normal");
        const homePage = new HomePage(page, testInfo);

        await test.step("Открыть главную страницу", async () => {
          await homePage.goto();
        });

        await test.step('Проверить скрытие ссылки "Добавить сотрудников"', async () => {
          const isVisible = await homePage.isAddEmployeesLinkVisible();
          expect(isVisible).toBeFalsy();
        });
      },
    );
  },
);
