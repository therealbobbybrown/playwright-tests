// tests/functional/objectives/objectives-filter-intersection.spec.js
// Phase 7: Логика пересечения периодов в фильтре целей (DEVAPR-11591)

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
  "Цели — Логика пересечения периодов в фильтре",
  { tag: ["@ui", "@objectives", "@regression"] },
  () => {
    let objectivesAPIRef = null;
    let objAId = null;
    let objBId = null;
    let objCId = null;
    let objATitleUnique = null;
    let objBTitleUnique = null;
    let objCTitleUnique = null;

    test.beforeAll(async ({ objectivesAPI }) => {
      objectivesAPIRef = objectivesAPI;
      const suffix = Math.floor(Math.random() * 100000) + 1;
      objATitleUnique = `INTERSECT-A-Q1-${suffix}`;
      objBTitleUnique = `INTERSECT-B-Q1Q2-${suffix}`;
      objCTitleUnique = `INTERSECT-C-Q2ONLY-${suffix}`;

      const userId = objectivesAPI.getCurrentUserId();
      if (!userId) {
        throw new Error("Не удалось получить ID текущего пользователя из токена");
      }

      // Цель A: Q1 2026 (01.01.2026 - 31.03.2026) — полностью внутри фильтра
      const resA = await objectivesAPI.saveObjective({
        title: objATitleUnique,
        description: "Пересечение: цель только Q1 2026",
        startDate: "2026-01-01",
        endDate: "2026-03-31",
        status: "active",
        level: "self",
        responsibleUserId: userId,
        userAccessType: "everybody",
        milestones: [
          {
            temporaryId: `temp-intersect-a-${suffix}`,
            title: "КР Пересечение A",
            type: "percent",
            weight: 100,
            progress: 0,
            responsibleUserId: userId,
          },
        ],
      });

      if (!resA.response.ok()) {
        throw new Error(`Не удалось создать цель A (Q1): ${resA.response.status()} — ${JSON.stringify(resA.data)}`);
      }
      objAId = resA.data?.id;
      if (!objAId) throw new Error("Сервер не вернул ID цели A");

      // Цель B: 01.02.2026 - 30.04.2026 — пересекается с Q1 (февраль и март)
      const resB = await objectivesAPI.saveObjective({
        title: objBTitleUnique,
        description: "Пересечение: цель Q1-Q2 2026 (пересекается с Q1)",
        startDate: "2026-02-01",
        endDate: "2026-04-30",
        status: "active",
        level: "self",
        responsibleUserId: userId,
        userAccessType: "everybody",
        milestones: [
          {
            temporaryId: `temp-intersect-b-${suffix}`,
            title: "КР Пересечение B",
            type: "percent",
            weight: 100,
            progress: 0,
            responsibleUserId: userId,
          },
        ],
      });

      if (!resB.response.ok()) {
        throw new Error(`Не удалось создать цель B (Q1-Q2): ${resB.response.status()} — ${JSON.stringify(resB.data)}`);
      }
      objBId = resB.data?.id;
      if (!objBId) throw new Error("Сервер не вернул ID цели B");

      // Цель C: 01.06.2026 - 30.06.2026 — только Q2, не пересекается с Q1
      const resC = await objectivesAPI.saveObjective({
        title: objCTitleUnique,
        description: "Пересечение: цель только Q2 2026 (не пересекается с Q1)",
        startDate: "2026-06-01",
        endDate: "2026-06-30",
        status: "active",
        level: "self",
        responsibleUserId: userId,
        userAccessType: "everybody",
        milestones: [
          {
            temporaryId: `temp-intersect-c-${suffix}`,
            title: "КР Пересечение C",
            type: "percent",
            weight: 100,
            progress: 0,
            responsibleUserId: userId,
          },
        ],
      });

      if (!resC.response.ok()) {
        throw new Error(`Не удалось создать цель C (Q2 only): ${resC.response.status()} — ${JSON.stringify(resC.data)}`);
      }
      objCId = resC.data?.id;
      if (!objCId) throw new Error("Сервер не вернул ID цели C");
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.OBJECTIVES);
    });

    test.afterAll(async () => {
      if (objectivesAPIRef) {
        await safeDeleteObjective(objectivesAPIRef, objAId);
        await safeDeleteObjective(objectivesAPIRef, objBId);
        await safeDeleteObjective(objectivesAPIRef, objCId);
      }
    });

    test("C8139: Фильтр Q1 2026 — цели с пересечением видны, без пересечения скрыты",
      { tag: ["@critical"] },
      async ({ adminAuth, page }, testInfo) => {
        setSeverity("critical");

        const objectivesAllPage = new ObjectivesAllPage(page, testInfo);
        const dp = objectivesAllPage.periodFilter;

        await test.step("Открыть страницу целей, вкладка «Все цели»", async () => {
          await page.goto("/ru/objectives/");
          await objectivesAllPage.title.waitFor({ state: "visible", timeout: TIMEOUTS.LONG });
          await objectivesAllPage.switchToTab("all");
          await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });
        });

        await test.step("Применить фильтр Q1 2026 через датапикер", async () => {
          await dp.selectQuarter(2026, 1);
          const expectedValue = ObjectivesDatepickerHelper.getExpectedQuarterValue(2026, 1);
          await dp.assertValue(expectedValue);
          await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });
        });

        await test.step("Проверить что цель A (Q1, 01.01-31.03) видна — полностью в диапазоне", async () => {
          // Ищем по уникальному заголовку через поиск (обход пагинации)
          const searchInput = page.getByRole("textbox", { name: /Найти цель/i });
          await searchInput.fill(objATitleUnique);
          await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });

          const rowA = objectivesAllPage.tableRows.filter({ hasText: objATitleUnique }).first();
          await rowA.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
        });

        await test.step("Проверить что цель B (01.02-30.04, пересекает Q1) видна — пересечение есть", async () => {
          const searchInput = page.getByRole("textbox", { name: /Найти цель/i });
          await searchInput.fill(objBTitleUnique);
          await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });

          const rowB = objectivesAllPage.tableRows.filter({ hasText: objBTitleUnique }).first();
          await rowB.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
        });

        await test.step("Проверить что цель C (Q2 only, 01.06-30.06) не видна — нет пересечения с Q1", async () => {
          const searchInput = page.getByRole("textbox", { name: /Найти цель/i });
          await searchInput.fill(objCTitleUnique);
          await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });

          await expect(
            objectivesAllPage.tableRows.filter({ hasText: objCTitleUnique }),
            `Цель C (Q2 only) не должна отображаться при фильтре Q1`,
          ).not.toBeVisible();
        });

        await test.step("Сбросить фильтр (перейти на свежую страницу) → все три цели находятся через поиск", async () => {
          await page.goto("/ru/objectives/");
          await objectivesAllPage.title.waitFor({ state: "visible", timeout: TIMEOUTS.LONG });
          await objectivesAllPage.switchToTab("all");
          await objectivesAllPage.assertPeriodFilterEmpty();
          await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });

          const searchInput = page.getByRole("textbox", { name: /Найти цель/i });

          // Ищем цель A
          await searchInput.fill(objATitleUnique);
          await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });
          const rowA = objectivesAllPage.tableRows.filter({ hasText: objATitleUnique }).first();
          await rowA.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

          // Ищем цель B
          await searchInput.fill(objBTitleUnique);
          await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });
          const rowB = objectivesAllPage.tableRows.filter({ hasText: objBTitleUnique }).first();
          await rowB.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

          // Ищем цель C
          await searchInput.fill(objCTitleUnique);
          await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });
          const rowC = objectivesAllPage.tableRows.filter({ hasText: objCTitleUnique }).first();
          await rowC.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
        });
      },
    );
  },
);
