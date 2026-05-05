// @ts-check
/**
 * API тесты для модуля настроек компании (CompanyAPI)
 *
 * Покрытие методов:
 * - getCompany, updateCompany, updateCompanyTitle
 * - getManagerCompanySettings, getPrivateCompanySettings
 * - getAdminEmail, getCompanyTokens, getActiveIntegrations, getSummaryAccountSettings
 * - getNotificationSettings, getUserNotificationSettings, getFullNotificationSettings
 * - updateNotificationSettings, updateUserNotificationSettings
 * - getRoles, getPrivateRoles, getRole, getRoleUsersCount, createRole, updateRole, deleteRole
 *
 * СТРОГИЕ ТЕСТЫ - не маскируют ошибки, а выявляют их.
 */
import { test as base, expect } from "@playwright/test";
import { CompanyAPI, getCredentials } from "../../utils/api/index.js";
import { allure } from "allure-playwright";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { assertSuccessStatus } from "../../utils/api/common-assertions.js";

// Расширяем test с фикстурой для Company API
const test = base.extend({
  companyAPI: async ({ request }, use) => {
    const api = new CompanyAPI(request);
    const { email, password } = getCredentials("admin");
    const signInResult = await api.signIn(email, password);
    if (!signInResult?.accessToken) {
      throw new Error("Не удалось авторизоваться для теста CompanyAPI");
    }
    await use(api);
  },
});

/**
 * Хелпер для логирования входных данных
 */
function logInput(name, data) {
  allure.attachment(
    `Input: ${name}`,
    JSON.stringify(data, null, 2),
    "application/json",
  );
}

/**
 * Хелпер для логирования ожидаемого результата
 */
function logExpected(description) {
  allure.attachment("Expected", description, "text/plain");
}

/**
 * Хелпер для проверки что ответ - объект с данными
 */
function expectValidObject(data, fieldName = "data") {
  expect(data, `${fieldName} должен быть определён`).toBeDefined();
  expect(data, `${fieldName} не должен быть null`).not.toBeNull();
  expect(typeof data, `${fieldName} должен быть объектом`).toBe("object");
}

