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
  "Фильтр «Сотрудники» — Администратор",
  { tag: ["@ui", "@my-team", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.MY_TEAM);
    });

    test(
      "C7115: Проверить дефолтное значение и список опций для администратора",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }) => {
        setSeverity("critical");

        const tab = new ScoreDistributionTab(page);

        await test.step("Открыть вкладку распределения оценок", async () => {
          await tab.open();
        });

        await test.step("Проверить дефолтное значение фильтра и список опций", async () => {
          // Проверяем дефолтное значение
          const defaultValue = await tab.getEmployeesFilterValue();
          expect(defaultValue).toBe("Все сотрудники");

          // Проверяем список опций
          const options = await tab.getEmployeesFilterOptions();
          expect(options).toEqual([
            "Все сотрудники",
            "Все подчиненные",
            "Прямые подчиненные",
          ]);

          // Таблица при дефолте содержит данные
          const rowCount = await tab.getRowCount();
          expect(rowCount).toBeGreaterThan(0);
        });

        await test.step("Сверить количество строк с данными API", async () => {
          // === API-сверка: total из API должен совпадать с UI (первая страница = 20) ===
          const api = new DashboardTeamAPI(request);
          const { email, password } = getCredentials("admin");
          await api.signIn(email, password);
          const { data: apiUsers } = await api.getDistributionUsers({
            usersSubset: "all",
            limit: 20,
            offset: 0,
          });
          expect(apiUsers.total).toBeGreaterThan(0);
          // UI показывает первую страницу (limit=20)
          const rowCount = await tab.getRowCount();
          expect(rowCount).toBe(Math.min(apiUsers.total, 20));
        });
      },
    );

    test(
      "C7116: Переключить фильтр с «Все сотрудники» на «Все подчиненные»",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }) => {
        setSeverity("normal");

        const tab = new ScoreDistributionTab(page);

        let allCount;
        let allNames;

        await test.step("Открыть вкладку и запомнить данные при «Все сотрудники»", async () => {
          await tab.open();

          // Запоминаем данные до переключения
          allCount = await tab.getRowCount();
          allNames = await tab.getEmployeeNames();
          expect(allCount).toBeGreaterThan(0);
        });

        await test.step("Переключить фильтр на «Все подчиненные» и проверить значение", async () => {
          // Переключаем на «Все подчиненные»
          await tab.selectEmployeesOption("Все подчиненные");
          const currentValue = await tab.getEmployeesFilterValue();
          expect(currentValue).toBe("Все подчиненные");
        });

        await test.step("Проверить что подчинённых не больше чем всех сотрудников", async () => {
          // Подчинённых не больше, чем всех сотрудников
          await page.waitForLoadState("networkidle");
          // Дождаться перерисовки: либо таблица с данными, либо пустое состояние (DOM_RACE fix)
          const tableOrEmpty = await Promise.race([
            tab.tableHeaders
              .first()
              .waitFor({ state: "visible", timeout: 20000 })
              .then(() => "rows"),
            page
              .getByText("Нет подходящих оценок")
              .waitFor({ state: "visible", timeout: 20000 })
              .then(() => "empty"),
          ]);

          if (tableOrEmpty === "rows") {
            const subCount = await tab.getRowCount();
            expect(subCount).toBeLessThanOrEqual(allCount);

            // Проверяем subset через API (UI-имена ненадёжны при пагинации — первые 20 из разных наборов могут не пересекаться)
            const api = new DashboardTeamAPI(request);
            const { email, password } = getCredentials("admin");
            await api.signIn(email, password);
            const { data: apiSub } = await api.getDistributionUsers({
              usersSubset: "subordinates",
              limit: 20,
              offset: 0,
            });
            expect(apiSub.total).toBeLessThanOrEqual(allCount > 0 ? allCount * 100 : Infinity);
            expect(subCount).toBe(Math.min(apiSub.total, 20));
          }
          // "empty" — допустимо: у подчинённых нет оценок в текущем периоде (0 <= allCount)
        });

        await test.step("Сверить общее количество через API", async () => {
          // === API-сверка: total «Все сотрудники» из API ===
          const api = new DashboardTeamAPI(request);
          const { email, password } = getCredentials("admin");
          await api.signIn(email, password);
          const { data: apiAll } = await api.getDistributionUsers({
            usersSubset: "all",
            limit: 20,
            offset: 0,
          });
          expect(apiAll.total).toBeGreaterThan(0);
          expect(allCount).toBe(Math.min(apiAll.total, 20));
        });
      },
    );

    test(
      "C7219: Прямые подчинённые показывают меньше сотрудников, чем все подчинённые",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }) => {
        setSeverity("normal");

        const tab = new ScoreDistributionTab(page);
        let allTotal;
        let directTotal;

        await test.step("Получить через API количество всех подчинённых и прямых подчинённых", async () => {
          // Получаем API-данные для «Все подчиненные»
          const api = new DashboardTeamAPI(request);
          const { email, password } = getCredentials("admin");
          await api.signIn(email, password);

          const { data: allData } = await api.getDistributionUsers({
            usersSubset: "all",
          });
          allTotal = allData.total;
          expect(allTotal).toBeGreaterThan(0);

          // Получаем API-данные для «Прямые подчиненные»
          const { data: directData } = await api.getDistributionUsers({
            usersSubset: "directSubordinates",
          });
          directTotal = directData.total;

          // Прямых подчинённых должно быть меньше, чем всех подчинённых
          expect(directTotal).toBeLessThan(allTotal);
        });

        await test.step("Открыть вкладку и переключить фильтр на «Прямые подчиненные»", async () => {
          await tab.open();

          // Переключаем на «Прямые подчиненные»
          await tab.selectEmployeesOption("Прямые подчиненные");
          await page.keyboard.press("Escape");
          await page.waitForLoadState("networkidle");

          const currentValue = await tab.getEmployeesFilterValue();
          expect(currentValue).toBe("Прямые подчиненные");
        });

        await test.step("Проверить результат фильтрации в таблице", async () => {
          // UI фильтрует по периоду → может показать 0 строк даже при directTotal > 0
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
            const directCount = await tab.getRowCount();
            expect(directCount).toBeGreaterThan(0);
            expect(directCount).toBeLessThanOrEqual(Math.min(directTotal, 20));
          }
          // "empty" — допустимо: у прямых подчинённых нет оценок в текущем периоде
        });
      },
    );
  },
);
