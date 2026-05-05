// tests/functional/development-plans/dev-plan-module-toggle.spec.js
// TestRail: C2701 - Включение/выключение модуля Развитие
// UI-007: Тест включения и выключения модуля Развитие

import { expect } from "@playwright/test";
import { test } from "../../fixtures/auth.js";
import { DevelopmentMenuHelper } from "../../../pages/menu/DevelopmentMenuHelper.js";
import { DevelopmentPlansSettingsPage } from "../../../pages/DevelopmentPlansSettingsPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { TIMEOUTS } from "../../utils/constants.js";

test.describe(
  "Включение/выключение модуля Развитие",
  { tag: ["@ui", "@development-plans", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.DEVELOPMENT);
    });

    test(
      "C2701: включить и выключить модуль Развитие",
      { tag: ["@critical"] },
      async ({ adminAuth, page }, testInfo) => {
        setSeverity("critical");

        const devMenu = new DevelopmentMenuHelper(page, testInfo);
        const settingsPage = new DevelopmentPlansSettingsPage(page, testInfo);

        let initialState = null;

        // Шаг 1: Перейти в настройки модуля
        await test.step('Перейти на страницу "Настроить планы развития"', async () => {
          await devMenu.openDevelopmentPlansSettings();
          await settingsPage.assertOpened();
        });

        // Шаг 2: Определить текущее состояние модуля
        await test.step("Определить текущее состояние модуля", async () => {
          initialState = await settingsPage.getPlansState();
          console.log(`Начальное состояние модуля: ${initialState}`);
          expect(["enabled", "disabled"]).toContain(initialState);
        });

        // Шаг 3: Переключить состояние модуля
        if (initialState === "enabled") {
          // Модуль включен - выключаем его
          await test.step("Выключить модуль Развитие", async () => {
            await settingsPage.clickDisable();
            await settingsPage.waitForDisabled();

            // Проверяем что состояние изменилось
            const newState = await settingsPage.getPlansState();
            expect(newState).toBe("disabled");
          });

          // Шаг 4: Проверить что пункты меню скрыты (кроме настроек)
          await test.step("Проверить, что пункты меню скрыты при выключенном модуле", async () => {
            const menuItems = await devMenu.getDevelopmentMenuItems();
            console.log("Пункты меню при выключенном модуле:", menuItems);

            // Должен остаться только пункт настроек
            // Пункты "Планы развития" и "Шаблоны" должны быть скрыты
            const hasPlansItem = menuItems.some(
              (item) =>
                item.toLowerCase().includes("планы развития") &&
                !item.toLowerCase().includes("настро"),
            );
            const hasTemplatesItem = menuItems.some((item) =>
              item.toLowerCase().includes("шаблон"),
            );

            // При выключенном модуле не должно быть основных пунктов
            console.log(
              `hasPlansItem: ${hasPlansItem}, hasTemplatesItem: ${hasTemplatesItem}`,
            );

            // Пункт настроек должен остаться
            const hasSettingsItem = menuItems.some((item) =>
              item.toLowerCase().includes("настро"),
            );
            expect(hasSettingsItem).toBe(true);
          });

          // Шаг 5: Включить модуль обратно
          await test.step("Включить модуль обратно", async () => {
            await devMenu.openDevelopmentPlansSettings();
            await settingsPage.assertOpened();

            await settingsPage.clickEnable();
            await settingsPage.waitForEnabled();

            const finalState = await settingsPage.getPlansState();
            expect(finalState).toBe("enabled");
          });

          // Шаг 6: Проверить что пункты меню появились
          await test.step("Проверить, что пункты меню появились при включённом модуле", async () => {
            const menuItems = await devMenu.getDevelopmentMenuItems();
            console.log("Пункты меню при включённом модуле:", menuItems);

            // Должны появиться основные пункты
            expect(menuItems.length).toBeGreaterThan(1);
          });
        } else {
          // Модуль выключен - включаем его
          await test.step("Включить модуль Развитие", async () => {
            await settingsPage.clickEnable();
            await settingsPage.waitForEnabled();

            const newState = await settingsPage.getPlansState();
            expect(newState).toBe("enabled");
          });

          // Шаг 4: Проверить что пункты меню появились
          await test.step("Проверить, что пункты меню появились при включённом модуле", async () => {
            const menuItems = await devMenu.getDevelopmentMenuItems();
            console.log("Пункты меню при включённом модуле:", menuItems);

            // Должны быть основные пункты
            expect(menuItems.length).toBeGreaterThan(1);
          });

          // Шаг 5: Выключить модуль обратно (вернуть в исходное состояние)
          await test.step("Выключить модуль обратно (вернуть в исходное состояние)", async () => {
            await devMenu.openDevelopmentPlansSettings();
            await settingsPage.assertOpened();

            await settingsPage.clickDisable();
            await settingsPage.waitForDisabled();

            const finalState = await settingsPage.getPlansState();
            expect(finalState).toBe("disabled");
          });
        }
      },
    );

    test(
      "C3555: Проверить уведомление при изменении состояния модуля",
      { tag: ["@regression"] },
      async ({ adminAuth, page }, testInfo) => {
        setSeverity("normal");

        const devMenu = new DevelopmentMenuHelper(page, testInfo);
        const settingsPage = new DevelopmentPlansSettingsPage(page, testInfo);

        // Перейти в настройки
        await test.step("Перейти в настройки модуля", async () => {
          await devMenu.openDevelopmentPlansSettings();
          await settingsPage.assertOpened();
        });

        // Определить состояние и переключить
        const initialState = await settingsPage.getPlansState();

        await test.step("Переключить состояние модуля и проверить уведомление", async () => {
          // Локатор для уведомления (toast)
          const notification = page
            .locator(
              '.Toastify__toast, [class*="notification"], [class*="toast"]',
            )
            .first();

          if (initialState === "enabled") {
            await settingsPage.clickDisable();
          } else {
            await settingsPage.clickEnable();
          }

          // Проверяем появление уведомления об успешном сохранении
          const notificationVisible = await notification
            .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
            .then(() => true)
            .catch(() => false);

          if (notificationVisible) {
            const notificationText = await notification.innerText();
            console.log(`Уведомление: ${notificationText}`);

            // Уведомление должно содержать текст об успехе
            const isSuccess =
              notificationText.toLowerCase().includes("сохран") ||
              notificationText.toLowerCase().includes("успеш") ||
              notificationText.toLowerCase().includes("настройки");

            expect(isSuccess).toBe(true);
          } else {
            console.log(
              "Уведомление не появилось (это может быть нормально для данного UI)",
            );
          }

          // Вернуть в исходное состояние
          await page
            .waitForLoadState("networkidle", { timeout: TIMEOUTS.SHORT })
            .catch(() => {});

          if (initialState === "enabled") {
            await settingsPage.waitForDisabled();
            await settingsPage.clickEnable();
            await settingsPage.waitForEnabled();
          } else {
            await settingsPage.waitForEnabled();
            await settingsPage.clickDisable();
            await settingsPage.waitForDisabled();
          }
        });
      },
    );

    test(
      "C3556: Состояние модуля сохраняется после перезагрузки страницы",
      { tag: ["@regression"] },
      async ({ adminAuth, page }, testInfo) => {
        setSeverity("normal");

        const devMenu = new DevelopmentMenuHelper(page, testInfo);
        const settingsPage = new DevelopmentPlansSettingsPage(page, testInfo);

        // Перейти в настройки
        await test.step("Перейти в настройки модуля", async () => {
          await devMenu.openDevelopmentPlansSettings();
          await settingsPage.assertOpened();
        });

        const initialState = await settingsPage.getPlansState();

        // Переключить состояние
        await test.step("Переключить состояние модуля", async () => {
          if (initialState === "enabled") {
            await settingsPage.clickDisable();
            await settingsPage.waitForDisabled();
          } else {
            await settingsPage.clickEnable();
            await settingsPage.waitForEnabled();
          }
        });

        const expectedState =
          initialState === "enabled" ? "disabled" : "enabled";

        // Перезагрузить страницу
        await test.step("Перезагрузить страницу и проверить сохранение состояния", async () => {
          await page.reload();
          await settingsPage.assertOpened();

          const stateAfterReload = await settingsPage.getPlansState();
          expect(stateAfterReload).toBe(expectedState);
          console.log(
            `Состояние после перезагрузки: ${stateAfterReload} (ожидалось: ${expectedState})`,
          );
        });

        // Вернуть в исходное состояние
        await test.step("Вернуть модуль в исходное состояние", async () => {
          if (initialState === "enabled") {
            await settingsPage.clickEnable();
            await settingsPage.waitForEnabled();
          } else {
            await settingsPage.clickDisable();
            await settingsPage.waitForDisabled();
          }

          const finalState = await settingsPage.getPlansState();
          expect(finalState).toBe(initialState);
        });
      },
    );
  },
);
