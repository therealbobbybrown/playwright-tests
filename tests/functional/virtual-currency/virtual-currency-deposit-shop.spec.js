// tests/virtual-currency-deposit-shop.spec.js
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

  test("C7509: Админ может начислить валюту для магазина текущему пользователю (50)", async ({
    adminAuth,
    page,
  }, testInfo) => {
    setSeverity("normal");
    const sideMenu = new SideMenu(page, testInfo);
    const vcSettingsPage = new VirtualCurrencySettingsPage(page, testInfo);
    const depositPage = new VirtualCurrencyDepositPage(page, testInfo);

    const amount = 50;

    await test.step('Открыть "Настройка виртуальной валюты"', async () => {
      await sideMenu.openVirtualCurrencySettings();
      await vcSettingsPage.assertOpened();
    });

    const fullName =
      await test.step("Считать ФИО текущего пользователя", async () => {
        return vcSettingsPage.getCurrentUserFullNameFromHeader();
      });

    const startShopBalance =
      await test.step("Считать баланс (для магазина)", async () => {
        return vcSettingsPage.getHeaderShopBalance();
      });

    await test.step("Перейти на страницу начисления", async () => {
      await vcSettingsPage.openDepositVirtualCurrency();
      await depositPage.assertOpened();
    });

    await test.step("Выбрать текущего пользователя и подтвердить", async () => {
      await depositPage.selectRecipientByName(fullName);
      await depositPage.confirmRecipientSelection();
      await depositPage.assertRecipientSelected(fullName);
    });

    await test.step("Начислить 50 для магазина", async () => {
      await depositPage.completeDeposit({ amount, purpose: "shop" });
    });

    await test.step("Проверить, что баланс магазина увеличился на 50", async () => {
      await expect
        .poll(async () => vcSettingsPage.getHeaderShopBalance(), {
          timeout: 20_000,
        })
        .toBe(startShopBalance + amount);
    });
  });
});
