// tests/functional/objectives/objective-datepicker-validation.spec.js
// DEVAPR-11585: Период обязателен — поле всегда заполнено, кнопки очистки нет

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
  "Датапикер периода — Валидация обязательного поля",
  { tag: ["@ui", "@objectives", "@regression", "@critical"] },
  () => {
    test.beforeEach(async ({ adminAuth, page }) => {
      markAsUITest(MODULES.OBJECTIVES);
      await page.goto("/ru/objectives/new/add/");
    });

    test("C8119: Поле «Период» всегда заполнено — дефолт текущий квартал, очистка невозможна",
      async ({ page }, testInfo) => {
        setSeverity("critical");
        const createPage = new ObjectiveCreatePage(page, testInfo);
        const dp = createPage.datepicker;

        const { displayValue } = ObjectivesDatepickerHelper.getCurrentQuarterDates();

        await test.step("Поле «Период» заполнено дефолтным значением (текущий квартал)", async () => {
          await dp.assertValue(displayValue);
        });

        await test.step("Поле «Период» имеет атрибут readonly", async () => {
          await expect(dp.input).toHaveAttribute("readonly", "");
        });

        await test.step("Кнопка очистки × отсутствует рядом с полем", async () => {
          // Рядом с полем есть только chevron (открытие датапикера), а не ×
          const clearBtn = dp.anchor.locator("..").locator('button:has(> [class*="close"], > [class*="clear"], > [class*="remove"])');
          await expect(clearBtn).toHaveCount(0);
        });

        await test.step("После открытия и закрытия датапикера значение сохраняется", async () => {
          await dp.open();
          await dp.close();
          await dp.assertValue(displayValue);
        });
      },
    );
  },
);
