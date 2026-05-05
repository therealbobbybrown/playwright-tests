// tests/functional/org-structure/users/org-structure-users-add-empty-surname.spec.js
import { test } from "../../../fixtures/auth.js";
import { StructureUserAddPage } from "../../../../pages/StructureUserAddPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";

test.describe(
  "Орг. структура — негативные сценарии: пустая фамилия",
  { tag: ["@ui", "@negative", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.ORG_STRUCTURE);
    });

    test("C4002: Нельзя добавить сотрудника с пустой фамилией", async ({
      adminAuth,
      page,
    }, testInfo) => {
      setSeverity("normal");
      const userAddPage = new StructureUserAddPage(page, testInfo);

      await test.step("Открыть страницу добавления сотрудника", async () => {
        await userAddPage.openFromSideMenu();
      });

      await test.step("Заполнить форму без фамилии", async () => {
        await userAddPage.emailInput.fill(
          `test-empty-surname-${Date.now()}@test.local`,
        );
        await userAddPage.firstNameInput.fill("Тест");
        await userAddPage.lastNameInput.fill("");
      });

      await test.step("Проверить ошибку валидации пустой фамилии", async () => {
        await userAddPage.submitAndAssertInputError();
      });
    });
  },
);
