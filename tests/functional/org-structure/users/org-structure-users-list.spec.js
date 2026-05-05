// tests/org-structure-users.spec.js
import { test } from "../../../fixtures/auth.js";
import { StructureUsersPage } from "../../../../pages/StructureUsersPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";

test.describe(
  "Орг. структура - список сотрудников",
  { tag: ["@ui", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.ORG_STRUCTURE);
    });

    test(
      'C4004: Админ открывает "Список сотрудников" и видит основные элементы',
      { tag: ["@smoke"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("critical");
        const usersPage = new StructureUsersPage(page, testInfo);

        await test.step('Открыть страницу "Список сотрудников" через боковое меню', async () => {
          await usersPage.openFromSideMenu();
        });

        await test.step("Проверить основные элементы списка сотрудников", async () => {
          await usersPage.assertMainElementsVisible();
        });

        await test.step("Перебрать пресеты фильтров списка сотрудников", async () => {
          await usersPage.iterateFilterPresets();
        });
      },
    );
  },
);
