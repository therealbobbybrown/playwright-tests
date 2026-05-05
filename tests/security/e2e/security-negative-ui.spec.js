/**
 * Security UI тесты - Негативные сценарии
 *
 * Проверяет защиту от несанкционированного доступа:
 * - Попытки перехода на административные страницы
 * - Попытки редактирования чужих данных
 * - Отсутствие административных элементов управления
 */
import { test, expect } from "../../fixtures/auth.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

const BASE_URL = process.env.BASE_URL;

test.describe("Security - Negative UI Tests @ui @security @negative", () => {
  test.beforeEach(() => {
    markAsUITest(MODULES.SECURITY, "Negative Tests");
  });

  // ═══════════════════════════════════════════════════════════════
  // АДМИНИСТРАТИВНЫЕ СТРАНИЦЫ - user
  // ═══════════════════════════════════════════════════════════════
  test.describe("User - попытки доступа к admin страницам", () => {
    test("/manager/company/surveys - user получает редирект или 403", async ({
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

      const url = page.url();
      const status = response?.status() || 200;

      // User не должен иметь доступа
      const isRedirected = !url.includes("/manager/company/surveys");
      const isForbidden = status === 403;
      const isUnauthorized = status === 401;

      expect(
        isRedirected || isForbidden || isUnauthorized,
        `User не должен иметь доступ к /manager/company/surveys. URL: ${url}, Status: ${status}`,
      ).toBe(true);
    });

    test("/manager/performance-reviews - user получает редирект или 403", async ({
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
      const isUnauthorized = status === 401;

      expect(
        isRedirected || isForbidden || isUnauthorized,
        `User не должен иметь доступ к /manager/performance-reviews. URL: ${url}, Status: ${status}`,
      ).toBe(true);
    });

    test("/manager/company/roles - user получает редирект или 403", async ({
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
      const isUnauthorized = status === 401;

      expect(
        isRedirected || isForbidden || isUnauthorized,
        `User не должен иметь доступ к /manager/company/roles. URL: ${url}, Status: ${status}`,
      ).toBe(true);
    });

    test("/manager/assessments - user получает редирект или 403", async ({
      userAuth,
      page,
    }) => {
      setSeverity("critical");

      const response = await page.goto(`${BASE_URL}/ru/manager/assessments`, {
        waitUntil: "domcontentloaded",
        timeout: 15000,
      });

      const url = page.url();
      const status = response?.status() || 200;

      const isRedirected = !url.includes("/manager/assessments");
      const isForbidden = status === 403;
      const isUnauthorized = status === 401;

      expect(
        isRedirected || isForbidden || isUnauthorized,
        `User не должен иметь доступ к /manager/assessments. URL: ${url}, Status: ${status}`,
      ).toBe(true);
    });

    test("/manager/competencies - user получает редирект или 403", async ({
      userAuth,
      page,
    }) => {
      setSeverity("critical");

      const response = await page.goto(`${BASE_URL}/ru/manager/competencies`, {
        waitUntil: "domcontentloaded",
        timeout: 15000,
      });

      const url = page.url();
      const status = response?.status() || 200;

      const isRedirected = !url.includes("/manager/competencies");
      const isForbidden = status === 403;
      const isUnauthorized = status === 401;

      expect(
        isRedirected || isForbidden || isUnauthorized,
        `User не должен иметь доступ к /manager/competencies. URL: ${url}, Status: ${status}`,
      ).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // РЕДАКТИРОВАНИЕ ЧУЖИХ ДАННЫХ
  // ═══════════════════════════════════════════════════════════════
  test.describe("User - редактирование чужих данных", () => {
    test("User не видит кнопку редактирования на чужом профиле", async ({
      userAuth,
      page,
    }) => {
      setSeverity("critical");

      // Переходим на профиль пользователя с ID 1 (предположительно admin)
      // Используем ID 1, так как он обычно существует
      await page.goto(`${BASE_URL}/ru/profile/1`, {
        waitUntil: "domcontentloaded",
        timeout: 15000,
      });

      // Проверяем что мы на странице профиля (не редирект на ошибку)
      const url = page.url();

      if (url.includes("/profile/1")) {
        // Ищем кнопку редактирования
        const editButton = page.locator(
          'button:has-text("Редактировать"), a:has-text("Редактировать")',
        );
        const editIcon = page.locator(
          '[data-testid="edit-profile"], [aria-label*="редакт"]',
        );

        const editButtonVisible = await editButton
          .isVisible()
          .catch(() => false);
        const editIconVisible = await editIcon.isVisible().catch(() => false);

        // User не должен видеть кнопку редактирования чужого профиля
        expect(
          editButtonVisible || editIconVisible,
          "Кнопка редактирования чужого профиля не должна быть видна",
        ).toBe(false);
      }
      // Если редирект - это тоже корректное поведение (нет доступа)
    });

    test("User не может открыть страницу редактирования чужого профиля", async ({
      userAuth,
      page,
    }) => {
      setSeverity("critical");

      const response = await page.goto(
        `${BASE_URL}/ru/manager/structure/users/1`,
        {
          waitUntil: "domcontentloaded",
          timeout: 15000,
        },
      );

      const url = page.url();
      const status = response?.status() || 200;

      const isRedirected = !url.includes("/manager/structure/users/1");
      const isForbidden = status === 403;
      const isUnauthorized = status === 401;
      const isNotFound = status === 404;

      expect(
        isRedirected || isForbidden || isUnauthorized || isNotFound,
        `User не должен иметь доступ к редактированию чужого профиля. URL: ${url}, Status: ${status}`,
      ).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // АДМИНИСТРАТИВНЫЕ СТРАНИЦЫ - manager
  // ═══════════════════════════════════════════════════════════════
  test.describe("Manager - попытки доступа к admin страницам", () => {
    test("/manager/company/surveys - manager получает редирект или 403", async ({
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
      const isUnauthorized = status === 401;

      expect(
        isRedirected || isForbidden || isUnauthorized,
        `Manager не должен иметь доступ к /manager/company/surveys. URL: ${url}, Status: ${status}`,
      ).toBe(true);
    });

    test("/manager/company/roles - manager получает редирект или 403", async ({
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
      const isUnauthorized = status === 401;

      expect(
        isRedirected || isForbidden || isUnauthorized,
        `Manager не должен иметь доступ к /manager/company/roles. URL: ${url}, Status: ${status}`,
      ).toBe(true);
    });

    test("/manager/structure/users - manager получает редирект или 403", async ({
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
      const isUnauthorized = status === 401;

      expect(
        isRedirected || isForbidden || isUnauthorized,
        `Manager не должен иметь доступ к /manager/structure/users. URL: ${url}, Status: ${status}`,
      ).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // ЗАЩИТА ДАННЫХ
  // ═══════════════════════════════════════════════════════════════
  test.describe("Защита от утечки данных", () => {
    test("User не видит административную панель статистики", async ({
      userAuth,
      page,
    }) => {
      setSeverity("normal");

      await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
      await page
        .waitForLoadState("networkidle", { timeout: 5000 })
        .catch(() => {});

      // Проверяем отсутствие виджетов статистики администратора
      const adminStats = page.locator(
        '[data-testid="admin-stats"], [class*="admin-dashboard"]',
      );
      await expect(adminStats).toHaveCount(0);
    });

    test("User не видит список всех пользователей", async ({
      userAuth,
      page,
    }) => {
      setSeverity("normal");

      const response = await page.goto(
        `${BASE_URL}/ru/manager/structure/users`,
        {
          waitUntil: "domcontentloaded",
          timeout: 15000,
        },
      );

      const status = response?.status() || 200;
      const url = page.url();

      // Либо редирект, либо 403
      const isProtected =
        !url.includes("/manager/structure/users") || status === 403;
      expect(
        isProtected,
        "User не должен видеть список всех пользователей",
      ).toBe(true);
    });

    test("User не видит финансовую статистику виртуальной валюты", async ({
      userAuth,
      page,
    }) => {
      setSeverity("normal");

      const response = await page.goto(
        `${BASE_URL}/ru/manager/karma/statistics`,
        {
          waitUntil: "domcontentloaded",
          timeout: 15000,
        },
      );

      const status = response?.status() || 200;
      const url = page.url();

      const isProtected =
        !url.includes("/manager/karma/statistics") || status === 403;
      expect(isProtected, "User не должен видеть финансовую статистику").toBe(
        true,
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // СОЗДАНИЕ АДМИНИСТРАТИВНЫХ СУЩНОСТЕЙ
  // ═══════════════════════════════════════════════════════════════
  test.describe("Защита создания сущностей", () => {
    test("User не может создать опрос", async ({ userAuth, page }) => {
      setSeverity("critical");

      const response = await page.goto(
        `${BASE_URL}/ru/manager/company/surveys/add`,
        {
          waitUntil: "domcontentloaded",
          timeout: 15000,
        },
      );

      const status = response?.status() || 200;
      const url = page.url();

      const isProtected =
        !url.includes("/manager/company/surveys/add") || status === 403;
      expect(
        isProtected,
        "User не должен иметь доступ к созданию опросов",
      ).toBe(true);
    });

    test("User не может создать оценку персонала", async ({
      userAuth,
      page,
    }) => {
      setSeverity("critical");

      const response = await page.goto(
        `${BASE_URL}/ru/manager/performance-reviews/add`,
        {
          waitUntil: "domcontentloaded",
          timeout: 15000,
        },
      );

      const status = response?.status() || 200;
      const url = page.url();

      const isProtected =
        !url.includes("/manager/performance-reviews/add") || status === 403;
      expect(
        isProtected,
        "User не должен иметь доступ к созданию оценки персонала",
      ).toBe(true);
    });

    test("User не может создать роль", async ({ userAuth, page }) => {
      setSeverity("critical");

      const response = await page.goto(
        `${BASE_URL}/ru/manager/company/roles/add`,
        {
          waitUntil: "domcontentloaded",
          timeout: 15000,
        },
      );

      const status = response?.status() || 200;
      const url = page.url();

      const isProtected =
        !url.includes("/manager/company/roles/add") || status === 403;
      expect(isProtected, "User не должен иметь доступ к созданию ролей").toBe(
        true,
      );
    });

    test("User не может добавить пользователя", async ({ userAuth, page }) => {
      setSeverity("critical");

      const response = await page.goto(
        `${BASE_URL}/ru/manager/structure/users/add`,
        {
          waitUntil: "domcontentloaded",
          timeout: 15000,
        },
      );

      const status = response?.status() || 200;
      const url = page.url();

      const isProtected =
        !url.includes("/manager/structure/users/add") || status === 403;
      expect(
        isProtected,
        "User не должен иметь доступ к добавлению пользователей",
      ).toBe(true);
    });

    test("User не может создать департамент", async ({ userAuth, page }) => {
      setSeverity("critical");

      const response = await page.goto(
        `${BASE_URL}/ru/manager/structure/departments/add`,
        {
          waitUntil: "domcontentloaded",
          timeout: 15000,
        },
      );

      const status = response?.status() || 200;
      const url = page.url();

      const isProtected =
        !url.includes("/manager/structure/departments/add") || status === 403;
      expect(
        isProtected,
        "User не должен иметь доступ к созданию департаментов",
      ).toBe(true);
    });
  });
});
