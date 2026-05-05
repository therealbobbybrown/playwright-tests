// tests/functional/objectives/objective-datepicker-tabs.spec.js
// DEVAPR-11585: 5 вкладок пресетов датапикера

import { expect } from "@playwright/test";
import { test } from "../../fixtures/auth.js";
import { ObjectiveCreatePage } from "../../../pages/ObjectiveCreatePage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

test.describe(
  "Датапикер периода — 5 вкладок пресетов",
  { tag: ["@ui", "@objectives", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.OBJECTIVES);
    });

    test("C8118: 5 вкладок: День, Месяц, Квартал, Полугодие, Год",
      async ({ adminAuth, page }, testInfo) => {
        setSeverity("normal");

        const objectiveCreatePage = new ObjectiveCreatePage(page, testInfo);
        const dp = objectiveCreatePage.datepicker;

        await test.step("Открыть страницу создания цели", async () => {
          await page.goto("/ru/objectives/new/add/");
          await objectiveCreatePage.titleSpan.waitFor({ state: "visible" });
        });

        await test.step("Открыть датапикер", async () => {
          await dp.open();
          expect(await dp.isOpen()).toBe(true);
        });

        await test.step("Все 5 вкладок видны", async () => {
          await expect(dp.tabDay).toBeVisible();
          await expect(dp.tabMonth).toBeVisible();
          await expect(dp.tabQuarter).toBeVisible();
          await expect(dp.tabHalfYear).toBeVisible();
          await expect(dp.tabYear).toBeVisible();
        });

        await test.step("По умолчанию активна вкладка «Квартал»", async () => {
          await dp.assertPresetTabActive("quarter");
        });

        await test.step("Переключиться на вкладку «День»", async () => {
          await dp.switchToPreset("day");
          await dp.assertPresetTabActive("day");
          // Грид дней должен быть виден
          await expect(dp.dayCells.first()).toBeVisible();
        });

        await test.step("Переключиться на вкладку «Месяц»", async () => {
          await dp.switchToPreset("month");
          await dp.assertPresetTabActive("month");
          await expect(dp.monthGrid).toBeVisible();
        });

        await test.step("Переключиться на вкладку «Полугодие»", async () => {
          await dp.switchToPreset("halfYear");
          await dp.assertPresetTabActive("halfYear");
          await expect(dp.halfYearGrid).toBeVisible();
        });

        await test.step("Переключиться на вкладку «Год»", async () => {
          await dp.switchToPreset("year");
          await dp.assertPresetTabActive("year");
          await expect(dp.yearGrid).toBeVisible();
        });

        await test.step("Переключиться обратно на вкладку «Квартал»", async () => {
          await dp.switchToPreset("quarter");
          await dp.assertPresetTabActive("quarter");
          await expect(dp.quarterGrid).toBeVisible();
        });

        await test.step("Закрыть датапикер", async () => {
          await dp.close();
          expect(await dp.isOpen()).toBe(false);
        });
      },
    );
  },
);
