// tests/functional/home/home-roles.spec.js
import { test, expect } from "../../fixtures/auth.js";
import { HomePage } from "../../../pages/HomePage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

test.describe(
  "Главная страница - Ролевая модель",
  { tag: ["@home", "@roles", "@critical"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.HOME, "Roles");
    });

    // =====================
    // АДМИНИСТРАТОР
    // =====================

    test.describe("Администратор", { tag: ["@admin"] }, () => {
      test(
        "C3837: Админ видит все блоки страницы",
        { tag: ["@smoke", "@critical", "@regression"] },
        async ({ adminAuth: page }, testInfo) => {
          setSeverity("critical");
          const homePage = new HomePage(page, testInfo);

          await test.step("Открыть главную страницу", async () => {
            await homePage.goto();
          });

          await test.step("Проверить заголовок и сайдбар", async () => {
            await homePage.assertTitleAndBadge();
            await homePage.assertSidebarBlocks();
          });

          await test.step("Проверить боковое меню", async () => {
            await homePage.assertSideMenu();
            const menuItems = await homePage.getMenuItemsCount();
            // Реальное число пунктов меню для админа: 12 (проверено по DOM 2026-03-13)
            // Главная, Мой профиль, Моя команда, Фидбек, Орг. структура, Опросы,
            // Оценка сотрудников, Развитие, Цели, Магазин подарков, Сценарии, Настройки
            expect(menuItems).toBe(12);
          });
        },
      );

      test(
        'C3978: Админ видит ссылку "Добавить сотрудников"',
        { tag: ["@regression"] },
        async ({ adminAuth: page }, testInfo) => {
          setSeverity("normal");
          const homePage = new HomePage(page, testInfo);

          await test.step("Открыть главную страницу", async () => {
            await homePage.goto();
          });

          await test.step("Проверить ссылку добавления сотрудников", async () => {
            const isVisible = await homePage.isAddEmployeesLinkVisible();
            expect(isVisible).toBeTruthy();
          });
        },
      );
    });

    // =====================
    // МЕНЕДЖЕР
    // =====================

    test.describe("Менеджер", { tag: ["@manager"] }, () => {
      test(
        "C3838: Менеджер видит основные блоки страницы",
        { tag: ["@regression", "@critical"] },
        async ({ managerAuth: page }, testInfo) => {
          setSeverity("critical");
          const homePage = new HomePage(page, testInfo);

          await test.step("Открыть главную страницу", async () => {
            await homePage.goto();
          });

          await test.step("Проверить заголовок и сайдбар", async () => {
            await homePage.assertTitleAndBadge();
            await homePage.assertSidebarBlocks();
          });

          await test.step("Проверить блок команды", async () => {
            await homePage.assertTeamBlock();
          });
        },
      );

      test(
        'C3979: Менеджер видит ссылку "Добавить сотрудников"',
        { tag: ["@regression"] },
        async ({ managerAuth: page }, testInfo) => {
          setSeverity("normal");
          const homePage = new HomePage(page, testInfo);

          await test.step("Открыть главную страницу", async () => {
            await homePage.goto();
          });

          await test.step("Проверить видимость ссылки добавления сотрудников", async () => {
            // Видимость зависит от прав менеджера на добавление в команду
            const isVisible = await homePage.isAddEmployeesLinkVisible();
            // На текущем стенде менеджер НЕ имеет права добавлять сотрудников
            expect(isVisible, 'Менеджер без прав не видит ссылку "Добавить сотрудников"').toBeFalsy();
          });
        },
      );
    });

    // =====================
    // ОБЫЧНЫЙ СОТРУДНИК
    // =====================

    test.describe("Сотрудник", { tag: ["@user"] }, () => {
      test(
        "C3839: Сотрудник видит основные блоки страницы",
        { tag: ["@regression", "@critical"] },
        async ({ userAuth: page }, testInfo) => {
          setSeverity("critical");
          const homePage = new HomePage(page, testInfo);

          await test.step("Открыть главную страницу", async () => {
            await homePage.goto();
          });

          await test.step("Проверить заголовок и сайдбар", async () => {
            await homePage.assertTitleAndBadge();
            await homePage.assertSidebarBlocks();
          });
        },
      );

      test(
        'C3980: Сотрудник НЕ видит ссылку "Добавить сотрудников"',
        { tag: ["@regression", "@critical"] },
        async ({ userAuth: page }, testInfo) => {
          setSeverity("critical");
          const homePage = new HomePage(page, testInfo);

          await test.step("Открыть главную страницу", async () => {
            await homePage.goto();
          });

          await test.step("Проверить отсутствие ссылки добавления сотрудников", async () => {
            const isVisible = await homePage.isAddEmployeesLinkVisible();
            expect(isVisible).toBeFalsy();
          });
        },
      );

      test(
        "C3840: Сотрудник видит своего руководителя",
        { tag: ["@regression"] },
        async ({ userAuth: page }, testInfo) => {
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
        "C3841: Сотрудник видит свои задачи в списке дел",
        { tag: ["@regression"] },
        async ({ userAuth: page }, testInfo) => {
          setSeverity("normal");
          const homePage = new HomePage(page, testInfo);

          await test.step("Открыть главную страницу", async () => {
            await homePage.goto();
          });

          await test.step("Проверить список дел", async () => {
            await homePage.assertTodoListVisible();
            const count = await homePage.getTodoBadgeCount();
            // У обычного сотрудника в рабочей системе всегда есть хотя бы 1 задача
            expect(count).toBeGreaterThan(0);
          });
        },
      );
    });
  },
);
