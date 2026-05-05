// tests/functional/objectives/objectives-filter-default-all-tabs.spec.js
// Phase 7: Фильтр периода пустой на всех 4 вкладках (DEVAPR-11591)

import { test } from "../../fixtures/auth.js";
import { ObjectivesAllPage } from "../../../pages/ObjectivesAllPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { TIMEOUTS } from "../../utils/constants.js";

test.describe(
  "Цели — Фильтр периода пустой на всех вкладках",
  { tag: ["@ui", "@objectives", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.OBJECTIVES);
    });

    test("C8132: Фильтр пустой на всех 4 вкладках",
      { tag: [] },
      async ({ adminAuth, page }, testInfo) => {
        setSeverity("normal");

        const objectivesAllPage = new ObjectivesAllPage(page, testInfo);

        await test.step("Открыть страницу целей", async () => {
          await page.goto("/ru/objectives/");
          await objectivesAllPage.title.waitFor({ state: "visible", timeout: TIMEOUTS.LONG });
          await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });
        });

        await test.step('Проверить фильтр на вкладке "Все цели" (активна по умолчанию)', async () => {
          await objectivesAllPage.assertDefaultTabIsAll();
          await objectivesAllPage.assertPeriodFilterEmpty();
        });

        await test.step('Переключиться на "Мои цели" → фильтр пустой', async () => {
          await objectivesAllPage.switchToTab("mine");
          await objectivesAllPage.assertPeriodFilterEmpty();
        });

        await test.step('Переключиться на "Моя команда" → фильтр пустой', async () => {
          // Вкладка "Моя команда" может отсутствовать у пользователей без подчинённых
          const tabVisible = await objectivesAllPage.tabTeam
            .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
            .then(() => true)
            .catch(() => false);

          if (tabVisible) {
            await objectivesAllPage.switchToTab("team");
            await objectivesAllPage.assertPeriodFilterEmpty();
          } else {
            console.log('Вкладка "Моя команда" не отображается — пропускаем');
          }
        });

        await test.step('Переключиться на "Мои черновики" → фильтр пустой (если присутствует)', async () => {
          await objectivesAllPage.switchToTab("draft");
          // На вкладке черновиков фильтр «Период» может отсутствовать (другой UI)
          const filterExists = await objectivesAllPage.periodFilter.anchor
            .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
            .then(() => true)
            .catch(() => false);
          if (filterExists) {
            await objectivesAllPage.assertPeriodFilterEmpty();
          } else {
            console.log('На вкладке "Мои черновики" фильтр «Период» не отображается — пропускаем проверку');
          }
        });
      },
    );
  },
);
