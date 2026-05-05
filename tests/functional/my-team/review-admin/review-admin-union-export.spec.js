/**
 * AT-47/48: Union scope XLSX export — head + review_admin
 *
 * Когда пользователь имеет ОДНОВРЕМЕННО:
 * 1. Позицию руководителя в оргструктуре (HEAD user с подчинёнными)
 * 2. Permission [12] (manageOwnPerformanceReview) + назначение администратором PR
 *
 * Его scope = ОБЪЕДИНЕНИЕ: подчинённые (из позиции head) + сотрудники PR (из review_admin).
 *
 * Тест проверяет на уровне API (без UI download):
 * - distribution-users возвращает данные для union scope (> 0 пользователей)
 * - dashboard-filters/performance-reviews включает назначенный PR
 * - distribution-last-results доступен для пользователей из union scope
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
  /**
   * Фикстура unionExportCtx:
   * 1. Логинится под HEAD user, получает baseline scope
   * 2. Добавляет permission [12] + назначает HEAD admin на PR
   * 3. Логинится повторно под HEAD (новые права)
   * 4. Предоставляет данные для assertions
   * 5. Cleanup: восстанавливает исходные роли HEAD, убирает из admin PR
   */
  unionExportCtx: async ({ request }, use) => {
    const { email: headEmail, password: headPassword } =
      getCredentials("head");

    // ── Шаг 0: Сбросить stale роли HEAD до User (от параллельных тестов) ──
    const preCleanupRoles = new (await import("../../../utils/api/RolesAPI.js")).RolesAPI(request);
    const adminCreds = getCredentials("admin");
    await preCleanupRoles.signIn(adminCreds.email, adminCreds.password);
    const { data: allRolesData } = await preCleanupRoles.getRoles();
    const userRoleEntry = (allRolesData?.items || allRolesData || []).find(
      (r) => r.title === "User",
    );

    // ── Шаг 1: Baseline scope HEAD без review_admin ──────────────────────────
    const baselineDashAPI = new DashboardTeamAPI(request);
    await baselineDashAPI.signIn(headEmail, headPassword);

    // Получить userId HEAD через /private/accounts/me
    const { data: headMe } = await baselineDashAPI.get(
      "/private/accounts/me",
    );
    const headUserId =
      headMe?.currentUserId ||
      headMe?.userId ||
      headMe?.id ||
      headMe?.user?.id;

    if (!headUserId) {
      throw new Error(
        `[UnionExportCtx] Не удалось получить userId HEAD пользователя. Keys: ${JSON.stringify(Object.keys(headMe || {}))}`,
      );
    }
    console.log(
      `[UnionExportCtx] HEAD userId=${headUserId}, email=${headEmail}`,
    );

    // Сбросить роли HEAD до User (чистим stale review_admin от параллельных тестов)
    if (userRoleEntry && headUserId) {
      await preCleanupRoles.assignRolesToUser(headUserId, [userRoleEntry.id]);
      // Перелогиниться HEAD чтобы сессия отражала чистые роли
      await baselineDashAPI.signIn(headEmail, headPassword);
    }

    // Baseline: сколько пользователей видит HEAD без review_admin
    const { data: baselineData } = await baselineDashAPI.getDistributionUsers({
      limit: 1000,
      offset: 0,
    });
    const baselineTotal = baselineData?.total ?? 0;
    console.log(
      `[UnionExportCtx] Baseline scope (HEAD без review_admin): total=${baselineTotal}`,
    );

    // ── Шаг 2: Инициализировать seed helper под admin ─────────────────────────
    const helper = new ReviewAdminSeedHelper(request);
    await helper.init("admin");

    // Найти/создать роль review_admin (permission [12])
    const { roleId, title: roleTitle } =
      await helper.findOrCreateReviewAdminRole();

    // Назначить роль HEAD — сохранить его текущие роли
    const previousRoleIds = await helper.assignRoleToUser(headUserId, roleId);

    // Найти/создать PR и назначить HEAD его администратором
    const { PerformanceReviewSeedHelper } = await import(
      "../../../utils/seed/PerformanceReviewSeedHelper.js"
    );
    const prSeedHelper = new PerformanceReviewSeedHelper(request);
    await prSeedHelper.init("admin");

    let prId;
    const existingPR = await prSeedHelper.findValidPRForMyTeam(1);
    if (existingPR) {
      prId = existingPR.prId;
      console.log(`[UnionExportCtx] Используем существующий PR: ${prId}`);
    } else {
      const newPR = await prSeedHelper.seedActivePR();
      prId = newPR.id;
      console.log(`[UnionExportCtx] Создан новый PR: ${prId}`);
    }

    await helper.assignAsAdminToPR(prId, headUserId);
    console.log(
      `[UnionExportCtx] HEAD (${headUserId}) назначен admin PR ${prId}. Роль: "${roleTitle}" (${roleId})`,
    );

    // ── Шаг 3: Повторная авторизация HEAD с новыми правами ──────────────────
    const unionDashAPI = new DashboardTeamAPI(request);
    await unionDashAPI.signIn(headEmail, headPassword);

    // ── Предоставить данные тесту ────────────────────────────────────────────
    await use({
      baselineTotal,
      headUserId,
      headEmail,
      prId,
      roleId,
      roleTitle,
      previousRoleIds,
      unionDashAPI,
      helper,
    });

    // ── Cleanup ──────────────────────────────────────────────────────────────
    console.log("[UnionExportCtx] === Начало cleanup ===");

    // 1. Восстановить исходные роли HEAD
    try {
      await helper.rolesAPI.assignRolesToUser(headUserId, previousRoleIds);
      console.log(
        `[UnionExportCtx] Роли HEAD восстановлены: [${previousRoleIds.join(", ")}]`,
      );
    } catch (e) {
      console.warn(
        `[UnionExportCtx] Не удалось восстановить роли HEAD ${headUserId}: ${e.message}`,
      );
    }

    // 2. Убрать HEAD из администраторов PR
    try {
      await helper.removeAsAdminFromPR(prId, headUserId);
      console.log(`[UnionExportCtx] HEAD убран из admin PR ${prId}`);
    } catch (e) {
      console.warn(
        `[UnionExportCtx] Не удалось убрать HEAD из admin PR: ${e.message}`,
      );
    }

    console.log("[UnionExportCtx] === Cleanup завершён ===");
  },
});

