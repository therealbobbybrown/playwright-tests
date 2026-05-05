// tests/functional/objectives/objective-datepicker-no-active-preset.spec.js
// DEVAPR-11585: Произвольный диапазон → нет подсветки пресета

import { test } from "../../fixtures/auth.js";
import { ObjectiveCreatePage } from "../../../pages/ObjectiveCreatePage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

test.describe(
  "Датапикер периода — Произвольный диапазон без активного пресета",
  { tag: ["@ui", "@objectives", "@regression"] },
  () => {
    const currentYear = new Date().getFullYear();

    test.beforeEach(async ({ adminAuth, page }) => {
      markAsUITest(MODULES.OBJECTIVES);
      await page.goto("/ru/objectives/new/add/");
    });

    test("C8102: Произвольный диапазон 15.02-20.03 → вкладка «День» активна, пресеты не подсвечены",
      async ({ page }, testInfo) => {
        setSeverity("normal");
        const dp = new ObjectiveCreatePage(page, testInfo).datepicker;

        await test.step("Выбрать произвольный диапазон 15.02 - 20.03 (не совпадает ни с одним пресетом)", async () => {
          await dp.selectDayRange(
            { year: currentYear, month: 1, date: 15 },
            { year: currentYear, month: 2, date: 20 },
          );
        });

        await test.step("Проверить значение поля", async () => {
          await dp.assertValue(`15.02.${currentYear} - 20.03.${currentYear}`);
        });

        await test.step("Открыть датапикер повторно", async () => {
          await dp.open();
        });

        await test.step("Активна вкладка «День» (произвольный диапазон)", async () => {
          await dp.assertPresetTabActive("day");
        });

        await test.step("Ни одна кнопка пресета (квартал/полугодие/год) не подсвечена как выбранная", async () => {
          await dp.assertNoActivePresetHighlight();
        });
      },
    );
  },
);
