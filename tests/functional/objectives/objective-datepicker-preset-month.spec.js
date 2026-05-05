// tests/functional/objectives/objective-datepicker-preset-month.spec.js
// DEVAPR-11585: Выбор месяца одним кликом

import { expect } from "@playwright/test";
import { test } from "../../fixtures/auth.js";
import { ObjectiveCreatePage } from "../../../pages/ObjectiveCreatePage.js";
import { ObjectivesDatepickerHelper } from "../../../pages/ObjectivesDatepickerHelper.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

test.describe(
  "Датапикер периода — Выбор месяца",
  { tag: ["@ui", "@objectives", "@regression"] },
  () => {
    test.beforeEach(async ({ adminAuth, page }) => {
      markAsUITest(MODULES.OBJECTIVES);
      await page.goto("/ru/objectives/new/add/");
    });

    test("C8106: Выбор месяца Март одним кликом → 01.03.YYYY - 31.03.YYYY",
      async ({ page }, testInfo) => {
        setSeverity("normal");
        const dp = new ObjectiveCreatePage(page, testInfo).datepicker;

        // Март = monthIndex 2 (0-based)
        const year = 2026;
        const monthIndex = 2; // Март

        await test.step("Выбрать Март 2026", async () => {
          await dp.selectMonth(year, monthIndex);
        });

        await test.step("Проверить значение поля", async () => {
          const expected = ObjectivesDatepickerHelper.getExpectedMonthValue(year, monthIndex);
          await dp.assertValue(expected);
        });

        await test.step("Датапикер закрылся после выбора", async () => {
          expect(await dp.isOpen()).toBe(false);
        });
      },
    );
  },
);
