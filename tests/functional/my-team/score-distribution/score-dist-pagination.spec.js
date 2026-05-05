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
  "Распределение оценок — Пагинация «Показать ещё»",
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
      "C7178: Кнопка «Показать ещё» видна при наличии более 20 сотрудников",
      { tag: ["@critical"] },
      async ({ request }) => {
        setSeverity("critical");

        await test.step("Проверить что в таблице загружено 20 строк и кнопка «Показать ещё» видна", async () => {
          const initialCount = await tab.getRowCount();
          expect(initialCount).toBe(20);

          await expect(tab.showMoreButton).toBeVisible();
        });

        await test.step("Сверить через API что всего сотрудников больше 20", async () => {
          // === API-сверка: total из API > 20, поэтому кнопка видна ===
          const api = new DashboardTeamAPI(request);
          const { email, password } = getCredentials("admin");
          await api.signIn(email, password);
          const { data: apiUsers } = await api.getDistributionUsers({
            usersSubset: "all",
            limit: 20,
            offset: 0,
          });
          expect(
            apiUsers.total,
            `API total=${apiUsers.total} должен быть > 20 для пагинации`,
          ).toBeGreaterThan(20);
        });
      },
    );

    test(
      "C7179: Клик на «Показать ещё» подгружает дополнительные строки",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }) => {
        setSeverity("critical");

        let initialCount;

        await test.step("Запомнить начальное количество строк в таблице", async () => {
          initialCount = await tab.getRowCount();
          expect(initialCount).toBe(20);
        });

        let newCount;

        await test.step("Кликнуть «Показать ещё» и дождаться новых строк", async () => {
          await tab.showMoreButton.click();
          await page.waitForLoadState("networkidle");

          await expect(async () => {
            newCount = await tab.getRowCount();
            expect(newCount).toBeGreaterThan(initialCount);
          }).toPass({ timeout: 10000 });
        });

        await test.step("Сверить итоговое количество строк с данными API", async () => {
          // === API-сверка: после «Показать ещё» = offset 20, новая порция = 20 ===
          const api = new DashboardTeamAPI(request);
          const { email, password } = getCredentials("admin");
          await api.signIn(email, password);
          const { data: apiUsers } = await api.getDistributionUsers({
            usersSubset: "all",
            limit: 20,
            offset: 0,
          });
          // UI после одного клика: min(total, 40), но не больше
          expect(newCount).toBe(Math.min(apiUsers.total, 40));
        });
      },
    );

    test(
      "C7180: Повторный клик подгружает следующую порцию строк",
      { tag: ["@critical"] },
      async ({ adminAuth: page }) => {
        setSeverity("critical");

        let countAfterFirst;

        await test.step("Кликнуть «Показать ещё» первый раз и дождаться новых строк", async () => {
          // Первый клик
          await tab.showMoreButton.click();
          await page.waitForLoadState("networkidle");

          await expect(async () => {
            countAfterFirst = await tab.getRowCount();
            expect(countAfterFirst).toBeGreaterThan(20);
          }).toPass({ timeout: 10000 });

          // Проверяем, что кнопка всё ещё видна (есть ещё строки)
          await expect(tab.showMoreButton).toBeVisible({ timeout: 3000 });
        });

        await test.step("Кликнуть «Показать ещё» второй раз и проверить увеличение строк", async () => {
          // Второй клик
          await tab.showMoreButton.click();
          await page.waitForLoadState("networkidle");

          await expect(async () => {
            const countAfterSecond = await tab.getRowCount();
            expect(countAfterSecond).toBeGreaterThan(countAfterFirst);
          }).toPass({ timeout: 10000 });
        });
      },
    );

    test(
      "C7181: Кнопка «Показать ещё» скрыта, когда все строки помещаются на одну страницу",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }) => {
        setSeverity("critical");

        await test.step("Проверить что кнопка «Показать ещё» видна при полном наборе данных", async () => {
          // По умолчанию «Все сотрудники» = 2000+ строк → кнопка видна
          await expect(tab.showMoreButton).toBeVisible({ timeout: 5000 });
        });

        await test.step("Найти сотрудника и выполнить поиск по точному имени через API", async () => {
          // === API-first: найти сотрудника с уникальным именем (< 20 совпадений) ===
          const api = new DashboardTeamAPI(request);
          const { email, password } = getCredentials("admin");
          await api.signIn(email, password);
          const { data: apiUsers } = await api.getDistributionUsers({
            usersSubset: "all",
            limit: 1,
            offset: 0,
          });
          expect(apiUsers.items.length).toBeGreaterThan(0);
          const employee = apiUsers.items[0];
          const searchTerm =
            `${employee.firstName} ${employee.lastName}`.trim();

          // Сужаем набор поиском — меньше 20 результатов → кнопка не нужна
          await tab.searchEmployee(searchTerm);
          await page.waitForLoadState("networkidle");

          await expect(async () => {
            const count = await tab.getRowCount();
            expect(count).toBeGreaterThan(0);
            expect(count).toBeLessThan(20);
          }).toPass({ timeout: 10000 });
        });

        await test.step("Проверить что кнопка «Показать ещё» скрыта после фильтрации", async () => {
          // Все результаты помещаются на одну страницу — кнопка скрыта
          await expect(tab.showMoreButton).not.toBeVisible({ timeout: 5000 });
        });

        await test.step("Очистить поиск и проверить что кнопка снова появляется", async () => {
          // Очищаем поиск — кнопка снова видна
          await tab.clearSearch();
          await page.waitForLoadState("networkidle");

          await expect(tab.showMoreButton).toBeVisible({ timeout: 10000 });
        });
      },
    );
  },
);
