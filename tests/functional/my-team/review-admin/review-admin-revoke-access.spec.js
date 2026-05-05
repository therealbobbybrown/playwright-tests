/**
 * C8071: Снятие назначения администратором PR — потеря доступа к данным PR
 *
 * review_admin = permission [12] (manageOwnPerformanceReview) + назначение администратором PR.
 * При снятии назначения (removeAsAdminFromPR) роль с permission [12] остаётся,
 * но доступ к данным конкретного PR пропадает.
 *
 * Шаги:
 * 1. Seed: reviewAdminAuth создаёт пользователя с permission [12] + назначение на PR
 * 2. Проверить через API что assigned PR виден в фильтрах (до revoke)
 * 3. Открыть дашборд → убедиться что данные PR видны (таблица, строки)
 * 4. Через API убрать назначение администратором PR
 * 5. API: dashboard-filters НЕ содержит revoked PR
 * 6. Инвалидировать токен, перелогиниться, проверить UI — данных PR нет
 */

import { test, expect } from "../../../fixtures/auth.js";
import { ReviewAdminSeedHelper } from "../../../utils/seed/index.js";
import { TokenManager } from "../../../utils/auth/TokenManager.js";
import { DashboardTeamAPI } from "../../../utils/api/DashboardTeamAPI.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";
import { DatabaseClient, PerformanceReviewVerifier } from "../../../utils/db/index.js";

