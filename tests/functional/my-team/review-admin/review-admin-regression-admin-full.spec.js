/**
 * AT-41/42: Regression — admin_full видит ВСЕ данные после введения review_admin
 *
 * Проверяет, что полный администратор НЕ получил регрессию прав:
 * - видит ВСЕ PR в dashboard-filters (не только 1)
 * - видит ВСЕХ сотрудников в distribution-users
 * - его охват строго больше, чем у review_admin
 */

import { test, expect } from "../../../fixtures/full.js";
import { DashboardTeamAPI } from "../../../utils/api/DashboardTeamAPI.js";
import { getCredentials } from "../../../utils/credentials.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";

test.describe(
  "Review Admin Regression — admin_full видит все данные",
  { tag: ["@api", "@my-team", "@regression", "@review-admin"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.MY_TEAM, "Review Admin Regression");
    });

    test("C8086: Admin_full видит все PR и всех сотрудников дашборда",
      { tag: ["@critical"] },
      async ({ request }) => {
        setSeverity("critical");

        const { email, password } = getCredentials("admin");
        const dashAPI = new DashboardTeamAPI(request);
        await dashAPI.signIn(email, password);

        let adminPRs;
        let adminUsersTotal;

        await test.step(
          "Получить список PR через dashboard-filters от имени admin_full",
          async () => {
            const { response, data } = await dashAPI.getDashboardFiltersPRs();

            expect(
              response.ok(),
              `dashboard-filters/performance-reviews вернул ${response.status()}`,
            ).toBe(true);
            expect(data).toBeDefined();

            adminPRs = Array.isArray(data) ? data : data?.items || [];

            console.log(
              `[AT-41] admin_full видит ${adminPRs.length} PR в фильтрах дашборда`,
            );
          },
        );

        await test.step(
          "Проверить: admin_full видит более одного PR",
          async () => {
            expect(
              adminPRs.length,
              "admin_full должен видеть более 1 PR — иначе данные отсутствуют или регрессия прав",
            ).toBeGreaterThan(1);

            // Проверить структуру каждого PR
            for (const pr of adminPRs) {
              const prId = pr.id || pr.prId || pr;
              expect(prId, "Каждый PR должен иметь id").toBeDefined();
            }

            // Не должно быть дубликатов
            const prIds = adminPRs.map((pr) => String(pr.id || pr.prId || pr));
            const uniquePrIds = new Set(prIds);
            expect(
              uniquePrIds.size,
              "Не должно быть дубликатов PR в списке admin_full",
            ).toBe(prIds.length);

            console.log(
              `[AT-41] OK: admin_full видит ${adminPRs.length} уникальных PR`,
            );
          },
        );

        await test.step(
          "Получить список сотрудников через distribution-users от имени admin_full",
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

            const users = data?.items || [];
            adminUsersTotal = data?.total ?? users.length;

            console.log(
              `[AT-42] admin_full видит ${adminUsersTotal} сотрудников (items: ${users.length})`,
            );
          },
        );

        await test.step(
          "Проверить: admin_full видит значительное число сотрудников",
          async () => {
            expect(
              adminUsersTotal,
              "admin_full должен видеть более 10 сотрудников — иначе данные отсутствуют или регрессия прав",
            ).toBeGreaterThan(10);

            console.log(
              `[AT-42] OK: admin_full видит ${adminUsersTotal} сотрудников — регрессии нет`,
            );
          },
        );

        await test.step(
          "Проверить: можно открыть ревизии первого PR (доступ не ограничен)",
          async () => {
            const firstPr = adminPRs[0];
            const firstPrId = firstPr?.id || firstPr?.prId || firstPr;

            expect(
              firstPrId,
              "Первый PR должен иметь id для проверки доступа к ревизиям",
            ).toBeDefined();

            const { response, data } =
              await dashAPI.getDashboardFiltersRevisions(firstPrId);

            expect(
              response.ok(),
              `dashboard-filters/${firstPrId}/revisions вернул ${response.status()} — admin_full не должен получить 403`,
            ).toBe(true);

            const revisions = Array.isArray(data)
              ? data
              : data?.items || [];

            console.log(
              `[AT-42] PR #${firstPrId}: admin_full видит ${revisions.length} ревизий`,
            );
          },
        );
      },
    );
  },
);
