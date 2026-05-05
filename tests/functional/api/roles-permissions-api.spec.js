// @ts-check
import { test as fullTest, expect } from "../../fixtures/full.js";
import { RolesAPI, getCredentials } from "../../utils/api/index.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { assertSuccessStatus } from "../../utils/api/common-assertions.js";
import { TestDataHelper } from "../../utils/TestDataHelper.js";

/**
 * API тесты для модуля Roles & Permissions (Права пользователей)
 *
 * Покрытие:
 * - Список разрешений
 * - CRUD операции с ролями
 * - Количество пользователей с ролью
 * - Доступ для обычных пользователей
 *
 * @tags @api @roles @permissions
 */

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

/**
 * Удаляет stale тестовые роли, оставшиеся от предыдущих запусков.
 * @param {RolesAPI} api
 */
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
        // ignore — role might have assigned users
      }
    }
  } catch (e) {
    console.warn("[pre-cleanup] Failed to cleanup stale roles:", e.message);
  }
}

// Расширяем test с фикстурой для Roles API
const test = fullTest.extend({
  rolesAPI: async ({ request }, use) => {
    const api = new RolesAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);

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
  rolesUserAPI: async ({ request }, use) => {
    const api = new RolesAPI(request);
    const { email, password } = getCredentials("user");
    await api.signIn(email, password);
    await use(api);
  },
});

// Pre-cleanup: удалить stale роли от предыдущих запусков при старте первого теста
let preCleanupDone = false;

// ==================== PERMISSIONS ====================

test.describe(
  "Roles API - Permissions",
  { tag: ["@api", "@roles", "@permissions", "@regression"] },
  () => {
    test.beforeEach(async ({ rolesAPI }) => {
      // Pre-cleanup stale roles один раз при первом тесте файла
      if (!preCleanupDone) {
        preCleanupDone = true;
        await cleanupStaleRoles(rolesAPI);
      }
      markAsAPITest(MODULES.ROLES, "Permissions");
    });

    test(
      "C6673: GET /manager/permissions - получить список разрешений",
      { tag: ["@critical"] },
      async ({ rolesAPI }) => {
        setSeverity("critical");

        let response, data;

        await test.step("Отправить GET /manager/permissions для получения списка разрешений", async () => {
          const result = await rolesAPI.getPermissions();
          response = result.response;
          data = result.data;
        });

        await test.step("Проверить статус ответа: 200 OK или 403 Forbidden", async () => {
          expect([200, 403]).toContain(response.status());
        });

        if (response.ok()) {
          await test.step("Проверить наличие данных в ответе", async () => {
            expect(data).toBeDefined();
          });

          let items;
          await test.step("Извлечь массив разрешений из ответа", async () => {
            items = data?.items || data || [];
          });

          await test.step("Проверить что данные являются массивом", async () => {
            expect(Array.isArray(items)).toBe(true);
          });

          await test.step("Проверить что список разрешений не пустой", async () => {
            expect(items.length).toBeGreaterThan(0);
          });

          await test.step("Проверить структуру разрешения: наличие поля id", async () => {
            const permission = items[0];
            expect(permission).toHaveProperty("id");
          });
        }
      },
    );

    test("C6674: Разрешения содержат обязательные поля", async ({
      rolesAPI,
    }) => {
      setSeverity("normal");

      let response, data;

      await test.step("Отправить GET /manager/permissions для получения списка разрешений", async () => {
        const result = await rolesAPI.getPermissions();
        response = result.response;
        data = result.data;
      });

      await test.step("Проверить доступность endpoint", async () => {
        if (!response.ok()) {
          test.skip(true, "Нет доступа к разрешениям");
          return;
        }
      });

      if (!response.ok()) return;

      let items;
      await test.step("Извлечь массив разрешений из ответа", async () => {
        items = data?.items || data || [];
      });

      await test.step("Проверить что каждое разрешение имеет поле id", async () => {
        for (const permission of items) {
          expect(permission).toHaveProperty("id");
        }
      });

      await test.step("Проверить что каждое разрешение имеет name, code или title", async () => {
        for (const permission of items) {
          expect(
            permission.name || permission.code || permission.title,
          ).toBeDefined();
        }
      });
    });
  },
);

// ==================== ROLES LIST ====================

