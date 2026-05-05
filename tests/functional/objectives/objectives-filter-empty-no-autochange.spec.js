// tests/functional/objectives/objectives-filter-empty-no-autochange.spec.js
// Phase 7: Фильтр НЕ авто-сбрасывается при отсутствии целей (DEVAPR-11591)

import { test } from "../../fixtures/auth.js";
import { ObjectivesAllPage } from "../../../pages/ObjectivesAllPage.js";
import { ObjectivesDatepickerHelper } from "../../../pages/ObjectivesDatepickerHelper.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { TIMEOUTS } from "../../utils/constants.js";

test.describe(
  "Цели — Пустой фильтр не меняется автоматически при отсутствии целей",
  { tag: ["@ui", "@objectives", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.OBJECTIVES);
    });

    test("C8138: Фильтр Q3 2030 остаётся выбранным даже если нет целей за этот период",
      { tag: [] },
      async ({ adminAuth, page }, testInfo) => {
        setSeverity("normal");

        const objectivesAllPage = new ObjectivesAllPage(page, testInfo);

        await test.step("Открыть страницу целей", async () => {
          await page.goto("/ru/objectives/");
          await objectivesAllPage.title.waitFor({ state: "visible", timeout: TIMEOUTS.LONG });
          await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });
        });

        await test.step('Переключиться на вкладку "Все цели"', async () => {
          await objectivesAllPage.switchToTab("all");
        });

        await test.step("Установить фильтр Q3 2030 (будущий период без целей)", async () => {
          await objectivesAllPage.periodFilter.selectQuarter(2030, 3);
          const expectedValue = ObjectivesDatepickerHelper.getExpectedQuarterValue(2030, 3);
          await objectivesAllPage.periodFilter.assertValue(expectedValue);
        });

        await test.step("Дождаться загрузки таблицы (возможно пустой)", async () => {
          await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });
        });

        await test.step("Проверить что фильтр Q3 2030 НЕ сбросился автоматически", async () => {
          const expectedValue = ObjectivesDatepickerHelper.getExpectedQuarterValue(2030, 3);
          await objectivesAllPage.periodFilter.assertValue(expectedValue);
        });

        await test.step("Сбросить фильтр через навигацию и проверить что он пустой", async () => {
          await page.goto("/ru/objectives/");
          await objectivesAllPage.title.waitFor({ state: "visible", timeout: TIMEOUTS.LONG });
          await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });
          await objectivesAllPage.assertPeriodFilterEmpty();
        });
      },
    );
  },
);
