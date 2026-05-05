// tests/functional/objectives/objectives-filter-default-refresh.spec.js
// Phase 7: Фильтр периода пустой после F5/reload (DEVAPR-11591)

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
  "Цели — Фильтр пустой после перезагрузки страницы",
  { tag: ["@ui", "@objectives", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.OBJECTIVES);
    });

    test("C8137: Фильтр пустой после F5 (установленный фильтр не сохраняется)",
      { tag: [] },
      async ({ adminAuth, page }, testInfo) => {
        setSeverity("normal");

        const objectivesAllPage = new ObjectivesAllPage(page, testInfo);
        const currentYear = new Date().getFullYear();

        await test.step("Открыть страницу целей", async () => {
          await page.goto("/ru/objectives/");
          await objectivesAllPage.title.waitFor({ state: "visible", timeout: TIMEOUTS.LONG });
          await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });
        });

        await test.step('Переключиться на вкладку "Все цели"', async () => {
          await objectivesAllPage.switchToTab("all");
        });

        await test.step("Проверить исходное состояние: фильтр пустой", async () => {
          await objectivesAllPage.assertPeriodFilterEmpty();
        });

        await test.step(`Установить фильтр Q1 ${currentYear}`, async () => {
          await objectivesAllPage.periodFilter.selectQuarter(currentYear, 1);
          const expectedValue = ObjectivesDatepickerHelper.getExpectedQuarterValue(currentYear, 1);
          await objectivesAllPage.periodFilter.assertValue(expectedValue);
        });

        await test.step("Перезагрузить страницу (F5)", async () => {
          await page.reload();
          await objectivesAllPage.title.waitFor({ state: "visible", timeout: TIMEOUTS.LONG });
          await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });
        });

        await test.step("Проверить что фильтр снова пустой после перезагрузки", async () => {
          await objectivesAllPage.assertPeriodFilterEmpty();
        });
      },
    );
  },
);
