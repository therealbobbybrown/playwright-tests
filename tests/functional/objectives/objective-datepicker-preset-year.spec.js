// tests/functional/objectives/objective-datepicker-preset-year.spec.js
// DEVAPR-11585: Выбор года одним кликом

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
  "Датапикер периода — Выбор года",
  { tag: ["@ui", "@objectives", "@regression"] },
  () => {
    test.beforeEach(async ({ adminAuth, page }) => {
      markAsUITest(MODULES.OBJECTIVES);
      await page.goto("/ru/objectives/new/add/");
    });

    test("C8111: Выбор года 2026 одним кликом → 01.01.2026 - 31.12.2026",
      async ({ page }, testInfo) => {
        setSeverity("normal");
        const dp = new ObjectiveCreatePage(page, testInfo).datepicker;

        await test.step("Выбрать 2026", async () => {
          await dp.selectYear(2026);
        });

        await test.step("Проверить значение поля", async () => {
          const expected = ObjectivesDatepickerHelper.getExpectedYearValue(2026);
          await dp.assertValue(expected);
        });

        await test.step("Датапикер закрылся после выбора", async () => {
          expect(await dp.isOpen()).toBe(false);
        });
      },
    );
  },
);
