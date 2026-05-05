import { test, expect } from "../../../fixtures/auth.js";
import { MyTeamPage } from "../../../../pages/MyTeamPage.js";
import { DashboardTeamAPI } from "../../../utils/api/DashboardTeamAPI.js";
import { getCredentials } from "../../../utils/credentials.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";

test.describe(
  "Review Admin — Фильтр сотрудников scoped",
  { tag: ["@ui", "@my-team", "@regression", "@review-admin"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.MY_TEAM, "Review Admin Employees");
    });

    test(
      "C8066: В таблице «Оценка команды» видны только сотрудники из assigned PR",
      { tag: ["@critical"] },
      async ({ reviewAdminAuth: page, request }) => {
        setSeverity("critical");

        const myTeam = new MyTeamPage(page);
        const setup = page._reviewAdminSetup;

        expect(setup, "reviewAdminSetup должен быть доступен").toBeTruthy();
        expect(setup.prId, "prId должен быть в setup").toBeTruthy();

        await test.step(
          'Открыть дашборд → вкладка «Оценка команды»',
          async () => {
            const origin = new URL(page.url()).origin;
            await page.goto(`${origin}/ru/dashboard/`);
            await page.waitForLoadState("domcontentloaded");
            await expect(myTeam.heading).toBeVisible({ timeout: 15000 });
          },
        );

        await test.step(
          "Выбрать assigned PR в фильтре оценок",
          async () => {
            // Открываем модалку выбора оценки и ищем assigned PR
            await myTeam.assessmentSelect.click();

            const modal = page
              .locator('[class*="Modal"], [role="dialog"]')
              .filter({ hasText: "Выберите оценку" })
              .first();
            await modal.waitFor({ state: "visible", timeout: 15000 });

            // Берём первую доступную карточку PR (review_admin видит только assigned)
            const cards = modal.locator(
              'button, [class*="Card"], [class*="card"]',
            );
            const cardCount = await cards.count();
            expect(
              cardCount,
              "Review admin должен видеть хотя бы 1 PR в модалке",
            ).toBeGreaterThan(0);

            // Кликаем первую карточку
            await cards.first().click();
            await modal
              .waitFor({ state: "hidden", timeout: 10000 })
              .catch(() => {});
          },
        );

        let uiEmployeeNames = [];

        await test.step(
          "Проверить, что таблица содержит строки с сотрудниками",
          async () => {
            // Ждём загрузки таблицы
            await myTeam.table.waitFor({ state: "visible", timeout: 15000 });
            await page.waitForLoadState("networkidle").catch(() => {});

            const rowCount = await myTeam.tableRows.count();
            expect(
              rowCount,
              "Таблица должна содержать хотя бы 1 строку с сотрудником из assigned PR",
            ).toBeGreaterThan(0);

            console.log(
              `[C8066] Количество сотрудников в таблице UI: ${rowCount}`,
            );

            // Извлечь имена сотрудников из первой колонки таблицы
            for (let i = 0; i < rowCount; i++) {
              const row = myTeam.tableRows.nth(i);
              const firstCell = row.locator("td").first();
              const cellText = (await firstCell.textContent()) || "";
              const name = cellText.trim().replace(/\s+/g, " ");
              if (name) {
                uiEmployeeNames.push(name);
              }
            }

            console.log(
              `[C8066] Имена в UI таблице: ${JSON.stringify(uiEmployeeNames)}`,
            );
          },
        );

        await test.step(
          "API cross-check: review_admin получает только сотрудников из assigned PR",
          async () => {
            // Создаём API клиент от имени review_admin
            const reviewAdminAPI = new DashboardTeamAPI(request);
            await reviewAdminAPI.signIn(
              setup.email,
              process.env.TEST_USER_PASSWORD || "DemoPass_7421!",
            );

            const { response: raResponse, data: raData } =
              await reviewAdminAPI.getDistributionUsers({
                usersSubset: "all",
                limit: 200,
              });

            expect(
              raResponse.ok(),
              `distribution-users вернул ${raResponse.status()} для review_admin`,
            ).toBe(true);
            expect(
              raData?.items,
              "API должен вернуть поле items",
            ).toBeDefined();

            const apiUsers = raData.items;
            const apiTotal = raData.total ?? apiUsers.length;

            console.log(
              `[C8066] API (review_admin) вернул ${apiUsers.length} пользователей (total=${apiTotal})`,
            );

            // Строим множество имён из API (firstName + lastName)
            const apiNames = new Set(
              apiUsers.map((u) => {
                const full = `${u.firstName || ""} ${u.lastName || ""}`.trim().replace(/\s+/g, " ");
                return full;
              }),
            );

            // Каждое имя из UI должно присутствовать в API-ответе review_admin
            // (все сотрудники в таблице — в пределах его scope)
            for (const uiName of uiEmployeeNames) {
              const found = apiUsers.some((u) => {
                const apiName = `${u.firstName || ""} ${u.lastName || ""}`.trim().replace(/\s+/g, " ");
                return apiName === uiName || uiName.includes(apiName) || apiName.includes(uiName);
              });
              expect(
                found,
                `Сотрудник "${uiName}" из UI не найден в API-ответе review_admin — возможна утечка данных из чужого PR`,
              ).toBe(true);
            }

            console.log(
              `[C8066] OK: все ${uiEmployeeNames.length} сотрудников из UI найдены в API scope review_admin`,
            );
          },
        );

        await test.step(
          "Сравнение с полным admin: review_admin видит МЕНЬШЕ сотрудников",
          async () => {
            // Создаём API клиент от имени полного администратора
            const adminAPI = new DashboardTeamAPI(request);
            const { email: adminEmail, password: adminPassword } =
              getCredentials("admin");
            await adminAPI.signIn(adminEmail, adminPassword);

            const { response: adminResponse, data: adminData } =
              await adminAPI.getDistributionUsers({
                usersSubset: "all",
                limit: 200,
              });

            expect(
              adminResponse.ok(),
              `distribution-users вернул ${adminResponse.status()} для admin`,
            ).toBe(true);

            const adminTotal = adminData?.total ?? adminData?.items?.length ?? 0;

            // Получаем review_admin total для сравнения
            const reviewAdminAPI2 = new DashboardTeamAPI(request);
            await reviewAdminAPI2.signIn(
              setup.email,
              process.env.TEST_USER_PASSWORD || "DemoPass_7421!",
            );
            const { data: raData2 } = await reviewAdminAPI2.getDistributionUsers({
              usersSubset: "all",
              limit: 200,
            });
            const reviewAdminTotal =
              raData2?.total ?? raData2?.items?.length ?? 0;

            console.log(
              `[C8066] Admin видит ${adminTotal} сотрудников, review_admin видит ${reviewAdminTotal}`,
            );

            // review_admin должен видеть МЕНЬШЕ или равно числу сотрудников admin
            // (его scope ограничен одним PR, а не всеми PR компании)
            expect(
              reviewAdminTotal,
              `review_admin видит ${reviewAdminTotal} сотрудников, admin видит ${adminTotal} — review_admin не должен видеть больше чем admin`,
            ).toBeLessThanOrEqual(adminTotal);

            // Если admin видит хотя бы 2 сотрудников — review_admin должен видеть МЕНЬШЕ
            // (его scope scoped на один PR, поэтому не равен полному списку)
            if (adminTotal > 1) {
              expect(
                reviewAdminTotal,
                `review_admin (${reviewAdminTotal}) не должен видеть столько же сотрудников, сколько full admin (${adminTotal}) — scoping не работает`,
              ).toBeLessThan(adminTotal);
            }

            console.log(
              `[C8066] OK: review_admin видит меньше сотрудников, чем полный admin — scoping работает`,
            );
          },
        );
      },
    );
  },
);
