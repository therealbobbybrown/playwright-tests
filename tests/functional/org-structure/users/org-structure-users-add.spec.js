// tests/org-structure-users-add.spec.js
import { test } from "../../../fixtures/auth.js";
import { StructureUserAddPage } from "../../../../pages/StructureUserAddPage.js";
import { StructureUsersPage } from "../../../../pages/StructureUsersPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";

test.describe(
  "Орг. структура - добавление сотрудника",
  { tag: ["@ui", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.ORG_STRUCTURE);
    });

    test(
      "C3525: Админ открывает форму добавления сотрудника и заполняет ее",
      { tag: ["@critical"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("critical");
        const addUserPage = new StructureUserAddPage(page, testInfo);
        const usersPage = new StructureUsersPage(page, testInfo);
        const timestamp = Date.now();
        const email = `qaadmin+${timestamp}@example.org`;
        const lastName = `Сотрудник ${timestamp}`;

        await test.step('Открыть страницу "Добавить сотрудника" через боковое меню', async () => {
          await addUserPage.openFromSideMenu();
        });

        await test.step("Проверить элементы формы добавления сотрудника", async () => {
          await addUserPage.assertFormElementsVisible();
        });

        await test.step("Заполнить форму добавления сотрудника", async () => {
          await addUserPage.fillRequiredFields({
            email,
            firstName: "Автотест",
            lastName,
            jobTitle: "Инженер по тестированию",
          });
        });

        await test.step("Выбрать руководителя из списка", async () => {
          await addUserPage.selectRandomManager();
        });

        await test.step("Выбрать отдел из списка", async () => {
          await addUserPage.selectRandomDepartment();
        });

        await test.step('Выбрать роль "Пользователь"', async () => {
          await addUserPage.selectUserRole();
        });

        await test.step('Нажать "Создать"', async () => {
          await addUserPage.submitForm();
        });

        await test.step("Проверить, что сотрудник появился в таблице", async () => {
          await page.waitForURL(/\/manager\/structure\/users(\/|\?|$)/, {
            timeout: 25_000,
          });
          await usersPage.assertUserInTableByEmail(email);
        });
      },
    );
  },
);
