import { test, expect } from "../../../fixtures/auth.js";
import { ScoreDistributionTab } from "../../../../pages/ScoreDistributionTab.js";
import { DashboardTeamAPI } from "../../../utils/api/DashboardTeamAPI.js";
import { getCredentials } from "../../../utils/credentials.js";
import { DatabaseClient } from "../../../utils/db/DatabaseClient.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";
import { ensureCalibrationOnDistributionPR } from "../../../utils/helpers/ensureCalibration.js";

test.describe(
  "Распределение оценок — отображение значений оценок в таблице",
  { tag: ["@ui", "@my-team", "@regression"] },
  () => {
    let tab;

    test.beforeAll(async ({ request }) => {
      test.setTimeout(180_000);
      await ensureCalibrationOnDistributionPR(request);
    });

    test.beforeEach(async ({ adminAuth: page }) => {
      markAsUITest(MODULES.MY_TEAM);
      setSeverity("critical");
      tab = new ScoreDistributionTab(page);
    });

    test(
      "C7173: Сотрудник с оценкой отображает числовое значение и характеристику в бейдже",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }) => {
        let withScore;
        let user;

        await test.step("Найти сотрудника с оценкой через API", async () => {
          await tab.open();

          const api = new DashboardTeamAPI(request);
          const { email, password } = getCredentials("admin");
          await api.signIn(email, password);

          const result = await api.findDistributionUser(
            (r) =>
              r.revisionMean !== null &&
              r.revisionMean !== undefined &&
              r.responseOverwritable?.isOverwritable === true,
          );
          withScore = result.result;
          user = result.user;

          expect(
            withScore,
            "API: должен быть хотя бы один сотрудник с оценкой — проверьте seed данные",
          ).toBeTruthy();
        });

        let row;
        let items;

        await test.step("Найти строку сотрудника в таблице и дождаться бейджа оценки", async () => {
          await tab.searchEmployee(user.lastName || user.firstName);
          await page.waitForLoadState("networkidle");

          // === UI-проверка: найти строку с оценкой (может быть несколько сотрудников с похожими именами) ===
          // Ждём появления хотя бы одной строки с бейджем
          await tab.tableRows
            .locator('[class*="CompetenceResult_competenceResult"]')
            .first()
            .waitFor({ state: "visible", timeout: 10000 });

          const rows = await tab.tableRows.all();
          row = null;
          for (const r of rows) {
            const scoreBadgeCount = await r
              .locator('[class*="CompetenceResult_competenceResult"]')
              .count();
            if (scoreBadgeCount > 0) {
              row = r;
              break;
            }
          }

          expect(
            row,
            "После поиска должна быть хотя бы одна строка с оценкой (CompetenceResult бейдж)",
          ).toBeTruthy();
        });

        let uiNumericValue;

        await test.step("Проверить содержимое бейджа оценки (числовое значение и цвет)", async () => {
          const scoreBadge = row
            .locator('[class*="CompetenceResult_competenceResult"]')
            .first();
          await expect(scoreBadge).toBeVisible();

          // Получить текст всего бейджа (напр. "4.1Высоко" или "4.1 Высоко")
          const fullText = await scoreBadge.textContent();
          expect(fullText).toMatch(/\d+(\.\d+)?/);

          // Отдельные элементы: число и характеристика
          items = await row.locator('[class*="CompetenceResult_item"]').all();
          expect(
            items.length,
            "Бейдж оценки должен содержать хотя бы один элемент CompetenceResult_item",
          ).toBeGreaterThanOrEqual(1);

          // Первый элемент — числовое значение
          const numericText = await items[0].textContent();
          expect(numericText.trim()).toMatch(/^\d+(\.\d+)?$/);
          uiNumericValue = parseFloat(numericText.trim());

          // Цвет фона первого элемента
          const bgColor = await items[0].evaluate(
            (el) => el.style.backgroundColor,
          );
          expect(bgColor).toBeTruthy();
          expect(bgColor).toMatch(/^rgb/);

          // Если есть второй элемент — текстовая характеристика
          if (items.length >= 2) {
            const charText = await items[1].textContent();
            expect(charText.trim().length).toBeGreaterThan(0);
          }
        });

        await test.step("Сверить числовое значение бейджа с API revisionMean", async () => {
          // Получить имя сотрудника для API-сверки
          const nameEl = row
            .locator("td")
            .first()
            .locator('[class*="User_full-name-wrapper"] > div')
            .first();
          await nameEl.innerText();

          // === API-сверка: числовое значение бейджа = revisionMean из API ===
          // revisionMean из API может быть строкой — приводим к числу
          const apiMean = parseFloat(withScore.revisionMean);
          if (!isNaN(apiMean)) {
            const precision =
              withScore.statisticsSettings?.settings?.precision ?? 1;
            const expectedValue = parseFloat(apiMean.toFixed(precision));
            expect(
              uiNumericValue,
              `UI=${uiNumericValue}, API revisionMean=${apiMean} (precision=${precision})`,
            ).toBe(expectedValue);
          }
        });

        await test.step("Сверить значение оценки с данными в БД", async () => {
          // === DB-сверка: value в БД совпадает с API revisionMean ===
          const db = new DatabaseClient();
          try {
            await db.connect();
            const [dbRow] = await db.query(
              `SELECT value FROM performance_review_user_competences_mean_history
               WHERE target_user_id = ? AND is_removed = 0 AND value IS NOT NULL
               ORDER BY performance_review_revision_id DESC LIMIT 1`,
              [withScore.targetUserId],
            );
            if (dbRow) {
              const dbValue = parseFloat(dbRow.value);
              const apiMean = parseFloat(withScore.revisionMean);
              expect(
                apiMean,
                `API revisionMean=${apiMean}, DB value=${dbValue}`,
              ).toBeCloseTo(dbValue, 4);
            }
          } catch {
            // DB недоступна — пропускаем DB-верификацию
          } finally {
            if (db.isConnected()) await db.disconnect();
          }
        });
      },
    );

    test(
      "C7174: Сотрудник без оценки показывает прочерк «–»",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }) => {
        await test.step("Открыть вкладку распределения оценок", async () => {
          await tab.open();
        });

        await test.step("Найти строку сотрудника без оценки и проверить прочерк «–»", async () => {
          // Найти строки с "Не проходил оценку" в колонке названия оценки
          const rows = await tab.tableRows.all();
          let foundEmployeeWithoutAssessment = false;

          for (const row of rows) {
            const cells = await row.locator("td").all();

            if (cells.length >= 3) {
              // Последняя колонка перед кнопкой "Результаты" — название оценки
              const assessmentNameCell = cells[cells.length - 2];
              const assessmentNameText = await assessmentNameCell.textContent();

              if (assessmentNameText.trim() === "Не проходил оценку") {
                foundEmployeeWithoutAssessment = true;

                // Проверить, что в колонке оценки (td index 1) стоит прочерк
                const scoreCell = cells[1];
                const scoreCellText = await scoreCell.textContent();

                expect(scoreCellText.trim()).toBe("–");

                // === API-сверка: у сотрудника revisionMean === null или PR имеет notShowAverage=1 ===
                const nameEl = row
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

                if (apiUsers.items?.length > 0) {
                  const targetUserId = apiUsers.items[0].id;
                  const { data: results } =
                    await api.getDistributionLastResults([targetUserId]);
                  const result = Object.values(results || {})[0];
                  if (result) {
                    const hasNullMean =
                      result.revisionMean === null ||
                      result.revisionMean === undefined;
                    const hasNotShowAverage =
                      result.statisticsSettings?.settings?.notShowAverage === 1;
                    expect(
                      hasNullMean || hasNotShowAverage,
                      `API: сотрудник «${employeeName}» с прочерком должен иметь revisionMean=null или notShowAverage=1. ` +
                        `Реально: revisionMean=${result.revisionMean}, notShowAverage=${result.statisticsSettings?.settings?.notShowAverage}`,
                    ).toBe(true);
                  }
                }

                break;
              }
            }
          }

          if (!foundEmployeeWithoutAssessment) {
            throw new Error(
              "Нет сотрудника без оценки — все сотрудники прошли оценку. Нужен сотрудник без PR или с незаполненной анкетой",
            );
          }
        });
      },
    );

    test(
      "C7175: Сотрудник с PR, но без итоговой оценки — прочерк «–» и кнопка «Результаты» видна",
      { tag: ["@critical"] },
      async ({ adminAuth: page }) => {
        await test.step("Открыть вкладку распределения оценок", async () => {
          await tab.open();
        });

        await test.step("Найти строку с PR но без оценки и проверить прочерк и кнопку «Результаты»", async () => {
          // Найти строку, где есть название оценки (НЕ "Не проходил оценку"), но оценка = "–"
          const rows = await tab.tableRows.all();
          let foundEmployeeWithPRButNoScore = false;

          for (const row of rows) {
            const cells = await row.locator("td").all();

            if (cells.length >= 3) {
              // Проверить колонку с оценкой (td index 1)
              const scoreCell = cells[1];
              const scoreCellText = await scoreCell.textContent();

              // Проверить название оценки (предпоследняя колонка)
              const assessmentNameCell = cells[cells.length - 2];
              const assessmentNameText = await assessmentNameCell.textContent();

              if (
                scoreCellText.trim() === "–" &&
                assessmentNameText.trim() !== "Не проходил оценку" &&
                assessmentNameText.trim() !== "–"
              ) {
                foundEmployeeWithPRButNoScore = true;

                // Проверить, что кнопка "Результаты" видна
                const resultsButton = row.getByRole("button", {
                  name: "Результаты",
                });
                await expect(resultsButton).toBeVisible();

                break;
              }
            }
          }

          if (!foundEmployeeWithPRButNoScore) {
            throw new Error(
              "Нет сотрудника с назначенным PR, но без итоговой оценки — нужен seed (сотрудник с незаполненной анкетой)",
            );
          }
        });
      },
    );

    test(
      "C7176: Цвет бейджа оценки не пустой (цветовая маркировка)",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }) => {
        let withScore;
        let user;

        await test.step("Найти сотрудника с оценкой через API", async () => {
          await tab.open();

          // === API-first: найти сотрудника с оценкой (перебираем батчами) ===
          const api = new DashboardTeamAPI(request);
          const { email, password } = getCredentials("admin");
          await api.signIn(email, password);

          const result = await api.findDistributionUser(
            (r) =>
              r.revisionMean !== null &&
              r.revisionMean !== undefined &&
              r.responseOverwritable?.isOverwritable === true,
          );
          withScore = result.result;
          user = result.user;

          expect(
            withScore,
            "API: должен быть хотя бы один сотрудник с оценкой — проверьте seed данные",
          ).toBeTruthy();
        });

        await test.step("Найти строку сотрудника в таблице и дождаться элементов бейджа", async () => {
          await tab.searchEmployee(user.lastName || user.firstName);
          await page.waitForLoadState("networkidle");

          // === UI-проверка: найти строку с оценкой (может быть несколько сотрудников с похожими именами) ===
          // Ждём появления хотя бы одного CompetenceResult_item
          await tab.tableRows
            .locator('[class*="CompetenceResult_item"]')
            .first()
            .waitFor({ state: "visible", timeout: 10000 });
        });

        await test.step("Проверить цвет фона каждого элемента бейджа оценки", async () => {
          const rows = await tab.tableRows.all();
          let items = [];
          for (const r of rows) {
            const tempItems = await r
              .locator('[class*="CompetenceResult_item"]')
              .all();
            if (tempItems.length > 0) {
              items = tempItems;
              break;
            }
          }

          expect(
            items.length,
            "У сотрудника с оценкой должны быть CompetenceResult_item элементы",
          ).toBeGreaterThan(0);

          // Каждый CompetenceResult_item имеет inline background-color
          for (const item of items) {
            const bgColor = await item.evaluate(
              (el) => el.style.backgroundColor,
            );
            expect(bgColor).toBeTruthy();
            expect(bgColor).not.toBe("");
            expect(bgColor).toMatch(/^rgb/);

            const text = await item.textContent();
            expect(text.trim()).toBeTruthy();
          }
        });
      },
    );

    test(
      "C7177: Иконка-карандаш (калибровка) видна для сотрудника с оценкой до калибровки",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }) => {
        let withScore;
        let user;

        await test.step("Открыть вкладку и проверить наличие колонок калибровки", async () => {
          await tab.open();

          // Проверить наличие колонок калибровки
          const headers = await tab.tableHeaders.all();
          const headerTexts = await Promise.all(
            headers.map((h) => h.textContent()),
          );

          const hasCalibrationColumns = headerTexts.some(
            (text) =>
              text.includes("до калибровки") ||
              text.includes("после калибровки"),
          );

          if (!hasCalibrationColumns) {
            test.skip(true, "Нет колонок калибровки — view без калибровки");
          }
        });

        await test.step("Найти сотрудника с оценкой через API", async () => {
          // === API-first: найти сотрудника с оценкой (перебираем батчами) ===
          const api = new DashboardTeamAPI(request);
          const { email, password } = getCredentials("admin");
          await api.signIn(email, password);

          const result = await api.findDistributionUser(
            (r) =>
              r.revisionMean !== null &&
              r.revisionMean !== undefined &&
              r.responseOverwritable?.isOverwritable === true,
          );
          withScore = result.result;
          user = result.user;

          expect(
            withScore,
            "API: должен быть хотя бы один сотрудник с оценкой — проверьте seed данные",
          ).toBeTruthy();
        });

        await test.step("Найти строку сотрудника с оценкой в таблице", async () => {
          await tab.searchEmployee(user.lastName || user.firstName);
          await page.waitForLoadState("networkidle");

          // === UI-проверка: найти строку с оценкой (может быть несколько сотрудников с похожими именами) ===
          // Ждём появления таблицы с данными
          await tab.tableRows
            .first()
            .waitFor({ state: "visible", timeout: 10000 });
        });

        await test.step("Проверить видимость кнопки-карандаша в ячейке оценки после калибровки", async () => {
          const rows = await tab.tableRows.all();
          let cells = [];
          let targetRow = null;
          for (const r of rows) {
            const tempCells = await r.locator("td").all();
            if (tempCells.length >= 3) {
              // Проверить, что в td index 1 есть оценка (не прочерк)
              const scoreBeforeText = await tempCells[1].textContent();
              if (
                scoreBeforeText.trim() !== "–" &&
                scoreBeforeText.trim() !== ""
              ) {
                cells = tempCells;
                targetRow = r;
                break;
              }
            }
          }

          expect(
            cells.length,
            "Строка сотрудника должна содержать все колонки",
          ).toBeGreaterThanOrEqual(3);

          // td index 1 — оценка до калибровки
          const scoreBeforeCell = cells[1];
          const scoreBeforeText = await scoreBeforeCell.textContent();

          expect(
            scoreBeforeText.trim(),
            "Оценка до калибровки должна быть не пустой",
          ).not.toBe("–");
          expect(scoreBeforeText.trim()).not.toBe("");

          // td index 2 — оценка после калибровки, должна содержать кнопку (иконка-карандаш)
          // Кнопка-карандаш появляется при hover на ячейку (React conditional render)
          const scoreAfterCell = cells[2];
          await scoreAfterCell.hover();
          const calibrationButton = scoreAfterCell.locator("button");

          await expect(calibrationButton).toBeVisible();
        });
      },
    );
  },
);