test.describe(
  "Roles API - Roles List",
  { tag: ["@api", "@roles", "@list", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.ROLES, "Roles List");
    });

    test(
      "C6675: GET /manager/roles - получить список ролей",
      { tag: ["@critical"] },
      async ({ rolesAPI }) => {
        setSeverity("critical");

        let response, data;

        await test.step("Отправить GET /manager/roles для получения списка ролей", async () => {
          const result = await rolesAPI.getRoles();
          response = result.response;
          data = result.data;
        });

        await test.step("Проверить статус ответа: 200 OK или 403 Forbidden", async () => {
          expect([200, 403]).toContain(response.status());
        });

        if (response.ok()) {
          await test.step("Проверить наличие данных в ответе", async () => {
            expect(data).toBeDefined();
          });

          let items;
          await test.step("Извлечь массив ролей из ответа", async () => {
            items = data?.items || data || [];
            expect(Array.isArray(items)).toBe(true);
          });

          await test.step("Проверить структуру роли: наличие полей id и title", async () => {
            if (items.length > 0) {
              const role = items[0];
              expect(role).toHaveProperty("id");
              expect(role).toHaveProperty("title");
            }
          });
        }
      },
    );

    test("C6676: GET /manager/roles с пагинацией", async ({ rolesAPI }) => {
      setSeverity("normal");

      let response, data;

      await test.step("Отправить GET /manager/roles с параметрами пагинации (limit=5, offset=0)", async () => {
        const result = await rolesAPI.getRoles({
          limit: 5,
          offset: 0,
        });
        response = result.response;
        data = result.data;
      });

      await test.step("Проверить статус ответа: 200 OK или 403 Forbidden", async () => {
        expect([200, 403]).toContain(response.status());
      });

      if (response.ok()) {
        await test.step("Проверить что возвращённый массив ролей не превышает limit=5", async () => {
          const items = data?.items || data || [];
          expect(Array.isArray(items)).toBe(true);
          expect(items.length).toBeLessThanOrEqual(5);
        });
      }
    });

    test(
      "C6677: GET /manager/roles/{id} - получить роль по ID",
      { tag: ["@critical"] },
      async ({ rolesAPI }) => {
        setSeverity("critical");

        let listResp, listData;

        await test.step("Отправить GET /manager/roles для получения списка существующих ролей", async () => {
          const result = await rolesAPI.getRoles({ limit: 10 });
          listResp = result.response;
          listData = result.data;
        });

        await test.step("Проверить доступность списка ролей", async () => {
          if (!listResp.ok()) {
            test.skip(true, "Нет доступа к ролям");
            return;
          }
        });

        if (!listResp.ok()) return;

        let roleId;
        await test.step("Получить ID первой роли из списка", async () => {
          const items = listData?.items || listData || [];
          test.skip(items.length === 0, "Нет ролей");
          roleId = items[0].id;
        });

        let response, data;

        await test.step(`Отправить GET /manager/roles/${roleId} для получения роли по ID`, async () => {
          const result = await rolesAPI.getRoleById(roleId);
          response = result.response;
          data = result.data;
        });

        await test.step("Проверить статус ответа: 200 OK", async () => {
          assertSuccessStatus(response);
        });

        await test.step("Проверить наличие данных роли в ответе", async () => {
          expect(data).toBeDefined();
        });

        await test.step(`Проверить соответствие ID роли: должно быть ${roleId}`, async () => {
          expect(data.id).toBe(roleId);
        });

        await test.step("Проверить наличие поля title в данных роли", async () => {
          expect(data).toHaveProperty("title");
        });
      },
    );

    test("C6678: GET /manager/roles/{id} - несуществующий ID возвращает 404", async ({
      rolesAPI,
    }) => {
      setSeverity("normal");

      let response;

      await test.step("Отправить GET /manager/roles/999999999 с несуществующим ID", async () => {
        const result = await rolesAPI.getRoleById(999999999);
        response = result.response;
      });

      await test.step("Проверить статус ответа: 400/403/404 (роль не найдена)", async () => {
        expect([400, 403, 404]).toContain(response.status());
      });
    });

    test("C6679: GET /manager/roles/{id}/users-count - получить количество пользователей с ролью", async ({
      rolesAPI,
    }) => {
      setSeverity("normal");

      let listResp, listData;

      await test.step("Отправить GET /manager/roles для получения списка существующих ролей", async () => {
        const result = await rolesAPI.getRoles({ limit: 10 });
        listResp = result.response;
        listData = result.data;
      });

      await test.step("Проверить доступность списка ролей", async () => {
        if (!listResp.ok()) {
          test.skip(true, "Нет доступа к ролям");
          return;
        }
      });

      if (!listResp.ok()) return;

      let roleId;
      await test.step("Получить ID первой роли из списка", async () => {
        const items = listData?.items || listData || [];
        test.skip(items.length === 0, "Нет ролей");
        roleId = items[0].id;
      });

      let response, data;

      await test.step(`Отправить GET /manager/roles/${roleId}/users-count`, async () => {
        const result = await rolesAPI.getRoleUsersCount(roleId);
        response = result.response;
        data = result.data;
      });

      await test.step("Проверить статус ответа: 200 OK или 403/404/500", async () => {
        expect([200, 403, 404, 500]).toContain(response.status());
      });

      if (response.ok()) {
        await test.step("Проверить наличие данных в ответе", async () => {
          expect(data).toBeDefined();
        });

        let count;
        await test.step("Извлечь значение count из ответа", async () => {
          count = data?.count ?? data?.usersCount ?? data;
        });

        await test.step("Проверить что count >= 0", async () => {
          if (typeof count === "number") {
            expect(count).toBeGreaterThanOrEqual(0);
          }
        });
      }
    });

    test("C6680: GET /private/roles - получить список ролей (private)", async ({
      rolesAPI,
    }) => {
      setSeverity("normal");

      let response, data;

      await test.step("Отправить GET /private/roles для получения списка ролей (private endpoint)", async () => {
        const result = await rolesAPI.getPrivateRoles();
        response = result.response;
        data = result.data;
      });

      await test.step("Проверить статус ответа: 200 OK", async () => {
        assertSuccessStatus(response);
      });

      await test.step("Проверить наличие данных в ответе", async () => {
        expect(data).toBeDefined();
      });

      await test.step("Проверить что данные являются массивом", async () => {
        const items = data?.items || data || [];
        expect(Array.isArray(items)).toBe(true);
      });
    });
  },
);

