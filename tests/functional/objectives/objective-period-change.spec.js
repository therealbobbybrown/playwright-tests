// tests/functional/objectives/objective-period-change.spec.js
// TestRail: C2649 - Создание Индивидуальной цели, изменение периода
// DEVAPR-11585: датапикер заменил старые дропдауны год/квартал

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
  "Изменение периода при создании цели (OKR)",
  { tag: ["@ui", "@objectives", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.OBJECTIVES);
    });

    test(
      "C2649: Выбрать период Q2 → создать цель → проверить период на деталях",
      { tag: ["@critical"] },
      async ({ adminAuth, page, objectivesAPI }, testInfo) => {
        setSeverity("critical");

        const objectiveCreatePage = new ObjectiveCreatePage(page, testInfo);
        const objectiveDetailsPage = new ObjectiveDetailsPage(page, testInfo);

        const currentYear = new Date().getFullYear();
        const randomNumber = Math.floor(Math.random() * 100000) + 1;
        const objectiveTitle = `Цель Q2 период ${randomNumber}`;
        const milestoneTitle = `КР период Q2 ${randomNumber}`;

        let createdObjectiveId = null;

        await test.step("Открыть страницу создания цели", async () => {
          await page.goto("/ru/objectives/new/add/");
          await objectiveCreatePage.titleSpan.waitFor({ state: "visible" });
        });

        await test.step("Выбрать период Q2 через датапикер", async () => {
          await objectiveCreatePage.datepicker.selectQuarter(currentYear, 2);
          const expected = ObjectivesDatepickerHelper.getExpectedQuarterValue(currentYear, 2);
          await objectiveCreatePage.datepicker.assertValue(expected);
        });

        await test.step("Заполнить цель и создать", async () => {
          await objectiveCreatePage.fillAndCreateObjective(
            objectiveTitle,
            milestoneTitle,
            // Период уже выбран выше, передаём null чтобы не перезаписывать
          );
          // Извлечь ID из URL
          const url = page.url();
          const match = url.match(/\/objectives\/(\d+)/);
          if (match) {
            createdObjectiveId = parseInt(match[1], 10);
          }
        });

        await test.step("Проверить период на странице деталей", async () => {
          const expected = `01.04.${currentYear} - 30.06.${currentYear}`;
          await objectiveDetailsPage.assertPeriodDisplay(expected);
        });

        await test.step("Очистить: удалить цель через API", async () => {
          if (createdObjectiveId) {
            await safeDeleteObjective(objectivesAPI, createdObjectiveId);
          }
        });
      },
    );
  },
);
