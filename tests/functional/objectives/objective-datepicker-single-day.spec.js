// tests/functional/objectives/objective-datepicker-single-day.spec.js
// DEVAPR-11585: Выбор одного дня = полные сутки

import { expect } from "@playwright/test";
import { test } from "../../fixtures/auth.js";
import { ObjectiveCreatePage } from "../../../pages/ObjectiveCreatePage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

test.describe(
  "Датапикер периода — Один день",
  { tag: ["@ui", "@objectives", "@regression"] },
  () => {
    const currentYear = new Date().getFullYear();

    test.beforeEach(async ({ adminAuth, page }) => {
      markAsUITest(MODULES.OBJECTIVES);
      await page.goto("/ru/objectives/new/add/");
    });

    test("C8117: Выбор одного дня — начало и конец совпадают",
      async ({ page }, testInfo) => {
        setSeverity("normal");
        const dp = new ObjectiveCreatePage(page, testInfo).datepicker;

        await test.step("Выбрать один день: 15 марта текущего года", async () => {
          await dp.selectSingleDay({ year: currentYear, month: 2, date: 15 });
        });

        await test.step("Проверить значение поля: начало = конец = 15.03.YYYY", async () => {
          const expectedDate = `15.03.${currentYear}`;
          await dp.assertValue(`${expectedDate} - ${expectedDate}`);
        });

        await test.step("Датапикер закрылся после выбора", async () => {
          expect(await dp.isOpen()).toBe(false);
        });
      },
    );
  },
);
