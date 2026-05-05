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
  "Распределение оценок — Навигация к профилю сотрудника",
  { tag: ["@ui", "@my-team", "@regression"] },
  () => {
    let tab;

    test.beforeEach(async ({ adminAuth: page }, testInfo) => {
      markAsUITest(MODULES.MY_TEAM);
      tab = new ScoreDistributionTab(page, testInfo);
      await tab.open();
    });

    test(
      "C7166: Клик на аватар сотрудника ведёт в его профиль",
      { tag: ["@critical"] },
      async ({ adminAuth: page }) => {
        setSeverity("critical");

        let row;

        await test.step("Найти первого сотрудника в таблице", async () => {
          const employeeNames = await tab.getEmployeeNames();
          expect(
            employeeNames.length,
            "Таблица должна содержать хотя бы одного сотрудника",
          ).toBeGreaterThanOrEqual(1);

          row = tab.getRowByName(employeeNames[0]);
          const employeeCell = row.locator("td").first();
          const avatar = employeeCell
            .locator('[class*="Avatar_avatar"]')
            .first();
          await expect(avatar).toBeVisible();
        });

        await test.step("Кликнуть на аватар и проверить переход в профиль", async () => {
          const employeeCell = row.locator("td").first();
          const avatar = employeeCell
            .locator('[class*="Avatar_avatar"]')
            .first();

          await avatar.click();
          await page.waitForURL(/\/ru\/profile\/\d+/, { timeout: 5000 });

          expect(page.url()).toMatch(/\/ru\/profile\/\d+/);
        });
      },
    );

    test(
      "C7167: Клик на имя сотрудника ведёт в его профиль",
      { tag: ["@critical"] },
      async ({ adminAuth: page }) => {
        setSeverity("critical");

        let row;

        await test.step("Найти первого сотрудника в таблице", async () => {
          const employeeNames = await tab.getEmployeeNames();
          expect(
            employeeNames.length,
            "Таблица должна содержать хотя бы одного сотрудника",
          ).toBeGreaterThanOrEqual(1);

          row = tab.getRowByName(employeeNames[0]);
          const employeeCell = row.locator("td").first();
          const nameElement = employeeCell
            .locator('[class*="User_full-name-wrapper"] > div')
            .first();
          await expect(nameElement).toBeVisible();
        });

        await test.step("Кликнуть на имя и проверить переход в профиль", async () => {
          const employeeCell = row.locator("td").first();
          const nameElement = employeeCell
            .locator('[class*="User_full-name-wrapper"] > div')
            .first();

          await nameElement.click();
          await page.waitForURL(/\/ru\/profile\/\d+/, { timeout: 5000 });

          expect(page.url()).toMatch(/\/ru\/profile\/\d+/);
        });
      },
    );

    test(
      "C7168: URL профиля корректный (содержит ID сотрудника)",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }) => {
        setSeverity("critical");

        let employeeName = "";
        let apiUserId = null;

        await test.step("Получить ID первого сотрудника через API", async () => {
          const api = new DashboardTeamAPI(request);
          const { email, password } = getCredentials("admin");
          await api.signIn(email, password);

          const { data } = await api.getDistributionUsers({
            usersSubset: "all",
            limit: 10,
            offset: 0,
          });
          expect(
            data?.items?.length,
            "API должен вернуть сотрудников",
          ).toBeGreaterThan(0);

          // Берём имя первого сотрудника из UI-таблицы
          const employeeNames = await tab.getEmployeeNames();
          expect(
            employeeNames.length,
            "Таблица должна содержать хотя бы одного сотрудника",
          ).toBeGreaterThanOrEqual(1);
          employeeName = employeeNames[0];

          // Ищем этого сотрудника в API-данных по имени
          const apiUser = data.items.find((u) => {
            const fullName = [u.lastName, u.firstName]
              .filter(Boolean)
              .join(" ");
            return (
              fullName === employeeName || employeeName.includes(u.lastName)
            );
          });

          if (apiUser) {
            apiUserId = apiUser.id;
          }
        });

        await test.step("Кликнуть на имя сотрудника и перейти в профиль", async () => {
          const row = tab.getRowByName(employeeName);
          const employeeCell = row.locator("td").first();
          const nameElement = employeeCell
            .locator('[class*="User_full-name-wrapper"] > div')
            .first();

          await nameElement.click();
          await page.waitForURL(/\/ru\/profile\/\d+/, { timeout: 5000 });
        });

        await test.step("Проверить что ID в URL совпадает с ID из API", async () => {
          const urlMatch = page.url().match(/\/ru\/profile\/(\d+)/);
          expect(urlMatch, "URL должен содержать /profile/{id}").not.toBeNull();

          const urlId = Number(urlMatch[1]);
          expect(
            urlId,
            "ID в URL должен быть положительным числом",
          ).toBeGreaterThan(0);

          if (apiUserId) {
            expect(
              urlId,
              `ID в URL (${urlId}) должен совпадать с API ID сотрудника «${employeeName}» (${apiUserId})`,
            ).toBe(apiUserId);
          } else {
            test.info().annotations.push({
              type: "info",
              description: `Сотрудник «${employeeName}» не найден в API — кросс-проверка ID невозможна`,
            });
          }
        });
      },
    );
  },
);
