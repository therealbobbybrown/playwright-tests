/**
 * Security UI тесты - Доступ пользователя (User)
 *
 * Проверяет, что обычный пользователь:
 * - Не видит административные пункты меню
 * - Не может перейти на /manager/* страницы
 * - Не видит элементы управления администратора
 */
import { test, expect } from "../../fixtures/auth.js";
import { SideMenu } from "../../../pages/SideMenu.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { TIMEOUTS } from "../../utils/constants.js";

const BASE_URL = process.env.BASE_URL;

/**
 * Ожидание загрузки меню страницы
 * Вместо hardcoded waitForTimeout используем networkidle + waitFor элемента
 * @param {import('@playwright/test').Page} page
 */
async function waitForMenuLoad(page) {
  // Ждём завершения сетевых запросов
  await page
    .waitForLoadState("networkidle", { timeout: TIMEOUTS.PAGE_LOAD })
    .catch(() => {
      // Если networkidle не достигается (постоянные запросы), используем domcontentloaded
    });
  // Ждём появления основного меню-контейнера
  await page
    .locator('nav, [role="navigation"], aside')
    .first()
    .waitFor({
      state: "visible",
      timeout: TIMEOUTS.ELEMENT_VISIBLE,
    })
    .catch(() => {
      // Если меню не найдено стандартным способом - используем fallback
    });
}

