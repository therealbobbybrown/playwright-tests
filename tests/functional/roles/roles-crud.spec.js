// @ts-check
/**
 * UI тесты CRUD операций для ролей
 *
 * @tags @roles @ui @regression
 * @module Roles
 */

import { test, expect } from "../../fixtures/auth.js";
import { RolesPage } from "../../../pages/RolesPage.js";
import {
  markAsUITest,
  setSeverity,
  MODULES,
} from "../../utils/allure-helpers.js";
import { RolesAPI, getCredentials } from "../../utils/api/index.js";
import { TIMEOUTS } from "../../utils/constants.js";

/** Генерация уникального названия роли для теста */
const generateRoleName = () => `Test Role ${Date.now()}`;

/** Список созданных ролей для cleanup */
const createdRoleNames = [];

test.describe("Roles CRUD UI", { tag: ["@roles", "@ui"] }, () => {
  /** @type {RolesPage} */
  let rolesPage;
  /** @type {RolesAPI} */
  let rolesAPI;

  test.beforeEach(async ({ adminAuth, request }, testInfo) => {
    markAsUITest(MODULES.ROLES, "CRUD");
    rolesPage = new RolesPage(adminAuth, testInfo);

    // Инициализируем API клиент для cleanup
    rolesAPI = new RolesAPI(request);
    const { email, password } = getCredentials("admin");
    await rolesAPI.signIn(email, password);
  });

  test.afterEach(async () => {
    // Cleanup: удаляем созданные роли через API
    for (const roleName of createdRoleNames) {
      try {
        const { data } = await rolesAPI.getRoles({ limit: 100 });
        const role = data?.items?.find((r) => r.title === roleName);
        if (role?.id) {
          await rolesAPI.deleteRole(role.id);
        }
      } catch {
        // Роль могла быть уже удалена в тесте
      }
    }
    createdRoleNames.length = 0;
  });

  test.describe("Просмотр списка ролей", () => {
    test(
      "C4287: Страница ролей доступна для администратора",
      { tag: ["@regression", "@critical", "@ui"] },
      async () => {
        setSeverity("critical");

        await test.step("Открыть страницу управления ролями", async () => {
          await rolesPage.navigate();
          await rolesPage.assertOpened();
        });

        await test.step("Проверить отображение таблицы ролей", async () => {
          await rolesPage.assertRolesTableVisible();
        });
      },
    );

    test(
      "C4288: Кнопка создания роли видима для администратора",
      { tag: ["@regression", "@ui"] },
      async () => {
        setSeverity("normal");

        await test.step("Открыть страницу управления ролями", async () => {
          await rolesPage.navigate();
        });

        await test.step("Проверить видимость кнопки создания роли", async () => {
          await rolesPage.assertCreateButtonVisible();
        });
      },
    );

    test(
      "C4289: Таблица ролей содержит системные роли",
      { tag: ["@regression", "@ui"] },
      async () => {
        setSeverity("normal");

        await test.step("Открыть страницу управления ролями", async () => {
          await rolesPage.navigate();
        });

        await test.step("Проверить наличие ролей в таблице", async () => {
          const rolesCount = await rolesPage.getRolesCount();
          expect(
            rolesCount,
            "Таблица должна содержать хотя бы одну роль",
          ).toBeGreaterThan(0);
        });
      },
    );
  });

  test.describe("Создание роли", () => {
    test(
      "C4290: Успешное создание новой роли",
      { tag: ["@regression", "@critical", "@ui"] },
      async () => {
        setSeverity("critical");

        let roleName;

        await test.step("Подготовить данные для новой роли", async () => {
          roleName = generateRoleName();
          createdRoleNames.push(roleName); // Добавляем для cleanup
        });

        await test.step("Открыть страницу управления ролями и создать роль", async () => {
          await rolesPage.navigate();
          await rolesPage.createRole({ title: roleName });
        });

        await test.step("Проверить, что роль появилась в таблице", async () => {
          await rolesPage.assertRoleExists(roleName);
        });
      },
    );

    test(
      "C4291: Открытие и закрытие формы создания роли",
      { tag: ["@regression", "@ui"] },
      async () => {
        setSeverity("normal");

        await test.step("Открыть страницу управления ролями", async () => {
          await rolesPage.navigate();
        });

        await test.step("Открыть форму создания роли", async () => {
          await rolesPage.openCreateRoleModal();
        });

        await test.step("Закрыть форму без сохранения и проверить закрытие", async () => {
          // Закрываем без сохранения
          await rolesPage.closeModal();

          // Убеждаемся, что модалка закрылась
          await expect(rolesPage.modal).toBeHidden();
        });
      },
    );
  });

  test.describe("Редактирование роли", () => {
    /** @type {string} */
    let testRoleName;

    test.beforeEach(async () => {
      // Создаём роль для тестирования редактирования
      testRoleName = generateRoleName();
      createdRoleNames.push(testRoleName);
      await rolesPage.navigate();
      await rolesPage.createRole({ title: testRoleName });
    });

    test(
      "C4292: Успешное редактирование названия роли",
      { tag: ["@regression", "@critical", "@ui"] },
      async () => {
        setSeverity("critical");

        let newRoleName;

        await test.step("Подготовить новое название роли", async () => {
          newRoleName = `Updated ${testRoleName}`;
          // Заменяем в списке cleanup на новое имя
          const idx = createdRoleNames.indexOf(testRoleName);
          if (idx !== -1) createdRoleNames[idx] = newRoleName;
        });

        await test.step("Редактировать название роли", async () => {
          await rolesPage.editRole(testRoleName, { newTitle: newRoleName });
        });

        await test.step("Проверить, что роль с новым названием существует", async () => {
          await rolesPage.assertRoleExists(newRoleName);
        });

        await test.step("Проверить, что роль со старым названием отсутствует", async () => {
          await rolesPage.assertRoleNotExists(testRoleName);
        });
      },
    );
  });

  test.describe("Удаление роли", () => {
    /** @type {string} */
    let testRoleName;

    test.beforeEach(async () => {
      // Создаём роль для тестирования удаления
      testRoleName = generateRoleName();
      // Не добавляем в cleanup - удаление проверяется в тесте
      await rolesPage.navigate();
      await rolesPage.createRole({ title: testRoleName });
    });

    test(
      "C4293: Успешное удаление роли",
      { tag: ["@regression", "@critical", "@ui"] },
      async () => {
        setSeverity("critical");

        await test.step("Удалить роль из таблицы", async () => {
          await rolesPage.deleteRole(testRoleName);
        });

        await test.step("Проверить, что роль удалена из таблицы", async () => {
          await rolesPage.assertRoleNotExists(testRoleName);
        });
      },
    );
  });

  test.describe("Негативные сценарии", () => {
    test(
      "C4294: Создание роли с пустым названием отклоняется",
      { tag: ["@regression", "@negative", "@ui"] },
      async () => {
        setSeverity("normal");

        await test.step("Открыть страницу управления ролями", async () => {
          await rolesPage.navigate();
        });

        await test.step("Попытаться создать роль с пустым названием", async () => {
          await rolesPage.tryCreateRoleWithEmptyName();
        });

        await test.step("Проверить, что форма не закрылась (валидация сработала)", async () => {
          // Модалка должна остаться открытой
          await expect(rolesPage.modal).toBeVisible();
        });

        await test.step("Закрыть форму", async () => {
          // Закрываем модалку для cleanup
          await rolesPage.closeModal();
        });
      },
    );

    test(
      "C4295: Создание роли с дублирующим названием отклоняется",
      { tag: ["@regression", "@negative", "@ui"] },
      async () => {
        setSeverity("normal");

        let roleName;

        await test.step("Создать роль с уникальным названием", async () => {
          // Сначала создаём роль
          roleName = generateRoleName();
          createdRoleNames.push(roleName);

          await rolesPage.navigate();
          await rolesPage.createRole({ title: roleName });
        });

        await test.step("Попытаться создать роль с тем же названием", async () => {
          // Пытаемся создать дубликат
          await rolesPage.tryCreateDuplicateRole(roleName);
        });

        await test.step("Закрыть форму", async () => {
          // Закрываем модалку для cleanup
          await rolesPage.closeModal();
        });
      },
    );
  });
});

