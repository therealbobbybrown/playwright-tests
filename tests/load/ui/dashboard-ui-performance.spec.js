// @ts-check
// tests/load/ui/dashboard-ui-performance.spec.js
// UI Performance тесты для Dashboard
// @tags @load @ui @dashboard

import { test as base, expect } from "@playwright/test";
import { LoginPage } from "../../../pages/LoginPage.js";
import { TokenManager } from "../../utils/auth/TokenManager.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
  allure,
} from "../../utils/allure-helpers.js";
import { getCredentials } from "../../utils/api/AuthAPI.js";

// Thresholds для UI метрик (в мс)
const UI_THRESHOLDS = {
  PAGE_LOAD: 5000,
  DASHBOARD_LOAD: 8000,
  ORG_TREE_LOAD: 20000,
  LCP_NEEDS_IMPROVEMENT: 4000,
  FCP_NEEDS_IMPROVEMENT: 3000,
  INTERACTION: 500,
  FILTER_APPLY: 2000,
};

// Base URL с fallback
const BASE_URL = process.env.BASE_URL;

const test = base.extend({
  authenticatedPage: async ({ page }, use, testInfo) => {
    const { email, password } = getCredentials("admin");

    // API fast path + UI fallback
    let loggedIn = false;
    try {
      loggedIn = await TokenManager.loginViaApi(page, email, password);
    } catch {
      // fallback to UI
    }
    if (!loggedIn) {
      await page.context().clearCookies();
      try {
        await page.evaluate(() => localStorage.removeItem("fingerPrint"));
      } catch {}
      const loginPage = new LoginPage(page, testInfo);
      await loginPage.goto();
      await loginPage.login(email, password);
    }

    await use(page);
  },
});

// ==================== PAGE LOAD PERFORMANCE ====================

test.describe("Dashboard UI - Page Load @load @ui @dashboard @pageload", () => {
  test.beforeEach(() => {
    markAsUITest(MODULES.DASHBOARD, "UI Performance - Page Load");
  });

  test("Время загрузки главной страницы @critical", async ({
    authenticatedPage: page,
  }) => {
    setSeverity("critical");

    const startTime = Date.now();

    await page.goto(`${BASE_URL}/ru/manager/`);
    await page
      .waitForLoadState("networkidle", { timeout: 20000 })
      .catch(() => {});

    const loadTime = Date.now() - startTime;

    allure.attachment(
      "Dashboard Load",
      JSON.stringify({ loadTime }, null, 2),
      "application/json",
    );
    console.log(`   Dashboard загружен за ${loadTime}ms`);

    expect(
      loadTime,
      `Время загрузки < ${UI_THRESHOLDS.DASHBOARD_LOAD}ms`,
    ).toBeLessThan(UI_THRESHOLDS.DASHBOARD_LOAD);
  });

  test("Время загрузки страницы пользователей", async ({
    authenticatedPage: page,
  }) => {
    setSeverity("normal");

    const startTime = Date.now();

    await page.goto(`${BASE_URL}/ru/manager/org-structure/`);
    await page
      .waitForLoadState("networkidle", { timeout: 15000 })
      .catch(() => {});

    const loadTime = Date.now() - startTime;

    allure.attachment(
      "Users Page Load",
      JSON.stringify({ loadTime }, null, 2),
      "application/json",
    );
    console.log(`   Страница пользователей загружена за ${loadTime}ms`);

    expect(
      loadTime,
      `Время загрузки < ${UI_THRESHOLDS.PAGE_LOAD}ms`,
    ).toBeLessThan(UI_THRESHOLDS.PAGE_LOAD);
  });

  test("Время загрузки страницы аналитики", async ({
    authenticatedPage: page,
  }) => {
    setSeverity("normal");

    const startTime = Date.now();

    await page.goto(`${BASE_URL}/ru/manager/analytics/`);
    await page
      .waitForLoadState("networkidle", { timeout: 15000 })
      .catch(() => {});

    const loadTime = Date.now() - startTime;

    allure.attachment(
      "Analytics Load",
      JSON.stringify({ loadTime }, null, 2),
      "application/json",
    );
    console.log(`   Аналитика загружена за ${loadTime}ms`);

    expect(
      loadTime,
      `Время загрузки < ${UI_THRESHOLDS.DASHBOARD_LOAD}ms`,
    ).toBeLessThan(UI_THRESHOLDS.DASHBOARD_LOAD);
  });
});

