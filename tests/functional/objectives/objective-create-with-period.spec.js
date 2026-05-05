// tests/functional/objectives/objective-create-with-period.spec.js
// DEVAPR-11585: E2E создание цели с периодом через датапикер + проверка на деталях

import { test } from "../../fixtures/auth-api.js";
import { ObjectiveCreatePage } from "../../../pages/ObjectiveCreatePage.js";
import { ObjectiveDetailsPage } from "../../../pages/ObjectiveDetailsPage.js";
import { ObjectivesDatepickerHelper } from "../../../pages/ObjectivesDatepickerHelper.js";
import { safeDeleteObjective } from "../../utils/api/test-helpers.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

test.describe(
  "Цели — E2E создание с периодом",
  { tag: ["@ui", "@objectives", "@regression", "@critical", "@smoke"] },
  () => {
    const currentYear = new Date().getFullYear();

    let createdObjectiveId = null;
    let objectivesAPIRef = null;
    let objectiveTitle = null;
    let milestoneTitle = null;

    test.beforeAll(async ({ objectivesAPI }) => {
      // Сохраняем ссылку на API для cleanup в afterAll
      objectivesAPIRef = objectivesAPI;
      const randomNumber = Math.floor(Math.random() * 100000) + 1;
      objectiveTitle = `E2E цель Q2 ${randomNumber}`;
      milestoneTitle = `КР e2e Q2 ${randomNumber}`;
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.OBJECTIVES);
    });

    test.afterAll(async () => {
      if (createdObjectiveId && objectivesAPIRef) {
        await safeDeleteObjective(objectivesAPIRef, createdObjectiveId);
      }
    });

    test("C8094: Создать цель с Q2 → на деталях период «01.04.YYYY - 30.06.YYYY»",
      { tag: [] },
      async ({ adminAuth, page, objectivesAPI }, testInfo) => {
        setSeverity("critical");

        // Сохраняем ссылку для afterAll
        objectivesAPIRef = objectivesAPI;

        const objectiveCreatePage = new ObjectiveCreatePage(page, testInfo);
        const objectiveDetailsPage = new ObjectiveDetailsPage(page, testInfo);

        await test.step("Открыть страницу создания цели", async () => {
          await page.goto("/ru/objectives/new/add/");
          await objectiveCreatePage.titleSpan.waitFor({ state: "visible" });
        });

        await test.step("Выбрать период Q2 через датапикер", async () => {
          await objectiveCreatePage.datepicker.selectQuarter(currentYear, 2);
          const expected = ObjectivesDatepickerHelper.getExpectedQuarterValue(currentYear, 2);
          await objectiveCreatePage.datepicker.assertValue(expected);
        });

        await test.step("Заполнить цель и ключевой результат", async () => {
          await objectiveCreatePage.fillAndCreateObjective(
            objectiveTitle,
            milestoneTitle,
            // Период уже выбран выше
          );

          // Извлечь ID из URL для cleanup
          const url = page.url();
          const match = url.match(/\/objectives\/(\d+)/);
          if (match) {
            createdObjectiveId = parseInt(match[1], 10);
          }
        });

        await test.step("Проверить что цель создана с правильным названием", async () => {
          await objectiveDetailsPage.assertDetails(objectiveTitle, milestoneTitle);
        });

        await test.step(`Проверить период «01.04.${currentYear} - 30.06.${currentYear}» на деталях`, async () => {
          const expectedPeriod = `01.04.${currentYear} - 30.06.${currentYear}`;
          await objectiveDetailsPage.assertPeriodDisplay(expectedPeriod);
        });
      },
    );
  },
);