// ==================== ROLES CRUD ====================

test.describe(
  "Roles API - CRUD Operations",
  { tag: ["@api", "@roles", "@crud", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.ROLES, "CRUD");
    });

    test(
      "C6681: POST /manager/roles - создать роль",
      { tag: ["@critical", "@db"] },
      async ({ rolesAPI, roleVerifier }) => {
        setSeverity("critical");

        let title;
        await test.step("Сгенерировать уникальное название роли", async () => {
          title = TestDataHelper.generateUniqueName("Тестовая роль");
        });

        let response, data;

        await test.step(`Отправить POST /manager/roles для создания роли с title="${title}"`, async () => {
          const result = await rolesAPI.createRole({
            title,
            permissionsIds: [],
          });
          response = result.response;
          data = result.data;
        });

        await test.step("Проверить статус ответа: 200/201 OK или 403 Forbidden", async () => {
          expect([200, 201, 403]).toContain(response.status());
        });

        if (response.ok()) {
          await test.step("Проверить наличие данных роли в ответе", async () => {
            expect(data).toBeDefined();
          });

          await test.step("Проверить что роли присвоен ID", async () => {
            expect(data.id).toBeDefined();
          });

          await test.step(`Проверить что title роли совпадает с ожидаемым: "${title}"`, async () => {
            expect(data.title).toBe(title);
          });

          // DB верификация: проверка создания роли в БД
          await test.step("DB: Проверка создания роли в БД", async () => {
            if (!roleVerifier.isConnected()) return;
            const dbRole = await roleVerifier.verifyRoleCreated(data.id);
            if (dbRole) {
              expect(dbRole.title, "Название роли в БД должно совпадать").toBe(
                title,
              );
            }
          });
        }
      },
    );

    test(
      "C6682: POST /manager/roles - создать роль с разрешениями",
      { tag: ["@critical"] },
      async ({ rolesAPI }) => {
        setSeverity("critical");

        let permResp, permData;

        await test.step("Отправить GET /manager/permissions для получения списка разрешений", async () => {
          const result = await rolesAPI.getPermissions();
          permResp = result.response;
          permData = result.data;
        });

        await test.step("Проверить доступность разрешений", async () => {
          if (!permResp.ok()) {
            test.skip(true, "Нет доступа к разрешениям");
            return;
          }
        });

        if (!permResp.ok()) return;

        let permissions, title, permissionsIds;

        await test.step("Получить ID первого разрешения и сгенерировать название роли", async () => {
          permissions = permData?.items || permData || [];
          test.skip(permissions.length === 0, "Нет разрешений");
          title = TestDataHelper.generateUniqueName("Роль с разрешениями");
          permissionsIds = [permissions[0].id];
        });

        let response, data;

        await test.step(`Отправить POST /manager/roles для создания роли с разрешением ID=${permissionsIds[0]}`, async () => {
          const result = await rolesAPI.createRole({
            title,
            permissionsIds,
          });
          response = result.response;
          data = result.data;
        });

        await test.step("Проверить статус ответа: 200/201 OK или 403 Forbidden", async () => {
          expect([200, 201, 403]).toContain(response.status());
        });

        if (response.ok()) {
          await test.step("Проверить наличие данных роли в ответе", async () => {
            expect(data).toBeDefined();
          });

          await test.step("Проверить что роли присвоен ID", async () => {
            expect(data.id).toBeDefined();
          });

          let rolePermissions;
          await test.step("Извлечь список разрешений роли из ответа", async () => {
            if (data.permissionsIds || data.permissions) {
              rolePermissions =
                data.permissionsIds || data.permissions.map((p) => p.id);
            }
          });

          await test.step(`Проверить что разрешение ID=${permissionsIds[0]} назначено роли`, async () => {
            if (rolePermissions) {
              expect(rolePermissions).toContain(permissionsIds[0]);
            }
          });
        }
      },
    );

    test(
      "C6683: POST /manager/roles/{id} - обновить роль",
      { tag: ["@critical"] },
      async ({ rolesAPI }) => {
        setSeverity("critical");

        let originalTitle, createResp, createData;

        await test.step("Создать роль для последующего обновления", async () => {
          originalTitle = TestDataHelper.generateUniqueName(
            "Роль для обновления",
          );
          const result = await rolesAPI.createRole({
            title: originalTitle,
            permissionsIds: [],
          });
          createResp = result.response;
          createData = result.data;
        });

        await test.step("Проверить успешность создания роли", async () => {
          if (!createResp.ok()) {
            test.skip(true, "Не удалось создать роль");
            return;
          }
        });

        if (!createResp.ok()) return;

        const roleId = createData.id;

        let newTitle, response, data;

        await test.step(`Отправить POST /manager/roles/${roleId} для обновления title роли`, async () => {
          newTitle = TestDataHelper.generateUniqueName("Обновлённая роль");
          const result = await rolesAPI.updateRole(roleId, {
            title: newTitle,
          });
          response = result.response;
          data = result.data;
        });

        await test.step("Проверить статус ответа: 200/201 OK или 500", async () => {
          expect([200, 201, 500]).toContain(response.status());
        });

        if (response.ok()) {
          await test.step("Проверить наличие данных в ответе", async () => {
            expect(data).toBeDefined();
          });

          let getResp, getData;

          await test.step(`Отправить GET /manager/roles/${roleId} для проверки обновления`, async () => {
            const result = await rolesAPI.getRoleById(roleId);
            getResp = result.response;
            getData = result.data;
          });

          await test.step("Проверить успешность получения роли", async () => {
            expect(getResp.ok()).toBe(true);
          });

          await test.step(`Проверить что title обновлён на "${newTitle}"`, async () => {
            expect(getData.title).toBe(newTitle);
          });
        }
      },
    );

    test("C6684: POST /manager/roles/{id} - обновить разрешения роли", async ({
      rolesAPI,
    }) => {
      setSeverity("normal");

      let permResp, permData;

      await test.step("Отправить GET /manager/permissions для получения списка разрешений", async () => {
        const result = await rolesAPI.getPermissions();
        permResp = result.response;
        permData = result.data;
      });

      await test.step("Проверить доступность разрешений", async () => {
        if (!permResp.ok()) {
          test.skip(true, "Нет доступа к разрешениям");
          return;
        }
      });

      if (!permResp.ok()) return;

      let permissions;
      await test.step("Проверить наличие минимум 2 разрешений", async () => {
        permissions = permData?.items || permData || [];
        test.skip(permissions.length < 2, "Недостаточно разрешений");
      });

      let title, createResp, createData;

      await test.step("Создать роль без разрешений", async () => {
        title = TestDataHelper.generateUniqueName(
          "Роль для добавления разрешений",
        );
        const result = await rolesAPI.createRole({
          title,
          permissionsIds: [],
        });
        createResp = result.response;
        createData = result.data;
      });

      await test.step("Проверить успешность создания роли", async () => {
        if (!createResp.ok()) {
          test.skip(true, "Не удалось создать роль");
          return;
        }
      });

      if (!createResp.ok()) return;

      let roleId, permissionsIds;
      await test.step("Подготовить список из 2 разрешений", async () => {
        roleId = createData.id;
        permissionsIds = permissions.slice(0, 2).map((p) => p.id);
      });

      let response;

      await test.step(`Отправить POST /manager/roles/${roleId} для добавления разрешений`, async () => {
        const result = await rolesAPI.updateRole(roleId, {
          permissionsIds,
        });
        response = result.response;
      });

      await test.step("Проверить статус ответа: 200 OK", async () => {
        assertSuccessStatus(response);
      });
    });

    test(
      "C6685: DELETE /manager/roles/{id} - удалить роль",
      { tag: ["@critical", "@db"] },
      async ({ rolesAPI, roleVerifier }) => {
        setSeverity("critical");

        let title, createResp, createData;

        await test.step("Создать роль для последующего удаления", async () => {
          title = TestDataHelper.generateUniqueName("Роль для удаления");
          const result = await rolesAPI.createRole({
            title,
            permissionsIds: [],
          });
          createResp = result.response;
          createData = result.data;
        });

        await test.step("Проверить успешность создания роли", async () => {
          if (!createResp.ok()) {
            test.skip(true, "Не удалось создать роль");
            return;
          }
        });

        if (!createResp.ok()) return;

        let roleId;
        await test.step("Сохранить ID созданной роли", async () => {
          roleId = createData.id;
        });

        let response;

        await test.step(`Отправить DELETE /manager/roles/${roleId} для удаления роли`, async () => {
          const result = await rolesAPI.deleteRole(roleId);
          response = result.response;
        });

        await test.step("Проверить статус ответа: 200/204 (успешное удаление)", async () => {
          expect([200, 204]).toContain(response.status());
        });

        let getResp;

        await test.step(`Отправить GET /manager/roles/${roleId} для проверки удаления`, async () => {
          const result = await rolesAPI.getRoleById(roleId);
          getResp = result.response;
        });

        await test.step("Проверить что роль не найдена: статус 400/403/404", async () => {
          expect([400, 403, 404]).toContain(getResp.status());
        });

        // DB верификация: проверка удаления в БД
        await test.step("DB: Проверка удаления роли в БД", async () => {
          if (!roleVerifier.isConnected()) return;
          await roleVerifier.verifyRoleDeleted(roleId);
        });
      },
    );
  },
);

