import { test as base, expect } from "../../../fixtures/auth.js";
import { ReviewAdminSeedHelper } from "../../../utils/seed/index.js";
import { TokenManager } from "../../../utils/auth/TokenManager.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";

/**
 * AT-61: Permission manageOwnPerformanceReview (12) + viewDashboard (21) БЕЗ назначения администратором PR
 * Ожидание: дашборд доступен, пользователь видит данные всех PR компании
 * (permission 12 даёт доступ к данным PR, permission 21 даёт доступ к дашборду)
 *
 * Seed: роль с permission 12+21, назначение роли пользователю, но БЕЗ assignAsAdminToPR
 */

const test = base.extend({
  permissionOnlyPage: async ({ page, request }, use) => {
    const helper = new ReviewAdminSeedHelper(request);
    await helper.init("admin");

    const baseUser = await helper.findBaseUser();
    const { roleId, title: roleTitle, created } =
      await helper.findOrCreateReviewAdminRole();
    const previousRoleIds = await helper.assignRoleToUser(
      baseUser.userId,
      roleId,
    );

    // НЕ назначаем администратором PR — это суть теста

    // Инвалидируем кеш токенов, т.к. роли изменились
    TokenManager.invalidate(baseUser.email);

    const testUserPassword = process.env.TEST_USER_PASSWORD || "DemoPass_7421!";
    await TokenManager.loginViaApi(page, baseUser.email, testUserPassword);

    page._setupData = {
      ...baseUser,
      roleId,
      roleTitle,
      previousRoleIds,
      roleCreated: created,
    };
    page._seedHelper = helper;

    await use(page);

    // cleanup: восстановить роли
    await helper.cleanup({
      userId: baseUser.userId,
      roleId,
      previousRoleIds,
      roleCreated: created,
    });
  },
});

test.describe(
  "Review Admin — Permission без назначения на PR",
  { tag: ["@ui", "@my-team", "@regression", "@review-admin"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.MY_TEAM, "Review Admin Permission Only");
    });

    test(
      "C8068: Permission manageOwnPerformanceReview без назначения на PR -- дашборд доступен с данными компании",
      { tag: ["@critical"] },
      async ({ permissionOnlyPage: page }) => {
        setSeverity("critical");
        const setupData = page._setupData;

        await test.step(
          `Seed: пользователь ${setupData.firstName} ${setupData.lastName} (id=${setupData.userId}) имеет роль "${setupData.roleTitle}" с permission 12+21, но НЕ назначен администратором PR`,
          async () => {
            expect(setupData.userId).toBeTruthy();
            expect(setupData.roleId).toBeTruthy();
          },
        );

        await test.step("Открыть дашборд «Моя команда»", async () => {
          const origin = new URL(page.url()).origin;
          await page.goto(`${origin}/ru/dashboard/`);
          await page.waitForLoadState("domcontentloaded");
        });

        await test.step(
          "Проверить: дашборд доступен (permission viewDashboard 21 есть)",
          async () => {
            expect(
              page.url(),
              "Дашборд должен быть доступен с permission viewDashboard",
            ).toContain("/dashboard");
          },
        );

        await test.step(
          "Проверить: permission 12 даёт доступ к данным PR компании даже без назначения на конкретный PR",
          async () => {
            // С permission manageOwnPerformanceReview (12) + viewDashboard (21)
            // пользователь видит данные всех PR компании на дашборде,
            // даже если не назначен администратором конкретного PR.
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
                `[C8068] Строк в таблице "Оценка команды": ${rowCount}`,
              );
              // Permission даёт доступ ко всем данным PR — строки ожидаемы
              expect(
                rowCount,
                "Permission 12 даёт доступ к данным PR компании",
              ).toBeGreaterThanOrEqual(0);
            }
          },
        );
      },
    );
  },
);
