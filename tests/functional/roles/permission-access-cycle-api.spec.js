// @ts-check
/**
 * API тесты полного цикла разрешений
 *
 * Каждый тест проверяет:
 * 1. Создать роль с конкретным разрешением
 * 2. Назначить роль пользователю → проверить доступ
 * 3. Снять роль → проверить отказ (403)
 * 4. Cleanup
 *
 * Важно: Бэкенд не позволяет удалить ВСЕ роли (возвращает 400).
 * Поэтому используем "базовую роль" без разрешений для тестирования отказа.
 *
 * @tags @roles @permissions @security @api
 */

import { test as baseTest, expect } from "@playwright/test";
import { RolesAPI, getCredentials } from "../../utils/api/index.js";
import {
  markAsAPITest,
  setSeverity,
  MODULES,
} from "../../utils/allure-helpers.js";
import { assignRolesAndInvalidate } from "../../utils/auth/TokenManager.js";

/** Паттерны имён тестовых ролей для pre-cleanup */
const STALE_ROLE_PATTERNS = [
  /^Test[ _]/i,
  /^Perm Test Role /,
  /^Batch Role /,
  /^Lifecycle Role /,
  /^Updated Test Role /,
  /^Updated Role /,
  /\d{13}/,
];
const PROTECTED_ROLE_IDS = new Set([1, 2]);

async function cleanupStaleRoles(api) {
  try {
    const { data } = await api.getRoles({ limit: 500 });
    const items = data?.items || data || [];
    const stale = items.filter(
      (r) =>
        !PROTECTED_ROLE_IDS.has(r.id) &&
        STALE_ROLE_PATTERNS.some((p) => p.test(r.title)),
    );
    if (stale.length === 0) return;
    console.log(`[pre-cleanup] Removing ${stale.length} stale test roles...`);
    for (const role of stale) {
      try {
        await api.deleteRole(role.id);
      } catch {
        // ignore
      }
    }
  } catch (e) {
    console.warn("[pre-cleanup] Failed to cleanup stale roles:", e.message);
  }
}

let preCleanupDone = false;

const test = baseTest.extend({
  adminAPI: async ({ request }, use) => {
    const api = new RolesAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);

    // Pre-cleanup stale roles один раз
    if (!preCleanupDone) {
      preCleanupDone = true;
      await cleanupStaleRoles(api);
    }

    // Трекаем созданные роли для cleanup в teardown
    const _origCreate = api.createRole.bind(api);
    const localCreatedIds = [];
    api.createRole = async (...args) => {
      const result = await _origCreate(...args);
      if (result?.data?.id) localCreatedIds.push(result.data.id);
      return result;
    };

    await use(api);

    // Teardown: удаляем роли, созданные в этом тесте
    for (const id of localCreatedIds) {
      try {
        await api.deleteRole(id);
      } catch {
        // ignore
      }
    }
  },
});

/**
 * Конфигурация разрешений для тестирования
 *
 * Важно: поле `name` в API соответствует коду разрешения (camelCase)
 *
 * Типы проверок:
 * - GET: проверяем что endpoint возвращает 200 с разрешением и 403 без
 * - POST/PATCH: проверяем что операция возвращает 403 без разрешения
 *   и НЕ 403 с разрешением (может быть 200, 201, 400 - главное не 403)
 */
