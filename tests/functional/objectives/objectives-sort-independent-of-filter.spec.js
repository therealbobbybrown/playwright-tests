// tests/functional/objectives/objectives-sort-independent-of-filter.spec.js
// Сортировка НЕ меняется при фильтрации — применить фильтр Q1 2026 → порядок тот же (DEVAPR-11591)

import { expect } from "@playwright/test";
import { test } from "../../fixtures/auth-api.js";
import { ObjectivesAllPage } from "../../../pages/ObjectivesAllPage.js";
import { ObjectiveDetailsPage } from "../../../pages/ObjectiveDetailsPage.js";
import { safeDeleteObjective } from "../../utils/api/test-helpers.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { TIMEOUTS } from "../../utils/constants.js";

test.describe(
  "Цели — Сортировка не меняется при фильтрации (DEVAPR-11591)",
  { tag: ["@ui", "@objectives", "@regression"] },
  () => {
    let objectivesAPIRef = null;
    let objAId = null;
    let objBId = null;
    let suffix = null;
    let objATitleUnique = null;
    let objBTitleUnique = null;

    test.beforeAll(async ({ objectivesAPI }) => {
      objectivesAPIRef = objectivesAPI;
      suffix = Math.floor(Math.random() * 100000) + 1;
      objATitleUnique = `FILT-A-${suffix}`;
      objBTitleUnique = `FILT-B-${suffix}`;

      const userId = objectivesAPI.getCurrentUserId();
      if (!userId) {
        throw new Error("Не удалось получить ID текущего пользователя из токена");
      }

      // Создаём оба объекта в Q1 2026, чтобы фильтр Q1 2026 их показывал
      const createObjective = async (title, tempId) => {
        const { response, data } = await objectivesAPI.saveObjective({
          title,
          description: "Тест сортировки при фильтрации",
          startDate: "2026-01-01",
          endDate: "2026-03-31",
          status: "active",
          level: "self",
          responsibleUserId: userId,
          userAccessType: "everybody",
          milestones: [
            {
              temporaryId: tempId,
              title: `КР 1 для ${title}`,
              type: "percent",
              weight: 100,
              progress: 0,
              responsibleUserId: userId,
            },
          ],
        });
        if (!response.ok()) {
          throw new Error(`Не удалось создать цель "${title}": ${response.status()} — ${JSON.stringify(data)}`);
        }
        const id = data?.id;
        if (!id) throw new Error(`Сервер не вернул ID для цели "${title}"`);
        return { id, milestoneId: data?.milestones?.[0]?.id };
      };

      const resA = await createObjective(objATitleUnique, `temp-filt-a-${suffix}`);
      objAId = resA.id;

      const resB = await createObjective(objBTitleUnique, `temp-filt-b-${suffix}`);
      objBId = resB.id;

      // KR обновляется через UI в тесте (API updateMilestoneProgress не работает — APP_BUG)
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

    test("C8144: Применить фильтр Q1 2026 — порядок сортировки среди видимых целей не меняется",
      { tag: [] },
      async ({ adminAuth, page }, testInfo) => {
        setSeverity("normal");

        const detailsPage = new ObjectiveDetailsPage(page, testInfo);
        const objectivesAllPage = new ObjectivesAllPage(page, testInfo);

        // Обновляем KR цели A через UI (прогресс 50%) — A должна быть выше B
        await test.step("Обновить KR цели A до 50% через UI", async () => {
          await detailsPage.updateKRProgressViaUI(objATitleUnique, 50);
        });

        await test.step('Открыть страницу целей, вкладка «Мои цели»', async () => {
          await page.goto("/ru/objectives/?tab=mine");
          await objectivesAllPage.title.waitFor({ state: "visible", timeout: TIMEOUTS.LONG });
          await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });
        });

        let idxABefore, idxBBefore;

        await test.step("Получить порядок без фильтра", async () => {
          // Ищем по уникальному суффиксу — только 2 цели данного прогона
          const searchInput = page.getByRole("textbox", { name: /Найти цель/i });
          await searchInput.fill(`FILT-${suffix}`);
          // Ждём появления строки A — гарантирует что search API ответил с filtered результатами
          await objectivesAllPage.tableRows.filter({ hasText: `FILT-A-${suffix}` }).first()
            .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
          // Ждём появления строки B
          await objectivesAllPage.tableRows.filter({ hasText: `FILT-B-${suffix}` }).first()
            .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

          const titles = await objectivesAllPage.getObjectiveTitlesInOrder();

          idxABefore = titles.findIndex((t) => t.includes(`FILT-A-${suffix}`));
          idxBBefore = titles.findIndex((t) => t.includes(`FILT-B-${suffix}`));

          expect(idxABefore, `A должна присутствовать без фильтра`).toBeGreaterThanOrEqual(0);
          expect(idxBBefore, `B должна присутствовать без фильтра`).toBeGreaterThanOrEqual(0);
          expect(idxABefore, `A (с KR) выше B (без KR). A=${idxABefore}, B=${idxBBefore}`).toBeLessThan(idxBBefore);
        });

        await test.step("Применить фильтр Q1 2026", async () => {
          await objectivesAllPage.periodFilter.selectQuarter(2026, 1);
          await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });
          await objectivesAllPage.tableRows.first().waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
        });

        await test.step("Проверить что порядок не изменился после фильтра", async () => {
          // Поиск сохраняется при смене фильтра периода — уточняем по уникальному суффиксу
          const searchInput = page.getByRole("textbox", { name: /Найти цель/i });
          await searchInput.fill(`FILT-${suffix}`);
          // Ждём появления строки A — гарантирует что search API ответил с filtered результатами
          await objectivesAllPage.tableRows.filter({ hasText: `FILT-A-${suffix}` }).first()
            .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
          // Ждём появления строки B
          await objectivesAllPage.tableRows.filter({ hasText: `FILT-B-${suffix}` }).first()
            .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

          const titles = await objectivesAllPage.getObjectiveTitlesInOrder();

          const idxAAfter = titles.findIndex((t) => t.includes(`FILT-A-${suffix}`));
          const idxBAfter = titles.findIndex((t) => t.includes(`FILT-B-${suffix}`));

          expect(idxAAfter, `A должна присутствовать с фильтром Q1 2026`).toBeGreaterThanOrEqual(0);
          expect(idxBAfter, `B должна присутствовать с фильтром Q1 2026`).toBeGreaterThanOrEqual(0);
          expect(idxAAfter, `A (с KR) выше B после фильтра. A=${idxAAfter}, B=${idxBAfter}`).toBeLessThan(idxBAfter);
        });
      },
    );
  },
);