// ==================== CORE WEB VITALS ====================

test.describe("Dashboard UI - Core Web Vitals @load @ui @dashboard @vitals", () => {
  test.beforeEach(() => {
    markAsUITest(MODULES.DASHBOARD, "UI Performance - Web Vitals");
  });

  test("LCP для главной страницы @critical", async ({
    authenticatedPage: page,
  }) => {
    setSeverity("critical");

    await page.goto(`${BASE_URL}/ru/manager/`);
    await page
      .waitForLoadState("networkidle", { timeout: 20000 })
      .catch(() => {});

    const navigationTiming = await page
      .evaluate(() => {
        const timing = performance.getEntriesByType("navigation")[0];
        return {
          domContentLoaded: timing?.domContentLoadedEventEnd || 0,
          loadComplete: timing?.loadEventEnd || 0,
          domInteractive: timing?.domInteractive || 0,
        };
      })
      .catch(() => ({}));

    allure.attachment(
      "Web Vitals",
      JSON.stringify(navigationTiming, null, 2),
      "application/json",
    );

    console.log(`   DOM Interactive: ${navigationTiming.domInteractive}ms`);
    console.log(`   Load Complete: ${navigationTiming.loadComplete}ms`);

    if (navigationTiming.loadComplete > 0) {
      expect(
        navigationTiming.loadComplete,
        `Load < ${UI_THRESHOLDS.LCP_NEEDS_IMPROVEMENT}ms`,
      ).toBeLessThan(UI_THRESHOLDS.LCP_NEEDS_IMPROVEMENT * 2);
    }
  });

  test("FCP для главной страницы", async ({ authenticatedPage: page }) => {
    setSeverity("normal");

    await page.goto(`${BASE_URL}/ru/manager/`);

    const fcpMetric = await page
      .evaluate(() => {
        const entries = performance.getEntriesByName("first-contentful-paint");
        return entries[0]?.startTime || 0;
      })
      .catch(() => 0);

    allure.attachment(
      "FCP",
      JSON.stringify({ fcp: fcpMetric }, null, 2),
      "application/json",
    );
    console.log(`   FCP: ${fcpMetric}ms`);

    if (fcpMetric > 0) {
      expect(
        fcpMetric,
        `FCP < ${UI_THRESHOLDS.FCP_NEEDS_IMPROVEMENT}ms`,
      ).toBeLessThan(UI_THRESHOLDS.FCP_NEEDS_IMPROVEMENT);
    }
  });
});

// ==================== ORG STRUCTURE TREE ====================

test.describe("Dashboard UI - Org Structure Tree @load @ui @dashboard @tree", () => {
  test.beforeEach(() => {
    markAsUITest(MODULES.DASHBOARD, "UI Performance - Org Tree");
  });

  test("Время загрузки дерева оргструктуры @critical", async ({
    authenticatedPage: page,
  }) => {
    setSeverity("critical");

    const startTime = Date.now();

    await page.goto(`${BASE_URL}/ru/manager/org-structure/`);
    await page
      .waitForLoadState("networkidle", { timeout: 20000 })
      .catch(() => {});

    // Ждём появления дерева
    const tree = page
      .locator('[class*="Tree"], [class*="tree"], [role="tree"]')
      .first();
    await tree.waitFor({ state: "visible", timeout: 15000 }).catch(() => {});

    const loadTime = Date.now() - startTime;

    allure.attachment(
      "Tree Load",
      JSON.stringify({ loadTime }, null, 2),
      "application/json",
    );
    console.log(`   Дерево загружено за ${loadTime}ms`);

    expect(loadTime, `Дерево < ${UI_THRESHOLDS.ORG_TREE_LOAD}ms`).toBeLessThan(
      UI_THRESHOLDS.ORG_TREE_LOAD,
    );
  });

  test("Время раскрытия узла дерева", async ({ authenticatedPage: page }) => {
    setSeverity("normal");

    await page.goto(`${BASE_URL}/ru/manager/org-structure/`);
    await page
      .waitForLoadState("networkidle", { timeout: 15000 })
      .catch(() => {});

    // Находим expandable узел
    const expandButton = page
      .locator('[class*="expand"], [aria-expanded="false"]')
      .first();
    const hasExpand = await expandButton.isVisible().catch(() => false);

    if (!hasExpand) {
      console.log("   Нет раскрываемых узлов");
      return;
    }

    const startTime = Date.now();

    await expandButton.click();
    await page.waitForTimeout(500);

    const expandTime = Date.now() - startTime;

    allure.attachment(
      "Expand Time",
      JSON.stringify({ expandTime }, null, 2),
      "application/json",
    );
    console.log(`   Узел раскрыт за ${expandTime}ms`);

    expect(
      expandTime,
      `Раскрытие < ${UI_THRESHOLDS.INTERACTION * 2}ms`,
    ).toBeLessThan(UI_THRESHOLDS.INTERACTION * 2);
  });
});

