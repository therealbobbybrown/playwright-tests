/**
 * AT-45/71: Union scope — head + review_admin
 *
 * Когда пользователь имеет ОДНОВРЕМЕННО:
 * 1. Позицию руководителя в оргструктуре (HEAD user с подчинёнными)
 * 2. Permission [12] (manageOwnPerformanceReview) + назначение администратором PR
 *
 * Его scope = ОБЪЕДИНЕНИЕ: подчинённые (из позиции head) + сотрудники PR (из review_admin).
 * Это значит: он видит БОЛЬШЕ пользователей, чем только подчинённых.
 *
 * Тест находит PR с участниками, НЕ являющимися подчинёнными HEAD,
 * чтобы гарантировать что union > baseline.
 */

import { test as base, expect } from "../../../fixtures/full.js";
import { ReviewAdminSeedHelper } from "../../../utils/seed/index.js";
import { PerformanceReviewAPI } from "../../../utils/api/index.js";
import { DashboardTeamAPI } from "../../../utils/api/DashboardTeamAPI.js";
import { getCredentials } from "../../../utils/credentials.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";

/**
 * Найти active PR, у которого есть хотя бы 1 target user,
 * НЕ являющийся подчинённым HEAD (headUserId).
 * Возвращает { prId, nonSubordinateCount, totalTargetUsers } или null.
 */
async function findPRWithNonSubordinates(prAPI, headUserId, subordinateIds) {
  const { data } = await prAPI.getList();
  const items = data?.items || data || [];
  const activePRs = items.filter((pr) => pr.status === "active");

  let bestPR = null;

  for (const pr of activePRs) {
    try {
      const { data: targetData } = await prAPI.getTargetUsers(pr.id, {});
      const targets = targetData?.items || targetData || [];
      if (!Array.isArray(targets) || targets.length === 0) continue;

      const nonSubCount = targets.filter(
        (t) => !subordinateIds.has(Number(t.userId || t.id)),
      ).length;

      if (nonSubCount > 0) {
        console.log(
          `[UnionCtx] PR ${pr.id}: ${targets.length} target users, ${nonSubCount} non-subordinates`,
        );
        if (!bestPR || nonSubCount > bestPR.nonSubordinateCount) {
          bestPR = {
            prId: pr.id,
            nonSubordinateCount: nonSubCount,
            totalTargetUsers: targets.length,
          };
        }
      }
    } catch (e) {
      // PR может быть недоступен — пропускаем
    }
  }

  return bestPR;
}

