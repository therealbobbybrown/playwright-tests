// tests/functional/objectives/objectives-sort-after-kr-update.spec.js
// После обновления KR цель поднимается вверх — обновить KR цели B → она становится первой (DEVAPR-11591)

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
  "Цели — После обновления KR цель поднимается вверх (DEVAPR-11591)",
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
      objATitleUnique = `UPKR-A-${suffix}`;
      objBTitleUnique = `UPKR-B-${suffix}`;

      const userId = objectivesAPI.getCurrentUserId();
      if (!userId) {
        throw new Error("Не удалось получить ID текущего пользователя из токена");
      }

      const createObjective = async (title, tempId) => {
        const { response, data } = await objectivesAPI.saveObjective({
          title,
          description: "Тест поднятия цели после обновления KR",
          startDate: "2026-01-01",
          endDate: "2026-03-31",
          status: "active",
          level: "self",
          responsibleUserId: userId,
          userAccessType: "everybody",
          milestones: [
            {
              temporaryId: tempId,
              title: `КР для ${title}`,
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

      const resA = await createObjective(objATitleUnique, `temp-upkr-a-${suffix}`);
      objAId = resA.id;

      const resB = await createObjective(objBTitleUnique, `temp-upkr-b-${suffix}`);
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

    test("C8141: После обновления KR цель B поднимается выше цели A",
      { tag: [] },
      async ({ adminAuth, page }, testInfo) => {
        setSeverity("normal");

        const detailsPage = new ObjectiveDetailsPage(page, testInfo);
        const objectivesAllPage = new ObjectivesAllPage(page, testInfo);

        // Обновляем KR цели A через UI (прогресс 50%)
        await test.step("Обновить KR цели A до 50% через UI", async () => {
          await detailsPage.updateKRProgressViaUI(objATitleUnique, 50);
        });

        await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });

        await test.step('Открыть страницу целей, проверить начальный порядок: A выше B', async () => {
          // Используем вкладку "Мои цели" — меньше данных, только цели текущего пользователя
          await page.goto("/ru/objectives/?tab=mine");
          await objectivesAllPage.title.waitFor({ state: "visible", timeout: TIMEOUTS.LONG });
          await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });

          // Ищем по уникальному суффиксу — только 2 цели данного прогона
          const searchInput = page.getByRole("textbox", { name: /Найти цель/i });
          await searchInput.fill(`UPKR-${suffix}`);
          // Ждём появления строки A (подтверждает, что поиск API вернул результаты)
          await objectivesAllPage.tableRows.filter({ hasText: `UPKR-A-${suffix}` }).first()
            .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
          // Ждём появления строки B
          await objectivesAllPage.tableRows.filter({ hasText: `UPKR-B-${suffix}` }).first()
            .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

          const titles = await objectivesAllPage.getObjectiveTitlesInOrder();
          const idxA = titles.findIndex((t) => t.includes(`UPKR-A-${suffix}`));
          const idxB = titles.findIndex((t) => t.includes(`UPKR-B-${suffix}`));

          expect(idxA, `Цель A должна присутствовать в списке`).toBeGreaterThanOrEqual(0);
          expect(idxB, `Цель B должна присутствовать в списке`).toBeGreaterThanOrEqual(0);
          expect(idxA, `A (с KR) должна быть выше B (без KR). A=${idxA}, B=${idxB}`).toBeLessThan(idxB);
        });

        // Обновляем KR цели B через UI (прогресс 70%) — B должна подняться выше A
        await test.step("Обновить KR цели B до 70% через UI", async () => {
          await detailsPage.updateKRProgressViaUI(objBTitleUnique, 70);
        });

        await test.step("Проверить новый порядок: B поднялась выше A", async () => {
          // Используем вкладку "Мои цели" — меньше данных, только цели текущего пользователя
          await page.goto("/ru/objectives/?tab=mine");
          await objectivesAllPage.title.waitFor({ state: "visible", timeout: TIMEOUTS.LONG });
          await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });

          // Ищем по уникальному суффиксу — только 2 цели данного прогона
          const searchInput = page.getByRole("textbox", { name: /Найти цель/i });
          await searchInput.fill(`UPKR-${suffix}`);
          // Ждём появления строки B (подтверждает, что поиск API вернул результаты)
          await objectivesAllPage.tableRows.filter({ hasText: `UPKR-B-${suffix}` }).first()
            .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
          // Ждём появления строки A
          await objectivesAllPage.tableRows.filter({ hasText: `UPKR-A-${suffix}` }).first()
            .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

          const titles = await objectivesAllPage.getObjectiveTitlesInOrder();
          const idxA = titles.findIndex((t) => t.includes(`UPKR-A-${suffix}`));
          const idxB = titles.findIndex((t) => t.includes(`UPKR-B-${suffix}`));

          expect(idxA, `Цель A должна присутствовать после обновления B`).toBeGreaterThanOrEqual(0);
          expect(idxB, `Цель B должна присутствовать после обновления`).toBeGreaterThanOrEqual(0);
          expect(idxB, `B (новое обновление KR 70%) должна быть выше A. B=${idxB}, A=${idxA}`).toBeLessThan(idxA);
        });
      },
    );
  },
);
