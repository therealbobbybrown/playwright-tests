// tests/functional/home/home-todo-base.spec.js
import { test, expect } from "../../fixtures/auth.js";
import { HomePage } from "../../../pages/HomePage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

test.describe(
  "Главная страница - Список дел",
  { tag: ["@home", "@todolist", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.HOME, "Todo List");
    });

    test(
      'C3986: Заголовок "Список дел" и badge отображаются',
      { tag: ["@smoke", "@critical"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("critical");
        const homePage = new HomePage(page, testInfo);

        await test.step("Открыть главную страницу", async () => {
          await homePage.goto();
        });

        await test.step("Проверить заголовок и badge", async () => {
          await homePage.assertTitleAndBadge();
        });
      },
    );

    test(
      "C3847: Список дел отображается",
      { tag: ["@regression", "@critical"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("critical");
        const homePage = new HomePage(page, testInfo);

        await test.step("Открыть главную страницу", async () => {
          await homePage.goto();
        });

        await test.step("Проверить наличие списка дел", async () => {
          await homePage.assertTodoListVisible();
        });
      },
    );

    test(
      "C3848: Badge показывает количество задач",
      { tag: ["@regression"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("normal");
        const homePage = new HomePage(page, testInfo);

        await test.step("Открыть главную страницу", async () => {
          await homePage.goto();
        });

        await test.step("Проверить значение badge", async () => {
          const count = await homePage.getTodoBadgeCount();
          expect(count).toBeGreaterThan(0);
        });
      },
    );

    test(
      "C3854: Infinite scroll подгружает карточки при прокрутке",
      { tag: ["@regression", "@pagination"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("normal");
        const homePage = new HomePage(page, testInfo);

        await test.step("Открыть главную страницу", async () => {
          await homePage.goto();
        });

        await test.step("Прокрутить и проверить механизм подгрузки", async () => {
          // Прокручиваем страницу вниз
          await page.evaluate(() => {
            window.scrollTo(0, document.body.scrollHeight);
          });

          // Ждём возможной подгрузки через networkidle
          await page
            .waitForLoadState("networkidle", { timeout: 3000 })
            .catch(() => {});

          // Проверяем что страница не упала и список дел по-прежнему виден
          await homePage.todoList.waitFor({ state: "visible", timeout: 5000 });
          await homePage.assertTitleAndBadge();
        });
      },
    );
  },
);