const test = base.extend({
  /**
   * Фикстура unionCtx:
   * 1. Логинится под HEAD user, получает baseline scope
   * 2. Определяет подчинённых HEAD через /manager/users/
   * 3. Находит PR с non-subordinate target users
   * 4. Добавляет permission [12] + назначает HEAD как admin на этот PR
   * 5. Повторно авторизуется и предоставляет данные тесту
   * 6. Cleanup: восстанавливает роли, убирает из admin PR
   */
  unionCtx: async ({ request }, use) => {
    const { email: headEmail, password: headPassword } =
      getCredentials("head");
    const { email: adminEmail, password: adminPassword } =
      getCredentials("admin");

    // ── Шаг 0: Сбросить stale роли HEAD до User ──────────────────────────────
    const { RolesAPI } = await import("../../../utils/api/RolesAPI.js");
    const preCleanupRoles = new RolesAPI(request);
    await preCleanupRoles.signIn(adminEmail, adminPassword);
    const { data: allRolesData } = await preCleanupRoles.getRoles();
    const userRoleEntry = (allRolesData?.items || allRolesData || []).find(
      (r) => r.title === "User",
    );

    // ── Шаг 1: Логинимся как HEAD, получаем baseline scope ──────────────────
    const baselineDashAPI = new DashboardTeamAPI(request);
    await baselineDashAPI.signIn(headEmail, headPassword);

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
        `[UnionCtx] Не удалось получить userId HEAD. Keys: ${JSON.stringify(Object.keys(headMe || {}))}`,
      );
    }
    console.log(`[UnionCtx] HEAD userId=${headUserId}, email=${headEmail}`);

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

    // ── Шаг 2: Определить подчинённых HEAD ──────────────────────────────────
    // Через admin API: GET /manager/users/?limit=3000&category=active → filter headUser.id
    const adminDashAPI = new DashboardTeamAPI(request);
    await adminDashAPI.signIn(adminEmail, adminPassword);

    const { data: allUsersData } = await adminDashAPI.get(
      "/manager/users/?limit=3000&category=active",
    );
    const allUsers = allUsersData?.items || allUsersData || [];
    const subordinateIds = new Set(
      allUsers
        .filter((u) => Number(u.headUser?.id) === Number(headUserId))
        .map((u) => Number(u.id)),
    );
    console.log(
      `[UnionCtx] HEAD имеет ${subordinateIds.size} подчинённых: [${[...subordinateIds].join(", ")}]`,
    );

    // ── Шаг 3: Найти PR с non-subordinate target users ─────────────────────
    const prAPI = new PerformanceReviewAPI(request);
    await prAPI.signIn(adminEmail, adminPassword);

    let prWithNonSubs = await findPRWithNonSubordinates(
      prAPI,
      headUserId,
      subordinateIds,
    );

    let addedTargetUserId = null; // для cleanup если мы добавили пользователя

    if (!prWithNonSubs) {
      // Fallback: берём любой active PR и добавляем в него non-subordinate
      console.log(
        `[UnionCtx] Не найден PR с non-subordinates HEAD. Fallback: добавим non-subordinate в существующий PR`,
      );

      const { PerformanceReviewSeedHelper } = await import(
        "../../../utils/seed/PerformanceReviewSeedHelper.js"
      );
      const prSeedHelper = new PerformanceReviewSeedHelper(request);
      await prSeedHelper.init("admin");

      const existingPR = await prSeedHelper.findValidPRForMyTeam(1);
      if (!existingPR) {
        throw new Error(
          `[UnionCtx] Нет ни одного active PR для union-role теста. Запустите seed: npm run seed:pr`,
        );
      }

      // Найти пользователя, не являющегося подчинённым HEAD
      const nonSubUser = allUsers.find(
        (u) =>
          !subordinateIds.has(Number(u.id)) &&
          Number(u.id) !== Number(headUserId) &&
          u.status === "active",
      );
      if (!nonSubUser) {
        throw new Error(
          `[UnionCtx] Не найден active пользователь вне подчинённых HEAD (${headUserId})`,
        );
      }

      // Добавить non-subordinate в PR
      const { response: addResp } = await prAPI.addTargetUsers(
        existingPR.prId,
        { targets: [{ targetType: "user", entityId: nonSubUser.id }] },
      );

      if (!addResp.ok() && addResp.status() !== 409) {
        throw new Error(
          `[UnionCtx] Не удалось добавить user ${nonSubUser.id} в PR ${existingPR.prId}: ${addResp.status()}`,
        );
      }

      addedTargetUserId = addResp.status() !== 409 ? nonSubUser.id : null;
      console.log(
        `[UnionCtx] Добавлен non-subordinate ${nonSubUser.id} (${nonSubUser.firstName} ${nonSubUser.lastName}) в PR ${existingPR.prId}`,
      );

      prWithNonSubs = {
        prId: existingPR.prId,
        nonSubordinateCount: 1,
        totalTargetUsers: existingPR.targetUsersCount + 1,
      };
    }

    const { prId } = prWithNonSubs;
    console.log(
      `[UnionCtx] Выбран PR ${prId}: ${prWithNonSubs.totalTargetUsers} target users, ` +
        `${prWithNonSubs.nonSubordinateCount} non-subordinates HEAD`,
    );

    // ── Шаг 4: Назначить review_admin + PR admin ────────────────────────────
    const helper = new ReviewAdminSeedHelper(request);
    await helper.init("admin");

    const { roleId, title: roleTitle } =
      await helper.findOrCreateReviewAdminRole();
    const previousRoleIds = await helper.assignRoleToUser(headUserId, roleId);

    await helper.assignAsAdminToPR(prId, headUserId);
    console.log(
      `[UnionCtx] HEAD (${headUserId}) назначен admin PR ${prId}. Роль: "${roleTitle}" (${roleId})`,
    );

    // Ждём, пока сервер применит изменение ролей и назначение admin PR.
    // Без паузы повторный signIn может вернуть токен до того, как права обновятся,
    // что приведёт к union == baseline при первом запуске.
    await new Promise((r) => setTimeout(r, 2000));

    // ── Шаг 5: Повторная авторизация HEAD с новыми правами ──────────────────
    const unionDashAPI = new DashboardTeamAPI(request);
    await unionDashAPI.signIn(headEmail, headPassword);

    await use({
      baselineTotal,
      headUserId,
      headEmail,
      prId,
      roleId,
      roleTitle,
      previousRoleIds,
      nonSubordinateCount: prWithNonSubs.nonSubordinateCount,
      totalTargetUsers: prWithNonSubs.totalTargetUsers,
      subordinateIds,
      unionDashAPI,
      helper,
    });

    // ── Cleanup ──────────────────────────────────────────────────────────────
    console.log("[UnionCtx] === Начало cleanup ===");

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

    try {
      await helper.removeAsAdminFromPR(prId, headUserId);
      console.log(`[UnionCtx] HEAD убран из admin PR ${prId}`);
    } catch (e) {
      console.warn(
        `[UnionCtx] Не удалось убрать HEAD из admin PR: ${e.message}`,
      );
    }

    // Если мы добавляли non-subordinate в PR — убрать
    if (addedTargetUserId) {
      try {
        await prAPI.deleteTargetUser(prId, addedTargetUserId);
        console.log(
          `[UnionCtx] Удалён добавленный target user ${addedTargetUserId} из PR ${prId}`,
        );
      } catch (e) {
        console.warn(
          `[UnionCtx] Не удалось удалить target user ${addedTargetUserId}: ${e.message}`,
        );
      }
    }

    console.log("[UnionCtx] === Cleanup завершён ===");
  },
});

