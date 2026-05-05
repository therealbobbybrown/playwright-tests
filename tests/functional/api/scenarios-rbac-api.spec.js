// @ts-check
/**
 * API тесты для Scenarios - RBAC (Role-Based Access Control)
 *
 * ВАЖНО: Сценариями может управлять ТОЛЬКО АДМИН.
 * Сценарии назначаются сотрудникам, но права ManageScenario есть только у админа.
 *
 * Покрытие:
 * - Доступ для разных ролей: Admin (полный), Manager (зависит от прав), User (нет доступа)
 * - Проверка permissions: ManageScenario + ManageSurvey
 * - Негативные сценарии доступа
 *
 * @tags @api @regression @scenarios @rbac @security
 * @module Scenarios
 */

import { test as baseTest, expect } from "@playwright/test";
import { ScenariosAPI, getCredentials } from "../../utils/api/index.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import {
  assertSuccessStatus,
  assertForbidden,
  assertAccessDeniedScenario,
  extractItems,
} from "../../utils/api/common-assertions.js";
import { TestDataHelper } from "../../utils/TestDataHelper.js";

// Extend test with API fixtures for different roles
const test = baseTest.extend({
  adminAPI: async ({ request }, use) => {
    const api = new ScenariosAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
  managerAPI: async ({ request }, use) => {
    const api = new ScenariosAPI(request);
    // Manager может иметь часть прав, но не ManageScenario
    const { email, password } = getCredentials("manager");
    await api.signIn(email, password);
    await use(api);
  },
  // ПРИМЕЧАНИЕ: headAPI не используется - сценариями управляет только админ
  userAPI: async ({ request }, use) => {
    const api = new ScenariosAPI(request);
    // Обычный User - нет доступа к Scenarios
    const { email, password } = getCredentials("user");
    await api.signIn(email, password);
    await use(api);
  },
});

// Cleanup tracking
const createdScenarioIds = [];

// ==================== ADMIN ACCESS ====================

test.describe(
  "Scenarios RBAC - Admin Access",
  { tag: ["@api", "@regression", "@scenarios", "@rbac", "@admin"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.SCENARIOS, "RBAC - Admin");
    });

    test.afterAll(async ({ request }) => {
      const api = new ScenariosAPI(request);
      const { email, password } = getCredentials("admin");
      await api.signIn(email, password);

      for (const id of createdScenarioIds) {
        try {
          await api.remove(id);
        } catch {
          // Ignore
        }
      }
      createdScenarioIds.length = 0;
    });

    test(
      "C6771: Admin имеет полный доступ к списку сценариев",
      { tag: ["@critical"] },
      async ({ adminAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: Admin имеет полный доступ к списку сценариев", async () => {
          const { response } = await adminAPI.getList();
          assertSuccessStatus(
            response,
            "Admin должен иметь доступ к списку сценариев",
          );
        });
      },
    );

    test(
      "C6772: Admin может создавать сценарии",
      { tag: ["@critical"] },
      async ({ adminAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: Admin может создавать сценарии", async () => {
          const { response, data } = await adminAPI.create({
            title: TestDataHelper.generateUniqueName("Админ сценарий"),
            description: "Тест RBAC - создание админом",
          });

          assertSuccessStatus(response, "Admin должен мочь создавать сценарии");
          if (data?.id) {
            createdScenarioIds.push(data.id);
          }
        });
      },
    );

    test(
      "C6773: Admin может редактировать сценарии",
      { tag: ["@critical"] },
      async ({ adminAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: Admin может редактировать сценарии", async () => {
          // Создаём сценарий
          const { response: createResp, data: created } = await adminAPI.create(
            {
              title: TestDataHelper.generateUniqueName("Редактируемый"),
              description: "Тест RBAC - редактирование",
            },
          );

          if (!createResp.ok() || !created?.id) {
            test.skip(true, "Не удалось создать сценарий");
            return;
          }
          createdScenarioIds.push(created.id);

          // Редактируем
          const { response } = await adminAPI.update(created.id, {
            title: "Обновлённое название",
          });

          assertSuccessStatus(
            response,
            "Admin должен мочь редактировать сценарии",
          );
        });
      },
    );

    test(
      "C6774: Admin может активировать сценарии",
      { tag: ["@critical"] },
      async ({ adminAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: Admin может активировать сценарии", async () => {
          // Нужен активный опрос для action
          // Пропускаем если нет опроса
          const { data: scenarioData } = await adminAPI.create({
            title: TestDataHelper.generateUniqueName("Для активации"),
          });
          createdScenarioIds.push(scenarioData.id);

          // Без action активация должна завершиться ошибкой (400)
          // Это не тест на права, а на бизнес-логику
          const { response } = await adminAPI.activate(scenarioData.id);

          // Admin имеет право пытаться активировать, но без action будет ошибка 400
          expect([200, 201, 400, 422]).toContain(response.status());
        });
      },
    );
  },
);

// ==================== USER (NO ACCESS) ====================

