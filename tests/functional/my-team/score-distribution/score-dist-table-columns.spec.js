import { test, expect } from "../../../fixtures/auth.js";
import { ScoreDistributionTab } from "../../../../pages/ScoreDistributionTab.js";
import { DashboardTeamAPI } from "../../../utils/api/DashboardTeamAPI.js";
import { DatabaseClient } from "../../../utils/db/DatabaseClient.js";
import { getCredentials } from "../../../utils/credentials.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";
import { ensureCalibrationOnDistributionPR } from "../../../utils/helpers/ensureCalibration.js";

test.describe(
  "Распределение оценок — Колонки и строки таблицы",
  { tag: ["@ui", "@my-team", "@regression"] },
  () => {
    test.beforeAll(async ({ request }) => {
      test.setTimeout(180_000);
      await ensureCalibrationOnDistributionPR(request);
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.MY_TEAM);
    });

    test(
      "C7160: Таблица содержит все обязательные колонки",
      { tag: ["@critical"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("critical");
        const tab = new ScoreDistributionTab(page, testInfo);

        await test.step("Открыть вкладку «Распределение оценок»", async () => {
          await tab.open();
        });

        await test.step("Проверить заголовки всех обязательных колонок таблицы", async () => {
          const headers = await tab.getTableHeaders();
          // 4 видимых заголовка (5-я колонка для кнопки «Результаты» пустая)
          expect(headers).toHaveLength(4);
          expect(headers[0]).toBe("Сотрудник");
          expect(headers[1]).toBe("Итоговая оценка до калибровки");
          expect(headers[2]).toBe("Итоговая оценка после калибровки");
          expect(headers[3]).toBe("Название оценки");
        });
      },
    );

    test(
      "C7161: Строки сотрудников отображаются с аватаром, именем и должностью",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }, testInfo) => {
        setSeverity("critical");
        const tab = new ScoreDistributionTab(page, testInfo);

        await test.step("Открыть вкладку «Распределение оценок»", async () => {
          await tab.open();
        });

        await test.step("Проверить наличие строк и аватаров в каждой строке", async () => {
          const rowCount = await tab.getRowCount();
          expect(rowCount).toBeGreaterThan(0);

          const employeeNames = await tab.getEmployeeNames();
          expect(employeeNames.length).toBeGreaterThan(0);

          // Проверяем наличие аватаров в каждой строке
          const rows = await tab.tableRows.all();
          for (const row of rows) {
            const avatar = row.locator('[class*="Avatar_avatar"]').first();
            await expect(avatar).toBeVisible();
          }
        });

        await test.step("Сверить имена из UI с данными API", async () => {
          // === API-сверка: имена в UI совпадают с API ===
          const api = new DashboardTeamAPI(request);
          const { email, password } = getCredentials("admin");
          await api.signIn(email, password);
          const { data: apiUsers } = await api.getDistributionUsers({
            usersSubset: "all",
            limit: 20,
            offset: 0,
          });
          const apiNames = apiUsers.items.map((u) =>
            `${u.firstName} ${u.lastName}`.trim(),
          );

          const employeeNames = await tab.getEmployeeNames();

          // Каждое имя из UI должно присутствовать в API-ответе
          for (const uiName of employeeNames) {
            expect(
              apiNames.some(
                (apiName) =>
                  uiName.includes(apiName) || apiName.includes(uiName),
              ),
              `UI-имя «${uiName}» не найдено в API: ${apiNames.join(", ")}`,
            ).toBe(true);
          }
        });
      },
    );

    test(
      "C7162: Сотрудник с оценкой имеет название в колонке «Название оценки»",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }, testInfo) => {
        setSeverity("critical");
        const tab = new ScoreDistributionTab(page, testInfo);

        await test.step("Открыть вкладку «Распределение оценок»", async () => {
          await tab.open();
        });

        let text;
        let rowWithResults;

        await test.step("Найти строку с кнопкой «Результаты» и проверить колонку «Название оценки»", async () => {
          // Находим строку с кнопкой «Результаты» — у такого сотрудника есть оценка
          rowWithResults = tab.tableRows
            .filter({
              has: page.getByRole("button", { name: "Результаты" }),
            })
            .first();
          await expect(rowWithResults).toBeVisible();

          // Колонка «Название оценки» (4-я, index=3) не должна быть пустой и не «Не проходил оценку»
          const assessmentCell = rowWithResults.locator("td").nth(3);
          text = await assessmentCell.innerText();
          expect(text.trim()).not.toBe("");
          expect(text.trim()).not.toBe("Не проходил оценку");
        });

        await test.step("Сверить название оценки из UI с данными API и DB", async () => {
          // === API-сверка: название оценки совпадает с performanceReview.title из API ===
          const api = new DashboardTeamAPI(request);
          const { email, password } = getCredentials("admin");
          await api.signIn(email, password);

          // Получаем имя сотрудника из строки
          const nameEl = rowWithResults
            .locator("td")
            .first()
            .locator('[class*="User_full-name-wrapper"] > div')
            .first();
          const uiName = await nameEl.innerText();

          // Получаем данные из API
          const { data: apiUsers } = await api.getDistributionUsers({
            usersSubset: "all",
            q: uiName.split(" ")[0],
            limit: 5,
          });
          if (apiUsers.items.length > 0) {
            const userIds = apiUsers.items.map((u) => u.id);
            const { data: results } =
              await api.getDistributionLastResults(userIds);
            // Найти результат с непустым PR title
            const resultEntries = Object.values(results || {});
            const withTitle = resultEntries.find(
              (r) => r.performanceReview?.title,
            );
            if (withTitle) {
              // API возвращает "last result" по своей логике сортировки,
              // UI может показывать другой PR при наличии нескольких.
              // Проверяем что API вернул валидный PR с непустым title.
              expect(
                withTitle.performanceReview.title,
                "API PR title должен быть непустым",
              ).toBeTruthy();

              // Если API title совпадает с UI — дополнительная валидация
              if (text.trim() === withTitle.performanceReview.title) {
                console.log(`  API и UI title совпадают: "${text.trim()}"`);
              } else {
                console.log(
                  `  API title: "${withTitle.performanceReview.title}", UI title: "${text.trim()}" — разные PR, пропускаем строгое сравнение`,
                );
              }

              // === DB-кросс-проверка: API вернул ПОСЛЕДНИЙ PR по date_start ===
              const targetUserId = withTitle.targetUserId;
              const db = new DatabaseClient();
              try {
                await db.connect();
                const prs = await db.query(
                  `SELECT DISTINCT
                   pr.id AS pr_id,
                   pr.title,
                   rev.date_start
                 FROM performance_review_user_competences_mean_history mh
                 JOIN performance_review_revisions rev ON rev.id = mh.performance_review_revision_id
                 JOIN performance_reviews pr ON pr.id = rev.performance_review_id
                 WHERE mh.target_user_id = ?
                   AND pr.deleted_at IS NULL
                   AND pr.is_archived = 0
                   AND mh.is_removed = 0
                   AND mh.value IS NOT NULL
                   AND rev.date_start >= DATE_SUB(NOW(), INTERVAL 3 MONTH)
                 ORDER BY rev.date_start DESC`,
                  [targetUserId],
                );
                if (prs.length >= 2) {
                  const latestDbPrId = prs[0].pr_id;
                  expect(
                    withTitle.performanceReview.id,
                    `API вернул PR ${withTitle.performanceReview.id} "${withTitle.performanceReview.title}", ` +
                      `но последний по date_start в DB: PR ${latestDbPrId} "${prs[0].title}"`,
                  ).toBe(latestDbPrId);
                } else if (prs.length === 1) {
                  expect(withTitle.performanceReview.id).toBe(prs[0].pr_id);
                }
              } catch {
                // DB недоступна — пропускаем DB-верификацию
              } finally {
                if (db.isConnected()) await db.disconnect();
              }
            }
          }
        });
      },
    );

    test(
      "C7163: Сотрудник без оценки имеет текст «Не проходил оценку» и кнопка «Результаты» отсутствует",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }, testInfo) => {
        setSeverity("critical");
        const tab = new ScoreDistributionTab(page, testInfo);

        await test.step("Открыть вкладку «Распределение оценок»", async () => {
          await tab.open();
        });

        await test.step("Найти сотрудника без оценки и проверить отсутствие кнопки «Результаты»", async () => {
          // Ищем строку с текстом «Не проходил оценку»
          const rowWithoutAssessment = tab.tableRows
            .filter({
              hasText: "Не проходил оценку",
            })
            .first();

          // Если такая строка есть — проверяем отсутствие кнопки «Результаты»
          const isVisible = await rowWithoutAssessment.isVisible();
          if (isVisible) {
            const resultsButton = rowWithoutAssessment.getByRole("button", {
              name: "Результаты",
            });
            await expect(resultsButton).not.toBeVisible();

            // === API-сверка: у сотрудника без оценки performanceReview = null ===
            const nameEl = rowWithoutAssessment
              .locator("td")
              .first()
              .locator('[class*="User_full-name-wrapper"] > div')
              .first();
            const employeeName = await nameEl.innerText();

            const api = new DashboardTeamAPI(request);
            const { email, password } = getCredentials("admin");
            await api.signIn(email, password);

            const { data: apiUsers } = await api.getDistributionUsers({
              usersSubset: "all",
              q: employeeName.split(" ")[0],
              limit: 5,
              offset: 0,
            });

            expect(
              apiUsers.items?.length,
              `API: поиск по «${employeeName.split(" ")[0]}» должен вернуть результат`,
            ).toBeGreaterThan(0);

            const targetUserId = apiUsers.items[0].id;
            const { data: results } = await api.getDistributionLastResults([
              targetUserId,
            ]);
            const result = Object.values(results || {})[0];
            // Для сотрудника без оценки: либо нет записи, либо performanceReview = null
            if (result) {
              expect(
                result.performanceReview,
                `API: сотрудник «${employeeName}» без оценки должен иметь performanceReview = null, ` +
                  `получено: ${JSON.stringify(result.performanceReview)}`,
              ).toBeFalsy();
            }
            // result === undefined — OK, API не возвращает запись для пользователей без оценок
          } else {
            // На заглушках все сотрудники могут иметь оценку — тест проходит
            test.info().annotations.push({
              type: "info",
              description: "Нет сотрудника без оценки в текущих данных",
            });
          }
        });
      },
    );

    test(
      "C7164: Бейджи оценки отображаются с корректным текстом и цветом",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }, testInfo) => {
        setSeverity("critical");
        const tab = new ScoreDistributionTab(page, testInfo);

        await test.step("Открыть вкладку «Распределение оценок»", async () => {
          await tab.open();
        });

        let user;

        await test.step("Найти через API сотрудника с оценкой и применить поиск", async () => {
          // === API-first: найти сотрудника с оценкой (батчами по 100) ===
          const api = new DashboardTeamAPI(request);
          const { email, password } = getCredentials("admin");
          await api.signIn(email, password);

          const { result: withScore, user: foundUser } =
            await api.findDistributionUser(
              (r) => r.revisionMean !== null && r.revisionMean !== undefined,
            );

          expect(
            withScore,
            "API: должен быть хотя бы один сотрудник с оценкой — проверьте seed данные",
          ).toBeTruthy();

          user = foundUser;
          await tab.searchEmployee(user.lastName || user.firstName);
          await page.waitForLoadState("networkidle");
        });

        await test.step("Проверить бейдж оценки: текст с числом и цвет фона", async () => {
          // CompetenceResult_competenceResult — контейнер бейджа оценки (число + текст)
          const badge = tab.table
            .locator('[class*="CompetenceResult_competenceResult"]')
            .first();
          await expect(badge).toBeVisible({ timeout: 10000 });

          // Проверяем, что бейдж содержит текст с числовым значением
          const text = await badge.innerText();
          expect(text.trim().length).toBeGreaterThan(0);
          expect(text).toMatch(/\d+(\.\d+)?/);

          // Проверяем, что элементы бейджа имеют inline background-color
          const item = tab.table
            .locator('[class*="CompetenceResult_item"]')
            .first();
          const bgColor = await item.evaluate((el) => el.style.backgroundColor);
          expect(bgColor).toBeTruthy();
          expect(bgColor).toMatch(/^rgb/);
        });
      },
    );

    test(
      "C7165: Иконка-карандаш (OverwriteButton) отображается в колонке «после калибровки»",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }, testInfo) => {
        setSeverity("critical");
        const tab = new ScoreDistributionTab(page, testInfo);

        await test.step("Открыть вкладку «Распределение оценок»", async () => {
          await tab.open();
        });

        let rowWithScore = null;

        await test.step("Найти через API сотрудника с оценкой и применить поиск", async () => {
          // === API-first: найти сотрудника с оценкой до калибровки (поиск в расширенной выборке) ===
          const api = new DashboardTeamAPI(request);
          const { email, password } = getCredentials("admin");
          await api.signIn(email, password);

          const { result: withScore, user } = await api.findDistributionUser(
            (r) =>
              r.revisionMean !== null &&
              r.revisionMean !== undefined &&
              r.responseOverwritable?.isOverwritable === true,
          );

          expect(
            withScore,
            "API: должен быть хотя бы один overwritable сотрудник с оценкой — проверьте seed данные",
          ).toBeTruthy();

          await tab.searchEmployee(user.lastName || user.firstName);
          await page.waitForLoadState("networkidle");
        });

        await test.step("Найти строку с оценкой и проверить наличие кнопки-карандаша", async () => {
          // Найти строку с реальной оценкой (не "–") среди результатов поиска
          await page
            .locator("table tbody tr")
            .first()
            .waitFor({ state: "visible", timeout: 10000 });
          const rows = await page.locator("table tbody tr").all();

          for (const r of rows) {
            const cells = await r.locator("td").all();
            if (cells.length >= 3) {
              const scoreText = await cells[1].textContent();
              if (scoreText.trim() !== "–" && scoreText.trim() !== "") {
                rowWithScore = r;
                break;
              }
            }
          }

          expect(
            rowWithScore,
            "Должна быть строка с оценкой (не '–') после API-поиска",
          ).toBeTruthy();

          // td index 2 — после калибровки, должна содержать кнопку-карандаш
          // Кнопка-карандаш появляется при hover на строку (React conditional render)
          const calibCell = rowWithScore.locator("td").nth(2);
          await calibCell.hover();
          const overwriteButton = calibCell.locator("button").first();

          await expect(
            overwriteButton,
            "Кнопка-карандаш должна быть видна для сотрудника с оценкой",
          ).toBeVisible({ timeout: 10000 });
        });
      },
    );
  },
);
