// @ts-check
/**
 * Исследовательский тест для определения структуры разрешений
 * Запустить: npx playwright test permission-research --project=nightly --reporter=list
 */

import { test, expect } from "@playwright/test";
import { RolesAPI, getCredentials } from "../../utils/api/index.js";
import { assignRolesAndInvalidate } from "../../utils/auth/TokenManager.js";

test.describe("Permission Research", { tag: ["@roles", "@api", "@permissions"] }, () => {
  test("C4265: Получить все разрешения и их структуру", { tag: ["@regression"] }, async ({ request }) => {
    let permissions;
    let adminAPI;

    await test.step("Авторизоваться через API как администратор", async () => {
      adminAPI = new RolesAPI(request);
      const { email, password } = getCredentials("admin");
      await adminAPI.signIn(email, password);
    });

    await test.step("Выполнить запрос списка всех разрешений", async () => {
      const { response, data } = await adminAPI.getPermissions();
      expect(response.ok()).toBe(true);

      permissions = data?.items || data || [];
    });

    await test.step("Проверить и вывести структуру разрешений", async () => {
      console.log("\n========== ВСЕ РАЗРЕШЕНИЯ В СИСТЕМЕ ==========\n");
      console.log(`Всего разрешений: ${permissions.length}\n`);

      for (const perm of permissions) {
        console.log(`ID: ${perm.id}`);
        console.log(`  code: ${perm.code || "N/A"}`);
        console.log(`  name: ${perm.name || "N/A"}`);
        console.log(`  title: ${perm.title || "N/A"}`);
        console.log(`  description: ${perm.description || "N/A"}`);
        console.log(`  key: ${perm.key || "N/A"}`);
        // Выводим все остальные поля
        const otherKeys = Object.keys(perm).filter(
          (k) =>
            !["id", "code", "name", "title", "description", "key"].includes(k),
        );
        if (otherKeys.length > 0) {
          console.log(
            `  other fields: ${JSON.stringify(Object.fromEntries(otherKeys.map((k) => [k, perm[k]])))}`,
          );
        }
        console.log("");
      }
    });
  });

  test("C4266: Проверить какие endpoints возвращают 403 для user без ролей", { tag: ["@regression"] }, async ({
    request,
  }) => {
    let adminAPI;
    let userId;
    let originalRoles;

    await test.step("Авторизоваться через API и получить ID тестового пользователя", async () => {
      // Сначала снимем все роли с тестового пользователя (кроме базовой)
      adminAPI = new RolesAPI(request);
      const adminCreds = getCredentials("admin");
      const userCreds = getCredentials("user");
      await adminAPI.signIn(adminCreds.email, adminCreds.password);

      // Получаем ID тестового пользователя
      const userAPI = new RolesAPI(request);
      await userAPI.signIn(userCreds.email, userCreds.password);
      const { data: userData } = await userAPI.getCurrentUser();
      userId = userData?.id || userData?.currentUserId;

      console.log(`\nTest user ID: ${userId}`);

      // Сохраняем текущие роли
      originalRoles = await adminAPI.getUserRoleIds(userId);
      console.log(`Original roles: ${JSON.stringify(originalRoles)}`);
    });

    await test.step("Снять все роли у пользователя и проверить доступы к manager endpoints", async () => {
      // Список всех manager endpoints для проверки
      const endpoints = [
        "/manager/roles",
        "/manager/roles/",
        "/manager/users/",
        "/manager/invite-links/",
        "/manager/user-groups/",
        "/manager/notifications-settings/",
        "/manager/company/",
        "/manager/company/settings/",
        "/manager/integrations/",
        "/manager/surveys/",
        "/manager/performance-reviews/",
        "/manager/karma/wallet/settings/",
        "/manager/gifts/",
        "/manager/objectives/settings/",
        "/manager/development-plan-templates/",
        "/manager/development-actions/",
        "/manager/competencies/",
        "/manager/competence-scales/",
        "/manager/feedbacks/",
        "/manager/feedbacks/statistics/timeline/",
        "/manager/performance-reviews/dashboard/all",
        "/manager/profile-tabs/",
        "/manager/custom-fields/",
      ];

      console.log(
        "\n========== ПРОВЕРКА ENDPOINTS БЕЗ СПЕЦИАЛЬНЫХ РОЛЕЙ ==========\n",
      );

      const userCreds = getCredentials("user");

      // Временно снимаем все роли
      await assignRolesAndInvalidate(adminAPI, userId, []);

      try {
        // Re-login пользователя
        const userAPI2 = new RolesAPI(request);
        await userAPI2.signIn(userCreds.email, userCreds.password);

        for (const endpoint of endpoints) {
          const { response } = await userAPI2.get(endpoint);
          const status = response.status();
          const statusText =
            status === 403
              ? "🔒 PROTECTED"
              : status === 200
                ? "✅ OPEN"
                : `⚠️ ${status}`;
          console.log(`${statusText} ${endpoint}`);
        }
      } finally {
        // Восстанавливаем роли — даже если цикл бросил ошибку
        try {
          await assignRolesAndInvalidate(adminAPI, userId, originalRoles);
          console.log(`\nРоли восстановлены: ${JSON.stringify(originalRoles)}`);
        } catch (e) {
          console.error(
            `FAILED to restore roles for user ${userId}:`,
            e.message,
          );
        }
      }
    });
  });

  test("C4267: Проверить каждое разрешение по отдельности", { tag: ["@regression"] }, async ({
    request,
  }) => {
    let adminAPI;
    let userId;
    let originalRoles;
    let permissions;

    await test.step("Авторизоваться через API и получить список разрешений", async () => {
      adminAPI = new RolesAPI(request);
      const adminCreds = getCredentials("admin");
      await adminAPI.signIn(adminCreds.email, adminCreds.password);

      // Получаем все разрешения
      const { data: permData } = await adminAPI.getPermissions();
      permissions = permData?.items || permData || [];
    });

    await test.step("Получить ID тестового пользователя и сохранить оригинальные роли", async () => {
      const userCreds = getCredentials("user");

      // Получаем ID тестового пользователя
      const userAPI = new RolesAPI(request);
      await userAPI.signIn(userCreds.email, userCreds.password);
      const { data: userData } = await userAPI.getCurrentUser();
      userId = userData?.id || userData?.currentUserId;

      // Сохраняем оригинальные роли
      originalRoles = await adminAPI.getUserRoleIds(userId);
    });

    await test.step("Проверить матрицу доступов: каждое разрешение по каждому endpoint", async () => {
      const userCreds = getCredentials("user");

      // Полный список endpoints для проверки
      const allEndpoints = [
        "/manager/roles",
        "/manager/users/",
        "/manager/invite-links/",
        "/manager/user-groups/",
        "/manager/notifications-settings/",
        "/manager/company/",
        "/manager/surveys/",
        "/manager/performance-reviews/",
        "/manager/karma/wallet/settings/",
        "/manager/gifts/",
        "/manager/objectives/settings/",
        "/manager/development-plan-templates/",
        "/manager/competencies/",
        "/manager/feedbacks/",
      ];

      console.log("\n========== МАТРИЦА РАЗРЕШЕНИЕ → ENDPOINT ==========\n");

      // Для каждого разрешения создаём роль и проверяем доступы
      for (const perm of permissions) {
        // Создаём роль с одним разрешением
        const roleName = `Research_${perm.code || perm.id}_${Date.now()}`;
        const { response: createResp, data: roleData } =
          await adminAPI.createRole({
            title: roleName,
            permissionsIds: [perm.id],
          });

        if (!createResp.ok()) {
          console.log(
            `❌ Не удалось создать роль для ${perm.code || perm.name}: ${createResp.status()}`,
          );
          continue;
        }

        const roleId = roleData.id;

        try {
          // Снимаем все роли и назначаем только тестовую
          await assignRolesAndInvalidate(adminAPI, userId, [roleId]);

          // Re-login пользователя
          const testUserAPI = new RolesAPI(request);
          await testUserAPI.signIn(userCreds.email, userCreds.password);

          // Проверяем все endpoints
          const accessibleEndpoints = [];
          for (const endpoint of allEndpoints) {
            const { response } = await testUserAPI.get(endpoint);
            if (response.status() < 400) {
              accessibleEndpoints.push(endpoint);
            }
          }

          console.log(`${perm.code || perm.name} (ID: ${perm.id}):`);
          if (accessibleEndpoints.length > 0) {
            console.log(`  → Даёт доступ к: ${accessibleEndpoints.join(", ")}`);
          } else {
            console.log(`  → Не даёт доступ к manager endpoints`);
          }
        } finally {
          // Cleanup — каждая операция в отдельном try/catch
          try {
            await assignRolesAndInvalidate(adminAPI, userId, originalRoles);
          } catch (e) {
            console.error(
              `[Cleanup] FAILED to restore roles for user ${userId}:`,
              e.message,
            );
          }
          try {
            await adminAPI.deleteRole(roleId);
          } catch (e) {
            console.error(
              `[Cleanup] FAILED to delete role ${roleId}:`,
              e.message,
            );
          }
        }
      }

      console.log("\n========== ИССЛЕДОВАНИЕ ЗАВЕРШЕНО ==========\n");
    });
  });

  test("C4268: Проверить write-операции для разрешений без GET", { tag: ["@regression"] }, async ({
    request,
  }) => {
    let adminAPI;
    let userId;
    let originalRoles;

    await test.step("Авторизоваться через API и получить ID тестового пользователя", async () => {
      adminAPI = new RolesAPI(request);
      const adminCreds = getCredentials("admin");
      const userCreds = getCredentials("user");
      await adminAPI.signIn(adminCreds.email, adminCreds.password);

      // Получаем ID тестового пользователя
      const userAPI = new RolesAPI(request);
      await userAPI.signIn(userCreds.email, userCreds.password);
      const { data: userData } = await userAPI.getCurrentUser();
      userId = userData?.id || userData?.currentUserId;

      // Сохраняем оригинальные роли
      originalRoles = await adminAPI.getUserRoleIds(userId);
    });

    await test.step("Проверить write-операции без специальных ролей", async () => {
      const userCreds = getCredentials("user");

      console.log("\n========== ПРОВЕРКА WRITE-ОПЕРАЦИЙ ==========\n");

      // Тест без ролей
      await assignRolesAndInvalidate(adminAPI, userId, []);
      const noRoleAPI = new RolesAPI(request);
      await noRoleAPI.signIn(userCreds.email, userCreds.password);

      // Write-операции для проверки
      const writeOps = [
        {
          name: "POST /manager/user-groups/",
          method: "post",
          endpoint: "/manager/user-groups/",
          body: { title: "Test" },
        },
        {
          name: "POST /manager/notifications-settings/",
          method: "post",
          endpoint: "/manager/notifications-settings/",
          body: {},
        },
        {
          name: "PATCH /manager/company/",
          method: "patch",
          endpoint: "/manager/company/",
          body: {},
        },
        {
          name: "POST /manager/objectives/settings/",
          method: "post",
          endpoint: "/manager/objectives/settings/",
          body: {},
        },
        {
          name: "POST /manager/roles/",
          method: "post",
          endpoint: "/manager/roles/",
          body: { title: "Test", permissionsIds: [] },
        },
        {
          name: "POST /manager/feedbacks/statistics/timeline/",
          method: "post",
          endpoint: "/manager/feedbacks/statistics/timeline/",
          body: {},
        },
      ];

      console.log("БЕЗ РОЛЕЙ:");
      for (const op of writeOps) {
        const { response } = await noRoleAPI[op.method](op.endpoint, op.body);
        const status = response.status();
        const statusText =
          status === 403
            ? "🔒 PROTECTED"
            : status === 200 || status === 201
              ? "✅ ALLOWED"
              : `⚠️ ${status}`;
        console.log(`  ${statusText} ${op.name}`);
      }
    });

    await test.step("Восстановить оригинальные роли пользователя", async () => {
      // Восстанавливаем роли
      await assignRolesAndInvalidate(adminAPI, userId, originalRoles);
    });
  });

  test("C4269: Проверка цикла назначения/снятия роли", { tag: ["@regression"] }, async ({ request }) => {
    let adminAPI;
    let userId;
    let originalRoles;
    let baseRoleId;
    let testRoleId;

    await test.step("Авторизоваться через API и получить данные пользователя", async () => {
      adminAPI = new RolesAPI(request);
      const adminCreds = getCredentials("admin");
      const userCreds = getCredentials("user");
      await adminAPI.signIn(adminCreds.email, adminCreds.password);

      // Получаем ID тестового пользователя и его роли
      const userAPI = new RolesAPI(request);
      await userAPI.signIn(userCreds.email, userCreds.password);
      const { data: userData } = await userAPI.getCurrentUser();
      userId = userData?.id || userData?.currentUserId;
      originalRoles = await adminAPI.getUserRoleIds(userId);

      console.log(`\n========== ЦИКЛ НАЗНАЧЕНИЯ/СНЯТИЯ ==========\n`);
      console.log(`User ID: ${userId}`);
      console.log(`Original roles: ${JSON.stringify(originalRoles)}`);
    });

    await test.step("Создать тестовые роли (базовую без разрешений и тестовую с manageRole)", async () => {
      // Получаем manageRole permission
      const { data: permData } = await adminAPI.getPermissions();
      const permissions = permData?.items || permData || [];
      const manageRolePerm = permissions.find((p) => p.name === "manageRole");
      console.log(`manageRole permission ID: ${manageRolePerm?.id}`);

      // Создаём БАЗОВУЮ роль БЕЗ разрешений (для отката)
      const { data: baseRoleData } = await adminAPI.createRole({
        title: `BaseRole_${Date.now()}`,
        permissionsIds: [], // Пустой - без разрешений
      });
      baseRoleId = baseRoleData.id;
      console.log(`Created base role (no permissions): ${baseRoleId}`);

      // Создаём тестовую роль с разрешением
      const { data: testRoleData } = await adminAPI.createRole({
        title: `TestRole_${Date.now()}`,
        permissionsIds: [manageRolePerm.id],
      });
      testRoleId = testRoleData.id;
      console.log(`Created test role (with manageRole): ${testRoleId}`);
    });

    await test.step("Выполнить цикл: назначить базовую роль → проверить 403", async () => {
      const userCreds = getCredentials("user");

      try {
        // ШАГ 1: Назначаем БАЗОВУЮ роль (без разрешений)
        console.log("\n--- ШАГ 1: Назначаем базовую роль (без разрешений) ---");
        await assignRolesAndInvalidate(adminAPI, userId, [baseRoleId]);
        let currentRoles = await adminAPI.getUserRoleIds(userId);
        console.log(`Roles: ${JSON.stringify(currentRoles)}`);

        // Проверяем что нет доступа
        const api1 = new RolesAPI(request);
        await api1.signIn(userCreds.email, userCreds.password);
        const { response: resp1 } = await api1.get("/manager/roles");
        console.log(`Access with base role: ${resp1.status()}`);
        expect(resp1.status(), "С базовой ролью должен быть 403").toBe(403);

        // ШАГ 2: Добавляем тестовую роль (базовая + тестовая)
        console.log("\n--- ШАГ 2: Добавляем тестовую роль ---");
        await assignRolesAndInvalidate(adminAPI, userId, [
          baseRoleId,
          testRoleId,
        ]);
        currentRoles = await adminAPI.getUserRoleIds(userId);
        console.log(`Roles: ${JSON.stringify(currentRoles)}`);

        // Проверяем что есть доступ
        const api2 = new RolesAPI(request);
        await api2.signIn(userCreds.email, userCreds.password);
        const { response: resp2 } = await api2.get("/manager/roles");
        console.log(`Access with test role: ${resp2.status()}`);
        expect(resp2.status(), "С тестовой ролью должен быть 200").toBe(200);

        // ШАГ 3: Убираем тестовую роль (оставляем только базовую)
        console.log("\n--- ШАГ 3: Убираем тестовую роль ---");
        await assignRolesAndInvalidate(adminAPI, userId, [baseRoleId]);
        currentRoles = await adminAPI.getUserRoleIds(userId);
        console.log(`Roles: ${JSON.stringify(currentRoles)}`);

        // Проверяем что доступ пропал
        const api3 = new RolesAPI(request);
        await api3.signIn(userCreds.email, userCreds.password);
        const { response: resp3 } = await api3.get("/manager/roles");
        console.log(`Access after removing test role: ${resp3.status()}`);
        expect(
          resp3.status(),
          "После снятия тестовой роли должен быть 403",
        ).toBe(403);
      } finally {
        // Восстанавливаем оригинальные роли и удаляем тестовые
        // Каждая операция в отдельном try/catch
        try {
          await assignRolesAndInvalidate(adminAPI, userId, originalRoles);
          console.log(`[Cleanup] Restored roles for user ${userId}`);
        } catch (e) {
          console.error(
            `[Cleanup] FAILED to restore roles for user ${userId}:`,
            e.message,
          );
        }
        try {
          await adminAPI.deleteRole(testRoleId);
        } catch (e) {
          console.error(
            `[Cleanup] FAILED to delete testRole ${testRoleId}:`,
            e.message,
          );
        }
        try {
          await adminAPI.deleteRole(baseRoleId);
        } catch (e) {
          console.error(
            `[Cleanup] FAILED to delete baseRole ${baseRoleId}:`,
            e.message,
          );
        }
      }
    });
  });

  test("C4270: Детальная проверка manageUserGroup", { tag: ["@regression"] }, async ({ request }) => {
    let adminAPI;
    let userId;
    let originalRoles;
    let roleId;

    await test.step("Авторизоваться через API и найти разрешение manageUserGroup", async () => {
      adminAPI = new RolesAPI(request);
      const adminCreds = getCredentials("admin");
      await adminAPI.signIn(adminCreds.email, adminCreds.password);

      const { data: permData } = await adminAPI.getPermissions();
      const permissions = permData?.items || permData || [];
      const manageUserGroupPerm = permissions.find(
        (p) => p.name === "manageUserGroup",
      );

      if (!manageUserGroupPerm) {
        console.log("Permission manageUserGroup not found");
        return;
      }

      const userCreds = getCredentials("user");
      const userAPI = new RolesAPI(request);
      await userAPI.signIn(userCreds.email, userCreds.password);
      const { data: userData } = await userAPI.getCurrentUser();
      userId = userData?.id || userData?.currentUserId;
      originalRoles = await adminAPI.getUserRoleIds(userId);

      console.log("\n========== manageUserGroup TEST ==========\n");

      // Создаём роль с manageUserGroup
      const { data: roleData } = await adminAPI.createRole({
        title: `Test_manageUserGroup_${Date.now()}`,
        permissionsIds: [manageUserGroupPerm.id],
      });
      roleId = roleData.id;
    });

    await test.step("Проверить доступы без разрешения manageUserGroup", async () => {
      if (!roleId) return;

      const userCreds = getCredentials("user");

      // БЕЗ разрешения
      await assignRolesAndInvalidate(adminAPI, userId, []);
      const noPermAPI = new RolesAPI(request);
      await noPermAPI.signIn(userCreds.email, userCreds.password);

      const { response: getNoRole } = await noPermAPI.get(
        "/manager/user-groups/",
      );
      const { response: postNoRole } = await noPermAPI.post(
        "/manager/user-groups/",
        { title: "NoPermTest" },
      );
      console.log(`БЕЗ manageUserGroup:`);
      console.log(`  GET /manager/user-groups/: ${getNoRole.status()}`);
      console.log(`  POST /manager/user-groups/: ${postNoRole.status()}`);
    });

    await test.step("Проверить доступы с разрешением manageUserGroup", async () => {
      if (!roleId) return;

      const userCreds = getCredentials("user");

      // С разрешением
      await assignRolesAndInvalidate(adminAPI, userId, [roleId]);
      const withPermAPI = new RolesAPI(request);
      await withPermAPI.signIn(userCreds.email, userCreds.password);

      const { response: getWithRole } = await withPermAPI.get(
        "/manager/user-groups/",
      );
      const { response: postWithRole } = await withPermAPI.post(
        "/manager/user-groups/",
        { title: "WithPermTest" },
      );
      console.log(`С manageUserGroup:`);
      console.log(`  GET /manager/user-groups/: ${getWithRole.status()}`);
      console.log(`  POST /manager/user-groups/: ${postWithRole.status()}`);
    });

    await test.step("Восстановить оригинальные роли и удалить тестовую роль", async () => {
      if (!roleId) return;

      await assignRolesAndInvalidate(adminAPI, userId, originalRoles);
      await adminAPI.deleteRole(roleId);
    });
  });
});