test.describe(
  "Review Admin — Union role: head + review_admin",
  { tag: ["@api", "@my-team", "@regression", "@review-admin"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.MY_TEAM);
    });

    test(
      "C8093: Head + review_admin = union scope (подчинённые + сотрудники PR)",
      { tag: ["@critical"] },
      async ({ unionCtx }) => {
        setSeverity("critical");

        const {
          baselineTotal,
          headUserId,
          prId,
          nonSubordinateCount,
          totalTargetUsers,
          subordinateIds,
          unionDashAPI,
        } = unionCtx;

        let unionTotal;
        let unionUserIds;
        let unionPRs;

        // ── Шаг 1: Baseline зафиксирован в фикстуре ─────────────────────────
        await test.step(
          `Baseline HEAD scope: ${baselineTotal} пользователей, ${subordinateIds.size} подчинённых`,
          async () => {
            console.log(
              `[AT-45] HEAD (userId=${headUserId}): baseline=${baselineTotal}, subordinates=${subordinateIds.size}`,
            );
            console.log(
              `[AT-45] PR ${prId}: ${totalTargetUsers} target users, ${nonSubordinateCount} non-subordinates`,
            );
          },
        );

        // ── Шаг 2: Union scope = подчинённые + сотрудники PR ────────────────
        await test.step(
          "Получить distribution-users с permission [12] + PR admin",
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

            unionTotal = data?.total ?? 0;
            const items = data?.items || [];
            unionUserIds = new Set(
              items.map((u) => Number(u.userId || u.id)),
            );

            console.log(
              `[AT-45] Union scope: total=${unionTotal}, уникальных userId=${unionUserIds.size}`,
            );
          },
        );

        // ── Шаг 3: Union scope СТРОГО БОЛЬШЕ baseline ───────────────────────
        // PR выбран так, чтобы содержать non-subordinates HEAD.
        // Значит union scope должен расшириться.
        await test.step(
          "Union scope СТРОГО БОЛЬШЕ baseline (PR содержит non-subordinates)",
          async () => {
            console.log(
              `[AT-45] union=${unionTotal} vs baseline=${baselineTotal}, ` +
                `ожидаем прирост за счёт ${nonSubordinateCount} non-subordinates PR ${prId}`,
            );

            expect(
              unionTotal,
              `Union scope (${unionTotal}) должен быть > 0`,
            ).toBeGreaterThan(0);

            expect(
              unionTotal,
              `Union scope (${unionTotal}) должен быть БОЛЬШЕ baseline (${baselineTotal}). ` +
                `PR ${prId} содержит ${nonSubordinateCount} участников, ` +
                `которые НЕ являются подчинёнными HEAD → scope должен расшириться`,
            ).toBeGreaterThan(baselineTotal);

            console.log(
              `[AT-45] OK: union=${unionTotal} > baseline=${baselineTotal} (+${unionTotal - baselineTotal})`,
            );
          },
        );

        // ── Шаг 4: Назначенный PR виден в dashboard-filters ─────────────────
        await test.step(
          "Назначенный PR присутствует в dashboard-filters",
          async () => {
            const { response: filtersResp, data: filtersData } =
              await unionDashAPI.getDashboardFiltersPRs();

            expect(
              filtersResp.ok(),
              `dashboard-filters вернул ${filtersResp.status()}`,
            ).toBe(true);

            unionPRs = Array.isArray(filtersData)
              ? filtersData
              : filtersData?.items || [];

            const prIds = unionPRs.map((pr) =>
              String(pr.id || pr.prId || pr),
            );

            expect(
              prIds,
              `Assigned PR ${prId} должен быть в dashboard-filters`,
            ).toContain(String(prId));

            console.log(
              `[AT-45] HEAD+review_admin видит ${unionPRs.length} PR в фильтрах, assigned PR ${prId} найден`,
            );
          },
        );

        // ── Шаг 5: Нет дубликатов в PR фильтрах ─────────────────────────────
        await test.step(
          "Dashboard-filters не содержит дублирующихся PR",
          async () => {
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
