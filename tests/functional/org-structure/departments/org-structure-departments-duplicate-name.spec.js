import { test } from "../../../fixtures/auth.js";
import { expect } from "@playwright/test";
import { StructureDepartmentsPage } from "../../../../pages/StructureDepartmentsPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";

test.describe(
  "Орг. структура — отделы: создание отдела с дублирующимся именем",
  { tag: ["@ui", "@negative", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.ORG_STRUCTURE);
    });

    test(
      "C8183: Админ создаёт два отдела с одинаковым именем",
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("normal");
        const deptPage = new StructureDepartmentsPage(page, testInfo);
        const sharedName = `Автотест дубликат ${Date.now()}`;

        await test.step("Открыть страницу отделов", async () => {
          await deptPage.openFromSideMenu();
        });

        await test.step("Создать первый отдел", async () => {
          await deptPage.createDepartmentAndOpen();
          await deptPage.renameOpenedDepartment(sharedName);
        });

        await test.step(
          "Создать второй отдел с тем же именем",
          async () => {
            await deptPage.createDepartmentAndOpen();
            await deptPage.renameOpenedDepartment(sharedName);
          },
        );

        await test.step(
          "Проверить результат: отдел создан с таким же именем или ошибка",
          async () => {
            // Проверяем текущее название — должно быть sharedName (дубликаты разрешены)
            // или ошибка валидации
            const titleText = await deptPage.departmentTitleText
              .textContent()
              .catch(() => "");

            const errorEl = page
              .locator('[class*="error" i], [class*="Error"]')
              .first();
            const hasError = await errorEl
              .waitFor({ state: "visible", timeout: 2000 })
              .then(() => true)
              .catch(() => false);

            if (hasError) {
              // Ошибка — дубликаты запрещены, проверяем текст ошибки
              const errorText = await errorEl.textContent();
              expect(errorText.length).toBeGreaterThan(0);
            } else {
              // Дубликаты разрешены — проверяем что название совпадает
              expect(titleText).toContain(sharedName);
            }
          },
        );

        await test.step("Удалить второй отдел", async () => {
          await deptPage.deleteOpenedDepartment();
        });

        await test.step("Удалить первый отдел", async () => {
          await deptPage.openDepartmentByName(sharedName);
          await deptPage.deleteOpenedDepartment();
        });
      },
    );
  },
);
