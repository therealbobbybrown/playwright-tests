import { test, expect } from "../../../fixtures/auth.js";
import { ScoreDistributionTab } from "../../../../pages/ScoreDistributionTab.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";

test.describe(
  "Моя команда → Распределение оценок → Кнопка сброса фильтров",
  { tag: ["@ui", "@my-team", "@regression"] },
  () => {
    let tab;

    test.beforeEach(async ({ adminAuth: page }) => {
      markAsUITest(MODULES.MY_TEAM);
      tab = new ScoreDistributionTab(page);
      await tab.open();
      await page.waitForLoadState("networkidle");
    });

    test(
      "C7135: При дефолтных фильтрах кнопка «Сбросить фильтры» (×) НЕ отображается",
      { tag: ["@critical"] },
      async () => {
        setSeverity("critical");

        await test.step("Проверить дефолтное значение фильтра «Сотрудники»", async () => {
          // Фильтр «Сотрудники» в дефолте
          const employeesValue = await tab.getEmployeesFilterValue();
          expect(employeesValue).toBe("Все сотрудники");
        });

        await test.step("Проверить, что кнопка «Сбросить фильтры» скрыта при дефолтных фильтрах", async () => {
          // Кнопка сброса НЕ должна быть видна при дефолтных фильтрах
          await expect(tab.resetButton).not.toBeVisible();
        });
      },
    );

    test(
      "C7136: При изменении фильтра «Сотрудники» кнопка (×) появляется",
      { tag: ["@critical"] },
      async ({ adminAuth: page }) => {
        setSeverity("critical");

        let initialCount;

        await test.step("Запомнить начальное количество строк в таблице", async () => {
          // Запоминаем исходное количество строк
          initialCount = await tab.getRowCount();
          expect(initialCount).toBeGreaterThan(0);
        });

        await test.step("Переключить фильтр на «Прямые подчиненные» и проверить появление кнопки сброса", async () => {
          await tab.selectEmployeesOption("Прямые подчиненные");
          await page.waitForLoadState("networkidle");

          await expect(tab.resetButton).toBeVisible({ timeout: 3000 });

          // Данные должны измениться (прямых подчинённых ≤ всех)
          const filteredCount = await tab.getRowCount();
          expect(filteredCount).toBeLessThanOrEqual(initialCount);
        });
      },
    );

    test(
      "C7137: Клик на кнопку (×) возвращает все фильтры к дефолтным значениям",
      { tag: ["@critical"] },
      async ({ adminAuth: page }) => {
        setSeverity("critical");

        let initialCount;

        await test.step("Запомнить начальное количество строк и изменить фильтр", async () => {
          // Запоминаем исходное количество строк (дефолт: «Все сотрудники»)
          initialCount = await tab.getRowCount();
          expect(initialCount).toBeGreaterThan(0);

          // Изменяем фильтр
          await tab.selectEmployeesOption("Прямые подчиненные");
          await page.waitForLoadState("networkidle");

          const changedValue = await tab.getEmployeesFilterValue();
          expect(changedValue).toBe("Прямые подчиненные");

          await expect(tab.resetButton).toBeVisible();
        });

        await test.step("Нажать кнопку (×) и проверить возврат фильтра к «Все сотрудники»", async () => {
          // Сбрасываем (retry клика — под нагрузкой клик может не зарегистрироваться)
          await expect(async () => {
            if (await tab.resetButton.isVisible()) {
              await tab.resetButton.click();
            }
            const value = await tab.getEmployeesFilterValue();
            expect(value).toBe("Все сотрудники");
          }).toPass({ timeout: 15000 });
        });

        await test.step("Проверить, что количество строк вернулось к исходному", async () => {
          // Данные должны вернуться к исходным
          await expect(async () => {
            const restoredCount = await tab.getRowCount();
            expect(restoredCount).toBeGreaterThan(0);
            expect(restoredCount).toBe(initialCount);
          }).toPass({ timeout: 15000 });
        });
      },
    );

    test(
      "C7138: Наведение на кнопку (×) показывает тултип «Сбросить фильтры»",
      { tag: ["@critical"] },
      async ({ adminAuth: page }) => {
        setSeverity("critical");

        await test.step("Изменить фильтр и дождаться появления кнопки сброса", async () => {
          await tab.selectEmployeesOption("Прямые подчиненные");
          await page.waitForLoadState("networkidle");
          await expect(tab.resetButton).toBeVisible();
        });

        await test.step("Навести курсор на кнопку (×) и проверить тултип", async () => {
          await tab.resetButton.hover();

          const tooltip = page
            .getByRole("tooltip")
            .filter({ hasText: "Сбросить фильтры" });
          await expect(tooltip).toBeVisible({ timeout: 3000 });
        });
      },
    );

    test(
      "C7139: После сброса кнопка (×) скрывается",
      { tag: ["@critical"] },
      async ({ adminAuth: page }) => {
        setSeverity("critical");

        await test.step("Изменить фильтр и дождаться появления кнопки сброса", async () => {
          await tab.selectEmployeesOption("Прямые подчиненные");
          await page.waitForLoadState("networkidle");
          await expect(tab.resetButton).toBeVisible();
        });

        await test.step("Нажать кнопку сброса и проверить её исчезновение", async () => {
          // Сбрасываем (retry клика — под нагрузкой клик может не зарегистрироваться)
          await expect(async () => {
            if (await tab.resetButton.isVisible()) {
              await tab.resetButton.click();
            }
            const value = await tab.getEmployeesFilterValue();
            expect(value).toBe("Все сотрудники");
          }).toPass({ timeout: 15000 });

          // Кнопка должна скрыться после сброса
          await expect(tab.resetButton).not.toBeVisible({ timeout: 10000 });
        });
      },
    );
  },
);
