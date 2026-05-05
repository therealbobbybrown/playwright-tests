// tests/functional/objectives/objectives-filter-datepicker-reset.spec.js
// Phase 7: Сброс фильтра через × → все цели видны (DEVAPR-11591)

import { expect } from "@playwright/test";
import { test } from "../../fixtures/auth-api.js";
import { ObjectivesAllPage } from "../../../pages/ObjectivesAllPage.js";
import { ObjectivesDatepickerHelper } from "../../../pages/ObjectivesDatepickerHelper.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { TIMEOUTS } from "../../utils/constants.js";

test.describe(
  "Цели — Сброс фильтра периода",
  { tag: ["@ui", "@objectives", "@regression"] },
  () => {
    let objectiveIds = [];

    test.beforeAll(async ({ objectivesAPI }) => {
      const userId = objectivesAPI.getCurrentUserId();
      if (!userId) {
        throw new Error("Не удалось получить ID текущего пользователя из токена");
      }
      const suffix = Math.floor(Math.random() * 100000) + 1;
      // Создаём 3 цели: 2 в Q1 2026 и 1 в Q2 2026 — чтобы фильтр Q1 сужал список
      const objectives = [
        { title: `RESET-A-${suffix}`, startDate: "2026-01-01", endDate: "2026-03-31" },
        { title: `RESET-B-${suffix}`, startDate: "2026-01-01", endDate: "2026-03-31" },
        { title: `RESET-C-${suffix}`, startDate: "2026-04-01", endDate: "2026-06-30" },
      ];
      for (const obj of objectives) {
        const { response, data } = await objectivesAPI.saveObjective({
          title: obj.title,
          description: "Тест сброса фильтра",
          startDate: obj.startDate,
          endDate: obj.endDate,
          status: "active",
          level: "self",
          responsibleUserId: userId,
          userAccessType: "everybody",
          milestones: [
            {
              temporaryId: `temp-${obj.title}`,
              title: `КР для ${obj.title}`,
              type: "percent",
              weight: 100,
              progress: 0,
              responsibleUserId: userId,
            },
          ],
        });
        if (!response.ok()) {
          throw new Error(`Не удалось создать цель "${obj.title}": ${response.status()} — ${JSON.stringify(data)}`);
        }
        if (data?.id) objectiveIds.push(data.id);
      }
    });

    test.afterAll(async ({ objectivesAPI }) => {
      for (const id of objectiveIds) {
        await objectivesAPI.deleteObjective(id).catch(() => {});
      }
      objectiveIds = [];
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.OBJECTIVES);
    });

    test("C8130: Сброс фильтра через × → все цели видны",
      { tag: [] },
      async ({ adminAuth, page }, testInfo) => {
        setSeverity("normal");

        const objectivesAllPage = new ObjectivesAllPage(page, testInfo);
        const dp = objectivesAllPage.periodFilter;

        await test.step("Открыть страницу целей", async () => {
          await page.goto("/ru/objectives/");
          await objectivesAllPage.title.waitFor({ state: "visible", timeout: TIMEOUTS.LONG });
          await objectivesAllPage.switchToTab("all");
          await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });
        });

        await test.step("Запомнить количество строк без фильтра", async () => {
          await objectivesAllPage.tableRows.first().waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
        });

        const countBeforeFilter = await objectivesAllPage.tableRows.count();

        await test.step("Применить фильтр Q1 2026", async () => {
          await dp.selectQuarter(2026, 1);
          const expectedValue = ObjectivesDatepickerHelper.getExpectedQuarterValue(2026, 1);
          await dp.assertValue(expectedValue);
          await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });
        });

        await test.step("Сбросить все фильтры через кнопку ×", async () => {
          // Кнопка × сбрасывает ВСЕ фильтры (период, уровень, команда, ответственный)
          // Per-field × на поле "Период" не реализована — используем общий сброс
          await objectivesAllPage.resetAllFilters();
          await objectivesAllPage.assertPeriodFilterEmpty();
        });

        await test.step("Проверить что цели из других кварталов снова видны", async () => {
          await objectivesAllPage.tableRows.first().waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
          const countAfterReset = await objectivesAllPage.tableRows.count();
          expect(
            countAfterReset,
            "После сброса фильтра должно отображаться то же количество целей, что и без фильтра",
          ).toBe(countBeforeFilter);
        });
      },
    );
  },
);
