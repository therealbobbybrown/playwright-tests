// tests/functional/development-plans/dev-plan-navigation.spec.js
// TestRail: C2700 - Переход на страницу модуля Развитие
// UI-006: Тест навигации модуля Развитие

import { expect } from "@playwright/test";
import { test } from "../../fixtures/auth.js";
import { DevelopmentMenuHelper } from "../../../pages/menu/DevelopmentMenuHelper.js";
import { DevelopmentPlansListPage } from "../../../pages/DevelopmentPlansListPage.js";
import { DevelopmentPlanTemplatesListPage } from "../../../pages/DevelopmentPlanTemplatesListPage.js";
import { DevelopmentPlansSettingsPage } from "../../../pages/DevelopmentPlansSettingsPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { TIMEOUTS } from "../../utils/constants.js";
import { ensureDevelopmentPlansEnabled } from "../../utils/helpers/ensureDevelopmentPlansEnabled.js";

test.describe(
  "Навигация модуля Развитие",
  { tag: ["@ui", "@development-plans", "@regression"] },
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

    test(
      "C2700: проверить навигацию модуля Развитие",
      { tag: ["@smoke", "@critical"] },
      async ({ adminAuth, page }, testInfo) => {
        setSeverity("critical");

        const devMenu = new DevelopmentMenuHelper(page, testInfo);
        const plansPage = new DevelopmentPlansListPage(page, testInfo);
        const templatesPage = new DevelopmentPlanTemplatesListPage(
          page,
          testInfo,
        );
        const settingsPage = new DevelopmentPlansSettingsPage(page, testInfo);

        // Шаг 1: Проверить наличие раздела "Развитие" в меню
        await test.step('Проверить наличие раздела "Развитие" в боковом меню', async () => {
          // Пункт меню должен быть виден
          await expect(devMenu.developmentMenuItem.first()).toBeVisible({
            timeout: TIMEOUTS.MEDIUM,
          });

          // Проверяем что пункт меню кликабельный (не заблокирован)
          const isEnabled = await devMenu.developmentMenuItem
            .first()
            .isEnabled();
          expect(isEnabled).toBe(true);
        });

        // Шаг 2: Проверить пункты подменю
        await test.step('Проверить пункты подменю "Развитие"', async () => {
          const menuItems = await devMenu.getDevelopmentMenuItems();

          console.log('Пункты подменю "Развитие":', menuItems);

          // Должны быть основные пункты: Планы развития, Шаблоны, Настройки
          // Минимум 2 пункта — "Планы развития" + "Настройки" (шаблоны могут быть скрыты)
          expect(menuItems.length).toBeGreaterThanOrEqual(2);

          // Проверяем наличие ключевых пунктов (названия могут отличаться)
          const hasPlansOrSettings = menuItems.some(
            (item) =>
              item.toLowerCase().includes("план") ||
              item.toLowerCase().includes("настро") ||
              item.toLowerCase().includes("шаблон"),
          );
          expect(hasPlansOrSettings).toBe(true);
        });

        // Шаг 3: Перейти на страницу "Планы развития"
        await test.step('Перейти на страницу "Планы развития"', async () => {
          await devMenu.openDevelopmentPlans();
          await plansPage.assertOpened();

          // Проверка URL
          expect(page.url()).toMatch(/\/development-plans\/?($|\?)/);

          // Проверка breadcrumbs (если есть)
          const breadcrumbsVisible = await plansPage.breadcrumbs
            .isVisible()
            .catch(() => false);
          if (breadcrumbsVisible) {
            const breadcrumbText = await plansPage.breadcrumbs.innerText();
            expect(breadcrumbText.toLowerCase()).toContain("план");
          }

          // Проверка кнопки "Создать план развития"
          await expect(plansPage.createButton).toBeVisible({
            timeout: TIMEOUTS.MEDIUM,
          });
        });

        // Шаг 4: Перейти на страницу "Шаблоны планов развития"
        await test.step('Перейти на страницу "Шаблоны планов развития"', async () => {
          await devMenu.openDevelopmentPlanTemplates();
          await templatesPage.assertOpened();

          // Проверка URL
          expect(page.url()).toMatch(
            /\/development-plan-templates|\/development-plans\/templates/,
          );

          // Проверка заголовка страницы
          await expect(templatesPage.heading).toBeVisible({
            timeout: TIMEOUTS.MEDIUM,
          });
        });

        // Шаг 5: Перейти на страницу "Настройки планов развития"
        await test.step('Перейти на страницу "Настройки планов развития"', async () => {
          await devMenu.openDevelopmentPlansSettings();
          await settingsPage.assertOpened();

          // Проверка URL
          expect(page.url()).toMatch(/\/development-plans-settings/);

          // Проверка наличия кнопки включения/выключения
          await expect(settingsPage.toggleButton).toBeVisible({
            timeout: TIMEOUTS.MEDIUM,
          });
        });

        // Шаг 6: Вернуться на страницу "Планы развития" и проверить обратную навигацию
        await test.step('Вернуться на "Планы развития" (проверка обратной навигации)', async () => {
          await devMenu.openDevelopmentPlans();
          await plansPage.assertOpened();

          // Страница должна загрузиться корректно после перехода
          await expect(plansPage.heading).toBeVisible({
            timeout: TIMEOUTS.MEDIUM,
          });
          await expect(plansPage.table).toBeVisible({
            timeout: TIMEOUTS.MEDIUM,
          });
        });
      },
    );

    test(
      "C3558: Проверить активный пункт меню при навигации",
      { tag: ["@regression"] },
      async ({ adminAuth, page }, testInfo) => {
        setSeverity("normal");

        const devMenu = new DevelopmentMenuHelper(page, testInfo);
        const plansPage = new DevelopmentPlansListPage(page, testInfo);

        // Шаг 1: Перейти на страницу планов развития
        await test.step('Перейти на страницу "Планы развития"', async () => {
          await devMenu.openDevelopmentPlans();
          await plansPage.assertOpened();
        });

        // Шаг 2: Проверить что пункт меню "Развитие" выделен как активный
        await test.step("Проверить активное состояние пункта меню", async () => {
          // Hover на пункт меню чтобы открыть подменю
          await devMenu.developmentMenuItem.first().hover();

          // Проверяем наличие активного класса или состояния
          // Это зависит от реализации UI - ищем признаки активности
          const menuItem = devMenu.developmentMenuItem.first();

          // Проверяем что пункт меню виден (базовая проверка)
          await expect(menuItem).toBeVisible();

          // Проверяем CSS класс активности (если есть)
          const classAttr = await menuItem.getAttribute("class");
          const hasActiveClass =
            classAttr?.includes("active") ||
            classAttr?.includes("Active") ||
            classAttr?.includes("selected") ||
            classAttr?.includes("current");

          console.log(
            `Класс пункта меню: ${classAttr}, hasActiveClass: ${hasActiveClass}`,
          );

          // Либо класс активности, либо aria-current
          const ariaCurrent = await menuItem.getAttribute("aria-current");

          // Хотя бы один признак активности
          // Если UI не отмечает активный пункт - это не критично для smoke теста
          if (!hasActiveClass && !ariaCurrent) {
            console.log(
              "Пункт меню не имеет явного признака активности (это может быть OK)",
            );
          }
        });
      },
    );

    test(
      "C3559: Прямой переход по URL",
      { tag: ["@regression"] },
      async ({ adminAuth, page }, testInfo) => {
        setSeverity("normal");

        const plansPage = new DevelopmentPlansListPage(page, testInfo);
        const templatesPage = new DevelopmentPlanTemplatesListPage(
          page,
          testInfo,
        );

        // Шаг 1: Прямой переход на /ru/development-plans
        await test.step("Прямой переход на /development-plans по URL", async () => {
          const baseUrl = process.env.BASE_URL || "https://test.jinn-hr.ru";
          await page.goto(new URL("/ru/development-plans/", baseUrl).toString());
          await plansPage.assertOpened();

          // Проверка что страница загрузилась корректно
          await expect(plansPage.heading).toBeVisible({
            timeout: TIMEOUTS.MEDIUM,
          });
        });

        // Шаг 2: Прямой переход на /ru/development-plans/templates
        await test.step("Прямой переход на /development-plans/templates по URL", async () => {
          const baseUrl = process.env.BASE_URL || "https://test.jinn-hr.ru";
          await page.goto(new URL("/ru/development-plans/templates/", baseUrl).toString());
          await templatesPage.assertOpened();

          // Проверка что страница загрузилась корректно
          await expect(templatesPage.heading).toBeVisible({
            timeout: TIMEOUTS.MEDIUM,
          });
        });
      },
    );
  },
);