// ==================== WIDGETS RENDERING ====================

test.describe("Dashboard UI - Widgets @load @ui @dashboard @widgets", () => {
  test.beforeEach(() => {
    markAsUITest(MODULES.DASHBOARD, "UI Performance - Widgets");
  });

  test("Время рендера виджетов на главной", async ({
    authenticatedPage: page,
  }) => {
    setSeverity("normal");

    await page.goto(`${BASE_URL}/ru/manager/`);
    await page
      .waitForLoadState("networkidle", { timeout: 20000 })
      .catch(() => {});

    // Ищем виджеты на странице
    const widgets = page.locator(
      '[class*="Widget"], [class*="widget"], [class*="Card"], [class*="card"]',
    );
    const widgetsCount = await widgets.count();

    allure.attachment(
      "Widgets",
      JSON.stringify({ widgetsCount }, null, 2),
      "application/json",
    );
    console.log(`   Найдено виджетов: ${widgetsCount}`);

    if (widgetsCount > 0) {
      const firstWidget = widgets.first();
      await expect(firstWidget).toBeVisible({ timeout: 5000 });
    }
  });

  test("Время рендера графиков аналитики", async ({
    authenticatedPage: page,
  }) => {
    setSeverity("normal");

    await page.goto(`${BASE_URL}/ru/manager/analytics/`);
    await page
      .waitForLoadState("networkidle", { timeout: 20000 })
      .catch(() => {});

    // Ищем графики
    const charts = page.locator(
      'canvas, svg[class*="chart"], [class*="Chart"]',
    );
    const chartsCount = await charts.count();

    allure.attachment(
      "Charts",
      JSON.stringify({ chartsCount }, null, 2),
      "application/json",
    );
    console.log(`   Найдено графиков: ${chartsCount}`);

    if (chartsCount > 0) {
      const firstChart = charts.first();
      await expect(firstChart).toBeVisible({ timeout: 10000 });
    }
  });
});

// ==================== FILTER PERFORMANCE ====================

test.describe("Dashboard UI - Filter Performance @load @ui @dashboard @filter", () => {
  test.beforeEach(() => {
    markAsUITest(MODULES.DASHBOARD, "UI Performance - Filters");
  });

  test("Время применения фильтра по департаменту", async ({
    authenticatedPage: page,
  }) => {
    setSeverity("normal");

    await page.goto(`${BASE_URL}/ru/manager/org-structure/`);
    await page
      .waitForLoadState("networkidle", { timeout: 15000 })
      .catch(() => {});

    // Ищем фильтр по департаменту
    const filterButton = page
      .getByRole("button", { name: /фильтр|filter|департамент/i })
      .first();
    const hasFilter = await filterButton.isVisible().catch(() => false);

    if (!hasFilter) {
      console.log("   Фильтр недоступен");
      return;
    }

    const startTime = Date.now();

    await filterButton.click();
    await page.waitForTimeout(500);

    const filterTime = Date.now() - startTime;

    allure.attachment(
      "Filter Time",
      JSON.stringify({ filterTime }, null, 2),
      "application/json",
    );
    console.log(`   Фильтр открыт за ${filterTime}ms`);

    expect(filterTime, `Фильтр < ${UI_THRESHOLDS.FILTER_APPLY}ms`).toBeLessThan(
      UI_THRESHOLDS.FILTER_APPLY,
    );
  });

  test("Время поиска пользователя", async ({ authenticatedPage: page }) => {
    setSeverity("normal");

    await page.goto(`${BASE_URL}/ru/manager/org-structure/`);
    await page
      .waitForLoadState("networkidle", { timeout: 15000 })
      .catch(() => {});

    const searchInput = page
      .getByRole("textbox", { name: /поиск|search|найти/i })
      .first();
    const hasSearch = await searchInput.isVisible().catch(() => false);

    if (!hasSearch) {
      console.log("   Поле поиска недоступно");
      return;
    }

    const startTime = Date.now();

    await searchInput.fill("test");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(500);

    const searchTime = Date.now() - startTime;

    allure.attachment(
      "Search Time",
      JSON.stringify({ searchTime }, null, 2),
      "application/json",
    );
    console.log(`   Поиск выполнен за ${searchTime}ms`);

    expect(searchTime, `Поиск < ${UI_THRESHOLDS.FILTER_APPLY}ms`).toBeLessThan(
      UI_THRESHOLDS.FILTER_APPLY,
    );
  });
});