test.describe(
  "Review Admin — Union scope XLSX export (API verification)",
  { tag: ["@api", "@my-team", "@regression", "@review-admin"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.MY_TEAM);
    });

    test("C8090: Union scope — distribution-users возвращает данные для HEAD+review_admin",
      { tag: ["@critical"] },
      async ({ unionExportCtx }) => {
        setSeverity("critical");

        const {
          baselineTotal,
          headUserId,
          prId,
          unionDashAPI,
        } = unionExportCtx;

        // ── Шаг 1: Получить distribution-users с union scope ────────────────
        await test.step(
          "distribution-users возвращает > 0 пользователей для HEAD+review_admin",
          async () => {
            const { response, data } =
              await unionDashAPI.getDistributionUsers({
                limit: 1000,
                offset: 0,
              });

            expect(
              response.ok(),
              `distribution-users вернул ${response.status()} для HEAD+review_admin`,
            ).toBe(true);
            expect(
              data,
              "Ответ distribution-users не должен быть пустым",
            ).toBeDefined();

            const unionTotal = data?.total ?? 0;
            console.log(
              `[AT-47] Union scope (HEAD+review_admin userId=${headUserId}): total=${unionTotal}, baseline=${baselineTotal}`,
            );

            expect(
              unionTotal,
              `Union scope (${unionTotal}) должен быть БОЛЬШЕ baseline (${baselineTotal}). ` +
                `После получения review_admin + назначения на PR ${prId}, ` +
                `HEAD должен видеть участников этого PR в distribution-users`,
            ).toBeGreaterThan(baselineTotal);

            const items = data?.items || [];
            expect(
              items.length,
              "distribution-users должен вернуть непустой список items",
            ).toBeGreaterThan(0);

            console.log(
              `[AT-47] OK: union scope total=${unionTotal} > baseline=${baselineTotal}. ` +
                `items.length=${items.length}`,
            );
          },
        );
      },
    );

    test("C8091: Union scope — назначенный PR присутствует в dashboard-filters и distribution-last-results доступен",
      { tag: ["@critical"] },
      async ({ unionExportCtx }) => {
        setSeverity("critical");

        const {
          headUserId,
          prId,
          unionDashAPI,
        } = unionExportCtx;

        let unionUserIds;

        // ── Шаг 1: Получить пользователей из union scope ─────────────────────
        await test.step(
          "Получить список пользователей из distribution-users (union scope)",
          async () => {
            const { response, data } =
              await unionDashAPI.getDistributionUsers({
                limit: 100,
                offset: 0,
              });

            expect(
              response.ok(),
              `distribution-users вернул ${response.status()}`,
            ).toBe(true);

            const items = data?.items || [];
            expect(
              items.length,
              "Union scope должен содержать хотя бы одного пользователя",
            ).toBeGreaterThan(0);

            unionUserIds = items.map((u) => u.id);
            console.log(
              `[AT-48] Union scope пользователи (userId=${headUserId}): ${unionUserIds.length} items`,
            );
          },
        );

        // ── Шаг 2: Назначенный PR виден в dashboard-filters ─────────────────
        await test.step(
          "Назначенный PR присутствует в dashboard-filters/performance-reviews",
          async () => {
            const { response: filtersResp, data: filtersData } =
              await unionDashAPI.getDashboardFiltersPRs();

            expect(
              filtersResp.ok(),
              `dashboard-filters/performance-reviews вернул ${filtersResp.status()}`,
            ).toBe(true);

            const prs = Array.isArray(filtersData)
              ? filtersData
              : filtersData?.items || [];

            console.log(
              `[AT-48] HEAD+review_admin видит ${prs.length} PR в фильтрах`,
            );

            const prIds = prs.map((pr) => String(pr.id || pr.prId || pr));

            expect(
              prIds,
              `Assigned PR ${prId} должен быть в dashboard-filters для HEAD+review_admin (userId=${headUserId})`,
            ).toContain(String(prId));

            console.log(
              `[AT-48] OK: PR ${prId} найден в dashboard-filters. Всего PR в фильтрах: ${prs.length}`,
            );
          },
        );

        // ── Шаг 3: distribution-last-results доступен для union scope users ──
        await test.step(
          "distribution-last-results доступен для пользователей из union scope",
          async () => {
            const { response: resultsResp, data: resultsData } =
              await unionDashAPI.getDistributionLastResults(unionUserIds);

            expect(
              resultsResp.ok(),
              `distribution-last-results вернул ${resultsResp.status()} для HEAD+review_admin`,
            ).toBe(true);

            expect(
              resultsData,
              "distribution-last-results не должен быть null/undefined",
            ).toBeDefined();

            // Ответ — объект с числовыми ключами или массив
            const entries = Array.isArray(resultsData)
              ? resultsData
              : Object.values(resultsData || {});

            console.log(
              `[AT-48] distribution-last-results: ${entries.length} записей для ${unionUserIds.length} users`,
            );

            // Endpoint должен быть доступен (200 OK) — данные могут отсутствовать
            // если у PR ещё нет заполненных анкет, но запрос не должен возвращать 403/404
            console.log(
              `[AT-48] OK: distribution-last-results доступен (${resultsResp.status()}) для union scope пользователей`,
            );
          },
        );
      },
    );
  },
);
