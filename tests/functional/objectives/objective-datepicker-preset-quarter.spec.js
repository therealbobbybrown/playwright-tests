// tests/functional/objectives/objective-datepicker-preset-quarter.spec.js
// DEVAPR-11585: Выбор квартала одним кликом

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
  "Датапикер периода — Выбор квартала",
  { tag: ["@ui", "@objectives", "@regression"] },
  () => {
    const currentYear = new Date().getFullYear();

    test.beforeEach(async ({ adminAuth, page }) => {
      markAsUITest(MODULES.OBJECTIVES);
      await page.goto("/ru/objectives/new/add/");
    });

    test("C8107: Выбор Q1 одним кликом → правильные даты в поле",
      async ({ page }, testInfo) => {
        setSeverity("normal");
        const dp = new ObjectiveCreatePage(page, testInfo).datepicker;

        await test.step("Выбрать Q1", async () => {
          await dp.selectQuarter(currentYear, 1);
        });

        await test.step("Проверить значение поля", async () => {
          const expected = ObjectivesDatepickerHelper.getExpectedQuarterValue(currentYear, 1);
          await dp.assertValue(expected);
        });

        await test.step("Датапикер закрылся после выбора", async () => {
          expect(await dp.isOpen()).toBe(false);
        });
      },
    );

    test("C8108: Выбор Q2 одним кликом",
      async ({ page }, testInfo) => {
        setSeverity("normal");
        const dp = new ObjectiveCreatePage(page, testInfo).datepicker;

        await test.step("Выбрать Q2", async () => {
          await dp.selectQuarter(currentYear, 2);
        });

        await test.step("Проверить значение поля", async () => {
          const expected = ObjectivesDatepickerHelper.getExpectedQuarterValue(currentYear, 2);
          await dp.assertValue(expected);
        });

        await test.step("Датапикер закрылся после выбора", async () => {
          expect(await dp.isOpen()).toBe(false);
        });
      },
    );

    test("C8109: Выбор Q3 одним кликом",
      async ({ page }, testInfo) => {
        setSeverity("normal");
        const dp = new ObjectiveCreatePage(page, testInfo).datepicker;

        await test.step("Выбрать Q3", async () => {
          await dp.selectQuarter(currentYear, 3);
        });

        await test.step("Проверить значение поля", async () => {
          const expected = ObjectivesDatepickerHelper.getExpectedQuarterValue(currentYear, 3);
          await dp.assertValue(expected);
        });

        await test.step("Датапикер закрылся после выбора", async () => {
          expect(await dp.isOpen()).toBe(false);
        });
      },
    );

    test("C8110: Выбор Q4 одним кликом",
      async ({ page }, testInfo) => {
        setSeverity("normal");
        const dp = new ObjectiveCreatePage(page, testInfo).datepicker;

        await test.step("Выбрать Q4", async () => {
          await dp.selectQuarter(currentYear, 4);
        });

        await test.step("Проверить значение поля", async () => {
          const expected = ObjectivesDatepickerHelper.getExpectedQuarterValue(currentYear, 4);
          await dp.assertValue(expected);
        });

        await test.step("Датапикер закрылся после выбора", async () => {
          expect(await dp.isOpen()).toBe(false);
        });
      },
    );
  },
);
