// tests/functional/objectives/objective-datepicker-day-range.spec.js
// DEVAPR-11585: Диапазон дней двумя кликами

import { expect } from "@playwright/test";
import { test } from "../../fixtures/auth.js";
import { ObjectiveCreatePage } from "../../../pages/ObjectiveCreatePage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

test.describe(
  "Датапикер периода — Диапазон дней",
  { tag: ["@ui", "@objectives", "@regression"] },
  () => {
    test.beforeEach(async ({ adminAuth, page }) => {
      markAsUITest(MODULES.OBJECTIVES);
      await page.goto("/ru/objectives/new/add/");
    });

    test("C8098: Диапазон дней двумя кликами (10 фев → 20 фев)",
      async ({ page }, testInfo) => {
        setSeverity("normal");
        const dp = new ObjectiveCreatePage(page, testInfo).datepicker;

        await test.step("Выбрать диапазон 10.02.2026 - 20.02.2026", async () => {
          await dp.selectDayRange(
            { year: 2026, month: 1, date: 10 },
            { year: 2026, month: 1, date: 20 },
          );
        });

        await test.step("Проверить значение поля", async () => {
          await dp.assertValue("10.02.2026 - 20.02.2026");
        });

        await test.step("Датапикер закрылся после выбора", async () => {
          expect(await dp.isOpen()).toBe(false);
        });
      },
    );
  },
);