test.describe("Roles Access Control", { tag: ["@roles", "@security"] }, () => {
  test(
    "C4296: Страница ролей недоступна для обычного пользователя",
    { tag: ["@security", "@negative", "@ui", "@regression"] },
    async ({ userAuth }, testInfo) => {
      markAsUITest(MODULES.ROLES, "Access Control");
      setSeverity("critical");

      await test.step("Перейти на страницу управления ролями от имени обычного пользователя", async () => {
        // Пытаемся перейти на страницу ролей
        await userAuth.goto(new URL("/ru/manager/company/roles", process.env.BASE_URL).toString());
        await userAuth.waitForLoadState("networkidle");
      });

      await test.step("Проверить отсутствие доступа к управлению ролями", async () => {
        const currentUrl = userAuth.url();
        const isOnRolesPage = currentUrl.includes("/manager/company/roles");

        if (!isOnRolesPage) {
          // Произошёл редирект — доступ запрещён, тест пройден
          expect(isOnRolesPage, "Пользователь должен быть перенаправлен со страницы ролей").toBe(false);
        } else {
          // Если остались на странице — кнопка создания должна быть скрыта
          await expect(
            userAuth.locator('button:has-text("Создать роль")'),
            "Кнопка \"Создать роль\" не должна быть видна обычному пользователю",
          ).toBeHidden({ timeout: TIMEOUTS.SHORT });
        }
      });
    },
  );
});
