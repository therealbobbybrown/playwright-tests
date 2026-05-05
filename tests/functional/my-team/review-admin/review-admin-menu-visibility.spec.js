import { test, expect } from "../../../fixtures/auth.js";
import { SideMenu } from "../../../../pages/SideMenu.js";
import { DashboardTeamAPI } from "../../../utils/api/DashboardTeamAPI.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";

test.describe(
  "Review Admin — Видимость пункта меню «Моя команда»",
  { tag: ["@ui", "@my-team", "@regression", "@review-admin"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.MY_TEAM, "Review Admin Menu Visibility");
    });

    test(
      "C8067: Пункт «Моя команда» виден в боковом меню для review_admin",
      { tag: ["@smoke", "@critical"] },
      async ({ reviewAdminAuth: page, request }) => {
        setSeverity("critical");
        const sideMenu = new SideMenu(page);
        const setup = page._reviewAdminSetup;
        const testUserPassword = process.env.TEST_USER_PASSWORD || "DemoPass_7421!";

        expect(setup, "reviewAdminSetup должен быть доступен").toBeTruthy();
        expect(setup.userId, "userId должен быть в setup").toBeTruthy();
        expect(setup.prId, "prId должен быть в setup").toBeTruthy();

        await test.step("Открыть главную страницу", async () => {
          const origin = new URL(page.url()).origin;
          await page.goto(`${origin}/ru/`);
          await page.waitForLoadState("domcontentloaded");
        });

        await test.step(
          'Пункт «Моя команда» виден в боковом меню',
          async () => {
            await expect(sideMenu.myTeamMenuItem).toBeVisible();
          },
        );

        await test.step(
          'Перейти в «Моя команда» через боковое меню',
          async () => {
            await sideMenu.openMyTeam();
          },
        );

        await test.step(
          'Проверить, что открылся дашборд «Моя команда» с заголовком',
          async () => {
            await expect(page).toHaveURL(/\/dashboard\/?/);
            // Заголовок "Моя команда" подтверждает, что страница реально загрузилась
            await expect(
              page.getByRole("heading", { level: 1, name: /Моя команда/i }),
            ).toBeVisible({ timeout: 10000 });
          },
        );

        await test.step(
          "API: review_admin видит assigned PR в dashboard-filters (scoping работает)",
          async () => {
            const dashAPI = new DashboardTeamAPI(request);
            await dashAPI.signIn(setup.email, testUserPassword);

            const { response, data } = await dashAPI.getDashboardFiltersPRs();
            expect(
              response.ok(),
              `dashboard-filters вернул ${response.status()}`,
            ).toBe(true);

            const prs = Array.isArray(data) ? data : data?.items || [];
            const assignedPR = prs.find(
              (pr) => String(pr.id || pr.prId || pr) === String(setup.prId),
            );

            expect(
              assignedPR,
              `Assigned PR ${setup.prId} должен быть в dashboard-filters после навигации через меню`,
            ).toBeDefined();

            console.log(
              `[C8067] review_admin (userId=${setup.userId}) видит ${prs.length} PR, assigned PR ${setup.prId} найден`,
            );
          },
        );
      },
    );
  },
);