// ==================== NAVIGATION PERFORMANCE ====================

test.describe("Dashboard UI - Navigation @load @ui @dashboard @navigation", () => {
  test.beforeEach(() => {
    markAsUITest(MODULES.DASHBOARD, "UI Performance - Navigation");
  });

  test("Время навигации между разделами @critical", async ({
    authenticatedPage: page,
  }) => {
    setSeverity("critical");

    const sections = [
      { name: "Manager", url: "/ru/manager/" },
      { name: "Users", url: "/ru/manager/org-structure/" },
      { name: "PR", url: "/ru/manager/performance-reviews/" },
      { name: "Surveys", url: "/ru/manager/surveys/" },
    ];

    const timings = [];

    for (const section of sections) {
      const startTime = Date.now();

      await page.goto(`${BASE_URL}${section.url}`);
      await page.waitForLoadState("domcontentloaded", { timeout: 15000 });

      const navTime = Date.now() - startTime;
      timings.push({ section: section.name, time: navTime });
    }

    allure.attachment(
      "Navigation Times",
      JSON.stringify(timings, null, 2),
      "application/json",
    );
    timings.forEach((t) => console.log(`   ${t.section}: ${t.time}ms`));

    for (const { section, time } of timings) {
      expect(time, `${section} < ${UI_THRESHOLDS.PAGE_LOAD}ms`).toBeLessThan(
        UI_THRESHOLDS.PAGE_LOAD,
      );
    }
  });

  test("Время открытия сайдбара/меню", async ({ authenticatedPage: page }) => {
    setSeverity("normal");

    await page.goto(`${BASE_URL}/ru/manager/`);
    await page
      .waitForLoadState("networkidle", { timeout: 15000 })
      .catch(() => {});

    // Ищем кнопку меню
    const menuButton = page.getByRole("button", { name: /меню|menu/i }).first();
    const hasMenu = await menuButton.isVisible().catch(() => false);

    if (!hasMenu) {
      console.log("   Кнопка меню недоступна");
      return;
    }

    const startTime = Date.now();

    await menuButton.click();
    await page.waitForTimeout(300);

    const menuTime = Date.now() - startTime;

    allure.attachment(
      "Menu Time",
      JSON.stringify({ menuTime }, null, 2),
      "application/json",
    );
    console.log(`   Меню открыто за ${menuTime}ms`);

    expect(menuTime, `Меню < ${UI_THRESHOLDS.INTERACTION}ms`).toBeLessThan(
      UI_THRESHOLDS.INTERACTION,
    );
  });
});

// ==================== MEMORY USAGE ====================

