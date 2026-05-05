/**
 * Добавление назначения администратором PR — появление доступа к данным
 *
 * review_admin = permission [12] (manageOwnPerformanceReview) + назначение администратором PR.
 * При добавлении назначения (assignAsAdminToPR) у пользователя с permission [12]
 * появляется доступ к данным конкретного PR на дашборде.
 *
 * Шаги:
 * 1. Seed: пользователь с permission [12], но БЕЗ назначения администратором PR
 * 2. Проверить через API что dashboard-filters НЕ содержит target PR (до назначения)
 * 3. Назначить пользователя администратором PR через admin API
 * 4. Инвалидировать токен и повторно авторизоваться
 * 5. Проверить через API что assigned PR появился в фильтрах дашборда
 * 6. Проверить что данные assigned PR доступны (revisions endpoint возвращает 200)
 */

import { test as base, expect } from "../../../fixtures/auth.js";
import { ReviewAdminSeedHelper } from "../../../utils/seed/index.js";
import { TokenManager } from "../../../utils/auth/TokenManager.js";
import { DashboardTeamAPI } from "../../../utils/api/DashboardTeamAPI.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";
import { PerformanceReviewSeedHelper } from "../../../utils/seed/index.js";
import { DatabaseClient, PerformanceReviewVerifier } from "../../../utils/db/index.js";

const test = base.extend({
  /**
   * Fixture: пользователь с permission [12] БЕЗ назначения на PR.
   * Сохраняет prId для теста — чтобы тест мог назначить пользователя администратором.
   */
  grantCtx: async ({ request }, use) => {
    const helper = new ReviewAdminSeedHelper(request);
    await helper.init("admin");

    // 1. Найти базового пользователя
    const baseUser = await helper.findBaseUser();

    // 2. Найти/создать роль с permission [12]
    const { roleId, title: roleTitle, created: roleCreated } =
      await helper.findOrCreateReviewAdminRole();

    // 3. Назначить роль пользователю
    const previousRoleIds = await helper.assignRoleToUser(
      baseUser.userId,
      roleId,
    );

    // 4. Убедиться что пользователь НЕ назначен администратором ни одного PR
    await helper.removeAllPRAdminAssignments(baseUser.userId);

    // 5. Создать НОВЫЙ PR для этого теста — чтобы гарантировать что пользователь
    //    не имеет предыдущего назначения на него (только что созданный PR чистый).
    //    findValidPRForMyTeam возвращает существующий PR, в котором пользователь
    //    мог быть ранее назначен и cleanup предыдущего теста не отработал.
    const prSeedHelper = new PerformanceReviewSeedHelper(request);
    await prSeedHelper.init("admin");

    const newPR = await prSeedHelper.seedActivePR();
    const prId = newPR.id;
    console.log(`[GrantCtx] Создан новый PR специально для теста grant-access: ${prId}`);

    if (!prId) {
      throw new Error(
        "[GrantCtx] Не удалось создать PR для теста назначения review_admin",
      );
    }

    // 6. Инвалидировать токен — роли только что изменились
    TokenManager.invalidate(baseUser.email);

    const ctx = {
      helper,
      prSeedHelper,
      userId: baseUser.userId,
      email: baseUser.email,
      firstName: baseUser.firstName,
      lastName: baseUser.lastName,
      roleId,
      roleTitle,
      roleCreated,
      previousRoleIds,
      prId,
    };

    await use(ctx);

    // Cleanup: убрать из администраторов PR + восстановить роли
    await helper.cleanup({
      userId: baseUser.userId,
      roleId,
      prId,
      previousRoleIds,
      roleCreated,
    });

    // Cleanup: удалить созданный PR
    try {
      await prSeedHelper.cleanup();
    } catch (e) {
      console.warn(`[GrantCtx] Не удалось удалить тестовый PR ${prId}: ${e.message}`);
    }
  },
});

