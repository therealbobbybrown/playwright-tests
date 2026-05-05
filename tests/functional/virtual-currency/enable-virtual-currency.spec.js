// tests/functional/virtual-currency/enable-virtual-currency.spec.js
// Включение виртуальной валюты: setup + regression проверка
// Setup: npx playwright test --project=setup enable-virtual-currency
// Regression: npx playwright test --project=regression enable-virtual-currency

import { expect } from "@playwright/test";
import { test } from "../../fixtures/auth.js";
import { TIMEOUTS } from "../../utils/constants.js";
import { SideMenu } from "../../../pages/SideMenu.js";
import { markAsUITest, MODULES } from "../../utils/allure-helpers.js";

test.describe("Настройка виртуальной валюты", { tag: ["@ui", "@gift-shop"] }, () => {
  test.beforeEach(() => {
    markAsUITest(MODULES.SETTINGS, "Virtual Currency Setup");
  });

  test("Включить виртуальную валюту на тестовом стенде",
    { tag: ["@setup"] },
    async ({ adminAuth: page }, testInfo) => {
      test.setTimeout(120000);

      const sideMenu = new SideMenu(page, testInfo);

      await test.step("Открыть страницу настроек виртуальной валюты", async () => {
        await sideMenu.openVirtualCurrencySettings();

        const heading = page.getByRole("heading", {
          name: "Виртуальная валюта",
        });
        await expect(heading).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD });
      });

      const enableButton = page.getByRole("button", {
        name: "Включить виртуальную валюту",
      });
      const disableButton = page.getByRole("button", {
        name: "Выключить виртуальную валюту",
      });

      const isEnabled = await disableButton.isVisible().catch(() => false);
      const isDisabled = await enableButton.isVisible().catch(() => false);

      if (isEnabled) {
        console.log("✅ Виртуальная валюта уже включена");
        return;
      }

      if (!isDisabled) {
        throw new Error("Не удалось определить состояние виртуальной валюты");
      }

      const isButtonDisabled = await enableButton.isDisabled();

      if (isButtonDisabled) {
        await test.step("Добавить получателя уведомлений о заказах", async () => {
          const addButton = page.getByRole("button", { name: "Добавить" });
          await expect(addButton).toBeVisible({ timeout: TIMEOUTS.MEDIUM });
          await addButton.click();

          const modalTitle = page.locator(
            "text=Получатели уведомления о заказах",
          );
          await expect(modalTitle).toBeVisible({ timeout: TIMEOUTS.MEDIUM });

          const userItem = page
            .locator('[class*="UserQuerySelect"]')
            .locator('div[class*="cursor-pointer"], [cursor=pointer]')
            .filter({ hasText: /[А-Яа-яA-Za-z]+ [А-Яа-яA-Za-z]+/ })
            .first();

          const isUserVisible = await userItem
            .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
            .then(() => true)
            .catch(() => false);

          if (isUserVisible) {
            await userItem.click();
          } else {
            const userByName = page
              .locator("text=/Elena Shapoval|Анна Назарова|Анна Лапина/")
              .first();
            const isNameVisible = await userByName
              .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
              .then(() => true)
              .catch(() => false);

            if (isNameVisible) {
              await userByName.click();
            } else {
              const firstUserDiv = page
                .locator('[class*="UserQuerySelect_centerPanel"]')
                .locator("> div")
                .first();

              const isFirstVisible = await firstUserDiv
                .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
                .then(() => true)
                .catch(() => false);
              if (isFirstVisible) {
                await firstUserDiv.click();
              } else {
                await page.screenshot({
                  path: "test-results/no-user-found.png",
                  fullPage: true,
                });
                throw new Error("Не удалось найти пользователя для выбора");
              }
            }
          }

          const applyButton = page.getByRole("button", { name: "Применить" });
          await applyButton.waitFor({
            state: "visible",
            timeout: TIMEOUTS.SHORT,
          });
          const isApplyEnabled = !(await applyButton
            .isDisabled()
            .catch(() => true));

          if (isApplyEnabled) {
            await applyButton.click();
          } else {
            const anyUserName = page.getByText("Elena Shapoval").first();
            const isAnyNameVisible = await anyUserName
              .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
              .then(() => true)
              .catch(() => false);

            if (isAnyNameVisible) {
              await anyUserName.click();
              await applyButton.waitFor({
                state: "visible",
                timeout: TIMEOUTS.SHORT,
              });
            } else {
              const annaName = page.getByText("Анна Назарова").first();
              const isAnnaVisible = await annaName
                .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
                .then(() => true)
                .catch(() => false);
              if (isAnnaVisible) {
                await annaName.click();
                await applyButton.waitFor({
                  state: "visible",
                  timeout: TIMEOUTS.SHORT,
                });
              }
            }

            const isApplyEnabledNow = !(await applyButton
              .isDisabled()
              .catch(() => true));
            if (isApplyEnabledNow) {
              await applyButton.click();
            } else {
              await page.screenshot({
                path: "test-results/apply-still-disabled.png",
                fullPage: true,
              });
              throw new Error("Не удалось выбрать получателя уведомлений");
            }
          }

          await page
            .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
            .catch(() => {});
        });
      }

      await test.step("Включить виртуальную валюту", async () => {
        await enableButton.waitFor({
          state: "visible",
          timeout: TIMEOUTS.SHORT,
        });
        const buttonStillDisabled = await enableButton
          .isDisabled()
          .catch(() => true);

        if (buttonStillDisabled) {
          await page.screenshot({
            path: "test-results/enable-vc-blocked.png",
            fullPage: true,
          });
          throw new Error(
            "Не удалось разблокировать кнопку включения виртуальной валюты",
          );
        }

        await enableButton.click();

        const confirmEnableButton = page.getByRole("button", {
          name: "Подтвердить и включить виртуальную валюту",
        });
        await expect(confirmEnableButton).toBeVisible({
          timeout: TIMEOUTS.MEDIUM,
        });
        await confirmEnableButton.click();

        await expect(disableButton).toBeVisible({
          timeout: TIMEOUTS.PAGE_LOAD,
        });
      });
    },
  );

  test("C7508: Проверить что виртуальная валюта включена на тестовом стенде",
    { tag: ["@regression"] },
    async ({ adminAuth: page }, testInfo) => {
      const sideMenu = new SideMenu(page, testInfo);

      await test.step("Открыть страницу настроек виртуальной валюты", async () => {
        await sideMenu.openVirtualCurrencySettings();

        const heading = page.getByRole("heading", {
          name: "Виртуальная валюта",
        });
        await expect(heading).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD });
      });

      await test.step("Проверить что виртуальная валюта включена", async () => {
        const disableButton = page.getByRole("button", {
          name: "Выключить виртуальную валюту",
        });
        await expect(disableButton).toBeVisible({ timeout: TIMEOUTS.MEDIUM });
      });
    },
  );
});
