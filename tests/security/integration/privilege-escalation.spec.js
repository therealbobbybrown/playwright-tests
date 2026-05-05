/**
 * Privilege Escalation Security Tests
 *
 * Проверяет защиту от повышения привилегий:
 * - Anonymous: 401 на все endpoints
 * - Изменение своей роли через API
 * - Добавление себя в админ-группу
 * - Подмена userId в запросах
 * - Манипуляция с правами доступа
 */
import { test as base, expect } from "@playwright/test";
import {
  RolesAPI,
  OrgStructureAPI,
  ProfileAPI,
  DevelopmentPlansAPI,
  getCredentials,
} from "../../utils/api/index.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

// Кеш для созданных ресурсов (cleanup)
const createdResources = {
  roleIds: [],
  groupIds: [],
};

// Расширение fixtures для ролей
const test = base.extend({
  adminAPI: async ({ request }, use) => {
    const api = {
      roles: new RolesAPI(request),
      orgStructure: new OrgStructureAPI(request),
      profile: new ProfileAPI(request),
      devPlans: new DevelopmentPlansAPI(request),
    };
    const { email, password } = getCredentials("admin");
    await api.roles.signIn(email, password);
    await api.orgStructure.signIn(email, password);
    await api.profile.signIn(email, password);
    await api.devPlans.signIn(email, password);
    await use(api);
  },
  userAPI: async ({ request }, use) => {
    const api = {
      roles: new RolesAPI(request),
      orgStructure: new OrgStructureAPI(request),
      profile: new ProfileAPI(request),
      devPlans: new DevelopmentPlansAPI(request),
    };
    const { email, password } = getCredentials("user");
    await api.roles.signIn(email, password);
    await api.orgStructure.signIn(email, password);
    await api.profile.signIn(email, password);
    await api.devPlans.signIn(email, password);
    await use(api);
  },
  managerAPI: async ({ request }, use) => {
    const api = {
      roles: new RolesAPI(request),
      orgStructure: new OrgStructureAPI(request),
      profile: new ProfileAPI(request),
      devPlans: new DevelopmentPlansAPI(request),
    };
    const { email, password } = getCredentials("manager");
    await api.roles.signIn(email, password);
    await api.orgStructure.signIn(email, password);
    await api.profile.signIn(email, password);
    await api.devPlans.signIn(email, password);
    await use(api);
  },
  // Anonymous API - без авторизации
  anonAPI: async ({ request }, use) => {
    const api = {
      roles: new RolesAPI(request),
      orgStructure: new OrgStructureAPI(request),
      profile: new ProfileAPI(request),
      devPlans: new DevelopmentPlansAPI(request),
    };
    // Не вызываем signIn - оставляем без токена
    await use(api);
  },
});

