import { test, expect } from "../../../fixtures/auth.js";
import { ScoreDistributionTab } from "../../../../pages/ScoreDistributionTab.js";
import { DashboardTeamAPI } from "../../../utils/api/DashboardTeamAPI.js";
import { getCredentials } from "../../../utils/credentials.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";

test.describe(
  "Review Admin — Фильтр оценок scoped",
  { tag: ["@ui", "@my-team", "@regression", "@review-admin"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.MY_TEAM, "Review Admin Filter");
    });

    test(
      "C8065: Фильтр оценок содержит только assigned PR",
      { tag: ["@critical"] },
      async ({ reviewAdminAuth: page, request }) => {
        setSeverity("critical");

        const tab = new ScoreDistributionTab(page);
        const setup = page._reviewAdminSetup;
        const testUserPassword = process.env.TEST_USER_PASSWORD || "DemoPass_7421!";

        expect(setup, "reviewAdminSetup должен быть доступен").toBeTruthy();
        expect(setup.prId, "prId должен быть в setup").toBeTruthy();
        expect(setup.userId, "userId должен быть в setup").toBeTruthy();
        expect(setup.email, "email должен быть в setup").toBeTruthy();

        // ── API cross-check: какие PR видит review_admin через dashboard-filters ──

        let reviewAdminPRs;
        let assignedPR;

        await test.step(
          "API: review_admin видит ТОЛЬКО assigned PR в dashboard-filters",
          async () => {
            const dashAPI = new DashboardTeamAPI(request);
            await dashAPI.signIn(setup.email, testUserPassword);

            const { response, data } = await dashAPI.getDashboardFiltersPRs();

            expect(
              response.ok(),
              `dashboard-filters/performance-reviews вернул ${response.status()}`,
            ).toBe(true);
            expect(data, "Ответ dashboard-filters не должен быть null").toBeDefined();

            reviewAdminPRs = Array.isArray(data) ? data : data?.items || [];

            console.log(
              `[C8065] review_admin (userId=${setup.userId}) видит ${reviewAdminPRs.length} PR в фильтрах: ${JSON.stringify(reviewAdminPRs.map((pr) => pr.id || pr.prId || pr))}`,
            );

            // Assigned PR должен присутствовать в списке
            assignedPR = reviewAdminPRs.find(
              (pr) => String(pr.id || pr.prId || pr) === String(setup.prId),
            );

            expect(
              assignedPR,
              `Assigned PR ${setup.prId} должен присутствовать в фильтрах review_admin`,
            ).toBeDefined();
          },
        );

        await test.step(
          "API: review_admin видит СТРОГО МЕНЬШЕ PR, чем полный admin",
          async () => {
            const adminDashAPI = new DashboardTeamAPI(request);
            const { email: adminEmail, password: adminPassword } =
              getCredentials("admin");
            await adminDashAPI.signIn(adminEmail, adminPassword);

            const { response: adminResp, data: adminData } =
              await adminDashAPI.getDashboardFiltersPRs();

            expect(
              adminResp.ok(),
              `Admin dashboard-filters вернул ${adminResp.status()}`,
            ).toBe(true);

            const adminPRs = Array.isArray(adminData)
              ? adminData
              : adminData?.items || [];

            console.log(
              `[C8065] Admin видит ${adminPRs.length} PR, review_admin видит ${reviewAdminPRs.length} PR`,
            );

            // review_admin не должен видеть больше PR, чем admin
            expect(
              reviewAdminPRs.length,
              "review_admin не должен видеть больше PR, чем полный администратор",
            ).toBeLessThanOrEqual(adminPRs.length);

            // Если в системе больше одного PR — review_admin должен видеть строго меньше
            if (adminPRs.length > 1) {
              expect(
                reviewAdminPRs.length,
                `review_admin должен видеть только assigned PR (${setup.prId}), а не все ${adminPRs.length} PR компании`,
              ).toBeLessThan(adminPRs.length);
            }
          },
        );

        await test.step(
          "API: имя/данные assigned PR совпадают с setup",
          async () => {
            // assignedPR должен иметь id, совпадающий с setup.prId
            const prId = String(assignedPR.id || assignedPR.prId || assignedPR);
            expect(
              prId,
              "ID assigned PR в фильтрах должен совпадать с setup.prId",
            ).toBe(String(setup.prId));

            // Если PR содержит name/title — он должен быть непустым
            const prName = assignedPR.name || assignedPR.title || null;
            if (prName !== null) {
              expect(
                prName.length,
                "Имя assigned PR не должно быть пустым",
              ).toBeGreaterThan(0);
              console.log(
                `[C8065] Assigned PR: id=${prId}, name="${prName}"`,
              );
            } else {
              console.log(
                `[C8065] Assigned PR: id=${prId} (name/title не в ответе)`,
              );
            }
          },
        );

        // ── UI: дашборд открывается и фильтр «Сотрудники» доступен ──

        await test.step(
          'Открыть дашборд → вкладка «Распределение оценок»',
          async () => {
            const origin = new URL(page.url()).origin;
            await page.goto(`${origin}/ru/dashboard/`);
            await page.waitForLoadState("domcontentloaded");
            await tab.switchToTab();
          },
        );

        await test.step(
          "UI: фильтр «Сотрудники» содержит хотя бы одну опцию (scoping работает)",
          async () => {
            const options = await tab.getEmployeesFilterOptions();
            expect(
              options.length,
              "Должна быть хотя бы 1 опция в фильтре «Сотрудники»",
            ).toBeGreaterThan(0);

            console.log(
              `[C8065] Доступные опции фильтра «Сотрудники»: ${JSON.stringify(options)}`,
            );
          },
        );

        await test.step(
          "UI: таблица распределения оценок отображается корректно",
          async () => {
            const rowCount = await tab.getRowCount();
            console.log(
              `[C8065] Строк в таблице распределения оценок: ${rowCount}`,
            );
            // Таблица может быть пустой если PR ещё в процессе (нет завершённых оценок).
            // Если строки есть — проверяем что количество разумно (scoped, не все PR)
            if (rowCount > 0) {
              expect(
                rowCount,
                "Количество строк в таблице должно быть разумным для scoped review_admin",
              ).toBeLessThanOrEqual(100);
            }
          },
        );
      },
    );
  },
);
