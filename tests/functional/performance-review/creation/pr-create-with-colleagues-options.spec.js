// tests/functional/performance-review/creation/create-with-colleagues-options.spec.js
// Тесты создания Performance Review с различными настройками подбора коллег
import { test } from "../../../fixtures/auth.js";
import { PerformanceReviewsListPage } from "../../../../pages/PerformanceReviewsListPage.js";
import { PerformanceReviewConfigPage } from "../../../../pages/PerformanceReviewConfigPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";

test.describe(
  "Performance Review - настройки подбора коллег",
  {
    tag: [
      "@performance-review",
      "@creation",
      "@colleagues",
      "@ui",
      "@regression",
    ],
  },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.PERFORMANCE_REVIEW, "Creation");
    });

    test(
      "C2994: Создать PR с базовым подбором коллег (без доп. опций)",
      { tag: ["@high"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("normal");
        test.slow();
        testInfo.setTimeout(300_000);

        const listPage = new PerformanceReviewsListPage(page, testInfo);
        const configPage = new PerformanceReviewConfigPage(page, testInfo);

        await test.step('Создать Performance Review с направлением "От коллег"', async () => {
          const baseUrl = new URL(process.env.BASE_URL).origin;
          await page.goto(
            new URL("/ru/manager/performance-reviews/", baseUrl).toString(),
          );
          await listPage.assertOpened();

          await listPage.openCreateModal();
          await listPage.performanceReviewType.click();
          await configPage.assertOpened();

          // Включить направление "От коллег"
          await configPage.configureDirections({
            self: true,
            manager: true,
            colleagues: true,
            subordinates: false,
          });
        });

        await test.step("Настроить базовый подбор коллег (спросить сотрудников)", async () => {
          await configPage.configureColleaguesSelection({
            askEmployees: true,
            minColleagues: 2,
            maxColleagues: 5,
            managerApproval: false,
            earlyAccess: false,
          });

          await page.screenshot({
            path: "test-results/colleagues-basic.png",
            fullPage: true,
          });
        });

        await test.step("Добавить участников и анкеты, запустить", async () => {
          await configPage.addTargetUsers({ count: 1 });
          await configPage.disableReminders();
          await configPage.addAssessmentsForAllDirections();
          await configPage.goToStep("launch");
          await configPage.launch();

          await page.waitForLoadState("networkidle");

          const currentUrl = page.url();
          console.log("✓ Performance Review создан:", currentUrl);
        });
      },
    );

    test(
      "C2995: Создать PR с проверкой коллег руководителем",
      { tag: ["@high"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("normal");
        test.slow();
        testInfo.setTimeout(300_000);

        const listPage = new PerformanceReviewsListPage(page, testInfo);
        const configPage = new PerformanceReviewConfigPage(page, testInfo);

        await test.step("Создать Performance Review", async () => {
          const baseUrl = new URL(process.env.BASE_URL).origin;
          await page.goto(
            new URL("/ru/manager/performance-reviews/", baseUrl).toString(),
          );
          await listPage.assertOpened();

          await listPage.openCreateModal();
          await listPage.performanceReviewType.click();
          await configPage.assertOpened();

          await configPage.configureDirections({
            self: true,
            manager: true,
            colleagues: true,
            subordinates: false,
          });
        });

        await test.step("Настроить подбор коллег С ПРОВЕРКОЙ руководителем", async () => {
          await configPage.configureColleaguesSelection({
            askEmployees: true,
            minColleagues: 3,
            maxColleagues: 7,
            managerApproval: true, // ← Включить проверку
            earlyAccess: false,
          });

          await page.screenshot({
            path: "test-results/colleagues-manager-approval.png",
            fullPage: true,
          });
        });

        await test.step("Завершить настройку и запустить", async () => {
          await configPage.addTargetUsers({ count: 1 });
          await configPage.disableReminders();
          await configPage.addAssessmentsForAllDirections();
          await configPage.goToStep("launch");
          await configPage.launch();

          await page.waitForLoadState("networkidle");

          const currentUrl = page.url();
          console.log(
            "✓ Performance Review с проверкой руководителем создан:",
            currentUrl,
          );
        });
      },
    );

    test(
      "C2996: Создать PR с ранним доступом к анкетам",
      { tag: ["@high"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("normal");
        test.slow();
        testInfo.setTimeout(300_000);

        const listPage = new PerformanceReviewsListPage(page, testInfo);
        const configPage = new PerformanceReviewConfigPage(page, testInfo);

        await test.step("Создать Performance Review", async () => {
          const baseUrl = new URL(process.env.BASE_URL).origin;
          await page.goto(
            new URL("/ru/manager/performance-reviews/", baseUrl).toString(),
          );
          await listPage.assertOpened();

          await listPage.openCreateModal();
          await listPage.performanceReviewType.click();
          await configPage.assertOpened();

          await configPage.configureDirections({
            self: true,
            manager: true,
            colleagues: true,
            subordinates: false,
          });
        });

        await test.step("Настроить подбор коллег С РАННИМ ДОСТУПОМ", async () => {
          await configPage.configureColleaguesSelection({
            askEmployees: true,
            minColleagues: 2,
            maxColleagues: 5,
            managerApproval: false,
            earlyAccess: true, // ← Включить ранний доступ
          });

          await page.screenshot({
            path: "test-results/colleagues-early-access.png",
            fullPage: true,
          });
        });

        await test.step("Завершить настройку и запустить", async () => {
          await configPage.addTargetUsers({ count: 1 });
          await configPage.disableReminders();
          await configPage.addAssessmentsForAllDirections();
          await configPage.goToStep("launch");
          await configPage.launch();

          await page.waitForLoadState("networkidle");

          const currentUrl = page.url();
          console.log(
            "✓ Performance Review с ранним доступом создан:",
            currentUrl,
          );
        });
      },
    );

    test(
      "C2997: Создать PR с проверкой И ранним доступом (комбо)",
      { tag: ["@high"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("normal");
        test.slow();
        testInfo.setTimeout(300_000);

        const listPage = new PerformanceReviewsListPage(page, testInfo);
        const configPage = new PerformanceReviewConfigPage(page, testInfo);

        await test.step("Создать Performance Review", async () => {
          const baseUrl = new URL(process.env.BASE_URL).origin;
          await page.goto(
            new URL("/ru/manager/performance-reviews/", baseUrl).toString(),
          );
          await listPage.assertOpened();

          await listPage.openCreateModal();
          await listPage.performanceReviewType.click();
          await configPage.assertOpened();

          await configPage.configureDirections({
            self: true,
            manager: true,
            colleagues: true,
            subordinates: false,
          });
        });

        await test.step("Настроить подбор коллег: проверка + ранний доступ", async () => {
          await configPage.configureColleaguesSelection({
            askEmployees: true,
            minColleagues: 2,
            maxColleagues: 6,
            managerApproval: true, // ← Обе опции включены
            earlyAccess: true, // ←
          });

          await page.screenshot({
            path: "test-results/colleagues-combo.png",
            fullPage: true,
          });
        });

        await test.step("Завершить настройку и запустить", async () => {
          await configPage.addTargetUsers({ count: 1 });
          await configPage.disableReminders();
          await configPage.addAssessmentsForAllDirections();
          await configPage.goToStep("launch");
          await configPage.launch();

          await page.waitForLoadState("networkidle");

          const currentUrl = page.url();
          console.log(
            "✓ Performance Review с комбо (проверка + ранний доступ) создан:",
            currentUrl,
          );
        });
      },
    );

    test(
      "C2998: Создать PR с автоматическим подбором коллег",
      { tag: ["@medium"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("normal");
        test.slow();
        testInfo.setTimeout(300_000);

        const listPage = new PerformanceReviewsListPage(page, testInfo);
        const configPage = new PerformanceReviewConfigPage(page, testInfo);

        await test.step("Создать Performance Review", async () => {
          const baseUrl = new URL(process.env.BASE_URL).origin;
          await page.goto(
            new URL("/ru/manager/performance-reviews/", baseUrl).toString(),
          );
          await listPage.assertOpened();

          await listPage.openCreateModal();
          await listPage.performanceReviewType.click();
          await configPage.assertOpened();

          await configPage.configureDirections({
            self: true,
            manager: true,
            colleagues: true,
            subordinates: false,
          });
        });

        await test.step("Настроить АВТОМАТИЧЕСКИЙ подбор коллег", async () => {
          await configPage.configureColleaguesSelection({
            askEmployees: false, // ← Автоматически
          });

          await page.screenshot({
            path: "test-results/colleagues-automatic.png",
            fullPage: true,
          });
        });

        await test.step("Завершить настройку и запустить", async () => {
          await configPage.addTargetUsers({ count: 1 });
          await configPage.disableReminders();
          await configPage.addAssessmentsForAllDirections();
          await configPage.goToStep("launch");
          await configPage.launch();

          await page.waitForLoadState("networkidle");

          const currentUrl = page.url();
          console.log(
            "✓ Performance Review с автоматическим подбором коллег создан:",
            currentUrl,
          );
        });
      },
    );
  },
);
