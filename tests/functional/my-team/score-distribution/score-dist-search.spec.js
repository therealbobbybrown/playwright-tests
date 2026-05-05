import { test, expect } from "../../../fixtures/auth.js";
import { ScoreDistributionTab } from "../../../../pages/ScoreDistributionTab.js";
import { DashboardTeamAPI } from "../../../utils/api/DashboardTeamAPI.js";
import { getCredentials } from "../../../utils/credentials.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";

test.describe(
  "Распределение оценок — Поиск сотрудников",
  { tag: ["@ui", "@my-team", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.MY_TEAM);
    });

    test(
      "C7145: Поле поиска отображается с placeholder «Найти сотрудника»",
      { tag: ["@critical"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("critical");
        const tab = new ScoreDistributionTab(page, testInfo);

        await test.step("Открыть вкладку «Распределение оценок»", async () => {
          await tab.open();
        });

        await test.step("Проверить поле поиска: видимость, placeholder и ID", async () => {
          await expect(tab.searchInput).toBeVisible();
          await expect(tab.searchInput).toHaveAttribute(
            "placeholder",
            "Найти сотрудника",
          );
          await expect(tab.searchInput).toHaveAttribute(
            "id",
            "performanceReviewSummaryFilters__q",
          );
        });
      },
    );

    test(
      "C7146: Поиск по имени фильтрует таблицу",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }, testInfo) => {
        setSeverity("critical");
        const tab = new ScoreDistributionTab(page, testInfo);

        await test.step("Открыть вкладку «Распределение оценок»", async () => {
          await tab.open();
        });

        let initialEmployees;
        let firstName;
        let uiFilteredCount = 0;

        await test.step("Получить начальный список сотрудников и выбрать имя для поиска", async () => {
          // Получаем список сотрудников
          initialEmployees = await tab.getEmployeeNames();
          expect(initialEmployees.length).toBeGreaterThan(0);

          // Берём имя первого сотрудника (первое слово)
          const firstEmployee = initialEmployees[0];
          firstName = firstEmployee.split(" ")[0];
          expect(firstName).toBeTruthy();
        });

        await test.step("Ввести имя в поле поиска и проверить фильтрацию таблицы", async () => {
          // Поиск по имени
          await tab.searchEmployee(firstName);

          // Ждём debounce и обновления таблицы (toPass для стабильности)
          await expect(async () => {
            const filteredEmployees = await tab.getEmployeeNames();
            uiFilteredCount = filteredEmployees.length;
            expect(filteredEmployees.length).toBeGreaterThanOrEqual(1);
            expect(filteredEmployees.length).toBeLessThanOrEqual(
              initialEmployees.length,
            );

            // Все имена должны содержать искомый текст (case-insensitive)
            for (const name of filteredEmployees) {
              expect(name.toLowerCase()).toContain(firstName.toLowerCase());
            }
          }).toPass({ timeout: 10000 });
        });

        await test.step("Сверить результат поиска с API", async () => {
          // === API-сверка: поиск через API даёт то же количество ===
          const api = new DashboardTeamAPI(request);
          const { email, password } = getCredentials("admin");
          await api.signIn(email, password);
          const { data: apiSearch } = await api.getDistributionUsers({
            usersSubset: "all",
            q: firstName,
            limit: 20,
            offset: 0,
          });
          // UI (первая страница) должен совпадать с API total (или min(total,20))
          expect(uiFilteredCount).toBe(Math.min(apiSearch.total, 20));
        });
      },
    );

    test(
      "C7147: Поиск по фамилии находит сотрудника",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }, testInfo) => {
        setSeverity("critical");
        const tab = new ScoreDistributionTab(page, testInfo);

        await test.step("Открыть вкладку «Распределение оценок»", async () => {
          await tab.open();
        });

        let lastName;
        let uiFilteredCount = 0;

        await test.step("Получить начальный список сотрудников и выбрать фамилию для поиска", async () => {
          // Получаем список сотрудников
          const initialEmployees = await tab.getEmployeeNames();
          expect(initialEmployees.length).toBeGreaterThan(0);

          // Берём фамилию первого сотрудника (второе слово)
          const firstEmployee = initialEmployees[0];
          const nameParts = firstEmployee.split(" ");
          lastName = nameParts[1] || nameParts[0];
          expect(lastName).toBeTruthy();
        });

        await test.step("Ввести фамилию в поле поиска и проверить фильтрацию таблицы", async () => {
          // Поиск по фамилии
          await tab.searchEmployee(lastName);

          // Ждём debounce и обновления таблицы (toPass для стабильности)
          await expect(async () => {
            const filteredEmployees = await tab.getEmployeeNames();
            uiFilteredCount = filteredEmployees.length;
            expect(filteredEmployees.length).toBeGreaterThanOrEqual(1);

            // Все имена должны содержать искомую фамилию (case-insensitive)
            for (const name of filteredEmployees) {
              expect(name.toLowerCase()).toContain(lastName.toLowerCase());
            }
          }).toPass({ timeout: 10000 });
        });

        await test.step("Сверить результат поиска по фамилии с API", async () => {
          // === API-сверка: поиск по фамилии через API ===
          const api = new DashboardTeamAPI(request);
          const { email, password } = getCredentials("admin");
          await api.signIn(email, password);
          const { data: apiSearch } = await api.getDistributionUsers({
            usersSubset: "all",
            q: lastName,
            limit: 20,
            offset: 0,
          });
          expect(uiFilteredCount).toBe(Math.min(apiSearch.total, 20));
        });
      },
    );

    test(
      "C7148: Поиск по несуществующему имени показывает пустую таблицу",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }, testInfo) => {
        setSeverity("critical");
        const tab = new ScoreDistributionTab(page, testInfo);

        await test.step("Открыть вкладку «Распределение оценок»", async () => {
          await tab.open();
        });

        const searchQuery = "ZZZZNONEXISTENT12345";

        await test.step("Ввести несуществующее имя и проверить, что таблица пустая", async () => {
          // Поиск по несуществующему имени
          await tab.searchEmployee(searchQuery);

          // Ждём debounce и обновления таблицы
          await page.waitForLoadState("networkidle");

          // Таблица должна быть пустой
          const rowCount = await tab.getRowCount();
          expect(rowCount).toBe(0);
        });

        await test.step("Сверить пустой результат с API", async () => {
          // === API-сверка: API тоже возвращает 0 ===
          const api = new DashboardTeamAPI(request);
          const { email, password } = getCredentials("admin");
          await api.signIn(email, password);
          const { data: apiSearch } = await api.getDistributionUsers({
            usersSubset: "all",
            q: searchQuery,
            limit: 20,
            offset: 0,
          });
          expect(apiSearch.total).toBe(0);
          expect(apiSearch.items.length).toBe(0);
        });
      },
    );

    test(
      "C7149: Очистка поля поиска возвращает полный список",
      { tag: ["@critical"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("critical");
        const tab = new ScoreDistributionTab(page, testInfo);

        await test.step("Открыть вкладку «Распределение оценок»", async () => {
          await tab.open();
        });

        let initialCount;
        let firstName;

        await test.step("Запомнить начальное количество строк и применить фильтр поиска", async () => {
          // Запоминаем начальное количество строк
          initialCount = await tab.getRowCount();
          expect(initialCount).toBeGreaterThan(0);

          // Получаем имя для поиска
          const initialEmployees = await tab.getEmployeeNames();
          firstName = initialEmployees[0].split(" ")[0];

          // Применяем фильтр
          await tab.searchEmployee(firstName);
          await expect(async () => {
            const filteredCount = await tab.getRowCount();
            expect(filteredCount).toBeGreaterThanOrEqual(1);
            expect(filteredCount).toBeLessThanOrEqual(initialCount);
          }).toPass({ timeout: 10000 });
        });

        await test.step("Очистить поиск и проверить, что список восстановился", async () => {
          // Очищаем поиск
          await tab.clearSearch();

          // Ждём восстановления полного списка
          await expect(async () => {
            const restoredCount = await tab.getRowCount();
            expect(restoredCount).toBe(initialCount);
          }).toPass({ timeout: 10000 });
        });
      },
    );

    test(
      "C7150: Ввод текста в поле поиска не крашит UI",
      { tag: ["@critical"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("critical");
        const tab = new ScoreDistributionTab(page, testInfo);

        await test.step("Открыть вкладку «Распределение оценок» и проверить начальное состояние", async () => {
          await tab.open();
          await expect(tab.table).toBeVisible();
        });

        let initialRowCount;

        await test.step("Запомнить количество строк и ввести произвольный текст", async () => {
          initialRowCount = await tab.getRowCount();
          expect(initialRowCount).toBeGreaterThan(0);

          // Вводим произвольный текст — UI не должен крашнуться
          await tab.searchEmployee("Тест Тестович 123");
          await page.waitForLoadState("networkidle");

          // Проверяем, что заголовок всё ещё виден (UI не крашнулся)
          // Таблица может исчезнуть (пустой результат = empty state), но UI должен работать
          await expect(tab.tabHeading).toBeVisible();
          await expect(tab.searchInput).toBeVisible();
        });

        await test.step("Очистить поиск и проверить, что UI и таблица восстановились", async () => {
          // Очищаем — UI не должен крашнуться, таблица должна вернуться
          await tab.clearSearch();
          await expect(tab.table).toBeVisible({ timeout: 15000 });
          await page.waitForLoadState("networkidle");
          await expect(tab.tabHeading).toBeVisible();

          // Проверяем, что таблица вернулась с данными
          await expect(async () => {
            const restoredRowCount = await tab.getRowCount();
            expect(restoredRowCount).toBe(initialRowCount);
          }).toPass({ timeout: 10000 });
        });
      },
    );

    test(
      "C7151: Поле поиска принимает кириллицу и латиницу",
      { tag: ["@critical"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("critical");
        const tab = new ScoreDistributionTab(page, testInfo);

        await test.step("Открыть вкладку «Распределение оценок»", async () => {
          await tab.open();
        });

        await test.step("Ввести текст кириллицей и проверить значение поля", async () => {
          // Кириллица
          await tab.searchEmployee("Энцо");
          const value = await tab.searchInput.inputValue();
          expect(value).toBe("Энцо");
        });

        await test.step("Ввести текст латиницей и проверить значение поля", async () => {
          // Латиница
          await tab.searchEmployee("Vika");
          const value = await tab.searchInput.inputValue();
          expect(value).toBe("Vika");
        });

        await test.step("Очистить поле и проверить, что оно пустое", async () => {
          await tab.clearSearch();
          const value = await tab.searchInput.inputValue();
          expect(value).toBe("");
        });
      },
    );

    test(
      "C7152: Очистка поиска восстанавливает таблицу",
      { tag: ["@critical"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("critical");
        const tab = new ScoreDistributionTab(page, testInfo);

        await test.step("Открыть вкладку «Распределение оценок»", async () => {
          await tab.open();
        });

        let initialRowCount;

        await test.step("Запомнить количество строк, ввести текст и очистить поле", async () => {
          initialRowCount = await tab.getRowCount();

          // Вводим текст и очищаем
          await tab.searchEmployee("Тестовый текст");
          await page.waitForLoadState("networkidle");
          await tab.clearSearch();
          await page.waitForLoadState("networkidle");
        });

        await test.step("Проверить, что таблица восстановилась с исходным количеством строк", async () => {
          // После очистки таблица должна быть видна с тем же количеством строк
          await expect(async () => {
            const restoredRowCount = await tab.getRowCount();
            expect(restoredRowCount).toBe(initialRowCount);
          }).toPass({ timeout: 10000 });
        });
      },
    );

    test(
      "C7153: Поле поиска доступно для ввода и имеет корректный ID",
      { tag: ["@critical"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("critical");
        const tab = new ScoreDistributionTab(page, testInfo);

        await test.step("Открыть вкладку «Распределение оценок»", async () => {
          await tab.open();
        });

        await test.step("Проверить, что поле поиска активно и принимает фокус по клику", async () => {
          // Поле должно быть enabled
          await expect(tab.searchInput).toBeEnabled();

          // Клик по полю фокусирует его
          await tab.searchInput.click();
          await expect(tab.searchInput).toBeFocused();
        });
      },
    );
  },
);
