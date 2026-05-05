// tests/functional/org-structure/users/org-structure-users-add-invalid-email.spec.js
import { test } from "../../../fixtures/auth.js";
import { StructureUserAddPage } from "../../../../pages/StructureUserAddPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";

test.describe(
  "Орг. структура — негативные сценарии: невалидный email при добавлении сотрудника",
  { tag: ["@ui", "@negative", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.ORG_STRUCTURE);
    });

    test("C4003: Нельзя добавить сотрудника с невалидным email", async ({
      adminAuth,
      page,
    }, testInfo) => {
      setSeverity("normal");
      const userAddPage = new StructureUserAddPage(page, testInfo);

      await test.step("Открыть страницу добавления сотрудника", async () => {
        await userAddPage.openFromSideMenu();
      });

      await test.step("Заполнить форму с невалидным email", async () => {
        await userAddPage.emailInput.fill("invalid-email-without-at");
        await userAddPage.firstNameInput.fill("Тест");
        await userAddPage.lastNameInput.fill("Тестов");
      });

      await test.step("Проверить ошибку валидации невалидного email", async () => {
        await userAddPage.submitAndAssertEmailError();
      });
    });
  },
);
