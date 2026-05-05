// DEBUG: перехват network requests при выборе коллег
import { test } from "../../../fixtures/auth.js";
import { PerformanceReviewsListPage } from "../../../../pages/PerformanceReviewsListPage.js";
import { PerformanceReviewConfigPage } from "../../../../pages/PerformanceReviewConfigPage.js";
import { PerformanceReviewFillPage } from "../../../../pages/PerformanceReviewFillPage.js";
import { OrgStructureHelper } from "../../../../pages/OrgStructureHelper.js";

test.describe(
  "DEBUG: Network requests при suggest receivers",
  { tag: ["@debug"] },
  () => {
    test("C4200: Перехватить API запросы при выборе коллег", async ({
      adminAuth: adminPage,
    }, testInfo) => {
      test.setTimeout(600_000);

      const listPage = new PerformanceReviewsListPage(adminPage, testInfo);
      const configPage = new PerformanceReviewConfigPage(adminPage, testInfo);
      const orgHelper = new OrgStructureHelper(adminPage, testInfo);
      const adminFillPage = new PerformanceReviewFillPage(adminPage, testInfo);

      let users = [];
      let colleagues = [];
      let managerUser = null;
      let prId = null;
      const baseUrl = new URL(process.env.BASE_URL).origin;

      // Массив для перехваченных запросов
      const capturedRequests = [];

      // Перехватываем все API запросы
      adminPage.on("request", (request) => {
        const url = request.url();
        // Логируем запросы к performance-reviews API
        if (
          url.includes("/performance-reviews/") ||
          url.includes("/nominations/")
        ) {
          const logEntry = {
            method: request.method(),
            url: url.replace(baseUrl, ""),
            payload:
              request.method() === "POST" || request.method() === "PUT"
                ? request.postDataJSON()
                : null,
          };
          capturedRequests.push(logEntry);

          console.log(`\n🌐 ${logEntry.method} ${logEntry.url}`);
          if (logEntry.payload) {
            console.log(
              "   Payload:",
              JSON.stringify(logEntry.payload, null, 2),
            );
          }
        }
      });

      // 1. Получение пользователей
      await test.step("Получить пользователей", async () => {
        await adminPage.goto(baseUrl);
        users = await orgHelper.getUsersList(8);
        managerUser = users[1];
        colleagues = users.slice(2, 5);
        console.log(`✓ Получено ${users.length} пользователей`);
      });

      // 2. Создание PR
      await test.step("Создать PR с nominations", async () => {
        await adminPage.goto(
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

        await configPage.configureColleaguesSelection({
          askEmployees: true,
          minColleagues: 2,
          maxColleagues: 5,
          managerApproval: true,
          earlyAccess: true,
        });

        console.log("✓ PR настроен");
      });

      // 3. Добавление участников и запуск
      await test.step("Добавить участников и запустить", async () => {
        await configPage.addTargetUsers({ count: 1 });
        await configPage.editRespondentsTable({ managers: [managerUser] });
        await configPage.disableReminders();
        await configPage.addAssessmentsForAllDirections();
        await configPage.goToStep("launch");

        console.log("\n📊 === ЗАПУСК PR ===");
        await configPage.launchAndSendQuestionnaires();
        await adminPage
          .waitForLoadState("networkidle", { timeout: 10000 });

        const currentUrl = adminPage.url();
        const match = currentUrl.match(/\/performance-reviews\/(\d+)/);
        prId = match?.[1];
        console.log(`✓ PR запущен, ID: ${prId}`);
      });

      // 4. ГЛАВНОЕ: Выбор коллег
      await test.step("Выбрать коллег - перехватываем API", async () => {
        console.log("\n📊 === ВЫБОР КОЛЛЕГ ===");

        await adminFillPage.navigateToColleagueSelection(baseUrl, prId);

        // Очищаем массив запросов перед ключевым действием
        capturedRequests.length = 0;

        console.log(
          "\n🎯 НАЧИНАЕМ selectColleaguesForReview - следим за запросами:\n",
        );

        colleagues = await adminFillPage.selectColleaguesForReview(
          colleagues,
          2,
        );

        await adminPage
          .waitForLoadState("networkidle", { timeout: 10000 });

        console.log("\n✓ Коллеги выбраны");
      });

      // 5. Вывод результатов
      await test.step("Вывести перехваченные запросы", async () => {
        console.log("\n\n" + "=".repeat(80));
        console.log("📋 ПЕРЕХВАЧЕННЫЕ API ЗАПРОСЫ ПРИ ВЫБОРЕ КОЛЛЕГ:");
        console.log("=".repeat(80));

        if (capturedRequests.length === 0) {
          console.log("❌ Не удалось перехватить запросы");
        } else {
          capturedRequests.forEach((req, i) => {
            console.log(`\n${i + 1}. ${req.method} ${req.url}`);
            if (req.payload) {
              console.log("   Payload:");
              console.log(JSON.stringify(req.payload, null, 2));
            }
          });
        }

        console.log("\n" + "=".repeat(80) + "\n");
      });
    });
  },
);
