import { test, expect } from "../../../fixtures/auth.js";
import { ScoreDistributionTab } from "../../../../pages/ScoreDistributionTab.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";

test.describe(
  "Распределение оценок — Заголовок колонки итоговой оценки",
  { tag: ["@ui", "@my-team", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.MY_TEAM);
    });

    test(
      "C7250: При наличии оценки с калибровкой — две колонки «до» и «после калибровки»",
      { tag: ["@critical"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("critical");
        const tab = new ScoreDistributionTab(page, testInfo);

        await test.step("Открыть вкладку «Распределение оценок»", async () => {
          await tab.open();
        });

        await test.step("Проверить наличие колонок «до калибровки» и «после калибровки»", async () => {
          const headers = await tab.getTableHeaders();

          // Проверяем наличие обеих колонок
          const hasBeforeCalib = headers.some((h) =>
            h.includes("до калибровки"),
          );
          const hasAfterCalib = headers.some((h) =>
            h.includes("после калибровки"),
          );

          expect(hasBeforeCalib).toBe(true);
          expect(hasAfterCalib).toBe(true);

          // Заголовки — полные формулировки
          expect(headers).toContain("Итоговая оценка до калибровки");
          expect(headers).toContain("Итоговая оценка после калибровки");
        });
      },
    );

    test(
      "C7186: Без оценки с калибровкой — одна колонка «Итоговая оценка»",
      { tag: ["@critical"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("critical");
        const tab = new ScoreDistributionTab(page, testInfo);

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

        await test.step("Проверить наличие единственной колонки «Итоговая оценка» без уточнений", async () => {
          const headers = await tab.getTableHeaders();

          // По требованию: если ни в одной оценке из выборки калибровка не разрешена,
          // не выводим «Итоговая оценка после калибровки»,
          // а «до калибровки» переименовываем в «Итоговая оценка»
          expect(headers.some((h) => h.includes("до калибровки"))).toBe(false);
          expect(headers.some((h) => h.includes("после калибровки"))).toBe(
            false,
          );
          expect(headers).toContain("Итоговая оценка");

          // Колонки: Сотрудник + Итоговая оценка + Название оценки
          const visibleHeaders = headers.filter(Boolean);
          expect(visibleHeaders).toHaveLength(3);
        });
      },
    );
  },
);