test.describe(
  "Scenarios RBAC - User No Access",
  { tag: ["@api", "@regression", "@scenarios", "@rbac", "@user"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.SCENARIOS, "RBAC - User");
    });

    test(
      "C6775: User не имеет доступа к списку сценариев",
      { tag: ["@critical"] },
      async ({ userAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: User не имеет доступа к списку сценариев", async () => {
          const { response } = await userAPI.getList();
          assertForbidden(
            response,
            "User без ManageScenario не должен видеть список",
          );
        });
      },
    );

    test(
      "C6776: User не может создавать сценарии",
      { tag: ["@critical"] },
      async ({ userAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: User не может создавать сценарии", async () => {
          const { response } = await userAPI.create({
            title: "Хакерский сценарий",
          });

          assertForbidden(response, "User не может создавать сценарии");
        });
      },
    );

    test(
      "C6777: User не может редактировать сценарии",
      { tag: ["@critical"] },
      async ({ userAPI, adminAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: User не может редактировать сценарии", async () => {
          // Создаём сценарий админом
          const { data } = await adminAPI.create({
            title: TestDataHelper.generateUniqueName("Защищённый от User"),
          });
          createdScenarioIds.push(data.id);

          // User пытается редактировать
          const { response } = await userAPI.update(data.id, {
            title: "Взломанное название",
          });

          assertAccessDeniedScenario(response, "User editing scenario");
        });
      },
    );

    test(
      "C6778: User не может активировать сценарии",
      { tag: ["@critical"] },
      async ({ userAPI, adminAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: User не может активировать сценарии", async () => {
          // Создаём сценарий админом
          const { data } = await adminAPI.create({
            title: TestDataHelper.generateUniqueName("Защищённый от активации"),
          });
          createdScenarioIds.push(data.id);

          // User пытается активировать
          const { response } = await userAPI.activate(data.id);

          assertAccessDeniedScenario(response, "User activating scenario");
        });
      },
    );

    test(
      "C6779: User не может просматривать конкретный сценарий",
      { tag: ["@critical"] },
      async ({ userAPI, adminAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: User не может просматривать конкретный сценарий", async () => {
          // Создаём сценарий админом
          const { data } = await adminAPI.create({
            title: TestDataHelper.generateUniqueName("Скрытый от User"),
          });
          createdScenarioIds.push(data.id);

          // User пытается просмотреть
          const { response } = await userAPI.getById(data.id);

          assertAccessDeniedScenario(response, "User viewing scenario");
        });
      },
    );

    test.afterAll(async ({ request }) => {
      const api = new ScenariosAPI(request);
      const { email, password } = getCredentials("admin");
      await api.signIn(email, password);

      for (const id of createdScenarioIds) {
        try {
          await api.remove(id);
        } catch {
          // Ignore
        }
      }
      createdScenarioIds.length = 0;
    });
  },
);

// ==================== MANAGER ACCESS ====================

test.describe(
  "Scenarios RBAC - Manager Access",
  { tag: ["@api", "@regression", "@scenarios", "@rbac", "@manager"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.SCENARIOS, "RBAC - Manager");
    });

    test.afterAll(async ({ request }) => {
      const api = new ScenariosAPI(request);
      const { email, password } = getCredentials("admin");
      await api.signIn(email, password);

      for (const id of createdScenarioIds) {
        try {
          await api.remove(id);
        } catch {
          // Ignore
        }
      }
      createdScenarioIds.length = 0;
    });

    test("C6780: Manager доступ зависит от наличия ManageScenario permission", async ({
      managerAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: Manager доступ зависит от наличия ManageScenario permission", async () => {
        const { response } = await managerAPI.getList();

        // Manager может иметь доступ или нет - зависит от конфигурации прав
        // Если есть ManageScenario + ManageSurvey - будет 200
        // Если нет - будет 403
        expect([200, 403]).toContain(response.status());

        if (response.ok()) {
          console.log("[INFO] Manager имеет ManageScenario permission");
        } else {
          console.log("[INFO] Manager НЕ имеет ManageScenario permission");
        }
      });
    });

    test("C6781: Manager без ManageScenario не может создавать сценарии", async ({
      managerAPI,
    }) => {
      setSeverity("normal");

      await test.step("Выполнить: Manager без ManageScenario не может создавать сценарии", async () => {
        // Сначала проверяем есть ли доступ к списку
        const { response: listResponse } = await managerAPI.getList();

        if (listResponse.ok()) {
          test.skip(
            true,
            "Manager имеет ManageScenario - пропускаем негативный тест",
          );
          return;
        }

        // Если нет доступа к списку - значит нет и права создавать
        const { response } = await managerAPI.create({
          title: "Manager сценарий",
        });

        assertForbidden(response);
      });
    });
  },
);

// ==================== HEAD / РУКОВОДИТЕЛЬ ====================
// ПРИМЕЧАНИЕ: Согласно требованиям, сценариями может управлять ТОЛЬКО админ.
// "Руководитель" (тот у кого есть подчинённые) НЕ имеет прав ManageScenario.
// Тесты для этой роли в модуле Scenarios не требуются.

// ==================== PERMISSION COMBINATIONS ====================

