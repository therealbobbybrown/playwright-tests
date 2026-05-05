// tests/functional/org-structure/users/users-add-duplicate-email.spec.js
import { test } from "../../../fixtures/auth.js";
import { StructureUserAddPage } from "../../../../pages/StructureUserAddPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";
import { getCredentials } from "../../../utils/credentials.js";

test.describe(
  "Орг. структура — негативные сценарии: дублирующийся email",
  { tag: ["@ui", "@negative", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.ORG_STRUCTURE);
    });

    test("C3520: Нельзя добавить сотрудника с уже существующим email", async ({
      adminAuth: page,
    }, testInfo) => {
      setSeverity("normal");
      const userAddPage = new StructureUserAddPage(page, testInfo);

      // Используем email админа, который точно существует
      const existingEmail = getCredentials("admin").email;

      await test.step("Открыть страницу добавления сотрудника", async () => {
        await userAddPage.openFromSideMenu();
      });

      await test.step("Заполнить форму с существующим email", async () => {
        await userAddPage.emailInput.fill(existingEmail);
        await userAddPage.firstNameInput.fill("Дубликат");
        await userAddPage.lastNameInput.fill("Тестовый");
        // Роль обязательна — без неё форма не дойдёт до проверки дублирующегося email
        await userAddPage.selectUserRole();
      });

      await test.step("Попробовать сохранить и проверить ошибку дублирующегося email", async () => {
        await userAddPage.submitAndAssertDuplicateEmailError();
      });
    });
  },
);