test.describe("Security - User Access @ui @security @user", () => {
  test.beforeEach(() => {
    markAsUITest(MODULES.SECURITY, "User Access");
  });

  // ═══════════════════════════════════════════════════════════════
  // МЕНЮ - проверка отсутствия admin пунктов
  // ═══════════════════════════════════════════════════════════════
  test.describe("Меню пользователя", () => {
    test('Пункт "Опросы" (управление) отсутствует в меню', async ({
      userAuth,
      page,
    }) => {
      setSeverity("critical");

      // Открываем главную и ждём загрузки меню
      await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
      await waitForMenuLoad(page);

      // Ищем ссылку на /manager/company/surveys (управление опросами)
      const managerSurveysLink = page.locator(
        'a[href*="/manager/company/surveys"]',
      );
      await expect(managerSurveysLink).toHaveCount(0);
    });

    test('Пункт "Оценка персонала" (управление) отсутствует в меню', async ({
      userAuth,
      page,
    }) => {
      setSeverity("critical");

      await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
      await waitForMenuLoad(page);

      // Ищем ссылку на /manager/performance-reviews
      const managerPRLink = page.locator(
        'a[href*="/manager/performance-reviews"]',
      );
      await expect(managerPRLink).toHaveCount(0);
    });

    test('Пункт "Роли" (управление) отсутствует в меню', async ({
      userAuth,
      page,
    }) => {
      setSeverity("critical");

      await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
      await waitForMenuLoad(page);

      // Ищем ссылку на /manager/company/roles
      const managerRolesLink = page.locator(
        'a[href*="/manager/company/roles"]',
      );
      await expect(managerRolesLink).toHaveCount(0);
    });

    test('Пункт "Структура" (управление) отсутствует в меню', async ({
      userAuth,
      page,
    }) => {
      setSeverity("critical");

      await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
      await waitForMenuLoad(page);

      // Ищем ссылку на /manager/structure
      const managerStructureLink = page.locator(
        'a[href*="/manager/structure"]',
      );
      await expect(managerStructureLink).toHaveCount(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // ПРЯМОЙ ДОСТУП - редирект или 403 при переходе на /manager/*
  // ═══════════════════════════════════════════════════════════════
  test.describe("Прямой доступ к /manager/* страницам", () => {
    test("/manager/company/surveys - редирект или 403", async ({
      userAuth,
      page,
    }) => {
      setSeverity("critical");

      const response = await page.goto(
        `${BASE_URL}/ru/manager/company/surveys`,
        {
          waitUntil: "domcontentloaded",
          timeout: 15000,
        },
      );

      // Ожидаем редирект на другую страницу или 403
      const url = page.url();
      const status = response?.status() || 200;

      const isRedirected = !url.includes("/manager/company/surveys");
      const isForbidden = status === 403;

      expect(
        isRedirected || isForbidden,
        `Ожидали редирект или 403, получили: ${url}, status: ${status}`,
      ).toBe(true);
    });

    test("/manager/performance-reviews - редирект или 403", async ({
      userAuth,
      page,
    }) => {
      setSeverity("critical");

      const response = await page.goto(
        `${BASE_URL}/ru/manager/performance-reviews`,
        {
          waitUntil: "domcontentloaded",
          timeout: 15000,
        },
      );

      const url = page.url();
      const status = response?.status() || 200;

      const isRedirected = !url.includes("/manager/performance-reviews");
      const isForbidden = status === 403;

      expect(
        isRedirected || isForbidden,
        `Ожидали редирект или 403, получили: ${url}, status: ${status}`,
      ).toBe(true);
    });

    test("/manager/company/roles - редирект или 403", async ({
      userAuth,
      page,
    }) => {
      setSeverity("critical");

      const response = await page.goto(`${BASE_URL}/ru/manager/company/roles`, {
        waitUntil: "domcontentloaded",
        timeout: 15000,
      });

      const url = page.url();
      const status = response?.status() || 200;

      const isRedirected = !url.includes("/manager/company/roles");
      const isForbidden = status === 403;

      expect(
        isRedirected || isForbidden,
        `Ожидали редирект или 403, получили: ${url}, status: ${status}`,
      ).toBe(true);
    });

    test("/manager/structure/users - редирект или 403", async ({
      userAuth,
      page,
    }) => {
      setSeverity("critical");

      const response = await page.goto(
        `${BASE_URL}/ru/manager/structure/users`,
        {
          waitUntil: "domcontentloaded",
          timeout: 15000,
        },
      );

      const url = page.url();
      const status = response?.status() || 200;

      const isRedirected = !url.includes("/manager/structure/users");
      const isForbidden = status === 403;

      expect(
        isRedirected || isForbidden,
        `Ожидали редирект или 403, получили: ${url}, status: ${status}`,
      ).toBe(true);
    });

    test("/manager/structure/departments - редирект или 403", async ({
      userAuth,
      page,
    }) => {
      setSeverity("critical");

      const response = await page.goto(
        `${BASE_URL}/ru/manager/structure/departments`,
        {
          waitUntil: "domcontentloaded",
          timeout: 15000,
        },
      );

      const url = page.url();
      const status = response?.status() || 200;

      const isRedirected = !url.includes("/manager/structure/departments");
      const isForbidden = status === 403;

      expect(
        isRedirected || isForbidden,
        `Ожидали редирект или 403, получили: ${url}, status: ${status}`,
      ).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // ГЛАВНАЯ СТРАНИЦА - отсутствие admin элементов
  // ═══════════════════════════════════════════════════════════════
  test.describe("Главная страница", () => {
    test('Кнопка "Добавить сотрудников" отсутствует', async ({
      userAuth,
      page,
    }) => {
      setSeverity("normal");

      await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
      await waitForMenuLoad(page); // Ждём загрузки контента

      // Проверяем отсутствие кнопки/ссылки на добавление сотрудников
      const addEmployeesButton = page
        .locator("text=/добавить сотрудник/i")
        .first();
      const addEmployeesLink = page.locator(
        'a[href*="/manager/structure/users/add"]',
      );

      const buttonVisible = await addEmployeesButton
        .isVisible()
        .catch(() => false);
      const linkCount = await addEmployeesLink.count();

      expect(
        buttonVisible,
        'Кнопка "Добавить сотрудников" не должна быть видна',
      ).toBe(false);
      expect(
        linkCount,
        "Ссылка на добавление сотрудников не должна присутствовать",
      ).toBe(0);
    });

    test("Ссылка на управление структурой отсутствует", async ({
      userAuth,
      page,
    }) => {
      setSeverity("normal");

      await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
      await waitForMenuLoad(page);

      const manageStructureLink = page.locator('a[href*="/manager/structure"]');
      await expect(manageStructureLink).toHaveCount(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // ДОСТУПНЫЕ СТРАНИЦЫ - user может посещать
  // ═══════════════════════════════════════════════════════════════
  test.describe("Доступные страницы для пользователя", () => {
    test("User может открыть свой профиль", async ({
      userAuth,
      page,
    }, testInfo) => {
      setSeverity("normal");
      const sideMenu = new SideMenu(page, testInfo);

      await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
      await sideMenu.openMyProfile();

      const url = page.url();
      expect(url).toContain("/profile");
    });

    test("User может открыть страницу благодарностей", async ({
      userAuth,
      page,
    }, testInfo) => {
      setSeverity("normal");
      const sideMenu = new SideMenu(page, testInfo);

      await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
      await sideMenu.openFeedbackView();

      const url = page.url();
      expect(url).toContain("/feedbacks");
    });

    test("User может открыть свои цели", async ({ userAuth, page }) => {
      setSeverity("normal");

      const response = await page.goto(`${BASE_URL}/ru/objectives`, {
        waitUntil: "domcontentloaded",
      });

      expect(response?.status()).toBeLessThan(400);
      expect(page.url()).toContain("/objectives");
    });

    test("User может открыть планы развития", async ({ userAuth, page }) => {
      setSeverity("normal");

      const response = await page.goto(`${BASE_URL}/ru/development-plans`, {
        waitUntil: "domcontentloaded",
      });

      expect(response?.status()).toBeLessThan(400);
      expect(page.url()).toContain("/development-plans");
    });
  });
});
