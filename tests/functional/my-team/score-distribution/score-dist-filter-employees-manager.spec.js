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
  "Фильтр «Сотрудники» — Руководитель (manager)",
  { tag: ["@ui", "@my-team", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.MY_TEAM);
    });

    test(
      "C7118: Проверить дефолтное значение и фильтр «Сотрудники» для руководителя",
      { tag: ["@critical"] },
      async ({ managerAuth: page, request }) => {
        setSeverity("critical");

        const tab = new ScoreDistributionTab(page);
        let rowCount;
        let apiSubordinates;
        let apiDirect;

        await test.step("Получить данные API для subordinates и directSubordinates", async () => {
          const api = new DashboardTeamAPI(request);
          const { email, password } = getCredentials("manager");
          await api.signIn(email, password);

          ({ data: apiSubordinates } = await api.getDistributionUsers({
            usersSubset: "subordinates",
            limit: 20,
            offset: 0,
          }));
          ({ data: apiDirect } = await api.getDistributionUsers({
            usersSubset: "directSubordinates",
            limit: 20,
            offset: 0,
          }));
          expect(apiSubordinates.total).toBeGreaterThan(0);
        });

        await test.step("Открыть вкладку и проверить дефолтный фильтр", async () => {
          await tab.open();

          const defaultValue = await tab.getEmployeesFilterValue();
          // Если все подчинённые === прямые → UI показывает "Прямые подчиненные" и dropdown disabled
          // Если есть непрямые → UI показывает "Все подчиненные" с двумя опциями
          const allAreDirect = apiSubordinates.total === apiDirect.total;

          if (allAreDirect) {
            expect(defaultValue).toBe("Прямые подчиненные");
            // Dropdown должен быть disabled (только одна опция)
            const isDisabled = await tab.employeesFilterCombobox.isDisabled();
            expect(isDisabled, "Dropdown disabled когда все подчинённые — прямые").toBe(true);
          } else {
            expect(defaultValue).toBe("Все подчиненные");
            // Dropdown активен — проверяем опции
            const options = await tab.getEmployeesFilterOptions();
            expect(options).toEqual(["Все подчиненные", "Прямые подчиненные"]);
          }

          // Таблица содержит данные
          rowCount = await tab.getRowCount();
          expect(rowCount).toBeGreaterThan(0);
        });

        await test.step("Сверить количество строк в таблице с ответом API", async () => {
          // UI показывает первую страницу (limit=20)
          const expectedCount = Math.min(apiSubordinates.total, 20);
          expect(rowCount).toBe(expectedCount);
        });
      },
    );

    test(
      "C7119: Переключить фильтр — API-сверка количества подчинённых",
      { tag: ["@critical"] },
      async ({ managerAuth: page, request }) => {
        setSeverity("normal");

        const tab = new ScoreDistributionTab(page);
        let apiAll;
        let apiDirect;

        await test.step("Получить данные API для subordinates и directSubordinates", async () => {
          const api = new DashboardTeamAPI(request);
          const { email, password } = getCredentials("manager");
          await api.signIn(email, password);

          ({ data: apiAll } = await api.getDistributionUsers({
            usersSubset: "subordinates",
            limit: 20,
            offset: 0,
          }));
          ({ data: apiDirect } = await api.getDistributionUsers({
            usersSubset: "directSubordinates",
            limit: 20,
            offset: 0,
          }));

          // directSubordinates ≤ all subordinates
          expect(apiDirect.total).toBeLessThanOrEqual(apiAll.total);
        });

        await test.step("Открыть вкладку и проверить переключение фильтра", async () => {
          await tab.open();

          const allAreDirect = apiAll.total === apiDirect.total;

          if (allAreDirect) {
            // Dropdown disabled — переключение невозможно, проверяем значение и disabled-состояние
            const currentValue = await tab.getEmployeesFilterValue();
            expect(currentValue).toBe("Прямые подчиненные");
            const isDisabled = await tab.employeesFilterCombobox.isDisabled();
            expect(isDisabled, "Фильтр заблокирован: все подчинённые прямые").toBe(true);

            // Данные таблицы соответствуют API (directSubordinates)
            const rowCount = await tab.getRowCount();
            expect(rowCount).toBe(Math.min(apiDirect.total, 20));
          } else {
            // Dropdown активен — переключаем с «Все подчиненные» на «Прямые подчиненные»
            const allSubCount = await tab.getRowCount();
            expect(allSubCount).toBe(Math.min(apiAll.total, 20));

            await tab.selectEmployeesOption("Прямые подчиненные");
            await page.waitForLoadState("networkidle");

            const currentValue = await tab.getEmployeesFilterValue();
            expect(currentValue).toBe("Прямые подчиненные");

            const expectedDirectCount = Math.min(apiDirect.total, 20);
            await expect(async () => {
              const directCount = await tab.getRowCount();
              expect(directCount).toBeGreaterThan(0);
              expect(directCount).toBe(expectedDirectCount);
            }).toPass({ timeout: 15000 });
          }
        });
      },
    );
  },
);
