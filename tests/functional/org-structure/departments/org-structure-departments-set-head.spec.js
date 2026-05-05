import { test } from "../../../fixtures/auth.js";
import { expect } from "@playwright/test";
import { StructureDepartmentsPage } from "../../../../pages/StructureDepartmentsPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";

test.describe(
  "Орг. структура — отделы: назначение руководителя",
  { tag: ["@ui", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.ORG_STRUCTURE);
    });

    test(
      "C8185: Админ назначает руководителя отдела через контекстное меню сотрудника",
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

        await test.step("Добавить первого сотрудника в отдел", async () => {
          await deptPage.addFirstEmployeeToDepartment();
        });

        await test.step("Проверить, что сотрудник добавлен", async () => {
          const count = await deptPage.departmentEmployeeCards.count();
          expect(count).toBeGreaterThan(0);
        });

        await test.step(
          "Назначить сотрудника руководителем через контекстное меню",
          async () => {
            // Три точки на первой карточке сотрудника
            const firstCard = deptPage.departmentEmployeeCards.first();
            const menuBtn = firstCard
              .locator(
                'button[class*="MenuPopupToggle_button"], button:has(svg)',
              )
              .last();
            await menuBtn.waitFor({ state: "visible", timeout: 5000 });
            await menuBtn.click();

            // Кликаем "Назначить руководителем" — это пункт меню (menuitem или div с toggle)
            const setHeadItem = page
              .locator('[role="menuitem"]:has-text("Назначить руководителем")')
              .first()
              .or(page.getByText(/назначить руководителем/i).first());
            await setHeadItem.waitFor({ state: "visible", timeout: 5000 });
            await setHeadItem.click();
            // Ждём появления "Руководитель:" под заголовком
            await page
              .locator('text=/Руководитель/i')
              .first()
              .waitFor({ state: "visible", timeout: 10000 });
          },
        );

        await test.step(
          "Проверить, что руководитель отображается под названием отдела",
          async () => {
            // "Руководитель: ..." появляется под заголовком отдела
            const headLabel = page
              .locator('text=/Руководитель/i')
              .first();
            await headLabel.waitFor({ state: "visible", timeout: 10000 });
            await expect(headLabel).toBeVisible();
          },
        );

        await test.step("Удалить созданный отдел (очистка)", async () => {
          await deptPage.deleteOpenedDepartment();
        });
      },
    );
  },
);
