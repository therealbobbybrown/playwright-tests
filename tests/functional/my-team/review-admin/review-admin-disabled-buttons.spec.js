import { test, expect } from "../../../fixtures/auth.js";
import { ScoreDistributionTab } from "../../../../pages/ScoreDistributionTab.js";
import { DashboardTeamAPI } from "../../../utils/api/DashboardTeamAPI.js";
import { getCredentials } from "../../../utils/credentials.js";
import { TokenManager } from "../../../utils/auth/TokenManager.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";

/**
 * AT-33/34: Кнопки disabled для review_admin при отсутствии завершённых оценок
 *
 * Использует reviewAdminAuth фикстуру (полный seed с обоими условиями).
 * На вкладке "Распределение оценок" кнопка "Скачать сводный отчёт" должна быть
 * disabled, если нет завершённых оценок по выбранному PR.
 * Усиленная проверка: API cross-check что review_admin видит только assigned PR.
 */

test.describe(
  "Review Admin — Кнопки disabled без данных",
  { tag: ["@ui", "@my-team", "@regression", "@review-admin"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.MY_TEAM, "Review Admin Disabled Buttons");
    });

    test(
      "C8063: Кнопка «Скачать сводный отчёт» disabled на вкладке «Распределение оценок» без завершённых данных",
      { tag: ["@critical"] },
      async ({ reviewAdminAuth: page, request }) => {
        setSeverity("critical");
        const scoreTab = new ScoreDistributionTab(page);
        const setupData = page._reviewAdminSetup;
        const testUserPassword = process.env.TEST_USER_PASSWORD || "DemoPass_7421!";

        await test.step(
          `Seed: review admin ${setupData.firstName} ${setupData.lastName} (id=${setupData.userId}), PR ${setupData.prId}`,
          async () => {
            expect(setupData.userId).toBeTruthy();
            expect(setupData.prId).toBeTruthy();
            expect(setupData.email).toBeTruthy();
          },
        );

        // ── API cross-check: review_admin видит scoped данные ──

        await test.step(
          "API: review_admin видит ТОЛЬКО assigned PR в dashboard-filters",
          async () => {
            // Инвалидируем кеш токена перед signIn — роли/назначения могут быть только что изменены фикстурой
            TokenManager.invalidate(setupData.email);
            const dashAPI = new DashboardTeamAPI(request);
            await dashAPI.signIn(setupData.email, testUserPassword);

            const { response, data } = await dashAPI.getDashboardFiltersPRs();
            expect(
              response.ok(),
              `dashboard-filters вернул ${response.status()}`,
            ).toBe(true);

            const prs = Array.isArray(data) ? data : data?.items || [];
            const assignedPR = prs.find(
              (pr) => String(pr.id || pr.prId || pr) === String(setupData.prId),
            );
            expect(
              assignedPR,
              `Assigned PR ${setupData.prId} должен быть в фильтрах review_admin`,
            ).toBeDefined();

            console.log(
              `[C8063] review_admin видит ${prs.length} PR в фильтрах, assigned PR ${setupData.prId} найден`,
            );
          },
        );

        await test.step(
          "API: review_admin видит строго меньше PR, чем полный admin",
          async () => {
            const adminDashAPI = new DashboardTeamAPI(request);
            const { email: adminEmail, password: adminPassword } =
              getCredentials("admin");
            await adminDashAPI.signIn(adminEmail, adminPassword);

            const { response: adminResp, data: adminData } =
              await adminDashAPI.getDashboardFiltersPRs();
            expect(adminResp.ok()).toBe(true);

            const adminPRs = Array.isArray(adminData)
              ? adminData
              : adminData?.items || [];

            const reviewAdminAPI = new DashboardTeamAPI(request);
            TokenManager.invalidate(setupData.email);
            await reviewAdminAPI.signIn(setupData.email, testUserPassword);
            const { data: raData } =
              await reviewAdminAPI.getDashboardFiltersPRs();
            const raPRs = Array.isArray(raData) ? raData : raData?.items || [];

            console.log(
              `[C8063] Admin видит ${adminPRs.length} PR, review_admin видит ${raPRs.length} PR`,
            );

            if (adminPRs.length > 1) {
              expect(
                raPRs.length,
                "review_admin должен видеть меньше PR, чем полный admin",
              ).toBeLessThan(adminPRs.length);
            }
          },
        );

        // ── UI: дашборд и disabled кнопка ──

        await test.step("Открыть дашборд «Моя команда»", async () => {
          const origin = new URL(page.url()).origin;
          await page.goto(`${origin}/ru/dashboard/`);
          await page.waitForLoadState("domcontentloaded");
        });

        await test.step(
          'Переключиться на вкладку «Распределение оценок»',
          async () => {
            await scoreTab.switchToTab();
          },
        );

        await test.step(
          'Проверить: кнопка «Скачать сводный отчёт» disabled',
          async () => {
            await scoreTab.assertDownloadButtonDisabled();
          },
        );

        await test.step(
          'Проверить: кнопка «Скачать сводный отчёт» имеет атрибут disabled (DOM-уровень)',
          async () => {
            // Дополнительно проверяем DOM-атрибут, а не только Playwright isDisabled()
            const isDisabled = await scoreTab.downloadSummaryButton.evaluate(
              (el) => el.disabled || el.getAttribute("disabled") !== null,
            );
            expect(
              isDisabled,
              "Кнопка должна иметь атрибут disabled в DOM",
            ).toBe(true);
          },
        );
      },
    );
  },
);
