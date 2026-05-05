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
  "Распределение оценок — Калибровка выключена (вид руководителя)",
  { tag: ["@ui", "@my-team", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.MY_TEAM);
    });

    test(
      "C7188: При отсутствии оценок с калибровкой — одна колонка «Итоговая оценка» (руководитель)",
      { tag: ["@critical"] },
      async ({ managerAuth: page }) => {
        setSeverity("critical");

        const tab = new ScoreDistributionTab(page);

        await test.step("Открыть вкладку и установить период без калиброванных PR", async () => {
          await tab.open();

          // Устанавливаем период, где НЕТ ни одной оценки с калибровкой.
          // Все калиброванные PR созданы 13.02.2026+, ставим период до этого.
          await tab.setPeriod(
            { year: 2025, month: 10, day: 1 }, // 1 ноября 2025
            { year: 2026, month: 1, day: 12 }, // 12 февраля 2026
          );

          // Ждём перезагрузки данных
          await expect(async () => {
            const count = await tab.tableHeaders.count();
            expect(count).toBeGreaterThan(0);
          }).toPass({ timeout: 15000 });
        });

        await test.step("Проверить наличие единственной колонки «Итоговая оценка» и отсутствие кнопок калибровки", async () => {
          const headers = await tab.getTableHeaders();

          // Колонки «до калибровки» и «после калибровки» отсутствуют
          expect(headers.some((h) => h.includes("до калибровки"))).toBe(false);
          expect(headers.some((h) => h.includes("после калибровки"))).toBe(
            false,
          );

          // Одна колонка «Итоговая оценка» (без уточнения)
          expect(headers).toContain("Итоговая оценка");

          // Колонки: Сотрудник + Итоговая оценка + Название оценки
          const visibleHeaders = headers.filter(Boolean);
          expect(visibleHeaders).toHaveLength(3);

          // Ни одна строка не содержит кнопку-карандаш (нет калибровки)
          const rows = tab.tableRows;
          const rowCount = await rows.count();

          let pencilCount = 0;
          for (let i = 0; i < Math.min(rowCount, 20); i++) {
            // В режиме без калибровки оценка в колонке 1 (вместо 2)
            const scoreCell = rows.nth(i).locator("td").nth(1);
            const buttons = await scoreCell.locator("button").count();
            pencilCount += buttons;
          }
          expect(pencilCount, "Кнопок калибровки не должно быть").toBe(0);
        });
      },
    );

    test(
      "C7189: API-сверка — в периоде без калибровки revisionMean.isOverwritten = false",
      { tag: ["@critical"] },
      async ({ managerAuth: page, request }) => {
        setSeverity("critical");

        const tab = new ScoreDistributionTab(page);

        await test.step("Открыть вкладку и установить период без калиброванных PR", async () => {
          await tab.open();

          // Период до появления калиброванных PR
          await tab.setPeriod(
            { year: 2025, month: 10, day: 1 },
            { year: 2026, month: 1, day: 12 },
          );

          await page.waitForLoadState("networkidle");
        });

        await test.step("Проверить через API, что ни один сотрудник не имеет isOverwritten = true в данном периоде", async () => {
          // API-сверка через DashboardTeamAPI
          const api = new DashboardTeamAPI(request);
          const { email, password } = getCredentials("manager");
          await api.signIn(email, password);

          // API использует period: { start, end } в Unix ms (полночь Москвы)
          const toMoscowMs = (dateStr) =>
            new Date(dateStr + "T00:00:00+03:00").getTime();

          const period = {
            start: toMoscowMs("2025-11-01"),
            end: toMoscowMs("2026-02-12"),
          };

          const { data: usersData } = await api.getDistributionUsers({
            usersSubset: "subordinates",
            limit: 20,
            offset: 0,
          });

          if (!usersData.items?.length) {
            console.log("  Нет подчинённых в периоде — пропускаем API-сверку");
            return;
          }

          const userIds = usersData.items.map((u) => u.id);
          const { data: resultsData } = await api.getDistributionLastResults(
            userIds,
            { period },
          );

          // Проверяем результаты — ни один не должен быть откалиброван
          const entries = Object.values(resultsData || {});
          for (const result of entries) {
            if (!result.revisionMean) continue;

            const rawMean = result.revisionMean;
            if (typeof rawMean === "object" && rawMean !== null) {
              // Если есть isOverwritten, он должен быть false
              if (rawMean.isOverwritten !== undefined) {
                expect(
                  rawMean.isOverwritten,
                  `isOverwritten для user ${result.targetUserId} должен быть false`,
                ).toBe(false);
              }
            }
          }

          console.log(
            `  API: проверено ${entries.length} записей, ни одна не откалибрована`,
          );
        });
      },
    );
  },
);
