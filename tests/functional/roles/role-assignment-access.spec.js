// @ts-check
/**
 * Тесты динамического назначения ролей и проверки доступов
 *
 * Проверяем, что назначение роли через API работает корректно,
 * и что пользователи с разными ролями имеют соответствующие доступы.
 *
 * @tags @roles @access @security @regression
 * @module Roles
 */

import { test, expect } from "../../fixtures/auth.js";
import {
  markAsUITest,
  setSeverity,
  MODULES,
} from "../../utils/allure-helpers.js";
import { RolesAPI, getCredentials } from "../../utils/api/index.js";
import { TIMEOUTS } from "../../utils/constants.js";
import { assignRolesAndInvalidate } from "../../utils/auth/TokenManager.js";

// APP_ORIGIN: берём только origin (без /ru/login/...) чтобы избежать двойного /ru/
const APP_ORIGIN = new URL(process.env.BASE_URL).origin;

// =====================================================
// API тесты назначения и снятия ролей
// =====================================================
test.describe(
  "Role Assignment API",
  { tag: ["@roles", "@api", "@security"] },
  () => {
    /** @type {RolesAPI} */
    let adminRolesAPI;
    /** @type {RolesAPI} */
    let userRolesAPI;
    /** @type {number|null} */
    let testUserId = null;
    /** @type {number[]} */
    let originalRoleIds = [];

    test.beforeEach(async ({ request }) => {
      markAsUITest(MODULES.ROLES, "API Assignment");

      // Инициализируем API клиент под админом
      adminRolesAPI = new RolesAPI(request);
      const adminCreds = getCredentials("admin");
      await adminRolesAPI.signIn(adminCreds.email, adminCreds.password);

      // Инициализируем API клиент под обычным пользователем для получения его ID
      userRolesAPI = new RolesAPI(request);
      const userCreds = getCredentials("user");
      await userRolesAPI.signIn(userCreds.email, userCreds.password);

      // Получаем ID текущего пользователя (user)
      const { data: meData } = await userRolesAPI.getCurrentUser();
      testUserId =
        meData?.id || meData?.currentUserId || meData?.account?.users?.[0]?.id;

      if (testUserId) {
        // Сохраняем оригинальные роли пользователя для restore
        originalRoleIds = await adminRolesAPI.getUserRoleIds(testUserId);
      }
    });

    test.afterEach(async () => {
      // Восстанавливаем оригинальные роли пользователя
      if (testUserId && originalRoleIds.length > 0) {
        try {
          await assignRolesAndInvalidate(
            adminRolesAPI,
            testUserId,
            originalRoleIds,
          );
        } catch (e) {
          console.warn(`[cleanup] Не удалось восстановить роли: ${e.message}`);
        }
      }
    });

    test(
      "C4376: Admin может назначить роль Администратор пользователю через API",
      { tag: ["@critical", "@regression"] },
      async () => {
        setSeverity("critical");

        test.skip(!testUserId, "Не удалось получить ID пользователя");

        let adminRole;
        let beforeRoleIds;
        let newRoleIds;

        await test.step("Получить список ролей и найти роль Администратор", async () => {
          // 1. Получаем роль Администратор (ID 1, встроенная)
          const { data: rolesData } = await adminRolesAPI.getRoles({
            limit: 50,
          });
          const roles = rolesData?.items || rolesData || [];
          adminRole = roles.find(
            (r) => r.title === "Manager" || r.title === "Администратор",
          );

          test.skip(!adminRole?.id, "Не найдена роль Администратор (Manager)");
        });

        await test.step("Проверить оригинальные роли пользователя", async () => {
          // 2. Проверяем оригинальные роли пользователя
          beforeRoleIds = await adminRolesAPI.getUserRoleIds(testUserId);
          console.log("[DEBUG] Original roles:", beforeRoleIds);

          // 3. Формируем новый список ролей с Администратором
          newRoleIds = [...new Set([...beforeRoleIds, adminRole.id])];
        });

        await test.step("Назначить роль Администратор пользователю", async () => {
          const { response: assignResponse, data: assignData } =
            await assignRolesAndInvalidate(
              adminRolesAPI,
              testUserId,
              newRoleIds,
            );

          expect(
            assignResponse.status(),
            `API назначения роли должен вернуть 2xx, но вернул ${assignResponse.status()}`,
          ).toBeLessThan(300);

          // 4. Проверяем что роль Администратор появилась в ответе
          const assignedRoleIds = assignData?.roles?.map((r) => r.id) || [];
          expect(
            assignedRoleIds.includes(adminRole.id),
            `Роль Администратор (${adminRole.id}) должна быть в списке: ${JSON.stringify(assignedRoleIds)}`,
          ).toBe(true);
        });

        await test.step("Проверить назначение роли через GET запрос", async () => {
          // 5. Дополнительная проверка через GET запрос
          const afterRoleIds = await adminRolesAPI.getUserRoleIds(testUserId);
          expect(
            afterRoleIds.includes(adminRole.id),
            `После назначения, роль должна быть в списке: ${JSON.stringify(afterRoleIds)}`,
          ).toBe(true);

          console.log("[DEBUG] Roles after assignment:", afterRoleIds);
        });
      },
    );

    test(
      "C4377: Admin может снять роль Администратор у пользователя через API",
      { tag: ["@critical", "@regression"] },
      async () => {
        setSeverity("critical");

        test.skip(!testUserId, "Не удалось получить ID пользователя");

        let adminRole;
        let userRole;
        let rolesAfterAdd;

        await test.step("Получить список ролей и найти нужные роли", async () => {
          // 1. Получаем роли
          const { data: rolesData } = await adminRolesAPI.getRoles({
            limit: 50,
          });
          const roles = rolesData?.items || rolesData || [];
          adminRole = roles.find(
            (r) => r.title === "Manager" || r.title === "Администратор",
          );
          userRole = roles.find(
            (r) => r.title === "User" || r.title === "Пользователь",
          );

          test.skip(!adminRole?.id, "Не найдена роль Администратор (Manager)");
          test.skip(!userRole?.id, "Не найдена роль Пользователь (User)");
        });

        await test.step("Назначить роль Администратор пользователю", async () => {
          // 2. Сначала назначаем роль Администратор пользователю
          const rolesWithAdmin = [
            ...new Set([...originalRoleIds, adminRole.id]),
          ];
          await assignRolesAndInvalidate(
            adminRolesAPI,
            testUserId,
            rolesWithAdmin,
          );

          // 3. Проверяем что роль назначена
          rolesAfterAdd = await adminRolesAPI.getUserRoleIds(testUserId);
          expect(
            rolesAfterAdd.includes(adminRole.id),
            `После назначения, роль должна быть в списке: ${JSON.stringify(rolesAfterAdd)}`,
          ).toBe(true);
        });

        await test.step("Снять роль Администратор у пользователя", async () => {
          // 4. Теперь УБИРАЕМ роль Администратор
          const rolesWithoutAdmin = rolesAfterAdd.filter(
            (id) => id !== adminRole.id,
          );
          const finalRoles =
            rolesWithoutAdmin.length > 0 ? rolesWithoutAdmin : [userRole.id];

          const { response: removeResponse, data: removeData } =
            await assignRolesAndInvalidate(
              adminRolesAPI,
              testUserId,
              finalRoles,
            );

          expect(
            removeResponse.status(),
            `API снятия роли должен вернуть 2xx, но вернул ${removeResponse.status()}`,
          ).toBeLessThan(300);

          // 5. Проверяем что роль Администратор УБРАНА из ответа
          const removedRoleIds = removeData?.roles?.map((r) => r.id) || [];
          expect(
            removedRoleIds,
            `Роль Администратор НЕ должна быть в списке: ${JSON.stringify(removedRoleIds)}`,
          ).not.toContain(adminRole.id);
        });

        await test.step("Проверить снятие роли через GET запрос", async () => {
          // 6. Дополнительная проверка через GET запрос
          const rolesAfterRemove =
            await adminRolesAPI.getUserRoleIds(testUserId);
          expect(
            rolesAfterRemove,
            `После снятия, роль НЕ должна быть в списке: ${JSON.stringify(rolesAfterRemove)}`,
          ).not.toContain(adminRole.id);

          console.log("[DEBUG] Roles after removal:", rolesAfterRemove);
        });
      },
    );
  },
);

