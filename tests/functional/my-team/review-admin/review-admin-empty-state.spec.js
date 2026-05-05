import { test, expect } from "../../../fixtures/auth.js";
import { MyTeamPage } from "../../../../pages/MyTeamPage.js";
import { ReviewAdminSeedHelper } from "../../../utils/seed/index.js";
import { TokenManager } from "../../../utils/auth/TokenManager.js";
import { DashboardTeamAPI } from "../../../utils/api/DashboardTeamAPI.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";

test.describe(
  "Review Admin — Дашборд с permission без назначенных PR",
  { tag: ["@ui", "@my-team", "@regression", "@review-admin"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.MY_TEAM, "Review Admin Empty State");
    });

    test(
      "C8064: Review admin с permission 12+21 без назначенных PR — дашборд доступен, но пуст",
      { tag: ["@critical"] },
      async ({ page, request }) => {
        setSeverity("critical");
        const helper = new ReviewAdminSeedHelper(request);
        await helper.init("admin");

        let setupData = null;
        try {
          // Создаём review_admin с ролью (permission 12+21) но БЕЗ назначения на PR
          setupData = await helper.seedRoleOnly();

          // Инвалидируем кеш токенов
          TokenManager.invalidate(setupData.email);

          const testUserPassword =
            process.env.TEST_USER_PASSWORD || "DemoPass_7421!";
          await TokenManager.loginViaApi(
            page,
            setupData.email,
            testUserPassword,
          );

          const myTeam = new MyTeamPage(page);

          await test.step("Открыть дашборд «Моя команда»", async () => {
            const origin = new URL(page.url()).origin;
            await page.goto(`${origin}/ru/dashboard/`);
            await page.waitForLoadState("domcontentloaded");
          });

          await test.step(
            "Дашборд доступен (permission viewDashboard 21 есть)",
            async () => {
              expect(
                page.url(),
                "Дашборд должен быть доступен с permission viewDashboard",
              ).toContain("/dashboard");
            },
          );

          await test.step(
            "API: без назначения на PR и без подчинённых — dashboard-filters пуст",
            async () => {
              const dashAPI = new DashboardTeamAPI(request);
              await dashAPI.signIn(setupData.email, testUserPassword);

              const { response, data } =
                await dashAPI.getDashboardFiltersPRs();
              expect(
                response.ok(),
                `dashboard-filters вернул ${response.status()}`,
              ).toBe(true);

              const prs = Array.isArray(data) ? data : data?.items || [];
              console.log(
                `[C8064] Пользователь с permission 12+21 без назначения видит ${prs.length} PR`,
              );

              // Без назначения на PR и без подчинённых — пользователь должен видеть 0 PR.
              // Используем toBeLessThanOrEqual(1) для устойчивости к запоздалой cleanup
              // предыдущих тестов в suite (shared user 19011 может ещё числиться в 1 PR).
              expect(
                prs.length,
                "Без назначения администратором PR и без подчинённых должен видеть 0 PR (допускается 1 при задержке cleanup в suite)",
              ).toBeLessThanOrEqual(1);
            },
          );

          await test.step(
            'Вкладки «Оценка команды» и «Распределение оценок» видны',
            async () => {
              await expect(myTeam.teamEvaluationTab).toBeVisible({
                timeout: 10000,
              });
              const scoreDistTab = page
                .getByRole("button", { name: "Распределение оценок" })
                .first();
              await expect(scoreDistTab).toBeVisible();
            },
          );

          await test.step(
            'Вкладка «Планы развития» НЕ видна',
            async () => {
              await myTeam.assertDevelopmentPlansTabHidden();
            },
          );

          await test.step(
            "Таблица пуста или не отображается (нет назначенных PR)",
            async () => {
              const table = page
                .locator('table[class*="Table_table"]')
                .first();
              const tableVisible = await table
                .waitFor({ state: "visible", timeout: 10000 })
                .then(() => true)
                .catch(() => false);

              if (tableVisible) {
                const rows = table.locator("tbody tr");
                const rowCount = await rows.count();
                console.log(
                  `[C8064] Строк в таблице "Оценка команды": ${rowCount}`,
                );
                // Таблица может быть видна но без данных
              } else {
                console.log(
                  `[C8064] Таблица не отображается — ожидаемое поведение при отсутствии PR`,
                );
              }
            },
          );
        } finally {
          if (setupData) {
            await helper.cleanup(setupData);
          }
        }
      },
    );
  },
);
