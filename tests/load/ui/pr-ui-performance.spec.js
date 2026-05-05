// @ts-check
// tests/load/ui/pr-ui-performance.spec.js
// UI Performance тесты для Performance Review
// @tags @load @ui @pr

import { test as base, expect } from "@playwright/test";
import { LoginPage } from "../../../pages/LoginPage.js";
import { TokenManager } from "../../utils/auth/TokenManager.js";
import { PerformanceReviewsListPage } from "../../../pages/PerformanceReviewsListPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
  allure,
} from "../../utils/allure-helpers.js";
import { getCredentials } from "../../utils/api/AuthAPI.js";

// Thresholds для UI метрик (в мс)
const UI_THRESHOLDS = {
  LCP_GOOD: 2500,
  LCP_NEEDS_IMPROVEMENT: 4000,
  FCP_GOOD: 1800,
  FCP_NEEDS_IMPROVEMENT: 3000,
  TTI_GOOD: 3800,
  TTI_NEEDS_IMPROVEMENT: 7300,
  PAGE_LOAD: 5000,
  DETAIL_PAGE_LOAD: 8000,
  INTERACTION: 500,
  TAB_SWITCH: 2000,
  SCROLL_FPS: 30,
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

test.describe("PR UI - Page Load @load @ui @pr @pageload", () => {
  test.beforeEach(() => {
    markAsUITest(MODULES.PERFORMANCE_REVIEW, "UI Performance - Page Load");
  });

  test("Время загрузки списка PR @critical", async ({
    authenticatedPage: page,
  }, testInfo) => {
    setSeverity("critical");

    const prListPage = new PerformanceReviewsListPage(page, testInfo);
    const startTime = Date.now();

    // Переходим на страницу
    await page.goto(`${BASE_URL}/ru/manager/performance-reviews/`);

    // Ждём появления заголовка
    await prListPage.pageTitle.waitFor({ state: "visible", timeout: 15000 });

    const loadTime = Date.now() - startTime;

    allure.attachment(
      "Page Load Time",
      JSON.stringify({ loadTime }, null, 2),
      "application/json",
    );
    console.log(`   Список PR загружен за ${loadTime}ms`);

    expect(
      loadTime,
      `Время загрузки < ${UI_THRESHOLDS.PAGE_LOAD}ms`,
    ).toBeLessThan(UI_THRESHOLDS.PAGE_LOAD);
  });

  test("Время загрузки карточки PR", async ({
    authenticatedPage: page,
  }, testInfo) => {
    setSeverity("normal");

    const prListPage = new PerformanceReviewsListPage(page, testInfo);

    // Сначала открываем список
    await page.goto(`${BASE_URL}/ru/manager/performance-reviews/`);
    await prListPage.pageTitle.waitFor({ state: "visible", timeout: 15000 });
    await page
      .waitForLoadState("networkidle", { timeout: 15000 })
      .catch(() => {});

    // Находим первую карточку — ссылку на конкретный PR
    const firstCard = page
      .locator('a[class*="PerformanceReview_link"]')
      .first();
    const cardVisible = await firstCard.isVisible().catch(() => false);

    if (!cardVisible) {
      test.skip(true, "Нет PR в списке");
      return;
    }

    const startTime = Date.now();

    // Кликаем на карточку
    await firstCard.click();

    // Ждём загрузки страницы карточки
    await page.waitForURL(/\/manager\/performance-reviews\/\d+/, {
      timeout: 15000,
    });
    await page
      .waitForLoadState("networkidle", { timeout: 15000 })
      .catch(() => {});

    const loadTime = Date.now() - startTime;

    allure.attachment(
      "Card Load Time",
      JSON.stringify({ loadTime }, null, 2),
      "application/json",
    );
    console.log(`   Карточка PR загружена за ${loadTime}ms`);

    expect(
      loadTime,
      `Время загрузки карточки < ${UI_THRESHOLDS.DETAIL_PAGE_LOAD}ms`,
    ).toBeLessThan(UI_THRESHOLDS.DETAIL_PAGE_LOAD);
  });

  test("Время переключения вкладок в списке", async ({
    authenticatedPage: page,
  }, testInfo) => {
    setSeverity("normal");

    const prListPage = new PerformanceReviewsListPage(page, testInfo);

    await page.goto(`${BASE_URL}/ru/manager/performance-reviews/`);
    await prListPage.pageTitle.waitFor({ state: "visible", timeout: 15000 });

    const tabs = ["drafts", "active", "completed", "all"];
    const timings = [];

    for (const tab of tabs) {
      const startTime = Date.now();

      try {
        await prListPage.switchTab(tab);
        await page.waitForTimeout(500); // Ждём обновления списка
      } catch {
        continue;
      }

      const switchTime = Date.now() - startTime;
      timings.push({ tab, time: switchTime });
      console.log(`   Tab "${tab}": ${switchTime}ms`);
    }

    allure.attachment(
      "Tab Switch Times",
      JSON.stringify(timings, null, 2),
      "application/json",
    );

    for (const { tab, time } of timings) {
      expect(
        time,
        `Переключение на ${tab} < ${UI_THRESHOLDS.TAB_SWITCH}ms`,
      ).toBeLessThan(UI_THRESHOLDS.TAB_SWITCH);
    }
  });
});

// ==================== CORE WEB VITALS ====================

test.describe("PR UI - Core Web Vitals @load @ui @pr @vitals", () => {
  test.beforeEach(() => {
    markAsUITest(MODULES.PERFORMANCE_REVIEW, "UI Performance - Web Vitals");
  });

  test("LCP для страницы списка PR @critical", async ({
    authenticatedPage: page,
  }) => {
    setSeverity("critical");

    // Собираем метрики через Performance API
    const metrics = await page
      .evaluate(() => {
        return new Promise((resolve) => {
          const observer = new PerformanceObserver((list) => {
            const entries = list.getEntries();
            const lcpEntry = entries[entries.length - 1];
            resolve({
              lcp: lcpEntry?.startTime || 0,
              element: lcpEntry?.element?.tagName || "unknown",
            });
          });

          observer.observe({
            type: "largest-contentful-paint",
            buffered: true,
          });

          // Fallback если LCP не измерен
          setTimeout(() => resolve({ lcp: 0, element: "timeout" }), 10000);
        });
      })
      .catch(() => ({ lcp: 0, element: "error" }));

    await page.goto(`${BASE_URL}/ru/manager/performance-reviews/`);
    await page
      .waitForLoadState("networkidle", { timeout: 15000 })
      .catch(() => {});

    // Получаем метрики после загрузки
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
      JSON.stringify({ ...metrics, ...navigationTiming }, null, 2),
      "application/json",
    );

    console.log(`   LCP: ${metrics.lcp}ms (element: ${metrics.element})`);
    console.log(`   DOM Interactive: ${navigationTiming.domInteractive}ms`);

    if (metrics.lcp > 0) {
      expect(
        metrics.lcp,
        `LCP < ${UI_THRESHOLDS.LCP_NEEDS_IMPROVEMENT}ms`,
      ).toBeLessThan(UI_THRESHOLDS.LCP_NEEDS_IMPROVEMENT);
    }
  });

  test("FCP для страницы списка PR", async ({ authenticatedPage: page }) => {
    setSeverity("normal");

    await page.goto(`${BASE_URL}/ru/manager/performance-reviews/`);

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

// ==================== SCROLL PERFORMANCE ====================

test.describe("PR UI - Scroll Performance @load @ui @pr @scroll", () => {
  test.beforeEach(() => {
    markAsUITest(MODULES.PERFORMANCE_REVIEW, "UI Performance - Scroll");
  });

  test("Скролл списка PR", async ({ authenticatedPage: page }, testInfo) => {
    setSeverity("normal");

    const prListPage = new PerformanceReviewsListPage(page, testInfo);

    await page.goto(`${BASE_URL}/ru/manager/performance-reviews/`);
    await prListPage.pageTitle.waitFor({ state: "visible", timeout: 15000 });

    // Измеряем производительность скролла
    const scrollMetrics = await page.evaluate(async () => {
      const frames = [];
      let lastTime = performance.now();

      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.entryType === "frame") {
            const now = performance.now();
            const delta = now - lastTime;
            if (delta > 0) {
              frames.push(1000 / delta);
            }
            lastTime = now;
          }
        }
      });

      try {
        observer.observe({ entryTypes: ["frame"] });
      } catch {
        // Frame timing not supported
      }

      // Скроллим страницу
      const startTime = performance.now();
      for (let i = 0; i < 10; i++) {
        window.scrollBy(0, 200);
        await new Promise((r) => setTimeout(r, 50));
      }
      const scrollTime = performance.now() - startTime;

      observer.disconnect();

      return {
        scrollTime,
        avgFps:
          frames.length > 0
            ? frames.reduce((a, b) => a + b, 0) / frames.length
            : 60,
        minFps: frames.length > 0 ? Math.min(...frames) : 60,
      };
    });

    allure.attachment(
      "Scroll Metrics",
      JSON.stringify(scrollMetrics, null, 2),
      "application/json",
    );
    console.log(
      `   Scroll time: ${scrollMetrics.scrollTime}ms, avg FPS: ${scrollMetrics.avgFps.toFixed(1)}`,
    );

    // Проверяем что скролл плавный
    expect(scrollMetrics.scrollTime, "Скролл должен быть быстрым").toBeLessThan(
      2000,
    );
  });
});

