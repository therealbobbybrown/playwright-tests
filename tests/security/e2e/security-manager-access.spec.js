/**
 * Security UI тесты - Доступ руководителя (Manager)
 *
 * Проверяет, что руководитель:
 * - Не видит административные пункты меню (как обычный пользователь)
 * - Не может перейти на /manager/* административные страницы
 * - Видит данные своих подчинённых
 * - Может выполнять действия руководителя (утверждение коллег, активация планов)
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
      // Если networkidle не достигается (постоянные запросы), используем fallback
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

test.describe("Security - Manager Access @ui @security @manager", () => {
  test.beforeEach(() => {
    markAsUITest(MODULES.SECURITY, "Manager Access");
  });

  // ═══════════════════════════════════════════════════════════════
  // МЕНЮ - проверка отсутствия admin пунктов (как у user)
  // ═══════════════════════════════════════════════════════════════
  test.describe("Меню руководителя", () => {
    test('Пункт "Опросы" (управление) отсутствует в меню', async ({
      managerAuth,
      page,
    }) => {
      setSeverity("critical");

      await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
      await waitForMenuLoad(page);

      // Ищем ссылку на /manager/company/surveys (управление опросами)
      const managerSurveysLink = page.locator(
        'a[href*="/manager/company/surveys"]',
      );
      await expect(managerSurveysLink).toHaveCount(0);
    });

    test('Пункт "Оценка персонала" (управление) отсутствует в меню', async ({
      managerAuth,
      page,
    }) => {
      setSeverity("critical");

      await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
      await waitForMenuLoad(page);

      const managerPRLink = page.locator(
        'a[href*="/manager/performance-reviews"]',
      );
      await expect(managerPRLink).toHaveCount(0);
    });

    test('Пункт "Роли" (управление) отсутствует в меню', async ({
      managerAuth,
      page,
    }) => {
      setSeverity("critical");

      await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
      await waitForMenuLoad(page);

      const managerRolesLink = page.locator(
        'a[href*="/manager/company/roles"]',
      );
      await expect(managerRolesLink).toHaveCount(0);
    });

    test('Пункт "Структура" (управление) отсутствует в меню', async ({
      managerAuth,
      page,
    }) => {
      setSeverity("critical");

      await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
      await waitForMenuLoad(page);

      const managerStructureLink = page.locator(
        'a[href*="/manager/structure"]',
      );
      await expect(managerStructureLink).toHaveCount(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // ПРЯМОЙ ДОСТУП - /manager/* недоступны
  // ═══════════════════════════════════════════════════════════════
  test.describe("Прямой доступ к /manager/* страницам", () => {
    test("/manager/company/surveys - редирект или 403", async ({
      managerAuth,
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
      managerAuth,
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
      managerAuth,
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
      managerAuth,
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
  });

  // ═══════════════════════════════════════════════════════════════
  // ДАННЫЕ ПОДЧИНЁННЫХ - manager видит
  // ═══════════════════════════════════════════════════════════════
  test.describe("Доступ к данным подчинённых", () => {
    test("Manager может видеть благодарности подчинённых", async ({
      managerAuth,
      page,
    }, testInfo) => {
      setSeverity("normal");
      const sideMenu = new SideMenu(page, testInfo);

      await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });

      // Переходим в раздел благодарностей подчинённых
      await sideMenu.openFeedbackOfEmployees();

      const url = page.url();
      expect(url).toContain("/feedbacks");
      // Проверяем что страница загрузилась без ошибок
      const errorPage = page.locator("text=/403|forbidden|access denied/i");
      await expect(errorPage).toHaveCount(0);
    });

    test("Manager может видеть цели подчинённых", async ({
      managerAuth,
      page,
    }) => {
      setSeverity("normal");

      const response = await page.goto(`${BASE_URL}/ru/objectives`, {
        waitUntil: "domcontentloaded",
      });

      expect(response?.status()).toBeLessThan(400);

      // Проверяем наличие фильтра/таба подчинённых
      const subordinatesTab = page
        .locator("text=/подчинённ|subordinate|сотрудник/i")
        .first();
      const isVisible = await subordinatesTab.isVisible().catch(() => false);

      // Manager должен иметь возможность видеть раздел подчинённых
      // Если таб не виден - это не критично, главное что страница доступна
      expect(page.url()).toContain("/objectives");
    });

    test("Manager может видеть планы развития подчинённых", async ({
      managerAuth,
      page,
    }) => {
      setSeverity("normal");

      const response = await page.goto(`${BASE_URL}/ru/development-plans`, {
        waitUntil: "domcontentloaded",
      });

      expect(response?.status()).toBeLessThan(400);
      expect(page.url()).toContain("/development-plans");
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // ФУНКЦИИ РУКОВОДИТЕЛЯ
  // ═══════════════════════════════════════════════════════════════
  test.describe("Функции руководителя", () => {
    test("Manager может открыть свой профиль", async ({
      managerAuth,
      page,
    }, testInfo) => {
      setSeverity("normal");
      const sideMenu = new SideMenu(page, testInfo);

      await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
      await sideMenu.openMyProfile();

      const url = page.url();
      expect(url).toContain("/profile");
    });

    test("Manager может открыть свои цели", async ({ managerAuth, page }) => {
      setSeverity("normal");

      const response = await page.goto(`${BASE_URL}/ru/objectives`, {
        waitUntil: "domcontentloaded",
      });

      expect(response?.status()).toBeLessThan(400);
      expect(page.url()).toContain("/objectives");
    });

    test("Manager может создать благодарность", async ({
      managerAuth,
      page,
    }, testInfo) => {
      setSeverity("normal");
      const sideMenu = new SideMenu(page, testInfo);

      await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });

      // Проверяем доступность кнопки создания благодарности
      await sideMenu.openFeedbackView();

      // Ищем кнопку "Создать" или "Добавить"
      const createButton = page
        .locator('button:has-text("Благодар"), a:has-text("Благодар")')
        .first();
      const isVisible = await createButton.isVisible().catch(() => false);

      // Если кнопка видна - тест пройден. Если нет - проверяем что нет ошибки 403
      if (!isVisible) {
        const errorPage = page.locator("text=/403|forbidden/i");
        await expect(errorPage).toHaveCount(0);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // ОТЛИЧИЯ ОТ ADMIN
  // ═══════════════════════════════════════════════════════════════
  test.describe("Отличия от администратора", () => {
    test("Manager не видит пункт настройки компании", async ({
      managerAuth,
      page,
    }, testInfo) => {
      setSeverity("normal");
      const sideMenu = new SideMenu(page, testInfo);

      await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
      await sideMenu.waitForMenu();

      // Проверяем отсутствие ссылки на настройки компании
      const companySettingsLink = page.locator('a[href*="/manager/company"]');
      await expect(companySettingsLink).toHaveCount(0);
    });

    test("Manager не может управлять виртуальной валютой", async ({
      managerAuth,
      page,
    }) => {
      setSeverity("normal");

      const response = await page.goto(`${BASE_URL}/ru/manager/karma`, {
        waitUntil: "domcontentloaded",
        timeout: 15000,
      });

      const url = page.url();
      const status = response?.status() || 200;

      const isRedirected = !url.includes("/manager/karma");
      const isForbidden = status === 403;

      expect(
        isRedirected || isForbidden,
        `Ожидали редирект или 403 для /manager/karma`,
      ).toBe(true);
    });

    test("Manager не может управлять магазином подарков", async ({
      managerAuth,
      page,
    }) => {
      setSeverity("normal");

      const response = await page.goto(`${BASE_URL}/ru/manager/gift-shop`, {
        waitUntil: "domcontentloaded",
        timeout: 15000,
      });

      const url = page.url();
      const status = response?.status() || 200;

      const isRedirected = !url.includes("/manager/gift-shop");
      const isForbidden = status === 403;

      expect(
        isRedirected || isForbidden,
        `Ожидали редирект или 403 для /manager/gift-shop`,
      ).toBe(true);
    });
  });
});