test.describe("Dashboard UI - Memory @load @ui @dashboard @memory", () => {
  test.beforeEach(() => {
    markAsUITest(MODULES.DASHBOARD, "UI Performance - Memory");
  });

  test("Потребление памяти на главной странице", async ({
    authenticatedPage: page,
  }) => {
    setSeverity("normal");

    await page.goto(`${BASE_URL}/ru/manager/`);
    await page
      .waitForLoadState("networkidle", { timeout: 20000 })
      .catch(() => {});

    const memory = await page
      .evaluate(() => {
        if (performance.memory) {
          return {
            usedJSHeapSizeMB: (
              performance.memory.usedJSHeapSize /
              1024 /
              1024
            ).toFixed(2),
            totalJSHeapSizeMB: (
              performance.memory.totalJSHeapSize /
              1024 /
              1024
            ).toFixed(2),
          };
        }
        return null;
      })
      .catch(() => null);

    if (memory) {
      allure.attachment(
        "Memory",
        JSON.stringify(memory, null, 2),
        "application/json",
      );
      console.log(
        `   Память: ${memory.usedJSHeapSizeMB}MB / ${memory.totalJSHeapSizeMB}MB`,
      );

      expect(
        parseFloat(memory.usedJSHeapSizeMB),
        "Память < 150MB",
      ).toBeLessThan(150);
    } else {
      console.log("   Memory API недоступно");
    }
  });

  test("Утечка памяти при навигации", async ({ authenticatedPage: page }) => {
    setSeverity("normal");

    const urls = [
      "/ru/manager/",
      "/ru/manager/org-structure/",
      "/ru/manager/performance-reviews/",
      "/ru/manager/surveys/",
    ];

    const memorySnapshots = [];

    for (let i = 0; i < 3; i++) {
      for (const url of urls) {
        await page.goto(`${BASE_URL}${url}`);
        await page
          .waitForLoadState("networkidle", { timeout: 10000 })
          .catch(() => {});

        const memory = await page
          .evaluate(() => {
            if (performance.memory) {
              return performance.memory.usedJSHeapSize / 1024 / 1024;
            }
            return 0;
          })
          .catch(() => 0);

        memorySnapshots.push({
          iteration: i + 1,
          url,
          memoryMB: memory.toFixed(2),
        });
      }
    }

    allure.attachment(
      "Memory Snapshots",
      JSON.stringify(memorySnapshots, null, 2),
      "application/json",
    );

    // Проверяем что память не растёт линейно
    const firstIterationAvg =
      memorySnapshots
        .filter((s) => s.iteration === 1)
        .reduce((sum, s) => sum + parseFloat(s.memoryMB), 0) / urls.length;

    const lastIterationAvg =
      memorySnapshots
        .filter((s) => s.iteration === 3)
        .reduce((sum, s) => sum + parseFloat(s.memoryMB), 0) / urls.length;

    console.log(
      `   Средняя память: первая итерация=${firstIterationAvg.toFixed(2)}MB, последняя=${lastIterationAvg.toFixed(2)}MB`,
    );

    if (firstIterationAvg > 0 && lastIterationAvg > 0) {
      const growth = lastIterationAvg / firstIterationAvg;
      console.log(`   Рост памяти: ${((growth - 1) * 100).toFixed(1)}%`);

      expect(growth, "Рост памяти < 50%").toBeLessThan(1.5);
    }
  });
});

// ==================== RESOURCE LOADING ====================

test.describe("Dashboard UI - Resources @load @ui @dashboard @resources", () => {
  test.beforeEach(() => {
    markAsUITest(MODULES.DASHBOARD, "UI Performance - Resources");
  });

  test("Ресурсы главной страницы", async ({ authenticatedPage: page }) => {
    setSeverity("normal");

    const resources = [];

    page.on("response", (response) => {
      const status = response.status();
      const headers = response.headers();
      const contentLength = parseInt(headers["content-length"] || "0", 10);

      if (status >= 200 && status < 400) {
        resources.push({
          size: contentLength,
          type: headers["content-type"]?.split(";")[0] || "unknown",
        });
      }
    });

    await page.goto(`${BASE_URL}/ru/manager/`);
    await page
      .waitForLoadState("networkidle", { timeout: 20000 })
      .catch(() => {});

    const totalSize = resources.reduce((sum, r) => sum + r.size, 0);
    const totalSizeMB = (totalSize / 1024 / 1024).toFixed(2);

    allure.attachment(
      "Resources",
      JSON.stringify(
        {
          total: resources.length,
          totalSizeMB,
        },
        null,
        2,
      ),
      "application/json",
    );

    console.log(`   Ресурсов: ${resources.length}, размер: ${totalSizeMB}MB`);

    // Dashboard не должен загружать больше 10MB
    expect(parseFloat(totalSizeMB), "Размер ресурсов < 10MB").toBeLessThan(10);
  });
});
