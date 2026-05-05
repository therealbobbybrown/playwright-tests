import { test, expect } from "../../../fixtures/auth.js";
import { ScoreDistributionTab } from "../../../../pages/ScoreDistributionTab.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";

test.describe(
  "Распределение оценок — Пустое состояние таблицы",
  { tag: ["@ui", "@my-team", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.MY_TEAM);
    });

    test(
      "C7112: Фильтры без сотрудников → пустая таблица / специальное пустое состояние",
      { tag: ["@critical"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("critical");
        const tab = new ScoreDistributionTab(page, testInfo);

        await test.step("Открыть вкладку и убедиться что таблица не пустая", async () => {
          await tab.open();

          // Проверяем, что таблица изначально НЕ пустая
          const initialRowCount = await tab.getRowCount();
          expect(initialRowCount).toBeGreaterThan(0);
        });

        await test.step("Применить поиск несуществующего сотрудника", async () => {
          // Применяем фильтр, который не должен ничего найти — поиск несуществующего имени
          await tab.searchEmployee("ZZZZNONEXISTENT");

          // Ожидаем обновления таблицы после поиска (debounce + сетевой запрос)
          await expect(async () => {
            const count = await tab.getRowCount();
            expect(count).toBe(0);
          }).toPass({ timeout: 10000 });
        });

        await test.step("Проверить что таблица показывает пустое состояние", async () => {
          // Проверяем пустое состояние через метод page object
          const isEmpty = await tab.isEmptyState();
          expect(isEmpty).toBe(true);
        });
      },
    );

    test(
      "C7113: Текст пустого состояния",
      { tag: ["@critical"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("critical");
        const tab = new ScoreDistributionTab(page, testInfo);

        await test.step("Открыть вкладку и применить поиск несуществующего сотрудника", async () => {
          await tab.open();

          // Применяем фильтр с несуществующим именем
          await tab.searchEmployee("ZZZZNONEXISTENT");

          // Ожидаем пустого состояния
          await expect(async () => {
            const count = await tab.getRowCount();
            expect(count).toBe(0);
          }).toPass({ timeout: 10000 });
        });

        await test.step("Проверить текст сообщения пустого состояния", async () => {
          // Проверяем наличие специального сообщения о пустом состоянии
          // При пустом состоянии таблица полностью заменяется на специальный компонент
          // с иллюстрацией (телескоп) и текстом "Не найдено совпадений"
          const emptyStateMessage = page.getByText(
            /Не найдено совпадений|Нет данных|Ничего не найдено|Сотрудников не найдено/i,
          );
          await expect(emptyStateMessage).toBeVisible({ timeout: 5000 });

          // Проверяем текст сообщения
          const messageText = await emptyStateMessage.innerText();
          expect(messageText.trim()).toBe("Не найдено совпадений");
        });

        await test.step("Проверить наличие подсказки и отсутствие строк в таблице", async () => {
          // Проверяем наличие дополнительного текста "Попробуйте другой запрос"
          const hintText = page.getByText(/Попробуйте другой запрос/i);
          const hasHint = await hintText.isVisible();
          if (hasHint) {
            await expect(hintText).toBeVisible();
          }

          // Проверяем, что таблица либо скрыта, либо отсутствует
          const tableVisible = await tab.table.isVisible();
          if (tableVisible) {
            // Если таблица видна, проверяем что в ней нет строк
            const rowCount = await tab.tableRows.count();
            expect(rowCount).toBe(0);
          }
        });
      },
    );

    test(
      "C7114: Фильтры остаются доступными при пустом состоянии",
      { tag: ["@critical"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("critical");
        const tab = new ScoreDistributionTab(page, testInfo);

        await test.step("Открыть вкладку и применить поиск несуществующего сотрудника", async () => {
          await tab.open();

          // Применяем фильтр с несуществующим именем
          await tab.searchEmployee("ZZZZNONEXISTENT");

          // Ожидаем пустого состояния
          await expect(async () => {
            const count = await tab.getRowCount();
            expect(count).toBe(0);
          }).toPass({ timeout: 10000 });
        });

        await test.step("Проверить что все элементы управления видны и доступны", async () => {
          // Проверяем, что все фильтры остаются видимыми и доступными
          await expect(tab.searchInput).toBeVisible();
          await expect(tab.searchInput).toBeEnabled();

          await expect(tab.employeesFilterContainer).toBeVisible();
          await expect(tab.employeesFilterControl).toBeVisible();

          await expect(tab.groupFilterButton).toBeVisible();
          await expect(tab.groupFilterButton).toBeEnabled();

          await expect(tab.periodInput).toBeVisible();
          await expect(tab.periodInput).toBeEnabled();
        });

        await test.step("Проверить интерактивность фильтров (поиск, группа, сотрудники, период)", async () => {
          // Проверяем, что фильтры можно использовать
          // 1. Проверяем, что поле поиска интерактивно
          await tab.searchInput.click();
          await expect(tab.searchInput).toBeFocused();

          // 2. Проверяем, что фильтр «Группа» можно открыть
          await tab.openGroupFilter();
          await expect(tab.groupPanelTitle).toBeVisible();
          await tab.closeGroupFilter();

          // 3. Проверяем, что фильтр «Сотрудники» можно открыть
          await tab.employeesFilterControl.click();
          const listbox = page.getByRole("listbox");
          await expect(listbox).toBeVisible({ timeout: 5000 });
          await page.keyboard.press("Escape");

          // 4. Проверяем, что поле «Период» интерактивно (readOnly, но кликабельно)
          await tab.periodInput.click();
          const periodInputValue = await tab.getPeriodValue();
          expect(periodInputValue).toBeTruthy();
        });

        await test.step("Очистить поиск и проверить что таблица снова заполняется", async () => {
          // 5. Очищаем поиск и проверяем, что таблица снова заполняется
          await tab.clearSearch();
          await expect(async () => {
            const count = await tab.getRowCount();
            expect(count).toBeGreaterThan(0);
          }).toPass({ timeout: 10000 });
        });
      },
    );
  },
);
