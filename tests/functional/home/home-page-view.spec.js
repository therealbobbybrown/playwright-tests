// tests/functional/home/home-page-view.spec.js
import { test, expect } from "../../fixtures/auth.js";
import { HomePage } from "../../../pages/HomePage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

test.describe(
  "Главная страница - Базовое отображение",
  { tag: ["@home", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.HOME, "Page View");
    });

    test(
      "C3662: Админ открывает главную через меню и видит каркас страницы",
      { tag: ["@smoke", "@critical"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("critical");
        const homePage = new HomePage(page, testInfo);

        await test.step("Открыть главную через боковое меню", async () => {
          await homePage.openFromMenu();
        });

        await test.step("Проверить заголовок и бейдж", async () => {
          await homePage.assertTitleAndBadge();
        });

        await test.step("Проверить блоки сайдбара", async () => {
          await homePage.assertSidebarBlocks();
        });
      },
    );

    test(
      "C3835: Главная страница загружается напрямую по URL",
      { tag: ["@critical"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("critical");
        const homePage = new HomePage(page, testInfo);

        await test.step("Перейти на главную по URL", async () => {
          await homePage.goto();
        });

        await test.step("Проверить заголовок и бейдж", async () => {
          await homePage.assertTitleAndBadge();
        });
      },
    );

    test(
      "C3836: Страница корректно обрабатывает сообщение о деплое",
      { tag: ["@regression"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("normal");
        const homePage = new HomePage(page, testInfo);

        await test.step("Открыть главную страницу", async () => {
          await homePage.goto();
        });

        await test.step("Проверить обработку build reload message", async () => {
          const reloaded = await homePage._handleBuildReloadMessage();
          // Тест проходит независимо от наличия deploy-оверлея —
          // важно что страница в любом случае остаётся рабочей
          if (reloaded) {
            await homePage.assertTitleAndBadge();
          }
          // Страница должна быть исправна после обработки (или изначально)
          await expect(homePage.titleHeading).toBeVisible();
        });
      },
    );
  },
);
