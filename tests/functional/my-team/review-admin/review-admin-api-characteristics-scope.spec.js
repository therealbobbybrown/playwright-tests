/**
 * C8054: API data leakage — distribution-characteristics возвращает данные ТОЛЬКО для assigned PR
 *
 * review_admin с permission [12] (manageOwnPerformanceReview) через API
 * дашборда «Моя команда» должен видеть характеристики ТОЛЬКО тех PR,
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
  "Review Admin — API distribution-characteristics scope",
  { tag: ["@api", "@my-team", "@regression", "@review-admin"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.MY_TEAM);
    });

    test(
      "C8054: Возвращает характеристики ТОЛЬКО для assigned PR",
      { tag: ["@critical"] },
      async ({ reviewAdminCtx }) => {
        setSeverity("critical");

        const { dashAPI, setupData } = reviewAdminCtx;

        let characteristicsData;

        await test.step(
          "Запросить distribution-characteristics от имени review_admin",
          async () => {
            const { response, data } =
              await dashAPI.getDistributionCharacteristics({
                usersSubset: "all",
              });

            expect(
              response.ok(),
              `distribution-characteristics вернул ${response.status()}`,
            ).toBe(true);
            expect(data).toBeDefined();

            characteristicsData = data;
            const withResults = data?.withResults || [];
            const withoutResults = data?.withoutResults || {};

            console.log(
              `[C8054] review_admin (userId=${setupData.userId}): withResults=${withResults.length} записей, withoutResults keys=${Object.keys(withoutResults).length}`,
            );
          },
        );

        await test.step(
          "Проверить: withResults привязаны ТОЛЬКО к assigned PR",
          async () => {
            const withResults = characteristicsData?.withResults || [];

            for (const entry of withResults) {
              expect(entry, "Запись характеристики должна быть объектом").toBeDefined();

              // Если есть performanceReview — должен быть assigned PR
              if (entry.performanceReview) {
                const prIdFromEntry =
                  entry.performanceReview.id || entry.performanceReview;

                expect(
                  String(prIdFromEntry),
                  `Характеристика не должна содержать данные чужого PR. Ожидается PR ${setupData.prId}, получен PR ${prIdFromEntry}`,
                ).toBe(String(setupData.prId));
              }
            }
          },
        );

        await test.step(
          "Сравнить с admin: review_admin не должен видеть характеристики чужих PR",
          async () => {
            const adminDashAPI = new DashboardTeamAPI(
              dashAPI._request || dashAPI.request,
            );
            const { email: adminEmail, password: adminPassword } =
              getCredentials("admin");
            await adminDashAPI.signIn(adminEmail, adminPassword);

            const { data: adminData } =
              await adminDashAPI.getDistributionCharacteristics({
                usersSubset: "all",
              });

            const adminWithResults = adminData?.withResults || [];
            const reviewAdminWithResults =
              characteristicsData?.withResults || [];

            console.log(
              `[C8054] Admin видит ${adminWithResults.length} характеристик, review_admin видит ${reviewAdminWithResults.length}`,
            );

            // review_admin не должен видеть больше характеристик, чем admin
            expect(
              reviewAdminWithResults.length,
              "review_admin не должен видеть больше характеристик, чем полный администратор",
            ).toBeLessThanOrEqual(adminWithResults.length);

            // Если admin видит больше — фильтрация работает
            if (adminWithResults.length > reviewAdminWithResults.length) {
              console.log(
                `[C8054] OK: review_admin видит ${reviewAdminWithResults.length} (меньше, чем admin: ${adminWithResults.length}) — фильтрация работает`,
              );
            }
          },
        );
      },
    );
  },
);
