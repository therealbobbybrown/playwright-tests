import { test, expect } from "../../../fixtures/auth.js";
import { ScoreDistributionTab } from "../../../../pages/ScoreDistributionTab.js";
import { DashboardTeamAPI } from "../../../utils/api/DashboardTeamAPI.js";
import { getCredentials } from "../../../utils/credentials.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";

const toMoscowMs = (dateStr) => new Date(dateStr + "T00:00:00+03:00").getTime();

/**
 * Будущий период — гарантированно без оценок.
 * 2 месяца вперёд от текущей даты.
 */
function getFuturePeriod() {
  const now = new Date();
  const futureDate = new Date(now.getFullYear(), now.getMonth() + 2, 1);
  const year = futureDate.getFullYear();
  const month = futureDate.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();
  const nextMonthFirst = new Date(year, month + 1, 1);

  const pad = (n) => String(n).padStart(2, "0");
  const fmt = (d) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  return {
    apiStart: fmt(futureDate),
    apiEnd: fmt(nextMonthFirst),
    pickerStart: { year, month, day: 1 },
    pickerEnd: { year, month, day: lastDay },
    label: `01.${pad(month + 1)}.${year} – ${pad(lastDay)}.${pad(month + 1)}.${year}`,
  };
}

test.describe(
  "Распределение оценок — Период без оценок",
  { tag: ["@my-team", "@regression"] },
  () => {
    const period = getFuturePeriod();

    test.beforeEach(() => {
      markAsUITest(MODULES.MY_TEAM);
    });

    test(
      "C7215: Будущий период → API не возвращает PR ни для одного сотрудника",
      { tag: ["@api", "@critical"] },
      async ({ request }) => {
        setSeverity("critical");

        const api = new DashboardTeamAPI(request);
        const { email, password } = getCredentials("admin");
        await api.signIn(email, password);

        let userIds;

        await test.step("Получить список сотрудников через API", async () => {
          const { data: usersData } = await api.getDistributionUsers({
            usersSubset: "all",
            limit: 100,
            offset: 0,
          });
          userIds = (usersData?.items || []).map((u) => u.id);
          expect(userIds.length).toBeGreaterThan(0);

          console.log(
            `  Проверяем ${userIds.length} юзеров для будущего периода ${period.label}`,
          );
        });

        await test.step("Проверить, что API не возвращает PR или оценки для будущего периода", async () => {
          const { data: results } = await api.getDistributionLastResults(
            userIds,
            {
              period: {
                start: toMoscowMs(period.apiStart),
                end: toMoscowMs(period.apiEnd),
              },
            },
          );

          const entries = Array.isArray(results)
            ? results
            : Object.values(results || {});

          // API может вернуть пустой результат для будущего периода — это корректно
          if (entries.length === 0) {
            console.log(
              "  API вернул пустой результат для будущего периода — корректно",
            );
            return;
          }

          // Если есть записи — все должны быть без PR и без mean
          let usersWithPR = 0;
          let usersWithMean = 0;

          for (const result of entries) {
            if (result.performanceReview != null) {
              usersWithPR++;
              console.error(
                `  User ${result.targetUserId || result.userId} имеет performanceReview:`,
                result.performanceReview?.title,
              );
            }

            if (result.revisionMean != null) {
              usersWithMean++;
            }
          }

          console.log(
            `  Проверено ${entries.length} записей: ${usersWithPR} с PR, ${usersWithMean} с mean`,
          );

          expect(
            usersWithPR,
            "НИ ОДИН юзер не должен иметь PR в будущем периоде",
          ).toBe(0);

          expect(
            usersWithMean,
            "НИ ОДИН юзер не должен иметь revisionMean в будущем периоде",
          ).toBe(0);
        });
      },
    );

    test(
      "C7216: UI показывает «–» и «Не проходил оценку» при будущем периоде",
      { tag: ["@critical"] },
      async ({ adminAuth: page }) => {
        setSeverity("critical");

        const tab = new ScoreDistributionTab(page);
        let initialRowCount;

        await test.step("Открыть вкладку, запомнить начальное количество строк и установить будущий период", async () => {
          await tab.open();

          // ── 1. Запомнить начальное состояние ──
          await tab.tableRows
            .first()
            .waitFor({ state: "visible", timeout: 10000 });
          initialRowCount = await tab.getRowCount();
          expect(initialRowCount).toBeGreaterThan(0);
          console.log(`  Начальное состояние: ${initialRowCount} строк`);

          // ── 2. Установить будущий период (гарантированно пустой) ──
          console.log(`  Устанавливаем будущий период: ${period.label}`);
          await tab.setPeriod(period.pickerStart, period.pickerEnd);

          // ── 3. Дождаться обновления таблицы ──
          await tab.tableRows
            .first()
            .waitFor({ state: "visible", timeout: 10000 });

          const filteredRowCount = await tab.getRowCount();
          expect(filteredRowCount).toBeGreaterThan(0);

          // Количество сотрудников НЕ должно меняться (период влияет на оценки, не на список)
          expect(filteredRowCount).toBe(initialRowCount);
          console.log(
            `  После фильтра: ${filteredRowCount} строк (не изменилось)`,
          );
        });

        await test.step("Проверить, что все строки показывают «–» и «Не проходил оценку»", async () => {
          // ── 4. Определить индексы колонок по заголовкам ──
          const headerCells = await tab.tableHeaders.all();
          let scoreColIdx = -1;
          let nameColIdx = -1;
          for (let i = 0; i < headerCells.length; i++) {
            const text = (await headerCells[i].innerText()).trim();
            if (text === "Итоговая оценка") scoreColIdx = i;
            if (text === "Название оценки") nameColIdx = i;
          }
          // Fallback: если заголовки не найдены — по умолчанию
          if (scoreColIdx === -1) scoreColIdx = 1;
          if (nameColIdx === -1) nameColIdx = 2;

          console.log(
            `  Колонки: «Итоговая оценка» idx=${scoreColIdx}, «Название оценки» idx=${nameColIdx}`,
          );

          // ── 5. Проверить: все оценки «–» и «Не проходил оценку» ──
          const rows = tab.tableRows;
          const totalRows = await rows.count();
          const checked = Math.min(totalRows, 20);

          let dashCount = 0;
          let notPassedCount = 0;

          for (let i = 0; i < checked; i++) {
            const row = rows.nth(i);
            const cells = row.locator("td");

            const scoreText = (
              await cells.nth(scoreColIdx).textContent()
            ).trim();
            if (scoreText === "–" || scoreText === "-") {
              dashCount++;
            } else {
              console.warn(
                `  Строка ${i + 1}: ожидался «–», получили «${scoreText}»`,
              );
            }

            const nameText = (await cells.nth(nameColIdx).textContent()).trim();
            if (nameText === "Не проходил оценку") {
              notPassedCount++;
            } else {
              console.warn(
                `  Строка ${i + 1}: ожидалось «Не проходил оценку», получили «${nameText}»`,
              );
            }
          }

          console.log(
            `  Проверено ${checked} строк: ${dashCount} с «–», ${notPassedCount} с «Не проходил оценку»`,
          );

          expect(
            dashCount,
            `ВСЕ ${checked} строк должны показывать «–» при пустом периоде`,
          ).toBe(checked);

          expect(
            notPassedCount,
            `ВСЕ ${checked} строк должны показывать «Не проходил оценку»`,
          ).toBe(checked);
        });

        await test.step("Проверить отсутствие кнопки «Результаты» при пустом периоде", async () => {
          // ── 6. Кнопка «Результаты» не должна быть видна ──
          const resultsCount = await tab.getResultsButtonCount();
          expect(
            resultsCount,
            "Кнопка «Результаты» не должна быть видна при пустом периоде",
          ).toBe(0);

          console.log(
            `  Все строки: «–» + «Не проходил оценку», 0 кнопок «Результаты»`,
          );
        });
      },
    );
  },
);