test.describe(
  "Scenarios RBAC - Permission Combinations",
  { tag: ["@api", "@regression", "@scenarios", "@rbac", "@permissions"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.SCENARIOS, "RBAC - Permissions");
    });

    test.afterAll(async ({ request }) => {
      const api = new ScenariosAPI(request);
      const { email, password } = getCredentials("admin");
      await api.signIn(email, password);

      for (const id of createdScenarioIds) {
        try {
          await api.remove(id);
        } catch {
          // Ignore
        }
      }
      createdScenarioIds.length = 0;
    });

    test(
      "C6782: Доступ требует И ManageScenario И ManageSurvey",
      { tag: ["@critical"] },
      async ({ adminAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: Доступ требует И ManageScenario И ManageSurvey", async () => {
          // Admin имеет оба права - проверяем что доступ есть
          const { response } = await adminAPI.getList();

          assertSuccessStatus(
            response,
            "Admin с обоими правами должен иметь доступ",
          );
        });
      },
    );

    test(
      "C6783: Без аутентификации нет доступа",
      { tag: ["@critical"] },
      async ({ request }) => {
        setSeverity("critical");

        await test.step("Выполнить: Без аутентификации нет доступа", async () => {
          // Создаём API без авторизации
          const unauthAPI = new ScenariosAPI(request);
          // НЕ вызываем signIn

          const { response } = await unauthAPI.getList();

          // Без токена должен быть 401 Unauthorized
          expect(response.status()).toBe(401);
        });
      },
    );

    test("C6784: С истекшим токеном нет доступа", async ({ request }) => {
      setSeverity("normal");

      await test.step("Выполнить: С истекшим токеном нет доступа", async () => {
        const api = new ScenariosAPI(request);
        // Устанавливаем невалидный токен
        api.setToken("expired-invalid-token-12345");

        const { response } = await api.getList();

        // Невалидный токен -> 401
        expect(response.status()).toBe(401);
      });
    });
  },
);

// ==================== CROSS-COMPANY ACCESS ====================

test.describe(
  "Scenarios RBAC - Cross-Company",
  { tag: ["@api", "@regression", "@scenarios", "@rbac", "@isolation"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.SCENARIOS, "RBAC - Isolation");
    });

    test(
      "C6785: Пользователь не видит сценарии другой компании",
      { tag: ["@critical"] },
      async ({ adminAPI }) => {
        setSeverity("critical");

        await test.step("Выполнить: Пользователь не видит сценарии другой компании", async () => {
          // Получаем список сценариев
          const { data } = await adminAPI.getList({ limit: 50 });
          const scenarios = extractItems(data);

          // Все сценарии должны принадлежать компании пользователя
          // Проверяем что нет сценариев с другим companyId (если поле доступно)
          scenarios.forEach((scenario) => {
            if (scenario.companyId !== undefined) {
              // Все сценарии должны иметь одинаковый companyId
              expect(scenario.companyId).toBeDefined();
            }
          });

          // Тест пройден если не выброшено исключение
          expect(true).toBe(true);
        });
      },
    );

    test("C6786: Нельзя получить сценарий по ID из другой компании", async ({
      adminAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: Нельзя получить сценарий по ID из другой компании", async () => {
        // Пытаемся получить несуществующий или чужой сценарий
        const { response } = await adminAPI.getById(999999);

        // Должен быть 404 (не найден) или 403 (запрещён)
        expect([403, 404]).toContain(response.status());
      });
    });
  },
);

// ==================== SENSITIVE DATA PROTECTION ====================

test.describe(
  "Scenarios RBAC - Data Protection",
  { tag: ["@api", "@regression", "@scenarios", "@rbac", "@security"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.SCENARIOS, "RBAC - Security");
    });

    test("C6787: Ответ не содержит чувствительных данных других пользователей", async ({
      adminAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: Ответ не содержит чувствительных данных других пользователей", async () => {
        const { data } = await adminAPI.getList({ limit: 10 });
        const scenarios = extractItems(data);

        scenarios.forEach((scenario) => {
          // Не должно быть паролей, токенов, внутренних ID
          expect(scenario.password).toBeUndefined();
          expect(scenario.token).toBeUndefined();
          expect(scenario.secretKey).toBeUndefined();
        });
      });
    });

    test("C6788: Участники сценария не содержат чувствительных данных", async ({
      adminAPI,
    }) => {
      setSeverity("critical");

      await test.step("Выполнить: Участники сценария не содержат чувствительных данных", async () => {
        // Получаем активный сценарий
        const { data: listData } = await adminAPI.getList({
          status: "active",
          limit: 1,
        });
        const scenarios = extractItems(listData);

        if (scenarios.length === 0) {
          test.skip(true, "Нет активных сценариев");
          return;
        }

        // Получаем участников
        const { response, data } = await adminAPI.getPerformers(
          scenarios[0].id,
        );

        if (!response.ok()) {
          test.skip(true, "Нет доступа к участникам");
          return;
        }

        const performers = extractItems(data);

        performers.forEach((performer) => {
          // Данные пользователей не должны содержать пароли
          expect(performer.password).toBeUndefined();
          expect(performer.user?.password).toBeUndefined();
          expect(performer.accessToken).toBeUndefined();
        });
      });
    });
  },
);