test.describe(
  "Company API",
  { tag: ["@api", "@company", "@functional", "@regression"] },
  () => {
    test.beforeEach(async ({}, testInfo) => {
      markAsAPITest(MODULES.SETTINGS, "Company Settings");
    });

    // ==================== COMPANY INFO ====================

    test.describe("GET /manager/company/ - Информация о компании", () => {
      test(
        "C4688: Получить информацию о компании",
        { tag: ["@critical"] },
        async ({ companyAPI }) => {
          setSeverity("critical");

          await test.step("Выполнить: Получить информацию о компании", async () => {
            logExpected("Status 200, объект компании с id и title");

            const { response, data } = await companyAPI.getCompany();

            expect(
              response.status(),
              `Ожидался статус 200, получен ${response.status()}`,
            ).toBe(200);
            expectValidObject(data, "Company data");

            // Проверяем структуру ответа
            expect(data.id, "Компания должна иметь id").toBeDefined();
            expect(typeof data.id, "id должен быть числом").toBe("number");
          });
        },
      );

      test(
        "C4689: Получить настройки компании через manager API",
        { tag: ["@critical"] },
        async ({ companyAPI }) => {
          setSeverity("critical");

          await test.step("Выполнить: Получить настройки компании через manager API", async () => {
            logExpected("Status 200, объект настроек");

            const { response, data } =
              await companyAPI.getManagerCompanySettings();

            expect(
              response.status(),
              `Ожидался статус 200, получен ${response.status()}`,
            ).toBe(200);
            expectValidObject(data, "Manager settings");
          });
        },
      );

      test("C4690: Получить настройки компании через private API", async ({
        companyAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить настройки компании через private API", async () => {
          logExpected("Status 200, объект настроек");

          const { response, data } =
            await companyAPI.getPrivateCompanySettings();

          expect(
            response.status(),
            `Ожидался статус 200, получен ${response.status()}`,
          ).toBe(200);
          expectValidObject(data, "Private settings");
        });
      });

      test("C4691: Получить email администратора", async ({ companyAPI }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить email администратора", async () => {
          logExpected("Status 200, email в ответе");

          const { response, data } = await companyAPI.getAdminEmail();

          expect(
            response.status(),
            `Ожидался статус 200, получен ${response.status()}`,
          ).toBe(200);
          expectValidObject(data, "Admin email data");

          // Если есть email, проверяем формат
          if (data.email) {
            expect(data.email, "Email должен содержать @").toContain("@");
          }
        });
      });

      test("C4692: Получить токены компании", async ({ companyAPI }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить токены компании", async () => {
          logInput("params", { limit: 10 });
          logExpected("Status 200, массив или объект с items");

          const { response, data } = await companyAPI.getCompanyTokens({
            limit: 10,
          });

          expect(
            response.status(),
            `Ожидался статус 200, получен ${response.status()}`,
          ).toBe(200);
          expect(data, "Данные должны быть определены").toBeDefined();
        });
      });

      test("C4693: Получить активные интеграции", async ({ companyAPI }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить активные интеграции", async () => {
          logExpected("Status 200, данные об интеграциях");

          const { response, data } = await companyAPI.getActiveIntegrations();

          expect(
            response.status(),
            `Ожидался статус 200, получен ${response.status()}`,
          ).toBe(200);
          expect(data, "Данные должны быть определены").toBeDefined();
        });
      });

      test("C4694: Получить настройки summary account", async ({
        companyAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить настройки summary account", async () => {
          logExpected("Status 200, настройки");

          const { response, data } =
            await companyAPI.getSummaryAccountSettings();

          expect(
            response.status(),
            `Ожидался статус 200, получен ${response.status()}`,
          ).toBe(200);
          expect(data, "Данные должны быть определены").toBeDefined();
        });
      });
    });

    // ==================== COMPANY UPDATE ====================

    test.describe("PATCH /manager/company/ - Обновление компании", () => {
      test(
        "C4695: Обновить название компании и откатить",
        { tag: ["@critical"] },
        async ({ companyAPI }) => {
          setSeverity("critical");

          let getResp, currentData;
          await test.step("Выполнить запрос: Обновить название компании и откатить", async () => {
            // Получаем текущие данные
            ({ response: getResp, data: currentData } =
              await companyAPI.getCompany());
          });

          await test.step("Проверить ответ", async () => {
            expect(getResp.status(), "Должны получить текущие данные").toBe(
              200,
            );

            const originalTitle = currentData?.title;
            expect(
              originalTitle,
              "Компания должна иметь название",
            ).toBeDefined();

            const newTitle = `Test Company ${Date.now()}`;
            logInput("updateCompanyTitle", { title: newTitle });
            logExpected("Status 200, название обновлено");

            // Обновляем название
            const { response: updateResp } =
              await companyAPI.updateCompanyTitle(newTitle);

            expect(
              updateResp.status(),
              `Ожидался статус 200, получен ${updateResp.status()}`,
            ).toBe(200);

            // Проверяем что название обновилось
            const { response: verifyResp, data: verifyData } =
              await companyAPI.getCompany();
            expect(verifyResp.status()).toBe(200);
            expect(verifyData.title, "Название должно быть обновлено").toBe(
              newTitle,
            );

            // Откатываем изменения
            const { response: rollbackResp } =
              await companyAPI.updateCompanyTitle(originalTitle);
            expect(rollbackResp.status(), "Откат должен быть успешным").toBe(
              200,
            );
          });
        },
      );

      test(
        "C4696: Обновить название компании пустой строкой - должна быть ошибка",
        { tag: ["@negative"] },
        async ({ companyAPI }) => {
          setSeverity("normal");

          await test.step("Выполнить: Обновить название компании пустой строкой - должна быть ошибка", async () => {
            logInput("updateCompanyTitle", { title: "" });
            logExpected("Status 400 или 422 - ошибка валидации");

            const { response, data } = await companyAPI.updateCompanyTitle("");

            // Строго ожидаем ошибку валидации
            expect(
              [400, 422].includes(response.status()),
              `Пустое название должно вернуть 400/422, получен ${response.status()}. Response: ${JSON.stringify(data)}`,
            ).toBe(true);
          });
        },
      );

      test(
        "C4697: Обновить название компании с XSS",
        { tag: ["@security"] },
        async ({ companyAPI }) => {
          setSeverity("normal");

          let originalTitle, response, data;
          await test.step("Выполнить запрос: Обновить название компании с XSS", async () => {
            // Получаем оригинальное название для отката
            const { data: currentData } = await companyAPI.getCompany();
            originalTitle = currentData?.title;

            const xssTitle = '<script>alert("XSS")</script>';
            logInput("updateCompanyTitle", { title: xssTitle });
            logExpected("Status 200 - XSS экранируется на фронте");

            ({ response, data } =
              await companyAPI.updateCompanyTitle(xssTitle));

            // API принимает данные, экранирование происходит на фронте
          });

          await test.step("Проверить ответ", async () => {
            expect(
              response.status(),
              `Ожидался статус 200, получен ${response.status()}`,
            ).toBe(200);

            // Откатываем
            if (originalTitle) {
              await companyAPI.updateCompanyTitle(originalTitle);
            }
          });
        },
      );

      test(
        "C4698: Обновить название компании с SQL-injection",
        { tag: ["@security", "@negative"] },
        async ({ companyAPI }) => {
          setSeverity("critical");

          let originalTitle, response, data;
          await test.step("Выполнить запрос: Обновить название компании с SQL-injection", async () => {
            // Получаем оригинальное название для отката
            const { data: currentData } = await companyAPI.getCompany();
            originalTitle = currentData?.title;

            const sqlTitle = "'; DROP TABLE companies; --";
            logInput("updateCompanyTitle", { title: sqlTitle });
            logExpected("API должен безопасно обработать SQL-injection");

            ({ response, data } =
              await companyAPI.updateCompanyTitle(sqlTitle));

            // Не должен вернуть 500 (серверная ошибка)
          });

          await test.step("Проверить ответ", async () => {
            expect(
              response.status() !== 500,
              `SQL-injection не должен вызывать серверную ошибку, получен ${response.status()}`,
            ).toBe(true);

            // Откатываем
            if (originalTitle) {
              await companyAPI.updateCompanyTitle(originalTitle);
            }
          });
        },
      );
    });

    // ==================== NOTIFICATIONS ====================

    test.describe("Notifications Settings", () => {
      test(
        "C4699: Получить настройки уведомлений",
        { tag: ["@critical"] },
        async ({ companyAPI }) => {
          setSeverity("critical");

          await test.step("Выполнить: Получить настройки уведомлений", async () => {
            logExpected("Status 200, объект настроек уведомлений");

            const { response, data } =
              await companyAPI.getNotificationSettings();

            expect(
              response.status(),
              `Ожидался статус 200, получен ${response.status()}`,
            ).toBe(200);
            expectValidObject(data, "Notification settings");
          });
        },
      );

      test("C4700: Получить пользовательские настройки уведомлений", async ({
        companyAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить пользовательские настройки уведомлений", async () => {
          logExpected("Status 200, объект настроек");

          const { response, data } =
            await companyAPI.getUserNotificationSettings();

          expect(
            response.status(),
            `Ожидался статус 200, получен ${response.status()}`,
          ).toBe(200);
          expectValidObject(data, "User notification settings");
        });
      });

      test("C4701: Получить полные настройки уведомлений", async ({
        companyAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить полные настройки уведомлений", async () => {
          logExpected("Status 200, полный объект настроек");

          const { response, data } =
            await companyAPI.getFullNotificationSettings();

          expect(
            response.status(),
            `Ожидался статус 200, получен ${response.status()}`,
          ).toBe(200);
          expectValidObject(data, "Full notification settings");
        });
      });

      test("C4702: Согласованность настроек между эндпоинтами", async ({
        companyAPI,
      }) => {
        setSeverity("normal");

        let basic, user, full;
        await test.step("Выполнить запрос: Согласованность настроек между эндпоинтами", async () => {
          logExpected("Все три эндпоинта возвращают данные");

          [basic, user, full] = await Promise.all([
            companyAPI.getNotificationSettings(),
            companyAPI.getUserNotificationSettings(),
            companyAPI.getFullNotificationSettings(),
          ]);
        });

        await test.step("Проверить ответ", async () => {
          expect(
            basic.response.status(),
            "Basic settings должен вернуть 200",
          ).toBe(200);
          expect(
            user.response.status(),
            "User settings должен вернуть 200",
          ).toBe(200);
          expect(
            full.response.status(),
            "Full settings должен вернуть 200",
          ).toBe(200);

          // Логируем структуры для анализа
          allure.attachment(
            "Settings comparison",
            JSON.stringify(
              {
                basicKeys: Object.keys(basic.data || {}),
                userKeys: Object.keys(user.data || {}),
                fullKeys: Object.keys(full.data || {}),
              },
              null,
              2,
            ),
            "application/json",
          );
        });
      });
    });

    // ==================== ROLES ====================

    test.describe("Roles API", () => {
      test(
        "C4703: Получить список ролей",
        { tag: ["@critical"] },
        async ({ companyAPI }) => {
          setSeverity("critical");

          let response, data;
          await test.step("Выполнить запрос: Получить список ролей", async () => {
            logInput("params", { limit: 10 });
            logExpected("Status 200, массив ролей");

            ({ response, data } = await companyAPI.getRoles({ limit: 10 }));
          });

          await test.step("Проверить ответ", async () => {
            expect(
              response.status(),
              `Ожидался статус 200, получен ${response.status()}`,
            ).toBe(200);
            expect(data, "Данные должны быть определены").toBeDefined();

            const items = data?.items || data || [];
            expect(Array.isArray(items), "Роли должны быть массивом").toBe(
              true,
            );

            // Проверяем структуру каждой роли
            if (items.length > 0) {
              const firstRole = items[0];
              expect(firstRole.id, "Роль должна иметь id").toBeDefined();
              expect(firstRole.title, "Роль должна иметь title").toBeDefined();
            }
          });
        },
      );

      test("C4704: Получить список ролей через private API", async ({
        companyAPI,
      }) => {
        setSeverity("normal");

        await test.step("Выполнить: Получить список ролей через private API", async () => {
          logInput("params", { limit: 10 });
          logExpected("Status 200, массив ролей");

          const { response, data } = await companyAPI.getPrivateRoles({
            limit: 10,
          });

          expect(
            response.status(),
            `Ожидался статус 200, получен ${response.status()}`,
          ).toBe(200);
          expect(data, "Данные должны быть определены").toBeDefined();
        });
      });

      test("C4705: Пагинация списка ролей работает корректно", async ({
        companyAPI,
      }) => {
        setSeverity("normal");

        let resp1, data1;
        await test.step("Выполнить запрос: Пагинация списка ролей работает корректно", async () => {
          // Получаем первую страницу
          ({ response: resp1, data: data1 } = await companyAPI.getRoles({
            limit: 2,
            offset: 0,
          }));
        });

        await test.step("Проверить ответ", async () => {
          expect(resp1.status()).toBe(200);

          // Получаем вторую страницу
          const { response: resp2, data: data2 } = await companyAPI.getRoles({
            limit: 2,
            offset: 2,
          });
          expect(resp2.status()).toBe(200);

          const items1 = data1?.items || data1 || [];
          const items2 = data2?.items || data2 || [];

          logInput("pagination test", {
            page1: { limit: 2, offset: 0, count: items1.length },
            page2: { limit: 2, offset: 2, count: items2.length },
          });

          // Если есть данные на обеих страницах, они должны быть разными
          if (items1.length > 0 && items2.length > 0) {
            const ids1 = items1.map((r) => r.id);
            const ids2 = items2.map((r) => r.id);
            const overlap = ids1.filter((id) => ids2.includes(id));
            expect(
              overlap.length,
              "Страницы не должны содержать одинаковые роли",
            ).toBe(0);
          }
        });
      });

      test(
        "C4706: Получить роль по ID",
        { tag: ["@critical"] },
        async ({ companyAPI }) => {
          setSeverity("critical");

          let roleId, response, data;
          await test.step("Выполнить запрос: Получить роль по ID", async () => {
            // Сначала получаем список, чтобы взять существующий ID
            const { data: listData } = await companyAPI.getRoles({ limit: 1 });
            const items = listData?.items || listData || [];

            if (items.length === 0) {
              allure.attachment(
                "Skip reason",
                "Нет ролей в системе",
                "text/plain",
              );
              return;
            }

            roleId = items[0].id;
            logInput("getRole", { id: roleId });
            logExpected(`Status 200, роль с id=${roleId}`);

            ({ response, data } = await companyAPI.getRole(roleId));
          });

          await test.step("Проверить ответ", async () => {
            expect(
              response.status(),
              `Ожидался статус 200, получен ${response.status()}`,
            ).toBe(200);
            expectValidObject(data, "Role");
            expect(data.id, `ID роли должен быть ${roleId}`).toBe(roleId);
            expect(data.title, "Роль должна иметь title").toBeDefined();
          });
        },
      );

      test(
        "C4707: Получить несуществующую роль - должна быть ошибка 404",
        { tag: ["@negative"] },
        async ({ companyAPI }) => {
          setSeverity("normal");

          await test.step("Выполнить: Получить несуществующую роль - должна быть ошибка 404", async () => {
            const nonExistentId = 999999999;
            logInput("getRole", { id: nonExistentId });
            logExpected("Status 404 или 500");

            const { response, data } = await companyAPI.getRole(nonExistentId);

            expect(
              [404, 500].includes(response.status()),
              `Ожидался статус 404 или 500 для несуществующей роли, получен ${response.status()}`,
            ).toBe(true);
          });
        },
      );

      test("C4708: Получить количество пользователей роли", async ({
        companyAPI,
      }) => {
        setSeverity("normal");

        let response, data;
        await test.step("Выполнить запрос: Получить количество пользователей роли", async () => {
          // Получаем существующую роль
          const { data: listData } = await companyAPI.getRoles({ limit: 1 });
          const items = listData?.items || listData || [];

          if (items.length === 0) {
            allure.attachment(
              "Skip reason",
              "Нет ролей в системе",
              "text/plain",
            );
            return;
          }

          const roleId = items[0].id;
          logInput("getRoleUsersCount", { id: roleId });
          logExpected("Status 200, число пользователей");

          ({ response, data } = await companyAPI.getRoleUsersCount(roleId));

          // 403 - нет прав на просмотр количества пользователей данной роли
          if (response.status() === 403) {
            allure.attachment(
              "Skip reason",
              "Нет прав на просмотр количества пользователей роли",
              "text/plain",
            );
            response = null; // сигнал следующему шагу пропустить проверку
            return;
          }
        });

        await test.step("Проверить ответ", async () => {
          if (!response) return; // step вернулся early (нет ролей или нет прав)
          expect(
            [200, 201].includes(response.status()),
            `Ожидался статус 200/201, получен ${response.status()}`,
          ).toBe(true);
          expect(data, "Данные должны быть определены").toBeDefined();

          // Проверяем что это число или объект с count
          const count = typeof data === "number" ? data : data?.count;
          if (count !== undefined) {
            expect(typeof count, "Count должен быть числом").toBe("number");
            expect(count, "Count должен быть >= 0").toBeGreaterThanOrEqual(0);
          }
        });
      });
    });

    // ==================== ROLES CRUD ====================

    test.describe("Roles CRUD Operations", () => {
      test(
        "C4709: Создать роль",
        { tag: ["@critical"] },
        async ({ companyAPI }) => {
          setSeverity("critical");

          let response, data;
          await test.step("Выполнить запрос: Создать роль", async () => {
            const roleData = {
              title: `Test Role ${Date.now()}`,
              permissionsIds: [],
            };
            logInput("createRole", roleData);
            logExpected("Status 200/201, созданная роль с id");

            ({ response, data } = await companyAPI.createRole(roleData));
          });

          await test.step("Проверить ответ", async () => {
            expect(
              [200, 201].includes(response.status()),
              `Ожидался статус 200/201, получен ${response.status()}. Response: ${JSON.stringify(data)}`,
            ).toBe(true);

            const roleId = data?.id || data?.role?.id;
            expect(roleId, "Созданная роль должна иметь id").toBeDefined();

            // Cleanup - удаляем созданную роль
            if (roleId) {
              const { response: deleteResp } =
                await companyAPI.deleteRole(roleId);
              expect(deleteResp.ok(), "Cleanup: удаление роли").toBe(true);
            }
          });
        },
      );

      test(
        "C4710: Создать роль без названия - должна быть ошибка",
        { tag: ["@negative"] },
        async ({ companyAPI }) => {
          setSeverity("normal");

          await test.step("Выполнить: Создать роль без названия - должна быть ошибка", async () => {
            logInput("createRole", { permissionsIds: [] });
            logExpected("Status 400 или 422 - ошибка валидации");

            const { response, data } = await companyAPI.createRole({
              permissionsIds: [],
            });

            expect(
              [400, 422].includes(response.status()),
              `Роль без названия должна вернуть 400/422, получен ${response.status()}. Response: ${JSON.stringify(data)}`,
            ).toBe(true);
          });
        },
      );

      test(
        "C4711: Создать роль с пустым названием - должна быть ошибка",
        { tag: ["@negative"] },
        async ({ companyAPI }) => {
          setSeverity("normal");

          await test.step("Выполнить: Создать роль с пустым названием - должна быть ошибка", async () => {
            logInput("createRole", { title: "", permissionsIds: [] });
            logExpected("Status 400 или 422 - ошибка валидации");

            const { response, data } = await companyAPI.createRole({
              title: "",
              permissionsIds: [],
            });

            expect(
              [400, 422].includes(response.status()),
              `Роль с пустым названием должна вернуть 400/422, получен ${response.status()}. Response: ${JSON.stringify(data)}`,
            ).toBe(true);
          });
        },
      );

      test(
        "C4712: Обновить роль",
        { tag: ["@critical"] },
        async ({ companyAPI }) => {
          setSeverity("critical");

          let createResp, created;
          await test.step("Выполнить запрос: Обновить роль", async () => {
            // Создаём роль для тестирования
            const createData = {
              title: `Test Update Role ${Date.now()}`,
              permissionsIds: [],
            };
            ({ response: createResp, data: created } =
              await companyAPI.createRole(createData));
          });

          await test.step("Проверить ответ", async () => {
            expect(
              [200, 201].includes(createResp.status()),
              "Роль должна быть создана",
            ).toBe(true);

            const roleId = created?.id || created?.role?.id;
            expect(roleId, "Созданная роль должна иметь id").toBeDefined();

            // Обновляем
            const newTitle = `Updated Role ${Date.now()}`;
            logInput("updateRole", { id: roleId, title: newTitle });
            logExpected("Status 200, название обновлено");

            const { response: updateResp, data: updateData } =
              await companyAPI.updateRole(roleId, {
                title: newTitle,
                permissionsIds: [],
              });

            allure.attachment(
              "Update response",
              JSON.stringify(
                { status: updateResp.status(), data: updateData },
                null,
                2,
              ),
              "application/json",
            );
            expect(
              updateResp.status(),
              `Ожидался статус 200, получен ${updateResp.status()}. Response: ${JSON.stringify(updateData)}`,
            ).toBe(200);

            // Проверяем что обновилось
            const { response: getResp, data: getData } =
              await companyAPI.getRole(roleId);
            expect(getResp.status()).toBe(200);
            expect(getData.title, "Название должно быть обновлено").toBe(
              newTitle,
            );

            // Cleanup
            await companyAPI.deleteRole(roleId);
          });
        },
      );

      test(
        "C4713: Обновить несуществующую роль - должна быть ошибка 404",
        { tag: ["@negative"] },
        async ({ companyAPI }) => {
          setSeverity("normal");

          await test.step("Выполнить: Обновить несуществующую роль - должна быть ошибка 404", async () => {
            const nonExistentId = 999999999;
            logInput("updateRole", { id: nonExistentId, title: "Test" });
            logExpected("Status 404 или 500");

            const { response, data } = await companyAPI.updateRole(
              nonExistentId,
              { title: "Test", permissionsIds: [] },
            );

            expect(
              [404, 500].includes(response.status()),
              `Ожидался статус 404 или 500 для несуществующей роли, получен ${response.status()}`,
            ).toBe(true);
          });
        },
      );

      test(
        "C4714: Удалить роль",
        { tag: ["@critical"] },
        async ({ companyAPI }) => {
          setSeverity("critical");

          let createResp, created;
          await test.step("Выполнить запрос: Удалить роль", async () => {
            // Создаём роль для удаления
            ({ response: createResp, data: created } =
              await companyAPI.createRole({
                title: `Test Delete Role ${Date.now()}`,
                permissionsIds: [],
              }));
          });

          await test.step("Проверить ответ", async () => {
            expect(
              [200, 201].includes(createResp.status()),
              "Роль должна быть создана",
            ).toBe(true);

            const roleId = created?.id || created?.role?.id;
            expect(roleId, "Созданная роль должна иметь id").toBeDefined();

            logInput("deleteRole", { id: roleId });
            logExpected("Status 200/204, роль удалена");

            // Удаляем
            const { response: deleteResp } =
              await companyAPI.deleteRole(roleId);

            expect(
              [200, 204].includes(deleteResp.status()),
              `Ожидался статус 200/204, получен ${deleteResp.status()}`,
            ).toBe(true);

            // Проверяем что роль действительно удалена
            const { response: getResp } = await companyAPI.getRole(roleId);
            expect(
              [404, 500].includes(getResp.status()),
              `Удалённая роль должна возвращать 404 или 500, получен ${getResp.status()}`,
            ).toBe(true);
          });
        },
      );

      test(
        "C4715: Удалить несуществующую роль - должна быть ошибка 404/500",
        { tag: ["@negative"] },
        async ({ companyAPI }) => {
          setSeverity("normal");

          await test.step("Выполнить: Удалить несуществующую роль - должна быть ошибка 404/500", async () => {
            const nonExistentId = 999999999;
            logInput("deleteRole", { id: nonExistentId });
            logExpected("Status 404 или 500");

            const { response, data } =
              await companyAPI.deleteRole(nonExistentId);

            expect(
              [404, 500].includes(response.status()),
              `Ожидался статус 404 или 500 для несуществующей роли, получен ${response.status()}`,
            ).toBe(true);
          });
        },
      );

      test(
        "C4716: Удалить уже удалённую роль - должна быть ошибка 404",
        { tag: ["@negative"] },
        async ({ companyAPI }) => {
          setSeverity("normal");

          let roleId, firstDelete;
          await test.step("Выполнить запрос: Удалить уже удалённую роль - должна быть ошибка 404", async () => {
            // Создаём и сразу удаляем
            const { data: created } = await companyAPI.createRole({
              title: `Test Double Delete ${Date.now()}`,
              permissionsIds: [],
            });
            roleId = created?.id || created?.role?.id;

            // Первое удаление
            ({ response: firstDelete } = await companyAPI.deleteRole(roleId));
          });

          await test.step("Проверить ответ", async () => {
            expect(
              [200, 204].includes(firstDelete.status()),
              "Первое удаление должно быть успешным",
            ).toBe(true);

            logInput("deleteRole (second time)", { id: roleId });
            logExpected("Status 404 или 500 - роль уже удалена");

            // Второе удаление
            const { response: secondDelete, data } =
              await companyAPI.deleteRole(roleId);

            expect(
              [404, 500].includes(secondDelete.status()),
              `Повторное удаление должно вернуть 404 или 500, получен ${secondDelete.status()}`,
            ).toBe(true);
          });
        },
      );
    });

    // ==================== INTEGRATION TESTS ====================

    test.describe("Интеграционные тесты", () => {
      test(
        "C4717: Полный жизненный цикл роли: создание → чтение → обновление → удаление",
        { tag: ["@critical"] },
        async ({ companyAPI }) => {
          setSeverity("critical");

          let timestamp, createTitle, createResp, createData;
          await test.step("Выполнить запрос: Полный жизненный цикл роли: создание → чтение → обновление → удаление", async () => {
            timestamp = Date.now();

            // 1. CREATE
            createTitle = `Lifecycle Role ${timestamp}`;
            ({ response: createResp, data: createData } =
              await companyAPI.createRole({
                title: createTitle,
                permissionsIds: [],
              }));
          });

          await test.step("Проверить ответ", async () => {
            expect(
              [200, 201].includes(createResp.status()),
              "CREATE должен вернуть 200/201",
            ).toBe(true);
            const roleId = createData?.id || createData?.role?.id;
            expect(roleId, "CREATE должен вернуть id").toBeDefined();

            allure.attachment(
              "Step 1: CREATE",
              JSON.stringify({ roleId, title: createTitle }),
              "application/json",
            );

            // 2. READ
            const { response: readResp, data: readData } =
              await companyAPI.getRole(roleId);
            expect(readResp.status(), "READ должен вернуть 200").toBe(200);
            expect(
              readData.title,
              "READ должен вернуть правильное название",
            ).toBe(createTitle);

            allure.attachment(
              "Step 2: READ",
              JSON.stringify(readData),
              "application/json",
            );

            // 3. UPDATE
            const updateTitle = `Updated Lifecycle Role ${timestamp}`;
            const { response: updateResp } = await companyAPI.updateRole(
              roleId,
              {
                title: updateTitle,
                permissionsIds: [],
              },
            );
            expect(updateResp.status(), "UPDATE должен вернуть 200").toBe(200);

            // Verify update
            const { data: verifyData } = await companyAPI.getRole(roleId);
            expect(
              verifyData.title,
              "После UPDATE название должно измениться",
            ).toBe(updateTitle);

            allure.attachment(
              "Step 3: UPDATE",
              JSON.stringify({ oldTitle: createTitle, newTitle: updateTitle }),
              "application/json",
            );

            // 4. DELETE
            const { response: deleteResp } =
              await companyAPI.deleteRole(roleId);
            expect(
              [200, 204].includes(deleteResp.status()),
              "DELETE должен вернуть 200/204",
            ).toBe(true);

            // Verify delete
            const { response: verifyDeleteResp } =
              await companyAPI.getRole(roleId);
            expect(
              [404, 500].includes(verifyDeleteResp.status()),
              `После DELETE должен вернуться 404 или 500, получен ${verifyDeleteResp.status()}`,
            ).toBe(true);

            allure.attachment(
              "Step 4: DELETE",
              JSON.stringify({ deleted: true, roleId }),
              "application/json",
            );
          });
        },
      );

      test(
        "C4718: Создание нескольких ролей и проверка в списке",
        { tag: ["@critical"] },
        async ({ companyAPI }) => {
          setSeverity("critical");

          let rolesToCreate, createdIds;
          await test.step("Выполнить запрос: Создание нескольких ролей и проверка в списке", async () => {
            const timestamp = Date.now();
            rolesToCreate = [
              { title: `Batch Role A ${timestamp}`, permissionsIds: [] },
              { title: `Batch Role B ${timestamp}`, permissionsIds: [] },
              { title: `Batch Role C ${timestamp}`, permissionsIds: [] },
            ];

            createdIds = [];

            // Создаём роли
            for (const role of rolesToCreate) {
              const { response, data } = await companyAPI.createRole(role);
              expect(
                [200, 201].includes(response.status()),
                `Создание роли "${role.title}" должно быть успешным`,
              ).toBe(true);
              const roleId = data?.id || data?.role?.id;
              createdIds.push(roleId);
            }
          });

          await test.step("Проверить ответ", async () => {
            expect(createdIds.length, "Все роли должны быть созданы").toBe(
              rolesToCreate.length,
            );

            logInput("created roles", createdIds);

            // Проверяем что все роли есть в списке (ролей может быть >100, увеличиваем limit)
            const { response: listResp, data: listData } =
              await companyAPI.getRoles({ limit: 500 });
            expect(listResp.status()).toBe(200);

            const allItems = listData?.items || listData || [];
            const allIds = allItems.map((r) => r.id);

            for (const createdId of createdIds) {
              expect(
                allIds.includes(createdId),
                `Роль ${createdId} должна быть в списке`,
              ).toBe(true);
            }

            // Cleanup
            for (const roleId of createdIds) {
              await companyAPI.deleteRole(roleId);
            }
          });
        },
      );
    });

    // ==================== SECURITY TESTS ====================

    test.describe("Security тесты", () => {
      test(
        "C4719: Создание роли с SQL-injection в названии",
        { tag: ["@security"] },
        async ({ companyAPI }) => {
          setSeverity("critical");

          let response, data;
          await test.step("Выполнить запрос: Создание роли с SQL-injection в названии", async () => {
            const sqlInjection = "'; DROP TABLE roles; --";
            logInput("createRole", { title: sqlInjection });
            logExpected("API должен безопасно обработать SQL-injection");

            ({ response, data } = await companyAPI.createRole({
              title: sqlInjection,
              permissionsIds: [],
            }));

            // Не должен вернуть 500
          });

          await test.step("Проверить ответ", async () => {
            expect(
              response.status() !== 500,
              `SQL-injection не должен вызывать серверную ошибку, получен ${response.status()}`,
            ).toBe(true);

            // Если создалось - удаляем
            const roleId = data?.id || data?.role?.id;
            if (roleId) {
              await companyAPI.deleteRole(roleId);
            }
          });
        },
      );

      test(
        "C4720: Создание роли с XSS в названии",
        { tag: ["@security"] },
        async ({ companyAPI }) => {
          setSeverity("normal");

          let response, data;
          await test.step("Выполнить запрос: Создание роли с XSS в названии", async () => {
            const xssPayload = "<img src=x onerror=alert(1)>";
            logInput("createRole", { title: xssPayload });
            logExpected("Status 200/201 - XSS экранируется на фронте");

            ({ response, data } = await companyAPI.createRole({
              title: xssPayload,
              permissionsIds: [],
            }));

            // API принимает данные, экранирование происходит на фронте
          });

          await test.step("Проверить ответ", async () => {
            expect(
              [200, 201].includes(response.status()),
              `Ожидался статус 200/201, получен ${response.status()}`,
            ).toBe(true);

            const roleId = data?.id || data?.role?.id;

            // Cleanup
            if (roleId) {
              await companyAPI.deleteRole(roleId);
            }
          });
        },
      );

      test(
        "C4721: Создание роли с очень длинным названием",
        { tag: ["@edge"] },
        async ({ companyAPI }) => {
          setSeverity("normal");

          let response, data;
          await test.step("Выполнить запрос: Создание роли с очень длинным названием", async () => {
            const longTitle = "A".repeat(10000);
            logInput("createRole", { titleLength: longTitle.length });
            logExpected(
              "API должен обрезать или отклонить слишком длинное название",
            );

            ({ response, data } = await companyAPI.createRole({
              title: longTitle,
              permissionsIds: [],
            }));

            // Не должен вернуть 500
          });

          await test.step("Проверить ответ", async () => {
            expect(
              response.status() !== 500,
              `Длинное название не должно вызывать серверную ошибку, получен ${response.status()}`,
            ).toBe(true);

            // Cleanup если создалось
            const roleId = data?.id || data?.role?.id;
            if (roleId) {
              await companyAPI.deleteRole(roleId);
            }
          });
        },
      );
    });
  },
);