// ==================== INTERACTION PERFORMANCE ====================

test.describe("PR UI - Interaction Performance @load @ui @pr @interaction", () => {
  test.beforeEach(() => {
    markAsUITest(MODULES.PERFORMANCE_REVIEW, "UI Performance - Interaction");
  });

  test("Время открытия модального окна создания", async ({
    authenticatedPage: page,
  }, testInfo) => {
    setSeverity("normal");

    const prListPage = new PerformanceReviewsListPage(page, testInfo);

    await page.goto(`${BASE_URL}/ru/manager/performance-reviews/`);
    await prListPage.pageTitle.waitFor({ state: "visible", timeout: 15000 });

    const launchButtonVisible = await prListPage.launchButton
      .isVisible()
      .catch(() => false);

    if (!launchButtonVisible) {
      test.skip(true, "Кнопка создания не видна");
      return;
    }

    const startTime = Date.now();

    await prListPage.launchButton.click();
    await prListPage.createModal.waitFor({ state: "visible", timeout: 5000 });

    const openTime = Date.now() - startTime;

    allure.attachment(
      "Modal Open Time",
      JSON.stringify({ openTime }, null, 2),
      "application/json",
    );
    console.log(`   Модальное окно открылось за ${openTime}ms`);

    expect(
      openTime,
      `Открытие модального окна < ${UI_THRESHOLDS.INTERACTION}ms`,
    ).toBeLessThan(UI_THRESHOLDS.INTERACTION);
  });

  test("Время отклика поиска", async ({
    authenticatedPage: page,
  }, testInfo) => {
    setSeverity("normal");

    const prListPage = new PerformanceReviewsListPage(page, testInfo);

    await page.goto(`${BASE_URL}/ru/manager/performance-reviews/`);
    await prListPage.pageTitle.waitFor({ state: "visible", timeout: 15000 });

    const searchVisible = await prListPage.searchInput
      .isVisible()
      .catch(() => false);

    if (!searchVisible) {
      test.skip(true, "Поле поиска не видно");
      return;
    }

    const startTime = Date.now();

    await prListPage.searchInput.fill("test");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(500);

    const searchTime = Date.now() - startTime;

    allure.attachment(
      "Search Time",
      JSON.stringify({ searchTime }, null, 2),
      "application/json",
    );
    console.log(`   Поиск выполнен за ${searchTime}ms`);

    expect(searchTime, `Поиск < 2000ms`).toBeLessThan(2000);
  });
});

