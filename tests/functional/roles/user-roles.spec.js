// @ts-check
/**
 * UI тесты назначения ролей пользователям
 *
 * @tags @roles @user-roles @ui @regression
 * @module Roles
 */

import { test, expect } from "../../fixtures/auth.js";
import { RolesAPI, getCredentials } from "../../utils/api/index.js";
import { assignRolesAndInvalidate } from "../../utils/auth/TokenManager.js";
import {
  markAsUITest,
  setSeverity,
  MODULES,
} from "../../utils/allure-helpers.js";
import { TIMEOUTS } from "../../utils/constants.js";

const BASE_URL = process.env.BASE_URL;

test.describe(
  "User Role Assignment",
  { tag: ["@roles", "@user-roles", "@ui"] },
  () => {
    test.beforeEach(async () => {
      markAsUITest(MODULES.ROLES, "User Assignment");
    });

    test.describe("Назначение роли пользователю", () => {
      test(
        "C4297: Переход на страницу настройки прав пользователя",
        { tag: ["@smoke", "@regression"] },
        async ({ adminAuth }, testInfo) => {
          setSeverity("normal");

          await test.step("Открыть страницу списка сотрудников в оргструктуре", async () => {
            await adminAuth.goto(new URL("/ru/manager/structure/users", BASE_URL).toString());
            await adminAuth.waitForLoadState("networkidle");
          });

          await test.step("Проверить загрузку таблицы пользователей", async () => {
            await expect(
              adminAuth.locator('table, [class*="UsersTable"]').first(),
            ).toBeVisible({
              timeout: TIMEOUTS.MEDIUM,
            });
          });
        },
      );

      test.describe("UI управление ролями через форму редактирования", () => {
        // Тесты модифицируют роли одного пользователя — нельзя параллелить
        test.describe.configure({ mode: "serial" });

        /** @type {RolesAPI} */
        let adminAPI;
        /** @type {number} */
        let testUserId;
        /** @type {number[]} */
        let originalRoleIds;
        /** @type {number} */
        let adminRoleId;
        /** @type {number} */
        let userRoleId;

        test.beforeAll(async ({ request }) => {
          // Одноразовый setup: получаем ID пользователя и сохраняем оригинальные роли
          const setupAPI = new RolesAPI(request);
          const adminCreds = getCredentials("admin");
          await setupAPI.signIn(adminCreds.email, adminCreds.password);

          // Получаем системные роли динамически
          ({ adminRoleId, userRoleId } =
            await setupAPI.getSystemRoleIds());

          const userApi = new RolesAPI(request);
          const userCreds = getCredentials("user");
          await userApi.signIn(userCreds.email, userCreds.password);
          const { data: meData } = await userApi.getCurrentUser();
          testUserId = meData?.currentUserId || meData?.id;

          if (!testUserId) {
            throw new Error("Не удалось получить ID тестового пользователя");
          }

          originalRoleIds = await setupAPI.getUserRoleIds(testUserId);
          console.log(
            `[setup] User ${testUserId} original roles:`,
            originalRoleIds,
          );
        });

        // Свежий API-клиент для каждого теста (request из beforeAll нельзя переиспользовать в тестах)
        test.beforeEach(async ({ request }) => {
          adminAPI = new RolesAPI(request);
          const creds = getCredentials("admin");
          await adminAPI.signIn(creds.email, creds.password);
        });

        test.afterAll(async ({ request }) => {
          if (testUserId && originalRoleIds?.length > 0) {
            try {
              const api = new RolesAPI(request);
              const creds = getCredentials("admin");
              await api.signIn(creds.email, creds.password);
              await assignRolesAndInvalidate(api, testUserId, originalRoleIds);
              console.log(
                `[cleanup] Restored user ${testUserId} roles:`,
                originalRoleIds,
              );
            } catch (e) {
              console.warn(
                `[cleanup] Не удалось восстановить роли: ${e.message}`,
              );
            }
          }
        });

        test(
          "C4302: Назначение дополнительной роли пользователю через редактирование",
          { tag: ["@regression"] },
          async ({ adminAuth }) => {
            setSeverity("normal");

            await test.step("Подготовка: оставить только роль Пользователь", async () => {
              await adminAPI.assignRolesToUser(testUserId, [userRoleId]);
            });

            await test.step("Открыть форму редактирования сотрудника", async () => {
              const editUrl = new URL(
                `/ru/manager/structure/users/${testUserId}/`,
                BASE_URL,
              ).toString();
              await adminAuth.goto(editUrl);
              await adminAuth.waitForURL(`**/manager/structure/users/${testUserId}/`, {
                timeout: TIMEOUTS.PAGE_LOAD,
              });
              await adminAuth.waitForLoadState("networkidle");
            });

            await test.step("Проверить текущие роли: Пользователь отмечен, Администратор — нет", async () => {
              await expect(
                adminAuth.getByRole("checkbox", {
                  name: "Пользователь",
                  exact: true,
                }),
              ).toBeChecked({ timeout: TIMEOUTS.MEDIUM });
              await expect(
                adminAuth.getByRole("checkbox", {
                  name: "Администратор",
                  exact: true,
                }),
              ).not.toBeChecked();
            });

            await test.step("Отметить чекбокс Администратор", async () => {
              const adminCb = adminAuth.getByRole("checkbox", {
                name: "Администратор",
                exact: true,
              });
              await adminCb.click({ force: true });
              await expect(adminCb).toBeChecked();
            });

            await test.step("Сохранить изменения", async () => {
              await adminAuth
                .getByRole("button", { name: /Сохранить/i })
                .click();
              await adminAuth.waitForLoadState("networkidle");
            });

            await test.step("Проверить через API что обе роли назначены", async () => {
              const currentRoles = await adminAPI.getUserRoleIds(testUserId);
              expect(
                currentRoles,
                `Администратор (ID=${adminRoleId}) должна быть назначена`,
              ).toContain(adminRoleId);
              expect(
                currentRoles,
                `Пользователь (ID=${userRoleId}) должна быть назначена`,
              ).toContain(userRoleId);
            });
          },
        );

        test(
          "C4303: Смена роли пользователя через редактирование",
          { tag: ["@regression"] },
          async ({ adminAuth }) => {
            setSeverity("normal");

            await test.step("Подготовка: оставить только роль Пользователь", async () => {
              await adminAPI.assignRolesToUser(testUserId, [userRoleId]);
            });

            await test.step("Открыть форму редактирования сотрудника", async () => {
              const editUrl = new URL(
                `/ru/manager/structure/users/${testUserId}/`,
                BASE_URL,
              ).toString();
              await adminAuth.goto(editUrl);
              await adminAuth.waitForURL(`**/manager/structure/users/${testUserId}/`, {
                timeout: TIMEOUTS.PAGE_LOAD,
              });
              await adminAuth.waitForLoadState("networkidle");
            });

            await test.step("Проверить что только Пользователь отмечен", async () => {
              await expect(
                adminAuth.getByRole("checkbox", {
                  name: "Пользователь",
                  exact: true,
                }),
              ).toBeChecked({ timeout: TIMEOUTS.MEDIUM });
              await expect(
                adminAuth.getByRole("checkbox", {
                  name: "Администратор",
                  exact: true,
                }),
              ).not.toBeChecked();
            });

            await test.step("Сменить роль: отметить Администратор, снять Пользователь", async () => {
              // Сначала добавляем новую роль (чтобы не было 0 ролей)
              const adminCb = adminAuth.getByRole("checkbox", {
                name: "Администратор",
                exact: true,
              });
              await adminCb.click({ force: true });
              await expect(adminCb).toBeChecked();

              // Затем снимаем старую
              const userCb = adminAuth.getByRole("checkbox", {
                name: "Пользователь",
                exact: true,
              });
              await userCb.click({ force: true });
              await expect(userCb).not.toBeChecked();
            });

            await test.step("Сохранить изменения", async () => {
              await adminAuth
                .getByRole("button", { name: /Сохранить/i })
                .click();
              await adminAuth.waitForLoadState("networkidle");
            });

            await test.step("Проверить через API что произошла смена роли", async () => {
              const currentRoles = await adminAPI.getUserRoleIds(testUserId);
              expect(
                currentRoles,
                `Администратор (ID=${adminRoleId}) должна быть назначена`,
              ).toContain(adminRoleId);
              expect(
                currentRoles,
                `Пользователь (ID=${userRoleId}) не должна быть назначена`,
              ).not.toContain(userRoleId);
            });
          },
        );

        test(
          "C4304: Удаление роли у пользователя через редактирование",
          { tag: ["@regression"] },
          async ({ adminAuth }) => {
            setSeverity("normal");

            await test.step("Подготовка: назначить обе роли (Пользователь + Администратор)", async () => {
              await adminAPI.assignRolesToUser(testUserId, [adminRoleId, userRoleId]);
            });

            await test.step("Открыть форму редактирования сотрудника", async () => {
              const editUrl = new URL(
                `/ru/manager/structure/users/${testUserId}/`,
                BASE_URL,
              ).toString();
              await adminAuth.goto(editUrl);
              await adminAuth.waitForURL(`**/manager/structure/users/${testUserId}/`, {
                timeout: TIMEOUTS.PAGE_LOAD,
              });
              await adminAuth.waitForLoadState("networkidle");
            });

            await test.step("Проверить что обе роли отмечены", async () => {
              await expect(
                adminAuth.getByRole("checkbox", {
                  name: "Пользователь",
                  exact: true,
                }),
              ).toBeChecked({ timeout: TIMEOUTS.MEDIUM });
              await expect(
                adminAuth.getByRole("checkbox", {
                  name: "Администратор",
                  exact: true,
                }),
              ).toBeChecked();
            });

            await test.step("Снять чекбокс Администратор (оставить только Пользователь)", async () => {
              const adminCb = adminAuth.getByRole("checkbox", {
                name: "Администратор",
                exact: true,
              });
              await adminCb.click({ force: true });
              await expect(adminCb).not.toBeChecked();

              // Пользователь остаётся отмеченным
              await expect(
                adminAuth.getByRole("checkbox", {
                  name: "Пользователь",
                  exact: true,
                }),
              ).toBeChecked();
            });

            await test.step("Сохранить изменения", async () => {
              await adminAuth
                .getByRole("button", { name: /Сохранить/i })
                .click();
              await adminAuth.waitForLoadState("networkidle");
            });

            await test.step("Проверить через API что осталась только роль Пользователь", async () => {
              const currentRoles = await adminAPI.getUserRoleIds(testUserId);
              expect(
                currentRoles,
                `Администратор (ID=${adminRoleId}) не должна быть назначена`,
              ).not.toContain(adminRoleId);
              expect(
                currentRoles,
                `Пользователь (ID=${userRoleId}) должна быть назначена`,
              ).toContain(userRoleId);
            });
          },
        );
      });
    });

    test.describe("Проверка доступов после смены роли", () => {
      test(
        'C4298: Пользователь с ролью admin видит пункт меню "Настройки"',
        { tag: ["@critical", "@smoke", "@regression"] },
        async ({ adminAuth }) => {
          setSeverity("critical");

          await test.step("Открыть главную страницу от имени администратора", async () => {
            await adminAuth.goto(`${BASE_URL}/ru`);
            await adminAuth.waitForLoadState("networkidle");
          });

          await test.step("Проверить доступ администратора к странице настроек компании", async () => {
            // Боковое меню использует только иконки — проверяем доступ напрямую по URL
            const rolesUrl = new URL("/ru/manager/company/roles", BASE_URL).toString();
            await adminAuth.goto(rolesUrl);
            await adminAuth.waitForLoadState("networkidle");
            // Если нет редиректа — доступ есть
            await expect(adminAuth).toHaveURL(/\/manager\/company\/roles/);
          });
        },
      );

      test(
        "C4299: Пользователь с ролью user НЕ видит админские пункты меню",
        { tag: ["@critical", "@security", "@regression"] },
        async ({ userAuth }) => {
          setSeverity("critical");

          await test.step("Открыть главную страницу от имени обычного пользователя", async () => {
            await userAuth.goto(`${BASE_URL}/ru`);
            await userAuth.waitForLoadState("networkidle");
          });

          await test.step("Проверить отсутствие пунктов меню управления ролями", async () => {
            // Проверяем отсутствие админских пунктов
            const adminMenuItems = userAuth
              .locator('[class*="Menu_menu-item"], [class*="MenuItem"]')
              .filter({
                hasText: /управление ролями|роли компании|roles management/i,
              });

            // Обычный пользователь не должен видеть управление ролями
            await expect(adminMenuItems).toHaveCount(0);
          });
        },
      );

      test(
        "C4300: Пользователь с ролью manager видит данные подчинённых",
        { tag: ["@regression"] },
        async ({ managerAuth }) => {
          setSeverity("normal");

          await test.step("Открыть главную страницу от имени менеджера", async () => {
            await managerAuth.goto(`${BASE_URL}/ru`);
            await managerAuth.waitForLoadState("networkidle");
          });

          await test.step('Проверить наличие раздела "Моя команда" в меню', async () => {
            // Проверяем наличие раздела "Моя команда" или подобного
            const teamSection = managerAuth
              .locator('[class*="Menu_menu-item"], [class*="MenuItem"], a')
              .filter({
                hasText: /моя команда|my team|подчинённые|team/i,
              });

            // Менеджер должен видеть раздел команды
            const count = await teamSection.count();
            expect(
              count,
              'Менеджер должен иметь доступ к разделу "Моя команда"',
            ).toBeGreaterThan(0);
          });
        },
      );
    });

    test.describe("Негативные сценарии", () => {
      test(
        "C4301: Обычный пользователь не может менять свою роль",
        { tag: ["@security", "@critical", "@regression"] },
        async ({ userAuth }) => {
          setSeverity("critical");

          await test.step("Открыть страницу собственного профиля", async () => {
            // Переходим в свой профиль
            await userAuth.goto(new URL("/ru/profile?tab=main", BASE_URL).toString());
            await userAuth.waitForLoadState("networkidle");
          });

          await test.step("Проверить отсутствие кнопки редактирования роли", async () => {
            // Ищем возможность редактирования роли
            const roleEditButton = userAuth
              .locator('button, [class*="edit"]')
              .filter({
                hasText: /изменить роль|change role|редактировать роль/i,
              });

            // Кнопка редактирования роли должна отсутствовать
            await expect(roleEditButton).toHaveCount(0);
          });
        },
      );
    });
  },
);
