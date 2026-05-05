// tests/functional/objectives/objective-datepicker-cross-year.spec.js
// DEVAPR-11585: Диапазон, пересекающий границу года

import { expect } from "@playwright/test";
import { test } from "../../fixtures/auth.js";
import { ObjectiveCreatePage } from "../../../pages/ObjectiveCreatePage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

test.describe(
  "Датапикер периода — Межгодовой диапазон",
  { tag: ["@ui", "@objectives", "@regression"] },
  () => {
    test.beforeEach(async ({ adminAuth, page }) => {
      markAsUITest(MODULES.OBJECTIVES);
      await page.goto("/ru/objectives/new/add/");
    });

    test("C8097: Диапазон пересекает границу года (15.12.2025 → 15.01.2026)",
      async ({ page }, testInfo) => {
        setSeverity("normal");
        const dp = new ObjectiveCreatePage(page, testInfo).datepicker;

        await test.step("Выбрать диапазон 15.12.2025 - 15.01.2026", async () => {
          await dp.selectDayRange(
            { year: 2025, month: 11, date: 15 },
            { year: 2026, month: 0, date: 15 },
          );
        });

        await test.step("Проверить значение поля", async () => {
          await dp.assertValue("15.12.2025 - 15.01.2026");
        });

        await test.step("Датапикер закрылся после выбора", async () => {
          expect(await dp.isOpen()).toBe(false);
        });
      },
    );
  },
);
