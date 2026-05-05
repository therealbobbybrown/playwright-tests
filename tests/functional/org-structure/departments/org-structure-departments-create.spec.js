// tests/org-structure-departments-create.spec.js
import { test } from "../../../fixtures/auth.js";
import { StructureDepartmentsPage } from "../../../../pages/StructureDepartmentsPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";

test.describe(
  "Орг. структура - создание нового отдела",
  { tag: ["@ui", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.ORG_STRUCTURE);
    });

    test(
      "C3515: Админ создаёт новый отдел, открывает и переименовывает его",
      { tag: ["@smoke", "@critical"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("critical");
        const departmentsPage = new StructureDepartmentsPage(page, testInfo);

        await test.step('Открыть страницу "Настройка отделов" через боковое меню', async () => {
          await departmentsPage.openFromSideMenu();
        });

        await test.step("Создать новый отдел и открыть его карточку", async () => {
          await departmentsPage.createDepartmentAndOpen();
          await departmentsPage.assertDepartmentDetailsElements();
        });

        await test.step("Переименовать созданный отдел", async () => {
          const newName = `Автотест отдел ${Date.now()}`;
          await departmentsPage.renameOpenedDepartment(newName);
        });

        await test.step("Добавить сотрудника в созданный отдел", async () => {
          await departmentsPage.addFirstEmployeeToDepartment();
        });

        await test.step("Сделать скриншот отдела с добавленным сотрудником", async () => {
          const shotPath = testInfo.outputPath("department-with-employee.png");
          await page.screenshot({ path: shotPath, fullPage: true });
          await testInfo.attach("department-with-employee", {
            path: shotPath,
            contentType: "image/png",
          });
        });

        await test.step("Удалить созданный отдел", async () => {
          await departmentsPage.deleteOpenedDepartment();
        });
      },
    );
  },
);
