// tests/functional/objectives/objectives-filter-old-dropdowns-removed.spec.js
// Phase 7: Старые дропдауны "Год" и "Квартал" отсутствуют (DEVAPR-11585)

import { test } from "../../fixtures/auth.js";
import { ObjectivesAllPage } from "../../../pages/ObjectivesAllPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { TIMEOUTS } from "../../utils/constants.js";

test.describe(
  'Цели — Старые дропдауны "Год" и "Квартал" удалены (DEVAPR-11585)',
  { tag: ["@ui", "@objectives", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.OBJECTIVES);
    });

    test('C8140: Старые дропдауны "Год" и "Квартал" отсутствуют на странице списка',
      { tag: [] },
      async ({ adminAuth, page }, testInfo) => {
        setSeverity("normal");

        const objectivesAllPage = new ObjectivesAllPage(page, testInfo);

        await test.step("Открыть страницу списка целей", async () => {
          await page.goto("/ru/objectives/");
          await objectivesAllPage.title.waitFor({ state: "visible", timeout: TIMEOUTS.LONG });
          await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });
        });

        await test.step('Проверить что старые дропдауны "Год" и "Квартал" отсутствуют', async () => {
          await objectivesAllPage.assertOldDropdownsRemoved();
        });
      },
    );
  },
);