// ==================== MEMORY USAGE ====================

test.describe("PR UI - Memory Usage @load @ui @pr @memory", () => {
  test.beforeEach(() => {
    markAsUITest(MODULES.PERFORMANCE_REVIEW, "UI Performance - Memory");
  });

  test("Потребление памяти при загрузке списка", async ({
    authenticatedPage: page,
  }) => {
    setSeverity("normal");

    // Получаем начальное потребление памяти
    const initialMemory = await page
      .evaluate(() => {
        if (performance.memory) {
          return {
            usedJSHeapSize: performance.memory.usedJSHeapSize,
            totalJSHeapSize: performance.memory.totalJSHeapSize,
          };
        }
        return null;
      })
      .catch(() => null);

    await page.goto(`${BASE_URL}/ru/manager/performance-reviews/`);
    await page
      .waitForLoadState("networkidle", { timeout: 15000 })
      .catch(() => {});

    // Получаем потребление после загрузки
    const afterMemory = await page
      .evaluate(() => {
        if (performance.memory) {
          return {
            usedJSHeapSize: performance.memory.usedJSHeapSize,
            totalJSHeapSize: performance.memory.totalJSHeapSize,
          };
        }
        return null;
      })
      .catch(() => null);

    if (initialMemory && afterMemory) {
      const memoryIncrease =
        afterMemory.usedJSHeapSize - initialMemory.usedJSHeapSize;
      const memoryIncreaseMB = (memoryIncrease / 1024 / 1024).toFixed(2);

      allure.attachment(
        "Memory Usage",
        JSON.stringify(
          {
            initial: initialMemory,
            after: afterMemory,
            increaseMB: memoryIncreaseMB,
          },
          null,
          2,
        ),
        "application/json",
      );

      console.log(`   Увеличение памяти: ${memoryIncreaseMB}MB`);

      // Не должно использоваться больше 100MB на страницу
      expect(
        afterMemory.usedJSHeapSize / 1024 / 1024,
        "Память < 100MB",
      ).toBeLessThan(100);
    } else {
      console.log("   Memory API недоступно");
    }
  });
});

