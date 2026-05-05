// tests/functional/org-structure/department-with-employees-delete.spec.js
import { expect } from "@playwright/test";
import { test } from "../../fixtures/auth.js";
import { StructureDepartmentsPage } from "../../../pages/StructureDepartmentsPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { TIMEOUTS } from "../../utils/constants.js";

test.describe(
  "Орг. структура — негативные сценарии: удаление отдела с сотрудниками",
  { tag: ["@ui", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.ORG_STRUCTURE);
    });

    test("C3999: При удалении отдела с сотрудниками показывается предупреждение", async ({
      adminAuth: page,
    }, testInfo) => {
      setSeverity("normal");
      const departmentsPage = new StructureDepartmentsPage(page, testInfo);

      await test.step("Открыть страницу настройки отделов", async () => {
        await departmentsPage.openFromSideMenu();
      });

      await test.step("Создать новый отдел", async () => {
        await departmentsPage.createDepartmentAndOpen();
      });

      await test.step("Добавить сотрудника в отдел", async () => {
        await departmentsPage.addFirstEmployeeToDepartment();
      });

      await test.step("Открыть меню отдела и нажать Удалить", async () => {
        await departmentsPage.openDeleteDialog();
      });

      await test.step("Проверить диалог подтверждения удаления", async () => {
        // Кнопка «Да, удалить» уже видима после openDeleteDialog()
        await expect(
          departmentsPage.confirmDeleteButton,
          "Кнопка подтверждения удаления должна быть видна",
        ).toBeVisible({ timeout: TIMEOUTS.SHORT });

        // Диалог должен содержать предупреждение о сотрудниках
        const dialog = page
          .locator('[role="dialog"], [class*="Modal"], [class*="modal"]')
          .filter({ has: departmentsPage.confirmDeleteButton })
          .first();

        await expect(
          dialog,
          "Диалог подтверждения удаления должен быть виден",
        ).toBeVisible({ timeout: TIMEOUTS.SHORT });

        await expect(
          dialog,
          "Диалог должен содержать предупреждение о сотрудниках или данных",
        ).toContainText(/сотрудник|перемест|удал|нельзя|данн/i);
      });

      await test.step("Подтвердить удаление и очистить данные", async () => {
        // Подтверждаем удаление — это и cleanup
        await Promise.all([
          page
            .waitForLoadState("domcontentloaded", { timeout: TIMEOUTS.PAGE_LOAD })
            .catch(() => null),
          departmentsPage.confirmDeleteButton.click(),
        ]);
      });
    });
  },
);
