// tests/functional/objectives/objective-datepicker-layout.spec.js
// DEVAPR-11585: Лейаут страницы создания — поле "Период" вместо старых дропдаунов

import { test } from "../../fixtures/auth.js";
import { ObjectiveCreatePage } from "../../../pages/ObjectiveCreatePage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

test.describe(
  "Датапикер периода — Лейаут страницы создания",
  { tag: ["@ui", "@objectives", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.OBJECTIVES);
    });

    test("C8101: Лейаут: поле «Период» вместо дропдаунов год/квартал",
      async ({ adminAuth, page }, testInfo) => {
        setSeverity("normal");

        const objectiveCreatePage = new ObjectiveCreatePage(page, testInfo);

        await test.step("Открыть страницу создания цели", async () => {
          await page.goto("/ru/objectives/new/add/");
          await objectiveCreatePage.titleSpan.waitFor({ state: "visible" });
        });

        await test.step("Проверить лейаут: датапикер есть, старых дропдаунов нет", async () => {
          await objectiveCreatePage.assertLayoutFields();
        });
      },
    );
  },
);
