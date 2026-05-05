// tests/virtual-currency-deposit.spec.js
import { expect } from "@playwright/test";
import { test } from "../../fixtures/auth.js";
import { SideMenu } from "../../../pages/SideMenu.js";
import { VirtualCurrencySettingsPage } from "../../../pages/VirtualCurrencySettingsPage.js";
import { VirtualCurrencyDepositPage } from "../../../pages/VirtualCurrencyDepositPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

test.describe("Виртуальная валюта", { tag: ["@ui", "@regression"] }, () => {
  test.beforeEach(() => {
    markAsUITest(MODULES.VIRTUAL_CURRENCY);
  });

  test("C7510: Админ может начислить виртуальную валюту текущему пользователю", async ({
    adminAuth,
    page,
  }, testInfo) => {
    setSeverity("normal");
    const sideMenu = new SideMenu(page, testInfo);
    const vcSettingsPage = new VirtualCurrencySettingsPage(page, testInfo);
    const depositPage = new VirtualCurrencyDepositPage(page, testInfo);

    const depositAmount = 1;

    await test.step('Открыть "Настройка виртуальной валюты"', async () => {
      await sideMenu.openVirtualCurrencySettings();
      await vcSettingsPage.assertOpened();
    });

    let fullName;
    let startBalance;

    await test.step("Считать ФИО текущего пользователя и баланс (дарение)", async () => {
      fullName = await vcSettingsPage.getCurrentUserFullNameFromHeader();
      startBalance = await vcSettingsPage.getHeaderGiftBalance();
    });

    await test.step("Открыть страницу начисления", async () => {
      await vcSettingsPage.openDepositVirtualCurrency();
      await depositPage.assertOpened();
    });

    await test.step("Выбрать текущего пользователя и подтвердить", async () => {
      await depositPage.selectRecipientByName(fullName);
      await depositPage.confirmRecipientSelection();
      await depositPage.assertRecipientSelected(fullName);
    });

    await test.step("Завершить начисление", async () => {
      await depositPage.completeDeposit({ amount: depositAmount });
    });

    await test.step("Проверить, что баланс (дарение) увеличился", async () => {
      await expect
        .poll(async () => vcSettingsPage.getHeaderGiftBalance(), {
          timeout: 20_000,
        })
        .toBe(startBalance + depositAmount);
    });
  });
});