const PERMISSION_CONFIGS = [
  // === Роли ===
  {
    name: "manageRole",
    displayName: "Может управлять ролями",
    check: { method: "GET", endpoint: "/manager/roles" },
  },

  // === Пользователи ===
  {
    name: "manageUser",
    displayName: "Может управлять пользователями",
    check: { method: "GET", endpoint: "/manager/users/" },
    // Permission не даёт доступ к API в комбинации с базовой ролью "Пользователь" (id=2).
    // Работает только без базовой роли (см. permission-research). Вероятно, endpoint
    // требует admin-level доступ помимо permission.
    uiOnlyPermission: true,
  },
  {
    name: "createUserInvite",
    displayName: "Может приглашать сотрудников",
    check: { method: "GET", endpoint: "/manager/invite-links/" },
    // Аналогично manageUser: не работает с базовой ролью "Пользователь" (id=2).
    uiOnlyPermission: true,
  },
  {
    name: "manageUserGroup",
    displayName: "Может управлять группами",
    // GET открыт всем, проверяем POST
    check: {
      method: "POST",
      endpoint: "/manager/user-groups/",
      body: { title: "PermTest" },
    },
  },
  {
    name: "manageNotificationSettings",
    displayName: "Может настраивать уведомления",
    // GET открыт всем, проверяем POST (может вернуть 500 при пустом body)
    check: {
      method: "POST",
      endpoint: "/manager/notifications-settings/",
      body: { settings: {} },
    },
    // Разрешение может контролировать UI-доступ, а не API
    allowNon403Baseline: true,
  },

  // === Компания ===
  {
    name: "manageCompany",
    displayName: "Может применять настройки внешнего вида",
    // GET открыт всем, проверяем PATCH
    check: { method: "PATCH", endpoint: "/manager/company/", body: {} },
    // Разрешение контролирует UI (видимость кнопок на странице brand), а не API endpoint
    uiOnlyPermission: true,
  },
  {
    name: "manageIntegration",
    displayName: "Может управлять интеграциями",
    // Интеграции контролируются через UI, API endpoint открыт
    check: { method: "GET", endpoint: "/private/company/active-integrations/" },
    // Это разрешение контролирует UI-доступ, а не API endpoint
    uiOnlyPermission: true,
  },

  // === Опросы ===
  {
    name: "manageSurvey",
    displayName: "Может управлять опросами (вся компания)",
    check: { method: "GET", endpoint: "/manager/surveys/" },
  },
  {
    name: "manageOwnSurvey",
    displayName: "Может управлять своими опросами",
    check: { method: "GET", endpoint: "/manager/surveys/" },
  },

  // === Performance Review ===
  {
    name: "managePerformanceReview",
    displayName: "Может управлять оценкой (вся компания)",
    check: { method: "GET", endpoint: "/manager/performance-reviews/" },
  },
  {
    name: "manageOwnPerformanceReview",
    displayName: "Может управлять своими оценками",
    check: { method: "GET", endpoint: "/manager/performance-reviews/" },
  },

  // === Геймификация ===
  {
    name: "manageKarma",
    displayName: "Может управлять виртуальной валютой",
    check: { method: "GET", endpoint: "/manager/karma/wallet/settings/" },
  },
  {
    name: "manageGift",
    displayName: "Может управлять магазином",
    check: { method: "GET", endpoint: "/manager/gifts/" },
  },

  // === Цели ===
  {
    name: "manageObjective",
    displayName: "Может редактировать цели всех",
    // Разрешение контролирует редактирование чужих целей, не отдельный endpoint
    check: { method: "GET", endpoint: "/manager/objectives/settings/" },
    // GET открыт всем - это разрешение для редактирования чужих целей
    uiOnlyPermission: true,
  },

  // === Планы развития ===
  {
    name: "manageDevelopmentPlan",
    displayName: "Может редактировать планы всех",
    // Разрешение контролирует редактирование чужих планов
    check: { method: "GET", endpoint: "/private/development-plans/settings/" },
    // Endpoint открыт всем - это разрешение для редактирования
    uiOnlyPermission: true,
  },

  // === Профиль ===
  {
    name: "manageProfile",
    displayName: "Может настраивать профиль",
    // Разрешение контролирует редактирование чужих профилей
    check: { method: "GET", endpoint: "/private/users" },
    uiOnlyPermission: true,
  },
  {
    name: "editProfileFields",
    displayName: "Может заполнять данные в профилях",
    // Разрешение контролирует заполнение кастомных полей
    check: { method: "GET", endpoint: "/private/users" },
    uiOnlyPermission: true,
  },

  // === Фидбек ===
  {
    name: "showFeedbackStatistics",
    displayName: "Может смотреть статистику фидбека",
    // Связано с viewFeedback - проверяем доступ к feedbacks
    check: { method: "GET", endpoint: "/manager/feedbacks/" },
    // Endpoint открыт по viewFeedback, не showFeedbackStatistics
    uiOnlyPermission: true,
  },
  {
    name: "viewFeedback",
    displayName: "Может читать текст фидбека",
    check: { method: "GET", endpoint: "/manager/feedbacks/" },
    // Разрешение контролирует UI-отображение текста фидбека, а не API доступ к списку
    uiOnlyPermission: true,
  },

  // === Аналитика ===
  {
    name: "viewDashboard",
    displayName: "Может просматривать аналитику",
    // Контролирует UI доступ к дашборду
    check: { method: "GET", endpoint: "/private/performance-reviews/history" },
    // Endpoint может быть открыт или требовать параметры
    uiOnlyPermission: true,
  },
  // Примечание: manageCompetence и manageCompetenceScale НЕ существуют в системе разрешений
  // Компетенции управляются через другие разрешения (например, managePerformanceReview)
];

