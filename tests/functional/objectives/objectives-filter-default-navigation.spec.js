// tests/functional/objectives/objectives-filter-default-navigation.spec.js
// Phase 7: Фильтр периода пустой при навигации из другого раздела (DEVAPR-11591)

import { test } from "../../fixtures/auth.js";
import { ObjectivesAllPage } from "../../../pages/ObjectivesAllPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { TIMEOUTS } from "../../utils/constants.js";

test.describe(
  "Цели — Фильтр пустой при навигации из другого раздела",
  { tag: ["@ui", "@objectives", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.OBJECTIVES);
    });

    test("C8136: Фильтр пустой при навигации из другого раздела",
      { tag: [] },
      async ({ adminAuth, page }, testInfo) => {
        setSeverity("normal");

        const objectivesAllPage = new ObjectivesAllPage(page, testInfo);

        await test.step("Перейти в раздел /ru/feedback/", async () => {
          await page.goto("/ru/feedback/");
          await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });
        });

        await test.step("Перейти в раздел /ru/objectives/", async () => {
          await page.goto("/ru/objectives/");
          await objectivesAllPage.title.waitFor({ state: "visible", timeout: TIMEOUTS.LONG });
          await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });
        });

        await test.step('Переключиться на вкладку "Все цели"', async () => {
          await objectivesAllPage.switchToTab("all");
        });

        await test.step('Проверить что фильтр "Период" пустой', async () => {
          await objectivesAllPage.assertPeriodFilterEmpty();
        });
      },
    );
  },
);
