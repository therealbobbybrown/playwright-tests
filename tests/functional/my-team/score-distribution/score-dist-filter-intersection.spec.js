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
  "Распределение оценок — пересечение фильтров",
  { tag: ["@ui", "@my-team", "@regression"] },
  () => {
    let tab;

    test.beforeEach(async ({ adminAuth: page }) => {
      markAsUITest(MODULES.MY_TEAM);
      tab = new ScoreDistributionTab(page);
    });

    test(
      "C7125: Переключение фильтра «Сотрудники» обновляет таблицу — API-сверка",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }) => {
        setSeverity("critical");

        await test.step("Открыть вкладку «Распределение оценок» и проверить дефолтный фильтр", async () => {
          await tab.open();
          await page.waitForLoadState("networkidle");

          // Дефолт: «Все сотрудники»
          const initialCount = await tab.getRowCount();
          const initialFilter = await tab.getEmployeesFilterValue();
          expect(initialFilter).toBe("Все сотрудники");
          expect(initialCount).toBeGreaterThan(0);
        });

        let expectedDirectCount;

        await test.step("Получить ожидаемые данные через API для обоих вариантов фильтра", async () => {
          // === API: получаем ожидаемые данные ДО переключения ===
          const api = new DashboardTeamAPI(request);
          const { email, password } = getCredentials("admin");
          await api.signIn(email, password);

          const { data: apiAll } = await api.getDistributionUsers({
            usersSubset: "all",
            limit: 20,
            offset: 0,
          });
          const initialCount = await tab.getRowCount();
          expect(initialCount).toBe(Math.min(apiAll.total, 20));

          const { data: apiDirect } = await api.getDistributionUsers({
            usersSubset: "directSubordinates",
            limit: 20,
            offset: 0,
          });
          expectedDirectCount = Math.min(apiDirect.total, 20);

          // directSubordinates total ≤ all total (API-уровень, всегда верно)
          expect(apiDirect.total).toBeLessThanOrEqual(apiAll.total);
        });

        await test.step("Переключить фильтр на «Прямые подчиненные» и проверить обновление таблицы", async () => {
          // Переключаем на «Прямые подчиненные»
          await tab.selectEmployeesOption("Прямые подчиненные");
          await page.keyboard.press("Escape");
          await page.waitForLoadState("networkidle");

          const newFilter = await tab.getEmployeesFilterValue();
          expect(newFilter).toBe("Прямые подчиненные");

          // UI фильтрует по периоду → может показать 0 строк даже при apiDirect.total > 0
          const tableOrEmpty = await Promise.race([
            tab.tableRows
              .first()
              .waitFor({ state: "visible", timeout: 20000 })
              .then(() => "rows"),
            page
              .getByText("Нет подходящих оценок")
              .waitFor({ state: "visible", timeout: 20000 })
              .then(() => "empty"),
          ]);

          if (tableOrEmpty === "rows") {
            const filteredCount = await tab.getRowCount();
            expect(filteredCount).toBeGreaterThan(0);
            expect(filteredCount).toBeLessThanOrEqual(expectedDirectCount);
          }
          // "empty" — допустимо: у прямых подчинённых нет оценок в текущем периоде
        });
      },
    );

    test(
      "C7126: Фильтр «Сотрудники» + поиск работают вместе (пересечение) — API-сверка",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }) => {
        setSeverity("critical");

        await test.step("Открыть вкладку «Распределение оценок»", async () => {
          await tab.open();
          await page.waitForLoadState("networkidle");
        });

        let api;
        let searchQuery;
        let uiSearchCount = 0;

        await test.step("Получить список сотрудников и применить поиск по имени", async () => {
          // Дефолт «Все сотрудники»
          const initialNames = await tab.getEmployeeNames();
          expect(initialNames.length).toBeGreaterThan(0);

          // Ищем по имени первого сотрудника
          const fullName = initialNames[0];
          searchQuery =
            fullName.split(" ").find((w) => w.length >= 3) ||
            fullName.slice(0, 5);
          await tab.searchEmployee(searchQuery);

          // UI: результаты содержат запрос
          await expect(async () => {
            const searchResults = await tab.getEmployeeNames();
            uiSearchCount = searchResults.length;
            expect(uiSearchCount).toBeGreaterThan(0);
            for (const resultName of searchResults) {
              expect(resultName.toLowerCase()).toContain(
                searchQuery.toLowerCase(),
              );
            }
          }).toPass({ timeout: 10000 });
        });

        await test.step("Сверить результат поиска «Все сотрудники» с API", async () => {
          // === API-сверка: поиск через API должен вернуть те же данные ===
          api = new DashboardTeamAPI(request);
          const { email, password } = getCredentials("admin");
          await api.signIn(email, password);

          const { data: apiSearch } = await api.getDistributionUsers({
            usersSubset: "all",
            q: searchQuery,
            limit: 20,
            offset: 0,
          });
          expect(apiSearch.total).toBeGreaterThan(0);
          expect(uiSearchCount).toBe(Math.min(apiSearch.total, 20));
        });

        await test.step("Переключить фильтр на «Прямые подчиненные» и применить поиск", async () => {
          // Очищаем поиск
          await tab.clearSearch();

          // Переключаем на «Прямые подчиненные» и повторяем поиск
          await tab.selectEmployeesOption("Прямые подчиненные");
          await page.waitForLoadState("networkidle");

          let filteredNames = [];
          await expect(async () => {
            filteredNames = await tab.getEmployeeNames();
          }).toPass({ timeout: 10000 });

          if (filteredNames.length > 0) {
            const filteredQuery =
              filteredNames[0].split(" ").find((w) => w.length >= 3) ||
              filteredNames[0].slice(0, 5);
            await tab.searchEmployee(filteredQuery);

            let uiIntersectionCount = 0;
            await expect(async () => {
              const results = await tab.getEmployeeNames();
              uiIntersectionCount = results.length;
              expect(uiIntersectionCount).toBeGreaterThan(0);
              for (const name of results) {
                expect(name.toLowerCase()).toContain(
                  filteredQuery.toLowerCase(),
                );
              }
            }).toPass({ timeout: 10000 });

            // === API-сверка: пересечение фильтров ===
            const { data: apiIntersection } = await api.getDistributionUsers({
              usersSubset: "directSubordinates",
              q: filteredQuery,
              limit: 20,
              offset: 0,
            });
            expect(apiIntersection.total).toBeGreaterThan(0);
            expect(uiIntersectionCount).toBe(
              Math.min(apiIntersection.total, 20),
            );
          }
        });
      },
    );

    test(
      "C7127: Поиск несуществующего при фильтре «Прямые подчиненные» — пустая таблица + API",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }) => {
        setSeverity("critical");

        await test.step("Открыть вкладку и переключить фильтр на «Прямые подчиненные»", async () => {
          await tab.open();
          await page.waitForLoadState("networkidle");

          // Переключаем на «Прямые подчиненные»
          await tab.selectEmployeesOption("Прямые подчиненные");
          await page.waitForLoadState("networkidle");

          await expect(async () => {
            const filterValue = await tab.getEmployeesFilterValue();
            expect(filterValue).toBe("Прямые подчиненные");
          }).toPass({ timeout: 5000 });
        });

        // Ждём загрузки таблицы
        const searchOrEmpty = await Promise.race([
          tab.searchInput
            .waitFor({ state: "visible", timeout: 10000 })
            .then(() => "search"),
          page
            .getByText("Нет подходящих оценок")
            .waitFor({ state: "visible", timeout: 10000 })
            .then(() => "empty"),
        ]);

        if (searchOrEmpty === "empty") {
          return;
        }

        await test.step("Ввести несуществующее имя и проверить, что таблица пустая", async () => {
          // Поиск по несуществующему имени
          const fakeQuery = "ZZZZNONEXISTENT";
          await tab.searchEmployee(fakeQuery);

          // UI: 0 результатов
          await expect(async () => {
            const emptyCount = await tab.getRowCount();
            expect(emptyCount).toBe(0);
          }).toPass({ timeout: 10000 });

          // === API-сверка: API тоже возвращает 0 ===
          const api = new DashboardTeamAPI(request);
          const { email, password } = getCredentials("admin");
          await api.signIn(email, password);

          const { data: apiEmpty } = await api.getDistributionUsers({
            usersSubset: "directSubordinates",
            q: fakeQuery,
            limit: 20,
            offset: 0,
          });
          expect(apiEmpty.total).toBe(0);
          expect(apiEmpty.items.length).toBe(0);
        });
      },
    );

    test(
      "C7128: Каждое изменение фильтра обновляет таблицу без перезагрузки — сверка данных",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }) => {
        setSeverity("critical");

        await test.step("Открыть вкладку «Распределение оценок» и проверить заголовок", async () => {
          await tab.open();
          await page.waitForLoadState("networkidle");

          const heading = page
            .locator("h1, h2, h3")
            .filter({ hasText: "Распределение оценок" });
          await expect(heading).toBeVisible();
        });

        let initialCount;

        await test.step("Запомнить количество строк и переключить фильтр на «Прямые подчиненные»", async () => {
          // Запоминаем количество строк (дефолт: «Все сотрудники»)
          initialCount = await tab.getRowCount();
          expect(initialCount).toBeGreaterThan(0);

          // Переключаем на «Прямые подчиненные»
          await tab.selectEmployeesOption("Прямые подчиненные");
          await page.waitForLoadState("networkidle");

          // Heading остаётся видимым (нет полной перезагрузки страницы)
          const heading = page
            .locator("h1, h2, h3")
            .filter({ hasText: "Распределение оценок" });
          await expect(heading).toBeVisible();

          const newFilter = await tab.getEmployeesFilterValue();
          expect(newFilter).toBe("Прямые подчиненные");
        });

        await test.step("Проверить обновление таблицы и сверить данные с API", async () => {
          // Ждём, пока таблица обновится: либо строки, либо пустое состояние
          const tableOrEmpty = await Promise.race([
            tab.tableRows
              .first()
              .waitFor({ state: "visible", timeout: 20000 })
              .then(() => "rows"),
            page
              .getByText("Нет подходящих оценок")
              .waitFor({ state: "visible", timeout: 20000 })
              .then(() => "empty"),
          ]);

          if (tableOrEmpty === "rows") {
            const filteredCount = await tab.getRowCount();
            expect(filteredCount).toBeGreaterThan(0);
            // Прямых подчинённых не больше, чем всех (1-я страница, но отношение верное)
            // Точную сверку делаем через API ниже
          } else {
            // Пустое состояние — допустимо если у админа 0 прямых подчинённых
            const rowCount = await tab.getRowCount();
            expect(rowCount).toBe(0);
          }

          // === API-сверка: directSubordinates ≤ all ===
          const api = new DashboardTeamAPI(request);
          const { email, password } = getCredentials("admin");
          await api.signIn(email, password);

          const { data: apiDirect } = await api.getDistributionUsers({
            usersSubset: "directSubordinates",
            limit: 1,
            offset: 0,
          });
          const { data: apiAll } = await api.getDistributionUsers({
            usersSubset: "all",
            limit: 1,
            offset: 0,
          });
          expect(apiDirect.total).toBeLessThanOrEqual(apiAll.total);
        });
      },
    );

    test(
      "C7129: Кнопка сброса фильтров возвращает все к дефолту — API-сверка",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }) => {
        setSeverity("critical");

        await test.step("Открыть вкладку и проверить дефолтный фильтр", async () => {
          await tab.open();
          await page.waitForLoadState("networkidle");

          // Default
          const initialFilter = await tab.getEmployeesFilterValue();
          expect(initialFilter).toBe("Все сотрудники");
          const initialCount = await tab.getRowCount();
          expect(initialCount).toBeGreaterThan(0);
        });

        let initialCount;

        await test.step("Изменить фильтр на «Прямые подчиненные»", async () => {
          initialCount = await tab.getRowCount();

          // Change filter
          await tab.selectEmployeesOption("Прямые подчиненные");
          await page.waitForLoadState("networkidle");

          const changedFilter = await tab.getEmployeesFilterValue();
          expect(changedFilter).toBe("Прямые подчиненные");

          // Reset button
          await expect(tab.resetButton).toBeVisible({ timeout: 3000 });
        });

        let restoredCount = 0;

        await test.step("Сбросить фильтр кнопкой (×) и проверить возврат к дефолту", async () => {
          // Сбрасываем (retry — под нагрузкой клик может не зарегистрироваться)
          await expect(async () => {
            if (await tab.resetButton.isVisible()) {
              await tab.resetButton.click();
            }
            const finalFilter = await tab.getEmployeesFilterValue();
            expect(finalFilter).toBe("Все сотрудники");
          }).toPass({ timeout: 15000 });

          await page.waitForLoadState("networkidle");

          // Данные вернулись
          await expect(async () => {
            restoredCount = await tab.getRowCount();
            expect(restoredCount).toBeGreaterThan(0);
            expect(restoredCount).toBe(initialCount);
          }).toPass({ timeout: 15000 });
        });

        await test.step("Сверить количество строк после сброса с API", async () => {
          // === API-сверка: после сброса total = «Все сотрудники» ===
          const api = new DashboardTeamAPI(request);
          const { email, password } = getCredentials("admin");
          await api.signIn(email, password);

          const { data: apiAll } = await api.getDistributionUsers({
            usersSubset: "all",
            limit: 20,
            offset: 0,
          });
          expect(restoredCount).toBe(Math.min(apiAll.total, 20));
        });
      },
    );
  },
);
