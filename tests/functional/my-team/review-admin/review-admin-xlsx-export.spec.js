import { test, expect } from "../../../fixtures/auth.js";
import { ScoreDistributionTab } from "../../../../pages/ScoreDistributionTab.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";
import {
  saveDownload,
  parseXlsx,
  getEmployeeNamesFromXlsx,
} from "../../../utils/xlsx-helpers.js";
import { DashboardTeamAPI } from "../../../utils/api/DashboardTeamAPI.js";
import { PerformanceReviewSeedHelper } from "../../../utils/seed/PerformanceReviewSeedHelper.js";
import { ReviewAdminSeedHelper } from "../../../utils/seed/ReviewAdminSeedHelper.js";
import { TokenManager } from "../../../utils/auth/TokenManager.js";
import { getCredentials } from "../../../utils/credentials.js";

test.describe(
  "Review Admin — XLSX экспорт сводного отчёта",
  { tag: ["@ui", "@my-team", "@regression", "@review-admin"] },
  () => {
    test.slow(); // XLSX export может занимать несколько минут

    test.beforeEach(() => {
      markAsUITest(MODULES.MY_TEAM, "Review Admin XLSX Export");
    });

    test(
      "C8073: Review admin скачивает сводный отчёт только по назначенному PR",
      { tag: ["@critical"] },
      async ({ browser, request }) => {
        setSeverity("critical");
        test.setTimeout(300_000);

        const { email: adminEmail, password: adminPassword } =
          getCredentials("admin");

        // ─── 0. Ensure distribution data exists ────────────────────
        await test.step(
          "Убедиться, что есть данные для распределения оценок",
          async () => {
            const dashApi = new DashboardTeamAPI(request);
            await dashApi.signIn(adminEmail, adminPassword);

            const distData = await dashApi.getDistributionData({
              usersSubset: "all",
              limit: 5,
              offset: 0,
            });
            const hasResults =
              Object.keys(distData.results || {}).length > 0;

            if (!hasResults) {
              console.log(
                "[seed] Нет distribution данных — создаём stopped PR",
              );
              const seed = new PerformanceReviewSeedHelper(request);
              await seed.init("admin");
              const pr = await seed.seedStoppedPR({
                fillAssessments: true,
              });
              console.log(
                `[seed] Создан stopped PR: ${pr.id}, filled: ${pr.filledCount}`,
              );
            } else {
              console.log(
                `[seed] Distribution данные: ${distData.users.length} users, ${Object.keys(distData.results).length} results`,
              );
            }
          },
        );

        // ─── 1. Seed review_admin ──────────────────────────────────
        const raHelper = new ReviewAdminSeedHelper(request);
        await raHelper.init("admin");
        let setupData;

        await test.step(
          "Seed review_admin: роль + назначение администратором PR",
          async () => {
            setupData = await raHelper.seedFullSetup();
            console.log(
              `[seed] Review admin: userId=${setupData.userId}, prId=${setupData.prId}, email=${setupData.email}`,
            );
          },
        );

        try {
          // ─── 2. Review admin: скачать XLSX ─────────────────────────
          let reviewAdminRows;
          let reviewAdminNames;

          const raContext = await browser.newContext();
          const raPage = await raContext.newPage();

          await test.step("Логин как review_admin", async () => {
            TokenManager.invalidate(setupData.email);
            const testUserPassword =
              process.env.TEST_USER_PASSWORD || "DemoPass_7421!";
            await TokenManager.loginViaApi(
              raPage,
              setupData.email,
              testUserPassword,
            );
          });

          await test.step(
            "Review admin: открыть «Распределение оценок»",
            async () => {
              const origin = new URL(raPage.url()).origin;
              await raPage.goto(`${origin}/ru/dashboard/`);
              await raPage.waitForLoadState("domcontentloaded");

              const tab = new ScoreDistributionTab(raPage);
              await tab.switchToTab();
              await expect(tab.tabHeading).toBeVisible({ timeout: 30_000 });
              await raPage.waitForLoadState("networkidle");
            },
          );

          await test.step(
            "Review admin: скачать сводный отчёт",
            async () => {
              const tab = new ScoreDistributionTab(raPage);
              await expect(tab.downloadSummaryButton).toBeEnabled({
                timeout: 30_000,
              });

              const download = await tab.downloadSummaryReport();
              expect(download, "Download должен завершиться").toBeTruthy();

              const filePath = await saveDownload(download, "review_admin");
              const parsed = parseXlsx(filePath);
              reviewAdminRows = parsed.rows;

              expect(
                parsed.headers.length,
                "XLSX должен содержать заголовки",
              ).toBeGreaterThan(0);
              expect(
                reviewAdminRows.length,
                "XLSX должен содержать строки данных",
              ).toBeGreaterThan(0);

              reviewAdminNames = getEmployeeNamesFromXlsx(
                parsed.headers,
                reviewAdminRows,
              );
              console.log(
                `[review_admin] XLSX: ${reviewAdminRows.length} строк, сотрудники: ${reviewAdminNames.join(", ")}`,
              );
            },
          );

          await raContext.close();

          // ─── 3. Админ: скачать XLSX ──────────────────────────────
          let adminRows;
          let adminNames;

          const adminContext = await browser.newContext();
          const adminPage = await adminContext.newPage();

          await test.step("Логин как админ", async () => {
            await TokenManager.loginViaApi(
              adminPage,
              adminEmail,
              adminPassword,
            );
          });

          await test.step(
            "Админ: открыть «Распределение оценок» и скачать отчёт",
            async () => {
              const origin = new URL(adminPage.url()).origin;
              await adminPage.goto(`${origin}/ru/dashboard/`);
              await adminPage.waitForLoadState("domcontentloaded");

              const adminTab = new ScoreDistributionTab(adminPage);
              await adminTab.switchToTab();
              await expect(adminTab.tabHeading).toBeVisible({
                timeout: 30_000,
              });
              await adminPage.waitForLoadState("networkidle");

              await expect(adminTab.downloadSummaryButton).toBeEnabled({
                timeout: 30_000,
              });

              const download = await adminTab.downloadSummaryReport();
              expect(
                download,
                "Admin download должен завершиться",
              ).toBeTruthy();

              const filePath = await saveDownload(download, "admin_full");
              const parsed = parseXlsx(filePath);
              adminRows = parsed.rows;
              adminNames = getEmployeeNamesFromXlsx(
                parsed.headers,
                adminRows,
              );

              console.log(
                `[admin] XLSX: ${adminRows.length} строк, сотрудников: ${adminNames.length}`,
              );
            },
          );

          await adminContext.close();

          // ─── 4. Сравнение ────────────────────────────────────────
          await test.step(
            "Review admin XLSX содержит меньше строк, чем admin XLSX",
            async () => {
              console.log(
                `[compare] review_admin: ${reviewAdminRows.length} строк, admin: ${adminRows.length} строк`,
              );

              expect(
                reviewAdminRows.length,
                "Review admin должен видеть МЕНЬШЕ строк, чем полный админ",
              ).toBeLessThan(adminRows.length);
            },
          );

          await test.step(
            "Все сотрудники review_admin присутствуют в admin XLSX",
            async () => {
              const normalize = (n) =>
                n.replace(/\s+/g, " ").trim().toLowerCase();
              const adminNamesNorm = new Set(adminNames.map(normalize));

              for (const name of reviewAdminNames) {
                const norm = normalize(name);
                expect(
                  adminNamesNorm.has(norm),
                  `Сотрудник «${name}» из review_admin XLSX должен быть в admin XLSX`,
                ).toBe(true);
              }
            },
          );
        } finally {
          // ─── 5. Cleanup ──────────────────────────────────────────
          try {
            await raHelper.cleanup(setupData);
          } catch (e) {
            console.warn(`[cleanup] Ошибка: ${e.message}`);
          }
        }
      },
    );
  },
);
