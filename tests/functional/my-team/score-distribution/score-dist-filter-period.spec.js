import { test, expect } from "../../../fixtures/auth.js";
import { ScoreDistributionTab } from "../../../../pages/ScoreDistributionTab.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";

test.describe(
  'Распределение оценок — фильтр "Период оценки"',
  { tag: ["@ui", "@my-team", "@regression"] },
  () => {
    let tab;

    test.beforeEach(async ({ adminAuth: page }) => {
      markAsUITest(MODULES.MY_TEAM);
      tab = new ScoreDistributionTab(page);
    });

    test(
      "C7130: Дефолтный период — 3 месяца до текущей даты",
      { tag: ["@critical"] },
      async () => {
        setSeverity("critical");

        await test.step("Открыть вкладку «Распределение оценок»", async () => {
          await tab.open();
        });

        await test.step("Проверить наличие данных и формат поля периода", async () => {
          // Таблица содержит данные при дефолтном периоде
          const rowCount = await tab.getRowCount();
          expect(rowCount).toBeGreaterThan(0);

          const periodValue = await tab.getPeriodValue();
          expect(periodValue).toBeTruthy();

          // Validate format: DD.MM.YYYY - DD.MM.YYYY
          const periodRegex =
            /^(\d{2})\.(\d{2})\.(\d{4})\s*-\s*(\d{2})\.(\d{2})\.(\d{4})$/;
          expect(periodValue).toMatch(periodRegex);
        });

        await test.step("Проверить, что период соответствует 3 месяцам до текущей даты", async () => {
          const periodValue = await tab.getPeriodValue();
          const periodRegex =
            /^(\d{2})\.(\d{2})\.(\d{4})\s*-\s*(\d{2})\.(\d{2})\.(\d{4})$/;

          // Parse dates
          const match = periodValue.match(periodRegex);
          const startDay = parseInt(match[1], 10);
          const startMonth = parseInt(match[2], 10) - 1; // JS months are 0-indexed
          const startYear = parseInt(match[3], 10);
          const endDay = parseInt(match[4], 10);
          const endMonth = parseInt(match[5], 10) - 1;
          const endYear = parseInt(match[6], 10);

          const startDate = new Date(startYear, startMonth, startDay);
          const endDate = new Date(endYear, endMonth, endDay);
          const today = new Date();
          today.setHours(0, 0, 0, 0);

          // End date should be close to today (within 2 days margin)
          const daysDiffEnd = Math.abs(
            (endDate - today) / (1000 * 60 * 60 * 24),
          );
          expect(daysDiffEnd).toBeLessThanOrEqual(2);

          // Start date should be approximately 3 months before end date
          // Calculate expected start date (3 months back from end date)
          const expectedStartDate = new Date(endDate);
          expectedStartDate.setMonth(expectedStartDate.getMonth() - 3);

          // Allow margin of ~7 days for month variations (28-31 days)
          const daysDiffStart = Math.abs(
            (startDate - expectedStartDate) / (1000 * 60 * 60 * 24),
          );
          expect(daysDiffStart).toBeLessThanOrEqual(7);
        });
      },
    );

    test(
      "C7131: Datepicker открывается по клику на поле периода",
      { tag: ["@critical"] },
      async () => {
        setSeverity("critical");

        await test.step("Открыть вкладку «Распределение оценок»", async () => {
          await tab.open();
        });

        await test.step("Кликнуть по полю периода и проверить открытие datepicker", async () => {
          // Кликаем по полю периода — datepicker должен открыться
          await tab.openPeriodPicker();

          // Проверяем, что air-datepicker виден (портал в body)
          await expect(tab.datepicker).toBeVisible();

          // Навигация: стрелки и заголовок месяца
          await expect(tab.datepickerNavTitle).toBeVisible();
          await expect(tab.datepickerPrevMonth).toBeVisible();
          await expect(tab.datepickerNextMonth).toBeVisible();
        });

        await test.step("Проверить наличие ячеек дней в календаре", async () => {
          // Ячейки дней присутствуют (минимум 28 — один месяц)
          const count = await tab.datepickerDayCells.count();
          expect(count).toBeGreaterThanOrEqual(28);
        });
      },
    );

    test(
      "C7132: Формат отображения дат: DD.MM.YYYY - DD.MM.YYYY",
      { tag: ["@critical"] },
      async () => {
        setSeverity("critical");

        await test.step("Открыть вкладку «Распределение оценок»", async () => {
          await tab.open();
        });

        await test.step("Проверить формат и корректность значений поля периода", async () => {
          const periodValue = await tab.getPeriodValue();

          // Assert exact format
          const formatRegex = /^\d{2}\.\d{2}\.\d{4}\s*-\s*\d{2}\.\d{2}\.\d{4}$/;
          expect(periodValue).toMatch(formatRegex);

          // Additional check: dates are parseable
          const match = periodValue.match(
            /^(\d{2})\.(\d{2})\.(\d{4})\s*-\s*(\d{2})\.(\d{2})\.(\d{4})$/,
          );
          expect(match).toBeTruthy();

          const startDay = parseInt(match[1], 10);
          const startMonth = parseInt(match[2], 10);
          const startYear = parseInt(match[3], 10);
          const endDay = parseInt(match[4], 10);
          const endMonth = parseInt(match[5], 10);
          const endYear = parseInt(match[6], 10);

          // Validate ranges
          expect(startDay).toBeGreaterThanOrEqual(1);
          expect(startDay).toBeLessThanOrEqual(31);
          expect(startMonth).toBeGreaterThanOrEqual(1);
          expect(startMonth).toBeLessThanOrEqual(12);
          expect(startYear).toBeGreaterThanOrEqual(2020);
          expect(endDay).toBeGreaterThanOrEqual(1);
          expect(endDay).toBeLessThanOrEqual(31);
          expect(endMonth).toBeGreaterThanOrEqual(1);
          expect(endMonth).toBeLessThanOrEqual(12);
          expect(endYear).toBeGreaterThanOrEqual(2020);
        });
      },
    );

    test(
      "C7133: Изменение периода на будущий — данные обновляются",
      { tag: ["@critical", "@known-bug"] },
      async () => {
        setSeverity("critical");
        // @known-bug: фронт отправляет API-запросы при смене периода, но
        // данные в таблице не меняются — фильтр по датам не работает.

        await test.step("Открыть вкладку «Распределение оценок» и запомнить дефолтный период", async () => {
          await tab.open();
        });

        let defaultPeriod;

        await test.step("Запомнить данные при дефолтном периоде и проверить отсутствие кнопки сброса", async () => {
          // Запоминаем данные при дефолтном периоде
          defaultPeriod = await tab.getPeriodValue();
          const initialNames = await tab.getEmployeeNames();
          const initialCount = initialNames.length;
          expect(initialCount).toBeGreaterThan(0);

          // Кнопка сброса НЕ видна при дефолте
          await expect(tab.resetButton).not.toBeVisible();
        });

        await test.step("Установить будущий период (июнь-декабрь 2027)", async () => {
          // Выбираем БУДУЩИЙ период (июнь-декабрь 2027) — заведомо нет оценок
          await tab.setPeriod(
            { year: 2027, month: 5, day: 1 },
            { year: 2027, month: 11, day: 31 },
          );

          // Период должен измениться
          const newPeriod = await tab.getPeriodValue();
          expect(newPeriod).not.toBe(defaultPeriod);

          // Кнопка сброса ДОЛЖНА появиться
          await expect(tab.resetButton).toBeVisible({ timeout: 5000 });
        });

        await test.step("Проверить, что при будущем периоде у всех сотрудников «Не проходил оценку»", async () => {
          // Ключевая проверка: при будущем периоде все сотрудники
          // должны показывать «Не проходил оценку» (нет оценок в будущем).
          // Или количество строк должно отличаться от дефолтного.
          await tab.page.waitForLoadState("networkidle");
          await tab.getEmployeeNames();

          // Получаем названия оценок — при будущем периоде все должны быть «Не проходил оценку»
          const assessmentTexts = await tab.getAssessmentTexts();
          const allNoAssessment = assessmentTexts.every(
            (t) => t.trim() === "Не проходил оценку",
          );

          // Если фильтр работает, то при будущем периоде у всех «Не проходил оценку»
          expect(
            allNoAssessment,
            `При будущем периоде ожидаем «Не проходил оценку» у всех, но нашли: ${assessmentTexts.filter((t) => t.trim() !== "Не проходил оценку").join(", ")}`,
          ).toBe(true);
        });
      },
    );

    test(
      "C7134: Сброс фильтров возвращает период к дефолту",
      { tag: ["@critical"] },
      async () => {
        setSeverity("critical");

        await test.step("Открыть вкладку «Распределение оценок» и запомнить дефолтный период", async () => {
          await tab.open();
        });

        let defaultPeriod;

        await test.step("Запомнить дефолтный период и изменить фильтр для появления кнопки сброса", async () => {
          // Get default period + данные
          defaultPeriod = await tab.getPeriodValue();
          const initialCount = await tab.getRowCount();
          expect(initialCount).toBeGreaterThan(0);

          // Change employees filter to make reset button appear
          await tab.selectEmployeesOption("Прямые подчиненные");

          // Wait for filter to apply
          await tab.page.waitForLoadState("networkidle");

          // Reset button should be visible
          await expect(tab.resetButton).toBeVisible();
        });

        await test.step("Сбросить фильтр и проверить возврат периода к дефолтному значению", async () => {
          // Click reset (clickReset now waits for networkidle internally)
          await tab.clickReset();

          // Period should return to default (or very close - within 1 day due to timing)
          const periodAfterReset = await tab.getPeriodValue();

          // Parse both periods
          const periodRegex =
            /^(\d{2})\.(\d{2})\.(\d{4})\s*-\s*(\d{2})\.(\d{2})\.(\d{4})$/;
          const matchBefore = defaultPeriod.match(periodRegex);
          const matchAfter = periodAfterReset.match(periodRegex);

          expect(matchAfter).toBeTruthy();

          // Start dates should be the same (or within 1 day)
          const startBefore = new Date(
            parseInt(matchBefore[3], 10),
            parseInt(matchBefore[2], 10) - 1,
            parseInt(matchBefore[1], 10),
          );
          const startAfter = new Date(
            parseInt(matchAfter[3], 10),
            parseInt(matchAfter[2], 10) - 1,
            parseInt(matchAfter[1], 10),
          );

          const daysDiffStart = Math.abs(
            (startAfter - startBefore) / (1000 * 60 * 60 * 24),
          );
          expect(daysDiffStart).toBeLessThanOrEqual(1);

          // End dates should be the same (or within 1 day)
          const endBefore = new Date(
            parseInt(matchBefore[6], 10),
            parseInt(matchBefore[5], 10) - 1,
            parseInt(matchBefore[4], 10),
          );
          const endAfter = new Date(
            parseInt(matchAfter[6], 10),
            parseInt(matchAfter[5], 10) - 1,
            parseInt(matchAfter[4], 10),
          );

          const daysDiffEnd = Math.abs(
            (endAfter - endBefore) / (1000 * 60 * 60 * 24),
          );
          expect(daysDiffEnd).toBeLessThanOrEqual(1);
        });
      },
    );
  },
);