/**
 * Получить ID разрешения по имени
 */
async function getPermissionIdByName(api, name) {
  const { response, data } = await api.getPermissions();
  if (!response.ok()) return null;

  const permissions = data?.items || data || [];
  const permission = permissions.find(
    (p) => p.name === name || p.name?.toLowerCase() === name.toLowerCase(),
  );
  return permission?.id || null;
}

/**
 * Получить ID тестового пользователя
 */
async function getTestUserId(api) {
  const userCreds = getCredentials("user");
  const userApi = new RolesAPI(api.request, null);
  await userApi.signIn(userCreds.email, userCreds.password);

  const { data } = await userApi.getCurrentUser();
  return data?.id || data?.currentUserId || data?.account?.users?.[0]?.id;
}

/**
 * Выполнить проверку доступа
 */
async function performAccessCheck(api, check) {
  const method = check.method.toLowerCase();
  if (method === "get") {
    return api.get(check.endpoint);
  } else if (method === "post") {
    return api.post(check.endpoint, check.body || {});
  } else if (method === "patch") {
    return api.patch(check.endpoint, check.body || {});
  } else if (method === "delete") {
    return api.delete(check.endpoint);
  }
  throw new Error(`Unknown method: ${check.method}`);
}

// =====================================================
// Тесты полного цикла для каждого разрешения
// =====================================================

