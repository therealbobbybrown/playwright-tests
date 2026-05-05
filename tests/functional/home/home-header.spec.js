// tests/functional/home/home-header.spec.js
import { test, expect } from "../../fixtures/auth.js";
import { HomePage } from "../../../pages/HomePage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

test.describe(
  "Главная страница - Header",
  { tag: ["@home", "@header", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.HOME, "Header");
    });

    test(
      "C3831: Header отображается с логотипом и аватаром",
      { tag: ["@regression", "@critical"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("critical");
        const homePage = new HomePage(page, testInfo);

        await test.step("Открыть главную страницу", async () => {
          await homePage.goto();
        });

        await test.step("Проверить header", async () => {
          await homePage.assertHeader();
        });
      },
    );

    test(
      "C3832: Счётчики валюты/баллов отображаются в header",
      { tag: ["@regression"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("normal");
        const homePage = new HomePage(page, testInfo);

        await test.step("Открыть главную страницу", async () => {
          await homePage.goto();
        });

        await test.step("Проверить счётчики в header", async () => {
          await homePage.assertHeaderCounters();
        });
      },
    );

    test(
      "C3833: Колокольчик уведомлений отображается",
      { tag: ["@regression"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("normal");
        const homePage = new HomePage(page, testInfo);

        await test.step("Открыть главную страницу", async () => {
          await homePage.goto();
        });

        await test.step("Проверить колокольчик уведомлений", async () => {
          await homePage.assertNotificationBell();
        });
      },
    );

    test(
      "C3834: Клик на логотип ведёт на главную",
      { tag: ["@regression"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("normal");
        const homePage = new HomePage(page, testInfo);

        await test.step("Открыть главную страницу", async () => {
          await homePage.goto();
        });

        await test.step("Проверить что логотип содержит ссылку на главную", async () => {
          // Логотип должен быть ссылкой на /ru/
          const logoHref = await homePage.headerLogo.getAttribute("href");
          expect(logoHref).toMatch(/\/ru\/?$/);
        });
      },
    );
  },
);
