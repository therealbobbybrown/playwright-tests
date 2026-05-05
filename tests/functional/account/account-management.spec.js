// tests/functional/account/account-management.spec.js
import { expect } from "@playwright/test";
import { test } from "../../fixtures/auth.js";
import { AccountSettingsPage } from "../../../pages/AccountSettingsPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

test.describe("Управление аккаунтом", { tag: ["@ui", "@regression"] }, () => {
  test.beforeEach(() => {
    markAsUITest(MODULES.ACCOUNT);
  });

  test("C7505: Админ открывает управление аккаунтом через аватар и видит основные разделы", async ({
    adminAuth: page,
  }, testInfo) => {
    setSeverity("normal");
    const accountSettings = new AccountSettingsPage(page, testInfo);

    await test.step("Открыть управление аккаунтом через аватар", async () => {
      await accountSettings.openFromHeader();
    });

    await test.step("Проверить разделы и элементы управления аккаунтом", async () => {
      await accountSettings.assertSettingsUi();
    });
  });
});
