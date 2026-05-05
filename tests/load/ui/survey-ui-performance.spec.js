// @ts-check
// tests/load/ui/survey-ui-performance.spec.js
// UI Performance тесты для Survey
// @tags @load @ui @survey

import { test as base, expect } from "@playwright/test";
import { LoginPage } from "../../../pages/LoginPage.js";
import { TokenManager } from "../../utils/auth/TokenManager.js";
import { SurveysListPage } from "../../../pages/SurveysListPage.js";
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
  DETAIL_PAGE_LOAD: 8000,
  LCP_NEEDS_IMPROVEMENT: 4000,
  FCP_NEEDS_IMPROVEMENT: 3000,
  INTERACTION: 500,
  CHART_RENDER: 2000,
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

test.describe("Survey UI - Page Load @load @ui @survey @pageload", () => {
  test.beforeEach(() => {
    markAsUITest(MODULES.SURVEY, "UI Performance - Page Load");
  });

  test("Время загрузки списка опросов @critical", async ({
    authenticatedPage: page,
  }, testInfo) => {
    setSeverity("critical");

    const surveysPage = new SurveysListPage(page, testInfo);
    const startTime = Date.now();

    await page.goto(`${BASE_URL}/ru/manager/company/surveys/`);

    // Ждём появления заголовка
    await surveysPage.title
      .waitFor({ state: "visible", timeout: 15000 })
      .catch(() => {});

    const loadTime = Date.now() - startTime;

    allure.attachment(
      "Page Load Time",
      JSON.stringify({ loadTime }, null, 2),
      "application/json",
    );
    console.log(`   Список опросов загружен за ${loadTime}ms`);

    expect(
      loadTime,
      `Время загрузки < ${UI_THRESHOLDS.PAGE_LOAD}ms`,
    ).toBeLessThan(UI_THRESHOLDS.PAGE_LOAD);
  });

  test("Время загрузки страницы результатов опроса", async ({
    authenticatedPage: page,
  }, testInfo) => {
    setSeverity("critical");

    const surveysPage = new SurveysListPage(page, testInfo);

    await page.goto(`${BASE_URL}/ru/manager/company/surveys/`);
    await surveysPage.title
      .waitFor({ state: "visible", timeout: 15000 })
      .catch(() => {});

    // Находим первый опрос
    const firstCard = surveysPage.surveyCards.first();
    const cardVisible = await firstCard.isVisible().catch(() => false);

    if (!cardVisible) {
      test.skip(true, "Нет опросов в списке");
      return;
    }

    const startTime = Date.now();

    await firstCard.click();
    await page.waitForURL(/\/manager\/company\/surveys\/\d+/, {
      timeout: 15000,
    });
    await page
      .waitForLoadState("networkidle", { timeout: 15000 })
      .catch(() => {});

    const loadTime = Date.now() - startTime;

    allure.attachment(
      "Survey Detail Load",
      JSON.stringify({ loadTime }, null, 2),
      "application/json",
    );
    console.log(`   Страница опроса загружена за ${loadTime}ms`);

    expect(
      loadTime,
      `Время загрузки < ${UI_THRESHOLDS.DETAIL_PAGE_LOAD}ms`,
    ).toBeLessThan(UI_THRESHOLDS.DETAIL_PAGE_LOAD);
  });

  test("Время загрузки страницы шаблонов", async ({
    authenticatedPage: page,
  }) => {
    setSeverity("normal");

    const startTime = Date.now();

    await page.goto(`${BASE_URL}/ru/manager/company/surveys/templates/`);
    await page
      .waitForLoadState("networkidle", { timeout: 15000 })
      .catch(() => {});

    const loadTime = Date.now() - startTime;

    allure.attachment(
      "Templates Load",
      JSON.stringify({ loadTime }, null, 2),
      "application/json",
    );
    console.log(`   Страница шаблонов загружена за ${loadTime}ms`);

    expect(
      loadTime,
      `Время загрузки < ${UI_THRESHOLDS.PAGE_LOAD}ms`,
    ).toBeLessThan(UI_THRESHOLDS.PAGE_LOAD);
  });
});

// ==================== CORE WEB VITALS ====================