test.describe(
  "Review Admin — Добавление назначения даёт доступ",
  { tag: ["@api", "@my-team", "@regression", "@review-admin"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.MY_TEAM, "Review Admin Grant Access");
    });

    test("C8083: Добавление назначения администратором PR — появление доступа к данным",
      { tag: ["@critical"] },
      async ({ grantCtx, request }) => {
        setSeverity("critical");
        const { helper, userId, email, firstName, lastName, prId } = grantCtx;
        const testUserPassword = process.env.TEST_USER_PASSWORD || "DemoPass_7421!";

        await test.step(
          `Seed: пользователь ${firstName} ${lastName} (id=${userId}) — permission [12], назначения на PR НЕТ`,
          async () => {
            expect(userId, "userId должен быть определён").toBeTruthy();
            expect(prId, "prId должен быть определён").toBeTruthy();
          },
        );

        // ── Step 1: API — до назначения dashboard-filters НЕ содержит target PR ──

        const dashAPI = new DashboardTeamAPI(request);
        await dashAPI.signIn(email, testUserPassword);

        await test.step(
          `Проверить: до назначения — dashboard-filters не содержит PR ${prId} или список пуст`,
          async () => {
            const { response, data } = await dashAPI.getDashboardFiltersPRs();
            expect(
              response.ok(),
              `dashboard-filters вернул ${response.status()}`,
            ).toBe(true);

            const prList = Array.isArray(data) ? data : data?.items || [];
            const targetPR = prList.find(
              (pr) => String(pr.id) === String(prId),
            );

            console.log(
              `[GrantAccess] До назначения: ${prList.length} PR в фильтрах, PR ${prId} найден: ${!!targetPR}`,
            );
            expect(
              targetPR,
              `PR ${prId} НЕ должен присутствовать в фильтрах до назначения администратором`,
            ).toBeUndefined();
          },
        );

        // ── Step 2: Назначить пользователя администратором PR через admin API ──

        await test.step(
          `DB: пользователь ${userId} НЕ назначен администратором PR ${prId} до назначения`,
          async () => {
            const db = new DatabaseClient();
            await db.connect();
            try {
              const prVerifier = new PerformanceReviewVerifier(db);
              await prVerifier.verifyReviewAdminNotAssigned(prId, userId);
              console.log(`[GrantAccess] DB: user ${userId} НЕ в managers PR ${prId} — ОК`);
            } finally {
              if (db.isConnected()) await db.disconnect();
            }
          },
        );

        await test.step(
          `Назначить пользователя ${userId} администратором PR ${prId}`,
          async () => {
            await helper.assignAsAdminToPR(prId, userId);
            console.log(
              `[GrantAccess] Пользователь ${userId} назначен администратором PR ${prId}`,
            );
          },
        );

        await test.step(
          `DB: пользователь ${userId} назначен администратором PR ${prId} в БД`,
          async () => {
            const db = new DatabaseClient();
            await db.connect();
            try {
              const prVerifier = new PerformanceReviewVerifier(db);
              await prVerifier.verifyReviewAdminAssigned(prId, userId);
              console.log(`[GrantAccess] DB: user ${userId} В managers PR ${prId} — ОК`);
            } finally {
              if (db.isConnected()) await db.disconnect();
            }
          },
        );

        // ── Step 3: Инвалидировать токен и повторно авторизоваться ──

        await test.step(
          "Инвалидировать токен и повторно авторизоваться с обновлёнными правами",
          async () => {
            TokenManager.invalidate(email);
            await dashAPI.signIn(email, testUserPassword);
            console.log(`[GrantAccess] Перелогин выполнен для ${email}`);
          },
        );

        // ── Step 4: API — после назначения assigned PR должен быть виден в фильтрах ──

        await test.step(
          `Проверить: после назначения — PR ${prId} появился в dashboard-filters`,
          async () => {
            const { response, data } = await dashAPI.getDashboardFiltersPRs();
            expect(
              response.ok(),
              `dashboard-filters вернул ${response.status()}`,
            ).toBe(true);

            const prList = Array.isArray(data) ? data : data?.items || [];
            const assignedPR = prList.find(
              (pr) => String(pr.id) === String(prId),
            );

            console.log(
              `[GrantAccess] После назначения: ${prList.length} PR в фильтрах, PR ${prId} найден: ${!!assignedPR}`,
            );
            expect(
              assignedPR,
              `PR ${prId} должен быть в списке фильтров после назначения администратором`,
            ).toBeDefined();
          },
        );

        // ── Step 5: Данные assigned PR доступны (revisions endpoint) ──

        await test.step(
          `Проверить: данные assigned PR ${prId} доступны (endpoint revisions возвращает 200)`,
          async () => {
            const { response, data } =
              await dashAPI.getDashboardFiltersRevisions(prId);
            expect(
              response.ok(),
              `dashboard-filters revisions для PR ${prId} вернул ${response.status()} — доступ должен быть открыт`,
            ).toBe(true);

            const revisions = Array.isArray(data) ? data : data?.items || [];
            console.log(
              `[GrantAccess] Revisions для PR ${prId}: ${revisions.length} записей`,
            );
            expect(
              revisions.length,
              `Revisions для PR ${prId} должны содержать хотя бы одну запись — иначе доступ фиктивный`,
            ).toBeGreaterThan(0);
          },
        );
      },
    );
  },
);
