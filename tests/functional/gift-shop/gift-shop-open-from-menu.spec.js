// tests/gift-shop-open-from-menu.spec.js
import { expect } from "@playwright/test";
import { test } from "../../fixtures/auth.js";
import { SideMenu } from "../../../pages/SideMenu.js";
import { VirtualCurrencySettingsPage } from "../../../pages/VirtualCurrencySettingsPage.js";
import { GiftShopPage } from "../../../pages/GiftShopPage.js";
import { OperationsHistoryPage } from "../../../pages/OperationsHistoryPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { KarmaAPI } from "../../utils/api/KarmaAPI.js";
import { GiftShopAPI } from "../../utils/api/GiftShopAPI.js";
import { getCredentials } from "../../utils/credentials.js";

const GIFT_PRICE = 5;
const DEPOSIT_AMOUNT = 100;

test.describe("Магазин подарков", { tag: ["@ui", "@regression"] }, () => {
  test.beforeAll(async ({ request }) => {
    const { email, password } = getCredentials("admin");

    // 1. Включить виртуальную валюту если не включена
    const karmaAPI = new KarmaAPI(request);
    const signInData = await karmaAPI.signIn(email, password);

    // Получить userId из ответа signIn (JWT payload)
    let adminUserId = signInData?.user?.id;
    if (!adminUserId && signInData?.accessToken) {
      try {
        const payload = JSON.parse(
          Buffer.from(
            signInData.accessToken.split(".")[1],
            "base64",
          ).toString(),
        );
        adminUserId = payload?.userId;
      } catch (e) {
        console.warn("[gift-shop setup] JWT parse failed:", e.message);
      }
    }
    if (!adminUserId) {
      throw new Error("Не удалось получить userId админа из signIn");
    }

    const { response: settingsResp } = await karmaAPI.getManagerSettings();
    if (settingsResp.status() === 404) {
      await karmaAPI.enable();
      await karmaAPI.createDefaultSettings();
      console.log("[gift-shop setup] Виртуальная валюта включена");
    }

    // 3. Пополнить баланс (coin = валюта магазина 💎, amount как строка — требование API)
    const { response: depositResp } = await karmaAPI.deposit({
      userId: adminUserId,
      currency: "coin",
      amount: String(DEPOSIT_AMOUNT),
    });
    if (depositResp.ok()) {
      console.log(
        `[gift-shop setup] Баланс coin пополнен на ${DEPOSIT_AMOUNT} для userId=${adminUserId}`,
      );
    } else {
      console.warn(
        `[gift-shop setup] Deposit не удался: ${depositResp.status()}`,
      );
    }

    // 4. Убедиться, что есть подарок с доступной ценой
    const giftShopAPI = new GiftShopAPI(request);
    await giftShopAPI.signIn(email, password);

    const { data: gifts } = await giftShopAPI.getManagerGifts();
    const items = gifts?.items || gifts?.results || [];
    const hasAffordable = items.some(
      (g) => g.price <= DEPOSIT_AMOUNT && g.price > 0,
    );

    if (!hasAffordable) {
      const { response: createResp } = await giftShopAPI.createGift({
        title: `Тестовый подарок ${Date.now()}`,
        description: "Создан автоматически для smoke теста",
        price: GIFT_PRICE,
      });
      if (createResp.ok()) {
        console.log(`[gift-shop setup] Создан подарок с ценой ${GIFT_PRICE}`);
      } else {
        console.warn(
          `[gift-shop setup] Не удалось создать подарок: ${createResp.status()}`,
        );
      }
    }
  });

  test.beforeEach(() => {
    markAsUITest(MODULES.GIFT_SHOP);
  });

  test(
    "C3657: Админ может открыть магазин подарков из меню, найти доступный по балансу подарок и оформить заказ",
    { tag: ["@critical"] },
    async ({ adminAuth, page }, testInfo) => {
      setSeverity("critical");
      const sideMenu = new SideMenu(page, testInfo);
      const vcSettingsPage = new VirtualCurrencySettingsPage(page, testInfo);
      const giftShopPage = new GiftShopPage(page, testInfo);
      const operationsHistoryPage = new OperationsHistoryPage(page, testInfo);

      let walletBalance;
      let purchaseAmount;

      // 1. Убедиться, что пункт "Магазин подарков" есть в главном меню
      await test.step('Убедиться, что пункт "Магазин подарков" есть в главном меню', async () => {
        const hasMainItem = await sideMenu.hasGiftShopMainItem();

        if (!hasMainItem) {
          await sideMenu.openVirtualCurrencySettings();
          await vcSettingsPage.assertOpened();

          let state = await vcSettingsPage.getCurrencyState();
          if (state === "disabled") {
            await vcSettingsPage.clickEnable();
            await vcSettingsPage.waitForEnabled();
            state = await vcSettingsPage.getCurrencyState();
          }

          await expect
            .poll(() => vcSettingsPage.getCurrencyState())
            .toBe("enabled");

          await expect.poll(() => sideMenu.hasGiftShopMainItem()).toBe(true);
        }
      });

      // 2. Открыть основной "Магазин подарков" из главного меню
      await test.step('Открыть основной "Магазин подарков" из главного меню', async () => {
        await sideMenu.openGiftShopMain();
        await giftShopPage.assertOpened();
      });

      // 3. Проверить, что в магазине есть хотя бы один подарок
      await test.step("Проверить, что в магазине есть хотя бы один подарок", async () => {
        await expect(giftShopPage.anyGiftCard).toBeVisible({
          timeout: 10_000,
        });
      });

      // 4. Считать баланс кошелька пользователя (число без иконки 💎)
      await test.step("Считать баланс кошелька пользователя", async () => {
        walletBalance = await giftShopPage.getWalletBalance();
      });

      // 5. Найти подарок с ценой <= баланса и нажать на нём "Посмотреть"
      await test.step('Найти доступный по балансу подарок и нажать "Посмотреть" в карточке', async () => {
        const { price } =
          await giftShopPage.openFirstAffordableGift(walletBalance);
        purchaseAmount = price;
      });

      // 6. В открывшейся правой шторке нажать "Заказать"
      await test.step('В правой шторке нажать "Заказать" по выбранному подарку', async () => {
        await giftShopPage.orderGiftFromSheet();
      });

      // 7. На экране оформления заказа нажать "Заказать"
      await test.step('На экране оформления заказа нажать "Заказать"', async () => {
        await giftShopPage.submitOrderOnCreateScreen();
      });

      // 8. Проверить, что показан экран "Ваш заказ отправлен"
      await test.step('Проверить, что показан экран "Ваш заказ отправлен"', async () => {
        await giftShopPage.assertOrderSuccessScreen();
      });

      // 9. Перейти через боковое меню в "Историю операций"
      await test.step('Перейти через боковое меню в "Историю операций"', async () => {
        await sideMenu.openOperationsHistory();
        await operationsHistoryPage.assertOpened();
      });

      // 10. Проверить, что первая транзакция — покупка подарка текущим пользователем
      await test.step("Проверить последнюю транзакцию в истории операций", async () => {
        await operationsHistoryPage.assertLatestPurchase({
          amount: purchaseAmount,
        });
      });
    },
  );
});
