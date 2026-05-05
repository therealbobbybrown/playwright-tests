import { test } from "../../../fixtures/auth.js";
import { expect } from "@playwright/test";
import { StructureDepartmentsPage } from "../../../../pages/StructureDepartmentsPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";

test.describe(
  "Орг. структура — отделы: создание подотдела",
  { tag: ["@ui", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.ORG_STRUCTURE);
    });

    test(
      "C8184: Админ создаёт подотдел внутри отдела",
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("normal");
        const deptPage = new StructureDepartmentsPage(page, testInfo);

        await test.step("Открыть страницу отделов через боковое меню", async () => {
          await deptPage.openFromSideMenu();
        });

        await test.step("Создать родительский отдел через UI", async () => {
          await deptPage.createDepartmentAndOpen();
          await deptPage.assertDepartmentDetailsElements();
        });

        await test.step(
          "Нажать «Создать новый отдел» в секции подотделов",
          async () => {
            await deptPage.departmentCreateSubButton.scrollIntoViewIfNeeded();
            await deptPage.departmentCreateSubButton.click();
            // Ждём появления подотдела в следующем шаге через expect.poll
          },
        );

        await test.step(
          "Проверить, что подотдел появился в секции «Отделы»",
          async () => {
            const subDeptCards =
              deptPage.departmentSubDepartmentsSection.locator(
                'a[href*="/departments/department/"], [class*="SectionDepartments_item"]',
              );
            await expect
              .poll(async () => subDeptCards.count(), { timeout: 10000 })
              .toBeGreaterThan(0);
          },
        );

        await test.step(
          "Удалить родительский отдел (вместе с подотделом)",
          async () => {
            await deptPage.deleteOpenedDepartment();
          },
        );
      },
    );
  },
);
