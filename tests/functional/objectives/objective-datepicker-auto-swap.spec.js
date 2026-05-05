// tests/functional/objectives/objective-datepicker-auto-swap.spec.js
// DEVAPR-11585: Автосвап — второй клик раньше первого → результат правильный

import { expect } from "@playwright/test";
import { test } from "../../fixtures/auth.js";
import { ObjectiveCreatePage } from "../../../pages/ObjectiveCreatePage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

test.describe(
  "Датапикер периода — Автосвап дат",
  { tag: ["@ui", "@objectives", "@regression"] },
  () => {
    test.beforeEach(async ({ adminAuth, page }) => {
      markAsUITest(MODULES.OBJECTIVES);
      await page.goto("/ru/objectives/new/add/");
    });

    test("C8095: Автосвап: второй клик раньше первого → результат правильный",
      async ({ page }, testInfo) => {
        setSeverity("normal");
        const dp = new ObjectiveCreatePage(page, testInfo).datepicker;

        await test.step("Кликнуть сначала 20 фев, затем 10 фев (обратный порядок)", async () => {
          // selectDayRange внутри вызывает click 20 фев → click 10 фев
          // Датапикер должен автоматически свапнуть даты
          await dp.selectDayRange(
            { year: 2026, month: 1, date: 20 },
            { year: 2026, month: 1, date: 10 },
          );
        });

        await test.step("Результат должен быть 10.02.2026 - 20.02.2026 (даты поменялись местами)", async () => {
          await dp.assertValue("10.02.2026 - 20.02.2026");
        });

        await test.step("Датапикер закрылся после выбора", async () => {
          expect(await dp.isOpen()).toBe(false);
        });
      },
    );
  },
);
