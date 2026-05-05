// tests/functional/objectives/objectives-filter-default-empty.spec.js
// Phase 7: Фильтр периода пустой по умолчанию, показывает все цели (DEVAPR-11591)

import { expect } from "@playwright/test";
import { test } from "../../fixtures/auth.js";
import { ObjectivesAllPage } from "../../../pages/ObjectivesAllPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { TIMEOUTS } from "../../utils/constants.js";

test.describe(
  'Цели — Дефолтный фильтр периода "не выбран"',
  { tag: ["@ui", "@objectives", "@regression", "@critical", "@smoke"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.OBJECTIVES);
    });

    test('C8134: Фильтр "Период" пустой по умолчанию, показывает все цели',
      { tag: ["@smoke", "@critical"] },
      async ({ adminAuth, page }, testInfo) => {
        setSeverity("critical");

        const objectivesAllPage = new ObjectivesAllPage(page, testInfo);

        await test.step('Перейти на /ru/objectives/', async () => {
          await page.goto("/ru/objectives/");
          await objectivesAllPage.title.waitFor({ state: "visible", timeout: TIMEOUTS.LONG });
          await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });
        });

        await test.step('Проверить что фильтр "Период" пустой по умолчанию', async () => {
          await objectivesAllPage.assertPeriodFilterEmpty();
        });

        await test.step("Проверить что цели отображаются (таблица не пустая)", async () => {
          await objectivesAllPage.tableRows.first().waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
          const count = await objectivesAllPage.tableRows.count();
          expect(count, "При пустом фильтре периода должны быть видны цели").toBeGreaterThan(0);
        });
      },
    );

    test('C8135: Фильтр пустой при прямом переходе по ссылке с ?tab=mine',
      { tag: [] },
      async ({ adminAuth, page }, testInfo) => {
        setSeverity("normal");

        const objectivesAllPage = new ObjectivesAllPage(page, testInfo);

        await test.step('Перейти на /ru/objectives/?tab=mine', async () => {
          await page.goto("/ru/objectives/?tab=mine");
          await objectivesAllPage.title.waitFor({ state: "visible", timeout: TIMEOUTS.LONG });
          await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });
        });

        await test.step('Проверить что фильтр "Период" пустой', async () => {
          await objectivesAllPage.assertPeriodFilterEmpty();
        });
      },
    );
  },
);