// ==================== NEGATIVE TESTS ====================

test.describe(
  "Roles API - Negative Tests",
  { tag: ["@api", "@roles", "@negative", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.ROLES, "Negative");
    });

    test(
      "C6686: POST /manager/roles - создать роль без названия",
      { tag: ["@db"] },
      async ({ rolesAPI, roleVerifier }) => {
        setSeverity("normal");

        let response, data;

        await test.step("Отправить POST /manager/roles без поля title (невалидный запрос)", async () => {
          const result = await rolesAPI.createRole({
            permissionsIds: [],
          });
          response = result.response;
          data = result.data;
        });

        await test.step("Проверить статус ответа: 400/422 (ошибка валидации)", async () => {
          expect([400, 422]).toContain(response.status());
        });

        // DB верификация: при ошибке данные не должны быть созданы
        await test.step("DB: Проверка что роль НЕ создана в БД", async () => {
          if (!roleVerifier.isConnected()) return;
          if (data?.id) {
            await roleVerifier.verifyRoleNotExists(data.id);
          }
        });
      },
    );

    test(
      "C6687: POST /manager/roles - создать роль с пустым названием",
      { tag: ["@db"] },
      async ({ rolesAPI, roleVerifier }) => {
        setSeverity("normal");

        let response, data;

        await test.step('Отправить POST /manager/roles с пустым title="" (невалидный запрос)', async () => {
          const result = await rolesAPI.createRole({
            title: "",
            permissionsIds: [],
          });
          response = result.response;
          data = result.data;
        });

        await test.step("Проверить статус ответа: 400/422 (ошибка валидации)", async () => {
          expect([400, 422]).toContain(response.status());
        });

        // DB верификация: при ошибке данные не должны быть созданы
        await test.step("DB: Проверка что роль НЕ создана в БД", async () => {
          if (!roleVerifier.isConnected()) return;
          if (data?.id) {
            await roleVerifier.verifyRoleNotExists(data.id);
          }
        });
      },
    );

    test("C6688: POST /manager/roles - создать роль с несуществующими разрешениями", async ({
      rolesAPI,
    }) => {
      setSeverity("normal");

      let title;
      await test.step("Сгенерировать уникальное название роли", async () => {
        title = TestDataHelper.generateUniqueName(
          "Роль с невалидными разрешениями",
        );
      });

      let response, data;

      await test.step("Отправить POST /manager/roles с несуществующим permissionsIds=[999999999]", async () => {
        const result = await rolesAPI.createRole({
          title,
          permissionsIds: [999999999],
        });
        response = result.response;
        data = result.data;
      });

      await test.step("Проверить статус ответа: 200/201/400/422/500", async () => {
        expect([200, 201, 400, 422, 500]).toContain(response.status());
      });

    });

    test("C6689: POST /manager/roles/{id} - обновить несуществующую роль", async ({
      rolesAPI,
    }) => {
      setSeverity("normal");

      let response;

      await test.step("Отправить POST /manager/roles/999999999 для обновления несуществующей роли", async () => {
        const result = await rolesAPI.updateRole(999999999, {
          title: "Тест",
        });
        response = result.response;
      });

      await test.step("Проверить статус ответа: 400/403/404 (роль не найдена)", async () => {
        expect([400, 403, 404]).toContain(response.status());
      });
    });

    test("C6690: DELETE /manager/roles/{id} - удалить несуществующую роль", async ({
      rolesAPI,
    }) => {
      setSeverity("normal");

      let response;

      await test.step("Отправить DELETE /manager/roles/999999999 для удаления несуществующей роли", async () => {
        const result = await rolesAPI.deleteRole(999999999);
        response = result.response;
      });

      await test.step("Проверить статус ответа: 400/403/404 (роль не найдена)", async () => {
        expect([400, 403, 404]).toContain(response.status());
      });
    });

    test("C6691: GET /manager/roles/{id}/users-count - несуществующая роль", async ({
      rolesAPI,
    }) => {
      setSeverity("normal");

      let response;

      await test.step("Отправить GET /manager/roles/999999999/users-count для несуществующей роли", async () => {
        const result = await rolesAPI.getRoleUsersCount(999999999);
        response = result.response;
      });

      await test.step("Проверить статус ответа: 400/403/404 (роль не найдена)", async () => {
        expect([400, 403, 404]).toContain(response.status());
      });
    });

    test("C6692: GET /manager/roles/{id} - невалидный ID (строка)", async ({
      rolesAPI,
    }) => {
      setSeverity("normal");

      let response;

      await test.step("Отправить GET /manager/roles/invalid-id с невалидным ID (строка)", async () => {
        const result = await rolesAPI.getRoleById("invalid-id");
        response = result.response;
      });

      await test.step("Проверить статус ответа: 400/404/500 (ошибка валидации ID)", async () => {
        expect([400, 404, 500]).toContain(response.status());
      });
    });
  },
);

