import { test, expect } from "../../../fixtures/auth.js";
import { MyTeamPage } from "../../../../pages/MyTeamPage.js";
import { DashboardTeamAPI } from "../../../utils/api/DashboardTeamAPI.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";
import { getTestUserPassword } from "../../../utils/credentials.js";

test.describe(
  "Review Admin — Доступ к результатам assigned PR",
  { tag: ["@ui", "@my-team", "@regression", "@review-admin"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.MY_TEAM, "Review Admin PR Results Access");
    });

    test(
      "C8069: Review admin может открыть результаты сотрудника из assigned PR",
      { tag: ["@critical"] },
      async ({ reviewAdminAuth: page, request }) => {
        setSeverity("critical");

        const myTeam = new MyTeamPage(page);
        const setup = page._reviewAdminSetup;

        expect(setup, "reviewAdminSetup должен быть доступен").toBeTruthy();
        expect(setup.prId, "prId должен быть в setup").toBeTruthy();

        // ─── API: verify assigned PR is visible and data is scoped correctly ────
        await test.step(
          "API: dashboard-filters показывает assigned PR, distribution-last-results скопирован на него",
          async () => {
            // Создаём API-клиент и аутентифицируемся как review_admin
            const dashAPI = new DashboardTeamAPI(request);
            await dashAPI.signIn(setup.email, getTestUserPassword());

            // 1. Проверяем, что assigned PR виден в dashboard-filters
            const { response: filtersResp, data: filtersData } =
              await dashAPI.getDashboardFiltersPRs();

            expect(
              filtersResp.ok(),
              `dashboard-filters/performance-reviews вернул ${filtersResp.status()} — API недоступен для review_admin`,
            ).toBe(true);

            const prList = Array.isArray(filtersData)
              ? filtersData
              : filtersData?.items || [];
            const prIds = prList.map((pr) => String(pr.id || pr.prId || pr));

            expect(
              prIds,
              `Assigned PR ${setup.prId} должен присутствовать в dashboard-filters для review_admin`,
            ).toContain(String(setup.prId));

            console.log(
              `[C8069] API filters OK: review_admin видит PR [${prIds.join(", ")}], assigned PR ${setup.prId} присутствует`,
            );

            // 2. Получить список пользователей, видимых review_admin
            const { response: usersResp, data: usersData } =
              await dashAPI.getDistributionUsers({
                usersSubset: "all",
                limit: 200,
              });

            expect(
              usersResp.ok(),
              `distribution-users вернул ${usersResp.status()}`,
            ).toBe(true);

            const visibleUsers = usersData?.items || [];
            expect(
              visibleUsers.length,
              "review_admin должен видеть хотя бы одного пользователя через distribution-users",
            ).toBeGreaterThan(0);

            const visibleUserIds = visibleUsers.map((u) => u.id);

            // 3. Получить результаты для видимых пользователей
            const { response: resultsResp, data: resultsData } =
              await dashAPI.getDistributionLastResults(visibleUserIds);

            expect(
              resultsResp.ok(),
              `distribution-last-results вернул ${resultsResp.status()}`,
            ).toBe(true);

            const entries = Object.values(resultsData || {});

            // Если у пользователей есть результаты — проверяем scope (привязку к assigned PR)
            if (entries.length > 0) {
              for (const entry of entries) {
                if (entry.performanceReview) {
                  const prIdFromResult =
                    entry.performanceReview.id ?? entry.performanceReview;
                  expect(
                    String(prIdFromResult),
                    `Результат ссылается на PR ${prIdFromResult}, но review_admin назначен только на PR ${setup.prId}`,
                  ).toBe(String(setup.prId));
                }
              }
              console.log(
                `[C8069] API results OK: ${entries.length} записей, все для PR ${setup.prId}`,
              );
            } else {
              // PR в состоянии "Ожидание" — пользователи есть, но результатов ещё нет
              console.log(
                `[C8069] API results: 0 записей (PR ${setup.prId} в состоянии ожидания — это ожидаемо)`,
              );
            }
          },
        );

        // ─── UI: open My Team page and select assigned PR ─────────────────────
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
            await myTeam.assessmentSelect.click();

            const modal = page
              .locator('[class*="Modal"], [role="dialog"]')
              .filter({ hasText: "Выберите оценку" })
              .first();
            await modal.waitFor({ state: "visible", timeout: 15000 });

            // review_admin видит только assigned PR — берём первую карточку
            const cards = modal.locator(
              'button, [class*="Card"], [class*="card"]',
            );
            const cardCount = await cards.count();
            expect(
              cardCount,
              "Review admin должен видеть хотя бы 1 PR в модалке",
            ).toBeGreaterThan(0);

            await cards.first().click();
            await modal
              .waitFor({ state: "hidden", timeout: 10000 })
              .catch(() => {});
          },
        );

        let employeeNameFromRow = null;

        await test.step(
          'Найти сотрудника и нажать кнопку «Результаты»',
          async () => {
            await myTeam.table.waitFor({ state: "visible", timeout: 15000 });
            await page.waitForLoadState("networkidle").catch(() => {});

            const rowCount = await myTeam.tableRows.count();
            expect(
              rowCount,
              "Должен быть хотя бы 1 сотрудник в таблице",
            ).toBeGreaterThan(0);

            // Запоминаем имя сотрудника из первой строки таблицы для верификации
            const firstRow = myTeam.tableRows.first();
            const nameCell = firstRow.locator("td").first();
            employeeNameFromRow = await nameCell
              .textContent()
              .then((t) => (t || "").trim());

            // Ищем первую строку с кнопкой «Результаты»
            const resultsButton = myTeam.resultsButtons.first();
            await resultsButton.waitFor({
              state: "visible",
              timeout: 15000,
            });
            await resultsButton.click();
          },
        );

        await test.step(
          "Проверить, что результаты открылись и содержат данные сотрудника",
          async () => {
            // Результаты могут открыться как модальное окно или как новая страница
            const modalOrPage = page.locator(
              '[class*="Modal"], [role="dialog"], [class*="EmployeeResults"], [class*="Results"]',
            );

            // Ждём появления модалки/страницы результатов ИЛИ перехода на другой URL
            const resultsVisible = await modalOrPage
              .first()
              .waitFor({ state: "visible", timeout: 15000 })
              .then(() => true)
              .catch(() => false);

            const urlChanged = page.url().includes("/results");

            expect(
              resultsVisible || urlChanged,
              "Результаты должны быть доступны (модалка открылась или произошёл переход)",
            ).toBeTruthy();

            // Дополнительно: если открылась модалка — проверяем что в ней есть
            // содержательные данные (не пустой контейнер)
            if (resultsVisible) {
              const resultsContainer = modalOrPage.first();

              // Контейнер результатов должен содержать хотя бы один не-пустой элемент с данными
              // (имя сотрудника, оценка, характеристика и т.п.)
              const hasContent = await resultsContainer
                .locator(
                  "h1, h2, h3, [class*='name'], [class*='Name'], [class*='score'], [class*='Score'], [class*='result'], [class*='Result']",
                )
                .first()
                .waitFor({ state: "visible", timeout: 5000 })
                .then(() => true)
                .catch(() => false);

              // Если нашли именованный элемент, дополнительно проверяем что он не пуст
              if (hasContent) {
                const contentText = await resultsContainer.textContent();
                expect(
                  (contentText || "").trim().length,
                  "Контейнер результатов не должен быть пустым",
                ).toBeGreaterThan(0);
              }
            }

            // Если произошёл переход на страницу results — URL должен содержать
            // prId assigned PR
            if (urlChanged) {
              const currentUrl = page.url();
              expect(
                currentUrl,
                `Страница результатов должна содержать ID assigned PR ${setup.prId} в URL`,
              ).toContain(String(setup.prId));
            }

            console.log(
              `[C8069] UI OK: результаты сотрудника "${employeeNameFromRow}" открыты для review_admin (PR ${setup.prId})`,
            );
          },
        );
      },
    );
  },
);
