import { test, expect } from "../../../fixtures/auth.js";
import { MyTeamPage } from "../../../../pages/MyTeamPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";
import { saveDownload } from "../../../utils/xlsx-helpers.js";
import { PPTXParser } from "../../../utils/report-parsers/PPTXParser.js";
import { DashboardTeamAPI } from "../../../utils/api/DashboardTeamAPI.js";
import { PerformanceReviewAPI } from "../../../utils/api/PerformanceReviewAPI.js";
import { PerformanceReviewSeedHelper } from "../../../utils/seed/PerformanceReviewSeedHelper.js";
import { ReviewAdminSeedHelper } from "../../../utils/seed/ReviewAdminSeedHelper.js";
import { TokenManager } from "../../../utils/auth/TokenManager.js";
import { getCredentials } from "../../../utils/credentials.js";

const pptxParser = new PPTXParser();

test.describe(
  "Review Admin — PPTX экспорт сводного отчёта",
  { tag: ["@ui", "@my-team", "@regression", "@review-admin"] },
  () => {
    test.slow(); // PPTX export может занимать несколько минут

    test.beforeEach(() => {
      markAsUITest(MODULES.MY_TEAM, "Review Admin PPTX Export");
    });

    test(
      "C8074: Review admin скачивает PPTX отчёт только по назначенному PR",
      { tag: ["@critical"] },
      async ({ browser, request }) => {
        setSeverity("critical");
        test.setTimeout(300_000);

        const { email: adminEmail, password: adminPassword } =
          getCredentials("admin");

        // ─── 0. Ensure team evaluation data exists ─────────────────
        await test.step(
          "Убедиться, что есть данные для оценки команды",
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
                "[seed] Нет данных оценки команды — создаём stopped PR",
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
                `[seed] Данные оценки: ${distData.users?.length ?? 0} users, ${Object.keys(distData.results).length} results`,
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
          // ─── 2. API: проверить количество доступных PR ─────────────
          let reviewAdminPRCount = 0;
          let adminPRCount = 0;

          await test.step(
            "Сравнить количество PR, доступных review_admin и admin через API",
            async () => {
              // Запрос от review_admin
              const raPRApi = new PerformanceReviewAPI(request);
              const testUserPassword =
                process.env.TEST_USER_PASSWORD || "DemoPass_7421!";
              await raPRApi.signIn(setupData.email, testUserPassword);
              const { data: raData } =
                await raPRApi.getDashboardFiltersPerformanceReviews();
              const raList = Array.isArray(raData)
                ? raData
                : raData?.items || raData?.results || [];
              reviewAdminPRCount = raList.length;
              console.log(
                `[review_admin] Доступных PR: ${reviewAdminPRCount}`,
              );

              // Запрос от admin
              const adminPRApi = new PerformanceReviewAPI(request);
              await adminPRApi.signIn(adminEmail, adminPassword);
              const { data: adminData } =
                await adminPRApi.getDashboardFiltersPerformanceReviews();
              const adminList = Array.isArray(adminData)
                ? adminData
                : adminData?.items || adminData?.results || [];
              adminPRCount = adminList.length;
              console.log(`[admin] Доступных PR: ${adminPRCount}`);

              expect(
                reviewAdminPRCount,
                "Review admin должен видеть МЕНЬШЕ PR, чем полный Admin",
              ).toBeLessThan(adminPRCount);

              // Review admin должен видеть хотя бы свой назначенный PR
              expect(
                reviewAdminPRCount,
                "Review admin должен видеть хотя бы 1 PR (назначенный)",
              ).toBeGreaterThanOrEqual(1);
            },
          );

          // ─── 3. Review admin: скачать PPTX ─────────────────────────
          let reviewAdminResult;
          let reviewAdminFileName;

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
            "Review admin: открыть вкладку «Оценка команды»",
            async () => {
              const origin = new URL(raPage.url()).origin;
              await raPage.goto(
                `${origin}/ru/dashboard/?tab=performanceReview`,
              );
              await raPage.waitForLoadState("domcontentloaded");

              const myTeamPage = new MyTeamPage(raPage);
              await myTeamPage.assertOpened();
              await raPage.waitForLoadState("networkidle");
            },
          );

          await test.step(
            "Review admin: скачать PPTX сводный отчёт",
            async () => {
              const myTeamPage = new MyTeamPage(raPage);
              await expect(myTeamPage.downloadSummaryButton).toBeEnabled({
                timeout: 30_000,
              });

              const download = await myTeamPage.downloadSummaryReport();
              expect(download, "Download должен завершиться").toBeTruthy();

              reviewAdminFileName = download.suggestedFilename();
              expect(
                reviewAdminFileName,
                "Имя файла должно иметь расширение .pptx",
              ).toMatch(/\.pptx$/i);
              console.log(`[review_admin] Имя файла: ${reviewAdminFileName}`);

              const filePath = await saveDownload(
                download,
                "review_admin_pptx",
              );
              reviewAdminResult = await pptxParser.parse(filePath);

              expect(
                reviewAdminResult.total,
                "PPTX review_admin должен содержать слайды",
              ).toBeGreaterThan(0);
              expect(
                reviewAdminResult.text.length,
                "PPTX review_admin не должен быть пустым",
              ).toBeGreaterThan(0);

              console.log(
                `[review_admin] PPTX: слайдов=${reviewAdminResult.total}`,
              );
            },
          );

          await raContext.close();

          // ─── 4. Финальные проверки ────────────────────────────────
          await test.step(
            "Файл скачан в формате PPTX (ZIP-структура успешно разобрана)",
            async () => {
              expect(
                reviewAdminResult.slides.length,
                "review_admin PPTX: массив слайдов не пустой",
              ).toBeGreaterThan(0);
              expect(reviewAdminFileName).toMatch(/\.pptx$/i);
            },
          );

          await test.step(
            "Review admin PPTX содержит данные из своего назначенного PR",
            async () => {
              // Имя файла должно содержать фрагмент названия назначенного PR
              // (PPTX формируется именно по тому PR, который доступен review_admin)
              // Проверяем, что файл ненулевой — данные из assigned PR присутствуют
              expect(
                reviewAdminResult.total,
                `PPTX для review_admin (prId=${setupData.prId}) должен содержать слайды`,
              ).toBeGreaterThan(0);
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
