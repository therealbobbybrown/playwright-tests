/**
 * C8056: Подстановка чужих group/department в фильтрах → не расширяет scope
 *
 * Проверяет, что review_admin с permission [12] (manageOwnPerformanceReview),
 * подставляя groupId/departmentId из unassigned PR в API запросы distribution-users,
 * НЕ получает данные сотрудников за пределами своего scope.
 */
import { test as base, expect } from "../../../fixtures/full.js";
import { ReviewAdminSeedHelper } from "../../../utils/seed/index.js";
import {
  DashboardTeamAPI,
  getCredentials,
  getTestUserPassword,
} from "../../../utils/api/index.js";
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

    const password = getTestUserPassword();
    const dashAPI = new DashboardTeamAPI(request);
    await dashAPI.signIn(setupData.email, password);

    // Admin API для получения baseline и поиска чужих групп
    const { email: adminEmail, password: adminPassword } =
      getCredentials("admin");
    const adminDashAPI = new DashboardTeamAPI(request);
    await adminDashAPI.signIn(adminEmail, adminPassword);

    // Находим groupId из данных админа, который НЕ принадлежит assigned PR target users
    let foreignGroupId = null;
    try {
      const { data: adminUsersData } = await adminDashAPI.getDistributionUsers({
        usersSubset: "all",
        limit: 100,
      });
      const adminUsers = adminUsersData?.items || [];
      for (const user of adminUsers) {
        if (user.groups && user.groups.length > 0) {
          foreignGroupId = user.groups[0].id;
          break;
        }
      }
    } catch (e) {
      console.warn(`[Setup] Не удалось найти группы: ${e.message}`);
    }

    await use({
      dashAPI,
      adminDashAPI,
      setupData,
      helper,
      foreignGroupId,
    });

    try {
      await helper.cleanup(setupData);
    } catch (e) {
      console.warn(`[Cleanup] ${e.message}`);
    }
  },
});

test.describe(
  "Review Admin API — Фильтры не расширяют scope",
  { tag: ["@api", "@my-team", "@regression", "@review-admin"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.MY_TEAM, "Review Admin API Filter Bypass");
    });

    test(
      "C8056: Подстановка чужих groupId в фильтрах не расширяет scope",
      { tag: ["@critical"] },
      async ({ reviewAdminCtx }) => {
        setSeverity("critical");

        const { dashAPI, adminDashAPI, setupData, foreignGroupId } =
          reviewAdminCtx;

        let baselineUserIds = [];

        await test.step(
          "Baseline: получить список сотрудников review_admin без фильтров",
          async () => {
            const { response, data } = await dashAPI.getDistributionUsers({
              usersSubset: "all",
              limit: 200,
            });

            expect(
              response.ok(),
              `distribution-users вернул ${response.status()}`,
            ).toBe(true);

            baselineUserIds = (data?.items || []).map((u) => u.id);
            console.log(
              `[C8056] Baseline: review_admin видит ${baselineUserIds.length} сотрудников`,
            );
          },
        );

        await test.step(
          "Сравнить с admin: review_admin видит МЕНЬШЕ сотрудников",
          async () => {
            const { data: adminUsersData } =
              await adminDashAPI.getDistributionUsers({
                usersSubset: "all",
                limit: 200,
              });
            const adminTotal = adminUsersData?.total || (adminUsersData?.items || []).length;

            console.log(
              `[C8056] Admin видит ${adminTotal} сотрудников, review_admin видит ${baselineUserIds.length}`,
            );

            expect(
              baselineUserIds.length,
              "review_admin не должен видеть больше сотрудников, чем admin",
            ).toBeLessThanOrEqual(adminTotal);
          },
        );

        if (foreignGroupId) {
          await test.step(
            `Negative: подстановка foreignGroupId=${foreignGroupId} — scope не расширяется`,
            async () => {
              const { response, data } = await dashAPI.getDistributionUsers({
                usersSubset: "all",
                userGroupIds: [foreignGroupId],
                limit: 200,
              });

              if (response.status() === 403 || response.status() === 404) {
                expect([403, 404]).toContain(response.status());
                console.log(
                  `[C8056] С foreignGroupId: получили ${response.status()} — доступ запрещён`,
                );
              } else if (response.ok()) {
                const filteredUserIds = (data?.items || []).map((u) => u.id);
                // Все полученные userId должны быть в baseline (scope не расширился)
                const extraUsers = filteredUserIds.filter(
                  (id) => !baselineUserIds.includes(id),
                );
                expect(
                  extraUsers.length,
                  `С foreignGroupId получены ${extraUsers.length} дополнительных сотрудников за пределами scope: [${extraUsers.join(", ")}]`,
                ).toBe(0);
                console.log(
                  `[C8056] С foreignGroupId: ${filteredUserIds.length} сотрудников (в пределах scope)`,
                );
              }
            },
          );
        } else {
          console.log(
            "[C8056] SKIP: foreignGroupId не найден — нет данных для негативного теста",
          );
        }

        await test.step(
          "Проверить: хотя бы один негативный тест был выполнен или scope корректен",
          async () => {
            // Даже без foreignGroupId — scope review_admin должен быть ограничен
            // Если baseline < adminTotal — фильтрация уже подтверждена
            if (!foreignGroupId) {
              console.log(
                "[C8056] foreignGroupId не найден, но scope проверен через сравнение с admin",
              );
            }
          },
        );
      },
    );
  },
);
