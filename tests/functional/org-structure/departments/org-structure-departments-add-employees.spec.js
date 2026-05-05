import { test } from "../../../fixtures/auth.js";
import { expect } from "@playwright/test";
import { StructureDepartmentsPage } from "../../../../pages/StructureDepartmentsPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";

test.describe(
  "Орг. структура — отделы: добавление сотрудников",
  { tag: ["@ui", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.ORG_STRUCTURE);
    });

    test(
      "C8182: Админ добавляет сотрудника в отдел",
      { tag: ["@critical"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("critical");
        const deptPage = new StructureDepartmentsPage(page, testInfo);

        await test.step("Открыть страницу отделов через боковое меню", async () => {
          await deptPage.openFromSideMenu();
        });

        await test.step("Создать новый отдел и открыть его", async () => {
          await deptPage.createDepartmentAndOpen();
          await deptPage.assertDepartmentDetailsElements();
        });

        await test.step("Добавить первого доступного сотрудника в отдел", async () => {
          await deptPage.addFirstEmployeeToDepartment();
        });

        await test.step("Проверить, что сотрудник добавлен", async () => {
          const count = await deptPage.departmentEmployeeCards.count();
          expect(count, "В отделе должен быть хотя бы 1 сотрудник").toBeGreaterThan(0);
        });

        await test.step("Удалить созданный отдел (очистка)", async () => {
          await deptPage.deleteOpenedDepartment();
        });
      },
    );
  },
);
