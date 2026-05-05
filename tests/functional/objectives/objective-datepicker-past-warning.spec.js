// tests/functional/objectives/objective-datepicker-past-warning.spec.js
// DEVAPR-11585: Предупреждение при выборе прошедшего периода

import { test } from "../../fixtures/auth-api.js";
import { ObjectiveCreatePage } from "../../../pages/ObjectiveCreatePage.js";
import { ObjectivesDatepickerHelper } from "../../../pages/ObjectivesDatepickerHelper.js";
import { safeDeleteObjective } from "../../utils/api/test-helpers.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

test.describe(
  "Датапикер периода — Предупреждение о прошедшем периоде",
  { tag: ["@ui", "@objectives", "@regression"] },
  () => {
    test.beforeEach(async ({ adminAuth, page }) => {
      markAsUITest(MODULES.OBJECTIVES);
      await page.goto("/ru/objectives/new/add/");
    });

    test("C8103: Предупреждение при выборе прошедшего периода (Q1 2025)",
      async ({ adminAuth, page, objectivesAPI }, testInfo) => {
        setSeverity("normal");
        const objectiveCreatePage = new ObjectiveCreatePage(page, testInfo);
        const dp = objectiveCreatePage.datepicker;

        const randomNumber = Math.floor(Math.random() * 100000) + 1;
        const objectiveTitle = `Цель прошлый период ${randomNumber}`;
        const milestoneTitle = `КР прошлый ${randomNumber}`;
        let createdObjectiveId = null;

        await test.step("Выбрать Q1 2025 (прошедший период)", async () => {
          await dp.selectQuarter(2025, 1);
          await dp.assertValue(ObjectivesDatepickerHelper.getExpectedQuarterValue(2025, 1));
        });

        await test.step("Предупреждение видно", async () => {
          await dp.assertPastPeriodWarning(true);
        });

        await test.step("Текст предупреждения корректный", async () => {
          await dp.assertPastWarningText();
        });

        await test.step("Предупреждение имеет информационный (не красный) стиль", async () => {
          await dp.assertPastWarningIsInfo();
        });

        await test.step("Цель всё равно создаётся (предупреждение не блокирует)", async () => {
          await objectiveCreatePage.fillAndCreateObjective(
            objectiveTitle,
            milestoneTitle,
          );
          const url = page.url();
          const match = url.match(/\/objectives\/(\d+)/);
          if (match) {
            createdObjectiveId = parseInt(match[1], 10);
          }
          // Цель создана — мы перешли на страницу деталей
          const isOnDetailsPage =
            url.includes("objectives") &&
            !url.includes("add") &&
            !url.includes("new");
          if (!isOnDetailsPage) {
            throw new Error(`Цель не была создана. Текущий URL: ${url}`);
          }
        });

        await test.step("Предупреждение отсутствует при выборе будущего периода", async () => {
          // Дополнительная проверка: нет предупреждения при дефолтном значении
          await page.goto("/ru/objectives/new/add/");
          await objectiveCreatePage.titleSpan.waitFor({ state: "visible" });
          await dp.assertPastPeriodWarning(false);
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
