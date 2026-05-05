// tests/functional/objectives/objective-period-display-create.spec.js
// DEVAPR-11585: Формат периода на странице создания

import { test } from "../../fixtures/auth.js";
import { ObjectiveCreatePage } from "../../../pages/ObjectiveCreatePage.js";
import { ObjectivesDatepickerHelper } from "../../../pages/ObjectivesDatepickerHelper.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

test.describe(
  "Датапикер периода — Отображение поля на странице создания",
  { tag: ["@ui", "@objectives", "@regression"] },
  () => {
    test.beforeEach(async ({ adminAuth, page }) => {
      markAsUITest(MODULES.OBJECTIVES);
      await page.goto("/ru/objectives/new/add/");
    });

    test("C8123: Поле «Период» показывает дефолтное значение в формате DD.MM.YYYY - DD.MM.YYYY",
      async ({ page }, testInfo) => {
        setSeverity("normal");
        const dp = new ObjectiveCreatePage(page, testInfo).datepicker;

        await test.step("Получить ожидаемое дефолтное значение (текущий квартал)", async () => {
          const { displayValue } = ObjectivesDatepickerHelper.getCurrentQuarterDates();

          await test.step(`Проверить значение поля = "${displayValue}"`, async () => {
            await dp.assertValue(displayValue);
          });
        });

        await test.step("Проверить формат значения DD.MM.YYYY - DD.MM.YYYY", async () => {
          const value = await dp.getValue();
          const formatRegex = /^\d{2}\.\d{2}\.\d{4} - \d{2}\.\d{2}\.\d{4}$/;
          if (!formatRegex.test(value)) {
            throw new Error(`Значение поля "${value}" не соответствует формату DD.MM.YYYY - DD.MM.YYYY`);
          }
        });
      },
    );
  },
);