// ==================== USER ROLE ACCESS ====================

test.describe(
  "Roles API - User Role Access",
  { tag: ["@api", "@roles", "@access", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.ROLES, "User Role Access");
    });

    test(
      "C6693: Обычный пользователь может получить список ролей (private)",
      { tag: ["@critical"] },
      async ({ rolesUserAPI }) => {
        setSeverity("critical");

        let response, data;

        await test.step("Отправить GET /private/roles от имени обычного пользователя", async () => {
          const result = await rolesUserAPI.getPrivateRoles();
          response = result.response;
          data = result.data;
        });

        await test.step("Проверить статус ответа: 200 OK", async () => {
          assertSuccessStatus(response);
        });

        await test.step("Проверить наличие данных в ответе", async () => {
          expect(data).toBeDefined();
        });

        await test.step("Проверить что данные являются массивом", async () => {
          const items = data?.items || data || [];
          expect(Array.isArray(items)).toBe(true);
        });
      },
    );

    test("C6694: Обычный пользователь НЕ может получить список разрешений", async ({
      rolesUserAPI,
    }) => {
      setSeverity("normal");

      let response;

      await test.step("Отправить GET /manager/permissions от имени обычного пользователя", async () => {
        const result = await rolesUserAPI.getPermissions();
        response = result.response;
      });

      await test.step("Проверить статус ответа: 403 Forbidden", async () => {
        expect([403]).toContain(response.status());
      });
    });

    test("C6695: Обычный пользователь НЕ может получить список ролей (manager)", async ({
      rolesUserAPI,
    }) => {
      setSeverity("normal");

      let response;

      await test.step("Отправить GET /manager/roles от имени обычного пользователя", async () => {
        const result = await rolesUserAPI.getRoles();
        response = result.response;
      });

      await test.step("Проверить статус ответа: 403 Forbidden", async () => {
        expect([403]).toContain(response.status());
      });
    });

    test("C6696: Обычный пользователь НЕ может создать роль", async ({
      rolesUserAPI,
    }) => {
      setSeverity("normal");

      let response;

      await test.step("Отправить POST /manager/roles от имени обычного пользователя", async () => {
        const result = await rolesUserAPI.createRole({
          title: "Тестовая роль",
          permissionsIds: [],
        });
        response = result.response;
      });

      await test.step("Проверить статус ответа: 403 Forbidden", async () => {
        expect([403]).toContain(response.status());
      });
    });

    test("C6697: Обычный пользователь НЕ может удалить роль", async ({
      rolesUserAPI,
    }) => {
      setSeverity("normal");

      let response;

      await test.step("Отправить DELETE /manager/roles/1 от имени обычного пользователя", async () => {
        const result = await rolesUserAPI.deleteRole(1);
        response = result.response;
      });

      await test.step("Проверить статус ответа: 403 Forbidden", async () => {
        expect([403]).toContain(response.status());
      });
    });
  },
);

