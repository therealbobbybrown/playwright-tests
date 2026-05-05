/**
 * AT-46: Union scope — head + review_admin (API data endpoints)
 *
 * Когда пользователь имеет ОДНОВРЕМЕННО:
 * 1. Позицию руководителя в оргструктуре (HEAD user с подчинёнными)
 * 2. Permission [12] (manageOwnPerformanceReview) + назначение администратором PR
 *
 * Его scope = ОБЪЕДИНЕНИЕ: подчинённые (из позиции head) + сотрудники PR (из review_admin).
 *
 * Тест проверяет API data endpoints:
 * - distribution-users возвращает > 0 пользователей для union scope
 * - distribution-last-results доступен для union scope (не 403/empty)
 * - distribution-characteristics доступен для union scope
 * - dashboard-filters содержит назначенный PR
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
   * Фикстура unionCtx:
   * 1. Логинится под HEAD user
   * 2. Получает baseline scope (подчинённые без review_admin)
   * 3. Добавляет permission [12] + назначает HEAD как admin на PR
   * 4. Логинится повторно как HEAD (новые права)
   * 5. Предоставляет данные для assertions
   * 6. Cleanup: восстанавливает исходные роли HEAD, убирает из admin PR
   */
  unionCtx: async ({ request }, use) => {
    const { email: headEmail, password: headPassword } =
      getCredentials("head");

    // ── Шаг 0: Сбросить stale роли HEAD до User ──────────────────────────────
    const { RolesAPI } = await import("../../../utils/api/RolesAPI.js");
    const adminCreds = getCredentials("admin");
    const preCleanupRoles = new RolesAPI(request);
    await preCleanupRoles.signIn(adminCreds.email, adminCreds.password);
    const { data: allRolesData } = await preCleanupRoles.getRoles();
    const userRoleEntry = (allRolesData?.items || allRolesData || []).find(
      (r) => r.title === "User",
    );

    // ── Шаг 1: Логинимся как HEAD, получаем baseline scope ──────────────────
    const baselineDashAPI = new DashboardTeamAPI(request);
    await baselineDashAPI.signIn(headEmail, headPassword);

    // Получаем userId HEAD через /private/accounts/me
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
        `[UnionCtx] Не удалось получить userId HEAD пользователя. Keys: ${JSON.stringify(Object.keys(headMe || {}))}`,
      );
    }
    console.log(
      `[UnionCtx] HEAD userId=${headUserId}, email=${headEmail}`,
    );

    // Сбросить роли HEAD до User и перелогиниться
    if (userRoleEntry && headUserId) {
      await preCleanupRoles.assignRolesToUser(headUserId, [userRoleEntry.id]);
      await baselineDashAPI.signIn(headEmail, headPassword);
    }

    // Baseline: сколько пользователей видит HEAD без review_admin
    const { data: baselineData } = await baselineDashAPI.getDistributionUsers({
      limit: 1000,
      offset: 0,
    });
    const baselineTotal = baselineData?.total ?? 0;
    console.log(
      `[UnionCtx] Baseline scope (HEAD без review_admin): total=${baselineTotal}`,
    );

    // ── Шаг 2: Инициализируем seed helper под admin ──────────────────────────
    const helper = new ReviewAdminSeedHelper(request);
    await helper.init("admin");

    // Найти/создать роль review_admin (permission [12])
    const { roleId, title: roleTitle } =
      await helper.findOrCreateReviewAdminRole();

    // Назначить роль HEAD пользователю — сохранить его текущие роли
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
      console.log(`[UnionCtx] Используем существующий PR: ${prId}`);
    } else {
      const newPR = await prSeedHelper.seedActivePR();
      prId = newPR.id;
      console.log(`[UnionCtx] Создан новый PR: ${prId}`);
    }

    await helper.assignAsAdminToPR(prId, headUserId);
    console.log(
      `[UnionCtx] HEAD (${headUserId}) назначен admin PR ${prId}. Роль: "${roleTitle}" (${roleId})`,
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
    console.log("[UnionCtx] === Начало cleanup ===");

    // 1. Восстановить исходные роли HEAD
    try {
      await helper.rolesAPI.assignRolesToUser(headUserId, previousRoleIds);
      console.log(
        `[UnionCtx] Роли HEAD восстановлены: [${previousRoleIds.join(", ")}]`,
      );
    } catch (e) {
      console.warn(
        `[UnionCtx] Не удалось восстановить роли HEAD ${headUserId}: ${e.message}`,
      );
    }

    // 2. Убрать HEAD из администраторов PR
    try {
      await helper.removeAsAdminFromPR(prId, headUserId);
      console.log(`[UnionCtx] HEAD убран из admin PR ${prId}`);
    } catch (e) {
      console.warn(
        `[UnionCtx] Не удалось убрать HEAD из admin PR: ${e.message}`,
      );
    }

    console.log("[UnionCtx] === Cleanup завершён ===");
  },
});

