// tests/functional/objectives/objectives-filter-datepicker-halfyear.spec.js
// Phase 7: Фильтр по полугодию через датапикер (DEVAPR-11591)

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
  "Цели — Фильтр по полугодию через датапикер",
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
      objATitleUnique = `FILTER-H1-A-${suffix}`;
      objBTitleUnique = `FILTER-H2-B-${suffix}`;

      const userId = objectivesAPI.getCurrentUserId();
      if (!userId) {
        throw new Error("Не удалось получить ID текущего пользователя из токена");
      }

      // Цель A: H1 2026 (01.01.2026 - 30.06.2026)
      const resA = await objectivesAPI.saveObjective({
        title: objATitleUnique,
        description: "Тест фильтра по H1",
        startDate: "2026-01-01",
        endDate: "2026-06-30",
        status: "active",
        level: "self",
        responsibleUserId: userId,
        userAccessType: "everybody",
        milestones: [
          {
            temporaryId: `temp-filter-h1-${suffix}`,
            title: "КР H1",
            type: "percent",
            weight: 100,
            progress: 0,
            responsibleUserId: userId,
          },
        ],
      });

      if (!resA.response.ok()) {
        throw new Error(`Не удалось создать цель A (H1): ${resA.response.status()} — ${JSON.stringify(resA.data)}`);
      }
      objAId = resA.data?.id;
      if (!objAId) throw new Error("Сервер не вернул ID цели A");

      // Цель B: H2 2026 (01.07.2026 - 31.12.2026)
      const resB = await objectivesAPI.saveObjective({
        title: objBTitleUnique,
        description: "Тест фильтра по H2",
        startDate: "2026-07-01",
        endDate: "2026-12-31",
        status: "active",
        level: "self",
        responsibleUserId: userId,
        userAccessType: "everybody",
        milestones: [
          {
            temporaryId: `temp-filter-h2-${suffix}`,
            title: "КР H2",
            type: "percent",
            weight: 100,
            progress: 0,
            responsibleUserId: userId,
          },
        ],
      });

      if (!resB.response.ok()) {
        throw new Error(`Не удалось создать цель B (H2): ${resB.response.status()} — ${JSON.stringify(resB.data)}`);
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

    test("C8127: Фильтр H1 2026 → в результатах только цели, пересекающиеся с H1",
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

        await test.step("Применить фильтр H1 2026 через датапикер", async () => {
          await dp.selectHalfYear(2026, 1);
          const expectedValue = ObjectivesDatepickerHelper.getExpectedHalfYearValue(2026, 1);
          await dp.assertValue(expectedValue);
          await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });
        });

        await test.step("Проверить что цель A (H1) видна в результатах", async () => {
          // Ищем по уникальному заголовку через поиск (обход пагинации)
          const searchInput = page.getByRole("textbox", { name: /Найти цель/i });
          await searchInput.fill(objATitleUnique);
          await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });

          const rowA = objectivesAllPage.tableRows.filter({ hasText: objATitleUnique }).first();
          await rowA.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
        });

        await test.step("Проверить что цель B (H2) не видна при фильтре H1", async () => {
          // Ищем B при активном фильтре H1 — период H2 не пересекается с H1, строки не будет
          const searchInput = page.getByRole("textbox", { name: /Найти цель/i });
          await searchInput.fill(objBTitleUnique);
          await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });
          await expect(
            objectivesAllPage.tableRows.filter({ hasText: objBTitleUnique }),
            `Цель B (H2) не должна отображаться при фильтре H1`,
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
