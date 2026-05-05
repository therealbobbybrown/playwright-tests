// tests/functional/objectives/objective-period-display-historical.spec.js
// Phase 6: Исторические цели с мигрированным периодом отображают формат DD.MM.YYYY (DEVAPR-11585)

import { expect } from "@playwright/test";
import { test } from "../../fixtures/auth-api.js";
import { ObjectiveDetailsPage } from "../../../pages/ObjectiveDetailsPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { TIMEOUTS } from "../../utils/constants.js";

test.describe(
  "Цели — Исторические цели отображают формат периода DD.MM.YYYY",
  { tag: ["@ui", "@objectives", "@regression"] },
  () => {
    let existingObjectiveId = null;
    let existingObjectiveStartDate = null;
    let existingObjectiveEndDate = null;

    test.beforeAll(async ({ objectivesAPI }) => {
      // Ищем существующую цель с заданным startDate (мигрированный период)
      const { response, data } = await objectivesAPI.getObjectives({ limit: 5 });

      if (!response.ok()) {
        throw new Error(`Не удалось получить список целей: ${response.status()}`);
      }

      const items = data?.items || data || [];
      const objectiveWithPeriod = items.find(
        (obj) => obj.startDate && obj.endDate && obj.id,
      );

      if (!objectiveWithPeriod) {
        throw new Error(
          "Нет существующих целей с полями startDate/endDate. Создайте хотя бы одну цель с периодом перед запуском этого теста.",
        );
      }

      existingObjectiveId = objectiveWithPeriod.id;
      existingObjectiveStartDate = objectiveWithPeriod.startDate;
      existingObjectiveEndDate = objectiveWithPeriod.endDate;
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.OBJECTIVES);
    });

    test("C8125: Исторические цели (с мигрированным периодом) отображают формат DD.MM.YYYY",
      { tag: [] },
      async ({ adminAuth, page }, testInfo) => {
        setSeverity("normal");

        const objectiveDetailsPage = new ObjectiveDetailsPage(page, testInfo);

        // Формируем ожидаемый период из API-дат (YYYY-MM-DD или YYYY-MM-DDTHH:mm:ss.sssZ → DD.MM.YYYY)
        const formatDate = (isoDate) => {
          const datePart = isoDate.split("T")[0]; // strip time if present
          const [year, month, day] = datePart.split("-");
          return `${day}.${month}.${year}`;
        };
        const expectedPeriod = `${formatDate(existingObjectiveStartDate)} - ${formatDate(existingObjectiveEndDate)}`;

        await test.step(`Перейти на страницу деталей цели ID=${existingObjectiveId}`, async () => {
          await page.goto(`/ru/objectives/view/${existingObjectiveId}/`);
          await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });
        });

        await test.step(`Проверить отображение периода: «${expectedPeriod}»`, async () => {
          await objectiveDetailsPage.assertPeriodDisplay(expectedPeriod);
        });
      },
    );
  },
);
