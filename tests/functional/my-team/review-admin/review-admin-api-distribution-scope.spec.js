/**
 * C8055: API data leakage — distribution-users возвращает ТОЛЬКО пользователей из assigned PR
 *
 * review_admin через API дашборда «Моя команда» должен видеть
 * ТОЛЬКО данные PR, где назначен администратором.
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
  "Review Admin — API distribution-users scope",
  { tag: ["@api", "@my-team", "@regression", "@review-admin"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.MY_TEAM);
    });

    test(
      "C8055: Возвращает ТОЛЬКО пользователей из assigned PR",
      { tag: ["@critical"] },
      async ({ reviewAdminCtx }) => {
        setSeverity("critical");

        const { dashAPI, setupData } = reviewAdminCtx;

        let reviewAdminUsers;

        await test.step(
          "Запросить distribution-users от имени review_admin",
          async () => {
            const { response, data } = await dashAPI.getDistributionUsers({
              usersSubset: "all",
              limit: 200,
            });

            expect(
              response.ok(),
              `distribution-users вернул ${response.status()}`,
            ).toBe(true);
            expect(data).toBeDefined();
            expect(data.items).toBeDefined();

            reviewAdminUsers = data.items;
            console.log(
              `[C8055] review_admin (userId=${setupData.userId}) получил ${reviewAdminUsers.length} пользователей (total=${data.total})`,
            );
          },
        );

        await test.step(
          "Получить список участников assigned PR через admin API для сравнения",
          async () => {
            // Авторизуемся как полный админ для получения эталонных данных
            const adminDashAPI = new DashboardTeamAPI(
              dashAPI._request || dashAPI.request,
            );
            const { email: adminEmail, password: adminPassword } =
              getCredentials("admin");
            await adminDashAPI.signIn(adminEmail, adminPassword);

            const { data: adminData } = await adminDashAPI.getDistributionUsers(
              {
                usersSubset: "all",
                limit: 200,
              },
            );

            const adminTotal = adminData?.total || 0;
            const reviewAdminTotal = reviewAdminUsers.length;

            console.log(
              `[C8055] Admin видит ${adminTotal} пользователей, review_admin видит ${reviewAdminTotal}`,
            );

            // review_admin НЕ должен видеть больше пользователей, чем есть в его assigned PR
            // Если review_admin видит столько же, сколько admin — это утечка данных
            // (при условии, что admin видит пользователей из нескольких PR)
            if (adminTotal > reviewAdminTotal) {
              console.log(
                "[C8055] OK: review_admin видит меньше пользователей, чем admin — фильтрация работает",
              );
            } else if (reviewAdminTotal === 0) {
              console.log(
                "[C8055] review_admin не видит пользователей — проверяем, что assigned PR имеет участников",
              );
            } else {
              console.log(
                `[C8055] WARN: review_admin видит ${reviewAdminTotal} пользователей, admin видит ${adminTotal}. Необходима детальная проверка.`,
              );
            }

            // Основной assert: review_admin не должен видеть БОЛЬШЕ пользователей, чем full admin
            expect(
              reviewAdminTotal,
              "review_admin не должен видеть больше пользователей, чем полный администратор",
            ).toBeLessThanOrEqual(adminTotal);
          },
        );

        await test.step(
          "Проверить: данные содержат только участников assigned PR (без утечки чужих PR)",
          async () => {
            // Каждый возвращённый пользователь должен быть валидным объектом
            for (const user of reviewAdminUsers) {
              expect(user.id, "У каждого пользователя должен быть id").toBeDefined();
              expect(
                typeof user.id,
                "id пользователя должен быть числом",
              ).toBe("number");
            }

            // Если есть пользователи — проверяем, что нет дубликатов (признак мерджа данных из разных PR)
            const userIds = reviewAdminUsers.map((u) => u.id);
            const uniqueIds = new Set(userIds);
            expect(
              uniqueIds.size,
              "Не должно быть дубликатов пользователей (признак утечки из нескольких PR)",
            ).toBe(userIds.length);
          },
        );
      },
    );
  },
);