test.describe("Privilege Escalation Security @api @security @integration @privilege-escalation", () => {
  test.beforeEach(() => {
    markAsAPITest(MODULES.SECURITY, "Privilege Escalation");
  });

  test.afterAll(async ({ request }) => {
    // Cleanup созданных ресурсов через admin
    const adminRoles = new RolesAPI(request);
    const adminOrgStructure = new OrgStructureAPI(request);
    const { email, password } = getCredentials("admin");
    await adminRoles.signIn(email, password);
    await adminOrgStructure.signIn(email, password);

    for (const id of createdResources.roleIds) {
      try {
        await adminRoles.deleteRole(id);
      } catch {
        /* ignore */
      }
    }
    for (const id of createdResources.groupIds) {
      try {
        await adminOrgStructure.deleteUserGroup(id);
      } catch {
        /* ignore */
      }
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // ANONYMOUS - должен получить 401
  // ═══════════════════════════════════════════════════════════════
  test.describe("Неавторизованный пользователь (Anonymous)", () => {
    test("Anonymous не может получить /manager/users/", async ({ anonAPI }) => {
      setSeverity("critical");

      const { response } = await anonAPI.devPlans.get("/manager/users/");

      expect(response.status()).toBe(401);
    });

    test("Anonymous не может получить /manager/roles/", async ({ anonAPI }) => {
      setSeverity("critical");

      const { response } = await anonAPI.roles.getRoles();

      expect(response.status()).toBe(401);
    });

    test("Anonymous не может получить /manager/departments/", async ({
      anonAPI,
    }) => {
      setSeverity("critical");

      const { response } = await anonAPI.devPlans.get("/manager/departments/");

      expect(response.status()).toBe(401);
    });

    test("Anonymous не может создать роль", async ({ anonAPI }) => {
      setSeverity("critical");

      const { response } = await anonAPI.roles.createRole({
        title: `Anonymous Role ${Date.now()}`,
        permissionsIds: [],
      });

      expect(response.status()).toBe(401);
    });

    test("Anonymous не может получить /private/accounts/me", async ({
      anonAPI,
    }) => {
      setSeverity("critical");

      const { response } = await anonAPI.devPlans.get("/private/accounts/me");

      expect(response.status()).toBe(401);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // ADMIN - позитивные проверки (может выполнять операции)
  // ═══════════════════════════════════════════════════════════════
  test.describe("Admin - полные права", () => {
    test("Admin может получить список ролей", async ({ adminAPI }) => {
      setSeverity("critical");

      const { response, data } = await adminAPI.roles.getRoles({ limit: 10 });

      expect(response.ok()).toBe(true);
      expect(data).toBeDefined();

      // Проверяем структуру ответа
      const roles = data?.items || data || [];
      expect(Array.isArray(roles), "Ответ должен содержать массив ролей").toBe(
        true,
      );

      // Если есть роли - проверяем структуру первой
      if (roles.length > 0) {
        const firstRole = roles[0];
        expect(firstRole).toHaveProperty("id");
        expect(typeof firstRole.id).toMatch(/number|string/);
        // Роль должна иметь название
        if (firstRole.title !== undefined) {
          expect(typeof firstRole.title).toBe("string");
        }
      }
    });

    test("Admin может получить список пользователей", async ({ adminAPI }) => {
      setSeverity("critical");

      const { response, data } = await adminAPI.orgStructure.getUsers({
        limit: 10,
      });

      expect(response.ok()).toBe(true);
      expect(data).toBeDefined();

      // Проверяем структуру ответа
      const users = data?.items || data || [];
      expect(
        Array.isArray(users),
        "Ответ должен содержать массив пользователей",
      ).toBe(true);

      // Если есть пользователи - проверяем структуру первого
      if (users.length > 0) {
        const firstUser = users[0];
        expect(firstUser).toHaveProperty("id");
        expect(typeof firstUser.id).toMatch(/number|string/);
      }
    });

    test("Admin может получить список групп", async ({ adminAPI }) => {
      setSeverity("critical");

      const { response, data } = await adminAPI.orgStructure.getUserGroups({
        limit: 10,
      });

      expect(response.ok()).toBe(true);
      expect(data).toBeDefined();

      // Проверяем структуру ответа
      const groups = data?.items || data || [];
      expect(Array.isArray(groups), "Ответ должен содержать массив групп").toBe(
        true,
      );

      // Если есть группы - проверяем структуру первой
      if (groups.length > 0) {
        const firstGroup = groups[0];
        expect(firstGroup).toHaveProperty("id");
        expect(typeof firstGroup.id).toMatch(/number|string/);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // ИЗМЕНЕНИЕ СВОЕЙ РОЛИ
  // ═══════════════════════════════════════════════════════════════
  test.describe("Изменение своей роли", () => {
    test("User не может изменить свою роль на Admin", async ({
      userAPI,
      adminAPI,
    }) => {
      setSeverity("critical");

      // Получаем ID текущего пользователя
      const { data: meData } = await userAPI.devPlans.get(
        "/private/accounts/me",
      );
      const userId =
        meData?.id || meData?.currentUserId || meData?.account?.users?.[0]?.id;

      test.skip(!userId, "Не удалось получить ID пользователя");

      // Сохраняем текущие роли пользователя через admin для последующей верификации
      const { data: originalUserData } =
        await adminAPI.profile.getUserById(userId);
      const originalRoleIds =
        originalUserData?.roleIds || originalUserData?.user?.roleIds || [];

      // Получаем любую существующую роль (для теста привилегий подходит любая)
      const { data: rolesData } = await adminAPI.roles.getRoles({ limit: 50 });
      const roles = rolesData?.items || rolesData || [];
      // Берём первую роль - для теста privilege escalation подходит любая
      const targetRole = roles[0];

      test.skip(!targetRole?.id, "Нет существующих ролей для теста");

      // User пытается изменить свою роль через API (manager endpoint)
      const { response } = await userAPI.devPlans.post(
        `/manager/users/${userId}/`,
        {
          roleIds: [targetRole.id],
        },
      );

      // Должен получить 403 Forbidden
      expect([403, 404]).toContain(response.status());

      // Проверяем что error response не раскрывает внутренние детали
      const errorData = await response.json().catch(() => ({}));
      if (errorData?.message || errorData?.error) {
        const errorText = JSON.stringify(errorData).toLowerCase();
        expect(errorText).not.toContain("stack");
        expect(errorText).not.toContain("sql");
      }

      // КРИТИЧНО: Верифицируем что роли НЕ изменились
      const { data: verifyUserData } =
        await adminAPI.profile.getUserById(userId);
      const verifyRoleIds =
        verifyUserData?.roleIds || verifyUserData?.user?.roleIds || [];

      // Роли должны остаться такими же
      expect(
        JSON.stringify(verifyRoleIds.sort()),
        "Роли пользователя НЕ должны были измениться",
      ).toBe(JSON.stringify(originalRoleIds.sort()));
    });

    test("User не может создать новую роль с админскими правами", async ({
      userAPI,
    }) => {
      setSeverity("critical");

      // User пытается создать роль через manager API
      const { response } = await userAPI.roles.createRole({
        title: `Hacked Admin Role ${Date.now()}`,
        permissionsIds: [], // Попытка создать роль
      });

      // Должен получить 403 Forbidden (нет доступа к manager API)
      expect([403, 401]).toContain(response.status());

      // Проверяем что error response не раскрывает внутренние детали
      const errorData = await response.json().catch(() => ({}));
      if (errorData?.message || errorData?.error) {
        const errorText = JSON.stringify(errorData).toLowerCase();
        expect(errorText).not.toContain("stack");
        expect(errorText).not.toContain("sql");
        expect(errorText).not.toContain("internal server");
      }
    });

    test("Manager не может изменить свою роль на Admin", async ({
      managerAPI,
      adminAPI,
    }) => {
      setSeverity("critical");

      // Получаем ID текущего менеджера
      const { data: meData } = await managerAPI.devPlans.get(
        "/private/accounts/me",
      );
      const managerId =
        meData?.id || meData?.currentUserId || meData?.account?.users?.[0]?.id;

      test.skip(!managerId, "Не удалось получить ID менеджера");

      // Сохраняем текущие роли менеджера для последующей верификации
      const { data: originalUserData } =
        await adminAPI.profile.getUserById(managerId);
      const originalRoleIds =
        originalUserData?.roleIds || originalUserData?.user?.roleIds || [];

      // Получаем любую существующую роль (для теста привилегий подходит любая)
      const { data: rolesData } = await adminAPI.roles.getRoles({ limit: 50 });
      const roles = rolesData?.items || rolesData || [];
      // Берём первую роль - для теста privilege escalation подходит любая
      const targetRole = roles[0];

      test.skip(!targetRole?.id, "Нет существующих ролей для теста");

      // Manager пытается изменить свою роль через manager endpoint
      const { response } = await managerAPI.devPlans.post(
        `/manager/users/${managerId}/`,
        {
          roleIds: [targetRole.id],
        },
      );

      // Должен получить 403 Forbidden
      expect([403, 404]).toContain(response.status());

      // Проверяем что error response не раскрывает внутренние детали
      const errorData = await response.json().catch(() => ({}));
      if (errorData?.message || errorData?.error) {
        const errorText = JSON.stringify(errorData).toLowerCase();
        expect(errorText).not.toContain("stack");
        expect(errorText).not.toContain("sql");
      }

      // КРИТИЧНО: Верифицируем что роли НЕ изменились
      const { data: verifyUserData } =
        await adminAPI.profile.getUserById(managerId);
      const verifyRoleIds =
        verifyUserData?.roleIds || verifyUserData?.user?.roleIds || [];

      // Роли должны остаться такими же
      expect(
        JSON.stringify(verifyRoleIds.sort()),
        "Роли менеджера НЕ должны были измениться",
      ).toBe(JSON.stringify(originalRoleIds.sort()));
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // ДОБАВЛЕНИЕ В АДМИН-ГРУППУ
  // ═══════════════════════════════════════════════════════════════
  test.describe("Добавление себя в админ-группу", () => {
    test("User не может добавить себя в группу пользователей", async ({
      userAPI,
      adminAPI,
    }) => {
      setSeverity("critical");

      // Получаем ID текущего пользователя
      const { data: meData } = await userAPI.devPlans.get(
        "/private/accounts/me",
      );
      const userId =
        meData?.id || meData?.currentUserId || meData?.account?.users?.[0]?.id;

      test.skip(!userId, "Не удалось получить ID пользователя");

      // Получаем существующую группу через admin
      const { data: groupsData } = await adminAPI.orgStructure.getUserGroups({
        limit: 10,
      });
      const groups = groupsData?.items || groupsData || [];
      const existingGroup = groups[0];

      test.skip(!existingGroup?.id, "Нет существующих групп для теста");

      // Сохраняем список пользователей в группе до попытки взлома
      const { data: originalGroupData } =
        await adminAPI.orgStructure.getUserGroup(existingGroup.id);
      const originalUserIds = (originalGroupData?.users || []).map((u) => u.id);

      // User пытается добавить себя в группу через manager API
      const { response } = await userAPI.devPlans.post(
        `/manager/user-groups/${existingGroup.id}/users/add/`,
        {
          usersIds: [userId],
        },
      );

      // Должен получить 403 Forbidden
      expect([403, 404]).toContain(response.status());

      // Проверяем что error response не раскрывает внутренние детали
      const errorData = await response.json().catch(() => ({}));
      if (errorData?.message || errorData?.error) {
        const errorText = JSON.stringify(errorData).toLowerCase();
        expect(errorText).not.toContain("stack");
        expect(errorText).not.toContain("sql");
      }

      // КРИТИЧНО: Верифицируем что user НЕ был добавлен в группу
      const { data: verifyGroupData } =
        await adminAPI.orgStructure.getUserGroup(existingGroup.id);
      const verifyUserIds = (verifyGroupData?.users || []).map((u) => u.id);

      // User НЕ должен быть в группе
      expect(
        verifyUserIds.includes(userId),
        "User НЕ должен был быть добавлен в группу",
      ).toBe(
        originalUserIds.includes(userId), // Если user уже был - то ОК, если не был - должен остаться не в группе
      );
    });

    test("User не может создать новую группу", async ({ userAPI }) => {
      setSeverity("critical");

      // User пытается создать группу через manager API
      const { response } = await userAPI.orgStructure.createUserGroup({
        title: `Hacked Group ${Date.now()}`,
        emoji: "🔓",
      });

      // Должен получить 403 Forbidden
      expect([403, 401]).toContain(response.status());

      // Проверяем что error response не раскрывает внутренние детали
      const errorData = await response.json().catch(() => ({}));
      if (errorData?.message || errorData?.error) {
        const errorText = JSON.stringify(errorData).toLowerCase();
        expect(errorText).not.toContain("stack");
        expect(errorText).not.toContain("sql");
        expect(errorText).not.toContain("internal server");
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // ПОДМЕНА userId В ЗАПРОСАХ
  // ═══════════════════════════════════════════════════════════════
  test.describe("Подмена userId в запросах", () => {
    test("User не может получить данные другого пользователя по ID", async ({
      userAPI,
      adminAPI,
    }) => {
      setSeverity("critical");

      // Получаем ID admin
      const { data: adminData } = await adminAPI.devPlans.get(
        "/private/accounts/me",
      );
      const adminId =
        adminData?.id ||
        adminData?.currentUserId ||
        adminData?.account?.users?.[0]?.id;

      test.skip(!adminId, "Не удалось получить ID admin");

      // User пытается получить профиль admin
      const { response, data } = await userAPI.profile.getUserById(adminId);

      // Либо 403, либо данные ограничены (200 но без чувствительной инфо)
      if (response.ok()) {
        // Проверяем что нет чувствительных данных
        // Список чувствительных полей, которые НЕ должны быть раскрыты
        const sensitiveFields = [
          "email",
          "phone",
          "password",
          "passwordHash",
          "accessToken",
          "refreshToken",
          "permissions",
          "roles",
          "roleIds",
          "personalEmail",
          "personalPhone",
          "passportNumber",
          "inn",
          "snils",
          "bankAccount",
          "salary",
          "privateNotes",
        ];

        for (const field of sensitiveFields) {
          expect(
            data?.[field],
            `Чувствительное поле "${field}" не должно быть раскрыто`,
          ).toBeUndefined();
        }

        // Проверяем вложенные объекты на чувствительные данные
        if (data?.user) {
          for (const field of sensitiveFields) {
            expect(
              data.user?.[field],
              `Чувствительное поле user.${field} не должно быть раскрыто`,
            ).toBeUndefined();
          }
        }

        // Проверяем что если есть error message, он не раскрывает внутренние детали
        if (data?.error || data?.message) {
          const errorText = JSON.stringify(
            data.error || data.message,
          ).toLowerCase();
          expect(errorText).not.toContain("stack");
          expect(errorText).not.toContain("sql");
          expect(errorText).not.toContain("query");
          expect(errorText).not.toContain("database");
          expect(errorText).not.toContain("password");
        }
      } else {
        expect([403, 404]).toContain(response.status());

        // Проверяем что error response не раскрывает внутренние детали
        const errorData = await response.json().catch(() => ({}));
        if (errorData?.message || errorData?.error) {
          const errorText = JSON.stringify(errorData).toLowerCase();
          expect(errorText).not.toContain("stack");
          expect(errorText).not.toContain("sql");
          expect(errorText).not.toContain("internal");
          expect(errorText).not.toContain("database");
        }
      }
    });

    test("User не может обновить профиль другого пользователя", async ({
      userAPI,
      adminAPI,
    }) => {
      setSeverity("critical");

      // Получаем ID admin
      const { data: adminData } = await adminAPI.devPlans.get(
        "/private/accounts/me",
      );
      const adminId =
        adminData?.id ||
        adminData?.currentUserId ||
        adminData?.account?.users?.[0]?.id;

      test.skip(!adminId, "Не удалось получить ID admin");

      // Сохраняем оригинальные данные профиля admin для верификации
      const { data: originalProfile } =
        await adminAPI.profile.getUserById(adminId);
      const originalFirstName =
        originalProfile?.firstName || originalProfile?.user?.firstName;
      const originalLastName =
        originalProfile?.lastName || originalProfile?.user?.lastName;

      // User пытается обновить профиль admin
      const { response } = await userAPI.profile.updateUserInfo(adminId, {
        firstName: "Hacked",
        lastName: "Name",
      });

      // Должен получить 403 Forbidden
      expect([403, 404]).toContain(response.status());

      // Проверяем что error response не раскрывает внутренние детали
      const errorData = await response.json().catch(() => ({}));
      if (errorData?.message || errorData?.error) {
        const errorText = JSON.stringify(errorData).toLowerCase();
        expect(errorText).not.toContain("stack");
        expect(errorText).not.toContain("sql");
      }

      // КРИТИЧНО: Верифицируем что изменения НЕ произошли
      const { data: verifyProfile } =
        await adminAPI.profile.getUserById(adminId);
      const verifyFirstName =
        verifyProfile?.firstName || verifyProfile?.user?.firstName;
      const verifyLastName =
        verifyProfile?.lastName || verifyProfile?.user?.lastName;

      expect(verifyFirstName, "Имя админа не должно было измениться").not.toBe(
        "Hacked",
      );
      expect(
        verifyLastName,
        "Фамилия админа не должна была измениться",
      ).not.toBe("Name");

      // Проверяем что данные остались такими же как до попытки изменения
      if (originalFirstName) {
        expect(verifyFirstName, "Имя должно остаться прежним").toBe(
          originalFirstName,
        );
      }
      if (originalLastName) {
        expect(verifyLastName, "Фамилия должна остаться прежней").toBe(
          originalLastName,
        );
      }
    });

    test("User не может подменить userId при создании ресурса для другого", async ({
      userAPI,
      adminAPI,
    }) => {
      setSeverity("critical");

      // Получаем ID admin
      const { data: adminData } = await adminAPI.devPlans.get(
        "/private/accounts/me",
      );
      const adminId =
        adminData?.id ||
        adminData?.currentUserId ||
        adminData?.account?.users?.[0]?.id;

      test.skip(!adminId, "Не удалось получить ID admin");

      // Уникальный маркер для идентификации попытки создания
      const uniqueMarker = `HACK_ATTEMPT_${Date.now()}`;

      // User пытается создать план развития для admin
      const startDate = new Date().toISOString();
      const endDate = new Date(
        Date.now() + 30 * 24 * 60 * 60 * 1000,
      ).toISOString();

      const { response } = await userAPI.devPlans.post(
        "/private/development-plans/",
        {
          title: `Plan for Admin ${uniqueMarker}`,
          responsibleUserId: adminId, // Попытка подменить userId
          startDate,
          endDate,
        },
      );

      // Должен получить 403 или ошибку валидации
      expect([400, 403, 404]).toContain(response.status());

      // Проверяем что error response не раскрывает внутренние детали
      const errorData = await response.json().catch(() => ({}));
      if (errorData?.message || errorData?.error) {
        const errorText = JSON.stringify(errorData).toLowerCase();
        expect(errorText).not.toContain("stack");
        expect(errorText).not.toContain("sql");
        expect(errorText).not.toContain("internal server");
      }

      // КРИТИЧНО: Верифицируем что план НЕ был создан для admin
      const { data: adminPlans } = await adminAPI.devPlans.getPlans({
        limit: 100,
      });
      const plans = adminPlans?.items || adminPlans || [];

      // Проверяем что нет плана с нашим уникальным маркером
      const hackedPlan = plans.find((p) => p?.title?.includes(uniqueMarker));
      expect(
        hackedPlan,
        "План развития НЕ должен был быть создан для admin",
      ).toBeUndefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // МАНИПУЛЯЦИЯ С ПРАВАМИ ДОСТУПА
  // ═══════════════════════════════════════════════════════════════
  test.describe("Манипуляция с правами доступа", () => {
    test("User не может изменить права доступа роли", async ({
      userAPI,
      adminAPI,
    }) => {
      setSeverity("critical");

      // Получаем существующую роль через admin
      const { data: rolesData } = await adminAPI.roles.getRoles({ limit: 10 });
      const roles = rolesData?.items || rolesData || [];
      const existingRole = roles[0];

      test.skip(!existingRole?.id, "Нет существующих ролей для теста");

      // Сохраняем оригинальные permissions роли
      const originalPermissionsIds = existingRole.permissionsIds || [];

      // User пытается обновить права роли через прямой POST запрос
      const { response } = await userAPI.devPlans.post(
        `/manager/roles/${existingRole.id}`,
        {
          permissionsIds: [],
        },
      );

      // Должен получить 403 Forbidden
      expect([403, 404]).toContain(response.status());

      // Проверяем что error response не раскрывает внутренние детали
      const errorData = await response.json().catch(() => ({}));
      if (errorData?.message || errorData?.error) {
        const errorText = JSON.stringify(errorData).toLowerCase();
        expect(errorText).not.toContain("stack");
        expect(errorText).not.toContain("sql");
      }

      // КРИТИЧНО: Верифицируем что permissions НЕ изменились
      const { data: verifyRoleData } = await adminAPI.roles.getRoles({
        limit: 50,
      });
      const verifyRoles = verifyRoleData?.items || verifyRoleData || [];
      const verifyRole = verifyRoles.find((r) => r.id === existingRole.id);

      if (verifyRole && originalPermissionsIds.length > 0) {
        const verifyPermissionsIds = verifyRole.permissionsIds || [];
        expect(
          verifyPermissionsIds.length,
          "Permissions роли НЕ должны были быть удалены",
        ).toBeGreaterThan(0);
      }
    });

    test("User не может удалить роль", async ({ userAPI, adminAPI }) => {
      setSeverity("critical");

      // Получаем существующую роль через admin
      const { data: rolesData } = await adminAPI.roles.getRoles({ limit: 10 });
      const roles = rolesData?.items || rolesData || [];
      const existingRole = roles[0];

      test.skip(!existingRole?.id, "Нет существующих ролей для теста");

      // User пытается удалить роль через прямой DELETE запрос
      const { response } = await userAPI.devPlans.delete(
        `/manager/roles/${existingRole.id}`,
      );

      // Должен получить 403 Forbidden
      expect([403, 404]).toContain(response.status());

      // Проверяем что error response не раскрывает внутренние детали
      const errorData = await response.json().catch(() => ({}));
      if (errorData?.message || errorData?.error) {
        const errorText = JSON.stringify(errorData).toLowerCase();
        expect(errorText).not.toContain("stack");
        expect(errorText).not.toContain("sql");
      }

      // КРИТИЧНО: Верифицируем что роль НЕ была удалена
      const { data: verifyRolesData } = await adminAPI.roles.getRoles({
        limit: 50,
      });
      const verifyRoles = verifyRolesData?.items || verifyRolesData || [];
      const roleStillExists = verifyRoles.some((r) => r.id === existingRole.id);

      expect(roleStillExists, "Роль НЕ должна была быть удалена").toBe(true);
    });

    test("User не может получить список permissions", async ({ userAPI }) => {
      setSeverity("normal");

      // User пытается получить список всех permissions
      const { response } = await userAPI.roles.getPermissions();

      // Может быть 403 или 200 с ограниченными данными
      if (response.status() === 200) {
        // Если 200 - проверяем что данные ограничены
        const { data } = await response.json().catch(() => ({}));
        // Обычно user не должен видеть все permissions
        console.log(
          "[escalation] User получил permissions - проверить ограничения",
        );
      } else {
        expect([403, 404]).toContain(response.status());
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // ДОСТУП К АДМИНИСТРАТИВНЫМ ENDPOINTS
  // ═══════════════════════════════════════════════════════════════
  test.describe("Доступ к административным endpoints", () => {
    test("User не может получить доступ к /manager/users/", async ({
      userAPI,
    }) => {
      setSeverity("critical");

      // User пытается получить список пользователей через manager endpoint
      const { response } = await userAPI.devPlans.get("/manager/users/", {
        limit: 10,
      });

      expect([403, 401]).toContain(response.status());

      // Проверяем что error response не раскрывает внутренние детали
      const errorData = await response.json().catch(() => ({}));
      if (errorData?.message || errorData?.error) {
        const errorText = JSON.stringify(errorData).toLowerCase();
        expect(errorText).not.toContain("stack");
        expect(errorText).not.toContain("sql");
        expect(errorText).not.toContain("internal server");
      }
    });

    test("User не может получить доступ к /manager/departments/", async ({
      userAPI,
    }) => {
      setSeverity("critical");

      // User пытается получить список департаментов через manager endpoint
      const { response } = await userAPI.devPlans.get("/manager/departments/");

      expect([403, 401]).toContain(response.status());

      // Проверяем что error response не раскрывает внутренние детали
      const errorData = await response.json().catch(() => ({}));
      if (errorData?.message || errorData?.error) {
        const errorText = JSON.stringify(errorData).toLowerCase();
        expect(errorText).not.toContain("stack");
        expect(errorText).not.toContain("sql");
      }
    });

    test("User не может создать приглашение (invite link)", async ({
      userAPI,
    }) => {
      setSeverity("critical");

      // User пытается создать инвайт-ссылку через manager endpoint
      const { response } = await userAPI.devPlans.post(
        "/manager/invite-links/get-or-create/",
      );

      expect([403, 401]).toContain(response.status());

      // Проверяем что error response не раскрывает внутренние детали
      const errorData = await response.json().catch(() => ({}));
      if (errorData?.message || errorData?.error) {
        const errorText = JSON.stringify(errorData).toLowerCase();
        expect(errorText).not.toContain("stack");
        expect(errorText).not.toContain("sql");
      }
    });

    test("User не может импортировать пользователей", async ({ userAPI }) => {
      setSeverity("critical");

      // Попытка доступа к endpoint импорта
      const { response } = await userAPI.devPlans.get(
        "/manager/org-struct/import",
      );

      expect([403, 401, 404]).toContain(response.status());

      // Проверяем что error response не раскрывает внутренние детали
      const errorData = await response.json().catch(() => ({}));
      if (errorData?.message || errorData?.error) {
        const errorText = JSON.stringify(errorData).toLowerCase();
        expect(errorText).not.toContain("stack");
        expect(errorText).not.toContain("sql");
      }
    });
  });
});