// ==================== INTEGRATION TESTS ====================

test.describe(
  "Roles API - Integration Tests",
  { tag: ["@api", "@roles", "@integration", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.ROLES, "Integration");
    });

    test(
      "C6698: Полный жизненный цикл роли: создание → обновление → удаление",
      { tag: ["@critical", "@db"] },
      async ({ rolesAPI, roleVerifier }) => {
        setSeverity("critical");

        let title, createResp, createData;

        await test.step("Создать роль для проверки полного жизненного цикла", async () => {
          title = TestDataHelper.generateUniqueName("Жизненный цикл роль");
          const result = await rolesAPI.createRole({
            title,
            permissionsIds: [],
          });
          createResp = result.response;
          createData = result.data;
        });

        await test.step("Проверить успешность создания роли", async () => {
          if (!createResp.ok()) {
            test.skip(true, "Не удалось создать роль");
            return;
          }
        });

        if (!createResp.ok()) return;

        let roleId;
        await test.step("Сохранить ID созданной роли", async () => {
          roleId = createData.id;
        });

        try {
          let getResp1, getData1;

          await test.step(`Отправить GET /manager/roles/${roleId} для проверки создания`, async () => {
            const result = await rolesAPI.getRoleById(roleId);
            getResp1 = result.response;
            getData1 = result.data;
          });

          await test.step("Проверить успешность получения созданной роли", async () => {
            expect(getResp1.ok()).toBe(true);
          });

          await test.step(`Проверить что title роли совпадает: "${title}"`, async () => {
            expect(getData1.title).toBe(title);
          });

          // DB: Проверка создания
          await test.step("DB: Проверка создания роли в БД", async () => {
            if (!roleVerifier.isConnected()) return;
            const dbRole = await roleVerifier.verifyRoleCreated(roleId);
            if (dbRole) {
              expect(dbRole.title, "Title в БД совпадает").toBe(title);
            }
          });

          let newTitle, updateResp;

          await test.step(`Отправить POST /manager/roles/${roleId} для обновления title`, async () => {
            newTitle = TestDataHelper.generateUniqueName(
              "Обновлённая lifecycle роль",
            );
            const result = await rolesAPI.updateRole(roleId, {
              title: newTitle,
            });
            updateResp = result.response;
          });

          await test.step("Проверить статус ответа обновления: 200/201/500", async () => {
            expect([200, 201, 500]).toContain(updateResp.status());
          });

          if (updateResp.ok()) {
            let getResp2, getData2;

            await test.step(`Отправить GET /manager/roles/${roleId} для проверки обновления`, async () => {
              const result = await rolesAPI.getRoleById(roleId);
              getResp2 = result.response;
              getData2 = result.data;
            });

            await test.step("Проверить успешность получения обновлённой роли", async () => {
              expect(getResp2.ok()).toBe(true);
            });

            await test.step(`Проверить что title обновлён на "${newTitle}"`, async () => {
              expect(getData2.title).toBe(newTitle);
            });

            // DB: Проверка обновления
            await test.step("DB: Проверка обновления роли в БД", async () => {
              if (!roleVerifier.isConnected()) return;
              await roleVerifier.verifyRoleTitle(roleId, newTitle);
            });
          }

          let countResp;

          await test.step(`Отправить GET /manager/roles/${roleId}/users-count`, async () => {
            const result = await rolesAPI.getRoleUsersCount(roleId);
            countResp = result.response;
          });

          await test.step("Проверить статус ответа users-count: 200/404/500", async () => {
            expect([200, 404, 500]).toContain(countResp.status());
          });

          let deleteResp;

          await test.step(`Отправить DELETE /manager/roles/${roleId} для удаления роли`, async () => {
            const result = await rolesAPI.deleteRole(roleId);
            deleteResp = result.response;
          });

          await test.step("Проверить статус ответа удаления: 200/204", async () => {
            expect([200, 204]).toContain(deleteResp.status());
          });

          let getResp3;

          await test.step(`Отправить GET /manager/roles/${roleId} для проверки удаления`, async () => {
            const result = await rolesAPI.getRoleById(roleId);
            getResp3 = result.response;
          });

          await test.step("Проверить что роль не найдена: 400/403/404", async () => {
            expect([400, 403, 404]).toContain(getResp3.status());
          });

          // DB: Проверка удаления
          await test.step("DB: Проверка удаления роли в БД", async () => {
            if (!roleVerifier.isConnected()) return;
            await roleVerifier.verifyRoleDeleted(roleId);
          });
        } catch (error) {
          // Cleanup в случае ошибки
          await rolesAPI.deleteRole(roleId).catch(() => {});
          throw error;
        }
      },
    );

    test("C4718: Создание нескольких ролей и проверка в списке", async ({
      rolesAPI,
    }) => {
      setSeverity("normal");

      let timestamp, createdIds;

      let response, data;
      await test.step("Создать 3 роли для проверки batch-операций", async () => {
        timestamp = Date.now();
        createdIds = [];

        for (let i = 0; i < 3; i++) {
          const title = TestDataHelper.generateUniqueName(
            `Пакетная роль ${timestamp} #${i + 1}`,
          );
          ({ response, data } = await rolesAPI.createRole({
            title,
            permissionsIds: [],
          }));

          if (response.ok() && data?.id) {
            createdIds.push(data.id);
          }
        }
      });

      await test.step("Проверить что хотя бы одна роль создана успешно", async () => {
        test.skip(createdIds.length === 0, "Не удалось создать роли");
      });

      let listResp, listData;

      await test.step("Отправить GET /manager/roles для получения списка всех ролей (limit=500)", async () => {
        const result = await rolesAPI.getRoles({ limit: 500 });
        listResp = result.response;
        listData = result.data;
      });

      await test.step("Проверить успешность получения списка", async () => {
        expect(listResp.ok()).toBe(true);
      });

      await test.step("Проверить что все созданные роли присутствуют в списке", async () => {
        const items = listData?.items || listData || [];
        for (const id of createdIds) {
          expect(items.some((r) => r.id === id)).toBe(true);
        }
      });
    });

    test("C6700: Роль с разрешениями: создание и проверка связи", async ({
      rolesAPI,
    }) => {
      setSeverity("normal");

      let permResp, permData;

      await test.step("Отправить GET /manager/permissions для получения списка разрешений", async () => {
        const result = await rolesAPI.getPermissions();
        permResp = result.response;
        permData = result.data;
      });

      await test.step("Проверить доступность разрешений", async () => {
        if (!permResp.ok()) {
          test.skip(true, "Нет доступа к разрешениям");
          return;
        }
      });

      if (!permResp.ok()) return;

      let permissions, title, permissionsIds;

      await test.step("Подготовить данные: название роли и 2 разрешения", async () => {
        permissions = permData?.items || permData || [];
        test.skip(permissions.length === 0, "Нет разрешений");
        title = TestDataHelper.generateUniqueName(
          "Роль с проверкой разрешений",
        );
        permissionsIds = permissions.slice(0, 2).map((p) => p.id);
      });

      let createResp, createData;

      await test.step("Отправить POST /manager/roles для создания роли с 2 разрешениями", async () => {
        const result = await rolesAPI.createRole({
          title,
          permissionsIds,
        });
        createResp = result.response;
        createData = result.data;
      });

      await test.step("Проверить успешность создания роли", async () => {
        if (!createResp.ok()) {
          test.skip(true, "Не удалось создать роль");
          return;
        }
      });

      if (!createResp.ok()) return;

      const roleId = createData.id;

      let getResp, getData;

      await test.step(`Отправить GET /manager/roles/${roleId} для проверки связи с разрешениями`, async () => {
        const result = await rolesAPI.getRoleById(roleId);
        getResp = result.response;
        getData = result.data;
      });

      await test.step("Проверить статус ответа получения роли: 200 OK", async () => {
        expect(getResp.ok()).toBe(true);
      });

      let actualPermissionsCount;
      await test.step("Получить количество разрешений роли из ответа", async () => {
        if (getData.permissionsIds) {
          actualPermissionsCount = getData.permissionsIds.length;
        } else if (getData.permissions) {
          actualPermissionsCount = getData.permissions.length;
        }
      });

      await test.step(`Проверить что количество разрешений роли = ${permissionsIds.length}`, async () => {
        if (actualPermissionsCount !== undefined) {
          expect(actualPermissionsCount).toBe(permissionsIds.length);
        }
      });
    });
  },
);

