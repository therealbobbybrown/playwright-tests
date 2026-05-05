// tests/org-structure-users-context-menu.spec.js
import { test } from "../../../fixtures/auth.js";
import { expect } from "@playwright/test";
import { StructureUsersPage } from "../../../../pages/StructureUsersPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";

test.describe(
  "Орг. структура - контекстное меню сотрудника",
  { tag: ["@ui", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.ORG_STRUCTURE);
    });

    test(
      "C8205: Админ открывает контекстное меню строки сотрудника и переходит в профиль",
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("normal");
        const usersPage = new StructureUsersPage(page, testInfo);

        await test.step('Открыть страницу "Список сотрудников" через боковое меню', async () => {
          await usersPage.openFromSideMenu();
        });

        await test.step("Дождаться загрузки строк таблицы", async () => {
          await usersPage.tableRows.first().waitFor({ state: "visible" });
        });

        let profilePage;
        await test.step("Открыть профиль через контекстное меню первой строки", async () => {
          profilePage = await usersPage.openEmployeeProfileFromContextMenu(0);
        });

        await test.step("Проверить, что URL профиля содержит числовой ID", async () => {
          expect(profilePage.url()).toMatch(/\/profile\/\d+/);
        });

        await test.step("Закрыть вкладку профиля если она открылась в новом окне", async () => {
          if (profilePage !== page) {
            await profilePage.close();
          }
        });
      },
    );
  },
);
