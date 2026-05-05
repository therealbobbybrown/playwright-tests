// tests/functional/org-structure/users/users-add-empty-email.spec.js
import { test } from "../../../fixtures/auth.js";
import { StructureUserAddPage } from "../../../../pages/StructureUserAddPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";

test.describe(
  "Орг. структура — негативные сценарии: пустой email",
  { tag: ["@ui", "@negative", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.ORG_STRUCTURE);
    });

    test("C4000: Нельзя добавить сотрудника с пустым email", async ({
      adminAuth: page,
    }, testInfo) => {
      setSeverity("normal");
      const userAddPage = new StructureUserAddPage(page, testInfo);

      await test.step("Открыть страницу добавления сотрудника", async () => {
        await userAddPage.openFromSideMenu();
      });

      await test.step("Заполнить форму без email", async () => {
        // Оставляем email пустым
        await userAddPage.emailInput.fill("");

        // Заполняем имя, фамилию и роль (роль обязательна для отправки формы)
        await userAddPage.firstNameInput.fill("Тест");
        await userAddPage.lastNameInput.fill("Тестов");
        await userAddPage.selectUserRole();
      });

      await test.step("Проверить валидацию пустого email", async () => {
        await userAddPage.submitAndAssertEmptyEmailError();
      });
    });
  },
);
