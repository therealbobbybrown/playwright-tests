// tests/functional/objectives/objective-datepicker-preset-halfyear.spec.js
// DEVAPR-11585: Выбор полугодия одним кликом

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
  "Датапикер периода — Выбор полугодия",
  { tag: ["@ui", "@objectives", "@regression"] },
  () => {
    const currentYear = new Date().getFullYear();

    test.beforeEach(async ({ adminAuth, page }) => {
      markAsUITest(MODULES.OBJECTIVES);
      await page.goto("/ru/objectives/new/add/");
    });

    test("C8104: Выбор H1 → 01.01.YYYY - 30.06.YYYY",
      async ({ page }, testInfo) => {
        setSeverity("normal");
        const dp = new ObjectiveCreatePage(page, testInfo).datepicker;

        await test.step("Выбрать H1", async () => {
          await dp.selectHalfYear(currentYear, 1);
        });

        await test.step("Проверить значение поля", async () => {
          const expected = ObjectivesDatepickerHelper.getExpectedHalfYearValue(currentYear, 1);
          await dp.assertValue(expected);
        });

        await test.step("Датапикер закрылся после выбора", async () => {
          expect(await dp.isOpen()).toBe(false);
        });
      },
    );

    test("C8105: Выбор H2 → 01.07.YYYY - 31.12.YYYY",
      async ({ page }, testInfo) => {
        setSeverity("normal");
        const dp = new ObjectiveCreatePage(page, testInfo).datepicker;

        await test.step("Выбрать H2", async () => {
          await dp.selectHalfYear(currentYear, 2);
        });

        await test.step("Проверить значение поля", async () => {
          const expected = ObjectivesDatepickerHelper.getExpectedHalfYearValue(currentYear, 2);
          await dp.assertValue(expected);
        });

        await test.step("Датапикер закрылся после выбора", async () => {
          expect(await dp.isOpen()).toBe(false);
        });
      },
    );
  },
);