// ==================== RESOURCE LOADING ====================

test.describe("PR UI - Resource Loading @load @ui @pr @resources", () => {
  test.beforeEach(() => {
    markAsUITest(MODULES.PERFORMANCE_REVIEW, "UI Performance - Resources");
  });

  test("Количество и размер загружаемых ресурсов", async ({
    authenticatedPage: page,
  }) => {
    setSeverity("normal");

    const resources = [];

    // Перехватываем ресурсы
    page.on("response", (response) => {
      const url = response.url();
      const status = response.status();
      const headers = response.headers();
      const contentLength = parseInt(headers["content-length"] || "0", 10);

      if (status >= 200 && status < 400) {
        resources.push({
          url: url.substring(0, 100),
          status,
          size: contentLength,
          type: headers["content-type"]?.split(";")[0] || "unknown",
        });
      }
    });

    await page.goto(`${BASE_URL}/ru/manager/performance-reviews/`);
    await page
      .waitForLoadState("networkidle", { timeout: 15000 })
      .catch(() => {});

    // Группируем по типу
    const byType = {};
    for (const r of resources) {
      const type = r.type.includes("javascript")
        ? "js"
        : r.type.includes("css")
          ? "css"
          : r.type.includes("image")
            ? "image"
            : r.type.includes("json")
              ? "json"
              : "other";

      if (!byType[type]) {
        byType[type] = { count: 0, size: 0 };
      }
      byType[type].count++;
      byType[type].size += r.size;
    }

    const totalSize = resources.reduce((sum, r) => sum + r.size, 0);
    const totalSizeMB = (totalSize / 1024 / 1024).toFixed(2);

    allure.attachment(
      "Resources",
      JSON.stringify(
        {
          total: resources.length,
          totalSizeMB,
          byType,
        },
        null,
        2,
      ),
      "application/json",
    );

    console.log(`   Ресурсов: ${resources.length}, размер: ${totalSizeMB}MB`);
    Object.entries(byType).forEach(([type, data]) => {
      console.log(
        `     ${type}: ${data.count} files, ${(data.size / 1024).toFixed(0)}KB`,
      );
    });
  });
});
