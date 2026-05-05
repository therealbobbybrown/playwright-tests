// tests/functional/objectives/objectives-filter-datepicker-month.spec.js
// Phase 7: Фильтр по месяцу через датапикер (DEVAPR-11591)

import { expect } from "@playwright/test";
import { test } from "../../fixtures/auth-api.js";
import { ObjectivesAllPage } from "../../../pages/ObjectivesAllPage.js";
import { ObjectivesDatepickerHelper } from "../../../pages/ObjectivesDatepickerHelper.js";
import { safeDeleteObjective } from "../../utils/api/test-helpers.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { TIMEOUTS } from "../../utils/constants.js";

test.describe(
  "Цели — Фильтр по месяцу через датапикер",
  { tag: ["@ui", "@objectives", "@regression"] },
  () => {
    let objectivesAPIRef = null;
    let objAId = null;
    let objBId = null;
    let objATitleUnique = null;
    let objBTitleUnique = null;

    test.beforeAll(async ({ objectivesAPI }) => {
      objectivesAPIRef = objectivesAPI;
      const suffix = Math.floor(Math.random() * 100000) + 1;
      objATitleUnique = `FILTER-MAR-A-${suffix}`;
      objBTitleUnique = `FILTER-JUN-B-${suffix}`;

      const userId = objectivesAPI.getCurrentUserId();
      if (!userId) {
        throw new Error("Не удалось получить ID текущего пользователя из токена");
      }

      // Цель A: Март 2026 (01.03.2026 - 31.03.2026)
      const resA = await objectivesAPI.saveObjective({
        title: objATitleUnique,
        description: "Тест фильтра по марту 2026",
        startDate: "2026-03-01",
        endDate: "2026-03-31",
        status: "active",
        level: "self",
        responsibleUserId: userId,
        userAccessType: "everybody",
        milestones: [
          {
            temporaryId: `temp-filter-mar-${suffix}`,
            title: "КР Март",
            type: "percent",
            weight: 100,
            progress: 0,
            responsibleUserId: userId,
          },
        ],
      });

      if (!resA.response.ok()) {
        throw new Error(`Не удалось создать цель A (Март): ${resA.response.status()} — ${JSON.stringify(resA.data)}`);
      }
      objAId = resA.data?.id;
      if (!objAId) throw new Error("Сервер не вернул ID цели A");

      // Цель B: Июнь 2026 (01.06.2026 - 30.06.2026)
      const resB = await objectivesAPI.saveObjective({
        title: objBTitleUnique,
        description: "Тест фильтра по июню 2026",
        startDate: "2026-06-01",
        endDate: "2026-06-30",
        status: "active",
        level: "self",
        responsibleUserId: userId,
        userAccessType: "everybody",
        milestones: [
          {
            temporaryId: `temp-filter-jun-${suffix}`,
            title: "КР Июнь",
            type: "percent",
            weight: 100,
            progress: 0,
            responsibleUserId: userId,
          },
        ],
      });

      if (!resB.response.ok()) {
        throw new Error(`Не удалось создать цель B (Июнь): ${resB.response.status()} — ${JSON.stringify(resB.data)}`);
      }
      objBId = resB.data?.id;
      if (!objBId) throw new Error("Сервер не вернул ID цели B");
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.OBJECTIVES);
    });

    test.afterAll(async () => {
      if (objectivesAPIRef) {
        await safeDeleteObjective(objectivesAPIRef, objAId);
        await safeDeleteObjective(objectivesAPIRef, objBId);
      }
    });

    test("C8128: Фильтр Март 2026 → в результатах только цели, пересекающиеся с мартом",
      { tag: [] },
      async ({ adminAuth, page }, testInfo) => {
        setSeverity("normal");

        const objectivesAllPage = new ObjectivesAllPage(page, testInfo);
        const dp = objectivesAllPage.periodFilter;

        await test.step("Открыть страницу целей, вкладка «Все цели»", async () => {
          await page.goto("/ru/objectives/");
          await objectivesAllPage.title.waitFor({ state: "visible", timeout: TIMEOUTS.LONG });
          await objectivesAllPage.switchToTab("all");
          await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });
        });

        await test.step("Применить фильтр Март 2026 через датапикер (monthIndex=2)", async () => {
          await dp.selectMonth(2026, 2);
          const expectedValue = ObjectivesDatepickerHelper.getExpectedMonthValue(2026, 2);
          await dp.assertValue(expectedValue);
          await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });
        });

        await test.step("Проверить что цель A (Март) видна в результатах", async () => {
          // Ищем по уникальному заголовку через поиск (обход пагинации)
          const searchInput = page.getByRole("textbox", { name: /Найти цель/i });
          await searchInput.fill(objATitleUnique);
          await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });

          const rowA = objectivesAllPage.tableRows.filter({ hasText: objATitleUnique }).first();
          await rowA.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
        });

        await test.step("Проверить что цель B (Июнь) не видна при фильтре Март", async () => {
          // Ищем B при активном фильтре Март — период Июнь не пересекается с Мартом
          const searchInput = page.getByRole("textbox", { name: /Найти цель/i });
          await searchInput.fill(objBTitleUnique);
          await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });
          await expect(
            objectivesAllPage.tableRows.filter({ hasText: objBTitleUnique }),
            `Цель B (Июнь) не должна отображаться при фильтре Март`,
          ).not.toBeVisible();
          // Очищаем поиск после проверки
          await searchInput.fill("");
          await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });
        });

        await test.step("Сбросить фильтр (перейти на свежую страницу) → обе цели находятся через поиск", async () => {
          await page.goto("/ru/objectives/");
          await objectivesAllPage.title.waitFor({ state: "visible", timeout: TIMEOUTS.LONG });
          await objectivesAllPage.switchToTab("all");
          await objectivesAllPage.assertPeriodFilterEmpty();
          await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });

          // Ищем цель A по уникальному заголовку через поиск (обход пагинации)
          const searchInput = page.getByRole("textbox", { name: /Найти цель/i });
          await searchInput.fill(objATitleUnique);
          await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });
          const rowA = objectivesAllPage.tableRows.filter({ hasText: objATitleUnique }).first();
          await rowA.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

          // Ищем цель B по уникальному заголовку через поиск
          await searchInput.fill(objBTitleUnique);
          await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });
          const rowB = objectivesAllPage.tableRows.filter({ hasText: objBTitleUnique }).first();
          await rowB.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
        });
      },
    );
  },
);
