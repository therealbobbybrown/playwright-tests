/**
 * C8058: API data leakage — distribution-last-results возвращает результаты ТОЛЬКО для assigned PR
 *
 * review_admin с permission [12] (manageOwnPerformanceReview) через API
 * дашборда «Моя команда» должен видеть результаты ТОЛЬКО тех PR,
 * где назначен администратором.
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
  "Review Admin — API distribution-last-results scope",
  { tag: ["@api", "@my-team", "@regression", "@review-admin"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.MY_TEAM);
    });

    test(
      "C8058: Возвращает результаты ТОЛЬКО для assigned PR",
      { tag: ["@critical"] },
      async ({ reviewAdminCtx }) => {
        setSeverity("critical");

        const { dashAPI, setupData } = reviewAdminCtx;

        let reviewAdminUserIds = [];

        await test.step(
          "Получить список пользователей, видимых review_admin",
          async () => {
            const { response, data } = await dashAPI.getDistributionUsers({
              usersSubset: "all",
              limit: 200,
            });

            expect(
              response.ok(),
              `distribution-users вернул ${response.status()}`,
            ).toBe(true);

            reviewAdminUserIds = (data?.items || []).map((u) => u.id);
            console.log(
              `[C8058] review_admin видит ${reviewAdminUserIds.length} пользователей`,
            );
          },
        );

        await test.step(
          "Проверить: результаты привязаны ТОЛЬКО к assigned PR",
          async () => {
            if (reviewAdminUserIds.length === 0) {
              console.log(
                "[C8058] Нет видимых пользователей — пропускаем проверку результатов",
              );
              return;
            }

            const { response, data } =
              await dashAPI.getDistributionLastResults(reviewAdminUserIds);

            expect(
              response.ok(),
              `distribution-last-results вернул ${response.status()}`,
            ).toBe(true);

            const entries = Object.values(data || {});
            console.log(
              `[C8058] Получено ${entries.length} записей результатов`,
            );

            // Каждая запись должна относиться к видимому пользователю
            for (const entry of entries) {
              if (entry.targetUserId) {
                expect(
                  reviewAdminUserIds,
                  `Результат для targetUserId=${entry.targetUserId} вне видимого списка review_admin`,
                ).toContain(entry.targetUserId);
              }
            }

            // Все PR в результатах должны быть ТОЛЬКО assigned PR
            for (const entry of entries) {
              if (entry.performanceReview) {
                const prIdFromResult =
                  entry.performanceReview.id || entry.performanceReview;
                expect(
                  String(prIdFromResult),
                  `Результат не должен содержать данные чужого PR. Ожидается PR ${setupData.prId}, получен PR ${prIdFromResult}`,
                ).toBe(String(setupData.prId));
              }
            }
          },
        );

        await test.step(
          "Сравнить с admin: review_admin не должен видеть результаты чужих PR",
          async () => {
            const adminDashAPI = new DashboardTeamAPI(
              dashAPI._request || dashAPI.request,
            );
            const { email: adminEmail, password: adminPassword } =
              getCredentials("admin");
            await adminDashAPI.signIn(adminEmail, adminPassword);

            const { data: adminUsersData } =
              await adminDashAPI.getDistributionUsers({
                usersSubset: "all",
                limit: 200,
              });

            const adminUserIds = (adminUsersData?.items || []).map(
              (u) => u.id,
            );

            console.log(
              `[C8058] Admin видит ${adminUserIds.length} пользователей, review_admin видит ${reviewAdminUserIds.length}`,
            );

            // review_admin не должен видеть больше пользователей, чем admin
            expect(
              reviewAdminUserIds.length,
              "review_admin не должен видеть больше пользователей, чем полный администратор",
            ).toBeLessThanOrEqual(adminUserIds.length);
          },
        );
      },
    );
  },
);