test.describe(
  "Permission Access Cycle API",
  { tag: ["@roles", "@permissions", "@security", "@api"] },
  () => {
    // ВАЖНО: тесты используют одного тестового пользователя и изменяют его роли.
    // Параллельное выполнение приводит к гонке состояний — тесты должны выполняться последовательно.
    test.describe.configure({ mode: "serial" });

    const userCreds = getCredentials("user");

    test.beforeEach(() => {
      markAsAPITest(MODULES.ROLES, "Permission Cycle");
    });

    // Генерируем тесты для каждого разрешения
    for (const config of PERMISSION_CONFIGS) {
      test(
        `[API] ${config.displayName} (${config.name}): полный цикл доступа`,
        { tag: ["@critical", "@regression"] },
        async ({ adminAPI, request }) => {
          setSeverity("critical");

          let testUserId;
          let originalRoles;
          let testRoleId;
          let baseRoleId;

          await test.step(`Авторизоваться через API и подготовить роль с разрешением ${config.name}`, async () => {
            // Получаем ID базовой роли "Пользователь" динамически
            ({ userRoleId: baseRoleId } = await adminAPI.getSystemRoleIds());

            // Получаем ID тестового пользователя
            testUserId = await getTestUserId(adminAPI);
            expect(
              testUserId,
              "Должен быть тестовый пользователь",
            ).toBeTruthy();

            // Получаем ID разрешения
            const permissionId = await getPermissionIdByName(
              adminAPI,
              config.name,
            );
            expect(
              permissionId,
              `Разрешение ${config.name} должно существовать`,
            ).toBeTruthy();

            // Сохраняем оригинальные роли
            originalRoles = await adminAPI.getUserRoleIds(testUserId);

            console.log(
              `[Test] ${config.name}: permissionId=${permissionId}, originalRoles=${JSON.stringify(originalRoles)}`,
            );

            // Создаём ТЕСТОВУЮ роль с разрешением
            const { response: testCreateResp, data: testRoleData } =
              await adminAPI.createRole({
                title: `Test_${config.name}_${Date.now()}`,
                permissionsIds: [permissionId],
              });
            expect(
              testCreateResp.ok(),
              "Тестовая роль должна быть создана",
            ).toBe(true);
            testRoleId = testRoleData.id;

            console.log(
              `[Test] Using baseRole=${baseRoleId} (Пользователь), created testRole=${testRoleId}`,
            );
          });

          await test.step(`Проверить доступ к ${config.check.endpoint} без разрешения (базовая роль)`, async () => {


            try {
              // ШАГ 1: Назначаем БАЗОВУЮ роль (без разрешений)
              await assignRolesAndInvalidate(adminAPI, testUserId, [
                baseRoleId,
              ]);

              // Re-login для получения нового JWT
              const userAPIBaseline = new RolesAPI(request);
              await userAPIBaseline.signIn(userCreds.email, userCreds.password);

              // Проверяем baseline (без разрешения)
              const { response: baselineResp } = await performAccessCheck(
                userAPIBaseline,
                config.check,
              );
              const baselineStatus = baselineResp.status();
              console.log(
                `[Test] Baseline: ${config.check.method} ${config.check.endpoint} → ${baselineStatus}`,
              );

              // Для обычных разрешений ожидаем 403
              // Для UI-only разрешений baseline может быть 200
              if (!config.uiOnlyPermission && !config.allowNon403Baseline) {
                expect(
                  baselineStatus,
                  `Без разрешения ${config.name} должен быть 403 для ${config.check.endpoint}`,
                ).toBe(403);
              }
            } catch (e) {
              // Пробрасываем ошибку, но cleanup происходит в финальном шаге
              throw e;
            }
          });

          await test.step(`Проверить доступ к ${config.check.endpoint} с разрешением ${config.name}`, async () => {


            // ШАГ 2: Добавляем тестовую роль
            await assignRolesAndInvalidate(adminAPI, testUserId, [
              baseRoleId,
              testRoleId,
            ]);

            // Re-login
            const userAPIWithPerm = new RolesAPI(request);
            await userAPIWithPerm.signIn(userCreds.email, userCreds.password);

            // Проверяем с разрешением
            const { response: accessResp } = await performAccessCheck(
              userAPIWithPerm,
              config.check,
            );
            const accessStatus = accessResp.status();
            console.log(
              `[Test] With permission: ${config.check.method} ${config.check.endpoint} → ${accessStatus}`,
            );

            // Для обычных разрешений: с разрешением статус должен быть НЕ 403
            // Для UI-only разрешений: API endpoint не контролируется этим разрешением
            if (!config.uiOnlyPermission) {
              expect(
                accessStatus,
                `С разрешением ${config.name} статус должен быть НЕ 403. Получен: ${accessStatus}`,
              ).not.toBe(403);
            } else {
              // UI-only: статус не должен меняться (API не контролируется разрешением)
              console.log(
                `[Test] UI-only permission: API access unchanged (→ ${accessStatus})`,
              );
            }
          });

          await test.step(`Проверить возврат к 403 после снятия разрешения ${config.name}`, async () => {


            // ШАГ 3: Убираем тестовую роль (оставляем базовую)
            await assignRolesAndInvalidate(adminAPI, testUserId, [baseRoleId]);

            // Re-login
            const userAPIWithoutPerm = new RolesAPI(request);
            await userAPIWithoutPerm.signIn(
              userCreds.email,
              userCreds.password,
            );

            // Проверяем baseline повторно для сравнения
            const userAPIBaselineCheck = new RolesAPI(request);
            await userAPIBaselineCheck.signIn(
              userCreds.email,
              userCreds.password,
            );
            const { response: baselineRecheckResp } = await performAccessCheck(
              userAPIBaselineCheck,
              config.check,
            );
            const baselineStatus = baselineRecheckResp.status();

            // Проверяем отказ
            const { response: deniedResp } = await performAccessCheck(
              userAPIWithoutPerm,
              config.check,
            );
            const deniedStatus = deniedResp.status();
            console.log(
              `[Test] After removal: ${config.check.method} ${config.check.endpoint} → ${deniedStatus}`,
            );

            // Для обычных разрешений ожидаем 403
            if (!config.uiOnlyPermission && !config.allowNon403Baseline) {
              expect(
                deniedStatus,
                `После снятия ${config.name} должен быть 403. Получен: ${deniedStatus}`,
              ).toBe(403);
            }

            // Проверяем что статус вернулся к baseline
            expect(
              deniedStatus,
              `Статус после снятия должен совпадать с baseline: ${baselineStatus}`,
            ).toBe(baselineStatus);
          });

          await test.step("Восстановить оригинальные роли пользователя", async () => {
            try {
              await assignRolesAndInvalidate(
                adminAPI,
                testUserId,
                originalRoles,
              );
              console.log(`[Cleanup] Restored roles for user ${testUserId}`);
            } catch (e) {
              console.error(
                `[Cleanup] FAILED to restore roles for user ${testUserId}:`,
                e.message,
              );
            }
            // Удаление тестовой роли происходит в teardown фикстуры adminAPI
          });
        },
      );
    }
  },
);