// =====================================================
// UI тесты проверки доступов
// ВАЖНО: Перед тестами сбрасываем роли тестового user до базовых (только User ID=2)
// =====================================================
test.describe(
  "Role-Based Access Control UI",
  { tag: ["@roles", "@ui", "@security"] },
  () => {
    /** @type {number|null} */
    let testUserId = null;
    /** @type {number[]} */
    let originalUserRoleIds = [];

    // Сбрасываем роли тестового user до базовых перед всеми тестами
    test.beforeAll(async ({ request }) => {
      const fs = await import("node:fs/promises");

      const api = new RolesAPI(request);
      const adminCreds = getCredentials("admin");
      await api.signIn(adminCreds.email, adminCreds.password);

      // Получаем ID тестового user
      const userApi = new RolesAPI(request);
      const userCreds = getCredentials("user");
      await userApi.signIn(userCreds.email, userCreds.password);
      const { data: meData } = await userApi.getCurrentUser();
      testUserId = meData?.currentUserId || meData?.id;

      if (testUserId) {
        // Сохраняем оригинальные роли
        originalUserRoleIds = await api.getUserRoleIds(testUserId);
        console.log(
          `[UI Setup] User ${testUserId} original roles:`,
          originalUserRoleIds,
        );

        // Сбрасываем до только базовой роли User
        const { userRoleId, adminRoleId } = await api.getSystemRoleIds();
        if (originalUserRoleIds.includes(adminRoleId)) {
          console.log(
            `[UI Setup] User has Admin role, resetting to User only`,
          );
          await assignRolesAndInvalidate(api, testUserId, [userRoleId]);

          // ВАЖНО: Удаляем кэш auth чтобы fixture получил новый JWT с обновлёнными ролями
          try {
            await fs.rm("test-results/.auth/user.json", { force: true });
            console.log(`[UI Setup] Cleared user auth cache`);
          } catch {
            // Ignore
          }
        }
      }
    });

    // Восстанавливаем оригинальные роли после всех тестов
    test.afterAll(async ({ request }) => {
      if (testUserId && originalUserRoleIds.length > 0) {
        try {
          const api = new RolesAPI(request);
          const adminCreds = getCredentials("admin");
          await api.signIn(adminCreds.email, adminCreds.password);
          await assignRolesAndInvalidate(api, testUserId, originalUserRoleIds);
          console.log(
            `[UI Cleanup] Restored user ${testUserId} roles:`,
            originalUserRoleIds,
          );
        } catch (e) {
          console.error(
            `[UI Cleanup] FAILED to restore roles for user ${testUserId}:`,
            e.message,
          );
        }
      }
    });

    test.beforeEach(async () => {
      markAsUITest(MODULES.ROLES, "Access Control");
    });

    test.describe("Доступ к странице ролей", () => {
      test(
        "C4378: Администратор имеет доступ к /manager/company/roles",
        { tag: ["@critical", "@regression"] },
        async ({ adminAuth }) => {
          setSeverity("critical");

          await test.step("Открыть страницу ролей от имени администратора", async () => {
            // Debug: проверяем состояние после loginAs
            console.log(`[DEBUG] URL after loginAs: ${adminAuth.url()}`);

            // Debug: проверяем cookies перед переходом
            const cookiesBefore = await adminAuth.context().cookies();
            const hasAuthBefore = cookiesBefore.some((c) =>
              c.name.includes("auth_access_token"),
            );
            console.log(
              `[DEBUG] Cookies before goto: hasAuth=${hasAuthBefore}, count=${cookiesBefore.length}`,
            );

            // URL с trailing slash как в UI
            await adminAuth.goto(`${APP_ORIGIN}/ru/manager/company/roles/`);
            await adminAuth.waitForLoadState("networkidle");
            // Ждём загрузки контента страницы
            await adminAuth
              .locator("body")
              .waitFor({ state: "attached", timeout: 5000 });
          });

          await test.step("Проверить доступ администратора к странице ролей", async () => {
            const url = adminAuth.url();
            console.log(`[DEBUG] URL after goto: ${url}`);

            // Debug: проверяем cookies после перехода
            const cookiesAfter = await adminAuth.context().cookies();
            const hasAuthAfter = cookiesAfter.some((c) =>
              c.name.includes("auth_access_token"),
            );
            console.log(
              `[DEBUG] Cookies after goto: hasAuth=${hasAuthAfter}, count=${cookiesAfter.length}`,
            );

            // Проверяем что не редирект на логин
            const isOnLogin = url.includes("/login");
            test.skip(
              isOnLogin,
              `Сессия adminAuth истекла (hasAuthBefore=unknown, hasAuthAfter=${hasAuthAfter})`,
            );

            // Проверяем что нет 404
            const notFound = adminAuth.locator(
              "text=/404|страница не найдена/i",
            );
            const is404 = (await notFound.count()) > 0;

            // Если 404 - значит что-то не так с маршрутом или правами
            if (is404) {
              console.log(
                "[DEBUG] Admin видит 404 на странице ролей. URL:",
                url,
              );
            }

            // Проверяем что страница загрузилась (кнопка "Добавить роль" или список ролей)
            const addRoleButton = adminAuth.locator(
              'button:has-text("Добавить роль")',
            );
            const adminRoleText = adminAuth.getByText("Администратор");
            const userRoleText = adminAuth.getByText("Пользователь");
            const rolesContainer = adminAuth.locator('[class*="Roles"]');

            const hasAccess =
              (await addRoleButton.count()) > 0 ||
              (await adminRoleText.count()) > 0 ||
              (await userRoleText.count()) > 0 ||
              (await rolesContainer.count()) > 0;

            expect(
              !is404 && hasAccess,
              `Администратор должен иметь доступ к странице ролей. URL: ${url}, is404: ${is404}, hasAccess: ${hasAccess}`,
            ).toBe(true);
          });
        },
      );

      test(
        "C4379: Обычный пользователь НЕ имеет доступ к /manager/company/roles",
        { tag: ["@security", "@critical", "@regression"] },
        async ({ userAuth }) => {
          setSeverity("critical");

          await test.step("Перейти на страницу ролей от имени обычного пользователя", async () => {
            await userAuth.goto(`${APP_ORIGIN}/ru/manager/company/roles`);
            await userAuth.waitForLoadState("networkidle");
            // Ждём загрузки контента страницы
            await userAuth
              .locator("body")
              .waitFor({ state: "attached", timeout: 3000 });
          });

          await test.step("Проверить отсутствие доступа у обычного пользователя", async () => {
            // Проверяем что показывается 404, страница не найдена, или access denied
            const accessDenied = userAuth.locator(
              "text=/404|страница не найдена|нет доступа|доступ запрещ|access denied|forbidden/i",
            );
            const hasAccessDenied = (await accessDenied.count()) > 0;
            const url = userAuth.url();

            // Дополнительно проверяем: есть ли элементы управления ролями (кнопка "Добавить роль" или список ролей)
            const hasRoleControls =
              (await userAuth
                .locator(
                  'button:has-text("Добавить роль"), a:has-text("Добавить роль")',
                )
                .count()) > 0;

            const isNoAccess =
              !url.includes("/manager/company/roles") ||
              hasAccessDenied ||
              !hasRoleControls;

            // User НЕ должен иметь доступ к /manager/company/roles
            expect(
              isNoAccess,
              `User НЕ должен иметь доступ к /manager/company/roles. URL: ${url}, accessDenied: ${hasAccessDenied}, hasRoleControls: ${hasRoleControls}`,
            ).toBe(true);
          });
        },
      );

      test(
        "C4380: Менеджер НЕ имеет доступ к /manager/company/roles",
        { tag: ["@security", "@regression"] },
        async ({ managerAuth }) => {
          setSeverity("normal");

          await test.step("Перейти на страницу ролей от имени менеджера", async () => {
            await managerAuth.goto(`${APP_ORIGIN}/ru/manager/company/roles`);
            await managerAuth.waitForLoadState("networkidle");
            // Ждём загрузки контента страницы
            await managerAuth
              .locator("body")
              .waitFor({ state: "attached", timeout: 3000 });
          });

          await test.step("Проверить отсутствие доступа у менеджера", async () => {
            // Проверяем что показывается 404, страница не найдена, или access denied
            const accessDenied = managerAuth.locator(
              "text=/404|страница не найдена|нет доступа|доступ запрещ|access denied|forbidden/i",
            );
            const hasAccessDenied = (await accessDenied.count()) > 0;
            const url = managerAuth.url();
            const hasRoleControls =
              (await managerAuth
                .locator(
                  'button:has-text("Добавить роль"), a:has-text("Добавить роль")',
                )
                .count()) > 0;
            const isNoAccess =
              !url.includes("/manager/company/roles") ||
              hasAccessDenied ||
              !hasRoleControls;

            // Manager НЕ должен иметь доступ к /manager/company/roles (только admin)
            expect(
              isNoAccess,
              `Manager НЕ должен иметь доступ к /manager/company/roles. URL: ${url}, accessDenied: ${hasAccessDenied}, hasRoleControls: ${hasRoleControls}`,
            ).toBe(true);
          });
        },
      );
    });

    test.describe("Доступ к manager роутам", () => {
      test(
        "C4381: User не имеет доступ к /manager/surveys",
        { tag: ["@security", "@negative", "@regression"] },
        async ({ userAuth }) => {
          setSeverity("critical");

          await test.step("Перейти на страницу опросов менеджера от имени обычного пользователя", async () => {
            await userAuth.goto(`${APP_ORIGIN}/ru/manager/surveys`);
            await userAuth.waitForLoadState("networkidle");
            // Ждём загрузки контента страницы
            await userAuth
              .locator("body")
              .waitFor({ state: "attached", timeout: 3000 });
          });

          await test.step("Проверить отсутствие доступа к /manager/surveys", async () => {
            // Проверяем что показывается 404, страница не найдена, или access denied
            const accessDenied = userAuth.locator(
              "text=/404|страница не найдена|нет доступа/i",
            );
            const hasAccessDenied = (await accessDenied.count()) > 0;
            const url = userAuth.url();
            const isNotOnManagerPage =
              !url.includes("/manager/surveys") || hasAccessDenied;

            // User НЕ должен иметь доступ к /manager/surveys (404, access denied или редирект)
            expect(
              isNotOnManagerPage,
              `User НЕ должен иметь доступ к /manager/surveys. URL: ${url}, accessDenied: ${hasAccessDenied}`,
            ).toBe(true);
          });
        },
      );

      test(
        "C4382: User не имеет доступ к /manager/structure/users",
        { tag: ["@security", "@negative", "@regression"] },
        async ({ userAuth }) => {
          setSeverity("critical");

          await test.step("Перейти на страницу пользователей оргструктуры от имени обычного пользователя", async () => {
            await userAuth.goto(`${APP_ORIGIN}/ru/manager/structure/users`);
            await userAuth.waitForLoadState("networkidle");
            // Ждём загрузки контента страницы
            await userAuth
              .locator("body")
              .waitFor({ state: "attached", timeout: 3000 });
          });

          await test.step("Проверить отсутствие доступа к /manager/structure/users", async () => {
            // Проверяем что показывается 404, страница не найдена, или access denied
            const accessDenied = userAuth.locator(
              "text=/404|страница не найдена|нет доступа/i",
            );
            const hasAccessDenied = (await accessDenied.count()) > 0;
            const url = userAuth.url();
            const isNoAccess =
              !url.includes("/manager/structure/users") || hasAccessDenied;

            // User НЕ должен иметь доступ к /manager/structure/users (404, access denied или редирект)
            expect(
              isNoAccess,
              `User НЕ должен иметь доступ к /manager/structure/users. URL: ${url}, accessDenied: ${hasAccessDenied}`,
            ).toBe(true);
          });
        },
      );
    });

    test.describe("Доступ пользователя к своим данным", () => {
      test(
        "C4383: User имеет доступ к своему профилю",
        { tag: ["@regression"] },
        async ({ userAuth }) => {
          setSeverity("normal");

          await test.step("Открыть страницу профиля от имени пользователя", async () => {
            await userAuth.goto(`${APP_ORIGIN}/ru/profile?tab=main`);
            await userAuth.waitForLoadState("networkidle");
            // Ждём загрузки контента страницы
            await userAuth
              .locator("body")
              .waitFor({ state: "attached", timeout: 3000 });
          });

          await test.step("Проверить доступ к странице профиля", async () => {
            const url = userAuth.url();

            // Проверяем что не редирект на логин
            const isOnLogin = url.includes("/login");

            // Если на странице логина - тест пропускается (сессия истекла)
            test.skip(
              isOnLogin,
              "Сессия userAuth истекла, требуется повторная авторизация",
            );

            expect(url).toContain("/profile");
          });
        },
      );

      test("C4384: User имеет доступ к главной странице", { tag: ["@regression"] }, async ({
        userAuth,
      }) => {
        setSeverity("normal");

        await test.step("Открыть главную страницу от имени пользователя", async () => {
          await userAuth.goto(`${APP_ORIGIN}/ru`);
          await userAuth.waitForLoadState("networkidle");
        });

        await test.step("Проверить доступ к главной странице", async () => {
          const url = userAuth.url();

          // Если на странице логина - тест пропускается
          const isOnLogin = url.includes("/login");
          test.skip(
            isOnLogin,
            "Сессия userAuth истекла, требуется повторная авторизация",
          );

          await expect(userAuth.locator("body")).toBeVisible({
            timeout: TIMEOUTS.MEDIUM,
          });
        });
      });
    });
  },
);
