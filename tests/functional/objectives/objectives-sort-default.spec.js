// tests/functional/objectives/objectives-sort-default.spec.js
// Phase 8: Сортировка по умолчанию — цели с недавно обновлёнными KR стоят выше (DEVAPR-11591)

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
  "Цели — Сортировка по умолчанию (DEVAPR-11591)",
  { tag: ["@ui", "@objectives", "@regression", "@critical"] },
  () => {
    let objectivesAPIRef = null;
    let objAId = null;
    let objBId = null;
    let objCId = null;
    let objDId = null;
    let suffix = null;
    let objATitleUnique = null;
    let objBTitleUnique = null;
    let objCTitleUnique = null;
    let objDTitleUnique = null;

    test.beforeAll(async ({ objectivesAPI }) => {
      objectivesAPIRef = objectivesAPI;
      suffix = Math.floor(Math.random() * 100000) + 1;
      objATitleUnique = `SORT-A-${suffix}`;
      objBTitleUnique = `SORT-B-${suffix}`;
      objCTitleUnique = `SORT-C-${suffix}`;
      objDTitleUnique = `SORT-D-${suffix}`;

      const userId = objectivesAPI.getCurrentUserId();
      if (!userId) {
        throw new Error("Не удалось получить ID текущего пользователя из токена");
      }

      // Создаём 4 цели с KR (milestones). Все в Q1 2026, чтобы не мешать другим тестам.
      const createObjective = async (title, tempId) => {
        const { response, data } = await objectivesAPI.saveObjective({
          title,
          description: "Тест сортировки по умолчанию",
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

      const resA = await createObjective(objATitleUnique, `temp-sort-a-${suffix}`);
      objAId = resA.id;

      const resB = await createObjective(objBTitleUnique, `temp-sort-b-${suffix}`);
      objBId = resB.id;

      const resC = await createObjective(objCTitleUnique, `temp-sort-c-${suffix}`);
      objCId = resC.id;

      const resD = await createObjective(objDTitleUnique, `temp-sort-d-${suffix}`);
      objDId = resD.id;

      // Прогресс KR обновляется через UI в самом тесте (API updateMilestoneProgress не работает — APP_BUG)
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.OBJECTIVES);
    });

    test.afterAll(async () => {
      if (objectivesAPIRef) {
        await safeDeleteObjective(objectivesAPIRef, objAId);
        await safeDeleteObjective(objectivesAPIRef, objBId);
        await safeDeleteObjective(objectivesAPIRef, objCId);
        await safeDeleteObjective(objectivesAPIRef, objDId);
      }
    });

    test("C8143: Цели с обновлёнными KR стоят выше без обновлений",
      { tag: [] },
      async ({ adminAuth, page }, testInfo) => {
        setSeverity("critical");

        const detailsPage = new ObjectiveDetailsPage(page, testInfo);
        const objectivesAllPage = new ObjectivesAllPage(page, testInfo);

        // Обновляем KR цели A через UI (прогресс 50%)
        await test.step("Обновить KR цели A до 50% через UI", async () => {
          await detailsPage.updateKRProgressViaUI(objATitleUnique, 50);
        });

        // Ждём завершения всех сетевых запросов перед следующим обновлением — чтобы timestamp отличался
        await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });

        // Обновляем KR цели B через UI (прогресс 30%) — последнее обновление → B выше A
        await test.step("Обновить KR цели B до 30% через UI", async () => {
          await detailsPage.updateKRProgressViaUI(objBTitleUnique, 30);
        });

        // Ожидаемый порядок в верхней части:
        // objB (последнее обновление KR) → objA → ... → objC (нет обновлений KR) → objD

        await test.step('Открыть страницу целей, вкладка "Мои цели"', async () => {
          await page.goto("/ru/objectives/?tab=mine");
          await objectivesAllPage.title.waitFor({ state: "visible", timeout: TIMEOUTS.LONG });
          await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });
          await objectivesAllPage.tableRows.first().waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

          // Подгружаем все строки, чтобы цели C и D (без обновлений KR) тоже попали в список
          for (let i = 0; i < 10; i++) {
            const btn = page.getByRole("button", { name: /Показать ещ/i });
            if (!(await btn.isVisible().catch(() => false))) break;
            await btn.click().catch(() => {});
            await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM }).catch(() => {});
          }
        });

        const titles = await objectivesAllPage.getObjectiveTitlesInOrder();

        await test.step("Проверить что цели с обновлёнными KR (A и B) стоят выше необновлённых (C и D)", async () => {
          const idxA = titles.findIndex((t) => t.includes(`SORT-A-${suffix}`));
          const idxB = titles.findIndex((t) => t.includes(`SORT-B-${suffix}`));
          const idxC = titles.findIndex((t) => t.includes(`SORT-C-${suffix}`));
          const idxD = titles.findIndex((t) => t.includes(`SORT-D-${suffix}`));

          expect(idxA, `Цель A (SORT-A-${suffix}) должна присутствовать в списке`).toBeGreaterThanOrEqual(0);
          expect(idxB, `Цель B (SORT-B-${suffix}) должна присутствовать в списке`).toBeGreaterThanOrEqual(0);
          expect(idxC, `Цель C (SORT-C-${suffix}) должна присутствовать в списке`).toBeGreaterThanOrEqual(0);
          expect(idxD, `Цель D (SORT-D-${suffix}) должна присутствовать в списке`).toBeGreaterThanOrEqual(0);

          // Цели с обновлёнными KR (A и B) должны стоять выше необновлённых (C и D).
          expect(
            idxA,
            `Цель A (с обновлённым KR 50%) должна стоять выше, чем цель C (без обновлений KR). ` +
            `Порядок: A=${idxA}, C=${idxC}`,
          ).toBeLessThan(idxC);

          expect(
            idxB,
            `Цель B (с обновлённым KR 30%, последнее обновление) должна стоять выше, чем цель D (без обновлений KR). ` +
            `Порядок: B=${idxB}, D=${idxD}`,
          ).toBeLessThan(idxD);
        });
      },
    );
  },
);
