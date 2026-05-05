import { test as base, expect } from "../../../fixtures/auth.js";
import {
  ReviewAdminSeedHelper,
  PerformanceReviewSeedHelper,
} from "../../../utils/seed/index.js";
import { TokenManager } from "../../../utils/auth/TokenManager.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";

/**
 * AT-62: Назначение администратором PR, но ПОСЛЕ этого убрать permission viewDashboard (21)
 * Ожидание: дашборд "Моя команда" недоступен (редирект) — permission viewDashboard обязателен
 *
 * Важно: API не позволяет назначить PR admin без permission manageOwnPerformanceReview (12).
 * Поэтому seed:
 * 1. Дать роль с permission 12+21
 * 2. Назначить администратором PR
 * 3. Убрать роль с permission 12+21
 * 4. Проверить что дашборд недоступен
 */

const test = base.extend({
  assignmentOnlyPage: async ({ page, request }, use) => {
    const helper = new ReviewAdminSeedHelper(request);
    await helper.init("admin");

    const baseUser = await helper.findBaseUser();

    // Шаг 1: дать роль с permission 12+21
    const { roleId, title: roleTitle } =
      await helper.findOrCreateReviewAdminRole();
    const previousRoleIds = await helper.assignRoleToUser(
      baseUser.userId,
      roleId,
    );

    // Шаг 2: назначить администратором PR
    const prSeedHelper = new PerformanceReviewSeedHelper(request);
    await prSeedHelper.init("admin");

    let prId;
    const existingPR = await prSeedHelper.findValidPRForMyTeam(1);
    if (existingPR) {
      prId = existingPR.prId;
    } else {
      const newPR = await prSeedHelper.seedActivePR();
      prId = newPR.id;
    }

    await helper.assignAsAdminToPR(prId, baseUser.userId);

    // Шаг 3: убрать ВСЕ роли с permission 12/21 (оставить только роль "User")
    const currentRoleIds = await helper.rolesAPI.getUserRoleIds(
      baseUser.userId,
    );
    const { data: rolesData } = await helper.rolesAPI.getRoles({
      limit: 100,
      offset: 0,
    });
    const allRoles = rolesData?.items || rolesData || [];
    const reviewAdminRoleIds = allRoles
      .filter((r) => r.title && r.title.startsWith("E2E_ReviewAdmin"))
      .map((r) => r.id);

    const rolesWithoutReviewAdmin = currentRoleIds.filter(
      (id) => !reviewAdminRoleIds.includes(id),
    );
    if (!rolesWithoutReviewAdmin.includes(2)) {
      rolesWithoutReviewAdmin.push(2);
    }

    await helper.rolesAPI.assignRolesToUser(
      baseUser.userId,
      rolesWithoutReviewAdmin,
    );
    console.log(
      `[AT-62] Роли пользователя ${baseUser.userId} после seed: [${rolesWithoutReviewAdmin.join(", ")}] (без permission 12/21)`,
    );

    // Ждём, пока сервер применит изменение ролей, прежде чем логиниться.
    // Без паузы первая попытка логина может вернуть токен со старыми правами.
    await new Promise((r) => setTimeout(r, 2000));

    // Инвалидируем кеш токенов
    TokenManager.invalidate(baseUser.email);

    const testUserPassword = process.env.TEST_USER_PASSWORD || "DemoPass_7421!";
    await TokenManager.loginViaApi(page, baseUser.email, testUserPassword);

    page._setupData = {
      ...baseUser,
      prId,
      previousRoleIds,
      roleId,
      roleTitle,
    };
    page._seedHelper = helper;

    await use(page);

    // cleanup: восстановить роли и убрать из администраторов PR
    try {
      await helper.rolesAPI.assignRolesToUser(
        baseUser.userId,
        previousRoleIds.includes(roleId)
          ? previousRoleIds
          : [...previousRoleIds, roleId],
      );
      console.log(
        `[AT-62] Роли пользователя ${baseUser.userId} восстановлены`,
      );
    } catch (e) {
      console.warn(`[AT-62] Не удалось восстановить роли: ${e.message}`);
    }
    await helper.removeAsAdminFromPR(prId, baseUser.userId);
  },
});

test.describe(
  "Review Admin — Назначение на PR без permission",
  { tag: ["@ui", "@my-team", "@regression", "@review-admin"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.MY_TEAM, "Review Admin Assignment Only");
    });

    test(
      "C8060: Назначение администратором PR без permission manageOwnPerformanceReview -- нет доступа к дашборду",
      { tag: ["@critical"] },
      async ({ assignmentOnlyPage: page }) => {
        setSeverity("critical");
        const setupData = page._setupData;

        await test.step(
          `Seed: пользователь ${setupData.firstName} ${setupData.lastName} (id=${setupData.userId}) назначен администратором PR ${setupData.prId}, но permission 12/21 убрана`,
          async () => {
            expect(setupData.userId).toBeTruthy();
            expect(setupData.prId).toBeTruthy();
          },
        );

        await test.step("Открыть дашборд «Моя команда»", async () => {
          const origin = new URL(page.url()).origin;
          await page.goto(`${origin}/ru/dashboard/`);
          await page.waitForLoadState("domcontentloaded");
        });

        await test.step(
          "Проверить: дашборд недоступен — страница 403 «Нет доступа»",
          async () => {
            // Без permission viewDashboard (21) страница показывает 403 "Нет доступа"
            // (URL остаётся /dashboard/, но контент — страница ошибки)
            const accessDenied = page.getByText("Нет доступа");
            await expect(
              accessDenied,
              "Без permission viewDashboard (21) дашборд должен показать 403 «Нет доступа»",
            ).toBeVisible({ timeout: 10000 });
          },
        );
      },
    );
  },
);