test.describe(
  "Review Admin — Снятие назначения администратором PR",
  { tag: ["@ui", "@my-team", "@regression", "@review-admin"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.MY_TEAM, "Review Admin Revoke Access");
    });

    test(
      "C8071: Снятие назначения администратором PR — потеря доступа к данным",
      { tag: ["@critical"] },
      async ({ reviewAdminAuth: page, request }) => {
        setSeverity("critical");
        const setup = page._reviewAdminSetup;
        const testUserPassword = process.env.TEST_USER_PASSWORD || "DemoPass_7421!";

        await test.step(
          `Seed: пользователь ${setup.firstName} ${setup.lastName} (id=${setup.userId}) — permission [12] + admin PR ${setup.prId}`,
          async () => {
            expect(setup.userId, "userId должен быть определён").toBeTruthy();
            expect(setup.roleId, "roleId должен быть определён").toBeTruthy();
            expect(setup.prId, "prId должен быть определён").toBeTruthy();
          },
        );

        // ── Step 1: API — до revoke assigned PR виден в фильтрах ──

        let prCountBefore;
        await test.step(
          "API: dashboard-filters содержит assigned PR (до revoke)",
          async () => {
            const dashAPI = new DashboardTeamAPI(request);
            await dashAPI.signIn(setup.email, testUserPassword);

            const { response, data } =
              await dashAPI.getDashboardFiltersPRs();
            expect(response.ok(), "dashboard-filters доступен").toBe(true);

            const prList = Array.isArray(data) ? data : data?.items || [];
            prCountBefore = prList.length;
            const assignedPR = prList.find(
              (pr) => String(pr.id) === String(setup.prId),
            );

            console.log(
              `[C8071] До revoke: ${prList.length} PR в фильтрах, assigned PR ${setup.prId} найден: ${!!assignedPR}`,
            );
            expect(
              assignedPR,
              `PR ${setup.prId} должен быть в фильтрах до revoke`,
            ).toBeDefined();
          },
        );

        // ── Step 2: UI — дашборд показывает данные PR (до revoke) ──

        await test.step(
          "Открыть дашборд и убедиться что данные PR видны",
          async () => {
            const origin = new URL(page.url()).origin;
            await page.goto(`${origin}/ru/dashboard/`);
            await page.waitForLoadState("domcontentloaded");

            expect(page.url(), "Должен быть на /dashboard").toContain(
              "/dashboard",
            );

            const table = page
              .locator('table[class*="Table_table"]')
              .first();

            // После назначения роли + cookie injection SPA может кешировать
            // старое состояние. Если таблица не появилась — перезагрузить страницу.
            let tableVisible = await table
              .waitFor({ state: "visible", timeout: 10000 })
              .then(() => true)
              .catch(() => false);

            if (!tableVisible) {
              console.log(
                "[C8071] Таблица не видна после первой загрузки — перезагружаем страницу",
              );
              await page.reload({ waitUntil: "domcontentloaded" });
              await expect(
                table,
                "Таблица оценки команды должна быть видна (до revoke) после reload",
              ).toBeVisible({ timeout: 15000 });
            }

            const rows = table.locator("tbody tr");
            const rowCount = await rows.count();
            expect(
              rowCount,
              "Таблица должна содержать строки с данными PR",
            ).toBeGreaterThan(0);
            console.log(
              `[C8071] До revoke: ${rowCount} строк в таблице "Оценка команды"`,
            );
          },
        );

        // ── Step 3: Убрать назначение администратором PR через API ──

        await test.step(
          `DB: пользователь ${setup.userId} назначен администратором PR ${setup.prId} в БД (до revoke)`,
          async () => {
            const db = new DatabaseClient();
            await db.connect();
            try {
              const prVerifier = new PerformanceReviewVerifier(db);
              await prVerifier.verifyReviewAdminAssigned(setup.prId, setup.userId);
              console.log(`[C8071] DB: user ${setup.userId} В managers PR ${setup.prId} — ОК`);
            } finally {
              if (db.isConnected()) await db.disconnect();
            }
          },
        );

        await test.step(
          `Убрать пользователя ${setup.userId} из администраторов PR ${setup.prId}`,
          async () => {
            const helper = new ReviewAdminSeedHelper(request);
            await helper.init("admin");
            await helper.removeAsAdminFromPR(setup.prId, setup.userId);
            console.log(
              `[C8071] Назначение администратором PR ${setup.prId} снято для userId=${setup.userId}`,
            );
          },
        );

        await test.step(
          `DB: пользователь ${setup.userId} убран из администраторов PR ${setup.prId} в БД`,
          async () => {
            const db = new DatabaseClient();
            await db.connect();
            try {
              const prVerifier = new PerformanceReviewVerifier(db);
              await prVerifier.verifyReviewAdminNotAssigned(setup.prId, setup.userId);
              console.log(`[C8071] DB: user ${setup.userId} НЕ в managers PR ${setup.prId} — ОК`);
            } finally {
              if (db.isConnected()) await db.disconnect();
            }
          },
        );

        // ── Step 4: API — после revoke assigned PR НЕ виден в фильтрах ──

        await test.step(
          "API: dashboard-filters НЕ содержит revoked PR после снятия назначения",
          async () => {
            // Инвалидировать кешированный токен и получить свежий
            TokenManager.invalidate(setup.email);
            const dashAPI = new DashboardTeamAPI(request);
            await dashAPI.signIn(setup.email, testUserPassword);

            const { response, data } =
              await dashAPI.getDashboardFiltersPRs();
            expect(
              response.ok(),
              `dashboard-filters вернул ${response.status()}`,
            ).toBe(true);

            const prList = Array.isArray(data) ? data : data?.items || [];
            const assignedPR = prList.find(
              (pr) => String(pr.id) === String(setup.prId),
            );

            console.log(
              `[C8071] После revoke: ${prList.length} PR в фильтрах (было ${prCountBefore}), PR ${setup.prId} найден: ${!!assignedPR}`,
            );
            expect(
              assignedPR,
              `PR ${setup.prId} НЕ должен быть в списке фильтров после снятия назначения`,
            ).toBeUndefined();
          },
        );

        // ── Step 5: Инвалидировать токен, перелогиниться, проверить UI ──

        await test.step(
          "Инвалидировать токен и перелогиниться с обновлёнными правами",
          async () => {
            // Очистить cookies чтобы SPA не использовала кешированные данные
            await page.context().clearCookies();
            TokenManager.invalidate(setup.email);

            const loginOk = await TokenManager.loginViaApi(
              page,
              setup.email,
              testUserPassword,
            );
            expect(loginOk, "Перелогин должен быть успешным").toBe(true);
            console.log(
              `[C8071] Перелогин выполнен для ${setup.email}`,
            );
          },
        );

        await test.step(
          "Открыть дашборд и проверить отсутствие данных PR (empty state)",
          async () => {
            const origin = new URL(page.url()).origin;
            await page.goto(`${origin}/ru/dashboard/`);
            await page.waitForLoadState("domcontentloaded");

            // После снятия назначения при permission [12] без [21]:
            // дашборд может показать empty state (нет PR в фильтрах)
            // или показать таблицу без строк.

            // Даём странице время полностью загрузиться
            try {
              await page.waitForLoadState("networkidle", { timeout: 10000 });
            } catch {
              // networkidle может не сработать — не критично
            }

            // Проверяем: таблица либо не видна, либо пуста (0 строк)
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
                `[C8071] После revoke (UI): ${rowCount} строк в таблице`,
              );
              expect(
                rowCount,
                "После снятия назначения таблица должна быть пуста (0 строк)",
              ).toBe(0);
            } else {
              // Таблица не видна — ожидаемое поведение (empty state)
              const url = page.url();
              console.log(
                `[C8071] После revoke (UI): таблица не видна, URL=${url}`,
              );
              // Проверяем что на странице есть индикация отсутствия данных
              // или что мы всё ещё на дашборде (а не на ошибке)
              const isDashboard = url.includes("/dashboard");
              const isHome = url.includes("/home") || url.endsWith("/ru/");
              expect(
                isDashboard || isHome,
                "Пользователь должен быть на дашборде или перенаправлен на главную",
              ).toBe(true);
            }
          },
        );
      },
    );
  },
);