test.describe(
  "Review Admin — Union role API: head + review_admin data endpoints",
  { tag: ["@api", "@my-team", "@regression", "@review-admin"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.MY_TEAM);
    });

    test("C8092: Distribution-users, last-results и characteristics доступны для union scope",
      { tag: ["@critical"] },
      async ({ unionCtx }) => {
        setSeverity("critical");

        const {
          baselineTotal,
          headUserId,
          prId,
          unionDashAPI,
        } = unionCtx;

        let unionUsers;
        let unionTotal;

        // ── Шаг 1: distribution-users возвращает > baseline ──────────────────
        await test.step(
          "distribution-users возвращает участников PR (union scope > baseline)",
          async () => {
            const { response, data } = await unionDashAPI.getDistributionUsers({
              limit: 1000,
              offset: 0,
            });

            expect(
              response.ok(),
              `distribution-users вернул ${response.status()} для HEAD+review_admin`,
            ).toBe(true);
            expect(data, "Ответ distribution-users не должен быть пустым").toBeDefined();

            unionTotal = data?.total ?? 0;
            unionUsers = data?.items || [];

            console.log(
              `[AT-46] Union scope (HEAD+review_admin userId=${headUserId}): total=${unionTotal}, baseline=${baselineTotal}`,
            );

            expect(
              unionTotal,
              `Union scope (${unionTotal}) должен быть БОЛЬШЕ baseline (${baselineTotal}). ` +
                `После получения review_admin + назначения на PR ${prId}, ` +
                `HEAD должен видеть участников этого PR в distribution-users`,
            ).toBeGreaterThan(baselineTotal);

            console.log(
              `[AT-46] OK: union scope = ${unionTotal} > baseline = ${baselineTotal}`,
            );
          },
        );

        // ── Шаг 2: distribution-last-results доступен для union scope ────────
        await test.step(
          "distribution-last-results возвращает данные для пользователей union scope",
          async () => {
            // Берём первый батч ID (до 50) из полученных пользователей
            const batchIds = unionUsers.slice(0, 50).map((u) => u.id);

            expect(
              batchIds.length,
              "Должны быть пользователи для запроса last-results",
            ).toBeGreaterThan(0);

            const { response, data } =
              await unionDashAPI.getDistributionLastResults(batchIds);

            expect(
              response.ok(),
              `distribution-last-results вернул ${response.status()} для HEAD+review_admin (${batchIds.length} userId)`,
            ).toBe(true);
            expect(
              data,
              "Ответ distribution-last-results не должен быть пустым",
            ).toBeDefined();

            const resultEntries = Object.values(data || {});
            console.log(
              `[AT-46] distribution-last-results: ${resultEntries.length} записей для ${batchIds.length} пользователей`,
            );

            // Ответ должен быть объектом (пустым или с данными) — не ошибкой
            expect(
              typeof data,
              "distribution-last-results должен возвращать объект",
            ).toBe("object");
          },
        );

        // ── Шаг 3: distribution-characteristics доступен для union scope ─────
        await test.step(
          "distribution-characteristics доступен для HEAD+review_admin",
          async () => {
            const { response, data } =
              await unionDashAPI.getDistributionCharacteristics({
                usersSubset: "all",
                withInactive: false,
              });

            expect(
              response.ok(),
              `distribution-characteristics вернул ${response.status()} для HEAD+review_admin`,
            ).toBe(true);
            expect(
              data,
              "Ответ distribution-characteristics не должен быть пустым",
            ).toBeDefined();

            // Ответ содержит withResults и withoutResults
            const withResults = data?.withResults;
            const withoutResults = data?.withoutResults;

            console.log(
              `[AT-46] distribution-characteristics: withResults=${JSON.stringify(withResults)?.slice(0, 120)}, withoutResults type=${typeof withoutResults}`,
            );

            // Структура ответа должна существовать (withResults или withoutResults)
            const hasExpectedStructure =
              withResults !== undefined || withoutResults !== undefined;
            expect(
              hasExpectedStructure,
              "distribution-characteristics должен содержать withResults или withoutResults",
            ).toBe(true);
          },
        );

        // ── Шаг 4: dashboard-filters содержит назначенный PR ─────────────────
        await test.step(
          "dashboard-filters/performance-reviews содержит назначенный PR",
          async () => {
            const { response: filtersResp, data: filtersData } =
              await unionDashAPI.getDashboardFiltersPRs();

            expect(
              filtersResp.ok(),
              `dashboard-filters/performance-reviews вернул ${filtersResp.status()}`,
            ).toBe(true);

            const unionPRs = Array.isArray(filtersData)
              ? filtersData
              : filtersData?.items || [];

            console.log(
              `[AT-46] HEAD+review_admin видит ${unionPRs.length} PR в фильтрах`,
            );

            const prIds = unionPRs.map((pr) =>
              String(pr.id || pr.prId || pr),
            );

            expect(
              prIds,
              `Assigned PR ${prId} должен быть в dashboard-filters для HEAD+review_admin`,
            ).toContain(String(prId));

            console.log(
              `[AT-46] OK: PR ${prId} присутствует в dashboard-filters`,
            );
          },
        );

        // ── Шаг 5: Нет дубликатов в PR фильтрах ─────────────────────────────
        await test.step(
          "dashboard-filters не содержит дублирующихся PR",
          async () => {
            const { data: filtersData } =
              await unionDashAPI.getDashboardFiltersPRs();

            const unionPRs = Array.isArray(filtersData)
              ? filtersData
              : filtersData?.items || [];

            const prIds = unionPRs.map((pr) =>
              String(pr.id || pr.prId || pr),
            );
            const uniquePrIds = new Set(prIds);
            expect(
              uniquePrIds.size,
              "Не должно быть дубликатов PR в фильтрах",
            ).toBe(prIds.length);
          },
        );
      },
    );
  },
);
