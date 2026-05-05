// tests/functional/objectives/objectives-tabs-order.spec.js
// Phase 7: Порядок вкладок и дефолтная активная вкладка (DEVAPR-11591)

import { test } from "../../fixtures/auth.js";
import { ObjectivesAllPage } from "../../../pages/ObjectivesAllPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { TIMEOUTS } from "../../utils/constants.js";

test.describe(
  "Цели — Порядок вкладок (DEVAPR-11591)",
  { tag: ["@ui", "@objectives", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.OBJECTIVES);
    });

    test('C8146: Порядок вкладок: Мои цели → Моя команда → Все цели → Мои черновики',
      { tag: [] },
      async ({ adminAuth, page }, testInfo) => {
        setSeverity("normal");

        const objectivesAllPage = new ObjectivesAllPage(page, testInfo);

        await test.step("Открыть страницу целей", async () => {
          await page.goto("/ru/objectives/");
          await objectivesAllPage.title.waitFor({ state: "visible", timeout: TIMEOUTS.LONG });
          await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });
        });

        await test.step("Проверить порядок вкладок", async () => {
          await objectivesAllPage.assertTabOrder();
        });
      },
    );

    test('C8145: По умолчанию активна вкладка "Все цели"',
      { tag: [] },
      async ({ adminAuth, page }, testInfo) => {
        setSeverity("normal");

        const objectivesAllPage = new ObjectivesAllPage(page, testInfo);

        await test.step("Открыть страницу целей прямой навигацией", async () => {
          await page.goto("/ru/objectives/");
          await objectivesAllPage.title.waitFor({ state: "visible", timeout: TIMEOUTS.LONG });
          await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });
        });

        await test.step('Проверить что активна вкладка "Все цели"', async () => {
          await objectivesAllPage.assertDefaultTabIsAll();
        });

        await test.step("Проверить что таблица целей отображается (вкладка не пустая)", async () => {
          await objectivesAllPage.tableRows.first().waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
        });
      },
    );
  },
);
