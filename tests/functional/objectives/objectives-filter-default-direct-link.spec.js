// tests/functional/objectives/objectives-filter-default-direct-link.spec.js
// Phase 7: Фильтр периода пустой при прямой навигации по ссылке с tab-параметром (DEVAPR-11591)

import { test } from "../../fixtures/auth.js";
import { ObjectivesAllPage } from "../../../pages/ObjectivesAllPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { TIMEOUTS } from "../../utils/constants.js";

test.describe(
  "Цели — Фильтр пустой при прямой ссылке с ?tab=",
  { tag: ["@ui", "@objectives", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.OBJECTIVES);
    });

    test("C8133: Фильтр пустой при прямой ссылке ?tab=mine и ?tab=all",
      { tag: [] },
      async ({ adminAuth, page }, testInfo) => {
        setSeverity("normal");

        const objectivesAllPage = new ObjectivesAllPage(page, testInfo);

        await test.step("Перейти напрямую на /ru/objectives/?tab=mine", async () => {
          await page.goto("/ru/objectives/?tab=mine");
          await objectivesAllPage.title.waitFor({ state: "visible", timeout: TIMEOUTS.LONG });
          await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });
        });

        await test.step('Проверить что фильтр "Период" пустой на вкладке mine', async () => {
          await objectivesAllPage.assertPeriodFilterEmpty();
        });

        await test.step("Перейти напрямую на /ru/objectives/?tab=all", async () => {
          await page.goto("/ru/objectives/?tab=all");
          await objectivesAllPage.title.waitFor({ state: "visible", timeout: TIMEOUTS.LONG });
          await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });
        });

        await test.step('Проверить что фильтр "Период" пустой на вкладке all', async () => {
          await objectivesAllPage.assertPeriodFilterEmpty();
        });
      },
    );
  },
);
