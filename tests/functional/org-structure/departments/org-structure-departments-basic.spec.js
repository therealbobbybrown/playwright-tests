// tests/org-structure-departments-basic.spec.js
import { test } from "../../../fixtures/auth.js";
import { StructureDepartmentsPage } from "../../../../pages/StructureDepartmentsPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";

test.describe(
  "Орг. структура - настройка отделов (каркас)",
  { tag: ["@ui", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.ORG_STRUCTURE);
    });

    test('C3996: Админ открывает "Настройка отделов" и видит основные элементы', async ({
      adminAuth: page,
    }, testInfo) => {
      setSeverity("normal");
      const departmentsPage = new StructureDepartmentsPage(page, testInfo);

      await test.step('Открыть страницу "Настройка отделов" через боковое меню', async () => {
        await departmentsPage.openFromSideMenu();
      });

      await test.step("Проверить основные элементы страницы", async () => {
        await departmentsPage.assertMainElementsVisible();
      });
    });
  },
);
