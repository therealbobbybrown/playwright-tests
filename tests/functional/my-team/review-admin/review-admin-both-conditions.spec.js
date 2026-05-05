import { test, expect } from "../../../fixtures/auth.js";
import { MyTeamPage } from "../../../../pages/MyTeamPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";

/**
 * AT-63: ОБА условия (permission + назначение на PR) → ЕСТЬ доступ к дашборду
 *
 * Использует reviewAdminAuth фикстуру, которая делает полный seed:
 * 1. Роль с permission 12
 * 2. Назначение роли пользователю
 * 3. Назначение администратором PR
 */

test.describe(
  "Review Admin — Оба условия: доступ есть",
  { tag: ["@ui", "@my-team", "@regression", "@review-admin"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.MY_TEAM, "Review Admin Both Conditions");
    });

    test(
      "C8061: Permission + назначение администратором PR -- дашборд доступен с данными",
      { tag: ["@smoke", "@critical"] },
      async ({ reviewAdminAuth: page }) => {
        setSeverity("critical");
        const myTeam = new MyTeamPage(page);
        const setupData = page._reviewAdminSetup;

        await test.step(
          `Seed: пользователь ${setupData.firstName} ${setupData.lastName} (id=${setupData.userId}) имеет роль (id=${setupData.roleId}) с permission 12 И назначен администратором PR ${setupData.prId}`,
          async () => {
            expect(setupData.userId).toBeTruthy();
            expect(setupData.roleId).toBeTruthy();
            expect(setupData.prId).toBeTruthy();
          },
        );

        await test.step("Открыть дашборд «Моя команда»", async () => {
          const origin = new URL(page.url()).origin;
          await page.goto(`${origin}/ru/dashboard/`);
          await page.waitForLoadState("domcontentloaded");
        });

        await test.step(
          "Проверить: дашборд открылся (URL содержит /dashboard)",
          async () => {
            expect(page.url()).toContain("/dashboard");
          },
        );

        await test.step(
          'Проверить: видны вкладки «Оценка команды» и «Распределение оценок»',
          async () => {
            await myTeam.assertOnlyAllowedTabs([
              "Оценка команды",
              "Распределение оценок",
            ]);
          },
        );

        await test.step(
          "Проверить: таблица оценки команды содержит данные",
          async () => {
            const table = page
              .locator('table[class*="Table_table"]')
              .first();
            await expect(table).toBeVisible({ timeout: 10000 });

            const rows = table.locator("tbody tr");
            const rowCount = await rows.count();
            expect(rowCount).toBeGreaterThan(0);
          },
        );
      },
    );
  },
);
