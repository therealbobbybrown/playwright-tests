// tests/functional/objectives/objective-datepicker-default.spec.js
// DEVAPR-11585: Дефолтный период = текущий квартал

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
  "Датапикер периода — Дефолтный период",
  { tag: ["@ui", "@objectives", "@regression", "@critical"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.OBJECTIVES);
    });

    test("C8099: Дефолтный период = текущий квартал",
      { tag: ["@smoke"] },
      async ({ adminAuth, page }, testInfo) => {
        setSeverity("critical");

        const objectiveCreatePage = new ObjectiveCreatePage(page, testInfo);

        await test.step("Открыть страницу создания цели", async () => {
          await page.goto("/ru/objectives/new/add/");
          await objectiveCreatePage.titleSpan.waitFor({ state: "visible" });
        });

        await test.step("Проверить дефолтное значение поля = текущий квартал", async () => {
          const { displayValue } = ObjectivesDatepickerHelper.getCurrentQuarterDates();
          await objectiveCreatePage.datepicker.assertValue(displayValue);
        });

        await test.step("Датапикер закрыт по умолчанию", async () => {
          const isOpen = await objectiveCreatePage.datepicker.isOpen();
          expect(isOpen).toBe(false);
        });
      },
    );
  },
);
