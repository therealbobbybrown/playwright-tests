// @ts-check
import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";

/**
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: "./tests",
  globalSetup: "./global-setup.js",
  testIgnore: /_archived/, // исключаем архивные тесты глобально

  // Увеличиваем общий таймаут на тест (было 30s по умолчанию)
  timeout: 90_000,

  // Таймаут на expect/assertions (по умолчанию 5s)
  expect: {
    timeout: 10_000,
  },

  /* Run tests in files in parallel */
  fullyParallel: true,

  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,

  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,

  /* Параллельность: на CI 1 воркер, локально — 2 (изолированы через admin/admin2) */
  workers: process.env.CI ? 1 : 2,

  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    ["list"],
    ["html", { open: "never" }],
    // Allure reporter — отключается через ALLURE=0 (по умолчанию включён)
    ...(process.env.ALLURE === "0"
      ? []
      : [
          [
            "allure-playwright",
            {
              resultsDir: "allure-results",
              autoAttachScreenshots: true, // просим Allure забирать скрины
            },
          ],
        ]),
    // TestRail reporter — активируется только при TESTRAIL_REPORT=1
    ...(process.env.TESTRAIL_REPORT === "1"
      ? [["./testrail-playwright-reporter.cjs"]]
      : []),
  ],

  // Таймаут на завершение reporters (TestRail reporter может ждать последние API-ответы)
  teardownTimeout: 300_000,

  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: process.env.BASE_URL,

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: "on-first-retry",

    // ДЕЛАТЬ скриншот в конце КАЖДОГО теста (pass/fail), fullPage чтобы захватить проверяемый элемент
    screenshot: { mode: "on", fullPage: true },

    // Таймауты на отдельные действия/навигации (чтобы не упираться в дефолт)
    actionTimeout: 15_000,
    navigationTimeout: 30_000,

    // Чуть-чуть замедлить все действия Playwright
    launchOptions: {
      slowMo: 120, // 0.12 секунды между действиями
    },
  },

  /* Configure projects for major browsers */
  /* Структура: Директории = Модули, Теги = Характеристики
   * Теги типа: @api, @ui
   * Теги категории: @smoke, @regression, @negative, @e2e, @security
   * Теги модуля: @surveys, @feedback, @objectives, @performance-review, @org-structure
   */
  projects: [
    // ===== ПО ТИПУ =====
    // Все API тесты (без браузера): npx playwright test --project=api
    {
      name: "api",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: { slowMo: 0 },
        screenshot: "off", // API тесты — чистый HTTP, скриншот бесполезен
      },
      grep: /@api/,
      grepInvert: /@cleanup|@debug|@setup/,
      timeout: 60_000,
    },

    // Все UI тесты (с браузером): npx playwright test --project=ui
    {
      name: "ui",
      use: { ...devices["Desktop Chrome"] },
      grep: /@ui/,
      grepInvert: /@cleanup|@debug|@setup/,
      timeout: 90_000,
    },

    // UI в Firefox — для обхода проблем с Chromium/crashpad: npx playwright test --project=ui-firefox
    {
      name: 'ui-firefox',
      use: { ...devices['Desktop Firefox'] },
      grep: /@ui/,
      grepInvert: /@cleanup/,
      timeout: 90_000,
    },

    // UI в WebKit — запасной вариант, когда Chromium/Firefox падают
    {
      name: 'ui-webkit',
      use: { ...devices['Desktop Safari'] },
      grep: /@ui/,
      grepInvert: /@cleanup/,
      timeout: 90_000,
    },

    // ===== ПО КАТЕГОРИИ =====
    // Smoke тесты (быстрые критичные): npx playwright test --project=smoke
    {
      name: "smoke",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: { slowMo: 0 },
      },
      grep: /@smoke/,
      grepInvert: /@cleanup|@debug|@setup/,
      timeout: 60_000,
    },

    // Regression тесты (позитивные ключевые): npx playwright test --project=regression
    {
      name: "regression",
      use: { ...devices["Desktop Chrome"] },
      grep: /@regression/,
      grepInvert: /@cleanup|@debug|@setup/,
      timeout: 180_000,
      retries: process.env.CI ? 2 : 1, // 1 ретрай локально для transient staging failures
    },

    // Negative тесты (валидации): npx playwright test --project=negative
    {
      name: "negative",
      use: { ...devices["Desktop Chrome"] },
      grep: /@negative/,
      timeout: 60_000,
    },

    // E2E тесты (полные сценарии): npx playwright test --project=e2e
    {
      name: "e2e",
      use: { ...devices["Desktop Chrome"] },
      grep: /@e2e/,
      timeout: 180_000,
    },

    // Security тесты: npx playwright test --project=security
    {
      name: "security",
      use: {
        ...devices["Desktop Chrome"],
        screenshot: "only-on-failure",
        launchOptions: { slowMo: 0 },
        navigationTimeout: 15_000,
        actionTimeout: 10_000,
      },
      grep: /@security/,
      timeout: 5 * 60_000,
      expect: { timeout: 20_000 },
    },

    // ===== КОМБИНАЦИИ =====
    // Smoke API: npx playwright test --project=smoke-api
    {
      name: "smoke-api",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: { slowMo: 0 },
        screenshot: "off",
      },
      grep: /@api.*@smoke|@smoke.*@api/,
      timeout: 30_000,
      retries: 1,
    },

    // Smoke UI: npx playwright test --project=smoke-ui
    {
      name: "smoke-ui",
      use: { ...devices["Desktop Chrome"] },
      grep: /@ui.*@smoke|@smoke.*@ui/,
      timeout: 180_000,
      retries: 1,
    },

    // Regression API: npx playwright test --project=regression-api
    {
      name: "regression-api",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: { slowMo: 0 },
        screenshot: "off",
      },
      grep: /@api.*@regression|@regression.*@api/,
      timeout: 60_000,
    },

    // Regression UI: npx playwright test --project=regression-ui
    {
      name: "regression-ui",
      use: { ...devices["Desktop Chrome"] },
      grep: /@ui.*@regression|@regression.*@ui/,
      timeout: 180_000,
    },

    // Negative API: npx playwright test --project=negative-api
    {
      name: "negative-api",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: { slowMo: 0 },
        screenshot: "off",
      },
      grep: /@api.*@negative|@negative.*@api/,
      timeout: 60_000,
    },

    // Negative UI: npx playwright test --project=negative-ui
    {
      name: "negative-ui",
      use: { ...devices["Desktop Chrome"] },
      grep: /@ui.*@negative|@negative.*@ui/,
      timeout: 60_000,
    },

    // Sanity тесты (промежуточные, перед релизом): npx playwright test --project=sanity
    {
      name: "sanity",
      use: { ...devices["Desktop Chrome"] },
      grep: /@sanity/,
      grepInvert: /@cleanup|@debug|@setup/,
      timeout: 180_000,
      retries: 1,
    },

    // Sanity API: npx playwright test --project=sanity-api
    {
      name: "sanity-api",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: { slowMo: 0 },
        screenshot: "off",
      },
      grep: /@api.*@sanity|@sanity.*@api/,
      timeout: 60_000,
      retries: 1,
    },

    // ===== СПЕЦИАЛЬНЫЕ =====
    // Cleanup (по явному запросу): RUN_CLEANUP=1 npx playwright test --project=cleanup
    {
      name: "cleanup",
      use: { ...devices["Desktop Chrome"] },
      grep: /@cleanup/,
      timeout: 300_000,
    },

    // Nightly (всё кроме cleanup/debug/setup): npx playwright test --project=nightly
    {
      name: "nightly",
      use: { ...devices["Desktop Chrome"] },
      grepInvert: /@cleanup|@debug|@setup/,
      timeout: 180_000,
    },

    // ===== НАГРУЗОЧНЫЕ ТЕСТЫ =====
    // Load тесты (отдельно от функциональных): npx playwright test --project=load
    {
      name: "load",
      testDir: "./tests/load",
      testMatch: "**/*.spec.js",
      use: {
        ...devices["Desktop Chrome"],
        trace: "off", // Отключаем trace для производительности
        video: "off",
        screenshot: "off",
        launchOptions: { slowMo: 0 },
      },
      timeout: 300_000, // 5 минут на тест
      retries: 0, // Нет ретраев для load тестов
      workers: 1, // Последовательное выполнение
    },

    // Baseline тесты: npx playwright test --project=load-baseline
    {
      name: "load-baseline",
      testDir: "./tests/load/baseline",
      testMatch: "**/*.spec.js",
      use: {
        ...devices["Desktop Chrome"],
        trace: "off",
        video: "off",
        screenshot: "off",
        launchOptions: { slowMo: 0 },
      },
      timeout: 180_000,
      retries: 0,
      workers: 1,
    },

    // Volume тесты: npx playwright test --project=load-volume
    {
      name: "load-volume",
      testDir: "./tests/load/volume",
      testMatch: "**/*.spec.js",
      use: {
        ...devices["Desktop Chrome"],
        trace: "off",
        video: "off",
        screenshot: "off",
        launchOptions: { slowMo: 0 },
      },
      timeout: 300_000,
      retries: 0,
      workers: 1,
    },

    // Stress тесты: npx playwright test --project=load-stress
    {
      name: "load-stress",
      testDir: "./tests/load/stress",
      testMatch: "**/*.spec.js",
      use: {
        ...devices["Desktop Chrome"],
        trace: "off",
        video: "off",
        screenshot: "off",
        launchOptions: { slowMo: 0 },
      },
      timeout: 600_000, // 10 минут
      retries: 0,
      workers: 1,
    },

    // UI Performance тесты: npx playwright test --project=load-ui
    {
      name: "load-ui",
      testDir: "./tests/load/ui",
      testMatch: "**/*.spec.js",
      use: {
        ...devices["Desktop Chrome"],
        trace: "off",
        video: "off",
        screenshot: "only-on-failure",
      },
      timeout: 300_000,
      retries: 0,
      workers: 1,
    },
  ],
});
