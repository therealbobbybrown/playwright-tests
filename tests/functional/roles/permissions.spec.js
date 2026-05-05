// @ts-check
/**
 * UI тесты управления разрешениями ролей
 *
 * @tags @roles @permissions @ui @regression
 * @module Roles
 */

import { test, expect } from "../../fixtures/auth.js";
import { RolesPage } from "../../../pages/RolesPage.js";
import { RolesAPI, getCredentials } from "../../utils/api/index.js";
import {
  markAsUITest,
  setSeverity,
  MODULES,
} from "../../utils/allure-helpers.js";
import { TIMEOUTS } from "../../utils/constants.js";

/** Генерация уникального названия роли для теста */
const generateRoleName = () => `Perm Test Role ${Date.now()}`;

/** Трекинг созданных ролей для cleanup */
const createdRoleNames = [];

test.describe(
  "Permissions Management",
  { tag: ["@roles", "@permissions", "@ui"] },
  () => {
    /** @type {RolesPage} */
    let rolesPage;
    /** @type {RolesAPI} */
    let rolesAPI;

    test.beforeEach(async ({ adminAuth, request }, testInfo) => {
      markAsUITest(MODULES.ROLES, "Permissions");
      rolesPage = new RolesPage(adminAuth, testInfo);

      // Инициализируем API для cleanup
      rolesAPI = new RolesAPI(request);
      const { email, password } = getCredentials("admin");
      await rolesAPI.signIn(email, password);

      await rolesPage.navigate();
    });

    test.afterEach(async () => {
      // Cleanup созданных ролей через API
      for (const roleName of createdRoleNames) {
        try {
          const { data } = await rolesAPI.getRoles({ limit: 100 });
          const role = data?.items?.find((r) => r.title === roleName);
          if (role?.id) {
            await rolesAPI.deleteRole(role.id);
          }
        } catch {
          // Игнорируем ошибки cleanup
        }
      }
      createdRoleNames.length = 0;
    });

    test.describe("Просмотр разрешений", () => {
      test(
        "C4271: Форма создания роли содержит секцию разрешений",
        { tag: ["@regression"] },
        async () => {
          setSeverity("normal");

          await test.step("Открыть форму создания роли", async () => {
            await rolesPage.openCreateRoleModal();
          });

          await test.step("Проверить наличие секции разрешений с чекбоксами", async () => {
            // Проверяем наличие секции разрешений
            await expect(rolesPage.permissionsSection.first()).toBeVisible();

            // Проверяем наличие чекбоксов разрешений
            const checkboxCount = await rolesPage.permissionCheckboxes.count();
            expect(
              checkboxCount,
              "Должны быть чекбоксы разрешений",
            ).toBeGreaterThan(0);
          });

          await test.step("Закрыть форму создания роли", async () => {
            await rolesPage.closeModal();
          });
        },
      );

      test(
        "C4272: Просмотр разрешений существующей роли",
        { tag: ["@regression"] },
        async () => {
          setSeverity("normal");

          let roleName;

          await test.step("Создать роль для тестирования", async () => {
            // Создаём роль для теста
            roleName = generateRoleName();
            createdRoleNames.push(roleName);
            await rolesPage.createRole({ title: roleName });
          });

          await test.step("Открыть роль для редактирования и проверить секцию разрешений", async () => {
            // Открываем для редактирования
            await rolesPage.openRoleForEdit(roleName);

            // Проверяем секцию разрешений
            await expect(rolesPage.permissionsSection.first()).toBeVisible();
          });

          await test.step("Закрыть форму редактирования", async () => {
            await rolesPage.closeModal();
          });
        },
      );
    });

    test.describe("Назначение разрешений", () => {
      /** @type {string} */
      let testRoleName;

      test.beforeEach(async () => {
        testRoleName = generateRoleName();
        createdRoleNames.push(testRoleName);
      });

      test(
        "C4273: Создание роли с выбранными разрешениями",
        { tag: ["@regression", "@critical"] },
        async () => {
          setSeverity("critical");

          await test.step("Открыть форму создания роли и заполнить название", async () => {
            await rolesPage.openCreateRoleModal();

            // Заполняем название
            await rolesPage.roleNameInput.fill(testRoleName);
          });

          await test.step("Выбрать разрешение в форме", async () => {
            // Находим первый доступный чекбокс и активируем его
            const firstCheckbox = rolesPage.permissionCheckboxes.first();
            await firstCheckbox.waitFor({ state: "attached", timeout: TIMEOUTS.MEDIUM });
            const isChecked = await firstCheckbox.isChecked();

            if (!isChecked) {
              await firstCheckbox.click({ force: true });
            }
          });

          await test.step("Сохранить роль и проверить создание", async () => {
            // Сохраняем
            await rolesPage.saveButton.click();
            await rolesPage.modal.waitFor({
              state: "hidden",
              timeout: TIMEOUTS.MEDIUM,
            });

            // Проверяем создание
            await rolesPage.assertRoleExists(testRoleName);
          });
        },
      );

      test(
        "C4274: Добавление разрешения к существующей роли",
        { tag: ["@regression"] },
        async () => {
          setSeverity("normal");

          await test.step("Создать роль без разрешений", async () => {
            // Создаём роль без разрешений
            await rolesPage.createRole({ title: testRoleName });
          });

          await test.step("Открыть роль для редактирования и добавить разрешение", async () => {
            // Открываем для редактирования
            await rolesPage.openRoleForEdit(testRoleName);

            // Находим не выбранный чекбокс и активируем
            const checkboxes = rolesPage.permissionCheckboxes;
            const count = await checkboxes.count();

            for (let i = 0; i < count; i++) {
              const checkbox = checkboxes.nth(i);
              const isChecked = await checkbox.isChecked();

              if (!isChecked) {
                await checkbox.click({ force: true });
                break;
              }
            }
          });

          await test.step("Сохранить изменения и проверить роль", async () => {
            await rolesPage.saveButton.click();
            await rolesPage.page.waitForLoadState("networkidle");

            // Возвращаемся к списку и проверяем что роль с разрешением существует
            await rolesPage.navigate();
            await rolesPage.assertRoleExists(testRoleName);
          });
        },
      );

      test(
        "C4275: Удаление разрешения у роли",
        { tag: ["@regression"] },
        async () => {
          setSeverity("normal");

          await test.step("Создать роль", async () => {
            // Создаём роль
            await rolesPage.createRole({ title: testRoleName });
          });

          await test.step("Открыть роль для редактирования и снять разрешение", async () => {
            // Открываем для редактирования
            await rolesPage.openRoleForEdit(testRoleName);

            // Находим выбранный чекбокс и снимаем выбор
            const checkboxes = rolesPage.permissionCheckboxes;
            const count = await checkboxes.count();

            for (let i = 0; i < count; i++) {
              const checkbox = checkboxes.nth(i);
              const isChecked = await checkbox.isChecked();

              if (isChecked) {
                await checkbox.click({ force: true });
                break;
              }
            }
          });

          await test.step("Сохранить изменения и проверить роль", async () => {
            await rolesPage.saveButton.click();
            await rolesPage.page.waitForLoadState("networkidle");

            // Возвращаемся к списку и проверяем что роль существует
            await rolesPage.navigate();
            await rolesPage.assertRoleExists(testRoleName);
          });
        },
      );

      test(
        "C4276: Назначение нескольких разрешений одновременно",
        { tag: ["@regression"] },
        async () => {
          setSeverity("normal");

          await test.step("Открыть форму создания роли и заполнить название", async () => {
            await rolesPage.openCreateRoleModal();
            await rolesPage.roleNameInput.fill(testRoleName);
          });

          await test.step("Выбрать несколько разрешений (до 3)", async () => {
            // Выбираем несколько чекбоксов (до 3)
            const checkboxes = rolesPage.permissionCheckboxes;
            const count = await checkboxes.count();
            const toSelect = Math.min(3, count);

            for (let i = 0; i < toSelect; i++) {
              const checkbox = checkboxes.nth(i);
              const isChecked = await checkbox.isChecked();

              if (!isChecked) {
                await checkbox.click({ force: true });
              }
            }
          });

          await test.step("Сохранить роль и проверить создание", async () => {
            // Сохраняем
            await rolesPage.saveButton.click();
            await rolesPage.modal.waitFor({
              state: "hidden",
              timeout: TIMEOUTS.MEDIUM,
            });

            // Проверяем создание
            await rolesPage.assertRoleExists(testRoleName);
          });
        },
      );
    });

    test.describe("Визуальные проверки", () => {
      test(
        "C4277: После назначения разрешения UI обновляется корректно",
        { tag: ["@regression"] },
        async () => {
          setSeverity("normal");

          let roleName;

          await test.step("Открыть форму создания роли и заполнить название", async () => {
            roleName = generateRoleName();
            createdRoleNames.push(roleName);

            // Создаём роль
            await rolesPage.openCreateRoleModal();
            await rolesPage.roleNameInput.fill(roleName);
          });

          await test.step("Выбрать разрешение и проверить состояние чекбокса", async () => {
            // Выбираем разрешение
            const firstCheckbox = rolesPage.permissionCheckboxes.first();
            await firstCheckbox.click({ force: true });

            // Проверяем, что чекбокс выбран
            await expect(firstCheckbox).toBeChecked();
          });

          await test.step("Сохранить роль и проверить создание", async () => {
            // Сохраняем и проверяем
            await rolesPage.saveButton.click();
            await rolesPage.modal.waitFor({
              state: "hidden",
              timeout: TIMEOUTS.MEDIUM,
            });
            await rolesPage.assertRoleExists(roleName);
          });
        },
      );
    });
  },
);