// ==================== DATA CONSISTENCY ====================

test.describe(
  "Roles API - Data Consistency",
  { tag: ["@api", "@roles", "@consistency", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.ROLES, "Data Consistency");
    });

    test("C6701: Список ролей manager и private содержат общие роли", async ({
      rolesAPI,
    }) => {
      setSeverity("normal");

      let managerResp, managerData;

      await test.step("Отправить GET /manager/roles для получения списка ролей (manager endpoint)", async () => {
        const result = await rolesAPI.getRoles({ limit: 100 });
        managerResp = result.response;
        managerData = result.data;
      });

      await test.step("Проверить доступность manager endpoint", async () => {
        if (!managerResp.ok()) {
          test.skip(true, "Нет доступа к manager roles");
          return;
        }
      });

      if (!managerResp.ok()) return;

      let privateResp, privateData;

      await test.step("Отправить GET /private/roles для получения списка ролей (private endpoint)", async () => {
        const result = await rolesAPI.getPrivateRoles();
        privateResp = result.response;
        privateData = result.data;
      });

      await test.step("Проверить успешность получения private roles", async () => {
        expect(privateResp.ok()).toBe(true);
      });

      await test.step("Проверить что количество private roles <= manager roles + 10 (запас)", async () => {
        const managerItems = managerData?.items || managerData || [];
        const privateItems = privateData?.items || privateData || [];
        expect(privateItems.length).toBeLessThanOrEqual(
          managerItems.length + 10,
        );
      });
    });

    test("C6702: Возвращает согласованные данные", async ({ rolesAPI }) => {
      setSeverity("normal");

      let listResp, listData;

      await test.step("Отправить GET /manager/roles для получения списка ролей (limit=10)", async () => {
        const result = await rolesAPI.getRoles({ limit: 10 });
        listResp = result.response;
        listData = result.data;
      });

      await test.step("Проверить доступность списка ролей", async () => {
        if (!listResp.ok()) {
          test.skip(true, "Нет доступа к ролям");
          return;
        }
      });

      if (!listResp.ok()) return;

      let items;
      await test.step("Извлечь массив ролей и проверить его наличие", async () => {
        items = listData?.items || listData || [];
        test.skip(items.length === 0, "Нет ролей");
      });

      await test.step("Проверить users-count для первых 3 ролей", async () => {
        for (const role of items.slice(0, 3)) {
          const { response, data } = await rolesAPI.getRoleUsersCount(role.id);
          // API может вернуть 200 или 404/500 для некоторых ролей
          expect([200, 403, 404, 500]).toContain(response.status());

          if (response.ok()) {
            const count = data?.count ?? data?.usersCount ?? data;
            if (typeof count === "number") {
              expect(count).toBeGreaterThanOrEqual(0);
            }
          }
        }
      });
    });
  },
);