test.describe("Survey UI - Core Web Vitals @load @ui @survey @vitals", () => {
  test.beforeEach(() => {
    markAsUITest(MODULES.SURVEY, "UI Performance - Web Vitals");
  });

  test("LCP для страницы списка опросов @critical", async ({
    authenticatedPage: page,
  }) => {
    setSeverity("critical");

    await page.goto(`${BASE_URL}/ru/manager/company/surveys/`);
    await page
      .waitForLoadState("networkidle", { timeout: 15000 })
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
      ).toBeLessThan(UI_THRESHOLDS.LCP_NEEDS_IMPROVEMENT);
    }
  });

  test("FCP для страницы списка опросов", async ({
    authenticatedPage: page,
  }) => {
    setSeverity("normal");

    await page.goto(`${BASE_URL}/ru/manager/company/surveys/`);

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

// ==================== STATISTICS RENDERING ====================

test.describe("Survey UI - Statistics Rendering @load @ui @survey @statistics", () => {
  test.beforeEach(() => {
    markAsUITest(MODULES.SURVEY, "UI Performance - Statistics");
  });

  test("Время рендера страницы результатов", async ({
    authenticatedPage: page,
  }, testInfo) => {
    setSeverity("critical");

    const surveysPage = new SurveysListPage(page, testInfo);

    await page.goto(`${BASE_URL}/ru/manager/company/surveys/`);
    await surveysPage.title
      .waitFor({ state: "visible", timeout: 15000 })
      .catch(() => {});

    const firstCard = surveysPage.surveyCards.first();
    const cardVisible = await firstCard.isVisible().catch(() => false);

    if (!cardVisible) {
      test.skip(true, "Нет опросов");
      return;
    }

    await firstCard.click();
    await page.waitForURL(/\/manager\/company\/surveys\/\d+/, {
      timeout: 15000,
    });

    // Переходим на вкладку результатов
    const resultsTab = page
      .getByRole("tab", { name: /результаты|statistics|results/i })
      .first();
    const hasResultsTab = await resultsTab.isVisible().catch(() => false);

    if (!hasResultsTab) {
      console.log("   Вкладка результатов недоступна");
      return;
    }

    const startTime = Date.now();

    await resultsTab.click();
    await page
      .waitForLoadState("networkidle", { timeout: 15000 })
      .catch(() => {});

    const renderTime = Date.now() - startTime;

    allure.attachment(
      "Results Render",
      JSON.stringify({ renderTime }, null, 2),
      "application/json",
    );
    console.log(`   Результаты отрендерены за ${renderTime}ms`);

    expect(
      renderTime,
      `Рендер результатов < ${UI_THRESHOLDS.PAGE_LOAD}ms`,
    ).toBeLessThan(UI_THRESHOLDS.PAGE_LOAD);
  });

  test("Время рендера графиков статистики", async ({
    authenticatedPage: page,
  }, testInfo) => {
    setSeverity("normal");

    const surveysPage = new SurveysListPage(page, testInfo);

    await page.goto(`${BASE_URL}/ru/manager/company/surveys/`);
    await surveysPage.title
      .waitFor({ state: "visible", timeout: 15000 })
      .catch(() => {});

    const firstCard = surveysPage.surveyCards.first();
    const cardVisible = await firstCard.isVisible().catch(() => false);

    if (!cardVisible) {
      test.skip(true, "Нет опросов");
      return;
    }

    await firstCard.click();
    await page.waitForURL(/\/manager\/company\/surveys\/\d+/, {
      timeout: 15000,
    });
    await page
      .waitForLoadState("networkidle", { timeout: 15000 })
      .catch(() => {});

    // Ищем графики/чарты на странице
    const charts = page.locator(
      'canvas, svg[class*="chart"], [class*="Chart"], [class*="graph"]',
    );
    const chartsCount = await charts.count();

    allure.attachment(
      "Charts Found",
      JSON.stringify({ chartsCount }, null, 2),
      "application/json",
    );
    console.log(`   Найдено графиков: ${chartsCount}`);

    if (chartsCount > 0) {
      // Проверяем что графики видимы
      const firstChart = charts.first();
      await expect(firstChart).toBeVisible({
        timeout: UI_THRESHOLDS.CHART_RENDER,
      });
    }
  });
});

// ==================== SCROLL PERFORMANCE ====================

test.describe("Survey UI - Scroll Performance @load @ui @survey @scroll", () => {
  test.beforeEach(() => {
    markAsUITest(MODULES.SURVEY, "UI Performance - Scroll");
  });

  test("Скролл списка опросов", async ({
    authenticatedPage: page,
  }, testInfo) => {
    setSeverity("normal");

    const surveysPage = new SurveysListPage(page, testInfo);

    await page.goto(`${BASE_URL}/ru/manager/company/surveys/`);
    await surveysPage.title
      .waitFor({ state: "visible", timeout: 15000 })
      .catch(() => {});

    const scrollMetrics = await page.evaluate(async () => {
      const startTime = performance.now();

      for (let i = 0; i < 10; i++) {
        window.scrollBy(0, 200);
        await new Promise((r) => setTimeout(r, 50));
      }

      const scrollTime = performance.now() - startTime;

      return { scrollTime };
    });

    allure.attachment(
      "Scroll Metrics",
      JSON.stringify(scrollMetrics, null, 2),
      "application/json",
    );
    console.log(`   Scroll time: ${scrollMetrics.scrollTime}ms`);

    expect(scrollMetrics.scrollTime, "Скролл должен быть быстрым").toBeLessThan(
      2000,
    );
  });
});

// ==================== INTERACTION PERFORMANCE ====================

test.describe("Survey UI - Interaction Performance @load @ui @survey @interaction", () => {
  test.beforeEach(() => {
    markAsUITest(MODULES.SURVEY, "UI Performance - Interaction");
  });

  test("Время переключения вкладок", async ({
    authenticatedPage: page,
  }, testInfo) => {
    setSeverity("normal");

    const surveysPage = new SurveysListPage(page, testInfo);

    await page.goto(`${BASE_URL}/ru/manager/company/surveys/`);
    await surveysPage.title
      .waitFor({ state: "visible", timeout: 15000 })
      .catch(() => {});

    // Переключаемся между вкладками
    const tabs = ["active", "draft", "stopped", "all"];
    const timings = [];

    for (const tab of tabs) {
      const tabButton = page
        .getByRole("tab", { name: new RegExp(tab, "i") })
        .first();
      const tabVisible = await tabButton.isVisible().catch(() => false);

      if (!tabVisible) continue;

      const startTime = Date.now();

      await tabButton.click();
      await page.waitForTimeout(300);

      const switchTime = Date.now() - startTime;
      timings.push({ tab, time: switchTime });
    }

    allure.attachment(
      "Tab Switch Times",
      JSON.stringify(timings, null, 2),
      "application/json",
    );
    timings.forEach((t) => console.log(`   Tab "${t.tab}": ${t.time}ms`));
  });

  test("Время открытия модального окна создания", async ({
    authenticatedPage: page,
  }, testInfo) => {
    setSeverity("normal");

    const surveysPage = new SurveysListPage(page, testInfo);

    await page.goto(`${BASE_URL}/ru/manager/company/surveys/`);
    await surveysPage.title
      .waitFor({ state: "visible", timeout: 15000 })
      .catch(() => {});

    const createButton = surveysPage.createSurveyButton;
    const buttonVisible = await createButton.isVisible().catch(() => false);

    if (!buttonVisible) {
      test.skip(true, "Кнопка создания не видна");
      return;
    }

    const startTime = Date.now();

    await createButton.click();
    await page.waitForTimeout(500);

    const openTime = Date.now() - startTime;

    allure.attachment(
      "Modal Open Time",
      JSON.stringify({ openTime }, null, 2),
      "application/json",
    );
    console.log(`   Модальное окно открылось за ${openTime}ms`);

    expect(
      openTime,
      `Открытие < ${UI_THRESHOLDS.INTERACTION * 2}ms`,
    ).toBeLessThan(UI_THRESHOLDS.INTERACTION * 2);
  });
});

// ==================== MEMORY USAGE ====================

test.describe("Survey UI - Memory Usage @load @ui @survey @memory", () => {
  test.beforeEach(() => {
    markAsUITest(MODULES.SURVEY, "UI Performance - Memory");
  });

  test("Потребление памяти при загрузке", async ({
    authenticatedPage: page,
  }) => {
    setSeverity("normal");

    await page.goto(`${BASE_URL}/ru/manager/company/surveys/`);
    await page
      .waitForLoadState("networkidle", { timeout: 15000 })
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
        "Memory Usage",
        JSON.stringify(memory, null, 2),
        "application/json",
      );
      console.log(`   Используется памяти: ${memory.usedJSHeapSizeMB}MB`);

      expect(
        parseFloat(memory.usedJSHeapSizeMB),
        "Память < 100MB",
      ).toBeLessThan(100);
    } else {
      console.log("   Memory API недоступно");
    }
  });
});

// ==================== RESOURCE LOADING ====================

test.describe("Survey UI - Resource Loading @load @ui @survey @resources", () => {
  test.beforeEach(() => {
    markAsUITest(MODULES.SURVEY, "UI Performance - Resources");
  });

  test("Количество и размер ресурсов", async ({ authenticatedPage: page }) => {
    setSeverity("normal");

    const resources = [];

    page.on("response", (response) => {
      const url = response.url();
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

    await page.goto(`${BASE_URL}/ru/manager/company/surveys/`);
    await page
      .waitForLoadState("networkidle", { timeout: 15000 })
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
  });
});
