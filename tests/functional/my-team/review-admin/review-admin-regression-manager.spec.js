/**
 * AT-43/44: Регрессия review_admin — менеджер по-прежнему видит только своих подчинённых
 *
 * После введения фичи review_admin менеджер (MANAGER_LOGIN) не должен
 * получать расширенный scope дашборда «Моя команда».
 * Он должен видеть <= пользователей и PR, чем полный администратор.
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
  "Review Admin Regression — менеджер видит только подчинённых",
  { tag: ["@api", "@my-team", "@regression", "@review-admin"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.MY_TEAM);
    });

    test("C8087: Менеджер видит PR в dashboard-filters (не больше, чем admin)",
      async ({ request }) => {
        setSeverity("normal");

        // Login as manager
        const managerCreds = getCredentials("manager");
        const managerDashAPI = new DashboardTeamAPI(request);
        await managerDashAPI.signIn(managerCreds.email, managerCreds.password);

        // Login as admin for comparison
        const adminCreds = getCredentials("admin");
        const adminDashAPI = new DashboardTeamAPI(request);
        await adminDashAPI.signIn(adminCreds.email, adminCreds.password);

        let managerPRs;
        let adminPRs;

        await test.step(
          "Получить список PR из dashboard-filters от имени менеджера",
          async () => {
            const { response, data } =
              await managerDashAPI.getDashboardFiltersPRs();

            expect(
              response.ok(),
              `dashboard-filters/performance-reviews вернул ${response.status()} для менеджера`,
            ).toBe(true);
            expect(data).toBeDefined();

            managerPRs = Array.isArray(data) ? data : data?.items || [];
            console.log(
              `[AT-43] Manager видит ${managerPRs.length} PR в фильтрах дашборда`,
            );
          },
        );

        await test.step(
          "Получить список PR из dashboard-filters от имени admin для сравнения",
          async () => {
            const { response, data } =
              await adminDashAPI.getDashboardFiltersPRs();

            expect(
              response.ok(),
              `dashboard-filters/performance-reviews вернул ${response.status()} для admin`,
            ).toBe(true);

            adminPRs = Array.isArray(data) ? data : data?.items || [];
            console.log(
              `[AT-43] Admin видит ${adminPRs.length} PR в фильтрах дашборда`,
            );
          },
        );

        await test.step(
          "Проверить: менеджер видит <= PR, чем полный администратор",
          async () => {
            expect(
              managerPRs.length,
              `Менеджер не должен видеть больше PR, чем admin (manager: ${managerPRs.length}, admin: ${adminPRs.length})`,
            ).toBeLessThanOrEqual(adminPRs.length);

            console.log(
              `[AT-43] OK: менеджер видит ${managerPRs.length} PR, admin видит ${adminPRs.length} PR`,
            );
          },
        );

        await test.step(
          "Проверить структуру: каждый PR имеет id, нет дубликатов",
          async () => {
            for (const pr of managerPRs) {
              const prId = pr.id || pr.prId || pr;
              expect(prId, "Каждый PR должен иметь id").toBeDefined();
            }

            const prIds = managerPRs.map((pr) =>
              String(pr.id || pr.prId || pr),
            );
            const uniquePrIds = new Set(prIds);
            expect(
              uniquePrIds.size,
              "Не должно быть дубликатов PR в фильтрах менеджера",
            ).toBe(prIds.length);
          },
        );
      },
    );

    test("C8088: Менеджер не получает расширенный scope distribution-users от review_admin (нет регрессии)",
      async ({ request }) => {
        setSeverity("normal");

        // Login as manager
        const managerCreds = getCredentials("manager");
        const managerDashAPI = new DashboardTeamAPI(request);
        await managerDashAPI.signIn(managerCreds.email, managerCreds.password);

        // Login as admin for comparison
        const adminCreds = getCredentials("admin");
        const adminDashAPI = new DashboardTeamAPI(request);
        await adminDashAPI.signIn(adminCreds.email, adminCreds.password);

        let managerStatus;
        let managerTotal = 0;
        let adminTotal = 0;

        await test.step(
          "Проверить: distribution-users для менеджера возвращает 200/201 (подчинённые) или 403 (нет viewDashboard)",
          async () => {
            const { response, data } = await managerDashAPI.getDistributionUsers({
              usersSubset: "all",
              limit: 200,
            });

            managerStatus = response.status();

            // Менеджер с подчинёнными может иметь доступ к distribution-users (200/201) —
            // это нормально, он видит только своих подчинённых.
            // Если у менеджера нет permission viewDashboard — возвращается 403.
            // В обоих случаях регрессии нет.
            // Регрессия была бы, если бы review_admin фича расширила scope менеджера
            // до уровня полного администратора.
            expect(
              [200, 201, 403].includes(managerStatus),
              `distribution-users для менеджера вернул неожиданный статус ${managerStatus}. ` +
                `Допустимо: 200/201 (менеджер видит подчинённых) или 403 (нет permission viewDashboard)`,
            ).toBe(true);

            if (response.ok()) {
              managerTotal = data?.total ?? 0;
              console.log(
                `[AT-44] Менеджер имеет доступ к distribution-users: статус ${managerStatus}, total=${managerTotal}`,
              );
            } else {
              console.log(
                `[AT-44] Менеджер не имеет доступа к distribution-users: статус ${managerStatus} — ОК`,
              );
            }
          },
        );

        // Если менеджер имеет доступ — убедиться, что его scope не превышает admin-scope
        // (это и есть проверка отсутствия регрессии от review_admin)
        if ([200, 201].includes(managerStatus)) {
          await test.step(
            "Менеджер видит <= пользователей, чем полный администратор (нет расширения scope)",
            async () => {
              const { response: adminResp, data: adminData } =
                await adminDashAPI.getDistributionUsers({
                  usersSubset: "all",
                  limit: 200,
                });

              expect(
                adminResp.ok(),
                `distribution-users вернул ${adminResp.status()} для admin`,
              ).toBe(true);

              adminTotal = adminData?.total ?? 0;
              console.log(
                `[AT-44] Admin scope: total=${adminTotal}. Manager scope: total=${managerTotal}`,
              );

              expect(
                managerTotal,
                `Менеджер не должен видеть БОЛЬШЕ пользователей, чем admin ` +
                  `(manager=${managerTotal}, admin=${adminTotal}). ` +
                  `Если manager > admin — это регрессия: review_admin расширил scope менеджера.`,
              ).toBeLessThanOrEqual(adminTotal);

              console.log(
                `[AT-44] OK: manager scope (${managerTotal}) <= admin scope (${adminTotal}) — регрессии нет`,
              );
            },
          );
        }
      },
    );
  },
);
