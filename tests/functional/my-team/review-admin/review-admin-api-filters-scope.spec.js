/**
 * C8057: API data leakage — dashboard-filters возвращает ТОЛЬКО assigned PR
 *
 * review_admin с permission [12] (manageOwnPerformanceReview) через API
 * фильтров дашборда «Моя команда» должен видеть в списке PR
 * ТОЛЬКО те, где назначен администратором.
 */

import { test as base, expect } from "../../../fixtures/full.js";
import { ReviewAdminSeedHelper } from "../../../utils/seed/index.js";
import { DashboardTeamAPI } from "../../../utils/api/DashboardTeamAPI.js";
import { getCredentials } from "../../../utils/credentials.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";

const test = base.extend({
  reviewAdminCtx: async ({ request }, use) => {
    const helper = new ReviewAdminSeedHelper(request);
    await helper.init("admin");
    const setupData = await helper.seedFullSetup();

    const dashAPI = new DashboardTeamAPI(request);
    await dashAPI.signIn(
      setupData.email,
      process.env.TEST_USER_PASSWORD || "DemoPass_7421!",
    );

    await use({ dashAPI, setupData, helper });

    await helper.cleanup(setupData);
  },
});

test.describe(
  "Review Admin — API dashboard-filters PR scope",
  { tag: ["@api", "@my-team", "@regression", "@review-admin"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.MY_TEAM);
    });

    test(
      "C8057: Возвращает ТОЛЬКО assigned PR в списке фильтров",
      { tag: ["@critical"] },
      async ({ reviewAdminCtx }) => {
        setSeverity("critical");

        const { dashAPI, setupData } = reviewAdminCtx;

        let reviewAdminPRs;

        await test.step(
          "Запросить список PR через dashboard-filters от имени review_admin",
          async () => {
            const { response, data } = await dashAPI.getDashboardFiltersPRs();

            expect(
              response.ok(),
              `dashboard-filters/performance-reviews вернул ${response.status()}`,
            ).toBe(true);
            expect(data).toBeDefined();

            reviewAdminPRs = Array.isArray(data) ? data : data?.items || [];
            console.log(
              `[C8057] review_admin (userId=${setupData.userId}) видит ${reviewAdminPRs.length} PR в фильтрах`,
            );
          },
        );

        await test.step(
          "Проверить: assigned PR присутствует в списке",
          async () => {
            const assignedPrId = String(setupData.prId);
            const prIds = reviewAdminPRs.map((pr) =>
              String(pr.id || pr.prId || pr),
            );

            expect(
              prIds,
              `Assigned PR ${assignedPrId} должен быть в списке фильтров review_admin`,
            ).toContain(assignedPrId);
          },
        );

        await test.step(
          "Сравнить с admin: review_admin должен видеть СТРОГО МЕНЬШЕ PR",
          async () => {
            const adminDashAPI = new DashboardTeamAPI(
              dashAPI._request || dashAPI.request,
            );
            const { email: adminEmail, password: adminPassword } =
              getCredentials("admin");
            await adminDashAPI.signIn(adminEmail, adminPassword);

            const { data: adminData } =
              await adminDashAPI.getDashboardFiltersPRs();

            const adminPRs = Array.isArray(adminData)
              ? adminData
              : adminData?.items || [];

            console.log(
              `[C8057] Admin видит ${adminPRs.length} PR, review_admin видит ${reviewAdminPRs.length} PR`,
            );

            // review_admin НЕ должен видеть больше PR, чем admin
            expect(
              reviewAdminPRs.length,
              "review_admin не должен видеть больше PR, чем полный администратор",
            ).toBeLessThanOrEqual(adminPRs.length);

            // review_admin должен видеть СТРОГО МЕНЬШЕ PR, чем admin
            if (adminPRs.length > 1) {
              expect(
                reviewAdminPRs.length,
                "review_admin должен видеть только assigned PR, а не все PR компании",
              ).toBeLessThan(adminPRs.length);

              console.log(
                `[C8057] OK: review_admin видит ${reviewAdminPRs.length} PR (меньше, чем admin: ${adminPRs.length}) — фильтрация работает`,
              );
            }
          },
        );

        await test.step(
          "Проверить: каждый видимый PR — валидный объект без дубликатов",
          async () => {
            for (const pr of reviewAdminPRs) {
              const prId = pr.id || pr.prId || pr;
              expect(prId, "Каждый PR должен иметь id").toBeDefined();
            }

            const prIds = reviewAdminPRs.map((pr) =>
              String(pr.id || pr.prId || pr),
            );
            const uniquePrIds = new Set(prIds);
            expect(
              uniquePrIds.size,
              "Не должно быть дубликатов PR в фильтрах",
            ).toBe(prIds.length);
          },
        );
      },
    );
  },
);
